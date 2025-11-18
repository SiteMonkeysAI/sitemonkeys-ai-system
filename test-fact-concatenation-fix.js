#!/usr/bin/env node
// ================================================================
// TEST FOR FACT CONCATENATION BUG FIX
// Verifies that facts are properly separated even when AI returns 
// them with periods but without newlines
// ================================================================

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';

console.log('🧪 TESTING FACT CONCATENATION FIX...\n');

// Create a minimal mock database for testing
const mockDb = {
  query: async (sql, params) => {
    return { rows: [] };
  }
};

try {
  const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
  
  console.log('📝 Test 1: Facts with periods on same line');
  const test1 = `User's favorite color is blue. User prefers honesty in responses.`;
  const result1 = storage.aggressivePostProcessing(test1);
  console.log('Input:', test1);
  console.log('Output:');
  console.log(result1);
  
  // Verify facts are separated
  const facts1 = result1.split('\n').filter(l => l.trim());
  if (facts1.length >= 2) {
    console.log(`✅ SUCCESS: ${facts1.length} facts properly separated`);
    
    // Verify we can search for "blue"
    if (result1.includes('blue') && !result1.includes('blueUser')) {
      console.log('✅ Search for "blue" will work correctly');
    } else {
      console.log('❌ FAIL: Facts still concatenated incorrectly');
      process.exit(1);
    }
  } else {
    console.log('❌ FAIL: Facts not separated');
    console.log(`Got ${facts1.length} facts, expected at least 2`);
    process.exit(1);
  }
  
  console.log('\n📝 Test 2: Facts with newlines (standard case)');
  const test2 = `User's favorite color is blue\nUser prefers honesty in responses`;
  const result2 = storage.aggressivePostProcessing(test2);
  console.log('Input:', test2);
  console.log('Output:');
  console.log(result2);
  
  const facts2 = result2.split('\n').filter(l => l.trim());
  if (facts2.length >= 2) {
    console.log(`✅ SUCCESS: ${facts2.length} facts properly separated`);
  } else {
    console.log('❌ FAIL: Facts not separated');
    process.exit(1);
  }
  
  console.log('\n📝 Test 3: Multiple facts with mixed formatting');
  const test3 = `- Fact one here. - Fact two here. - Fact three here.`;
  const result3 = storage.aggressivePostProcessing(test3);
  console.log('Input:', test3);
  console.log('Output:');
  console.log(result3);
  
  const facts3 = result3.split('\n').filter(l => l.trim());
  if (facts3.length >= 3) {
    console.log(`✅ SUCCESS: ${facts3.length} facts properly separated`);
  } else {
    console.log('❌ FAIL: Facts not separated');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ ALL TESTS PASSED!');
  console.log('The fact concatenation bug is fixed.');
  console.log('Facts with periods are now properly separated with newlines.');
  console.log('='.repeat(70));
  
  storage.cleanup();
  process.exit(0);
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
