// productValidation.js - Evidence-Based Recommendation Validation
//
// PRINCIPLE (Issue #402 Findings #5, #15): Consult reasoning layer before restrictions
// - Integrate with principle-based reasoning to understand user intent
// - Use context-based validation, not just keyword matching

import { applyPrincipleBasedReasoning } from '../core/intelligence/principleBasedReasoning.js';

export class ProductValidator {
  // Fix validateRecommendation method (lines 27-31)
  static validateRecommendation(response, mode, vaultData = null) {
    const validation = {
      validation_passed: false,
      evidence_strength: 0,
      value_analysis: "INSUFFICIENT",
      risk_assessment: "MISSING",
      disclosure_compliance: false,
      override_reason: null,
      structured_recommendation: null,
      enforcement_actions: [],
    };

    const recommendationPatterns = [
      /recommend/i,
      /suggest/i,
      /should use/i,
      /try using/i,
      /consider/i,
      /go with/i,
      /use \w+/i,
      /switch to/i,
    ];

    const hasRecommendation = recommendationPatterns.some((pattern) =>
      pattern.test(response),
    );

    if (!hasRecommendation) {
      validation.validation_passed = true;
      return validation;
    }

    // FIXED: Use class name instead of 'this'
    validation.evidence_strength =
      ProductValidator.analyzeEvidenceStrength(response);
    validation.value_analysis = ProductValidator.analyzeValueProposition(
      response,
      mode,
    );
    validation.risk_assessment = ProductValidator.analyzeRiskAssessment(
      response,
      mode,
    );
    validation.disclosure_compliance =
      ProductValidator.checkDisclosureCompliance(response);

    const modeValidation = ProductValidator.applyModeSpecificValidation(
      response,
      mode,
      vaultData,
    );
    Object.assign(validation, modeValidation);

    validation.validation_passed =
      ProductValidator.determineOverallValidation(validation);

    if (!validation.validation_passed) {
      validation.enforcement_actions =
        ProductValidator.generateEnforcementActions(validation);
    }

    return validation;
  }

  /**
   * Analyze evidence strength based on CITATIONS, not phrases
   * PRINCIPLE (Issue #402 Finding #6): Count actual sources/citations, not generic phrases
   */
  static analyzeEvidenceStrength(response) {
    let evidenceScore = 0;

    // CITATIONS: Look for actual references, sources, studies, URLs
    const citationPatterns = [
      // Academic citations: "According to X (2023)", "Smith et al.", "Journal of X"
      /(?:according to|per|from)\s+[\w\s]+\s*\(\d{4}\)/i,
      /\b[A-Z][a-z]+\s+et al\./,
      /\bjournal of\b/i,
      // News/media citations: "[Source]", "via X", "reported by"
      /\[([^\]]+)\]/,
      /\bvia\s+[\w\s]+:/i,
      /\breported by\b/i,
      // URLs as sources
      /https?:\/\/[^\s]+/,
      // Specific studies or research: "study by", "research from"
      /\bstudy\s+(?:by|from|conducted by)\s+[\w\s]+/i,
      /\bresearch\s+(?:by|from|conducted by)\s+[\w\s]+/i,
      // Data sources: "data from X", "statistics from Y"
      /\bdata\s+from\s+[\w\s]+/i,
      /\bstatistics\s+from\s+[\w\s]+/i,
    ];

    // Count distinct citations (not just pattern matches)
    const citationMatches = new Set();
    citationPatterns.forEach((pattern) => {
      // Patterns are already RegExp objects, use them directly with .match()
      // Need to add 'gi' flags for global and case-insensitive matching
      const patternStr = pattern.source;
      const flags = 'gi';
      const matches = response.match(new RegExp(patternStr, flags));
      if (matches) {
        matches.forEach(match => citationMatches.add(match.toLowerCase()));
      }
    });

    const citationCount = citationMatches.size;
    
    // Score based on citation count
    if (citationCount >= 3) {
      evidenceScore += 75; // Multiple sources = strong evidence
    } else if (citationCount >= 2) {
      evidenceScore += 50; // Two sources = moderate evidence
    } else if (citationCount >= 1) {
      evidenceScore += 30; // One source = some evidence
    }

    // QUANTITATIVE DATA: Specific numbers strengthen claims
    const quantitativePatterns = [
      /\d+%\s+(?:improvement|increase|success|reduction|growth)/i,
      /\$[\d,]+(?:\.\d{2})?\s+(?:saved|gained|increased|revenue)/i,
      /\d+x\s+(?:faster|better|more efficient)/i,
    ];
    
    quantitativePatterns.forEach((pattern) => {
      if (pattern.test(response)) evidenceScore += 10;
    });

    // COMPARISON WITH ALTERNATIVES: Demonstrates thorough analysis
    if (/\bcompared to\b/i.test(response)) evidenceScore += 15;
    if (/\bcase study\b/i.test(response)) evidenceScore += 15;

    // WEAK SIGNALS: Speculation, opinion without evidence
    const weakSignals = [
      /\b(?:i think|probably|might work|should be good|seems like)\b/i,
      /\b(?:everyone uses|popular choice)\b/i,
      /\b(?:in my opinion|personally)\b/i,
    ];

    weakSignals.forEach((pattern) => {
      if (pattern.test(response)) evidenceScore -= 20;
    });

    // Cap score between 0 and 100
    return Math.max(0, Math.min(100, evidenceScore));
  }

  static analyzeValueProposition(response, mode) {
    const valueIndicators = {
      COMPREHENSIVE: [
        /cost savings/i,
        /roi/i,
        /return on investment/i,
        /value proposition/i,
      ],
      PARTIAL: [/benefits/i, /advantages/i, /helps with/i],
      INSUFFICIENT: [/good option/i, /nice to have/i, /might help/i],
    };

    if (mode === "business_validation") {
      if (/\$[\d,]+/i.test(response) && /save|gain|increase/i.test(response)) {
        return "COMPREHENSIVE";
      } else if (
        valueIndicators.COMPREHENSIVE.some((pattern) => pattern.test(response))
      ) {
        return "PARTIAL";
      }
    } else {
      if (
        valueIndicators.COMPREHENSIVE.some((pattern) => pattern.test(response))
      ) {
        return "COMPREHENSIVE";
      } else if (
        valueIndicators.PARTIAL.some((pattern) => pattern.test(response))
      ) {
        return "PARTIAL";
      }
    }

    return "INSUFFICIENT";
  }

  static analyzeRiskAssessment(response, mode) {
    const riskPatterns = [
      /risk/i,
      /downside/i,
      /limitation/i,
      /drawback/i,
      /consideration/i,
      /might not work/i,
      /be careful/i,
      /watch out/i,
    ];

    const riskCount = riskPatterns.filter((pattern) =>
      pattern.test(response),
    ).length;

    if (mode === "business_validation") {
      if (riskCount >= 3 && /cost/i.test(response)) return "COMPREHENSIVE";
      if (riskCount >= 2) return "PARTIAL";
      return "MISSING";
    } else {
      if (riskCount >= 2) return "COMPREHENSIVE";
      if (riskCount >= 1) return "PARTIAL";
      return "MISSING";
    }
  }

  static checkDisclosureCompliance(response) {
    const disclosurePatterns = [
      /disclosure/i,
      /no affiliation/i,
      /not sponsored/i,
      /independent recommendation/i,
      /based on analysis/i,
      /do your own research/i,
    ];

    return disclosurePatterns.some((pattern) => pattern.test(response));
  }

  static applyModeSpecificValidation(response, mode, vaultData) {
    const modeValidation = {};

    switch (mode) {
      case "truth_general":
        modeValidation.comparison_framework =
          ProductValidator.validateComparisonFramework(response);
        break;

      case "business_validation":
        modeValidation.roi_analysis = this.validateROIAnalysis(response);
        modeValidation.tco_assessment = this.validateTCOAssessment(response);
        modeValidation.risk_adjusted_projections =
          this.validateRiskAdjustment(response);
        break;

      case "site_monkeys":
        if (vaultData) {
          modeValidation.operational_standards =
            this.validateOperationalStandards(response, vaultData);
          modeValidation.vendor_logic = this.validateVendorLogic(
            response,
            vaultData,
          );
        }
        break;
    }

    return modeValidation;
  }

  static validateComparisonFramework(response) {
    const comparisonElements = [
      /compared to/i,
      /versus/i,
      /alternative/i,
      /option/i,
      /pros and cons/i,
      /trade-off/i,
    ];

    const hasComparison = comparisonElements.some((pattern) =>
      pattern.test(response),
    );
    return hasComparison ? "PRESENT" : "MISSING";
  }

  static validateROIAnalysis(response) {
    const roiPatterns = [
      /roi/i,
      /return on investment/i,
      /payback period/i,
      /\$[\d,]+ (saved|gained)/i,
      /break even/i,
    ];

    return roiPatterns.some((pattern) => pattern.test(response))
      ? "PRESENT"
      : "MISSING";
  }

  static validateTCOAssessment(response) {
    const tcoPatterns = [
      /total cost/i,
      /ongoing costs/i,
      /hidden costs/i,
      /maintenance/i,
      /implementation cost/i,
      /subscription/i,
    ];

    return tcoPatterns.some((pattern) => pattern.test(response))
      ? "PRESENT"
      : "MISSING";
  }

  static validateRiskAdjustment(response) {
    const riskAdjustmentPatterns = [
      /worst case/i,
      /if it fails/i,
      /conservative estimate/i,
      /buffer/i,
      /contingency/i,
    ];

    return riskAdjustmentPatterns.some((pattern) => pattern.test(response))
      ? "PRESENT"
      : "MISSING";
  }

  static validateOperationalStandards(response, vaultData) {
    const standards = vaultData.operational_standards || [];
    let compliance = "UNKNOWN";

    if (
      standards.includes("PREMIUM_POSITIONING") &&
      /premium/i.test(response)
    ) {
      compliance = "COMPLIANT";
    } else if (
      standards.includes("COST_EFFICIENCY") &&
      /cost.*(saving|efficient)/i.test(response)
    ) {
      compliance = "COMPLIANT";
    }

    return compliance;
  }

  static validateVendorLogic(response, vaultData) {
    const vendorConstraints = vaultData.vendor_constraints || [];
    return vendorConstraints.length > 0 ? "VAULT_CONSTRAINED" : "OPEN";
  }

  static determineOverallValidation(validation) {
    const requirements = [
      validation.evidence_strength >= 50,
      validation.value_analysis !== "INSUFFICIENT",
      validation.risk_assessment !== "MISSING",
    ];

    return requirements.every((req) => req === true);
  }

  static generateEnforcementActions(validation) {
    const actions = [];

    if (validation.evidence_strength < 50) {
      actions.push({
        action: "EVIDENCE_INSUFFICIENT",
        message:
          "Recommendation lacks sufficient evidence. Provide data sources or mark as opinion.",
        severity: "HIGH",
      });
    }

    if (validation.value_analysis === "INSUFFICIENT") {
      actions.push({
        action: "VALUE_UNCLEAR",
        message:
          "Value proposition not clearly articulated. Explain specific benefits.",
        severity: "MEDIUM",
      });
    }

    if (validation.risk_assessment === "MISSING") {
      actions.push({
        action: "RISK_MISSING",
        message:
          "Risk assessment required for all recommendations. Include potential downsides.",
        severity: "HIGH",
      });
    }

    if (!validation.disclosure_compliance) {
      actions.push({
        action: "DISCLOSURE_REQUIRED",
        message: "Add disclosure statement about recommendation independence.",
        severity: "MEDIUM",
      });
    }

    return actions;
  }

  static generateStructuredRecommendation(originalResponse, validation) {
    if (!validation.validation_passed) {
      return {
        recommendation:
          "[ORIGINAL RECOMMENDATION BLOCKED - INSUFFICIENT EVIDENCE]",
        evidence_strength: `${validation.evidence_strength}% (Minimum: 50% required)`,
        value_analysis: validation.value_analysis,
        risk_assessment: validation.risk_assessment,
        required_improvements: validation.enforcement_actions.map(
          (action) => action.message,
        ),
        disclosure:
          "This recommendation has been blocked due to insufficient validation. Please provide additional evidence and risk analysis.",
        override_available: true,
      };
    }

    return null;
  }

  /**
   * Detect if response is information vs recommendation
   * PRINCIPLE (Issue #402 Findings #5, #15): Intent-based validation
   * Only apply strict validation to actual recommendations, not factual information
   */
  static async detectResponseIntent(response, context) {
    // Get reasoning if available in context
    let reasoning = context.reasoning || context.reasoningMetadata;
    
    if (!reasoning || !reasoning.detections) {
      // Apply reasoning to understand intent - use the user's message, not the AI response
      const userMessage = context.message || context.query || '';
      reasoning = await applyPrincipleBasedReasoning(userMessage, context);
    }
    
    // Check if this is informational content
    const isInformational = reasoning.detections?.informational_query || 
                           reasoning.detections?.fact_seeking ||
                           context?.phase4Metadata?.truth_type === 'PERMANENT';
    
    // Check if user explicitly asked for recommendations
    const isRecommendationRequest = reasoning.detections?.decision_making ||
                                    /(?:recommend|suggest|which.*should|what.*better|help me choose)/i.test(context.message || '');
    
    return {
      type: isInformational ? 'INFORMATION' : (isRecommendationRequest ? 'RECOMMENDATION' : 'MIXED'),
      confidence: reasoning.confidence || 0.7,
      reasoning: reasoning
    };
  }

  static async validate({ response, context }) {
    try {
      // PRINCIPLE (Issue #402 Findings #5, #15): Check intent before applying restrictions
      const intentAnalysis = await this.detectResponseIntent(response, context);
      
      console.log(`[PRODUCT-VALIDATION] Response intent: ${intentAnalysis.type}`);
      
      // If this is pure information delivery, bypass validation
      if (intentAnalysis.type === 'INFORMATION') {
        console.log('[PRODUCT-VALIDATION] Information request - delivering truth per caring family member principle');
        return {
          needsDisclosure: false,
          responseWithDisclosure: response,
          reason: 'Information request - no validation needed',
          intentAnalysis: intentAnalysis
        };
      }
      
      const validation = this.validateRecommendation(
        response,
        context.mode || "truth_general",
        context.vaultContext || null,
      );

      if (validation.validation_passed) {
        return {
          needsDisclosure: false,
          responseWithDisclosure: response,
        };
      }

      const hasDisclosure = /\[Note:|Caveat:|Important:|Disclaimer:/i.test(
        response,
      );

      if (hasDisclosure) {
        return {
          needsDisclosure: false,
          responseWithDisclosure: response,
        };
      }

      // Check if this is a PERMANENT fact - don't add disclaimers to established truth
      const truthType = context?.phase4Metadata?.truth_type;
      if (truthType === 'PERMANENT') {
        console.log('[PRODUCT-VALIDATION] PERMANENT truth type - no disclaimer added');
        return {
          needsDisclosure: false,
          responseWithDisclosure: response,
          reason: 'PERMANENT truth type - no disclaimer needed',
        };
      }

      // For RECOMMENDATION intent, augment (don't replace) with disclaimer
      const disclosure =
        "\n\n[Note: Evaluate this recommendation against your specific needs, budget, and risk tolerance. No solution is perfect for every situation.]";

      return {
        needsDisclosure: true,
        responseWithDisclosure: response + disclosure,
        reason: "Added value/risk disclosure to product recommendation",
        validationIssues: validation.enforcement_actions,
        intentAnalysis: intentAnalysis
      };
    } catch (error) {
      console.error("[PRODUCT-VALIDATION] Validation error:", error);

      return {
        needsDisclosure: false,
        responseWithDisclosure: response,
        error: error.message,
      };
    }
  }
} // This closes the ProductValidator class

export function validateProductRecommendation(
  response,
  mode,
  vaultData = null,
) {
  return ProductValidator.validateRecommendation(response, mode, vaultData);
}

export function enforceRecommendationStandards(response, validation) {
  if (!validation.validation_passed) {
    const structured = ProductValidator.generateStructuredRecommendation(
      response,
      validation,
    );

    return {
      original_blocked: true,
      enforcement_response: `RECOMMENDATION VALIDATION FAILED

The original response contained product/service recommendations that don't meet evidence standards:

${validation.enforcement_actions.map((action) => `• ${action.message}`).join("\n")}

EVIDENCE STRENGTH: ${validation.evidence_strength}% (Required: 50%+)
VALUE ANALYSIS: ${validation.value_analysis}
RISK ASSESSMENT: ${validation.risk_assessment}

To proceed with recommendations, please provide:
1. Specific evidence or data sources
2. Clear value proposition with quantified benefits
3. Risk analysis including potential downsides
4. Appropriate disclosure statements

Would you like me to research this topic more thoroughly to provide a properly validated recommendation?`,
      structured_data: structured,
    };
  }

  return { original_blocked: false, enforcement_response: response };
}
