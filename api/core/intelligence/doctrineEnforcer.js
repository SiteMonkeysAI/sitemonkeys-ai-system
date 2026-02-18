/**
 * doctrineEnforcer.js
 * Phase 5: Doctrine Enforcement Gates
 *
 * Purpose: Enforce truth-first principles on every AI response
 * Runs AFTER AI generation, BEFORE returning to user
 *
 * Location: /api/core/intelligence/doctrineEnforcer.js
 */

// Gate configuration
export const GATE_CONFIG = {
  TRUTH_GATE: {
    enabled: true,
    confidence_threshold: 0.5,
    description: 'Block response if confidence < 0.5 AND no external verification attempted',
  },
  PROVENANCE_GATE: {
    enabled: true,
    required_tags: ['source_class', 'verified_at', 'confidence'],
    description: 'Ensure external claims have proper source attribution',
  },
  VOLATILITY_GATE: {
    enabled: true,
    description: 'Block caching of VOLATILE data beyond TTL',
  },
  BUSINESS_POLICY_GATE: {
    enabled: true,
    protected_modes: ['site_monkeys'],
    description: 'Block external override of vault content in Site Monkeys mode',
  },
  DISCLOSURE_GATE: {
    enabled: true,
    confidence_threshold: 0.6,
    description: 'Force disclosure when lookup fails or confidence is low',
  },
};

/**
 * Truth Gate: Block response if confidence < 0.5 AND no external verification
 * @param {object} response - AI response object
 * @param {object} phase4Data - Phase 4 pipeline results
 * @returns {object} { passed: boolean, violation: string|null, correction: string|null }
 */
export function truthGate(response, phase4Data) {
  const confidence = phase4Data.confidence || 0.5;
  const externalLookupPerformed =
    phase4Data.external_lookup || phase4Data.lookup_performed || false;
  const truthType = phase4Data.truth_type;

  // If confidence is above threshold, pass
  if (confidence >= GATE_CONFIG.TRUTH_GATE.confidence_threshold) {
    return { passed: true, violation: null, correction: null };
  }

  // If confidence is low but external verification was done, pass
  if (externalLookupPerformed) {
    return { passed: true, violation: null, correction: null };
  }

  // If it's PERMANENT truth type, low confidence is more acceptable
  if (truthType === 'PERMANENT') {
    return { passed: true, violation: null, correction: null };
  }

  // Low confidence, no external verification, not permanent = violation
  return {
    passed: false,
    violation: `Low confidence (${confidence}) without external verification for ${truthType} claim`,
    correction:
      'I want to be transparent: my confidence in this answer is limited, and I was unable to verify it against external sources. Please verify this information independently.',
  };
}

/**
 * Provenance Gate: Ensure external claims have proper source attribution
 * @param {object} response - AI response object
 * @param {object} phase4Data - Phase 4 pipeline results
 * @returns {object} { passed: boolean, violation: string|null, correction: string|null }
 */
export function provenanceGate(response, phase4Data) {
  const sourceClass = phase4Data.source_class;

  // Only check provenance for external sources
  if (sourceClass !== 'external') {
    return { passed: true, violation: null, correction: null };
  }

  const missingTags = [];

  if (!phase4Data.source_class) missingTags.push('source_class');
  if (!phase4Data.verified_at) missingTags.push('verified_at');
  if (phase4Data.confidence === undefined) missingTags.push('confidence');

  if (missingTags.length === 0) {
    return { passed: true, violation: null, correction: null };
  }

  return {
    passed: false,
    violation: `External claim missing provenance tags: ${missingTags.join(', ')}`,
    correction: null, // No text correction, just metadata issue
  };
}

/**
 * Volatility Gate: Block caching of VOLATILE data beyond TTL
 * @param {object} response - AI response object
 * @param {object} phase4Data - Phase 4 pipeline results
 * @returns {object} { passed: boolean, violation: string|null, correction: string|null }
 */
export function volatilityGate(response, phase4Data) {
  const truthType = phase4Data.truth_type;
  const cacheValidUntil = phase4Data.cache_valid_until;

  // Only check VOLATILE data
  if (truthType !== 'VOLATILE') {
    return { passed: true, violation: null, correction: null };
  }

  // If no cache set, that's fine for volatile
  if (!cacheValidUntil) {
    return { passed: true, violation: null, correction: null };
  }

  // Check if cache TTL exceeds 5 minutes for VOLATILE
  const cacheExpiry = new Date(cacheValidUntil);
  const now = new Date();
  const ttlMs = cacheExpiry.getTime() - now.getTime();
  const maxVolatileTTL = 5 * 60 * 1000; // 5 minutes

  if (ttlMs > maxVolatileTTL) {
    return {
      passed: false,
      violation: `VOLATILE data cached for ${Math.round(ttlMs / 60000)} minutes (max: 5 minutes)`,
      correction: null, // System-level fix, not text correction
    };
  }

  return { passed: true, violation: null, correction: null };
}

/**
 * Business Policy Gate: Block external override of vault content in Site Monkeys mode
 * @param {object} response - AI response object
 * @param {object} phase4Data - Phase 4 pipeline results
 * @param {string} mode - Current operational mode
 * @returns {object} { passed: boolean, violation: string|null, correction: string|null }
 */
export function businessPolicyGate(response, phase4Data, mode) {
  // Only applies to Site Monkeys mode
  if (!GATE_CONFIG.BUSINESS_POLICY_GATE.protected_modes.includes(mode)) {
    return { passed: true, violation: null, correction: null };
  }

  const claimType = phase4Data.claim_type;
  const hierarchyUsed = phase4Data.hierarchy_name || phase4Data.hierarchy;
  const sourceClass = phase4Data.source_class;

  // If it's a business policy claim, vault should be the source
  if (claimType === 'BUSINESS_POLICY' && sourceClass === 'external') {
    return {
      passed: false,
      violation: 'External source used for business policy claim in Site Monkeys mode',
      correction:
        'Note: This response should be based on Site Monkeys internal policies, not external sources. Please verify against your vault documentation.',
    };
  }

  // If hierarchy should be VAULT_FIRST but external was used as primary
  if (
    hierarchyUsed === 'VAULT_FIRST' &&
    sourceClass === 'external' &&
    claimType === 'BUSINESS_POLICY'
  ) {
    return {
      passed: false,
      violation: 'VAULT_FIRST hierarchy violated - external source overrode vault',
      correction: null,
    };
  }

  return { passed: true, violation: null, correction: null };
}

/**
 * Disclosure Gate: Force disclosure when lookup fails or confidence is low
 * @param {object} response - AI response object
 * @param {object} phase4Data - Phase 4 pipeline results
 * @returns {object} { passed: boolean, violation: string|null, correction: string|null }
 */
export function disclosureGate(response, phase4Data) {
  const confidence = phase4Data.confidence || 0.5;
  const degraded = phase4Data.degraded || false;
  // Check if lookup was attempted but failed (lookup_attempted=true but external_lookup=false)
  const lookupFailed = phase4Data.lookup_attempted && !phase4Data.external_lookup;
  const responseText = response.response || response;

  // Check if disclosure is needed
  const needsDisclosure =
    confidence < GATE_CONFIG.DISCLOSURE_GATE.confidence_threshold || degraded || lookupFailed;

  if (!needsDisclosure) {
    return { passed: true, violation: null, correction: null };
  }

  // Check if response already contains disclosure language
  const disclosurePatterns = [
    /\bI('m| am) not (certain|sure|confident)\b/i,
    /\bmy confidence is (low|limited)\b/i,
    /\bunable to verify\b/i,
    /\bcould(n't| not) verify\b/i,
    /\bplease verify\b/i,
    /\bthis (may|might) (not be|be outdated)\b/i,
    /\bbased on (my training|internal data)\b/i,
  ];

  const hasDisclosure = disclosurePatterns.some((pattern) => pattern.test(responseText));

  if (hasDisclosure) {
    return { passed: true, violation: null, correction: null };
  }

  // Build appropriate disclosure
  let disclosure = '';

  if (lookupFailed || degraded) {
    disclosure =
      '\n\n**Note:** I was unable to verify this information against current external sources. This response is based on my training data and may not reflect the most recent information.';
  } else if (confidence < GATE_CONFIG.DISCLOSURE_GATE.confidence_threshold) {
    disclosure = `\n\n**Note:** My confidence in this response is ${Math.round(confidence * 100)}%. I recommend verifying this information from authoritative sources.`;
  }

  // Graceful degradation: Pass with correction rather than failing
  // This adds disclosure without blocking the response
  return {
    passed: true,
    violation: null,
    correction: disclosure,
    disclosure_added: true,
  };
}

/**
 * Run all enforcement gates
 * @param {object} response - AI response object { response: string, ... }
 * @param {object} phase4Data - Phase 4 pipeline results
 * @param {string} mode - Current operational mode
 * @returns {object} Complete enforcement result
 */
export function enforceAll(response, phase4Data, mode = 'truth') {
  console.log('[doctrineEnforcer] Running all enforcement gates...');

  const gateResults = {};
  const violations = [];
  let correctedResponse = response.response || response;
  let modified = false;

  // Run Truth Gate
  gateResults.truth = truthGate(response, phase4Data);
  if (!gateResults.truth.passed) {
    violations.push({ gate: 'truth', ...gateResults.truth });
    if (gateResults.truth.correction) {
      correctedResponse = gateResults.truth.correction + '\n\n' + correctedResponse;
      modified = true;
    }
  }

  // Run Provenance Gate
  gateResults.provenance = provenanceGate(response, phase4Data);
  if (!gateResults.provenance.passed) {
    violations.push({ gate: 'provenance', ...gateResults.provenance });
  }

  // Run Volatility Gate
  gateResults.volatility = volatilityGate(response, phase4Data);
  if (!gateResults.volatility.passed) {
    violations.push({ gate: 'volatility', ...gateResults.volatility });
  }

  // Run Business Policy Gate
  gateResults.businessPolicy = businessPolicyGate(response, phase4Data, mode);
  if (!gateResults.businessPolicy.passed) {
    violations.push({ gate: 'businessPolicy', ...gateResults.businessPolicy });
    if (gateResults.businessPolicy.correction) {
      correctedResponse += '\n\n' + gateResults.businessPolicy.correction;
      modified = true;
    }
  }

  // Run Disclosure Gate (run last as it may append to response)
  gateResults.disclosure = disclosureGate({ response: correctedResponse }, phase4Data);
  // Disclosure gate uses graceful degradation - it passes but may add disclosure
  if (gateResults.disclosure.correction) {
    correctedResponse += gateResults.disclosure.correction;
    modified = true;
  }
  if (!gateResults.disclosure.passed) {
    violations.push({ gate: 'disclosure', ...gateResults.disclosure });
  }

  const enforcementPassed = violations.length === 0;

  console.log(
    `[doctrineEnforcer] Enforcement complete: ${enforcementPassed ? 'PASSED' : 'VIOLATIONS FOUND'}`,
  );
  if (violations.length > 0) {
    console.log(`[doctrineEnforcer] Violations: ${violations.map((v) => v.gate).join(', ')}`);
  }

  return {
    enforcement_passed: enforcementPassed,
    gate_results: gateResults,
    violations: violations,
    corrected_response: modified ? correctedResponse : null,
    original_response_modified: modified,
    gates_run: Object.keys(gateResults).length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Test endpoint handler
 * @param {object} testResponse - Test response object
 * @param {object} testPhase4Data - Test Phase 4 data
 * @param {string} testMode - Test mode
 * @returns {object} Enforcement test result
 */
export function testEnforcement(testResponse, testPhase4Data, testMode = 'truth') {
  console.log('[doctrineEnforcer] Running test enforcement...');

  const defaultResponse = testResponse || {
    response: 'This is a test response about Bitcoin prices.',
  };

  const defaultPhase4Data = testPhase4Data || {
    truth_type: 'VOLATILE',
    confidence: 0.7,
    source_class: 'internal',
    external_lookup: false,
    lookup_performed: false,
    verified_at: null,
    degraded: false,
  };

  return enforceAll(defaultResponse, defaultPhase4Data, testMode);
}

// Default export
export default {
  GATE_CONFIG,
  truthGate,
  provenanceGate,
  volatilityGate,
  businessPolicyGate,
  disclosureGate,
  enforceAll,
  testEnforcement,
};
