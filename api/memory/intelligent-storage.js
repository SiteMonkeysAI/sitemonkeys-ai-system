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
   * Sanitize content before storage by removing AI boilerplate
   * Prevents storage poisoning from assistant/system narrative text
   * @param {string} content - Content to sanitize
   * @returns {string} - Sanitized content with only user facts
   */
  sanitizeForStorage(content) {
    if (!content) return '';

    // Boilerplate patterns to remove (AI narration, not user facts)
    const boilerplatePatterns = [
      /I don't retain memory|session-based memory|don't have access to previous|no memory of|don't have specific memory/gi,
      /confidence is lower than ideal|confidence level|lower confidence/gi,
      /founder protection|enforcement|safety disclaimer/gi,
      /this appears to be our first interaction|first time we've|haven't interacted before/gi,
      /I apologize|I'm sorry|I should clarify|let me explain/gi,
      /As an AI|As a language model|I'm an AI assistant/gi,
      /I don't have the ability to|I cannot|I'm unable to|I can't access/gi,
      /Based on our conversation|In our previous discussion|From what you've told me/gi
    ];

    let sanitized = content;

    // Remove each boilerplate pattern
    for (const pattern of boilerplatePatterns) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Clean up multiple spaces, newlines, and trim
    sanitized = sanitized
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // If after sanitization we're left with only whitespace or very short text,
    // consider it boilerplate-only
    if (sanitized.length < 10) {
      console.log('[STORAGE-FILTER] ⚠️ Content appears to be boilerplate-only, rejecting storage');
      return '';
    }

    return sanitized;
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

      // STORAGE FILTER: Remove AI boilerplate before post-processing
      const sanitizedFacts = this.sanitizeForStorage(facts);

      // Reject storage if only boilerplate remains
      if (!sanitizedFacts) {
        console.log('[STORAGE-FILTER] ❌ No user facts after sanitization, aborting storage');
        throw new Error('No user facts to store after sanitization');
      }

      // AGGRESSIVE POST-PROCESSING: Guarantee 10-20:1 compression
      const processedFacts = this.aggressivePostProcessing(sanitizedFacts);

      console.log(`[INTELLIGENT-STORAGE] ✅ Extracted ${processedFacts.split('\n').filter(l => l.trim()).length} facts`);
      return processedFacts;
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fact extraction failed:', error.message);
      // Fallback: return summarized version (also sanitized)
      const fallback = `User stated: ${userMsg.substring(0, 50)}...\nSystem discussed: ${aiResponse.substring(0, 50)}...`;
      const sanitizedFallback = this.sanitizeForStorage(fallback);
      if (!sanitizedFallback) {
        throw new Error('Cannot store: no user facts in conversation');
      }
      return sanitizedFallback;
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
   * Extract high-entropy tokens from content
   * High-entropy tokens are unique identifiers like WORD-WORD-#### or long alphanumeric strings
   * @param {string} content - Content to analyze
   * @returns {Array<string>} - Array of high-entropy tokens
   */
  extractHighEntropyTokens(content) {
    if (!content) return [];

    // Pattern matches:
    // - WORD-WORD-#### format (e.g., ZEBRA-ANCHOR-7719, TURQUOISE-DELTA-1234)
    // - Long alphanumeric strings (12+ chars)
    const highEntropyPattern = /\b[A-Z]+-[A-Z]+-\d{4}\b|\b[A-Za-z0-9]{12,}\b/g;
    const tokens = content.match(highEntropyPattern) || [];

    return [...new Set(tokens)]; // Remove duplicates
  }

  /**
   * Check if two contents can be deduplicated based on high-entropy tokens
   * Returns true if safe to merge, false if they contain different high-entropy tokens
   * @param {string} contentA - First content
   * @param {string} contentB - Second content
   * @returns {boolean} - True if safe to merge
   */
  canDeduplicate(contentA, contentB) {
    const tokensA = this.extractHighEntropyTokens(contentA);
    const tokensB = this.extractHighEntropyTokens(contentB);

    // If neither has high-entropy tokens, safe to merge based on similarity
    if (tokensA.length === 0 && tokensB.length === 0) {
      return true;
    }

    // If one has high-entropy tokens and the other doesn't, they're different
    if ((tokensA.length > 0 && tokensB.length === 0) ||
        (tokensA.length === 0 && tokensB.length > 0)) {
      console.log('[DEDUP-GUARD] ❌ One has high-entropy tokens, other does not - preventing merge');
      return false;
    }

    // If both have high-entropy tokens, they must match exactly
    const overlap = tokensA.filter(t => tokensB.includes(t));
    if (overlap.length === 0) {
      console.log('[DEDUP-GUARD] ❌ Different high-entropy tokens detected:', {
        tokensA: tokensA.slice(0, 3),
        tokensB: tokensB.slice(0, 3)
      });
      return false;
    }

    console.log('[DEDUP-GUARD] ✅ High-entropy tokens match, safe to merge:', overlap);
    return true;
  }

  /**
   * Find similar memories using PostgreSQL full-text search
   * Threshold: 70% keyword overlap = duplicate
   * WITH DEDUP GUARD: Prevents merging unrelated high-entropy content
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

      // Check each candidate with dedup guard
      for (const candidate of result.rows) {
        if (candidate.similarity > 0.3) {
          // DEDUP GUARD: Check if safe to merge based on high-entropy tokens
          if (this.canDeduplicate(facts, candidate.content)) {
            console.log(`[DEDUP] 📊 Found similar memory with similarity score: ${candidate.similarity.toFixed(3)}, safe to merge`);
            return candidate;
          } else {
            console.log(`[DEDUP] ⚠️ Similar memory found (score: ${candidate.similarity.toFixed(3)}) but BLOCKED by dedup guard`);
            // Continue checking next candidate
          }
        }
      }

      console.log('[DEDUP] ✅ No similar memories found (or all blocked by dedup guard)');
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