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
      lookup_disabled_by_cost BOOLEAN DEFAULT FALSE,
      history_reduced_by_cost BOOLEAN DEFAULT FALSE,
      tokens_saved INTEGER DEFAULT NULL,
      degradation_tier VARCHAR(20) DEFAULT 'normal',
      fallback_reason TEXT DEFAULT NULL,
      retry_count INTEGER DEFAULT 0,
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
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS max_memory_score DECIMAL(5,3) DEFAULT NULL
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS lookup_disabled_by_cost BOOLEAN DEFAULT FALSE
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS history_reduced_by_cost BOOLEAN DEFAULT FALSE
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS tokens_saved INTEGER DEFAULT NULL
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS degradation_tier VARCHAR(20) DEFAULT 'normal'
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS fallback_reason TEXT DEFAULT NULL
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE query_cost_log
      ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1
    `);
    console.log('[COST-LOG] query_cost_log table and indexes ready');
  } catch (err) {
    console.error('[COST-LOG] Failed to create query_cost_log table:', err.message);
  }
}

/**
 * Delete query_cost_log rows older than 90 days.
 * Safe to call on a recurring schedule — logs but never throws.
 * @param {import('pg').Pool} pool
 */
export async function cleanupOldCostLogs(pool) {
  try {
    const result = await pool.query(
      `DELETE FROM query_cost_log WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    console.log(`[COST-LOG] Cleanup: removed ${result.rowCount} rows older than 90 days`);
  } catch (err) {
    console.error('[COST-LOG] Cleanup error:', err.message);
  }
}

/**
 * GET /api/admin/cost-summary
 * Returns aggregate cost breakdown by query type for the last 7 days,
 * plus a daily_totals array covering the last 30 days for history charts.
 * Requires x-admin-key header matching ADMIN_KEY env variable.
 */
export async function handleCostSummary(req, res) {
  const adminKey =
    req.headers['x-admin-key'] ||
    req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const isMasterAdmin = adminKey === process.env.ADMIN_KEY;

  try {
    const pool = global.memorySystem?.pool;
    if (!pool) {
      return res.status(503).json({ error: 'Database pool not available' });
    }

    // Resolve org scope: master admin sees all; org admin key sees only their org
    let orgId = null;
    if (!isMasterAdmin) {
      const orgResult = await pool.query(
        'SELECT id FROM organizations WHERE admin_key = $1 AND is_active = true',
        [adminKey]
      );
      if (orgResult.rows.length === 0) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      orgId = orgResult.rows[0].id;
    }

    // Build optional org filter — parameterized to prevent injection
    const orgParams = orgId ? [orgId] : [];
    const orgPlaceholder = orgId ? ' AND org_id = $1' : '';

    // Returns cost breakdown by query type for efficiency proof
    const result = await pool.query(`
      SELECT
        query_type,
        truth_type,
        COUNT(*) as query_count,
        AVG(total_tokens)::INTEGER as avg_tokens,
        AVG(prompt_tokens)::INTEGER as avg_prompt_tokens,
        AVG(completion_tokens)::INTEGER as avg_completion_tokens,
        MAX(completion_tokens) as max_completion_tokens,
        AVG(cost_usd)::DECIMAL(10,6) as avg_cost_usd,
        SUM(cost_usd)::DECIMAL(10,4) as total_cost_usd,
        AVG(memories_injected) as avg_memories,
        AVG(memories_filtered) as avg_filtered,
        SUM(CASE WHEN lookup_fired THEN 1 ELSE 0 END) as lookup_count,
        MIN(created_at) as first_query,
        MAX(created_at) as last_query
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '7 days'${orgPlaceholder}
      GROUP BY query_type, truth_type
      ORDER BY avg_tokens DESC
    `, orgParams);

    const modelBreakdown = await pool.query(`
      SELECT
        model,
        COUNT(*) as query_count,
        ROUND(COUNT(*)::decimal / SUM(COUNT(*)) OVER() * 100, 1) as pct_of_total,
        ROUND(AVG(total_tokens)::decimal, 0) as avg_tokens,
        ROUND(AVG(cost_usd)::decimal, 6) as avg_cost_usd,
        ROUND(SUM(cost_usd)::decimal, 4) as total_cost_usd,
        SUM(CASE WHEN lookup_fired THEN 1 ELSE 0 END) as lookup_count
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND model IS NOT NULL${orgPlaceholder}
      GROUP BY model
      ORDER BY total_cost_usd DESC
    `, orgParams);

    const dailyTotals = await pool.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as query_count,
        ROUND(SUM(cost_usd)::decimal, 6) as total_cost_usd
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '30 days'${orgPlaceholder}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, orgParams);

    // Fallback and degradation counts (7 days)
    const fallbackStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE query_type = 'emergency_fallback') AS fallback_count,
        COUNT(*) FILTER (WHERE degradation_tier IS NOT NULL AND degradation_tier != 'normal') AS degradation_count
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '7 days'${orgPlaceholder}
    `, orgParams);

    // Long-session aggregates (7 days)
    const longSessions = await pool.query(`
      SELECT
        session_id,
        COUNT(*) as query_count,
        ROUND(SUM(cost_usd)::decimal, 6) as total_cost_usd,
        MAX(degradation_tier) as peak_degradation_tier,
        MIN(created_at) as started_at,
        MAX(created_at) as last_activity_at,
        BOOL_OR(lookup_disabled_by_cost) as approached_ceiling
      FROM query_cost_log
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND session_id IS NOT NULL${orgPlaceholder}
      GROUP BY session_id
      HAVING COUNT(*) > 10 OR SUM(cost_usd) > 0.50
      ORDER BY SUM(cost_usd) DESC
    `, orgParams);

    const fbRow = fallbackStats.rows[0] || {};

    return res.json({
      success: true,
      period: '7 days',
      rows: result.rows,
      model_breakdown: modelBreakdown.rows,
      daily_totals: dailyTotals.rows,
      fallback_count: parseInt(fbRow.fallback_count || 0, 10),
      degradation_count: parseInt(fbRow.degradation_count || 0, 10),
      long_sessions: longSessions.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[COST-LOG] cost-summary query failed:', err.message);
    return res.status(500).json({ error: 'Query failed', message: err.message });
  }
}
