/**
 * STR1 VOLUME STRESS TEST
 * 
 * Tests the scenario from issue #566 comment:
 * - Store 10 facts rapidly (300ms between each)
 * - Query for 3 specific facts
 * - All 3 should be retrieved successfully
 * 
 * This test specifically checks for:
 * 1. Storage rate limiting or dropped writes
 * 2. Retrieval ranking issues with multiple memories
 * 3. Token budget constraints
 * 4. Embedding generation timing issues
 */

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const TEST_USER_ID = 'test-str1-' + Date.now();

// Test data: 10 facts stored rapidly
const FACTS = [
  "My favorite color is blue",
  "I drive a Tesla Model 3",
  "My dog's name is Max",
  "I work at Google",
  "My birthday is March 15th",
  "I live in Seattle",
  "My favorite food is pizza",
  "I play guitar",
  "I studied computer science",
  "My lucky number is 7"
];

// Queries to test retrieval
const QUERIES = [
  { query: "What car do I drive?", expected: ["Tesla", "Model 3"], description: "Car fact" },
  { query: "What's my dog's name?", expected: ["Max"], description: "Dog fact" },
  { query: "What's my favorite color?", expected: ["blue"], description: "Color fact" }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function chat(message) {
  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        userId: TEST_USER_ID,
        sessionId: 'test-session',
        mode: 'truth-general'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error(`[ERROR] Chat request failed:`, error.message);
    return '';
  }
}

async function checkMemoryStorage() {
  try {
    const response = await fetch(`${API_BASE}/api/debug/memory-log/${TEST_USER_ID}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[ERROR] Debug check failed:`, error.message);
    return null;
  }
}

async function runTest() {
  console.log('\n===========================================');
  console.log('STR1 VOLUME STRESS TEST');
  console.log('===========================================\n');
  console.log(`Test User ID: ${TEST_USER_ID}\n`);

  // PHASE 1: Store 10 facts rapidly
  console.log('PHASE 1: Storing 10 facts rapidly (300ms between each)...\n');
  
  const storageStart = Date.now();
  for (let i = 0; i < FACTS.length; i++) {
    const fact = FACTS[i];
    console.log(`[${i + 1}/10] Storing: "${fact}"`);
    
    const response = await chat(`Remember this: ${fact}`);
    console.log(`  Response: ${response.substring(0, 80)}${response.length > 80 ? '...' : ''}`);
    
    if (i < FACTS.length - 1) {
      await delay(300);  // 300ms between stores (as specified in test)
    }
  }
  
  const storageTime = Date.now() - storageStart;
  console.log(`\n✓ All 10 facts stored in ${storageTime}ms\n`);

  // Wait 2 seconds for embeddings to generate (as specified in test)
  console.log('Waiting 2 seconds for embeddings to complete...\n');
  await delay(2000);

  // Check what was actually stored
  console.log('CHECKING STORAGE STATUS...\n');
  const memoryLog = await checkMemoryStorage();
  if (memoryLog && memoryLog.store_operations) {
    console.log(`Total memories stored: ${memoryLog.store_operations.length}`);
    memoryLog.store_operations.forEach((op, idx) => {
      console.log(`  ${idx + 1}. ID: ${op.memory_id}, Preview: ${op.content_preview.substring(0, 60)}...`);
    });
  } else {
    console.log('⚠️  Could not retrieve storage log');
  }
  console.log('');

  // PHASE 2: Query for specific facts
  console.log('PHASE 2: Querying for specific facts...\n');
  
  const results = [];
  
  for (const testCase of QUERIES) {
    console.log(`Testing: ${testCase.description}`);
    console.log(`Query: "${testCase.query}"`);
    
    const response = await chat(testCase.query);
    console.log(`Response: ${response.substring(0, 150)}${response.length > 150 ? '...' : ''}\n`);
    
    // Check if expected terms are in the response
    const containsExpected = testCase.expected.some(term => 
      response.toLowerCase().includes(term.toLowerCase())
    );
    
    const passed = containsExpected;
    results.push({
      description: testCase.description,
      query: testCase.query,
      expected: testCase.expected,
      response: response.substring(0, 200),
      passed
    });
    
    console.log(passed ? '✓ PASS\n' : '✗ FAIL\n');
    await delay(500);  // Small delay between queries
  }

  // PHASE 3: Summary
  console.log('===========================================');
  console.log('TEST SUMMARY');
  console.log('===========================================\n');
  
  const passCount = results.filter(r => r.passed).length;
  const totalTests = results.length;
  
  console.log(`Results: ${passCount}/${totalTests} passed\n`);
  
  results.forEach((result, idx) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${idx + 1}. ${status} - ${result.description}`);
    if (!result.passed) {
      console.log(`   Expected to find: ${result.expected.join(' or ')}`);
      console.log(`   Got: ${result.response.substring(0, 100)}...`);
    }
  });
  
  console.log('\n===========================================');
  
  if (passCount === totalTests) {
    console.log('✓ STR1 TEST PASSED - All facts retrieved successfully');
  } else {
    console.log(`✗ STR1 TEST FAILED - ${totalTests - passCount} retrieval(s) failed`);
    console.log('\nPossible causes:');
    console.log('1. Storage: Facts dropped during rapid storage');
    console.log('2. Retrieval: Ranking algorithm not finding relevant memories');
    console.log('3. Timing: Race condition between storage and embedding generation');
    console.log('4. Token Budget: Memories excluded due to token constraints');
  }
  
  console.log('===========================================\n');
  
  process.exit(passCount === totalTests ? 0 : 1);
}

// Run the test
runTest().catch(error => {
  console.error('[FATAL ERROR]', error);
  process.exit(1);
});
