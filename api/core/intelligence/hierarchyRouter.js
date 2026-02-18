/**
 * hierarchyRouter.js
 * Phase 4: Dual Hierarchy Truth Validation
 *
 * Purpose: Select correct source hierarchy based on claim type + mode
 * Business policy claims: Vault → Memory → Docs → External (vault wins)
 * Objective factual claims: External → Vault → Docs → Memory (reality wins)
 *
 * Location: /api/core/intelligence/hierarchyRouter.js
 */

import { detectTruthType, TRUTH_TYPES } from './truthTypeDetector.js';

// Claim type constants
export const CLAIM_TYPES = {
  BUSINESS_POLICY: 'BUSINESS_POLICY', // Site Monkeys internal rules, pricing, procedures
  OBJECTIVE_FACTUAL: 'OBJECTIVE_FACTUAL', // External reality, current events, prices
  AMBIGUOUS: 'AMBIGUOUS',
};

// Source hierarchy constants
export const HIERARCHIES = {
  VAULT_FIRST: ['vault', 'memory', 'docs', 'external'], // Business policy: vault wins
  EXTERNAL_FIRST: ['external', 'vault', 'docs', 'memory'], // Objective factual: reality wins
};

// Business policy patterns - these indicate internal/founder-defined rules
const BUSINESS_POLICY_PATTERNS = [
  /\b(our|my|we|us)\s+(pricing|price|rate|fee|cost|charge)/i,
  /\b(our|my|we|us)\s+(policy|procedure|process|rule|guideline)/i,
  /\b(our|my|we|us)\s+(service|offering|package|product)/i,
  /\b(our|my|we|us)\s+(minimum|maximum|standard|default)/i,
  /\bsite\s*monkeys?\b/i,
  /\b(do we|should we|can we|how do we)\b/i,
  /\b(founder|owner|internal|company)\s+(rule|policy|decision)/i,
  /\bwhat('s| is) (our|my)\b/i,
  /\bhow much (do we|should we) charge\b/i,
  /\b(client|customer) (qualification|criteria|requirements)\b/i,
  /\bminimum (package|project|engagement)\b/i,
];

// Objective factual patterns - these indicate external reality
const OBJECTIVE_FACTUAL_PATTERNS = [
  /\b(current|latest|today'?s?|now|live)\s+(price|stock|rate|value)/i,
  /\b(who is|who's) the (current )?(ceo|president|chairman|leader)/i,
  /\b(what is|what's) the (current )?(population|temperature|weather)/i,
  /\b(news|headline|announcement|update) (about|on|for)/i,
  /\b(stock|share|market|exchange) (price|value|rate)/i,
  /\b(did|has|have|is|are|was|were) .+ (announced|released|published|reported)/i,
  /\b(fda|sec|government|court) (approval|ruling|decision)/i,
  /\b(latest|recent|new) (study|research|finding|report)/i,
  /\bbreaking\b/i,
  /\bhappening (now|today|right now)\b/i,
];

/**
 * Detect if query is a business policy claim
 * @param {string} query - The user's query
 * @param {string} mode - Current operational mode
 * @returns {object} { isBusinessPolicy: boolean, confidence: number, patterns_matched: array }
 */
export function isBusinessPolicyClaim(query, mode = 'truth') {
  if (!query || typeof query !== 'string') {
    return { isBusinessPolicy: false, confidence: 0, patterns_matched: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedPatterns = [];

  // Site Monkeys mode increases likelihood of business policy
  const modeBoost = mode === 'site_monkeys' ? 0.3 : 0;

  for (const pattern of BUSINESS_POLICY_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  if (matchedPatterns.length === 0 && mode !== 'site_monkeys') {
    return { isBusinessPolicy: false, confidence: 0, patterns_matched: [] };
  }

  // Calculate confidence
  const patternConfidence = Math.min(0.9, 0.5 + matchedPatterns.length * 0.15);
  const totalConfidence = Math.min(1.0, patternConfidence + modeBoost);

  return {
    isBusinessPolicy: matchedPatterns.length > 0 || mode === 'site_monkeys',
    confidence: totalConfidence,
    patterns_matched: matchedPatterns,
    mode_boost_applied: modeBoost > 0,
  };
}

/**
 * Detect if query is an objective factual claim
 * @param {string} query - The user's query
 * @returns {object} { isObjectiveFactual: boolean, confidence: number, patterns_matched: array }
 */
export function isObjectiveFactualClaim(query) {
  if (!query || typeof query !== 'string') {
    return { isObjectiveFactual: false, confidence: 0, patterns_matched: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedPatterns = [];

  for (const pattern of OBJECTIVE_FACTUAL_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  if (matchedPatterns.length === 0) {
    return { isObjectiveFactual: false, confidence: 0, patterns_matched: [] };
  }

  const confidence = Math.min(0.95, 0.6 + matchedPatterns.length * 0.12);

  return {
    isObjectiveFactual: true,
    confidence: confidence,
    patterns_matched: matchedPatterns,
  };
}

/**
 * Determine claim type from query and mode
 * @param {string} query - The user's query
 * @param {string} mode - Current operational mode
 * @returns {object} { claimType: string, confidence: number, reasoning: string }
 */
export function detectClaimType(query, mode = 'truth') {
  const businessResult = isBusinessPolicyClaim(query, mode);
  const factualResult = isObjectiveFactualClaim(query);

  // If both match, business policy wins in site_monkeys mode, factual wins otherwise
  if (businessResult.isBusinessPolicy && factualResult.isObjectiveFactual) {
    if (mode === 'site_monkeys') {
      return {
        claimType: CLAIM_TYPES.BUSINESS_POLICY,
        confidence: businessResult.confidence,
        reasoning: 'Both patterns matched; business policy wins in Site Monkeys mode',
        business_patterns: businessResult.patterns_matched,
        factual_patterns: factualResult.patterns_matched,
        conflict_detected: true,
      };
    } else {
      return {
        claimType: CLAIM_TYPES.OBJECTIVE_FACTUAL,
        confidence: factualResult.confidence,
        reasoning: 'Both patterns matched; objective factual wins in non-Site Monkeys mode',
        business_patterns: businessResult.patterns_matched,
        factual_patterns: factualResult.patterns_matched,
        conflict_detected: true,
      };
    }
  }

  // Business policy match
  if (businessResult.isBusinessPolicy) {
    return {
      claimType: CLAIM_TYPES.BUSINESS_POLICY,
      confidence: businessResult.confidence,
      reasoning: `Matched ${businessResult.patterns_matched.length} business policy pattern(s)`,
      patterns_matched: businessResult.patterns_matched,
      conflict_detected: false,
    };
  }

  // Objective factual match
  if (factualResult.isObjectiveFactual) {
    return {
      claimType: CLAIM_TYPES.OBJECTIVE_FACTUAL,
      confidence: factualResult.confidence,
      reasoning: `Matched ${factualResult.patterns_matched.length} objective factual pattern(s)`,
      patterns_matched: factualResult.patterns_matched,
      conflict_detected: false,
    };
  }

  // No clear match - default based on mode
  return {
    claimType: CLAIM_TYPES.AMBIGUOUS,
    confidence: 0.3,
    reasoning: 'No clear pattern match; claim type ambiguous',
    default_hierarchy: mode === 'site_monkeys' ? 'VAULT_FIRST' : 'EXTERNAL_FIRST',
    conflict_detected: false,
  };
}

/**
 * Get source hierarchy based on claim type and mode
 * @param {string} claimType - BUSINESS_POLICY, OBJECTIVE_FACTUAL, or AMBIGUOUS
 * @param {string} mode - Current operational mode
 * @returns {array} Ordered array of sources to consult
 */
export function getSourceHierarchy(claimType, mode = 'truth') {
  // Business policy: Vault always wins
  if (claimType === CLAIM_TYPES.BUSINESS_POLICY) {
    return HIERARCHIES.VAULT_FIRST;
  }

  // Objective factual: External wins (reality first)
  if (claimType === CLAIM_TYPES.OBJECTIVE_FACTUAL) {
    return HIERARCHIES.EXTERNAL_FIRST;
  }

  // Ambiguous: Default based on mode
  if (mode === 'site_monkeys') {
    return HIERARCHIES.VAULT_FIRST;
  }

  return HIERARCHIES.EXTERNAL_FIRST;
}

/**
 * Main router: Determine complete routing decision for a query
 * @param {string} query - The user's query
 * @param {string} mode - Current operational mode
 * @returns {Promise<object>} Complete routing decision with hierarchy, claim type, and truth type
 */
export async function route(query, mode = 'truth') {
  const startTime = Date.now();

  // Detect claim type
  const claimTypeResult = detectClaimType(query, mode);

  // Detect truth type (for TTL/caching decisions)
  const truthTypeResult = await detectTruthType(query);

  // Get appropriate hierarchy
  const hierarchy = getSourceHierarchy(claimTypeResult.claimType, mode);

  // Determine if external lookup is required
  const externalLookupRequired =
    hierarchy[0] === 'external' ||
    truthTypeResult.type === TRUTH_TYPES.VOLATILE ||
    (truthTypeResult.high_stakes && truthTypeResult.high_stakes.isHighStakes);

  return {
    success: true,
    query: query,
    mode: mode,
    claim_type: claimTypeResult.claimType,
    claim_confidence: claimTypeResult.confidence,
    claim_reasoning: claimTypeResult.reasoning,
    truth_type: truthTypeResult.type,
    truth_confidence: truthTypeResult.confidence,
    hierarchy: hierarchy,
    hierarchy_name: hierarchy === HIERARCHIES.VAULT_FIRST ? 'VAULT_FIRST' : 'EXTERNAL_FIRST',
    external_lookup_required: externalLookupRequired,
    high_stakes: truthTypeResult.high_stakes,
    ttl_ms: truthTypeResult.ttl_ms,
    conflict_detected: claimTypeResult.conflict_detected || false,
    routing_time_ms: Date.now() - startTime,
  };
}

/**
 * Test endpoint handler for /api/test-semantic?action=hierarchy
 * @param {string} query - Query to test
 * @param {string} mode - Mode to test in
 * @returns {Promise<object>} Routing result with telemetry
 */
export async function testRouting(query, mode = 'truth') {
  console.log(`[hierarchyRouter] Test routing for: "${query}" in mode: ${mode}`);

  if (!query) {
    return {
      success: true,
      message: 'Hierarchy Router operational',
      usage: 'Add &q=your+query and optionally &mode=site_monkeys',
      examples: [
        '?action=hierarchy&q=What%20is%20our%20minimum%20pricing',
        '?action=hierarchy&q=What%20is%20the%20current%20price%20of%20Bitcoin',
        '?action=hierarchy&q=What%20is%20our%20pricing&mode=site_monkeys',
      ],
      available_modes: ['truth', 'business', 'site_monkeys'],
    };
  }

  const result = await route(query, mode);

  return {
    query: query,
    mode: mode,
    result: result,
    telemetry: {
      claim_type: result.claim_type,
      truth_type: result.truth_type,
      hierarchy: result.hierarchy_name,
      external_lookup_required: result.external_lookup_required,
      high_stakes: result.high_stakes,
      routing_time_ms: result.routing_time_ms,
    },
  };
}

// Default export
export default {
  CLAIM_TYPES,
  HIERARCHIES,
  isBusinessPolicyClaim,
  isObjectiveFactualClaim,
  detectClaimType,
  getSourceHierarchy,
  route,
  testRouting,
};
