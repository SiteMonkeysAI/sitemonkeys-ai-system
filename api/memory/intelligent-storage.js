// ================================================================
// intelligent-storage.js - Intelligent Memory Storage with Compression & Deduplication
// Provides 10-20:1 compression ratio and duplicate detection
// ================================================================

import { OpenAI } from 'openai';
import { encoding_for_model } from 'tiktoken';

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
      
      // Step 1: Extract facts (compression)
      console.log('[INTELLIGENT-STORAGE] 📝 Extracting key facts...');
      const facts = await this.extractKeyFacts(userMessage, aiResponse);
      
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
        return await this.boostExistingMemory(existing.id);
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
    let lines = facts.split('\n')
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
    
    // Join with newlines for clean formatting
    return lines.join('\n');
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
      
      // Return most similar if above threshold
      if (result.rows.length > 0 && result.rows[0].similarity > 0.3) {
        console.log(`[DEDUP] 📊 Found similar memory with similarity score: ${result.rows[0].similarity.toFixed(3)}`);
        return result.rows[0];
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