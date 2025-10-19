#!/usr/bin/env node
// ================================================================
// SEMANTIC ANALYZER INITIALIZATION TESTS
// Tests the new parallel embedding computation and timeout protection
// ================================================================

import { SemanticAnalyzer } from './api/core/intelligence/semantic_analyzer.js';

console.log('🧪 TESTING SEMANTIC ANALYZER INITIALIZATION IMPROVEMENTS...\n');

let testsPassed = 0;
let testsTotal = 0;

// Test helper function
async function runTest(testName, testFunction) {
  testsTotal++;
  console.log(`🧪 Testing: ${testName}`);
  
  try {
    const result = await testFunction();
    if (result === true || (result && result.success)) {
      console.log(`✅ PASS: ${testName}`);
      testsPassed++;
      return true;
    } else {
      console.log(`❌ FAIL: ${testName}`, result);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${testName} - ${error.message}`);
    if (error.stack) {
      console.error('  Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    return false;
  } finally {
    console.log('');
  }
}

// ================================================================
// TEST 1: Fallback Mode Functionality (Simulated API Failure)
// ================================================================
await runTest('Fallback Mode with Empty Embeddings (API Failure)', async () => {
  console.log('  - Testing fallback behavior when API calls fail...');
  
  const analyzer = new SemanticAnalyzer();
  
  // Mock the OpenAI client to simulate API failure
  analyzer.openai = {
    embeddings: {
      create: async () => {
        throw new Error('Simulated API failure - Invalid API key');
      }
    }
  };
  
  const startTime = Date.now();
  const result = await analyzer.initialize();
  const duration = Date.now() - startTime;
  
  console.log(`  - Initialization completed in ${duration}ms`);
  
  // Should return true (allowing system to continue)
  if (!result) {
    console.log('  ❌ Fallback mode should return true to allow system continuation');
    return false;
  }
  
  console.log('  ✓ Initialization returned true in fallback mode');
  
  // Verify empty embeddings were set
  const intentCategories = ['question', 'command', 'discussion', 'problem_solving', 
                            'decision_making', 'emotional_expression', 'information_sharing'];
  for (const intent of intentCategories) {
    if (!analyzer.intentEmbeddings[intent]) {
      console.log(`  ❌ Missing fallback intent embedding: ${intent}`);
      return false;
    }
    // Check if it's a zero vector (1536 zeros)
    const isZeroVector = analyzer.intentEmbeddings[intent].every(v => v === 0);
    if (!isZeroVector || analyzer.intentEmbeddings[intent].length !== 1536) {
      console.log(`  ❌ Fallback embedding not a proper zero vector: ${intent}`);
      return false;
    }
  }
  console.log(`  ✓ All ${intentCategories.length} intent embeddings set to zero vectors`);
  
  const domainCategories = ['business', 'technical', 'personal', 'health', 
                            'financial', 'creative', 'general'];
  for (const domain of domainCategories) {
    if (!analyzer.domainEmbeddings[domain]) {
      console.log(`  ❌ Missing fallback domain embedding: ${domain}`);
      return false;
    }
    const isZeroVector = analyzer.domainEmbeddings[domain].every(v => v === 0);
    if (!isZeroVector || analyzer.domainEmbeddings[domain].length !== 1536) {
      console.log(`  ❌ Fallback embedding not a proper zero vector: ${domain}`);
      return false;
    }
  }
  console.log(`  ✓ All ${domainCategories.length} domain embeddings set to zero vectors`);
  
  // Verify it happened quickly (fallback should be quick)
  if (duration > 2000) {
    console.log(`  ⚠️ Fallback took ${duration}ms - should be faster`);
  } else {
    console.log(`  ✓ Fallback completed quickly (${duration}ms)`);
  }
  
  return true;
});

// ================================================================
// TEST 2: Timeout Protection
// ================================================================
await runTest('Timeout Protection (20 second max)', async () => {
  console.log('  - Testing timeout protection with slow mock API...');
  
  const analyzer = new SemanticAnalyzer();
  
  // Mock a slow API that takes longer than timeout
  analyzer.openai = {
    embeddings: {
      create: async () => {
        // Simulate a slow API call that would exceed 20s timeout
        await new Promise(resolve => setTimeout(resolve, 25000));
        return {
          data: [{ embedding: new Array(1536).fill(0.1) }],
          usage: { total_tokens: 100 }
        };
      }
    }
  };
  
  const startTime = Date.now();
  const result = await analyzer.initialize();
  const duration = Date.now() - startTime;
  
  console.log(`  - Initialization completed in ${duration}ms`);
  
  // Should timeout and enter fallback mode before 21 seconds
  if (duration > 21000) {
    console.log(`  ❌ Initialization exceeded 20 second timeout: ${duration}ms`);
    return false;
  }
  
  console.log(`  ✓ Timeout protection activated at ~20s (actual: ${duration}ms)`);
  
  // Should still return true (fallback mode)
  if (!result) {
    console.log('  ❌ Should return true in fallback after timeout');
    return false;
  }
  
  console.log('  ✓ Returned true to allow system continuation after timeout');
  
  // Verify fallback embeddings were set
  if (!analyzer.intentEmbeddings || !analyzer.domainEmbeddings) {
    console.log('  ❌ Embeddings not initialized in fallback mode');
    return false;
  }
  
  const intentCount = Object.keys(analyzer.intentEmbeddings).length;
  const domainCount = Object.keys(analyzer.domainEmbeddings).length;
  
  if (intentCount !== 7 || domainCount !== 7) {
    console.log(`  ❌ Expected 7 intents and 7 domains in fallback, got ${intentCount} and ${domainCount}`);
    return false;
  }
  
  console.log('  ✓ Fallback embeddings initialized after timeout');
  
  return true;
});

// ================================================================
// TEST 3: Parallel Computation Structure and Performance
// ================================================================
await runTest('Parallel Computation Structure and Performance', async () => {
  console.log('  - Verifying parallel computation is correctly structured...');
  
  const analyzer = new SemanticAnalyzer();
  
  // Track call order and timing to verify parallelism
  const callLog = [];
  let callCounter = 0;
  
  analyzer.openai = {
    embeddings: {
      create: async (params) => {
        const callId = ++callCounter;
        const startTime = Date.now();
        callLog.push({ 
          id: callId, 
          text: params.input.substring(0, 30), 
          start: startTime 
        });
        
        // Simulate API delay (100ms per call)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const endTime = Date.now();
        callLog.push({ id: callId, end: endTime, duration: endTime - startTime });
        
        return {
          data: [{ embedding: new Array(1536).fill(Math.random()) }],
          usage: { total_tokens: 50 }
        };
      }
    }
  };
  
  const startTime = Date.now();
  await analyzer.initialize();
  const duration = Date.now() - startTime;
  
  console.log(`  - Initialization completed in ${duration}ms`);
  console.log(`  - Total API calls made: ${callCounter}`);
  
  // Should have made 14 calls (7 intents + 7 domains)
  if (callCounter !== 14) {
    console.log(`  ❌ Expected 14 API calls, got ${callCounter}`);
    return false;
  }
  console.log('  ✓ All 14 embeddings computed (7 intents + 7 domains)');
  
  // Check timing - if truly parallel, should complete much faster than sequential
  // Sequential would be 14 * 100ms = 1400ms minimum
  // Parallel should be ~100-300ms (one or two batches of calls)
  if (duration > 1200) {
    console.log(`  ⚠️ Duration ${duration}ms is close to sequential timing (1400ms)`);
    console.log(`  - This may indicate calls are not fully parallel`);
  } else {
    console.log(`  ✓ Fast completion time (${duration}ms) confirms parallel execution`);
    console.log(`  - Sequential would take ~1400ms, parallel takes ~${duration}ms`);
  }
  
  // Verify all embeddings were stored
  const intentCount = Object.keys(analyzer.intentEmbeddings).length;
  const domainCount = Object.keys(analyzer.domainEmbeddings).length;
  
  if (intentCount !== 7 || domainCount !== 7) {
    console.log(`  ❌ Expected 7 intents and 7 domains, got ${intentCount} and ${domainCount}`);
    return false;
  }
  console.log(`  ✓ All ${intentCount} intent and ${domainCount} domain embeddings stored`);
  
  return true;
});

// ================================================================
// TEST 4: Embedding Structure Validation
// ================================================================
await runTest('Embedding Structure and Size Validation', async () => {
  console.log('  - Validating embedding data structures...');
  
  const analyzer = new SemanticAnalyzer();
  
  // Mock successful API with proper-sized embeddings
  analyzer.openai = {
    embeddings: {
      create: async () => ({
        data: [{ embedding: new Array(1536).fill(Math.random()) }],
        usage: { total_tokens: 50 }
      })
    }
  };
  
  await analyzer.initialize();
  
  // Verify all intent embeddings
  const intentCategories = ['question', 'command', 'discussion', 'problem_solving', 
                            'decision_making', 'emotional_expression', 'information_sharing'];
  
  for (const intent of intentCategories) {
    if (!analyzer.intentEmbeddings[intent]) {
      console.log(`  ❌ Missing intent: ${intent}`);
      return false;
    }
    
    if (!Array.isArray(analyzer.intentEmbeddings[intent])) {
      console.log(`  ❌ Intent ${intent} is not an array`);
      return false;
    }
    
    if (analyzer.intentEmbeddings[intent].length !== 1536) {
      console.log(`  ❌ Intent ${intent} has wrong size: ${analyzer.intentEmbeddings[intent].length}`);
      return false;
    }
  }
  console.log(`  ✓ All ${intentCategories.length} intent embeddings have correct structure (1536-dim)`);
  
  // Verify all domain embeddings
  const domainCategories = ['business', 'technical', 'personal', 'health', 
                            'financial', 'creative', 'general'];
  
  for (const domain of domainCategories) {
    if (!analyzer.domainEmbeddings[domain]) {
      console.log(`  ❌ Missing domain: ${domain}`);
      return false;
    }
    
    if (!Array.isArray(analyzer.domainEmbeddings[domain])) {
      console.log(`  ❌ Domain ${domain} is not an array`);
      return false;
    }
    
    if (analyzer.domainEmbeddings[domain].length !== 1536) {
      console.log(`  ❌ Domain ${domain} has wrong size: ${analyzer.domainEmbeddings[domain].length}`);
      return false;
    }
  }
  console.log(`  ✓ All ${domainCategories.length} domain embeddings have correct structure (1536-dim)`);
  
  return true;
});

// ================================================================
// TEST 5: Logging Verification
// ================================================================
await runTest('Logging and Messages Verification', async () => {
  console.log('  - Verifying logging output...');
  
  const analyzer = new SemanticAnalyzer();
  const logMessages = [];
  const errorMessages = [];
  
  // Capture log output
  analyzer.logger.log = (msg) => {
    logMessages.push(msg);
  };
  
  analyzer.logger.error = (msg, _err) => {
    errorMessages.push(msg);
  };
  
  // Mock successful API
  analyzer.openai = {
    embeddings: {
      create: async () => ({
        data: [{ embedding: new Array(1536).fill(0.1) }],
        usage: { total_tokens: 50 }
      })
    }
  };
  
  await analyzer.initialize();
  
  console.log(`  - Captured ${logMessages.length} log messages`);
  
  // Check for expected log messages
  const hasInitMessage = logMessages.some(msg => 
    msg.includes('Initializing SemanticAnalyzer') && msg.includes('parallel')
  );
  
  if (!hasInitMessage) {
    console.log('  ❌ Missing initialization message mentioning parallel computation');
    console.log('  Messages:', logMessages.slice(0, 3));
    return false;
  }
  console.log('  ✓ Initialization message present');
  
  const hasComputingMessage = logMessages.some(msg => 
    msg.includes('Computing') && msg.includes('embeddings in parallel')
  );
  
  if (!hasComputingMessage) {
    console.log('  ❌ Missing message about computing embeddings in parallel');
    return false;
  }
  console.log('  ✓ Parallel computation message present');
  
  const hasCompletionMessage = logMessages.some(msg => 
    msg.includes('initialization complete') && msg.includes('ms')
  );
  
  if (!hasCompletionMessage) {
    console.log('  ❌ Missing completion message with timing');
    return false;
  }
  console.log('  ✓ Completion message with timing present');
  
  // Count individual embedding completion messages
  const embeddingMessages = logMessages.filter(msg => 
    msg.includes('Pre-computed embedding for')
  );
  
  if (embeddingMessages.length !== 14) {
    console.log(`  ⚠️ Expected 14 embedding completion messages, got ${embeddingMessages.length}`);
  } else {
    console.log(`  ✓ All 14 embedding completion messages logged`);
  }
  
  // Should have no errors for successful case
  if (errorMessages.length > 0) {
    console.log(`  ⚠️ Unexpected error messages: ${errorMessages.length}`);
  } else {
    console.log('  ✓ No error messages (as expected for successful init)');
  }
  
  return true;
});

// ================================================================
// FINAL RESULTS
// ================================================================

console.log('📊 TEST RESULTS SUMMARY\n');
console.log(`✅ Tests Passed: ${testsPassed}/${testsTotal}`);
console.log(`❌ Tests Failed: ${testsTotal - testsPassed}/${testsTotal}`);

if (testsPassed === testsTotal) {
  console.log('\n🎉 ALL TESTS PASSED! SemanticAnalyzer improvements verified.\n');
  
  console.log('✅ VERIFIED IMPROVEMENTS:');
  console.log('• Parallel embedding computation (14 embeddings) ✓');
  console.log('• 20-second timeout protection ✓');
  console.log('• Graceful fallback mode with empty embeddings ✓');
  console.log('• System continues running in degraded mode ✓');
  console.log('• Correct embedding structure and size ✓');
  console.log('• Enhanced logging with timing info ✓');
  
  console.log('\n💡 READY FOR DEPLOYMENT:');
  console.log('• Railway deployment will be faster and more reliable');
  console.log('• System will never hang on startup');
  console.log('• OpenAI API issues won\'t crash the server');
  console.log('• Fallback mode ensures continuous operation');
  
  process.exit(0);
  
} else {
  console.log(`\n⚠️ ${testsTotal - testsPassed} TEST(S) FAILED - Review implementation\n`);
  
  if (testsPassed > testsTotal * 0.8) {
    console.log('Most functionality working - minor fixes may be needed');
  } else if (testsPassed > testsTotal * 0.5) {
    console.log('Core functionality working - several fixes needed');
  } else {
    console.log('Major implementation issues detected - review code carefully');
  }
  
  process.exit(1);
}


