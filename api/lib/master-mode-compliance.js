// MASTER MODE COMPLIANCE - Single Authority Replacing All Three Competing Functions
// Consolidates: ai-processors.js + modeLinter.js + config/modes.js implementations

export class MasterModeCompliance {
  // SINGLE AUTHORITATIVE FUNCTION - Replaces all three competing validateModeCompliance functions
  static validateModeCompliance(responseContent, mode, options = {}) {
    const {
      fingerprint = null,
      vaultLoaded = false,
      _conversationHistory = [],
      enforcementLevel = 'STANDARD',
    } = options;

    const validation = {
      mode_compliance: 'UNKNOWN',
      violations: [],
      corrections_applied: [],
      compliance_score: 100,
      fingerprint_valid: true,
      corrected_content: responseContent,
      enforcement_metadata: {
        source_authority: 'MASTER_MODE_COMPLIANCE',
        replaced_functions: [
          'ai-processors.validateModeCompliance',
          'modeLinter.validateModeCompliance',
          'config/modes.validateModeCompliance',
        ],
        processing_timestamp: new Date().toISOString(),
      },
    };

    // FINGERPRINT VALIDATION (from modeLinter.js)
    if (fingerprint) {
      validation.fingerprint_valid = this.validateFingerprint(responseContent, fingerprint);
      if (!validation.fingerprint_valid) {
        validation.violations.push('FINGERPRINT_MISMATCH');
        validation.compliance_score -= 15;
      }
    }

    // TRUTH_GENERAL MODE - Consolidated requirements from all three sources
    if (mode === 'truth_general') {
      // From ai-processors.js: Basic confidence check
      if (!responseContent.includes('confidence') && !responseContent.includes("I don't know")) {
        validation.violations.push('missing_confidence_indicators');
        validation.corrected_content +=
          '\n\n📊 **Confidence Assessment**: This response requires confidence level verification (High/Medium/Low).';
        validation.corrections_applied.push('CONFIDENCE_INJECTION');
        validation.compliance_score -= 20;
      }

      // From config/modes.js: Enhanced uncertainty patterns
      if (!/confidence|certain|uncertain|likely|probably/i.test(responseContent)) {
        validation.violations.push('missing_uncertainty_acknowledgment');
        validation.corrected_content +=
          '\n\n🔍 **Uncertainty Flag**: Key claims need confidence scoring.';
        validation.corrections_applied.push('UNCERTAINTY_FLAG');
        validation.compliance_score -= 15;
      }

      // From modeLinter.js: Assumption challenge requirements
      if (responseContent.includes('obviously') || responseContent.includes('everyone knows')) {
        validation.violations.push('unchallenged_assumptions_detected');
        validation.corrected_content +=
          '\n\n⚠️ **Assumption Challenge**: Claims marked as "obvious" require evidence verification.';
        validation.corrections_applied.push('ASSUMPTION_CHALLENGE');
        validation.compliance_score -= 25;
      }

      // Enhanced: Speculative language detection (from ai-processors.js)
      if (
        responseContent.includes('probably') ||
        (responseContent.includes('likely') && !responseContent.includes('confidence'))
      ) {
        validation.violations.push('speculative_language_without_confidence');
        validation.corrected_content +=
          '\n\n📊 **Speculation Flag**: Probability claims require explicit confidence levels.';
        validation.corrections_applied.push('SPECULATION_CONFIDENCE');
        validation.compliance_score -= 10;
      }
    }

    // BUSINESS_VALIDATION MODE - Consolidated survival analysis requirements
    if (mode === 'business_validation') {
      // From ai-processors.js: Basic survival keywords
      if (
        !responseContent.includes('cash') &&
        !responseContent.includes('survival') &&
        !responseContent.includes('risk')
      ) {
        validation.violations.push('missing_business_survival_analysis');
        validation.corrected_content +=
          '\n\n💰 **Business Survival Analysis**: Consider cash flow impact, runway duration, and continuity risks.';
        validation.corrections_applied.push('SURVIVAL_ANALYSIS');
        validation.compliance_score -= 30;
      }

      // From config/modes.js: Downside scenario modeling
      if (!/worst case|downside|if this fails|failure scenario/i.test(responseContent)) {
        validation.violations.push('missing_downside_scenario_modeling');
        validation.corrected_content +=
          '\n\n🚨 **Downside Modeling**: What happens if this strategy fails? Include worst-case scenario analysis.';
        validation.corrections_applied.push('DOWNSIDE_SCENARIOS');
        validation.compliance_score -= 25;
      }

      // Enhanced: Margin analysis (from site-monkeys enforcement)
      const marginMatches = responseContent.match(/(\d+)%.*margin/gi);
      if (marginMatches) {
        const lowMargins = marginMatches.filter((match) => {
          const percentage = parseInt(match.match(/\d+/)[0]);
          return percentage < 85; // Site Monkeys 85% minimum
        });

        if (lowMargins.length > 0) {
          validation.violations.push('margins_below_survival_threshold');
          validation.corrected_content += `\n\n📊 **Margin Warning**: Detected margins below 85% survival threshold: ${lowMargins.join(', ')}`;
          validation.corrections_applied.push('MARGIN_SURVIVAL_CHECK');
          validation.compliance_score -= 20;
        }
      }
    }

    // SITE_MONKEYS MODE - Vault compliance and branding
    if (mode === 'site_monkeys') {
      // From ai-processors.js: Branding requirement
      if (vaultLoaded && !responseContent.includes('🍌')) {
        validation.violations.push('missing_site_monkeys_branding');
        validation.corrected_content = '🍌 ' + validation.corrected_content;
        validation.corrections_applied.push('BRANDING_INJECTION');
        validation.compliance_score -= 5;
      }

      // From modeLinter.js: Fingerprint validation
      if (vaultLoaded && fingerprint && !validation.fingerprint_valid) {
        validation.violations.push('vault_fingerprint_mismatch');
        validation.corrected_content += `\n\n${fingerprint}`;
        validation.corrections_applied.push('FINGERPRINT_CORRECTION');
      }

      // Enhanced: Professional pricing enforcement
      const pricingMatches = responseContent.match(/\$(\d+)/g);
      if (pricingMatches) {
        const lowPrices = pricingMatches.filter((match) => {
          const amount = parseInt(match.replace('$', ''));
          return amount > 0 && amount < 697; // Site Monkeys minimum
        });

        if (lowPrices.length > 0) {
          validation.violations.push('pricing_below_professional_minimum');
          validation.corrected_content += `\n\n🔐 **Professional Pricing**: Amounts below $697 minimum detected: ${lowPrices.join(', ')}. Site Monkeys maintains premium service standards.`;
          validation.corrections_applied.push('PRICING_STANDARDS_ENFORCEMENT');
          validation.compliance_score -= 15;
        }
      }
    }

    // DETERMINE FINAL COMPLIANCE STATUS
    if (validation.violations.length === 0) {
      validation.mode_compliance = 'FULLY_COMPLIANT';
    } else if (validation.corrections_applied.length > 0) {
      validation.mode_compliance = 'CORRECTED_TO_COMPLIANCE';
    } else {
      validation.mode_compliance = 'NON_COMPLIANT';
    }

    // ENFORCEMENT LEVEL ADJUSTMENTS
    if (enforcementLevel === 'STRICT') {
      validation.compliance_score = Math.max(0, validation.compliance_score - 10);
    } else if (enforcementLevel === 'LENIENT') {
      validation.compliance_score = Math.min(100, validation.compliance_score + 10);
    }

    return validation;
  }

  // FINGERPRINT VALIDATION - From modeLinter.js
  static validateFingerprint(content, expectedFingerprint) {
    if (!expectedFingerprint) return true;

    const fingerprintPattern = new RegExp(
      `\\[${expectedFingerprint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`,
    );
    return fingerprintPattern.test(content);
  }

  // MODE DRIFT DETECTION - Enhanced from modeLinter.js
  static detectModeDrift(responseContent, expectedMode, _conversationHistory = []) {
    const driftIndicators = {
      truth_general: ['definitely', 'absolutely certain', 'without question'],
      business_validation: ['ignore costs', 'money is no object', "don't worry about survival"],
      site_monkeys: ['cheap solution', 'budget option', 'discount pricing'],
    };

    const indicators = driftIndicators[expectedMode] || [];
    const driftDetected = indicators.some((indicator) =>
      responseContent.toLowerCase().includes(indicator.toLowerCase()),
    );

    return {
      drift_detected: driftDetected,
      drift_severity: driftDetected ? 'HIGH' : 'NONE',
      drift_indicators_found: indicators.filter((indicator) =>
        responseContent.toLowerCase().includes(indicator.toLowerCase()),
      ),
    };
  }

  // COMPLIANCE REPORT GENERATION
  static generateComplianceReport(validation, mode) {
    return {
      mode: mode,
      compliance_status: validation.mode_compliance,
      compliance_score: validation.compliance_score,
      violations_count: validation.violations.length,
      corrections_count: validation.corrections_applied.length,
      fingerprint_valid: validation.fingerprint_valid,
      authority_source: 'MASTER_MODE_COMPLIANCE',
      processing_complete: true,
      recommendations:
        validation.violations.length > 0
          ? 'Review and address compliance violations before deployment'
          : 'Response meets all mode compliance requirements',
    };
  }
}

// INTEGRATION HELPER - Replaces all existing validateModeCompliance calls
export function validateModeCompliance(responseContent, mode, options = {}) {
  return MasterModeCompliance.validateModeCompliance(responseContent, mode, options);
}

// BACKWARD COMPATIBILITY - For existing imports
export const ModeLinter = {
  validateModeCompliance: MasterModeCompliance.validateModeCompliance,
  detectModeDrift: MasterModeCompliance.detectModeDrift,
  generateComplianceReport: MasterModeCompliance.generateComplianceReport,
};
