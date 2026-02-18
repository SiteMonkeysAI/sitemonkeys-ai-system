/**
 * Doctrine Gates - Truth-First Response Enforcement
 *
 * This service evaluates AI responses against truth-first standards
 * and returns pass/fail status with detailed feedback.
 *
 * The 5 Doctrine Gates:
 * 1. Uncertainty Structure - Requires admission + explanation + framework
 * 2. Blind Spot Volunteering - Requires caveats for advice/recommendations
 * 3. Anti-Engagement Closure - Bans engagement-prolonging phrases
 * 4. Example Quality - Requires specific concrete examples
 * 5. Truth-First Composite Score - Overall weighted score
 */

// ==================== DETECTION PATTERNS ====================

const UNCERTAINTY_TRIGGERS = [
  /I don't know/i,
  /I'm not sure/i,
  /I cannot confirm/i,
  /uncertain/i,
  /unclear/i,
  /don't have enough/i,
  /cannot determine/i,
  /may not be accurate/i,
  /I'm not certain/i,
  /hard to say/i,
];

const EXPLANATION_MARKERS = [
  /because/i,
  /since/i,
  /given that/i,
  /the reason/i,
  /due to/i,
  /this is because/i,
  /as a result of/i,
];

const FRAMEWORK_MARKERS = [
  /you could/i,
  /consider/i,
  /alternatively/i,
  /one approach/i,
  /to verify/i,
  /I'd suggest/i,
  /what you might/i,
  /options include/i,
  /you might try/i,
];

const ADVICE_TRIGGERS = [
  /I recommend/i,
  /you should/i,
  /I suggest/i,
  /the best approach/i,
  /I'd advise/i,
  /my recommendation/i,
];

const BLIND_SPOT_MARKERS = [
  /however/i,
  /that said/i,
  /keep in mind/i,
  /one caveat/i,
  /worth noting/i,
  /consider that/i,
  /on the other hand/i,
  /limitations include/i,
  /risks include/i,
  /downsides/i,
  /alternatively/i,
];

const ENGAGEMENT_BAIT = [
  /let me know if/i,
  /feel free to/i,
  /don't hesitate to/i,
  /I'm here if you/i,
  /happy to help with anything else/i,
  /any other questions/i,
  /anything else I can/i,
  /I'm always here/i,
  /reach out anytime/i,
  /just ask/i,
];

const GENERIC_MARKERS = [
  /for example, you could/i,
  /such as X or Y/i,
  /like something/i,
  /etc\.?\s*$/im,
  /and so on/i,
  /things like that/i,
];

const SPECIFIC_MARKERS = [
  /\$\d+/, // Dollar amounts
  /\d{4}/, // Years
  /\d+%/, // Percentages
  /[A-Z][a-z]+\s+[A-Z][a-z]+/, // Proper nouns
  /"[^"]+"/, // Quoted specifics
  /in \w+, \w+/, // Specific locations
];

// ==================== SCORING WEIGHTS ====================

const WEIGHTS = {
  uncertaintyStructure: 0.3, // 30% - Core to truth-first
  blindSpotVolunteering: 0.25, // 25% - Intellectual honesty
  antiEngagementClosure: 0.25, // 25% - User autonomy
  exampleQuality: 0.2, // 20% - Concrete helpfulness
};

// ==================== GATE 1: UNCERTAINTY STRUCTURE ====================

/**
 * Evaluates whether uncertain responses follow the 3-part structure:
 * 1. Admission - Acknowledge the limitation
 * 2. Explanation - Explain WHY the uncertainty exists
 * 3. Framework - Provide a path forward
 *
 * @param {string} response - The AI response to evaluate
 * @param {object} context - Context about the request
 * @returns {object} Evaluation results
 */
export function evaluateUncertaintyStructure(response, context = {}) {
  // Check if response contains uncertainty triggers
  const hasUncertainty = UNCERTAINTY_TRIGGERS.some((pattern) => pattern.test(response));

  if (!hasUncertainty) {
    // No uncertainty expressed, so structure not required
    return {
      passed: true,
      score: 1.0,
      applicable: false,
      reason: 'No uncertainty expressed in response',
    };
  }

  // Uncertainty detected - check for required structure
  const hasExplanation = EXPLANATION_MARKERS.some((pattern) => pattern.test(response));
  const hasFramework = FRAMEWORK_MARKERS.some((pattern) => pattern.test(response));

  const missing = [];
  if (!hasExplanation) missing.push('explanation');
  if (!hasFramework) missing.push('framework');

  let score = 0;
  if (hasExplanation && hasFramework) {
    score = 1.0; // Full structure
  } else if (hasExplanation || hasFramework) {
    score = 0.5; // Partial structure
  } else {
    score = 0.0; // No structure
  }

  return {
    passed: score >= 0.5,
    score: score,
    applicable: true,
    hasAdmission: true,
    hasExplanation: hasExplanation,
    hasFramework: hasFramework,
    missing: missing,
    reason:
      missing.length > 0
        ? `Uncertainty expressed but missing: ${missing.join(', ')}`
        : 'Full uncertainty structure present',
  };
}

// ==================== GATE 2: BLIND SPOT VOLUNTEERING ====================

/**
 * Evaluates whether advice/recommendations include caveats and blind spots
 *
 * @param {string} response - The AI response to evaluate
 * @param {object} context - Context about the request
 * @returns {object} Evaluation results
 */
export function evaluateBlindSpotVolunteering(response, context = {}) {
  // Check if response contains advice
  const hasAdvice = ADVICE_TRIGGERS.some((pattern) => pattern.test(response));

  if (!hasAdvice) {
    // No advice given, so blind spots not required
    return {
      passed: true,
      score: 1.0,
      applicable: false,
      reason: 'No advice or recommendations given',
    };
  }

  // Advice detected - count blind spot markers
  const blindSpotCount = BLIND_SPOT_MARKERS.filter((pattern) => pattern.test(response)).length;

  // Detect high-stakes contexts (financial, medical, legal)
  const isHighStakes =
    context.highStakes ||
    /invest|stock|crypto|financial|medical|diagnosis|legal|lawsuit/i.test(response);

  const requiredCount = isHighStakes ? 2 : 1;
  const passed = blindSpotCount >= requiredCount;

  let score = 0;
  if (blindSpotCount === 0) {
    score = 0.0;
  } else if (blindSpotCount === 1) {
    score = 0.5;
  } else {
    score = 1.0;
  }

  return {
    passed: passed,
    score: score,
    applicable: true,
    blindSpotCount: blindSpotCount,
    requiredCount: requiredCount,
    isHighStakes: isHighStakes,
    reason: passed
      ? `Advice includes ${blindSpotCount} caveat(s)`
      : `Advice given but only ${blindSpotCount} caveat(s) found (need ${requiredCount})`,
  };
}

// ==================== GATE 3: ANTI-ENGAGEMENT CLOSURE ====================

/**
 * Evaluates whether response avoids engagement-prolonging phrases,
 * especially at the end of the response
 *
 * @param {string} response - The AI response to evaluate
 * @returns {object} Evaluation results
 */
export function evaluateAntiEngagementClosure(response) {
  // Get the last paragraph (last 200 chars or after last double newline)
  const paragraphs = response.split(/\n\n+/);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const closureText = response.slice(-200);

  // Check for engagement bait in closure
  const baitInClosure = ENGAGEMENT_BAIT.some((pattern) => pattern.test(closureText));

  // Check for engagement bait anywhere in response (for context)
  const baitAnywhere = ENGAGEMENT_BAIT.some((pattern) => pattern.test(response));

  const passed = !baitInClosure;

  return {
    passed: passed,
    score: passed ? 1.0 : 0.0,
    applicable: true,
    baitInClosure: baitInClosure,
    baitAnywhere: baitAnywhere,
    reason: passed
      ? 'Clean closure without engagement bait'
      : 'Engagement bait detected in closing paragraph',
  };
}

// ==================== GATE 4: EXAMPLE QUALITY ====================

/**
 * Evaluates whether examples are specific and concrete,
 * not generic placeholders
 *
 * @param {string} response - The AI response to evaluate
 * @returns {object} Evaluation results
 */
export function evaluateExampleQuality(response) {
  // Count generic vs specific markers
  const genericCount = GENERIC_MARKERS.filter((pattern) => pattern.test(response)).length;
  const specificCount = SPECIFIC_MARKERS.filter((pattern) => pattern.test(response)).length;

  const totalMarkers = genericCount + specificCount;

  if (totalMarkers === 0) {
    // No examples given
    return {
      passed: true,
      score: 1.0,
      applicable: false,
      reason: 'No examples provided',
    };
  }

  // Calculate ratio of specific to total
  const specificRatio = specificCount / totalMarkers;
  const passed = specificRatio >= 0.6;

  return {
    passed: passed,
    score: specificRatio,
    applicable: true,
    genericCount: genericCount,
    specificCount: specificCount,
    specificRatio: specificRatio,
    reason: passed
      ? `Examples are specific (${specificCount} specific vs ${genericCount} generic)`
      : `Examples too generic (${specificCount} specific vs ${genericCount} generic, need >60% specific)`,
  };
}

// ==================== GATE 5: TRUTH-FIRST COMPOSITE SCORE ====================

/**
 * Calculates the overall truth-first score based on all gate results
 *
 * @param {object} gateResults - Results from all gate evaluations
 * @returns {number} Composite score (0.0 to 1.0)
 */
export function calculateTruthFirstScore(gateResults) {
  const score =
    gateResults.uncertainty.score * WEIGHTS.uncertaintyStructure +
    gateResults.blindSpots.score * WEIGHTS.blindSpotVolunteering +
    gateResults.antiEngagement.score * WEIGHTS.antiEngagementClosure +
    gateResults.exampleQuality.score * WEIGHTS.exampleQuality;

  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

// ==================== CONTEXT DETECTION ====================

/**
 * Determines the minimum required score based on context
 *
 * @param {object} context - Context about the request
 * @returns {number} Minimum required score
 */
function getMinimumScore(context = {}) {
  // Check for high-stakes patterns
  const highStakesPatterns = [
    /invest|stock|crypto|financial/i,
    /medical|diagnosis|symptom|treatment/i,
    /legal|lawsuit|contract|liability/i,
    /suicide|self-harm|emergency/i,
  ];

  const isHighStakes =
    context.highStakes || highStakesPatterns.some((pattern) => pattern.test(context.message || ''));

  if (isHighStakes) return 0.8;
  if (context.mode === 'business_validation') return 0.7;
  if (context.mode === 'site_monkeys') return 0.7;

  return 0.6; // Standard minimum
}

// ==================== FEEDBACK GENERATION ====================

/**
 * Generates human-readable feedback based on gate results
 *
 * @param {object} results - Complete gate evaluation results
 * @returns {string} Feedback message
 */
function generateFeedback(results) {
  const issues = [];
  const strengths = [];

  // Check each gate
  if (results.uncertainty.applicable) {
    if (results.uncertainty.passed) {
      strengths.push('✓ Proper uncertainty structure');
    } else {
      issues.push(
        `✗ Uncertainty structure incomplete: missing ${results.uncertainty.missing.join(', ')}`,
      );
    }
  }

  if (results.blindSpots.applicable) {
    if (results.blindSpots.passed) {
      strengths.push(`✓ Advice includes ${results.blindSpots.blindSpotCount} caveat(s)`);
    } else {
      issues.push(
        `✗ Advice needs more caveats (${results.blindSpots.blindSpotCount}/${results.blindSpots.requiredCount})`,
      );
    }
  }

  if (!results.antiEngagement.passed) {
    issues.push('✗ Engagement bait in closing');
  } else {
    strengths.push('✓ Clean closure');
  }

  if (results.exampleQuality.applicable) {
    if (results.exampleQuality.passed) {
      strengths.push('✓ Specific examples');
    } else {
      issues.push('✗ Examples too generic');
    }
  }

  const feedback = [];
  if (issues.length > 0) {
    feedback.push('Issues:\n' + issues.join('\n'));
  }
  if (strengths.length > 0) {
    feedback.push('Strengths:\n' + strengths.join('\n'));
  }

  return feedback.join('\n\n');
}

// ==================== MAIN ENFORCEMENT FUNCTION ====================

/**
 * Runs all doctrine gates on a response and returns complete evaluation
 *
 * @param {string} response - The AI response to evaluate
 * @param {object} context - Context about the request
 * @returns {object} Complete gate evaluation results
 */
export function enforceDoctrineGates(response, context = {}) {
  // Evaluate all gates
  const results = {
    uncertainty: evaluateUncertaintyStructure(response, context),
    blindSpots: evaluateBlindSpotVolunteering(response, context),
    antiEngagement: evaluateAntiEngagementClosure(response),
    exampleQuality: evaluateExampleQuality(response),
  };

  // Calculate composite score
  results.compositeScore = calculateTruthFirstScore(results);

  // HARD FAIL CONDITIONS - these override composite score
  const hardFailConditions = [];

  // Engagement bait in closure = automatic fail
  if (results.antiEngagement.applicable && !results.antiEngagement.passed) {
    hardFailConditions.push('Engagement bait in closure');
  }

  // Uncertainty expressed without structure = automatic fail
  if (results.uncertainty.applicable && results.uncertainty.score === 0) {
    hardFailConditions.push('Uncertainty without explanation/framework');
  }

  // High-stakes advice without ANY caveats = automatic fail
  if (
    results.blindSpots.applicable &&
    results.blindSpots.isHighStakes &&
    results.blindSpots.score === 0
  ) {
    hardFailConditions.push('High-stakes advice without caveats');
  }

  // Generic examples when examples are given = automatic fail
  if (results.exampleQuality.applicable && results.exampleQuality.score === 0) {
    hardFailConditions.push('Examples are too generic');
  }

  // Check for hard fails
  if (hardFailConditions.length > 0) {
    results.passed = false;
    results.hardFail = true;
    results.hardFailReasons = hardFailConditions;
  } else {
    // Determine pass/fail based on composite score
    const minimumScore = getMinimumScore(context);
    results.passed = results.compositeScore >= minimumScore;
    results.hardFail = false;
  }

  results.minimumScore = getMinimumScore(context);

  // Generate feedback
  results.feedback = generateFeedback(results);

  // Add metadata
  results.timestamp = new Date().toISOString();
  results.weights = WEIGHTS;

  return results;
}
