/**
 * SEMANTIC RETRIEVAL SERVICE
 * 
 * Retrieves memories using semantic similarity with mode-aware prefiltering.
 * 
 * Pipeline:
 * 1. Embed query (single API call)
 * 2. Prefilter candidates via SQL (mode, category, is_current, recency)
 * 3. Score candidates with cosine similarity in Node
 * 4. Hybrid ranking (semantic + recency + confidence)
 * 5. Return top results with telemetry
 * 
 * @module api/services/semantic-retrieval
 */

import { generateEmbedding, cosineSimilarity, rankBySimilarity } from './embedding-service.js';

// ============================================
// CONFIGURATION
// ============================================

const RETRIEVAL_CONFIG = {
  maxCandidates: 500,           // Max memories to pull from DB for scoring
  defaultTopK: 10,              // Default number of results to return
  minSimilarity: 0.25,          // Minimum similarity threshold
  recencyBoostDays: 7,          // Boost memories from last N days
  recencyBoostWeight: 0.1,      // How much to boost recent memories
  confidenceWeight: 0.05,       // Weight for fingerprint confidence
  embeddingTimeout: 5000        // Timeout for query embedding
};

// ============================================
// PREFILTER QUERY BUILDER
// ============================================

/**
 * Build SQL prefilter query based on retrieval options
 * Mode-aware, respects vault boundaries, handles pinned memories
 *
 * @param {object} options - Filter options
 * @returns {{sql: string, params: any[]}} Query and parameters
 */
function buildPrefilterQuery(options) {
  console.log('[MODE-DIAG] ════════════════════════════════════════');
  console.log('[MODE-DIAG] Options:', JSON.stringify(options, null, 2));

  const {
    userId,
    mode = 'truth-general',
    categories = null,
    includeAllModes = false,
    allowCrossMode = false,
    limit = RETRIEVAL_CONFIG.maxCandidates
  } = options;

  console.log('[MODE-DIAG] Mode from options:', mode);
  console.log('[MODE-DIAG] allowCrossMode:', allowCrossMode);

  const params = [userId];
  let paramIndex = 2;

  const conditions = [
    'user_id = $1',
    'embedding IS NOT NULL',
    "embedding_status = 'ready'"
  ];

  // Filter out superseded memories (Innovation #3)
  // Include history only if explicitly requested
  const includeHistory = options.includeHistory || false;
  if (!includeHistory) {
    // Handle legacy memories without is_current column set
    conditions.push('(is_current = true OR is_current IS NULL)');
  }

  // Mode filtering (respects vault boundaries)
  // Innovation #22: Cross-mode context transfer with consent
  if (!includeAllModes) {
    if (mode === 'site-monkeys') {
      // Site Monkeys can access all modes
      // No mode filter needed
      console.log('[MODE-DIAG] Site Monkeys mode - no mode filter applied');
    } else {
      // If cross-mode allowed, include memories from truth-general mode (shared base)
      // Otherwise, strict mode isolation
      if (allowCrossMode) {
        console.log(`[MODE-DIAG] ✅ Cross-mode transfer ENABLED - including truth-general`);
        conditions.push(`(mode = $${paramIndex} OR mode = 'truth-general')`);
        params.push(mode);
        paramIndex++;
      } else {
        // All modes use exact matching (mode isolation)
        console.log(`[MODE-DIAG] Adding mode filter for: ${mode} (strict isolation)`);
        conditions.push(`mode = $${paramIndex}`);
        params.push(mode);
        paramIndex++;
      }
    }
  } else {
    console.log('[MODE-DIAG] includeAllModes = true - no mode filter');
  }

  // Category filtering
  if (categories && Array.isArray(categories) && categories.length > 0) {
    conditions.push(`category_name = ANY($${paramIndex}::text[])`);
    params.push(categories);
    paramIndex++;
  }

  // Build query with ordering by relevance_score (importance), then recency
  // Cast vector type to text for JSON parsing in Node.js
  const sql = `
    SELECT
      id,
      content,
      category_name,
      mode,
      embedding::text as embedding,
      fact_fingerprint,
      fingerprint_confidence,
      relevance_score,
      created_at,
      EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 as days_ago
    FROM persistent_memories
    WHERE ${conditions.join(' AND ')}
    ORDER BY relevance_score DESC, created_at DESC
    LIMIT $${paramIndex}
  `;
  params.push(limit);

  return { sql, params };
}

// ============================================
// HYBRID SCORING
// ============================================

/**
 * Calculate hybrid score combining semantic similarity, recency, and confidence
 * 
 * @param {object} memory - Memory with similarity score
 * @param {object} options - Scoring weights
 * @returns {number} Final hybrid score
 */
function calculateHybridScore(memory, options = {}) {
  const {
    recencyBoostDays = RETRIEVAL_CONFIG.recencyBoostDays,
    recencyBoostWeight = RETRIEVAL_CONFIG.recencyBoostWeight,
    confidenceWeight = RETRIEVAL_CONFIG.confidenceWeight
  } = options;

  let score = memory.similarity;

  // Recency boost (memories from last N days get a boost)
  if (memory.days_ago !== undefined && memory.days_ago < recencyBoostDays) {
    const recencyFactor = 1 - (memory.days_ago / recencyBoostDays);
    score += recencyFactor * recencyBoostWeight;
  }

  // Confidence boost (higher fingerprint confidence = small boost)
  if (memory.fingerprint_confidence) {
    score += memory.fingerprint_confidence * confidenceWeight;
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

// ============================================
// MAIN RETRIEVAL FUNCTION
// ============================================

/**
 * Retrieve semantically relevant memories for a query
 * 
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} query - User query text
 * @param {object} options - Retrieval options
 * @returns {Promise<{success: boolean, memories: array, telemetry: object}>}
 */
export async function retrieveSemanticMemories(pool, query, options = {}) {
  const startTime = Date.now();
  const {
    userId,
    mode: rawMode = 'truth-general',
    categories = null,
    topK = RETRIEVAL_CONFIG.defaultTopK,
    minSimilarity = RETRIEVAL_CONFIG.minSimilarity,
    includeAllModes = false,
    allowCrossMode = false
  } = options;

  // Normalize mode: convert underscore to hyphen for consistency
  const mode = rawMode.replace(/_/g, '-');

  // Initialize comprehensive telemetry
  const telemetry = {
    method: 'semantic',
    query_length: query.length,
    mode: mode,
    categories_filter: categories,
    include_history: options.includeHistory || false,
    filtered_superseded_count: 0,
    candidates_considered: 0,
    candidates_with_embeddings: 0,
    vectors_compared: 0,
    candidates_above_threshold: 0,
    results_injected: 0,
    injected_memory_ids: [],
    top_scores: [],
    token_budget: options.tokenBudget || 2000,
    tokens_used: 0,
    fallback_reason: null,
    latency_ms: 0,
    // Legacy telemetry (for compatibility)
    candidates_fetched: 0,
    results_returned: 0,
    top_similarity: 0,
    avg_similarity: 0,
    query_embedding_ms: 0,
    db_fetch_ms: 0,
    scoring_ms: 0,
    total_ms: 0
  };

  // Validate inputs
  if (!userId) {
    return {
      success: false,
      error: 'userId is required',
      memories: [],
      telemetry
    };
  }

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: 'Query is required',
      memories: [],
      telemetry
    };
  }

  try {
    // STEP 1: Generate query embedding
    const embedStart = Date.now();
    const queryEmbeddingResult = await generateEmbedding(query, {
      timeout: RETRIEVAL_CONFIG.embeddingTimeout
    });
    telemetry.query_embedding_ms = Date.now() - embedStart;

    if (!queryEmbeddingResult.success) {
      console.log(`[SEMANTIC RETRIEVAL] ⚠️ Query embedding failed: ${queryEmbeddingResult.error}`);
      return {
        success: false,
        error: `Could not embed query: ${queryEmbeddingResult.error}`,
        memories: [],
        telemetry
      };
    }

    const queryEmbedding = queryEmbeddingResult.embedding;

    // STEP 2: Prefilter candidates from DB
    const dbStart = Date.now();
    const { sql, params } = buildPrefilterQuery({
      userId,
      mode,
      categories,
      includeAllModes,
      allowCrossMode,
      limit: RETRIEVAL_CONFIG.maxCandidates
    });

    const { rows: candidates } = await pool.query(sql, params);
    telemetry.db_fetch_ms = Date.now() - dbStart;
    telemetry.candidates_fetched = candidates.length;
    telemetry.candidates_considered = candidates.length;

    // Count how many superseded facts were filtered out (if not including history)
    if (!options.includeHistory) {
      const { rows: [countRow] } = await pool.query(`
        SELECT COUNT(*) as superseded_count
        FROM persistent_memories
        WHERE user_id = $1
          AND mode = $2
          AND is_current = false
          AND embedding IS NOT NULL
          AND embedding_status = 'ready'
      `, [userId, mode]);
      telemetry.filtered_superseded_count = parseInt(countRow.superseded_count || 0);
    }

    if (candidates.length === 0) {
      console.log(`[SEMANTIC RETRIEVAL] No candidates found for user ${userId} in mode ${mode}`);
      telemetry.total_ms = Date.now() - startTime;
      telemetry.latency_ms = Date.now() - startTime;
      return {
        success: true,
        memories: [],
        telemetry
      };
    }

    // STEP 3: Score candidates with cosine similarity
    const scoringStart = Date.now();

    // Parse embeddings (handle both FLOAT4[] and vector(1536) types)
    const candidatesWithParsedEmbeddings = candidates.map(c => {
      let embedding = c.embedding;

      // If embedding is a string (from pgvector vector type), parse it
      if (typeof embedding === 'string') {
        try {
          // pgvector returns vectors as strings like "[0.1,0.2,0.3,...]"
          embedding = JSON.parse(embedding);
        } catch (error) {
          console.warn(`[SEMANTIC RETRIEVAL] Failed to parse embedding for memory ${c.id}: ${error.message}`);
          embedding = null;
        }
      }

      return { ...c, embedding };
    });

    // Filter to only those with valid embeddings
    const withEmbeddings = candidatesWithParsedEmbeddings.filter(c =>
      c.embedding && Array.isArray(c.embedding) && c.embedding.length > 0
    );
    telemetry.candidates_with_embeddings = withEmbeddings.length;
    telemetry.vectors_compared = withEmbeddings.length;

    // Calculate similarity scores
    const scored = withEmbeddings.map(candidate => ({
      ...candidate,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding)
    }));

    // Apply hybrid scoring
    const hybridScored = scored.map(memory => ({
      ...memory,
      hybrid_score: calculateHybridScore(memory)
    }));

    // Filter by minimum similarity and sort
    const filtered = hybridScored
      .filter(m => m.similarity >= minSimilarity)
      .sort((a, b) => b.hybrid_score - a.hybrid_score);

    telemetry.candidates_above_threshold = filtered.length;
    telemetry.scoring_ms = Date.now() - scoringStart;

    // STEP 4: Enforce token budget and take results that fit
    const tokenBudget = options.tokenBudget || 2000;
    let usedTokens = 0;
    const results = [];

    for (const memory of filtered) {
      // Estimate tokens for this memory (use token_count if available, else estimate)
      const memoryTokens = memory.token_count || Math.ceil((memory.content?.length || 0) / 4);

      // Check if adding this memory would exceed budget
      if (usedTokens + memoryTokens > tokenBudget) {
        console.log(`[SEMANTIC RETRIEVAL] Token budget reached: ${usedTokens}/${tokenBudget} tokens used`);
        break;  // Stop before exceeding budget
      }

      results.push(memory);
      usedTokens += memoryTokens;

      // Also respect topK limit
      if (results.length >= topK) {
        break;
      }
    }

    telemetry.results_returned = results.length;
    telemetry.results_injected = results.length;
    telemetry.tokens_used = usedTokens;  // Actual tokens used (within budget)

    // Collect memory IDs and scores
    telemetry.injected_memory_ids = results.map(r => r.id);
    telemetry.top_scores = results.slice(0, 10).map(r => parseFloat(r.similarity.toFixed(3)));

    // Calculate telemetry stats
    if (results.length > 0) {
      telemetry.top_similarity = results[0].similarity;
      telemetry.avg_similarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
    }

    telemetry.total_ms = Date.now() - startTime;
    telemetry.latency_ms = Date.now() - startTime;

    // Clean up results (remove embeddings from response to save bandwidth)
    const cleanResults = results.map(({ embedding, ...rest }) => ({
      ...rest,
      similarity: Math.round(rest.similarity * 1000) / 1000,
      hybrid_score: Math.round(rest.hybrid_score * 1000) / 1000
    }));

    console.log(`[SEMANTIC RETRIEVAL] ✅ Found ${results.length} memories for "${query.substring(0, 50)}..." (${telemetry.total_ms}ms)`);

    return {
      success: true,
      memories: cleanResults,
      telemetry
    };

  } catch (error) {
    telemetry.total_ms = Date.now() - startTime;
    console.error(`[SEMANTIC RETRIEVAL] ❌ Error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      memories: [],
      telemetry
    };
  }
}

// ============================================
// FINGERPRINT-BASED RETRIEVAL (FOR SUPERSESSION)
// ============================================

/**
 * Find memories with matching or similar fingerprint
 * Used for fact supersession detection
 * 
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} userId - User ID
 * @param {string} fingerprint - Fact fingerprint to match
 * @returns {Promise<{success: boolean, matches: array}>}
 */
export async function findByFingerprint(pool, userId, fingerprint) {
  try {
    const { rows } = await pool.query(`
      SELECT id, content, fact_fingerprint, fingerprint_confidence, created_at
      FROM persistent_memories
      WHERE user_id = $1 
        AND is_current = true
        AND fact_fingerprint = $2
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId, fingerprint]);

    return {
      success: true,
      matches: rows,
      count: rows.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      matches: []
    };
  }
}

// ============================================
// RETRIEVAL STATISTICS
// ============================================

/**
 * Get retrieval statistics for a user
 * Useful for debugging and optimization
 * 
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} userId - User ID
 * @returns {Promise<object>} Statistics object
 */
export async function getRetrievalStats(pool, userId) {
  try {
    const { rows: [stats] } = await pool.query(`
      SELECT
        COUNT(*) as total_memories,
        COUNT(*) FILTER (WHERE is_current = true) as current_memories,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
        COUNT(*) FILTER (WHERE embedding_status = 'ready') as ready_embeddings,
        COUNT(*) FILTER (WHERE embedding_status = 'pending') as pending_embeddings,
        COUNT(*) FILTER (WHERE embedding_status = 'failed') as failed_embeddings,
        COUNT(DISTINCT category_name) as unique_categories,
        COUNT(DISTINCT mode) as unique_modes,
        MIN(created_at) as oldest_memory,
        MAX(created_at) as newest_memory
      FROM persistent_memories
      WHERE user_id = $1
    `, [userId]);

    return {
      success: true,
      stats: {
        total_memories: parseInt(stats.total_memories),
        current_memories: parseInt(stats.current_memories),
        with_embeddings: parseInt(stats.with_embeddings),
        ready_embeddings: parseInt(stats.ready_embeddings),
        pending_embeddings: parseInt(stats.pending_embeddings),
        failed_embeddings: parseInt(stats.failed_embeddings),
        unique_categories: parseInt(stats.unique_categories),
        unique_modes: parseInt(stats.unique_modes),
        oldest_memory: stats.oldest_memory,
        newest_memory: stats.newest_memory,
        embedding_coverage: stats.total_memories > 0 
          ? Math.round(stats.with_embeddings / stats.total_memories * 100) + '%'
          : 'N/A'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export default {
  retrieveSemanticMemories,
  findByFingerprint,
  getRetrievalStats,
  config: RETRIEVAL_CONFIG
};
