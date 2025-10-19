// optimization.js - Response Enhancement and Truth Validation

export function runOptimizationEnhancer({
  mode,
  baseResponse,
  message,
  triggeredFrameworks = [],
  vaultLoaded = false,
}) {
  try {
    // STEP 1: Truth Validation
    const truthScore = validateTruthContent(baseResponse);

    // STEP 2: Mode Compliance Check
    const modeCompliance = checkModeCompliance(baseResponse, mode);

    // STEP 3: Enhancement Based on Context
    let enhancedResponse = baseResponse;

    if (vaultLoaded && triggeredFrameworks.length > 0) {
      enhancedResponse = applyVaultEnhancements(
        baseResponse,
        triggeredFrameworks,
      );
    }

    // STEP 4: Risk Surface Enhancement
    if (mode === "business_validation") {
      enhancedResponse = enhanceBusinessRisks(enhancedResponse);
    }

    // STEP 5: Quality Scoring
    const qualityMetrics = calculateQualityScore(enhancedResponse, mode);

    // Return object format expected by production chat.js
    return {
      enhancedResponse: enhancedResponse,
      optimization_applied: true,
      optimization_tags: ["truth_validation", "mode_compliance"],
      optimizations: qualityMetrics,
    };
  } catch (error) {
    console.error("Optimization enhancement failed:", error);
    // Return original baseResponse if enhancement fails
    return {
      enhancedResponse: baseResponse,
      optimization_applied: false,
      optimization_tags: [],
      optimizations: {},
    };
  }
}

function validateTruthContent(baseResponse) {
  // Check for hallucination indicators
  const hallucinationFlags = [
    /\d{4}-\d{2}-\d{2}/, // Specific dates (often hallucinated)
    /\$[\d,]+\.\d{2}/, // Precise dollar amounts
    /\d+\.\d+%/, // Precise percentages
    /(studies show|research indicates|data suggests)/i, // Vague authority claims
    /(according to|based on a study)/i, // Unsourced claims
  ];

  let truthScore = 100;

  hallucinationFlags.forEach((flag) => {
    if (flag.test(baseResponse)) {
      truthScore -= 15; // Penalize potential hallucinations
    }
  });

  // Check for truth indicators
  const truthIndicators = [
    /(I don't know|uncertain|unclear)/i,
    /(estimated|approximately|roughly)/i,
    /(confidence: |likely|probably)/i,
    /(depends on|varies based on)/i,
  ];

  truthIndicators.forEach((indicator) => {
    if (indicator.test(baseResponse)) {
      truthScore += 5; // Reward uncertainty acknowledgment
    }
  });

  return Math.max(0, Math.min(100, truthScore));
}

function checkModeCompliance(baseResponse, mode) {
  switch (mode) {
    case "truth_general":
      return checkTruthModeCompliance(baseResponse);
    case "business_validation":
      return checkBusinessModeCompliance(baseResponse);
    default:
      return "UNKNOWN_MODE";
  }
}

function checkTruthModeCompliance(baseResponse) {
  const requiredElements = [/confidence:/i, /(high|medium|low|unknown)/i];

  const compliance = requiredElements.every((element) =>
    element.test(baseResponse),
  );
  return compliance ? "COMPLIANT" : "PARTIAL";
}

function checkBusinessModeCompliance(baseResponse) {
  const requiredElements = [
    /(survival impact|cash flow|risk)/i,
    /\$[\d,]+/i, // Dollar amounts
    /(high|medium|low|critical)/i,
  ];

  const compliance = requiredElements.filter((element) =>
    element.test(baseResponse),
  ).length;

  if (compliance >= 2) return "COMPLIANT";
  if (compliance >= 1) return "PARTIAL";
  return "NON_COMPLIANT";
}

function applyVaultEnhancements(baseResponse, triggeredFrameworks) {
  let enhanced = baseResponse;

  // Check triggered frameworks by name
  const frameworkNames = triggeredFrameworks.map((tf) => tf.name || tf);

  if (frameworkNames.includes("pricing_strategy")) {
    enhanced += `\n\n🍌 SITE MONKEYS CONTEXT: This decision impacts our service pricing strategy and client positioning.`;
  }

  if (frameworkNames.includes("resource_allocation")) {
    enhanced += `\n\n💰 FINANCIAL REALITY: Consider impact on current runway and client commitments.`;
  }

  if (frameworkNames.includes("operational_decisions")) {
    enhanced += `\n\n🎯 BRAND ALIGNMENT: Evaluate consistency with Site Monkeys positioning and values.`;
  }

  return enhanced;
}

function enhanceBusinessRisks(baseResponse) {
  // Add proactive risk surfacing if missing
  if (!baseResponse.toLowerCase().includes("risk")) {
    baseResponse += `\n\n⚠️ ADDITIONAL RISKS TO CONSIDER:
- Market timing and competitive response
- Implementation complexity and timeline
- Resource allocation and opportunity cost`;
  }

  return baseResponse;
}

function calculateQualityScore(baseResponse, mode) {
  const metrics = {
    word_count: baseResponse.split(" ").length,
    has_confidence: /confidence:/i.test(baseResponse),
    has_risks: /risk/i.test(baseResponse),
    has_numbers: /\$|\d+%|\d+/.test(baseResponse),
    has_uncertainty: /(uncertain|unclear|depends)/i.test(baseResponse),
  };

  let score = 0;

  // Word count scoring
  if (metrics.word_count >= 50 && metrics.word_count <= 300) score += 20;
  if (metrics.word_count >= 300 && metrics.word_count <= 500) score += 25;
  if (metrics.word_count > 500) score += 15;

  // Content quality scoring
  if (metrics.has_confidence) score += 25;
  if (metrics.has_risks && mode === "business_validation") score += 25;
  if (metrics.has_numbers && mode === "business_validation") score += 20;
  if (metrics.has_uncertainty) score += 10; // Truth-positive

  return {
    overall_score: score,
    word_count: metrics.word_count,
    truth_indicators: metrics.has_uncertainty,
    business_indicators: metrics.has_risks && metrics.has_numbers,
  };
}

export function generateMetaQuestions(originalResponse, mode) {
  // Generate follow-up questions to challenge assumptions
  const questions = [];

  if (mode === "business_validation") {
    questions.push("What's the worst-case scenario if this goes wrong?");
    questions.push("How does this impact your cash runway?");
    questions.push("What competitors might respond to this move?");
    questions.push("What assumptions are you making about customer behavior?");
  } else {
    questions.push("What additional information would change this assessment?");
    questions.push("What are the key uncertainties here?");
    questions.push("How confident should you be in this conclusion?");
  }

  return questions.slice(0, 2); // Return top 2 most relevant
}
