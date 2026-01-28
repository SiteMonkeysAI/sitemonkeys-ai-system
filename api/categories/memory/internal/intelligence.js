// ================================================================
// intelligence.js - Unified Intelligence Processing Engine
// Consolidates routing_intelligence.js + extraction_engine.js + intelligence from deleted files
// ================================================================

import coreSystem from "./core.js";

class IntelligenceSystem {
  constructor() {
    this.coreSystem = coreSystem;
    this.isInitialized = false;

    // ================================================================
    // ISSUE #406 FIX: Module-level constants for content detection
    // ================================================================
    
    // Financial content keywords (lowercase for case-insensitive matching)
    this.FINANCIAL_KEYWORDS = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'stock', 'stocks', 'market', 'price', 'trading', 'investment'];
    
    // News/general content keywords (lowercase for case-insensitive matching)
    this.NEWS_KEYWORDS = ['news', 'stories', 'headlines', 'weather', 'forecast', 'temperature', 'current events', 'breaking'];

    // ================================================================
    // UNIFIED SEMANTIC ANALYSIS ENGINE
    // ================================================================

    this.intentPatterns = {
      memory_recall: {
        patterns: [
          /\b(remember|recall|told you|mentioned|discussed|said before|talked about)\b/i,
          /\b(you know|as I said|like I mentioned|previously discussed)\b/i,
        ],
        weight: 0.9,
      },
      information_request: {
        patterns: [
          /\b(what|how|when|where|why|who|which|tell me|show me|explain)\b/i,
          /\?/,
          /\b(can you|could you|would you|do you know)\b/i,
        ],
        weight: 0.7,
      },
      personal_sharing: {
        patterns: [
          /\b(my |our |i have|i own|we have|we own|i am|we are)\b/i,
          /\b(personal|private|family)\b/i,
        ],
        weight: 0.8,
      },
      problem_solving: {
        patterns: [
          /\b(problem|issue|trouble|difficulty|challenge|stuck|help|solve|fix)\b/i,
          /\b(how do i|how can i|what should i|need help)\b/i,
        ],
        weight: 0.85,
      },
      emotional_expression: {
        patterns: [
          /\b(feel|feeling|felt|emotion|emotional|mood)\b/i,
          /\b(happy|sad|angry|worried|excited|frustrated|anxious|stressed)\b/i,
        ],
        weight: 0.75,
      },
      decision_making: {
        patterns: [
          /\b(should i|which|decision|decide|choice|choose|option|options)\b/i,
          /\b(thinking about|considering|wondering if|unsure)\b/i,
        ],
        weight: 0.7,
      },
    };

    // ================================================================
    // ADVANCED CATEGORY ROUTING SYSTEM
    // ================================================================

    this.categoryMappings = new Map([
      [
        "mental_emotional",
        {
          keywords: new Set([
            "stress",
            "stressed",
            "anxious",
            "anxiety",
            "worried",
            "worry",
            "feel",
            "feeling",
            "felt",
            "emotion",
            "emotional",
            "mood",
            "mental",
            "psychology",
            "therapy",
            "counseling",
            "identity",
            "self-talk",
            "mindset",
            "attitude",
            "perspective",
            "overwhelmed",
            "depressed",
            "depression",
            "bipolar",
            "panic",
            "fear",
            "confidence",
            "self-esteem",
          ]),
          patterns: [
            /\b(i feel|feeling|stressed|worried|anxious|emotional|mood|mental health|self-talk|overwhelmed)\b/i,
            /\b(therapy|counseling|psychology|mindset|attitude|perspective|identity)\b/i,
            /\b(depressed|depression|panic|fear|confidence|self-esteem|self-worth)\b/i,
          ],
          weight: 1.0,
          priority: "high",
        },
      ],

      [
        "health_wellness",
        {
          keywords: new Set([
            "health",
            "healthy",
            "medical",
            "doctor",
            "physician",
            "symptom",
            "symptoms",
            "pain",
            "illness",
            "sick",
            "disease",
            "medication",
            "medicine",
            "treatment",
            "diagnosis",
            "fitness",
            "exercise",
            "workout",
            "gym",
            "diet",
            "nutrition",
            "food",
            "eating",
            "sleep",
            "sleeping",
            "tired",
            "fatigue",
            "energy",
            "hospital",
            "clinic",
          ]),
          patterns: [
            /\b(health|medical|doctor|symptom|pain|illness|medication|fitness|exercise)\b/i,
            /\b(diet|nutrition|sleep|energy|hospital|clinic|treatment|diagnosis)\b/i,
            /\b(workout|gym|physical|body|weight|wellness)\b/i,
          ],
          weight: 1.0,
          priority: "high",
        },
      ],

      [
        "relationships_social",
        {
          keywords: new Set([
            "family",
            "spouse",
            "husband",
            "wife",
            "partner",
            "relationship",
            "marriage",
            "married",
            "boyfriend",
            "girlfriend",
            "children",
            "child",
            "kids",
            "son",
            "daughter",
            "parents",
            "mother",
            "father",
            "mom",
            "dad",
            "friend",
            "friends",
            "social",
            "friendship",
            "colleague",
            "coworker",
            "conflict",
            "argument",
            "communication",
            "love",
            "dating",
            "divorce",
            "breakup",
            "reunion",
            "pets",
            "pet",
            "dog",
            "cat",
          ]),
          patterns: [
            /\b(family|spouse|husband|wife|partner|relationship|marriage|children|kids)\b/i,
            /\b(parents|mother|father|mom|dad|friend|social|dating|love)\b/i,
            /\b(conflict|argument|communication|divorce|breakup|pets|pet)\b/i,
          ],
          weight: 1.0,
          priority: "high",
        },
      ],

      [
        "work_career",
        {
          keywords: new Set([
            "work",
            "working",
            "job",
            "career",
            "profession",
            "business",
            "company",
            "corporation",
            "office",
            "workplace",
            "project",
            "meeting",
            "boss",
            "manager",
            "supervisor",
            "employee",
            "colleague",
            "coworker",
            "team",
            "department",
            "salary",
            "wage",
            "pay",
            "promotion",
            "performance",
            "deadline",
            "client",
            "customer",
            "interview",
          ]),
          patterns: [
            /\b(work|job|career|business|company|office|project|meeting|boss)\b/i,
            /\b(employee|colleague|team|salary|promotion|performance|deadline|client)\b/i,
            /\b(interview|workplace|profession|manager|supervisor)\b/i,
          ],
          weight: 1.0,
          priority: "medium",
        },
      ],

      [
        "money_income_debt",
        {
          keywords: new Set([
            "income",
            "salary",
            "wage",
            "pay",
            "paycheck",
            "earnings",
            "debt",
            "loan",
            "loans",
            "credit",
            "mortgage",
            "payment",
            "payments",
            "bill",
            "bills",
            "owe",
            "owing",
            "financial crisis",
            "money problems",
            "broke",
            "bankruptcy",
            "foreclosure",
          ]),
          patterns: [
            /\b(income|salary|wage|pay|paycheck|earnings|debt|loan|credit)\b/i,
            /\b(mortgage|payment|bill|owe|financial crisis|money problems|broke)\b/i,
            /\b(bankruptcy|foreclosure|financial trouble)\b/i,
          ],
          weight: 1.0,
          priority: "high",
        },
      ],

      [
        "money_spending_goals",
        {
          keywords: new Set([
            "budget",
            "budgeting",
            "spending",
            "spend",
            "purchase",
            "buy",
            "buying",
            "savings",
            "save",
            "saving",
            "financial goals",
            "investment",
            "investing",
            "stocks",
            "portfolio",
            "retirement",
            "wealth",
            "money management",
            "financial planning",
            "emergency fund",
          ]),
          patterns: [
            /\b(budget|spending|purchase|buy|savings|save|financial goals|investment)\b/i,
            /\b(investing|stocks|portfolio|retirement|wealth|money management)\b/i,
            /\b(financial planning|emergency fund|budgeting)\b/i,
          ],
          weight: 1.0,
          priority: "medium",
        },
      ],

      [
        "goals_active_current",
        {
          keywords: new Set([
            "goal",
            "goals",
            "current goal",
            "objective",
            "target",
            "aim",
            "working on",
            "trying to",
            "project",
            "task",
            "deadline",
            "this week",
            "this month",
            "priority",
            "focus",
            "achievement",
            "accomplish",
            "complete",
            "finish",
          ]),
          patterns: [
            /\b(goal|goals|current goal|objective|target|working on|trying to)\b/i,
            /\b(this week|this month|priority|focus|achievement|accomplish)\b/i,
            /\b(complete|finish|deadline|task|project)\b/i,
          ],
          weight: 1.0,
          priority: "medium",
        },
      ],

      [
        "goals_future_dreams",
        {
          keywords: new Set([
            "dream",
            "dreams",
            "someday",
            "future",
            "long-term",
            "vision",
            "aspiration",
            "aspirations",
            "bucket list",
            "hope",
            "wish",
            "want to",
            "plan to",
            "eventually",
            "retirement",
            "legacy",
            "life goals",
            "ambition",
          ]),
          patterns: [
            /\b(dream|someday|future|long-term|vision|aspiration|bucket list)\b/i,
            /\b(hope|wish|want to|plan to|eventually|retirement|legacy)\b/i,
            /\b(life goals|ambition|life dream|future plan)\b/i,
          ],
          weight: 1.0,
          priority: "low",
        },
      ],

      [
        "tools_tech_workflow",
        {
          keywords: new Set([
            "software",
            "app",
            "application",
            "tool",
            "tools",
            "technology",
            "tech",
            "system",
            "platform",
            "website",
            "digital",
            "online",
            "computer",
            "laptop",
            "phone",
            "workflow",
            "process",
            "automation",
            "productivity",
            "efficiency",
            "program",
          ]),
          patterns: [
            /\b(software|app|tool|technology|system|platform|website|digital)\b/i,
            /\b(computer|laptop|phone|workflow|automation|productivity|efficiency)\b/i,
            /\b(program|application|online|process)\b/i,
          ],
          weight: 1.0,
          priority: "low",
        },
      ],

      [
        "daily_routines_habits",
        {
          keywords: new Set([
            "routine",
            "routines",
            "habit",
            "habits",
            "daily",
            "morning",
            "evening",
            "night",
            "schedule",
            "consistency",
            "regular",
            "every day",
            "weekly",
            "pattern",
            "ritual",
            "practice",
            "discipline",
            "structure",
            "organization",
          ]),
          patterns: [
            /\b(routine|habit|daily|morning|evening|schedule|consistency)\b/i,
            /\b(regular|every day|weekly|pattern|ritual|practice|discipline)\b/i,
            /\b(structure|organization|time management)\b/i,
          ],
          weight: 1.0,
          priority: "medium",
        },
      ],

      [
        "personal_life_interests",
        {
          keywords: new Set([
            "home",
            "house",
            "apartment",
            "living",
            "lifestyle",
            "personal",
            "hobby",
            "hobbies",
            "interest",
            "interests",
            "entertainment",
            "fun",
            "leisure",
            "gaming",
            "games",
            "creative",
            "art",
            "music",
            "reading",
            "books",
            "movies",
            "tv",
            "travel",
            "vacation",
            "sports",
            "cooking",
            "food",
            "garden",
            "gardening",
          ]),
          patterns: [
            /\b(home|house|apartment|lifestyle|hobby|interest|entertainment|fun)\b/i,
            /\b(gaming|creative|art|music|reading|movies|travel|vacation|sports)\b/i,
            /\b(cooking|garden|personal|leisure|activity)\b/i,
          ],
          weight: 1.0,
          priority: "low",
        },
      ],
    ]);

    // ================================================================
    // ADVANCED CACHING ARCHITECTURE
    // ================================================================

    this.semanticCache = new Map();
    this.routingCache = new Map();
    this.extractionCache = new Map();
    this.maxCacheSize = 1000;
    this.routingCache.clear();
    this.semanticCache.clear();

    // ================================================================
    // PERFORMANCE ANALYTICS
    // ================================================================

    this.routingStats = {
      totalRoutes: 0,
      categoryDistribution: new Map(),
      avgConfidence: 0,
      avgProcessingTime: 0,
      highConfidenceRoutes: 0,
      lowConfidenceRoutes: 0,
      overrideApplications: 0,
      semanticOverrides: 0, // ADD THIS LINE
      semanticDominantRoutes: 0, // ADD THIS LINE
      keywordFallbacks: 0, // ADD THIS LINE
      confidenceDistribution: { high: 0, medium: 0, low: 0 }, // ADD THIS LINE
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastReset: Date.now(),
    };

    this.extractionStats = {
      totalExtractions: 0,
      avgExtractionTime: 0,
      avgTokensExtracted: 0,
      categoryDistribution: new Map(),
      lastReset: Date.now(),
    };

    // ================================================================
    // EMOTIONAL ANALYSIS SYSTEM
    // ================================================================

    this.emotionalWeights = new Map([
      ["stressed", 0.9],
      ["anxious", 0.85],
      ["worried", 0.8],
      ["frustrated", 0.75],
      ["angry", 0.8],
      ["sad", 0.75],
      ["depressed", 0.9],
      ["overwhelmed", 0.85],
      ["happy", 0.6],
      ["excited", 0.6],
      ["proud", 0.5],
      ["confident", 0.4],
      ["confused", 0.5],
      ["uncertain", 0.6],
      ["determined", 0.4],
    ]);

    // ================================================================
    // STOP WORDS FOR MEANINGFUL TEXT EXTRACTION
    // ================================================================

    this.stopWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "up",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "among",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
      "my",
      "your",
      "his",
      "her",
      "its",
      "our",
      "their",
      "this",
      "that",
      "these",
      "those",
    ]);

    this.logger = {
      log: (message) =>
        console.log(`[INTELLIGENCE] ${new Date().toISOString()} ${message}`),
      error: (message, error) =>
        console.error(
          `[INTELLIGENCE ERROR] ${new Date().toISOString()} ${message}`,
          error,
        ),
      warn: (message) =>
        console.warn(
          `[INTELLIGENCE WARN] ${new Date().toISOString()} ${message}`,
        ),
    };
  }

  async initialize() {
    this.logger.log("Initializing Intelligence System...");
    this.isInitialized = true;
    this.logger.log("Intelligence System initialized successfully");
    return true;
  }

  // ================================================================
  // MAIN ROUTING METHOD - analyzeAndRoute
  // ================================================================

  async analyzeAndRoute(query, userId) {
    if (!query || typeof query !== "string") {
      return this.createFallbackRoutingResult("Invalid query input");
    }

    const startTime = Date.now();
    const normalizedQuery = query.toLowerCase().trim();

    try {
      this.logger.log(`Processing query: "${query.substring(0, 50)}..."`);

      // Check cache first
      const cacheKey = this.generateCacheKey(normalizedQuery, userId);
      if (this.routingCache.has(cacheKey)) {
        this.routingStats.cacheHits++;
        const cached = this.routingCache.get(cacheKey);
        this.logger.log(`Cache hit: ${cached.primaryCategory}`);
        return cached;
      }

      this.routingStats.cacheMisses++;

      // GENUINE SEMANTIC ROUTING: Use embedding-based SemanticAnalyzer when available
      // Issue #423: Use semantic similarity, not keyword matching
      if (global.orchestrator?.semanticAnalyzer) {
        try {
          const semanticResult = await global.orchestrator.semanticAnalyzer.analyzeSemantics(query);
          
          // Map semantic domain to memory category using genuine intelligence
          const categoryMapping = this.mapDomainToCategory(
            semanticResult.domain,
            semanticResult.domainConfidence,
            semanticResult.intent,
            query
          );

          const finalResult = {
            primaryCategory: categoryMapping.category,
            subcategory: this.selectSubcategoryFromSemantic(
              categoryMapping.category,
              semanticResult,
              query
            ),
            confidence: categoryMapping.confidence,
            alternativeCategory: categoryMapping.alternative,
            reasoning: `Semantic: ${semanticResult.domain} (${semanticResult.domainConfidence.toFixed(3)}) → ${categoryMapping.category}`,
            semanticOverride: true,
            semanticDomain: semanticResult.domain,
            semanticIntent: semanticResult.intent,
          };

          // Cache result
          this.cacheResult(cacheKey, finalResult);

          // Update analytics
          this.updateRoutingAnalytics(finalResult, Date.now() - startTime);

          // Semantic-aware logging
          this.logger.log(
            `SEMANTIC ROUTING: ${finalResult.primaryCategory}/${finalResult.subcategory} ` +
            `| Confidence: ${finalResult.confidence.toFixed(3)} ` +
            `| Domain: ${semanticResult.domain} (${semanticResult.domainConfidence.toFixed(3)}) ` +
            `| Intent: ${semanticResult.intent} ` +
            `| Time: ${Date.now() - startTime}ms`
          );

          // Update confidence distribution tracking
          if (finalResult.confidence > 0.8) {
            this.routingStats.confidenceDistribution.high++;
          } else if (finalResult.confidence > 0.5) {
            this.routingStats.confidenceDistribution.medium++;
          } else {
            this.routingStats.confidenceDistribution.low++;
          }

          return finalResult;
        } catch (semanticError) {
          this.logger.warn(`Semantic routing failed, falling back to keyword-based: ${semanticError.message}`);
          // Fall through to keyword-based routing below
        }
      } else {
        this.logger.warn("SemanticAnalyzer not available, using keyword-based routing");
      }

      // FALLBACK: Advanced semantic analysis (keyword-based)
      const semanticAnalysis =
        await this.performAdvancedSemanticAnalysis(normalizedQuery);

      // Calculate category scores
      const categoryScores = await this.calculateAdvancedCategoryScores(
        normalizedQuery,
        semanticAnalysis,
        userId,
      );

      // Determine best category with confidence metrics
      const routingResult = this.determineBestCategoryWithConfidence(
        categoryScores,
        semanticAnalysis,
        normalizedQuery,
      );

      // Apply sophisticated override logic
      const finalResult = await this.applySophisticatedOverrides(
        routingResult,
        normalizedQuery,
        semanticAnalysis,
        userId,
      );

      // Add dynamic subcategory
      finalResult.subcategory = this.selectSubcategory(
        finalResult.primaryCategory,
        normalizedQuery,
        semanticAnalysis,
      );

      // Cache result
      this.cacheResult(cacheKey, finalResult);

      // Update analytics
      this.updateRoutingAnalytics(finalResult, Date.now() - startTime);

      // Enhanced semantic-aware logging
      const semanticInfo = {
        intent: semanticAnalysis.intent,
        personalContext: semanticAnalysis.personalContext,
        emotionalWeight: semanticAnalysis.emotionalWeight.toFixed(2),
        semanticOverride: finalResult.semanticOverride || false,
      };

      this.logger
        .log(`SEMANTIC ROUTING: ${finalResult.primaryCategory}/${finalResult.subcategory} 
        | Confidence: ${finalResult.confidence.toFixed(3)}
        | Intent: ${semanticInfo.intent}
        | Personal: ${semanticInfo.personalContext}
        | Emotional: ${semanticInfo.emotionalWeight}
        | Override: ${semanticInfo.semanticOverride}
        | Time: ${Date.now() - startTime}ms`);

      // Update confidence distribution tracking
      if (finalResult.confidence > 0.8) {
        this.routingStats.confidenceDistribution.high++;
      } else if (finalResult.confidence > 0.5) {
        this.routingStats.confidenceDistribution.medium++;
      } else {
        this.routingStats.confidenceDistribution.low++;
      }

      return finalResult;
    } catch (error) {
      this.logger.error("Critical error in routing:", error);
      return this.createFallbackRoutingResult("Routing error occurred");
    }
  }

  // ================================================================
  // SEMANTIC DOMAIN TO CATEGORY MAPPING (Issue #423)
  // Maps SemanticAnalyzer domains to memory categories using genuine intelligence
  // ================================================================

  mapDomainToCategory(domain, domainConfidence, intent, _query) {
    // Primary mapping: Domain → Category
    // Uses semantic domain from embedding-based classification
    const domainCategoryMap = {
      technical: {
        primary: "tools_tech_workflow",
        alternatives: ["work_career", "goals_active_current"],
      },
      business: {
        primary: "work_career",
        alternatives: ["goals_active_current", "money_income_debt"],
      },
      personal: {
        primary: "personal_life_interests",
        alternatives: ["relationships_social", "daily_routines_habits"],
      },
      health: {
        primary: "health_wellness",
        alternatives: ["mental_emotional", "daily_routines_habits"],
      },
      financial: {
        primary: "money_spending_goals",
        alternatives: ["money_income_debt", "work_career"],
      },
      creative: {
        primary: "personal_life_interests",
        alternatives: ["goals_active_current"],
      },
      general: {
        primary: "personal_life_interests",
        alternatives: ["daily_routines_habits"],
      },
    };

    const mapping = domainCategoryMap[domain] || domainCategoryMap.general;
    let primaryCategory = mapping.primary;
    let confidence = domainConfidence;

    // Intent-based refinement for ambiguous cases
    if (intent === "problem_solving" && domain === "technical") {
      // Technical problem-solving stays in tools_tech_workflow
      confidence = Math.min(domainConfidence + 0.1, 1.0);
    } else if (intent === "emotional_expression" && domain === "personal") {
      // Emotional personal topics might be mental_emotional
      // Use semantic emotional detection rather than keywords
      primaryCategory = "mental_emotional";
    } else if (intent === "decision_making" && domain === "business") {
      // Business decisions might be goals
      primaryCategory = "goals_active_current";
    }

    // NOTE: Confidence comes from semantic similarity (embeddings), not keyword matching
    // This is genuine intelligence, not pattern matching

    return {
      category: primaryCategory,
      confidence: confidence,
      alternative: mapping.alternatives[0],
      domain: domain,
      reasoning: `Domain: ${domain} → ${primaryCategory} (confidence: ${confidence.toFixed(3)})`,
    };
  }

  selectSubcategoryFromSemantic(category, semanticResult, _query) {
    // Map categories to subcategories based on semantic analysis
    const subcategoryMap = {
      tools_tech_workflow: "Digital Tools",
      work_career: "General Work",
      personal_life_interests: "General Personal",
      health_wellness: "General Health",
      mental_emotional: "General Emotional",
      money_spending_goals: "Spending & Goals",
      money_income_debt: "Income & Debt",
      relationships_social: "Social Life",
      daily_routines_habits: "Daily Schedule",
      goals_active_current: "Current Goals",
      goals_past_completed: "Past Goals",
    };

    // Default subcategory
    let subcategory = subcategoryMap[category] || "General";

    // Refine based on intent
    if (semanticResult.intent === "problem_solving") {
      if (category === "tools_tech_workflow") subcategory = "Technical Issues";
      else if (category === "work_career") subcategory = "Work Challenges";
    } else if (semanticResult.intent === "emotional_expression") {
      if (category === "mental_emotional") subcategory = "Emotional State";
      else if (category === "relationships_social") subcategory = "Relationship Dynamics";
    } else if (semanticResult.intent === "decision_making") {
      if (category === "goals_active_current") subcategory = "Decision Making";
    }

    return subcategory;
  }

  // ================================================================
  // ADVANCED SEMANTIC ANALYSIS
  // ================================================================

  async performAdvancedSemanticAnalysis(query) {
    const cacheKey = `semantic_${query.substring(0, 100)}`;
    if (this.semanticCache.has(cacheKey)) {
      return this.semanticCache.get(cacheKey);
    }

    const analysis = {
      intent: "general",
      confidence: 0.5,
      emotionalWeight: 0,
      emotionalTone: "neutral",
      personalContext: false,
      memoryReference: false,
      urgencyLevel: 0,
      timeContext: "general",
      topicEntities: new Set(),
      keywordDensity: 0,
      complexityScore: 0,
    };

    try {
      // Intent classification with confidence scoring
      let maxIntentScore = 0;
      for (const [intentType, config] of Object.entries(this.intentPatterns)) {
        let score = 0;
        for (const pattern of config.patterns) {
          if (pattern.test(query)) {
            score = config.weight;
            break;
          }
        }
        if (score > maxIntentScore) {
          maxIntentScore = score;
          analysis.intent = intentType;
          analysis.confidence = score;
        }
      }

      // Advanced emotional analysis
      let maxEmotionalWeight = 0;
      for (const [emotion, weight] of this.emotionalWeights) {
        if (query.includes(emotion)) {
          maxEmotionalWeight = Math.max(maxEmotionalWeight, weight);
        }
      }
      analysis.emotionalWeight = maxEmotionalWeight;
      analysis.emotionalTone =
        maxEmotionalWeight > 0.6
          ? "high"
          : maxEmotionalWeight > 0.3
            ? "moderate"
            : "low";

      // Context detection
      analysis.personalContext =
        /\b(my|our|personal|private|family|i am|i have|we are|we have)\b/i.test(
          query,
        );
      analysis.memoryReference =
        /\b(remember|recall|told you|mentioned|discussed|said before|talked about)\b/i.test(
          query,
        );
      analysis.urgencyLevel =
        /\b(urgent|emergency|asap|immediately|critical|important|now|today)\b/i.test(
          query,
        )
          ? 0.8
          : 0.0;

      // Time context analysis
      if (/\b(now|today|currently|right now|at the moment)\b/i.test(query)) {
        analysis.timeContext = "immediate";
      } else if (/\b(this week|soon|upcoming|lately|recently)\b/i.test(query)) {
        analysis.timeContext = "recent";
      } else if (
        /\b(future|someday|eventually|long-term|planning)\b/i.test(query)
      ) {
        analysis.timeContext = "future";
      }

      // Topic entity extraction - ENHANCED for content-based routing
      // ISSUE #406 FIX: Added financial and news/general topics
      const topicPatterns = [
        [
          "health",
          /\b(health|medical|doctor|symptom|pain|fitness|exercise|diet)\b/gi,
        ],
        ["work", /\b(work|job|career|business|office|meeting|project)\b/gi],
        [
          "family",
          /\b(family|spouse|children|parents|relationship|marriage|wife|husband|partner)\b/gi,
        ],
        [
          "money",
          /\b(money|financial|budget|income|debt|investment|savings|bitcoin|btc|ethereum|eth|crypto|cryptocurrency|stock|stocks|market|trading|price)\b/gi,
        ],
        [
          "home",
          /\b(home|house|apartment|living|lifestyle|vehicle|car|truck|pet|dog|cat|hobby|interest)\b/gi,
        ],
        [
          "news",
          /\b(news|stories|headlines|current events|breaking|update|latest|weather|forecast|temperature|gossip|celebrity|entertainment)\b/gi,
        ],
      ];

      for (const [topic, pattern] of topicPatterns) {
        const matches = query.match(pattern);
        if (matches && matches.length > 0) {
          analysis.topicEntities.add(topic);
        }
      }

      // Keyword density and complexity analysis
      const words = query.split(/\s+/).filter((word) => word.length > 2);
      const meaningfulWords = words.filter(
        (word) => !this.stopWords.has(word.toLowerCase()),
      );
      analysis.keywordDensity =
        meaningfulWords.length / Math.max(words.length, 1);
      analysis.complexityScore = Math.min(meaningfulWords.length / 10, 1);

      // Cache the analysis
      this.cacheSemanticResult(cacheKey, analysis);

      return analysis;
    } catch (error) {
      this.logger.error("Error in semantic analysis:", error);
      return analysis;
    }
  }

  // ================================================================
  // CATEGORY SCORING SYSTEM
  // ================================================================

  async calculateAdvancedCategoryScores(query, semanticAnalysis, _userId) {
    const scores = new Map();

    // ISSUE #406 FIX: Use module-level constants with case-insensitive matching
    const queryLower = query.toLowerCase();
    const hasFinancialContent = this.FINANCIAL_KEYWORDS.some(keyword => queryLower.includes(keyword));
    const hasNewsContent = this.NEWS_KEYWORDS.some(keyword => queryLower.includes(keyword));

    for (const [categoryName, config] of this.categoryMappings) {
      let score = 0;

      // ISSUE #406 FIX: Direct content-based boosting BEFORE semantic analysis
      // Financial queries → money_spending_goals or money_income_debt
      if (hasFinancialContent && (categoryName === 'money_spending_goals' || categoryName === 'money_income_debt')) {
        score += 15.0; // High boost for financial content
      }
      
      // News/weather queries → personal_life_interests (general category fallback)
      if (hasNewsContent && categoryName === 'personal_life_interests') {
        score += 10.0; // Boost for general/news content
      }

      // SEMANTIC-FIRST: Calculate primary semantic score based on CONTENT
      const semanticScore = this.calculateSemanticBoost(
        categoryName,
        semanticAnalysis,
      );
      score += semanticScore * 8.0; // PRIMARY DRIVER: 8x amplification

      // CONTENT KEYWORDS: Direct keyword matches from query
      let keywordMatches = 0;
      for (const keyword of config.keywords) {
        if (query.includes(keyword)) {
          keywordMatches++;
          score += 2.0 * config.weight; // Keyword match is important for content-based routing
        }
      }

      // CONTENT PATTERNS: Pattern matches from query
      for (const pattern of config.patterns) {
        if (pattern.test(query)) {
          score += 3.0 * config.weight; // Pattern match is important for content-based routing
        }
      }

      // Entity alignment boost (content-based)
      score += this.calculateEntityAlignmentBoost(
        categoryName,
        semanticAnalysis,
      );

      // Priority-based weighting (for urgent content)
      if (config.priority === "high" && semanticAnalysis.urgencyLevel > 0.5) {
        score += 1.0;
      }

      // Keyword density bonus (for content richness)
      if (keywordMatches > 1) {
        score += Math.min(keywordMatches * 0.5, 2.0);
      }

      // SEMANTIC OVERRIDE: Apply content-based overrides
      const semanticOverride = this.applySemanticOverride(
        categoryName,
        semanticAnalysis,
        score,
      );
      if (semanticOverride.override) {
        score = semanticOverride.newScore;
        // Track override for analytics
        this.routingStats.semanticOverrides =
          (this.routingStats.semanticOverrides || 0) + 1;
      }

      // REMOVED: Intent-based conditional boosting (memory_recall → relationships_social)
      // This was causing incorrect routing based on intent instead of content

      scores.set(categoryName, Math.max(score, 0));
    }

    return scores;
  }

  // ================================================================
  // SEMANTIC OVERRIDE INTELLIGENCE
  // ================================================================

  applySemanticOverride(categoryName, semanticAnalysis, currentScore) {
    // CONTENT-BASED OVERRIDE: Only boost based on topic/content alignment, not intent
    // This fixes the issue where "memory_recall" intent incorrectly routes to relationships_social
    
    // HIGH-CONFIDENCE EMOTIONAL CONTENT OVERRIDE (content-based, not intent-based)
    if (semanticAnalysis.emotionalWeight > 0.7) {
      if (categoryName === "mental_emotional") {
        return {
          override: true,
          newScore: 12.0 + semanticAnalysis.emotionalWeight * 3.0,
          reason: "High emotional content routed to mental_emotional",
        };
      }
    }

    // HIGH-CONFIDENCE PERSONAL CONTEXT OVERRIDE (content-based)
    // Only apply if we have strong personal context + topic alignment
    if (
      semanticAnalysis.personalContext &&
      semanticAnalysis.topicEntities.size > 0
    ) {
      // Check if topic entities suggest this category
      const hasRelevantTopics = this.categoryHasRelevantTopics(
        categoryName,
        semanticAnalysis.topicEntities
      );
      
      if (hasRelevantTopics) {
        return {
          override: true,
          newScore: currentScore + 3.0,
          reason: "Content-based personal context boost applied",
        };
      }
    }

    return { override: false };
  }

  /**
   * Check if category is relevant to the query's topic entities
   * Used for content-based routing instead of intent-based routing
   */
  categoryHasRelevantTopics(categoryName, topicEntities) {
    const categoryTopicMap = {
      personal_life_interests: ['home', 'family'],
      relationships_social: ['family'],
      work_career: ['work'],
      health_wellness: ['health'],
      mental_emotional: ['health'],
      money_income_debt: ['money'],
      money_spending_goals: ['money'],
    };
    
    const categoryTopics = categoryTopicMap[categoryName] || [];
    for (const topic of topicEntities) {
      if (categoryTopics.includes(topic)) {
        return true;
      }
    }
    return false;
  }

  calculateSemanticBoost(categoryName, semanticAnalysis) {
    let boost = 0;

    // CONTENT-BASED SEMANTIC ROUTING: Match query content against category topic entities
    // This replaces intent-based routing with true semantic content matching
    // Example: "vehicles" → personal_life_interests (not relationships_social)
    // ISSUE #406 FIX: Added 'news' and enhanced 'money' mappings
    const categoryConfig = this.categoryMappings.get(categoryName);
    if (categoryConfig && semanticAnalysis.topicEntities.size > 0) {
      // Check if query topics align with category topics
      for (const topicEntity of semanticAnalysis.topicEntities) {
        // Direct topic match to category
        const topicToCategoryMap = {
          health: ['health_wellness', 'mental_emotional'],
          work: ['work_career', 'goals_active_current'],
          family: ['relationships_social', 'personal_life_interests'],
          money: ['money_income_debt', 'money_spending_goals', 'work_career'],
          home: ['personal_life_interests', 'daily_routines_habits'],
          news: ['personal_life_interests'], // News/general queries default to personal_life_interests
        };
        
        if (topicToCategoryMap[topicEntity]?.includes(categoryName)) {
          boost += 5.0; // Strong boost for content-topic alignment
        }
      }
    }

    // SECONDARY: Emotional weight boosting (only for emotion-related categories)
    if (semanticAnalysis.emotionalWeight > 0.6) {
      const emotionalBoosts = {
        mental_emotional: 4.0,
        relationships_social: 2.0,
        health_wellness: 1.8,
        work_career: 1.5,
      };
      boost +=
        (emotionalBoosts[categoryName] || 0) * semanticAnalysis.emotionalWeight;
    }

    // TERTIARY: Personal context amplification (only for truly personal categories)
    // mental_emotional boost reduced from 1.2 to 0.5 to prevent false routing:
    // - Ensures health queries (e.g., "exercise") route to health_wellness, not mental_emotional
    // - Maintains boost for truly emotional content via emotionalWeight > 0.6 check above
    if (semanticAnalysis.personalContext) {
      const personalBoosts = {
        personal_life_interests: 2.0,
        relationships_social: 1.5,
        daily_routines_habits: 1.0,
        mental_emotional: 0.5, // Reduced to prevent competing with content-specific categories
      };
      boost += personalBoosts[categoryName] || 0;
    }

    return boost;
  }
  calculateEntityAlignmentBoost(categoryName, semanticAnalysis) {
    const entityAlignments = {
      health: { health_wellness: 1.0, mental_emotional: 0.4 },
      work: {
        work_career: 1.0,
        goals_active_current: 0.3,
        tools_tech_workflow: 0.4,
      },
      family: {
        relationships_social: 1.0,
        mental_emotional: 0.3,
        personal_life_interests: 0.3,
      },
      money: {
        money_income_debt: 0.8,
        money_spending_goals: 0.8,
        work_career: 0.4,
      },
      home: {
        personal_life_interests: 0.8,
        daily_routines_habits: 0.5,
        health_wellness: 0.3,
      },
    };

    let boost = 0;
    for (const entityType of semanticAnalysis.topicEntities) {
      boost += entityAlignments[entityType]?.[categoryName] || 0;
    }

    return boost;
  }

  // ================================================================
  // CATEGORY DETERMINATION & CONFIDENCE
  // ================================================================

  determineBestCategoryWithConfidence(
    categoryScores,
    semanticAnalysis,
    _query,
  ) {
    const sortedCategories = Array.from(categoryScores.entries()).sort(
      ([, a], [, b]) => b - a,
    );

    if (sortedCategories.length === 0) {
      return {
        primaryCategory: "personal_life_interests",
        confidence: 0.3,
        alternativeCategory: null,
        reasoning: "No category scores calculated",
      };
    }

    const [bestCategory, bestScore] = sortedCategories[0];
    const [secondCategory, secondScore] = sortedCategories[1] || ["", 0];

    // Advanced confidence calculation
    // ISSUE #406 FIX: Increased divisor and ceiling to allow higher confidence scores
    // Changed from: Math.min(bestScore / 12.0, 0.6) 
    // To: Math.min(bestScore / 15.0, 0.7)
    // This allows scores >= 10.5 to reach confidence > 0.7
    let confidence = Math.min(bestScore / 15.0, 0.7);

    // Score separation bonus
    const separation = bestScore - secondScore;
    confidence += Math.min(separation / 8.0, 0.2);

    // Semantic analysis confidence boost
    confidence += semanticAnalysis.confidence * 0.1;

    // Clear winner bonus
    if (bestScore > secondScore * 1.5) {
      confidence += 0.1;
    }

    // Multiple indicators bonus
    if (semanticAnalysis.topicEntities.size > 0) {
      confidence += Math.min(semanticAnalysis.topicEntities.size * 0.05, 0.1);
    }

    // ISSUE #406 FIX: Lower the confidence floor from 0.2 to allow detection of truly uncertain routing
    // However, boost confidence when we have strong topic entities
    const hasStrongSignals = semanticAnalysis.topicEntities.size > 0 && bestScore > 5.0;
    const confidenceFloor = hasStrongSignals ? 0.3 : 0.2;

    return {
      primaryCategory: bestCategory,
      confidence: Math.max(confidenceFloor, Math.min(confidence, 1.0)),
      alternativeCategory: secondCategory,
      scores: {
        primary: bestScore,
        secondary: secondScore,
      },
      reasoning: `Primary: ${bestCategory} (${bestScore.toFixed(1)}) vs Secondary: ${secondCategory} (${secondScore.toFixed(1)})`,
    };
  }

  // ================================================================
  // SOPHISTICATED OVERRIDES
  // ================================================================

  async applySophisticatedOverrides(
    routingResult,
    query,
    semanticAnalysis,
    _userId,
  ) {
    let { primaryCategory, confidence } = routingResult;
    let reasoning = routingResult.reasoning;
    let overrideApplied = false;

    // High-urgency health override
    if (
      semanticAnalysis.urgencyLevel > 0.7 &&
      (query.includes("pain") ||
        query.includes("emergency") ||
        query.includes("hospital"))
    ) {
      if (primaryCategory !== "health_wellness") {
        primaryCategory = "health_wellness";
        confidence = Math.max(confidence, 0.9);
        reasoning += "; Health emergency override applied";
        overrideApplied = true;
      }
    }

    // Mental health crisis override
    if (
      semanticAnalysis.emotionalWeight > 0.8 &&
      (query.includes("crisis") ||
        query.includes("suicide") ||
        query.includes("can't take it"))
    ) {
      if (primaryCategory !== "mental_emotional") {
        primaryCategory = "mental_emotional";
        confidence = Math.max(confidence, 0.95);
        reasoning += "; Mental health crisis override applied";
        overrideApplied = true;
      }
    }

    // Financial crisis override
    if (
      (query.includes("broke") ||
        query.includes("bankruptcy") ||
        query.includes("can't pay")) &&
      !primaryCategory.startsWith("money_")
    ) {
      primaryCategory = "money_income_debt";
      confidence = Math.max(confidence, 0.85);
      reasoning += "; Financial crisis override applied";
      overrideApplied = true;
    }

    // Low confidence fallback enhancement
    if (confidence < 0.4 && !overrideApplied) {
      if (
        semanticAnalysis.personalContext &&
        semanticAnalysis.emotionalWeight > 0.3
      ) {
        primaryCategory = "mental_emotional";
        confidence = 0.5;
        reasoning += "; Low confidence personal-emotional fallback applied";
        overrideApplied = true;
      }
    }

    // REMOVED: Intent-based memory_recall → relationships_social override
    // This was causing incorrect routing (e.g., "vehicles" → relationships_social)
    // Now using content-based routing only

    if (overrideApplied) {
      this.routingStats.overrideApplications++;
    }

    return {
      ...routingResult,
      primaryCategory,
      confidence,
      reasoning,
      overrideApplied,
      semanticAnalysis: {
        intent: semanticAnalysis.intent,
        emotionalWeight: semanticAnalysis.emotionalWeight,
        personalContext: semanticAnalysis.personalContext,
        urgencyLevel: semanticAnalysis.urgencyLevel,
      },
    };
  }

  // ================================================================
  // DYNAMIC SUBCATEGORY SELECTION
  // ================================================================

  selectSubcategory(primaryCategory, query, semanticAnalysis) {
    const categorySubcategoryLogic = {
      mental_emotional: () => {
        if (semanticAnalysis.emotionalWeight > 0.7) return "High Emotional";
        if (query.includes("therapy") || query.includes("counseling"))
          return "Professional Support";
        if (query.includes("stress") || query.includes("overwhelmed"))
          return "Stress Management";
        if (query.includes("confidence") || query.includes("self-esteem"))
          return "Self-Worth";
        return "General Emotional";
      },
      health_wellness: () => {
        if (query.includes("doctor") || query.includes("medical"))
          return "Medical Care";
        if (query.includes("exercise") || query.includes("fitness"))
          return "Physical Activity";
        if (query.includes("diet") || query.includes("nutrition"))
          return "Nutrition";
        if (query.includes("sleep") || query.includes("tired"))
          return "Sleep Health";
        return "General Health";
      },
      relationships_social: () => {
        if (query.includes("family") || query.includes("parents"))
          return "Family Relations";
        if (query.includes("partner") || query.includes("spouse"))
          return "Romantic Relations";
        if (query.includes("friend") || query.includes("social"))
          return "Social Circle";
        if (query.includes("work") && query.includes("colleague"))
          return "Professional Relations";
        return "General Social";
      },
      work_career: () => {
        if (query.includes("project") || query.includes("task"))
          return "Current Projects";
        if (query.includes("promotion") || query.includes("career"))
          return "Career Development";
        if (query.includes("team") || query.includes("colleague"))
          return "Team Dynamics";
        if (query.includes("interview") || query.includes("job search"))
          return "Job Search";
        return "General Work";
      },
      money_income_debt: () => {
        if (query.includes("debt") || query.includes("loan"))
          return "Debt Management";
        if (query.includes("salary") || query.includes("income"))
          return "Income Issues";
        if (query.includes("bill") || query.includes("payment"))
          return "Payment Obligations";
        return "Financial Pressure";
      },
      money_spending_goals: () => {
        if (query.includes("budget") || query.includes("spending"))
          return "Budget Planning";
        if (query.includes("investment") || query.includes("stocks"))
          return "Investment Strategy";
        if (query.includes("save") || query.includes("savings"))
          return "Savings Goals";
        if (query.includes("retirement")) return "Retirement Planning";
        return "Financial Goals";
      },
      goals_active_current: () => {
        if (semanticAnalysis.timeContext === "immediate")
          return "Immediate Goals";
        if (query.includes("this week") || query.includes("this month"))
          return "Short-term Goals";
        if (query.includes("project") || query.includes("task"))
          return "Project Goals";
        return "Current Focus";
      },
      goals_future_dreams: () => {
        if (query.includes("dream") || query.includes("vision"))
          return "Life Dreams";
        if (query.includes("retirement") || query.includes("legacy"))
          return "Long-term Vision";
        if (query.includes("travel") || query.includes("bucket list"))
          return "Experience Goals";
        return "Future Aspirations";
      },
      tools_tech_workflow: () => {
        if (query.includes("software") || query.includes("app"))
          return "Software Tools";
        if (query.includes("workflow") || query.includes("productivity"))
          return "Productivity Systems";
        if (query.includes("problem") || query.includes("not working"))
          return "Tech Issues";
        return "Digital Tools";
      },
      daily_routines_habits: () => {
        if (query.includes("morning") || query.includes("evening"))
          return "Daily Schedule";
        if (query.includes("habit") || query.includes("routine"))
          return "Habit Formation";
        if (query.includes("consistency") || query.includes("discipline"))
          return "Consistency Building";
        return "Routine Management";
      },
      personal_life_interests: () => {
        if (query.includes("hobby") || query.includes("interest"))
          return "Personal Interests";
        if (query.includes("home") || query.includes("house"))
          return "Home Life";
        if (query.includes("entertainment") || query.includes("fun"))
          return "Entertainment";
        if (query.includes("travel") || query.includes("vacation"))
          return "Travel Experiences";
        return "Lifestyle";
      },
    };

    const subcategoryFunction = categorySubcategoryLogic[primaryCategory];
    return subcategoryFunction ? subcategoryFunction() : "General";
  }

  // ================================================================
  // MEMORY EXTRACTION ENGINE - extractRelevantMemories
  // ================================================================

  async extractRelevantMemories(userId, query, routing) {
    const startTime = Date.now();

    try {
      // ═══════════════════════════════════════════════════════════════
      // CRITICAL: USER ISOLATION ENFORCEMENT
      // ═══════════════════════════════════════════════════════════════
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        console.error('[MEMORY-ISOLATION] CRITICAL: extractRelevantMemories called without valid userId');
        console.error('[MEMORY-ISOLATION] Refusing to retrieve memories without user identification');
        return [];
      }

      // Sanitize userId to prevent injection
      const sanitizedUserId = userId.trim();

      // Log for audit trail
      console.log(`[MEMORY-ISOLATION] Retrieving memories for userId: ${sanitizedUserId.substring(0, 8)}...`);
      // ═══════════════════════════════════════════════════════════════

      this.logger.log(
        `Starting extraction for user: ${sanitizedUserId}, query: "${query.substring(0, 50)}..."`,
      );

      // ═══════════════════════════════════════════════════════════════
      // ORDINAL FACT RETRIEVAL (Issue #520) - Check if query asks about ordered facts
      // ═══════════════════════════════════════════════════════════════
      const queryOrdinal = this.detectOrdinalFact(query);

      if (queryOrdinal.hasOrdinal) {
        console.log(`[ORDINAL-RETRIEVAL] Query asks for ordinal #${queryOrdinal.ordinal} of ${queryOrdinal.subject}`);

        try {
          // CRITICAL FIX #597/#600: Retrieve ALL related ordinal memories in NATURAL ORDER
          // When user asks "what's the second code?", they need to see BOTH first and second codes
          // This allows the AI to provide proper context and detect if there are multiple items
          // FIX #600-B3: Sort by ordinal ascending (1, 2, 3...) so AI sees them in natural order
          const ordinalQuery = `
            SELECT * FROM persistent_memories
            WHERE user_id = $1
              AND (is_current = true OR is_current IS NULL)
              AND metadata->>'ordinal_subject' ILIKE $2
            ORDER BY
              (metadata->>'ordinal')::int ASC,
              created_at DESC
            LIMIT 20
          `;

          const ordinalResults = await this.coreSystem.executeQuery(ordinalQuery, [
            sanitizedUserId,
            `%${queryOrdinal.subject}%`,
            String(queryOrdinal.ordinal)
          ]);

          if (ordinalResults.rows.length > 0) {
            console.log(`[ORDINAL-RETRIEVAL] ✅ Found ${ordinalResults.rows.length} memories with ordinal subject "${queryOrdinal.subject}"`);
            console.log(`[ORDINAL-RETRIEVAL] Returning in NATURAL ORDER (1st, 2nd, 3rd...) for AI context`);
            ordinalResults.rows.forEach((row, idx) => {
              const ord = row.metadata?.ordinal || 'N/A';
              console.log(`[ORDINAL-RETRIEVAL]   Position #${idx + 1}: Ordinal ${ord} - "${row.content?.substring(0, 60)}"`);
            });
            return ordinalResults.rows;
          } else {
            console.log(`[ORDINAL-RETRIEVAL] No memories found with ordinal metadata, falling through to normal retrieval`);
          }
        } catch (error) {
          this.logger.error('[ORDINAL-RETRIEVAL] Ordinal query failed:', error);
          // Fall through to normal retrieval
        }
      }
      // ═══════════════════════════════════════════════════════════════

      // STEP 0: FIRST PASS - Exact match for high-entropy tokens (Issue #210 Fix 3)
      const HIGH_ENTROPY_PATTERN = /[A-Z]+-[A-Z]+-\d{4,}|[A-Za-z0-9]{12,}/g;
      const queryTokens = query.match(HIGH_ENTROPY_PATTERN) || [];

      // Check if query is asking about identifier-like information
      const identifierKeywords = /\b(license plate|serial number|id number|identifier|token|code|plate number|registration|vin|account number|order number|tracking number|confirmation number|test token|test identifier|special identifier)\b/i;
      const queryMentionsIdentifier = identifierKeywords.test(query);

      // Issue #210 Fix 3: Extract key terms from query for match-first scoring
      const keyTerms = this.extractKeyTermsForMatching(query);

      if (keyTerms.length > 0) {
        this.logger.log(
          `[RETRIEVAL] Extracted ${keyTerms.length} key terms for match-first scoring: ${keyTerms.slice(0, 5).join(', ')}`,
        );
      }

      if (queryTokens.length > 0 || queryMentionsIdentifier) {
        if (queryTokens.length > 0) {
          this.logger.log(
            `[RETRIEVAL] Found high-entropy tokens in query: ${queryTokens.join(', ')}`,
          );
        }
        if (queryMentionsIdentifier) {
          this.logger.log(
            `[RETRIEVAL] Query asks about identifier-like information, searching for high-entropy tokens in memory`,
          );
        }

        try {
          let exactMatchQuery;
          let exactMatchParams;

          if (queryTokens.length > 0) {
            // Query contains high-entropy tokens - search for exact matches
            exactMatchQuery = `
              SELECT * FROM persistent_memories
              WHERE user_id = $1
              AND (is_current = true OR is_current IS NULL)
              AND (${queryTokens.map((_, i) => `content ILIKE $${i + 2}`).join(' OR ')})
              ORDER BY created_at DESC
              LIMIT 5
            `;
            exactMatchParams = [sanitizedUserId, ...queryTokens.map(t => `%${t}%`)];
          } else {
            // Query asks about identifiers but doesn't contain one - search for any high-entropy content
            exactMatchQuery = `
              SELECT * FROM persistent_memories
              WHERE user_id = $1
              AND (is_current = true OR is_current IS NULL)
              AND content ~ '[A-Z]+-[A-Z]+-[0-9]{4,}|[A-Za-z0-9]{12,}'
              ORDER BY created_at DESC
              LIMIT 10
            `;
            exactMatchParams = [sanitizedUserId];
          }

          const exactMatches = await this.coreSystem.executeQuery(
            exactMatchQuery,
            exactMatchParams
          );

          if (exactMatches.rows.length > 0) {
            this.logger.log(
              `[RETRIEVAL] ✅ Found ${exactMatches.rows.length} memories with high-entropy tokens`,
            );
            return exactMatches.rows;
          }
        } catch (error) {
          this.logger.error('[RETRIEVAL] Exact match query failed:', error);
          // Fall through to regular retrieval
        }
      }

      // Get semantic analysis (reuse from routing if available)
      const semanticAnalysis =
        routing.semanticAnalysis ||
        (await this.performAdvancedSemanticAnalysis(query.toLowerCase()));

      // STEP 1: Primary category extraction (existing logic)
      const primaryMemories = await this.extractFromPrimaryCategory(
        sanitizedUserId,
        query,
        routing,
        semanticAnalysis,
      );

      // STEP 2: Apply multi-dimensional relevance scoring (Issue #210 Fix 3: Match-first)
      const scoredPrimary = primaryMemories.map((memory, idx) => {
        const content = memory.content.toLowerCase();

        // Issue #210 Fix 3: Calculate exact match scores (HIGHEST priority)
        const exactTokenMatch = queryTokens.some(t => content.includes(t.toLowerCase()));
        const keyTermMatches = keyTerms.filter(t => content.includes(t)).length;

        // Multi-dimensional scoring as specified in the requirements
        const semanticScore = this.calculateSemanticSimilarity(query, memory.content);
        const keywordScore = this.calculateKeywordMatch(query, memory.content);
        const recencyScore = this.calculateRecencyBoost(memory.created_at, memory.last_accessed);
        const importanceScore = memory.relevance_score || 0;
        const usageScore = Math.min((memory.usage_frequency || 0) / 20, 1.0); // Normalize to 0-1

        // Issue #210 Fix 3: Match-first scoring with explicit priority weights
        // Priority 1: Exact token match = 1000 points (dominates all other factors)
        // Priority 2: Key term matches = 10 points per term
        // Priority 3: Standard multi-dimensional relevance
        const matchFirstScore = (exactTokenMatch ? 1000 : 0) + (keyTermMatches * 10);
        const baseRelevance = this.calculateMultiDimensionalRelevance(
          semanticScore,
          keywordScore,
          recencyScore,
          importanceScore,
          usageScore
        );

        // ISSUE #544 FIX: Comprehensive trace logging for ranking analysis
        const ageInSeconds = (Date.now() - new Date(memory.created_at).getTime()) / 1000;
        if (idx < 3 || ageInSeconds < 300) {  // Log first 3 AND any very recent memories
          console.log(`[MEMORY-TRACE] Memory ${memory.id} scoring:`);
          console.log(`  Age: ${ageInSeconds.toFixed(1)}s | Recency: ${recencyScore.toFixed(3)} | Semantic: ${semanticScore.toFixed(3)} | Keyword: ${keywordScore.toFixed(3)}`);
          console.log(`  Base relevance: ${baseRelevance.toFixed(3)} | Match-first: ${matchFirstScore} | FINAL: ${(matchFirstScore + baseRelevance).toFixed(3)}`);
          console.log(`  Content preview: ${memory.content.substring(0, 80)}...`);
        }

        return {
          ...memory,
          semanticScore,
          keywordScore,
          recencyScore,
          importanceScore,
          usageScore,
          exactTokenMatch,
          keyTermMatches,
          matchFirstScore,
          // Combined score: match-first + base relevance (match-first dominates)
          relevanceScore: matchFirstScore + baseRelevance,
          source: "primary_category",
        };
      });

      // STEP 3: If primary results are poor, try related categories
      let allMemories = scoredPrimary;

      const goodPrimaryResults = scoredPrimary.filter(
        (m) => m.relevanceScore > 0.3,
      ).length;
      if (goodPrimaryResults < 2) {
        this.logger.log(
          "Primary category yielded few relevant results, trying related categories...",
        );
        const relatedMemories = await this.tryRelatedCategories(
          sanitizedUserId,
          query,
          routing,
          semanticAnalysis,
        );
        allMemories = [...scoredPrimary, ...relatedMemories];
      }

      // CROSS-CATEGORY FALLBACK: Only when confidence < 0.80 OR no results (per requirements)
      // ENABLE_INTELLIGENT_ROUTING feature flag controls topic-based cross-category search
      if (process.env.ENABLE_INTELLIGENT_ROUTING === 'true') {
        // Trigger fallback when:
        // 1. Primary routing confidence < 0.80 (uncertain routing) OR
        // 2. Primary category returns 0 results
        const shouldUseFallback = routing.confidence < 0.80 || allMemories.length === 0;
        
        if (shouldUseFallback) {
          this.logger.log(
            `[CROSS-CATEGORY-FALLBACK] Triggered: confidence=${routing.confidence?.toFixed(3)}, results=${allMemories.length}`,
          );
          
          // Extract content-based topic keywords from query
          const topics = this.extractImportantNouns(query.toLowerCase());
          
          if (topics.length > 0) {
            this.logger.log(
              `[CROSS-CATEGORY-FALLBACK] Searching across all categories for topics: ${topics.join(', ')}`,
            );
            
            // Search across ALL categories for these content topics
            const topicMemories = await this.searchByTopics(
              sanitizedUserId,
              topics,
              routing.primaryCategory,
            );
            
            // Merge with existing results, remove duplicates by ID
            const existingIds = new Set(allMemories.map(m => m.id));
            const newTopicMemories = topicMemories.filter(m => !existingIds.has(m.id));
            
            allMemories = [...allMemories, ...newTopicMemories];
            this.logger.log(
              `[CROSS-CATEGORY-FALLBACK] Found ${newTopicMemories.length} additional memories from other categories`,
            );
          }
        } else {
          this.logger.log(
            `[CROSS-CATEGORY-FALLBACK] Skipped: confidence=${routing.confidence?.toFixed(3)} >= 0.80 AND results=${allMemories.length} > 0`,
          );
        }
      }

      // STEP 4: Re-rank by multi-dimensional relevance score (Issue #210 Fix 3: Match-first priority)
      const rankedMemories = allMemories.sort((a, b) => {
        return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      });

      // ISSUE #544 FIX: Comprehensive logging of ranked results
      console.log(`[MEMORY-TRACE] ========== RANKING RESULTS (Top 5) ==========`);
      rankedMemories.slice(0, 5).forEach((mem, idx) => {
        const ageInSeconds = (Date.now() - new Date(mem.created_at).getTime()) / 1000;
        console.log(`[MEMORY-TRACE] #${idx + 1}: ID ${mem.id} | Score: ${mem.relevanceScore.toFixed(3)} | Age: ${ageInSeconds.toFixed(1)}s`);
        console.log(`[MEMORY-TRACE]      Recency: ${mem.recencyScore?.toFixed(3)} | Semantic: ${mem.semanticScore?.toFixed(3)} | Keyword: ${mem.keywordScore?.toFixed(3)}`);
        console.log(`[MEMORY-TRACE]      Content: ${mem.content.substring(0, 100)}...`);
      });
      console.log(`[MEMORY-TRACE] ================================================`);

      // Issue #210 Fix 3: Log match-first scoring results
      const matchedMemories = rankedMemories.filter(m => m.exactTokenMatch || m.keyTermMatches > 0);
      if (matchedMemories.length > 0) {
        this.logger.log(
          `[RETRIEVAL] Match-first scoring: ${matchedMemories.length} memories have exact/key term matches`,
        );
        this.logger.log(
          `[RETRIEVAL] Top match: ID ${matchedMemories[0].id}, score ${matchedMemories[0].relevanceScore.toFixed(2)} (exact: ${matchedMemories[0].exactTokenMatch}, terms: ${matchedMemories[0].keyTermMatches})`,
        );
      }

      // STEP 5: Apply temporal diversity selection (from spec)
      const diverseMemories = this.selectDiverseMemories(rankedMemories, 2400);

      // STEP 6: Apply token management with diversity
      const finalMemories = await this.applyIntelligentTokenManagement(
        diverseMemories,
        2400,
      );

      // ISSUE #544 FIX: Log final selected memories
      console.log(`[MEMORY-TRACE] ========== FINAL SELECTION ==========`);
      console.log(`[MEMORY-TRACE] Selected ${finalMemories.length} memories for injection`);
      finalMemories.forEach((mem, idx) => {
        const ageInSeconds = (Date.now() - new Date(mem.created_at).getTime()) / 1000;
        console.log(`[MEMORY-TRACE] Selected #${idx + 1}: ID ${mem.id} | Age: ${ageInSeconds.toFixed(1)}s | Score: ${mem.relevanceScore?.toFixed(3)}`);
      });
      console.log(`[MEMORY-TRACE] ==========================================`);

      // Update analytics
      this.updateExtractionAnalytics(
        finalMemories,
        routing,
        Date.now() - startTime,
      );

      this.logger.log(
        `Enhanced extraction: ${finalMemories.length} memories, ${this.calculateTotalTokens(finalMemories)} tokens, ${Date.now() - startTime}ms`,
      );

      return finalMemories;
    } catch (error) {
      this.logger.error("Critical error in enhanced extraction:", error);
      // Sanitize userId for error logging (sanitizedUserId may not exist in error path)
      const errorUserId = userId?.trim() || 'unknown';
      await this.coreSystem.logExtractionError(error, {
        userId: errorUserId,
        query: query.substring(0, 100),
      });
      return [];
    }
  }

  async extractFromPrimaryCategory(userId, query, routing, semanticAnalysis) {
    try {
      // ═══════════════════════════════════════════════════════════════
      // CRITICAL: Explicit userId logging for isolation verification
      // ═══════════════════════════════════════════════════════════════
      console.log(`[MEMORY-ISOLATION] extractFromPrimaryCategory called with:`);
      console.log(`[MEMORY-ISOLATION]   userId: ${userId}`);
      console.log(`[MEMORY-ISOLATION]   category: ${routing.primaryCategory || "personal_life_interests"}`);
      // ═══════════════════════════════════════════════════════════════

      const primaryCategory =
        routing.primaryCategory || "personal_life_interests";
      this.logger.log(`Extracting from primary category: ${primaryCategory} for user: ${userId}`);

      // DIAGNOSTIC LOGGING: Track exact retrieval parameters
      console.log('[RETRIEVAL-DEBUG] Searching for memories:', {
        user_id: userId,
        query: query.substring(0, 100),
        category: primaryCategory,
        table: 'persistent_memories'
      });

      return await this.coreSystem.withDbClient(async (client) => {
        // SIMPLIFIED INTELLIGENT QUERY - MAIN TABLE ONLY
        let baseQuery = `
        SELECT id, user_id, category_name, subcategory_name, content, token_count, 
               relevance_score, usage_frequency, created_at, last_accessed, metadata,
               CASE 
                 -- HIGHEST PRIORITY: Informational content (answers with facts)
                 WHEN content ILIKE '%wife%' OR content ILIKE '%spouse%' OR content ILIKE '%partner%' THEN relevance_score + 1.2
                 WHEN content::text ~ '\\b(i have|i own|my \\w+|i work|i live)\\b'  
                 AND content::text ~ '\\b[A-Z][a-z]+\\b' THEN relevance_score + 1.0
                 
                 -- HIGH PRIORITY: Content with specific details (names, numbers)  
                 WHEN content::text ~* '\\b[A-Z][a-z]+\\b.*\\b[A-Z][a-z]+\\b|\\d+' 
                      AND NOT content::text ~* '\\b(do you remember|what did i tell|can you recall)\\b' 
                      THEN relevance_score + 0.7
                 
                 -- MEDIUM PRIORITY: Mixed content (questions with information)
                 WHEN content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was))\\b' 
                      THEN relevance_score + 0.4
                 
                 -- HEAVY PENALTY: Pure questions without information
                 WHEN content::text ~* '\\b(do you remember|what did i tell|can you recall|remember anything)\\b' 
                      AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was))\\b' 
                      THEN relevance_score - 0.6
                 
                 -- ZERO SCORE: AI failure responses
                 WHEN content::text ~* 'no specific mention|no recorded details|I don''t have any|no mention of' 
                      THEN 0
                 
                 ELSE relevance_score
               END as content_intelligence_score
        FROM persistent_memories
        WHERE user_id = $1 AND category_name = $2 AND relevance_score > 0
        AND (is_current = true OR is_current IS NULL)
      `;

        let queryParams = [userId, primaryCategory];
        let paramIndex = 3;

        // TOPIC-AWARE FILTERING - Fixed parameter index synchronization
        const queryNouns = this.extractImportantNouns(query.toLowerCase());
        
        // DIAGNOSTIC LOGGING: Show extracted topics
        console.log('[RETRIEVAL-DEBUG] Extracted topics from query:', {
          query: query,
          extracted_nouns: queryNouns,
          noun_count: queryNouns.length
        });
        
        if (queryNouns.length > 0) {
          // Build topic filter with correct parameter indexing
          const startIndex = paramIndex;
          const topicFilters = queryNouns
            .map((noun, i) => `content::text ILIKE $${startIndex + i}::text`)
            .join(" OR ");
          baseQuery += ` AND (${topicFilters})`;
          queryParams.push(...queryNouns.map((noun) => `%${noun}%`));
          paramIndex += queryNouns.length; // Increment AFTER adding parameters
        }

        // Add your existing semantic filters with synchronized indexing
        if (semanticAnalysis.emotionalWeight > 0.5) {
          baseQuery += ` AND (content::text ILIKE $${paramIndex}::text OR metadata->>'emotional_content' = 'true')`;
          queryParams.push(`%${semanticAnalysis.emotionalTone}%`);
          paramIndex++; // Increment after adding 1 parameter
        }

        // REMOVED: Hidden AND filters for '%my %' and '%personal%' that were breaking retrieval
        // Issue #200: These filters required exact string matches that often don't exist in compressed content
        // The topic filters (queryNouns) already provide sufficient filtering via OR logic
        // if (semanticAnalysis.personalContext) {
        //   baseQuery += ` AND (content::text ILIKE $${paramIndex}::text OR content::text ILIKE $${paramIndex + 1}::text)`;
        //   queryParams.push("%my %", "%personal%");
        //   paramIndex += 2; // Increment after adding 2 parameters
        // }

        // FILTER OUT PURE QUESTION MEMORIES
        baseQuery += ` AND NOT (
        content::text ~* '\\b(remember anything|do you remember|what did i tell|can you recall)\\b' 
        AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was)|name is|work at|live in)\\b'
      )`;

        // INTELLIGENT CONTENT-FIRST ORDERING WITH QUESTION FILTERING
        baseQuery += `
        ORDER BY 
          content_intelligence_score DESC,
          -- BOOST: Informational statements with facts
          CASE WHEN content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was))\\b' 
               AND NOT content::text ~* '\\b(remember|recall|did i tell|what did)\\b' THEN 3 ELSE 0 END DESC,
          -- BOOST: Content with proper nouns and numbers  
          CASE WHEN content::text ~* '\\b[A-Z][a-z]+\\b|\\d+' 
               AND NOT content::text ~* '\\b(remember|recall|did i tell|what did)\\b' THEN 2 ELSE 0 END DESC,
          -- PENALTY: Pure questions without informational content
          CASE WHEN content::text ~* '\\b(remember|recall|did i tell|what did)\\b' 
               AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was))\\b' THEN -2 ELSE 0 END DESC,
          relevance_score DESC,
          created_at DESC
        LIMIT 20
      `;

        this.logger.log(
          `SQL Debug: Query has ${(baseQuery.match(/\$/g) || []).length} placeholders, ${queryParams.length} parameters`,
        );
        
        // DIAGNOSTIC LOGGING: Show exact SQL query parameters
        console.log('[RETRIEVAL-DEBUG] SQL Query Parameters:', {
          param_count: queryParams.length,
          user_id: queryParams[0],
          category: queryParams[1],
          topic_filters: queryParams.slice(2).slice(0, queryNouns.length),
          all_params: queryParams
        });
        
        // DIAGNOSTIC: Log the actual SQL being executed
        console.log(`[MEMORY-ISOLATION] SQL user_id param: ${userId}`);

        const result = await client.query(baseQuery, queryParams);

        // DIAGNOSTIC LOGGING: Track exact database results
        console.log('[RETRIEVAL-DEBUG] Raw DB results:', {
          count: result.rows.length,
          user_ids: result.rows.map(r => r.user_id).slice(0, 5),
          memory_ids: result.rows.map(r => r.id).slice(0, 5),
          categories: result.rows.map(r => r.category_name).slice(0, 5),
          content_preview: result.rows.map(r => r.content?.substring(0, 50)).slice(0, 3)
        });

        // ═══════════════════════════════════════════════════════════════
        // CRITICAL: Verify all returned rows belong to this user
        // ═══════════════════════════════════════════════════════════════
        const wrongUserRows = result.rows.filter(r => r.user_id !== userId);
        if (wrongUserRows.length > 0) {
          console.error(`[MEMORY-ISOLATION] CRITICAL BUG: Retrieved ${wrongUserRows.length} rows with WRONG userId!`);
          console.error(`[MEMORY-ISOLATION] Expected: ${userId}`);
          console.error(`[MEMORY-ISOLATION] Got: ${wrongUserRows.map(r => r.user_id).join(', ')}`);
          // Filter them out as emergency protection
          const filteredRows = result.rows.filter(r => r.user_id === userId);
          this.logger.log(
            `Retrieved ${filteredRows.length} memories with intelligent content ordering (filtered ${wrongUserRows.length} wrong-user rows)`,
          );
          return filteredRows;
        }
        // ═══════════════════════════════════════════════════════════════

        this.logger.log(
          `Retrieved ${result.rows.length} memories with intelligent content ordering`,
        );

        return result.rows;
      });
    } catch (error) {
      this.logger.error("Error extracting from primary category:", error);
      return [];
    }
  }

  async extractFromRelatedCategories(
    userId,
    query,
    routing,
    semanticAnalysis,
    primaryCount,
  ) {
    if (primaryCount >= 10) {
      return []; // Skip if we have enough from primary
    }

    try {
      const relatedCategories = await this.coreSystem.getRelatedCategories(
        routing.primaryCategory,
      );
      const relatedMemories = [];

      for (const relatedCategory of relatedCategories.slice(0, 2)) {
        this.logger.log(`Extracting from related category: ${relatedCategory}`);

        const memories = await this.coreSystem.withDbClient(async (client) => {
          const query_text = `
            SELECT id, user_id, category_name, subcategory_name, content, token_count,
                   relevance_score, usage_frequency, created_at, last_accessed, metadata
            FROM persistent_memories
            WHERE user_id = $1 AND category_name = $2
            AND (is_current = true OR is_current IS NULL)
            AND NOT (
              content::text ~* '\\b(remember anything|do you remember|what did i tell|can you recall)\\b'
              AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was)|name is|work at|live in)\\b'
            )
            ORDER BY relevance_score DESC, created_at DESC
            LIMIT 5
          `;

          const result = await client.query(query_text, [
            userId,
            relatedCategory,
          ]);
          return result.rows;
        });

        relatedMemories.push(...memories);
      }

      this.logger.log(
        `Retrieved ${relatedMemories.length} memories from related categories`,
      );
      return relatedMemories;
    } catch (error) {
      this.logger.error("Error extracting from related categories:", error);
      return [];
    }
  }

  /**
   * INTELLIGENT ROUTING FIX: Search memories across all categories by topic keywords
   * Used when primary routing confidence is low (< 0.80) to solve the "needle in haystack" problem
   * 
   * Problem: System stores "My kids are Sarah" in personal_life_interests but retrieves 
   * "What did I tell you about My" in tools_tech_workflow (different category)
   * 
   * Solution: Extract topic keywords and search ALL categories, not just routed category
   * 
   * @param {string} userId - User identifier
   * @param {Array<string>} topics - Topic keywords to search for
   * @param {string} excludeCategory - Primary category (already searched)
   * @returns {Promise<Array>} - Memories matching topics across all categories
   */
  async searchByTopics(userId, topics, excludeCategory) {
    try {
      // ═══════════════════════════════════════════════════════════════
      // CRITICAL: User isolation check
      // ═══════════════════════════════════════════════════════════════
      if (!userId) {
        console.error('[MEMORY-ISOLATION] searchByTopics called without userId');
        return [];
      }
      console.log(`[MEMORY-ISOLATION] searchByTopics for userId: ${userId.substring(0, 8)}...`);
      // ═══════════════════════════════════════════════════════════════

      this.logger.log(
        `[TOPIC-SEARCH] Searching ${topics.length} topics across all categories (excluding ${excludeCategory})`,
      );

      return await this.coreSystem.withDbClient(async (client) => {
        // Build topic search query - search for ANY topic keyword
        const topicFilters = topics
          .map((_, i) => `content::text ILIKE $${i + 3}::text`)
          .join(' OR ');
        
        const query = `
          SELECT id, user_id, category_name, subcategory_name, content,
                 token_count, relevance_score, usage_frequency,
                 created_at, last_accessed, metadata,
                 -- Count how many topics match (more matches = higher score)
                 (${topics.map((_, i) => `CASE WHEN content::text ILIKE $${i + 3}::text THEN 1 ELSE 0 END`).join(' + ')}) as topic_matches
          FROM persistent_memories
          WHERE user_id = $1
            AND category_name != $2
            AND relevance_score > 0.3
            AND (is_current = true OR is_current IS NULL)
            AND (${topicFilters})
            -- Filter out pure question memories
            AND NOT (
              content::text ~* '\\b(remember anything|do you remember|what did i tell|can you recall)\\b'
              AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was)|name is|work at|live in)\\b'
            )
          ORDER BY
            topic_matches DESC,  -- Prioritize memories matching multiple topics
            relevance_score DESC,
            created_at DESC
          LIMIT 10
        `;
        
        const params = [
          userId, 
          excludeCategory || 'none',
          ...topics.map(t => `%${t}%`)
        ];
        
        this.logger.log(
          `[TOPIC-SEARCH] Query has ${topics.length} topic parameters`,
        );
        
        const result = await client.query(query, params);
        
        this.logger.log(
          `[TOPIC-SEARCH] Found ${result.rows.length} memories matching topics`,
        );
        
        // Add metadata to indicate this came from topic fallback
        return result.rows.map(memory => ({
          ...memory,
          source: 'topic_fallback',
          // Slight relevance boost for multi-topic matches
          relevanceScore: (memory.relevance_score || 0) * (0.7 + (memory.topic_matches * 0.1))
        }));
      });
    } catch (error) {
      this.logger.error('[TOPIC-SEARCH] Topic-based search failed:', error);
      return [];
    }
  }

  // ================================================================
  // SOPHISTICATED SCORING SYSTEM
  // ================================================================

  async applySophisticatedScoring(
    memories,
    query,
    _semanticAnalysis,
    _routing,
  ) {
    if (!memories || memories.length === 0) return [];

    this.logger.log(
      `Applying intelligent semantic scoring to ${memories.length} memories`,
    );

    return memories.map((memory) => {
      const contentType = this.classifyContentType(memory.content);

      // Immediate exclusion of AI failures
      if (contentType === "ai_failure") {
        memory.sophisticatedScore = 0;
        return memory;
      }

      // CORE SEMANTIC INTELLIGENCE - Does this memory actually address what the user is asking about?
      const topicRelevance = this.calculateTopicRelevance(
        memory.content,
        query,
      );

      // If topic relevance is very low, don't include this memory regardless of other factors
      if (topicRelevance < 0.15) {
        memory.sophisticatedScore = 0.1;
        return memory;
      }

      // Build score based on semantic relevance first
      let score = topicRelevance * 0.8; // Topic relevance is primary factor

      // Information density boost
      const informationDensity = this.calculateInformationDensity(
        memory.content,
      );
      score += informationDensity * 0.2;

      // Recency and usage
      const recencyUsageScore = this.calculateRecencyUsageScore(memory);
      score += recencyUsageScore * 0.1;

      memory.sophisticatedScore = Math.min(score, 2.0);
      return memory;
    });
  }

  calculateTopicRelevance(memoryContent, query) {
    const memoryLower = memoryContent.toLowerCase();
    const queryLower = query.toLowerCase();

    // Extract the core topic from the query
    const queryTopic = this.extractCoreTopic(queryLower);
    const memoryTopic = this.extractCoreTopic(memoryLower);

    // If we can identify clear topics and they don't match, low relevance
    if (queryTopic && memoryTopic && queryTopic !== memoryTopic) {
      return 0.1;
    }

    // Look for direct conceptual matches
    const queryNouns = this.extractImportantNouns(queryLower);
    const memoryNouns = this.extractImportantNouns(memoryLower);

    let conceptOverlap = 0;
    for (const queryNoun of queryNouns) {
      for (const memoryNoun of memoryNouns) {
        if (queryNoun === memoryNoun) {
          conceptOverlap += 1.0;
        } else if (this.areConceptsRelated(queryNoun, memoryNoun)) {
          conceptOverlap += 0.5;
        }
      }
    }

    const topicScore =
      queryNouns.length > 0 ? conceptOverlap / queryNouns.length : 0.5;

    // Boost for exact phrase matches
    if (memoryLower.includes(queryLower)) {
      return Math.min(topicScore + 0.4, 1.0);
    }

    return Math.min(topicScore, 1.0);
  }

  extractCoreTopic(text) {
    if (
      text.includes("video game") ||
      text.includes("gaming") ||
      text.includes("franchise")
    )
      return "videogames";
    if (
      text.includes("monkey") ||
      text.includes("pet") ||
      text.includes("animal")
    )
      return "pets";
    if (
      text.includes("vehicle") ||
      text.includes("car") ||
      text.includes("drive") ||
      text.includes("truck")
    )
      return "vehicles";
    if (
      text.includes("superhero") ||
      text.includes("comic") ||
      text.includes("marvel") ||
      text.includes("hero")
    )
      return "superheroes";
    return null;
  }

  extractImportantNouns(text) {
    // Split on non-letters (removes punctuation), convert to lowercase, and filter out empty strings
    // Example: "What's my favorite color?" → ["what", "s", "my", "favorite", "color"]
    // After filtering: ["what", "favorite", "color"]
    //   - "s" removed (length 1, not > 3)
    //   - "my" removed (stopword)
    const words = text.split(/[^a-zA-Z]+/).map(word => word.toLowerCase()).filter(word => word.length > 0);
    return words.filter(
      (word) =>
        word.length > 3 &&  // Keep words with 4+ characters
        !this.stopWords.has(word)
    );
  }

  // Issue #210 Fix 3: Extract key terms for match-first scoring
  extractKeyTermsForMatching(query) {
    const queryLower = query.toLowerCase();

    // Stop words to exclude
    const stopWords = new Set(['what', 'is', 'my', 'the', 'a', 'an', 'are', 'was', 'were', 'did', 'do', 'does']);
    
    // FIX #566-STR1: Entity-specific keywords that should get extra boost in ranking
    // These indicate the user is asking about a specific thing they've mentioned
    const entityKeywords = new Set(['car', 'dog', 'cat', 'pet', 'vehicle', 'phone', 'name', 'color', 'favourite', 'favorite']);

    // Extract words that are likely to be important for matching
    const words = queryLower.match(/\b\w+\b/g) || [];

    // Filter to keep meaningful terms (longer words, not stop words)
    const keyTerms = words.filter(word =>
      word.length > 3 &&
      !stopWords.has(word) &&
      // Prioritize nouns that indicate what the user is asking about
      !/^(you|your|how|why|when|where|which|who|tell|give|show|find)$/.test(word)
    );
    
    // FIX #566-STR1: Add short entity keywords that might have been filtered
    words.forEach(word => {
      if (entityKeywords.has(word) && !keyTerms.includes(word)) {
        keyTerms.push(word);
      }
    });

    return [...new Set(keyTerms)]; // Remove duplicates
  }

  areConceptsRelated(concept1, concept2) {
    // Simple conceptual relationships
    const relationships = [
      ["vehicle", "truck"],
      ["vehicle", "car"],
      ["car", "drive"],
      ["monkey", "pet"],
      ["pet", "animal"],
      ["game", "gaming"],
      ["franchise", "series"],
    ];

    return relationships.some(
      ([a, b]) =>
        (concept1.includes(a) && concept2.includes(b)) ||
        (concept1.includes(b) && concept2.includes(a)),
    );
  }

  calculateAdvancedTextSimilarity(memoryContent, query) {
    if (!memoryContent || !query) return 0;

    const memoryLower = memoryContent.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact phrase matching gets highest priority
    if (memoryLower.includes(queryLower)) {
      return 0.9;
    }

    // Extract key nouns and context
    const memoryWords = this.extractMeaningfulWords(memoryLower);
    const queryWords = this.extractMeaningfulWords(queryLower);

    if (memoryWords.length === 0 || queryWords.length === 0) return 0;

    // Find semantic overlap - words that actually relate to the same concept
    let semanticMatches = 0;
    let totalQueryConcepts = 0;

    for (const queryWord of queryWords) {
      totalQueryConcepts++;

      // Direct word match
      if (memoryWords.includes(queryWord)) {
        semanticMatches += 1.0;
        continue;
      }

      // Contextual relationship - if query word appears near matched concepts
      for (const memoryWord of memoryWords) {
        if (
          this.areWordsContextuallyRelated(
            queryWord,
            memoryWord,
            memoryLower,
            queryLower,
          )
        ) {
          semanticMatches += 0.5;
          break;
        }
      }
    }

    // Penalize if query has specific concepts that memory doesn't address
    const conceptMismatch = this.detectConceptMismatch(queryWords, memoryWords);

    const semanticScore = semanticMatches / Math.max(totalQueryConcepts, 1);
    return Math.max(0, semanticScore - conceptMismatch);
  }

  areWordsContextuallyRelated(word1, word2, memoryText, queryText) {
    // Simple contextual understanding without predefined rules
    const word1Context = this.getWordContext(word1, queryText);
    const word2Context = this.getWordContext(word2, memoryText);

    // If both words appear in similar sentence structures, they might be related
    return (
      word1Context.length > 2 &&
      word2Context.length > 2 &&
      word1Context.some((w) => word2Context.includes(w))
    );
  }

  getWordContext(word, text) {
    const words = text.split(/\s+/);
    const wordIndex = words.indexOf(word);
    if (wordIndex === -1) return [];

    const start = Math.max(0, wordIndex - 2);
    const end = Math.min(words.length, wordIndex + 3);
    return words.slice(start, end);
  }

  detectConceptMismatch(queryWords, memoryWords) {
    // If query has very specific terms that memory completely lacks
    const specificQueryTerms = queryWords.filter((w) => w.length > 4);
    const hasAnySpecificMatch = specificQueryTerms.some((term) =>
      memoryWords.some((mw) => mw.includes(term) || term.includes(mw)),
    );

    return specificQueryTerms.length > 0 && !hasAnySpecificMatch ? 0.3 : 0;
  }

  calculateIntentAlignment(memory, semanticAnalysis) {
    const content = memory.content.toLowerCase();

    const alignmentScores = {
      memory_recall: 0.9,
      personal_sharing: 0.7,
      problem_solving: 0.8,
      emotional_expression: 0.6,
      information_request: 0.5,
      decision_making: 0.6,
    };

    let baseScore = alignmentScores[semanticAnalysis.intent] || 0.4;

    if (
      semanticAnalysis.intent === "memory_recall" &&
      content.includes("remember")
    ) {
      baseScore += 0.2;
    }

    if (
      semanticAnalysis.personalContext &&
      (content.includes("my ") || content.includes("personal"))
    ) {
      baseScore += 0.15;
    }

    return Math.min(baseScore, 1.0);
  }

  calculateEmotionalContextMatch(memory, semanticAnalysis) {
    if (semanticAnalysis.emotionalWeight === 0) return 0.5;

    const memoryContent = memory.content.toLowerCase();
    let memoryEmotionalWeight = 0;

    for (const [emotion, weight] of this.emotionalWeights) {
      if (memoryContent.includes(emotion)) {
        memoryEmotionalWeight = Math.max(memoryEmotionalWeight, weight);
      }
    }

    if (memory.metadata?.emotional_content === "true") {
      memoryEmotionalWeight = Math.max(memoryEmotionalWeight, 0.6);
    }

    if (semanticAnalysis.emotionalWeight > 0.5 && memoryEmotionalWeight > 0.5) {
      return 0.9;
    } else if (
      semanticAnalysis.emotionalWeight > 0.3 &&
      memoryEmotionalWeight > 0.3
    ) {
      return 0.7;
    } else if (
      Math.abs(semanticAnalysis.emotionalWeight - memoryEmotionalWeight) < 0.2
    ) {
      return 0.6;
    }

    return 0.3;
  }

  classifyContentType(content) {
    const questionPatterns = [
      /do you remember/i,
      /what did i tell you/i,
      /did i mention/i,
      /can you recall/i,
      /remember anything/i,
      /you remember/i,
    ];

    const informationPatterns = [
      /my \w+ (is|are|was)/i,
      /i have \d+/i,
      /i drive a/i,
      /i own/i,
      /my name is/i,
      /i work at/i,
      /i live in/i,
    ];

    const isQuestion = questionPatterns.some((pattern) =>
      pattern.test(content),
    );
    const isInformation = informationPatterns.some((pattern) =>
      pattern.test(content),
    );

    if (
      content.includes("Assistant:") &&
      content.includes("no specific mention")
    ) {
      return "ai_failure";
    }

    if (isQuestion && !isInformation) return "interrogative";
    if (isInformation && !isQuestion) return "informational";
    return "mixed";
  }

  calculateRecencyUsageScore(memory) {
    let score = 0;

    try {
      const now = new Date();
      const createdDate = new Date(memory.created_at);
      const lastAccessedDate = new Date(
        memory.last_accessed || memory.created_at,
      );

      const ageInDays = (now - createdDate) / (1000 * 60 * 60 * 24);
      const lastAccessDays = (now - lastAccessedDate) / (1000 * 60 * 60 * 24);

      // Creation recency
      if (ageInDays < 1) score += 0.4;
      else if (ageInDays < 7) score += 0.3;
      else if (ageInDays < 30) score += 0.2;
      else if (ageInDays < 90) score += 0.1;

      // Access recency
      if (lastAccessDays < 1) score += 0.3;
      else if (lastAccessDays < 7) score += 0.2;
      else if (lastAccessDays < 30) score += 0.1;
    } catch {
      score = 0.1;
    }

    // Usage frequency boost
    const usageFreq = memory.usage_frequency || 0;
    if (usageFreq > 10) score += 0.3;
    else if (usageFreq > 5) score += 0.2;
    else if (usageFreq > 2) score += 0.1;

    return Math.min(score, 1.0);
  }

  calculateInformationDensity(content) {
    const properNouns = (content.match(/[A-Z][a-z]+/g) || []).length;
    const numbers = (content.match(/\d+/g) || []).length;
    const specificWords = [
      "named",
      "called",
      "drive",
      "own",
      "have",
      "work",
      "live",
      "married",
      "daughter",
      "son",
    ].filter((word) => content.toLowerCase().includes(word)).length;

    const totalWords = content.split(/\s+/).length;
    const density =
      (properNouns + numbers + specificWords) / Math.max(totalWords, 1);

    return Math.min(density * 2, 1.0); // Scale to 0-1 range
  }

  extractMeaningfulWords(text) {
    if (!text) return [];

    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2 &&
          !this.stopWords.has(word.toLowerCase()) &&
          !/^\d+$/.test(word),
      )
      .map((word) => word.toLowerCase());
  }

  applyIntelligentRanking(memories, _semanticAnalysis) {
    return memories.sort((a, b) => {
      // PRIORITY 1: Content intelligence score (if available from SQL)
      if (a.content_intelligence_score && b.content_intelligence_score) {
        const intelligenceDiff =
          b.content_intelligence_score - a.content_intelligence_score;
        if (Math.abs(intelligenceDiff) > 0.1) {
          return intelligenceDiff;
        }
      }

      // PRIORITY 2: Sophisticated score
      const scoreDiff = b.sophisticatedScore - a.sophisticatedScore;
      if (Math.abs(scoreDiff) > 0.05) {
        return scoreDiff;
      }

      // PRIORITY 3: Content type classification
      const aContentType = this.classifyContentType(a.content);
      const bContentType = this.classifyContentType(b.content);

      const typeScores = {
        informational: 3,
        mixed: 2,
        interrogative: 1,
        ai_failure: 0,
      };
      const aTypeScore = typeScores[aContentType] || 0;
      const bTypeScore = typeScores[bContentType] || 0;

      if (aTypeScore !== bTypeScore) {
        return bTypeScore - aTypeScore;
      }

      // PRIORITY 4: Usage frequency (only if types are equal)
      const usageDiff = (b.usage_frequency || 0) - (a.usage_frequency || 0);
      if (Math.abs(usageDiff) > 2) {
        return usageDiff;
      }

      // FINAL: Recency
      const aTime = new Date(a.last_accessed || a.created_at).getTime();
      const bTime = new Date(b.last_accessed || b.created_at).getTime();
      return bTime - aTime;
    });
  }
  async applyIntelligentTokenManagement(memories, tokenLimit) {
    if (!memories || memories.length === 0) return [];

    let totalTokens = 0;
    const result = [];
    const highValueReserve = Math.floor(tokenLimit * 0.15);

    // First pass: Add memories within main budget
    const mainBudget = tokenLimit - highValueReserve;
    for (const memory of memories) {
      const tokenCount =
        memory.token_count || Math.ceil(memory.content.length / 4);

      if (totalTokens + tokenCount <= mainBudget) {
        result.push(memory);
        totalTokens += tokenCount;

        // Update access tracking
        await this.coreSystem.updateMemoryAccess(memory.id);
      } else {
        break;
      }
    }

    // Second pass: Use reserve for high-value content
    const remainingMemories = memories.slice(result.length);
    const highValueMemories = remainingMemories.filter(
      (m) => m.sophisticatedScore > 0.8,
    );

    for (const memory of highValueMemories) {
      const tokenCount =
        memory.token_count || Math.ceil(memory.content.length / 4);
      const availableReserve = tokenLimit - totalTokens;

      if (tokenCount <= availableReserve) {
        result.push(memory);
        totalTokens += tokenCount;
        await this.coreSystem.updateMemoryAccess(memory.id);
      }
    }

    // CRITICAL FIX: Enforce strict 2400 token budget
    let budgetUsed = 0;
    const tokenBudget = 2400;
    const enforcedMemories = [];

    for (const memory of result) {
      const tokens = memory.token_count || Math.ceil(memory.content.length / 4);
      if (budgetUsed + tokens <= tokenBudget) {
        enforcedMemories.push(memory);
        budgetUsed += tokens;
      } else {
        this.logger.warn(`Token budget reached. Excluding memory ${memory.id}`);
        break;
      }
    }

    // CRITICAL: Enforce strict memory count cap (default: 15 memories maximum)
    // INCREASED FROM 5 (Issue #582): System needs 10-15 memories for:
    // - Multiple entities with same name (NUA1: two different "Alex")
    // - Volume stress (STR1: 10+ facts stored, need to find Tesla at rank #9)
    // - Complex queries requiring full context
    // This prevents token-efficient memories from flooding the context
    const MAX_MEMORIES = 15;
    const cappedMemories = enforcedMemories.slice(0, MAX_MEMORIES);

    if (cappedMemories.length < enforcedMemories.length) {
      this.logger.log(
        `Memory count cap enforced: ${cappedMemories.length}/${enforcedMemories.length} memories (max: ${MAX_MEMORIES})`,
      );
    }

    this.logger.log(
      `Token enforcement: ${cappedMemories.length}/${result.length} memories, ${budgetUsed}/${tokenBudget} tokens`,
    );
    return cappedMemories;
  }

  // ================================================================
  // RELEVANCE SCORE CALCULATION - calculateRelevanceScore
  // ================================================================

  async calculateRelevanceScore(content, metadata = {}) {
    try {
      let relevance = 0.5; // Base relevance

      // Emotional weight analysis
      let emotionalWeight = 0;
      for (const [emotion, weight] of this.emotionalWeights) {
        if (content.toLowerCase().includes(emotion)) {
          emotionalWeight = Math.max(emotionalWeight, weight);
        }
      }

      if (emotionalWeight > 0) {
        relevance += emotionalWeight * 0.2;
      }

      // Question detection
      if (content.includes("?")) {
        relevance += 0.1;
      }

      // Personal context detection
      if (
        /\b(my|our|personal|private|family|i am|i have|we are|we have)\b/i.test(
          content,
        )
      ) {
        relevance += 0.1;
      }

      // Metadata enhancements
      if (metadata.userMarkedImportant) {
        relevance += 0.2;
      }

      if (metadata.urgency === "high") {
        relevance += 0.15;
      }

      if (metadata.emotional_content === "true") {
        relevance += 0.1;
      }

      // Length consideration (longer content might be more detailed)
      const contentLength = content.length;
      if (contentLength > 200) {
        relevance += Math.min((contentLength - 200) / 1000, 0.1);
      }

      return Math.max(0.1, Math.min(relevance, 1.0));
    } catch (error) {
      this.logger.error("Error calculating relevance score:", error);
      return 0.5; // Default fallback
    }
  }

  // ================================================================
  // INTELLIGENCE-ENHANCED MEMORY EXTRACTION
  // ================================================================

  async extractIntelligentMemory(query, userId, intelligenceContext = null) {
    console.log(
      "🧠 INTELLIGENT MEMORY: Enhanced extraction with reasoning context",
    );

    try {
      // Standard memory extraction first
      const baseExtraction = await this.extractRelevantMemories(userId, query, {
        primaryCategory: "personal_life_interests",
      });

      // Enhance with intelligence context if available
      const enhancedExtraction = {
        memories: baseExtraction,
        intelligenceEnhanced: true,
        reasoningSupport: [],
        crossDomainConnections: [],
        scenarioRelevantMemories: [],
        quantitativeContext: [],
      };

      if (baseExtraction && baseExtraction.length > 0) {
        // Add reasoning support analysis
        enhancedExtraction.reasoningSupport =
          this.identifyReasoningSupportMemories(baseExtraction, query);

        // Find cross-domain memory connections
        enhancedExtraction.crossDomainConnections =
          await this.findCrossDomainMemoryConnections(
            baseExtraction,
            "personal_life_interests",
          );

        // Extract scenario-relevant historical context
        enhancedExtraction.scenarioRelevantMemories =
          this.extractScenarioRelevantMemories(baseExtraction, query);

        // Identify quantitative/numerical context from memory
        enhancedExtraction.quantitativeContext =
          this.extractQuantitativeMemoryContext(baseExtraction);
      }

      // Intelligence-enhanced memory scoring
      if (intelligenceContext) {
        enhancedExtraction.memories = this.applyIntelligenceAwareScoring(
          enhancedExtraction.memories,
          intelligenceContext,
        );
      }

      console.log(
        `🎯 Intelligent memory extraction complete. Enhanced features: ${Object.keys(
          enhancedExtraction,
        )
          .filter(
            (k) => enhancedExtraction[k] && enhancedExtraction[k].length > 0,
          )
          .join(", ")}`,
      );

      return enhancedExtraction;
    } catch (error) {
      this.logger.error("Intelligent memory extraction error:", error);
      // Fallback to standard extraction
      return await this.extractRelevantMemories(userId, query, {
        primaryCategory: "personal_life_interests",
      });
    }
  }

  // ================================================================
  // REASONING SUPPORT IDENTIFICATION
  // ================================================================

  identifyReasoningSupportMemories(memories, query) {
    const reasoningSupport = [];

    for (const memory of memories) {
      const support = {
        memory_id: memory.id,
        content: memory.content,
        supportType: "general",
        relevanceToReasoning: 0.5,
      };

      // Identify premise support
      if (this.supportsPremise(memory.content, query)) {
        support.supportType = "premise";
        support.relevanceToReasoning = 0.8;
      }
      // Identify evidence support
      else if (this.providesEvidence(memory.content, query)) {
        support.supportType = "evidence";
        support.relevanceToReasoning = 0.9;
      }
      // Identify counterexample support
      else if (this.providesCounterexample(memory.content, query)) {
        support.supportType = "counterexample";
        support.relevanceToReasoning = 0.7;
      }
      // Identify pattern support
      else if (this.establishesPattern(memory.content, query)) {
        support.supportType = "pattern";
        support.relevanceToReasoning = 0.6;
      }

      if (support.relevanceToReasoning > 0.5) {
        reasoningSupport.push(support);
      }
    }

    return reasoningSupport.sort(
      (a, b) => b.relevanceToReasoning - a.relevanceToReasoning,
    );
  }

  // ================================================================
  // CROSS-DOMAIN MEMORY CONNECTIONS
  // ================================================================

  async findCrossDomainMemoryConnections(memories, _primaryCategory) {
    const connections = [];
    const categoryMemoryMap = new Map();

    // Group memories by category
    for (const memory of memories) {
      if (!categoryMemoryMap.has(memory.category_name)) {
        categoryMemoryMap.set(memory.category_name, []);
      }
      categoryMemoryMap.get(memory.category_name).push(memory);
    }

    // Find meaningful cross-category connections
    const categories = Array.from(categoryMemoryMap.keys());
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const connection = this.analyzeCategoryConnection(
          categories[i],
          categories[j],
          categoryMemoryMap.get(categories[i]),
          categoryMemoryMap.get(categories[j]),
        );

        if (connection.strength > 0.6) {
          connections.push(connection);
        }
      }
    }

    return connections;
  }

  analyzeCategoryConnection(category1, category2, memories1, memories2) {
    const connectionPatterns = {
      "work_career-money_income_debt": {
        strength: 0.9,
        relationship: "Career decisions directly impact financial stability",
      },
      "health_wellness-work_career": {
        strength: 0.8,
        relationship: "Health affects work performance and career decisions",
      },
      "relationships_social-mental_emotional": {
        strength: 0.9,
        relationship:
          "Social relationships strongly influence emotional wellbeing",
      },
      "business-legal": {
        strength: 0.8,
        relationship:
          "Business decisions require legal compliance consideration",
      },
      "personal_life_interests-goals_active_current": {
        strength: 0.7,
        relationship:
          "Personal interests influence goal setting and priorities",
      },
    };

    const key1 = `${category1}-${category2}`;
    const key2 = `${category2}-${category1}`;
    const pattern = connectionPatterns[key1] || connectionPatterns[key2];

    if (pattern) {
      return {
        from: category1,
        to: category2,
        strength: pattern.strength,
        relationship: pattern.relationship,
        supportingMemories: {
          category1: memories1.slice(0, 2),
          category2: memories2.slice(0, 2),
        },
      };
    }

    // Default weak connection
    return {
      from: category1,
      to: category2,
      strength: 0.4,
      relationship: "Potential indirect relationship exists",
      supportingMemories: {},
    };
  }

  // ================================================================
  // SCENARIO-RELEVANT MEMORY EXTRACTION
  // ================================================================

  extractScenarioRelevantMemories(memories, _query) {
    const scenarioMemories = {
      successPatterns: [],
      failurePatterns: [],
      riskFactors: [],
      decisionOutcomes: [],
    };

    for (const memory of memories) {
      const content = memory.content.toLowerCase();

      // Success patterns
      if (
        content.includes("success") ||
        content.includes("worked") ||
        content.includes("achieved")
      ) {
        scenarioMemories.successPatterns.push({
          memory_id: memory.id,
          content: memory.content,
          relevance: 0.8,
        });
      }

      // Failure patterns
      if (
        content.includes("failed") ||
        content.includes("mistake") ||
        content.includes("wrong")
      ) {
        scenarioMemories.failurePatterns.push({
          memory_id: memory.id,
          content: memory.content,
          relevance: 0.9, // Failures are highly relevant for risk assessment
        });
      }

      // Risk factors
      if (
        content.includes("risk") ||
        content.includes("problem") ||
        content.includes("issue")
      ) {
        scenarioMemories.riskFactors.push({
          memory_id: memory.id,
          content: memory.content,
          relevance: 0.85,
        });
      }

      // Decision outcomes
      if (
        content.includes("decided") ||
        content.includes("chose") ||
        content.includes("resulted")
      ) {
        scenarioMemories.decisionOutcomes.push({
          memory_id: memory.id,
          content: memory.content,
          relevance: 0.7,
        });
      }
    }

    return scenarioMemories;
  }

  // ================================================================
  // QUANTITATIVE MEMORY CONTEXT
  // ================================================================

  extractQuantitativeMemoryContext(memories) {
    const quantitativeContext = [];

    for (const memory of memories) {
      const numbers = this.extractNumbersFromMemory(memory.content);
      if (numbers.length > 0) {
        quantitativeContext.push({
          memory_id: memory.id,
          content: memory.content,
          numbers: numbers,
          context: this.categorizeNumbers(numbers, memory.content),
          relevance: 0.8,
        });
      }
    }

    return quantitativeContext;
  }

  extractNumbersFromMemory(text) {
    const numberPattern = /\$?[\d,]+\.?\d*%?/g;
    const matches = text.match(numberPattern) || [];
    return matches.map((match) => ({
      raw: match,
      value: parseFloat(match.replace(/[$,%]/g, "")),
      type: this.classifyNumber(match),
    }));
  }

  classifyNumber(numberString) {
    if (numberString.includes("$")) return "currency";
    if (numberString.includes("%")) return "percentage";
    if (parseFloat(numberString) > 1900 && parseFloat(numberString) < 2100)
      return "year";
    return "general";
  }

  categorizeNumbers(numbers, context) {
    const contextLower = context.toLowerCase();

    if (
      contextLower.includes("revenue") ||
      contextLower.includes("income") ||
      contextLower.includes("profit")
    ) {
      return "financial";
    }
    if (
      contextLower.includes("time") ||
      contextLower.includes("hour") ||
      contextLower.includes("day")
    ) {
      return "temporal";
    }
    if (contextLower.includes("goal") || contextLower.includes("target")) {
      return "target";
    }

    return "general";
  }

  // ================================================================
  // INTELLIGENCE-AWARE SCORING
  // ================================================================

  applyIntelligenceAwareScoring(memories, intelligenceContext) {
    if (!memories || !intelligenceContext) return memories;

    return memories.map((memory) => {
      let enhancedScore = memory.relevance_score || 0.5;

      // Boost for reasoning support
      if (
        intelligenceContext.requiresReasoning &&
        this.supportsReasoning(memory.content)
      ) {
        enhancedScore += 0.2;
      }

      // Boost for cross-domain relevance
      if (
        intelligenceContext.crossDomainAnalysis &&
        this.supportsCrossDomain(memory.content)
      ) {
        enhancedScore += 0.15;
      }

      // Boost for scenario planning
      if (
        intelligenceContext.scenarioAnalysis &&
        this.supportsScenarios(memory.content)
      ) {
        enhancedScore += 0.1;
      }

      // Boost for quantitative context
      if (
        intelligenceContext.quantitativeAnalysis &&
        this.containsNumbers(memory.content)
      ) {
        enhancedScore += 0.1;
      }

      return {
        ...memory,
        relevance_score: Math.min(enhancedScore, 1.0),
        intelligence_enhanced: true,
      };
    });
  }

  // ================================================================
  // HELPER FUNCTIONS FOR INTELLIGENCE INTEGRATION
  // ================================================================

  supportsPremise(content, query) {
    // Simple heuristic - looks for supporting statements
    return (
      content.toLowerCase().includes("because") ||
      content.toLowerCase().includes("since") ||
      this.hasSharedKeywords(content, query)
    );
  }

  providesEvidence(content, _query) {
    return (
      content.toLowerCase().includes("data") ||
      content.toLowerCase().includes("evidence") ||
      content.toLowerCase().includes("example") ||
      this.containsNumbers(content)
    );
  }

  providesCounterexample(content, _query) {
    return (
      content.toLowerCase().includes("however") ||
      content.toLowerCase().includes("but") ||
      content.toLowerCase().includes("except")
    );
  }

  establishesPattern(content, _query) {
    return (
      content.toLowerCase().includes("always") ||
      content.toLowerCase().includes("usually") ||
      content.toLowerCase().includes("pattern") ||
      content.toLowerCase().includes("tend")
    );
  }

  supportsReasoning(content) {
    return (
      content.includes("because") ||
      content.includes("therefore") ||
      content.includes("logic") ||
      content.includes("reason")
    );
  }

  supportsCrossDomain(content) {
    const domains = [
      "business",
      "personal",
      "health",
      "financial",
      "legal",
      "technical",
    ];
    let domainCount = 0;
    for (const domain of domains) {
      if (content.toLowerCase().includes(domain)) domainCount++;
    }
    return domainCount >= 2;
  }

  supportsScenarios(content) {
    return (
      content.includes("outcome") ||
      content.includes("result") ||
      content.includes("consequence") ||
      content.includes("impact")
    );
  }

  containsNumbers(content) {
    return /\d/.test(content);
  }

  hasSharedKeywords(content, query) {
    const contentWords = content.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);
    const sharedWords = contentWords.filter(
      (word) => queryWords.includes(word) && word.length > 3,
    );
    return sharedWords.length >= 2;
  }

  // ================================================================
  // MULTI-DIMENSIONAL RELEVANCE SCORING (From Spec)
  // ================================================================

  /**
   * Calculate multi-dimensional relevance score as specified in requirements
   * ISSUE #544 FIX: Dramatically increased recency weight to prioritize new memories
   * Old: recency=0.1 (10%) - new memories couldn't compete with old ones
   * New: recency=0.4 (40%) - recent memories now dominate ranking
   * Weights: semantic (0.3) + keyword (0.2) + recency (0.4) + importance (0.05) + usage (0.05)
   */
  calculateMultiDimensionalRelevance(semanticScore, keywordScore, recencyScore, importanceScore, usageScore) {
    return (
      (semanticScore * 0.3) +      // Reduced from 0.4
      (keywordScore * 0.2) +        // Reduced from 0.3
      (recencyScore * 0.4) +        // INCREASED from 0.1 - THIS IS THE KEY FIX
      (importanceScore * 0.05) +    // Reduced from 0.1
      (usageScore * 0.05)           // Reduced from 0.1
    );
  }

  /**
   * Calculate semantic similarity between query and memory content
   */
  calculateSemanticSimilarity(query, content) {
    if (!query || !content) return 0;

    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    // Exact phrase match gets highest score
    if (contentLower.includes(queryLower)) {
      return 1.0;
    }

    // Extract meaningful words and calculate overlap
    const queryWords = this.extractMeaningfulWords(queryLower);
    const contentWords = this.extractMeaningfulWords(contentLower);

    if (queryWords.length === 0 || contentWords.length === 0) return 0;

    // Calculate word overlap
    let matchCount = 0;
    for (const queryWord of queryWords) {
      if (contentWords.includes(queryWord)) {
        matchCount++;
      } else {
        // Check for partial matches (e.g., "superhero" matches "superheroes")
        const partialMatch = contentWords.some(cw => 
          cw.includes(queryWord) || queryWord.includes(cw)
        );
        if (partialMatch) {
          matchCount += 0.5;
        }
      }
    }

    // Normalize by query length
    const semanticSimilarity = matchCount / queryWords.length;

    // Boost if content contains key query nouns
    const queryNouns = this.extractImportantNouns(queryLower);
    const contentNouns = this.extractImportantNouns(contentLower);
    const nounOverlap = queryNouns.filter(qn => contentNouns.includes(qn)).length;
    const nounBoost = queryNouns.length > 0 ? (nounOverlap / queryNouns.length) * 0.3 : 0;

    return Math.min(semanticSimilarity + nounBoost, 1.0);
  }

  /**
   * Calculate keyword match score
   */
  calculateKeywordMatch(query, content) {
    const queryKeywords = this.extractImportantNouns(query.toLowerCase());
    const contentLower = content.toLowerCase();

    if (queryKeywords.length === 0) return 0.5;

    let matchScore = 0;
    for (const keyword of queryKeywords) {
      if (contentLower.includes(keyword)) {
        matchScore += 1.0;
      } else {
        // Check for word variations
        const variations = [
          keyword + 's',
          keyword + 'es',
          keyword.slice(0, -1), // remove last char
          keyword.slice(0, -2), // remove last 2 chars
        ];
        if (variations.some(v => contentLower.includes(v))) {
          matchScore += 0.7;
        }
      }
    }

    return Math.min(matchScore / queryKeywords.length, 1.0);
  }

  /**
   * Calculate recency boost score
   * ISSUE #544 FIX: EXPONENTIAL boost for brand-new memories to ensure immediate recall
   */
  calculateRecencyBoost(createdAt, lastAccessed) {
    try {
      const now = Date.now();
      const created = new Date(createdAt).getTime();
      const accessed = new Date(lastAccessed || createdAt).getTime();

      const ageInSeconds = (now - created) / 1000;
      const ageInMinutes = ageInSeconds / 60;
      const ageInHours = ageInMinutes / 60;
      const ageInDays = ageInHours / 24;

      // ISSUE #544 FIX: EXPONENTIAL recency boost for very recent memories
      // This ensures memories stored seconds/minutes ago ALWAYS outrank old ones
      let recencyScore = 0;

      // IMMEDIATE RECALL ZONE (< 60 seconds) - MAXIMUM PRIORITY
      if (ageInSeconds < 60) {
        recencyScore = 1.0;  // Perfect score - guarantees top ranking
        console.log(`[RECENCY-BOOST] IMMEDIATE: Memory ${ageInSeconds.toFixed(1)}s old - score: 1.0 (MAXIMUM)`);
      }
      // VERY RECENT (1-5 minutes) - EXTREMELY HIGH PRIORITY
      else if (ageInMinutes < 5) {
        recencyScore = 0.95;  // Near-perfect - should beat all old memories
        console.log(`[RECENCY-BOOST] VERY_RECENT: Memory ${ageInMinutes.toFixed(1)}m old - score: 0.95`);
      }
      // RECENT (5-60 minutes) - HIGH PRIORITY
      else if (ageInMinutes < 60) {
        recencyScore = 0.85;  // Very high - strong preference
        console.log(`[RECENCY-BOOST] RECENT: Memory ${ageInMinutes.toFixed(1)}m old - score: 0.85`);
      }
      // SAME DAY (< 1 hour - 24 hours) - MODERATE PRIORITY
      else if (ageInHours < 24) {
        recencyScore = 0.7;  // Good score - should win over week-old
        console.log(`[RECENCY-BOOST] SAME_DAY: Memory ${ageInHours.toFixed(1)}h old - score: 0.7`);
      }
      // THIS WEEK (< 7 days) - NORMAL PRIORITY
      else if (ageInDays < 7) {
        recencyScore = 0.5;  // Moderate boost
      }
      // THIS MONTH (< 30 days) - LOW PRIORITY
      else if (ageInDays < 30) {
        recencyScore = 0.3;  // Small boost
      }
      // OLDER (30-90 days) - MINIMAL PRIORITY
      else if (ageInDays < 90) {
        recencyScore = 0.2;  // Very small boost
      }
      // ANCIENT (> 90 days) - NO PRIORITY
      else {
        recencyScore = 0.1;  // Baseline score
      }

      // Additional bonus for recently accessed (but not as strong as creation recency)
      const accessedSecondsAgo = (now - accessed) / 1000;
      const accessedMinutesAgo = accessedSecondsAgo / 60;
      const accessedDaysAgo = accessedMinutesAgo / (60 * 24);

      if (accessedSecondsAgo < 60) {
        recencyScore += 0.1;  // Small bonus for just-accessed
      } else if (accessedMinutesAgo < 60) {
        recencyScore += 0.05;
      } else if (accessedDaysAgo < 7) {
        recencyScore += 0.03;
      }

      return Math.min(recencyScore, 1.0);
    } catch (error) {
      console.error('[RECENCY-BOOST] Error calculating recency:', error);
      return 0.5; // Default middle value
    }
  }

  /**
   * Select diverse memories with temporal diversity (from spec)
   * Mix: 70% from relevant+recent, 30% from relevant+older
   */
  selectDiverseMemories(memories, tokenBudget) {
    if (!memories || memories.length === 0) return [];

    // Sort by relevance score (already sorted from previous step)
    const sorted = memories.sort((a, b) => {
      return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    });

    // Take top 50% by relevance
    const topRelevant = sorted.slice(0, Math.ceil(sorted.length / 2));

    if (topRelevant.length === 0) return [];

    // Split by temporal categories
    const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    const older = [];
    const newer = [];

    for (const memory of topRelevant) {
      try {
        const created = new Date(memory.created_at).getTime();
        if (created < recentCutoff) {
          older.push(memory);
        } else {
          newer.push(memory);
        }
      } catch {
        newer.push(memory); // Default to newer if date parsing fails
      }
    }

    // Calculate token budget allocation
    const estimatedTokensPerMemory = 120; // Rough estimate
    const maxMemories = Math.floor(tokenBudget / estimatedTokensPerMemory);
    const newerCount = Math.ceil(maxMemories * 0.7);
    const olderCount = Math.floor(maxMemories * 0.3);

    // Mix: 70% newer, 30% older
    const selected = [
      ...newer.slice(0, newerCount),
      ...older.slice(0, olderCount)
    ];

    this.logger.log(
      `Temporal diversity: ${newer.slice(0, newerCount).length} recent + ${older.slice(0, olderCount).length} older = ${selected.length} total`
    );

    return selected;
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================

  calculateTotalTokens(memories) {
    return memories.reduce((sum, memory) => sum + (memory.token_count || 0), 0);
  }

  generateCacheKey(query, userId) {
    return `${query.substring(0, 100)}_${userId || "anon"}`;
  }

  cacheResult(key, result) {
    if (this.routingCache.size >= this.maxCacheSize) {
      const firstKey = this.routingCache.keys().next().value;
      this.routingCache.delete(firstKey);
    }
    this.routingCache.set(key, result);
  }

  cacheSemanticResult(key, result) {
    if (this.semanticCache.size >= this.maxCacheSize) {
      const firstKey = this.semanticCache.keys().next().value;
      this.semanticCache.delete(firstKey);
    }
    this.semanticCache.set(key, result);
  }

  createFallbackRoutingResult(reason) {
    return {
      primaryCategory: "personal_life_interests",
      subcategory: "General",
      confidence: 0.3,
      alternativeCategory: null,
      reasoning: `Fallback: ${reason}`,
      isFallback: true,
      overrideApplied: false,
    };
  }

  // ================================================================
  // ANALYTICS AND PERFORMANCE TRACKING
  // ================================================================

  updateRoutingAnalytics(result, processingTime) {
    try {
      this.routingStats.totalRoutes++;

      // Update category distribution
      const category = result.primaryCategory;
      const current = this.routingStats.categoryDistribution.get(category) || 0;
      this.routingStats.categoryDistribution.set(category, current + 1);

      // Update confidence statistics
      const count = this.routingStats.totalRoutes;
      const currentAvg = this.routingStats.avgConfidence;
      this.routingStats.avgConfidence =
        (currentAvg * (count - 1) + result.confidence) / count;

      // Update processing time
      const currentAvgTime = this.routingStats.avgProcessingTime;
      this.routingStats.avgProcessingTime =
        (currentAvgTime * (count - 1) + processingTime) / count;

      // Track confidence levels
      if (result.confidence > 0.8) {
        this.routingStats.highConfidenceRoutes++;
      } else if (result.confidence < 0.5) {
        this.routingStats.lowConfidenceRoutes++;
      }

      // Update cache hit rate
      const totalRequests =
        this.routingStats.cacheHits + this.routingStats.cacheMisses;
      this.routingStats.cacheHitRate =
        totalRequests > 0 ? this.routingStats.cacheHits / totalRequests : 0;
    } catch (error) {
      this.logger.warn("Error updating routing analytics:", error);
    }
  }

  updateExtractionAnalytics(memories, routing, processingTime) {
    try {
      this.extractionStats.totalExtractions++;

      // Update average extraction time
      const count = this.extractionStats.totalExtractions;
      const currentAvgTime = this.extractionStats.avgExtractionTime;
      this.extractionStats.avgExtractionTime =
        (currentAvgTime * (count - 1) + processingTime) / count;

      // Update average tokens extracted
      const totalTokens = this.calculateTotalTokens(memories);
      const currentAvgTokens = this.extractionStats.avgTokensExtracted;
      this.extractionStats.avgTokensExtracted =
        (currentAvgTokens * (count - 1) + totalTokens) / count;

      // Update category distribution
      if (routing?.primaryCategory) {
        const category = routing.primaryCategory;
        const current =
          this.extractionStats.categoryDistribution.get(category) || 0;
        this.extractionStats.categoryDistribution.set(category, current + 1);
      }
    } catch (error) {
      this.logger.warn("Error updating extraction analytics:", error);
    }
  }

  getRoutingStats() {
    return {
      totalRoutes: this.routingStats.totalRoutes,
      categoryDistribution: Object.fromEntries(
        this.routingStats.categoryDistribution,
      ),
      avgConfidence: Number(this.routingStats.avgConfidence.toFixed(3)),
      avgProcessingTime: Math.round(this.routingStats.avgProcessingTime),
      highConfidenceRoutes: this.routingStats.highConfidenceRoutes,
      lowConfidenceRoutes: this.routingStats.lowConfidenceRoutes,
      overrideApplications: this.routingStats.overrideApplications,
      cacheHitRate: Number(this.routingStats.cacheHitRate.toFixed(3)),
      uptime: Date.now() - this.routingStats.lastReset,
      cacheSize: this.routingCache.size,
    };
  }

  getExtractionStats() {
    return {
      ...this.extractionStats,
      categoryDistribution: Object.fromEntries(
        this.extractionStats.categoryDistribution,
      ),
      uptime: Date.now() - this.extractionStats.lastReset,
      cacheSize: this.extractionCache.size,
    };
  }

  cleanup() {
    this.routingCache.clear();
    this.semanticCache.clear();
    this.extractionCache.clear();
    this.logger.log("Intelligence System caches cleared");
  }

  // ================================================================
  // SIMPLE SIMILARITY SCORING
  // ================================================================

  calculateContentSimilarity(query, memoryContent) {
    if (!query || !memoryContent) return 0;

    const queryWords = this.extractQueryWords(query.toLowerCase());
    const memoryWords = this.extractQueryWords(memoryContent.toLowerCase());

    if (queryWords.length === 0 || memoryWords.length === 0) return 0;

    // Direct word overlap scoring
    let matches = 0;
    for (const queryWord of queryWords) {
      if (memoryWords.includes(queryWord)) {
        matches++;
      } else {
        // Check for partial matches (3+ characters)
        for (const memoryWord of memoryWords) {
          if (queryWord.length >= 3 && memoryWord.includes(queryWord)) {
            matches += 0.5;
            break;
          }
        }
      }
    }

    return matches / queryWords.length;
  }

  extractQueryWords(text) {
    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !this.isCommonWord(word));
  }

  isCommonWord(word) {
    const common = [
      "the",
      "and",
      "you",
      "that",
      "was",
      "for",
      "are",
      "with",
      "his",
      "they",
      "have",
      "this",
      "will",
      "can",
      "had",
      "her",
      "what",
      "said",
      "each",
      "which",
    ];
    return common.includes(word);
  }

  // ================================================================
  // CROSS-CATEGORY FALLBACK SEARCH
  // ================================================================

  async tryRelatedCategories(userId, query, routing, _semanticAnalysis) {
    // Define category relationships
    const categoryRelations = {
      personal_life_interests: ["relationships_social", "home_lifestyle"],
      relationships_social: ["personal_life_interests", "mental_emotional"],
      business_career: ["financial_management", "personal_development"],
      mental_emotional: ["relationships_social", "health_wellness"],
      home_lifestyle: ["personal_life_interests", "financial_management"],
    };

    const primaryCategory = routing.primaryCategory;
    const relatedCategories = categoryRelations[primaryCategory] || [];

    this.logger.log(
      `Trying related categories for ${primaryCategory}: ${relatedCategories.join(", ")}`,
    );

    const fallbackMemories = [];

    for (const category of relatedCategories) {
      try {
        const categoryMemories = await this.coreSystem.withDbClient(
          async (client) => {
            const result = await client.query(
              `
            SELECT id, user_id, category_name, subcategory_name, content, token_count,
                   relevance_score, usage_frequency, created_at, last_accessed, metadata
            FROM persistent_memories
            WHERE user_id = $1 AND category_name = $2 AND relevance_score > 0.3
            AND (is_current = true OR is_current IS NULL)
            AND NOT (
              content::text ~* '\\b(remember anything|do you remember|what did i tell|can you recall)\\b'
              AND NOT content::text ~* '\\b(i have|i own|my \\w+\\s+(is|are|was)|name is|work at|live in)\\b'
            )
            ORDER BY relevance_score DESC, created_at DESC
            LIMIT 5
          `,
              [userId, category],
            );

            return result.rows;
          },
        );

        // Score each memory for relevance to the query
        const scoredMemories = categoryMemories.map((memory) => ({
          ...memory,
          similarityScore: this.calculateContentSimilarity(
            query,
            memory.content,
          ),
          source: "related_category",
        }));

        // Only include memories with reasonable similarity
        const relevantMemories = scoredMemories.filter(
          (m) => m.similarityScore > 0.2,
        );
        fallbackMemories.push(...relevantMemories);
      } catch (error) {
        this.logger.error(`Error searching category ${category}:`, error);
      }
    }

    this.logger.log(
      `Found ${fallbackMemories.length} memories from related categories`,
    );
    return fallbackMemories;
  }

  // ================================================================
  // SIMILARITY-BASED RE-RANKING
  // ================================================================

  rerankBySimilarity(memories, _query) {
    return memories.sort((a, b) => {
      // PRIMARY: Similarity score to query
      const similarityDiff = b.similarityScore - a.similarityScore;
      if (Math.abs(similarityDiff) > 0.1) {
        return similarityDiff;
      }

      // SECONDARY: Original relevance score
      const relevanceDiff = (b.relevance_score || 0) - (a.relevance_score || 0);
      if (Math.abs(relevanceDiff) > 0.1) {
        return relevanceDiff;
      }

      // TERTIARY: Prefer primary category over related
      if (a.source !== b.source) {
        return a.source === "primary_category" ? -1 : 1;
      }

      // FINAL: Usage frequency
      return (b.usage_frequency || 0) - (a.usage_frequency || 0);
    });
  }

  // ================================================================
  // ORDINAL FACT DETECTION (Issue #520)
  // ================================================================

  /**
   * Detect if content contains an ordinal reference (first, second, third, etc.)
   * Returns: { hasOrdinal: boolean, ordinal: number, subject: string, pattern: string } or { hasOrdinal: false }
   */
  detectOrdinalFact(content) {
    if (!content || typeof content !== 'string') {
      return { hasOrdinal: false, ordinals: [] };
    }

    const contentLower = content.toLowerCase();

    // Ordinal mapping
    const ORDINAL_PATTERNS = {
      // Word ordinals
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
      sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
      // Number ordinals
      '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
      '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
      // Numeric
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };

    // Pattern: "my [ordinal] [subject]" or "the [ordinal] [subject]"
    // Use matchAll to find ALL ordinals in the content (Issue #603 - B3 fix)
    const ordinalRegex = /\b(my|the)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|one|two|three|four|five|six|seven|eight|nine|ten)\s+(\w+)/gi;
    const matches = [...contentLower.matchAll(ordinalRegex)];

    if (matches.length > 0) {
      const ordinals = matches.map(match => {
        const ordinalWord = match[2].toLowerCase();
        const ordinalNum = ORDINAL_PATTERNS[ordinalWord];
        const subject = match[3];

        console.log(`[ORDINAL-DETECT] Found ordinal: ${ordinalWord} ${subject} (#${ordinalNum})`);

        return {
          ordinal: ordinalNum,
          subject: subject,
          pattern: `${ordinalWord} ${subject}`,
          fullMatch: match[0]
        };
      });

      // Return first ordinal for backward compatibility, but include all in ordinals array
      return {
        hasOrdinal: true,
        ordinal: ordinals[0].ordinal,
        subject: ordinals[0].subject,
        pattern: ordinals[0].pattern,
        ordinals: ordinals // NEW: Array of all detected ordinals
      };
    }

    return { hasOrdinal: false, ordinals: [] };
  }
}

// Export instance, not class
export default new IntelligenceSystem();
