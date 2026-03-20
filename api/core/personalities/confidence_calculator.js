// /api/core/personalities/confidence_calculator.js
// CONFIDENCE CALCULATOR - Genuine confidence score from Phase 4 signals
// Used by eli_framework.js and roxy_framework.js when showConfidence === true

/**
 * Calculate a genuine confidence score from Phase 4 truth-type signals.
 *
 * @param {string|null} truthType     - PERMANENT | SEMI_STABLE | VOLATILE | null
 * @param {number}      sourcesUsed   - How many external sources confirmed the answer
 * @param {boolean}     lookupPerformed - Whether an external lookup was performed
 * @param {number|null} modelConfidence - Existing AI-reported confidence (0–1), used lightly
 * @returns {number} Confidence value clamped to [0.15, 0.97]
 */
export function calculateConfidence(truthType, sourcesUsed, lookupPerformed, modelConfidence) {
  // Base score by truth type
  let base = 0.5;
  if (truthType === 'PERMANENT') base = 0.90;
  else if (truthType === 'SEMI_STABLE') base = 0.65;
  else if (truthType === 'VOLATILE') base = 0.45;

  // Source confirmation boost
  if (lookupPerformed && sourcesUsed >= 3) base += 0.15;
  else if (lookupPerformed && sourcesUsed === 2) base += 0.10;
  else if (lookupPerformed && sourcesUsed === 1) base += 0.05;

  // Model confidence as a secondary signal (20% weight maximum)
  if (modelConfidence != null && !isNaN(modelConfidence)) {
    base = (base * 0.80) + (modelConfidence * 0.20);
  }

  return Math.min(0.97, Math.max(0.15, base));
}

/**
 * Extract whether an external lookup was performed from Phase 4 metadata.
 * Checks both field names used across the codebase for lookup status.
 *
 * @param {object} phase4Metadata - Phase 4 metadata from context
 * @returns {boolean}
 */
export function isLookupPerformed(phase4Metadata) {
  return !!(phase4Metadata?.external_lookup || phase4Metadata?.lookup_performed);
}

/**
 * Build the confidence metadata object returned in the API response.
 *
 * @param {object} phase4Metadata - Phase 4 metadata from context
 * @returns {{ score: number, reason: string, truthType: string|null, sourcesUsed: number }}
 */
export function buildConfidenceMetadata(phase4Metadata) {
  const p4 = phase4Metadata || {};
  const lookupPerformed = isLookupPerformed(p4);
  const sourcesUsed = p4.sources_used || 0;
  const truthType = p4.truth_type || null;
  const modelConfidence = p4.confidence || null;

  const score = calculateConfidence(truthType, sourcesUsed, lookupPerformed, modelConfidence);
  const reason = buildConfidenceReason(truthType, sourcesUsed, lookupPerformed, score);

  return {
    score: Math.round(score * 100),
    reason,
    truthType,
    sourcesUsed,
  };
}

/**
 * @param {string|null} truthType     - PERMANENT | SEMI_STABLE | VOLATILE | null
 * @param {number}      sourcesUsed   - How many external sources confirmed the answer
 * @param {boolean}     lookupPerformed - Whether an external lookup was performed
 * @param {number}      score         - Calculated confidence score (0–1)
 * @returns {string} Plain-text reason (no markdown, no emoji)
 */
export function buildConfidenceReason(truthType, sourcesUsed, lookupPerformed, score) {
  if (score < 0.50) {
    return 'limited information available — recommend verification';
  }

  if (truthType === 'PERMANENT' && !lookupPerformed) {
    return 'established knowledge — well documented';
  }

  if (truthType === 'VOLATILE' && lookupPerformed && sourcesUsed >= 3) {
    return `${sourcesUsed} sources confirmed — data current`;
  }

  if (truthType === 'VOLATILE' && lookupPerformed && sourcesUsed === 1) {
    return 'limited sources — verify for critical decisions';
  }

  if (truthType === 'SEMI_STABLE' && lookupPerformed) {
    return 'confirmed via external sources';
  }

  if (truthType === 'SEMI_STABLE' && !lookupPerformed) {
    return 'based on training knowledge — may not reflect latest';
  }

  if (truthType === 'VOLATILE') {
    return 'limited sources — verify for critical decisions';
  }

  return 'based on training knowledge — may not reflect latest';
}
