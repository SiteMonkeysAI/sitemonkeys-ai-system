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
  minSimilarity: 0.25,          // Minimum similarity threshold (default)
  minSimilarityPersonal: 0.18,  // Lower threshold for personal fact queries (Issue #504, #533-B3)
  recencyBoostDays: 7,          // Boost memories from last N days
  recencyBoostWeight: 0.1,      // How much to boost recent memories
  confidenceWeight: 0.05,       // Weight for fingerprint confidence
  embeddingTimeout: 5000        // Timeout for query embedding
};

// ============================================
// SAFETY-CRITICAL DOMAIN DETECTION (Issue #511)
// ============================================

/**
 * Domain patterns that indicate safety-critical intersections
 * When queries involve food/dining/restaurants, we MUST also check health_wellness
 * for allergies and dietary restrictions.
 *
 * DOCTRINE COMPLIANCE:
 * - Memory & Intelligence Doctrine §11.6: "Claiming ignorance when memory exists is catastrophic"
 * - Memory & Intelligence Doctrine §11.9: "Memory loaded because it materially affects reasoning"
 */
const SAFETY_CRITICAL_DOMAINS = {
  food_dining: {
    patterns: [
      /\b(restaurant|dining|food|meal|eat|eating|dish|menu|cuisine|chef|cook|recipe)\b/i,
      /\b(recommendation|suggest|recommend|where.*to.*eat|what.*to.*eat|keep.*in.*mind.*restaurant)\b/i,
      /\b(lunch|dinner|breakfast|brunch|snack)\b/i,
      /\b(italian|chinese|mexican|thai|indian|japanese|french)(\s+food|\s+restaurant|\s+cuisine)?\b/i
    ],
    safetyCriticalCategories: ['health_wellness'],
    reason: 'food_decisions_intersect_allergies_dietary_restrictions'
  },
  physical_activity: {
    patterns: [
      /\b(activity|activities|exercise|workout|gym|sport|sports|physical|hike|hiking|climb|climbing)\b/i,
      /\b(travel|trip|vacation|adventure|outdoor)\b/i,
      /\b(run|running|swim|swimming|bike|biking|walk|walking)\b/i
    ],
    safetyCriticalCategories: ['health_wellness'],
    reason: 'physical_activities_intersect_health_conditions'
  },
  medical_health: {
    patterns: [
      /\b(medical|health|doctor|medication|symptom|condition|treatment|therapy)\b/i,
      /\b(appointment|hospital|clinic|prescription)\b/i
    ],
    safetyCriticalCategories: ['health_wellness'],
    reason: 'medical_queries_require_health_context'
  }
};

/**
 * Detect if query involves safety-critical domains and return categories that MUST be checked
 * This is Stage 1 deterministic detection (zero tokens)
 *
 * @param {string} query - User query text
 * @returns {string[]} Array of safety-critical category names to inject
 */
function detectSafetyCriticalCategories(query) {
  const safetyCat = new Set();

  for (const [domainName, config] of Object.entries(SAFETY_CRITICAL_DOMAINS)) {
    const matches = config.patterns.some(pattern => pattern.test(query));
    if (matches) {
      config.safetyCriticalCategories.forEach(cat => safetyCat.add(cat));
      console.log(`[SAFETY-CRITICAL] 🚨 Domain "${domainName}" detected → injecting category: [${config.safetyCriticalCategories.join(', ')}]`);
      console.log(`[SAFETY-CRITICAL]    Reason: ${config.reason}`);
    }
  }

  return [...safetyCat];
}

/**
 * Apply safety boost to memories containing allergies, medications, or critical health info
 * This ensures safety-critical memories rise to the top even if semantic similarity is lower
 *
 * @param {object[]} memories - Array of memory objects with similarity scores
 * @returns {object[]} Memories with safety boost applied
 */
function applySafetyCriticalBoost(memories) {
  const SAFETY_MARKERS = {
    allergy: {
      patterns: [/\b(allerg(y|ic|ies))\b/i, /\b(cannot eat|can't eat|avoid eating)\b/i, /\b(intolerant|intolerance)\b/i],
      boost: 0.25
    },
    medication: {
      patterns: [/\b(medication|medicine|prescription|insulin|inhaler)\b/i, /\b(take daily|must take)\b/i],
      boost: 0.20
    },
    condition: {
      patterns: [/\b(diabetes|asthma|heart condition|chronic)\b/i, /\b(disability|limitation|restricted)\b/i],
      boost: 0.15
    }
  };

  let boostedCount = 0;

  const result = memories.map(memory => {
    if (memory.category_name !== 'health_wellness') {
      return memory;
    }

    const content = memory.content || '';
    let maxBoost = 0;
    const markers = [];

    for (const [markerName, config] of Object.entries(SAFETY_MARKERS)) {
      if (config.patterns.some(p => p.test(content))) {
        markers.push(markerName);
        maxBoost = Math.max(maxBoost, config.boost);
      }
    }

    if (maxBoost > 0) {
      boostedCount++;
      console.log(`[SAFETY-CRITICAL] 🛡️ Boosting memory ID ${memory.id} by +${maxBoost} (markers: ${markers.join(', ')})`);
      return {
        ...memory,
        similarity: Math.min(memory.similarity + maxBoost, 1.0),
        safety_boosted: true,
        safety_markers: markers
      };
    }

    return memory;
  });

  if (boostedCount > 0) {
    console.log(`[SAFETY-CRITICAL] ⚡ Applied safety boost to ${boostedCount} health_wellness memories`);
  }

  return result;
}

// ============================================
// QUERY EXPANSION (Issue #504)
// ============================================

/**
 * Expand query with synonyms for better semantic matching
 * CRITICAL FIX #504: Helps bridge the gap between casual queries and formal stored facts
 *
 * Examples:
 * - "What do I make?" → "What do I make salary income pay compensation earn"
 * - "Where do I live?" → "Where do I live location home residence address"
 *
 * @param {string} query - Original query
 * @returns {{expanded: string, isPersonal: boolean}} Expanded query and whether it's a personal fact query
 */
function expandQuery(query) {
  const queryLower = query.toLowerCase();

  // Synonym expansions for common personal fact categories
  const expansions = {
    // Financial/Income terms
    'salary': ['income', 'pay', 'compensation', 'earnings', 'wage', 'make', 'earn'],
    'make': ['salary', 'income', 'pay', 'earn', 'compensation', 'paid', 'earning'],
    'earn': ['salary', 'income', 'pay', 'make', 'compensation', 'earning'],
    'paid': ['salary', 'income', 'pay', 'make', 'compensation', 'earn'],
    'compensation': ['salary', 'income', 'pay', 'make', 'earn'],
    'income': ['salary', 'pay', 'compensation', 'earnings', 'make', 'earn'],
    'situation': ['salary', 'income', 'pay', 'status', 'compensation'],
    'pay': ['salary', 'income', 'compensation', 'make', 'earn', 'earning'],

    // Location terms
    'live': ['location', 'home', 'residence', 'address', 'city', 'based', 'reside'],
    'location': ['live', 'home', 'residence', 'address', 'based', 'city'],
    'home': ['live', 'location', 'residence', 'address', 'based'],
    'address': ['live', 'location', 'home', 'residence'],

    // Job/Work terms
    'job': ['work', 'career', 'role', 'position', 'title', 'occupation', 'employed'],
    'work': ['job', 'career', 'role', 'position', 'title', 'employed', 'company', 'employer'],
    'title': ['job', 'position', 'role', 'work', 'career'],
    'position': ['job', 'title', 'role', 'work', 'career'],
    'employment': ['work', 'job', 'company', 'employer', 'workplace', 'office'],
    'place': ['location', 'city', 'address', 'where', 'office', 'workplace'],
    'company': ['employer', 'work', 'job', 'workplace', 'organization'],
    'employer': ['company', 'work', 'job', 'workplace', 'organization'],

    // Health/Medical terms
    'allergy': ['allergic', 'intolerant', 'reaction', 'sensitive'],
    'allergic': ['allergy', 'intolerant', 'reaction', 'sensitive'],

    // Meeting/Appointment terms
    'meeting': ['appointment', 'call', 'scheduled', 'rescheduled'],

    // Pet/Animal terms (FIX #533-B3)
    'cat': ['pet', 'animal', 'feline', 'kitty', 'kitten'],
    'dog': ['pet', 'animal', 'canine', 'puppy'],
    'pet': ['cat', 'dog', 'animal', 'bird', 'fish'],
    'animal': ['pet', 'cat', 'dog'],

    // Name/Identity terms (FIX #533-B3)
    'name': ['called', 'named', 'title'],
    'called': ['name', 'named']
  };

  // Check if this is a personal fact query (uses first-person pronouns + personal terms)
  // EXPANDED for FIX #533-B3 to include pet and name queries
  const personalPattern = /\b(my|i|me|our|we)\b.*\b(salary|income|pay|make|earn|live|work|name|allergy|meeting|job|title|home|location|cat|dog|pet|animal|called)\b/i;
  const isPersonal = personalPattern.test(query);

  let expanded = query;
  let addedSynonyms = [];

  // Find matching terms and add their synonyms
  for (const [term, synonyms] of Object.entries(expansions)) {
    if (queryLower.includes(term)) {
      // Add top 3-4 synonyms to improve matching without overwhelming the query
      const synToAdd = synonyms.slice(0, 4).filter(s => !queryLower.includes(s));
      addedSynonyms.push(...synToAdd);
    }
  }

  // Append unique synonyms to the query
  if (addedSynonyms.length > 0) {
    const uniqueSynonyms = [...new Set(addedSynonyms)];
    expanded = `${query} ${uniqueSynonyms.join(' ')}`;
    console.log(`[QUERY-EXPANSION] Original: "${query}"`);
    console.log(`[QUERY-EXPANSION] Expanded: "${expanded}"`);
    console.log(`[QUERY-EXPANSION] Added synonyms: [${uniqueSynonyms.join(', ')}]`);
  }

  return { expanded, isPersonal };
}

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
    fallback_used: false,  // #536: Track when embedding-lag fallback is used
    fallback_candidates: 0,  // #536: Count of candidates from fallback
    semantic_candidates: 0,  // #536: Count of candidates from semantic search
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
    // STEP 0: Detect safety-critical domain intersections (Issue #511)
    const safetyCriticalCategories = detectSafetyCriticalCategories(query);

    // STEP 0.25: Merge safety-critical categories with requested categories
    // IMPORTANT: When categories=null (search all), keep it null to search all categories
    // The safety boost will ensure critical memories rise to top even with lower similarity
    let effectiveCategories = categories;
    if (safetyCriticalCategories.length > 0) {
      if (categories && Array.isArray(categories) && categories.length > 0) {
        // Merge with existing categories
        effectiveCategories = [...new Set([...categories, ...safetyCriticalCategories])];
        console.log(`[SAFETY-CRITICAL] 📋 Merged categories: ${JSON.stringify(categories)} + ${JSON.stringify(safetyCriticalCategories)} → ${JSON.stringify(effectiveCategories)}`);
      } else {
        // No categories specified - keep searching all categories but log detection
        console.log(`[SAFETY-CRITICAL] 🔍 Safety-critical domains detected: ${JSON.stringify(safetyCriticalCategories)}`);
        console.log(`[SAFETY-CRITICAL] 📋 Searching ALL categories but will boost safety-critical memories`);
        // Keep effectiveCategories = null to search all
      }
    }

    // STEP 0.5: Expand query with synonyms for better matching (Issue #504)
    const { expanded: expandedQuery, isPersonal } = expandQuery(query);

    // STEP 1: Generate query embedding (use expanded query for better semantic matching)
    const embedStart = Date.now();
    const queryEmbeddingResult = await generateEmbedding(expandedQuery, {
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

    // CRITICAL FIX #504: Use lower similarity threshold for personal queries
    const effectiveMinSimilarity = isPersonal
      ? RETRIEVAL_CONFIG.minSimilarityPersonal
      : (minSimilarity || RETRIEVAL_CONFIG.minSimilarity);

    if (isPersonal) {
      console.log(`[SEMANTIC RETRIEVAL] 🎯 Personal query detected - using lower threshold: ${effectiveMinSimilarity}`);
    }

    // STEP 2: Prefilter candidates from DB (using effectiveCategories with safety injection)
    const dbStart = Date.now();
    const { sql, params } = buildPrefilterQuery({
      userId,
      mode,
      categories: effectiveCategories, // Use merged categories
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

      // ═══════════════════════════════════════════════════════════════
      // CRITICAL FIX #536: EMBEDDING-LAG FALLBACK
      // When semantic returns 0, check if recent memories exist WITHOUT embeddings
      // This handles the async embedding generation lag on immediate recall
      // ═══════════════════════════════════════════════════════════════
      try {
        console.log('[EMBEDDING-FALLBACK] Checking for recent memories without embeddings...');

        // Check for recent memories (last 5 minutes) without embeddings
        const { rows: recentWithoutEmbeddings } = await pool.query(`
          SELECT COUNT(*) as count
          FROM persistent_memories
          WHERE user_id = $1
            AND created_at > NOW() - INTERVAL '5 minutes'
            AND (embedding IS NULL OR embedding_status != 'ready')
            AND (is_current = true OR is_current IS NULL)
        `, [userId]);

        const hasRecentUnembedded = parseInt(recentWithoutEmbeddings[0]?.count || 0) > 0;

        if (hasRecentUnembedded) {
          console.log(`[EMBEDDING-FALLBACK] ✅ Found ${recentWithoutEmbeddings[0].count} recent memories without embeddings - using fallback retrieval`);

          // Run bounded fallback retrieval: recent memories + basic text matching
          let fallbackQuery = `
            SELECT
              id,
              content,
              category_name,
              mode,
              NULL as embedding,
              fact_fingerprint,
              fingerprint_confidence,
              relevance_score,
              created_at,
              EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 as days_ago,
              metadata
            FROM persistent_memories
            WHERE user_id = $1
              AND (is_current = true OR is_current IS NULL)
              AND created_at > NOW() - INTERVAL '5 minutes'
          `;

          const fallbackParams = [userId];
          let paramIndex = 2;

          // Apply mode filter if not site-monkeys
          if (mode !== 'site-monkeys' && !includeAllModes) {
            if (allowCrossMode) {
              fallbackQuery += ` AND (mode = $${paramIndex} OR mode = 'truth-general')`;
              fallbackParams.push(mode);
              paramIndex++;
            } else {
              fallbackQuery += ` AND mode = $${paramIndex}`;
              fallbackParams.push(mode);
              paramIndex++;
            }
          }

          // Apply category filter if specified
          if (effectiveCategories && Array.isArray(effectiveCategories) && effectiveCategories.length > 0) {
            fallbackQuery += ` AND category_name = ANY($${paramIndex}::text[])`;
            fallbackParams.push(effectiveCategories);
            paramIndex++;
          }

          // For "remember exactly" queries, try to match unique phrases
          const hasRememberExactly = /remember\s+(this\s+)?exactly/i.test(expandedQuery);
          if (hasRememberExactly) {
            // Extract potential unique tokens (alphanumeric sequences)
            const uniqueTokens = expandedQuery.match(/[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+|[A-Z]{4,}-[0-9]+/gi);
            if (uniqueTokens && uniqueTokens.length > 0) {
              console.log(`[EMBEDDING-FALLBACK] Matching unique tokens: ${uniqueTokens.join(', ')}`);
              const tokenFilters = uniqueTokens.map((_, i) => `content ILIKE $${paramIndex + i}`).join(' OR ');
              fallbackQuery += ` AND (${tokenFilters})`;
              fallbackParams.push(...uniqueTokens.map(t => `%${t}%`));
              paramIndex += uniqueTokens.length;
            } else {
              // Try matching the original user phrase from metadata
              fallbackQuery += ` AND (content ILIKE $${paramIndex} OR metadata->>'original_user_phrase' ILIKE $${paramIndex})`;
              fallbackParams.push(`%${query.substring(0, 50)}%`);
              paramIndex++;
            }
          }

          fallbackQuery += ` ORDER BY created_at DESC LIMIT 50`;

          const { rows: fallbackCandidates } = await pool.query(fallbackQuery, fallbackParams);

          telemetry.fallback_used = true;
          telemetry.fallback_reason = 'embedding_missing';
          telemetry.semantic_candidates = 0;
          telemetry.fallback_candidates = fallbackCandidates.length;

          console.log(`[EMBEDDING-FALLBACK] Retrieved ${fallbackCandidates.length} candidates via fallback`);

          if (fallbackCandidates.length > 0) {
            // Apply basic text similarity scoring
            const scoredFallback = fallbackCandidates.map(candidate => {
              // Simple text-based similarity (contains query terms)
              const queryTerms = expandedQuery.toLowerCase().split(/\s+/).filter(t => t.length > 3);
              const contentLower = (candidate.content || '').toLowerCase();
              const matchedTerms = queryTerms.filter(term => contentLower.includes(term)).length;
              const textSimilarity = queryTerms.length > 0 ? matchedTerms / queryTerms.length : 0;

              return {
                ...candidate,
                similarity: textSimilarity,
                hybrid_score: textSimilarity,
                fallback_matched: true
              };
            });

            // Filter by a lower threshold for fallback (0.1 for text matching)
            const filtered = scoredFallback
              .filter(m => m.similarity >= 0.1 || hasRememberExactly)  // Lower threshold for fallback
              .sort((a, b) => b.hybrid_score - a.hybrid_score)
              .slice(0, Math.min(topK, 5));  // Limit fallback to 5 results max

            telemetry.candidates_above_threshold = filtered.length;
            telemetry.results_returned = filtered.length;
            telemetry.results_injected = filtered.length;
            telemetry.injected_memory_ids = filtered.map(r => r.id);
            telemetry.top_scores = filtered.slice(0, 10).map(r => parseFloat(r.similarity.toFixed(3)));

            // Calculate tokens used
            let usedTokens = 0;
            const tokenBudget = options.tokenBudget || 2000;
            const results = [];
            for (const memory of filtered) {
              const memoryTokens = memory.token_count || Math.ceil((memory.content?.length || 0) / 4);
              if (usedTokens + memoryTokens > tokenBudget) break;
              results.push(memory);
              usedTokens += memoryTokens;
            }

            telemetry.tokens_used = usedTokens;

            if (results.length > 0) {
              telemetry.top_similarity = results[0].similarity;
              telemetry.avg_similarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
            }

            telemetry.total_ms = Date.now() - startTime;
            telemetry.latency_ms = Date.now() - startTime;

            const cleanResults = results.map(({ embedding, ...rest }) => ({
              ...rest,
              similarity: Math.round(rest.similarity * 1000) / 1000,
              hybrid_score: Math.round(rest.hybrid_score * 1000) / 1000
            }));

            console.log(`[EMBEDDING-FALLBACK] ✅ Returning ${results.length} memories via fallback (${telemetry.total_ms}ms)`);

            return {
              success: true,
              memories: cleanResults,
              telemetry
            };
          }
        }
      } catch (fallbackError) {
        console.error(`[EMBEDDING-FALLBACK] ⚠️ Fallback check failed: ${fallbackError.message}`);
        // Continue to return empty results
      }
      // ═══════════════════════════════════════════════════════════════

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
    telemetry.semantic_candidates = withEmbeddings.length;  // #536: Track semantic candidates for comparison with fallback

    // Calculate similarity scores
    const scored = withEmbeddings.map(candidate => ({
      ...candidate,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding)
    }));

    // CRITICAL FIX #511: Apply safety-critical boost BEFORE hybrid scoring
    // This ensures allergies and critical health info rise to the top
    const safetyBoosted = applySafetyCriticalBoost(scored);

    // Apply hybrid scoring
    const hybridScored = safetyBoosted.map(memory => ({
      ...memory,
      hybrid_score: calculateHybridScore(memory)
    }));

    // Filter by minimum similarity and sort
    // CRITICAL FIX #504: Use effectiveMinSimilarity (lower for personal queries)
    const filtered = hybridScored
      .filter(m => m.similarity >= effectiveMinSimilarity)
      .sort((a, b) => b.hybrid_score - a.hybrid_score);

    telemetry.candidates_above_threshold = filtered.length;
    telemetry.scoring_ms = Date.now() - scoringStart;

    // Log threshold impact for debugging
    if (filtered.length > 0) {
      const belowOldThreshold = filtered.filter(m => m.similarity < RETRIEVAL_CONFIG.minSimilarity).length;
      if (belowOldThreshold > 0 && isPersonal) {
        console.log(`[SEMANTIC RETRIEVAL] ✅ Lower threshold recovered ${belowOldThreshold} personal fact memories`);
      }
    }

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

    // Add safety-critical telemetry (Issue #511)
    telemetry.safety_critical_detected = safetyCriticalCategories.length > 0;
    telemetry.safety_categories_injected = safetyCriticalCategories;
    telemetry.safety_memories_boosted = results.filter(r => r.safety_boosted).length;

    // INNOVATION #7: Track semantic access to update importance scores
    // High-importance memories are those frequently semantically relevant to queries
    if (results.length > 0) {
      // Update importance scores for retrieved memories (non-blocking)
      const memoryIds = results.map(r => r.id);
      pool.query(`
        UPDATE persistent_memories
        SET
          usage_frequency = usage_frequency + 1,
          relevance_score = LEAST(relevance_score + 0.03, 1.0),
          last_accessed = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])
      `, [memoryIds])
        .then(() => {
          console.log(`[SEMANTIC-IMPORTANCE] Updated importance for ${memoryIds.length} semantically retrieved memories`);
        })
        .catch(err => {
          console.error(`[SEMANTIC-IMPORTANCE] ⚠️ Failed to update importance: ${err.message}`);
        });
    }

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
