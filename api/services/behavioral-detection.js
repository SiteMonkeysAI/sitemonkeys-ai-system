/**
 * BEHAVIORAL DETECTION SERVICE
 *
 * Detects truth-first behavioral patterns in AI responses.
 * Observational only - not enforced until Doctrine Gates.
 *
 * @module api/services/behavioral-detection
 */

/**
 * Detect 3-part uncertainty structure
 * - Admission + Explanation + Framework
 *
 * @param {string} response - AI response text
 * @returns {Object} Detection result with structure breakdown
 */
export function detectUncertaintyStructure(response) {
  const lowerResponse = response.toLowerCase();

  // Markers for uncertainty admission
  const admissionMarkers = [
    "i don't know",
    "i cannot predict",
    "i'm not certain",
    "i don't have enough information",
    "being honest with you",
    "cannot determine",
    "unsure about",
    "unclear",
    "what i don't know"
  ];

  // Markers for explanation
  const explanationMarkers = [
    "because",
    "why this matters",
    "the reason",
    "what's missing",
    "what information is missing",
    "to be certain"
  ];

  // Markers for framework/guidance
  const frameworkMarkers = [
    "what i can tell you",
    "based on",
    "to assess",
    "you need to",
    "scenario",
    "if/then",
    "consider",
    "framework"
  ];

  const hasAdmission = admissionMarkers.some(marker => lowerResponse.includes(marker));
  const hasExplanation = explanationMarkers.some(marker => lowerResponse.includes(marker));
  const hasFramework = frameworkMarkers.some(marker => lowerResponse.includes(marker));

  const structureCount = [hasAdmission, hasExplanation, hasFramework].filter(Boolean).length;
  const hasFullStructure = structureCount === 3;

  return {
    hasAdmission,
    hasExplanation,
    hasFramework,
    structureCount,
    hasFullStructure,
    markers_found: {
      admission: admissionMarkers.filter(m => lowerResponse.includes(m)),
      explanation: explanationMarkers.filter(m => lowerResponse.includes(m)),
      framework: frameworkMarkers.filter(m => lowerResponse.includes(m))
    }
  };
}

/**
 * Count distinct volunteered blind spots
 *
 * @param {string} response - AI response text
 * @returns {Object} Count and details of blind spots
 */
export function countBlindSpots(response) {
  const lowerResponse = response.toLowerCase();

  // Blind spot introduction markers
  const blindSpotMarkers = [
    "you may not have considered",
    "critical factor",
    "however",
    "blind spot",
    "you might not see",
    "haven't thought about",
    "important to note",
    "overlooked",
    "missing consideration"
  ];

  // Find all blind spot mentions
  const foundMarkers = blindSpotMarkers.filter(marker => lowerResponse.includes(marker));

  // Try to count distinct numbered items (1., 2., 3., etc.)
  const numberedItems = response.match(/\n\s*\d+\.\s+/g);
  const numberedCount = numberedItems ? numberedItems.length : 0;

  // Estimate based on markers and structure
  const markerCount = foundMarkers.length;
  const estimatedBlindSpots = Math.max(markerCount, Math.floor(numberedCount / 2));

  return {
    blindSpotCount: estimatedBlindSpots,
    hasBlindSpots: estimatedBlindSpots > 0,
    markers_found: foundMarkers,
    numberedItemsDetected: numberedCount
  };
}

/**
 * Detect engagement bait patterns (especially in last paragraph)
 *
 * @param {string} response - AI response text
 * @returns {Object} Detection result
 */
export function detectEngagementBait(response) {
  const lowerResponse = response.toLowerCase();

  // Engagement bait phrases
  const baitPatterns = [
    "would you like",
    "should i",
    "want me to",
    "do you want",
    "shall i",
    "interested in",
    "which would you like",
    "would you prefer",
    "let me know if",
    "feel free to ask"
  ];

  // Check overall response
  const overallBaitCount = baitPatterns.filter(pattern => lowerResponse.includes(pattern)).length;

  // Check last paragraph specifically (more critical)
  const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const lastParaLower = lastParagraph.toLowerCase();

  const lastParaBaitCount = baitPatterns.filter(pattern => lastParaLower.includes(pattern)).length;
  const hasLastParaBait = lastParaBaitCount > 0;

  return {
    overallBaitCount,
    lastParaBaitCount,
    hasLastParaBait,
    hasBait: overallBaitCount > 0,
    lastParagraph: lastParagraph.substring(0, 150),
    patterns_found: baitPatterns.filter(p => lowerResponse.includes(p))
  };
}

/**
 * Assess example quality (specific vs generic)
 *
 * @param {string} response - AI response text
 * @returns {Object} Assessment result
 */
export function assessExampleQuality(response) {
  const lowerResponse = response.toLowerCase();

  // Generic example markers (low quality)
  const genericMarkers = [
    "for example",
    "such as",
    "like",
    "e.g.",
    "i.e."
  ];

  // Specific example markers (high quality)
  const specificMarkers = [
    "scenario a",
    "scenario b",
    "if x then y",
    "in your case",
    "for your situation",
    "based on comparable",
    "similar startups",
    "confidence:",
    "evidence:"
  ];

  const hasGenericExamples = genericMarkers.some(marker => lowerResponse.includes(marker));
  const hasSpecificExamples = specificMarkers.some(marker => lowerResponse.includes(marker));

  const genericCount = genericMarkers.filter(m => lowerResponse.includes(m)).length;
  const specificCount = specificMarkers.filter(m => lowerResponse.includes(m)).length;

  let quality = 'none';
  if (specificCount > genericCount) {
    quality = 'specific';
  } else if (genericCount > 0) {
    quality = 'generic';
  }

  return {
    quality,
    hasGenericExamples,
    hasSpecificExamples,
    genericCount,
    specificCount,
    generic_markers: genericMarkers.filter(m => lowerResponse.includes(m)),
    specific_markers: specificMarkers.filter(m => lowerResponse.includes(m))
  };
}

/**
 * Measure behavioral patterns - combined analysis
 *
 * @param {string} response - AI response text
 * @returns {Object} Complete behavioral analysis
 */
export function measureBehavioral(response) {
  const uncertainty = detectUncertaintyStructure(response);
  const blindSpots = countBlindSpots(response);
  const engagementBait = detectEngagementBait(response);
  const exampleQuality = assessExampleQuality(response);

  // Calculate overall truth-first score (0-1)
  let score = 0;

  if (uncertainty.hasFullStructure) score += 0.35;
  else if (uncertainty.hasAdmission) score += 0.15;

  if (blindSpots.blindSpotCount > 0) score += Math.min(0.25, blindSpots.blindSpotCount * 0.1);

  if (!engagementBait.hasLastParaBait) score += 0.2;
  else score -= 0.1;

  if (exampleQuality.quality === 'specific') score += 0.2;
  else if (exampleQuality.quality === 'generic') score += 0.05;

  score = Math.max(0, Math.min(1, score));

  return {
    truthFirstScore: parseFloat(score.toFixed(2)),
    uncertainty,
    blindSpots,
    engagementBait,
    exampleQuality,
    _note: "Observational only - not enforced until Doctrine Gates"
  };
}
