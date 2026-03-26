/**
 * Cost Observability — query_cost_log table migration and summary endpoint
 *
 * Provides:
 * - GET /api/admin/cost-summary — aggregate cost breakdown by query type
 *
 * Security: requires ADMIN_KEY header (same pattern as cleanup.js)
 *
 * The query_cost_log table is created idempotently via createCostLogTable(),
 * which is called once during server startup via ensureCostLogTable().
 */

/**
 * Idempotently create the query_cost_log table and its indexes.
 * Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
 * @param {import('pg').Pool} pool
 */
export async function createCostLogTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS query_cost_log (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255),
      session_id VARCHAR(255),
      query_type VARCHAR(100),
      truth_type VARCHAR(50),
      complexity VARCHAR(50),
      intent_class VARCHAR(100),
      total_tokens INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cost_usd DECIMAL(10,6),
      memories_injected INTEGER,
      memories_filtered INTEGER,
      lookup_fired BOOLEAN,
      lookup_tokens INTEGER,
      history_depth INTEGER,
      model VARCHAR(100),
      personality VARCHAR(50),
      mode VARCHAR(50),
      max_memory_score DECIMAL(5,3) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_query_cost_log_created_at
      ON query_cost_log(created_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_query_cost_log_query_type
      ON query_cost_log(query_type)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_query_cost_log_truth_type
      ON query_cost_log(truth_type)
  `);
}

/**
 * Ensure cost log table exists. Runs once at startup; logs but never throws.
 * @param {import('pg').Pool} pool
 */
export async function ensureCostLogTable(pool) {
  try {
    await createCostLogTable(pool);
    console.log('[COST-LOG] query_cost_log table and indexes ready');
  } catch (err) {
    console.error('[COST-LOG] Failed to create query_cost_log table:', err.message);
  }
}

/**
 * GET /api/admin/cost-summary
 * Returns aggregate cost breakdown by query type for the last 7 days.
 * Requires x-admin-key header matching ADMIN_KEY env variable.
 */
export async function handleCostSummary(req, res) {
  const adminKey =
    req.headers['x-admin-key'] ||
    req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const pool = global.memorySystem?.pool;
    if (!pool) {
      return res.status(503).json({ error: 'Database pool not available' });
    }

    // Returns cost breakdown by query type for efficiency proof
    const result = await pool.query(`
      SELECT
        query_type,
        truth_type,
        COUNT(*) as query_count,
        AVG(total_tokens)::INTEGER as avg_tokens,
        AVG(cost_usd)::DECIMAL(10,6) as avg_cost_usd,
        SUM(cost_usd)::DECIMAL(10,4) as total_cost_usd,
        AVG(memories_injected) as avg_memories,
        AVG(memories_filtered) as avg_filtered,
        SUM(CASE WHEN lookup_fired THEN 1 ELSE 0 END) as lookup_count,
        MIN(created_at) as first_query,
        MAX(created_at) as last_query
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY query_type, truth_type
      ORDER BY avg_tokens DESC
    `);

    return res.json({
      success: true,
      period: '7 days',
      rows: result.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[COST-LOG] cost-summary query failed:', err.message);
    return res.status(500).json({ error: 'Query failed', message: err.message });
  }
}
