/**
 * reasoningEscalationEnforcer.js
 * 
 * POST-GENERATION ENFORCEMENT
 * 
 * Ensures the system does not ship responses that quit early.
 * Uncertainty is a trigger for deeper reasoning, not permission to stop.
 * 
 * This is governance, not instruction.
 */

// The reasoning escalation steps that MUST be attempted when bounded reasoning is required
const ESCALATION_STEPS = {
  known_facts: {
    name: 'State what IS known',
    markers: [
      /\b(what (we|i) (do )?know|known|established|generally|typically|historically|the pattern is|it's clear that|facts? (are|is)|we can say)\b/i,
      /\b(research (shows|indicates)|data (shows|suggests)|evidence (shows|suggests))\b/i
    ],
    template: "**What is known:** [State established facts, constraints, historical patterns, principles that apply]"
  },
  
  unknowns_identified: {
    name: 'Identify what is unknown',
    markers: [
      /\b(what (we|i) don't know|unknown|unclear|uncertain|can't (determine|verify)|missing (information|data)|depends on|variable|would need to know)\b/i,
      /\b(without knowing|if .+ then .+ but if|the key question is)\b/i
    ],
    template: "**What is unknown:** [Name specific unknowns and whether they materially change the outcome]"
  },
  
  parallels_used: {
    name: 'Reason from parallels',
    markers: [
      /\b(similar (situation|case|scenario)|comparable|analogous|historically|in the past|pattern suggests|typically when|usually when)\b/i,
      /\b(other (people|companies|cases|situations)|common (outcome|pattern)|precedent)\b/i
    ],
    template: "**Similar situations suggest:** [Reference comparable cases, historical patterns, adjacent domains - explicitly labeled as inference]"
  },
  
  scenarios_presented: {
    name: 'Present bounded scenarios',
    markers: [
      /\b(scenario|range|best case|worst case|most likely|optimistic|pessimistic|conservative|if .+ then|could range|between .+ and)\b/i,
      /\b(at (minimum|maximum)|at least|at most|roughly|approximately|estimate)\b/i
    ],
    template: "**Possible scenarios:** [Ranges not single points, best/worst/likely outcomes, no false precision]"
  },
  
  confidence_path: {
    name: 'Explain how confidence could increase',
    markers: [
      /\b(to (know|be) (more certain|sure)|increase confidence|would help to know|if (you|we) (could|knew)|key (factor|variable|question))\b/i,
      /\b(what would (change|resolve)|more information about|critical (factor|variable))\b/i
    ],
    template: "**What would increase confidence:** [Specific information or actions that would reduce uncertainty]"
  }
};

// Markers indicating premature termination (giving up)
const TERMINATION_MARKERS = [
  /\bi (can't|cannot|am unable to) (help|assist|provide|answer|advise|determine)/i,
  /\byou (should|need to|must) (consult|speak with|contact|see) (a |an )?(professional|lawyer|doctor|accountant|expert|specialist)/i,
  /\bi don't have (enough|sufficient|adequate) information/i,
  /\b(this is|that's) (beyond|outside) (my|the system's)/i,
  /\bi('m| am) not (able|qualified|equipped|in a position) to/i,
  /\bi can only (suggest|recommend) (that you|you) (consult|speak|contact)/i
];

// Check which escalation steps were attempted
function checkEscalationSteps(response) {
  const results = {};
  const missing = [];
  const attempted = [];
  
  for (const [key, step] of Object.entries(ESCALATION_STEPS)) {
    const found = step.markers.some(pattern => pattern.test(response));
    results[key] = found;
    if (found) {
      attempted.push(step.name);
    } else {
      missing.push({ key, name: step.name, template: step.template });
    }
  }
  
  return {
    results,
    attempted,
    missing,
    completedCount: attempted.length,
    totalSteps: Object.keys(ESCALATION_STEPS).length
  };
}

// Check for premature termination
function detectPrematureTermination(response) {
  for (const marker of TERMINATION_MARKERS) {
    if (marker.test(response)) {
      return { detected: true, marker: marker.toString() };
    }
  }
  return { detected: false };
}

// Build reasoning scaffold - adds structured prompts to guide reasoning completion
// ISSUE #406 FIX: Instead of empty templates, provide actionable reasoning structure
function buildReasoningScaffold(missingSteps, existingResponse) {
  // PRINCIPLE: "Uncertainty is a reason to work harder, not permission to stop"
  // Add structured sections that prompt for the missing reasoning elements

  if (!missingSteps || missingSteps.length === 0) {
    return null;
  }

  // Check if response already has reasonable length - don't append to very short responses
  if (existingResponse.length < 100) {
    return null;
  }

  const scaffoldParts = ["\n\n---\n"];

  // Add each missing step as a structured section
  for (const step of missingSteps) {
    scaffoldParts.push(`\n**${step.name}:**\n`);

    // Add a brief prompt based on the step type
    if (step.key === 'known_facts') {
      scaffoldParts.push("_[Based on established patterns and principles...]_\n");
    } else if (step.key === 'unknowns_identified') {
      scaffoldParts.push("_[Key factors that would change the answer...]_\n");
    } else if (step.key === 'parallels_used') {
      scaffoldParts.push("_[From similar situations...]_\n");
    } else if (step.key === 'scenarios_presented') {
      scaffoldParts.push("_[Possible outcomes range from... to...]_\n");
    } else if (step.key === 'confidence_path') {
      scaffoldParts.push("_[To increase certainty, you would need...]_\n");
    }
  }

  return scaffoldParts.join('');
}

// Legacy function kept for backward compatibility
function generateEscalationAppend(missingSteps, context = {}) {
  return buildReasoningScaffold(missingSteps, context.response || '');
}

// Main enforcement function
function enforceReasoningEscalation(response, phase6Metadata, context = {}) {
  const result = {
    enforced: false,
    bounded_reasoning_required: phase6Metadata?.required || false,
    escalation_check: null,
    termination_check: null,
    passed: true,
    violations: [],
    correction_applied: false,
    corrected_response: null
  };
  
  // Only enforce when bounded reasoning is required
  if (!phase6Metadata?.required) {
    return result;
  }
  
  result.enforced = true;
  
  // Check for premature termination
  const terminationCheck = detectPrematureTermination(response);
  result.termination_check = terminationCheck;
  
  // Check escalation steps
  const escalationCheck = checkEscalationSteps(response);
  result.escalation_check = escalationCheck;
  
  // Minimum steps required (at least 3 of 5)
  const MIN_STEPS = 3;
  
  // Violation: Premature termination detected
  if (terminationCheck.detected) {
    result.violations.push({
      type: 'premature_termination',
      detail: 'Response contains terminal uncertainty language without exhausting reasoning paths',
      severity: 'high'
    });
  }
  
  // Violation: Insufficient escalation steps
  if (escalationCheck.completedCount < MIN_STEPS) {
    result.violations.push({
      type: 'insufficient_escalation',
      detail: `Only ${escalationCheck.completedCount}/${escalationCheck.totalSteps} reasoning steps attempted`,
      missing: escalationCheck.missing.map(m => m.name),
      severity: 'high'
    });
  }
  
  // Special violation: Facts acknowledged but not used for reasoning
  if (escalationCheck.results.known_facts && 
      !escalationCheck.results.parallels_used && 
      !escalationCheck.results.scenarios_presented) {
    result.violations.push({
      type: 'facts_not_utilized',
      detail: 'Facts were stated but not used for inference or scenario analysis',
      severity: 'medium'
    });
  }
  
  // Determine if passed
  result.passed = result.violations.length === 0;

  // ISSUE #406 FIX: Apply structured reasoning guidance when steps are missing
  // PRINCIPLE: "Uncertainty is a reason to work harder, not permission to stop"
  if (!result.passed && escalationCheck.missing.length > 0) {
    // Build a structured reasoning scaffold that guides completion
    const reasoningScaffold = buildReasoningScaffold(escalationCheck.missing, response);

    if (reasoningScaffold) {
      result.correction_applied = true;
      result.corrected_response = response + reasoningScaffold;
      result.correction_type = 'reasoning_scaffold';
    } else {
      // Fallback: Flag for manual review
      result.correction_needed = true;
      result.missing_steps = escalationCheck.missing;
    }
  }
  
  console.log('[REASONING-ESCALATION]', {
    enforced: result.enforced,
    passed: result.passed,
    steps: `${escalationCheck.completedCount}/${escalationCheck.totalSteps}`,
    violations: result.violations.length,
    correction: result.correction_applied
  });
  
  return result;
}

/**
 * Low Confidence Escalation Handler  
 * PRINCIPLE (Issue #402 Finding #13): Escalate, don't fail silently
 * 
 * When confidence is low:
 * 1. Trigger external lookup if appropriate
 * 2. Apply reasoning escalation (use known facts, parallels, scenarios)
 * 3. Ask clarifying questions
 * 4. NEVER just add a disclaimer and ship low-confidence answer
 */
function handleLowConfidence(confidence, context = {}) {
  const threshold = 0.6;
  
  if (confidence >= threshold) {
    return {
      action: 'none',
      reason: 'Confidence acceptable',
      confidence: confidence
    };
  }
  
  console.log(`[LOW-CONFIDENCE-ESCALATION] Confidence ${confidence.toFixed(2)} below threshold ${threshold}`);
  
  // Escalation strategy based on context
  const escalations = [];
  
  // 1. Check if external lookup would help
  const canLookup = context.truthType === 'EPHEMERAL' || 
                   context.truthType === 'DYNAMIC' ||
                   context.hasProperNouns ||
                   context.hasNewsIntent;
  
  if (canLookup && !context.lookupPerformed) {
    escalations.push({
      type: 'external_lookup',
      reason: 'Low confidence + ephemeral/dynamic topic = lookup needed',
      priority: 'high'
    });
  }
  
  // 2. Check if reasoning escalation would help
  const hasUncertainty = context.message && (
    /\b(unclear|uncertain|not sure|depends|varies|could be)\b/i.test(context.message) ||
    confidence < 0.5
  );
  
  if (hasUncertainty) {
    escalations.push({
      type: 'reasoning_escalation',
      reason: 'Uncertainty detected - apply bounded reasoning',
      priority: 'high',
      steps: ESCALATION_STEPS
    });
  }
  
  // 3. Check if clarifying questions would help
  const isAmbiguous = context.semanticAnalysis?.confidence < 0.7 ||
                     context.message?.split(' ').length < 5;
  
  if (isAmbiguous && !context.clarificationAsked) {
    escalations.push({
      type: 'clarify',
      reason: 'Ambiguous query - need more context',
      priority: 'medium',
      questions: [
        'Could you provide more context about what you\'re looking for?',
        'What specific aspect are you most interested in?',
        'Is there additional information that would help me give you a better answer?'
      ]
    });
  }
  
  // 4. If no other escalation possible, apply reasoning with known facts
  if (escalations.length === 0) {
    escalations.push({
      type: 'bounded_reasoning',
      reason: 'Low confidence, no external source available - use known facts + scenarios',
      priority: 'medium'
    });
  }
  
  return {
    action: 'escalate',
    confidence: confidence,
    threshold: threshold,
    escalations: escalations,
    message: `Confidence ${(confidence * 100).toFixed(0)}% requires escalation`,
    recommended: escalations[0] // Highest priority escalation
  };
}

export {
  enforceReasoningEscalation,
  checkEscalationSteps,
  detectPrematureTermination,
  generateEscalationAppend,
  handleLowConfidence, // NEW: Finding #13
  ESCALATION_STEPS,
  TERMINATION_MARKERS
};
