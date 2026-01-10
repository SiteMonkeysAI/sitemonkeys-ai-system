// ================================================================
// persistent_memory.js - Main Orchestrator & Global Interface
// Primary entry point and orchestration hub for Site Monkeys Memory System
// ================================================================

import coreSystem from "./core.js";
import intelligenceSystem from "./intelligence.js";
import { logMemoryOperation } from "../../../routes/debug.js";
import { embedMemoryNonBlocking } from "../../../services/embedding-service.js";

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
      // TRACE LOGGING - Entry point
      console.log('[TRACE-STORE] A. storeMemory called with userId:', userId);
      console.log('[TRACE-STORE] A1. userMessage length:', userMessage?.length || 0);
      console.log('[TRACE-STORE] A2. aiResponse length:', aiResponse?.length || 0);
      console.log('[TRACE-STORE] A3. metadata:', JSON.stringify(metadata));

      // Sanitize user ID for logging (show only first 8 chars)
      const sanitizedUserId = userId ? `${userId.substring(0, 8)}...` : 'unknown';
      this.logger.log(
        `Storing conversation for user: ${sanitizedUserId}, message length: ${userMessage?.length || 0}, response length: ${aiResponse?.length || 0}`,
      );

      // Combine user message and AI response
      const conversationContent = `User: ${userMessage}\nAssistant: ${aiResponse}`;
      console.log('[TRACE-STORE] A4. Combined content length:', conversationContent.length);

      // Route to determine category
      console.log('[TRACE-STORE] A5. About to call analyzeAndRoute...');
      const routing = await this.intelligenceSystem.analyzeAndRoute(
        userMessage,
        userId,
      );
      console.log('[TRACE-STORE] A6. Routing complete, category:', routing.primaryCategory);

      // MEM-007: Enhanced importance scoring for critical facts
      console.log('[TRACE-STORE] A7-MEM007. Calculating importance score...');
      const importanceScore = await this.#calculateImportanceScore(conversationContent, metadata);
      console.log('[TRACE-STORE] A7-MEM007. Importance score calculated:', importanceScore);

      // Calculate relevance score
      console.log('[TRACE-STORE] A8. About to calculate relevance score...');
      const relevanceScore =
        await this.intelligenceSystem.calculateRelevanceScore(
          conversationContent,
          metadata,
        );
      console.log('[TRACE-STORE] A9. Relevance score calculated:', relevanceScore);

      // Combine importance and relevance for final score
      const finalScore = Math.max(importanceScore, relevanceScore);
      console.log('[TRACE-STORE] A10. Final score (max of importance/relevance):', finalScore);

      // Calculate token count (approximate: 1 token ≈ 4 characters)
      // This is a rough estimate based on OpenAI's tokenization
      const CHARS_PER_TOKEN = 4;
      const tokenCount = Math.ceil(conversationContent.length / CHARS_PER_TOKEN);
      console.log('[TRACE-STORE] A11. Token count calculated:', tokenCount);

      // MEM-002: Semantic De-Duplication
      // Check for similar existing memories before storing
      console.log('[TRACE-STORE] A12-MEM002. Checking for duplicate memories...');
      const duplicateCheck = await this.#checkForDuplicates(userId, conversationContent, routing.primaryCategory);

      if (duplicateCheck.isDuplicate) {
        console.log('[TRACE-STORE] A12-MEM002. Duplicate detected! Merging with memory:', duplicateCheck.existingMemoryId);

        // MEM-003: Age + Relevance Weighted Overwrite
        // Determine if we should overwrite based on age and relevance
        const shouldOverwrite = await this.#shouldOverwriteMemory(
          duplicateCheck.existingMemory,
          { content: conversationContent, relevanceScore: finalScore }
        );

        if (shouldOverwrite) {
          console.log('[TRACE-STORE] A13-MEM003. Overwriting older memory with newer fact');
          // TRUTH-018: Cross-Source Truth Reconciliation - newer info wins
          const updateResult = await this.coreSystem.executeQuery(
            `UPDATE persistent_memories
             SET content = $1,
                 relevance_score = $2,
                 updated_at = CURRENT_TIMESTAMP,
                 usage_frequency = usage_frequency + 1,
                 last_accessed = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id`,
            [conversationContent, finalScore, duplicateCheck.existingMemoryId]
          );

          console.log('[TRACE-STORE] A13-MEM003. Memory updated:', updateResult.rows[0]?.id);

          // Update embedding for the overwritten memory
          if (duplicateCheck.existingMemoryId && this.coreSystem.pool) {
            embedMemoryNonBlocking(this.coreSystem.pool, duplicateCheck.existingMemoryId, conversationContent, { timeout: 3000 })
              .catch(error => console.error(`[EMBEDDING] Failed to update embedding: ${error.message}`));
          }

          logMemoryOperation(userId, 'store', {
            memory_id: duplicateCheck.existingMemoryId,
            content_preview: conversationContent.substring(0, 120),
            category: routing.primaryCategory,
            dedup_triggered: true,
            dedup_merged_with: duplicateCheck.existingMemoryId,
            stored: true,
            overwritten: true
          });

          return {
            success: true,
            memoryId: duplicateCheck.existingMemoryId,
            category: routing.primaryCategory,
            subcategory: routing.subcategory,
            tokenCount: tokenCount,
            relevanceScore: finalScore,
            deduplicated: true,
            overwritten: true
          };
        } else {
          console.log('[TRACE-STORE] A13-MEM003. Keeping existing memory (higher relevance or newer)');
          // Just increment usage frequency on existing memory
          await this.coreSystem.executeQuery(
            `UPDATE persistent_memories
             SET usage_frequency = usage_frequency + 1,
                 last_accessed = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [duplicateCheck.existingMemoryId]
          );

          logMemoryOperation(userId, 'store', {
            memory_id: duplicateCheck.existingMemoryId,
            content_preview: conversationContent.substring(0, 120),
            category: routing.primaryCategory,
            dedup_triggered: true,
            dedup_merged_with: duplicateCheck.existingMemoryId,
            stored: false,
            kept_existing: true
          });

          return {
            success: true,
            memoryId: duplicateCheck.existingMemoryId,
            category: routing.primaryCategory,
            subcategory: routing.subcategory,
            tokenCount: tokenCount,
            relevanceScore: duplicateCheck.existingMemory.relevance_score,
            deduplicated: true,
            keptExisting: true
          };
        }
      }

      // TRACE LOGGING - About to insert
      console.log('[TRACE-STORE] B. About to insert into DB with parameters:');
      console.log('[TRACE-STORE] B1. userId:', userId);
      console.log('[TRACE-STORE] B2. category:', routing.primaryCategory);
      console.log('[TRACE-STORE] B3. subcategory:', routing.subcategory || null);
      console.log('[TRACE-STORE] B4. content length:', conversationContent.length);
      console.log('[TRACE-STORE] B5. tokenCount:', tokenCount);
      console.log('[TRACE-STORE] B6. relevanceScore:', finalScore);

      // Store in database (no duplicate found, insert new)
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
          finalScore,
          0, // initial usage frequency
          JSON.stringify(metadata),
        ],
      );

      const memoryId = result.rows[0]?.id;

      // TRACE LOGGING - Insert complete
      console.log('[TRACE-STORE] C. Insert complete! Result:', JSON.stringify({
        memoryId: memoryId,
        rowCount: result.rowCount,
        success: !!memoryId
      }));

      this.logger.log(
        `Successfully stored memory ID: ${memoryId} in category: ${routing.primaryCategory}`,
      );

      // CRITICAL: Generate embedding for the newly stored memory
      // This enables semantic retrieval for this memory
      if (memoryId && this.coreSystem.pool) {
        console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
        // Use non-blocking embedding to avoid delaying the response
        embedMemoryNonBlocking(this.coreSystem.pool, memoryId, conversationContent, { timeout: 3000 })
          .then(embedResult => {
            if (embedResult.success) {
              console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
            } else {
              console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
            }
          })
          .catch(error => {
            console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
          });
      }

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
        relevanceScore: finalScore,
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
   * MEM-007: Calculate importance score for critical facts
   * Critical facts like allergies, medical conditions, safety info get higher scores
   * @private
   */
  async #calculateImportanceScore(content, metadata = {}) {
    let score = 0.5; // Base score

    const contentLower = content.toLowerCase();

    // Critical health/safety keywords (highest priority)
    const criticalKeywords = [
      'allerg', 'allergic', 'anaphyla', 'epipen',
      'diabetes', 'diabetic', 'insulin',
      'seizure', 'epilep',
      'heart condition', 'pacemaker',
      'cannot eat', 'cannot have', 'must not',
      'emergency contact', 'medical emergency',
      'life-threatening', 'deadly', 'fatal'
    ];

    for (const keyword of criticalKeywords) {
      if (contentLower.includes(keyword)) {
        score = 0.95; // Critical facts get very high score
        console.log(`[MEM-007] Critical keyword detected: ${keyword}`);
        break;
      }
    }

    // High importance keywords
    const highImportanceKeywords = [
      'password', 'pin', 'security', 'ssn', 'social security',
      'bank account', 'credit card', 'passport',
      'medication', 'prescription', 'doctor',
      'emergency', 'urgent', 'important'
    ];

    if (score < 0.95) {
      for (const keyword of highImportanceKeywords) {
        if (contentLower.includes(keyword)) {
          score = Math.max(score, 0.85);
          console.log(`[MEM-007] High importance keyword detected: ${keyword}`);
          break;
        }
      }
    }

    // Medium importance - preferences, goals
    const mediumImportanceKeywords = [
      'goal', 'objective', 'plan', 'dream',
      'prefer', 'preference', 'like', 'dislike',
      'avoid', 'favorite', 'hate'
    ];

    if (score < 0.85) {
      for (const keyword of mediumImportanceKeywords) {
        if (contentLower.includes(keyword)) {
          score = Math.max(score, 0.65);
          break;
        }
      }
    }

    // Check metadata for importance markers
    if (metadata.critical || metadata.userMarkedImportant) {
      score = Math.max(score, 0.9);
    }

    return Math.min(score, 1.0);
  }

  /**
   * MEM-002: Check for duplicate memories using semantic similarity
   * @private
   */
  async #checkForDuplicates(userId, content, category) {
    try {
      // Get recent memories in same category
      const recentMemories = await this.coreSystem.executeQuery(
        `SELECT id, content, relevance_score, created_at, updated_at
         FROM persistent_memories
         WHERE user_id = $1 AND category_name = $2
         AND (is_current = true OR is_current IS NULL)
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId, category]
      );

      if (recentMemories.rows.length === 0) {
        return { isDuplicate: false };
      }

      // Check for semantic similarity
      for (const memory of recentMemories.rows) {
        const similarity = this.#calculateSimilarity(content, memory.content);

        // If similarity > 0.85, consider it a duplicate
        if (similarity > 0.85) {
          console.log(`[MEM-002] Found duplicate memory (similarity: ${similarity.toFixed(3)})`);
          return {
            isDuplicate: true,
            existingMemoryId: memory.id,
            existingMemory: memory,
            similarity: similarity
          };
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('[MEM-002] Error checking duplicates:', error.message);
      return { isDuplicate: false };
    }
  }

  /**
   * Calculate similarity between two texts using simple token overlap
   * @private
   */
  #calculateSimilarity(text1, text2) {
    // Simple token-based similarity (Jaccard similarity)
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/).filter(t => t.length > 3));
    const tokens2 = new Set(text2.toLowerCase().split(/\s+/).filter(t => t.length > 3));

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * MEM-003 & TRUTH-018: Determine if newer memory should overwrite older one
   * Based on age and relevance score
   * @private
   */
  async #shouldOverwriteMemory(existingMemory, newMemory) {
    // Calculate age factor (newer is better)
    const ageInDays = (Date.now() - new Date(existingMemory.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const ageFactor = Math.min(ageInDays / 30, 1.0); // Max age factor at 30 days

    // Weighted score: (relevance * 0.6) + (age * 0.4)
    // Newer memories get bonus, but very high relevance can keep old memories
    const existingScore = (existingMemory.relevance_score * 0.6) + ((1 - ageFactor) * 0.4);
    const newScore = (newMemory.relevanceScore * 0.6) + (1.0 * 0.4); // New memory gets full age bonus

    console.log(`[MEM-003] Comparing scores - Existing: ${existingScore.toFixed(3)}, New: ${newScore.toFixed(3)}`);
    console.log(`[MEM-003] Age in days: ${ageInDays.toFixed(1)}, Age factor: ${ageFactor.toFixed(3)}`);

    // TRUTH-018: Newer information wins if scores are similar (within 0.1)
    if (Math.abs(existingScore - newScore) < 0.1) {
      console.log('[TRUTH-018] Scores similar - newer info wins (cross-source truth reconciliation)');
      return true;
    }

    // Otherwise, higher score wins
    return newScore > existingScore;
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

  /**
   * Get the database pool for direct access
   * @returns {Pool} - PostgreSQL connection pool
   */
  get pool() {
    return this.coreSystem?.pool || null;
  }
}

// Export instance, not class - ready for immediate use
const persistentMemory = new PersistentMemoryOrchestrator();

export default persistentMemory;
