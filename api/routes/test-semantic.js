/**
 * SEMANTIC LAYER TEST ENDPOINT
 * 
 * Test and verify semantic retrieval functionality
 * 
 * Usage: 
 *   GET /api/test-semantic?userId=xxx&query=your+query
 *   GET /api/test-semantic?action=stats&userId=xxx
 *   GET /api/test-semantic?action=backfill&limit=10
 * 
 * @module api/routes/test-semantic
 */

import { retrieveSemanticMemories, getRetrievalStats } from '../services/semantic-retrieval.js';
import { generateEmbedding, backfillEmbeddings } from '../services/embedding-service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const { action = 'retrieve', userId, query, mode = 'truth-general', limit = 10 } = req.query;

  try {
    switch (action) {
      // ============================================
      // TEST SEMANTIC RETRIEVAL
      // ============================================
      case 'retrieve': {
        if (!userId || !query) {
          return res.status(400).json({
            error: 'Missing required parameters',
            usage: '/api/test-semantic?userId=xxx&query=your+query&mode=truth-general'
          });
        }

        const result = await retrieveSemanticMemories(pool, query, {
          userId,
          mode,
          topK: parseInt(limit)
        });

        return res.status(200).json({
          action: 'retrieve',
          ...result
        });
      }

      // ============================================
      // GET USER STATS
      // ============================================
      case 'stats': {
        if (!userId) {
          return res.status(400).json({
            error: 'Missing userId',
            usage: '/api/test-semantic?action=stats&userId=xxx'
          });
        }

        const stats = await getRetrievalStats(pool, userId);
        return res.status(200).json({
          action: 'stats',
          ...stats
        });
      }

      // ============================================
      // TEST EMBEDDING GENERATION
      // ============================================
      case 'embed': {
        const testText = query || 'This is a test of the embedding generation system.';
        const result = await generateEmbedding(testText);

        return res.status(200).json({
          action: 'embed',
          input: testText.substring(0, 100) + (testText.length > 100 ? '...' : ''),
          success: result.success,
          dimensions: result.embedding?.length,
          model: result.model,
          timeMs: result.timeMs,
          error: result.error,
          // Show first/last few values as sample
          embeddingSample: result.embedding 
            ? [...result.embedding.slice(0, 5), '...', ...result.embedding.slice(-5)]
            : null
        });
      }

      // ============================================
      // RUN BACKFILL
      // ============================================
      case 'backfill': {
        const backfillLimit = parseInt(limit) || 10;
        const result = await backfillEmbeddings(pool, {
          batchSize: Math.min(backfillLimit, 20),
          maxBatches: Math.ceil(backfillLimit / 20)
        });

        return res.status(200).json({
          action: 'backfill',
          ...result
        });
      }

      // ============================================
      // SYSTEM HEALTH CHECK
      // ============================================
      case 'health': {
        // Check database connectivity
        const dbCheck = await pool.query('SELECT 1 as check');
        
        // Check embedding service
        const embedCheck = await generateEmbedding('health check', { timeout: 3000 });
        
        // Check table schema
        const schemaCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'persistent_memories'
          AND column_name IN ('embedding', 'embedding_status', 'fact_fingerprint', 'is_current', 'mode')
        `);

        const hasAllColumns = schemaCheck.rows.length >= 5;

        return res.status(200).json({
          action: 'health',
          status: (dbCheck.rows.length > 0 && embedCheck.success && hasAllColumns) ? 'healthy' : 'degraded',
          checks: {
            database: dbCheck.rows.length > 0 ? '✅ Connected' : '❌ Failed',
            embedding_api: embedCheck.success ? '✅ Working' : `⚠️ ${embedCheck.error}`,
            schema: hasAllColumns 
              ? '✅ All semantic columns present' 
              : `⚠️ Missing columns (found ${schemaCheck.rows.length}/5)`,
            columns_found: schemaCheck.rows.map(r => r.column_name)
          },
          timestamp: new Date().toISOString()
        });
      }

      // ============================================
      // SCHEMA INFO
      // ============================================
      case 'schema': {
        const { rows } = await pool.query(`
          SELECT 
            column_name, 
            data_type, 
            column_default,
            is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'persistent_memories'
          ORDER BY ordinal_position
        `);

        const { rows: indexes } = await pool.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'persistent_memories'
        `);

        return res.status(200).json({
          action: 'schema',
          columns: rows,
          indexes: indexes,
          semanticColumns: rows.filter(r => 
            ['embedding', 'embedding_status', 'embedding_updated_at', 'embedding_model',
             'fact_fingerprint', 'fingerprint_confidence', 'is_current', 'superseded_by',
             'superseded_at', 'mode'].includes(r.column_name)
          )
        });
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          availableActions: ['retrieve', 'stats', 'embed', 'backfill', 'health', 'schema'],
          examples: [
            '/api/test-semantic?action=health',
            '/api/test-semantic?action=schema',
            '/api/test-semantic?action=stats&userId=xxx',
            '/api/test-semantic?action=embed&query=test+text',
            '/api/test-semantic?userId=xxx&query=what+is+my+name',
            '/api/test-semantic?action=backfill&limit=10'
          ]
        });
    }
  } catch (error) {
    console.error('[TEST-SEMANTIC] Error:', error);
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  } finally {
    await pool.end();
  }
}
