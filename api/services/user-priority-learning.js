/**
 * User Priority Learning Service
 * Innovation #49: Adaptive Learning of User Priorities
 * 
 * Tracks semantic patterns user engages with and boosts future retrievals
 * toward learned priorities using embedding centroids.
 */

/**
 * Learn user priorities from engaged memories
 * Computes priority centroid from memories user interacted with
 * @param {object} pool - Database pool
 * @param {string} userId - User identifier
 * @param {number[]} engagedMemoryIds - IDs of memories user engaged with
 * @returns {Promise<object>} - Learning result
 */
export async function learnUserPriorities(pool, userId, engagedMemoryIds) {
  if (!engagedMemoryIds || engagedMemoryIds.length === 0) {
    return { success: false, reason: 'No engaged memories provided' };
  }

  try {
    // Get embeddings of memories user engaged with and compute centroid
    // PostgreSQL vector extension supports AVG on vector types
    const result = await pool.query(
      `SELECT AVG(embedding) as priority_centroid
       FROM persistent_memories
       WHERE id = ANY($1::int[])
         AND embedding IS NOT NULL`,
      [engagedMemoryIds]
    );

    if (!result.rows[0]?.priority_centroid) {
      return { success: false, reason: 'Could not compute priority centroid' };
    }

    const centroid = result.rows[0].priority_centroid;

    // Store as user's priority vector using a special system memory entry
    // Use UPSERT pattern: insert or update if exists
    // The table has UNIQUE(user_id, category_name, subcategory_name)
    await pool.query(
      `INSERT INTO persistent_memories (
         user_id, mode, category_name, subcategory_name, content, 
         embedding, relevance_score, created_at, updated_at
       ) VALUES (
         $1, 'system', 'system', 'user_priority_centroid', 
         'User priority centroid for adaptive retrieval',
         $2::vector,
         1.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )
       ON CONFLICT (user_id, category_name, subcategory_name)
       DO UPDATE SET 
         embedding = EXCLUDED.embedding,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, centroid]
    );

    console.log(`[USER-PRIORITY] ✅ Updated priority centroid for user ${userId} from ${engagedMemoryIds.length} memories`);
    return { success: true, memoriesUsed: engagedMemoryIds.length };

  } catch (error) {
    console.error(`[USER-PRIORITY] ❌ Failed to learn priorities: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * Retrieve user's priority centroid for retrieval boosting
 * @param {object} pool - Database pool
 * @param {string} userId - User identifier
 * @returns {Promise<object>} - Priority centroid or null
 */
export async function getUserPriorityCentroid(pool, userId) {
  try {
    const result = await pool.query(
      `SELECT embedding::text as centroid, updated_at
       FROM persistent_memories
       WHERE user_id = $1
         AND mode = 'system'
         AND category_name = 'system'
         AND subcategory_name = 'user_priority_centroid'
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      centroid: JSON.parse(result.rows[0].centroid),
      updated_at: result.rows[0].updated_at
    };

  } catch (error) {
    console.error(`[USER-PRIORITY] ⚠️ Failed to retrieve priority centroid: ${error.message}`);
    return null;
  }
}

/**
 * Boost retrieval results toward user's learned priorities
 * Increases scores for memories semantically similar to what user cares about
 * @param {object} pool - Database pool
 * @param {string} userId - User identifier
 * @param {Array} memories - Memories to boost
 * @returns {Promise<Array>} - Boosted memories
 */
export async function boostByUserPriorities(pool, userId, memories) {
  if (!memories || memories.length === 0) {
    return memories;
  }

  try {
    // Get user's priority centroid
    const priorityData = await getUserPriorityCentroid(pool, userId);
    
    if (!priorityData || !priorityData.centroid) {
      console.log(`[USER-PRIORITY] No priority centroid found for user ${userId}, skipping boost`);
      return memories;
    }

    // For each memory, compute similarity to priority centroid and boost score
    const boostedMemories = memories.map(memory => {
      if (!memory.embedding) {
        return memory;
      }

      // Parse embedding if it's a string
      const embedding = typeof memory.embedding === 'string' 
        ? JSON.parse(memory.embedding) 
        : memory.embedding;

      // Compute cosine similarity to priority centroid
      const similarity = cosineSimilarity(embedding, priorityData.centroid);
      
      // Boost hybrid_score by priority similarity (up to +0.15)
      const priorityBoost = similarity * 0.15;
      
      return {
        ...memory,
        hybrid_score: (memory.hybrid_score || memory.similarity || 0) + priorityBoost,
        priority_boosted: true,
        priority_boost: Math.round(priorityBoost * 1000) / 1000
      };
    });

    // Re-sort by boosted scores
    boostedMemories.sort((a, b) => b.hybrid_score - a.hybrid_score);

    console.log(`[USER-PRIORITY] ✅ Boosted ${memories.length} memories using priority centroid`);
    return boostedMemories;

  } catch (error) {
    console.error(`[USER-PRIORITY] ⚠️ Failed to boost by priorities: ${error.message}`);
    return memories; // Return original on error
  }
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
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

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}
