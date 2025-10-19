// SURVIVAL GUARDIAN - Business Protection & Margin Enforcement
// Enforces 85% margin requirement, survival modeling, cash flow protection

export const SURVIVAL_REQUIREMENTS = {
  minimum_margin: 85, // Non-negotiable for Site Monkeys
  cash_runway_minimum: 6, // Months
  break_even_maximum: 12, // Months to break-even
  customer_concentration_limit: 30 // Max % from single customer
};

export const BUSINESS_SURVIVAL_TRIGGERS = [
  'margin', 'profit', 'survival', 'cash flow', 'runway', 'break-even',
  'bankruptcy', 'closure', 'risk', 'financial', 'business model'
];

export function requiresSurvivalAnalysis(message, expertDomain) {
  const messageLower = message.toLowerCase();
  
  // Always required for financial analysis domain
  if (expertDomain === 'financial_analysis') {
    return true;
  }
  
  // Required if survival triggers detected
  return BUSINESS_SURVIVAL_TRIGGERS.some(trigger => messageLower.includes(trigger));
}

export function enforceMarginRequirements(response, mode) {
  if (mode !== 'site_monkeys') {
    return response; // Only enforce for Site Monkeys mode
  }
  
  const marginViolations = detectMarginViolations(response);
  
  if (marginViolations.length > 0) {
    return `${response}

🚨 MARGIN ENFORCEMENT ALERT:

Site Monkeys requires minimum ${SURVIVAL_REQUIREMENTS.minimum_margin}% margins for business survival.

VIOLATIONS DETECTED:
${marginViolations.map(violation => `- ${violation.description}: ${violation.suggested_margin}% (BELOW ${SURVIVAL_REQUIREMENTS.minimum_margin}% MINIMUM)`).join('\n')}

CORRECTIVE ACTION REQUIRED:
- Increase pricing to meet margin requirements
- Reduce costs without sacrificing quality
- Validate business model sustainability

MARGIN PROTECTION: Site Monkeys pricing ($697/$1,497/$2,997) is designed to maintain survival margins. Any projections below these thresholds require immediate business model revision.`;
  }
  
  return response;
}

// Fix detectMarginViolations function (line 50)
export function detectMarginViolations(response) {
  const marginMatches = response.match(/(\d+)%?\s*margin/gi); // FIXED: Removed double escaping
  const violations = [];
  
  if (marginMatches) {
    marginMatches.forEach(match => {
      const percentage = parseInt(match.match(/\d+/)[0]);  // FIXED: Simplified regex
      if (percentage < SURVIVAL_REQUIREMENTS.minimum_margin) {
        violations.push({
          found_margin: percentage,
          suggested_margin: percentage,
          description: `${percentage}% margin detected`,
          severity: percentage < 50 ? 'critical' : percentage < 70 ? 'high' : 'medium'
        });
      }
    });
  }
  
  return violations;
}

export function generateSurvivalAnalysis(message, expertDomain, _vaultContent) {
  if (!requiresSurvivalAnalysis(message, expertDomain)) {
    return null;
  }
  
  return `🛡️ BUSINESS SURVIVAL ANALYSIS (Required):

SURVIVAL METRICS FRAMEWORK:
1. MARGIN PROTECTION (Minimum ${SURVIVAL_REQUIREMENTS.minimum_margin}%):
   - Gross margin must exceed operational baseline
   - Net margin must support growth and contingencies
   - Pricing power analysis and competitive moat assessment

2. CASH FLOW SURVIVAL:
   - Monthly burn rate calculation
   - Cash runway: ${SURVIVAL_REQUIREMENTS.cash_runway_minimum}+ months minimum
   - Break-even timeline: ${SURVIVAL_REQUIREMENTS.break_even_maximum} months maximum

3. WORST-CASE SCENARIO MODELING:
   - 50% revenue reduction scenario
   - Customer loss scenario (largest ${SURVIVAL_REQUIREMENTS.customer_concentration_limit}% of customers)
   - Market downturn impact assessment

4. SURVIVAL STRESS TESTS:
   - Economic recession scenario
   - Competition pricing pressure scenario
   - Customer acquisition cost doubling scenario

SURVIVAL RECOMMENDATIONS:
- Maintain minimum ${SURVIVAL_REQUIREMENTS.minimum_margin}% margins at all times
- Diversify customer base (no single customer >30% of revenue)
- Build cash reserves equal to ${SURVIVAL_REQUIREMENTS.cash_runway_minimum} months operating expenses
- Develop multiple revenue streams for stability

CONFIDENCE: High (90%) - Based on established business survival principles
CRITICAL SUCCESS FACTORS: Margin discipline, cash management, customer diversification`;
}

export function validateBusinessSurvival(projections, mode) {
  const validation = {
    margin_compliance: true,
    cash_flow_positive: true,
    break_even_timeline: true,
    customer_concentration: true,
    survival_score: 0,
    alerts: []
  };
  
  // Check margin compliance
  if (mode === 'site_monkeys') {
    const margins = extractMargins(projections);
    margins.forEach(margin => {
      if (margin < SURVIVAL_REQUIREMENTS.minimum_margin) {
        validation.margin_compliance = false;
        validation.alerts.push({
          type: 'margin_violation',
          severity: 'critical',
          message: `${margin}% margin below required ${SURVIVAL_REQUIREMENTS.minimum_margin}%`,
          action: 'Increase pricing or reduce costs to meet survival requirements'
        });
      }
    });
  }
  
  // Check cash flow projections
  const cashFlowIssues = detectCashFlowIssues(projections);
  if (cashFlowIssues.length > 0) {
    validation.cash_flow_positive = false;
    validation.alerts.push(...cashFlowIssues);
  }
  
  // Calculate survival score
  validation.survival_score = calculateSurvivalScore(validation);
  
  return validation;
}

// Also fix extractMargins function (line 138)
export function extractMargins(text) {
  const marginMatches = text.match(/(\d+)%?\s*margin/gi);  // FIXED
  if (!marginMatches) return [];
  
  return marginMatches.map(match => {
    const percentage = parseInt(match.match(/\d+/)[0]);
    return percentage;
  });
}

export function detectCashFlowIssues(projections) {
  const issues = [];
  
  // Look for negative cash flow indicators
  if (projections.includes('-$') || projections.includes('loss') || projections.includes('deficit')) {
    issues.push({
      type: 'negative_cash_flow',
      severity: 'high',
      message: 'Negative cash flow detected in projections',
      action: 'Accelerate revenue generation or reduce costs'
    });
  }
  
  // Look for break-even timeline issues
  const monthMatches = projections.match(/month\s+(\d+)/gi);
  if (monthMatches) {
    const months = monthMatches.map(match => parseInt(match.match(/\d+/)[0]));
    const maxMonth = Math.max(...months);
    if (maxMonth > SURVIVAL_REQUIREMENTS.break_even_maximum) {
      issues.push({
        type: 'extended_break_even',
        severity: 'medium',
        message: `Break-even timeline extends beyond ${SURVIVAL_REQUIREMENTS.break_even_maximum} months`,
        action: 'Accelerate customer acquisition or increase pricing'
      });
    }
  }
  
  return issues;
}

export function calculateSurvivalScore(validation) {
  let score = 100;
  
  validation.alerts.forEach(alert => {
    switch (alert.severity) {
      case 'critical':
        score -= 30;
        break;
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        score -= 5;
        break;
    }
  });
  
  return Math.max(score, 0);
}

export function generateWorstCaseScenario(baseProjections, mode) {
  if (mode !== 'site_monkeys') {
    return null; // Only for Site Monkeys business protection
  }
  
  return `🚨 WORST-CASE SURVIVAL SCENARIO:

REVENUE STRESS TEST (50% reduction):
- Customer acquisition drops 70%
- Existing customer churn increases to 15% monthly  
- Average deal size decreases 30%
- Market demand contracts significantly

COST PRESSURE SCENARIO:
- Customer acquisition costs double
- Operational costs increase 20% (inflation, competition)
- Support costs increase due to customer retention efforts

SURVIVAL IMPLICATIONS:
- Cash runway reduced to immediate concern
- Margin compression below survival threshold
- Break-even timeline extends beyond acceptable range

EMERGENCY SURVIVAL ACTIONS:
1. Immediately increase pricing to maintain ${SURVIVAL_REQUIREMENTS.minimum_margin}% margins
2. Reduce all non-essential expenses
3. Focus on highest-margin customers only
4. Secure additional cash reserves
5. Accelerate collections and payment terms

SURVIVAL CONFIDENCE: This scenario requires immediate action to prevent business failure
MARGIN PROTECTION: Never accept margins below ${SURVIVAL_REQUIREMENTS.minimum_margin}% even in crisis`;
}

export function enforceBusinessSurvival(response, originalMessage, expertDomain, mode) {
  if (!requiresSurvivalAnalysis(originalMessage, expertDomain)) {
    return response;
  }
  
  // Always enforce margin requirements for Site Monkeys
  let enhancedResponse = enforceMarginRequirements(response, mode);
  
  // Add survival analysis if not present
  if (!containsSurvivalAnalysis(enhancedResponse)) {
    const survivalAnalysis = generateSurvivalAnalysis(originalMessage, expertDomain, mode);
    if (survivalAnalysis) {
      enhancedResponse += '\n\n' + survivalAnalysis;
    }
  }
  
  // Validate business survival metrics
  const survivalValidation = validateBusinessSurvival(enhancedResponse, mode);
  
  if (survivalValidation.alerts.length > 0) {
    enhancedResponse += '\n\n🚨 SURVIVAL VALIDATION ALERTS:\n';
    survivalValidation.alerts.forEach(alert => {
      enhancedResponse += `- ${alert.type.toUpperCase()}: ${alert.message}\n  ACTION: ${alert.action}\n`;
    });
    
    enhancedResponse += `\nSURVIVAL SCORE: ${survivalValidation.survival_score}/100`;
    
    if (survivalValidation.survival_score < 70) {
      enhancedResponse += ' ⚠️ BUSINESS SURVIVAL AT RISK';
    }
  }
  
  // Add worst-case scenario for critical situations
  if (mode === 'site_monkeys' && survivalValidation.survival_score < 70) {
    const worstCase = generateWorstCaseScenario(enhancedResponse, mode);
    if (worstCase) {
      enhancedResponse += '\n\n' + worstCase;
    }
  }
  
  return enhancedResponse;
}

export function containsSurvivalAnalysis(response) {
  const survivalIndicators = [
    'survival', 'cash flow', 'runway', 'break-even', 'worst-case',
    'margin', 'business survival', 'survival score'
  ];
  
  return survivalIndicators.some(indicator => 
    response.toLowerCase().includes(indicator.toLowerCase())
  );
}

export function applySurvivalProtection(response, mode, _vaultContent) {
  if (mode !== 'site_monkeys') {
    return response;
  }
  
  // Always append survival protection notice for Site Monkeys
  return `${response}

🛡️ BUSINESS SURVIVAL PROTECTION ACTIVE:
Site Monkeys maintains ${SURVIVAL_REQUIREMENTS.minimum_margin}%+ margins and survival-first business modeling to ensure long-term success and client service continuity.`;
}
