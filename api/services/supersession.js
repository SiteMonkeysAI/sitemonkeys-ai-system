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
  }
];

// ============================================================================
// DETERMINISTIC FINGERPRINT DETECTION
// ============================================================================

/**
 * Attempt to extract fingerprint using deterministic regex patterns.
 * This runs FIRST, before any API call.
 * 
 * @param {string} content - The content to analyze
 * @returns {{ fingerprint: string|null, confidence: number, method: string }}
 */
function detectFingerprintDeterministic(content) {
  if (!content || typeof content !== 'string') {
    return { fingerprint: null, confidence: 0, method: 'none' };
  }

  for (const { fingerprint, patterns, confidence } of FINGERPRINT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        console.log(`[SUPERSESSION] Deterministic match: ${fingerprint} (confidence: ${confidence})`);
        return { fingerprint, confidence, method: 'deterministic' };
      }
    }
  }

  return { fingerprint: null, confidence: 0, method: 'none' };
}

// ============================================================================
// MODEL-ASSISTED FINGERPRINT (fallback only)
// ============================================================================

/**
 * Use GPT to classify content that didn't match deterministic patterns.
 * Only called as a FALLBACK with strict timeout.
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
- user_age
- user_birthday
- user_marital_status
- user_spouse_name
- user_children_count
- user_pet
- user_favorite_color
- user_timezone
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
      return { fingerprint: null, confidence: 0, method: 'model', timeMs };
    }

    // Validate it's one of our known fingerprints
    const validFingerprints = FINGERPRINT_PATTERNS.map(p => p.fingerprint);
    const additionalValid = [
      'user_preferred_language', 'user_health_condition', 'user_dietary_preference'
    ];
    const allValid = [...validFingerprints, ...additionalValid];

    if (!allValid.includes(fingerprint)) {
      console.log(`[SUPERSESSION] Model returned unknown fingerprint: ${fingerprint}`);
      return { fingerprint: null, confidence: 0, method: 'model', timeMs };
    }

    console.log(`[SUPERSESSION] Model match: ${fingerprint} (${timeMs}ms)`);
    return { fingerprint, confidence: 0.75, method: 'model', timeMs };

  } catch (error) {
    const timeMs = Date.now() - startTime;
    if (error.name === 'AbortError') {
      console.log(`[SUPERSESSION] Model timeout after ${timeMs}ms`);
      return { fingerprint: null, confidence: 0, method: 'timeout', error: 'timeout', timeMs };
    }
    console.error(`[SUPERSESSION] Model error: ${error.message}`);
    return { fingerprint: null, confidence: 0, method: 'error', error: error.message, timeMs };
  }
}

// ============================================================================
// MAIN FINGERPRINT FUNCTION (deterministic-first, model-fallback)
// ============================================================================

/**
 * Generate fact fingerprint from content.
 * Uses deterministic regex patterns FIRST, then model-assist as fallback.
 * 
 * @param {string} content - The content to analyze
 * @param {object} options - Options
 * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string }>}
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

  return { fingerprint: null, confidence: 0, method: 'skipped' };
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
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0
  } = memoryData;

  // If no fingerprint, this isn't a superseding fact - use normal storage
  if (!factFingerprint) {
    return storeWithoutSupersession(pool, memoryData);
  }

  let retries = 0;
  const maxRetries = SUPERSESSION_CONFIG.maxRetries;

  while (retries < maxRetries) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock any existing current facts with same fingerprint for this user/mode
      const existing = await client.query(`
        SELECT id, content, fact_fingerprint 
        FROM persistent_memories 
        WHERE user_id = $1 
          AND mode = $2
          AND fact_fingerprint = $3 
          AND is_current = true
        FOR UPDATE
      `, [userId, mode, factFingerprint]);

      // Insert new memory (id is INTEGER with sequence, auto-generated)
      const newMemory = await client.query(`
        INSERT INTO persistent_memories (
          user_id, content, category_name, token_count,
          fact_fingerprint, fingerprint_confidence,
          is_current, mode, embedding_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'pending', NOW())
        RETURNING id
      `, [
        userId,
        content,
        categoryName,
        tokenCount || Math.ceil(content.length / 4), // Estimate if not provided
        factFingerprint,
        fingerprintConfidence,
        mode
      ]);

      const newId = newMemory.rows[0].id; // INTEGER

      // Supersede old facts (if any)
      if (existing.rows.length > 0) {
        const oldIds = existing.rows.map(r => r.id);

        // Mark old facts as superseded and link to new fact
        // After running fix-superseded-by-type migration, superseded_by is INTEGER matching id
        await client.query(`
          UPDATE persistent_memories
          SET is_current = false,
              superseded_by = $1,
              superseded_at = NOW()
          WHERE id = ANY($2::integer[])
        `, [newId, oldIds]);

        console.log(`[SUPERSESSION] ✅ Replaced ${existing.rows.length} old facts with ID ${newId}`);
        console.log(`[SUPERSESSION]    Fingerprint: ${factFingerprint}`);
        console.log(`[SUPERSESSION]    Old IDs: ${oldIds.join(', ')}`);
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
 */
async function storeWithoutSupersession(pool, memoryData) {
  const {
    userId,
    content,
    mode = 'truth-general',
    categoryName = 'general',
    tokenCount = 0
  } = memoryData;

  try {
    const result = await pool.query(`
      INSERT INTO persistent_memories (
        user_id, content, category_name, token_count,
        is_current, mode, embedding_status, created_at
      ) VALUES ($1, $2, $3, $4, true, $5, 'pending', NOW())
      RETURNING id
    `, [
      userId,
      content,
      categoryName,
      tokenCount || Math.ceil(content.length / 4)
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
 * 
 * @param {object} pool - PostgreSQL pool
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function createSupersessionConstraint(pool) {
  try {
    // Check if index already exists
    const check = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'persistent_memories' 
      AND indexname = 'idx_one_current_fact'
    `);

    if (check.rows.length > 0) {
      return { success: true, message: 'Index already exists' };
    }

    // Create the partial unique index
    await pool.query(`
      CREATE UNIQUE INDEX idx_one_current_fact 
      ON persistent_memories (user_id, mode, fact_fingerprint) 
      WHERE is_current = true AND fact_fingerprint IS NOT NULL
    `);

    console.log('[SUPERSESSION] ✅ Created unique constraint: idx_one_current_fact');
    return { success: true, message: 'Index created successfully' };

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
 * 
 * @param {object} pool - PostgreSQL pool
 * @returns {Promise<{ success: boolean, cleaned: number }>}
 */
export async function cleanupDuplicateCurrentFacts(pool) {
  try {
    // Find and fix duplicates - keep the newest, mark others as not current
    const result = await pool.query(`
      WITH duplicates AS (
        SELECT id, user_id, mode, fact_fingerprint, created_at,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, mode, fact_fingerprint 
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
      RETURNING p.id
    `);

    const cleanedCount = result.rowCount;
    
    if (cleanedCount > 0) {
      console.log(`[SUPERSESSION] 🧹 Cleaned ${cleanedCount} duplicate current facts`);
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
