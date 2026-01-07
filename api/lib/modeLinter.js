// modeLinter.js - Mode Fingerprint Validation and Drift Detection
//
// PRINCIPLE (Issue #402 Findings #7, #8): Use semantic analysis, not keyword counting
// - Consult reasoning layer and semantic analyzer for context understanding
// - Detect mode drift based on semantic similarity, not keyword matches

export class ModeLinter {
  /**
   * Validate mode compliance with optional semantic context
   * PRINCIPLE (Issue #402 Finding #7): Use semantic understanding, not just patterns
   */
  static validateModeCompliance(response, expectedMode, modeFingerprint, semanticAnalysis = null) {
    const validation = {
      mode_compliance: "UNKNOWN",
      fingerprint_valid: false,
      required_elements_present: {},
      missing_elements: [],
      drift_detected: false,
      correction_needed: false,
      fallback_correction: null,
      compliance_score: 0,
    };

    validation.fingerprint_valid = this.validateFingerprint(
      response,
      modeFingerprint,
    );

    const structureValidation = this.validateModeStructure(
      response,
      expectedMode,
    );
    validation.required_elements_present = structureValidation.elements_present;
    validation.missing_elements = structureValidation.missing_elements;
    validation.compliance_score = structureValidation.compliance_score;

    // Pass semantic analysis to drift detection
    validation.drift_detected = this.detectModeDrift(response, expectedMode, semanticAnalysis);

    validation.mode_compliance = this.determineCompliance(validation);

    if (validation.mode_compliance === "NON_COMPLIANT") {
      validation.correction_needed = true;
      validation.fallback_correction = this.generateFallbackCorrection(
        response,
        expectedMode,
        validation,
      );
    }

    return validation;
  }

  static validateFingerprint(response, expectedFingerprint) {
    const fingerprintPattern = new RegExp(
      `\\[${expectedFingerprint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`,
    );
    return fingerprintPattern.test(response);
  }

  static validateModeStructure(response, mode) {
    switch (mode) {
      case "business_validation":
        return this.validateBusinessMode(response);
      case "truth_general":
        return this.validateTruthMode(response);
      case "site_monkeys":
        return this.validateVaultMode(response);
      default:
        return {
          elements_present: {},
          missing_elements: ["UNKNOWN_MODE"],
          compliance_score: 0,
        };
    }
  }

  static validateBusinessMode(response) {
    const requiredElements = {
      SURVIVAL_IMPACT: {
        patterns: [/survival impact/i, /survival:/i],
        weight: 25,
        present: false,
      },
      CASH_FLOW_ANALYSIS: {
        patterns: [/cash flow/i, /cash impact/i, /\$[\d,]+/],
        weight: 25,
        present: false,
      },
      MARKET_REALITY: {
        patterns: [/market reality/i, /competitive/i, /market/i],
        weight: 20,
        present: false,
      },
      TOP_3_RISKS: {
        patterns: [/risk/i, /failure mode/i, /danger/i],
        weight: 20,
        present: false,
      },
      RECOMMENDATION: {
        patterns: [/recommendation/i, /suggest/i, /should/i, /go\/no-go/i],
        weight: 10,
        present: false,
      },
    };

    return this.checkElementsPresence(response, requiredElements);
  }

  static validateTruthMode(response) {
    const requiredElements = {
      DIRECT_ANSWER: {
        patterns: [/^[^\\n]{10,100}/],
        weight: 30,
        present: false,
      },
      CONFIDENCE_PERCENTAGE: {
        patterns: [/confidence: (high|medium|low|unknown|\d+%)/i],
        weight: 25,
        present: false,
      },
      UNKNOWN_ACKNOWLEDGMENT: {
        patterns: [/don't know/i, /uncertain/i, /unclear/i, /unknown/i],
        weight: 25,
        present: false,
      },
      ASSUMPTION_CHALLENGE: {
        patterns: [/assumption/i, /assuming/i, /that assumes/i],
        weight: 20,
        present: false,
      },
    };

    return this.checkElementsPresence(response, requiredElements);
  }

  static validateVaultMode(response) {
    const requiredElements = {
      OPERATIONAL_DECISION: {
        patterns: [/operational/i, /site monkeys/i, /vault/i],
        weight: 25,
        present: false,
      },
      COMPLIANCE_STATUS: {
        patterns: [/compliance/i, /constraint/i, /framework/i],
        weight: 25,
        present: false,
      },
      QUALITY_IMPACT: {
        patterns: [/quality/i, /standard/i, /impact/i],
        weight: 25,
        present: false,
      },
      ENFORCED_PROTOCOL: {
        patterns: [/protocol/i, /procedure/i, /enforced/i, /required/i],
        weight: 25,
        present: false,
      },
    };

    return this.checkElementsPresence(response, requiredElements);
  }

  static checkElementsPresence(response, requiredElements) {
    let totalScore = 0;
    const missingElements = [];
    const elementsPresent = {};

    Object.keys(requiredElements).forEach((elementKey) => {
      const element = requiredElements[elementKey];
      const isPresent = element.patterns.some((pattern) =>
        pattern.test(response),
      );

      elementsPresent[elementKey] = isPresent;

      if (isPresent) {
        totalScore += element.weight;
      } else {
        missingElements.push(elementKey);
      }
    });

    return {
      elements_present: elementsPresent,
      missing_elements: missingElements,
      compliance_score: totalScore,
    };
  }

  /**
   * Detect mode drift using semantic context, not keyword counting
   * PRINCIPLE (Issue #402 Findings #7, #8): Semantic analysis over pattern matching
   */
  static detectModeDrift(response, expectedMode, semanticAnalysis = null) {
    // If semantic analysis available, use it for drift detection
    if (semanticAnalysis) {
      const domain = semanticAnalysis.domain;
      const intent = semanticAnalysis.intent;
      
      // Map modes to expected semantic patterns
      const modeExpectations = {
        business_validation: {
          expectedDomains: ['business', 'financial'],
          expectedIntents: ['decision_making', 'problem_solving'],
        },
        truth_general: {
          expectedDomains: ['general', 'technical', 'health', 'personal'],
          expectedIntents: ['question', 'information_sharing'],
        },
        site_monkeys: {
          expectedDomains: ['business', 'technical'],
          expectedIntents: ['command', 'decision_making'],
        },
      };
      
      const expectations = modeExpectations[expectedMode];
      if (expectations) {
        const domainMismatch = domain && !expectations.expectedDomains.includes(domain);
        const intentMismatch = intent && !expectations.expectedIntents.includes(intent);
        
        // Drift detected if both domain and intent don't match expectations
        if (domainMismatch && intentMismatch) {
          console.log(`[MODE-LINTER] Semantic drift detected: domain=${domain}, intent=${intent}, expected mode=${expectedMode}`);
          return true;
        }
      }
      
      return false;
    }
    
    // FALLBACK: Legacy keyword-based detection (when semantic analysis unavailable)
    // This is kept for backward compatibility but should rarely be used
    const modeSignatures = {
      business_validation: [/roi/i, /cash/i, /revenue/i, /cost/i, /survival/i],
      truth_general: [/evidence/i, /fact/i, /research/i, /study/i, /data/i],
      site_monkeys: [/site monkeys/i, /vault/i, /operational/i, /protocol/i],
    };

    const otherModes = Object.keys(modeSignatures).filter(
      (mode) => mode !== expectedMode,
    );

    for (const otherMode of otherModes) {
      const signatures = modeSignatures[otherMode];
      const matchCount = signatures.filter((pattern) =>
        pattern.test(response),
      ).length;

      // Increased threshold to reduce false positives
      if (matchCount > 3) {
        console.log(`[MODE-LINTER] Legacy keyword drift detected: matched ${matchCount} signatures for ${otherMode}`);
        return true;
      }
    }

    return false;
  }

  static determineCompliance(validation) {
    if (!validation.fingerprint_valid) {
      return "NON_COMPLIANT";
    }

    if (validation.compliance_score >= 80) {
      return "COMPLIANT";
    } else if (validation.compliance_score >= 60) {
      return "PARTIAL";
    } else {
      return "NON_COMPLIANT";
    }
  }

  static generateFallbackCorrection(response, mode, validation) {
    const corrections = {
      business_validation: this.generateBusinessCorrection(
        response,
        validation,
      ),
      truth_general: this.generateTruthCorrection(response, validation),
      site_monkeys: this.generateVaultCorrection(response, validation),
    };

    return corrections[mode] || "Mode correction not available";
  }

  static generateBusinessCorrection(response, validation) {
    let correction = `BUSINESS MODE COMPLIANCE FAILURE\n\nThe response lacks required business validation elements:\n\n`;

    const missingTemplates = {
      SURVIVAL_IMPACT:
        "SURVIVAL IMPACT: [NONE/LOW/MEDIUM/HIGH/CRITICAL] - [Specific threat analysis]",
      CASH_FLOW_ANALYSIS:
        "CASH FLOW ANALYSIS: [POSITIVE/NEUTRAL/NEGATIVE] $[Amount] over [Timeline]",
      MARKET_REALITY:
        "MARKET REALITY CHECK: [Competitive threats and adoption challenges]",
      TOP_3_RISKS:
        "TOP 3 RISKS:\n1. [Risk] → [Mitigation]\n2. [Risk] → [Mitigation]\n3. [Risk] → [Mitigation]",
      RECOMMENDATION: "RECOMMENDATION: [Clear go/no-go with decision criteria]",
    };

    validation.missing_elements.forEach((element) => {
      if (missingTemplates[element]) {
        correction += `MISSING: ${element}\nREQUIRED FORMAT: ${missingTemplates[element]}\n\n`;
      }
    });

    correction += `CORRECTED RESPONSE REQUIRED: Please reformat with all required business validation elements.`;

    return correction;
  }

  static generateTruthCorrection(response, validation) {
    let correction = `TRUTH MODE COMPLIANCE FAILURE\n\nThe response lacks required truth enforcement elements:\n\n`;

    const missingTemplates = {
      DIRECT_ANSWER:
        "START WITH DIRECT ANSWER: [Clear, specific response to the question]",
      CONFIDENCE_PERCENTAGE:
        "CONFIDENCE: [High/Medium/Low/Unknown] based on [specific reasoning]",
      UNKNOWN_ACKNOWLEDGMENT:
        'ACKNOWLEDGE UNCERTAINTY: Use "I don\'t know" when appropriate',
      ASSUMPTION_CHALLENGE:
        "CHALLENGE ASSUMPTIONS: Question underlying premises in the question",
    };

    validation.missing_elements.forEach((element) => {
      if (missingTemplates[element]) {
        correction += `MISSING: ${element}\nREQUIRED: ${missingTemplates[element]}\n\n`;
      }
    });

    correction += `CORRECTED RESPONSE REQUIRED: Please reformat with proper truth-first structure.`;

    return correction;
  }

  static generateVaultCorrection(response, validation) {
    let correction = `VAULT MODE COMPLIANCE FAILURE\n\nThe response lacks required Site Monkeys vault elements:\n\n`;

    const missingTemplates = {
      OPERATIONAL_DECISION:
        "OPERATIONAL DECISION: [Site Monkeys specific context]",
      COMPLIANCE_STATUS:
        "COMPLIANCE STATUS: [How this aligns with vault constraints]",
      QUALITY_IMPACT: "QUALITY IMPACT: [Effect on service standards]",
      ENFORCED_PROTOCOL:
        "ENFORCED PROTOCOL: [Specific procedures or requirements]",
    };

    validation.missing_elements.forEach((element) => {
      if (missingTemplates[element]) {
        correction += `MISSING: ${element}\nREQUIRED: ${missingTemplates[element]}\n\n`;
      }
    });

    correction += `CORRECTED RESPONSE REQUIRED: Please reformat with Site Monkeys vault compliance.`;

    return correction;
  }

  static generateComplianceReport(validation, mode) {
    return {
      mode: mode,
      overall_compliance: validation.mode_compliance,
      fingerprint_valid: validation.fingerprint_valid,
      compliance_percentage: validation.compliance_score,
      elements_status: validation.required_elements_present,
      missing_critical_elements: validation.missing_elements,
      drift_detected: validation.drift_detected,
      correction_required: validation.correction_needed,
      enforcement_actions: validation.correction_needed
        ? ["APPLY_FALLBACK_CORRECTION"]
        : [],
      timestamp: new Date().toISOString(),
    };
  }
}

export function validateModeCompliance(response, mode, fingerprint) {
  return ModeLinter.validateModeCompliance(response, mode, fingerprint);
}

export function detectModeDrift(response, expectedMode) {
  return ModeLinter.detectModeDrift(response, expectedMode);
}

export function generateComplianceReport(validation, mode) {
  return ModeLinter.generateComplianceReport(validation, mode);
}

export function enforceModeCompliance(response, validation) {
  if (validation.correction_needed) {
    return {
      original_blocked: true,
      enforcement_response: validation.fallback_correction,
      compliance_status: "ENFORCED_CORRECTION_APPLIED",
    };
  }

  return {
    original_blocked: false,
    enforcement_response: response,
    compliance_status: validation.mode_compliance,
  };
}
