/**
 * Memory System Diagnostic Endpoint
 * Shows actual database state - categories, counts, tokens, samples
 */

import { Router } from 'express';

const router = Router();

router.get('/memory-stats', async (req, res) => {
  // Security: require debug mode
  if (process.env.DEBUG_MODE !== 'true') {
    return res.status(403).json({ error: 'Debug mode not enabled' });
  }

  try {
    const pool = global.memorySystem?.coreSystem?.pool;
    
    if (!pool) {
      return res.status(500).json({ 
        error: 'Database pool not available',
        memorySystemExists: !!global.memorySystem,
        coreSystemExists: !!global.memorySystem?.coreSystem
      });
    }

    const stats = {};

    // 1. Total memories
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM persistent_memories'
    );
    stats.total_memories = parseInt(totalResult.rows[0]?.total || 0);

    // 2. Memories per category
    const categoryResult = await pool.query(`
      SELECT 
        category_name, 
        COUNT(*) as count,
        SUM(token_count) as total_tokens,
        AVG(relevance_score) as avg_relevance
      FROM persistent_memories 
      GROUP BY category_name 
      ORDER BY count DESC
    `);
    stats.by_category = categoryResult.rows;

    // 3. Memories per user_id
    const userResult = await pool.query(`
      SELECT 
        user_id, 
        COUNT(*) as count,
        SUM(token_count) as total_tokens
      FROM persistent_memories 
      GROUP BY user_id 
      ORDER BY count DESC
      LIMIT 20
    `);
    stats.by_user = userResult.rows;

    // 4. Category token usage (vs 50K limit)
    const tokenUsageResult = await pool.query(`
      SELECT 
        category_name,
        SUM(token_count) as used_tokens,
        50000 as limit_tokens,
        ROUND((SUM(token_count)::numeric / 50000) * 100, 2) as percent_used
      FROM persistent_memories 
      GROUP BY category_name 
      ORDER BY used_tokens DESC
    `);
    stats.token_usage = tokenUsageResult.rows;

    // 5. Recent memories (samples)
    const recentResult = await pool.query(`
      SELECT 
        id,
        user_id,
        category_name,
        SUBSTRING(content, 1, 150) as content_preview,
        token_count,
        relevance_score,
        created_at
      FROM persistent_memories 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    stats.recent_samples = recentResult.rows;

    // 6. Schema check
    const schemaResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'persistent_memories'
      ORDER BY ordinal_position
    `);
    stats.schema = schemaResult.rows;

    // 7. Check for memory_categories table
    const categoriesTableResult = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_name = 'memory_categories'
    `);
    const hasCategoriesTable = parseInt(categoriesTableResult.rows[0]?.count || 0) > 0;
    
    if (hasCategoriesTable) {
      const categoriesResult = await pool.query(`
        SELECT * FROM memory_categories ORDER BY category_name
      `);
      stats.memory_categories_table = categoriesResult.rows;
    } else {
      stats.memory_categories_table = 'TABLE DOES NOT EXIST';
    }

    // 8. Subcategory distribution (if subcategory_name column exists)
    try {
      const subcategoryResult = await pool.query(`
        SELECT 
          category_name,
          subcategory_name,
          COUNT(*) as count
        FROM persistent_memories 
        WHERE subcategory_name IS NOT NULL
        GROUP BY category_name, subcategory_name
        ORDER BY category_name, count DESC
      `);
      stats.subcategories = subcategoryResult.rows;
    } catch (e) {
      stats.subcategories = 'Column may not exist: ' + e.message;
    }

    // Build HTML report
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Memory System Database Stats</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #00d4ff; }
    h2 { color: #fbbf24; border-bottom: 1px solid #444; padding-bottom: 10px; margin-top: 30px; }
    .stat-box { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; }
    .big-number { font-size: 2em; color: #4ade80; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #333; }
    th { color: #00d4ff; }
    .warn { color: #fbbf24; }
    .good { color: #4ade80; }
    .bad { color: #f87171; }
    pre { background: #0f0f23; padding: 10px; overflow-x: auto; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>🧠 Memory System Database Stats</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="stat-box">
    <span class="big-number">${stats.total_memories}</span> total memories in database
  </div>

  <h2>📁 Memories by Category</h2>
  <table>
    <tr><th>Category</th><th>Count</th><th>Total Tokens</th><th>Avg Relevance</th></tr>
    ${stats.by_category.map(c => `
      <tr>
        <td>${c.category_name || 'NULL'}</td>
        <td>${c.count}</td>
        <td>${c.total_tokens || 0}</td>
        <td>${parseFloat(c.avg_relevance || 0).toFixed(2)}</td>
      </tr>
    `).join('')}
  </table>

  <h2>👤 Memories by User ID</h2>
  <table>
    <tr><th>User ID</th><th>Count</th><th>Total Tokens</th></tr>
    ${stats.by_user.map(u => `
      <tr>
        <td>${u.user_id}</td>
        <td>${u.count}</td>
        <td>${u.total_tokens || 0}</td>
      </tr>
    `).join('')}
  </table>

  <h2>📊 Token Usage vs 50K Limit</h2>
  <table>
    <tr><th>Category</th><th>Used</th><th>Limit</th><th>% Used</th></tr>
    ${stats.token_usage.map(t => `
      <tr>
        <td>${t.category_name}</td>
        <td>${t.used_tokens || 0}</td>
        <td>${t.limit_tokens}</td>
        <td class="${parseFloat(t.percent_used) > 80 ? 'warn' : 'good'}">${t.percent_used}%</td>
      </tr>
    `).join('')}
  </table>

  <h2>🗂️ Subcategory Distribution</h2>
  <pre>${typeof stats.subcategories === 'string' ? stats.subcategories : JSON.stringify(stats.subcategories, null, 2)}</pre>

  <h2>📝 Recent Memories (Samples)</h2>
  ${stats.recent_samples.map(m => `
    <div class="stat-box">
      <strong>ID ${m.id}</strong> | User: ${m.user_id} | Category: ${m.category_name}<br>
      <small>Tokens: ${m.token_count} | Relevance: ${m.relevance_score} | ${m.created_at}</small><br>
      <pre>${m.content_preview}...</pre>
    </div>
  `).join('')}

  <h2>🔧 Database Schema</h2>
  <table>
    <tr><th>Column</th><th>Type</th></tr>
    ${stats.schema.map(s => `<tr><td>${s.column_name}</td><td>${s.data_type}</td></tr>`).join('')}
  </table>

  <h2>📋 Memory Categories Table</h2>
  <pre>${typeof stats.memory_categories_table === 'string' ? stats.memory_categories_table : JSON.stringify(stats.memory_categories_table, null, 2)}</pre>

  <h2>🔍 Raw Stats (JSON)</h2>
  <pre>${JSON.stringify(stats, null, 2)}</pre>
</body>
</html>`;

    res.send(html);

  } catch (err) {
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

export default router;
