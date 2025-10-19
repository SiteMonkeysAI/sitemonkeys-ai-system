// ================================================================
// MEMORY-INTELLIGENCE INTEGRATION FIX
// Simultaneous repair of persistent memory and intelligence systems
// WITHOUT breaking existing functionality
// ================================================================

// FILE 1: api/lib/memory-intelligence-bridge.js
// NEW FILE - Bridge between memory and intelligence systems

export class MemoryIntelligenceBridge {
  constructor() {
    this.initialized = false;
    this.logger = {
      log: (msg) =>
        console.log(
          `[MEMORY-INTELLIGENCE-BRIDGE] ${new Date().toISOString()} ${msg}`,
        ),
      error: (msg, err) =>
        console.error(
          `[MEMORY-INTELLIGENCE-BRIDGE ERROR] ${new Date().toISOString()} ${msg}`,
          err,
        ),
      warn: (msg) =>
        console.warn(
          `[MEMORY-INTELLIGENCE-BRIDGE WARN] ${new Date().toISOString()} ${msg}`,
        ),
    };
  }

  // ================================================================
  // CRITICAL FIX 1: MEMORY FORMATTING FOR PERSONALITY CONSUMPTION
  // ================================================================

  formatMemoryForPersonalities(memoryContext, personality) {
    try {
      if (!memoryContext || !memoryContext.contextFound) {
        return {
          hasMemory: false,
          formattedMemory: "",
          personalityPrompt: this.getNoMemoryPrompt(personality),
        };
      }

      // FIXED: Single, consistent memory format for all personalities
      const memories = memoryContext.memories || "";
      const cleanedMemories = memories.trim();

      // FIXED: Direct personality prompt injection (no competing formats)
      const personalityPrompt = `IMPORTANT: You have access to previous conversation context. Reference this naturally when relevant.

PREVIOUS CONVERSATIONS:
${cleanedMemories}

Use this context to provide continuity. Reference prior discussions with phrases like "Earlier you mentioned..." or "Based on what we discussed before...".

`;

      return {
        hasMemory: true,
        formattedMemory: cleanedMemories,
        memoryCount: memoryContext.memoryCount || 0,
        personalityPrompt: personalityPrompt,
      };
    } catch (error) {
      this.logger.error("Memory formatting error:", error);
      return {
        hasMemory: false,
        formattedMemory: "",
        personalityPrompt: this.getErrorPrompt(personality),
      };
    }
  }

  formatIntelligentMemory(memoryContext, _personality) {
    let formatted = `=== CONTEXT FROM YOUR MEMORY ===\n`;

    // Add standard memories
    if (memoryContext.memories) {
      formatted += `${memoryContext.memories}\n\n`;
    }

    // Add reasoning support if available
    if (
      memoryContext.reasoningSupport &&
      memoryContext.reasoningSupport.length > 0
    ) {
      formatted += `=== REASONING CONTEXT ===\n`;
      memoryContext.reasoningSupport.forEach((item) => {
        formatted += `• ${item.content} (${item.reasoning_type})\n`;
      });
      formatted += `\n`;
    }

    // Add cross-domain connections
    if (
      memoryContext.crossDomainConnections &&
      memoryContext.crossDomainConnections.length > 0
    ) {
      formatted += `=== RELATED INSIGHTS ===\n`;
      memoryContext.crossDomainConnections.forEach((item) => {
        formatted += `• ${item.content} (domains: ${item.shared_domains.join(", ")})\n`;
      });
      formatted += `\n`;
    }

    return formatted;
  }

  formatStandardMemory(memories, _personality) {
    if (!memories || memories.trim() === "") return "";

    return `=== CONTEXT FROM YOUR MEMORY ===\n${memories}\n\n`;
  }

  // ================================================================
  // CRITICAL FIX 2: PERSONALITY-SPECIFIC MEMORY PROMPTS
  // ================================================================

  getMemoryPrompt(personality, formattedMemory) {
    const basePrompt = `IMPORTANT: You have access to previous conversation context. Use this context to provide continuity and reference prior discussions when relevant.

MEMORY CONTEXT:
${formattedMemory}

`;

    switch (personality) {
      case "roxy":
        return (
          basePrompt +
          `As Roxy, acknowledge when you're referencing previous conversations with phrases like "Earlier you mentioned..." or "Based on what you told me before...". Show that you remember and care about ongoing concerns.`
        );

      case "eli":
        return (
          basePrompt +
          `As Eli, reference previous context for strategic continuity. Use phrases like "Given our previous discussion about..." or "Building on the context you provided earlier...". Maintain analytical thread across conversations.`
        );

      default:
        return (
          basePrompt +
          `Reference previous context when relevant to maintain conversation continuity.`
        );
    }
  }

  getNoMemoryPrompt(personality) {
    switch (personality) {
      case "roxy":
        return `You don't have access to previous conversation context in this interaction. If the user references something they told you before, acknowledge this limitation and ask them to remind you of the key details.`;

      case "eli":
        return `No previous conversation context is available. If strategic continuity is needed, request the user to provide relevant background information.`;

      default:
        return `No previous conversation context available for this interaction.`;
    }
  }

  getErrorPrompt(_personality) {
    return `Memory system encountered an error. Proceeding without previous context. If continuity is important, please provide relevant background.`;
  }

  // ================================================================
  // CRITICAL FIX 3: INTELLIGENCE CONTEXT INTEGRATION
  // ================================================================

  buildIntelligenceContext(message, mode, expertDomain) {
    return {
      requiresReasoning: this.detectReasoningNeeds(message),
      crossDomainAnalysis: this.detectCrossDomainNeeds(message, mode),
      scenarioAnalysis: this.detectScenarioNeeds(message, mode),
      quantitativeAnalysis: this.detectQuantitativeNeeds(message),
      expertDomain: expertDomain,
      mode: mode,
    };
  }

  detectReasoningNeeds(message) {
    const reasoningIndicators = [
      "why",
      "how",
      "because",
      "explain",
      "reason",
      "cause",
      "logic",
      "analysis",
      "evaluate",
      "assess",
      "compare",
      "pros and cons",
    ];
    return reasoningIndicators.some((indicator) =>
      message.toLowerCase().includes(indicator),
    );
  }

  detectCrossDomainNeeds(message, mode) {
    const crossDomainIndicators = [
      "impact",
      "affect",
      "influence",
      "relate",
      "connection",
      "implication",
    ];
    return (
      mode === "business_validation" ||
      mode === "site_monkeys" ||
      crossDomainIndicators.some((indicator) =>
        message.toLowerCase().includes(indicator),
      )
    );
  }

  detectScenarioNeeds(message, mode) {
    const scenarioIndicators = [
      "what if",
      "scenario",
      "outcome",
      "result",
      "consequence",
      "plan",
    ];
    return (
      mode === "business_validation" ||
      mode === "site_monkeys" ||
      scenarioIndicators.some((indicator) =>
        message.toLowerCase().includes(indicator),
      )
    );
  }

  detectQuantitativeNeeds(message) {
    return (
      /\d/.test(message) ||
      /cost|price|revenue|profit|budget|roi/i.test(message)
    );
  }

  // ================================================================
  // CRITICAL FIX 4: SYSTEM INTEGRATION METHODS
  // ================================================================

  async integrateMemoryAndIntelligence(
    message,
    userId,
    personality,
    mode,
    expertDomain,
  ) {
    try {
      this.logger.log(
        `Integrating memory and intelligence for ${personality} in ${mode} mode`,
      );

      // Step 1: Build intelligence context
      const intelligenceContext = this.buildIntelligenceContext(
        message,
        mode,
        expertDomain,
      );

      // Step 2: Get memory with intelligence enhancement
      let memoryContext = null;

      if (global.memorySystem) {
        if (global.memorySystem.extractIntelligentMemory) {
          this.logger.log("Using intelligent memory extraction");
          memoryContext = await global.memorySystem.extractIntelligentMemory(
            message,
            userId,
            intelligenceContext,
          );
        } else if (global.memorySystem.retrieveMemory) {
          this.logger.log("Using standard memory retrieval");
          memoryContext = await global.memorySystem.retrieveMemory(
            userId,
            message,
          );
        }
      }

      // Step 3: Format for personality consumption
      const formattedMemory = this.formatMemoryForPersonalities(
        memoryContext,
        personality,
      );

      // Step 4: Return integrated context
      return {
        memoryContext: formattedMemory,
        intelligenceContext: intelligenceContext,
        systemReady: true,
        integrationSuccess: true,
      };
    } catch (error) {
      this.logger.error("Memory-Intelligence integration failed:", error);
      return {
        memoryContext: {
          hasMemory: false,
          formattedMemory: "",
          personalityPrompt: this.getErrorPrompt(personality),
        },
        intelligenceContext: null,
        systemReady: false,
        integrationSuccess: false,
        error: error.message,
      };
    }
  }

  // ================================================================
  // DIAGNOSTIC AND HEALTH CHECK METHODS
  // ================================================================

  performHealthCheck() {
    const health = {
      bridge_initialized: this.initialized,
      memory_system_available: !!global.memorySystem,
      memory_system_ready: global.memorySystem?.isReady() || false,
      intelligent_memory_available:
        !!global.memorySystem?.extractIntelligentMemory,
      standard_memory_available: !!global.memorySystem?.retrieveMemory,
      timestamp: new Date().toISOString(),
    };

    this.logger.log("Health check results:", JSON.stringify(health, null, 2));
    return health;
  }

  initialize() {
    this.logger.log("Initializing Memory-Intelligence Bridge...");
    this.initialized = true;
    return this.performHealthCheck();
  }
}

// Export singleton instance
export const memoryIntelligenceBridge = new MemoryIntelligenceBridge();
