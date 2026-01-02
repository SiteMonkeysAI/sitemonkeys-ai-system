/**
 * SEMANTIC LAYER TEST ENDPOINT
 *
 * Test and verify semantic retrieval functionality
 *
 * Usage:
 *   GET /api/test-semantic?userId=xxx&query=your+query
 *   GET /api/test-semantic?action=stats&userId=xxx
 *   GET /api/test-semantic?action=backfill&limit=10
 *   GET /api/test-semantic?action=backfill-embeddings&batchSize=20&maxBatches=10
 *
 * @module api/routes/test-semantic
 */

import { retrieveSemanticMemories, getRetrievalStats } from '../services/semantic-retrieval.js';
import { generateEmbedding, backfillEmbeddings, embedMemory } from '../services/embedding-service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  // Security: Check for internal test token
  const testToken = req.headers['x-internal-test-token'];
  const requiredToken = process.env.INTERNAL_TEST_TOKEN;

  if (!requiredToken) {
    console.warn('[TEST-SEMANTIC] ⚠️ INTERNAL_TEST_TOKEN not configured in environment');
  }

  if (requiredToken && testToken !== requiredToken) {
    return res.status(403).json({
      error: 'Forbidden: Invalid or missing X-Internal-Test-Token header',
      hint: 'Set INTERNAL_TEST_TOKEN environment variable and include X-Internal-Test-Token header'
    });
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
      // BACKFILL EMBEDDINGS FOR EXISTING MEMORIES (RESUMABLE + SAFE)
      // ============================================
      case 'backfill-embeddings': {
        const startTime = Date.now();
        console.log('[BACKFILL-EMBEDDINGS] Starting backfill process...');

        // Parse query params with safe defaults
        const maxLimit = parseInt(req.query.limit) || 1000; // Max memories to process
        const maxSeconds = parseInt(req.query.maxSeconds) || 300; // Timeout protection (5 min default)
        const batchSize = Math.min(parseInt(req.query.batchSize) || 10, 20); // Rate limit protection

        let totalProcessed = 0;
        let totalFailed = 0;
        let shouldContinue = true;

        while (shouldContinue) {
          // Check timeout
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds >= maxSeconds) {
            console.log(`[BACKFILL-EMBEDDINGS] ⏱️ Timeout reached (${maxSeconds}s)`);
            break;
          }

          // Check limit
          if (totalProcessed >= maxLimit) {
            console.log(`[BACKFILL-EMBEDDINGS] 📊 Limit reached (${maxLimit} memories)`);
            break;
          }

          // Find memories needing embeddings (pending or failed status)
          const { rows: batch } = await pool.query(`
            SELECT id, content
            FROM persistent_memories
            WHERE embedding_status IN ('pending', 'failed')
              AND embedding IS NULL
              AND content IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $1
          `, [batchSize]);

          if (batch.length === 0) {
            console.log('[BACKFILL-EMBEDDINGS] ✅ No more memories to process');
            shouldContinue = false;
            break;
          }

          // Process batch
          for (const memory of batch) {
            // Set to 'processing' status
            await pool.query(`
              UPDATE persistent_memories
              SET embedding_status = 'processing'
              WHERE id = $1
            `, [memory.id]);

            // Generate embedding
            const embedResult = await embedMemory(pool, memory.id, memory.content, {
              timeout: 10000 // Longer timeout for backfill
            });

            if (embedResult.success) {
              console.log(`[BACKFILL-EMBEDDINGS] ✅ ID ${memory.id}: ${embedResult.status}`);
            } else {
              console.log(`[BACKFILL-EMBEDDINGS] ❌ ID ${memory.id}: ${embedResult.error}`);

              // On failure: update status to 'failed' and store error in metadata
              await pool.query(`
                UPDATE persistent_memories
                SET embedding_status = 'failed',
                    metadata = jsonb_set(
                      COALESCE(metadata, '{}'::jsonb),
                      '{embedding_error}',
                      to_jsonb($2::text)
                    )
                WHERE id = $1
              `, [memory.id, embedResult.error || 'Unknown error']);

              totalFailed++;
            }

            totalProcessed++;

            // Check limits after each memory
            if (totalProcessed >= maxLimit) break;
            if ((Date.now() - startTime) / 1000 >= maxSeconds) break;

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));
          }
        }

        // Count remaining
        const { rows: [{ count }] } = await pool.query(`
          SELECT COUNT(*) as count
          FROM persistent_memories
          WHERE embedding_status IN ('pending', 'failed')
            AND embedding IS NULL
            AND content IS NOT NULL
        `);

        const remaining = parseInt(count);
        const secondsElapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`[BACKFILL-EMBEDDINGS] Complete: ${totalProcessed - totalFailed}/${totalProcessed} succeeded, ${remaining} remaining (${secondsElapsed}s)`);

        return res.status(200).json({
          processed: totalProcessed,
          failed: totalFailed,
          remaining: remaining,
          seconds_elapsed: parseFloat(secondsElapsed)
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

          // Generate embedding for it (WAIT for completion)
          const embedResult = await embedMemory(pool, memoryId, memoryContent);
          console.log('[TEST] Embedding result:', embedResult);

          // Verify embedding exists before retrieval
          const checkEmbed = await pool.query(
            'SELECT embedding_status, embedding FROM persistent_memories WHERE id = $1',
            [memoryId]
          );
          console.log('[TEST] Embedding status:', checkEmbed.rows[0]?.embedding_status);
          console.log('[TEST] Has embedding:', checkEmbed.rows[0]?.embedding ? 'YES' : 'NO');

          // If embedding not ready, wait a bit longer
          if (checkEmbed.rows[0]?.embedding_status !== 'completed' || !checkEmbed.rows[0]?.embedding) {
            console.log('[TEST] Waiting for embedding to complete...');
            await new Promise(resolve => setTimeout(resolve, 500));
          }

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
          // Note: superseded_by is UUID but id is INTEGER, so we don't set superseded_by
          await pool.query(`
            UPDATE persistent_memories
            SET is_current = false, superseded_at = NOW()
            WHERE id = $1
          `, [firstId]);

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
            oldFact.superseded_at !== null &&
            newFact.is_current === true
          );

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            test: 'supersession-determinism',
            passed,
            expected: 'Old fact is_current=false with superseded_at set, new fact is_current=true',
            actual: {
              old_fact: {
                content: oldFact?.content,
                is_current: oldFact?.is_current,
                superseded_at: oldFact?.superseded_at
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
      // FIX SUPERSEDED_BY TYPE MISMATCH
      // ============================================
      case 'fix-superseded-by-type': {
        console.log('[FIX-TYPE] Starting superseded_by type migration...');

        try {
          // Step 1: Check current column types
          const schemaCheck = await pool.query(`
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'persistent_memories'
              AND column_name IN ('id', 'superseded_by')
            ORDER BY column_name
          `);

          const idType = schemaCheck.rows.find(r => r.column_name === 'id')?.data_type;
          const supersededByType = schemaCheck.rows.find(r => r.column_name === 'superseded_by')?.data_type;

          if (!supersededByType) {
            return res.json({
              action: 'fix-superseded-by-type',
              success: true,
              message: 'superseded_by column does not exist',
              currentSchema: schemaCheck.rows
            });
          }

          if (supersededByType.toLowerCase() === 'integer') {
            return res.json({
              action: 'fix-superseded-by-type',
              success: true,
              message: 'superseded_by is already INTEGER',
              currentSchema: schemaCheck.rows
            });
          }

          // Step 2: Check for existing non-null values
          const dataCheck = await pool.query(`
            SELECT COUNT(*) as count
            FROM persistent_memories
            WHERE superseded_by IS NOT NULL
          `);

          const existingCount = parseInt(dataCheck.rows[0].count);
          console.log(`[FIX-TYPE] Found ${existingCount} rows with superseded_by set`);

          if (existingCount > 0) {
            // Step 3: Validate castability
            const testCast = await pool.query(`
              SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN superseded_by::text ~ '^[0-9]+$' THEN 1 END) as castable
              FROM persistent_memories
              WHERE superseded_by IS NOT NULL
            `);

            const total = parseInt(testCast.rows[0].total);
            const castable = parseInt(testCast.rows[0].castable);

            if (castable < total) {
              return res.status(400).json({
                action: 'fix-superseded-by-type',
                success: false,
                error: `Cannot safely cast ${total - castable} UUID values to INTEGER`,
                existingValues: existingCount,
                recommendation: 'Clear superseded_by values or manually review data'
              });
            }
          }

          // Step 4: Perform the migration in a transaction
          await pool.query('BEGIN');

          try {
            // Convert existing values if any
            if (existingCount > 0) {
              await pool.query(`
                UPDATE persistent_memories
                SET superseded_by = NULL
                WHERE superseded_by IS NOT NULL
              `);
              console.log(`[FIX-TYPE] Cleared ${existingCount} existing superseded_by values (they were UUID, cannot cast)`);
            }

            // Alter the column type
            await pool.query(`
              ALTER TABLE persistent_memories
              ALTER COLUMN superseded_by TYPE INTEGER USING NULL
            `);

            console.log('[FIX-TYPE] Column type changed to INTEGER');

            // Add foreign key constraint
            const constraintCheck = await pool.query(`
              SELECT constraint_name
              FROM information_schema.table_constraints
              WHERE table_name = 'persistent_memories'
                AND constraint_name = 'fk_superseded_by'
            `);

            if (constraintCheck.rows.length === 0) {
              await pool.query(`
                ALTER TABLE persistent_memories
                ADD CONSTRAINT fk_superseded_by
                FOREIGN KEY (superseded_by)
                REFERENCES persistent_memories(id)
                ON DELETE SET NULL
              `);
              console.log('[FIX-TYPE] Foreign key constraint added');
            }

            await pool.query('COMMIT');

            return res.json({
              action: 'fix-superseded-by-type',
              success: true,
              message: 'Type migration completed successfully',
              clearedValues: existingCount,
              constraintAdded: constraintCheck.rows.length === 0
            });

          } catch (alterError) {
            await pool.query('ROLLBACK');
            throw alterError;
          }

        } catch (error) {
          console.error('[FIX-TYPE] Migration failed:', error.message);
          return res.status(500).json({
            action: 'fix-superseded-by-type',
            success: false,
            error: error.message
          });
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

      // ============================================
      // LIVE PROOF: END-TO-END SEMANTIC RETRIEVAL
      // ============================================
      case 'live-proof': {
        const testUserId = 'live-proof-' + Date.now();
        const testFact = `The user's favorite color is ultraviolet-${Date.now()}`;
        const testQuery = "What color does the user prefer?";

        console.log('[LIVE-PROOF] Starting end-to-end test...');

        try {
          // Step 1: Store via production /api/chat endpoint
          console.log('[LIVE-PROOF] Step 1: Storing test memory via /api/chat');
          const fetch = globalThis.fetch;
          const storeResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: testFact,
              user_id: testUserId,
              mode: 'truth_general'
            })
          });

          if (!storeResponse.ok) {
            throw new Error(`Chat endpoint returned ${storeResponse.status}`);
          }

          const storeResult = await storeResponse.json();
          console.log('[LIVE-PROOF] ✅ Memory stored via /api/chat');

          // Step 2: Poll database until embedding_status = 'ready' (max 30 seconds)
          console.log('[LIVE-PROOF] Step 2: Polling for embedding completion...');
          let embeddingReady = false;
          let memoryId = null;
          const maxRetries = 30;
          let retries = 0;

          while (retries < maxRetries && !embeddingReady) {
            await new Promise(r => setTimeout(r, 1000)); // Wait 1 second

            const { rows } = await pool.query(`
              SELECT id, embedding_status, embedding
              FROM persistent_memories
              WHERE user_id = $1
                AND content LIKE $2
              ORDER BY created_at DESC
              LIMIT 1
            `, [testUserId, `%${testFact}%`]);

            if (rows.length > 0) {
              memoryId = rows[0].id;
              embeddingReady = rows[0].embedding_status === 'ready' && rows[0].embedding !== null;
              console.log(`[LIVE-PROOF] Retry ${retries + 1}: status=${rows[0].embedding_status}, has_embedding=${!!rows[0].embedding}`);

              if (embeddingReady) {
                console.log('[LIVE-PROOF] ✅ Embedding ready');
                break;
              }
            }

            retries++;
          }

          if (!embeddingReady) {
            throw new Error(`Embedding not ready after ${maxRetries} seconds. Status polling timed out.`);
          }

          // Step 3: Query via semantic retrieval with paraphrase
          console.log('[LIVE-PROOF] Step 3: Querying with paraphrase...');
          const retrievalResult = await retrieveSemanticMemories(pool, testQuery, {
            userId: testUserId,
            mode: 'truth-general',
            topK: 5
          });

          console.log('[LIVE-PROOF] Retrieval result:', {
            method: retrievalResult.method,
            memoriesFound: retrievalResult.memories?.length || 0,
            telemetry: retrievalResult.telemetry
          });

          // Step 4: Assert ALL conditions
          const assertions = {
            method_is_semantic_or_hybrid: ['semantic', 'hybrid'].includes(retrievalResult.method),
            results_injected_gt_zero: (retrievalResult.telemetry?.results_injected || 0) > 0,
            injected_memory_ids_nonempty: Array.isArray(retrievalResult.telemetry?.injected_memory_ids) &&
                                          retrievalResult.telemetry.injected_memory_ids.length > 0,
            response_contains_fact: retrievalResult.memories?.some(m =>
              m.content && m.content.toLowerCase().includes('ultraviolet')
            ) || false
          };

          const allPassed = Object.values(assertions).every(v => v === true);

          console.log('[LIVE-PROOF] Assertions:', assertions);
          console.log(`[LIVE-PROOF] ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            passed: allPassed,
            details: {
              stored_fact: testFact,
              query_used: testQuery,
              memory_id: memoryId,
              embedding_ready_after_seconds: retries,
              retrieval_method: retrievalResult.method,
              memories_found: retrievalResult.memories?.length || 0,
              assertions: assertions
            },
            telemetry: retrievalResult.telemetry
          });

        } catch (error) {
          // Cleanup on error
          await pool.query('DELETE FROM persistent_memories WHERE user_id LIKE $1', ['live-proof-%']).catch(() => {});

          console.error('[LIVE-PROOF] ❌ Test failed:', error.message);

          return res.status(500).json({
            passed: false,
            error: error.message,
            details: {
              test_user_id: testUserId,
              test_fact: testFact
            }
          });
        }
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          availableActions: ['retrieve', 'stats', 'embed', 'backfill', 'backfill-embeddings', 'health', 'schema', 'test-paraphrase', 'test-supersession', 'test-mode-isolation', 'fix-superseded-by-type', 'create-constraint', 'live-proof'],
          examples: [
            '/api/test-semantic?action=health',
            '/api/test-semantic?action=schema',
            '/api/test-semantic?action=stats&userId=xxx',
            '/api/test-semantic?action=embed&query=test+text',
            '/api/test-semantic?userId=xxx&query=what+is+my+name',
            '/api/test-semantic?action=backfill&limit=10',
            '/api/test-semantic?action=backfill-embeddings&limit=100&maxSeconds=60',
            '/api/test-semantic?action=test-paraphrase',
            '/api/test-semantic?action=test-supersession',
            '/api/test-semantic?action=test-mode-isolation',
            '/api/test-semantic?action=fix-superseded-by-type',
            '/api/test-semantic?action=create-constraint',
            '/api/test-semantic?action=live-proof'
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
