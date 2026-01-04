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

// Generate deterministic escalation append for missing steps
function generateEscalationAppend(missingSteps, context = {}) {
  if (missingSteps.length === 0) return null;
  
  const sections = [];
  
  // Add header
  sections.push("\n\n---\n**Reasoning through uncertainty:**\n");
  
  // Add templates for missing steps (to be filled by regeneration or manual review)
  for (const step of missingSteps) {
    sections.push(`\n${step.template}\n`);
  }
  
  return sections.join('');
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
  
  // If failed: apply deterministic correction
  if (!result.passed && escalationCheck.missing.length > 0) {
    const append = generateEscalationAppend(escalationCheck.missing, context);
    if (append) {
      result.correction_applied = true;
      result.corrected_response = response + append;
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

export {
  enforceReasoningEscalation,
  checkEscalationSteps,
  detectPrematureTermination,
  generateEscalationAppend,
  ESCALATION_STEPS,
  TERMINATION_MARKERS
};
