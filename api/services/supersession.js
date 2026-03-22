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
// LOG HYGIENE HELPERS
// ============================================================================

/**
 * Redact PII from log previews.
 * FIX #710 Requirement 3: Bound log output and redact sensitive data
 * 
 * @param {string} content - The content to sanitize
 * @param {number} maxLength - Maximum preview length (default: 50)
 * @returns {string} Sanitized preview
 */
function sanitizeLogPreview(content, maxLength = 50) {
  if (!content) return '';
  
  let sanitized = content;
  
  // Redact phone numbers (various formats)
  sanitized = sanitized.replace(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  sanitized = sanitized.replace(/\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  sanitized = sanitized.replace(/\+\d{1,3}\s?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  sanitized = sanitized.replace(/\d{10}/g, '[PHONE]');
  
  // Redact emails
  sanitized = sanitized.replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[EMAIL]');
  
  // Redact salaries (various formats)
  sanitized = sanitized.replace(/\$\d+[,\d]*/g, '[SALARY]');
  sanitized = sanitized.replace(/\d+k\b/gi, '[SALARY]');
  sanitized = sanitized.replace(/(?:USD|EUR|GBP|£|€)\s?\d+[,\d]*/gi, '[SALARY]');
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

/**
 * Detect if content contains update intent language.
 * Used to allow supersession for optional fields when user explicitly updates them.
 * 
 * @param {string} content - The content to analyze
 * @param {string} fingerprint - The fingerprint type
 * @returns {boolean} True if update intent detected
 */
function detectUpdateIntent(content, fingerprint) {
  if (!content || !fingerprint) return false;
  
  const contentLower = content.toLowerCase();
  
  // General update phrases that apply to most fields
  const generalUpdatePatterns = [
    /\b(?:now|currently|just|recently)\s+(?:i'm|i am|my|we're|we are)\b/i,
    /\b(?:i|we)\s+(?:moved|changed|updated|switched|got|became|am now|are now)\b/i,
    /\b(?:my|our)\s+(?:new|current|updated)\b/i,
    /\b(?:no longer|not anymore|don't have|doesn't have)\b/i,
    /\b(?:i'm now|i am now|we're now|we are now)\b/i
  ];
  
  // Fingerprint-specific update patterns
  const specificUpdatePatterns = {
    user_job_title: [
      /\b(?:promoted|hired|new (?:job|position|role|title))\b/i,
      /\b(?:i'm now|i am now)\s+(?:a|an|the)?\s*(?:developer|engineer|manager|designer|director|ceo|founder)/i,
      /\b(?:became|got promoted to|switched to)\s+(?:a|an|the)?\s*/i,
      // Explicit job-title declarations — "My (job) title/role/position is X" asserts the
      // user's current state and should supersede any previously stored job title.
      /\b(?:my|our)\s+(?:job\s+)?(?:title|position|role)\s+(?:is|was|became)\b/i,
      // Promotion-specific patterns — "I got promoted to X", "I've been promoted to X"
      /\b(?:got|been)\s+promoted\s+to\b/i,
    ],
    user_employer: [
      /\b(?:joined|started at|working at|work at|employed at|new job at|left|quit)\b/i,
      /\b(?:i work|i'm working|i am working)\s+(?:for|at|with)\b/i,
      /\b(?:switched|moved|changed)\s+(?:to|jobs)\b/i
    ],
    user_location_residence: [
      /\b(?:moved to|relocated to|living in|based in|live in)\b/i,
      /\b(?:i'm in|i am in|i'm at|i am at)\b/i,
      /\b(?:moved|relocated|settled|staying)\s+(?:to|in|at)\b/i
    ],
    user_marital_status: [
      /\b(?:got married|just married|recently married|engaged|divorced|separated|widowed)\b/i,
      /\b(?:i'm|i am)\s+(?:married|single|divorced|engaged|widowed)\s+now\b/i,
      /\b(?:my|our)\s+(?:divorce|wedding|marriage|separation)\b/i
    ],
    user_pet: [
      /\b(?:got|adopted|have|own)\s+(?:a|an|my)?\s*(?:dog|cat|pet|bird|fish|monkey|primate|capuchin|parrot)\b/i,
      /\b(?:no longer have|lost|gave away|don't have)\s+(?:a|my)?\s*(?:dog|cat|pet|monkey|primate)\b/i,
      /\b(?:my|our)\s+(?:new|current)?\s*(?:dog|cat|pet|monkey|primate|capuchin)\b/i,
      /\b(?:male|female)(?:'s|s)?\s+(?:name|monkey|capuchin)\b/i
    ]
  };
  
  // Check general update patterns
  if (generalUpdatePatterns.some(p => p.test(content))) {
    return true;
  }
  
  // Check fingerprint-specific patterns
  const specificPatterns = specificUpdatePatterns[fingerprint];
  if (specificPatterns && specificPatterns.some(p => p.test(content))) {
    return true;
  }
  
  return false;
}

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
      // Single-word field name: "My role is X", "My title is X", "My position is X"
      /\b(?:my|our)\s+(?:job|occupation|profession|role|title|position)\s+(?:is|:)\s+(.+)/i,
      // Compound "job title" phrase — "My job title is X"
      // The single-word pattern above matches "job" but then fails when followed by "title is"
      // instead of "is". This explicit pattern handles the two-word compound field name.
      /\b(?:my|our)\s+job\s+title\s+(?:is|:)\s+(?:a\s+|an\s+)?(.+)/i,
      /\bi(?:'m| am)\s+a\s+(developer|engineer|manager|designer|analyst|consultant|director|ceo|cto|founder|doctor|lawyer|teacher|nurse|accountant)/i,
      // Promotion / new role — "I got promoted to Senior Engineer", "I've been promoted to X"
      /\b(?:got|been)\s+promoted\s+to\s+(?:a\s+|an\s+)?(.+)/i,
      // "I am now a X" — explicit current-state assertion with "now" adverb
      /\bi(?:'m| am)\s+now\s+(?:a\s+|an\s+)?(.+)/i,
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
      // Handles "my salary is $X", "my salary is now $X", "my income is now $95,000"
      // The (?:now\s+)? group allows for the "now" adverb between "is" and the amount
      /\b(?:my|our)\s+(?:salary|income|pay|compensation|wage|earnings?)\s+(?:is\s+(?:now\s+)?|:)?\$?\d+[,\d]*(?:k|K|\d{3})?/i,
      /\bi\s+(?:now\s+)?(?:make|earn|get paid)\s+\$?\d+[,\d]*(?:k|K|\d{3})?/i,
      /\b(?:salary|income|pay|compensation)(?:\s+is(?:\s+now)?|\s+of)?\s*\$?\d+[,\d]*(?:k|K|\d{3})?/i,
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
  // Pet (including exotic animals and primates)
  {
    fingerprint: 'user_pet',
    patterns: [
      /\bi\s+have\s+a\s+(dog|cat|pet|bird|fish|hamster|rabbit|monkey|primate|parrot|reptile|turtle)(?:\s+named\s+([A-Z][a-z]+))?/i,
      /\b(?:my|our)\s+(?:dog|cat|pet|monkey|primate|parrot|capuchin)(?:'s name)?\s+(?:is|:)\s+([A-Z][a-z]+)/i,
      /\b(?:male|female)(?:'s|s)?\s+(?:name|monkey|capuchin)\b/i
    ],
    confidence: 0.85
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
      patterns: [
        /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,  // 555-123-4567, 555.123.4567, 555 123 4567
        /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/,  // (555) 123-4567, (555)123-4567
        /\+\d{1,3}\s?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,  // +1 555-123-4567
        /\d{10}/  // 5551234567 (10 digits)
      ],
      description: 'phone-like digits pattern'
    },
    user_email: {
      patterns: [/[\w.+-]+@[\w.-]+\.\w+/],  // Expanded to include + and more variations
      description: 'contains @'
    },
    user_salary: {
      patterns: [
        /\$\d+[,\d]*/, // $95,000 or $95000
        /\d+k\b/i,  // 95k
        /(?:USD|EUR|GBP|£|€)\s?\d+[,\d]*/i,  // USD 95000, £95,000, €95000
        /\d{5,}(?:\.\d{2})?/  // 95000 or 95000.00 (5+ digits)
      ],
      description: 'currency/number context'
    },
    user_age: {
      patterns: [
        /\d{1,3}\s*(?:years?\s*old|yo\b)/,  // 25 years old, 30 yo
        /\bage\s*(?:is\s*)?\d+/i,  // age is 25, age 30
        /\bborn\s+in\s+\d{4}/i,  // born in 1990
        /\bI'm\s+\d{1,3}\b/i,  // I'm 25
        /\d{1,3}[-\s]year[-\s]old/i  // 25-year-old, 25 year old
      ],
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
      patterns: [/\b(?:dog|cat|pet|bird|fish|hamster|rabbit|animal|monkey|primate|capuchin|parrot|reptile|turtle)\b/i],
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
    return { hasValueSignature: true, reason: 'no_validation_rule', isOptional: false };
  }

  // For optional fields, check if patterns match
  if (rule.optional) {
    const hasPattern = rule.patterns.some(p => p.test(content));
    return {
      hasValueSignature: hasPattern,
      reason: hasPattern ? `optional_matched_${rule.description}` : `optional_no_${rule.description}`,
      isOptional: true  // Mark optional fields
    };
  }

  // For required fields, at least one pattern MUST match
  const hasPattern = rule.patterns.some(p => p.test(content));
  return {
    hasValueSignature: hasPattern,
    reason: hasPattern ? rule.description : `missing_${rule.description}`,
    isOptional: false
  };
}

/**
 * Attempt to extract fingerprint using deterministic regex patterns.
 * This runs FIRST, before any API call.
 * FIX #710: Now validates value signatures before assigning fingerprints.
 *
 * @param {string} content - The content to analyze
 * @returns {{ fingerprint: string|null, confidence: number, method: string, valueSignature: boolean, isOptional: boolean, updateIntent: boolean }}
 */
function detectFingerprintDeterministic(content) {
  if (process.env.DEBUG_DIAGNOSTICS === 'true') {
    console.log('[SUPERSESSION-DIAG] ════════════════════════════════════════');
    console.log('[SUPERSESSION-DIAG] Input content:', content?.substring(0, 100));
    console.log('[SUPERSESSION-DIAG] Content length:', content?.length || 0);
  }

  if (!content || typeof content !== 'string') {
    if (process.env.DEBUG_DIAGNOSTICS === 'true') {
      console.log('[SUPERSESSION-DIAG] ❌ Invalid content type');
    }
    return { fingerprint: null, confidence: 0, method: 'none', valueSignature: false, isOptional: false, updateIntent: false };
  }

  for (const { fingerprint, patterns, confidence } of FINGERPRINT_PATTERNS) {
    if (process.env.DEBUG_DIAGNOSTICS === 'true') {
      console.log(`[SUPERSESSION-DIAG] Checking fingerprint: ${fingerprint}`);
    }
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = content.match(pattern);
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION-DIAG]   Pattern ${i}: ${pattern.toString().substring(0, 80)}...`);
        console.log(`[SUPERSESSION-DIAG]   Match: ${match ? 'YES - ' + match[0] : 'NO'}`);
      }
      if (match) {
        // FIX #710: Validate value signature before accepting fingerprint
        const validation = validateValueSignature(content, fingerprint);

        if (!validation.hasValueSignature) {
          if (process.env.DEBUG_DIAGNOSTICS === 'true') {
            console.log(`[SUPERSESSION-DIAG] ⚠️ Pattern matched but value signature missing: ${fingerprint}`);
            console.log(`[SUPERSESSION-DIAG]    Reason: ${validation.reason}`);
          }
          // FIX #710 Requirement C: Log rejections with sanitized preview
          const preview = sanitizeLogPreview(content, 50);
          if (process.env.DEBUG_DIAGNOSTICS === 'true') {
            console.log(`[FINGERPRINT-REJECTED] fingerprint=${fingerprint} reason=no_value_signature preview="${preview}"`);
          }
          continue;  // Try next pattern
        }

        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION-DIAG] ✅ PATTERN MATCH FOUND: ${fingerprint} with valid value signature`);
          console.log(`[SUPERSESSION] Deterministic match: ${fingerprint} (confidence: ${confidence})`);
        }

        // Detect update intent for optional fields
        const updateIntent = validation.isOptional ? detectUpdateIntent(content, fingerprint) : false;
        if (validation.isOptional && updateIntent) {
          if (process.env.DEBUG_DIAGNOSTICS === 'true') {
            console.log(`[SUPERSESSION] ✓ Update intent detected for optional field: ${fingerprint}`);
          }
        }

        return { fingerprint, confidence, method: 'deterministic', valueSignature: true, isOptional: validation.isOptional, updateIntent };
      }
    }
  }

  if (process.env.DEBUG_DIAGNOSTICS === 'true') {
    console.log('[SUPERSESSION-DIAG] ❌ No pattern matches found');
  }
  return { fingerprint: null, confidence: 0, method: 'none', valueSignature: false, isOptional: false, updateIntent: false };
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
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] Model returned null (${timeMs}ms)`);
      }
      return { fingerprint: null, confidence: 0, method: 'model', timeMs, valueSignature: false, isOptional: false };
    }

    // Validate it's one of our known fingerprints
    const validFingerprints = FINGERPRINT_PATTERNS.map(p => p.fingerprint);
    const additionalValid = [
      'user_preferred_language', 'user_health_condition', 'user_dietary_preference',
      'user_salary', 'user_meeting_time'
    ];
    const allValid = [...validFingerprints, ...additionalValid];

    if (!allValid.includes(fingerprint)) {
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] Model returned unknown fingerprint: ${fingerprint}`);
      }
      return { fingerprint: null, confidence: 0, method: 'model', timeMs, valueSignature: false, isOptional: false };
    }

    // FIX #710: Validate value signature even for model-detected fingerprints
    const validation = validateValueSignature(content, fingerprint);

    if (!validation.hasValueSignature) {
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] Model detected ${fingerprint} but value signature missing: ${validation.reason} (${timeMs}ms)`);
        // FIX #710 Requirement C: Log rejections with sanitized preview
        const preview = sanitizeLogPreview(content, 50);
        console.log(`[FINGERPRINT-REJECTED] fingerprint=${fingerprint} reason=model_no_value_signature preview="${preview}"`);
      }
      return { fingerprint: null, confidence: 0, method: 'model_rejected', timeMs, valueSignature: false, isOptional: false, updateIntent: false };
    }

    // Detect update intent for optional fields
    const updateIntent = validation.isOptional ? detectUpdateIntent(content, fingerprint) : false;
    if (validation.isOptional && updateIntent) {
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] ✓ Update intent detected for optional field: ${fingerprint}`);
      }
    }

    if (process.env.DEBUG_DIAGNOSTICS === 'true') {
      console.log(`[SUPERSESSION] Model match: ${fingerprint} with valid value signature (${timeMs}ms)`);
    }
    return { fingerprint, confidence: 0.75, method: 'model', timeMs, valueSignature: true, isOptional: validation.isOptional, updateIntent };

  } catch (error) {
    const timeMs = Date.now() - startTime;
    if (error.name === 'AbortError') {
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] Model timeout after ${timeMs}ms`);
      }
      return { fingerprint: null, confidence: 0, method: 'timeout', error: 'timeout', timeMs, valueSignature: false, isOptional: false, updateIntent: false };
    }
    console.error(`[SUPERSESSION] Model error: ${error.message}`);
    return { fingerprint: null, confidence: 0, method: 'error', error: error.message, timeMs, valueSignature: false, isOptional: false, updateIntent: false };
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
 * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string, valueSignature: boolean, isOptional: boolean, updateIntent: boolean }>}
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

  return { fingerprint: null, confidence: 0, method: 'skipped', valueSignature: false, isOptional: false, updateIntent: false };
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
    isOptional = false,  // FIX #710: Accept optional field flag
    updateIntent = false,  // FIX #710: Accept update intent detection
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0,
    metadata = {}  // FIX #659: Accept metadata parameter
  } = memoryData;

  // FIX #710 - SUPERSESSION SAFETY GATE (Updated with update-intent awareness)
  // For supersession to occur, ALL of these must be true:
  // 1. fingerprint != null/"none"
  // 2. fingerprintConfidence >= 0.85 (high confidence threshold)
  // 3. Value signature is present (validated pattern match)
  // 4. EITHER field is NOT optional OR update intent is detected
  //    - Required fields (phone/email/salary/age): always supersede when valid
  //    - Optional fields (job_title/location/employer/etc): supersede only with update intent
  //
  // If any condition fails, treat as non-superseding fact (safe default)
  const supersessionSafe = factFingerprint &&
                          factFingerprint !== 'none' &&
                          fingerprintConfidence >= 0.85 &&
                          valueSignature === true &&
                          (isOptional === false || updateIntent === true);

  if (!supersessionSafe) {
    // Log why supersession was blocked
    if (factFingerprint && factFingerprint !== 'none') {
      if (fingerprintConfidence < 0.85) {
        console.log(`[SUPERSESSION-SAFETY-GATE] ⚠️ Blocking supersession - confidence too low: ${fingerprintConfidence} < 0.85`);
      }
      if (valueSignature !== true) {
        console.log(`[SUPERSESSION-SAFETY-GATE] ⚠️ Blocking supersession - value signature missing or invalid`);
      }
      if (isOptional === true && updateIntent === false) {
        console.log(`[SUPERSESSION-SAFETY-GATE] ⚠️ Blocking supersession - optional field without update intent`);
      }
      console.log(`[SUPERSESSION-SAFETY-GATE] Treating as non-superseding fact: fingerprint=${factFingerprint}, confidence=${fingerprintConfidence}, valueSignature=${valueSignature}, isOptional=${isOptional}, updateIntent=${updateIntent}`);
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

        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] Marked ${existing.rows.length} old memories as not current`);
          console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
          console.log(`[SUPERSESSION]    Superseded IDs: ${oldIds.join(', ')}`);

          // Log content preview for debugging
          existing.rows.forEach((row, idx) => {
            console.log(`[SUPERSESSION]    Memory ${row.id}: "${row.content.substring(0, 60)}..."`);
          });
        }
      }

      // Insert new memory (id is INTEGER with sequence, auto-generated)
      // FIX #659: Include metadata in INSERT to preserve anchors
      // FIX #673: Log metadata before INSERT to verify anchors are present
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[FIX-673-SUPERSESSION] PRE-INSERT metadata check: has_anchors=${!!metadata.anchors}, anchor_keys=[${Object.keys(metadata.anchors || {}).join(',')}]`);
        if (metadata.anchors) {
          console.log(`[FIX-673-SUPERSESSION] PRE-INSERT anchor counts: unicode=${(metadata.anchors.unicode || []).length}, pricing=${(metadata.anchors.pricing || []).length}, explicit_token=${(metadata.anchors.explicit_token || []).length}`);
        }
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

        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] ✅ Comprehensive supersession complete`);
          console.log(`[SUPERSESSION]    New memory ID: ${newId}`);
          console.log(`[SUPERSESSION]    Superseded ${oldIds.length} old memories: ${oldIds.join(', ')}`);
          console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
        }
      } else {
        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] ✅ Stored new memory ID ${newId} (no existing memories to supersede)`);
          console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
        }
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
        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] ⚠️ Conflict detected, retry ${retries}/${maxRetries}`);
        }
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
 * Store memory without supersession check (for non-fingerprinted content, or optional
 * fields where update intent was not detected).
 *
 * FIX #710: Enhanced to accept metadata parameter for consistency.
 * FIX (Issue salary-supersession-trigger): When a fingerprint IS present in memoryData
 * (e.g. user_job_title detected for "My job title is Engineer") but supersession was
 * intentionally skipped (optional field, no explicit update signal), we still persist the
 * fact_fingerprint column so that a FUTURE supersession lookup (e.g. "I got promoted to X")
 * can find this row via `WHERE fact_fingerprint = $2 AND is_current = true`.
 *
 * Conflict handling: if an is_current=true row with the same fingerprint already exists
 * (rare in practice — the user just re-stated the same fact), we fall back to storing
 * without the fingerprint to preserve content without violating the unique partial index
 * idx_one_current_fact_comprehensive.
 */
async function storeWithoutSupersession(pool, memoryData) {
  const {
    userId,
    content,
    factFingerprint = null,        // Accept fingerprint so future lookups can find this row
    fingerprintConfidence = 0,
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0,
    metadata = {}  // FIX #710: Accept metadata parameter
  } = memoryData;

  try {
    let result;

    // When a fingerprint was detected (even for an optional field), attempt to store it so
    // that a future update (e.g. "I got promoted to X") can supersede this row.
    // Use DO NOTHING on the partial unique index conflict to avoid errors when the user
    // simply re-states the same fact without any update intent.
    if (factFingerprint) {
      try {
        result = await pool.query(`
          INSERT INTO persistent_memories (
            user_id, content, category_name, token_count,
            fact_fingerprint, fingerprint_confidence,
            is_current, mode, embedding_status, created_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'pending', NOW(), $8)
          ON CONFLICT (user_id, fact_fingerprint) WHERE is_current = true AND fact_fingerprint IS NOT NULL
          DO NOTHING
          RETURNING id
        `, [
          userId,
          content,
          categoryName,
          tokenCount || Math.ceil(content.length / 4),
          factFingerprint,
          fingerprintConfidence,
          mode,
          JSON.stringify(metadata)
        ]);
      } catch (fpInsertError) {
        // 42P10: no unique/exclusion constraint matching the ON CONFLICT spec.
        //        This happens when idx_one_current_fact_comprehensive hasn't been created yet
        //        (e.g. first deploy before createSupersessionConstraint has run). The next
        //        server start will create the index; until then, fall back to no-fingerprint.
        // 23505: unique_violation (should not happen with DO NOTHING, but guard anyway)
        if (fpInsertError.code === '42P10' || fpInsertError.code === '23505') {
          if (process.env.DEBUG_DIAGNOSTICS === 'true') {
            console.log(`[SUPERSESSION] ON CONFLICT fingerprint insert failed (${fpInsertError.code}) — falling back to no-fingerprint insert`);
          }
          result = null;
        } else {
          throw fpInsertError;
        }
      }

      if (result && result.rows.length > 0) {
        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] Stored non-superseding memory ID ${result.rows[0].id} (fingerprint: ${factFingerprint})`);
        }
        return {
          success: true,
          memoryId: result.rows[0].id,
          superseded: [],
          supersededCount: 0,
          fingerprint: factFingerprint
        };
      }

      // Distinguish the two fall-through reasons for clearer log diagnostics:
      // - result is null → the ON CONFLICT clause itself failed (index missing / error code above)
      // - result.rows is empty → DO NOTHING fired: an is_current=true row with this fingerprint
      //   already exists (user simply re-stated the same fact, no supersession needed)
      if (!result) {
        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] Fingerprint index unavailable for ${factFingerprint} — storing content without fingerprint`);
        }
      } else {
        if (process.env.DEBUG_DIAGNOSTICS === 'true') {
          console.log(`[SUPERSESSION] Duplicate current fingerprint ${factFingerprint} — storing content without fingerprint`);
        }
      }
    }

    // No fingerprint, or fingerprint insert conflicted — store without fingerprint
    result = await pool.query(`
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

    if (process.env.DEBUG_DIAGNOSTICS === 'true') {
      console.log(`[SUPERSESSION] Stored non-superseding memory ID ${result.rows[0].id}`);
    }

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
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log('[SUPERSESSION] 🔄 Dropping old index (with mode filter)...');
      }
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

    if (process.env.DEBUG_DIAGNOSTICS === 'true') {
      console.log('[SUPERSESSION] ✅ Created comprehensive unique constraint: idx_one_current_fact_comprehensive');
      console.log('[SUPERSESSION]    (enforces one current fact per user per fingerprint, across all modes)');
    }
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
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
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
      }
    } else {
      if (process.env.DEBUG_DIAGNOSTICS === 'true') {
        console.log(`[SUPERSESSION] ✅ No duplicate current facts found`);
      }
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
