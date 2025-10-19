// ================================================================
// MEMORY-INTELLIGENCE BRIDGE FOR EXISTING ARCHITECTURE
// Connects persistent memory output to existing intelligence engines
// ZERO changes to existing intelligence modules - pure integration layer
// ================================================================

export class MemoryIntelligenceBridge {
  constructor(
    enhancedIntelligence,
    aiReasoningEngine,
    intelligenceOrchestrator,
  ) {
    this.enhancedIntelligence = enhancedIntelligence;
    this.aiReasoningEngine = aiReasoningEngine;
    this.intelligenceOrchestrator = intelligenceOrchestrator;
    this.logger = {
      log: (msg) => console.log(`[MEMORY-INTELLIGENCE-BRIDGE] ${msg}`),
      error: (msg, err) =>
        console.error(`[MEMORY-INTELLIGENCE-BRIDGE ERROR] ${msg}`, err),
    };
  }

  // ================================================================
  // MAIN INTEGRATION POINT - Bridge memory to existing intelligence
  // ================================================================

  async enhanceWithMemoryContext(
    query,
    mode,
    persistentMemoryResult,
    vaultContext,
    personality,
  ) {
    try {
      this.logger.log(
        `Bridging memory context to existing intelligence engines for ${personality}`,
      );

      // Step 1: Transform persistent memory to intelligence-compatible format
      const intelligenceMemoryContext = this.transformMemoryForIntelligence(
        persistentMemoryResult,
      );

      // Step 2: Determine which intelligence engines to activate based on query
      const intelligenceActivation = this.determineIntelligenceActivation(
        query,
        mode,
        intelligenceMemoryContext,
      );

      // Step 3: Feed memory context to existing enhanced-intelligence.js
      let enhancedResponse = null;
      if (
        this.enhancedIntelligence &&
        intelligenceActivation.useEnhancedIntelligence
      ) {
        enhancedResponse = await this.activateEnhancedIntelligence(
          query,
          mode,
          intelligenceMemoryContext,
          vaultContext,
          intelligenceActivation,
        );
      }

      // Step 4: Feed memory context to existing ai-reasoning-engine.js
      let reasoningResponse = null;
      if (this.aiReasoningEngine && intelligenceActivation.useReasoningEngine) {
        reasoningResponse = await this.activateReasoningEngine(
          query,
          mode,
          intelligenceMemoryContext,
          vaultContext,
          intelligenceActivation,
        );
      }

      // Step 5: Feed memory context to existing intelligence-orchestrator.js
      let orchestratorResponse = null;
      if (
        this.intelligenceOrchestrator &&
        intelligenceActivation.useOrchestrator
      ) {
        orchestratorResponse = await this.activateIntelligenceOrchestrator(
          query,
          mode,
          intelligenceMemoryContext,
          vaultContext,
          intelligenceActivation,
        );
      }

      // Step 6: Synthesize responses from activated intelligence engines
      const synthesizedResponse = this.synthesizeIntelligenceResponses(
        enhancedResponse,
        reasoningResponse,
        orchestratorResponse,
        personality,
      );

      this.logger.log(
        `Intelligence engines activated: ${intelligenceActivation.enginesUsed.join(", ")}`,
      );

      return {
        intelligenceEnhanced: true,
        memoryIntegrated: persistentMemoryResult?.hasMemory || false,
        enginesActivated: intelligenceActivation.enginesUsed,
        response: synthesizedResponse.response,
        reasoning: synthesizedResponse.reasoning,
        confidence: synthesizedResponse.confidence,
        memoryTokensUsed: persistentMemoryResult?.tokenCount || 0,
      };
    } catch (error) {
      this.logger.error("Memory-intelligence bridge failed:", error);
      return this.createFallbackResponse(query, mode, personality);
    }
  }

  // ================================================================
  // MEMORY TRANSFORMATION - Convert memory format for intelligence engines
  // ================================================================

  transformMemoryForIntelligence(persistentMemoryResult) {
    if (!persistentMemoryResult || !persistentMemoryResult.hasMemory) {
      return {
        hasContext: false,
        memoryContent: "",
        contextType: "none",
        relevanceScore: 0,
        tokenCount: 0,
      };
    }

    // Extract memory content from persistent memory system
    const memoryContent =
      persistentMemoryResult.systemPrompt ||
      persistentMemoryResult.conversationContext ||
      "";

    // Transform to format expected by existing intelligence engines
    const transformedContext = {
      hasContext: true,
      memoryContent: this.cleanMemoryForIntelligence(memoryContent),
      contextType: this.determineContextType(memoryContent),
      relevanceScore: this.calculateMemoryRelevance(memoryContent),
      tokenCount: persistentMemoryResult.tokenCount || 0,

      // Additional context for existing intelligence engines
      businessContext: this.extractBusinessContext(memoryContent),
      strategicContext: this.extractStrategicContext(memoryContent),
      quantitativeContext: this.extractQuantitativeData(memoryContent),
      emotionalContext: this.extractEmotionalContext(memoryContent),

      // Format for enhanced-intelligence.js compatibility
      memoryForReasoning: this.formatForReasoningEngine(memoryContent),
      memoryForCrossDomain: this.formatForCrossDomainAnalysis(memoryContent),
      memoryForScenarios: this.formatForScenarioModeling(memoryContent),
    };

    return transformedContext;
  }

  cleanMemoryForIntelligence(memoryContent) {
    // CRITICAL: Clean minimally while preserving memory markers
    return (
      memoryContent
        .replace(/ONGOING CONVERSATION CONTEXT:/g, "MEMORY CONTEXT:")
        .replace(/Continue this natural conversation\./g, "")
        .replace(/Reference previous exchanges when relevant\./g, "")
        // PRESERVE: [MEMORY] tags and === boundaries for AI recognition
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  determineContextType(memoryContent) {
    if (/business|strategy|revenue|profit|competition/i.test(memoryContent))
      return "business";
    if (/health|wellness|stress|personal/i.test(memoryContent))
      return "personal";
    if (/technical|system|code|architecture/i.test(memoryContent))
      return "technical";
    if (/relationship|family|social|emotional/i.test(memoryContent))
      return "social";
    return "general";
  }

  calculateMemoryRelevance(memoryContent) {
    // Simple relevance scoring for existing intelligence engines
    let score = 0.5; // Base score

    if (memoryContent.length > 500) score += 0.1; // Substantial content
    if (/\d+/.test(memoryContent)) score += 0.1; // Contains numbers
    if (/decision|strategy|plan|goal/i.test(memoryContent)) score += 0.2; // Decision-relevant
    if (/risk|opportunity|challenge/i.test(memoryContent)) score += 0.1; // Strategic relevance

    return Math.min(score, 0.9);
  }

  // ================================================================
  // CONTEXT EXTRACTION - Prepare memory for specific intelligence modules
  // ================================================================

  extractBusinessContext(memoryContent) {
    const businessIndicators = [];

    if (/revenue|income|sales/i.test(memoryContent))
      businessIndicators.push("revenue_context");
    if (/cost|expense|budget/i.test(memoryContent))
      businessIndicators.push("cost_context");
    if (/competition|competitor|market/i.test(memoryContent))
      businessIndicators.push("competitive_context");
    if (/strategy|plan|goal/i.test(memoryContent))
      businessIndicators.push("strategic_context");
    if (/risk|threat|opportunity/i.test(memoryContent))
      businessIndicators.push("risk_context");

    return {
      indicators: businessIndicators,
      hasBusinessContext: businessIndicators.length > 0,
      contextStrength: businessIndicators.length * 0.2,
    };
  }

  extractStrategicContext(memoryContent) {
    const strategicElements = [];

    if (/decision|choice|option/i.test(memoryContent))
      strategicElements.push("decision_point");
    if (/timeline|deadline|schedule/i.test(memoryContent))
      strategicElements.push("timing_constraint");
    if (/resource|budget|capacity/i.test(memoryContent))
      strategicElements.push("resource_constraint");
    if (/goal|objective|target/i.test(memoryContent))
      strategicElements.push("objective_context");

    return {
      elements: strategicElements,
      hasStrategicContext: strategicElements.length > 0,
      strategicComplexity: strategicElements.length,
    };
  }

  extractQuantitativeData(memoryContent) {
    const numbers =
      memoryContent.match(/\$?[\d,]+(?:\.\d+)?(?:%|\s*percent)?/g) || [];
    const financialData = memoryContent.match(/\$[\d,]+(?:\.\d+)?/g) || [];
    const percentages = memoryContent.match(/\d+(?:\.\d+)?%/g) || [];

    return {
      hasQuantitativeData: numbers.length > 0,
      numberCount: numbers.length,
      financialDataPoints: financialData.length,
      percentageData: percentages.length,
      numbers: numbers,
      quantitativeComplexity:
        numbers.length > 3 ? "high" : numbers.length > 1 ? "medium" : "low",
    };
  }

  extractEmotionalContext(memoryContent) {
    const emotionalIndicators = [];

    if (/stress|worried|anxious|pressure/i.test(memoryContent))
      emotionalIndicators.push("stress");
    if (/excited|enthusiastic|optimistic/i.test(memoryContent))
      emotionalIndicators.push("positive");
    if (/frustrated|angry|disappointed/i.test(memoryContent))
      emotionalIndicators.push("negative");
    if (/uncertain|confused|unclear/i.test(memoryContent))
      emotionalIndicators.push("uncertainty");
    if (/confident|sure|determined/i.test(memoryContent))
      emotionalIndicators.push("confidence");

    return {
      indicators: emotionalIndicators,
      hasEmotionalContext: emotionalIndicators.length > 0,
      emotionalComplexity: emotionalIndicators.length,
      primaryEmotion: emotionalIndicators[0] || "neutral",
    };
  }

  // ================================================================
  // FORMAT FOR EXISTING INTELLIGENCE ENGINES
  // ================================================================

  formatForReasoningEngine(memoryContent) {
    // Format memory for existing ai-reasoning-engine.js
    return {
      businessWisdom: {
        applicable_principles: this.extractBusinessPrinciples(memoryContent),
        business_intelligence: this.extractBusinessIntelligence(memoryContent),
        decision_frameworks: this.extractDecisionFrameworks(memoryContent),
      },
      context: {
        business_critical: /business|strategy|revenue|survival/i.test(
          memoryContent,
        ),
        multiple_stakeholders: /team|customer|client|partner/i.test(
          memoryContent,
        ),
        competitive_pressure: /competition|competitor|market/i.test(
          memoryContent,
        ),
        time_pressure: /deadline|urgent|timeline|asap/i.test(memoryContent),
      },
      memoryContext: memoryContent,
    };
  }

  formatForCrossDomainAnalysis(memoryContent) {
    // Format memory for cross-domain synthesis in enhanced-intelligence.js
    return {
      domains: this.identifyDomains(memoryContent),
      connections: this.identifyDomainConnections(memoryContent),
      memoryContent: memoryContent,
      crossDomainComplexity: this.assessCrossDomainComplexity(memoryContent),
    };
  }

  formatForScenarioModeling(memoryContent) {
    // Format memory for scenario analysis in enhanced-intelligence.js
    return {
      currentSituation: this.extractCurrentSituation(memoryContent),
      constraints: this.extractConstraints(memoryContent),
      opportunities: this.extractOpportunities(memoryContent),
      risks: this.extractRisks(memoryContent),
      memoryContent: memoryContent,
    };
  }

  // ================================================================
  // INTELLIGENCE ACTIVATION LOGIC
  // ================================================================

  determineIntelligenceActivation(query, mode, memoryContext) {
    const activation = {
      useEnhancedIntelligence: false,
      useReasoningEngine: false,
      useOrchestrator: false,
      enginesUsed: [],
    };

    // Always use enhanced intelligence for complex queries
    if (this.isComplexQuery(query, memoryContext)) {
      activation.useEnhancedIntelligence = true;
      activation.enginesUsed.push("enhanced-intelligence");
    }

    // Use reasoning engine for business and strategic queries
    if (
      mode === "business_validation" ||
      mode === "site_monkeys" ||
      this.isStrategicQuery(query, memoryContext)
    ) {
      activation.useReasoningEngine = true;
      activation.enginesUsed.push("ai-reasoning-engine");
    }

    // Use orchestrator for multi-modal or extremely complex scenarios
    if (this.requiresOrchestration(query, memoryContext)) {
      activation.useOrchestrator = true;
      activation.enginesUsed.push("intelligence-orchestrator");
    }

    // Default to enhanced intelligence if no specific engines triggered
    if (activation.enginesUsed.length === 0) {
      activation.useEnhancedIntelligence = true;
      activation.enginesUsed.push("enhanced-intelligence");
    }

    return activation;
  }

  isComplexQuery(query, memoryContext) {
    return (
      query.length > 100 ||
      /analyze|evaluate|compare|strategy|decision/i.test(query) ||
      (memoryContext.hasContext && memoryContext.relevanceScore > 0.7)
    );
  }

  isStrategicQuery(query, memoryContext) {
    return (
      /business|strategy|revenue|profit|competition|market|growth|risk/i.test(
        query,
      ) ||
      memoryContext.businessContext?.hasBusinessContext ||
      memoryContext.strategicContext?.hasStrategicContext
    );
  }

  requiresOrchestration(query, memoryContext) {
    return (
      /complex|sophisticated|comprehensive|multi|across/i.test(query) ||
      memoryContext.contextType === "technical" ||
      memoryContext.quantitativeContext?.quantitativeComplexity === "high"
    );
  }

  // ================================================================
  // EXISTING INTELLIGENCE ENGINE ACTIVATION
  // ================================================================

  async activateEnhancedIntelligence(
    query,
    mode,
    memoryContext,
    vaultContext,
    activation,
  ) {
    try {
      // Call existing enhanced-intelligence.js with properly formatted memory
      const baseResponse = "Processing with enhanced intelligence...";

      const enhancement = await this.enhancedIntelligence.enhanceResponse(
        baseResponse,
        query,
        mode,
        memoryContext.memoryForReasoning.memoryContext, // Pass formatted memory
        vaultContext,
        0.8,
      );

      return {
        engine: "enhanced-intelligence",
        response: enhancement.enhancedResponse,
        reasoning: enhancement.reasoningChain,
        confidence: enhancement.finalConfidence,
        intelligenceApplied: enhancement.intelligenceApplied,
      };
    } catch (error) {
      this.logger.error("Enhanced intelligence activation failed:", error);
      return null;
    }
  }

  async activateReasoningEngine(
    query,
    mode,
    memoryContext,
    vaultContext,
    activation,
  ) {
    try {
      // Call existing ai-reasoning-engine.js with properly formatted context
      const reasoningContext = {
        user_query: query,
        ...memoryContext.memoryForReasoning,
      };

      const reasoning =
        await this.aiReasoningEngine.processQuery(reasoningContext);

      return {
        engine: "ai-reasoning-engine",
        response: reasoning.primary_insight,
        reasoning: reasoning.reasoning_chain,
        confidence: reasoning.confidence,
        strategicInsights: reasoning.strategic_insights,
      };
    } catch (error) {
      this.logger.error("AI reasoning engine activation failed:", error);
      return null;
    }
  }

  async activateIntelligenceOrchestrator(
    query,
    mode,
    memoryContext,
    vaultContext,
    activation,
  ) {
    try {
      // Call existing intelligence-orchestrator.js with memory context
      const context = {
        query: query,
        mode: mode,
        memoryContext: memoryContext.memoryContent,
        vaultContext: vaultContext,
      };

      const orchestration =
        await this.intelligenceOrchestrator.processWithExtraordinaryIntelligence(
          context,
          query,
          mode,
          [],
        );

      return {
        engine: "intelligence-orchestrator",
        response: orchestration.response,
        reasoning: orchestration.reasoning,
        confidence: orchestration.confidence,
        extraordinaryIntelligence: true,
      };
    } catch (error) {
      this.logger.error("Intelligence orchestrator activation failed:", error);
      return null;
    }
  }

  // ================================================================
  // RESPONSE SYNTHESIS
  // ================================================================

  synthesizeIntelligenceResponses(
    enhancedResponse,
    reasoningResponse,
    orchestratorResponse,
    personality,
  ) {
    const responses = [
      enhancedResponse,
      reasoningResponse,
      orchestratorResponse,
    ].filter((r) => r !== null);

    if (responses.length === 0) {
      return this.createFallbackResponse();
    }

    // Use the highest confidence response as primary
    const primaryResponse = responses.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );

    // Combine reasoning from all engines
    const combinedReasoning = responses
      .map((r) => r.reasoning)
      .filter((r) => r !== null)
      .flat();

    return {
      response: primaryResponse.response,
      reasoning: combinedReasoning,
      confidence: primaryResponse.confidence,
      enginesUsed: responses.map((r) => r.engine),
      memoryEnhanced: true,
    };
  }

  createFallbackResponse(query, mode, personality) {
    return {
      intelligenceEnhanced: false,
      memoryIntegrated: false,
      enginesActivated: ["fallback"],
      response: "I'll provide my best analysis based on the available context.",
      reasoning: [],
      confidence: 0.5,
      memoryTokensUsed: 0,
    };
  }

  // ================================================================
  // HELPER METHODS FOR MEMORY ANALYSIS
  // ================================================================

  extractBusinessPrinciples(content) {
    const principles = [];

    if (/survival|sustainability/i.test(content)) {
      principles.push({
        principle: "Business Survival",
        application: "Prioritize decisions that ensure business continuity",
      });
    }

    if (/profit|profitability/i.test(content)) {
      principles.push({
        principle: "Profitability Focus",
        application: "Evaluate decisions based on profit impact",
      });
    }

    if (/customer|client/i.test(content)) {
      principles.push({
        principle: "Customer Value",
        application: "Consider customer impact in strategic decisions",
      });
    }

    return principles;
  }

  extractBusinessIntelligence(content) {
    const intelligence = [];

    if (/market|competition/i.test(content)) {
      intelligence.push({
        domain: "market_analysis",
        wisdom: "Market dynamics and competitive positioning insights",
        application_pattern: "competitive_analysis",
      });
    }

    if (/financial|revenue|cost/i.test(content)) {
      intelligence.push({
        domain: "financial_analysis",
        wisdom: "Financial modeling and cash flow insights",
        application_pattern: "financial_modeling",
      });
    }

    return intelligence;
  }

  extractDecisionFrameworks(content) {
    const frameworks = [];

    if (/decision|choice|option/i.test(content)) {
      frameworks.push({
        name: "Strategic Decision Framework",
        sequence: [
          "Assess Situation",
          "Identify Options",
          "Evaluate Risks",
          "Execute Decision",
        ],
      });
    }

    return frameworks;
  }

  identifyDomains(content) {
    const domains = [];

    if (/business|strategy|revenue/i.test(content)) domains.push("business");
    if (/health|wellness|stress/i.test(content)) domains.push("health");
    if (/technology|system|technical/i.test(content))
      domains.push("technology");
    if (/relationship|family|social/i.test(content)) domains.push("social");
    if (/finance|money|budget/i.test(content)) domains.push("finance");

    return domains;
  }

  identifyDomainConnections(content) {
    const connections = [];

    if (/stress.*work|work.*stress/i.test(content)) {
      connections.push({ from: "health", to: "business", type: "impact" });
    }

    if (/budget.*family|family.*budget/i.test(content)) {
      connections.push({ from: "finance", to: "social", type: "constraint" });
    }

    return connections;
  }

  assessCrossDomainComplexity(content) {
    const domains = this.identifyDomains(content);
    return domains.length > 2 ? "high" : domains.length > 1 ? "medium" : "low";
  }

  extractCurrentSituation(content) {
    // Extract current state from memory content
    const situationKeywords =
      content.match(/currently|now|present|today|situation/gi) || [];
    return situationKeywords.length > 0
      ? "dynamic_situation"
      : "stable_situation";
  }

  extractConstraints(content) {
    const constraints = [];
    if (/budget|cost|money/i.test(content)) constraints.push("financial");
    if (/time|deadline|schedule/i.test(content)) constraints.push("temporal");
    if (/resource|capacity|bandwidth/i.test(content))
      constraints.push("resource");
    return constraints;
  }

  extractOpportunities(content) {
    const opportunities = [];
    if (/opportunity|chance|potential/i.test(content))
      opportunities.push("growth");
    if (/market|customer|client/i.test(content)) opportunities.push("market");
    if (/innovation|new|novel/i.test(content)) opportunities.push("innovation");
    return opportunities;
  }

  extractRisks(content) {
    const risks = [];
    if (/risk|threat|danger/i.test(content)) risks.push("strategic");
    if (/competition|competitor/i.test(content)) risks.push("competitive");
    if (/financial|budget|cost/i.test(content)) risks.push("financial");
    return risks;
  }
}
