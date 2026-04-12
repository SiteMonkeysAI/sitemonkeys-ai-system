/**
 * ADMIN ENDPOINT - Delete Specific Memories by ID
 *
 * DELETE /api/admin/memories
 * Requires x-admin-key header matching ADMIN_KEY env variable.
 *
 * Request body:
 *   { "user_id": "user_493f5c3f507d4cc4", "memory_ids": [9869, 9871, 9856, 9863] }
 *
 * Only deletes memories matching BOTH user_id AND id.
 * Returns: { "deleted": 4, "ids": [...] }
 */

import { persistentMemory } from '../categories/memory/index.js';

export async function handleDeleteMemories(req, res) {
  const adminKey =
    req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { user_id, memory_ids } = req.body || {};

  if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
    return res.status(400).json({ error: 'user_id is required' });
  }

  if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
    return res.status(400).json({ error: 'memory_ids must be a non-empty array' });
  }

  const ids = memory_ids.map((id) => parseInt(id, 10));
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    return res.status(400).json({ error: 'All memory_ids must be positive integers' });
  }

  try {
    const pool = global.memorySystem?.pool || persistentMemory?.pool;

    if (!pool) {
      console.error('[ADMIN-DELETE] No database pool available');
      return res.status(500).json({ error: 'Database pool not available' });
    }

    const result = await pool.query(
      `DELETE FROM persistent_memories
       WHERE user_id = $1 AND id = ANY($2)
       RETURNING id`,
      [user_id.trim(), ids],
    );

    const deletedIds = result.rows.map((row) => row.id);

    console.log(
      `[ADMIN-DELETE] Deleted ${deletedIds.length} memories for user=${user_id.trim()}, ids=${deletedIds.join(',')}`,
    );

    return res.json({ deleted: deletedIds.length, ids: deletedIds });
  } catch (error) {
    console.error('[ADMIN-DELETE] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
