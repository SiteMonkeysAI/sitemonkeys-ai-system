// EXPERT VALIDATOR - Quality Assurance & Drift Detection
// Ensures expert-level thinking, catches "soft lies", detects personality drift

export const EXPERT_QUALITY_STANDARDS = {
  confidence_scoring_required: true,
  assumption_flagging_required: true,
  multi_step_reasoning_required: true,
  alternative_solutions_required: true,
  risk_identification_required: true,
  next_steps_required: true,
  source_validation_required: true,
};

export const DRIFT_INDICATORS = {
  generic_helper: [
    "i'm here to help",
    "happy to assist",
    "let me know if you need anything else",
    "i hope this helps",
    "feel free to ask",
  ],
  accommodating_language: [
    "whatever works best for you",
    "it's up to you",
    "that might be fine",
    "could potentially work",
    "possibly consider",
  ],
  weak_expertise: [
    "you might want to",
    "it could be helpful to",
    "consider looking into",
    "you may wish to",
    "it's worth thinking about",
  ],
  false_confidence: [
    "definitely will",
    "guaranteed to work",
    "always works",
    "never fails",
    "absolutely certain",
  ],
};

export function validateExpertQuality(response, expertDomain, originalMessage) {
  const validation = {
    expert_level: 0,
    quality_score: 0,
    missing_elements: [],
    drift_detected: false,
    soft_lies_detected: false,
    enforcement_needed: false,
    expert_indicators: checkExpertIndicators(response, expertDomain),
    quality_checks: performQualityChecks(response, originalMessage),
    drift_analysis: detectDrift(response),
    assumption_analysis: analyzeAssumptions(response),
  };

  // Calculate expert level score
  validation.expert_level = calculateExpertLevel(validation.expert_indicators);

  // Calculate overall quality score
  validation.quality_score = calculateQualityScore(validation);

  // Determine if enforcement is needed
  validation.enforcement_needed =
    validation.expert_level < 70 ||
    validation.drift_analysis.total_drift_score > 30 ||
    validation.quality_score < 80;

  return validation;
}

export function checkExpertIndicators(response, expertDomain) {
  const indicators = {
    uses_specific_frameworks: false,
    demonstrates_deep_knowledge: false,
    identifies_blind_spots: false,
    provides_professional_insights: false,
    shows_industry_awareness: false,
    uses_expert_terminology: false,
    references_best_practices: false,
    anticipates_problems: false,
  };

  const _responseLower = response.toLowerCase();

  // Domain-specific expert indicators
  if (expertDomain === "financial_analysis") {
    indicators.uses_specific_frameworks =
      /cash flow|roi|margin|break-even|runway|scenario/i.test(response);
    indicators.uses_expert_terminology =
      /ebitda|cac|ltv|burn rate|runway|working capital/i.test(response);
  } else if (expertDomain === "business_strategy") {
    indicators.uses_specific_frameworks =
      /competitive|market|positioning|differentiation|value prop/i.test(
        response,
      );
    indicators.uses_expert_terminology =
      /moat|traction|product-market fit|go-to-market/i.test(response);
  }

  // Universal expert indicators
  indicators.demonstrates_deep_knowledge =
    response.length > 500 && /because|since|due to|given that/i.test(response);
  indicators.identifies_blind_spots =
    /haven't considered|might miss|blind spot|overlooked|not seeing/i.test(
      response,
    );
  indicators.provides_professional_insights =
    /in my experience|best practice|typically|usually|pattern/i.test(response);
  indicators.anticipates_problems =
    /risk|challenge|potential issue|concern|caution|watch out/i.test(response);
  indicators.references_best_practices =
    /best practice|industry standard|proven approach|established method/i.test(
      response,
    );
  indicators.shows_industry_awareness =
    /market trend|industry|competitive|benchmark|standard/i.test(response);

  return indicators;
}

export function performQualityChecks(response, _originalMessage) {
  const checks = {
    has_confidence_scoring: /confidence:|confidence\s+(high|medium|low)/i.test(
      response,
    ),
    flags_assumptions: /assum|presuppos|given that|based on the idea/i.test(
      response,
    ),
    provides_alternatives:
      /alternative|instead|could also|another approach|option/i.test(response),
    identifies_risks: /risk|danger|concern|caution|potential issue/i.test(
      response,
    ),
    gives_next_steps: /next step|recommend|suggest|should|action/i.test(
      response,
    ),
    shows_reasoning: /because|since|due to|therefore|as a result/i.test(
      response,
    ),
    addresses_complexity: response.length > 300,
    avoids_generic_advice: !containsGenericAdvice(response),
  };

  return checks;
}

export function detectDrift(response) {
  const driftAnalysis = {
    generic_helper_score: 0,
    accommodating_score: 0,
    weak_expertise_score: 0,
    false_confidence_score: 0,
    total_drift_score: 0,
    drift_detected: false,
    drift_patterns: [],
  };

  const responseLower = response.toLowerCase();

  // Check for each drift pattern
  Object.entries(DRIFT_INDICATORS).forEach(([category, patterns]) => {
    const matches = patterns.filter((pattern) =>
      responseLower.includes(pattern.toLowerCase()),
    );
    if (matches.length > 0) {
      driftAnalysis[`${category}_score`] = matches.length * 10;
      driftAnalysis.drift_patterns.push({
        category,
        matches,
        severity:
          matches.length > 2 ? "high" : matches.length > 1 ? "medium" : "low",
      });
    }
  });

  // Calculate total drift score
  driftAnalysis.total_drift_score =
    driftAnalysis.generic_helper_score +
    driftAnalysis.accommodating_score +
    driftAnalysis.weak_expertise_score +
    driftAnalysis.false_confidence_score;

  driftAnalysis.drift_detected = driftAnalysis.total_drift_score > 20;

  return driftAnalysis;
}

export function analyzeAssumptions(response) {
  const assumptionAnalysis = {
    assumptions_flagged: /assum|presuppos|given that|based on the idea/i.test(
      response,
    ),
    unvalidated_claims: findUnvalidatedClaims(response),
    confidence_gaps: findConfidenceGaps(response),
    assumption_count: countAssumptions(response),
    quality_score: 0,
  };

  // Calculate assumption quality score
  assumptionAnalysis.quality_score =
    calculateAssumptionQuality(assumptionAnalysis);

  return assumptionAnalysis;
}

export function findUnvalidatedClaims(response) {
  const strongClaims = [
    "will result in",
    "guarantees",
    "always works",
    "never fails",
    "definitely will",
    "certain to",
  ];

  const unvalidated = [];
  strongClaims.forEach((claim) => {
    if (response.toLowerCase().includes(claim.toLowerCase())) {
      unvalidated.push(claim);
    }
  });

  return unvalidated;
}

export function findConfidenceGaps(response) {
  // Look for factual claims without confidence indicators
  const factualPatterns = [
    /will cost \$[\d,]+/gi,
    /takes \d+ months/gi,
    /results in \d+%/gi,
    /requires \$[\d,]+/gi,
  ];

  const gaps = [];
  factualPatterns.forEach((pattern) => {
    const matches = response.match(pattern);
    if (matches && !response.toLowerCase().includes("confidence")) {
      gaps.push(...matches);
    }
  });

  return gaps;
}

export function countAssumptions(response) {
  const assumptionWords = [
    "assume",
    "assuming",
    "presume",
    "suppose",
    "given that",
    "if we assume",
  ];
  return assumptionWords.filter((word) =>
    response.toLowerCase().includes(word.toLowerCase()),
  ).length;
}

export function containsGenericAdvice(response) {
  const genericPhrases = [
    "it depends",
    "every situation is different",
    "consider your specific needs",
    "consult with a professional",
    "do your research",
    "it's important to",
    "make sure to",
  ];

  return genericPhrases.some((phrase) =>
    response.toLowerCase().includes(phrase.toLowerCase()),
  );
}

export function calculateExpertLevel(indicators) {
  const totalIndicators = Object.keys(indicators).length;
  const trueIndicators = Object.values(indicators).filter(Boolean).length;
  return Math.round((trueIndicators / totalIndicators) * 100);
}

export function calculateQualityScore(validation) {
  const qualityChecks = validation.quality_checks;
  const totalChecks = Object.keys(qualityChecks).length;
  const passedChecks = Object.values(qualityChecks).filter(Boolean).length;

  let baseScore = Math.round((passedChecks / totalChecks) * 100);

  // Penalties for drift
  baseScore -= validation.drift_analysis.total_drift_score;

  // Penalties for soft lies
  baseScore -= validation.assumption_analysis.unvalidated_claims.length * 5;

  return Math.max(baseScore, 0);
}

export function calculateAssumptionQuality(analysis) {
  let score = 100;

  // Penalty for unvalidated claims
  score -= analysis.unvalidated_claims.length * 20;

  // Penalty for confidence gaps
  score -= analysis.confidence_gaps.length * 10;

  // Bonus for flagged assumptions
  if (analysis.assumptions_flagged) {
    score += 10;
  }

  return Math.max(score, 0);
}

export function enforceExpertStandards(
  response,
  expertDomain,
  originalMessage,
) {
  const validation = validateExpertQuality(
    response,
    expertDomain,
    originalMessage,
  );

  if (!validation.enforcement_needed) {
    return response; // Meets expert standards
  }

  let enforcedResponse = response;

  // Add missing expert elements
  if (validation.expert_level < 70) {
    enforcedResponse = addExpertEnhancements(
      enforcedResponse,
      expertDomain,
      validation,
    );
  }

  // Fix drift issues
  if (validation.drift_analysis.drift_detected) {
    enforcedResponse = correctDrift(
      enforcedResponse,
      validation.drift_analysis,
    );
  }

  // Fix assumption issues
  if (validation.assumption_analysis.quality_score < 70) {
    enforcedResponse = improveAssumptionHandling(
      enforcedResponse,
      validation.assumption_analysis,
    );
  }

  // Add quality validation notice
  enforcedResponse += `\n\n🎯 EXPERT VALIDATION APPLIED:
- Expert Level: ${validation.expert_level}% (Target: 70%+)
- Quality Score: ${validation.quality_score}% (Target: 80%+)
- Drift Detection: ${validation.drift_analysis.drift_detected ? "CORRECTED" : "CLEAN"}
- Assumption Quality: ${validation.assumption_analysis.quality_score}%

Expert-level analysis enforced to meet professional standards.`;

  return enforcedResponse;
}

export function addExpertEnhancements(response, expertDomain, validation) {
  let enhanced = response;

  // Add confidence scoring if missing
  if (!validation.quality_checks.has_confidence_scoring) {
    enhanced +=
      "\n\nCONFIDENCE: Medium (70%) - Based on professional experience and available information.";
  }

  // Add assumption flagging if missing
  if (!validation.quality_checks.flags_assumptions) {
    enhanced +=
      "\n\nKEY ASSUMPTIONS: This analysis assumes standard market conditions and typical implementation approaches.";
  }

  // Add risk identification if missing
  if (!validation.quality_checks.identifies_risks) {
    enhanced +=
      "\n\nRISK CONSIDERATIONS: Potential challenges include market variability, implementation complexity, and resource availability.";
  }

  // Add next steps if missing
  if (!validation.quality_checks.gives_next_steps) {
    enhanced +=
      "\n\nRECOMMENDED NEXT STEPS: 1) Validate key assumptions with current data 2) Consider alternative approaches 3) Monitor implementation closely.";
  }

  return enhanced;
}

export function correctDrift(response, driftAnalysis) {
  let corrected = response;

  driftAnalysis.drift_patterns.forEach((pattern) => {
    pattern.matches.forEach((match) => {
      // Replace weak language with strong expert language
      corrected = corrected.replace(
        new RegExp(match, "gi"),
        getExpertReplacement(match),
      );
    });
  });

  return corrected;
}

export function getExpertReplacement(weakPhrase) {
  const replacements = {
    "i'm here to help": "Based on professional analysis",
    "happy to assist": "Professional assessment indicates",
    "you might want to": "Recommend implementing",
    "could potentially work": "Analysis suggests",
    "it's up to you": "Decision factors to consider",
    "whatever works best": "Optimal approach requires",
  };

  return (
    replacements[weakPhrase.toLowerCase()] || "Professional analysis indicates"
  );
}

export function improveAssumptionHandling(response, assumptionAnalysis) {
  let improved = response;

  // Add assumption warnings for unvalidated claims
  if (assumptionAnalysis.unvalidated_claims.length > 0) {
    improved +=
      "\n\n⚠️ ASSUMPTION ALERT: Some claims in this analysis require validation with specific data.";
  }

  // Add confidence indicators for gaps
  if (assumptionAnalysis.confidence_gaps.length > 0) {
    improved +=
      "\n\nCONFIDENCE NOTE: Specific figures mentioned require validation against current market conditions.";
  }

  return improved;
}

export function monitorSystemDrift(responses) {
  // Track drift patterns over multiple responses
  const driftTracking = {
    response_count: responses.length,
    average_expert_level: 0,
    average_quality_score: 0,
    drift_trend: "stable",
    intervention_needed: false,
  };

  if (responses.length === 0) return driftTracking;

  const validations = responses.map((response) =>
    validateExpertQuality(response, "general_problem_solving", "test"),
  );

  driftTracking.average_expert_level =
    validations.reduce((sum, v) => sum + v.expert_level, 0) /
    validations.length;

  driftTracking.average_quality_score =
    validations.reduce((sum, v) => sum + v.quality_score, 0) /
    validations.length;

  // Detect trends
  if (responses.length > 3) {
    const recent = validations.slice(-3);
    const earlier = validations.slice(0, -3);

    const recentAvg =
      recent.reduce((sum, v) => sum + v.quality_score, 0) / recent.length;
    const earlierAvg =
      earlier.reduce((sum, v) => sum + v.quality_score, 0) / earlier.length;

    if (recentAvg < earlierAvg - 10) {
      driftTracking.drift_trend = "declining";
      driftTracking.intervention_needed = true;
    } else if (recentAvg > earlierAvg + 10) {
      driftTracking.drift_trend = "improving";
    }
  }

  return driftTracking;
}
