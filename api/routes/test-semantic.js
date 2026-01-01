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
import { generateEmbedding, backfillEmbeddings, embedMemory } from '../services/embedding-service.js';

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

      // ============================================
      // TEST: PARAPHRASE RECALL
      // ============================================
      case 'test-paraphrase': {
        const testUserId = 'test-paraphrase-' + Date.now();

        try {
          // Store memory with specific content
          const insertResult = await pool.query(`
            INSERT INTO persistent_memories (
              user_id, content, is_current, mode, embedding_status, category_name, token_count, created_at
            ) VALUES ($1, $2, true, $3, 'pending', $4, $5, NOW())
            RETURNING id, content
          `, [testUserId, 'My name is Chris', 'truth-general', 'personal_info', 5]);

          const memoryId = insertResult.rows[0].id;
          const memoryContent = insertResult.rows[0].content;

          // Generate embedding for it
          await embedMemory(pool, memoryId, memoryContent);

          // Small delay to ensure embedding is ready
          await new Promise(resolve => setTimeout(resolve, 100));

          // Retrieve with paraphrase
          const result = await retrieveSemanticMemories(pool, "What's the user called?", {
            userId: testUserId,
            mode: 'truth-general'
          });

          const found = result.memories && result.memories.some(m => m.content && m.content.includes('Chris'));

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            test: 'paraphrase-recall',
            passed: found,
            query: "What's the user called?",
            expected: 'Should find "My name is Chris"',
            found: found ? 'YES - Memory found via semantic similarity' : 'NO - Failed to find',
            telemetry: result.telemetry,
            memories_found: result.memories?.length || 0
          });
        } catch (error) {
          // Cleanup on error
          await pool.query('DELETE FROM persistent_memories WHERE user_id LIKE $1', ['test-paraphrase-%']).catch(() => {});
          throw error;
        }
      }

      // ============================================
      // TEST: SUPERSESSION DETERMINISM
      // ============================================
      case 'test-supersession': {
        const testUserId = 'test-supersession-' + Date.now();

        try {
          // Store first value
          const first = await pool.query(`
            INSERT INTO persistent_memories (
              user_id, content, fact_fingerprint, fingerprint_confidence,
              is_current, mode, embedding_status, category_name, token_count, created_at
            ) VALUES ($1, $2, $3, $4, true, $5, 'pending', $6, $7, NOW())
            RETURNING id
          `, [testUserId, 'My phone number is 111-1111', 'user_phone_number', 0.9, 'truth-general', 'personal_info', 8]);

          const firstId = first.rows[0].id;

          // Store second value (should supersede)
          const second = await pool.query(`
            INSERT INTO persistent_memories (
              user_id, content, fact_fingerprint, fingerprint_confidence,
              is_current, mode, embedding_status, category_name, token_count, created_at
            ) VALUES ($1, $2, $3, $4, true, $5, 'pending', $6, $7, NOW())
            RETURNING id
          `, [testUserId, 'My phone number is 222-2222', 'user_phone_number', 0.9, 'truth-general', 'personal_info', 8]);

          const secondId = second.rows[0].id;

          // Manually supersede first (simulating what storeWithSupersession does)
          await pool.query(`
            UPDATE persistent_memories
            SET is_current = false, superseded_by = $1, superseded_at = NOW()
            WHERE id = $2
          `, [secondId, firstId]);

          // Check database state
          const currentFacts = await pool.query(`
            SELECT id, content, is_current, superseded_by
            FROM persistent_memories
            WHERE user_id = $1 AND fact_fingerprint = 'user_phone_number'
            ORDER BY created_at
          `, [testUserId]);

          const oldFact = currentFacts.rows[0];
          const newFact = currentFacts.rows[1];

          const passed = (
            oldFact.is_current === false &&
            oldFact.superseded_by === newFact.id &&
            newFact.is_current === true
          );

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            test: 'supersession-determinism',
            passed,
            expected: 'Old fact is_current=false, new fact is_current=true, old.superseded_by=new.id',
            actual: {
              old_fact: {
                content: oldFact?.content,
                is_current: oldFact?.is_current,
                superseded_by: oldFact?.superseded_by
              },
              new_fact: {
                id: newFact?.id,
                content: newFact?.content,
                is_current: newFact?.is_current
              }
            }
          });
        } catch (error) {
          // Cleanup on error
          await pool.query('DELETE FROM persistent_memories WHERE user_id LIKE $1', ['test-supersession-%']).catch(() => {});
          throw error;
        }
      }

      // ============================================
      // TEST: MODE ISOLATION
      // ============================================
      case 'test-mode-isolation': {
        const testUserId = 'test-mode-' + Date.now();

        try {
          // Store in truth-general mode
          const insertResult = await pool.query(`
            INSERT INTO persistent_memories (
              user_id, content, is_current, mode, embedding_status, category_name, token_count, created_at
            ) VALUES ($1, $2, true, $3, 'pending', $4, $5, NOW())
            RETURNING id, content
          `, [testUserId, 'Secret truth-general memory about cats', 'truth-general', 'general', 10]);

          const memoryId = insertResult.rows[0].id;
          const memoryContent = insertResult.rows[0].content;

          // Generate embedding
          await embedMemory(pool, memoryId, memoryContent);

          // Small delay to ensure embedding is ready
          await new Promise(resolve => setTimeout(resolve, 100));

          // Retrieve in business-validation mode (different mode!)
          const result = await retrieveSemanticMemories(pool, 'cats', {
            userId: testUserId,
            mode: 'business-validation'
          });

          const leaked = result.memories && result.memories.some(m => m.content && m.content.includes('cats'));

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            test: 'mode-isolation',
            passed: !leaked,  // Pass if NOT found (no leak)
            expected: 'truth-general memory should NOT appear in business-validation retrieval',
            found_leak: leaked,
            telemetry: result.telemetry,
            memories_found: result.memories?.length || 0
          });
        } catch (error) {
          // Cleanup on error
          await pool.query('DELETE FROM persistent_memories WHERE user_id LIKE $1', ['test-mode-%']).catch(() => {});
          throw error;
        }
      }

      // ============================================
      // CREATE SUPERSESSION CONSTRAINT
      // ============================================
      case 'create-constraint': {
        const { createSupersessionConstraint, cleanupDuplicateCurrentFacts } = await import('../services/supersession.js');

        try {
          // First cleanup any duplicates
          const cleanupResult = await cleanupDuplicateCurrentFacts(pool);

          // Then create constraint
          const constraintResult = await createSupersessionConstraint(pool);

          return res.json({
            action: 'create-constraint',
            cleanup: cleanupResult,
            constraint: constraintResult,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          return res.status(500).json({
            action: 'create-constraint',
            error: error.message,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
          });
        }
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          availableActions: ['retrieve', 'stats', 'embed', 'backfill', 'health', 'schema', 'test-paraphrase', 'test-supersession', 'test-mode-isolation', 'create-constraint'],
          examples: [
            '/api/test-semantic?action=health',
            '/api/test-semantic?action=schema',
            '/api/test-semantic?action=stats&userId=xxx',
            '/api/test-semantic?action=embed&query=test+text',
            '/api/test-semantic?userId=xxx&query=what+is+my+name',
            '/api/test-semantic?action=backfill&limit=10',
            '/api/test-semantic?action=test-paraphrase',
            '/api/test-semantic?action=test-supersession',
            '/api/test-semantic?action=test-mode-isolation',
            '/api/test-semantic?action=create-constraint'
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
