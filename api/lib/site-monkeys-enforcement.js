// SITE MONKEYS ENFORCEMENT - Brand Protection & Business Logic
// Enforces pricing floors, vault integration, professional standards, override rejection

export const SITE_MONKEYS_CONFIG = {
  pricing: {
    boost: { price: 697, name: 'Boost', minimum_margin: 85 },
    climb: { price: 1497, name: 'Climb', minimum_margin: 85 },
    lead: { price: 2997, name: 'Lead', minimum_margin: 85 },
  },

  business_logic: {
    minimum_margin: 85,
    professional_service_standards: true,
    zero_pricing_violations: true,
    quality_assurance_required: true,
  },

  brand_protection: {
    maintain_professional_image: true,
    no_discount_recommendations: true,
    premium_positioning: true,
    sustainability_focus: true,
  },
};

export const PRICING_VIOLATION_TRIGGERS = [
  'cheaper',
  'discount',
  'reduce price',
  'lower cost',
  'cut price',
  'underprice',
  'competitive pricing',
  'price reduction',
  'cost cutting',
];

export const OVERRIDE_ATTEMPT_PATTERNS = [
  'just this once',
  'exception',
  'special case',
  'bend the rules',
  'make an exception',
  'override',
  'ignore the',
  'bypass',
];

export function detectSiteMonkeysViolations(response, mode) {
  if (mode !== 'site_monkeys') {
    return { violations: [], clean: true };
  }

  const violations = [];
  const _responseLower = response.toLowerCase();

  // Check for pricing violations
  const pricingViolations = detectPricingViolations(response);
  violations.push(...pricingViolations);

  // Check for margin violations
  const marginViolations = detectMarginViolations(response);
  violations.push(...marginViolations);

  // Check for brand positioning violations
  const brandViolations = detectBrandViolations(response);
  violations.push(...brandViolations);

  // Check for override attempts
  const overrideAttempts = detectOverrideAttempts(response);
  violations.push(...overrideAttempts);

  return {
    violations,
    clean: violations.length === 0,
    total_violations: violations.length,
    severity_levels: categorizeViolations(violations),
  };
}

// REPLACE THE ENTIRE detectPricingViolations FUNCTION WITH:
export function detectPricingViolations(response) {
  const violations = [];
  const responseLower = response.toLowerCase();

  // Extract dollar amounts first
  const dollarMatches = response.match(/\$(\d{1,3}(?:,\d{3})*|\d+)/g);

  if (dollarMatches) {
    dollarMatches.forEach((match) => {
      const amount = parseInt(match.replace(/[\$,]/g, ''));

      if (amount > 0 && amount < SITE_MONKEYS_CONFIG.pricing.boost.price) {
        violations.push({
          type: 'pricing_floor_violation',
          severity: 'critical',
          detected_price: amount,
          minimum_required: SITE_MONKEYS_CONFIG.pricing.boost.price,
          violation_text: match,
          message: `Price ${match} below minimum Site Monkeys pricing floor of $${SITE_MONKEYS_CONFIG.pricing.boost.price}`,
        });
      }
    });
  }

  // Check for pricing reduction language
  PRICING_VIOLATION_TRIGGERS.forEach((trigger) => {
    if (responseLower.includes(trigger.toLowerCase())) {
      violations.push({
        type: 'pricing_reduction_language',
        severity: 'high',
        trigger: trigger,
        message: `Response contains pricing reduction language: "${trigger}"`,
      });
    }
  });

  return violations;
}

export function detectMarginViolations(response) {
  const violations = [];
  const marginMatches = response.match(/(\d+)%?\s*margin/gi);

  if (marginMatches) {
    marginMatches.forEach((match) => {
      const percentage = parseInt(match.match(/\d+/)[0]);
      if (percentage < SITE_MONKEYS_CONFIG.business_logic.minimum_margin) {
        violations.push({
          type: 'margin_violation',
          severity: 'critical',
          detected_margin: percentage,
          minimum_required: SITE_MONKEYS_CONFIG.business_logic.minimum_margin,
          violation_text: match,
          message: `Margin ${percentage}% below required ${SITE_MONKEYS_CONFIG.business_logic.minimum_margin}% minimum`,
        });
      }
    });
  }

  return violations;
}

export function detectBrandViolations(response) {
  const violations = [];
  const responseLower = response.toLowerCase();

  // Check for budget/economy positioning language
  const budgetLanguage = [
    'budget option',
    'cheap alternative',
    'economy service',
    'low cost solution',
    'bargain',
    'basic package',
  ];

  budgetLanguage.forEach((phrase) => {
    if (responseLower.includes(phrase.toLowerCase())) {
      violations.push({
        type: 'brand_positioning_violation',
        severity: 'medium',
        phrase: phrase,
        message: `Response undermines premium positioning with phrase: "${phrase}"`,
      });
    }
  });

  // Check for quality compromise suggestions
  const qualityCompromise = [
    'reduce quality',
    'lower standards',
    'cut corners',
    'basic version',
    'stripped down',
    'minimal features',
  ];

  qualityCompromise.forEach((phrase) => {
    if (responseLower.includes(phrase.toLowerCase())) {
      violations.push({
        type: 'quality_compromise',
        severity: 'high',
        phrase: phrase,
        message: `Response suggests quality compromise: "${phrase}"`,
      });
    }
  });

  return violations;
}

export function detectOverrideAttempts(response) {
  const violations = [];
  const responseLower = response.toLowerCase();

  OVERRIDE_ATTEMPT_PATTERNS.forEach((pattern) => {
    if (responseLower.includes(pattern.toLowerCase())) {
      violations.push({
        type: 'override_attempt',
        severity: 'critical',
        pattern: pattern,
        message: `Detected attempt to override business logic: "${pattern}"`,
      });
    }
  });

  return violations;
}

export function categorizeViolations(violations) {
  const categories = {
    critical: violations.filter((v) => v.severity === 'critical').length,
    high: violations.filter((v) => v.severity === 'high').length,
    medium: violations.filter((v) => v.severity === 'medium').length,
    low: violations.filter((v) => v.severity === 'low').length,
  };

  return categories;
}

export function enforceSiteMonkeysStandards(response, mode, vaultContent, vaultHealthy) {
  if (mode !== 'site_monkeys') {
    return response;
  }

  const violationAnalysis = detectSiteMonkeysViolations(response, mode);

  if (violationAnalysis.clean) {
    return addSiteMonkeysSignature(response, vaultContent, vaultHealthy);
  }

  // Handle violations
  return correctSiteMonkeysViolations(response, violationAnalysis, vaultContent, vaultHealthy);
}

export function correctSiteMonkeysViolations(
  response,
  violationAnalysis,
  vaultContent,
  vaultHealthy,
) {
  const criticalViolations = violationAnalysis.violations.filter((v) => v.severity === 'critical');

  if (criticalViolations.length > 0) {
    return generateViolationRejectionResponse(
      criticalViolations,
      response,
      vaultContent,
      vaultHealthy,
    );
  }

  // Correct non-critical violations
  let correctedResponse = response;

  violationAnalysis.violations.forEach((violation) => {
    correctedResponse = applyViolationCorrection(correctedResponse, violation);
  });

  // Add violation notice
  correctedResponse += '\n\n🚨 SITE MONKEYS STANDARDS ENFORCEMENT:\n';
  correctedResponse += `Detected ${violationAnalysis.total_violations} violation(s) - corrections applied to maintain professional standards.\n\n`;

  violationAnalysis.violations.forEach((violation) => {
    correctedResponse += `- ${violation.type.toUpperCase()}: ${violation.message}\n`;
  });

  return addSiteMonkeysSignature(correctedResponse, vaultContent, vaultHealthy);
}

export function generateViolationRejectionResponse(
  criticalViolations,
  originalResponse,
  vaultContent,
  vaultHealthy,
) {
  let rejectionResponse = '🚨 SITE MONKEYS BUSINESS LOGIC ENFORCEMENT:\n\n';
  rejectionResponse +=
    'The proposed response violates core Site Monkeys business standards and cannot be provided.\n\n';

  rejectionResponse += '**CRITICAL VIOLATIONS DETECTED:**\n';
  criticalViolations.forEach((violation) => {
    rejectionResponse += `- ${violation.type.toUpperCase()}: ${violation.message}\n`;
  });

  rejectionResponse += '\n**SITE MONKEYS STANDARDS (NON-NEGOTIABLE):**\n';
  rejectionResponse += `- Minimum pricing: $${SITE_MONKEYS_CONFIG.pricing.boost.price} (Boost), $${SITE_MONKEYS_CONFIG.pricing.climb.price} (Climb), $${SITE_MONKEYS_CONFIG.pricing.lead.price} (Lead)\n`;
  rejectionResponse += `- Minimum margins: ${SITE_MONKEYS_CONFIG.business_logic.minimum_margin}% for business sustainability\n`;
  rejectionResponse += '- Premium professional service positioning\n';
  rejectionResponse += '- Quality-first approach without compromise\n\n';

  rejectionResponse += '**BUSINESS RATIONALE:**\n';
  rejectionResponse += 'Site Monkeys maintains strict pricing and margin requirements to ensure:\n';
  rejectionResponse += '- Sustainable business operations\n';
  rejectionResponse += '- Quality service delivery\n';
  rejectionResponse += '- Professional team compensation\n';
  rejectionResponse += '- Long-term client success\n\n';

  rejectionResponse += 'Please rephrase your request within Site Monkeys professional standards.';

  return addSiteMonkeysSignature(rejectionResponse, vaultContent, vaultHealthy);
}

export function applyViolationCorrection(response, violation) {
  let corrected = response;

  switch (violation.type) {
    case 'pricing_reduction_language':
      corrected = corrected.replace(new RegExp(violation.trigger, 'gi'), 'optimize value delivery');
      break;

    case 'brand_positioning_violation':
      corrected = corrected.replace(
        new RegExp(violation.phrase, 'gi'),
        'professional service solution',
      );
      break;

    case 'quality_compromise':
      corrected = corrected.replace(
        new RegExp(violation.phrase, 'gi'),
        'streamlined professional approach',
      );
      break;
  }

  return corrected;
}

export function addSiteMonkeysSignature(response, vaultContent, vaultHealthy) {
  let signature = '';

  if (vaultHealthy && vaultContent.length > 1000) {
    signature =
      '\n\n📁 PROFESSIONAL ANALYSIS: Generated using Site Monkeys business intelligence vault with professional-grade methodology.';
  } else if (!vaultHealthy) {
    signature =
      '\n\n🚨 PROFESSIONAL FALLBACK: Analysis using core business logic due to vault issues - maintaining professional standards.';
  }

  return response + signature;
}

export function enforcePricingFloors(response, mode) {
  if (mode !== 'site_monkeys') {
    return response;
  }

  // Extract and validate all pricing mentions
  const priceMatches = response.match(/\$(\d{1,3}(?:,\d{3})*|\d+)/g);

  if (priceMatches) {
    const lowPrices = priceMatches.filter((match) => {
      const amount = parseInt(match.replace(/[\$,]/g, ''));
      return amount > 0 && amount < SITE_MONKEYS_CONFIG.pricing.boost.price;
    });

    if (lowPrices.length > 0) {
      return `${response}

💰 PRICING PROTECTION ENFORCEMENT:

Site Monkeys maintains professional service levels with minimum pricing:
- Boost: $${SITE_MONKEYS_CONFIG.pricing.boost.price}/month (${SITE_MONKEYS_CONFIG.pricing.boost.minimum_margin}% margin minimum)
- Climb: $${SITE_MONKEYS_CONFIG.pricing.climb.price}/month (${SITE_MONKEYS_CONFIG.pricing.climb.minimum_margin}% margin minimum)  
- Lead: $${SITE_MONKEYS_CONFIG.pricing.lead.price}/month (${SITE_MONKEYS_CONFIG.pricing.lead.minimum_margin}% margin minimum)

These pricing floors ensure sustainable operations, quality delivery, and professional service standards.

DETECTED LOW PRICING: ${lowPrices.join(', ')} - below professional service minimums.`;
    }
  }

  return response;
}

export function integrateVaultLogic(response, vaultContent, vaultHealthy, mode) {
  if (mode !== 'site_monkeys' || !vaultHealthy) {
    return response;
  }

  // Check if response properly utilizes vault intelligence
  const vaultUtilization = assessVaultUtilization(response, vaultContent);

  if (vaultUtilization.score < 70) {
    return enhanceWithVaultLogic(response, vaultContent, vaultUtilization);
  }

  return response;
}

export function assessVaultUtilization(response, _vaultContent) {
  const utilization = {
    score: 0,
    pricing_integration: false,
    business_logic_applied: false,
    operational_protocols: false,
    missing_elements: [],
  };

  // Check for pricing integration
  const hasBoostPricing = response.includes('697');
  const hasClimbPricing = response.includes('1497');
  const hasLeadPricing = response.includes('2997');

  if (hasBoostPricing || hasClimbPricing || hasLeadPricing) {
    utilization.pricing_integration = true;
    utilization.score += 40;
  } else {
    utilization.missing_elements.push('Site Monkeys pricing structure');
  }

  // Check for business logic application
  if (response.includes('margin') && response.includes('85')) {
    utilization.business_logic_applied = true;
    utilization.score += 30;
  } else {
    utilization.missing_elements.push('85% margin requirement');
  }

  // Check for operational protocols
  if (response.includes('professional') || response.includes('quality')) {
    utilization.operational_protocols = true;
    utilization.score += 30;
  } else {
    utilization.missing_elements.push('Professional service standards');
  }

  return utilization;
}

export function enhanceWithVaultLogic(response, vaultContent, utilization) {
  let enhanced = response;

  if (!utilization.pricing_integration) {
    enhanced += '\n\n💼 SITE MONKEYS PRICING STRUCTURE:\n';
    enhanced += `- Boost Plan: $${SITE_MONKEYS_CONFIG.pricing.boost.price}/month\n`;
    enhanced += `- Climb Plan: $${SITE_MONKEYS_CONFIG.pricing.climb.price}/month\n`;
    enhanced += `- Lead Plan: $${SITE_MONKEYS_CONFIG.pricing.lead.price}/month\n`;
  }

  if (!utilization.business_logic_applied) {
    enhanced += '\n\n📊 BUSINESS LOGIC INTEGRATION:\n';
    enhanced += `All Site Monkeys services maintain ${SITE_MONKEYS_CONFIG.business_logic.minimum_margin}% minimum margins for business sustainability and quality assurance.\n`;
  }

  if (!utilization.operational_protocols) {
    enhanced += '\n\n🎯 PROFESSIONAL STANDARDS:\n';
    enhanced +=
      'Site Monkeys maintains premium professional service delivery with quality-first approach and sustainable business practices.\n';
  }

  enhanced +=
    '\n\n📁 VAULT LOGIC ENHANCED: Response enhanced with Site Monkeys business intelligence for complete analysis.';

  return enhanced;
}

export const SITE_MONKEYS_ENFORCEMENT = {
  detectSiteMonkeysViolations,
  enforceSiteMonkeysStandards,
  enforcePricingFloors,
  integrateVaultLogic,
  correctSiteMonkeysViolations,
};
