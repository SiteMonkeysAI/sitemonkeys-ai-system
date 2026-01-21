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

/**
 * Apply ordinal-aware boost to memories for queries with ordinal indicators
 * FIX #555-T3: When query asks for "first" and content says "first", boost that memory
 * FIX #557-T3: Increased boost strength to 0.40 to overcome semantic similarity
 * This solves the semantic ranking issue where "first code" and "second code" are too similar
 *
 * @param {object[]} memories - Array of memory objects with similarity scores
 * @param {string} query - The user's query text
 * @returns {object[]} Memories with ordinal boost applied where appropriate
 */
function applyOrdinalBoost(memories, query) {
  // CRITICAL TRACE #560-T3: Log function entry
  console.log('[TRACE-T3] applyOrdinalBoost called');
  console.log('[TRACE-T3] Query:', query?.substring(0, 100));
  console.log('[TRACE-T3] Memories count:', memories?.length || 0);

  // Ordinal patterns to detect and match
  const ORDINAL_PATTERNS = {
    first: /\b(first|1st)\b/i,
    second: /\b(second|2nd)\b/i,
    third: /\b(third|3rd)\b/i,
    fourth: /\b(fourth|4th)\b/i,
    fifth: /\b(fifth|5th)\b/i,
    last: /\b(last|final)\b/i,
    previous: /\b(previous|prior|earlier)\b/i,
    next: /\b(next|following|upcoming)\b/i
  };

  // Check if query contains any ordinal indicators
  let queryOrdinal = null;
  for (const [ordinalName, pattern] of Object.entries(ORDINAL_PATTERNS)) {
    if (pattern.test(query)) {
      queryOrdinal = ordinalName;
      console.log(`[ORDINAL-BOOST] 🎯 Query contains ordinal: "${ordinalName}"`);
      console.log(`[TRACE-T3] Detected ordinal: "${ordinalName}"`);
      break;
    }
  }

  // If no ordinal in query, no boost needed
  if (!queryOrdinal) {
    console.log('[TRACE-T3] No ordinal detected in query, returning memories unchanged');
    return memories;
  }

  // FIX #557-T3: Increased from 0.25 to 0.40 to overcome high semantic similarity
  // When "first code" and "second code" have ~0.85 similarity, need strong boost to separate them
  const ORDINAL_BOOST = 0.40;
  const ORDINAL_PENALTY = -0.20; // Penalize memories with DIFFERENT ordinals (FIX #557-T3)
  let boostedCount = 0;
  let penalizedCount = 0;
  let nonMatchCount = 0;

  // Build list of OTHER ordinals (not the query ordinal) for penalty detection
  const otherOrdinals = Object.entries(ORDINAL_PATTERNS)
    .filter(([name, _]) => name !== queryOrdinal)
    .map(([_, pattern]) => pattern);

  const result = memories.map(memory => {
    const content = (memory.content || '').toLowerCase();
    const pattern = ORDINAL_PATTERNS[queryOrdinal];

    // Check if memory content contains the same ordinal
    if (pattern.test(content)) {
      boostedCount++;
      const originalScore = memory.similarity;
      const newSimilarity = Math.min(originalScore + ORDINAL_BOOST, 1.0);
      console.log(`[ORDINAL-BOOST] ✅ Memory ${memory.id}: "${queryOrdinal}" MATCH - boosting ${originalScore.toFixed(3)} → ${newSimilarity.toFixed(3)} (+${ORDINAL_BOOST})`);
      console.log(`[ORDINAL-BOOST]    Content preview: "${content.substring(0, 60)}..."`);
      return {
        ...memory,
        similarity: newSimilarity,
        ordinal_boosted: true,
        ordinal_matched: queryOrdinal
      };
    } else {
      // Check if memory contains a DIFFERENT ordinal (e.g., query asks "first" but content has "second")
      const hasDifferentOrdinal = otherOrdinals.some(otherPattern => otherPattern.test(content));

      if (hasDifferentOrdinal) {
        penalizedCount++;
        const originalScore = memory.similarity;
        const newSimilarity = Math.max(originalScore + ORDINAL_PENALTY, 0.0);
        console.log(`[ORDINAL-BOOST] ⬇️  Memory ${memory.id}: DIFFERENT ordinal detected - penalizing ${originalScore.toFixed(3)} → ${newSimilarity.toFixed(3)} (${ORDINAL_PENALTY})`);
        console.log(`[ORDINAL-BOOST]    Content preview: "${content.substring(0, 60)}..."`);
        return {
          ...memory,
          similarity: newSimilarity,
          ordinal_penalized: true,
          ordinal_mismatch: true
        };
      } else {
        nonMatchCount++;
        // Log non-matches for debugging ordinal detection issues
        if (nonMatchCount <= 3) {  // Only log first 3 non-matches to avoid spam
          console.log(`[ORDINAL-BOOST] ❌ Memory ${memory.id}: No ordinal in content - score stays ${memory.similarity.toFixed(3)}`);
          console.log(`[ORDINAL-BOOST]    Content preview: "${content.substring(0, 60)}..."`);
        }
      }
    }

    return memory;
  });

  if (boostedCount > 0 || penalizedCount > 0) {
    console.log(`[ORDINAL-BOOST] ⚡ Applied ordinal adjustments for "${queryOrdinal}":`);
    console.log(`[ORDINAL-BOOST]    ✅ Boosted: ${boostedCount} memories (+${ORDINAL_BOOST})`);
    console.log(`[ORDINAL-BOOST]    ⬇️  Penalized: ${penalizedCount} memories (${ORDINAL_PENALTY})`);
    console.log(`[ORDINAL-BOOST]    ➖ Neutral: ${nonMatchCount} memories (no ordinal in content)`);
  } else {
    console.log(`[ORDINAL-BOOST] ⚠️ Query has "${queryOrdinal}" but NO memories matched - possible detection issue`);
  }

  // CRITICAL TRACE #560-T3: Log all memory scores after boost
  console.log('[TRACE-T3] Memories after ordinal boost (top 5):');
  result.slice(0, 5).forEach((m, idx) => {
    console.log(`[TRACE-T3]   ${idx+1}. Memory ${m.id}: score=${m.similarity?.toFixed(3)}, boosted=${m.ordinal_boosted || false}, penalized=${m.ordinal_penalized || false}`);
    console.log(`[TRACE-T3]      Content: "${(m.content || '').substring(0, 80)}"`);
  });

  return result;
}

// ============================================
// QUERY EXPANSION (Issue #504)
// ============================================

/**
 * Expand query with synonyms for better semantic matching
 * CRITICAL FIX #504: Helps bridge the gap between casual queries and formal stored facts
 * CRITICAL FIX #562-T2: Detect memory recall queries that need special handling
 *
 * Examples:
 * - "What do I make?" → "What do I make salary income pay compensation earn"
 * - "Where do I live?" → "Where do I live location home residence address"
 *
 * @param {string} query - Original query
 * @returns {{expanded: string, isPersonal: boolean, isMemoryRecall: boolean}} Expanded query and query type flags
 */
function expandQuery(query) {
  // Normalize to string to prevent type confusion (arrays, objects, etc.)
  if (query == null) {
    return { expanded: '', isPersonal: false, isMemoryRecall: false };
  }
  if (Array.isArray(query)) {
    const first = query.find(v => typeof v === 'string') ?? query[0];
    query = typeof first === 'string' ? first : String(first);
  } else if (typeof query !== 'string') {
    query = String(query);
  }

  const queryLower = query.toLowerCase();

  // CRITICAL FIX #562-T2: Detect memory recall queries
  // These queries are asking "what did I tell you?" not "give me semantically similar info"
  // Examples: "What did I tell you to remember?", "What phrase did I ask you to remember?", "What do you remember about X?"
  const isMemoryRecall = /\b(what|recall|tell me)\b.*\b(did i|have i|i asked|i told|i said|you to).*\b(remember|store|save|told|asked|said|mention)\b/i.test(query) ||
    /\b(what|which).*\b(phrase|token|code|identifier|thing).*\b(remember|asked|told|said|stored)\b/i.test(query) ||
    /\b(what do you|what can you)\b.*\b(remember|recall|know)\b.*\b(about|that i|i told)\b/i.test(query);

  // Synonym expansions for common personal fact categories
  const expansions = {
    // Memory recall terms (FIX #557-T2: Handle "What did I ask you to remember?")
    'remember': ['asked', 'told', 'said', 'mentioned', 'phrase', 'token', 'code', 'identifier'],
    'asked': ['remember', 'told', 'said', 'mentioned', 'requested'],
    'phrase': ['token', 'code', 'identifier', 'remember', 'asked'],
    'token': ['phrase', 'code', 'identifier', 'remember', 'asked'],

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
  // EXPANDED for FIX #557-T2 to include explicit recall queries
  const personalPattern = /\b(my|i|me|our|we)\b.*\b(salary|income|pay|make|earn|live|work|name|allergy|meeting|job|title|home|location|cat|dog|pet|animal|called|remember|asked|told|phrase|token|code)\b/i;
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

  // CRITICAL FIX #562-T2: Log memory recall detection
  if (isMemoryRecall) {
    console.log(`[MEMORY-RECALL] 🎯 Memory recall query detected: "${query}"`);
    console.log(`[MEMORY-RECALL] This query asks "what did I tell you?" - will use lower similarity threshold and prioritize recent explicit storage`);
  }

  return { expanded, isPersonal, isMemoryRecall };
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
      user_id,
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

  // DIAGNOSTIC LOGGING #549: Log SQL params for user_id verification
  console.log(`[SQL-PARAMS] ════════════════════════════════════════`);
  console.log(`[SQL-PARAMS] userId (param $1): "${params[0]}"`);
  console.log(`[SQL-PARAMS] Total params: ${params.length}`);
  console.log(`[SQL-PARAMS] ════════════════════════════════════════`);

  return { sql, params };
}

// ============================================
// HYBRID SCORING
// ============================================

/**
 * Calculate hybrid score combining semantic similarity, recency, and confidence
 * CRITICAL FIX #562-T2: Add strong recency boost for memory recall queries
 *
 * @param {object} memory - Memory with similarity score
 * @param {object} options - Scoring weights
 * @returns {number} Final hybrid score
 */
function calculateHybridScore(memory, options = {}) {
  const {
    recencyBoostDays = RETRIEVAL_CONFIG.recencyBoostDays,
    recencyBoostWeight = RETRIEVAL_CONFIG.recencyBoostWeight,
    confidenceWeight = RETRIEVAL_CONFIG.confidenceWeight,
    isMemoryRecall = false  // CRITICAL FIX #562-T2
  } = options;

  let score = memory.similarity;

  // CRITICAL FIX #562-T2: Strong recency boost for memory recall queries
  // When user asks "What did I tell you to remember?", prioritize very recent memories
  if (isMemoryRecall && memory.days_ago !== undefined) {
    if (memory.days_ago < 0.01) {  // Last ~15 minutes
      score += 0.50;  // Massive boost for very recent memories
      console.log(`[MEMORY-RECALL] Memory ${memory.id}: Very recent (${(memory.days_ago * 24 * 60).toFixed(1)} min ago) - boosting by +0.50`);
    } else if (memory.days_ago < 0.1) {  // Last ~2.4 hours
      score += 0.35;  // Strong boost for recent memories
      console.log(`[MEMORY-RECALL] Memory ${memory.id}: Recent (${(memory.days_ago * 24).toFixed(1)} hrs ago) - boosting by +0.35`);
    } else if (memory.days_ago < 1) {  // Last day
      score += 0.20;  // Moderate boost for today's memories
      console.log(`[MEMORY-RECALL] Memory ${memory.id}: Today (${memory.days_ago.toFixed(2)} days ago) - boosting by +0.20`);
    }
  } else {
    // Standard recency boost for non-recall queries
    if (memory.days_ago !== undefined && memory.days_ago < recencyBoostDays) {
      const recencyFactor = 1 - (memory.days_ago / recencyBoostDays);
      score += recencyFactor * recencyBoostWeight;
    }
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
 * @param {string|Array|any} query - User query text (may be user-controlled)
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

  // Normalize query to a single string to prevent type confusion
  let normalizedQuery = query;
  if (normalizedQuery == null) {
    normalizedQuery = '';
  } else if (Array.isArray(normalizedQuery)) {
    const first = normalizedQuery.find(v => typeof v === 'string') ?? normalizedQuery[0];
    normalizedQuery = typeof first === 'string' ? first : String(first);
  } else if (typeof normalizedQuery !== 'string') {
    normalizedQuery = String(normalizedQuery);
  }

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

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL DIAGNOSTIC LOGGING #549, #553: Track userId through retrieval
  // ═══════════════════════════════════════════════════════════════
  console.log(`[RETRIEVAL-ENTRY] ════════════════════════════════════════`);
  console.log(`[RETRIEVAL-ENTRY] userId from options: "${userId}"`);
  console.log(`[RETRIEVAL-ENTRY] userId type: ${typeof userId}`);
  console.log(`[RETRIEVAL-ENTRY] userId length: ${userId?.length || 0}`);
  console.log(`[RETRIEVAL-ENTRY] mode: ${mode}`);
  console.log(`[RETRIEVAL-ENTRY] query: "${normalizedQuery.substring(0, 50)}..."`);
  console.log(`[RETRIEVAL-ENTRY] ════════════════════════════════════════`);
  // ═══════════════════════════════════════════════════════════════

  // Validate inputs
  // FIX #553: Enhanced validation to catch empty strings and whitespace-only userIds
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    console.error(`[RETRIEVAL-ENTRY] ❌ REJECTED: userId is invalid`);
    console.error(`[RETRIEVAL-ENTRY] Received userId:`, userId);
    console.error(`[RETRIEVAL-ENTRY] Type:`, typeof userId);
    console.error(`[SECURITY] This validation prevents cross-user memory leakage`);
    return {
      success: false,
      error: 'userId is required and must be a non-empty string',
      memories: [],
      telemetry
    };
  }

  if (!query || query.trim().length === 0) {
    console.error(`[RETRIEVAL-ENTRY] ❌ REJECTED: query is missing or empty`);
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
    const { expanded: expandedQuery, isPersonal, isMemoryRecall } = expandQuery(normalizedQuery);

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

    // CRITICAL FIX #562-T2: Use VERY low similarity threshold for memory recall queries
    // These queries are asking "what did I explicitly tell you?" not "find semantically similar content"
    // When user asks "What did I tell you to remember?", even if stored content is just "ZEBRA-ANCHOR-123",
    // we must return it because that's what they explicitly asked us to remember
    let effectiveMinSimilarity;
    if (isMemoryRecall) {
      effectiveMinSimilarity = 0.10; // Very low threshold - prioritize recent explicit memories
      console.log(`[MEMORY-RECALL] 🎯 Memory recall query - using ultra-low threshold: ${effectiveMinSimilarity}`);
      console.log(`[MEMORY-RECALL] Will prioritize recently stored memories and explicit storage requests`);
    } else if (isPersonal) {
      // CRITICAL FIX #504: Use lower similarity threshold for personal queries
      effectiveMinSimilarity = RETRIEVAL_CONFIG.minSimilarityPersonal;
      console.log(`[SEMANTIC RETRIEVAL] 🎯 Personal query detected - using lower threshold: ${effectiveMinSimilarity}`);
    } else {
      effectiveMinSimilarity = minSimilarity || RETRIEVAL_CONFIG.minSimilarity;
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

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL SECURITY FIX #549: Validate user_id isolation
    // Ensure NO cross-user memory leakage
    // ═══════════════════════════════════════════════════════════════
    console.log(`[USER-ISOLATION] ════════════════════════════════════════`);
    console.log(`[USER-ISOLATION] Requested userId: ${userId}`);
    console.log(`[USER-ISOLATION] Retrieved ${candidates.length} candidates`);

    // Check if any candidates have wrong user_id
    const wrongUserCandidates = candidates.filter(c => c.user_id !== userId);
    if (wrongUserCandidates.length > 0) {
      console.error(`[USER-ISOLATION] 🚨 CRITICAL SECURITY VIOLATION: Found ${wrongUserCandidates.length} memories from wrong users!`);
      console.error(`[USER-ISOLATION] Wrong user_ids:`, [...new Set(wrongUserCandidates.map(c => c.user_id))]);
      console.error(`[USER-ISOLATION] Expected userId: ${userId}`);
      console.error(`[USER-ISOLATION] SQL params:`, params);

      // Filter out wrong-user memories (safety check - should never happen)
      const beforeCount = candidates.length;
      const filteredCandidates = candidates.filter(c => c.user_id === userId);
      console.error(`[USER-ISOLATION] ⚠️ Filtered ${beforeCount - filteredCandidates.length} cross-user memories`);

      // Replace candidates array with filtered version
      candidates.length = 0;
      candidates.push(...filteredCandidates);

      telemetry.candidates_fetched = candidates.length;
      telemetry.candidates_considered = candidates.length;
      telemetry.security_violation_detected = true;
      telemetry.wrong_user_memories_filtered = wrongUserCandidates.length;
    } else {
      console.log(`[USER-ISOLATION] ✅ All candidates belong to correct user`);
    }
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX #546: Check for recent memories without embeddings
    // Even when we have SOME candidates, we need to include recently-stored
    // memories that don't have embeddings yet (embedding generation lag)
    // ═══════════════════════════════════════════════════════════════
    let recentUnembeddedMemories = [];
    try {
      console.log('[EMBEDDING-LAG-CHECK] Checking for recent memories without embeddings...');

      const { rows: recentWithoutEmbeddings } = await pool.query(`
        SELECT COUNT(*) as count
        FROM persistent_memories
        WHERE user_id = $1
          AND created_at > NOW() - INTERVAL '2 minutes'
          AND (embedding IS NULL OR embedding_status != 'ready')
          AND (is_current = true OR is_current IS NULL)
      `, [userId]);

      const hasRecentUnembedded = parseInt(recentWithoutEmbeddings[0]?.count || 0) > 0;

      if (hasRecentUnembedded) {
        console.log(`[EMBEDDING-LAG-CHECK] ✅ Found ${recentWithoutEmbeddings[0].count} recent memories without embeddings - including in search`);

        // Build query for recent unembedded memories
        let recentQuery = `
          SELECT
            id,
            user_id,
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
            AND created_at > NOW() - INTERVAL '2 minutes'
            AND (embedding IS NULL OR embedding_status != 'ready')
        `;

        const recentParams = [userId];
        let paramIdx = 2;

        // Apply same mode filter as main query
        if (mode !== 'site-monkeys' && !includeAllModes) {
          if (allowCrossMode) {
            recentQuery += ` AND (mode = $${paramIdx} OR mode = 'truth-general')`;
            recentParams.push(mode);
            paramIdx++;
          } else {
            recentQuery += ` AND mode = $${paramIdx}`;
            recentParams.push(mode);
            paramIdx++;
          }
        }

        recentQuery += ` ORDER BY created_at DESC LIMIT 20`;

        const { rows: recentRows } = await pool.query(recentQuery, recentParams);

        // SECURITY FIX #549: Validate user_id isolation for recent memories
        const wrongUserRecent = recentRows.filter(r => r.user_id !== userId);
        if (wrongUserRecent.length > 0) {
          console.error(`[USER-ISOLATION] 🚨 SECURITY: Found ${wrongUserRecent.length} wrong-user recent memories!`);
          console.error(`[USER-ISOLATION] Expected: ${userId}, Found: ${[...new Set(wrongUserRecent.map(r => r.user_id))]}`);
          recentUnembeddedMemories = recentRows.filter(r => r.user_id === userId);
        } else {
          recentUnembeddedMemories = recentRows;
        }

        console.log(`[EMBEDDING-LAG-CHECK] Retrieved ${recentUnembeddedMemories.length} recent unembedded memories`);
      }
    } catch (lagCheckError) {
      console.error(`[EMBEDDING-LAG-CHECK] ⚠️ Check failed: ${lagCheckError.message}`);
      // Continue without recent memories
    }

    if (candidates.length === 0 && recentUnembeddedMemories.length === 0) {
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
              user_id,
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
          // SECURITY FIX: Limit input length to prevent ReDoS
          const safeQuery = expandedQuery.slice(0, 500);
          const hasRememberExactly = /remember\s+(this\s+)?exactly/i.test(safeQuery);
          if (hasRememberExactly) {
            // Extract potential unique tokens (alphanumeric sequences)
            // SECURITY FIX: Constrain token-matching regex to prevent ReDoS
            // FIX #555-T2: Updated pattern to match 2+ segment tokens like ZEBRA-ANCHOR-123
            const uniqueTokens = safeQuery.match(/\b[A-Z0-9]{3,20}(?:-[A-Z0-9]{2,20})+\b/gi);
            if (uniqueTokens && uniqueTokens.length > 0) {
              console.log(`[EMBEDDING-FALLBACK] Matching unique tokens: ${uniqueTokens.join(', ')}`);
              const tokenFilters = uniqueTokens.map((_, i) => `content ILIKE $${paramIndex + i}`).join(' OR ');
              fallbackQuery += ` AND (${tokenFilters})`;
              fallbackParams.push(...uniqueTokens.map(t => `%${t}%`));
              paramIndex += uniqueTokens.length;
            } else {
              // Try matching the original user phrase from metadata
              fallbackQuery += ` AND (content ILIKE $${paramIndex} OR metadata->>'original_user_phrase' ILIKE $${paramIndex})`;
              fallbackParams.push(`%${normalizedQuery.substring(0, 50)}%`);
              paramIndex++;
            }
          }

          fallbackQuery += ` ORDER BY created_at DESC LIMIT 50`;

          const { rows: fallbackCandidates } = await pool.query(fallbackQuery, fallbackParams);

          // SECURITY FIX #549: Validate user_id isolation for fallback results
          const wrongUserFallback = fallbackCandidates.filter(f => f.user_id !== userId);
          if (wrongUserFallback.length > 0) {
            console.error(`[USER-ISOLATION] 🚨 SECURITY: Found ${wrongUserFallback.length} wrong-user fallback memories!`);
            console.error(`[USER-ISOLATION] Expected: ${userId}, Found: ${[...new Set(wrongUserFallback.map(f => f.user_id))]}`);
          }
          const validFallbackCandidates = fallbackCandidates.filter(f => f.user_id === userId);

          telemetry.fallback_used = true;
          telemetry.fallback_reason = 'embedding_missing';
          telemetry.semantic_candidates = 0;
          telemetry.fallback_candidates = validFallbackCandidates.length;

          console.log(`[EMBEDDING-FALLBACK] Retrieved ${validFallbackCandidates.length} candidates via fallback`);

          if (validFallbackCandidates.length > 0) {
            // Apply basic text similarity scoring
            const scoredFallback = validFallbackCandidates.map(candidate => {
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

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX #546: Score recent unembedded memories using text matching
    // This handles the embedding generation lag for just-stored memories
    // CRITICAL FIX #551: Enhanced scoring to detect exact tokens/identifiers
    // CRITICAL FIX #564-T2: Check for explicit storage requests first
    // ═══════════════════════════════════════════════════════════════
    const recentScoredMemories = recentUnembeddedMemories.map(memory => {
      const contentLower = (memory.content || '').toLowerCase();
      const queryLower = normalizedQuery.toLowerCase();

      // CRITICAL FIX #564-T2: Priority Strategy - Check for explicit storage request
      // When user asks "What did I tell you to remember?" and this memory was explicitly stored,
      // give it absolute priority regardless of semantic similarity
      if (isMemoryRecall) {
        try {
          const metadata = typeof memory.metadata === 'string'
            ? JSON.parse(memory.metadata)
            : memory.metadata;

          if (metadata?.explicit_storage_request === true) {
            console.log(`[EMBEDDING-LAG-SCORE] Memory ${memory.id}: EXPLICIT STORAGE REQUEST for memory recall - boosting to 0.99`);
            return {
              ...memory,
              similarity: 0.99, // Maximum priority for explicit recall
              from_recent_unembedded: true,
              embedding: null,
              match_reason: 'explicit_storage_recall',
              explicit_storage_request: true
            };
          }
        } catch (parseError) {
          console.warn(`[EMBEDDING-LAG-SCORE] Failed to parse metadata for memory ${memory.id}: ${parseError.message}`);
        }
      }

      // Strategy 1: Check for exact unique tokens (high-entropy alphanumeric patterns)
      // Extract potential tokens from query (patterns like ZEBRA-ANCHOR-123, ABC-123, etc.)
      const uniqueTokenPattern = /\b[A-Z0-9]{3,}(?:-[A-Z0-9]{2,})+\b/gi;
      const queryTokens = normalizedQuery.match(uniqueTokenPattern) || [];
      const contentTokens = (memory.content || '').match(uniqueTokenPattern) || [];

      // If query is asking about a token and content contains that exact token
      const hasExactTokenMatch = queryTokens.some(qt =>
        contentTokens.some(ct => ct.toUpperCase() === qt.toUpperCase())
      );

      if (hasExactTokenMatch) {
        console.log(`[EMBEDDING-LAG-SCORE] Memory ${memory.id}: EXACT TOKEN MATCH - boosting to 0.95`);
        return {
          ...memory,
          similarity: 0.95, // Very high score for exact token match
          from_recent_unembedded: true,
          embedding: null,
          match_reason: 'exact_token_match'
        };
      }

      // Strategy 2: Check for content-based exact substring match
      // If the query asks about something and the content contains those exact words
      const significantQueryTerms = normalizedQuery
        .toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 4 && !['what', 'where', 'when', 'which', 'remember', 'asked'].includes(t));

      if (significantQueryTerms.length > 0) {
        const exactMatches = significantQueryTerms.filter(term => contentLower.includes(term)).length;
        if (exactMatches > 0) {
          const exactMatchRatio = exactMatches / significantQueryTerms.length;
          if (exactMatchRatio >= 0.5) {
            const exactMatchScore = 0.70 + (exactMatchRatio * 0.20); // 0.70-0.90 range
            console.log(`[EMBEDDING-LAG-SCORE] Memory ${memory.id}: ${exactMatches}/${significantQueryTerms.length} exact term matches - score ${exactMatchScore.toFixed(3)}`);
            return {
              ...memory,
              similarity: exactMatchScore,
              from_recent_unembedded: true,
              embedding: null,
              match_reason: 'exact_term_match'
            };
          }
        }
      }

      // Strategy 3: Original text-based similarity scoring (fallback)
      const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 3);
      const matchedTerms = queryTerms.filter(term => contentLower.includes(term)).length;
      const textSimilarity = queryTerms.length > 0 ? matchedTerms / queryTerms.length : 0;

      // Boost recent memories slightly to prioritize fresh information
      const recencyBoost = 0.15; // 15% boost for very recent memories
      const finalSimilarity = Math.min(textSimilarity + recencyBoost, 1.0);

      console.log(`[EMBEDDING-LAG-SCORE] Memory ${memory.id}: text similarity ${textSimilarity.toFixed(3)} + recency boost ${recencyBoost} = ${finalSimilarity.toFixed(3)}`);

      return {
        ...memory,
        similarity: finalSimilarity,
        from_recent_unembedded: true,
        embedding: null,
        match_reason: 'text_similarity'
      };
    });

    // Merge scored semantic memories with recent unembedded memories
    const allScored = [...scored, ...recentScoredMemories];

    if (recentScoredMemories.length > 0) {
      console.log(`[EMBEDDING-LAG-FIX] ✅ Merged ${scored.length} semantic candidates + ${recentScoredMemories.length} recent unembedded = ${allScored.length} total`);
      telemetry.recent_unembedded_included = recentScoredMemories.length;
    }

    // CRITICAL FIX #511: Apply safety-critical boost BEFORE hybrid scoring
    // This ensures allergies and critical health info rise to the top
    const safetyBoosted = applySafetyCriticalBoost(allScored);

    // FIX #555-T3: Apply ordinal-aware boost for queries like "first code" vs "second code"
    // When query contains ordinal indicators, boost memories with matching ordinals
    const ordinalBoosted = applyOrdinalBoost(safetyBoosted, normalizedQuery);

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL FIX #564-T2: Apply explicit memory recall boost
    // When user asks "What did I tell you to remember?", prioritize memories
    // where metadata.explicit_storage_request === true
    // This is NOT a similarity problem - it's a command-intent matching problem
    // ═══════════════════════════════════════════════════════════════
    const explicitMemoryBoosted = ordinalBoosted.map(memory => {
      // Check if this is a memory recall query AND memory has explicit storage flag
      if (isMemoryRecall) {
        try {
          const metadata = typeof memory.metadata === 'string'
            ? JSON.parse(memory.metadata)
            : memory.metadata;

          if (metadata?.explicit_storage_request === true) {
            const originalScore = memory.similarity;
            const boostedScore = Math.min(originalScore + 0.70, 1.0); // Massive boost for explicit storage
            console.log(`[EXPLICIT-RECALL] Memory ${memory.id}: explicit_storage_request=true - boosting ${originalScore.toFixed(3)} → ${boostedScore.toFixed(3)} (+0.70)`);
            console.log(`[EXPLICIT-RECALL]    Content preview: "${(memory.content || '').substring(0, 60)}"`);
            return {
              ...memory,
              similarity: boostedScore,
              explicit_recall_boosted: true,
              explicit_storage_request: true
            };
          }
        } catch (parseError) {
          // Metadata parse failed, continue without boost
          console.warn(`[EXPLICIT-RECALL] Failed to parse metadata for memory ${memory.id}: ${parseError.message}`);
        }
      }
      return memory;
    });

    console.log('[SEMANTIC RETRIEVAL] Applied scoring pipeline: semantic → safety → ordinal → explicit-recall');
    // ═══════════════════════════════════════════════════════════════

    // Apply hybrid scoring
    // CRITICAL FIX #562-T2: Pass isMemoryRecall flag to enable strong recency boost
    const hybridScored = explicitMemoryBoosted.map(memory => ({
      ...memory,
      hybrid_score: calculateHybridScore(memory, { isMemoryRecall })
    }));

    // Filter by minimum similarity and sort
    // CRITICAL FIX #504: Use effectiveMinSimilarity (lower for personal queries)
    const filtered = hybridScored
      .filter(m => m.similarity >= effectiveMinSimilarity)
      .sort((a, b) => b.hybrid_score - a.hybrid_score);

    // CRITICAL TRACE #560-T3: Log final ranking after all boosts
    console.log('[TRACE-T3] Final ranked memories (top 5) after hybrid scoring:');
    filtered.slice(0, 5).forEach((m, idx) => {
      console.log(`[TRACE-T3]   ${idx+1}. Memory ${m.id}: hybrid_score=${m.hybrid_score?.toFixed(3)}, similarity=${m.similarity?.toFixed(3)}`);
      console.log(`[TRACE-T3]      ordinal_boosted=${m.ordinal_boosted || false}, ordinal_penalized=${m.ordinal_penalized || false}`);
      console.log(`[TRACE-T3]      explicit_recall_boosted=${m.explicit_recall_boosted || false}, explicit_storage=${m.explicit_storage_request || false}`);
      console.log(`[TRACE-T3]      Content: "${(m.content || '').substring(0, 80)}"`);
    });

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
      SELECT id, user_id, content, fact_fingerprint, fingerprint_confidence, created_at
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
