#!/usr/bin/env node
// ================================================================
// INTELLIGENT STORAGE UNIT TESTS
// Tests module structure, imports, and logic without external dependencies
// ================================================================

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';

console.log('🧪 INTELLIGENT STORAGE UNIT TESTS\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    testsFailed++;
  }
}

async function runUnitTests() {
  console.log('📦 Module Import Tests\n');

  // Test 1: Module can be imported
  test('IntelligentMemoryStorage class can be imported', () => {
    if (typeof IntelligentMemoryStorage !== 'function') {
      throw new Error('IntelligentMemoryStorage is not a class');
    }
  });

  // Test 2: Class can be instantiated
  test('IntelligentMemoryStorage can be instantiated', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (!storage) {
      throw new Error('Failed to instantiate');
    }
  });

  // Test 3: Required methods exist
  test('storeWithIntelligence method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.storeWithIntelligence !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('extractKeyFacts method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.extractKeyFacts !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('findSimilarMemories method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.findSimilarMemories !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('boostExistingMemory method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.boostExistingMemory !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('storeCompressedMemory method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.storeCompressedMemory !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('storeUncompressed method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.storeUncompressed !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('countTokens method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.countTokens !== 'function') {
      throw new Error('Method not found');
    }
  });

  test('cleanup method exists', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    if (typeof storage.cleanup !== 'function') {
      throw new Error('Method not found');
    }
  });

  console.log('\n🧮 Token Counting Tests\n');

  // Test 4: Token counting with fallback
  test('countTokens returns a number', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    const tokens = storage.countTokens('Hello world');
    if (typeof tokens !== 'number') {
      throw new Error('Token count is not a number');
    }
  });

  test('countTokens handles empty string', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    const tokens = storage.countTokens('');
    if (tokens !== 0) {
      throw new Error('Expected 0 tokens for empty string');
    }
  });

  test('countTokens handles null/undefined', () => {
    const mockDb = { query: async () => ({ rows: [] }) };
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    const tokens1 = storage.countTokens(null);
    const tokens2 = storage.countTokens(undefined);
    if (tokens1 !== 0 || tokens2 !== 0) {
      throw new Error('Expected 0 tokens for null/undefined');
    }
  });

  console.log('\n🔍 Logic Tests\n');

  // Test 5: Fallback logic
  test('storeUncompressed creates proper content format', async () => {
    let capturedQuery = null;
    let capturedParams = null;
    
    const mockDb = {
      query: async (query, params) => {
        capturedQuery = query;
        capturedParams = params;
        return { rows: [{ id: 123 }] };
      }
    };
    
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    await storage.storeUncompressed('user1', 'Hello', 'Hi there', 'general');
    
    if (!capturedParams[3].includes('User: Hello')) {
      throw new Error('Content format incorrect');
    }
    if (!capturedParams[3].includes('Assistant: Hi there')) {
      throw new Error('Content format incorrect');
    }
  });

  test('boostExistingMemory increases usage_frequency', async () => {
    let updateExecuted = false;
    
    const mockDb = {
      query: async (query, params) => {
        if (query.includes('UPDATE') && query.includes('usage_frequency')) {
          updateExecuted = true;
        }
        return { rows: [] };
      }
    };
    
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    await storage.boostExistingMemory(456);
    
    if (!updateExecuted) {
      throw new Error('Boost query not executed');
    }
  });

  test('findSimilarMemories uses correct SQL query', async () => {
    let queryUsedFTS = false;
    
    const mockDb = {
      query: async (query, params) => {
        if (query.includes('ts_rank') && query.includes('to_tsvector')) {
          queryUsedFTS = true;
        }
        return { rows: [] };
      }
    };
    
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    await storage.findSimilarMemories('user1', 'test', 'test facts');
    
    if (!queryUsedFTS) {
      throw new Error('Full-text search not used');
    }
  });

  test('storeCompressedMemory includes metadata', async () => {
    let metadataCorrect = false;
    
    const mockDb = {
      query: async (query, params) => {
        const metadata = JSON.parse(params[6]);
        if (metadata.compressed === true && 
            metadata.dedup_checked === true &&
            metadata.storage_version === 'intelligent_v1') {
          metadataCorrect = true;
        }
        return { rows: [{ id: 789 }] };
      }
    };
    
    const storage = new IntelligentMemoryStorage(mockDb, 'test-key');
    await storage.storeCompressedMemory('user1', 'test', 'facts', {
      compression_ratio: 10.5
    });
    
    if (!metadataCorrect) {
      throw new Error('Metadata incorrect');
    }
  });

  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Total: ${testsPassed + testsFailed}`);
  console.log('═══════════════════════════════════════════════\n');

  if (testsFailed === 0) {
    console.log('✅ All unit tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  }
}

// Run tests
runUnitTests().catch(error => {
  console.error('❌ Test suite error:', error);
  process.exit(1);
});
