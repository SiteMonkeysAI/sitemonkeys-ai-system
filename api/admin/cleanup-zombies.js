/**
 * ADMIN ENDPOINT - One-Time Zombie Memory Cleanup
 *
 * Executes cleanup of zombie memory entries containing system component names
 * that pollute retrieval results. See sql/cleanup_zombie_memories.sql for context.
 *
 * Usage:
 *   GET /api/admin/cleanup-zombies?key=<ADMIN_KEY>              → dry run (preview only)
 *   GET /api/admin/cleanup-zombies?key=<ADMIN_KEY>&confirm=true → execute deletion
 *
 * Security: Requires ADMIN_KEY environment variable to be set.
 * This is a one-time utility — remove after cleanup is confirmed.
 */

import { persistentMemory } from '../categories/memory/index.js';

// System component name patterns that should never appear in user memory entries.
// Values include SQL LIKE wildcards (%) so they can be used directly as query params.
const ZOMBIE_PATTERNS = [
  '%truthTypeDetector%',
  '%externalLookupEngine%',
  '%ttlCacheManager%',
  '%hierarchyRouter%',
  '%Railway deployment%',
];

const KNOWN_ZOMBIE_IDS = [2864, 2865, 2902, 8828];

export async function handleZombieCleanupRequest(req, res) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminKey = req.query.key || req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    console.warn('[ADMIN-ZOMBIE] ⛔ Rejected request — invalid or missing ADMIN_KEY');
    return res.status(403).json({ error: 'Forbidden: invalid or missing ADMIN_KEY' });
  }

  const confirm = req.query.confirm === 'true';
  console.log(`[ADMIN-ZOMBIE] Request received — mode: ${confirm ? 'EXECUTE' : 'DRY RUN'}`);

  // ── Database pool ─────────────────────────────────────────────────────────
  // Follow the same fallback pattern used by the existing cleanup.js admin handler.
  const pool = global.memorySystem?.pool || persistentMemory?.pool;

  if (!pool) {
    console.error('[ADMIN-ZOMBIE] ❌ No database pool available');
    return res.status(500).json({ error: 'Database pool not available' });
  }

  const poolSource = global.memorySystem?.pool
    ? 'global.memorySystem.pool'
    : 'persistentMemory.pool';
  console.log(`[ADMIN-ZOMBIE] Using pool source: ${poolSource}`);

  try {
    if (!confirm) {
      return await dryRun(pool, res);
    }
    return await executeCleanup(pool, res);
  } catch (err) {
    console.error('[ADMIN-ZOMBIE] ❌ Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

// ── Dry run: preview what would be deleted ────────────────────────────────────

async function dryRun(pool, res) {
  console.log('[ADMIN-ZOMBIE] Running dry-run preview...');

  const [knownIds, patternMatches] = await Promise.all([
    pool.query(
      `SELECT id, LEFT(content, 100) AS content_preview, category_name, user_id
         FROM persistent_memories
        WHERE id = ANY($1::int[])
        ORDER BY id`,
      [KNOWN_ZOMBIE_IDS],
    ),
    pool.query(buildPatternSelectQuery()),
  ]);

  console.log(
    `[ADMIN-ZOMBIE] Dry run complete — known IDs: ${knownIds.rows.length}, pattern matches: ${patternMatches.rows.length}`,
  );

  return res.json({
    mode: 'dry_run',
    message: 'No changes made. Pass ?confirm=true to execute deletion.',
    known_zombie_ids: {
      count: knownIds.rows.length,
      entries: knownIds.rows,
    },
    pattern_matches: {
      count: patternMatches.rows.length,
      entries: patternMatches.rows,
    },
  });
}

// ── Execute: delete and verify ────────────────────────────────────────────────

async function executeCleanup(pool, res) {
  console.log('[ADMIN-ZOMBIE] Executing cleanup...');

  // Step 1: Delete known IDs
  const deleteIds = await pool.query(
    `DELETE FROM persistent_memories
      WHERE id = ANY($1::int[])
  RETURNING id, LEFT(content, 100) AS content_preview`,
    [KNOWN_ZOMBIE_IDS],
  );
  console.log(`[ADMIN-ZOMBIE] Deleted known IDs: ${deleteIds.rows.length} row(s)`);

  // Step 2: Delete pattern-matched entries
  const deletePatterns = await pool.query(buildPatternDeleteQuery());
  console.log(`[ADMIN-ZOMBIE] Deleted pattern matches: ${deletePatterns.rows.length} row(s)`);

  // Step 3: Verify cleanup
  const [verifyIds, verifyPatterns] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS remaining
         FROM persistent_memories
        WHERE id = ANY($1::int[])`,
      [KNOWN_ZOMBIE_IDS],
    ),
    pool.query(buildPatternCountQuery()),
  ]);

  const remainingZombieIds = parseInt(verifyIds.rows[0].remaining, 10);
  const remainingSystemMetadata = parseInt(verifyPatterns.rows[0].remaining, 10);

  console.log(
    `[ADMIN-ZOMBIE] Verification — remaining zombie IDs: ${remainingZombieIds}, remaining system metadata: ${remainingSystemMetadata}`,
  );

  return res.json({
    mode: 'execute',
    deleted_known_ids: {
      count: deleteIds.rows.length,
      entries: deleteIds.rows,
    },
    deleted_pattern_matches: {
      count: deletePatterns.rows.length,
      entries: deletePatterns.rows,
    },
    verification: {
      remaining_zombie_ids: remainingZombieIds,
      remaining_system_metadata: remainingSystemMetadata,
      clean: remainingZombieIds === 0 && remainingSystemMetadata === 0,
    },
  });
}

// ── Query builders ────────────────────────────────────────────────────────────

function buildPatternWhereClause() {
  return ZOMBIE_PATTERNS.map((_, i) => `content ILIKE $${i + 1}`).join(' OR ');
}

function buildPatternSelectQuery() {
  return {
    text: `SELECT id, LEFT(content, 100) AS content_preview, category_name, user_id
             FROM persistent_memories
            WHERE ${buildPatternWhereClause()}
            ORDER BY id`,
    values: ZOMBIE_PATTERNS,
  };
}

function buildPatternDeleteQuery() {
  return {
    text: `DELETE FROM persistent_memories
            WHERE ${buildPatternWhereClause()}
        RETURNING id, LEFT(content, 100) AS content_preview`,
    values: ZOMBIE_PATTERNS,
  };
}

function buildPatternCountQuery() {
  return {
    text: `SELECT COUNT(*) AS remaining
             FROM persistent_memories
            WHERE ${buildPatternWhereClause()}`,
    values: ZOMBIE_PATTERNS,
  };
}
