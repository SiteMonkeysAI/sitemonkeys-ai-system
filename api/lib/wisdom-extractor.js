// api/lib/wisdom-extractor.js
// WISDOM EXTRACTOR - Extracts business intelligence from your existing modules
// Transforms your 30+ modules into wisdom sources for AI reasoning

// Import existing modules (NO CHANGES TO THEM)
import * as assumptions from "./assumptions.js";
import * as survivalGuardian from "./survival-guardian.js";
import * as protectiveIntelligence from "./protective-intelligence.js";
import * as politicalGuardrails from "./politicalGuardrails.js";
import * as productValidation from "./productValidation.js";
import * as personalities from "./personalities.js";
import * as enforcementProtocols from "./site-monkeys/enforcement-protocols.js";
import * as systemIntelligence from "./system-intelligence.js";
import * as enhancedIntelligence from "./enhanced-intelligence.js";
import * as quantitativeEnforcer from "./quantitative-enforcer.js";
import * as politicalNeutrality from "./political-neutrality.js";
import * as expertValidator from "./expert-validator.js";
import * as caringFamilyCore from "./caring-family-core.js";
import * as founderProtection from "./site-monkeys/founder-protection.js";
import * as siteMonkeysEnforcement from "./site-monkeys-enforcement.js";

class WisdomExtractor {
  constructor() {
    this.wisdomSources = new Map();
    this.extractedPrinciples = new Map();
    this.businessIntelligence = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      console.log("📚 Extracting wisdom from existing modules...");

      // Register all wisdom sources
      this.registerWisdomSources();

      // Extract core business principles
      this.extractBusinessPrinciples();

      // Extract decision-making wisdom
      this.extractDecisionWisdom();

      // Extract enforcement wisdom
      this.extractEnforcementWisdom();

      this.initialized = true;
      console.log("✅ Business wisdom extraction complete");
      console.log(
        `📊 Extracted ${this.extractedPrinciples.size} core principles`,
      );
      console.log(
        `🧠 Identified ${this.businessIntelligence.size} intelligence domains`,
      );

      return true;
    } catch (error) {
      console.error("❌ Wisdom extraction failed:", error);
      this.initialized = false;
      return false;
    }
  }

  registerWisdomSources() {
    // Register existing modules as wisdom sources
    const sources = {
      business_survival: {
        module: survivalGuardian,
        domain: "survival_strategy",
      },
      truth_assessment: { module: assumptions, domain: "epistemology" },
      user_protection: {
        module: protectiveIntelligence,
        domain: "user_welfare",
      },
      political_responsibility: {
        module: politicalGuardrails,
        domain: "democratic_values",
      },
      product_integrity: {
        module: productValidation,
        domain: "recommendation_ethics",
      },
      personality_intelligence: {
        module: personalities,
        domain: "communication_strategy",
      },
      enforcement_protocols: {
        module: enforcementProtocols,
        domain: "operational_integrity",
      },
      system_intelligence: {
        module: systemIntelligence,
        domain: "technical_excellence",
      },
      enhanced_intelligence: {
        module: enhancedIntelligence,
        domain: "advanced_reasoning",
      },
      quantitative_analysis: {
        module: quantitativeEnforcer,
        domain: "analytical_rigor",
      },
      political_neutrality: {
        module: politicalNeutrality,
        domain: "neutrality_principles",
      },
      expert_validation: {
        module: expertValidator,
        domain: "expertise_assessment",
      },
      caring_intelligence: {
        module: caringFamilyCore,
        domain: "empathetic_reasoning",
      },
      founder_protection: {
        module: founderProtection,
        domain: "leadership_support",
      },
      operational_enforcement: {
        module: siteMonkeysEnforcement,
        domain: "business_operations",
      },
    };

    for (const [name, source] of Object.entries(sources)) {
      this.wisdomSources.set(name, source);
    }
  }

  extractBusinessPrinciples() {
    // Extract core business principles from enforcement protocols
    if (enforcementProtocols && enforcementProtocols.ENFORCEMENT_PROTOCOLS) {
      const protocols = enforcementProtocols.ENFORCEMENT_PROTOCOLS;

      if (protocols.truth_first) {
        this.extractedPrinciples.set("truth_supremacy", {
          principle: "Truth is the foundation of all good decisions",
          wisdom: protocols.truth_first,
          application: "Always prioritize factual accuracy over comfort",
          confidence_requirement: 0.85,
          domain: "epistemology",
        });
      }

      if (protocols.survivability) {
        this.extractedPrinciples.set("business_survival", {
          principle: "Business survival trumps all other considerations",
          wisdom: protocols.survivability,
          application: "Every decision must consider survival impact",
          confidence_requirement: 0.9,
          domain: "business_strategy",
        });
      }

      if (protocols.profitability) {
        this.extractedPrinciples.set("sustainable_profitability", {
          principle: "Sustainable profitability enables long-term success",
          wisdom: protocols.profitability,
          application: "Optimize for long-term value creation",
          confidence_requirement: 0.8,
          domain: "financial_strategy",
        });
      }
    }

    // Extract survival wisdom from survival guardian
    if (survivalGuardian && survivalGuardian.SURVIVAL_REQUIREMENTS) {
      const requirements = survivalGuardian.SURVIVAL_REQUIREMENTS;

      this.extractedPrinciples.set("margin_discipline", {
        principle: `Maintain minimum ${requirements.minimum_margin}% margins for survival`,
        wisdom: requirements,
        application:
          "All pricing and cost decisions must preserve margin discipline",
        confidence_requirement: 0.95,
        domain: "financial_discipline",
      });

      this.extractedPrinciples.set("cash_runway_management", {
        principle: `Maintain minimum ${requirements.cash_runway_minimum} months cash runway`,
        wisdom: requirements,
        application: "Cash flow management is existential priority",
        confidence_requirement: 0.9,
        domain: "cash_management",
      });
    }
  }

  extractDecisionWisdom() {
    // Extract decision-making patterns from existing logic

    // From survival guardian
    this.businessIntelligence.set("survival_analysis", {
      domain: "business_survival",
      wisdom: "Analyze worst-case scenarios first, then optimize for best-case",
      application_pattern:
        "survival_impact -> risk_mitigation -> opportunity_optimization",
      confidence_factors: [
        "cash_flow_impact",
        "customer_concentration",
        "competitive_pressure",
      ],
      decision_framework: "Survival first, growth second, optimization third",
    });

    // From assumptions module
    this.businessIntelligence.set("truth_assessment", {
      domain: "epistemology",
      wisdom: "Distinguish what is known from what is assumed",
      application_pattern:
        "evidence_assessment -> confidence_scaling -> uncertainty_communication",
      confidence_factors: [
        "evidence_quality",
        "source_credibility",
        "logical_consistency",
      ],
      decision_framework:
        "Facts first, reasonable assumptions second, speculation last",
    });

    // From product validation
    this.businessIntelligence.set("recommendation_integrity", {
      domain: "user_welfare",
      wisdom: "Recommendations must genuinely benefit the user",
      application_pattern:
        "user_benefit_analysis -> alternative_consideration -> evidence_provision",
      confidence_factors: [
        "user_value",
        "evidence_strength",
        "alternative_comparison",
      ],
      decision_framework:
        "User benefit over vendor profit, evidence over claims",
    });

    // From political guardrails
    this.businessIntelligence.set("democratic_responsibility", {
      domain: "democratic_values",
      wisdom: "Strengthen democratic participation through informed choice",
      application_pattern:
        "democratic_impact_assessment -> empowerment_approach -> neutrality_maintenance",
      confidence_factors: [
        "democratic_impact",
        "bias_potential",
        "empowerment_effectiveness",
      ],
      decision_framework: "Empower choice, avoid bias, strengthen democracy",
    });
  }

  extractEnforcementWisdom() {
    // Extract enforcement patterns that become validation wisdom

    this.businessIntelligence.set("quality_assurance", {
      domain: "operational_excellence",
      wisdom: "Zero-failure delivery requires multi-layer validation",
      application_pattern:
        "quality_gates -> validation_cascade -> fallback_preparation",
      confidence_factors: [
        "validation_coverage",
        "fallback_reliability",
        "error_recovery",
      ],
      decision_framework: "Prevent errors, detect failures, recover gracefully",
    });

    this.businessIntelligence.set("cost_consciousness", {
      domain: "resource_optimization",
      wisdom: "Every resource expenditure must be justified and optimized",
      application_pattern:
        "cost_assessment -> value_analysis -> optimization_opportunity",
      confidence_factors: [
        "cost_transparency",
        "value_delivery",
        "optimization_potential",
      ],
      decision_framework:
        "Minimize cost, maximize value, optimize continuously",
    });
  }

  // MAIN WISDOM EXTRACTION METHOD
  async extractWisdom({ query, context, mode, multimodalInsights = [] }) {
    console.log("🧠 Extracting relevant business wisdom...");

    const wisdom = {
      applicable_principles: this.identifyApplicablePrinciples(
        query,
        context,
        mode,
      ),
      business_intelligence: this.gatherBusinessIntelligence(
        query,
        context,
        mode,
      ),
      decision_frameworks: this.selectDecisionFrameworks(query, context, mode),
      confidence_requirements: this.determineConfidenceRequirements(
        query,
        context,
        mode,
      ),
      validation_criteria: this.establishValidationCriteria(
        query,
        context,
        mode,
      ),
      multimodal_context: multimodalInsights,
      wisdom_synthesis: null,
    };

    // Synthesize wisdom for AI reasoning
    wisdom.wisdom_synthesis = this.synthesizeWisdom(wisdom);

    console.log(
      `✅ Extracted ${wisdom.applicable_principles.length} principles and ${wisdom.business_intelligence.length} intelligence domains`,
    );

    return wisdom;
  }

  identifyApplicablePrinciples(query, context, mode) {
    const applicablePrinciples = [];

    // Always apply truth supremacy
    if (this.extractedPrinciples.has("truth_supremacy")) {
      applicablePrinciples.push(
        this.extractedPrinciples.get("truth_supremacy"),
      );
    }

    // Business survival for business contexts
    if (
      mode === "business_validation" ||
      mode === "site_monkeys" ||
      this.isBusinessContext(query, context)
    ) {
      if (this.extractedPrinciples.has("business_survival")) {
        applicablePrinciples.push(
          this.extractedPrinciples.get("business_survival"),
        );
      }
      if (this.extractedPrinciples.has("margin_discipline")) {
        applicablePrinciples.push(
          this.extractedPrinciples.get("margin_discipline"),
        );
      }
      if (this.extractedPrinciples.has("cash_runway_management")) {
        applicablePrinciples.push(
          this.extractedPrinciples.get("cash_runway_management"),
        );
      }
    }

    // Sustainable profitability for strategic decisions
    if (this.isStrategicDecision(query, context)) {
      if (this.extractedPrinciples.has("sustainable_profitability")) {
        applicablePrinciples.push(
          this.extractedPrinciples.get("sustainable_profitability"),
        );
      }
    }

    return applicablePrinciples;
  }

  gatherBusinessIntelligence(query, context, _mode) {
    const intelligence = [];

    // Always include truth assessment
    if (this.businessIntelligence.has("truth_assessment")) {
      intelligence.push(this.businessIntelligence.get("truth_assessment"));
    }

    // Business survival for business queries
    if (this.isBusinessContext(query, context)) {
      if (this.businessIntelligence.has("survival_analysis")) {
        intelligence.push(this.businessIntelligence.get("survival_analysis"));
      }
    }

    // Recommendation integrity for advice queries
    if (this.isRecommendationQuery(query)) {
      if (this.businessIntelligence.has("recommendation_integrity")) {
        intelligence.push(
          this.businessIntelligence.get("recommendation_integrity"),
        );
      }
    }

    // Democratic responsibility for political queries
    if (this.isPoliticalContext(query)) {
      if (this.businessIntelligence.has("democratic_responsibility")) {
        intelligence.push(
          this.businessIntelligence.get("democratic_responsibility"),
        );
      }
    }

    // Quality assurance for all queries
    if (this.businessIntelligence.has("quality_assurance")) {
      intelligence.push(this.businessIntelligence.get("quality_assurance"));
    }

    return intelligence;
  }

  selectDecisionFrameworks(query, context, _mode) {
    const frameworks = [];

    // Business decision framework
    if (this.isBusinessContext(query, context)) {
      frameworks.push({
        name: "Business Survival Framework",
        sequence: [
          "Assess survival impact",
          "Analyze cash flow implications",
          "Model scenarios",
          "Identify risks",
          "Recommend actions",
        ],
        priority: "survival_first",
      });
    }

    // Truth assessment framework
    frameworks.push({
      name: "Truth Assessment Framework",
      sequence: [
        "Gather evidence",
        "Assess confidence",
        "Identify assumptions",
        "Communicate uncertainty",
        "Provide transparency",
      ],
      priority: "truth_first",
    });

    // Recommendation framework
    if (this.isRecommendationQuery(query)) {
      frameworks.push({
        name: "Recommendation Integrity Framework",
        sequence: [
          "Understand user need",
          "Assess genuine benefit",
          "Provide evidence",
          "Consider alternatives",
          "Acknowledge limitations",
        ],
        priority: "user_benefit_first",
      });
    }

    return frameworks;
  }

  determineConfidenceRequirements(query, context, mode) {
    let baseRequirement = 0.7;

    // Higher confidence for business-critical decisions
    if (mode === "site_monkeys" || context.business_critical) {
      baseRequirement = 0.9;
    } else if (mode === "business_validation") {
      baseRequirement = 0.8;
    }

    // Adjust based on risk level
    if (this.isHighRiskDecision(query, context)) {
      baseRequirement = Math.min(0.95, baseRequirement + 0.1);
    }

    return {
      minimum_confidence: baseRequirement,
      evidence_requirement: baseRequirement > 0.8 ? "strong" : "moderate",
      uncertainty_tolerance: baseRequirement < 0.8 ? "moderate" : "low",
    };
  }

  establishValidationCriteria(query, context, mode) {
    const criteria = {
      truth_validation: true,
      business_alignment: this.isBusinessContext(query, context),
      user_benefit_validation: this.isRecommendationQuery(query),
      democratic_responsibility: this.isPoliticalContext(query),
      cost_consciousness: true,
      quality_assurance: true,
    };

    // Add mode-specific criteria
    if (mode === "site_monkeys") {
      criteria.founder_protection = true;
      criteria.brand_consistency = true;
      criteria.operational_integrity = true;
    }

    return criteria;
  }

  synthesizeWisdom(wisdom) {
    // Create synthesis for AI reasoning
    const synthesis = {
      core_guidance: this.extractCoreGuidance(wisdom),
      decision_approach: this.synthesizeDecisionApproach(wisdom),
      validation_requirements: this.synthesizeValidationRequirements(wisdom),
      confidence_assessment: this.synthesizeConfidenceRequirements(wisdom),
    };

    return synthesis;
  }

  extractCoreGuidance(wisdom) {
    const guidance = [];

    wisdom.applicable_principles.forEach((principle) => {
      guidance.push(`${principle.principle}: ${principle.application}`);
    });

    wisdom.business_intelligence.forEach((intelligence) => {
      guidance.push(`${intelligence.domain}: ${intelligence.wisdom}`);
    });

    return guidance;
  }

  synthesizeDecisionApproach(wisdom) {
    const approaches = wisdom.decision_frameworks.map((framework) => ({
      framework: framework.name,
      sequence: framework.sequence,
      priority: framework.priority,
    }));

    return {
      frameworks: approaches,
      integration:
        "Apply all frameworks with truth first, survival second, user benefit third",
    };
  }

  synthesizeValidationRequirements(wisdom) {
    return {
      required_validations: Object.entries(wisdom.validation_criteria)
        .filter(([, required]) => required)
        .map(([validation]) => validation),
      confidence_threshold: wisdom.confidence_requirements.minimum_confidence,
      evidence_standard: wisdom.confidence_requirements.evidence_requirement,
    };
  }

  synthesizeConfidenceRequirements(wisdom) {
    return {
      minimum_confidence: wisdom.confidence_requirements.minimum_confidence,
      confidence_factors: wisdom.business_intelligence.flatMap(
        (intel) => intel.confidence_factors,
      ),
      uncertainty_handling:
        wisdom.confidence_requirements.uncertainty_tolerance,
    };
  }

  // Helper methods for context detection
  isBusinessContext(query, context) {
    const businessIndicators = [
      /business|company|startup|revenue|profit|cash|customers|market|competition/i.test(
        query,
      ),
      context.business_context === true,
      context.mode === "business_validation" || context.mode === "site_monkeys",
    ];
    return businessIndicators.some(Boolean);
  }

  isStrategicDecision(query, context) {
    return (
      /strategy|strategic|long.term|future|plan|growth|expansion/i.test(
        query,
      ) || context.strategic_decision === true
    );
  }

  isRecommendationQuery(query) {
    return /recommend|suggest|should I|what would you|advice|best choice/i.test(
      query,
    );
  }

  isPoliticalContext(query) {
    return /vote|election|candidate|political|policy|government|democrat|republican/i.test(
      query,
    );
  }

  isHighRiskDecision(query, context) {
    const riskIndicators = [
      /fire|hire|invest|spend|shut down|close|legal/i.test(query),
      context.high_risk === true,
      context.financial_impact > 50000,
    ];
    return riskIndicators.some(Boolean);
  }

  // Get extracted wisdom summary
  getWisdomSummary() {
    return {
      principles_extracted: Array.from(this.extractedPrinciples.keys()),
      intelligence_domains: Array.from(this.businessIntelligence.keys()),
      wisdom_sources: Array.from(this.wisdomSources.keys()),
      initialization_status: this.initialized,
    };
  }
}

export { WisdomExtractor };
