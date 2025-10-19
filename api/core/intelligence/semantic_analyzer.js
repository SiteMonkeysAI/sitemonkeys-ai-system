// /api/core/intelligence/semantic_analyzer.js
// SEMANTIC ANALYZER - Real embedding-based semantic understanding
// Uses OpenAI embeddings for intent/domain classification, not pattern matching

import OpenAI from "openai";
import { driftWatcher } from "../../lib/validators/drift-watcher.js";
import { costTracker } from "../../utils/cost-tracker.js";

export class SemanticAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "sk-dummy-key-for-testing",
    });
    this.embeddingModel = "text-embedding-3-small";
    this.embeddingCache = new Map();
    this.maxCacheSize = 500;

    // Pre-computed category embeddings (computed once at initialization)
    this.categoryEmbeddings = null;
    this.intentEmbeddings = null;
    this.domainEmbeddings = null;

    // Performance tracking
    this.stats = {
      totalAnalyses: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgProcessingTime: 0,
      apiCalls: 0,
      totalCost: 0,
    };

    this.logger = {
      log: (msg) => console.log(`[SEMANTIC] ${msg}`),
      error: (msg, err) => console.error(`[SEMANTIC ERROR] ${msg}`, err),
    };
  }

  // ==================== INITIALIZATION ====================

  async initialize() {
    const initStartTime = Date.now();

    try {
      this.logger.log(
        "Initializing SemanticAnalyzer - pre-computing category embeddings in parallel...",
      );

      // Intent category representative phrases
      const intentPhrases = {
        question: "What is this? How does it work? Can you explain?",
        command: "Please do this. Create that. Build this for me.",
        discussion: "Let's talk about this topic. I want to explore this idea.",
        problem_solving:
          "I have a problem. How do I solve this? I need help fixing this.",
        decision_making:
          "Should I do this or that? What's the best option? Help me choose.",
        emotional_expression:
          "I feel frustrated. I'm excited about this. This worries me.",
        information_sharing:
          "I want to tell you about this. Here's what happened. This is important to know.",
      };

      // Domain representative phrases
      const domainPhrases = {
        business:
          "revenue growth, market strategy, customer acquisition, business model, profitability, scaling operations",
        technical:
          "software development, coding, system architecture, API integration, debugging, technical implementation",
        personal:
          "relationships, family matters, personal growth, social connections, life decisions, personal experiences",
        health:
          "medical concerns, wellness, fitness, symptoms, healthcare, mental health, physical wellbeing",
        financial:
          "money management, investments, budgeting, financial planning, savings, debt, income",
        creative:
          "artistic projects, creative writing, design work, creative problem solving, artistic expression",
        general:
          "everyday questions, general knowledge, casual conversation, various topics, common inquiries",
      };

      // Configurable timeout (default 20 seconds, can be overridden via environment variable)
      const timeoutMs = parseInt(
        process.env.SEMANTIC_INIT_TIMEOUT_MS || "20000",
        10,
      );

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Embedding initialization timeout after ${timeoutMs}ms`,
              ),
            ),
          timeoutMs,
        ),
      );

      // Create parallel embedding computation promise
      const embeddingPromise = (async () => {
        // Launch all embedding computations in parallel
        const intentPromises = Object.entries(intentPhrases).map(
          async ([intent, phrase]) => {
            const embedding = await this.#getEmbedding(phrase);
            this.logger.log(`✓ Pre-computed embedding for intent: ${intent}`);
            return [intent, embedding];
          },
        );

        const domainPromises = Object.entries(domainPhrases).map(
          async ([domain, phrase]) => {
            const embedding = await this.#getEmbedding(phrase);
            this.logger.log(`✓ Pre-computed embedding for domain: ${domain}`);
            return [domain, embedding];
          },
        );

        // Wait for all embeddings to complete in parallel
        this.logger.log(
          `Computing ${intentPromises.length + domainPromises.length} embeddings in parallel...`,
        );
        const [intentResults, domainResults] = await Promise.all([
          Promise.all(intentPromises),
          Promise.all(domainPromises),
        ]);

        // Store results
        this.intentEmbeddings = Object.fromEntries(intentResults);
        this.domainEmbeddings = Object.fromEntries(domainResults);

        return true;
      })();

      // Race between embedding computation and timeout
      await Promise.race([embeddingPromise, timeoutPromise]);

      const initTime = Date.now() - initStartTime;
      this.logger.log(
        `✅ SemanticAnalyzer initialization complete in ${initTime}ms`,
      );
      return true;
    } catch (error) {
      const initTime = Date.now() - initStartTime;

      if (error.message.includes("timeout")) {
        this.logger.error(
          `⚠️ Initialization timed out after ${initTime}ms - entering fallback mode`,
          error,
        );
      } else {
        this.logger.error(
          `⚠️ Initialization failed after ${initTime}ms - entering fallback mode`,
          error,
        );
      }

      // Set empty embeddings to allow system to continue in fallback mode
      this.intentEmbeddings = {
        question: new Array(1536).fill(0),
        command: new Array(1536).fill(0),
        discussion: new Array(1536).fill(0),
        problem_solving: new Array(1536).fill(0),
        decision_making: new Array(1536).fill(0),
        emotional_expression: new Array(1536).fill(0),
        information_sharing: new Array(1536).fill(0),
      };

      this.domainEmbeddings = {
        business: new Array(1536).fill(0),
        technical: new Array(1536).fill(0),
        personal: new Array(1536).fill(0),
        health: new Array(1536).fill(0),
        financial: new Array(1536).fill(0),
        creative: new Array(1536).fill(0),
        general: new Array(1536).fill(0),
      };

      this.logger.log(
        "🔄 System will continue with degraded semantic analysis (fallback mode)",
      );

      // Return true to allow system to continue - fallback analysis will be used
      return true;
    }
  }

  // ==================== MAIN ANALYSIS METHOD ====================

  async analyzeSemantics(query, context = {}) {
    const startTime = Date.now();

    try {
      this.logger.log(`Analyzing: "${query.substring(0, 50)}..."`);

      // STEP 1: Get embedding for query
      const queryEmbedding = await this.#getEmbedding(query);
      const cacheHit = this.embeddingCache.has(query);

      // STEP 2: Classify intent using semantic similarity
      const intentResult = await this.#classifyIntent(queryEmbedding);

      // STEP 3: Classify domain using semantic similarity
      const domainResult = await this.#classifyDomain(queryEmbedding);

      // STEP 4: Calculate complexity (multi-factor)
      const complexityResult = await this.#calculateComplexity(
        query,
        queryEmbedding,
      );

      // STEP 5: Detect emotional tone
      const emotionalResult = await this.#detectEmotionalTone(
        query,
        queryEmbedding,
      );

      // STEP 6: Detect context signals
      const contextSignals = this.#detectContextSignals(
        query,
        queryEmbedding,
        context,
      );

      // STEP 7: Determine reasoning needs
      const reasoningNeeds = this.#assessReasoningNeeds(
        query,
        queryEmbedding,
        intentResult,
      );

      // STEP 8: Track performance (EXISTING)
      const processingTime = Date.now() - startTime;
      const cost = cacheHit ? 0 : 0.00002 * (query.length / 4000);
      this.#trackPerformance(startTime, cacheHit);

      // ========== BUILD SEMANTIC RESULT (NEW) ==========
      const semanticResult = {
        intent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        domain: domainResult.domain,
        domainConfidence: domainResult.confidence,
        complexity: complexityResult.overall,
        complexityFactors: complexityResult.factors,
        emotionalTone: emotionalResult.tone,
        emotionalWeight: emotionalResult.weight,
        personalContext: contextSignals.personal,
        temporalContext: contextSignals.temporal,
        requiresMemory: contextSignals.needsMemory,
        requiresCalculation: reasoningNeeds.calculation,
        requiresComparison: reasoningNeeds.comparison,
        requiresCreativity: reasoningNeeds.creativity,
        queryEmbedding: queryEmbedding,
        processingTime: processingTime,
        cacheHit: cacheHit,
        cost: cost,
      };

      // ========== DRIFT VALIDATION (NEW) ==========
      const driftCheck = await driftWatcher.validate({
        semanticAnalysis: semanticResult,
        response: "",
        context: context,
      });

      if (driftCheck.driftDetected) {
        this.logger.log(`Drift detected - adjusting confidence`);

        if (driftCheck.confidenceAdjustment) {
          semanticResult.intentConfidence = Math.min(
            semanticResult.intentConfidence,
            driftCheck.confidenceAdjustment.to,
          );
          semanticResult.domainConfidence = Math.min(
            semanticResult.domainConfidence,
            driftCheck.confidenceAdjustment.to,
          );
        }

        if (!driftCheck.domainValid) {
          semanticResult.domain = "general";
          semanticResult.domainConfidence = 0.5;
        }

        if (!driftCheck.intentValid) {
          semanticResult.intent = "question";
          semanticResult.intentConfidence = 0.5;
        }

        semanticResult.driftWarning = driftCheck.warning;
      }

      // ========== REAL COST TRACKING (NEW) ==========
      if (context.sessionId && cost > 0) {
        await costTracker.recordCost(
          context.sessionId,
          cost,
          "semantic_analysis",
          {
            mode: context.mode,
            cacheHit: cacheHit,
          },
        );
      }

      this.logger.log(
        `Analysis complete: Intent=${semanticResult.intent} (${semanticResult.intentConfidence.toFixed(2)}), Domain=${semanticResult.domain} (${semanticResult.domainConfidence.toFixed(2)}), Time=${processingTime}ms`,
      );

      return semanticResult;
    } catch (error) {
      this.logger.error("Semantic analysis failed", error);

      // Return degraded analysis (basic heuristics as fallback)
      return this.#generateFallbackAnalysis(query, context);
    }
  }

  // ==================== CORE EMBEDDING METHODS ====================

  async #getEmbedding(text) {
    try {
      // Check cache first
      const cached = this.#getCachedEmbedding(text);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }

      this.stats.cacheMisses++;
      this.stats.apiCalls++;

      // Call OpenAI Embeddings API
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text.substring(0, 8000), // API limit: 8191 tokens
        encoding_format: "float",
      });

      const embedding = response.data[0].embedding;

      // Cache the result
      this.#cacheEmbedding(text, embedding);

      // Update cost tracking
      const tokens = response.usage.total_tokens;
      this.stats.totalCost += (tokens / 1000) * 0.00002;

      return embedding;
    } catch (error) {
      this.logger.error("Embedding generation failed", error);

      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  #cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  // ==================== CLASSIFICATION METHODS ====================

  async #classifyIntent(queryEmbedding) {
    try {
      const intentCategories = {
        question: this.intentEmbeddings.question,
        command: this.intentEmbeddings.command,
        discussion: this.intentEmbeddings.discussion,
        problem_solving: this.intentEmbeddings.problem_solving,
        decision_making: this.intentEmbeddings.decision_making,
        emotional_expression: this.intentEmbeddings.emotional_expression,
        information_sharing: this.intentEmbeddings.information_sharing,
      };

      let maxSimilarity = -1;
      let bestIntent = "question";

      for (const [intent, intentEmbedding] of Object.entries(
        intentCategories,
      )) {
        const similarity = this.#cosineSimilarity(
          queryEmbedding,
          intentEmbedding,
        );

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestIntent = intent;
        }
      }

      const confidence = Math.max(0, Math.min(1, (maxSimilarity + 1) / 2));

      return {
        intent: bestIntent,
        confidence: confidence,
      };
    } catch (error) {
      this.logger.error("Intent classification failed", error);
      return {
        intent: "question",
        confidence: 0.5,
      };
    }
  }

  async #classifyDomain(queryEmbedding) {
    try {
      const domainCategories = {
        business: this.domainEmbeddings.business,
        technical: this.domainEmbeddings.technical,
        personal: this.domainEmbeddings.personal,
        health: this.domainEmbeddings.health,
        financial: this.domainEmbeddings.financial,
        creative: this.domainEmbeddings.creative,
        general: this.domainEmbeddings.general,
      };

      let maxSimilarity = -1;
      let bestDomain = "general";

      for (const [domain, domainEmbedding] of Object.entries(
        domainCategories,
      )) {
        const similarity = this.#cosineSimilarity(
          queryEmbedding,
          domainEmbedding,
        );

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestDomain = domain;
        }
      }

      const confidence = Math.max(0, Math.min(1, (maxSimilarity + 1) / 2));

      return {
        domain: bestDomain,
        confidence: confidence,
      };
    } catch (error) {
      this.logger.error("Domain classification failed", error);
      return {
        domain: "general",
        confidence: 0.5,
      };
    }
  }

  // ==================== COMPLEXITY CALCULATION ====================

  async #calculateComplexity(query, queryEmbedding) {
    try {
      const factors = {};

      // Factor 1: Conceptual depth
      const words = query.split(/\s+/);
      const avgWordLength =
        words.reduce((sum, w) => sum + w.length, 0) / words.length;
      factors.conceptualDepth = Math.min(avgWordLength / 10, 1.0);

      // Factor 2: Interdependencies
      const questionMarks = (query.match(/\?/g) || []).length;
      const conjunctions = (
        query.match(/\b(and|or|but|however|therefore|because)\b/gi) || []
      ).length;
      factors.interdependencies = Math.min(
        (questionMarks + conjunctions) / 5,
        1.0,
      );

      // Factor 3: Ambiguity
      const ambiguousTerms = (
        query.match(
          /\b(maybe|might|could|possibly|probably|somewhat|kind of)\b/gi,
        ) || []
      ).length;
      factors.ambiguity = Math.min(ambiguousTerms / 3, 1.0);

      // Factor 4: Expertise required
      if (this.domainEmbeddings && this.domainEmbeddings.technical) {
        const technicalSimilarity = this.#cosineSimilarity(
          queryEmbedding,
          this.domainEmbeddings.technical,
        );
        factors.expertiseRequired = technicalSimilarity > 0.6;
      } else {
        factors.expertiseRequired = false;
      }

      // Overall complexity
      const overall =
        factors.conceptualDepth * 0.3 +
        factors.interdependencies * 0.3 +
        factors.ambiguity * 0.2 +
        (factors.expertiseRequired ? 0.2 : 0);

      return {
        overall: Math.min(overall, 1.0),
        factors: factors,
      };
    } catch (error) {
      this.logger.error("Complexity calculation failed", error);
      return {
        overall: 0.5,
        factors: {
          conceptualDepth: 0.5,
          interdependencies: 0,
          ambiguity: 0,
          expertiseRequired: false,
        },
      };
    }
  }

  // ==================== EMOTIONAL TONE DETECTION ====================

  async #detectEmotionalTone(query, queryEmbedding) {
    try {
      const toneReferences = {
        positive:
          "I'm excited, this is great, feeling happy, wonderful news, so glad",
        negative:
          "I'm frustrated, this is terrible, feeling sad, bad news, disappointed",
        urgent:
          "need immediately, critical, emergency, right now, asap, urgent",
        anxious:
          "I'm worried, concerned about, nervous, afraid, stressed, uncertain",
        neutral:
          "information please, looking into, considering, checking on, wondering",
      };

      let maxSimilarity = -1;
      let detectedTone = "neutral";

      for (const [tone, phrase] of Object.entries(toneReferences)) {
        const toneEmbedding = await this.#getEmbedding(phrase);
        const similarity = this.#cosineSimilarity(
          queryEmbedding,
          toneEmbedding,
        );

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          detectedTone = tone;
        }
      }

      const weight = Math.max(0, Math.min(1, (maxSimilarity + 1) / 2));

      return {
        tone: detectedTone,
        weight: weight,
      };
    } catch (error) {
      this.logger.error("Emotional tone detection failed", error);
      return {
        tone: "neutral",
        weight: 0,
      };
    }
  }

  // ==================== CONTEXT SIGNAL DETECTION ====================

  #detectContextSignals(query, queryEmbedding, context) {
    try {
      // Personal context signals
      const personalIndicators = /\b(my|mine|I|me|personal|private|family)\b/i;
      const personal = personalIndicators.test(query);

      // Temporal context
      let temporal = "general";
      if (/\b(now|today|currently|right now|immediate)\b/i.test(query)) {
        temporal = "immediate";
      } else if (/\b(recently|lately|this week|past few|last)\b/i.test(query)) {
        temporal = "recent";
      } else if (
        /\b(future|later|eventually|someday|planning)\b/i.test(query)
      ) {
        temporal = "future";
      }

      // Memory requirement signals
      const memoryIndicators =
        /\b(remember|recall|told you|mentioned before|we discussed|last time)\b/i;
      const needsMemory =
        memoryIndicators.test(query) || (personal && context.availableMemory);

      return {
        personal: personal,
        temporal: temporal,
        needsMemory: needsMemory,
      };
    } catch (error) {
      this.logger.error("Context signal detection failed", error);
      return {
        personal: false,
        temporal: "general",
        needsMemory: false,
      };
    }
  }

  // ==================== REASONING NEEDS ASSESSMENT ====================

  #assessReasoningNeeds(query, queryEmbedding, intentResult) {
    try {
      // Calculation indicators
      const calculationPatterns =
        /\b(calculate|compute|how much|total|sum|average|cost|price|\d+)\b/i;
      const requiresCalculation =
        calculationPatterns.test(query) && /\d/.test(query);

      // Comparison indicators
      const comparisonPatterns =
        /\b(compare|versus|vs|better|worse|difference|which|between)\b/i;
      const requiresComparison = comparisonPatterns.test(query);

      // Creativity indicators
      const creativityPatterns =
        /\b(create|design|imagine|innovative|new idea|brainstorm|creative)\b/i;
      const requiresCreativity =
        creativityPatterns.test(query) || intentResult.intent === "discussion";

      return {
        calculation: requiresCalculation,
        comparison: requiresComparison,
        creativity: requiresCreativity,
      };
    } catch (error) {
      this.logger.error("Reasoning needs assessment failed", error);
      return {
        calculation: false,
        comparison: false,
        creativity: false,
      };
    }
  }

  // ==================== CACHING ====================

  #cacheEmbedding(text, embedding) {
    try {
      if (this.embeddingCache.size >= this.maxCacheSize) {
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }

      this.embeddingCache.set(text, embedding);
    } catch (error) {
      this.logger.error("Cache write failed", error);
    }
  }

  #getCachedEmbedding(text) {
    return this.embeddingCache.get(text) || null;
  }

  // ==================== PERFORMANCE TRACKING ====================

  #trackPerformance(startTime, _cacheHit) {
    this.stats.totalAnalyses++;

    const processingTime = Date.now() - startTime;
    const count = this.stats.totalAnalyses;
    this.stats.avgProcessingTime =
      (this.stats.avgProcessingTime * (count - 1) + processingTime) / count;
  }

  getStats() {
    return {
      ...this.stats,
      cacheHitRate:
        this.stats.totalAnalyses > 0
          ? this.stats.cacheHits / this.stats.totalAnalyses
          : 0,
      avgCostPerQuery:
        this.stats.totalAnalyses > 0
          ? this.stats.totalCost / this.stats.totalAnalyses
          : 0,
    };
  }

  // ==================== FALLBACK ANALYSIS ====================

  #generateFallbackAnalysis(query, _context) {
    this.logger.error(
      "Using fallback analysis due to semantic analysis failure",
    );

    return {
      intent: query.includes("?") ? "question" : "command",
      intentConfidence: 0.3,
      domain: "general",
      domainConfidence: 0.3,
      complexity: 0.5,
      complexityFactors: {
        conceptualDepth: 0.5,
        interdependencies: 0,
        ambiguity: 0,
        expertiseRequired: false,
      },
      emotionalTone: "neutral",
      emotionalWeight: 0,
      personalContext: /\b(my|I|me)\b/i.test(query),
      temporalContext: "general",
      requiresMemory: false,
      requiresCalculation: /\d/.test(query),
      requiresComparison: /\b(vs|versus|compare)\b/i.test(query),
      requiresCreativity: false,
      queryEmbedding: null,
      processingTime: 0,
      cacheHit: false,
      cost: 0,
      fallbackUsed: true,
      driftWarning: "Fallback analysis used - semantic analyzer unavailable",
    };
  }
}
