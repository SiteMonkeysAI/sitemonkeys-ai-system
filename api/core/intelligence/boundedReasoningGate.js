/**
 * boundedReasoningGate.js
 * 
 * ⚠️ WARNING: THIS IS AN ENFORCEMENT GATE, NOT A STYLE GUIDE ⚠️
 * 
 * This file must be invoked as a hard post-generation gate. 
 * Any implementation that treats it as advisory, optional, or prompt-level 
 * invalidates its purpose and will reintroduce epistemic dishonesty.
 * 
 * THE CORE PRINCIPLE:
 * "The system may reason beyond available facts, but it may never 
 * pretend that reasoning is fact."
 * 
 * This is not a "mode" - it is a constraint set that TIGHTENS 
 * (not loosens) when operating beyond verified truth.
 * 
 * PRIMARY OUTPUT: Decision quality, not response volume.
 * 
 * Silence is sometimes the highest-fidelity output.
 */

// ============================================
// ALLOWED CREATIVITY (explicit boundary)
// ============================================

const CREATIVITY_ALLOWED = [
  'framing',              // Presenting information in useful structure
  'analogy',              // Drawing parallels to aid understanding
  'scenario_structuring', // IF/THEN reasoning with stated assumptions
  'decision_modeling'     // Frameworks that reduce uncertainty or regret
];

const CREATIVITY_FORBIDDEN = [
  'invented_facts',         // Making up data points
  'hypothetical_statistics', // "Studies show..." without source
  'imagined_precedent',     // "This usually..." without basis
  'implied_certainty'       // Confident tone masking uncertainty
];

// ============================================
// MATERIAL IMPACT AXES (precision lock)
// ============================================

const IMPACT_AXES = {
  risk: 'Changes the probability or severity of negative outcomes',
  cost: 'Changes financial or resource requirements',
  feasibility: 'Changes whether something is possible or practical',
  timeline: 'Changes when something can or must happen',
  irreversibility: 'Changes ability to undo or correct course',
  quality: 'Changes the caliber of the outcome'
};

/**
 * Material Impact Declaration (required for volunteered content)
 * 
 * @typedef {Object} MaterialImpactDeclaration
 * @property {string} axis - One of IMPACT_AXES keys
 * @property {string} why_it_matters - One sentence explanation
 */

// ============================================
// THE THREE GATES
// ============================================

/**
 * GATE 1: TRUTH GATE
 * Is this factual OR clearly labeled as inference?
 * 
 * PASS: Verified fact with provenance, OR inference explicitly labeled
 * FAIL: Speculation presented as certainty
 * 
 * ⚠️ ENFORCEMENT: This gate is non-negotiable. No exceptions.
 */
function truthGate(content, metadata) {
  // Check for forbidden creativity patterns
  const forbiddenPatterns = {
    invented_facts: /studies show|research indicates|data suggests/i,
    hypothetical_statistics: /\d+%\s+(of people|of cases|typically)/i,
    imagined_precedent: /this (usually|typically|normally|always) (works|happens|is)/i,
    implied_certainty: /^(The answer is|You should definitely|You need to|You must)/i
  };
  
  for (const [violation, pattern] of Object.entries(forbiddenPatterns)) {
    if (pattern.test(content) && !metadata.verified) {
      return {
        passed: false,
        violation: `Forbidden creativity: ${violation}`,
        requirement: 'Must have provenance OR must explicitly label as inference'
      };
    }
  }
  
  // If claiming fact, must have verification
  if (metadata.presented_as === 'fact') {
    return {
      passed: metadata.verified === true,
      violation: metadata.verified ? null : 'Unverified claim presented as fact',
      requirement: 'Must have provenance OR must label as inference'
    };
  }
  
  // If inference, must be labeled
  if (metadata.presented_as === 'inference') {
    const inferenceMarkers = [
      /based on (similar|comparable|parallel)/i,
      /in (similar|comparable) (cases|situations)/i,
      /the pattern (that tends|suggests)/i,
      /this (suggests|indicates|implies)/i,
      /I don't have verified data/i,
      /from what (is|we) know/i,
      /reasoning from/i,
      /if.*then/i,
      /it appears that/i,
      /evidence suggests/i,
      /in my assessment/i
    ];
    
    const hasLabeling = inferenceMarkers.some(m => m.test(content));
    return {
      passed: hasLabeling,
      violation: hasLabeling ? null : 'Inference not clearly labeled as inference',
      requirement: 'Inference must be explicitly marked as reasoning, not fact'
    };
  }
  
  return { passed: true, violation: null };
}

/**
 * GATE 2: MATERIAL IMPACT GATE  
 * Does this meaningfully change the decision?
 * 
 * PASS: Has declared impact axis + "why it matters"
 * FAIL: "Nice to know" that changes nothing, or no declaration
 * 
 * PRECISION LOCK: Requires explicit declaration, not just text patterns
 * 
 * ⚠️ ENFORCEMENT: Volunteered content without declaration is rejected.
 */
function materialImpactGate(content, impactDeclaration) {
  // Volunteered content MUST have impact declaration
  if (!impactDeclaration) {
    return {
      passed: false,
      violation: 'No material impact declaration provided',
      requirement: 'Must declare { axis, why_it_matters }'
    };
  }
  
  // Validate axis
  if (!IMPACT_AXES[impactDeclaration.axis]) {
    return {
      passed: false,
      violation: `Invalid impact axis: ${impactDeclaration.axis}`,
      valid_axes: Object.keys(IMPACT_AXES),
      requirement: 'Must use valid impact axis'
    };
  }
  
  // Validate why_it_matters exists and has substance
  if (!impactDeclaration.why_it_matters || impactDeclaration.why_it_matters.length < 10) {
    return {
      passed: false,
      violation: 'Missing or insufficient "why_it_matters" explanation',
      requirement: 'Must explain why this impacts the decision'
    };
  }
  
  // Check why_it_matters isn't generic filler
  const genericPhrases = [
    /good to know/i,
    /might be useful/i,
    /just in case/i,
    /you should be aware/i,
    /worth mentioning/i,
    /for your information/i,
    /fyi/i,
    /as an aside/i
  ];
  
  if (genericPhrases.some(p => p.test(impactDeclaration.why_it_matters))) {
    return {
      passed: false,
      violation: 'Generic "why_it_matters" - does not explain actual impact',
      requirement: 'Must specify concrete impact on decision'
    };
  }
  
  return {
    passed: true,
    violation: null,
    axis: impactDeclaration.axis,
    axis_definition: IMPACT_AXES[impactDeclaration.axis],
    why_it_matters: impactDeclaration.why_it_matters
  };
}

/**
 * GATE 3: PROPORTIONALITY GATE
 * Can this be said simply without derailing the main answer?
 * 
 * PASS: Concise, focused, doesn't explode scope, doesn't duplicate
 * FAIL: Adds cognitive load disproportionate to benefit
 * 
 * PRECISION LOCK: Checks semantic redundancy, not just length
 * 
 * ⚠️ ENFORCEMENT: Redundant or scope-exploding content is rejected.
 */
function proportionalityGate(content, mainAnswer, semanticSimilarityFn = null) {
  const contentLength = content.length;
  const mainAnswerLength = mainAnswer.length || 1; // Prevent division by zero
  const ratio = contentLength / mainAnswerLength;
  
  // Length check: volunteered content should not exceed 30% of main answer
  if (ratio > 0.3) {
    return {
      passed: false,
      violation: `Volunteered content too long (${Math.round(ratio * 100)}% of main answer)`,
      requirement: 'Must be ≤30% of main answer length'
    };
  }
  
  // Scope explosion check
  const scopeExplosion = [
    /here are \d+ (things|ways|options|alternatives)/i,
    /additionally.*additionally/i,
    /another thing.*another thing/i,
    /you might also.*you might also/i,
    /first.*second.*third.*fourth/i,
    /on one hand.*on the other hand.*but also/i
  ];
  
  if (scopeExplosion.some(p => p.test(content))) {
    return {
      passed: false,
      violation: 'Content explodes scope with multiple tangents',
      requirement: 'Must be focused, not a list of tangents'
    };
  }
  
  // Semantic redundancy check (if similarity function provided)
  if (semanticSimilarityFn) {
    const similarity = semanticSimilarityFn(content, mainAnswer);
    if (similarity > 0.6) {
      return {
        passed: false,
        violation: `Volunteered content duplicates main answer (${Math.round(similarity * 100)}% similar)`,
        requirement: 'Must add new information, not restate'
      };
    }
  }
  
  return {
    passed: true,
    violation: null,
    length_ratio: ratio,
    is_focused: true
  };
}

// ============================================
// BOUNDED REASONING DETERMINATION
// ============================================

// Patterns that indicate speculative/predictive queries
const SPECULATIVE_PATTERNS = /\b(will .+ in the (next|future)|predict|forecast|going to happen|what will|years from now|by 20\d\d|in \d+ years)\b/i;

/**
 * Determine if we're operating in bounded reasoning territory
 *
 * This is not a "mode" - it is a constraint set that TIGHTENS.
 * The system becomes MORE careful, not less.
 *
 * @param {object} phase4Metadata - Phase 4 metadata
 * @param {string} queryText - Original user query (optional)
 */
function requiresBoundedReasoning(phase4Metadata, queryText = '') {
  // PERMANENT facts NEVER need bounded reasoning - exit immediately
  if (phase4Metadata.truth_type === 'PERMANENT') {
    return { required: false, reason: 'Permanent fact - no uncertainty disclosure needed' };
  }

  // Speculative future queries always need bounded reasoning
  if (queryText && SPECULATIVE_PATTERNS.test(queryText)) {
    return {
      required: true,
      reason: 'Speculative/predictive query - future is inherently uncertain',
      disclosure: 'I\'m reasoning about future possibilities, not verified facts.'
    };
  }

  // Verified external data available = no bounded reasoning needed
  if (phase4Metadata.external_lookup && phase4Metadata.sources_used > 0) {
    return { required: false, reason: 'Verified external data available' };
  }

  // Internal verified fact (vault, documents) = no bounded reasoning needed
  if (phase4Metadata.source_class === 'vault' || phase4Metadata.source_class === 'document') {
    return { required: false, reason: 'Verified internal data available' };
  }

  // VOLATILE without verification = bounded reasoning required
  if (phase4Metadata.truth_type === 'VOLATILE' && !phase4Metadata.verified_at) {
    return {
      required: true,
      reason: 'Volatile claim without external verification',
      disclosure: 'I don\'t have verified current data on this specific situation.'
    };
  }

  // High stakes without verification = bounded reasoning required
  if (phase4Metadata.high_stakes?.isHighStakes && !phase4Metadata.verified_at) {
    return {
      required: true,
      reason: 'High-stakes claim without external verification',
      disclosure: 'This is a high-stakes topic and I don\'t have verified data specific to your situation.'
    };
  }

  // Low confidence = bounded reasoning required
  if (phase4Metadata.confidence < 0.6) {
    return {
      required: true,
      reason: 'Low confidence without verification',
      disclosure: 'I\'m reasoning from general knowledge here, not verified specifics.'
    };
  }

  return { required: false, reason: 'Sufficient verified data available' };
}

// ============================================
// VOLUNTEERING JUSTIFICATION
// ============================================

/**
 * Determine if unsolicited information should be volunteered
 * 
 * THREE CONDITIONS (ALL must be true):
 * 1. Passes all three gates
 * 2. Would a wise, caring advisor mention this?
 * 3. Would staying silent cost them something?
 * 
 * ⚠️ ENFORCEMENT: If any condition fails, do not volunteer.
 */
function shouldVolunteer(content, impactDeclaration, mainAnswer, phase4Metadata, context, semanticSimilarityFn = null) {
  // Gate 1: Truth
  const truthResult = truthGate(content, { 
    presented_as: context.isInference ? 'inference' : 'fact',
    verified: phase4Metadata.verified_at !== null
  });
  if (!truthResult.passed) {
    return { volunteer: false, gate: 'truth', reason: truthResult.violation };
  }
  
  // Gate 2: Material Impact (requires declaration)
  const impactResult = materialImpactGate(content, impactDeclaration);
  if (!impactResult.passed) {
    return { volunteer: false, gate: 'material_impact', reason: impactResult.violation };
  }
  
  // Gate 3: Proportionality (includes semantic check)
  const proportionResult = proportionalityGate(content, mainAnswer, semanticSimilarityFn);
  if (!proportionResult.passed) {
    return { volunteer: false, gate: 'proportionality', reason: proportionResult.violation };
  }
  
  // Would silence cost them?
  const silenceCostFactors = {
    prevents_significant_risk: context.preventsSignificantRisk,
    reveals_hidden_dependency: context.revealsHiddenDependency,
    prevents_common_mistake: context.preventsCommonMistake,
    irreversible_decision: context.irreversibleDecision,
    changes_feasibility: impactDeclaration.axis === 'feasibility',
    changes_timeline_critically: impactDeclaration.axis === 'timeline' && context.timelineCritical
  };
  
  const activeCostFactors = Object.entries(silenceCostFactors)
    .filter(([_, value]) => value)
    .map(([factor, _]) => factor);
  
  if (activeCostFactors.length === 0) {
    return { 
      volunteer: false, 
      gate: 'silence_cost',
      reason: 'Passes gates but silence would not cost them - omit'
    };
  }
  
  return { 
    volunteer: true, 
    reason: 'Passes all gates AND silence would cost them',
    impact_axis: impactDeclaration.axis,
    why_it_matters: impactDeclaration.why_it_matters,
    silence_cost_factors: activeCostFactors
  };
}

// ============================================
// STOPPING CONDITION
// ============================================

/**
 * The system stops once all information that passes the 
 * Truth, Material Impact, and Proportionality gates has been delivered.
 * 
 * ⚠️ CRITICAL: SILENCE IS SOMETIMES THE HIGHEST-FIDELITY OUTPUT.
 * 
 * If nothing passes the gates, the system stops.
 * It does not search for something to say.
 */
function shouldStop(deliveredItems, remainingItems, mainAnswer, phase4Metadata, semanticSimilarityFn = null) {
  if (!remainingItems || remainingItems.length === 0) {
    return { 
      stop: true, 
      reason: 'All relevant content delivered'
    };
  }
  
  // Check if any remaining content passes all gates
  for (const item of remainingItems) {
    const truthPassed = truthGate(item.content, item.metadata).passed;
    const impactPassed = item.impactDeclaration ? 
      materialImpactGate(item.content, item.impactDeclaration).passed : false;
    const proportionPassed = proportionalityGate(item.content, mainAnswer, semanticSimilarityFn).passed;
    
    if (truthPassed && impactPassed && proportionPassed) {
      return { 
        stop: false, 
        reason: 'Remaining content passes gates',
        next_item: item
      };
    }
  }
  
  return { 
    stop: true, 
    reason: 'Remaining content fails gates - silence is higher fidelity than noise'
  };
}

// ============================================
// BOUNDED REASONING RESPONSE STRUCTURE
// ============================================

/**
 * When operating with bounded reasoning, responses follow this structure.
 * Each element is gate-controlled.
 */
const BOUNDED_REASONING_STRUCTURE = {
  disclosure: {
    required: true,
    gate: null, // Always required in bounded reasoning
    purpose: 'State explicitly that this is bounded reasoning, not verified fact',
    example: 'I don\'t have verified data on this specific situation.'
  },
  knownPatterns: {
    required: true,
    gate: 'truth',
    purpose: 'Share what IS known from comparable/parallel situations',
    requirement: 'Must use inference markers',
    example: 'Based on similar situations...',
    allowed_creativity: ['framing', 'analogy']
  },
  keyVariables: {
    required: false,
    gate: 'material_impact',
    purpose: 'Identify what could change the answer',
    condition: 'Include if decision is sensitive to specific variables'
  },
  decisionFramework: {
    required: false,
    gate: 'material_impact',
    purpose: 'Provide path forward that reduces uncertainty or regret',
    condition: 'Include when it empowers without speculating on outcome',
    allowed_creativity: ['scenario_structuring', 'decision_modeling']
  },
  riskWarning: {
    required: false,
    gate: 'all_three',
    purpose: 'State what would NOT be advisable',
    condition: 'Include only if silence would cost them'
  },
  stop: {
    required: true,
    gate: null, // Mechanical condition
    purpose: 'End when all gate-passing content is delivered',
    rule: 'No additional value-add beyond what passes gates',
    principle: 'Silence is sometimes the highest-fidelity output'
  }
};

// ============================================
// MAIN ENFORCEMENT FUNCTION
// ============================================

/**
 * Apply bounded reasoning enforcement to a response
 *
 * ⚠️ WARNING: THIS IS A HARD ENFORCEMENT GATE
 *
 * This function MUST be called post-generation.
 * It is not advisory. It is not optional.
 * Skipping this gate reintroduces epistemic dishonesty.
 *
 * @param {string} response - The AI response
 * @param {object} phase4Metadata - Phase 4 metadata
 * @param {object} context - Context including queryText
 * @param {function} semanticSimilarityFn - Optional similarity function
 */
function enforceBoundedReasoning(response, phase4Metadata, context = {}, semanticSimilarityFn = null) {
  const enforcement = {
    bounded_reasoning_required: false,
    disclosure_added: false,
    items_filtered: 0,
    items_passed: 0,
    stopped_reason: null,
    gates_applied: {
      truth: { checked: 0, passed: 0, failed: 0 },
      material_impact: { checked: 0, passed: 0, failed: 0 },
      proportionality: { checked: 0, passed: 0, failed: 0 }
    },
    creativity_check: {
      allowed_used: [],
      forbidden_blocked: []
    }
  };

  let enforcedResponse = response;

  // Check if bounded reasoning is required, pass queryText from context
  const boundedCheck = requiresBoundedReasoning(phase4Metadata, context.queryText || '');
  enforcement.bounded_reasoning_required = boundedCheck.required;
  
  if (boundedCheck.required) {
    // Ensure disclosure is present at the start
    const hasDisclosure = [
      /I don't have verified/i,
      /I'm reasoning from/i,
      /This is a high-stakes topic/i,
      /Based on general knowledge/i,
      /Without verified data/i
    ].some(p => p.test(response.substring(0, 500)));
    
    if (!hasDisclosure && boundedCheck.disclosure) {
      enforcedResponse = boundedCheck.disclosure + '\n\n' + response;
      enforcement.disclosure_added = true;
    }
  }
  
  // Check for forbidden creativity patterns
  const forbiddenChecks = {
    invented_facts: /studies show|research indicates|data suggests/gi,
    hypothetical_statistics: /\d+%\s+(of people|of cases|typically)/gi,
    imagined_precedent: /this (usually|typically|normally|always) (works|happens|is)/gi,
    implied_certainty: /^(The answer is|You should definitely|You need to|You must)/gim
  };
  
  for (const [forbidden, pattern] of Object.entries(forbiddenChecks)) {
    if (pattern.test(enforcedResponse) && !phase4Metadata.verified_at) {
      enforcement.creativity_check.forbidden_blocked.push(forbidden);
    }
  }
  
  enforcement.stopped_reason = 'All gate-passing content delivered';
  
  const passed = enforcement.creativity_check.forbidden_blocked.length === 0;
  
  return {
    ...enforcement,
    enforced_response: enforcedResponse,
    enforcement_passed: passed,
    violations: enforcement.creativity_check.forbidden_blocked,
    principle: 'The system may reason beyond available facts, but it may never pretend that reasoning is fact.'
  };
}

// ============================================
// EXPORTS (ES6 modules)
// ============================================

export {
  // Gates
  truthGate,
  materialImpactGate,
  proportionalityGate,

  // Determination functions
  requiresBoundedReasoning,
  shouldVolunteer,
  shouldStop,

  // Main enforcement
  enforceBoundedReasoning,

  // Constants
  IMPACT_AXES,
  CREATIVITY_ALLOWED,
  CREATIVITY_FORBIDDEN,
  BOUNDED_REASONING_STRUCTURE,
};

// Core principles (for documentation/reference)
export const PRINCIPLE = 'The system may reason beyond available facts, but it may never pretend that reasoning is fact.';
export const PRIMARY_OUTPUT = 'Decision quality, not response volume.';
export const SILENCE_PRINCIPLE = 'Silence is sometimes the highest-fidelity output.';
