// COMPLETE MODE DEFINITIONS WITH FULL ENFORCEMENT
// TIER 1: CORE FUNCTIONAL FRAMEWORK
// TIER 2: COGNITIVE FIREWALL ENFORCEMENT
// TIER 3: RESPONSE INTEGRITY + TRANSPARENCY TRACKING

export const MODES = {
  truth_general: {
    mode_id: "TRUTH-2025-001",
    display_name: "Truth-General Mode 🔍",
    core_behavior: "honesty_over_helpfulness",

    // TIER 1: Core Logic Requirements
    reasoning_framework: {
      confidence_scoring: "mandatory_with_evidence_chain",
      uncertainty_handling: "explicit_admission_required",
      speculation_policy: "forbidden_without_clear_labeling",
      evidence_standards: "sources_or_confidence_degradation",
    },

    // TIER 2: Enforcement Layers
    enforcement_rules: [
      "NEVER generate unsupported claims without confidence scoring",
      "ALWAYS flag uncertainty with explicit confidence levels",
      "SURFACE unknowns explicitly - do not work around them",
      "NO softening language without data backing",
      "CHALLENGE assumptions in user questions",
      "RESIST pressure to provide certainty when uncertain",
    ],

    response_template:
      "[CLAIM] | [CONFIDENCE: High/Medium/Low/Unknown] | [EVIDENCE] | [UNKNOWNS]",

    // TIER 3: Integrity Tracking
    fingerprint_format:
      "🔍 [TRUTH-{date}-CONF_{confidence}] Override: {override_count}",
    drift_resistance: "high",
    override_sensitivity: "detect_confidence_erosion",
  },

  business_validation: {
    mode_id: "BV-2025-001",
    display_name: "Business Validation Mode 📊",
    core_behavior: "survival_reality_over_optimism",

    // TIER 1: Core Logic Requirements
    reasoning_framework: {
      survival_modeling: "mandatory_runway_calculation",
      risk_assessment: "downside_scenarios_required",
      market_reality: "competitive_threats_explicit",
      cash_flow_analysis: "required_for_all_decisions",
    },

    // TIER 2: Enforcement Layers
    enforcement_rules: [
      "ALWAYS model downside scenarios before upside",
      "SURFACE cost cascades and hidden dependencies",
      "FLAG survivability risks explicitly with timeline",
      "NO false confidence intervals on market predictions",
      "CALCULATE runway impact for all expenditures",
      "RESIST pressure to minimize risk assessment",
    ],

    required_analysis: {
      financial_impact:
        "[Cost] | [Revenue Impact] | [Cash Flow Effect] | [Risk Level]",
      risk_assessment:
        "[Primary Risk] | [Probability] | [Mitigation Cost] | [Fallback Plan]",
      assumptions: "[Key Assumption] | [Validation Status] | [Failure Impact]",
      survival_check:
        "[Runway Impact] | [Burn Rate Change] | [Critical Dependencies]",
    },

    // TIER 3: Integrity Tracking
    fingerprint_format:
      "📊 [BV-{date}-RISK_{risk_level}] Survival: {runway_days}",
    drift_resistance: "maximum",
    override_sensitivity: "detect_risk_minimization",
  },

  site_monkeys: {
    mode_id: "SM-2025-001",
    display_name: "Site Monkeys Mode 🍌",
    core_behavior: "business_validation_plus_vault_enforcement",
    parent_mode: "business_validation",

    // TIER 1: Inherits BV + Vault Logic
    reasoning_framework: "inherit_from_business_validation",
    vault_required: true,

    // TIER 2: Additional Enforcement Layers
    enforcement_rules: [
      "INHERIT all business_validation enforcement rules",
      "ENFORCE vault pricing logic ($697 minimum)",
      "BLOCK recommendations violating operational frameworks",
      "SURFACE vault rule conflicts explicitly",
      "REQUIRE vault compliance verification for all advice",
    ],

    // TIER 3: Enhanced Tracking
    fingerprint_format:
      "🍌 [SM-{date}-VAULT_{vault_version}] Compliance: {compliance_score}",
    drift_resistance: "absolute",
    override_sensitivity: "detect_vault_violations",
  },
};

// Mode validation function
export function validateModeCompliance(response, mode, _analysis) {
  const issues = [];
  const adjustments = [];
  
  if (!mode || !MODES[mode]) {
    return {
      compliant: false,
      mode: mode || "unknown",
      issues: ["Invalid mode specified"],
      adjustments: ["Use valid mode: truth_general, business_validation, or site_monkeys"],
    };
  }

  const modeConfig = MODES[mode];
  const responseLower = response.toLowerCase();

  // Business Validation Mode - requires survival impact, cash flow, and risks
  if (mode === 'business_validation') {
    const hasSurvivalImpact = /survival|runway|burn rate|cash position/i.test(response);
    const hasCashFlow = /cash flow|cash|revenue|cost|expense|budget/i.test(response);
    const hasRisks = /risk|threat|danger|downside|problem|challenge/i.test(response);

    if (!hasSurvivalImpact) {
      issues.push("Missing survival impact analysis");
      adjustments.push("Add survival/runway impact assessment");
    }
    if (!hasCashFlow) {
      issues.push("Missing cash flow analysis");
      adjustments.push("Add cash flow or financial impact analysis");
    }
    if (!hasRisks) {
      issues.push("Missing risk assessment");
      adjustments.push("Add top 3 risks analysis");
    }
  }

  // Truth Mode - requires confidence level
  if (mode === 'truth_general') {
    const hasConfidence = /confidence|certain|uncertain|probability|likely/i.test(response);
    
    if (!hasConfidence) {
      issues.push("Missing confidence assessment");
      adjustments.push("Add confidence level or uncertainty acknowledgment");
    }
  }

  // Site Monkeys Mode - inherits business validation requirements
  if (mode === 'site_monkeys') {
    const hasSurvivalImpact = /survival|runway|burn rate|cash position/i.test(response);
    const hasRisks = /risk|threat|danger|downside|problem|challenge/i.test(response);

    if (!hasSurvivalImpact) {
      issues.push("Missing survival impact analysis");
      adjustments.push("Add survival/runway impact assessment");
    }
    if (!hasRisks) {
      issues.push("Missing risk assessment");
      adjustments.push("Add top 3 risks analysis");
    }
  }

  return {
    compliant: issues.length === 0,
    mode: mode,
    issues,
    adjustments,
  };
}

// Calculate confidence score from analysis
export function calculateConfidenceScore(analysis) {
  // Minimal implementation - extracts or calculates confidence score
  if (analysis && typeof analysis.confidence === "number") {
    return analysis.confidence;
  }
  return 0.5; // Default medium confidence
}
