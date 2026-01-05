// /api/core/personalities/eli_framework.js
// ELI FRAMEWORK - Analytical & Protective Reasoning
// Identifies risks, challenges assumptions, models downsides, finds blind spots

const MIN_CONFIDENCE_FOR_ENHANCEMENTS = 0.65;

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
 * Helper: Extract meaningful keywords from text (Issue #380 Fix 5)
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
 * Helper: Check if enhancements should be applied (Issue #380 Fix 5)
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
    console.log(`[ELI] Skipping enhancements - low relevance: ${relevanceScore.toFixed(2)}`);
    return {
      apply: false,
      reason: 'Base response does not appear relevant to user query'
    };
  }

  return { apply: true };
}

/**
 * Helper: Check if query requires decision-support analysis (risks, blind spots, etc.)
 * Only decision-making, high-stakes, or complex business queries need full analytical framework
 * @param {string} query - The user's query
 * @param {object} analysis - Semantic analysis results
 * @param {object} context - Full context including metadata
 * @returns {boolean}
 */
function requiresDecisionSupport(query, analysis, context) {
  const queryLower = query.toLowerCase();

  // Decision-making markers
  const decisionMarkers = [
    'should i', 'should we', 'which', 'better to', 'worth it',
    'help me decide', 'make a decision', 'choose between',
    'is it worth', 'would you recommend', 'advice on'
  ];

  // High-stakes domains that always get analysis
  const isHighStakes = context?.phase4Metadata?.high_stakes?.isHighStakes || false;

  // Explicit decision-making intent
  const isDecisionIntent = analysis.intent === 'decision_making';

  // Complex business queries
  const isComplexBusiness = analysis.domain === 'business' && analysis.complexity > 0.6;

  // Check for decision markers in query
  const hasDecisionMarker = decisionMarkers.some(marker => queryLower.includes(marker));

  return isHighStakes || isDecisionIntent || isComplexBusiness || hasDecisionMarker;
}

export class EliFramework {
  constructor() {
    this.personality = "eli";
    this.cognitiveStyle = "analytical";

    this.logger = {
      log: (msg) => console.log(`[ELI] ${msg}`),
      error: (msg, err) => console.error(`[ELI ERROR] ${msg}`, err),
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
      const isHighStakes = context?.phase4Metadata?.high_stakes?.isHighStakes || false;
      const query = context?.message || '';
      const externalLookupSucceeded = (context?.phase4Metadata?.sources_used > 0) || (context?.phase4Metadata?.sources_succeeded > 0);

      // Issue #380 Fix 5: Check if enhancements should be applied
      const relevanceCheck = shouldApplyEnhancements(query, response, context);
      if (!relevanceCheck.apply) {
        this.logger.log(`Skipping all enhancements: ${relevanceCheck.reason}`);
        return {
          enhancedResponse: response,
          personality: "eli",
          analysisApplied: {},
          modificationsCount: 0,
          reasoningApplied: false,
          skipped: true,
          skipReason: relevanceCheck.reason
        };
      }

      // ========== CONFIDENCE GATING (NEW) ==========
      // PERMANENT facts NEVER get disclaimers - they are established truth
      // External lookups that succeeded NEVER get disclaimers - data is verified
      if (confidence < MIN_CONFIDENCE_FOR_ENHANCEMENTS && truthType !== 'PERMANENT' && !externalLookupSucceeded) {
        this.logger.log(
          `Eli: Confidence too low (${confidence.toFixed(2)}), limiting enhancements`,
        );

        enhancedResponse =
          response +
          "\n\n**Note:** My confidence in this analysis is lower than ideal. Please verify these suggestions independently and consider seeking additional expert input.";

        return {
          enhancedResponse: enhancedResponse,
          personality: "eli",
          analysisApplied: {},
          modificationsCount: 1,
          reasoningApplied: true,
          confidenceLimited: true,
          reason: "Added uncertainty note due to low confidence",
        };
      } else if ((confidence < MIN_CONFIDENCE_FOR_ENHANCEMENTS && truthType === 'PERMANENT') || externalLookupSucceeded) {
        this.logger.log(
          `Eli: Low confidence (${confidence.toFixed(2)}) but ${truthType === 'PERMANENT' ? 'PERMANENT truth type' : 'external lookup succeeded'} - no disclaimer needed`,
        );
        // Skip adding disclaimer for PERMANENT facts or successful external lookups
      }

      // ========== PROCEED WITH NORMAL ANALYSIS ==========
      this.logger.log("Applying Eli analytical framework...");

      const analysisApplied = {
        risksIdentified: [],
        assumptionsChallenged: [],
        downsideScenarios: [],
        survivalMetrics: null,
        blindSpotsFound: [],
        alternativesProvided: [],
        confidenceAssessment: null,
      };
      let modificationsCount = 0;

      // Gate analytical blocks for PERMANENT low-stakes facts
      const shouldAddAnalyticalBlocks = truthType !== 'PERMANENT' || isHighStakes;

      // Gate decision-support sections (risks, blind spots) for queries that need them
      const needsDecisionSupport = requiresDecisionSupport(query, analysis, context);

      // STEP 1: Identify risks not mentioned in response
      // ONLY add risk analysis if query involves decision-making or high-stakes domains
      if (shouldAddAnalyticalBlocks && needsDecisionSupport) {
        const risks = this.#identifyRisks(response, analysis, context);
        if (risks.length > 0) {
          analysisApplied.risksIdentified = risks;
          enhancedResponse = this.#enhanceWithRiskAnalysis(
            enhancedResponse,
            risks,
          );
          modificationsCount++;
          this.logger.log(`Identified ${risks.length} unmentioned risks`);
        }
      } else if (!needsDecisionSupport) {
        this.logger.log('Skipping risk analysis - query does not require decision support');
      } else {
        this.logger.log('Skipping analytical blocks for PERMANENT low-stakes fact');
      }

      // STEP 2: Extract and challenge assumptions
      // ONLY for decision-support queries
      if (shouldAddAnalyticalBlocks && needsDecisionSupport) {
        const assumptions = this.#extractAssumptions(response, analysis);
        if (assumptions.length > 0) {
          analysisApplied.assumptionsChallenged = assumptions;
          enhancedResponse = this.#enhanceWithAssumptionChallenges(
            enhancedResponse,
            assumptions,
          );
          modificationsCount++;
          this.logger.log(`Challenged ${assumptions.length} assumptions`);
        }
      }

      // STEP 3: Model downside scenarios (especially for business/decision queries)
      if (
        shouldAddAnalyticalBlocks &&
        (analysis.intent === "decision_making" ||
        analysis.domain === "business" ||
        mode === "business_validation")
      ) {
        const downsides = this.#modelDownsideScenarios(
          response,
          analysis,
          context,
        );
        if (downsides.length > 0) {
          analysisApplied.downsideScenarios = downsides;
          enhancedResponse = this.#enhanceWithDownsideScenarios(
            enhancedResponse,
            downsides,
          );
          modificationsCount++;
          this.logger.log(`Modeled ${downsides.length} downside scenarios`);
        }
      }

      // STEP 4: Calculate survival metrics (business validation mode)
      if (shouldAddAnalyticalBlocks && (mode === "business_validation" || mode === "site_monkeys")) {
        const survivalCheck = this.#validateBusinessSurvival(response, mode);
        if (!survivalCheck.compliant) {
          const metrics = this.#calculateSurvivalMetrics(
            response,
            mode,
            context,
          );
          analysisApplied.survivalMetrics = metrics;
          enhancedResponse = this.#enhanceWithSurvivalMetrics(
            enhancedResponse,
            metrics,
          );
          modificationsCount++;
          this.logger.log("Added survival metrics analysis");
        }
      }

      // STEP 5: Identify blind spots (what user hasn't considered)
      // ONLY for decision-support queries
      if (shouldAddAnalyticalBlocks && needsDecisionSupport) {
        const blindSpots = this.#findBlindSpots(response, analysis, context);
        if (blindSpots.length > 0) {
          analysisApplied.blindSpotsFound = blindSpots;
          enhancedResponse = this.#enhanceWithBlindSpots(
            enhancedResponse,
            blindSpots,
          );
          modificationsCount++;
          this.logger.log(`Found ${blindSpots.length} potential blind spots`);
        }
      }

      // STEP 6: Provide alternatives (if appropriate)
      if (shouldAddAnalyticalBlocks && (analysis.complexity > 0.7 || analysis.intent === "problem_solving")) {
        const alternatives = this.#enhanceWithAlternatives(
          enhancedResponse,
          analysis,
          context,
        );
        if (alternatives.added) {
          analysisApplied.alternativesProvided = alternatives.alternatives;
          enhancedResponse = alternatives.enhanced;
          modificationsCount++;
          this.logger.log("Added alternative approaches");
        }
      }

      // STEP 7: Add confidence scoring (if not present)
      // Skip confidence assessment for simple PERMANENT factual queries
      const isSimpleFact = truthType === 'PERMANENT' && isSimpleFactualQuery(query);
      if (!response.toLowerCase().includes("confidence") && !isSimpleFact) {
        const confidenceAssessment = this.#enhanceWithConfidenceScoring(
          enhancedResponse,
          analysis,
        );
        analysisApplied.confidenceAssessment = confidenceAssessment.assessment;
        enhancedResponse = confidenceAssessment.enhanced;
        modificationsCount++;
        this.logger.log("Added confidence assessment");
      } else if (isSimpleFact) {
        this.logger.log('Skipping confidence assessment for simple PERMANENT fact');
      }

      // STEP 8: Apply Eli's protective intelligence signature
      enhancedResponse = this.#applyEliSignature(
        enhancedResponse,
        modificationsCount,
      );

      this.logger.log(
        `Eli analysis complete: ${modificationsCount} enhancements applied`,
      );

      return {
        enhancedResponse: enhancedResponse,
        personality: "eli",
        analysisApplied: analysisApplied,
        modificationsCount: modificationsCount,
        reasoningApplied: true,
      };
    } catch (error) {
      this.logger.error("Eli framework failed", error);

      return {
        enhancedResponse: `🍌 **Eli:** ${response}`,
        personality: "eli",
        analysisApplied: {},
        modificationsCount: 0,
        reasoningApplied: false,
        error: error.message,
      };
    }
  }

  // ==================== ANALYSIS METHODS ====================

  #identifyRisks(response, analysis, context) {
    const risks = [];

    try {
      const responseLower = response.toLowerCase();

      // Business domain risks
      if (analysis.domain === "business") {
        if (
          !responseLower.includes("cash flow") &&
          !responseLower.includes("runway")
        ) {
          risks.push({
            type: "financial",
            risk: "Cash flow impact not addressed",
            severity: "high",
            why: "Business decisions always have cash flow implications",
          });
        }

        if (!responseLower.includes("compet") && analysis.complexity > 0.5) {
          risks.push({
            type: "market",
            risk: "Competitive response not considered",
            severity: "medium",
            why: "Market changes when you act - competitors react",
          });
        }

        if (
          context.sources?.hasVault &&
          !responseLower.includes("operational")
        ) {
          risks.push({
            type: "operational",
            risk: "Operational capacity constraints",
            severity: "medium",
            why: "Execution capacity often limits what sounds good in theory",
          });
        }
      }

      // Technical domain risks
      if (analysis.domain === "technical") {
        if (
          !responseLower.includes("secur") &&
          !responseLower.includes("privacy")
        ) {
          risks.push({
            type: "security",
            risk: "Security implications not discussed",
            severity: "high",
            why: "Technical changes often create security vulnerabilities",
          });
        }

        if (
          !responseLower.includes("maintain") &&
          !responseLower.includes("technical debt")
        ) {
          risks.push({
            type: "maintenance",
            risk: "Long-term maintenance burden",
            severity: "medium",
            why: "What you build today, you maintain forever",
          });
        }
      }

      // Financial domain risks
      if (analysis.domain === "financial") {
        if (!responseLower.includes("tax") && analysis.complexity > 0.6) {
          risks.push({
            type: "tax",
            risk: "Tax implications not addressed",
            severity: "high",
            why: "Financial decisions often have significant tax consequences",
          });
        }

        if (!responseLower.includes("liquidity")) {
          risks.push({
            type: "liquidity",
            risk: "Liquidity constraints",
            severity: "medium",
            why: "Having money on paper ≠ having accessible cash",
          });
        }
      }

      // Decision-making intent risks
      if (analysis.intent === "decision_making") {
        if (
          !responseLower.includes("reversib") &&
          !responseLower.includes("undo")
        ) {
          risks.push({
            type: "reversibility",
            risk: "Reversibility of decision not discussed",
            severity: "medium",
            why: "Some doors close behind you - important to know which",
          });
        }

        if (
          !responseLower.includes("timeline") &&
          !responseLower.includes("deadline")
        ) {
          risks.push({
            type: "timing",
            risk: "Time pressure and deadlines",
            severity: "low",
            why: "Timing often determines whether a good idea succeeds",
          });
        }
      }

      return risks;
    } catch (error) {
      this.logger.error("Risk identification failed", error);
      return [];
    }
  }

  #extractAssumptions(response, analysis) {
    const assumptions = [];

    try {
      const responseLower = response.toLowerCase();

      const assumptionPatterns = [
        {
          pattern: /\bshould\b/gi,
          assumption: "Assumes a particular outcome is desirable",
        },
        {
          pattern: /\bwill\b/gi,
          assumption:
            "Assumes future certainty (things rarely go exactly as planned)",
        },
        {
          pattern: /\busually\b/gi,
          assumption: "Assumes typical patterns apply to this specific case",
        },
        {
          pattern: /\bmost\b/gi,
          assumption: "Assumes majority behavior applies to this situation",
        },
        {
          pattern: /\bgenerally\b/gi,
          assumption: "Assumes general rules apply without exception",
        },
        {
          pattern: /\bsimply\b/gi,
          assumption: "Assumes simplicity (execution is often more complex)",
        },
        {
          pattern: /\bjust\b/gi,
          assumption: "Minimizes complexity or effort required",
        },
      ];

      for (const { pattern, assumption } of assumptionPatterns) {
        const matches = response.match(pattern);
        if (matches && matches.length > 0) {
          assumptions.push({
            word: matches[0],
            assumption: assumption,
            instances: matches.length,
            challenge:
              "This assumes conditions that may not hold true in your specific situation",
          });
        }
      }

      // Domain-specific assumptions
      if (analysis.domain === "business") {
        if (
          responseLower.includes("scale") &&
          !responseLower.includes("constraint")
        ) {
          assumptions.push({
            word: "scale",
            assumption: "Assumes scalability without addressing constraints",
            challenge: "Scaling often reveals hidden bottlenecks",
          });
        }

        if (
          responseLower.includes("grow") &&
          !responseLower.includes("sustain")
        ) {
          assumptions.push({
            word: "growth",
            assumption: "Assumes growth is always positive",
            challenge: "Unmanaged growth can destroy profitable businesses",
          });
        }
      }

      return assumptions.filter(
        (a) =>
          a.instances > 1 ||
          a.assumption.includes("certainty") ||
          a.assumption.includes("Assumes"),
      );
    } catch (error) {
      this.logger.error("Assumption extraction failed", error);
      return [];
    }
  }

  #modelDownsideScenarios(response, analysis, context) {
    const scenarios = [];

    try {
      if (analysis.complexity < 0.5) {
        return scenarios;
      }

      // Business downside scenarios
      if (analysis.domain === "business") {
        scenarios.push({
          scenario: "Market Rejection",
          description: "Customers don't adopt at expected rate",
          probability: "Medium (40-50% of new initiatives)",
          impact: "High - Sunk costs without revenue",
          mitigation:
            "Start with minimum viable version, get real customer feedback before scaling",
        });

        if (context.sources?.hasVault) {
          scenarios.push({
            scenario: "Operational Overload",
            description: "Success exceeds capacity to deliver quality",
            probability: "Medium (if successful)",
            impact: "High - Reputation damage, customer churn",
            mitigation: "Build operational capacity before marketing push",
          });
        }

        scenarios.push({
          scenario: "Cash Flow Crunch",
          description: "Timing gap between investment and revenue",
          probability: "High (70%+ for growth initiatives)",
          impact:
            "Critical - Can force business closure even if profitable on paper",
          mitigation: "Model cash flow monthly, maintain 6-month runway buffer",
        });
      }

      // Technical downside scenarios
      if (analysis.domain === "technical") {
        scenarios.push({
          scenario: "Technical Debt Accumulation",
          description: "Quick solution creates long-term maintenance burden",
          probability: "Very High (85%+ for rushed implementations)",
          impact: "Medium - Slows future development",
          mitigation: "Document decisions, allocate 20% time for refactoring",
        });

        scenarios.push({
          scenario: "Integration Failure",
          description: "New system doesn't integrate as smoothly as expected",
          probability: "Medium-High (60%)",
          impact: "High - Delays and additional development cost",
          mitigation: "Test integration early, have rollback plan",
        });
      }

      // Personal/decision downside scenarios
      if (analysis.intent === "decision_making") {
        scenarios.push({
          scenario: "Opportunity Cost",
          description:
            "Committing to this path means saying no to alternatives",
          probability: "Certain (100% - always true)",
          impact: "Variable - Depends on what alternatives exist",
          mitigation: "Explicitly consider what you're giving up",
        });
      }

      return scenarios;
    } catch (error) {
      this.logger.error("Downside scenario modeling failed", error);
      return [];
    }
  }

  #calculateSurvivalMetrics(response, mode, context) {
    try {
      const metrics = {
        runwayImpact: null,
        burnRateChange: null,
        criticalDependencies: [],
        survivalRisk: "unknown",
      };

      const costPatterns = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
      const costs = [];
      let match;

      while ((match = costPatterns.exec(response)) !== null) {
        costs.push(parseFloat(match[1].replace(/,/g, "")));
      }

      if (costs.length > 0) {
        const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
        const burnRate =
          context.vaultContext?.burnRate ||
          context.businessMetrics?.burnRate ||
          null;

        const runway =
          context.vaultContext?.runway ||
          context.businessMetrics?.runway ||
          null;

        // Only calculate if we have real data
        let runwayImpactMonths = null;
        if (burnRate) {
          runwayImpactMonths = totalCost / burnRate;
        }

        if (burnRate && runway) {
          metrics.runwayImpact = {
            oneTimeCost: totalCost,
            runwayConsumed: `${runwayImpactMonths.toFixed(1)} months of runway`,
            percentageOfRunway: `${((runwayImpactMonths / runway) * 100).toFixed(1)}%`,
            currentBurnRate: `$${burnRate.toLocaleString()}/month`,
            currentRunway: `${runway} months`,
            criticalDate: this.#calculateRunwayDate(runway),
          };
        } else {
          metrics.runwayImpact = {
            oneTimeCost: totalCost,
            dataNeeded: "Survival analysis requires burn rate and runway data",
            message:
              "Provide current monthly burn rate and runway months for accurate impact assessment",
          };
        }

        if (runwayImpactMonths !== null && runway !== null) {
          if (runwayImpactMonths > 2) {
            metrics.survivalRisk = "high";
          } else if (runwayImpactMonths > 1) {
            metrics.survivalRisk = "medium";
          } else {
            metrics.survivalRisk = "low";
          }
        } else {
          metrics.survivalRisk = "unknown - data needed";
        }
      }

      const dependencyIndicators = [
        "require",
        "need",
        "depend",
        "must have",
        "essential",
      ];
      for (const indicator of dependencyIndicators) {
        if (response.toLowerCase().includes(indicator)) {
          const sentences = response.split(/[.!?]+/);
          for (const sentence of sentences) {
            if (sentence.toLowerCase().includes(indicator)) {
              metrics.criticalDependencies.push(sentence.trim());
            }
          }
        }
      }

      return metrics;
    } catch (error) {
      this.logger.error("Survival metrics calculation failed", error);
      return {
        runwayImpact: null,
        burnRateChange: null,
        criticalDependencies: [],
        survivalRisk: "unknown",
      };
    }
  }

  #findBlindSpots(response, analysis, _context) {
    const blindSpots = [];

    try {
      const responseLower = response.toLowerCase();

      if (
        !responseLower.includes("short") &&
        !responseLower.includes("long") &&
        !responseLower.includes("timeline")
      ) {
        blindSpots.push({
          blindSpot: "Time Horizon",
          description: "Short-term vs long-term implications not distinguished",
          why: "What works in 3 months may fail in 3 years, and vice versa",
          question: "What's your time horizon for this decision?",
        });
      }

      if (
        !responseLower.includes("capacity") &&
        !responseLower.includes("bandwidth") &&
        analysis.domain === "business"
      ) {
        blindSpots.push({
          blindSpot: "Resource Constraints",
          description: "No discussion of who does the work and when",
          why: "Good ideas fail when there's no capacity to execute",
          question: "Who has the bandwidth to make this happen?",
        });
      }

      if (
        analysis.complexity > 0.6 &&
        !responseLower.includes("consequence") &&
        !responseLower.includes("ripple") &&
        !responseLower.includes("impact")
      ) {
        blindSpots.push({
          blindSpot: "Second-Order Effects",
          description: "Downstream consequences not explored",
          why: "Actions create reactions - changes ripple through systems",
          question: "What happens after the immediate effect?",
        });
      }

      if (
        !responseLower.includes("team") &&
        !responseLower.includes("people") &&
        !responseLower.includes("stakeholder") &&
        analysis.domain === "business"
      ) {
        blindSpots.push({
          blindSpot: "Stakeholder Impact",
          description: "How this affects people not discussed",
          why: "People execute (or resist) your plans",
          question: "Who will this affect and how will they react?",
        });
      }

      if (
        analysis.intent === "decision_making" &&
        !responseLower.includes("measure") &&
        !responseLower.includes("metric") &&
        !responseLower.includes("know if")
      ) {
        blindSpots.push({
          blindSpot: "Success Measurement",
          description: "No clear criteria for evaluating if this works",
          why: "You can't improve what you don't measure",
          question: "How will you know if this is working?",
        });
      }

      return blindSpots;
    } catch (error) {
      this.logger.error("Blind spot detection failed", error);
      return [];
    }
  }

  // ==================== ENHANCEMENT METHODS ====================

  #enhanceWithRiskAnalysis(response, risks) {
    if (risks.length === 0) return response;

    let enhancement = "\n\n⚠️ **Critical Risks I See:**\n";

    const highRisks = risks.filter((r) => r.severity === "high");
    const mediumRisks = risks.filter((r) => r.severity === "medium");

    if (highRisks.length > 0) {
      enhancement += "\n**High Priority:**\n";
      for (const risk of highRisks) {
        enhancement += `- **${risk.risk}** - ${risk.why}\n`;
      }
    }

    if (mediumRisks.length > 0 && mediumRisks.length <= 2) {
      enhancement += "\n**Also Consider:**\n";
      for (const risk of mediumRisks) {
        enhancement += `- ${risk.risk} - ${risk.why}\n`;
      }
    }

    return response + enhancement;
  }

  #enhanceWithAssumptionChallenges(response, assumptions) {
    if (assumptions.length === 0) return response;

    let enhancement = "\n\n🤔 **Assumptions to Challenge:**\n";

    for (const assumption of assumptions.slice(0, 3)) {
      enhancement += `- ${assumption.assumption} - ${assumption.challenge}\n`;
    }

    return response + enhancement;
  }

  #enhanceWithDownsideScenarios(response, downsides) {
    if (downsides.length === 0) return response;

    let enhancement = "\n\n📉 **Downside Scenarios to Model:**\n";

    for (const scenario of downsides.slice(0, 3)) {
      enhancement += `\n**${scenario.scenario}:**\n`;
      enhancement += `- What: ${scenario.description}\n`;
      enhancement += `- Probability: ${scenario.probability}\n`;
      enhancement += `- Mitigation: ${scenario.mitigation}\n`;
    }

    return response + enhancement;
  }

  #enhanceWithSurvivalMetrics(response, metrics) {
    if (!metrics.runwayImpact && metrics.criticalDependencies.length === 0) {
      return response;
    }

    let enhancement = "\n\n💰 **Business Survival Analysis:**\n";

    if (metrics.runwayImpact) {
      enhancement += `- **Runway Impact:** ${metrics.runwayImpact.runwayConsumed} (${metrics.runwayImpact.percentageOfAssumedRunway} of typical 6-month buffer)\n`;
      enhancement += `- **Survival Risk:** ${metrics.survivalRisk.toUpperCase()}\n`;
    }

    if (metrics.criticalDependencies.length > 0) {
      enhancement += `- **Critical Dependencies:** ${metrics.criticalDependencies.length} identified - if any fail, plan fails\n`;
    }

    return response + enhancement;
  }

  #enhanceWithBlindSpots(response, blindSpots) {
    if (blindSpots.length === 0) return response;

    let enhancement = "\n\n🔍 **What We're Not Seeing Yet:**\n";

    for (const spot of blindSpots.slice(0, 3)) {
      enhancement += `\n**${spot.blindSpot}:** ${spot.description}\n`;
      enhancement += `- Why it matters: ${spot.why}\n`;
      enhancement += `- Key question: ${spot.question}\n`;
    }

    return response + enhancement;
  }

  #enhanceWithAlternatives(response, analysis, _context) {
    if (analysis.complexity < 0.7) {
      return { added: false, enhanced: response, alternatives: [] };
    }

    const alternatives = [];

    alternatives.push({
      approach: "Simpler Path",
      description: "Start with minimum viable version to test assumptions",
      tradeoff: "Less impressive initially, but faster learning and lower risk",
    });

    if (analysis.domain === "business" || analysis.domain === "technical") {
      alternatives.push({
        approach: "Phased Implementation",
        description: "Break into stages with validation gates between each",
        tradeoff: "Slower overall, but can course-correct based on learnings",
      });
    }

    if (analysis.intent === "decision_making") {
      alternatives.push({
        approach: "Gather More Data First",
        description:
          "Run small experiment to test key assumptions before committing",
        tradeoff: "Delays action, but reduces risk of expensive mistakes",
      });
    }

    let enhancement = "\n\n🔀 **Alternative Approaches:**\n";
    for (const alt of alternatives) {
      enhancement += `\n**${alt.approach}:** ${alt.description}\n`;
      enhancement += `- Tradeoff: ${alt.tradeoff}\n`;
    }

    return {
      added: true,
      enhanced: response + enhancement,
      alternatives: alternatives,
    };
  }

  #enhanceWithConfidenceScoring(response, analysis) {
    let confidenceLevel = "Medium";
    let reasoning = "";

    if (analysis.complexity < 0.3 && analysis.domainConfidence > 0.8) {
      confidenceLevel = "High (85-95%)";
      reasoning = "Straightforward domain with clear best practices";
    } else if (analysis.complexity > 0.7 || analysis.domainConfidence < 0.5) {
      confidenceLevel = "Low (40-60%)";
      reasoning = "Complex situation with many variables and uncertainties";
    } else {
      confidenceLevel = "Medium (65-80%)";
      reasoning =
        "Solid general guidance, but specifics depend on your context";
    }

    const enhancement = `\n\n🎯 **Confidence Assessment:**\n- **Level:** ${confidenceLevel}\n- **Why:** ${reasoning}\n`;

    return {
      enhanced: response + enhancement,
      assessment: {
        level: confidenceLevel,
        reasoning: reasoning,
      },
    };
  }

  #applyEliSignature(response, modificationsCount) {
    const signature =
      modificationsCount > 0
        ? `🍌 **Eli:** (Analytical framework applied - ${modificationsCount} enhancements)\n\n`
        : `🍌 **Eli:**\n\n`;

    return signature + response;
  }

  // ==================== VALIDATION METHODS ====================

  #validateBusinessSurvival(response, mode) {
    if (mode !== "business_validation" && mode !== "site_monkeys") {
      return { compliant: true };
    }

    const responseLower = response.toLowerCase();
    const missing = [];

    if (!responseLower.includes("risk")) {
      missing.push("risk_analysis");
    }

    if (!responseLower.includes("cash") && !responseLower.includes("runway")) {
      missing.push("cash_flow_analysis");
    }

    if (
      !responseLower.includes("survival") &&
      !responseLower.includes("viable")
    ) {
      missing.push("survival_impact");
    }

    return {
      compliant: missing.length === 0,
      missing: missing,
    };
  }

  #calculateRunwayDate(runwayMonths) {
    const date = new Date();
    date.setMonth(date.getMonth() + runwayMonths);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
