/**
 * EMBEDDING SERVICE
 *
 * Generates and manages embeddings for semantic memory retrieval.
 *
 * Key Design Principles:
 * - Store-time embedding (not query-time for memories)
 * - Graceful degradation: never blocks memory storage
 * - Backfill support for pending/failed embeddings
 * - Telemetry for monitoring
 *
 * @module api/services/embedding-service
 */

// Node.js 18+ has native fetch and AbortController as globals
// This explicit reference ensures they're available in the module scope
const fetch = globalThis.fetch;
const AbortController = globalThis.AbortController;

// ============================================
// CONFIGURATION
// ============================================

const EMBEDDING_CONFIG = {
  model: 'text-embedding-3-small',  // OpenAI model
  dimensions: 1536,                  // Vector dimensions
  timeout: 5000,                     // 5 second timeout for inline generation
  maxRetries: 2,                     // Retries for failed embeddings
  batchSize: 20,                     // Batch size for backfill
  maxContentLength: 8000             // Max chars to embed (truncate if longer)
};

// ============================================
// CORE EMBEDDING GENERATION
// ============================================

/**
 * Generate embedding for text content
 * 
 * @param {string} content - Text to embed
 * @param {object} options - Optional settings
 * @returns {Promise<{success: boolean, embedding?: number[], error?: string, model?: string}>}
 */
export async function generateEmbedding(content, options = {}) {
  const startTime = Date.now();
  const { timeout = EMBEDDING_CONFIG.timeout } = options;

  // Validate input
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { 
      success: false, 
      error: 'Empty or invalid content',
      timeMs: Date.now() - startTime 
    };
  }

  // Truncate if too long
  const truncatedContent = content.length > EMBEDDING_CONFIG.maxContentLength
    ? content.substring(0, EMBEDDING_CONFIG.maxContentLength) + '...'
    : content;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: truncatedContent
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown'}`,
        timeMs: Date.now() - startTime
      };
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      return {
        success: false,
        error: 'Invalid embedding response from OpenAI',
        timeMs: Date.now() - startTime
      };
    }

    return {
      success: true,
      embedding: embedding,
      model: EMBEDDING_CONFIG.model,
      dimensions: embedding.length,
      timeMs: Date.now() - startTime
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: `Embedding generation timed out after ${timeout}ms`,
        timeMs: Date.now() - startTime
      };
    }
    return {
      success: false,
      error: `Embedding generation failed: ${error.message}`,
      timeMs: Date.now() - startTime
    };
  }
}

// ============================================
// STORE-TIME EMBEDDING (WITH GRACEFUL DEGRADATION)
// ============================================

/**
 * Generate and store embedding for a memory
 * Never blocks memory storage - degrades to 'pending' status on failure
 * 
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} memoryId - UUID of the memory
 * @param {string} content - Content to embed
 * @param {object} options - Optional settings
 * @returns {Promise<{success: boolean, status: string, error?: string}>}
 */
export async function embedMemory(pool, memoryId, content, options = {}) {
  const { inline = true, timeout = EMBEDDING_CONFIG.timeout } = options;
  const startTime = Date.now();

  // Attempt embedding generation
  const result = await generateEmbedding(content, { timeout });

  if (result.success) {
    // Success: store embedding and mark as ready
    try {
      await pool.query(`
        UPDATE persistent_memories 
        SET 
          embedding = $1::float4[],
          embedding_status = 'ready',
          embedding_updated_at = NOW(),
          embedding_model = $2
        WHERE id = $3
      `, [result.embedding, result.model, memoryId]);

      console.log(`[EMBEDDING] ✅ Generated for memory ${memoryId} (${result.timeMs}ms)`);
      
      return {
        success: true,
        status: 'ready',
        timeMs: Date.now() - startTime,
        dimensions: result.dimensions
      };
    } catch (dbError) {
      console.error(`[EMBEDDING] ❌ DB error storing embedding: ${dbError.message}`);
      return {
        success: false,
        status: 'failed',
        error: `Database error: ${dbError.message}`,
        timeMs: Date.now() - startTime
      };
    }
  } else {
    // Failed: mark as pending/failed for backfill
    const status = result.error.includes('timed out') ? 'pending' : 'failed';
    
    try {
      await pool.query(`
        UPDATE persistent_memories 
        SET 
          embedding_status = $1,
          embedding_updated_at = NOW()
        WHERE id = $2
      `, [status, memoryId]);
    } catch (dbError) {
      console.error(`[EMBEDDING] ❌ Could not update status: ${dbError.message}`);
    }

    console.log(`[EMBEDDING] ⚠️ Marked ${memoryId} as ${status}: ${result.error}`);
    
    return {
      success: false,
      status: status,
      error: result.error,
      timeMs: Date.now() - startTime
    };
  }
}

// ============================================
// NON-BLOCKING EMBEDDING (FOR CHAT FLOW)
// ============================================

/**
 * Generate and store embedding for a memory with timeout wrapper
 * Never blocks memory storage - gracefully degrades to 'pending' on timeout/failure
 *
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} memoryId - UUID of the memory
 * @param {string} content - Content to embed
 * @param {object} options - Optional settings
 * @returns {Promise<{success: boolean, status: string, error?: string}>}
 */
export async function embedMemoryNonBlocking(pool, memoryId, content, options = {}) {
  const { timeout = 3000 } = options; // Shorter timeout for non-blocking context

  try {
    const result = await Promise.race([
      embedMemory(pool, memoryId, content, { timeout }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Embedding timeout')), timeout)
      )
    ]);
    return result;
  } catch (error) {
    // Timeout or failure - mark as pending for backfill
    try {
      await pool.query(`
        UPDATE persistent_memories
        SET embedding_status = 'pending', embedding_updated_at = NOW()
        WHERE id = $1
      `, [memoryId]);

      console.log(`[EMBEDDING] ⏳ Marked ${memoryId} as pending (${error.message})`);
      return { success: false, status: 'pending', error: error.message };
    } catch (dbError) {
      console.error(`[EMBEDDING] ❌ Could not mark as pending: ${dbError.message}`);
      return { success: false, status: 'failed', error: dbError.message };
    }
  }
}

// ============================================
// BACKFILL SERVICE
// ============================================

/**
 * Backfill pending/failed embeddings with resumable, rate-safe operation
 * Run as a background job or manual trigger
 *
 * @param {object} pool - PostgreSQL connection pool
 * @param {object} options - Batch size, limits, maxSeconds, etc.
 * @returns {Promise<{processed: number, succeeded: number, failed: number, remaining: number, seconds_elapsed: number}>}
 */
export async function backfillEmbeddings(pool, options = {}) {
  const {
    limit = 20,
    maxSeconds = 20,
    batchSize,
    maxBatches,
    statusFilter = ['pending', 'failed']
  } = options;

  // Support legacy parameters for backward compatibility
  const effectiveLimit = batchSize && maxBatches ? Math.min(batchSize * maxBatches, 100) : limit;

  const stats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 0,
    startTime: Date.now()
  };

  const endTime = Date.now() + (maxSeconds * 1000);

  console.log(`[EMBEDDING BACKFILL] Starting (limit: ${effectiveLimit}, maxSeconds: ${maxSeconds})`);

  // Process memories one at a time until limit reached or time expires
  let processedCount = 0;

  while (processedCount < effectiveLimit && Date.now() < endTime) {
    // Fetch one memory needing embedding
    // Only process rows where embedding IS NULL AND embedding_status IN ('pending','failed')
    const { rows: memories } = await pool.query(`
      SELECT id, content
      FROM persistent_memories
      WHERE embedding IS NULL
        AND embedding_status = ANY($1::varchar[])
        AND content IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `, [statusFilter]);

    if (memories.length === 0) {
      console.log(`[EMBEDDING BACKFILL] No more memories to process`);
      break;
    }

    const memory = memories[0];

    // Set status to 'processing' while working
    try {
      await pool.query(`
        UPDATE persistent_memories
        SET embedding_status = 'processing', embedding_updated_at = NOW()
        WHERE id = $1
      `, [memory.id]);
    } catch (err) {
      console.error(`[EMBEDDING BACKFILL] Failed to set processing status for ${memory.id}: ${err.message}`);
      continue;
    }

    // Generate embedding
    const embedResult = await generateEmbedding(memory.content, {
      timeout: 10000 // Longer timeout for backfill
    });

    stats.processed++;
    processedCount++;

    if (embedResult.success) {
      // On success: set embedding, embedding_status='ready', embedding_updated_at=NOW()
      try {
        await pool.query(`
          UPDATE persistent_memories
          SET
            embedding = $1::float4[],
            embedding_status = 'ready',
            embedding_updated_at = NOW(),
            embedding_model = $2
          WHERE id = $3
        `, [embedResult.embedding, embedResult.model, memory.id]);

        stats.succeeded++;
        console.log(`[EMBEDDING BACKFILL] ✅ ${memory.id} (${embedResult.timeMs}ms)`);
      } catch (dbError) {
        stats.failed++;
        console.error(`[EMBEDDING BACKFILL] ❌ DB error for ${memory.id}: ${dbError.message}`);

        // Store error in metadata (using JSONB merge)
        await pool.query(`
          UPDATE persistent_memories
          SET
            embedding_status = 'failed',
            embedding_updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
        `, [JSON.stringify({ embedding_error: dbError.message, error_time: new Date().toISOString() }), memory.id]).catch(() => {});
      }
    } else {
      // On failure: set embedding_status='failed' and store error in metadata
      stats.failed++;
      console.error(`[EMBEDDING BACKFILL] ❌ ${memory.id}: ${embedResult.error}`);

      try {
        await pool.query(`
          UPDATE persistent_memories
          SET
            embedding_status = 'failed',
            embedding_updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
        `, [JSON.stringify({ embedding_error: embedResult.error, error_time: new Date().toISOString() }), memory.id]);
      } catch (metaError) {
        console.error(`[EMBEDDING BACKFILL] Failed to store error metadata: ${metaError.message}`);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  // Count remaining (only those that need processing)
  const { rows: [{ count }] } = await pool.query(`
    SELECT COUNT(*) as count
    FROM persistent_memories
    WHERE embedding IS NULL
      AND embedding_status = ANY($1::varchar[])
      AND content IS NOT NULL
  `, [statusFilter]);
  stats.remaining = parseInt(count);

  const elapsedMs = Date.now() - stats.startTime;
  stats.seconds_elapsed = parseFloat((elapsedMs / 1000).toFixed(2));

  console.log(`[EMBEDDING BACKFILL] Complete: ${stats.succeeded}/${stats.processed} succeeded, ${stats.failed} failed, ${stats.remaining} remaining (${stats.seconds_elapsed}s)`);

  return stats;
}

// ============================================
// COSINE SIMILARITY (FOR RETRIEVAL)
// ============================================

/**
 * Calculate cosine similarity between two vectors
 * 
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score (0-1, higher is more similar)
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Rank memories by semantic similarity to query
 * 
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {Array<{id: string, embedding: number[], ...}>} candidates - Memory candidates with embeddings
 * @param {object} options - Ranking options
 * @returns {Array<{id: string, similarity: number, ...}>} Ranked candidates
 */
export function rankBySimilarity(queryEmbedding, candidates, options = {}) {
  const { minSimilarity = 0.3, maxResults = 20 } = options;

  const scored = candidates
    .filter(c => c.embedding && Array.isArray(c.embedding))
    .map(candidate => ({
      ...candidate,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding)
    }))
    .filter(c => c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);

  return scored;
}

// ============================================
// TELEMETRY
// ============================================

/**
 * Generate telemetry for embedding operations
 */
export function createEmbeddingTelemetry() {
  return {
    queriesProcessed: 0,
    embeddingsGenerated: 0,
    embeddingsFailed: 0,
    totalTimeMs: 0,
    avgTimeMs: 0,
    
    record(operation, timeMs, success) {
      this.queriesProcessed++;
      this.totalTimeMs += timeMs;
      this.avgTimeMs = this.totalTimeMs / this.queriesProcessed;
      if (success) {
        this.embeddingsGenerated++;
      } else {
        this.embeddingsFailed++;
      }
    },

    getStats() {
      return {
        queriesProcessed: this.queriesProcessed,
        embeddingsGenerated: this.embeddingsGenerated,
        embeddingsFailed: this.embeddingsFailed,
        successRate: this.queriesProcessed > 0 
          ? (this.embeddingsGenerated / this.queriesProcessed * 100).toFixed(1) + '%'
          : 'N/A',
        avgTimeMs: Math.round(this.avgTimeMs)
      };
    }
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  generateEmbedding,
  embedMemory,
  embedMemoryNonBlocking,
  backfillEmbeddings,
  cosineSimilarity,
  rankBySimilarity,
  createEmbeddingTelemetry,
  config: EMBEDDING_CONFIG
};
