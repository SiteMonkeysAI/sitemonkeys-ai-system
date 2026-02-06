/**
 * SUPERSESSION SERVICE
 *
 * Handles deterministic fact replacement with transaction safety.
 * Ensures one current fact per fingerprint per user/mode combination.
 *
 * SCHEMA TRUTH (verified 2026-01-02):
 * - id = INTEGER (not UUID)
 * - user_id = TEXT
 * - category_name = VARCHAR (not "category")
 * - content = TEXT
 * - fact_fingerprint = TEXT
 * - fingerprint_confidence = DOUBLE PRECISION
 * - is_current = BOOLEAN
 * - superseded_by = INTEGER (fixed via migration to match id type)
 * - superseded_at = TIMESTAMPTZ
 * - mode = VARCHAR
 * - embedding_status = VARCHAR
 *
 * IMPORTANT: Run /api/test-semantic?action=fix-superseded-by-type to migrate
 * superseded_by from UUID to INTEGER before using supersession features.
 */

/* global fetch, AbortController */

import { SemanticAnalyzer } from '../core/intelligence/semantic_analyzer.js';

// Initialize semantic analyzer for fingerprint detection
const semanticAnalyzer = new SemanticAnalyzer();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPERSESSION_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 100,
  fingerprintTimeout: 2000,
  fingerprintModel: 'gpt-4o-mini'
};

// ============================================================================
// DETERMINISTIC FINGERPRINT PATTERNS (checked FIRST, before any API call)
// ============================================================================

const FINGERPRINT_PATTERNS = [
  // Phone numbers
  {
    fingerprint: 'user_phone_number',
    patterns: [
      /\b(?:my|our)?\s*(?:phone|cell|mobile|telephone)\s*(?:number|#)?\s*(?:is|:)?\s*[\d\-\(\)\s\+]+/i,
      /\b(?:call|reach|text)\s*(?:me|us)\s*(?:at|on)?\s*[\d\-\(\)\s\+]+/i,
      /\b[\d]{3}[-.\s]?[\d]{3}[-.\s]?[\d]{4}\b/
    ],
    confidence: 0.95
  },
  // Email
  {
    fingerprint: 'user_email',
    patterns: [
      /\b(?:my|our)?\s*(?:email|e-mail)\s*(?:address|is|:)?\s*[\w\.\-]+@[\w\.\-]+\.\w+/i,
      /\b(?:email|reach|contact)\s*(?:me|us)\s*(?:at)?\s*[\w\.\-]+@[\w\.\-]+\.\w+/i
    ],
    confidence: 0.95
  },
  // Name
  {
    fingerprint: 'user_name',
    patterns: [
      /\b(?:my|our)\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /\b(?:i'?m|i am|call me)\s+([A-Z][a-z]+)/i,
      /\bname(?:'s|:)?\s*([A-Z][a-z]+)/i
    ],
    confidence: 0.90
  },
  // Location/Residence
  {
    fingerprint: 'user_location_residence',
    patterns: [
      /\bi\s+(?:live|reside|stay|am located)\s+(?:in|at)\s+(.+)/i,
      /\b(?:my|our)\s+(?:home|house|address|residence|location)\s+(?:is|:)\s+(.+)/i,
      /\bi(?:'m| am)\s+(?:from|based in|located in)\s+(.+)/i,
      /\b(?:moved|moving)\s+to\s+(.+)/i
    ],
    confidence: 0.85
  },
  // Job/Occupation
  {
    fingerprint: 'user_job_title',
    patterns: [
      /\bi\s+(?:work|am employed)\s+(?:as|at)\s+(?:a\s+)?(.+)/i,
      /\b(?:my|our)\s+(?:job|occupation|profession|role|title|position)\s+(?:is|:)\s+(.+)/i,
      /\bi(?:'m| am)\s+a\s+(developer|engineer|manager|designer|analyst|consultant|director|ceo|cto|founder|doctor|lawyer|teacher|nurse|accountant)/i
    ],
    confidence: 0.85
  },
  // Company/Employer
  {
    fingerprint: 'user_employer',
    patterns: [
      /\bi\s+work\s+(?:at|for)\s+(.+)/i,
      /\b(?:my|our)\s+(?:company|employer|workplace)\s+(?:is|:)\s+(.+)/i,
      /\bemployed\s+(?:by|at)\s+(.+)/i
    ],
    confidence: 0.85
  },
  // Age/Birthday
  {
    fingerprint: 'user_age',
    patterns: [
      /\bi(?:'m| am)\s+(\d{1,3})\s*(?:years?\s*old)?/i,
      /\b(?:my|our)\s+age\s+(?:is|:)\s*(\d{1,3})/i,
      /\bborn\s+(?:in|on)\s+(.+)/i,
      /\b(?:my|our)\s+birthday\s+(?:is|:)\s+(.+)/i
    ],
    confidence: 0.90
  },
  // Salary/Compensation
  {
    fingerprint: 'user_salary',
    patterns: [
      /\b(?:my|our)\s+(?:salary|income|pay|compensation|wage|earnings?)\s+(?:is|:)?\s*\$?\d+[,\d]*(?:k|K|\d{3})?/i,
      /\bi\s+(?:make|earn|get paid)\s+\$?\d+[,\d]*(?:k|K|\d{3})?/i,
      /\b(?:salary|income|pay|compensation)(?:\s+is|\s+of)?\s*\$?\d+[,\d]*(?:k|K|\d{3})?/i,
      /\$\d+[,\d]*(?:\.\d{2})?\s*(?:per year|annually|\/year|a year)/i
    ],
    confidence: 0.95
  },
  // Marital Status
  {
    fingerprint: 'user_marital_status',
    patterns: [
      /\bi(?:'m| am)\s+(married|single|divorced|widowed|engaged|separated)/i,
      /\b(?:my|our)\s+(?:marital\s+)?status\s+(?:is|:)\s+(married|single|divorced|widowed|engaged|separated)/i,
      /\bgot\s+(married|divorced|engaged)/i
    ],
    confidence: 0.90
  },
  // Spouse/Partner Name
  {
    fingerprint: 'user_spouse_name',
    patterns: [
      /\b(?:my|our)\s+(?:wife|husband|spouse|partner)(?:'s name)?\s+(?:is|:)\s+([A-Z][a-z]+)/i,
      /\bmarried\s+to\s+([A-Z][a-z]+)/i
    ],
    confidence: 0.85
  },
  // Children
  {
    fingerprint: 'user_children_count',
    patterns: [
      /\bi\s+have\s+(\d+|one|two|three|four|five|no)\s+(?:kid|child|children|son|daughter)/i,
      /\b(?:my|our)\s+(?:kid|child|children)\s*(?:'s name|:)?\s+(.+)/i
    ],
    confidence: 0.85
  },
  // Pet
  {
    fingerprint: 'user_pet',
    patterns: [
      /\bi\s+have\s+a\s+(dog|cat|pet|bird|fish|hamster|rabbit)(?:\s+named\s+([A-Z][a-z]+))?/i,
      /\b(?:my|our)\s+(?:dog|cat|pet)(?:'s name)?\s+(?:is|:)\s+([A-Z][a-z]+)/i
    ],
    confidence: 0.80
  },
  // Favorite Color
  {
    fingerprint: 'user_favorite_color',
    patterns: [
      /\b(?:my|our)\s+fav(?:ou?rite)?\s+colou?r\s+(?:is|:)\s+(\w+)/i,
      /\bi\s+(?:love|like|prefer)\s+(?:the\s+colou?r\s+)?(\w+)\s+(?:colou?r|the\s+most)/i
    ],
    confidence: 0.80
  },
  // Timezone/Location context
  {
    fingerprint: 'user_timezone',
    patterns: [
      /\b(?:my|our)\s+timezone?\s+(?:is|:)\s+(.+)/i,
      /\bi(?:'m| am)\s+(?:in|on)\s+(EST|PST|CST|MST|UTC|GMT)/i
    ],
    confidence: 0.85
  },
  // Meeting/Appointment Time
  {
    fingerprint: 'user_meeting_time',
    patterns: [
      /\b(?:meeting|appointment|call|session)\s+(?:is\s+)?(?:at|scheduled\s+for|changed\s+to)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i,
      /\b(?:my|our|the)\s+(?:meeting|appointment|call)\s+(?:time\s+)?(?:is|:)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i,
      /\brescheduled?\s+(?:to|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i,
      /\bmoved?\s+(?:to|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)/i
    ],
    confidence: 0.90
  }
];

// ============================================================================
// DETERMINISTIC FINGERPRINT DETECTION
// ============================================================================

/**
 * Validate that content contains a value signature consistent with the fingerprint.
 * FIX #710: Prevents misclassification by requiring actual value patterns.
 *
 * @param {string} content - The content to validate
 * @param {string} fingerprint - The fingerprint to validate
 * @returns {{ hasValueSignature: boolean, reason: string }}
 */
function validateValueSignature(content, fingerprint) {
  const contentLower = content.toLowerCase();

  // Define value signature requirements for sensitive fingerprints
  const valueSignatureRules = {
    user_phone_number: {
      patterns: [/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/, /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/],
      description: 'phone-like digits pattern'
    },
    user_email: {
      patterns: [/[\w.-]+@[\w.-]+\.\w+/],
      description: 'contains @'
    },
    user_salary: {
      patterns: [/\$\d+[,\d]*/, /\d+k\b/i, /\d{5,}/],
      description: 'currency/number context'
    },
    user_age: {
      patterns: [/\d{1,3}\s*(?:years?\s*old|yo\b)/, /\bage\s*(?:is\s*)?\d+/i, /\bborn\s+in\s+\d{4}/i],
      description: 'age-like numeric context'
    },
    user_meeting_time: {
      patterns: [/\d{1,2}:\d{2}/, /\d{1,2}\s*(?:am|pm)/i],
      description: 'time format'
    },
    user_timezone: {
      patterns: [/\b(?:EST|PST|CST|MST|UTC|GMT|[A-Z]{3})\b/],
      description: 'timezone code'
    },
    user_location_residence: {
      // Location is less strict - often inferred from context
      patterns: [/\b[A-Z][a-z]+(?:,?\s+[A-Z]{2})?\b/],
      description: 'location name',
      optional: true  // Less strict for location
    },
    user_job_title: {
      // Job titles often don't have strict patterns
      patterns: [/\b(?:developer|engineer|manager|designer|analyst|consultant|director|ceo|cto|founder|doctor|lawyer|teacher|nurse|accountant|developer|programmer|architect|scientist)\b/i],
      description: 'job-related terms',
      optional: true  // Less strict for job titles
    },
    user_employer: {
      // Company names are hard to validate
      patterns: [/./],  // Any content passes
      description: 'company name',
      optional: true  // Less strict for employer
    },
    user_name: {
      patterns: [/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/],
      description: 'capitalized name',
      optional: true  // Names are flexible
    },
    user_pet: {
      patterns: [/\b(?:dog|cat|pet|bird|fish|hamster|rabbit|animal)\b/i],
      description: 'pet type',
      optional: true
    },
    user_marital_status: {
      patterns: [/\b(?:married|single|divorced|widowed|engaged|separated|spouse|wife|husband|partner)\b/i],
      description: 'marital status term',
      optional: true
    },
    user_spouse_name: {
      patterns: [/\b(?:wife|husband|spouse|partner)\b/i, /\b[A-Z][a-z]+\b/],
      description: 'spouse context + name',
      optional: true
    },
    user_children_count: {
      patterns: [/\b(?:\d+|one|two|three|no)\s+(?:kid|child|children|son|daughter)/i],
      description: 'child count',
      optional: true
    },
    user_favorite_color: {
      patterns: [/\b(?:red|blue|green|yellow|purple|orange|black|white|pink|brown|grey|gray|color|colour)\b/i],
      description: 'color name',
      optional: true
    }
  };

  const rule = valueSignatureRules[fingerprint];

  // If no rule defined, assume it's safe (shouldn't happen with proper patterns)
  if (!rule) {
    return { hasValueSignature: true, reason: 'no_validation_rule' };
  }

  // If optional and no patterns match, still allow (less critical fields)
  if (rule.optional) {
    const hasPattern = rule.patterns.some(p => p.test(content));
    return {
      hasValueSignature: hasPattern,
      reason: hasPattern ? `optional_matched_${rule.description}` : `optional_no_${rule.description}`
    };
  }

  // For required fields, at least one pattern MUST match
  const hasPattern = rule.patterns.some(p => p.test(content));
  return {
    hasValueSignature: hasPattern,
    reason: hasPattern ? rule.description : `missing_${rule.description}`
  };
}

/**
 * Attempt to extract fingerprint using deterministic regex patterns.
 * This runs FIRST, before any API call.
 * FIX #710: Now validates value signatures before assigning fingerprints.
 *
 * @param {string} content - The content to analyze
 * @returns {{ fingerprint: string|null, confidence: number, method: string, valueSignature: boolean }}
 */
function detectFingerprintDeterministic(content) {
  console.log('[SUPERSESSION-DIAG] ════════════════════════════════════════');
  console.log('[SUPERSESSION-DIAG] Input content:', content?.substring(0, 100));
  console.log('[SUPERSESSION-DIAG] Content length:', content?.length || 0);

  if (!content || typeof content !== 'string') {
    console.log('[SUPERSESSION-DIAG] ❌ Invalid content type');
    return { fingerprint: null, confidence: 0, method: 'none', valueSignature: false };
  }

  for (const { fingerprint, patterns, confidence } of FINGERPRINT_PATTERNS) {
    console.log(`[SUPERSESSION-DIAG] Checking fingerprint: ${fingerprint}`);
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = content.match(pattern);
      console.log(`[SUPERSESSION-DIAG]   Pattern ${i}: ${pattern.toString().substring(0, 80)}...`);
      console.log(`[SUPERSESSION-DIAG]   Match: ${match ? 'YES - ' + match[0] : 'NO'}`);
      if (match) {
        // FIX #710: Validate value signature before accepting fingerprint
        const validation = validateValueSignature(content, fingerprint);

        if (!validation.hasValueSignature) {
          console.log(`[SUPERSESSION-DIAG] ⚠️ Pattern matched but value signature missing: ${fingerprint}`);
          console.log(`[SUPERSESSION-DIAG]    Reason: ${validation.reason}`);
          // Log but don't assign - prevents misclassification
          console.log(`[FINGERPRINT] id=pending fingerprint=rejected_${fingerprint} confidence=0 method=no_value_signature value_signature=false source_preview="${content.substring(0, 50)}..."`);
          continue;  // Try next pattern
        }

        console.log(`[SUPERSESSION-DIAG] ✅ PATTERN MATCH FOUND: ${fingerprint} with valid value signature`);
        console.log(`[SUPERSESSION] Deterministic match: ${fingerprint} (confidence: ${confidence})`);

        // FIX #710 Requirement C: Structured logging
        console.log(`[FINGERPRINT] id=pending fingerprint=${fingerprint} confidence=${confidence} method=deterministic value_signature=true source_preview="${content.substring(0, 50)}..."`);

        return { fingerprint, confidence, method: 'deterministic', valueSignature: true };
      }
    }
  }

  console.log('[SUPERSESSION-DIAG] ❌ No pattern matches found');
  return { fingerprint: null, confidence: 0, method: 'none', valueSignature: false };
}

// ============================================================================
// MODEL-ASSISTED FINGERPRINT (fallback only)
// ============================================================================

/**
 * Use GPT to classify content that didn't match deterministic patterns.
 * Only called as a FALLBACK with strict timeout.
 *
 * NOTE: This is a legacy approach. For semantic supersession detection,
 * use semanticAnalyzer.analyzeSupersession() instead, which compares
 * semantic similarity between new content and existing memories.
 *
 * @param {string} content - The content to analyze
 * @param {object} options - Options including timeout
 * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string, error?: string }>}
 */
async function detectFingerprintWithModel(content, options = {}) {
  const { timeout = SUPERSESSION_CONFIG.fingerprintTimeout } = options;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: SUPERSESSION_CONFIG.fingerprintModel,
        messages: [{
          role: 'system',
          content: `You identify if a statement contains a superseding personal fact about the user.

If it does, return ONLY one of these canonical fingerprints:
- user_name
- user_phone_number
- user_email
- user_location_residence
- user_job_title
- user_employer
- user_salary
- user_age
- user_birthday
- user_marital_status
- user_spouse_name
- user_children_count
- user_pet
- user_favorite_color
- user_timezone
- user_meeting_time
- user_preferred_language
- user_health_condition
- user_dietary_preference

If it's NOT a superseding personal fact (opinions, questions, general conversation, requests), return exactly: null

Return ONLY the fingerprint or "null", nothing else. No explanation.`
        }, {
          role: 'user',
          content: content
        }],
        max_tokens: 50,
        temperature: 0
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const fingerprint = data.choices?.[0]?.message?.content?.trim();
    const timeMs = Date.now() - startTime;

    if (!fingerprint || fingerprint === 'null' || fingerprint.toLowerCase() === 'null') {
      console.log(`[SUPERSESSION] Model returned null (${timeMs}ms)`);
      return { fingerprint: null, confidence: 0, method: 'model', timeMs, valueSignature: false };
    }

    // Validate it's one of our known fingerprints
    const validFingerprints = FINGERPRINT_PATTERNS.map(p => p.fingerprint);
    const additionalValid = [
      'user_preferred_language', 'user_health_condition', 'user_dietary_preference',
      'user_salary', 'user_meeting_time'
    ];
    const allValid = [...validFingerprints, ...additionalValid];

    if (!allValid.includes(fingerprint)) {
      console.log(`[SUPERSESSION] Model returned unknown fingerprint: ${fingerprint}`);
      return { fingerprint: null, confidence: 0, method: 'model', timeMs, valueSignature: false };
    }

    // FIX #710: Validate value signature even for model-detected fingerprints
    const validation = validateValueSignature(content, fingerprint);

    if (!validation.hasValueSignature) {
      console.log(`[SUPERSESSION] Model detected ${fingerprint} but value signature missing: ${validation.reason} (${timeMs}ms)`);
      console.log(`[FINGERPRINT] id=pending fingerprint=rejected_${fingerprint} confidence=0.75 method=model_no_value_signature value_signature=false source_preview="${content.substring(0, 50)}..."`);
      return { fingerprint: null, confidence: 0, method: 'model_rejected', timeMs, valueSignature: false };
    }

    console.log(`[SUPERSESSION] Model match: ${fingerprint} with valid value signature (${timeMs}ms)`);
    console.log(`[FINGERPRINT] id=pending fingerprint=${fingerprint} confidence=0.75 method=model value_signature=true source_preview="${content.substring(0, 50)}..."`);
    return { fingerprint, confidence: 0.75, method: 'model', timeMs, valueSignature: true };

  } catch (error) {
    const timeMs = Date.now() - startTime;
    if (error.name === 'AbortError') {
      console.log(`[SUPERSESSION] Model timeout after ${timeMs}ms`);
      return { fingerprint: null, confidence: 0, method: 'timeout', error: 'timeout', timeMs, valueSignature: false };
    }
    console.error(`[SUPERSESSION] Model error: ${error.message}`);
    return { fingerprint: null, confidence: 0, method: 'error', error: error.message, timeMs, valueSignature: false };
  }
}

// ============================================================================
// MAIN FINGERPRINT FUNCTION (deterministic-first, model-fallback)
// ============================================================================

/**
 * Generate fact fingerprint from content.
 * Uses deterministic regex patterns FIRST, then model-assist as fallback.
 * FIX #710: Now includes value signature validation in return type.
 *
 * @param {string} content - The content to analyze
 * @param {object} options - Options
 * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string, valueSignature: boolean }>}
 */
export async function generateFactFingerprint(content, options = {}) {
  const { skipModel = false } = options;

  // Step 1: Try deterministic detection (instant, free, reliable)
  const deterministicResult = detectFingerprintDeterministic(content);

  if (deterministicResult.fingerprint) {
    return deterministicResult;
  }

  // Step 2: If no match and model not skipped, try model-assist (slow, costs money)
  if (!skipModel) {
    const modelResult = await detectFingerprintWithModel(content, options);
    return modelResult;
  }

  return { fingerprint: null, confidence: 0, method: 'skipped', valueSignature: false };
}

// ============================================================================
// TRANSACTION-SAFE STORAGE WITH SUPERSESSION
// ============================================================================

/**
 * Store memory with supersession check.
 * Transaction-safe: old fact marked not current in same transaction as new fact stored.
 *
 * SCHEMA: Both id and superseded_by are INTEGER (after running fix-superseded-by-type migration)
 *
 * @param {object} pool - PostgreSQL pool
 * @param {object} memoryData - Memory data to store
 * @returns {Promise<{ success: boolean, memoryId: number, superseded: number[], supersededCount: number }>}
 */
export async function storeWithSupersession(pool, memoryData) {
  const {
    userId,
    content,
    factFingerprint,
    fingerprintConfidence = 0.5,
    valueSignature = false,  // FIX #710: Accept value signature validation
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0,
    metadata = {}  // FIX #659: Accept metadata parameter
  } = memoryData;

  // FIX #710 - SUPERSESSION SAFETY GATE (Requirement A)
  // For supersession to occur, ALL of these must be true:
  // 1. fingerprint != null/"none"
  // 2. fingerprintConfidence >= 0.85 (high confidence threshold)
  // 3. Value signature is present (validated pattern match)
  //
  // If any condition fails, treat as non-superseding fact (safe default)
  const supersessionSafe = factFingerprint &&
                          factFingerprint !== 'none' &&
                          fingerprintConfidence >= 0.85 &&
                          valueSignature === true;

  if (!supersessionSafe) {
    // Log why supersession was blocked
    if (factFingerprint && factFingerprint !== 'none') {
      if (fingerprintConfidence < 0.85) {
        console.log(`[SUPERSESSION-SAFETY-GATE] ⚠️ Blocking supersession - confidence too low: ${fingerprintConfidence} < 0.85`);
      }
      if (valueSignature !== true) {
        console.log(`[SUPERSESSION-SAFETY-GATE] ⚠️ Blocking supersession - value signature missing or invalid`);
      }
      console.log(`[SUPERSESSION-SAFETY-GATE] Treating as non-superseding fact: fingerprint=${factFingerprint}, confidence=${fingerprintConfidence}, valueSignature=${valueSignature}`);
    }
    // Use normal storage (no supersession)
    return storeWithoutSupersession(pool, memoryData);
  }

  let retries = 0;
  const maxRetries = SUPERSESSION_CONFIG.maxRetries;

  while (retries < maxRetries) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock any existing current facts with same fingerprint for this user
      // Note: We don't filter by mode to ensure ALL memories with this fingerprint are superseded
      // across all modes (e.g., salary stored in truth-general should be superseded even if
      // new salary comes in via a different mode)
      const existing = await client.query(`
        SELECT id, content, fact_fingerprint
        FROM persistent_memories
        WHERE user_id = $1
          AND fact_fingerprint = $2
          AND is_current = true
        FOR UPDATE
      `, [userId, factFingerprint]);

      // CRITICAL: Mark old facts as not current BEFORE inserting new fact
      // This prevents violating the unique constraint idx_one_current_fact
      let oldIds = [];
      if (existing.rows.length > 0) {
        oldIds = existing.rows.map(r => r.id);

        // Mark old facts as not current (superseded_by will be set after insert)
        await client.query(`
          UPDATE persistent_memories
          SET is_current = false,
              superseded_at = NOW()
          WHERE id = ANY($1::integer[])
        `, [oldIds]);

        console.log(`[SUPERSESSION] Marked ${existing.rows.length} old memories as not current`);
        console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
        console.log(`[SUPERSESSION]    Superseded IDs: ${oldIds.join(', ')}`);

        // Log content preview for debugging
        existing.rows.forEach((row, idx) => {
          console.log(`[SUPERSESSION]    Memory ${row.id}: "${row.content.substring(0, 60)}..."`);
        });
      }

      // Insert new memory (id is INTEGER with sequence, auto-generated)
      // FIX #659: Include metadata in INSERT to preserve anchors
      // FIX #673: Log metadata before INSERT to verify anchors are present
      console.log(`[FIX-673-SUPERSESSION] PRE-INSERT metadata check: has_anchors=${!!metadata.anchors}, anchor_keys=[${Object.keys(metadata.anchors || {}).join(',')}]`);
      if (metadata.anchors) {
        console.log(`[FIX-673-SUPERSESSION] PRE-INSERT anchor counts: unicode=${(metadata.anchors.unicode || []).length}, pricing=${(metadata.anchors.pricing || []).length}, explicit_token=${(metadata.anchors.explicit_token || []).length}`);
      }

      const newMemory = await client.query(`
        INSERT INTO persistent_memories (
          user_id, content, category_name, token_count,
          fact_fingerprint, fingerprint_confidence,
          is_current, mode, embedding_status, created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'pending', NOW(), $8)
        RETURNING id
      `, [
        userId,
        content,
        categoryName,
        tokenCount || Math.ceil(content.length / 4), // Estimate if not provided
        factFingerprint,
        fingerprintConfidence,
        mode,
        JSON.stringify(metadata)  // FIX #659: Store metadata as JSONB
      ]);

      const newId = newMemory.rows[0].id; // INTEGER

      // Link old facts to new fact via superseded_by
      if (oldIds.length > 0) {
        // After running fix-superseded-by-type migration, superseded_by is INTEGER matching id
        await client.query(`
          UPDATE persistent_memories
          SET superseded_by = $1
          WHERE id = ANY($2::integer[])
        `, [newId, oldIds]);

        console.log(`[SUPERSESSION] ✅ Comprehensive supersession complete`);
        console.log(`[SUPERSESSION]    New memory ID: ${newId}`);
        console.log(`[SUPERSESSION]    Superseded ${oldIds.length} old memories: ${oldIds.join(', ')}`);
        console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
      } else {
        console.log(`[SUPERSESSION] ✅ Stored new memory ID ${newId} (no existing memories to supersede)`);
        console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
      }

      await client.query('COMMIT');

      return {
        success: true,
        memoryId: newId,
        superseded: existing.rows.map(r => r.id),
        supersededCount: existing.rows.length,
        fingerprint: factFingerprint
      };

    } catch (error) {
      await client.query('ROLLBACK');

      // Check for serialization failure or deadlock - retry
      if (error.code === '40001' || error.code === '40P01') {
        retries++;
        console.log(`[SUPERSESSION] ⚠️ Conflict detected, retry ${retries}/${maxRetries}`);
        await new Promise(r => setTimeout(r, SUPERSESSION_CONFIG.retryDelayMs * retries));
        continue;
      }

      console.error(`[SUPERSESSION] ❌ Transaction failed: ${error.message}`);
      throw error;

    } finally {
      client.release();
    }
  }

  // Max retries exceeded
  console.error(`[SUPERSESSION] ❌ Max retries exceeded for fingerprint: ${factFingerprint}`);
  throw new Error(`Supersession failed after ${maxRetries} retries`);
}

/**
 * Store memory without supersession check (for non-fingerprinted content)
 * FIX #710: Enhanced to accept metadata parameter for consistency
 */
async function storeWithoutSupersession(pool, memoryData) {
  const {
    userId,
    content,
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0,
    metadata = {}  // FIX #710: Accept metadata parameter
  } = memoryData;

  try {
    const result = await pool.query(`
      INSERT INTO persistent_memories (
        user_id, content, category_name, token_count,
        is_current, mode, embedding_status, created_at, metadata
      ) VALUES ($1, $2, $3, $4, true, $5, 'pending', NOW(), $6)
      RETURNING id
    `, [
      userId,
      content,
      categoryName,
      tokenCount || Math.ceil(content.length / 4),
      mode,
      JSON.stringify(metadata)
    ]);

    console.log(`[SUPERSESSION] Stored non-superseding memory ID ${result.rows[0].id}`);

    return {
      success: true,
      memoryId: result.rows[0].id,
      superseded: [],
      supersededCount: 0,
      fingerprint: null
    };

  } catch (error) {
    console.error(`[SUPERSESSION] ❌ Storage failed: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// DATABASE CONSTRAINT (run once to enforce one-current-fact at DB level)
// ============================================================================

/**
 * Create the partial unique index that enforces one current fact per fingerprint.
 * This is the gold standard - prevents multiple current facts even under race conditions.
 * NOTE: This constraint ensures uniqueness across ALL modes for a given user and fingerprint.
 *
 * @param {object} pool - PostgreSQL pool
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function createSupersessionConstraint(pool) {
  try {
    // Check if old index exists (with mode) and drop it
    const oldCheck = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'persistent_memories'
      AND indexname = 'idx_one_current_fact'
    `);

    if (oldCheck.rows.length > 0) {
      console.log('[SUPERSESSION] 🔄 Dropping old index (with mode filter)...');
      await pool.query(`DROP INDEX idx_one_current_fact`);
    }

    // Check if new index already exists
    const newCheck = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'persistent_memories'
      AND indexname = 'idx_one_current_fact_comprehensive'
    `);

    if (newCheck.rows.length > 0) {
      return { success: true, message: 'Comprehensive index already exists' };
    }

    // Create the partial unique index (without mode - comprehensive across all modes)
    await pool.query(`
      CREATE UNIQUE INDEX idx_one_current_fact_comprehensive
      ON persistent_memories (user_id, fact_fingerprint)
      WHERE is_current = true AND fact_fingerprint IS NOT NULL
    `);

    console.log('[SUPERSESSION] ✅ Created comprehensive unique constraint: idx_one_current_fact_comprehensive');
    console.log('[SUPERSESSION]    (enforces one current fact per user per fingerprint, across all modes)');
    return { success: true, message: 'Comprehensive index created successfully' };

  } catch (error) {
    // If there are existing duplicates, we need to clean them first
    if (error.code === '23505') {
      console.error('[SUPERSESSION] ❌ Cannot create index - duplicate current facts exist');
      return {
        success: false,
        message: 'Duplicate current facts exist. Run cleanupDuplicateCurrentFacts() first.',
        error: error.message
      };
    }
    throw error;
  }
}

/**
 * Clean up any duplicate current facts (keeps the newest one)
 * Run this BEFORE createSupersessionConstraint if there are existing duplicates.
 * NOTE: This cleanup is comprehensive - marks old facts across ALL modes as not current.
 *
 * @param {object} pool - PostgreSQL pool
 * @returns {Promise<{ success: boolean, cleaned: number }>}
 */
export async function cleanupDuplicateCurrentFacts(pool) {
  try {
    // Find and fix duplicates - keep the newest, mark others as not current
    // COMPREHENSIVE: partition by user_id and fingerprint only (not mode)
    const result = await pool.query(`
      WITH duplicates AS (
        SELECT id, user_id, fact_fingerprint, created_at,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, fact_fingerprint
                 ORDER BY created_at DESC
               ) as rn
        FROM persistent_memories
        WHERE is_current = true
          AND fact_fingerprint IS NOT NULL
      )
      UPDATE persistent_memories p
      SET is_current = false,
          superseded_at = NOW()
      FROM duplicates d
      WHERE p.id = d.id
        AND d.rn > 1
      RETURNING p.id, p.fact_fingerprint
    `);

    const cleanedCount = result.rowCount;

    if (cleanedCount > 0) {
      console.log(`[SUPERSESSION] 🧹 Comprehensive cleanup: Marked ${cleanedCount} duplicate current facts as superseded`);
      console.log(`[SUPERSESSION]    (cleaned duplicates across all modes per fingerprint)`);

      // Group by fingerprint for reporting
      const byFingerprint = {};
      result.rows.forEach(row => {
        byFingerprint[row.fact_fingerprint] = (byFingerprint[row.fact_fingerprint] || 0) + 1;
      });

      Object.entries(byFingerprint).forEach(([fp, count]) => {
        console.log(`[SUPERSESSION]    ${fp}: ${count} duplicates removed`);
      });
    } else {
      console.log(`[SUPERSESSION] ✅ No duplicate current facts found`);
    }

    return { success: true, cleaned: cleanedCount };

  } catch (error) {
    console.error(`[SUPERSESSION] ❌ Cleanup failed: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateFactFingerprint,
  storeWithSupersession,
  createSupersessionConstraint,
  cleanupDuplicateCurrentFacts,
  detectFingerprintDeterministic,
  config: SUPERSESSION_CONFIG
};
