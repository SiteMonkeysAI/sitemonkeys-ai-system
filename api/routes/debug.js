/**
 * Memory Debug Endpoint
 * =====================
 * Provides diagnostic access to memory operations for testing and debugging.
 * 
 * SECURITY: Only available when DEPLOYMENT_TYPE=private or DEBUG_MODE=true
 * 
 * Endpoints:
 *   GET /api/debug/memory?user_id=xxx&action=last_store
 *   GET /api/debug/memory?user_id=xxx&action=last_retrieve
 *   GET /api/debug/memory?user_id=xxx&action=last_inject
 *   GET /api/debug/memory?user_id=xxx&action=list_recent&limit=10
 *   GET /api/debug/memory?user_id=xxx&action=search&content_contains=xxx
 */

import express from 'express';

const router = express.Router();

// In-memory tracking of recent operations (per user)
// This gets populated by hooks in the memory system
const operationLog = new Map();

const MAX_LOG_ENTRIES = 100;

/**
 * Security middleware - only allow in debug/private mode
 */
function debugModeOnly(req, res, next) {
  const isPrivate = process.env.DEPLOYMENT_TYPE === 'private';
  const isDebug = process.env.DEBUG_MODE === 'true';
  
  if (!isPrivate && !isDebug) {
    return res.status(403).json({ 
      error: 'Debug endpoint not available in production',
      hint: 'Set DEPLOYMENT_TYPE=private or DEBUG_MODE=true'
    });
  }
  
  next();
}

/**
 * Log a memory operation (called by memory system)
 */
export function logMemoryOperation(userId, operation, data) {
  if (!userId) return;
  
  const userLog = operationLog.get(userId) || {
    last_store: null,
    last_retrieve: null,
    last_inject: null,
    recent: []
  };
  
  const entry = {
    timestamp: new Date().toISOString(),
    operation,
    ...data
  };
  
  // Update last operation of this type
  if (operation === 'store') {
    userLog.last_store = entry;
  } else if (operation === 'retrieve') {
    userLog.last_retrieve = entry;
  } else if (operation === 'inject') {
    userLog.last_inject = entry;
  }
  
  // Add to recent list
  userLog.recent.unshift(entry);
  if (userLog.recent.length > MAX_LOG_ENTRIES) {
    userLog.recent = userLog.recent.slice(0, MAX_LOG_ENTRIES);
  }
  
  operationLog.set(userId, userLog);
}

/**
 * Clear logs for a user (for test cleanup)
 */
export function clearUserLogs(userId) {
  operationLog.delete(userId);
}

/**
 * GET /api/debug/memory
 */
router.get('/memory', debugModeOnly, async (req, res) => {
  try {
    const { user_id, action, limit, content_contains } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }
    
    const userLog = operationLog.get(user_id) || {
      last_store: null,
      last_retrieve: null,
      last_inject: null,
      recent: []
    };
    
    switch (action) {
      case 'last_store':
        return res.json(userLog.last_store || { available: false });
        
      case 'last_retrieve':
        return res.json(userLog.last_retrieve || { available: false });
        
      case 'last_inject':
        return res.json(userLog.last_inject || { available: false });
        
      case 'list_recent': {
        const n = Math.min(parseInt(limit) || 10, MAX_LOG_ENTRIES);
        return res.json({
          count: userLog.recent.length,
          entries: userLog.recent.slice(0, n)
        });
      }
      
      case 'search': {
        if (!content_contains) {
          return res.status(400).json({ error: 'content_contains required for search' });
        }
        const matches = userLog.recent.filter(entry => {
          const content = entry.content || entry.content_preview || '';
          return content.toLowerCase().includes(content_contains.toLowerCase());
        });
        return res.json({
          query: content_contains,
          results_count: matches.length,
          results: matches
        });
      }
      
      case 'summary':
      default:
        return res.json({
          user_id,
          has_store_log: !!userLog.last_store,
          has_retrieve_log: !!userLog.last_retrieve,
          has_inject_log: !!userLog.last_inject,
          recent_count: userLog.recent.length,
          last_store: userLog.last_store ? {
            memory_id: userLog.last_store.memory_id,
            category: userLog.last_store.category,
            dedup_triggered: userLog.last_store.dedup_triggered,
            timestamp: userLog.last_store.timestamp
          } : null,
          last_retrieve: userLog.last_retrieve ? {
            memory_ids: userLog.last_retrieve.memory_ids,
            results_count: userLog.last_retrieve.results_count,
            category_searched: userLog.last_retrieve.category_searched,
            timestamp: userLog.last_retrieve.timestamp
          } : null,
          last_inject: userLog.last_inject ? {
            memory_injected: userLog.last_inject.memory_injected,
            memory_ids: userLog.last_inject.memory_ids,
            token_count: userLog.last_inject.token_count,
            timestamp: userLog.last_inject.timestamp
          } : null
        });
    }
  } catch (error) {
    console.error('[DEBUG] Memory debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/debug/memory/clear
 * Clear logs for a user (useful for test setup)
 */
router.post('/memory/clear', debugModeOnly, (req, res) => {
  const { user_id } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }
  
  clearUserLogs(user_id);
  res.json({ cleared: true, user_id });
});

/**
 * GET /api/debug/health
 * Simple health check for the debug system
 */
router.get('/health', debugModeOnly, (req, res) => {
  res.json({
    status: 'ok',
    debug_mode: process.env.DEBUG_MODE === 'true',
    deployment_type: process.env.DEPLOYMENT_TYPE,
    tracked_users: operationLog.size
  });
});

/**
 * GET /api/debug/cleanup-boilerplate-preview
 * Preview memories that would be deleted by boilerplate cleanup
 * SECURITY: Only available in debug/private mode
 */
router.get('/cleanup-boilerplate-preview', debugModeOnly, async (req, res) => {
  try {
    console.log('[DEBUG] [CLEANUP-PREVIEW] Starting boilerplate cleanup preview...');

    if (!global.memorySystem || !global.memorySystem.coreSystem) {
      return res.status(503).json({
        error: 'Memory system not initialized',
        hint: 'Wait for system initialization to complete'
      });
    }

    const BOILERPLATE_PATTERNS = [
      '%do not retain information between conversations%',
      '%each conversation starts fresh%',
      '%don\'t have memory%',
      '%I don\'t retain memory%',
      '%session-based memory%',
      '%first interaction%',
      '%I\'m an AI%',
      '%I cannot access previous%',
      '%no memory of previous%',
      '%I am an AI%',
      '%don\'t have the ability to remember%',
      '%cannot remember previous conversations%',
      '%no memory of past interactions%'
    ];

    const conditions = BOILERPLATE_PATTERNS
      .map((_, i) => `content ILIKE $${i + 1}`)
      .join(' OR ');

    const query = `
      SELECT id, user_id, category_name, content, created_at
      FROM persistent_memories
      WHERE ${conditions}
      ORDER BY created_at DESC
    `;

    const result = await global.memorySystem.coreSystem.pool.query(query, BOILERPLATE_PATTERNS);

    console.log(`[DEBUG] [CLEANUP-PREVIEW] Found ${result.rowCount} contaminated memories`);

    res.json({
      success: true,
      preview: true,
      would_delete_count: result.rowCount,
      patterns_searched: BOILERPLATE_PATTERNS.length,
      samples: result.rows.slice(0, 10).map(row => ({
        id: row.id,
        user_id: row.user_id,
        category: row.category_name,
        content_preview: row.content.substring(0, 200),
        created_at: row.created_at
      })),
      total_found: result.rowCount,
      note: 'This is a preview only. Use POST /api/debug/cleanup-boilerplate to delete.'
    });
  } catch (error) {
    console.error('[DEBUG] [CLEANUP-PREVIEW] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * POST /api/debug/cleanup-boilerplate
 * Delete memories containing AI boilerplate that was incorrectly stored
 * SECURITY: Only available in debug/private mode
 */
router.post('/cleanup-boilerplate', debugModeOnly, async (req, res) => {
  try {
    console.log('[DEBUG] [CLEANUP] Starting boilerplate cleanup...');

    if (!global.memorySystem || !global.memorySystem.coreSystem) {
      return res.status(503).json({
        error: 'Memory system not initialized',
        hint: 'Wait for system initialization to complete'
      });
    }

    const BOILERPLATE_PATTERNS = [
      '%do not retain information between conversations%',
      '%each conversation starts fresh%',
      '%don\'t have memory%',
      '%I don\'t retain memory%',
      '%session-based memory%',
      '%first interaction%',
      '%I\'m an AI%',
      '%I cannot access previous%',
      '%no memory of previous%',
      '%I am an AI%',
      '%don\'t have the ability to remember%',
      '%cannot remember previous conversations%',
      '%no memory of past interactions%'
    ];

    const conditions = BOILERPLATE_PATTERNS
      .map((_, i) => `content ILIKE $${i + 1}`)
      .join(' OR ');

    const query = `
      DELETE FROM persistent_memories
      WHERE ${conditions}
      RETURNING id, user_id, category_name, content, created_at
    `;

    const result = await global.memorySystem.coreSystem.pool.query(query, BOILERPLATE_PATTERNS);

    console.log(`[DEBUG] [CLEANUP] Deleted ${result.rowCount} contaminated memories`);

    res.json({
      success: true,
      deleted_count: result.rowCount,
      patterns_used: BOILERPLATE_PATTERNS.length,
      deleted_samples: result.rows.slice(0, 5).map(row => ({
        id: row.id,
        user_id: row.user_id,
        category: row.category_name,
        content_preview: row.content.substring(0, 150),
        created_at: row.created_at
      })),
      message: `Successfully deleted ${result.rowCount} boilerplate-contaminated memories`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[DEBUG] [CLEANUP] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

export default router;

/**
 * ═══════════════════════════════════════════════════════════════
 * INTEGRATION INSTRUCTIONS
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1. In server.js, add:
 *    
 *    import debugRoutes from './api/routes/debug.js';
 *    app.use('/api/debug', debugRoutes);
 * 
 * 2. In your memory storage function (persistent_memory.js or similar),
 *    add after successful store:
 *    
 *    import { logMemoryOperation } from '../routes/debug.js';
 *    
 *    // After storing memory:
 *    logMemoryOperation(userId, 'store', {
 *      memory_id: result.id,
 *      content_preview: content.substring(0, 120),
 *      category: category,
 *      dedup_triggered: dedupTriggered,
 *      dedup_merged_with: mergedWithId || null,
 *      stored: true
 *    });
 * 
 * 3. In your memory retrieval function, add after successful retrieve:
 *    
 *    logMemoryOperation(userId, 'retrieve', {
 *      memory_ids: results.map(r => r.id),
 *      query: query,
 *      category_searched: category,
 *      results_count: results.length
 *    });
 * 
 * 4. In your orchestrator where memory is injected into prompt, add:
 *    
 *    logMemoryOperation(userId, 'inject', {
 *      memory_injected: memories.length > 0,
 *      memory_ids: memories.map(m => m.id),
 *      token_count: totalTokens
 *    });
 * 
 * ═══════════════════════════════════════════════════════════════
 */
