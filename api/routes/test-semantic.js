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
          // CLEANUP: Delete any leftover test data from previous runs
          console.log('[TEST-PARAPHRASE] Cleaning up previous test data...');
          await pool.query(`
            DELETE FROM persistent_memories
            WHERE user_id LIKE 'test-paraphrase-%'
          `);
          console.log('[TEST-PARAPHRASE] Cleanup complete');

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
          if (checkEmbed.rows[0]?.embedding_status !== 'ready' || !checkEmbed.rows[0]?.embedding) {
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
          // CLEANUP: Delete any leftover test data from previous runs
          console.log('[TEST-SUPERSESSION] Cleaning up previous test data...');
          await pool.query(`
            DELETE FROM persistent_memories
            WHERE user_id LIKE 'test-supersession-%'
          `);
          console.log('[TEST-SUPERSESSION] Cleanup complete');

          // Import supersession service
          const { storeWithSupersession } = await import('../services/supersession.js');

          // Store first value using storeWithSupersession
          console.log('[TEST-SUPERSESSION] Storing first fact...');
          const firstResult = await storeWithSupersession(pool, {
            userId: testUserId,
            content: 'My phone number is 111-1111',
            factFingerprint: 'user_phone_number',
            fingerprintConfidence: 0.9,
            mode: 'truth-general',
            categoryName: 'personal_info',
            tokenCount: 8
          });

          const firstId = firstResult.memoryId;
          console.log(`[TEST-SUPERSESSION] First fact stored with ID ${firstId}`);

          // Store second value (should supersede first)
          console.log('[TEST-SUPERSESSION] Storing second fact (should supersede)...');
          const secondResult = await storeWithSupersession(pool, {
            userId: testUserId,
            content: 'My phone number is 222-2222',
            factFingerprint: 'user_phone_number',
            fingerprintConfidence: 0.9,
            mode: 'truth-general',
            categoryName: 'personal_info',
            tokenCount: 8
          });

          const secondId = secondResult.memoryId;
          console.log(`[TEST-SUPERSESSION] Second fact stored with ID ${secondId}`);
          console.log(`[TEST-SUPERSESSION] Superseded count: ${secondResult.supersededCount}`);

          // Check database state
          const currentFacts = await pool.query(`
            SELECT id, content, is_current, superseded_by, superseded_at
            FROM persistent_memories
            WHERE user_id = $1 AND fact_fingerprint = 'user_phone_number'
            ORDER BY created_at
          `, [testUserId]);

          const oldFact = currentFacts.rows[0];
          const newFact = currentFacts.rows[1];

          const passed = (
            oldFact.is_current === false &&
            oldFact.superseded_at !== null &&
            oldFact.superseded_by === secondId &&
            newFact.is_current === true &&
            secondResult.supersededCount === 1
          );

          // Cleanup
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);

          return res.json({
            test: 'supersession-determinism',
            passed,
            expected: 'Old fact is_current=false with superseded_at and superseded_by set, new fact is_current=true',
            actual: {
              old_fact: {
                id: oldFact?.id,
                content: oldFact?.content,
                is_current: oldFact?.is_current,
                superseded_at: oldFact?.superseded_at,
                superseded_by: oldFact?.superseded_by
              },
              new_fact: {
                id: newFact?.id,
                content: newFact?.content,
                is_current: newFact?.is_current
              },
              supersession_result: {
                supersededCount: secondResult.supersededCount,
                superseded: secondResult.superseded
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
          // CLEANUP: Delete any leftover test data from previous runs
          console.log('[TEST-MODE-ISOLATION] Cleaning up previous test data...');
          await pool.query(`
            DELETE FROM persistent_memories
            WHERE user_id LIKE 'test-mode-%'
          `);
          console.log('[TEST-MODE-ISOLATION] Cleanup complete');

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
      // DEBUG FACTS: INSPECT FINGERPRINTED FACTS
      // ============================================
      case 'debug-facts': {
        const { userId: debugUserId, fingerprint } = req.query;

        if (!debugUserId) {
          return res.status(400).json({
            error: 'Missing userId parameter',
            usage: '/api/test-semantic?action=debug-facts&userId=xxx&fingerprint=user_phone_number'
          });
        }

        try {
          let query = `
            SELECT
              id,
              content,
              fact_fingerprint,
              fingerprint_confidence,
              is_current,
              superseded_by,
              superseded_at,
              created_at,
              mode,
              category_name
            FROM persistent_memories
            WHERE user_id = $1
          `;
          const params = [debugUserId];

          // Filter by fingerprint if provided
          if (fingerprint) {
            query += ` AND fact_fingerprint = $2`;
            params.push(fingerprint);
          }

          query += ` ORDER BY created_at DESC LIMIT 100`;

          const { rows } = await pool.query(query, params);

          // Group by fingerprint for easier analysis
          const grouped = {};
          for (const row of rows) {
            const fp = row.fact_fingerprint || 'none';
            if (!grouped[fp]) {
              grouped[fp] = [];
            }
            grouped[fp].push({
              id: row.id,
              content: row.content.substring(0, 100),
              fingerprint: row.fact_fingerprint,
              confidence: row.fingerprint_confidence,
              is_current: row.is_current,
              superseded_by: row.superseded_by,
              superseded_at: row.superseded_at,
              created_at: row.created_at,
              mode: row.mode,
              category: row.category_name
            });
          }

          return res.status(200).json({
            action: 'debug-facts',
            userId: debugUserId,
            fingerprint_filter: fingerprint || 'all',
            total_facts: rows.length,
            facts_by_fingerprint: grouped,
            raw_facts: rows.map(r => ({
              id: r.id,
              content: r.content,
              fact_fingerprint: r.fact_fingerprint,
              fingerprint_confidence: r.fingerprint_confidence,
              is_current: r.is_current,
              superseded_by: r.superseded_by,
              superseded_at: r.superseded_at,
              created_at: r.created_at,
              mode: r.mode,
              category_name: r.category_name
            }))
          });

        } catch (error) {
          console.error('[DEBUG-FACTS] Error:', error.message);
          return res.status(500).json({
            action: 'debug-facts',
            error: error.message
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
          // CLEANUP: Delete any leftover test data from previous runs
          console.log('[LIVE-PROOF] Cleaning up previous test data...');
          await pool.query(`
            DELETE FROM persistent_memories
            WHERE user_id LIKE 'live-proof-%'
          `);
          console.log('[LIVE-PROOF] Cleanup complete');

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
              ORDER BY created_at DESC
              LIMIT 1
            `, [testUserId]);

            if (rows.length > 0) {
              memoryId = rows[0].id;
              const currentStatus = rows[0].embedding_status;
              const hasEmbedding = rows[0].embedding !== null;
              embeddingReady = currentStatus === 'ready' && hasEmbedding;

              console.log(`[LIVE-PROOF] Polling memory ${memoryId}, status: ${currentStatus}, has_embedding: ${hasEmbedding}`);

              if (embeddingReady) {
                console.log('[LIVE-PROOF] ✅ Embedding ready');
                break;
              }
            } else {
              console.log(`[LIVE-PROOF] Retry ${retries + 1}: No memory found yet for user ${testUserId}`);
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
            method_is_semantic_or_hybrid: ['semantic', 'hybrid'].includes(retrievalResult.telemetry?.method),
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

      // ============================================
      // SCALE: GENERATE TEST DATA
      // ============================================
      case 'scale-generate': {
        const { generateTestData } = await import('../services/scale-harness.js');

        const testUserId = req.query.userId || `test-scale-${Date.now()}`;
        const count = Math.min(parseInt(req.query.count) || 100, 200); // Cap at 200 for cost control
        const runId = req.query.runId || `run-${Date.now()}`;
        const mode = req.query.mode || 'truth-general';
        const skipEmbedding = req.query.skipEmbedding === 'true';

        const result = await generateTestData(pool, testUserId, count, {
          runId,
          mode,
          skipEmbedding
        });

        return res.status(200).json({
          action: 'scale-generate',
          ...result
        });
      }

      // ============================================
      // SCALE: RUN BENCHMARK
      // ============================================
      case 'scale-benchmark': {
        const { runBenchmark, validateInvariants } = await import('../services/scale-harness.js');
        const { measureBehavioral } = await import('../services/behavioral-detection.js');

        const testUserId = req.query.userId;
        if (!testUserId) {
          return res.status(400).json({
            error: 'Missing userId parameter',
            usage: '/api/test-semantic?action=scale-benchmark&userId=test-scale-xxx&queryCount=20'
          });
        }

        const queryCount = Math.min(parseInt(req.query.queryCount) || 20, 500);
        const mode = req.query.mode || 'truth-general';

        const benchmarkResult = await runBenchmark(pool, testUserId, queryCount, { mode });

        // Validate invariants
        const invariantResult = await validateInvariants(pool, testUserId, benchmarkResult);

        // Measure behavioral (observational only)
        const behavioral = measureBehavioral(JSON.stringify(benchmarkResult));

        return res.status(200).json({
          action: 'scale-benchmark',
          benchmark: benchmarkResult,
          invariants: invariantResult,
          behavioral
        });
      }

      // ============================================
      // SCALE: FULL STRESS TEST
      // ============================================
      case 'scale-full': {
        const { generateTestData, generateSupersessionChains, runBenchmark, validateInvariants, cleanup } = await import('../services/scale-harness.js');
        const { measureBehavioral } = await import('../services/behavioral-detection.js');

        const level = req.query.level || 'smoke';
        const allowExtreme = req.query.allowExtreme === 'true';

        // Define stress test levels
        const levels = {
          smoke: { memories: 100, queries: 20 },
          light: { memories: 500, queries: 50 },
          medium: { memories: 2000, queries: 100 },
          heavy: { memories: 5000, queries: 150 },
          extreme: { memories: 25000, queries: 500 }
        };

        if (!levels[level]) {
          return res.status(400).json({
            error: `Invalid level: ${level}`,
            availableLevels: Object.keys(levels)
          });
        }

        if (level === 'extreme' && !allowExtreme) {
          return res.status(403).json({
            error: 'Extreme level requires allowExtreme=true parameter',
            warning: 'This will generate 25,000 memories and cost significant API credits'
          });
        }

        const config = levels[level];
        const testUserId = `test-scale-${level}-${Date.now()}`;
        const runId = `run-${level}-${Date.now()}`;
        const mode = req.query.mode || 'truth-general';
        const maxSeconds = parseInt(req.query.maxSeconds) || 25; // Default 25s to leave buffer

        const startTime = Date.now();
        const results = {
          level,
          config,
          testUserId,
          runId,
          steps: {},
          completedPhases: []
        };

        // Helper to check timeout
        const checkTimeout = () => {
          const elapsed = (Date.now() - startTime) / 1000;
          return elapsed >= maxSeconds;
        };

        try {
          // Step 1: Generate test data
          console.log(`[SCALE-FULL] Step 1: Generating ${config.memories} memories...`);
          const generateResult = await generateTestData(pool, testUserId, config.memories, {
            runId,
            mode,
            skipEmbedding: false
          });
          results.steps.generate = generateResult;
          results.completedPhases.push('generate');

          // Check time budget after generation
          if (checkTimeout()) {
            results.status = 'partial';
            results.nextAction = `scale-embed&userId=${testUserId}`;
            results.elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
            results.message = 'Timeout after generation phase. Use scale-embed to continue embedding, then resume with scale-benchmark.';
            console.log(`[SCALE-FULL] Timeout after generate phase (${results.elapsedSeconds}s)`);
            return res.status(200).json(results);
          }

          // Step 2: Generate supersession chains
          console.log(`[SCALE-FULL] Step 2: Generating supersession chains...`);
          const supersessionResult = await generateSupersessionChains(pool, testUserId, runId, mode);
          results.steps.supersession = supersessionResult;
          results.completedPhases.push('supersession');

          // Check time budget after supersession
          if (checkTimeout()) {
            results.status = 'partial';
            results.nextAction = `scale-benchmark&userId=${testUserId}&queries=${config.queries}`;
            results.elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
            results.message = 'Timeout after supersession phase. Resume with scale-benchmark.';
            console.log(`[SCALE-FULL] Timeout after supersession phase (${results.elapsedSeconds}s)`);
            return res.status(200).json(results);
          }

          // Step 3: Run benchmark
          console.log(`[SCALE-FULL] Step 3: Running ${config.queries} queries...`);
          const benchmarkResult = await runBenchmark(pool, testUserId, config.queries, { mode });
          results.steps.benchmark = benchmarkResult;
          results.completedPhases.push('benchmark');

          // Check time budget after benchmark
          if (checkTimeout()) {
            results.status = 'partial';
            results.nextAction = `scale-invariants&userId=${testUserId}`;
            results.elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
            results.message = 'Timeout after benchmark phase. Resume with scale-invariants.';
            console.log(`[SCALE-FULL] Timeout after benchmark phase (${results.elapsedSeconds}s)`);
            return res.status(200).json(results);
          }

          // Step 4: Validate invariants
          console.log(`[SCALE-FULL] Step 4: Validating invariants...`);
          const invariantResult = await validateInvariants(pool, testUserId, benchmarkResult);
          results.steps.invariants = invariantResult;
          results.completedPhases.push('invariants');

          // Step 5: Measure behavioral (observational)
          console.log(`[SCALE-FULL] Step 5: Measuring behavioral patterns...`);
          const behavioral = measureBehavioral(JSON.stringify(benchmarkResult));
          results.steps.behavioral = behavioral;
          results.completedPhases.push('behavioral');

          // Step 6: Cleanup
          console.log(`[SCALE-FULL] Step 6: Cleaning up test data...`);
          const cleanupResult = await cleanup(pool, testUserId, null, { force: true });
          results.steps.cleanup = cleanupResult;
          results.completedPhases.push('cleanup');

          results.status = 'complete';
          results.elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
          results.passed = invariantResult.allPassed;

          console.log(`[SCALE-FULL] Complete: ${results.passed ? 'PASSED' : 'FAILED'} in ${results.elapsedSeconds}s`);

          return res.status(200).json(results);

        } catch (error) {
          console.error('[SCALE-FULL] Error:', error.message);

          // Attempt cleanup on error (force=true to clean up immediately)
          await cleanup(pool, testUserId, null, { force: true }).catch(() => {});

          return res.status(500).json({
            action: 'scale-full',
            error: error.message,
            level,
            testUserId,
            results
          });
        }
      }

      // ============================================
      // SCALE: CLEANUP TEST DATA
      // ============================================
      case 'scale-cleanup': {
        const { cleanup } = await import('../services/scale-harness.js');

        const testUserId = req.query.userId;
        if (!testUserId) {
          return res.status(400).json({
            error: 'Missing userId parameter',
            usage: '/api/test-semantic?action=scale-cleanup&userId=test-scale-xxx&force=true&minAgeMinutes=10'
          });
        }

        const runId = req.query.runId || null;
        const force = req.query.force === 'true';
        const minAgeMinutes = parseInt(req.query.minAgeMinutes) || 10;

        const result = await cleanup(pool, testUserId, runId, { force, minAgeMinutes });

        return res.status(200).json({
          action: 'scale-cleanup',
          ...result
        });
      }

      // ============================================
      // SCALE: GET STATUS
      // ============================================
      case 'scale-status': {
        const testUserId = req.query.userId;
        if (!testUserId) {
          return res.status(400).json({
            error: 'Missing userId parameter',
            usage: '/api/test-semantic?action=scale-status&userId=test-scale-xxx'
          });
        }

        try {
          // Get actual DB counts
          const countResult = await pool.query(`
            SELECT
              COUNT(*) as total,
              COUNT(CASE WHEN embedding_status = 'ready' THEN 1 END) as embedded,
              COUNT(CASE WHEN embedding_status = 'pending' THEN 1 END) as pending,
              COUNT(CASE WHEN embedding_status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN embedding_status = 'skipped' THEN 1 END) as skipped
            FROM persistent_memories
            WHERE user_id = $1
          `, [testUserId]);

          // Get run information from metadata
          const runsResult = await pool.query(`
            SELECT
              metadata->>'run_id' as run_id,
              COUNT(*) as count,
              MIN(created_at) as started_at,
              MAX(created_at) as last_activity
            FROM persistent_memories
            WHERE user_id = $1 AND metadata->>'run_id' IS NOT NULL
            GROUP BY metadata->>'run_id'
            ORDER BY MAX(created_at) DESC
          `, [testUserId]);

          // Get tripwire count
          const tripwireResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM persistent_memories
            WHERE user_id = $1 AND fact_fingerprint LIKE 'tripwire_%'
          `, [testUserId]);

          const counts = countResult.rows[0];

          return res.status(200).json({
            action: 'scale-status',
            success: true,
            userId: testUserId,
            totalMemories: parseInt(counts.total),
            embeddingStatus: {
              ready: parseInt(counts.embedded),
              pending: parseInt(counts.pending),
              failed: parseInt(counts.failed),
              skipped: parseInt(counts.skipped || 0)
            },
            tripwires: parseInt(tripwireResult.rows[0].count),
            runs: runsResult.rows.map(r => ({
              runId: r.run_id,
              count: parseInt(r.count),
              startedAt: r.started_at,
              lastActivity: r.last_activity
            }))
          });
        } catch (error) {
          console.error('[SCALE-STATUS] Error:', error.message);
          return res.status(500).json({
            action: 'scale-status',
            success: false,
            error: error.message,
            userId: testUserId
          });
        }
      }

      // ============================================
      // SCALE: TWO-PHASE EMBEDDING
      // ============================================
      case 'scale-embed': {
        const { embedMemory } = await import('../services/embedding-service.js');

        const testUserId = req.query.userId;
        if (!testUserId) {
          return res.status(400).json({
            error: 'Missing userId parameter',
            usage: '/api/test-semantic?action=scale-embed&userId=test-scale-xxx&batchSize=10'
          });
        }

        const batchSize = Math.min(parseInt(req.query.batchSize) || 10, 50);
        const startTime = Date.now();
        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        try {
          // Find memories needing embeddings
          const { rows } = await pool.query(`
            SELECT id, content
            FROM persistent_memories
            WHERE user_id = $1
              AND embedding_status IN ('pending', 'failed')
              AND embedding IS NULL
              AND content IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $2
          `, [testUserId, batchSize]);

          for (const memory of rows) {
            const result = await embedMemory(pool, memory.id, memory.content);
            processed++;
            if (result.success) {
              succeeded++;
            } else {
              failed++;
            }
          }

          const elapsedMs = Date.now() - startTime;

          return res.status(200).json({
            action: 'scale-embed',
            userId: testUserId,
            processed,
            succeeded,
            failed,
            elapsedMs
          });

        } catch (error) {
          console.error('[SCALE-EMBED] Error:', error.message);
          return res.status(500).json({
            action: 'scale-embed',
            error: error.message,
            userId: testUserId,
            processed,
            succeeded,
            failed
          });
        }
      }

      // ============================================
      // TEST: DOCTRINE GATES
      // ============================================
      case 'test-doctrine-gates': {
        const { enforceDoctrineGates } = await import('../services/doctrine-gates.js');
        const { enhanceToPassGates } = await import('../services/response-enhancer.js');

        // Test cases from issue #286
        const testCases = [
          {
            name: 'Test 1: Uncertainty Without Structure',
            response: "I'm not sure about that.",
            context: {},
            shouldFail: true,
            expectedIssue: 'missing explanation and framework'
          },
          {
            name: 'Test 2: Advice Without Blind Spots',
            response: "You should definitely invest in index funds.",
            context: {},
            shouldFail: true,
            expectedIssue: 'missing caveats'
          },
          {
            name: 'Test 3: Engagement Bait in Closure',
            response: "Here's how to reset your password: Click Settings, then Security, then Reset Password. Let me know if you need anything else!",
            context: {},
            shouldFail: true,
            expectedIssue: 'engagement bait in closure'
          },
          {
            name: 'Test 4: Generic Examples',
            response: "You could use frameworks like X or Y, etc.",
            context: {},
            shouldFail: true,
            expectedIssue: 'generic examples'
          },
          {
            name: 'Test 5: Perfect Truth-First Response',
            response: "I'm not certain about the exact implementation details because this depends on your specific setup. However, based on common configurations, you could try using React (with 200K+ npm packages and strong TypeScript support) or Vue.js (gentler learning curve, 10K+ packages). That said, keep in mind that framework choice depends on your team's expertise and project requirements. Consider also that switching frameworks mid-project can be costly.",
            context: {},
            shouldFail: false,
            expectedIssue: 'none'
          }
        ];

        const results = [];

        for (const testCase of testCases) {
          console.log(`[TEST-DOCTRINE-GATES] Running: ${testCase.name}`);

          // Evaluate with doctrine gates
          const gateResult = enforceDoctrineGates(testCase.response, testCase.context);

          // Check if result matches expectation
          const passed = testCase.shouldFail ? !gateResult.passed : gateResult.passed;

          // Try enhancement if it failed
          let enhancementResult = null;
          if (!gateResult.passed) {
            enhancementResult = enhanceToPassGates(testCase.response, gateResult, testCase.context);
          }

          results.push({
            test: testCase.name,
            passed: passed,
            expected: testCase.shouldFail ? 'FAIL' : 'PASS',
            actual: gateResult.passed ? 'PASS' : 'FAIL',
            compositeScore: gateResult.compositeScore,
            minimumScore: gateResult.minimumScore,
            gates: {
              uncertainty: gateResult.uncertainty,
              blindSpots: gateResult.blindSpots,
              antiEngagement: gateResult.antiEngagement,
              exampleQuality: gateResult.exampleQuality
            },
            feedback: gateResult.feedback,
            enhancement: enhancementResult ? {
              improved: enhancementResult.improved,
              newScore: enhancementResult.newResults.compositeScore,
              enhancements: enhancementResult.enhancements
            } : null
          });
        }

        const allPassed = results.every(r => r.passed);

        return res.status(200).json({
          action: 'test-doctrine-gates',
          passed: allPassed,
          totalTests: results.length,
          passedTests: results.filter(r => r.passed).length,
          results: results,
          summary: allPassed
            ? '✅ All doctrine gate tests passed'
            : `❌ ${results.filter(r => !r.passed).length} test(s) failed`
        });
      }

      // ============================================
      // TEST: DOCUMENT INGESTION (END-TO-END)
      // ============================================
      case 'test-document-ingestion': {
        const {
          ensureTablesExist,
          extractText,
          chunkText,
          storeDocument,
          embedDocumentChunks,
          searchDocuments
        } = await import('../services/document-service.js');
        const { generateEmbedding } = await import('../services/embedding-service.js');

        const testUserId = 'test-doc-' + Date.now();
        const testMode = 'truth-general';
        const results = {
          tests: [],
          passed: 0,
          failed: 0
        };

        try {
          // Ensure tables exist
          await ensureTablesExist(pool);
          console.log('[TEST-DOC] Tables ensured');

          // TEST 1: Text Extraction (PDF simulation with plain text)
          const testText = 'This is a test document.\n\nIt contains multiple paragraphs.\n\nThis is the third paragraph with important information.';
          const testBuffer = Buffer.from(testText, 'utf-8');

          const extractResult = await extractText(testBuffer, 'text/plain', 'test.txt');
          results.tests.push({
            name: 'Text Extraction',
            passed: extractResult.success && extractResult.text === testText,
            details: extractResult
          });
          if (extractResult.success) results.passed++; else results.failed++;

          // TEST 2: Text Chunking
          const chunks = chunkText(testText);
          results.tests.push({
            name: 'Text Chunking',
            passed: chunks.length > 0 && chunks[0].content && chunks[0].tokenCount > 0,
            details: { chunkCount: chunks.length, sample: chunks[0] }
          });
          if (chunks.length > 0) results.passed++; else results.failed++;

          // TEST 3: Document Storage
          const storeResult = await storeDocument(
            testUserId,
            testMode,
            'test-document.txt',
            testBuffer,
            'text/plain',
            { pool }
          );
          results.tests.push({
            name: 'Document Storage',
            passed: storeResult.success && storeResult.documentId > 0,
            details: storeResult
          });
          if (storeResult.success) results.passed++; else results.failed++;

          if (!storeResult.success) {
            throw new Error('Storage failed, cannot continue tests');
          }

          const documentId = storeResult.documentId;

          // TEST 4: Embedding Generation
          const embedResult = await embedDocumentChunks(documentId, { pool, timeout: 10000 });
          results.tests.push({
            name: 'Embedding Generation',
            passed: embedResult.success && embedResult.embedded > 0,
            details: embedResult
          });
          if (embedResult.success && embedResult.embedded > 0) results.passed++; else results.failed++;

          // Wait a moment for embeddings to settle
          await new Promise(r => setTimeout(r, 500));

          // TEST 5: Semantic Search
          const queryText = 'important information';
          const queryEmbedResult = await generateEmbedding(queryText);

          if (queryEmbedResult.success) {
            const searchResult = await searchDocuments(
              testUserId,
              testMode,
              queryEmbedResult.embedding,
              { pool, topK: 5, tokenBudget: 3000 }
            );
            results.tests.push({
              name: 'Semantic Search',
              passed: searchResult.chunks && searchResult.chunks.length > 0,
              details: {
                chunksFound: searchResult.chunks?.length || 0,
                totalTokens: searchResult.totalTokens,
                topResult: searchResult.chunks?.[0]
              }
            });
            if (searchResult.chunks && searchResult.chunks.length > 0) results.passed++; else results.failed++;
          } else {
            results.tests.push({
              name: 'Semantic Search',
              passed: false,
              details: { error: 'Query embedding failed' }
            });
            results.failed++;
          }

          // TEST 6: Mode Isolation
          const searchOtherMode = await searchDocuments(
            testUserId,
            'business-validation', // Different mode
            queryEmbedResult.embedding,
            { pool, topK: 5 }
          );
          results.tests.push({
            name: 'Mode Isolation',
            passed: searchOtherMode.chunks && searchOtherMode.chunks.length === 0,
            details: {
              chunksFound: searchOtherMode.chunks?.length || 0,
              expected: 0,
              message: 'Documents should not leak across modes'
            }
          });
          if (searchOtherMode.chunks && searchOtherMode.chunks.length === 0) results.passed++; else results.failed++;

          // Cleanup
          await pool.query('DELETE FROM documents WHERE user_id = $1', [testUserId]);
          console.log('[TEST-DOC] Cleanup complete');

          return res.json({
            action: 'test-document-ingestion',
            passed: results.failed === 0,
            summary: `${results.passed}/${results.tests.length} tests passed`,
            results: results.tests
          });

        } catch (error) {
          // Cleanup on error
          await pool.query('DELETE FROM documents WHERE user_id LIKE $1', ['test-doc-%']).catch(() => {});

          console.error('[TEST-DOC] Error:', error.message);
          return res.status(500).json({
            action: 'test-document-ingestion',
            passed: false,
            error: error.message,
            results: results.tests
          });
        }
      }

      // ============================================
      // BACKFILL DOCUMENT EMBEDDINGS
      // ============================================
      case 'backfill-doc-embeddings': {
        const { backfillDocumentEmbeddings, ensureTablesExist } = await import('../services/document-service.js');

        try {
          await ensureTablesExist(pool);

          const batchSize = Math.min(parseInt(req.query.batchSize) || 10, 50);
          const maxBatches = Math.min(parseInt(req.query.maxBatches) || 5, 20);

          const stats = await backfillDocumentEmbeddings({
            pool,
            batchSize,
            maxBatches
          });

          return res.json({
            action: 'backfill-doc-embeddings',
            success: true,
            ...stats
          });

        } catch (error) {
          console.error('[BACKFILL-DOC] Error:', error.message);
          return res.status(500).json({
            action: 'backfill-doc-embeddings',
            success: false,
            error: error.message
          });
        }
      }

      // ============================================
      // DOCUMENT STATUS
      // ============================================
      case 'doc-status': {
        const { getDocumentStatus, getUserDocuments, ensureTablesExist } = await import('../services/document-service.js');

        try {
          await ensureTablesExist(pool);

          const { userId: docUserId, documentId } = req.query;

          if (documentId) {
            // Get status for specific document
            const status = await getDocumentStatus(parseInt(documentId), { pool });
            return res.json({
              action: 'doc-status',
              ...status
            });
          } else if (docUserId) {
            // Get all documents for user
            const mode = req.query.mode || 'truth-general';
            const documents = await getUserDocuments(docUserId, mode, { pool });

            // Get aggregate stats
            const { rows: [aggStats] } = await pool.query(`
              SELECT
                COUNT(DISTINCT d.id) as total_documents,
                SUM(d.chunk_count) as total_chunks,
                SUM(d.total_tokens) as total_tokens,
                COUNT(CASE WHEN dc.embedding_status = 'ready' THEN 1 END) as embedded_chunks,
                COUNT(CASE WHEN dc.embedding_status = 'pending' THEN 1 END) as pending_chunks,
                COUNT(CASE WHEN dc.embedding_status = 'failed' THEN 1 END) as failed_chunks
              FROM documents d
              LEFT JOIN document_chunks dc ON d.id = dc.document_id
              WHERE d.user_id = $1 AND d.mode = $2
            `, [docUserId, mode]);

            return res.json({
              action: 'doc-status',
              userId: docUserId,
              mode,
              documents,
              aggregateStats: {
                totalDocuments: parseInt(aggStats.total_documents) || 0,
                totalChunks: parseInt(aggStats.total_chunks) || 0,
                totalTokens: parseInt(aggStats.total_tokens) || 0,
                embeddedChunks: parseInt(aggStats.embedded_chunks) || 0,
                pendingChunks: parseInt(aggStats.pending_chunks) || 0,
                failedChunks: parseInt(aggStats.failed_chunks) || 0
              }
            });
          } else {
            return res.status(400).json({
              error: 'Missing userId or documentId parameter',
              usage: '/api/test-semantic?action=doc-status&userId=xxx OR documentId=123'
            });
          }

        } catch (error) {
          console.error('[DOC-STATUS] Error:', error.message);
          return res.status(500).json({
            action: 'doc-status',
            error: error.message
          });
        }
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          availableActions: ['retrieve', 'stats', 'embed', 'backfill', 'backfill-embeddings', 'health', 'schema', 'test-paraphrase', 'test-supersession', 'test-mode-isolation', 'fix-superseded-by-type', 'create-constraint', 'debug-facts', 'live-proof', 'scale-generate', 'scale-benchmark', 'scale-full', 'scale-cleanup', 'scale-status', 'scale-embed', 'test-doctrine-gates', 'test-document-ingestion', 'backfill-doc-embeddings', 'doc-status'],
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
            '/api/test-semantic?action=debug-facts&userId=xxx&fingerprint=user_phone_number',
            '/api/test-semantic?action=live-proof',
            '/api/test-semantic?action=scale-generate&count=100&userId=test-scale-123',
            '/api/test-semantic?action=scale-benchmark&userId=test-scale-123&queryCount=20',
            '/api/test-semantic?action=scale-full&level=smoke',
            '/api/test-semantic?action=scale-cleanup&userId=test-scale-123',
            '/api/test-semantic?action=scale-status&userId=test-scale-123',
            '/api/test-semantic?action=scale-embed&userId=test-scale-123&batchSize=10',
            '/api/test-semantic?action=test-doctrine-gates',
            '/api/test-semantic?action=test-document-ingestion',
            '/api/test-semantic?action=backfill-doc-embeddings&batchSize=10&maxBatches=5',
            '/api/test-semantic?action=doc-status&userId=xxx',
            '/api/test-semantic?action=doc-status&documentId=123'
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
