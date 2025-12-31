import { Router } from 'express';

const router = Router();

// Security: Require secret token
const REQUIRED_TOKEN = process.env.INTERNAL_TEST_TOKEN || 'memory-test-secret-2024';

router.get('/memory-full-check', async (req, res) => {
  // Security check
  const providedToken = req.headers['x-internal-test-token'];
  if (providedToken !== REQUIRED_TOKEN) {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'X-Internal-Test-Token header required' 
    });
  }

  // Additional check: DEBUG_MODE must be enabled
  if (process.env.DEBUG_MODE !== 'true' && process.env.DEPLOYMENT_TYPE !== 'private') {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Debug mode not enabled' 
    });
  }

  const runId = Date.now();
  const testUserId = `test-full-${runId}`;
  const results = [];
  const BASE_URL = `http://localhost:${process.env.PORT || 8080}`;

  // Helper: Call real /api/chat endpoint via HTTP
  async function chatViaHTTP(message) {
    try {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          user_id: testUserId,
          mode: 'truth_general',
          conversationHistory: []
        })
      });
      return await response.json();
    } catch (err) {
      return { error: err.message, success: false };
    }
  }

  // Helper: Direct DB query
  async function queryDB(sql, params) {
    if (!global.memorySystem?.coreSystem?.pool) {
      throw new Error('Database pool not available');
    }
    return global.memorySystem.coreSystem.pool.query(sql, params);
  }

  // Helper: Check for ignorance phrases
  function hasIgnorancePhrases(text) {
    if (!text) return false;
    const phrases = [
      "don't have", "no memory", "haven't told", "first interaction",
      "don't recall", "not aware", "no information", "haven't shared",
      "don't see any", "no record"
    ];
    return phrases.some(p => text.toLowerCase().includes(p));
  }

  // Helper: Wait for storage to complete
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // Helper: Store via HTTP and confirm in DB (Issue #210 Fix 2)
  async function storeViaHTTPAndConfirm(message, tripwire, maxRetries = 5) {
    // Step 1: Store via real HTTP endpoint (exercises full pipeline)
    const storeResponse = await chatViaHTTP(message);

    if (!storeResponse.success) {
      return {
        success: false,
        error: 'HTTP store failed',
        httpError: storeResponse.error
      };
    }

    // Step 2: Poll DB until tripwire confirmed
    for (let i = 0; i < maxRetries; i++) {
      try {
        const memories = await queryDB(
          `SELECT id, content FROM persistent_memories
           WHERE user_id = $1 AND content ILIKE $2
           ORDER BY created_at DESC LIMIT 1`,
          [testUserId, `%${tripwire}%`]
        );

        if (memories.rows.length > 0) {
          console.log(`[STORE-CONFIRM] ✅ Confirmed ${tripwire} stored as ID ${memories.rows[0].id}`);
          return {
            success: true,
            id: memories.rows[0].id,
            content: memories.rows[0].content
          };
        }
      } catch (dbErr) {
        console.error(`[STORE-CONFIRM] DB query error on attempt ${i + 1}:`, dbErr.message);
      }

      await wait(300);  // Short poll interval
    }

    console.error(`[STORE-CONFIRM] ❌ Failed to confirm ${tripwire} after ${maxRetries} attempts`);
    return {
      success: false,
      error: 'Storage not confirmed in DB after polling'
    };
  }

  console.log(`[TEST] Starting memory-full-check run ${runId}`);

  try {
    // ===== TEST 1: Basic Store + Recall =====
    const tripwire1 = `ALPHA-${runId}`;
    const store1 = await storeViaHTTPAndConfirm(
      `Remember this: My test identifier is ${tripwire1}`,
      tripwire1
    );

    if (!store1.success) {
      results.push({
        test: '1. Basic Store + Recall',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store1.error
      });
    } else {
      const recall1 = await chatViaHTTP('What is my test identifier?');

      const hasExactToken1 = recall1.response?.includes(tripwire1) || false;
      const hasHallucination1 = recall1.response?.match(/evolved|changed|updated|previous|earlier/i);

      results.push({
        test: '1. Basic Store + Recall',
        passed: hasExactToken1 && !hasHallucination1,
        expected: tripwire1,
        found_in_response: hasExactToken1,
        hallucination_detected: !!hasHallucination1,
        warning: hasHallucination1 ? 'AI invented provenance not in stored memory' : null,
        response_preview: recall1.response?.substring(0, 250) || 'no response',
        metadata: recall1.metadata || {},
        storage_confirmed_id: store1.id
      });
    }

    // ===== TEST 2: Memory-Used-Not-Ignored (Enforcer Test) =====
    const tripwire2 = `BRAVO-${runId}`;
    const store2 = await storeViaHTTPAndConfirm(
      `My test token is ${tripwire2}`,
      tripwire2
    );

    if (!store2.success) {
      results.push({
        test: '2. Memory-Used-Not-Ignored (Enforcer)',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store2.error
      });
    } else {
      const recall2 = await chatViaHTTP('What is my test token?');

      const hasIgnorance2 = hasIgnorancePhrases(recall2.response);
      const foundTripwire2 = recall2.response?.includes(tripwire2) || false;
      const hasHallucination2 = recall2.response?.match(/evolved|changed|updated|previous|earlier/i);

      results.push({
        test: '2. Memory-Used-Not-Ignored (Enforcer)',
        passed: foundTripwire2 && !hasIgnorance2 && !hasHallucination2,
        found_tripwire: foundTripwire2,
        found_ignorance_phrases: hasIgnorance2,
        hallucination_detected: !!hasHallucination2,
        warning: hasHallucination2 ? 'AI invented provenance not in stored memory' : null,
        enforcer_status: hasIgnorance2 ? 'FAIL - AI claimed ignorance' : 'PASS',
        response_preview: recall2.response?.substring(0, 250) || 'no response',
        storage_confirmed_id: store2.id
      });
    }

    // ===== TEST 3: Dedup Anti-Merge Test =====
    const tripwire3a = `CHARLIE-${runId}`;
    const tripwire3b = `DELTA-${runId}`;

    const store3a = await storeViaHTTPAndConfirm(
      `My first test token is ${tripwire3a}`,
      tripwire3a
    );

    const store3b = await storeViaHTTPAndConfirm(
      `My second test token is ${tripwire3b}`,
      tripwire3b
    );

    // Only proceed if both confirmed
    if (!store3a.success || !store3b.success) {
      results.push({
        test: '3. Dedup Anti-Merge',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        charlie_stored: store3a.success,
        charlie_error: store3a.error,
        charlie_id: store3a.id,
        delta_stored: store3b.success,
        delta_error: store3b.error,
        delta_id: store3b.id
      });
    } else {
      // Query DB directly to verify separate storage
      const dbCheck3 = await queryDB(
        `SELECT id, content, category_name FROM persistent_memories
         WHERE user_id = $1 AND (content ILIKE $2 OR content ILIKE $3)`,
        [testUserId, `%${tripwire3a}%`, `%${tripwire3b}%`]
      );

      const distinctCount = dbCheck3.rows.length;
      const hasCharlie = dbCheck3.rows.some(r => r.content.includes(tripwire3a));
      const hasDelta = dbCheck3.rows.some(r => r.content.includes(tripwire3b));

      results.push({
        test: '3. Dedup Anti-Merge',
        passed: distinctCount >= 2 && hasCharlie && hasDelta,
        expected: '2 distinct memories with different test tokens',
        found_memories: distinctCount,
        has_charlie: hasCharlie,
        has_delta: hasDelta,
        memory_ids: dbCheck3.rows.map(r => r.id),
        storage_confirmed_ids: [store3a.id, store3b.id],
        note: distinctCount < 2 ? 'FAIL: Memories incorrectly merged into one' : 'PASS: Separate memories preserved'
      });
    }

    // ===== TEST 4: High-Entropy Retrieval =====
    const tripwire4 = `ECHO-${runId}-9K7X`;
    const store4 = await storeViaHTTPAndConfirm(
      `My license plate number is ${tripwire4}`,
      tripwire4
    );

    if (!store4.success) {
      results.push({
        test: '4. High-Entropy Retrieval',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store4.error
      });
    } else {
      const recall4 = await chatViaHTTP('What is my license plate number?');

      results.push({
        test: '4. High-Entropy Retrieval',
        passed: recall4.response?.includes(tripwire4) || false,
        expected: tripwire4,
        found: recall4.response?.includes(tripwire4) || false,
        storage_confirmed_id: store4.id,
        note: 'Tests that unique alphanumeric tokens survive compression and retrieval'
      });
    }

    // ===== TEST 5: Storage Hygiene (No Boilerplate) =====
    // Check if any boilerplate has been stored for this test user
    const boilerplateCheck = await queryDB(
      `SELECT id, content FROM persistent_memories 
       WHERE user_id = $1 AND (
         content ILIKE '%I don''t retain information%' OR
         content ILIKE '%each conversation starts fresh%' OR
         content ILIKE '%first interaction%' OR
         content ILIKE '%I''m an AI%' OR
         content ILIKE '%session-based%' OR
         content ILIKE '%don''t have memory%'
       )`,
      [testUserId]
    );

    results.push({
      test: '5. Storage Hygiene (No Boilerplate)',
      passed: boilerplateCheck.rows.length === 0,
      contaminated_count: boilerplateCheck.rows.length,
      contaminated_ids: boilerplateCheck.rows.map(r => r.id),
      note: boilerplateCheck.rows.length > 0 
        ? 'FAIL: AI boilerplate was stored in memory' 
        : 'PASS: No boilerplate contamination'
    });

    // ===== TEST 6: Category Routing =====
    const tripwire6 = `FOXTROT-${runId}`;
    const store6 = await storeViaHTTPAndConfirm(
      `My doctor's name is Dr. ${tripwire6}`,
      tripwire6
    );

    if (!store6.success) {
      results.push({
        test: '6. Category Routing',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store6.error
      });
    } else {
      const categoryCheck = await queryDB(
        `SELECT category_name, content FROM persistent_memories
         WHERE user_id = $1 AND content ILIKE $2`,
        [testUserId, `%${tripwire6}%`]
      );

      const routedCategory = categoryCheck.rows[0]?.category_name;
      const expectedCategories = ['health_wellness', 'health', 'medical'];

      // Additional diagnostic: check ALL memories for this user to see what was actually stored
      const allUserMemories = await queryDB(
        `SELECT id, category_name, LEFT(content, 100) as content_preview
         FROM persistent_memories
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [testUserId]
      );

      results.push({
        test: '6. Category Routing',
        passed: expectedCategories.some(c => routedCategory?.toLowerCase().includes(c)) || routedCategory === 'health_wellness',
        expected_category: 'health_wellness (or similar)',
        actual_category: routedCategory || 'not found',
        storage_confirmed_id: store6.id,
        note: 'Doctor information should route to health category',
        diagnostic: {
          found_memory: categoryCheck.rows.length > 0,
          total_user_memories: allUserMemories.rows.length,
          recent_memories: allUserMemories.rows.map(r => ({
            id: r.id,
            category: r.category_name,
            preview: r.content_preview
          }))
        }
      });
    }

    // ===== TEST 7: Token Budget =====
    // Check metadata from previous responses for token counts
    // The orchestrator returns memoryTokens (not memory_tokens or injected_tokens)
    const injectedTokens = recall1.metadata?.memoryTokens ||
                          recall1.metadata?.memory_tokens ||
                          recall1.metadata?.token_usage?.memory ||
                          recall1.metadata?.token_usage?.injected ||
                          'unknown';

    results.push({
      test: '7. Token Budget (≤2400)',
      passed: typeof injectedTokens === 'number' ? injectedTokens <= 2400 : false,
      injected_tokens: injectedTokens,
      budget_limit: 2400,
      note: typeof injectedTokens !== 'number'
        ? 'WARNING: Token count not in response metadata - check Railway logs'
        : (injectedTokens <= 2400 ? 'PASS: Within budget' : 'FAIL: Exceeded budget'),
      metadata_available: typeof injectedTokens === 'number',
      available_metadata_keys: Object.keys(recall1.metadata || {})
    });

    // ===== TEST 8: Cross-Request Persistence =====
    // This is already proven by tests 1-4 working across multiple HTTP requests
    // Each chatViaHTTP() is a separate HTTP request
    results.push({
      test: '8. Cross-Request Persistence',
      passed: results[0].passed && results[1].passed,
      note: 'Verified by Tests 1-2: memories stored in one request were retrieved in subsequent requests',
      evidence: 'Each test uses separate HTTP calls, proving persistence between requests'
    });

    // ===== TEST 9: Compression Verification =====
    const tripwire9 = `HOTEL-${runId}`;
    const verboseInput = `This is an extremely verbose and unnecessarily long message with lots of redundant words and filler content that should definitely be compressed by the intelligent memory system while still preserving the essential and critical fact that my unique project identifier is ${tripwire9} which represents the key information that must survive the compression process intact`;

    const store9 = await storeViaHTTPAndConfirm(verboseInput, tripwire9);

    if (!store9.success) {
      results.push({
        test: '9. Compression Verification',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store9.error
      });
    } else {
      const compressionCheck = await queryDB(
        `SELECT content, LENGTH(content) as stored_len FROM persistent_memories
         WHERE user_id = $1 AND content ILIKE $2`,
        [testUserId, `%${tripwire9}%`]
      );

      const storedLen = compressionCheck.rows[0]?.stored_len || 0;
      const inputLen = verboseInput.length;
      const ratio = storedLen > 0 ? (inputLen / storedLen) : 0;
      const tripwirePreserved = compressionCheck.rows[0]?.content?.includes(tripwire9) || false;
      const compressionOccurred = storedLen > 0 && storedLen < inputLen;

      const TARGET_RATIO_MIN = 10;
      const ratioStatus = ratio >= TARGET_RATIO_MIN ? 'OK' : 'WARNING: Below target ratio';

      results.push({
        test: '9. Compression Verification',
        passed: tripwirePreserved && compressionOccurred,
        input_length: inputLen,
        stored_length: storedLen,
        compression_ratio: `${ratio.toFixed(1)}:1`,
        ratio_status: ratioStatus,
        tripwire_preserved: tripwirePreserved,
        storage_confirmed_id: store9.id,
        note: tripwirePreserved
          ? `PASS: Key info survived compression (${ratio.toFixed(1)}:1${ratio < TARGET_RATIO_MIN ? ' - below 10:1 target' : ''})`
          : 'FAIL: Tripwire lost in compression'
      });
    }

    // ===== TEST 10: Memory Injection Telemetry =====
    const hasTelemetry = recall1.metadata?.memory_ids || recall1.metadata?.memories_injected;

    results.push({
      test: '10. Memory Injection Telemetry',
      passed: !!hasTelemetry,
      has_memory_ids: !!recall1.metadata?.memory_ids,
      has_token_counts: !!recall1.metadata?.memory_tokens,
      available_metadata_keys: Object.keys(recall1.metadata || {}),
      note: hasTelemetry
        ? 'PASS: Response includes memory injection details'
        : 'NEEDS IMPROVEMENT: Add memory_ids, previews, token counts to response metadata'
    });

    // ===== TEST 11: Paraphrase Recall (Keyword-Template Tolerant) =====
    // Tests if retrieval can handle paraphrased queries
    // This tests keyword-template tolerance, NOT semantic embeddings
    const tripwire11 = `TANGO-${runId}`;

    // Step 1: Store a fact with specific keywords
    const store11 = await storeViaHTTPAndConfirm(
      `My test identifier is ${tripwire11}`,
      tripwire11
    );

    if (!store11.success) {
      results.push({
        test: '11. Paraphrase Recall (Keyword-Template Tolerant)',
        passed: false,
        note: 'FAIL: Storage not confirmed via HTTP pipeline',
        error: store11.error
      });
    } else {
      // Step 2: Query with paraphrase
      const recall11 = await chatViaHTTP('What identifier did I ask you to remember for myself?');

      // Step 3: Evaluate
      const foundTango = recall11.response?.includes(tripwire11) || false;
      const memoriesInjected = recall11.metadata?.memory_retrieval?.memories_injected || 0;
      const targetedRetrieval = memoriesInjected <= 5;  // Not bulk injection

      const retrievalQuality = memoriesInjected <= 3
        ? 'EXCELLENT'
        : memoriesInjected <= 5
          ? 'GOOD'
          : memoriesInjected <= 10
            ? 'ACCEPTABLE'
            : 'POOR (bulk injection)';

      results.push({
        test: '11. Paraphrase Recall (Keyword-Template Tolerant)',
        passed: foundTango && targetedRetrieval,
        expected: tripwire11,
        found: foundTango,
        retrieval_method: recall11.metadata?.memory_retrieval?.method || 'unknown',
        memories_considered: recall11.metadata?.memory_retrieval?.memories_considered || 'unknown',
        memories_injected: memoriesInjected,
        retrieval_quality: retrievalQuality,
        storage_confirmed_id: store11.id,
        note: foundTango && targetedRetrieval
          ? 'PASS: Targeted retrieval found correct memory'
          : foundTango && !targetedRetrieval
            ? `PARTIAL: Found via bulk injection (${memoriesInjected} memories injected - not targeted)`
            : 'FAIL: Could not retrieve paraphrased memory',
        query_used: 'What identifier did I ask you to remember for myself?',
        original_storage: `My test identifier is ${tripwire11}`,
        keyword_overlap: 'identifier (partial match)'
      });
    }

  } catch (err) {
    results.push({
      test: 'ERROR',
      passed: false,
      error: err.message,
      stack: err.stack
    });
  }

  // ===== CLEANUP =====
  try {
    await queryDB('DELETE FROM persistent_memories WHERE user_id = $1', [testUserId]);
    console.log(`[TEST] Cleaned up test user ${testUserId}`);
  } catch (cleanupErr) {
    console.error(`[TEST] Cleanup failed: ${cleanupErr.message}`);
  }

  // ===== SUMMARY =====
  const passed = results.filter(r => r.passed === true).length;
  const failed = results.filter(r => r.passed === false).length;

  // Return HTML report
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Memory System Full Verification</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; max-width: 1000px; margin: 0 auto; }
    h1 { color: #00d4ff; }
    .pass { color: #4ade80; }
    .fail { color: #f87171; }
    .test { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #444; }
    .test.passed { border-left-color: #4ade80; }
    .test.failed { border-left-color: #f87171; }
    pre { background: #0f0f23; padding: 10px; overflow-x: auto; border-radius: 4px; font-size: 11px; }
    .summary { font-size: 1.3em; padding: 20px; background: #16213e; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>🧠 Memory System Full Verification</h1>
  <div class="summary">
    <strong>Run ID:</strong> ${runId}<br>
    <strong>Test User:</strong> ${testUserId} (cleaned up)<br><br>
    <span class="pass">✅ Passed: ${passed}</span> | 
    <span class="fail">❌ Failed: ${failed}</span> | 
    <strong>Total: ${results.length}</strong>
  </div>
  ${results.map(r => `
    <div class="test ${r.passed ? 'passed' : 'failed'}">
      <h3>${r.passed ? '✅' : '❌'} ${r.test}</h3>
      <pre>${JSON.stringify(r, null, 2)}</pre>
    </div>
  `).join('')}
  <p style="color: #888; margin-top: 30px;">
    Test completed at ${new Date().toISOString()}<br>
    All test data has been cleaned up from the database.
  </p>
</body>
</html>`;

  res.send(html);
});

export default router;
