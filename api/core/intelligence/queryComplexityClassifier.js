// Query Complexity Classifier - GENUINE Semantic Intelligence via Embeddings
// Uses OpenAI embeddings to understand query MEANING, not keyword patterns
// This is the CEO approach: understand context, not match rules

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== EMBEDDING CACHE ====================
// Cache embeddings to avoid repeated API calls
const embeddingCache = new Map();

/**
 * Get embedding for text with caching
 * @param {string} text - Text to get embedding for
 * @returns {Promise<number[]>} - Embedding vector
 */
async function getCachedEmbedding(text) {
  const cacheKey = text.toLowerCase().trim();
  
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  } catch (error) {
    console.error('[QUERY_CLASSIFIER] Error getting embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

// ==================== CONCEPT ANCHORS ====================
// Pre-computed embeddings for concept categories
// These represent the MEANING of each category, not keyword lists

let CONCEPT_ANCHORS = null;

/**
 * Initialize concept anchors on first use
 * These are semantic descriptions that capture the essence of each category
 */
async function initializeConceptAnchors() {
  if (CONCEPT_ANCHORS) {
    return CONCEPT_ANCHORS;
  }
  
  console.log('[QUERY_CLASSIFIER] Initializing concept anchors...');
  
  try {
    CONCEPT_ANCHORS = {
      greeting: await getCachedEmbedding(
        "Hello, hi, hey, good morning, good evening, greetings, howdy, what's up, how are you, nice to meet you, salutations"
      ),
      
      simple_factual: await getCachedEmbedding(
        "What is the answer to this simple question, basic fact lookup, simple definition, what does this word mean, simple math calculation like 2+2 or 5*3 or what is 10 divided by 2, basic arithmetic, unit conversion, straightforward factual information, basic knowledge question, elementary mathematics, simple addition subtraction multiplication division"
      ),
      
      news_current_events: await getCachedEmbedding(
        "Current news and breaking events, political developments and government news, what is happening in the world right now, recent international affairs and diplomatic relations, world leaders and their actions, elections and political campaigns, current state of countries and governments, latest developments in global politics, what's happening with presidents and prime ministers, recent changes in leadership, ongoing political situations, current affairs and contemporary issues"
      ),
      
      emotional_support: await getCachedEmbedding(
        "I feel sad and depressed, I'm anxious and worried, I'm stressed and overwhelmed, I need emotional support and someone to talk to, mental health struggles and difficulties, I'm going through a hard time emotionally, I need help with my feelings, struggling with personal issues, feeling lonely or isolated, need someone to understand my emotions"
      ),
      
      decision_making: await getCachedEmbedding(
        "Should I do this or that, what's the best choice for me, help me decide between options, weighing different alternatives and possibilities, making an important decision, uncertain what path to take, need advice on choosing, considering different scenarios, what would you recommend I do, thinking about my options"
      ),
      
      complex_analytical: await getCachedEmbedding(
        "Analyze this complex situation requiring deep reasoning, explain the intricate relationships between multiple factors, help me understand complicated systems and their interactions, break down sophisticated concepts with multiple variables, evaluate trade-offs and nuanced considerations, think through multi-layered problems, comprehensive analysis needed, requires structured reasoning"
      ),
      
      technical: await getCachedEmbedding(
        "Programming code and software development, technical implementation details, API documentation and usage, debugging issues and errors, software engineering questions, how to implement this feature, technical architecture decisions, system design patterns, coding best practices"
      )
    };
    
    console.log('[QUERY_CLASSIFIER] Concept anchors initialized successfully');
    return CONCEPT_ANCHORS;
  } catch (error) {
    console.error('[QUERY_CLASSIFIER] Error initializing concept anchors:', error);
    throw error;
  }
}

/**
 * Classify query using semantic similarity to concept anchors
 * This is GENUINE intelligence - understands meaning, not patterns
 * 
 * @param {string} query - User's query
 * @param {object} phase4Metadata - Metadata from Phase 4 (truth type, high stakes, etc.)
 * @returns {Promise<object>} - Classification result
 */
export async function classifyQueryComplexity(query, phase4Metadata = {}) {
  try {
    console.log('[QUERY_CLASSIFIER] Classifying query:', query.substring(0, 50) + '...');
    
    // Initialize concept anchors if not already done
    const anchors = await initializeConceptAnchors();
    
    // Get embedding for the user's query
    const queryEmbedding = await getCachedEmbedding(query);
    
    // Calculate semantic similarity to each concept anchor
    const similarities = {
      greeting: cosineSimilarity(queryEmbedding, anchors.greeting),
      simple_factual: cosineSimilarity(queryEmbedding, anchors.simple_factual),
      news_current_events: cosineSimilarity(queryEmbedding, anchors.news_current_events),
      emotional_support: cosineSimilarity(queryEmbedding, anchors.emotional_support),
      decision_making: cosineSimilarity(queryEmbedding, anchors.decision_making),
      complex_analytical: cosineSimilarity(queryEmbedding, anchors.complex_analytical),
      technical: cosineSimilarity(queryEmbedding, anchors.technical)
    };
    
    // Find the category with highest semantic similarity
    const sorted = Object.entries(similarities)
      .sort((a, b) => b[1] - a[1]);
    
    const [primaryCategory, primaryScore] = sorted[0];
    const [secondaryCategory, secondaryScore] = sorted[1];
    
    console.log('[QUERY_CLASSIFIER] Similarity scores:', 
      Object.entries(similarities)
        .map(([cat, score]) => `${cat}: ${score.toFixed(3)}`)
        .join(', ')
    );
    
    // Determine classification and whether scaffolding/bounded reasoning is needed
    const classification = determineClassification(
      primaryCategory,
      primaryScore,
      secondaryCategory,
      secondaryScore,
      similarities,
      query,
      phase4Metadata
    );
    
    console.log(`[QUERY_CLASSIFIER] ✅ Classified as: ${classification.classification} (confidence: ${classification.confidence.toFixed(2)})`);
    console.log(`[QUERY_CLASSIFIER] Scaffolding required: ${classification.requiresScaffolding}`);
    
    return classification;
    
  } catch (error) {
    console.error('[QUERY_CLASSIFIER] Error classifying query:', error);
    
    // Fallback to safe defaults on error
    return {
      classification: 'complex_analytical',
      confidence: 0.5,
      requiresScaffolding: true,
      responseApproach: {
        type: 'structured',
        reason: 'Classification error - defaulting to structured approach'
      },
      similarities: {},
      error: error.message
    };
  }
}

/**
 * Determine data freshness requirement from query
 * @param {string} query - Original query
 * @param {string} truthType - Truth type from phase4Metadata
 * @returns {string} - REAL_TIME | CURRENT | HISTORICAL | TIMELESS
 */
function determineDataFreshnessRequirement(query, truthType) {
  const lowerQuery = query.toLowerCase();

  // REAL_TIME: Needs data from right now (prices, rates, live data)
  if (lowerQuery.match(/\b(right now|live|current price|current rate|today's price|real-time)\b/i)) {
    return 'REAL_TIME';
  }

  // CURRENT: Needs recent data but not necessarily real-time (current leaders, current policies)
  if (truthType === 'VOLATILE' || truthType === 'SEMI_STABLE') {
    return 'CURRENT';
  }

  // HISTORICAL: Asking about past events
  if (lowerQuery.match(/\b(was|were|happened|occurred|in \d{4}|last year|ago)\b/i)) {
    return 'HISTORICAL';
  }

  // TIMELESS: Permanent facts, definitions, mathematical constants
  if (truthType === 'PERMANENT') {
    return 'TIMELESS';
  }

  // Default to CURRENT for ambiguous cases
  return 'CURRENT';
}

/**
 * Determine final classification and response approach based on similarities
 *
 * @param {string} primaryCategory - Category with highest similarity
 * @param {number} primaryScore - Similarity score for primary category
 * @param {string} secondaryCategory - Category with second highest similarity
 * @param {number} secondaryScore - Similarity score for secondary category
 * @param {object} similarities - All similarity scores
 * @param {string} query - Original query
 * @param {object} phase4Metadata - Phase 4 metadata
 * @returns {object} - Classification result
 */
function determineClassification(
  primaryCategory,
  primaryScore,
  secondaryCategory,
  secondaryScore,
  similarities,
  query,
  phase4Metadata
) {
  const queryLength = query.trim().length;
  const truthType = phase4Metadata?.truth_type;
  const isHighStakes = phase4Metadata?.high_stakes?.isHighStakes || false;

  // NEW: Determine data freshness requirement
  const dataFreshnessRequirement = determineDataFreshnessRequirement(query, truthType);
  const externalLookupRequired = (dataFreshnessRequirement === 'REAL_TIME' || dataFreshnessRequirement === 'CURRENT');
  
  // High confidence threshold - only act on strong signals
  const HIGH_CONFIDENCE = 0.70;
  const MEDIUM_CONFIDENCE = 0.60;
  
  // ==================== GREETING DETECTION ====================
  // Short greetings with high similarity to greeting anchor
  if (primaryCategory === 'greeting' && primaryScore > HIGH_CONFIDENCE && queryLength < 50) {
    return {
      classification: 'greeting',
      confidence: primaryScore,
      requiresScaffolding: false,
      dataFreshnessRequirement: 'TIMELESS',
      externalLookupRequired: false,
      responseApproach: {
        type: 'direct',
        reason: 'Simple greeting - direct friendly response without scaffolding',
        maxLength: 100
      },
      similarities
    };
  }
  
  // ==================== SIMPLE FACTUAL QUERIES ====================
  // Permanent facts or simple calculations don't need scaffolding
  if (
    (primaryCategory === 'simple_factual' && primaryScore > MEDIUM_CONFIDENCE) ||
    (truthType === 'PERMANENT' && queryLength < 100)
  ) {
    return {
      classification: 'simple_factual',
      confidence: primaryScore,
      requiresScaffolding: false,
      dataFreshnessRequirement: dataFreshnessRequirement,
      externalLookupRequired: externalLookupRequired,
      responseApproach: {
        type: 'direct',
        reason: truthType === 'PERMANENT'
          ? 'Permanent fact - direct answer without uncertainty framework'
          : 'Simple factual query - direct answer sufficient',
        maxLength: 200
      },
      similarities
    };
  }

  // ==================== NEWS/CURRENT EVENTS ====================
  // Political queries, world events - route to general/news, NOT emotional
  if (primaryCategory === 'news_current_events' && primaryScore > MEDIUM_CONFIDENCE) {
    return {
      classification: 'news_current_events',
      confidence: primaryScore,
      requiresScaffolding: false,
      dataFreshnessRequirement: 'CURRENT',
      externalLookupRequired: true,
      responseApproach: {
        type: 'direct',
        reason: 'Current events query - direct factual response, should trigger external lookup',
        shouldTriggerLookup: truthType === 'VOLATILE'
      },
      similarities
    };
  }
  
  // ==================== EMOTIONAL SUPPORT ====================
  // Clear emotional distress - needs empathetic response
  if (primaryCategory === 'emotional_support' && primaryScore > MEDIUM_CONFIDENCE) {
    return {
      classification: 'emotional_support',
      confidence: primaryScore,
      requiresScaffolding: false,
      dataFreshnessRequirement: 'TIMELESS',
      externalLookupRequired: false,
      responseApproach: {
        type: 'empathetic',
        reason: 'Emotional support needed - empathetic response without analytical scaffolding',
        skipAnalyticalFramework: true
      },
      similarities
    };
  }

  // ==================== DECISION MAKING ====================
  // User needs help deciding - requires structured analysis
  if (primaryCategory === 'decision_making' && primaryScore > MEDIUM_CONFIDENCE) {
    return {
      classification: 'decision_making',
      confidence: primaryScore,
      requiresScaffolding: true,
      dataFreshnessRequirement: dataFreshnessRequirement,
      externalLookupRequired: externalLookupRequired,
      responseApproach: {
        type: 'structured',
        reason: 'Decision-making query - requires bounded reasoning and trade-off analysis'
      },
      similarities
    };
  }

  // ==================== COMPLEX ANALYTICAL ====================
  // Complex queries need full scaffolding
  if (primaryCategory === 'complex_analytical' && primaryScore > MEDIUM_CONFIDENCE) {
    return {
      classification: 'complex_analytical',
      confidence: primaryScore,
      requiresScaffolding: true,
      dataFreshnessRequirement: dataFreshnessRequirement,
      externalLookupRequired: externalLookupRequired,
      responseApproach: {
        type: 'structured',
        reason: 'Complex analytical query - full scaffolding and structured reasoning required'
      },
      similarities
    };
  }

  // ==================== TECHNICAL QUERIES ====================
  if (primaryCategory === 'technical' && primaryScore > MEDIUM_CONFIDENCE) {
    return {
      classification: 'technical',
      confidence: primaryScore,
      requiresScaffolding: queryLength > 200 || isHighStakes,
      dataFreshnessRequirement: dataFreshnessRequirement,
      externalLookupRequired: externalLookupRequired,
      responseApproach: {
        type: queryLength > 200 ? 'structured' : 'direct',
        reason: queryLength > 200
          ? 'Complex technical query - structured approach needed'
          : 'Technical query - direct technical response'
      },
      similarities
    };
  }
  
  // ==================== AMBIGUOUS CLASSIFICATION ====================
  // If scores are close or all low, use query characteristics
  const scoreDiff = primaryScore - secondaryScore;

  // If primary score is low or difference is small, use heuristics
  if (primaryScore < MEDIUM_CONFIDENCE || scoreDiff < 0.1) {
    // Very short queries are likely simple
    if (queryLength < 30) {
      return {
        classification: 'simple_short',
        confidence: 0.6,
        requiresScaffolding: false,
        dataFreshnessRequirement: dataFreshnessRequirement,
        externalLookupRequired: externalLookupRequired,
        responseApproach: {
          type: 'direct',
          reason: 'Very short query - direct response',
          maxLength: 150
        },
        similarities,
        ambiguous: true
      };
    }

    // High stakes always gets scaffolding
    if (isHighStakes) {
      return {
        classification: 'high_stakes',
        confidence: 0.7,
        requiresScaffolding: true,
        dataFreshnessRequirement: dataFreshnessRequirement,
        externalLookupRequired: externalLookupRequired,
        responseApproach: {
          type: 'structured',
          reason: 'High stakes query - full analytical framework applied'
        },
        similarities,
        ambiguous: true
      };
    }

    // Default to medium complexity
    return {
      classification: 'medium_complexity',
      confidence: primaryScore,
      requiresScaffolding: queryLength > 100,
      dataFreshnessRequirement: dataFreshnessRequirement,
      externalLookupRequired: externalLookupRequired,
      responseApproach: {
        type: queryLength > 100 ? 'structured' : 'conversational',
        reason: 'Ambiguous classification - using query length heuristic'
      },
      similarities,
      ambiguous: true
    };
  }

  // ==================== FALLBACK ====================
  // Default case - use primary category with moderate scaffolding
  return {
    classification: primaryCategory,
    confidence: primaryScore,
    requiresScaffolding: queryLength > 150,
    dataFreshnessRequirement: dataFreshnessRequirement,
    externalLookupRequired: externalLookupRequired,
    responseApproach: {
      type: 'conversational',
      reason: `Classified as ${primaryCategory} with ${(primaryScore * 100).toFixed(0)}% confidence`
    },
    similarities
  };
}

// Export for testing
export { getCachedEmbedding, cosineSimilarity, initializeConceptAnchors };
