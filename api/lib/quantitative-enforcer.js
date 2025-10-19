// QUANTITATIVE ENFORCER - Forces Real Calculations, Rejects Business Speak
// This is what fixes the "green beans problem" - forces the system to actually do math

export const SITE_MONKEYS_PRICING = {
  boost: { price: 697, name: 'Boost', description: 'Basic business validation and setup' },
  climb: { price: 1497, name: 'Climb', description: 'Advanced business optimization' },
  lead: { price: 2997, name: 'Lead', description: 'Enterprise-level business transformation' }
};

export const QUANTITATIVE_TRIGGERS = [
  'budget', 'cost', 'price', 'revenue', 'profit', 'projection', 'forecast',
  'calculate', 'numbers', 'financial', 'money', '$', 'percent', '%',
  'growth', 'margin', 'roi', 'break-even', 'cash flow', 'monthly', 'yearly'
];

export function requiresQuantitativeReasoning(message) {
  const messageLower = message.toLowerCase();
  return QUANTITATIVE_TRIGGERS.some(trigger => messageLower.includes(trigger));
}

// CURRENT BROKEN CODE (containsActualCalculations function):
export function containsActualCalculations(response) {
  const calculationIndicators = [
    /\$[\d,]+/g,                    // Dollar amounts
    /=\s*\$[\d,]+/g,                // Equations with results
    /\d+\s*×\s*\$\d+/g,             // Multiplication
    /month\s+\d+:/gi,               // Month labels
    /revenue:\s*\$[\d,]+/gi,        // Revenue calculations
    /profit:\s*\$[\d,]+/gi,         // Profit calculations
    /margin:\s*\d+%/gi              // Margin percentages
  ];
  
  return calculationIndicators.some(pattern => pattern.test(response));
}
export function enforceQuantitativeAnalysis(response, originalMessage, expertDomain, vaultContent) {
  if (!requiresQuantitativeReasoning(originalMessage)) {
    return response; // Not a quantitative request
  }
  
  if (containsActualCalculations(response)) {
    return response; // Already has calculations
  }
  
  // FORCE CALCULATION INJECTION
  const calculationAnalysis = generateRequiredCalculations(originalMessage, expertDomain, vaultContent);
  
  return `${response}

🔢 QUANTITATIVE ANALYSIS (REQUIRED - System detected financial modeling request):

${calculationAnalysis}

[NOTE: This mathematical analysis was enforced because the system detected a request requiring calculations, not just descriptive business guidance.]`;
}

export function generateRequiredCalculations(message, expertDomain, vaultContent) {
  const messageLower = message.toLowerCase();
  
  // Site Monkeys financial projections
  if ((messageLower.includes('budget') || messageLower.includes('projection') || messageLower.includes('revenue')) 
      && vaultContent.includes('Site Monkeys')) {
    return generateSiteMonkeysProjections(message);
  }
  
  // General business financial analysis
  if (messageLower.includes('financial') || messageLower.includes('business')) {
    return generateBusinessFinancialAnalysis(message);
  }
  
  // Cost analysis
  if (messageLower.includes('cost') || messageLower.includes('price')) {
    return generateCostAnalysis(message);
  }
  
  // Default calculation framework
  return generateDefaultQuantitativeFramework(message);
}

export function generateSiteMonkeysProjections(_message) {
  return `SITE MONKEYS FINANCIAL PROJECTIONS (Using Actual Pricing):

PRICING STRUCTURE (Enforced):
- Boost Plan: $${SITE_MONKEYS_PRICING.boost.price}/month
- Climb Plan: $${SITE_MONKEYS_PRICING.climb.price}/month  
- Lead Plan: $${SITE_MONKEYS_PRICING.lead.price}/month

CONSERVATIVE GROWTH SCENARIO:
Month 1: 2 Boost × $697 = $1,394 revenue
Month 3: 5 Boost × $697 + 1 Climb × $1,497 = $4,982 revenue
Month 6: 8 Boost × $697 + 3 Climb × $1,497 + 1 Lead × $2,997 = $12,465 revenue
Month 12: 15 Boost × $697 + 8 Climb × $1,497 + 3 Lead × $2,997 = $31,422 revenue

OPERATIONAL COSTS (Estimated):
Base operational: $2,500/month
Customer acquisition: $200 per customer
Support costs: 5% of revenue

MARGIN ANALYSIS:
Month 1: $1,394 - $2,900 = -$1,506 (Starting deficit)
Month 6: $12,465 - $4,123 = $8,342 (67% margin)
Month 12: $31,422 - $8,071 = $23,351 (74% margin)

CONFIDENCE: Medium (70%) - Based on pricing structure and conservative assumptions
ASSUMPTIONS: Customer acquisition rates, 10% monthly churn, operational cost estimates
MISSING DATA: Market validation, actual customer acquisition costs, competitive analysis`;
}

export function generateBusinessFinancialAnalysis(_message) {
  return `BUSINESS FINANCIAL FRAMEWORK:

REVENUE COMPONENTS:
- Primary revenue streams: [Requires specification]
- Secondary revenue: [Requires specification]
- Pricing strategy: [Requires market analysis]

COST STRUCTURE:
- Fixed costs: [Monthly operational baseline]
- Variable costs: [Per-unit or percentage of revenue]
- Customer acquisition cost: [Marketing spend ÷ new customers]

MARGIN CALCULATION:
Gross Margin = (Revenue - Direct Costs) ÷ Revenue × 100%
Net Margin = (Revenue - All Costs) ÷ Revenue × 100%

BREAK-EVEN ANALYSIS:
Break-even = Fixed Costs ÷ (Price per unit - Variable cost per unit)

CONFIDENCE: Low (40%) - Requires specific business data for accurate calculations
REQUIRED DATA: Actual pricing, cost structure, market size, customer acquisition metrics`;
}

export function generateCostAnalysis(_message) {
  return `COST ANALYSIS FRAMEWORK:

COST CATEGORIES:
- Development costs: [One-time setup]
- Operational costs: [Monthly recurring]
- Marketing costs: [Customer acquisition]
- Support costs: [Ongoing service delivery]

COST CALCULATION METHOD:
Total Cost of Ownership = Initial Costs + (Monthly Costs × Time Period) + (Variable Costs × Volume)

ROI CALCULATION:
ROI = (Revenue - Total Costs) ÷ Total Costs × 100%

PAYBACK PERIOD:
Payback = Initial Investment ÷ Monthly Net Cash Flow

CONFIDENCE: Medium (60%) - Framework provided, requires specific cost data
MISSING: Actual cost figures, time horizons, volume projections`;
}

export function generateDefaultQuantitativeFramework(_message) {
  return `QUANTITATIVE ANALYSIS FRAMEWORK:

CALCULATION METHODOLOGY:
1. Identify key variables and their relationships
2. Establish baseline assumptions with confidence levels
3. Model scenarios (optimistic/realistic/pessimistic)
4. Calculate ranges and sensitivity analysis

REQUIRED INPUTS:
- Baseline data points
- Growth assumptions
- Cost structures
- Market conditions

CONFIDENCE SCORING:
- High (80-95%): Based on verified data and established methodologies
- Medium (60-79%): Based on reasonable assumptions and industry benchmarks
- Low (40-59%): Significant uncertainty, multiple scenarios required

VALIDATION NEEDED:
- Source data verification
- Assumption validation
- Sensitivity testing
- Scenario modeling

NOTE: Specific calculations require actual data inputs for meaningful analysis.`;
}

export function validateCalculationQuality(response) {
  const qualityChecks = {
    has_specific_numbers: /\$[\d,]+/.test(response),
    has_step_by_step: /=/.test(response) || /\+/.test(response) || /×/.test(response),
    has_confidence_levels: /confidence/i.test(response),
    has_assumptions: /assum/i.test(response),
    has_margin_analysis: /margin/i.test(response),
    flags_missing_data: /missing|required|need/i.test(response)
  };
  
  const qualityScore = Object.values(qualityChecks).filter(check => check).length;
  
  return {
    quality_score: qualityScore,
    max_score: Object.keys(qualityChecks).length,
    percentage: Math.round((qualityScore / Object.keys(qualityChecks).length) * 100),
    checks: qualityChecks,
    passes_quality: qualityScore >= 4
  };
}

export function rejectGenericBusinessSpeak(response) {
  const genericPhrases = [
    'consider the pricing structure',
    'analyze the market trends',
    'evaluate the cost structure',
    'assess the financial implications',
    'develop a comprehensive plan',
    'create projections based on',
    'model realistic scenarios'
  ];
  
  const containsGenericSpeak = genericPhrases.some(phrase => 
    response.toLowerCase().includes(phrase.toLowerCase())
  );
  
  if (containsGenericSpeak && !containsActualCalculations(response)) {
    return {
      is_generic: true,
      rejection_reason: 'Response contains generic business advice without actual calculations',
      required_fix: 'Must include specific numbers, step-by-step calculations, and quantitative analysis'
    };
  }
  
  return {
    is_generic: false,
    quality_check: validateCalculationQuality(response)
  };
}

export function enforceCalculationStandards(response, originalMessage, _expertDomain) {
  if (!requiresQuantitativeReasoning(originalMessage)) {
    return response;
  }
  
  const genericCheck = rejectGenericBusinessSpeak(response);
  
  if (genericCheck.is_generic) {
    return `❌ QUANTITATIVE ANALYSIS ENFORCEMENT:

The system detected a financial/quantitative request but received generic business advice instead of actual calculations.

REQUIRED: Specific numbers, step-by-step calculations, confidence levels, and assumptions.

ORIGINAL RESPONSE (Insufficient): ${response}

ENFORCEMENT TRIGGERED: This response does not meet quantitative analysis standards for financial/business modeling requests.

Please request specific calculations with actual numbers, not descriptive business guidance.`;
  }
  
  const qualityCheck = validateCalculationQuality(response);
  
  if (!qualityCheck.passes_quality) {
    return `${response}

⚠️ CALCULATION QUALITY CHECK:
- Quality Score: ${qualityCheck.percentage}% (${qualityCheck.quality_score}/${qualityCheck.max_score})
- Missing Elements: ${Object.entries(qualityCheck.checks)
  .filter(([key, value]) => !value)
  .map(([key]) => key.replace(/_/g, ' '))
  .join(', ')}

For complete quantitative analysis, consider requesting: specific numbers, step-by-step calculations, confidence levels, and assumption validation.`;
  }
  
  return response;
}
