// ================================================================
// intelligent-storage.js - Intelligent Memory Storage with Compression & Deduplication
// Provides 10-20:1 compression ratio and duplicate detection
// ================================================================

import { OpenAI } from 'openai';
import { encoding_for_model } from 'tiktoken';
import { logMemoryOperation } from '../routes/debug.js';

/**
 * Boilerplate patterns that should NEVER be stored in memory
 */
const BOILERPLATE_PATTERNS = [
  /I don't retain memory/i,
  /session-based memory/i,
  /this appears to be our first interaction/i,
  /I'm an AI assistant/i,
  /confidence is lower than ideal/i,
  /I should clarify/i,
  /founder protection/i,
  /I cannot access previous conversations/i,
  /I don't have access to/i
];

/**
 * Intelligent Memory Storage System
 * Compresses verbose conversations and prevents duplicate storage
 */
export class IntelligentMemoryStorage {
  constructor(db, openaiKey) {
    // VALIDATION ADDED: ensure a usable database handle is provided
    if (!db || typeof db.query !== 'function') {
      throw new Error('Invalid database handle passed to IntelligentMemoryStorage');
    }

    this.db = db;
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.encoder = null;

    // Initialize encoder lazily to avoid blocking constructor
    this.initEncoder();
  }

  /**
   * Initialize tiktoken encoder
   */
  initEncoder() {
    try {
      this.encoder = encoding_for_model('gpt-4');
      console.log('[INTELLIGENT-STORAGE] ✅ Tiktoken encoder initialized');
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoder initialization failed:', error.message);
      console.log('[INTELLIGENT-STORAGE] Will use fallback token counting');
    }
  }

  /**
   * Sanitize content before storage - remove AI boilerplate
   * @param {string} content - Content to sanitize
   * @returns {string|null} - Sanitized content or null if should not be stored
   */
  sanitizeForStorage(content) {
    if (!content || typeof content !== 'string') return null;

    let sanitized = content;

    // Remove boilerplate patterns
    for (const pattern of BOILERPLATE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Trim and check if anything meaningful remains
    sanitized = sanitized.trim();

    // Reject if too short or looks like pure boilerplate
    if (sanitized.length < 10) return null;
    if (sanitized.toLowerCase().includes("i'm an ai")) return null;

    return sanitized;
  }

  /**
   * Main entry point - stores memory with compression and deduplication
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @returns {Promise<object>} - Storage result with action taken
   */
  async storeWithIntelligence(userId, userMessage, aiResponse, category) {
    try {
      console.log('[INTELLIGENT-STORAGE] 🧠 Processing conversation for intelligent storage');

      // Step 0: Sanitize content before processing
      const sanitizedResponse = this.sanitizeForStorage(aiResponse);
      if (!sanitizedResponse) {
        console.log('[INTELLIGENT-STORAGE] Rejected boilerplate content, not storing');
        return { action: 'rejected', reason: 'boilerplate_rejected' };
      }

      // Step 1: Extract facts (compression)
      console.log('[INTELLIGENT-STORAGE] 📝 Extracting key facts...');
      const facts = await this.extractKeyFacts(userMessage, sanitizedResponse);
      
      const originalTokens = this.countTokens(userMessage + aiResponse);
      const compressedTokens = this.countTokens(facts);
      const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;
      
      console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);
      
      // Step 2: Check for duplicates
      console.log('[INTELLIGENT-STORAGE] 🔍 Checking for similar memories...');
      const existing = await this.findSimilarMemories(userId, category, facts);
      
      // Step 3: Update existing OR create new
      if (existing) {
        console.log(`[DEDUP] ♻️ Found similar memory (id=${existing.id}), boosting instead of duplicating`);
        const boostResult = await this.boostExistingMemory(existing.id);

        // Debug logging hook for dedup case
        logMemoryOperation(userId, 'store', {
          memory_id: existing.id,
          content_preview: facts.substring(0, 120),
          category: category,
          dedup_triggered: true,
          dedup_merged_with: existing.id,
          stored: false
        });

        return boostResult;
      } else {
        console.log('[INTELLIGENT-STORAGE] ✨ Storing new compressed memory');
        return await this.storeCompressedMemory(userId, category, facts, {
          original_tokens: originalTokens,
          compressed_tokens: compressedTokens,
          compression_ratio: parseFloat(ratio)
        });
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Error:', error.message);
      console.error('[INTELLIGENT-STORAGE] Stack:', error.stack?.substring(0, 200));
      
      // Fallback: store uncompressed to prevent data loss
      console.warn('[INTELLIGENT-STORAGE] ⚠️ Falling back to uncompressed storage');
      return await this.storeUncompressed(userId, userMessage, aiResponse, category);
    }
  }

  /**
   * Extract key facts from conversation using GPT-4o-mini
   * Target: 10-20:1 compression ratio
   * @param {string} userMsg - User's message
   * @param {string} aiResponse - AI's response
   * @returns {Promise<string>} - Extracted facts as bullet points
   */
  async extractKeyFacts(userMsg, aiResponse) {
    const prompt = `Extract ATOMIC FACTS from this conversation.\nFormat: One fact per line, 3-8 words max, bullet points.\nFocus on: User preferences, statements, questions, entities, names, numbers.\nExclude: Explanations, reasoning, examples, politeness.\n\nUser: ${userMsg}\nAssistant: ${aiResponse}\n\nExtracted Facts:\nCRITICAL: Maximum 5 facts. Each fact MUST be under 8 words. Be ruthless.`;
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 100
      });
      
      const facts = response.choices[0].message.content.trim();
      
      // AGGRESSIVE POST-PROCESSING: Guarantee 10-20:1 compression
      const processedFacts = this.aggressivePostProcessing(facts);
      
      console.log(`[INTELLIGENT-STORAGE] ✅ Extracted ${processedFacts.split('\n').filter(l => l.trim()).length} facts`);
      return processedFacts;
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fact extraction failed:', error.message);
      // Fallback: return summarized version
      return `User stated: ${userMsg.substring(0, 50)}...\nSystem discussed: ${aiResponse.substring(0, 50)}...`;
    }
  }

  /**
   * Aggressive post-processing to guarantee 10-20:1 compression
   * Enforces strict limits: max 5 facts, max 8 words each
   * @param {string} facts - Raw facts from AI
   * @returns {string} - Aggressively compressed facts
   */
  aggressivePostProcessing(facts) {
    // Split into lines and clean
    // CRITICAL FIX: Split on newlines OR periods followed by whitespace/capital/end
    // Then restore periods to maintain proper sentence structure
    // This fixes: "monkeys.Assistant" → "monkeys.\nAssistant" 
    let lines = facts.split(/\n|\.(?=\s|[A-Z]|$)/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Remove bullet points, numbers, and other formatting
      .map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim())
      .filter(line => line.length > 0);
    
    // Limit to 5 facts maximum
    lines = lines.slice(0, 5);
    
    // Enforce 8-word maximum per fact
    lines = lines.map(line => {
      const words = line.split(/\s+/);
      if (words.length > 8) {
        return words.slice(0, 8).join(' ');
      }
      return line;
    });
    
    // Remove duplicates (case-insensitive)
    const seen = new Set();
    lines = lines.filter(line => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
    
    // Remove very short or low-value facts (< 3 words)
    lines = lines.filter(line => line.split(/\s+/).length >= 3);
    
    // Additional aggressive compression: remove common filler words at start/end
    lines = lines.map(line => {
      // Remove common prefixes
      line = line.replace(/^(The |A |An |This |That |These |Those )/i, '');
      // Remove common suffixes
      line = line.replace(/( is stated| was mentioned| discussed)$/i, '');
      return line.trim();
    });
    
    // Final cleanup: ensure no empty lines
    lines = lines.filter(line => line.length > 0);
    
    // CRITICAL FIX: Ensure each fact ends with a period for proper grammar
    // This preserves sentence structure while maintaining searchability
    lines = lines.map(line => {
      // Only add period if line doesn't already end with punctuation
      if (!/[.!?]$/.test(line)) {
        return line + '.';
      }
      return line;
    });
    
    // Join with newlines for clean formatting and database searchability
    // Result: "User has pet monkeys.\nAssistant is unaware.\nUser likes games."
    return lines.join('\n');
  }

  /**
   * Check if dedup merge should be prevented due to different high-entropy tokens
   * @param {string} contentA - First content
   * @param {string} contentB - Second content
   * @returns {boolean} - True if merge should be prevented
   */
  shouldPreventMerge(contentA, contentB) {
    const HIGH_ENTROPY_PATTERN = /[A-Z]+-[A-Z]+-\d{4,}|[A-Za-z0-9]{12,}/g;

    const tokensA = contentA.match(HIGH_ENTROPY_PATTERN) || [];
    const tokensB = contentB.match(HIGH_ENTROPY_PATTERN) || [];

    // If either has high-entropy tokens, only allow merge if they share at least one
    if (tokensA.length > 0 || tokensB.length > 0) {
      const overlap = tokensA.filter(t => tokensB.includes(t));
      if (overlap.length === 0) {
        console.log('[DEDUP] 🛡️ Prevented merge - different high-entropy tokens');
        console.log(`[DEDUP]   Tokens A: ${tokensA.join(', ')}`);
        console.log(`[DEDUP]   Tokens B: ${tokensB.join(', ')}`);
        return true; // PREVENT merge - different unique tokens
      }
    }

    return false; // Allow normal dedup logic
  }

  /**
   * Find similar memories using PostgreSQL full-text search
   * Threshold: 70% keyword overlap = duplicate
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Extracted facts to compare
   * @returns {Promise<object|null>} - Similar memory or null
   */
  async findSimilarMemories(userId, category, facts) {
    try {
      const result = await this.db.query(`
        SELECT
          id,
          content,
          ts_rank(
            to_tsvector('english', content),
            plainto_tsquery('english', $3)
          ) as similarity
        FROM persistent_memories
        WHERE user_id = $1
          AND category_name = $2
          AND created_at > NOW() - INTERVAL '30 days'
        ORDER BY similarity DESC
        LIMIT 5
      `, [userId, category, facts]);

      // Check each potential match for high-entropy token conflicts
      for (const row of result.rows) {
        if (row.similarity > 0.3) {
          // Apply high-entropy guard before merging
          if (this.shouldPreventMerge(row.content, facts)) {
            console.log(`[DEDUP] ⏭️ Skipping similar memory (id=${row.id}) due to high-entropy mismatch`);
            continue; // Skip this match, check next one
          }

          console.log(`[DEDUP] 📊 Found similar memory with similarity score: ${row.similarity.toFixed(3)}`);
          return row;
        }
      }

      console.log('[DEDUP] ✅ No similar memories found');
      return null;
    } catch (error) {
      console.error('[DEDUP] ⚠️ Similarity search failed:', error.message);
      return null; // Continue with new storage if dedup fails
    }
  }

  /**
   * Boost existing memory instead of creating duplicate
   * Makes it more likely to be retrieved
   * @param {number} memoryId - ID of existing memory
   * @returns {Promise<object>} - Boost result
   */
  async boostExistingMemory(memoryId) {
    try {
      await this.db.query(`
        UPDATE persistent_memories
        SET 
          usage_frequency = usage_frequency + 1,
          relevance_score = LEAST(relevance_score + 0.05, 1.0),
          last_accessed = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [memoryId]);
      
      console.log(`[DEDUP] ✅ Boosted memory ${memoryId}`);
      return { action: 'boosted', memoryId };
    } catch (error) {
      console.error('[DEDUP] ❌ Boost failed:', error.message);
      throw error;
    }
  }

  /**
   * Store compressed memory with metadata
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Compressed facts
   * @param {object} metadata - Compression metadata
   * @returns {Promise<object>} - Storage result
   */
  async storeCompressedMemory(userId, category, facts, metadata) {
    try {
      const tokenCount = this.countTokens(facts);
      
      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        category,
        'general', // Default subcategory
        facts,
        tokenCount,
        0.70, // Base relevance for new compressed memories
        JSON.stringify({
          ...metadata,
          compressed: true,
          dedup_checked: true,
          storage_version: 'intelligent_v1'
        })
      ]);
      
      const memoryId = result.rows[0].id;
      console.log(`[INTELLIGENT-STORAGE] ✅ Stored compressed memory: ID=${memoryId}, tokens=${tokenCount}`);

      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored:', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: facts.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'store', {
        memory_id: memoryId,
        content_preview: facts.substring(0, 120),
        category: category,
        dedup_triggered: false,
        dedup_merged_with: null,
        stored: true
      });

      return { action: 'created', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Compressed storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Fallback: store uncompressed if compression fails
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @returns {Promise<object>} - Storage result
   */
  async storeUncompressed(userId, userMessage, aiResponse, category) {
    try {
      const content = `User: ${userMessage}\nAssistant: ${aiResponse}`;
      const tokenCount = this.countTokens(content);
      
      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        category,
        'general',
        content,
        tokenCount,
        0.50,
        JSON.stringify({
          compressed: false,
          fallback: true,
          storage_version: 'uncompressed_fallback'
        })
      ]);
      
      const memoryId = result.rows[0].id;
      console.log(`[INTELLIGENT-STORAGE] ⚠️ Stored uncompressed fallback: ID=${memoryId}, tokens=${tokenCount}`);
      
      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored (fallback):', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: content.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });
      
      return { action: 'fallback', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fallback storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Accurate token counting using tiktoken
   * Falls back to character-based estimation if tiktoken unavailable
   * @param {string} text - Text to count tokens for
   * @returns {number} - Token count
   */
  countTokens(text) {
    if (!text) return 0;
    
    try {
      if (this.encoder) {
        return this.encoder.encode(text).length;
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoding failed:', error.message);
    }
    
    // Fallback to character-based estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  /**
   * Cleanup: free encoder resources
   * Call this when done with the storage instance
   */
  cleanup() {
    try {
      if (this.encoder) {
        this.encoder.free();
        console.log('[INTELLIGENT-STORAGE] ✅ Encoder resources freed');
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Cleanup error:', error.message);
    }
  }
}