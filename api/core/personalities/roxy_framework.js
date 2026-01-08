// /api/core/personalities/roxy_framework.js
// ROXY FRAMEWORK - Empathetic & Opportunity-Focused Reasoning
// Identifies opportunities, finds simplifications, provides practical steps, optimizes resources

const MIN_CONFIDENCE_FOR_SIMPLIFICATION = 0.6;

/**
 * Helper: Check if query is a simple factual question that doesn't need confidence assessments
 * @param {string} query - The user's query
 * @returns {boolean}
 */
function isSimpleFactualQuery(query) {
  const simplePatterns = [
    /^what (is|are) \d+\s*([\+\-\*×÷\/x]|times|plus|minus|divided by|multiplied by)\s*\d+/i,  // Math with operators
    /^\d+\s*(times|plus|minus|divided by|multiplied by|[\+\-\*×÷\/x])\s*\d+/i,  // Standalone math
    /^how many \w+ (in|per|are in)/i,              // Unit conversion
    /^what is the (capital|formula|chemical)/i,    // Simple facts
    /^what does ['"]?\w+['"]? mean/i,              // Definitions
    /^define /i,                                    // Definitions
  ];
  return simplePatterns.some(p => p.test(query.trim()));
}

/**
 * Helper: Extract meaningful keywords from text (Issue #380 Fix 4)
 * @param {string} text - Text to extract keywords from
 * @returns {array} Array of keywords
 */
function extractKeywords(text) {
  // Common words to filter out
  const commonWords = ['this', 'that', 'with', 'from', 'have', 'will', 'been', 'were', 'they', 'their',
                       'what', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'into',
                       'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
                       'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'while'];

  // Extract meaningful words (nouns, technical terms)
  const words = text.toLowerCase()
    .match(/\b[a-z]{4,}\b/g) || [];

  return words
    .filter(w => !commonWords.includes(w))
    .slice(0, 50);
}

/**
 * Helper: Check if enhancements should be applied (Issue #380 Fix 4)
 * Skip enhancements if response doesn't address user's query
 * @param {string} userQuery - The user's query
 * @param {string} baseResponse - The base AI response
 * @param {object} context - Context including truthType
 * @returns {object} { apply: boolean, reason: string }
 */
function shouldApplyEnhancements(userQuery, baseResponse, context) {
  // Skip enhancements for document reviews - they should get direct analysis
  if (context?.phase4Metadata?.truth_type === 'DOCUMENT_REVIEW') {
    return {
      apply: false,
      reason: 'Document reviews should not receive generic enhancement templates'
    };
  }

  // Check relevance overlap between query and response
  const queryKeywords = extractKeywords(userQuery.slice(0, 2000));
  const responseKeywords = extractKeywords(baseResponse);

  if (queryKeywords.length === 0) {
    return { apply: true }; // Can't assess, allow enhancements
  }

  // Calculate relevance overlap
  const overlap = queryKeywords.filter(k => responseKeywords.includes(k)).length;
  const relevanceScore = overlap / Math.max(queryKeywords.length, 1);

  if (relevanceScore < 0.2) {
    console.log(`[ROXY] Skipping enhancements - low relevance: ${relevanceScore.toFixed(2)}`);
    return {
      apply: false,
      reason: 'Base response does not appear relevant to user query'
    };
  }

  return { apply: true };
}

export class RoxyFramework {
  constructor() {
    this.personality = "roxy";
    this.cognitiveStyle = "empathetic";

    this.logger = {
      log: (msg) => console.log(`[ROXY] ${msg}`),
      error: (msg, err) => console.error(`[ROXY ERROR] ${msg}`, err),
    };
  }

  // ==================== MAIN METHOD ====================

  async analyzeAndEnhance(response, analysis, mode, context) {
    try {
      const confidence =
        analysis?.intentConfidence || analysis?.domainConfidence || 0.5;
      let enhancedResponse = response;

      // Check truth type from Phase 4 metadata
      const truthType = context?.phase4Metadata?.truth_type;
      const query = context?.message || '';
      const externalLookupSucceeded = (context?.phase4Metadata?.sources_used > 0) || (context?.phase4Metadata?.sources_succeeded > 0);

      // ISSUE #430: Check query classification for simple queries (GENUINE semantic intelligence)
      if (context?.queryClassification?.responseApproach?.type === 'direct') {
        this.logger.log(`[ISSUE #430 FIX] Skipping all enhancements: Simple query detected via semantic classification (${context.queryClassification.classification})`);
        this.logger.log(`[ISSUE #430 FIX] Reason: ${context.queryClassification.responseApproach.reason}`);
        return {
          enhancedResponse: response,
          personality: "roxy",
          modificationsCount: 0,
          reasoningApplied: false,
          skipped: true,
          skipReason: context.queryClassification.responseApproach.reason,
          classification: context.queryClassification.classification
        };
      }

      // Issue #380 Fix 4: Check if enhancements should be applied
      const relevanceCheck = shouldApplyEnhancements(query, response, context);
      if (!relevanceCheck.apply) {
        this.logger.log(`Skipping all enhancements: ${relevanceCheck.reason}`);
        return {
          enhancedResponse: response,
          personality: "roxy",
          analysisApplied: {},
          modificationsCount: 0,
          reasoningApplied: false,
          skipped: true,
          skipReason: relevanceCheck.reason
        };
      }

      // ========== TRUTH-FIRST FALLBACK (NEW) ==========
      // PERMANENT facts NEVER get disclaimers - they are established truth
      // External lookups that succeeded NEVER get disclaimers - data is verified
      if (confidence < MIN_CONFIDENCE_FOR_SIMPLIFICATION && truthType !== 'PERMANENT' && !externalLookupSucceeded) {
        this.logger.log(
          `Roxy: Confidence too low (${confidence.toFixed(2)}), prioritizing truth over empathy`,
        );

        enhancedResponse =
          response +
          "\n\nI want to be honest with you—I'm not as confident about this answer as I'd like to be. Please double-check this information independently and consider getting additional perspectives.";

        return {
          enhancedResponse: enhancedResponse,
          personality: "roxy",
          analysisApplied: {},
          modificationsCount: 1,
          reasoningApplied: true,
          truthPrioritized: true,
          reason: "Prioritized truth over empathy due to low confidence",
        };
      } else if ((confidence < MIN_CONFIDENCE_FOR_SIMPLIFICATION && truthType === 'PERMANENT') || externalLookupSucceeded) {
        this.logger.log(
          `Roxy: Low confidence (${confidence.toFixed(2)}) but ${truthType === 'PERMANENT' ? 'PERMANENT truth type' : 'external lookup succeeded'} - no disclaimer needed`,
        );
        // Skip adding disclaimer for PERMANENT facts or successful external lookups
      }
      this.logger.log("Applying Roxy empathetic framework...");

      const analysisApplied = {
        emotionalContext: null,
        opportunitiesIdentified: [],
        simplificationsFound: [],
        motivationsUnderstood: [],
        practicalSteps: [],
        resourceOptimizations: [],
      };
      let modificationsCount = 0;

      // STEP 1: Assess emotional context and needs
      const emotional = this.#assessEmotionalContext(response, analysis);
      analysisApplied.emotionalContext = emotional;

      if (emotional.needsSupport) {
        enhancedResponse = this.#enhanceWithEmotionalSupport(
          enhancedResponse,
          emotional,
        );
        modificationsCount++;
        this.logger.log("Added emotional support");
      }

      // Gate coaching blocks for PERMANENT low-stakes facts
      const isHighStakes = context?.phase4Metadata?.high_stakes?.isHighStakes || false;
      const shouldAddCoachingBlocks = truthType !== 'PERMANENT' || isHighStakes;

      // STEP 2: Identify opportunities (what's possible)
      if (shouldAddCoachingBlocks) {
        const opportunities = this.#identifyOpportunities(
          response,
          analysis,
          context,
        );
        if (opportunities.length > 0) {
          analysisApplied.opportunitiesIdentified = opportunities;
          enhancedResponse = this.#enhanceWithOpportunities(
            enhancedResponse,
            opportunities,
          );
          modificationsCount++;
          this.logger.log(`Identified ${opportunities.length} opportunities`);
        }
      } else {
        this.logger.log('Skipping coaching blocks for PERMANENT low-stakes fact');
      }

      // STEP 3: Find simplifications (easier paths)
      if (shouldAddCoachingBlocks) {
        const simplifications = this.#findSimplifications(response, analysis);
        if (simplifications.length > 0) {
          analysisApplied.simplificationsFound = simplifications;
          enhancedResponse = this.#enhanceWithSimplifications(
            enhancedResponse,
            simplifications,
          );
          modificationsCount++;
          this.logger.log(`Found ${simplifications.length} simpler approaches`);
        }
      }

      // STEP 4: Extract underlying motivations
      const motivations = this.#extractMotivations(analysis, context);
      if (motivations.length > 0) {
        analysisApplied.motivationsUnderstood = motivations;
        this.logger.log("Understood underlying motivations");
      }

      // STEP 5: Make it actionable with practical steps
      if (shouldAddCoachingBlocks && (analysis.intent === "problem_solving" || analysis.complexity > 0.6)) {
        const practical = this.#enhanceWithPracticalSteps(
          enhancedResponse,
          analysis,
        );
        if (practical.added) {
          analysisApplied.practicalSteps = practical.steps;
          enhancedResponse = practical.enhanced;
          modificationsCount++;
          this.logger.log("Added practical next steps");
        }
      }

      // STEP 6: Resource optimization (do more with less)
      if (shouldAddCoachingBlocks) {
        const optimizations = this.#enhanceWithResourceOptimization(
          enhancedResponse,
          analysis,
        );
        if (optimizations.added) {
          analysisApplied.resourceOptimizations = optimizations.optimizations;
          enhancedResponse = optimizations.enhanced;
          modificationsCount++;
          this.logger.log("Added resource optimizations");
        }
      }

      // STEP 7: Validate empowerment (never controlling)
      const empowermentCheck = this.#ensureEmpowerment(enhancedResponse);
      if (!empowermentCheck.empowering) {
        enhancedResponse = empowermentCheck.corrected;
        modificationsCount++;
        this.logger.log("Corrected to ensure empowerment");
      }

      // STEP 8: Apply Roxy's empathetic signature
      enhancedResponse = this.#applyRoxySignature(
        enhancedResponse,
        modificationsCount,
      );

      this.logger.log(
        `Roxy analysis complete: ${modificationsCount} enhancements applied`,
      );

      const mvpSuggestions = [
        "start simple",
        "mvp",
        "minimum viable",
        "bare bones",
        "just get started",
        "simplest version",
      ];

      const hasMVPSuggestion = mvpSuggestions.some((phrase) =>
        enhancedResponse.toLowerCase().includes(phrase),
      );

      if (hasMVPSuggestion && mode === "site_monkeys") {
        const vaultMinimum = context.vaultContext?.minimumServicePrice || 697;

        if (vaultMinimum >= 697) {
          enhancedResponse += `\n\n**(Important clarification):** When I say "start simple," I mean focus on core value delivery—not reducing your price. Your ${vaultMinimum >= 697 ? `$${vaultMinimum} minimum` : "premium pricing"} reflects your expertise and ensures you can deliver quality sustainably.`;
        }
      }

      return {
        enhancedResponse: enhancedResponse,
        personality: "roxy",
        analysisApplied: analysisApplied,
        modificationsCount: modificationsCount,
        reasoningApplied: true,
      };
    } catch (error) {
      this.logger.error("Roxy framework failed", error);

      return {
        enhancedResponse: `🍌 **Roxy:** ${response}`,
        personality: "roxy",
        analysisApplied: {},
        modificationsCount: 0,
        reasoningApplied: false,
        error: error.message,
      };
    }
  }

  // ==================== ANALYSIS METHODS ====================

  #assessEmotionalContext(response, analysis) {
    try {
      const emotional = {
        tone: analysis.emotionalTone,
        weight: analysis.emotionalWeight,
        needsSupport: false,
        needsEncouragement: false,
        needsReassurance: false,
        approachRecommended: "direct",
      };

      if (
        analysis.emotionalTone === "anxious" ||
        analysis.emotionalWeight > 0.7
      ) {
        emotional.needsSupport = true;
        emotional.needsReassurance = true;
        emotional.approachRecommended = "gentle";
      }

      if (analysis.emotionalTone === "negative" && analysis.complexity > 0.6) {
        emotional.needsSupport = true;
        emotional.needsEncouragement = true;
        emotional.approachRecommended = "supportive";
      }

      if (analysis.intent === "problem_solving" && analysis.complexity > 0.7) {
        emotional.needsEncouragement = true;
        emotional.approachRecommended = "solution-focused";
      }

      return emotional;
    } catch (error) {
      this.logger.error("Emotional context assessment failed", error);
      return {
        tone: "neutral",
        weight: 0,
        needsSupport: false,
        needsEncouragement: false,
        needsReassurance: false,
        approachRecommended: "direct",
      };
    }
  }

  #identifyOpportunities(response, analysis, context) {
    const opportunities = [];

    try {
      const responseLower = response.toLowerCase();

      if (
        context.sources?.hasMemory &&
        !responseLower.includes("previous") &&
        !responseLower.includes("before")
      ) {
        opportunities.push({
          type: "leverage_history",
          opportunity: "Build on what you already know",
          description: "You have relevant experience from past situations",
          action: "Apply lessons learned to this new challenge",
        });
      }

      if (
        analysis.complexity > 0.7 &&
        !responseLower.includes("minimum") &&
        !responseLower.includes("small")
      ) {
        opportunities.push({
          type: "mvp_approach",
          opportunity: "Test the concept before full commitment",
          description: "Start with smallest version that proves the idea",
          action: 'Define what "version 0.1" looks like',
        });
      }

      // CRITICAL FIX (Issue #385, Bug 1.2): Only add creative opportunities if
      // the query is actually asking for creative help, not for simple factual answers
      if ((analysis.domain === "creative" || analysis.requiresCreativity) &&
          analysis.complexity > 0.5 &&
          analysis.intent !== "factual_question") {
        opportunities.push({
          type: "creative_synthesis",
          opportunity: "Combine approaches in novel ways",
          description:
            "The best solutions often merge existing ideas differently",
          action: "Consider how different methods could work together",
        });
      }

      if (analysis.intent === "problem_solving") {
        opportunities.push({
          type: "iterative_learning",
          opportunity: "Gain insights through experimentation",
          description: "Each attempt teaches you something valuable",
          action: "Design experiments that maximize learning",
        });
      }

      if (
        !responseLower.includes("community") &&
        !responseLower.includes("help") &&
        analysis.complexity > 0.6
      ) {
        opportunities.push({
          type: "collaborative_approach",
          opportunity: "Tap into collective knowledge",
          description: "Others have likely solved similar challenges",
          action: "Identify who might have relevant insights",
        });
      }

      return opportunities;
    } catch (error) {
      this.logger.error("Opportunity identification failed", error);
      return [];
    }
  }

  #findSimplifications(response, analysis) {
    const simplifications = [];

    try {
      const responseLower = response.toLowerCase();

      if (analysis.complexity > 0.6) {
        simplifications.push({
          type: "reduce_steps",
          simplification: "Focus on the critical path",
          before: "Multiple parallel workstreams",
          after: "Single sequential focus that delivers core value",
          benefit: "Faster progress, clearer priorities, less overwhelm",
        });
      }

      if (
        analysis.domain === "technical" &&
        !responseLower.includes("existing") &&
        !responseLower.includes("available")
      ) {
        simplifications.push({
          type: "leverage_existing",
          simplification: "Use tools that already exist",
          before: "Build custom solution from scratch",
          after: "Adapt existing tools to your needs",
          benefit: "80% faster, battle-tested, maintained by others",
        });
      }

      if (analysis.requiresCalculation && !responseLower.includes("manual")) {
        simplifications.push({
          type: "manual_first",
          simplification: "Start manual before automating",
          before: "Build automated system immediately",
          after: "Do it manually first to understand the real requirements",
          benefit: "Learn what actually matters before investing in automation",
        });
      }

      if (analysis.complexity > 0.7 && !responseLower.includes("scope")) {
        simplifications.push({
          type: "scope_reduction",
          simplification: "Solve for one specific case first",
          before: "Handle every possible scenario",
          after: "Perfect the most common use case",
          benefit: "Ship faster, learn from real usage, iterate based on data",
        });
      }

      return simplifications;
    } catch (error) {
      this.logger.error("Simplification finding failed", error);
      return [];
    }
  }

  #extractMotivations(analysis, context) {
    const motivations = [];

    try {
      if (analysis.intent === "decision_making") {
        motivations.push({
          surface: "Making a choice",
          deeper: "Seeking confidence in an uncertain situation",
          support: "What would help you feel confident moving forward?",
        });
      }

      if (
        analysis.intent === "problem_solving" &&
        analysis.emotionalWeight > 0.5
      ) {
        motivations.push({
          surface: "Solving a problem",
          deeper: "Relieving stress or frustration",
          support: "Let's find a path that reduces the burden",
        });
      }

      if (analysis.domain === "business" && analysis.complexity > 0.6) {
        motivations.push({
          surface: "Business decision",
          deeper:
            "Building something sustainable that doesn't consume your life",
          support: "How can we achieve this without burning out?",
        });
      }

      if (context.sources?.hasMemory && analysis.personalContext) {
        motivations.push({
          surface: "Current situation",
          deeper: "Part of a longer journey you're on",
          support: "This connects to what you've been working toward",
        });
      }

      return motivations;
    } catch (error) {
      this.logger.error("Motivation extraction failed", error);
      return [];
    }
  }

  // ==================== ENHANCEMENT METHODS ====================

  #enhanceWithEmotionalSupport(response, emotional) {
    if (!emotional.needsSupport) return response;

    let support = "\n\n";

    if (emotional.needsReassurance) {
      support +=
        "**I want you to know:** This situation feels complex because it genuinely is complex. Your uncertainty makes sense - it means you're thinking carefully about something that matters.\n\n";
    }

    if (emotional.needsEncouragement) {
      support +=
        "**What I see:** You're tackling something challenging, and that takes courage. The fact that you're here thinking through the details tells me you're approaching this thoughtfully.\n\n";
    }

    return response + support;
  }

  #enhanceWithOpportunities(response, opportunities) {
    if (opportunities.length === 0) return response;

    let enhancement = "\n\n**Opportunities I See:**\n";

    for (const opp of opportunities.slice(0, 3)) {
      enhancement += `\n**${opp.opportunity}:** ${opp.description}\n`;
      enhancement += `- Action: ${opp.action}\n`;
    }

    return response + enhancement;
  }

  #enhanceWithSimplifications(response, simplifications) {
    if (simplifications.length === 0) return response;

    let enhancement = "\n\n**Simpler Paths Forward:**\n";

    for (const simp of simplifications.slice(0, 2)) {
      enhancement += `\n**${simp.simplification}**\n`;
      enhancement += `- Instead of: ${simp.before}\n`;
      enhancement += `- Consider: ${simp.after}\n`;
      enhancement += `- Benefit: ${simp.benefit}\n`;
    }

    return response + enhancement;
  }

  #enhanceWithPracticalSteps(response, analysis) {
    const steps = [];

    if (analysis.domain === "business") {
      steps.push('Define success: What does "working" look like in 30 days?');
      steps.push("Identify the first small test you can run this week");
      steps.push(
        "List what resources you already have vs what you need to acquire",
      );
    } else if (analysis.domain === "technical") {
      steps.push("Sketch the simplest version that proves the concept");
      steps.push("Identify the riskiest assumption to test first");
      steps.push('Define what "good enough for v1" means');
    } else {
      steps.push("Clarify what outcome you want from this");
      steps.push("Identify the smallest first step");
      steps.push("Decide what success looks like");
    }

    if (steps.length === 0) {
      return { added: false, enhanced: response, steps: [] };
    }

    let enhancement = "\n\n**Practical Next Steps:**\n";
    for (let i = 0; i < steps.length && i < 3; i++) {
      enhancement += `${i + 1}. ${steps[i]}\n`;
    }

    return {
      added: true,
      enhanced: response + enhancement,
      steps: steps,
    };
  }

  #enhanceWithResourceOptimization(response, analysis) {
    const optimizations = [];

    if (analysis.complexity > 0.6) {
      optimizations.push({
        resource: "Time",
        optimization: "Focus on the 20% that delivers 80% of value",
        how: "Identify core deliverable, cut everything else for v1",
      });
    }

    if (analysis.domain === "business") {
      optimizations.push({
        resource: "Money",
        optimization: "Test cheaply before investing heavily",
        how: "Manual process, small pilot, or prototype before scaling",
      });
    }

    // CRITICAL FIX (Issue #385, Bug 1.2): Only add energy optimizations for
    // complex creative work, not simple questions
    if (analysis.requiresCreativity && analysis.complexity > 0.5) {
      optimizations.push({
        resource: "Energy",
        optimization: "Work with your natural rhythms",
        how: "Schedule creative work when you have peak energy",
      });
    }

    if (optimizations.length === 0) {
      return { added: false, enhanced: response, optimizations: [] };
    }

    let enhancement = "\n\n**Do More With Less:**\n";
    for (const opt of optimizations.slice(0, 2)) {
      enhancement += `\n**${opt.resource}:** ${opt.optimization}\n`;
      enhancement += `- How: ${opt.how}\n`;
    }

    return {
      added: true,
      enhanced: response + enhancement,
      optimizations: optimizations,
    };
  }

  #applyRoxySignature(response, modificationsCount) {
    // ISSUE #430 FIX: Personality signatures go in metadata, NOT in response text
    // The response field should contain ONLY the answer, no emoji prefixes or framework labels
    return response;
  }

  // ==================== VALIDATION METHODS ====================

  #ensureEmpowerment(response) {
    const responseLower = response.toLowerCase();
    let corrected = response;
    let empowering = true;

    const controllingPhrases = [
      { phrase: "you should", replacement: "you could consider" },
      { phrase: "you must", replacement: "it would be important to" },
      { phrase: "you need to", replacement: "it might help to" },
      { phrase: "do this", replacement: "consider doing this" },
    ];

    for (const { phrase, replacement } of controllingPhrases) {
      if (responseLower.includes(phrase)) {
        const regex = new RegExp(phrase, "gi");
        corrected = corrected.replace(regex, replacement);
        empowering = false;
      }
    }

    return {
      empowering: empowering,
      corrected: corrected,
    };
  }

  #validateEncouragement(response, emotional) {
    const responseLower = response.toLowerCase();

    const patronizingPhrases = ["good job", "well done", "proud of you"];
    const hasPatronizing = patronizingPhrases.some((p) =>
      responseLower.includes(p),
    );

    if (hasPatronizing) {
      return {
        appropriate: false,
        issue: "Potentially patronizing language detected",
      };
    }

    if (
      emotional.needsEncouragement &&
      !responseLower.includes("see") &&
      !responseLower.includes("believe") &&
      !responseLower.includes("confident")
    ) {
      return {
        appropriate: false,
        issue: "Encouragement needed but not provided authentically",
      };
    }

    return {
      appropriate: true,
    };
  }
}
