// api/lib/learning-engine.js
// LEARNING ENGINE - Continuous improvement from every interaction
// Learns patterns, adapts intelligence, and improves decision-making over time

class LearningEngine {
  constructor() {
    this.experienceDatabase = [];
    this.learningPatterns = new Map();
    this.improvementMetrics = new Map();
    this.knowledgeGraph = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      console.log("🧠 Initializing learning engine...");

      // Initialize learning components
      this.initializeLearningPatterns();
      this.initializeKnowledgeGraph();
      this.initializeImprovementTracking();

      this.initialized = true;
      console.log("✅ Learning engine ready - continuous improvement active");
      console.log("📚 Ready to learn from every interaction");

      return true;
    } catch (error) {
      console.error("❌ Learning engine initialization failed:", error);
      this.initialized = false;
      return false;
    }
  }

  initializeLearningPatterns() {
    // Initialize learning pattern categories
    const patternCategories = [
      "query_classification",
      "reasoning_effectiveness",
      "user_satisfaction",
      "confidence_accuracy",
      "domain_synthesis",
      "novel_situation_handling",
    ];

    patternCategories.forEach((category) => {
      this.learningPatterns.set(category, {
        total_samples: 0,
        successful_patterns: new Map(),
        failed_patterns: new Map(),
        improvement_trends: [],
        confidence_levels: [],
      });
    });
  }

  initializeKnowledgeGraph() {
    // Initialize knowledge graph for relationship learning
    this.knowledgeGraph.set("business_concepts", new Map());
    this.knowledgeGraph.set("user_preferences", new Map());
    this.knowledgeGraph.set("domain_relationships", new Map());
    this.knowledgeGraph.set("solution_effectiveness", new Map());
  }

  initializeImprovementTracking() {
    // Track improvement metrics over time
    this.improvementMetrics.set("overall_performance", {
      baseline_confidence: 0.7,
      current_confidence: 0.7,
      improvement_rate: 0,
      learning_velocity: 0,
    });

    this.improvementMetrics.set("domain_specific", new Map());
    this.improvementMetrics.set("user_specific", new Map());
  }

  // MAIN LEARNING METHOD - Record and learn from each experience
  async recordExperience({
    input,
    reasoning,
    output,
    performance,
    userFeedback = null,
    context = {},
  }) {
    console.log("📚 Recording experience for learning...");

    if (!this.initialized) {
      await this.initialize();
    }

    const experience = {
      id: Date.now(),
      timestamp: new Date().toISOString(),

      // Input analysis
      input_analysis: {
        query: input.query,
        query_type: this.classifyQuery(input.query),
        context_complexity: this.assessContextComplexity(input.context),
        multimodal_inputs: input.multimodal || [],
        business_domain: this.identifyBusinessDomain(
          input.query,
          input.context,
        ),
      },

      // Reasoning analysis
      reasoning_analysis: {
        approach_used: reasoning.domains_synthesized || [],
        reasoning_quality: reasoning.reasoning_quality || "unknown",
        ai_model_used: reasoning.model_used || "unknown",
        processing_time: reasoning.processing_time || 0,
        novel_insights_generated: reasoning.novel_insights?.length || 0,
        cross_domain_synthesis: reasoning.domains_synthesized?.length > 1,
      },

      // Output analysis
      output_analysis: {
        confidence: output.confidence || 0.5,
        trust_score: output.trustScore || 0.5,
        precision_score: output.precisionScore || 0.5,
        reliability_score: output.reliabilityScore || 0.5,
        user_value_delivered: this.assessUserValue(output),
        strategic_depth: output.strategic_insights?.length || 0,
      },

      // Performance metrics
      performance_metrics: {
        ...performance,
        success_indicators: this.calculateSuccessIndicators(
          performance,
          output,
        ),
        learning_opportunities: this.identifyLearningOpportunities(
          input,
          reasoning,
          output,
        ),
      },

      // User feedback (if available)
      user_feedback: userFeedback,

      // Context metadata
      context_metadata: {
        mode: context.mode || "unknown",
        business_critical: context.business_critical || false,
        novel_situation: context.novel_situation || false,
        competitive_pressure: context.competitive_pressure || false,
      },
    };

    // Store experience
    this.experienceDatabase.push(experience);

    // Learn from this experience
    await this.learnFromExperience(experience);

    // Update improvement metrics
    this.updateImprovementMetrics(experience);

    // Trigger periodic learning if enough new experiences
    if (this.experienceDatabase.length % 25 === 0) {
      await this.performPeriodicLearning();
    }

    console.log(
      `✅ Experience recorded and learned from - Total experiences: ${this.experienceDatabase.length}`,
    );

    return {
      experience_id: experience.id,
      learning_applied: true,
      patterns_updated: this.getUpdatedPatterns(),
      improvement_detected: this.detectImprovements(experience),
    };
  }

  async learnFromExperience(experience) {
    // Learn query classification patterns
    await this.learnQueryClassification(experience);

    // Learn reasoning effectiveness patterns
    await this.learnReasoningEffectiveness(experience);

    // Learn user satisfaction patterns
    await this.learnUserSatisfactionPatterns(experience);

    // Learn confidence accuracy patterns
    await this.learnConfidenceAccuracy(experience);

    // Learn domain synthesis patterns
    await this.learnDomainSynthesis(experience);

    // Learn novel situation handling
    await this.learnNovelSituationHandling(experience);

    // Update knowledge graph
    await this.updateKnowledgeGraph(experience);
  }

  async learnQueryClassification(experience) {
    const pattern = this.learningPatterns.get("query_classification");
    const queryType = experience.input_analysis.query_type;
    const success =
      experience.performance_metrics.success_indicators.overall_success;

    pattern.total_samples++;

    if (success) {
      const currentCount = pattern.successful_patterns.get(queryType) || 0;
      pattern.successful_patterns.set(queryType, currentCount + 1);
    } else {
      const currentCount = pattern.failed_patterns.get(queryType) || 0;
      pattern.failed_patterns.set(queryType, currentCount + 1);
    }

    // Learn what approaches work best for each query type
    if (
      success &&
      experience.reasoning_analysis.reasoning_quality === "genuine"
    ) {
      const approachKey = `${queryType}_${experience.reasoning_analysis.approach_used.join("_")}`;
      const approaches =
        pattern.successful_patterns.get("approaches") || new Map();
      approaches.set(approachKey, (approaches.get(approachKey) || 0) + 1);
      pattern.successful_patterns.set("approaches", approaches);
    }
  }

  async learnReasoningEffectiveness(experience) {
    const pattern = this.learningPatterns.get("reasoning_effectiveness");
    const reasoning = experience.reasoning_analysis;
    const output = experience.output_analysis;

    pattern.total_samples++;

    // Learn which reasoning approaches produce best results
    const effectiveness = {
      approach: reasoning.approach_used.join("_"),
      confidence: output.confidence,
      trust_score: output.trust_score,
      strategic_depth: output.strategic_depth,
      processing_time: reasoning.processing_time,
      novel_insights: reasoning.novel_insights_generated,
    };

    // Store effectiveness data
    const approachKey = effectiveness.approach;
    if (!pattern.successful_patterns.has(approachKey)) {
      pattern.successful_patterns.set(approachKey, {
        total_uses: 0,
        avg_confidence: 0,
        avg_trust_score: 0,
        avg_strategic_depth: 0,
        avg_processing_time: 0,
        novel_insights_rate: 0,
      });
    }

    const approachData = pattern.successful_patterns.get(approachKey);
    approachData.total_uses++;

    // Update running averages
    approachData.avg_confidence = this.updateRunningAverage(
      approachData.avg_confidence,
      effectiveness.confidence,
      approachData.total_uses,
    );

    approachData.avg_trust_score = this.updateRunningAverage(
      approachData.avg_trust_score,
      effectiveness.trust_score,
      approachData.total_uses,
    );

    approachData.avg_strategic_depth = this.updateRunningAverage(
      approachData.avg_strategic_depth,
      effectiveness.strategic_depth,
      approachData.total_uses,
    );

    approachData.avg_processing_time = this.updateRunningAverage(
      approachData.avg_processing_time,
      effectiveness.processing_time,
      approachData.total_uses,
    );

    approachData.novel_insights_rate = this.updateRunningAverage(
      approachData.novel_insights_rate,
      effectiveness.novel_insights > 0 ? 1 : 0,
      approachData.total_uses,
    );
  }

  async learnUserSatisfactionPatterns(experience) {
    const pattern = this.learningPatterns.get("user_satisfaction");

    // If we have user feedback, learn from it
    if (experience.user_feedback) {
      pattern.total_samples++;

      const satisfaction = experience.user_feedback.satisfaction || "unknown";
      const satisfactionCount =
        pattern.successful_patterns.get(satisfaction) || 0;
      pattern.successful_patterns.set(satisfaction, satisfactionCount + 1);

      // Learn what factors correlate with satisfaction
      if (satisfaction === "positive" || satisfaction === "thumbs_up") {
        this.learnPositiveSatisfactionFactors(experience);
      } else if (
        satisfaction === "negative" ||
        satisfaction === "thumbs_down"
      ) {
        this.learnNegativeSatisfactionFactors(experience);
      }
    }

    // Learn implicit satisfaction from output metrics
    const implicitSatisfaction = this.inferSatisfactionFromMetrics(
      experience.output_analysis,
    );
    pattern.confidence_levels.push(implicitSatisfaction);
  }

  learnPositiveSatisfactionFactors(experience) {
    const factors = {
      high_confidence: experience.output_analysis.confidence > 0.8,
      strategic_insights: experience.output_analysis.strategic_depth > 2,
      quick_response: experience.reasoning_analysis.processing_time < 5000,
      novel_insights:
        experience.reasoning_analysis.novel_insights_generated > 0,
      cross_domain: experience.reasoning_analysis.cross_domain_synthesis,
    };

    const positivePatternsMap =
      this.learningPatterns.get("user_satisfaction").successful_patterns;
    Object.entries(factors).forEach(([factor, present]) => {
      if (present) {
        const currentCount = positivePatternsMap.get(`positive_${factor}`) || 0;
        positivePatternsMap.set(`positive_${factor}`, currentCount + 1);
      }
    });
  }

  learnNegativeSatisfactionFactors(experience) {
    const factors = {
      low_confidence: experience.output_analysis.confidence < 0.6,
      no_insights: experience.output_analysis.strategic_depth === 0,
      slow_response: experience.reasoning_analysis.processing_time > 10000,
      no_alternatives: !experience.output_analysis.alternatives?.length,
      generic_response:
        experience.reasoning_analysis.reasoning_quality === "fallback",
    };

    const negativePatternsMap =
      this.learningPatterns.get("user_satisfaction").failed_patterns;
    Object.entries(factors).forEach(([factor, present]) => {
      if (present) {
        const currentCount = negativePatternsMap.get(`negative_${factor}`) || 0;
        negativePatternsMap.set(`negative_${factor}`, currentCount + 1);
      }
    });
  }

  async learnConfidenceAccuracy(experience) {
    const pattern = this.learningPatterns.get("confidence_accuracy");

    // Learn how accurate our confidence predictions are
    const predictedConfidence = experience.output_analysis.confidence;
    const actualPerformance =
      experience.performance_metrics.success_indicators.overall_success;

    pattern.total_samples++;
    pattern.confidence_levels.push({
      predicted: predictedConfidence,
      actual_success: actualPerformance,
      accuracy: Math.abs(predictedConfidence - (actualPerformance ? 1 : 0)),
    });

    // Learn confidence calibration
    const confidenceRange = this.getConfidenceRange(predictedConfidence);
    const rangeData = pattern.successful_patterns.get(confidenceRange) || {
      predictions: 0,
      successes: 0,
    };
    rangeData.predictions++;
    if (actualPerformance) rangeData.successes++;
    pattern.successful_patterns.set(confidenceRange, rangeData);
  }

  async learnDomainSynthesis(experience) {
    const pattern = this.learningPatterns.get("domain_synthesis");
    const domains = experience.reasoning_analysis.approach_used;

    if (domains.length > 1) {
      pattern.total_samples++;

      const synthesisKey = domains.sort().join("_");
      const success =
        experience.performance_metrics.success_indicators.overall_success;
      const effectiveness = experience.output_analysis.strategic_depth;

      if (!pattern.successful_patterns.has(synthesisKey)) {
        pattern.successful_patterns.set(synthesisKey, {
          attempts: 0,
          successes: 0,
          avg_effectiveness: 0,
        });
      }

      const synthesisData = pattern.successful_patterns.get(synthesisKey);
      synthesisData.attempts++;
      if (success) synthesisData.successes++;
      synthesisData.avg_effectiveness = this.updateRunningAverage(
        synthesisData.avg_effectiveness,
        effectiveness,
        synthesisData.attempts,
      );
    }
  }

  async learnNovelSituationHandling(experience) {
    const pattern = this.learningPatterns.get("novel_situation_handling");

    if (experience.context_metadata.novel_situation) {
      pattern.total_samples++;

      const approach = experience.reasoning_analysis.approach_used.join("_");
      const success =
        experience.performance_metrics.success_indicators.overall_success;
      const novelInsights =
        experience.reasoning_analysis.novel_insights_generated;

      const novelKey = `novel_${approach}`;
      if (!pattern.successful_patterns.has(novelKey)) {
        pattern.successful_patterns.set(novelKey, {
          attempts: 0,
          successes: 0,
          avg_novel_insights: 0,
        });
      }

      const novelData = pattern.successful_patterns.get(novelKey);
      novelData.attempts++;
      if (success) novelData.successes++;
      novelData.avg_novel_insights = this.updateRunningAverage(
        novelData.avg_novel_insights,
        novelInsights,
        novelData.attempts,
      );
    }
  }

  async updateKnowledgeGraph(experience) {
    // Update business concepts understanding
    this.updateBusinessConcepts(experience);

    // Update user preferences
    this.updateUserPreferences(experience);

    // Update domain relationships
    this.updateDomainRelationships(experience);

    // Update solution effectiveness
    this.updateSolutionEffectiveness(experience);
  }

  updateBusinessConcepts(experience) {
    const businessGraph = this.knowledgeGraph.get("business_concepts");
    const domain = experience.input_analysis.business_domain;
    const success =
      experience.performance_metrics.success_indicators.overall_success;

    if (!businessGraph.has(domain)) {
      businessGraph.set(domain, {
        total_encounters: 0,
        successful_responses: 0,
        effective_approaches: new Set(),
        common_patterns: [],
      });
    }

    const domainData = businessGraph.get(domain);
    domainData.total_encounters++;
    if (success) {
      domainData.successful_responses++;
      experience.reasoning_analysis.approach_used.forEach((approach) => {
        domainData.effective_approaches.add(approach);
      });
    }
  }

  updateUserPreferences(experience) {
    const userGraph = this.knowledgeGraph.get("user_preferences");

    // Learn communication style preferences
    if (experience.user_feedback) {
      const satisfaction = experience.user_feedback.satisfaction;
      const responseStyle = this.analyzeResponseStyle(experience);

      if (!userGraph.has("communication_style")) {
        userGraph.set("communication_style", new Map());
      }

      const styleMap = userGraph.get("communication_style");
      const styleKey = `${responseStyle}_${satisfaction}`;
      styleMap.set(styleKey, (styleMap.get(styleKey) || 0) + 1);
    }
  }

  updateDomainRelationships(experience) {
    const relationshipGraph = this.knowledgeGraph.get("domain_relationships");
    const domains = experience.reasoning_analysis.approach_used;

    if (domains.length > 1) {
      // Record successful domain combinations
      for (let i = 0; i < domains.length; i++) {
        for (let j = i + 1; j < domains.length; j++) {
          const relationshipKey = `${domains[i]}_${domains[j]}`;
          const effectiveness = experience.output_analysis.strategic_depth;

          if (!relationshipGraph.has(relationshipKey)) {
            relationshipGraph.set(relationshipKey, {
              combinations: 0,
              avg_effectiveness: 0,
              success_rate: 0,
              successes: 0,
            });
          }

          const relationData = relationshipGraph.get(relationshipKey);
          relationData.combinations++;

          const success =
            experience.performance_metrics.success_indicators.overall_success;
          if (success) relationData.successes++;

          relationData.success_rate =
            relationData.successes / relationData.combinations;
          relationData.avg_effectiveness = this.updateRunningAverage(
            relationData.avg_effectiveness,
            effectiveness,
            relationData.combinations,
          );
        }
      }
    }
  }

  updateSolutionEffectiveness(experience) {
    const solutionGraph = this.knowledgeGraph.get("solution_effectiveness");
    const queryType = experience.input_analysis.query_type;
    const approach = experience.reasoning_analysis.approach_used.join("_");
    const effectiveness = experience.output_analysis.user_value_delivered;

    const solutionKey = `${queryType}_${approach}`;

    if (!solutionGraph.has(solutionKey)) {
      solutionGraph.set(solutionKey, {
        uses: 0,
        avg_effectiveness: 0,
        confidence_range: [],
      });
    }

    const solutionData = solutionGraph.get(solutionKey);
    solutionData.uses++;
    solutionData.avg_effectiveness = this.updateRunningAverage(
      solutionData.avg_effectiveness,
      effectiveness,
      solutionData.uses,
    );

    solutionData.confidence_range.push(experience.output_analysis.confidence);
  }

  async performPeriodicLearning() {
    console.log("🔄 Performing periodic learning analysis...");

    // Analyze learning trends
    const trends = this.analyzeLearningTrends();

    // Update improvement metrics
    this.updateGlobalImprovementMetrics();

    // Generate learning insights
    const insights = this.generateLearningInsights();

    // Optimize patterns
    this.optimizeLearningPatterns();

    console.log("✅ Periodic learning complete");

    return {
      trends,
      insights,
      patterns_optimized: true,
      learning_velocity: this.calculateLearningVelocity(),
    };
  }

  analyzeLearningTrends() {
    const trends = {};

    // Analyze confidence trends
    const recentExperiences = this.experienceDatabase.slice(-100);
    const confidenceTrend = recentExperiences.map(
      (exp) => exp.output_analysis.confidence,
    );
    trends.confidence_trend = this.calculateTrend(confidenceTrend);

    // Analyze success rate trends
    const successTrend = recentExperiences.map((exp) =>
      exp.performance_metrics.success_indicators.overall_success ? 1 : 0,
    );
    trends.success_rate_trend = this.calculateTrend(successTrend);

    // Analyze strategic depth trends
    const strategicTrend = recentExperiences.map(
      (exp) => exp.output_analysis.strategic_depth,
    );
    trends.strategic_depth_trend = this.calculateTrend(strategicTrend);

    return trends;
  }

  generateLearningInsights() {
    const insights = [];

    // Identify most effective approaches
    const effectiveApproaches = this.identifyMostEffectiveApproaches();
    insights.push({
      type: "effective_approaches",
      data: effectiveApproaches,
      actionable: "Prioritize these approaches for similar query types",
    });

    // Identify improvement opportunities
    const improvements = this.identifyImprovementOpportunities();
    insights.push({
      type: "improvement_opportunities",
      data: improvements,
      actionable: "Focus learning on these areas",
    });

    // Identify learning gaps
    const gaps = this.identifyLearningGaps();
    insights.push({
      type: "learning_gaps",
      data: gaps,
      actionable: "Gather more experience in these domains",
    });

    return insights;
  }

  // UTILITY METHODS

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
    if (/operational|process|workflow|efficiency/i.test(query))
      return "operational";
    if (/decision|choice|option|alternative/i.test(query))
      return "decision_making";
    return "general";
  }

  assessContextComplexity(context) {
    let complexity = 0.3; // Base complexity

    if (context.business_critical) complexity += 0.2;
    if (context.competitive_pressure) complexity += 0.1;
    if (context.novel_situation) complexity += 0.2;
    if (context.multiple_stakeholders) complexity += 0.1;
    if (context.time_pressure) complexity += 0.1;

    return Math.min(1.0, complexity);
  }

  identifyBusinessDomain(query, _context) {
    if (/survival|cash|runway|margin/i.test(query)) return "business_survival";
    if (/strategy|competitive|market/i.test(query)) return "strategic_planning";
    if (/financial|revenue|profit|cost/i.test(query))
      return "financial_management";
    if (/operational|process|efficiency/i.test(query)) return "operations";
    if (/product|development|innovation/i.test(query))
      return "product_development";
    if (/customer|user|satisfaction/i.test(query)) return "customer_management";
    if (/team|hiring|culture/i.test(query)) return "human_resources";
    if (/legal|compliance|risk/i.test(query)) return "legal_compliance";
    return "general_business";
  }

  assessUserValue(output) {
    let value = 0.5; // Base value

    if (output.confidence > 0.8) value += 0.15;
    if (output.strategic_depth > 2) value += 0.15;
    if (output.trust_score > 0.85) value += 0.1;
    if (output.precision_score > 0.8) value += 0.1;

    return Math.min(1.0, value);
  }

  calculateSuccessIndicators(performance, output) {
    return {
      overall_success: output.confidence > 0.7 && output.trust_score > 0.8,
      high_quality: output.strategic_depth > 1 && output.precision_score > 0.8,
      user_valuable: this.assessUserValue(output) > 0.7,
      reliable: output.reliability_score > 0.8,
    };
  }

  identifyLearningOpportunities(input, reasoning, output) {
    const opportunities = [];

    if (output.confidence < 0.7) {
      opportunities.push("confidence_improvement");
    }

    if (reasoning.novel_insights_generated === 0) {
      opportunities.push("novel_insight_generation");
    }

    if (output.strategic_depth < 2) {
      opportunities.push("strategic_depth_enhancement");
    }

    if (reasoning.processing_time > 10000) {
      opportunities.push("processing_efficiency");
    }

    return opportunities;
  }

  updateRunningAverage(currentAverage, newValue, totalCount) {
    return (currentAverage * (totalCount - 1) + newValue) / totalCount;
  }

  getConfidenceRange(confidence) {
    if (confidence >= 0.9) return "very_high";
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.7) return "medium_high";
    if (confidence >= 0.6) return "medium";
    if (confidence >= 0.5) return "medium_low";
    return "low";
  }

  inferSatisfactionFromMetrics(outputAnalysis) {
    const score =
      (outputAnalysis.confidence +
        outputAnalysis.trust_score +
        outputAnalysis.precision_score +
        outputAnalysis.reliability_score) /
      4;
    return score;
  }

  analyzeResponseStyle(experience) {
    const output = experience.output_analysis;

    if (output.strategic_depth > 2) return "strategic_detailed";
    if (output.precision_score > 0.8) return "precise_analytical";
    if (output.confidence > 0.85) return "confident_direct";
    return "balanced_comprehensive";
  }

  calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + index * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  identifyMostEffectiveApproaches() {
    const effectiveness = new Map();

    this.learningPatterns
      .get("reasoning_effectiveness")
      .successful_patterns.forEach((data, approach) => {
        if (data.total_uses > 5) {
          // Minimum sample size
          const score =
            (data.avg_confidence +
              data.avg_trust_score +
              data.avg_strategic_depth / 5 +
              data.novel_insights_rate) /
            4;
          effectiveness.set(approach, {
            effectiveness_score: score,
            sample_size: data.total_uses,
          });
        }
      });

    return Array.from(effectiveness.entries())
      .sort((a, b) => b[1].effectiveness_score - a[1].effectiveness_score)
      .slice(0, 5);
  }

  identifyImprovementOpportunities() {
    const opportunities = [];

    // Low confidence areas
    const confidencePattern = this.learningPatterns.get("confidence_accuracy");
    const lowConfidenceRate =
      confidencePattern.confidence_levels.filter((c) => c.predicted < 0.7)
        .length / confidencePattern.confidence_levels.length;

    if (lowConfidenceRate > 0.3) {
      opportunities.push({
        area: "confidence_improvement",
        severity: "high",
        rate: lowConfidenceRate,
      });
    }

    return opportunities;
  }

  identifyLearningGaps() {
    const gaps = [];

    // Identify domains with insufficient experience
    const domainCounts = new Map();
    this.experienceDatabase.forEach((exp) => {
      const domain = exp.input_analysis.business_domain;
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    });

    domainCounts.forEach((count, domain) => {
      if (count < 10) {
        gaps.push({
          domain,
          experience_count: count,
          priority: count < 5 ? "high" : "medium",
        });
      }
    });

    return gaps;
  }

  updateImprovementMetrics(experience) {
    const overall = this.improvementMetrics.get("overall_performance");

    // Update current confidence
    const confidence = experience.output_analysis.confidence;
    overall.current_confidence = this.updateRunningAverage(
      overall.current_confidence,
      confidence,
      this.experienceDatabase.length,
    );

    // Calculate improvement rate
    overall.improvement_rate =
      overall.current_confidence - overall.baseline_confidence;
  }

  updateGlobalImprovementMetrics() {
    const overall = this.improvementMetrics.get("overall_performance");

    // Calculate learning velocity (improvement per 100 experiences)
    const recentExperiences = this.experienceDatabase.slice(-100);
    if (recentExperiences.length === 100) {
      const recentAvgConfidence =
        recentExperiences.reduce(
          (sum, exp) => sum + exp.output_analysis.confidence,
          0,
        ) / 100;

      const previousAvgConfidence =
        this.experienceDatabase
          .slice(-200, -100)
          .reduce((sum, exp) => sum + exp.output_analysis.confidence, 0) / 100;

      overall.learning_velocity = recentAvgConfidence - previousAvgConfidence;
    }
  }

  calculateLearningVelocity() {
    return this.improvementMetrics.get("overall_performance").learning_velocity;
  }

  optimizeLearningPatterns() {
    // Remove outdated patterns, consolidate similar patterns, etc.
    // This would implement pattern optimization logic
    console.log("🔧 Optimizing learning patterns...");
  }

  getUpdatedPatterns() {
    return Array.from(this.learningPatterns.keys());
  }

  detectImprovements(experience) {
    // Detect if this experience shows improvement over baseline
    const confidence = experience.output_analysis.confidence;
    const baseline = this.improvementMetrics.get(
      "overall_performance",
    ).baseline_confidence;

    return {
      confidence_improvement: confidence > baseline,
      improvement_magnitude: confidence - baseline,
      strategic_depth_improvement:
        experience.output_analysis.strategic_depth > 1,
    };
  }

  // LEARNING ENGINE STATUS AND DIAGNOSTICS
  getLearningStatus() {
    return {
      initialized: this.initialized,
      total_experiences: this.experienceDatabase.length,
      learning_patterns: Object.fromEntries(
        Array.from(this.learningPatterns.entries()).map(([key, pattern]) => [
          key,
          {
            total_samples: pattern.total_samples,
            successful_patterns_count: pattern.successful_patterns.size,
            failed_patterns_count: pattern.failed_patterns.size,
          },
        ]),
      ),
      improvement_metrics: Object.fromEntries(
        this.improvementMetrics.entries(),
      ),
      knowledge_graph_size: {
        business_concepts: this.knowledgeGraph.get("business_concepts").size,
        user_preferences: this.knowledgeGraph.get("user_preferences").size,
        domain_relationships: this.knowledgeGraph.get("domain_relationships")
          .size,
        solution_effectiveness: this.knowledgeGraph.get(
          "solution_effectiveness",
        ).size,
      },
      learning_velocity: this.calculateLearningVelocity(),
    };
  }

  // TEST LEARNING CAPABILITIES
  async testLearningCapabilities() {
    const testExperiences = [
      {
        input: {
          query: "Should we hire more developers?",
          context: { business_critical: true },
        },
        reasoning: {
          domains_synthesized: ["business_strategy", "truth_assessment"],
          reasoning_quality: "genuine",
          processing_time: 3000,
          novel_insights_generated: 2,
        },
        output: {
          confidence: 0.85,
          trustScore: 0.9,
          precisionScore: 0.8,
          reliabilityScore: 0.88,
          strategic_insights: ["insight1", "insight2"],
        },
        performance: { user_value: 0.9 },
      },
    ];

    const results = [];

    for (const testExp of testExperiences) {
      try {
        const result = await this.recordExperience(testExp);
        results.push({
          experience_recorded: true,
          learning_applied: result.learning_applied,
          patterns_updated: result.patterns_updated.length,
          improvement_detected:
            result.improvement_detected.confidence_improvement,
        });
      } catch (error) {
        results.push({
          experience_recorded: false,
          error: error.message,
        });
      }
    }

    return {
      test_completed: true,
      experiences_tested: testExperiences.length,
      successful_learning: results.filter((r) => r.experience_recorded).length,
      learning_patterns_active: this.learningPatterns.size,
      knowledge_graph_updated: true,
    };
  }
}

export { LearningEngine };
