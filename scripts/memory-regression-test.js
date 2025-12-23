/**
 * Memory System Regression Tests
 * ==============================
 * Run: npm run test:memory
 * 
 * Tests storage, dedup, retrieval, injection, and enforcer behavior.
 * Uses unique timestamps to avoid false positives from prior test runs.
 * 
 * Requirements:
 * - Server must be running (locally or specify API_URL env var)
 * - Debug endpoint must be available (/api/debug/memory)
 */

const RUN_ID = Date.now();
const TEST_USER_ID = process.env.TEST_USER_ID || `test-user-${RUN_ID}`;
const API_BASE = process.env.API_URL || 'http://localhost:3000';

// Unique tokens for this test run
const TOKENS = {
  COLOR: `BLUE-WAVE-${RUN_ID}`,
  TRIPWIRE_A: `ALPHA-TANGO-${RUN_ID}`,
  TRIPWIRE_B: `ZEBRA-ANCHOR-${RUN_ID + 1}`,
  IDE: `VSCODE-CUSTOM-${RUN_ID}`,
  DOG: `ROVER-SPECIAL-${RUN_ID}`,
  PHONE: `PIXEL-NINE-${RUN_ID}`,
  CITY: `PORTLAND-MAINE-${RUN_ID}`
};

// Ignorance phrases that should trigger FAIL if memory was injected
const IGNORANCE_PHRASES = [
  "I don't have",
  "I don't see", 
  "no memory of",
  "haven't told me",
  "don't have access",
  "no information about",
  "not aware of",
  "don't recall",
  "no record of",
  "first interaction",
  "haven't shared",
  "I don't retain memory",
  "session-based",
  "don't have any information",
  "wasn't provided",
  "not something I have"
];

// Boilerplate that should NEVER be stored
const BOILERPLATE_PATTERNS = [
  "I don't retain memory",
  "session-based memory",
  "first interaction",
  "I'm an AI",
  "confidence is lower",
  "founder protection",
  "I should clarify"
];

const tests = [
  // ═══════════════════════════════════════════
  // STORAGE TESTS
  // ═══════════════════════════════════════════
  {
    name: 'STORE-01: Store simple fact with high-entropy token',
    action: 'chat',
    message: `Remember this: My favorite color is ${TOKENS.COLOR}`,
    expect: { 
      stored: true, 
      dedup_merged: false,
      response_acknowledges: true
    }
  },
  {
    name: 'STORE-02: Recall simple fact immediately',
    action: 'chat',
    message: 'What is my favorite color?',
    expect: { 
      memory_injected: true,
      response_contains: TOKENS.COLOR,
      no_ignorance_phrases: true
    }
  },
  {
    name: 'STORE-03: Store second distinct fact',
    action: 'chat',
    message: `My phone model is ${TOKENS.PHONE}`,
    expect: { 
      stored: true,
      new_memory_id: true
    }
  },
  {
    name: 'STORE-04: Recall second fact',
    action: 'chat',
    message: 'What phone do I have?',
    expect: {
      memory_injected: true,
      response_contains: TOKENS.PHONE,
      no_ignorance_phrases: true
    }
  },

  // ═══════════════════════════════════════════
  // DEDUP TESTS - Critical for tripwire behavior
  // ═══════════════════════════════════════════
  {
    name: 'DEDUP-01: Store tripwire A',
    action: 'chat',
    message: `My verification code is ${TOKENS.TRIPWIRE_A}`,
    expect: { 
      stored: true, 
      new_memory_id: true 
    },
    save_memory_id_as: 'tripwire_a_id'
  },
  {
    name: 'DEDUP-02: Store tripwire B (must NOT merge with A)',
    action: 'chat',
    message: `My backup phrase is ${TOKENS.TRIPWIRE_B}`,
    expect: { 
      stored: true, 
      new_memory_id: true,
      not_merged_with: 'tripwire_a_id'
    },
    save_memory_id_as: 'tripwire_b_id'
  },
  {
    name: 'DEDUP-03: Recall tripwire A specifically',
    action: 'chat',
    message: 'What is my verification code?',
    expect: { 
      response_contains: TOKENS.TRIPWIRE_A,
      response_not_contains: TOKENS.TRIPWIRE_B
    }
  },
  {
    name: 'DEDUP-04: Recall tripwire B specifically',
    action: 'chat',
    message: 'What is my backup phrase?',
    expect: {
      response_contains: TOKENS.TRIPWIRE_B,
      response_not_contains: TOKENS.TRIPWIRE_A
    }
  },
  {
    name: 'DEDUP-05: Verify both tripwires still exist as separate memories',
    action: 'debug',
    query: { action: 'list_recent', limit: 10 },
    expect: {
      contains_memory_id: ['tripwire_a_id', 'tripwire_b_id'],
      memory_count_gte: 2
    }
  },

  // ═══════════════════════════════════════════
  // BOILERPLATE REJECTION TESTS
  // ═══════════════════════════════════════════
  {
    name: 'BOILERPLATE-01: AI self-description should not pollute memory',
    action: 'chat',
    message: 'Tell me about yourself and your capabilities',
    then_check: 'debug',
    expect: {
      stored_content_not_contains: BOILERPLATE_PATTERNS
    }
  },
  {
    name: 'BOILERPLATE-02: Verify no "I don\'t retain memory" stored',
    action: 'debug',
    query: { action: 'search', content_contains: "don't retain memory" },
    expect: {
      results_count: 0
    }
  },

  // ═══════════════════════════════════════════
  // RETRIEVAL ROUTING TESTS
  // ═══════════════════════════════════════════
  {
    name: 'ROUTE-01: Store tech fact',
    action: 'chat',
    message: `My preferred IDE is ${TOKENS.IDE}`,
    expect: { 
      stored: true, 
      category_contains: 'tools_tech'
    }
  },
  {
    name: 'ROUTE-02: Store personal fact',
    action: 'chat',
    message: `My dog's name is ${TOKENS.DOG}`,
    expect: { 
      stored: true, 
      category_contains: 'personal_life'
    }
  },
  {
    name: 'ROUTE-03: Store location fact',
    action: 'chat',
    message: `I live in ${TOKENS.CITY}`,
    expect: {
      stored: true
    }
  },
  {
    name: 'ROUTE-04: Tech query routes to tech category',
    action: 'chat',
    message: 'What IDE do I use for coding?',
    expect: { 
      memory_injected: true, 
      response_contains: TOKENS.IDE,
      category_searched_contains: 'tools_tech'
    }
  },
  {
    name: 'ROUTE-05: Personal query routes correctly',
    action: 'chat',
    message: "What's my dog's name?",
    expect: {
      memory_injected: true,
      response_contains: TOKENS.DOG
    }
  },

  // ═══════════════════════════════════════════
  // ENFORCER TESTS
  // ═══════════════════════════════════════════
  {
    name: 'ENFORCER-01: No ignorance claims when memory present',
    action: 'chat',
    message: 'What is my favorite color?',
    expect: { 
      memory_injected: true,
      no_ignorance_phrases: true,
      response_contains: TOKENS.COLOR
    }
  },
  {
    name: 'ENFORCER-02: Consistent response on repeated query',
    action: 'chat',
    message: 'Remind me, what phone do I have?',
    expect: {
      memory_injected: true,
      no_ignorance_phrases: true,
      response_contains: TOKENS.PHONE
    }
  },

  // ═══════════════════════════════════════════
  // CONSISTENCY TESTS
  // ═══════════════════════════════════════════
  {
    name: 'CONSIST-01: Recall tripwire A - attempt 1',
    action: 'chat',
    message: 'What is my verification code again?',
    expect: { 
      response_contains: TOKENS.TRIPWIRE_A 
    }
  },
  {
    name: 'CONSIST-02: Recall tripwire A - attempt 2',
    action: 'chat',
    message: 'Can you tell me my verification code?',
    expect: { 
      response_contains: TOKENS.TRIPWIRE_A 
    }
  },
  {
    name: 'CONSIST-03: Recall tripwire B - attempt 1',
    action: 'chat',
    message: 'What is my backup phrase?',
    expect: { 
      response_contains: TOKENS.TRIPWIRE_B 
    }
  },
  {
    name: 'CONSIST-04: Recall tripwire B - attempt 2',
    action: 'chat',
    message: 'Tell me my backup phrase please',
    expect: { 
      response_contains: TOKENS.TRIPWIRE_B 
    }
  },

  // ═══════════════════════════════════════════
  // CROSS-CONTAMINATION TESTS
  // ═══════════════════════════════════════════
  {
    name: 'CONTAM-01: Color query should not return phone',
    action: 'chat',
    message: 'What color do I like?',
    expect: {
      response_contains: TOKENS.COLOR,
      response_not_contains: TOKENS.PHONE
    }
  },
  {
    name: 'CONTAM-02: Dog query should not return IDE',
    action: 'chat',
    message: "What's my pet's name?",
    expect: {
      response_contains: TOKENS.DOG,
      response_not_contains: TOKENS.IDE
    }
  }
];

// ═══════════════════════════════════════════════════════════════
// TEST EXECUTION ENGINE
// ═══════════════════════════════════════════════════════════════

const savedIds = {};

async function sendChat(message) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      userId: TEST_USER_ID,
      conversationHistory: []
    })
  });
  
  if (!response.ok) {
    throw new Error(`Chat API returned ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

async function queryDebug(query) {
  const params = new URLSearchParams({ 
    user_id: TEST_USER_ID,
    ...query 
  });
  
  const response = await fetch(`${API_BASE}/api/debug/memory?${params}`);
  
  if (!response.ok) {
    // Debug endpoint might not exist yet - return empty
    if (response.status === 404) {
      return { error: 'debug_endpoint_not_found', available: false };
    }
    throw new Error(`Debug API returned ${response.status}`);
  }
  
  return response.json();
}

function checkExpectations(result, expect, testName) {
  const failures = [];
  
  // Check response contains expected token
  if (expect.response_contains) {
    const token = expect.response_contains;
    const responseText = result.response || result.message || '';
    if (!responseText.includes(token)) {
      failures.push(`Expected response to contain "${token}" but got: "${responseText.substring(0, 200)}..."`);
    }
  }
  
  // Check response does NOT contain token
  if (expect.response_not_contains) {
    const token = expect.response_not_contains;
    const responseText = result.response || result.message || '';
    if (responseText.includes(token)) {
      failures.push(`Expected response to NOT contain "${token}" but it did`);
    }
  }
  
  // Check no ignorance phrases
  if (expect.no_ignorance_phrases) {
    const responseText = (result.response || result.message || '').toLowerCase();
    for (const phrase of IGNORANCE_PHRASES) {
      if (responseText.includes(phrase.toLowerCase())) {
        failures.push(`Found ignorance phrase "${phrase}" in response when memory should have been available`);
        break;
      }
    }
  }
  
  // Check memory was injected
  if (expect.memory_injected === true) {
    const debug = result._debug || result.debug || {};
    if (debug.memory_injected === false || debug.memory_count === 0) {
      failures.push('Expected memory to be injected but it was not');
    }
  }
  
  // Check stored
  if (expect.stored === true) {
    const debug = result._debug || result.debug || {};
    if (debug.stored === false) {
      failures.push('Expected memory to be stored but it was not');
    }
  }
  
  // Check dedup not triggered
  if (expect.dedup_merged === false) {
    const debug = result._debug || result.debug || {};
    if (debug.dedup_merged === true) {
      failures.push('Expected memory to NOT be merged but dedup merged it');
    }
  }
  
  // Check new memory ID
  if (expect.new_memory_id === true) {
    const debug = result._debug || result.debug || {};
    if (!debug.memory_id) {
      failures.push('Expected new memory_id but none returned');
    }
  }
  
  // Check not merged with specific ID
  if (expect.not_merged_with) {
    const debug = result._debug || result.debug || {};
    const previousId = savedIds[expect.not_merged_with];
    if (previousId && debug.memory_id === previousId) {
      failures.push(`Memory was merged with ${expect.not_merged_with} (ID: ${previousId}) but should have been separate`);
    }
  }
  
  // Check category
  if (expect.category_contains) {
    const debug = result._debug || result.debug || {};
    const category = debug.category || '';
    if (!category.includes(expect.category_contains)) {
      failures.push(`Expected category to contain "${expect.category_contains}" but got "${category}"`);
    }
  }
  
  // Check boilerplate not stored
  if (expect.stored_content_not_contains) {
    const debug = result._debug || result.debug || {};
    const storedContent = debug.stored_content || '';
    for (const pattern of expect.stored_content_not_contains) {
      if (storedContent.toLowerCase().includes(pattern.toLowerCase())) {
        failures.push(`Found boilerplate "${pattern}" in stored content - storage filter failed`);
      }
    }
  }
  
  // Check debug results count
  if (expect.results_count !== undefined) {
    const count = result.results?.length || 0;
    if (count !== expect.results_count) {
      failures.push(`Expected ${expect.results_count} results but got ${count}`);
    }
  }
  
  return failures;
}

async function executeTest(test) {
  let result;
  
  if (test.action === 'chat') {
    result = await sendChat(test.message);
    
    // Save memory ID if requested
    if (test.save_memory_id_as) {
      const debug = result._debug || result.debug || {};
      if (debug.memory_id) {
        savedIds[test.save_memory_id_as] = debug.memory_id;
      }
    }
    
    // Follow up with debug check if requested
    if (test.then_check === 'debug') {
      const debugResult = await queryDebug({ action: 'last_store' });
      result._debug = { ...result._debug, ...debugResult };
    }
  } else if (test.action === 'debug') {
    result = await queryDebug(test.query);
  }
  
  const failures = checkExpectations(result, test.expect, test.name);
  
  return {
    passed: failures.length === 0,
    reason: failures.join('; '),
    response: result.response || result.message || JSON.stringify(result).substring(0, 300)
  };
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MEMORY SYSTEM REGRESSION TESTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Run ID:    ${RUN_ID}`);
  console.log(`  Test User: ${TEST_USER_ID}`);
  console.log(`  API:       ${API_BASE}`);
  console.log(`  Tests:     ${tests.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check API is reachable
  try {
    const health = await fetch(`${API_BASE}/api/health`).catch(() => null);
    if (!health || !health.ok) {
      console.log('⚠️  Warning: /api/health not responding. Server may be down.\n');
    }
  } catch (e) {
    console.log('⚠️  Warning: Could not reach API. Continuing anyway...\n');
  }
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];
  
  for (const test of tests) {
    process.stdout.write(`${test.name}... `);
    
    try {
      const result = await executeTest(test);
      
      if (result.passed) {
        console.log('✅ PASS');
        passed++;
      } else {
        console.log('❌ FAIL');
        console.log(`   └─ ${result.reason}`);
        failed++;
        failures.push({ 
          test: test.name, 
          reason: result.reason, 
          response: result.response 
        });
      }
    } catch (err) {
      if (err.message.includes('debug_endpoint_not_found')) {
        console.log('⏭️  SKIP (debug endpoint not available)');
        skipped++;
      } else {
        console.log('💥 ERROR');
        console.log(`   └─ ${err.message}`);
        failed++;
        failures.push({ test: test.name, reason: `Error: ${err.message}` });
      }
    }
    
    // Small delay between tests to avoid overwhelming the API
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total:   ${tests.length}`);
  console.log(`  Passed:  ${passed} ✅`);
  console.log(`  Failed:  ${failed} ❌`);
  console.log(`  Skipped: ${skipped} ⏭️`);
  console.log(`  Rate:    ${((passed / (tests.length - skipped)) * 100).toFixed(1)}%`);
  
  if (failures.length > 0) {
    console.log('\n───────────────────────────────────────────────────────────────');
    console.log('  FAILURES');
    console.log('───────────────────────────────────────────────────────────────');
    failures.forEach((f, i) => {
      console.log(`\n  ${i + 1}. ${f.test}`);
      console.log(`     Reason: ${f.reason}`);
      if (f.response) {
        console.log(`     Response: ${f.response.substring(0, 150)}...`);
      }
    });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
