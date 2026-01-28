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
   * SUPERSESSION DETECTION
   *
   * Detects when a new fact should supersede an existing fact.
   * Uses SEMANTIC fingerprinting, not keyword matching.
   *
   * A fact supersedes another when:
   * 1. Same user
   * 2. Same semantic domain (phone, email, address, job, etc.)
   * 3. New value is clearly an UPDATE, not an addition
   *
   * Examples:
   * - "My phone is 555-0000" → "My phone is 555-1111" = SUPERSESSION
   * - "My dog is Max" → "My cat is Luna" = NOT supersession (different entities)
   * - "I work at Google" → "I now work at Meta" = SUPERSESSION
   */
  static SUPERSESSION_DOMAINS = {
    phone: {
      patterns: [/phone\s*(number)?/i, /call\s*me\s*at/i, /reach\s*me\s*at/i, /cell/i, /mobile/i],
      extractValue: (text) => {
        const match = text.match(/(\d{3}[-.]?\d{3}[-.]?\d{4}|\d{3}[-.]?\d{4})/);
        return match ? match[1].replace(/[-.\s]/g, '') : null;
      }
    },
    email: {
      patterns: [/email/i, /e-mail/i, /mail\s*me\s*at/i],
      extractValue: (text) => {
        const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return match ? match[0].toLowerCase() : null;
      }
    },
    address: {
      patterns: [/address/i, /live\s*at/i, /reside/i, /located\s*at/i, /moved\s*to/i],
      extractValue: (text) => {
        // Extract address-like content - city, state, or street
        const match = text.match(/(?:at|in|to)\s+([A-Z][a-zA-Z\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|[A-Z]{2}\s+\d{5})?)/i);
        return match ? match[1].trim() : null;
      }
    },
    employer: {
      patterns: [/work\s*(?:at|for)/i, /employed\s*(?:at|by)/i, /job\s*(?:at|is)/i, /company/i],
      extractValue: (text) => {
        const match = text.match(/(?:work|employed|job)\s*(?:at|for|is)?\s*([A-Z][a-zA-Z\s&]+)/i);
        return match ? match[1].trim() : null;
      }
    },
    name: {
      patterns: [/(?:my\s+)?name\s+is/i, /call\s+me/i, /i\s+am\s+called/i],
      extractValue: (text) => {
        const match = text.match(/(?:name\s+is|call\s+me|i\s+am)\s+([A-Z][a-zA-Z]+)/i);
        return match ? match[1] : null;
      }
    }
  };

  /**
   * Detect if content contains a supersedable fact
   * Returns: { domain: string, value: string } or null
   */
  detectSupersedableFact(content) {
    const contentLower = content.toLowerCase();

    for (const [domain, config] of Object.entries(PersistentMemoryOrchestrator.SUPERSESSION_DOMAINS)) {
      // Check if any pattern matches
      const hasPattern = config.patterns.some(pattern => pattern.test(contentLower));
      if (hasPattern) {
        const value = config.extractValue(content);
        if (value) {
          return { domain, value };
        }
      }
    }

    return null;
  }

  /**
   * Check for and handle supersession before storing new memory
   *
   * @param {string} userId - User identifier
   * @param {string} content - New content being stored
   * @returns {Promise<{superseded: boolean, supersededIds: number[], domain?: string, error?: string}>}
   */
  async handleSupersession(userId, content) {
    const fact = this.detectSupersedableFact(content);

    if (!fact) {
      return { superseded: false, supersededIds: [] };
    }

    console.log(`[SUPERSESSION] Detected ${fact.domain} fact: ${fact.value}`);

    try {
      // Find existing memories in the same domain for this user
      // Use SEMANTIC matching via the domain patterns, not exact keywords
      const domainConfig = PersistentMemoryOrchestrator.SUPERSESSION_DOMAINS[fact.domain];
      const patternSQL = domainConfig.patterns
        .map(p => `content ~* '${p.source.replace(/\\/g, '\\\\')}'`)
        .join(' OR ');

      const existingQuery = `
        SELECT id, content, created_at
        FROM persistent_memories
        WHERE user_id = $1
          AND (is_current = true OR is_current IS NULL)
          AND (${patternSQL})
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const existing = await this.coreSystem.executeQuery(existingQuery, [userId]);

      if (existing.rows.length === 0) {
        console.log(`[SUPERSESSION] No existing ${fact.domain} facts found`);
        return { superseded: false, supersededIds: [] };
      }

      // Mark existing facts as superseded
      const supersededIds = existing.rows.map(r => r.id);

      console.log(`[SUPERSESSION] Marking ${supersededIds.length} existing ${fact.domain} facts as superseded`);

      await this.coreSystem.executeQuery(
        `UPDATE persistent_memories
         SET is_current = false,
             metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{superseded_at}', to_jsonb(NOW()::text))
         WHERE id = ANY($1)`,
        [supersededIds]
      );

      console.log(`[SUPERSESSION] Successfully superseded IDs: ${supersededIds.join(', ')}`);

      return { superseded: true, supersededIds, domain: fact.domain };

    } catch (error) {
      console.error('[SUPERSESSION] Error during supersession check:', error);
      // Don't block storage on supersession failure
      return { superseded: false, supersededIds: [], error: error.message };
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

      // ═══════════════════════════════════════════════════════════════
      // SUPERSESSION CHECK - Before storing, check if this supersedes existing facts
      // ═══════════════════════════════════════════════════════════════
      const supersessionResult = await this.handleSupersession(userId, userMessage);

      if (supersessionResult.superseded) {
        console.log(`[TRACE-STORE] SUPERSESSION: Marked ${supersessionResult.supersededIds.length} old ${supersessionResult.domain} facts as is_current=false`);
        metadata.supersedes = supersessionResult.supersededIds;
        metadata.supersession_domain = supersessionResult.domain;
      }
      // ═══════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════
      // ORDINAL FACT DETECTION (Issue #520) - Store ordering metadata for precise retrieval
      // ═══════════════════════════════════════════════════════════════
      const ordinalInfo = this.intelligenceSystem.detectOrdinalFact(userMessage);

      if (ordinalInfo.hasOrdinal) {
        console.log(`[ORDINAL] Detected ordinal fact: ${ordinalInfo.pattern} (#${ordinalInfo.ordinal})`);
        metadata.ordinal = ordinalInfo.ordinal;
        metadata.ordinal_subject = ordinalInfo.subject;
        metadata.ordinal_pattern = ordinalInfo.pattern;
        // FIX #609-B3: Also store the value if detected (e.g., "CHARLIE-123")
        if (ordinalInfo.value) {
          metadata.ordinal_value = ordinalInfo.value;
          console.log(`[ORDINAL] Detected value: ${ordinalInfo.value}`);
        }
      }
      // ═══════════════════════════════════════════════════════════════

      // Route to determine category
      console.log('[TRACE-STORE] A5. About to call analyzeAndRoute...');
      const routing = await this.intelligenceSystem.analyzeAndRoute(
        userMessage,
        userId,
      );
      console.log('[TRACE-STORE] A6. Routing complete, category:', routing.primaryCategory);

      // Calculate relevance score
      console.log('[TRACE-STORE] A7. About to calculate relevance score...');
      const relevanceScore =
        await this.intelligenceSystem.calculateRelevanceScore(
          conversationContent,
          metadata,
        );
      console.log('[TRACE-STORE] A8. Relevance score calculated:', relevanceScore);

      // Calculate token count (approximate: 1 token ≈ 4 characters)
      // This is a rough estimate based on OpenAI's tokenization
      const CHARS_PER_TOKEN = 4;
      const tokenCount = Math.ceil(conversationContent.length / CHARS_PER_TOKEN);
      console.log('[TRACE-STORE] A9. Token count calculated:', tokenCount);

      // TRACE LOGGING - About to insert
      console.log('[TRACE-STORE] B. About to insert into DB with parameters:');
      console.log('[TRACE-STORE] B1. userId:', userId);
      console.log('[TRACE-STORE] B2. category:', routing.primaryCategory);
      console.log('[TRACE-STORE] B3. subcategory:', routing.subcategory || null);
      console.log('[TRACE-STORE] B4. content length:', conversationContent.length);
      console.log('[TRACE-STORE] B5. tokenCount:', tokenCount);
      console.log('[TRACE-STORE] B6. relevanceScore:', relevanceScore);

      // Store in database (add is_current = true explicitly)
      const result = await this.coreSystem.executeQuery(
        `
        INSERT INTO persistent_memories (
          user_id, category_name, subcategory_name, content,
          token_count, relevance_score, usage_frequency,
          last_accessed, created_at, metadata, is_current
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8, true)
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
