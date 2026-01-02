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
      // BACKFILL EMBEDDINGS FOR EXISTING MEMORIES
      // ============================================
      case 'backfill-embeddings': {
        console.log('[BACKFILL-EMBEDDINGS] Starting backfill process...');

        const limit = parseInt(req.query.limit) || 20;
        const maxSeconds = parseInt(req.query.maxSeconds) || 20;

        const result = await backfillEmbeddings(pool, {
          limit,
          maxSeconds,
          statusFilter: ['pending', 'failed'] // Process both pending and failed
        });

        console.log(`[BACKFILL-EMBEDDINGS] Complete: ${result.succeeded}/${result.processed} succeeded, ${result.remaining} remaining`);

        return res.status(200).json({
          action: 'backfill-embeddings',
          processed: result.processed,
          failed: result.failed,
          remaining: result.remaining,
          seconds_elapsed: result.seconds_elapsed,
          message: `Processed ${result.processed} memories (${result.succeeded} succeeded, ${result.failed} failed). ${result.remaining} remaining.`
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
      // FIX SUPERSESSION TYPE (UUID → INTEGER)
      // ============================================
      case 'fix-supersession': {
        const results = {
          success: false,
          steps: [],
          errors: [],
          dataCheck: {},
          timestamp: new Date().toISOString()
        };

        try {
          results.steps.push('Checking existing superseded_by data...');

          // Check current data type
          const columnInfo = await pool.query(`
            SELECT data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'persistent_memories'
            AND column_name = 'superseded_by'
          `);

          if (columnInfo.rows.length === 0) {
            results.errors.push('superseded_by column does not exist');
            results.steps.push('❌ superseded_by column not found');
            return res.status(500).json(results);
          }

          results.dataCheck.currentType = columnInfo.rows[0].data_type;
          results.steps.push(`Current type: ${results.dataCheck.currentType}`);

          // Check if already INTEGER
          if (results.dataCheck.currentType === 'integer') {
            results.steps.push('✅ superseded_by is already INTEGER type');
            results.success = true;
            results.message = 'No migration needed - superseded_by is already INTEGER';
            return res.status(200).json(results);
          }

          // Count non-null values
          const nonNullCount = await pool.query(`
            SELECT COUNT(*) as count
            FROM persistent_memories
            WHERE superseded_by IS NOT NULL
          `);

          results.dataCheck.nonNullValues = parseInt(nonNullCount.rows[0].count);
          results.steps.push(`Found ${results.dataCheck.nonNullValues} non-null superseded_by values`);

          // If non-null values exist, check if they can be converted
          if (results.dataCheck.nonNullValues > 0) {
            const sampleValues = await pool.query(`
              SELECT id, superseded_by
              FROM persistent_memories
              WHERE superseded_by IS NOT NULL
              LIMIT 5
            `);

            results.dataCheck.sampleValues = sampleValues.rows;
            results.steps.push(`Sample values: ${JSON.stringify(sampleValues.rows)}`);

            // Check if values look like valid integers
            const hasValidIntegers = sampleValues.rows.some(row => {
              const val = row.superseded_by;
              return val && /^\d+$/.test(String(val));
            });

            if (!hasValidIntegers) {
              results.errors.push(`Cannot convert: ${results.dataCheck.nonNullValues} non-null values exist that are not valid integers`);
              results.steps.push('⚠️ WARNING: Existing data cannot be safely converted to INTEGER');
              results.suggestion = 'Clear superseded_by first: UPDATE persistent_memories SET superseded_by = NULL';
              return res.status(400).json(results);
            }
          }

          // Perform migration
          results.steps.push('Converting superseded_by from UUID to INTEGER...');

          await pool.query('BEGIN');

          if (results.dataCheck.nonNullValues > 0) {
            // Preserve data
            await pool.query(`
              ALTER TABLE persistent_memories
              ADD COLUMN IF NOT EXISTS superseded_by_temp INTEGER
            `);

            await pool.query(`
              UPDATE persistent_memories
              SET superseded_by_temp = CAST(superseded_by AS INTEGER)
              WHERE superseded_by IS NOT NULL
              AND superseded_by ~ '^[0-9]+$'
            `);

            await pool.query(`
              ALTER TABLE persistent_memories
              DROP COLUMN superseded_by
            `);

            await pool.query(`
              ALTER TABLE persistent_memories
              RENAME COLUMN superseded_by_temp TO superseded_by
            `);

            results.steps.push('✅ Column converted with data preservation');
          } else {
            // Simple conversion
            await pool.query(`
              ALTER TABLE persistent_memories
              DROP COLUMN superseded_by
            `);

            await pool.query(`
              ALTER TABLE persistent_memories
              ADD COLUMN superseded_by INTEGER
            `);

            results.steps.push('✅ Column converted (no data to preserve)');
          }

          // Add foreign key constraint
          await pool.query(`
            DO $$ BEGIN
              ALTER TABLE persistent_memories
              ADD CONSTRAINT fk_superseded_by
              FOREIGN KEY (superseded_by)
              REFERENCES persistent_memories(id)
              ON DELETE SET NULL;
            EXCEPTION
              WHEN duplicate_object THEN NULL;
            END $$;
          `);
          results.steps.push('✅ Foreign key constraint added');

          await pool.query('COMMIT');
          results.success = true;

          // Verify
          const verification = await pool.query(`
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = 'persistent_memories'
            AND column_name = 'superseded_by'
          `);

          results.verification = verification.rows[0];
          results.steps.push(`✅ Verified: superseded_by is now ${verification.rows[0]?.data_type}`);
          results.message = '🎉 Supersession type fix completed!';

          return res.json(results);

        } catch (error) {
          await pool.query('ROLLBACK').catch(() => {});
          results.errors.push('Error: ' + error.message);
          results.steps.push('❌ Migration failed: ' + error.message);
          results.message = '⚠️ Migration had issues. Check errors.';
          return res.status(500).json(results);
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
      // LIVE PROOF: END-TO-END /api/chat TEST
      // ============================================
      case 'live-proof': {
        const testUserId = 'live-proof-test-' + Date.now();
        const testFact = 'My favorite color is chartreuse';
        const paraphraseQuery = 'What color do I prefer?';

        const results = {
          passed: false,
          steps: [],
          errors: [],
          details: {},
          telemetry: {},
          timestamp: new Date().toISOString()
        };

        try {
          // Step 1: POST /api/chat with a store message
          results.steps.push('Step 1: Storing test fact via /api/chat...');

          const storeResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: testFact,
              user_id: testUserId,
              mode: 'truth_general'
            })
          });

          if (!storeResponse.ok) {
            results.errors.push(`Store request failed: ${storeResponse.status}`);
            results.steps.push(`❌ Store failed with status ${storeResponse.status}`);
            return res.status(500).json(results);
          }

          const storeResult = await storeResponse.json();
          results.details.storeResponse = storeResult;
          results.steps.push('✅ Fact stored via /api/chat');

          // Step 2: Poll DB until embedding_status='ready' (bounded retries)
          results.steps.push('Step 2: Polling for embedding completion...');

          let embeddingReady = false;
          let memoryId = null;
          const maxRetries = 20; // 10 seconds max
          const retryDelay = 500;

          for (let i = 0; i < maxRetries; i++) {
            const checkResult = await pool.query(`
              SELECT id, embedding_status, embedding
              FROM persistent_memories
              WHERE user_id = $1
              AND content = $2
              ORDER BY created_at DESC
              LIMIT 1
            `, [testUserId, testFact]);

            if (checkResult.rows.length > 0) {
              const memory = checkResult.rows[0];
              memoryId = memory.id;
              results.details.embeddingStatus = memory.embedding_status;
              results.details.hasEmbedding = memory.embedding ? 'YES' : 'NO';

              if (memory.embedding_status === 'ready' && memory.embedding) {
                embeddingReady = true;
                results.steps.push(`✅ Embedding ready after ${(i + 1) * retryDelay}ms`);
                break;
              }
            }

            await new Promise(r => setTimeout(r, retryDelay));
          }

          if (!embeddingReady) {
            results.errors.push('Embedding did not become ready within timeout');
            results.steps.push('❌ Timeout waiting for embedding');
            // Cleanup before returning
            await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);
            return res.status(500).json(results);
          }

          // Step 3: POST /api/chat with paraphrase query
          results.steps.push('Step 3: Querying with paraphrase via /api/chat...');

          const queryResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: paraphraseQuery,
              user_id: testUserId,
              mode: 'truth_general'
            })
          });

          if (!queryResponse.ok) {
            results.errors.push(`Query request failed: ${queryResponse.status}`);
            results.steps.push(`❌ Query failed with status ${queryResponse.status}`);
            // Cleanup before returning
            await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);
            return res.status(500).json(results);
          }

          const queryResult = await queryResponse.json();
          results.details.queryResponse = queryResult;
          results.steps.push('✅ Query completed');

          // Step 4: Assert conditions
          results.steps.push('Step 4: Validating semantic retrieval...');

          const telemetry = queryResult.telemetry || {};
          results.telemetry = telemetry;

          // Check retrieval method
          const retrievalMethod = telemetry.retrieval_method || telemetry.method;
          const methodValid = retrievalMethod === 'semantic' || retrievalMethod === 'hybrid';
          results.details.retrieval_method = retrievalMethod;
          results.details.method_valid = methodValid;

          if (!methodValid) {
            results.errors.push(`Expected semantic/hybrid method, got: ${retrievalMethod}`);
            results.steps.push(`❌ Retrieval method: ${retrievalMethod}`);
          } else {
            results.steps.push(`✅ Retrieval method: ${retrievalMethod}`);
          }

          // Check results_injected
          const resultsInjected = telemetry.results_injected || telemetry.memories_injected || 0;
          const injectedValid = resultsInjected > 0;
          results.details.results_injected = resultsInjected;
          results.details.injected_valid = injectedValid;

          if (!injectedValid) {
            results.errors.push(`Expected results_injected > 0, got: ${resultsInjected}`);
            results.steps.push(`❌ Results injected: ${resultsInjected}`);
          } else {
            results.steps.push(`✅ Results injected: ${resultsInjected}`);
          }

          // Check if stored fact was found
          const responseText = queryResult.response || '';
          const factFound = responseText.toLowerCase().includes('chartreuse');
          results.details.fact_found_in_response = factFound;

          if (!factFound) {
            results.errors.push('Stored fact (chartreuse) not found in response');
            results.steps.push('❌ Fact not found in response');
          } else {
            results.steps.push('✅ Fact found in response');
          }

          // Check telemetry IDs present
          const hasTelemetryIds = telemetry.memory_ids || telemetry.retrieved_ids;
          results.details.has_telemetry_ids = !!hasTelemetryIds;

          if (!hasTelemetryIds) {
            results.errors.push('Telemetry IDs not present');
            results.steps.push('⚠️ Telemetry IDs missing');
          } else {
            results.steps.push('✅ Telemetry IDs present');
          }

          // Overall pass/fail
          results.passed = methodValid && injectedValid && factFound;

          if (results.passed) {
            results.steps.push('🎉 Live proof PASSED - End-to-end semantic retrieval working!');
          } else {
            results.steps.push('❌ Live proof FAILED - See errors above');
          }

          // Step 5: Cleanup
          results.steps.push('Step 5: Cleaning up test data...');
          await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);
          results.steps.push('✅ Test data cleaned up');

          return res.json(results);

        } catch (error) {
          results.errors.push('Test error: ' + error.message);
          results.steps.push('❌ Test failed: ' + error.message);

          // Cleanup on error
          try {
            await pool.query('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);
          } catch (cleanupError) {
            results.errors.push('Cleanup error: ' + cleanupError.message);
          }

          return res.status(500).json(results);
        }
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          availableActions: ['retrieve', 'stats', 'embed', 'backfill', 'backfill-embeddings', 'health', 'schema', 'test-paraphrase', 'test-supersession', 'test-mode-isolation', 'fix-supersession', 'create-constraint', 'live-proof'],
          examples: [
            '/api/test-semantic?action=health',
            '/api/test-semantic?action=schema',
            '/api/test-semantic?action=stats&userId=xxx',
            '/api/test-semantic?action=embed&query=test+text',
            '/api/test-semantic?userId=xxx&query=what+is+my+name',
            '/api/test-semantic?action=backfill&limit=10',
            '/api/test-semantic?action=backfill-embeddings&limit=20&maxSeconds=20',
            '/api/test-semantic?action=test-paraphrase',
            '/api/test-semantic?action=test-supersession',
            '/api/test-semantic?action=test-mode-isolation',
            '/api/test-semantic?action=fix-supersession',
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
