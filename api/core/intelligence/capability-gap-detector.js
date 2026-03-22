// Capability Gap Detector
//
// CONTRACT PRESERVATION RULE (supersedes all other routing logic):
// "The customer's current provider/model path is the default contract path.
//  The system must never trade away expected behavior, tool compatibility,
//  output contract, or provider constraints in pursuit of lower cost or
//  capability."
//
// ESCALATION PRINCIPLE:
//   Escalation is capability-gap driven, NOT confidence-driven.
//   Confidence is a supporting signal only — low confidence alone
//   NEVER triggers escalation.
//
// PRIMARY TRIGGERS (in priority order):
//   1. Query classification result (complex_analytical → may need advanced reasoning)
//   2. Truth type and risk level (VOLATILE + high_stakes → need high hallucination control)
//   3. Tool requirements (if context requires specific tool guarantees)
//   4. Context size (very long context → need high long_context capability)
//   5. Output contract requirements (structured formats, multi-part instructions)
//
// SECONDARY SIGNAL ONLY:
//   - Regex pattern matches on query text
//   - Patterns can reinforce a primary trigger but cannot trigger escalation alone
//
// Capability requirements use coarse tiers matching the adapter registry.

// Regex patterns — secondary supporting signals only.
// Patterns REINFORCE primary triggers but do not drive escalation by themselves.
const SECONDARY_PATTERNS = {

  reasoning_tier: [
    /\b(analyze|analysis|compare|contrast|evaluate|assess)\b/i,
    /\b(why|how does|what causes|what leads to)\b/i,
    /\b(implications|consequences|impact of)\b/i,
    /\b(strategy|strategic|recommend|recommendation)\b/i,
    /\b(pros and cons|trade.?offs|weighing)\b/i
  ],

  hallucination_control: [
    /\b(legal|law|regulation|compliance|liability)\b/i,
    /\b(medical|clinical|diagnosis|treatment|drug)\b/i,
    /\b(financial|investment|securities|tax|audit)\b/i,
    /\b(safety|critical|dangerous|hazardous)\b/i,
    /\b(exact|precise|specific|actual|statistic|percentage)\b/i
  ],

  long_context: [
    /\b(summarize|summary|overview|across)\b/i,
    /\b(multiple|several|various|different sources)\b/i,
    /\b(document|report|paper|article)\b/i
  ],

  structured_output: [
    /\b(first|second|third|then|finally|additionally)\b/i,
    /\b(format|structure|organize|bullet|numbered|table)\b/i,
    /\b(only|must|never|always|exactly|precisely)\b/i
  ]
};

/**
 * Count how many secondary pattern signals fire for a given capability dimension.
 * Returns the count — caller decides whether this reinforces a primary trigger.
 */
function countPatternSignals(query, capability) {
  const patterns = SECONDARY_PATTERNS[capability];
  if (!patterns) return 0;
  return patterns.filter(p => p.test(query)).length;
}

/**
 * Detect what capability tiers are required for this query.
 *
 * Returns a map of required capabilities (coarse tiers).
 * An empty map means no escalation is warranted.
 *
 * @param {string}      query                - The user query text
 * @param {string|null} queryClassification  - Result from queryComplexityClassifier
 *                                             (greeting|simple_short|simple_factual|medium_complexity|complex_analytical)
 * @param {string|null} truthType            - VOLATILE | SEMI_STABLE | PERMANENT | null
 * @param {Object|null} highStakes           - phase4Metadata.high_stakes object
 * @param {number}      contextTokens        - Total context tokens
 * @param {number}      confidenceScore      - Current confidence (0–1); supporting signal only
 * @param {boolean}     requiresExpertise    - From analysis.requiresExpertise (semantic analyzer)
 * @param {number}      analysisComplexity   - From analysis.complexity (0–1, semantic analyzer)
 * @returns {Object}  required capability map (empty = no advanced capability needed)
 */
export function detectRequiredCapabilities(
  query,
  queryClassification,
  truthType,
  highStakes,
  contextTokens,
  confidenceScore,
  requiresExpertise = false,
  analysisComplexity = 0
) {
  const required = {};

  // ── PRIMARY TRIGGER 1: Query classification ────────────────────────────────
  // 'complex_analytical' indicates multi-step reasoning beyond standard tier.
  if (queryClassification === 'complex_analytical') {
    required.reasoning_tier = 'advanced';
    // Pattern signals can reinforce but are not required
  }

  // ── PRIMARY TRIGGER 2: Truth type + risk level ─────────────────────────────
  // VOLATILE type + high-stakes domain = high hallucination control required.
  if (highStakes?.isHighStakes) {
    required.hallucination_control = 'high';
    if (truthType === 'VOLATILE' || truthType === 'SEMI_STABLE') {
      required.reasoning_tier = 'advanced';
    }
  }

  // ── PRIMARY TRIGGER 3: Context size ───────────────────────────────────────
  // Context above 80K tokens requires 'high' long_context capability.
  // (80K is a practical threshold — above it, synthesis quality degrades on
  //  medium-context models.)
  if (contextTokens > 80000) {
    required.long_context = 'high';
  }

  // ── PRIMARY TRIGGER 4: Expert-level signal from semantic analyzer ─────────
  // analysis.requiresExpertise is set by the semantic analyzer when the query
  // demonstrates expert-level domain complexity.
  if (requiresExpertise) {
    required.reasoning_tier = 'advanced';
  }

  // ── PRIMARY TRIGGER 5: High semantic complexity score ─────────────────────
  // analysis.complexity > 0.8 represents the top of the complexity scale from
  // the semantic analyzer — benefits from advanced reasoning tier.
  if (analysisComplexity > 0.8) {
    required.reasoning_tier = required.reasoning_tier || 'advanced';
  }

  // ── PRIMARY TRIGGER 6: Output contract / structured multi-part instructions
  // Assessed via secondary patterns when patterns fire on ≥2 structured_output
  // indicators AND classification is not simple_factual.
  const structuredSignals = countPatternSignals(query, 'structured_output');
  if (structuredSignals >= 2 && queryClassification !== 'simple_factual') {
    required.structured_output = true;
  }

  // ── SECONDARY SIGNAL REINFORCEMENT ────────────────────────────────────────
  // Patterns may UPGRADE an already-required capability tier.
  // They cannot CREATE a requirement when no primary trigger has fired.
  // The guard `Object.keys(required).length > 0` ensures a primary trigger
  // has already populated `required` before patterns can add reasoning_tier.
  // (If required is empty, patterns have no effect regardless of match count.)

  if (required.reasoning_tier !== 'advanced' && Object.keys(required).length > 0) {
    // Some other primary trigger already fired. If the query also looks like it
    // needs advanced reasoning (2+ pattern matches, not simple_factual), require it.
    const reasoningSignals = countPatternSignals(query, 'reasoning_tier');
    if (reasoningSignals >= 2 && queryClassification !== 'simple_factual') {
      required.reasoning_tier = 'advanced';
    }
  }

  if (!required.hallucination_control) {
    // hallucination_control patterns are risk signals — two or more domain hits
    // (legal, medical, financial, safety) represent a genuine risk-level concern
    // and can create a requirement independently.
    const hallucinationSignals = countPatternSignals(query, 'hallucination_control');
    if (hallucinationSignals >= 2) {
      required.hallucination_control = 'high';
    }
  }

  // ── CONFIDENCE: supporting signal only ────────────────────────────────────
  // Low confidence does NOT create new requirements.
  // It only promotes an already-identified 'standard' reasoning_tier to
  // 'advanced' — and only when other requirements already exist.
  if (confidenceScore < 0.65 &&
      Object.keys(required).length > 0 &&
      required.reasoning_tier !== 'advanced') {
    required.reasoning_tier = 'advanced';
  }

  return required;
}

/**
 * Determine whether the current adapter has a capability gap for this query.
 *
 * @param {Object} currentAdapter        - Adapter object from the registry
 * @param {Object} requiredCapabilities  - From detectRequiredCapabilities()
 * @returns {{ hasGap: boolean, gaps: Object }}
 */
export function calculateCapabilityGap(currentAdapter, requiredCapabilities) {
  if (Object.keys(requiredCapabilities).length === 0) {
    return { hasGap: false, gaps: {} };
  }

  const gaps = {};

  for (const [capability, required] of Object.entries(requiredCapabilities)) {
    const current = currentAdapter.capabilities[capability];

    switch (capability) {
      case 'reasoning_tier':
        if (required === 'advanced' && current !== 'advanced') {
          gaps[capability] = `required:advanced current:${current}`;
        }
        break;
      case 'hallucination_control':
        if (required === 'high' && current !== 'high') {
          gaps[capability] = `required:high current:${current}`;
        }
        break;
      case 'long_context': {
        const rank = { low: 0, medium: 1, high: 2 };
        if ((rank[current] ?? -1) < (rank[required] ?? 0)) {
          gaps[capability] = `required:${required} current:${current}`;
        }
        break;
      }
      case 'tool_reliable':
      case 'structured_output':
        if (required === true && current !== true) {
          gaps[capability] = `required:true current:${current}`;
        }
        break;
      default:
        break;
    }
  }

  return {
    hasGap: Object.keys(gaps).length > 0,
    gaps
  };
}
