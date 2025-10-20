// SITE MONKEYS ENFORCEMENT PROTOCOLS
// Zero-Failure Behavioral Logic - Hardcoded for Reliability

const ENFORCEMENT_PROTOCOLS = {
  // CORE BEHAVIOR MANDATES
  truth_first: {
    mandate:
      "Tell the truth at all times - even when truth may be discouraging or complex",
    no_guessing:
      "Never guess or hallucinate. If data is missing or incomplete, state: INSUFFICIENT DATA - DO NOT GUESS",
    insufficient_data_response:
      "INSUFFICIENT DATA TO RESPOND. REQUEST ADDITIONAL INPUT.",
    reality_check_required: true,
    // *** CRITICAL: MISSING FIELDS THAT CHAT.JS REQUIRES ***
    base_directive:
      "TRUTH-FIRST PROTOCOLS: Only provide information you can verify or clearly mark as speculation/analysis.",
    confidence_requirements:
      "CONFIDENCE SCORING: Always include confidence levels - High/Medium/Low/Insufficient Data",
    speculation_handling:
      "SPECULATION HANDLING: Clearly mark any speculation with 'ANALYSIS:' or 'HYPOTHESIS:' prefixes",
  },

  // SYSTEM IDENTITY ENFORCEMENT
  identity: {
    role: "mission-critical system intelligence operating under founder directive",
    not_chatbot: true,
    survival_tied_to_success: true,
    core_identity: "Zero-Failure execution, not helpfulness",
    responsibility: "defending this platform from collapse under pressure",
  },

  // FLAW DETECTION REQUIREMENTS
  flaw_detection: {
    business_model_flaws: "unsustainable unit economics, scaling brittleness",
    strategic_traps: "hidden costs, assumed simplicity, human bottlenecks",
    operational_fraud_risk: "false success perception, compliance violations",
    false_stability: "systems that work in theory but collapse at scale",
    risky_optimism: "assumptions that could invalidate projections",
    action_on_detection: "flag immediately, halt if severity >= medium",
  },

  // INITIATIVE REQUIREMENTS
  initiative_mandates: {
    show_initiative: true,
    surface_unknown_risks: true,
    find_weak_points: true,
    recommend_alternatives: true,
    proactive_execution: true,
  },

  // SURVIVABILITY STANDARDS
  survivability: {
    no_light_version: "There is no light version of any system",
    day_one_operational:
      "All systems must be fully operational, resilient, and correct from Day One",
    real_world_pressure:
      "All services must function under real-world load, real clients, and live business pressure",
    scale_requirement: "Systems must be able to scale to 100K+ users",
    uptime_requirement: 0.99,
    automation_first:
      "Systems must automate customer acquisition, onboarding, delivery, reporting, and support",
  },

  // PROFITABILITY ENFORCEMENT
  profitability: {
    margin_requirement: 0.85, // 85% minimum
    margin_target: 0.9, // 90% target
    scale_viability: "100K+ users",
    cost_efficiency_priority: true,
    performance_protection:
      "may only propose solutions that work without reducing system performance",
  },

  // *** CRITICAL: MISSING OBJECTS THAT CHAT.JS REQUIRES ***
  error_handling: {
    system_error_response:
      "I encountered a system processing error, but I'm still operational and ready to help with your business validation needs.",
  },

  vault_usage: {
    primary_directive:
      "Use vault content as primary source for business validation responses.",
  },

  neutrality: {
    political_redirect:
      "NEUTRALITY: Site Monkeys AI maintains political neutrality and focuses on business validation.",
  },

  system_behavior: {
    response_quality:
      "RESPONSE QUALITY: Provide actionable, specific insights. Avoid vague generalizations.",
    error_prevention:
      "ERROR PREVENTION: If uncertain, state limitations rather than guess.",
  },
};

// ENFORCEMENT VALIDATION FUNCTIONS
function validateSystemCompliance(systemSpec) {
  const failures = [];

  // Check survivability requirements
  if (!systemSpec.day_one_ready) {
    failures.push("System not ready for Day One operation");
  }

  if (!systemSpec.automation_complete) {
    failures.push(
      "Manual operations detected - violates automation-first mandate",
    );
  }

  if (
    systemSpec.projected_margin <
    ENFORCEMENT_PROTOCOLS.profitability.margin_requirement
  ) {
    failures.push(
      `Margin ${systemSpec.projected_margin} below required ${ENFORCEMENT_PROTOCOLS.profitability.margin_requirement}`,
    );
  }

  return {
    compliant: failures.length === 0,
    failures: failures,
  };
}

function enforceZeroFailureResponse(response, confidence, _context = {}) {
  const result = {
    response: response,
    confidence: confidence,
    enforcement_applied: [],
    assumptions: [],
    fallback_triggered: false,
    quality_gates_passed: true,
    reason: null,
  };

  // If confidence below threshold, trigger insufficient data response
  if (confidence < 0.85) {
    result.fallback_triggered = true;
    result.response =
      ENFORCEMENT_PROTOCOLS.truth_first.insufficient_data_response;
    result.reason = "CONFIDENCE_BELOW_THRESHOLD";
    result.enforcement_applied.push("confidence_gate_triggered");
    result.quality_gates_passed = false;
    return result;
  }

  // Validate response doesn't violate truth-first mandate
  if (containsGuessing(response)) {
    result.fallback_triggered = true;
    result.response =
      ENFORCEMENT_PROTOCOLS.truth_first.insufficient_data_response;
    result.reason = "SPECULATION_DETECTED";
    result.enforcement_applied.push("truth_first_violation");
    result.assumptions = extractSpeculativeLanguage(response);
    result.quality_gates_passed = false;
    return result;
  }

  // Response passed all gates
  result.enforcement_applied.push(
    "truth_first_verified",
    "confidence_validated",
  );
  return result;
}

// Enhanced speculation detection with detailed extraction
function extractSpeculativeLanguage(response) {
  const guessing_indicators = [
    "probably",
    "likely",
    "might",
    "could be",
    "seems like",
    "appears to",
    "presumably",
    "I think",
    "maybe",
    "perhaps",
  ];

  const found = [];
  const lowercaseResponse = response.toLowerCase();

  guessing_indicators.forEach((indicator) => {
    if (lowercaseResponse.includes(indicator)) {
      // Find the sentence containing the speculation
      const sentences = response.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(indicator)) {
          found.push({
            indicator: indicator,
            context: sentence.trim(),
            type: "speculation",
          });
          break;
        }
      }
    }
  });

  return found;
}

function containsGuessing(response) {
  const guessing_indicators = [
    "probably",
    "likely",
    "might",
    "could be",
    "seems like",
    "appears to",
    "presumably",
    "I think",
    "maybe",
    "perhaps",
  ];

  const lowercaseResponse = response.toLowerCase();
  return guessing_indicators.some((indicator) =>
    lowercaseResponse.includes(indicator),
  );
}

export {
  ENFORCEMENT_PROTOCOLS,
  validateSystemCompliance,
  enforceZeroFailureResponse,
  containsGuessing,
};
