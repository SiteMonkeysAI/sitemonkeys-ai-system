// api/lib/adaptation-engine.js
// ADAPTATION ENGINE - Adapts intelligence based on patterns, feedback, and performance
// Makes the system smarter and more personalized over time

class AdaptationEngine {
  constructor() {
    this.adaptationRules = new Map();
    this.userProfiles = new Map();
    this.contextPatterns = new Map();
    this.performanceBaselines = new Map();
    this.adaptationHistory = [];
    this.initialized = false;
  }

  async initialize() {
    try {
      console.log("⚙️ Initializing adaptation engine...");

      // Initialize adaptation components
      this.initializeAdaptationRules();
      this.initializeUserProfiling();
      this.initializeContextPatterns();
      this.initializePerformanceBaselines();

      this.initialized = true;
      console.log("✅ Adaptation engine ready - intelligent adaptation active");
      console.log("🔄 System will adapt based on usage patterns and feedback");

      return true;
    } catch (error) {
      console.error("❌ Adaptation engine initialization failed:", error);
      this.initialized = false;
      return false;
    }
  }

  initializeAdaptationRules() {
    // Define adaptation rule categories
    this.adaptationRules.set("confidence_adjustment", {
      enabled: true,
      rules: new Map([
        [
          "high_accuracy_user",
          { adjustment: 0.05, condition: "accuracy > 0.9" },
        ],
        [
          "low_accuracy_user",
          { adjustment: -0.05, condition: "accuracy < 0.7" },
        ],
        [
          "domain_expert",
          { adjustment: 0.1, condition: "domain_expertise = high" },
        ],
      ]),
    });

    this.adaptationRules.set("reasoning_approach", {
      enabled: true,
      rules: new Map([
        [
          "detail_preference",
          { approach: "detailed_analysis", condition: "prefers_detail = true" },
        ],
        [
          "speed_preference",
          { approach: "efficient_analysis", condition: "prefers_speed = true" },
        ],
        [
          "strategic_focus",
          { approach: "strategic_synthesis", condition: "role = executive" },
        ],
      ]),
    });

    this.adaptationRules.set("communication_style", {
      enabled: true,
      rules: new Map([
        [
          "direct_style",
          {
            style: "concise_direct",
            condition: "feedback_positive_direct = true",
          },
        ],
        [
          "comprehensive_style",
          {
            style: "detailed_comprehensive",
            condition: "requests_detail = frequent",
          },
        ],
        [
          "technical_style",
          {
            style: "technical_precise",
            condition: "technical_background = true",
          },
        ],
      ]),
    });

    this.adaptationRules.set("domain_prioritization", {
      enabled: true,
      rules: new Map([
        [
          "business_focus",
          {
            priority: "business_strategy",
            condition: "business_queries > 0.7",
          },
        ],
        [
          "technical_focus",
          {
            priority: "technical_analysis",
            condition: "technical_queries > 0.7",
          },
        ],
        [
          "financial_focus",
          {
            priority: "financial_analysis",
            condition: "financial_queries > 0.7",
          },
        ],
      ]),
    });
  }

  initializeUserProfiling() {
    // Initialize user profiling system
    this.userProfiles.set("default", {
      query_patterns: new Map(),
      feedback_history: [],
      performance_history: [],
      preferences: {
        detail_level: "medium",
        response_speed: "balanced",
        communication_style: "professional",
        domain_focus: "general",
      },
      expertise_indicators: {
        business_strategy: 0.5,
        financial_analysis: 0.5,
        technical_knowledge: 0.5,
        market_understanding: 0.5,
      },
      adaptation_profile: {
        confidence_sensitivity: "medium",
        feedback_responsiveness: "high",
        learning_speed: "medium",
        consistency_preference: "high",
      },
    });
  }

  initializeContextPatterns() {
    // Initialize context pattern recognition
    this.contextPatterns.set("query_types", new Map());
    this.contextPatterns.set("success_patterns", new Map());
    this.contextPatterns.set("failure_patterns", new Map());
    this.contextPatterns.set("temporal_patterns", new Map());
    this.contextPatterns.set("complexity_patterns", new Map());
  }

  initializePerformanceBaselines() {
    // Initialize performance baselines for adaptation
    this.performanceBaselines.set("confidence", {
      baseline: 0.75,
      target: 0.85,
    });
    this.performanceBaselines.set("trust_score", {
      baseline: 0.8,
      target: 0.9,
    });
    this.performanceBaselines.set("user_satisfaction", {
      baseline: 0.7,
      target: 0.85,
    });
    this.performanceBaselines.set("response_time", {
      baseline: 5000,
      target: 3000,
    });
    this.performanceBaselines.set("strategic_depth", {
      baseline: 1.5,
      target: 2.5,
    });
  }

  // MAIN ADAPTATION METHOD - Adapts intelligence based on context and history
  async adaptIntelligence({
    query,
    context,
    businessWisdom,
    userHistory = [],
    userId = "default",
  }) {
    console.log("🔄 Applying adaptive intelligence...");

    if (!this.initialized) {
      await this.initialize();
    }

    const adaptationSession = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      user_id: userId,
      original_context: { ...context },
      adaptations_applied: [],
    };

    try {
      // Get or create user profile
      const userProfile = this.getUserProfile(userId, userHistory);

      // Analyze current context patterns
      const contextAnalysis = this.analyzeContextPatterns(
        query,
        context,
        userProfile,
      );

      // Determine required adaptations
      const requiredAdaptations = this.determineAdaptations(
        query,
        context,
        businessWisdom,
        userProfile,
        contextAnalysis,
      );

      // Apply adaptations
      const adaptedContext = await this.applyAdaptations(
        context,
        businessWisdom,
        requiredAdaptations,
        userProfile,
      );

      // Record adaptation session
      adaptationSession.adaptations_applied = requiredAdaptations;
      adaptationSession.adapted_context = adaptedContext;
      this.adaptationHistory.push(adaptationSession);

      // Update user profile
      this.updateUserProfile(userId, query, context, requiredAdaptations);

      console.log(
        `✅ Adaptive intelligence applied: ${requiredAdaptations.length} adaptations`,
      );

      return adaptedContext;
    } catch (error) {
      console.error("❌ Adaptation failed:", error);
      return {
        ...context,
        adaptation_error: error.message,
        adaptation_applied: false,
      };
    }
  }

  getUserProfile(userId, userHistory) {
    if (!this.userProfiles.has(userId)) {
      // Create new user profile from history
      this.userProfiles.set(
        userId,
        this.createUserProfileFromHistory(userHistory),
      );
    }

    return this.userProfiles.get(userId);
  }

  createUserProfileFromHistory(userHistory) {
    const profile = {
      query_patterns: new Map(),
      feedback_history: [],
      performance_history: [],
      preferences: {
        detail_level: this.inferDetailPreference(userHistory),
        response_speed: this.inferSpeedPreference(userHistory),
        communication_style: this.inferCommunicationStyle(userHistory),
        domain_focus: this.inferDomainFocus(userHistory),
      },
      expertise_indicators: this.assessExpertiseIndicators(userHistory),
      adaptation_profile: {
        confidence_sensitivity: this.inferConfidenceSensitivity(userHistory),
        feedback_responsiveness: "high",
        learning_speed: "medium",
        consistency_preference: this.inferConsistencyPreference(userHistory),
      },
    };

    // Populate query patterns from history
    userHistory.forEach((interaction) => {
      if (interaction.query) {
        const queryType = this.classifyQuery(interaction.query);
        const currentCount = profile.query_patterns.get(queryType) || 0;
        profile.query_patterns.set(queryType, currentCount + 1);
      }
    });

    return profile;
  }

  analyzeContextPatterns(query, context, userProfile) {
    const analysis = {
      query_complexity: this.assessQueryComplexity(query),
      context_similarity: this.findSimilarContexts(context, userProfile),
      user_pattern_match: this.matchUserPatterns(query, userProfile),
      temporal_context: this.analyzeTemporalContext(context),
      business_criticality: this.assessBusinessCriticality(context),
    };

    return analysis;
  }

  determineAdaptations(
    query,
    context,
    businessWisdom,
    userProfile,
    contextAnalysis,
  ) {
    const adaptations = [];

    // Confidence requirement adaptations
    const confidenceAdaptation = this.determineConfidenceAdaptation(
      userProfile,
      contextAnalysis,
      businessWisdom,
    );
    if (confidenceAdaptation) adaptations.push(confidenceAdaptation);

    // Reasoning approach adaptations
    const reasoningAdaptation = this.determineReasoningAdaptation(
      query,
      userProfile,
      contextAnalysis,
    );
    if (reasoningAdaptation) adaptations.push(reasoningAdaptation);

    // Communication style adaptations
    const communicationAdaptation = this.determineCommunicationAdaptation(
      userProfile,
      contextAnalysis,
    );
    if (communicationAdaptation) adaptations.push(communicationAdaptation);

    // Domain prioritization adaptations
    const domainAdaptation = this.determineDomainAdaptation(
      query,
      userProfile,
      businessWisdom,
    );
    if (domainAdaptation) adaptations.push(domainAdaptation);

    // Response format adaptations
    const formatAdaptation = this.determineFormatAdaptation(
      userProfile,
      contextAnalysis,
    );
    if (formatAdaptation) adaptations.push(formatAdaptation);

    return adaptations;
  }

  determineConfidenceAdaptation(userProfile, contextAnalysis, businessWisdom) {
    const baseRequirement =
      businessWisdom.confidence_requirements?.minimum_confidence || 0.8;
    let adaptedRequirement = baseRequirement;

    // Adapt based on user confidence sensitivity
    const sensitivity = userProfile.adaptation_profile.confidence_sensitivity;
    if (sensitivity === "high") {
      adaptedRequirement = Math.min(0.95, baseRequirement + 0.05);
    } else if (sensitivity === "low") {
      adaptedRequirement = Math.max(0.6, baseRequirement - 0.05);
    }

    // Adapt based on user expertise
    const relevantExpertise = this.getRelevantExpertise(
      userProfile,
      contextAnalysis,
    );
    if (relevantExpertise > 0.8) {
      adaptedRequirement = Math.min(0.95, adaptedRequirement + 0.05);
    }

    // Adapt based on business criticality
    if (contextAnalysis.business_criticality === "high") {
      adaptedRequirement = Math.min(0.95, adaptedRequirement + 0.1);
    }

    if (Math.abs(adaptedRequirement - baseRequirement) > 0.02) {
      return {
        type: "confidence_requirement",
        original: baseRequirement,
        adapted: adaptedRequirement,
        reasoning: `Adjusted for user sensitivity (${sensitivity}) and expertise level`,
      };
    }

    return null;
  }

  determineReasoningAdaptation(query, userProfile, contextAnalysis) {
    const baseApproach = ["truth_assessment"]; // Default approach
    const adaptedApproach = [...baseApproach];

    // Add approaches based on user preferences
    const domainFocus = userProfile.preferences.domain_focus;
    if (domainFocus === "business_strategy") {
      adaptedApproach.push("business_strategy");
    } else if (domainFocus === "technical") {
      adaptedApproach.push("technical_analysis");
    }

    // Add detailed analysis if user prefers detail
    if (userProfile.preferences.detail_level === "high") {
      adaptedApproach.push("strategic_synthesis");
    }

    // Optimize for speed if user prefers fast responses
    if (userProfile.preferences.response_speed === "fast") {
      return {
        type: "reasoning_approach",
        original: baseApproach,
        adapted: ["efficient_analysis"],
        reasoning: "Optimized for user speed preference",
      };
    }

    if (adaptedApproach.length > baseApproach.length) {
      return {
        type: "reasoning_approach",
        original: baseApproach,
        adapted: adaptedApproach,
        reasoning: `Enhanced approach based on user focus (${domainFocus}) and detail preference`,
      };
    }

    return null;
  }

  determineCommunicationAdaptation(userProfile, contextAnalysis) {
    const baseStyle = "professional";
    let adaptedStyle = baseStyle;

    // Adapt based on user feedback patterns
    const communicationStyle = userProfile.preferences.communication_style;
    if (communicationStyle !== baseStyle) {
      adaptedStyle = communicationStyle;
    }

    // Adapt based on query complexity
    if (
      contextAnalysis.query_complexity > 0.8 &&
      adaptedStyle !== "technical_precise"
    ) {
      adaptedStyle = "detailed_comprehensive";
    }

    if (adaptedStyle !== baseStyle) {
      return {
        type: "communication_style",
        original: baseStyle,
        adapted: adaptedStyle,
        reasoning: `Adapted to user preference (${communicationStyle}) and context complexity`,
      };
    }

    return null;
  }

  determineDomainAdaptation(query, userProfile, businessWisdom) {
    const originalDomains =
      businessWisdom.business_intelligence?.map((intel) => intel.domain) || [];
    const adaptedDomains = [...originalDomains];

    // Prioritize domains based on user expertise and query patterns
    const userExpertise = userProfile.expertise_indicators;
    const queryType = this.classifyQuery(query);

    // Add high-expertise domains
    Object.entries(userExpertise).forEach(([domain, level]) => {
      if (level > 0.7 && !adaptedDomains.includes(domain)) {
        adaptedDomains.push(domain);
      }
    });

    // Prioritize domains based on user query patterns
    const userQueries = userProfile.query_patterns;
    const mostFrequentQueryType = this.getMostFrequentQueryType(userQueries);

    if (
      mostFrequentQueryType === "financial" &&
      !adaptedDomains.includes("financial_analysis")
    ) {
      adaptedDomains.push("financial_analysis");
    } else if (
      mostFrequentQueryType === "strategic" &&
      !adaptedDomains.includes("strategic_planning")
    ) {
      adaptedDomains.push("strategic_planning");
    }

    if (
      adaptedDomains.length !== originalDomains.length ||
      !adaptedDomains.every((domain) => originalDomains.includes(domain))
    ) {
      return {
        type: "domain_prioritization",
        original: originalDomains,
        adapted: adaptedDomains,
        reasoning: `Prioritized domains based on user expertise and query patterns`,
      };
    }

    return null;
  }

  determineFormatAdaptation(userProfile, contextAnalysis) {
    const baseFormat = "structured_comprehensive";
    let adaptedFormat = baseFormat;

    // Adapt based on detail preference
    if (userProfile.preferences.detail_level === "low") {
      adaptedFormat = "concise_focused";
    } else if (userProfile.preferences.detail_level === "high") {
      adaptedFormat = "detailed_analytical";
    }

    // Adapt based on response speed preference
    if (userProfile.preferences.response_speed === "fast") {
      adaptedFormat = "quick_summary";
    }

    if (adaptedFormat !== baseFormat) {
      return {
        type: "response_format",
        original: baseFormat,
        adapted: adaptedFormat,
        reasoning: `Adapted to user preferences for detail and speed`,
      };
    }

    return null;
  }

  async applyAdaptations(context, businessWisdom, adaptations, userProfile) {
    const adaptedContext = {
      ...context,
      adaptation_applied: true,
      adaptation_count: adaptations.length,
      adaptation_details: adaptations,
    };

    // Apply each adaptation
    adaptations.forEach((adaptation) => {
      switch (adaptation.type) {
        case "confidence_requirement":
          adaptedContext.adapted_confidence_requirement = adaptation.adapted;
          break;

        case "reasoning_approach":
          adaptedContext.adapted_reasoning_approach = adaptation.adapted;
          break;

        case "communication_style":
          adaptedContext.adapted_communication_style = adaptation.adapted;
          break;

        case "domain_prioritization":
          adaptedContext.adapted_domain_priority = adaptation.adapted;
          break;

        case "response_format":
          adaptedContext.adapted_response_format = adaptation.adapted;
          break;
      }
    });

    // Add user profile context
    adaptedContext.user_profile_context = {
      preferences: userProfile.preferences,
      expertise_indicators: userProfile.expertise_indicators,
      adaptation_profile: userProfile.adaptation_profile,
    };

    return adaptedContext;
  }

  updateUserProfile(userId, query, context, adaptations) {
    const profile = this.userProfiles.get(userId);

    // Update query patterns
    const queryType = this.classifyQuery(query);
    const currentCount = profile.query_patterns.get(queryType) || 0;
    profile.query_patterns.set(queryType, currentCount + 1);

    // Update adaptation history
    profile.adaptation_history = profile.adaptation_history || [];
    profile.adaptation_history.push({
      timestamp: new Date().toISOString(),
      query_type: queryType,
      adaptations_applied: adaptations.length,
      context_complexity: this.assessQueryComplexity(query),
    });

    // Update expertise indicators based on query patterns
    this.updateExpertiseIndicators(profile, query, context);

    // Update preferences based on adaptation effectiveness
    this.updatePreferences(profile, adaptations);
  }

  updateExpertiseIndicators(profile, query, context) {
    const queryType = this.classifyQuery(query);
    const complexityBonus = this.assessQueryComplexity(query) * 0.1;

    // Update relevant expertise indicators
    if (queryType === "financial") {
      profile.expertise_indicators.financial_analysis = Math.min(
        1.0,
        profile.expertise_indicators.financial_analysis +
          0.05 +
          complexityBonus,
      );
    } else if (queryType === "strategic") {
      profile.expertise_indicators.business_strategy = Math.min(
        1.0,
        profile.expertise_indicators.business_strategy + 0.05 + complexityBonus,
      );
    } else if (queryType === "technical") {
      profile.expertise_indicators.technical_knowledge = Math.min(
        1.0,
        profile.expertise_indicators.technical_knowledge +
          0.05 +
          complexityBonus,
      );
    }

    // Update market understanding for competitive queries
    if (/competitive|market|industry/i.test(query)) {
      profile.expertise_indicators.market_understanding = Math.min(
        1.0,
        profile.expertise_indicators.market_understanding +
          0.05 +
          complexityBonus,
      );
    }
  }

  updatePreferences(profile, adaptations) {
    // Update preferences based on adaptation patterns
    adaptations.forEach((adaptation) => {
      if (
        adaptation.type === "reasoning_approach" &&
        adaptation.adapted.includes("strategic_synthesis")
      ) {
        profile.preferences.detail_level = "high";
      }

      if (
        adaptation.type === "communication_style" &&
        adaptation.adapted === "concise_focused"
      ) {
        profile.preferences.response_speed = "fast";
      }
    });
  }

  // ADAPTATION FEEDBACK INTEGRATION
  async incorporateFeedback({ userId, feedback, context, adaptations }) {
    console.log("📝 Incorporating user feedback into adaptation...");

    const profile = this.getUserProfile(userId, []);

    // Update feedback history
    profile.feedback_history.push({
      timestamp: new Date().toISOString(),
      feedback,
      context,
      adaptations_used: adaptations,
    });

    // Learn from positive feedback
    if (feedback.satisfaction === "positive" || feedback.rating > 3) {
      this.reinforceSuccessfulAdaptations(profile, adaptations);
    }

    // Learn from negative feedback
    if (feedback.satisfaction === "negative" || feedback.rating < 3) {
      this.adjustUnsuccessfulAdaptations(profile, adaptations);
    }

    // Update adaptation sensitivity based on feedback
    this.updateAdaptationSensitivity(profile, feedback);

    return {
      feedback_incorporated: true,
      profile_updated: true,
      adaptation_learning: "active",
    };
  }

  reinforceSuccessfulAdaptations(profile, adaptations) {
    adaptations.forEach((adaptation) => {
      if (adaptation.type === "confidence_requirement") {
        // Increase confidence sensitivity if higher confidence was appreciated
        if (adaptation.adapted > adaptation.original) {
          profile.adaptation_profile.confidence_sensitivity = "high";
        }
      }

      if (adaptation.type === "reasoning_approach") {
        // Reinforce successful reasoning approaches
        if (adaptation.adapted.includes("strategic_synthesis")) {
          profile.preferences.detail_level = "high";
        }
      }
    });
  }

  adjustUnsuccessfulAdaptations(profile, adaptations) {
    adaptations.forEach((adaptation) => {
      if (adaptation.type === "communication_style") {
        // Try different communication style next time
        const currentStyle = profile.preferences.communication_style;
        if (currentStyle === "professional") {
          profile.preferences.communication_style = "concise_direct";
        } else if (currentStyle === "concise_direct") {
          profile.preferences.communication_style = "detailed_comprehensive";
        }
      }
    });
  }

  updateAdaptationSensitivity(profile, feedback) {
    // Adjust how responsive the system is to user patterns
    if (feedback.appreciation_for_personalization === "high") {
      profile.adaptation_profile.feedback_responsiveness = "high";
    } else if (feedback.preference_for_consistency === "high") {
      profile.adaptation_profile.consistency_preference = "high";
    }
  }

  // UTILITY METHODS FOR ADAPTATION

  inferDetailPreference(userHistory) {
    // Analyze history to infer if user prefers detailed responses
    const detailIndicators = userHistory.filter((interaction) =>
      /detailed|comprehensive|thorough|analysis|explain more/i.test(
        interaction.query || "",
      ),
    );

    if (detailIndicators.length > userHistory.length * 0.3) return "high";
    if (detailIndicators.length < userHistory.length * 0.1) return "low";
    return "medium";
  }

  inferSpeedPreference(userHistory) {
    // Analyze history to infer if user prefers fast responses
    const speedIndicators = userHistory.filter((interaction) =>
      /quick|fast|brief|summarize|tldr/i.test(interaction.query || ""),
    );

    if (speedIndicators.length > userHistory.length * 0.2) return "fast";
    return "balanced";
  }

  inferCommunicationStyle(userHistory) {
    // Analyze history to infer preferred communication style
    const technicalIndicators = userHistory.filter((interaction) =>
      /technical|algorithm|implementation|code|architecture/i.test(
        interaction.query || "",
      ),
    );

    const directIndicators = userHistory.filter((interaction) =>
      /just tell me|bottom line|direct answer|simple answer/i.test(
        interaction.query || "",
      ),
    );

    if (technicalIndicators.length > userHistory.length * 0.3)
      return "technical_precise";
    if (directIndicators.length > userHistory.length * 0.2)
      return "concise_direct";
    return "professional";
  }

  inferDomainFocus(userHistory) {
    // Analyze history to infer primary domain focus
    const businessQueries = userHistory.filter((interaction) =>
      /business|strategy|market|revenue|profit|competition/i.test(
        interaction.query || "",
      ),
    );

    const technicalQueries = userHistory.filter((interaction) =>
      /technical|software|system|implementation|architecture/i.test(
        interaction.query || "",
      ),
    );

    const financialQueries = userHistory.filter((interaction) =>
      /financial|budget|cost|investment|cash flow/i.test(
        interaction.query || "",
      ),
    );

    const total = userHistory.length || 1;

    if (businessQueries.length / total > 0.4) return "business_strategy";
    if (technicalQueries.length / total > 0.4) return "technical";
    if (financialQueries.length / total > 0.4) return "financial";
    return "general";
  }

  assessExpertiseIndicators(userHistory) {
    const indicators = {
      business_strategy: 0.5,
      financial_analysis: 0.5,
      technical_knowledge: 0.5,
      market_understanding: 0.5,
    };

    // Assess expertise based on query sophistication
    userHistory.forEach((interaction) => {
      if (interaction.query) {
        const complexity = this.assessQueryComplexity(interaction.query);
        const queryType = this.classifyQuery(interaction.query);

        if (queryType === "strategic") {
          indicators.business_strategy = Math.min(
            1.0,
            indicators.business_strategy + complexity * 0.1,
          );
        } else if (queryType === "financial") {
          indicators.financial_analysis = Math.min(
            1.0,
            indicators.financial_analysis + complexity * 0.1,
          );
        }

        // Check for technical terms
        if (
          /API|algorithm|database|architecture|framework/i.test(
            interaction.query,
          )
        ) {
          indicators.technical_knowledge = Math.min(
            1.0,
            indicators.technical_knowledge + complexity * 0.1,
          );
        }

        // Check for market terms
        if (
          /market share|competitive advantage|industry trends|market analysis/i.test(
            interaction.query,
          )
        ) {
          indicators.market_understanding = Math.min(
            1.0,
            indicators.market_understanding + complexity * 0.1,
          );
        }
      }
    });

    return indicators;
  }

  inferConfidenceSensitivity(userHistory) {
    // Analyze if user seems sensitive to confidence levels
    const confidenceQuestions = userHistory.filter((interaction) =>
      /how sure|confidence|certain|uncertain|probably|maybe/i.test(
        interaction.query || "",
      ),
    );

    if (confidenceQuestions.length > userHistory.length * 0.2) return "high";
    return "medium";
  }

  inferConsistencyPreference(userHistory) {
    // Analyze if user prefers consistent responses
    return "medium"; // Default for now
  }

  classifyQuery(query) {
    if (/strategy|strategic|plan|approach|direction/i.test(query))
      return "strategic";
    if (/financial|money|cash|cost|revenue|profit|budget/i.test(query))
      return "financial";
    if (/risk|problem|challenge|issue|threat/i.test(query))
      return "risk_analysis";
    if (/recommend|suggest|advice|should I|what would you/i.test(query))
      return "recommendation";
    if (/analyze|assessment|evaluation|review/i.test(query))
      return "analytical";
    if (/competitive|market|industry|competitor/i.test(query))
      return "competitive";
    if (/technical|system|software|implementation/i.test(query))
      return "technical";
    return "general";
  }

  assessQueryComplexity(query) {
    let complexity = 0.3; // Base complexity

    if (query.length > 200) complexity += 0.2;
    if (query.split("?").length > 2) complexity += 0.1; // Multiple questions
    if (/multiple|various|complex|sophisticated|comprehensive/i.test(query))
      complexity += 0.2;
    if (/analyze.*and.*consider/i.test(query)) complexity += 0.15; // Multi-step analysis

    return Math.min(1.0, complexity);
  }

  findSimilarContexts(context, userProfile) {
    // Find similar contexts from user's adaptation history
    if (!userProfile.adaptation_history) return { similarity: 0, matches: [] };

    const matches = userProfile.adaptation_history.filter((past) => {
      let similarity = 0;

      if (past.context_complexity && context.complexity_assessment) {
        similarity +=
          1 - Math.abs(past.context_complexity - context.complexity_assessment);
      }

      if (context.business_critical && past.business_critical)
        similarity += 0.5;
      if (context.novel_situation && past.novel_situation) similarity += 0.3;

      return similarity > 0.5;
    });

    return {
      similarity: matches.length > 0 ? 0.8 : 0.2,
      matches: matches.slice(0, 3),
    };
  }

  matchUserPatterns(query, userProfile) {
    const queryType = this.classifyQuery(query);
    const userPatterns = userProfile.query_patterns;
    const totalQueries = Array.from(userPatterns.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    if (totalQueries === 0)
      return { match_strength: 0, primary_pattern: "unknown" };

    const queryTypeCount = userPatterns.get(queryType) || 0;
    const matchStrength = queryTypeCount / totalQueries;

    return {
      match_strength: matchStrength,
      primary_pattern: queryType,
      frequency: queryTypeCount,
    };
  }

  analyzeTemporalContext(context) {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    return {
      time_of_day:
        hour < 9 ? "early" : hour > 17 ? "evening" : "business_hours",
      day_type: dayOfWeek === 0 || dayOfWeek === 6 ? "weekend" : "weekday",
      urgency_implied: context.time_pressure || false,
    };
  }

  assessBusinessCriticality(context) {
    let criticality = "medium";

    if (context.business_critical) criticality = "high";
    if (context.competitive_pressure) criticality = "high";
    if (context.financial_impact && context.financial_impact > 100000)
      criticality = "high";
    if (context.novel_situation && context.business_critical)
      criticality = "very_high";

    return criticality;
  }

  getRelevantExpertise(userProfile, contextAnalysis) {
    const queryType = contextAnalysis.user_pattern_match.primary_pattern;
    const expertise = userProfile.expertise_indicators;

    switch (queryType) {
      case "strategic":
        return expertise.business_strategy;
      case "financial":
        return expertise.financial_analysis;
      case "technical":
        return expertise.technical_knowledge;
      case "competitive":
        return expertise.market_understanding;
      default:
        return 0.5;
    }
  }

  getMostFrequentQueryType(queryPatterns) {
    let maxCount = 0;
    let mostFrequent = "general";

    queryPatterns.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = type;
      }
    });

    return mostFrequent;
  }

  // ADAPTATION ENGINE STATUS AND DIAGNOSTICS
  getAdaptationStatus() {
    return {
      initialized: this.initialized,
      user_profiles: this.userProfiles.size,
      adaptation_rules: Object.fromEntries(
        Array.from(this.adaptationRules.entries()).map(([key, rules]) => [
          key,
          {
            enabled: rules.enabled,
            rule_count: rules.rules.size,
          },
        ]),
      ),
      adaptation_history: {
        total_adaptations: this.adaptationHistory.length,
        recent_adaptations: this.adaptationHistory.slice(-10).length,
      },
      performance_baselines: Object.fromEntries(
        this.performanceBaselines.entries(),
      ),
      context_patterns: {
        query_types: this.contextPatterns.get("query_types").size,
        success_patterns: this.contextPatterns.get("success_patterns").size,
        failure_patterns: this.contextPatterns.get("failure_patterns").size,
      },
    };
  }

  // TEST ADAPTATION CAPABILITIES
  async testAdaptationCapabilities() {
    const testUserHistory = [
      { query: "What is our financial performance?", type: "financial" },
      { query: "How can we improve our strategy?", type: "strategic" },
      {
        query: "Give me a detailed analysis of market trends",
        type: "analytical",
      },
    ];

    const testContext = {
      business_critical: true,
      complexity_assessment: 0.8,
    };

    const testBusinessWisdom = {
      confidence_requirements: { minimum_confidence: 0.8 },
      business_intelligence: [{ domain: "financial_analysis" }],
    };

    try {
      const adaptedContext = await this.adaptIntelligence({
        query: "Should we expand into new markets?",
        context: testContext,
        businessWisdom: testBusinessWisdom,
        userHistory: testUserHistory,
        userId: "test_user",
      });

      return {
        test_completed: true,
        adaptation_applied: adaptedContext.adaptation_applied,
        adaptations_count: adaptedContext.adaptation_count,
        user_profile_created: this.userProfiles.has("test_user"),
        adaptation_types:
          adaptedContext.adaptation_details?.map((a) => a.type) || [],
        confidence_adapted:
          adaptedContext.adapted_confidence_requirement !== undefined,
        reasoning_adapted:
          adaptedContext.adapted_reasoning_approach !== undefined,
      };
    } catch (error) {
      return {
        test_completed: false,
        error: error.message,
        fallback_available: true,
      };
    }
  }
}

export { AdaptationEngine };
