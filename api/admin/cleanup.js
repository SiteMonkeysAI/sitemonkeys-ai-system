/**
 * ADMIN ENDPOINT - Cleanup Stale Memories
 */

import { cleanupDuplicateCurrentFacts, createSupersessionConstraint } from '../services/supersession.js';
import { persistentMemory } from '../categories/memory/index.js';

export async function handleCleanupRequest(req, res) {
  const startTime = Date.now();
  const dryRun = req.query.dry_run === 'true';
  const createIndex = req.query.create_index === 'true';

  console.log('[ADMIN] Cleanup endpoint called', { dryRun, createIndex });

  try {
    const pool = global.memorySystem?.pool || persistentMemory?.pool;

    if (!pool) {
      console.error('[ADMIN] No database pool available');
      return res.status(500).json({
        success: false,
        error: 'Database pool not available'
      });
    }

    const report = {
      timestamp: new Date().toISOString(),
      dry_run: dryRun,
      actions: []
    };

    // Step 1: Check current state
    const beforeCount = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN is_current = true THEN 1 END) as current_count,
             COUNT(DISTINCT fact_fingerprint) as unique_fingerprints
      FROM persistent_memories
      WHERE user_id = 'anonymous'
        AND fact_fingerprint IS NOT NULL
    `);

    report.before = {
      total_memories: parseInt(beforeCount.rows[0].total),
      current_memories: parseInt(beforeCount.rows[0].current_count),
      unique_fingerprints: parseInt(beforeCount.rows[0].unique_fingerprints)
    };

    // Step 2: Find duplicates that would be cleaned
    const duplicates = await pool.query(`
      WITH ranked AS (
        SELECT id, content, fact_fingerprint, created_at, is_current,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, fact_fingerprint
                 ORDER BY created_at DESC
               ) as rn
        FROM persistent_memories
        WHERE user_id = 'anonymous'
          AND fact_fingerprint IS NOT NULL
          AND is_current = true
      )
      SELECT id, fact_fingerprint,
             substring(content, 1, 50) as content_preview,
             created_at
      FROM ranked
      WHERE rn > 1
      ORDER BY fact_fingerprint, created_at DESC
    `);

    report.duplicates_found = duplicates.rows.length;
    report.duplicates_by_fingerprint = {};

    duplicates.rows.forEach(row => {
      if (!report.duplicates_by_fingerprint[row.fact_fingerprint]) {
        report.duplicates_by_fingerprint[row.fact_fingerprint] = [];
      }
      report.duplicates_by_fingerprint[row.fact_fingerprint].push({
        id: row.id,
        content_preview: row.content_preview,
        created_at: row.created_at
      });
    });

    // Step 3: Actually clean (unless dry run)
    if (!dryRun && duplicates.rows.length > 0) {
      const cleanupResult = await cleanupDuplicateCurrentFacts(pool);
      report.cleanup_result = cleanupResult;
      report.actions.push(`Cleaned ${cleanupResult.cleaned} duplicate current facts`);
    } else if (dryRun) {
      report.actions.push(`DRY RUN: Would clean ${duplicates.rows.length} duplicate current facts`);
    } else {
      report.actions.push('No duplicates found to clean');
    }

    // Step 4: Create/verify index (if requested)
    if (createIndex) {
      const indexResult = await createSupersessionConstraint(pool);
      report.index_result = indexResult;
      report.actions.push(`Index: ${indexResult.message}`);
    }

    // Step 5: Check state after cleanup
    if (!dryRun) {
      const afterCount = await pool.query(`
        SELECT COUNT(*) as total,
               COUNT(CASE WHEN is_current = true THEN 1 END) as current_count
        FROM persistent_memories
        WHERE user_id = 'anonymous'
          AND fact_fingerprint IS NOT NULL
      `);

      report.after = {
        total_memories: parseInt(afterCount.rows[0].total),
        current_memories: parseInt(afterCount.rows[0].current_count)
      };
    }

    report.duration_ms = Date.now() - startTime;

    console.log('[ADMIN] Cleanup complete', report);

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('[ADMIN] Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
