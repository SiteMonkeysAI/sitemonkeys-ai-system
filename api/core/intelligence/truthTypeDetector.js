/**
 * truthTypeDetector.js
 * Phase 4: Dual Hierarchy Truth Validation
 * 
 * Purpose: Classify claims into VOLATILE / SEMI_STABLE / PERMANENT
 * Two-stage detection: deterministic patterns first (zero cost), AI classifier only if ambiguous
 * 
 * Location: /api/core/intelligence/truthTypeDetector.js
 */

// Truth type constants
export const TRUTH_TYPES = {
  VOLATILE: 'VOLATILE',       // TTL: 5 minutes
  SEMI_STABLE: 'SEMI_STABLE', // TTL: 24 hours
  PERMANENT: 'PERMANENT',     // TTL: 30 days
  DOCUMENT_REVIEW: 'DOCUMENT_REVIEW', // Document review/analysis - no external lookup
  AMBIGUOUS: 'AMBIGUOUS'      // Requires Stage 2 AI classification
};

// TTL values in milliseconds
export const TTL_CONFIG = {
  VOLATILE: 5 * 60 * 1000,           // 5 minutes
  SEMI_STABLE: 24 * 60 * 60 * 1000,  // 24 hours
  PERMANENT: 30 * 24 * 60 * 60 * 1000, // 30 days
  DOCUMENT_REVIEW: 0                   // No caching for document reviews
};

// Stage 1: Deterministic pattern markers (zero token cost)
const VOLATILE_PATTERNS = [
  /\b(current|latest|today|now|live|breaking|real-?time)\b/i,
  /\b(price|stock|market|trading|exchange rate)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(news|happening|update|situation)\b/i,
  /\bwhat('s| is) .* (right now|today|currently)\b/i,
  /\bhow much (is|does|are) .* (cost|worth)\b/i,
  /\b(venezuela|ukraine|russia|china|iran|israel|gaza|palestine|greenland|denmark|congress|senate|white house|attack|election|president|war|invasion|military|conflict|strike|bombing|sanctions|diplomatic|crisis|coup|protest|riot|trump|biden|harris|putin|netanyahu|xi jinping)\b/i
];

const SEMI_STABLE_PATTERNS = [
  /\b(who is the (current )?(ceo|president|chairman|director|head))\b/i,
  /\b(regulation|policy|law|statute|requirement|compliance)\b/i,
  /\b(tax rate|interest rate|fee|tariff)\b/i,
  /\b(fda|sec|irs|government) (approval|ruling|guidance)\b/i,
  /\b(product spec|specification|version)\b/i,
  /\b(hours|schedule|availability|open|closed)\b/i,
  /\bis .* (still|currently) (available|supported|active)\b/i
];

const PERMANENT_PATTERNS = [
  /\b(what is|define|definition of|meaning of)\b/i,
  /\b(history|historical|when was|when did)\b/i,
  /\b(theorem|principle|law of|theory of)\b/i,
  /\b(how does .* work|explain|describe)\b/i,
  /\b(math|mathematics|calculation|formula)\b/i,
  /\b(science|scientific|physics|chemistry|biology)\b/i,
  /\b(invented|discovered|founded|established|created)\b/i,
  /\b(capital of|located in|born in|died in)\b/i,

  // CRITICAL FIX (Issue #385, Bug 1.3): Simple arithmetic and factual questions
  // These should NEVER trigger uncertainty disclaimers
  /^what is \d+[\+\-\*\/\%]\d+/i,  // "what is 2+2", "what is 5*3"
  /^\d+[\+\-\*\/\%]\d+/,            // "2+2", "5*3"
  /^calculate \d+/i,                // "calculate 10*5"
  /\bsimple (math|arithmetic|calculation)\b/i,

  // Word definitions - language doesn't change
  /\bwhat does ['"]?\w+['"]? mean\b/i,
  /\bdefine ['"]?\w+['"]?\b/i,
  /\bdefinition of ['"]?\w+['"]?\b/i,
  /\bmeaning of ['"]?\w+['"]?\b/i,
  /\bwhat is the meaning of\b/i,
  /\bwhat does the word ['"]?\w+['"]? mean\b/i,

  // Stable procedural facts (cooking, crafts, basic skills)
  /\bhow (do|to) (i |you |we )?(boil|cook|make|bake|fry|roast|grill|steam|poach|blanch|sauté|simmer|braise)\b/i,
  /\bhow (do|to) (i |you |we )?(tie|fold|cut|slice|chop|dice|mince|grate|peel|core)\b/i,
  /\bhow (do|to) (i |you |we )?(write|spell|pronounce|say|read)\b/i,
  /\bhow (do|to) (i |you |we )?(clean|wash|dry|iron|sew|knit|crochet)\b/i,
  /\bhow (do|to) (i |you |we )?(build|fix|repair|assemble|install)\b/i,
  /\bhow (do|to) (i |you |we )?(grow|plant|prune|water|harvest)\b/i,

  // Recipe and ingredient questions
  /\bwhat is (a |an |the )?(recipe|ingredient|step|process|method|technique)\b/i,
  /\bwhat (is|are) .* (made of|composed of|consist of)\b/i,

  // Mathematical/scientific constants and facts
  /\b(pythagorean|fibonacci|newton|einstein|archimedes|euclid)\b/i,
  /\b(speed of light|gravity|pi|golden ratio|periodic table)\b/i,

  // Unit conversions - mathematical constants
  /\bhow many (feet|inches|meters|miles|kilometers|pounds|ounces|grams|kilograms|liters|gallons|cups|tablespoons|teaspoons) (in|per|are in) (a |an |one )?\w+/i,

  // Simple math calculations
  /\bwhat('s| is| are)? \d+\s*[×x\*\+\-\/÷]\s*\d+/i,
  /\b\d+\s*[×x\*\+\-\/÷]\s*\d+\s*[=\?]/i,

  // File format definitions
  /\bwhat is (a |an )?(zip|pdf|jpg|png|gif|mp3|mp4|csv|json|xml|html|css|javascript) file\b/i
];

// High-stakes domains that trigger external lookup regardless of truth type
export const HIGH_STAKES_DOMAINS = {
  MEDICAL: [
    /\b(symptom|diagnosis|treatment|medication|dosage|drug|prescription)\b/i,
    /\bsymptoms? of\b/i,
    /\bside effects?\b/i,
    /\bdrug interactions?\b/i,
    /\b(disease|condition|syndrome|disorder)\b/i,
    /\b(interaction|contraindications?)\b/i,
    /\b(aspirin|ibuprofen|tylenol|advil|acetaminophen)\b/i,
    /\b(overdose|prognosis)\b/i,
    /\bcan i take .+ with\b/i,
    /\bmixing .+ (and|with)\b/i,
    /\bcombine .+ medication\b/i,
    /\bblood pressure\b/i,
    /\bdiabetes\b/i,
    /\bheart\b/i,
    /\bcholesterol\b/i,

    // Emergency symptoms
    /\b(chest (pain|hurts?)|arm (tingling|numb)|difficulty breathing|can't breathe|heart (racing|attack)|severe headache|numbness|dizz(y|iness)|faint|unconscious|bleeding heavily|allergic reaction|throat (closing|swelling))\b/i,

    // Life-threatening emergencies - cyanosis, respiratory distress
    /\b(lips|fingers|skin|face) (turning|are|is|look|looks) (blue|purple|gray|grey)\b/i,
    /\b(blue|purple) (lips|fingers|skin|face)\b/i,
    /\bcyanosis\b/i,
    /\b(trouble|difficulty|struggling|can't|cannot|hard to) breath(e|ing)\b/i,
    /\b(short|shortness) of breath\b/i,
    /\bchok(e|ing|ed)\b/i,
    /\b(severe|intense|crushing|sharp) (chest |abdominal |stomach |head )?(pain|ache)\b/i,
    /\bcan't (breathe|breath|stop bleeding)\b/i,
    /\b(passing|passed|blacking|blacked) out\b/i,
    /\bunconscious\b/i,
    /\bseizure\b/i,
    /\bstroke symptoms?\b/i,
    /\bheart attack\b/i,
    /\bsuicid(e|al)\b/i,
    /\boverdose\b/i,
    /\bsevere (bleeding|burn|allergic reaction)\b/i,
    /\banaphyla(xis|ctic)\b/i,

    // Substance combination safety
    /\bis it safe to (mix|combine|take|drink|use)\b/i,
    /\b(alcohol|drinking).*(with|and).*(medication|antibiotics|medicine|pills|drugs)\b/i,
    /\bcan i (take|mix|combine|drink).*(with|and|while)\b/i
  ],
  LEGAL: [
    /\b(legal|law|lawsuit|court|attorney|lawyer)\b/i,
    /\b(contract|liability|sue|regulation|statute)\b/i,
    /\b(rights|illegal|criminal|civil)\b/i
  ],
  FINANCIAL: [
    /\b(invest|investment|stock|bond|portfolio)\b/i,
    /\b(tax|irs|deduction|credit|filing)\b/i,
    /\b(loan|mortgage|interest rate|credit score)\b/i
  ],
  SAFETY: [
    /\b(recall|warning|hazard|danger|emergency)\b/i,
    /\b(toxic|poisonous|flammable|explosive)\b/i,
    /\b(safety|risk|accident|injury)\b/i
  ]
};

/**
 * Helper: Check if query is a stable procedural fact
 * These are "how to" questions about unchanging processes, not current events
 * @param {string} query - The user's query
 * @returns {boolean}
 */
function isStableProcedural(query) {
  const proceduralPatterns = /\bhow (do|to|can|should) (i |you |we )?(make|cook|boil|bake|tie|fold|write|create|build|fix|clean|wash|open|close|start|stop|grow|plant|cut|slice|chop|spell|pronounce)\b/i;
  const notCurrentEvents = !/\b(today|now|current|latest|recent|this morning|yesterday|right now)\b/i.test(query);
  return proceduralPatterns.test(query) && notCurrentEvents;
}

/**
 * STAGE 0: Document Detection (Highest Priority - Issue #380)
 * Detect document review requests to prevent misclassification as news/volatile content
 * @param {string} query - The user's query
 * @returns {object} { isDocument: boolean, confidence: number, reason: string }
 */
function isDocumentReviewRequest(query) {
  // Length threshold - documents are long
  const isLongInput = query.length > 10000; // 10K+ chars

  // Document review patterns
  const reviewPatterns = [
    /your thoughts/i,
    /please (be )?comprehensive/i,
    /review (this|the following)/i,
    /analyze (this|the following)/i,
    /what do you think (about|of)/i,
    /feedback on/i,
    /evaluate (this|the following)/i,
    /the following is/i,
    /here is (the|a|my)/i
  ];

  const hasReviewPattern = reviewPatterns.some(p => p.test(query.slice(0, 500)));

  // Document structure indicators
  const documentIndicators = [
    /SECTION \d+/i,
    /^#+\s/m,                    // Markdown headers
    /Table of Contents/i,
    /Version \d+\.\d+/i,
    /^[-•]\s/m,                  // Bullet points
    /file:/i,
    /implementation/i,
    /specification/i,
    /architecture/i
  ];

  const hasDocumentStructure = documentIndicators.filter(p => p.test(query)).length >= 2;

  return {
    isDocument: isLongInput && (hasReviewPattern || hasDocumentStructure),
    confidence: isLongInput ? 0.9 : 0.5,
    reason: isLongInput
      ? 'Long-form document detected'
      : 'Standard query'
  };
}

/**
 * Stage 1: Deterministic pattern matching (zero token cost)
 * @param {string} query - The user's query
 * @returns {object} { type: string, confidence: number, stage: 1, patterns_matched: array }
 */
export function detectByPattern(query) {
  if (!query || typeof query !== 'string') {
    return {
      type: TRUTH_TYPES.AMBIGUOUS,
      confidence: 0,
      stage: 1,
      patterns_matched: [],
      reason: 'Invalid or empty query'
    };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedPatterns = [];

  // STAGE 0: Document Detection (Highest Priority - Issue #380)
  const docCheck = isDocumentReviewRequest(query);
  if (docCheck.isDocument) {
    console.log('[truthTypeDetector] Document review detected, skipping news/volatile patterns');
    return {
      type: TRUTH_TYPES.DOCUMENT_REVIEW,
      confidence: docCheck.confidence,
      stage: 0,
      patterns_matched: [{ type: TRUTH_TYPES.DOCUMENT_REVIEW, pattern: 'document_review_request' }],
      conflict_detected: false,
      reason: docCheck.reason,
      skipExternalLookup: true,  // CRITICAL: Don't lookup for documents
      skipNewsPatterns: true      // CRITICAL: Don't match news patterns
    };
  }

  // Early detection: Stable procedural facts (high confidence)
  if (isStableProcedural(normalizedQuery)) {
    return {
      type: TRUTH_TYPES.PERMANENT,
      confidence: 0.9,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.PERMANENT, pattern: 'stable_procedural_fact' }],
      conflict_detected: false,
      reason: 'Stable procedural fact (unchanging process)'
    };
  }

  // Check PERMANENT patterns first (stable facts should win over volatility)
  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push({ type: TRUTH_TYPES.PERMANENT, pattern: pattern.toString() });
    }
  }

  // Check VOLATILE patterns
  for (const pattern of VOLATILE_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push({ type: TRUTH_TYPES.VOLATILE, pattern: pattern.toString() });
    }
  }

  // Check SEMI_STABLE patterns
  for (const pattern of SEMI_STABLE_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push({ type: TRUTH_TYPES.SEMI_STABLE, pattern: pattern.toString() });
    }
  }

  // No patterns matched = ambiguous
  if (matchedPatterns.length === 0) {
    return {
      type: TRUTH_TYPES.AMBIGUOUS,
      confidence: 0,
      stage: 1,
      patterns_matched: [],
      reason: 'No deterministic patterns matched'
    };
  }

  // Count matches by type
  const typeCounts = {
    [TRUTH_TYPES.VOLATILE]: 0,
    [TRUTH_TYPES.SEMI_STABLE]: 0,
    [TRUTH_TYPES.PERMANENT]: 0
  };

  for (const match of matchedPatterns) {
    typeCounts[match.type]++;
  }

  // Determine winning type
  // NEW PRIORITY: PERMANENT wins if no VOLATILE markers present
  // Only VOLATILE beats PERMANENT (when time-sensitivity is explicit)
  let winningType = TRUTH_TYPES.AMBIGUOUS;
  let maxCount = 0;

  if (typeCounts[TRUTH_TYPES.VOLATILE] > 0) {
    // Explicit time-sensitivity markers win
    winningType = TRUTH_TYPES.VOLATILE;
    maxCount = typeCounts[TRUTH_TYPES.VOLATILE];
  } else if (typeCounts[TRUTH_TYPES.PERMANENT] > 0) {
    // Stable facts win over semi-stable when no volatility present
    winningType = TRUTH_TYPES.PERMANENT;
    maxCount = typeCounts[TRUTH_TYPES.PERMANENT];
  } else if (typeCounts[TRUTH_TYPES.SEMI_STABLE] > 0) {
    winningType = TRUTH_TYPES.SEMI_STABLE;
    maxCount = typeCounts[TRUTH_TYPES.SEMI_STABLE];
  }

  // Check for conflicting types (multiple types matched)
  const typesMatched = Object.values(typeCounts).filter(c => c > 0).length;
  if (typesMatched > 1) {
    // Multiple types matched - VOLATILE wins over all, PERMANENT wins over SEMI_STABLE
    let conflictWinner = winningType;
    let conflictReason = 'Multiple truth types detected';

    if (typeCounts[TRUTH_TYPES.VOLATILE] > 0) {
      conflictWinner = TRUTH_TYPES.VOLATILE;
      conflictReason = 'Multiple truth types detected, VOLATILE markers take precedence';
    } else if (typeCounts[TRUTH_TYPES.PERMANENT] > 0) {
      conflictWinner = TRUTH_TYPES.PERMANENT;
      conflictReason = 'Multiple truth types detected, PERMANENT wins without VOLATILE markers';
    }

    return {
      type: conflictWinner,
      confidence: 0.6, // Lower confidence due to conflict
      stage: 1,
      patterns_matched: matchedPatterns,
      conflict_detected: true,
      reason: conflictReason
    };
  }

  // Clean single-type match
  const confidence = Math.min(0.95, 0.7 + (maxCount * 0.1));
  
  return {
    type: winningType,
    confidence: confidence,
    stage: 1,
    patterns_matched: matchedPatterns,
    conflict_detected: false,
    reason: `Matched ${maxCount} ${winningType} pattern(s)`
  };
}

/**
 * Detect if query falls into a high-stakes domain
 * @param {string} query - The user's query
 * @returns {object} { isHighStakes: boolean, domains: array }
 */
export function detectHighStakesDomain(query) {
  if (!query || typeof query !== 'string') {
    return { isHighStakes: false, domains: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedDomains = [];

  for (const [domain, patterns] of Object.entries(HIGH_STAKES_DOMAINS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery)) {
        matchedDomains.push(domain);
        break; // One match per domain is enough
      }
    }
  }

  return {
    isHighStakes: matchedDomains.length > 0,
    domains: matchedDomains
  };
}

/**
 * Stage 2: AI Classifier (only called if Stage 1 returns AMBIGUOUS)
 * Uses existing Confidence Engine (Innovation #14)
 * @param {string} query - The user's query
 * @param {object} _context - Additional context (mode, conversation history) (unused)
 * @returns {Promise<object>} { type: string, confidence: number, stage: 2, reasoning: string }
 */
export async function classifyAmbiguous(query, _context = {}) {
  // This integrates with the existing Reasoning-Based Confidence Engine
  // For now, return a structured response that can be filled in when integrated

  console.log('[truthTypeDetector] Stage 2 classifier invoked for ambiguous query');

  try {
    // TODO: Integrate with existing confidence engine
    // const confidenceEngine = await import('./confidenceEngine.js');
    // const result = await confidenceEngine.classifyTruthType(query, context);

    // Placeholder: Default to SEMI_STABLE for ambiguous queries
    // This is safer than VOLATILE (which should only be for explicit time-sensitive queries)
    // SEMI_STABLE gives 24hr cache, balancing freshness with efficiency
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.5,
      stage: 2,
      reasoning: 'Stage 2 classifier defaulting to SEMI_STABLE (balanced default until AI classifier integrated)',
      tokens_used: 0 // Will be populated when AI classifier is integrated
    };
  } catch (error) {
    console.error('[truthTypeDetector] Stage 2 classification failed:', error);
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.3,
      stage: 2,
      reasoning: 'Stage 2 failed, defaulting to SEMI_STABLE (safe fallback)',
      error: error.message
    };
  }
}

/**
 * Main entry point: Detect truth type for a query
 * @param {string} query - The user's query
 * @param {object} context - Additional context (mode, conversation history)
 * @returns {Promise<object>} Complete truth type detection result
 */
export async function detectTruthType(query, context = {}) {
  const startTime = Date.now();
  
  // Stage 1: Deterministic detection (zero cost)
  const patternResult = detectByPattern(query);
  
  // Check high-stakes domains
  const highStakesResult = detectHighStakesDomain(query);
  
  // If Stage 1 found a clear type, return it
  if (patternResult.type !== TRUTH_TYPES.AMBIGUOUS) {
    return {
      success: true,
      ...patternResult,
      high_stakes: highStakesResult,
      ttl_ms: TTL_CONFIG[patternResult.type],
      detection_time_ms: Date.now() - startTime
    };
  }
  
  // Stage 2: AI classification for ambiguous queries
  const aiResult = await classifyAmbiguous(query, context);
  
  return {
    success: true,
    ...aiResult,
    high_stakes: highStakesResult,
    ttl_ms: TTL_CONFIG[aiResult.type] || TTL_CONFIG.SEMI_STABLE,
    detection_time_ms: Date.now() - startTime
  };
}

/**
 * Get TTL for a truth type
 * @param {string} truthType - The truth type
 * @returns {number} TTL in milliseconds
 */
export function getTTL(truthType) {
  return TTL_CONFIG[truthType] || TTL_CONFIG.SEMI_STABLE;
}

/**
 * Test endpoint handler for /api/test-semantic?action=truth-type
 * @param {string} query - Query to test
 * @returns {Promise<object>} Detection result with telemetry
 */
export async function testDetection(query) {
  console.log('[truthTypeDetector] Test detection for:', query);
  
  const result = await detectTruthType(query);
  
  return {
    query: query,
    result: result,
    telemetry: {
      truth_type: result.type,
      confidence: result.confidence,
      stage: result.stage,
      high_stakes: result.high_stakes,
      ttl_ms: result.ttl_ms,
      detection_time_ms: result.detection_time_ms
    }
  };
}

// Default export for convenience
export default {
  TRUTH_TYPES,
  TTL_CONFIG,
  HIGH_STAKES_DOMAINS,
  detectByPattern,
  detectHighStakesDomain,
  classifyAmbiguous,
  detectTruthType,
  getTTL,
  testDetection
};
