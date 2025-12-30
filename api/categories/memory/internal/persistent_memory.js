// ================================================================
// persistent_memory.js - Main Orchestrator & Global Interface
// Primary entry point and orchestration hub for Site Monkeys Memory System
// ================================================================

import coreSystem from "./core.js";
import intelligenceSystem from "./intelligence.js";
import { logMemoryOperation } from "../../../routes/debug.js";

class PersistentMemoryOrchestrator {
  constructor() {
    this.coreSystem = coreSystem;
    this.intelligenceSystem = intelligenceSystem;

    // System state management
    this.isInitialized = false;
    this.initPromise = null;
    this.initStarted = false;
    this.isHealthy = false;

    // Fallback memory for complete system failure
    this.fallbackMemory = new Map();
    this.lastHealthCheck = null;

    // Performance monitoring
    this.performanceStats = {
      totalRequests: 0,
      avgResponseTime: 0,
      successRate: 0,
      errorCount: 0,
      fallbackUsage: 0,
      lastReset: Date.now(),
    };

    this.logger = {
      log: (message) =>
        console.log(
          `[PERSISTENT_MEMORY] ${new Date().toISOString()} ${message}`,
        ),
      error: (message, error) =>
        console.error(
          `[PERSISTENT_MEMORY ERROR] ${new Date().toISOString()} ${message}`,
          error,
        ),
      warn: (message) =>
        console.warn(
          `[PERSISTENT_MEMORY WARN] ${new Date().toISOString()} ${message}`,
        ),
    };

    // Set up global interface immediately for compatibility
    // this.setupGlobalInterface();
  }

  /**
   * Retrieve relevant memories for a user query
   * @param {string} userId - User identifier
   * @param {string} query - User's query message
   * @returns {Promise<object>} - Retrieved memories with metadata
   */
  async retrieveMemory(userId, query) {
    try {
      // Sanitize user ID for logging (show only first 8 chars)
      const sanitizedUserId = userId ? `${userId.substring(0, 8)}...` : 'unknown';
      // Sanitize query for logging (truncate and no sensitive patterns)
      const sanitizedQuery = query ? query.substring(0, 50).replace(/\b\d{3,}\b/g, '***') : '';
      this.logger.log(
        `Retrieving memories for user: ${sanitizedUserId}, query: "${sanitizedQuery}..."`,
      );

      // Use intelligenceSystem to route and extract memories
      const routing = await this.intelligenceSystem.analyzeAndRoute(
        query,
        userId,
      );
      const memories = await this.intelligenceSystem.extractRelevantMemories(
        userId,
        query,
        routing,
      );

      if (!memories || memories.length === 0) {
        this.logger.log("No relevant memories found");
        return {
          success: false,
          memories: "",
          count: 0,
          memory_ids: [],
        };
      }

      // Format memories as a readable string
      const memoryText = memories
        .map((m, idx) => {
          const category = m.category_name || "general";
          const subcategory = m.subcategory_name || "";
          const content = m.content || "";
          return `[Memory ${idx + 1}] (${category}${subcategory ? "/" + subcategory : ""}): ${content}`;
        })
        .join("\n\n");

      this.logger.log(
        `Successfully retrieved ${memories.length} memories, ${memoryText.length} characters`,
      );

      // Extract memory IDs for telemetry
      const memoryIds = memories.map(m => m.id).filter(id => id != null);

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'retrieve', {
        memory_ids: memoryIds,
        query: query.substring(0, 100),
        category_searched: routing.primaryCategory,
        results_count: memories.length
      });

      return {
        success: true,
        memories: memoryText,
        count: memories.length,
        memory_ids: memoryIds,
        routing: routing,
      };
    } catch (error) {
      this.logger.error("Memory retrieval failed:", error);
      return {
        success: false,
        memories: "",
        count: 0,
        error: error.message,
      };
    }
  }

  /**
   * Store a conversation in memory
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object>} - Storage result
   */
  async storeMemory(userId, userMessage, aiResponse, metadata = {}) {
    try {
      // Sanitize user ID for logging (show only first 8 chars)
      const sanitizedUserId = userId ? `${userId.substring(0, 8)}...` : 'unknown';
      this.logger.log(
        `Storing conversation for user: ${sanitizedUserId}, message length: ${userMessage?.length || 0}, response length: ${aiResponse?.length || 0}`,
      );

      // Combine user message and AI response
      const conversationContent = `User: ${userMessage}\nAssistant: ${aiResponse}`;

      // Route to determine category
      const routing = await this.intelligenceSystem.analyzeAndRoute(
        userMessage,
        userId,
      );

      // Calculate relevance score
      const relevanceScore =
        await this.intelligenceSystem.calculateRelevanceScore(
          conversationContent,
          metadata,
        );

      // Calculate token count (approximate: 1 token ≈ 4 characters)
      // This is a rough estimate based on OpenAI's tokenization
      const CHARS_PER_TOKEN = 4;
      const tokenCount = Math.ceil(conversationContent.length / CHARS_PER_TOKEN);

      // Store in database
      const result = await this.coreSystem.executeQuery(
        `
        INSERT INTO persistent_memories (
          user_id, category_name, subcategory_name, content, 
          token_count, relevance_score, usage_frequency, 
          last_accessed, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8)
        RETURNING id
      `,
        [
          userId,
          routing.primaryCategory,
          routing.subcategory || null,
          conversationContent,
          tokenCount,
          relevanceScore,
          0, // initial usage frequency
          JSON.stringify(metadata),
        ],
      );

      const memoryId = result.rows[0]?.id;

      this.logger.log(
        `Successfully stored memory ID: ${memoryId} in category: ${routing.primaryCategory}`,
      );

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'store', {
        memory_id: memoryId,
        content_preview: conversationContent.substring(0, 120),
        category: routing.primaryCategory,
        dedup_triggered: false,
        dedup_merged_with: null,
        stored: true
      });

      return {
        success: true,
        memoryId: memoryId,
        category: routing.primaryCategory,
        subcategory: routing.subcategory,
        tokenCount: tokenCount,
        relevanceScore: relevanceScore,
      };
    } catch (error) {
      this.logger.error("Memory storage failed:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if memory system is ready
   * @returns {boolean} - True if system is ready
   */
  isReady() {
    return (
      this.coreSystem?.isInitialized && this.intelligenceSystem?.isInitialized
    );
  }
}

// Export instance, not class - ready for immediate use
const persistentMemory = new PersistentMemoryOrchestrator();

export default persistentMemory;
