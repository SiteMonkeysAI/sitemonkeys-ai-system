#!/usr/bin/env node
// ================================================================
// test-newline-database-trace.js
// CRITICAL: Tests whether newlines are preserved through the entire
// intelligent-storage pipeline from fact extraction to database storage
// ================================================================

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';
import coreSystem from './api/categories/memory/internal/core.js';
import intelligenceSystem from './api/categories/memory/internal/intelligence.js';

console.log('=' .repeat(80));
console.log('NEWLINE PRESERVATION TEST - Complete Database Trace');
console.log('Testing: fact extraction → aggressivePostProcessing → db.query → PostgreSQL');
console.log('=' .repeat(80));
console.log('');

async function testNewlineInDatabase() {
  try {
    // Initialize systems
    console.log('[INIT] Initializing core systems...');
    await coreSystem.initialize();
    await intelligenceSystem.initialize();
    console.log('[INIT] ✅ Systems initialized\n');

    const db = coreSystem.db;
    const storage = new IntelligentMemoryStorage(db, process.env.OPENAI_API_KEY);

    // ================================================================
    // TEST 1: Direct aggressivePostProcessing test
    // ================================================================
    console.log('[TEST 1] Direct aggressivePostProcessing Test');
    console.log('-'.repeat(80));
    
    // Simulate GPT-4o-mini output with bullet points
    const mockFactsFromGPT = `- User has pet monkeys.
- Assistant unaware of pet.
- User enjoys video games.`;
    
    console.log('Input (simulated GPT output):');
    console.log(mockFactsFromGPT);
    console.log('');
    
    const processedFacts = storage.aggressivePostProcessing(mockFactsFromGPT);
    console.log('Output after aggressivePostProcessing:');
    console.log('  JSON.stringify:', JSON.stringify(processedFacts));
    console.log('  Actual string:', processedFacts);
    console.log('  Contains \\n?', processedFacts.includes('\n'));
    console.log('  Split by \\n:', processedFacts.split('\n'));
    console.log('');
    
    // ================================================================
    // TEST 2: Store directly in database and retrieve
    // ================================================================
    console.log('[TEST 2] Direct Database Storage Test');
    console.log('-'.repeat(80));
    
    const testUserId = `newline_test_${Date.now()}`;
    const testCategory = 'personal_life_interests';
    const testFacts = 'User has pet monkeys.\nAssistant unaware of monkeys.\nUser asked about favorites.';
    
    console.log('Storing test facts:');
    console.log('  Input string:', JSON.stringify(testFacts));
    console.log('  Contains \\n?', testFacts.includes('\n'));
    console.log('  Line count:', testFacts.split('\n').length);
    console.log('');
    
    const storeResult = await storage.storeCompressedMemory(
      testUserId,
      testCategory,
      testFacts,
      {
        test: true,
        original_tokens: 50,
        compressed_tokens: 15,
        compression_ratio: 3.3
      }
    );
    
    console.log('Storage result:');
    console.log('  Action:', storeResult.action);
    console.log('  Memory ID:', storeResult.memoryId);
    console.log('');
    
    // Retrieve from database
    console.log('Retrieving from database:');
    const retrieveResult = await db.query(
      'SELECT id, content, metadata FROM persistent_memories WHERE id = $1',
      [storeResult.memoryId]
    );
    
    if (retrieveResult.rows.length > 0) {
      const memory = retrieveResult.rows[0];
      console.log('  Retrieved content:', JSON.stringify(memory.content));
      console.log('  Contains \\n?', memory.content.includes('\n'));
      console.log('  Line count:', memory.content.split('\n').length);
      console.log('  Actual content:');
      console.log('    |' + memory.content.replace(/\n/g, '\\n|\n    |') + '|');
      console.log('');
      
      // Test keyword search that should work
      console.log('Testing keyword search on stored content:');
      const searchMonkeys = await db.query(
        "SELECT id, content FROM persistent_memories WHERE id = $1 AND content ILIKE '%monkeys%'",
        [storeResult.memoryId]
      );
      console.log('  Search for "%monkeys%":', searchMonkeys.rows.length > 0 ? '✅ FOUND' : '❌ NOT FOUND');
      
      // Test the problematic search (concatenated without newline)
      const searchConcatenated = await db.query(
        "SELECT id, content FROM persistent_memories WHERE id = $1 AND content ILIKE '%monkeys.Assistant%'",
        [storeResult.memoryId]
      );
      console.log('  Search for "%monkeys.Assistant%":', searchConcatenated.rows.length > 0 ? '❌ FOUND (BAD!)' : '✅ NOT FOUND (GOOD!)');
      
      // Test the correct search (with period-newline-capital)
      const searchCorrect = await db.query(
        "SELECT id, content FROM persistent_memories WHERE id = $1 AND content SIMILAR TO '%monkeys.\\nAssistant%'",
        [storeResult.memoryId]
      );
      console.log('  Search for "%monkeys.\\nAssistant%":', searchCorrect.rows.length > 0 ? '✅ FOUND (GOOD!)' : '❌ NOT FOUND (BAD!)');
    }
    console.log('');
    
    // ================================================================
    // TEST 3: Full storeWithIntelligence flow (if API key available)
    // ================================================================
    if (process.env.OPENAI_API_KEY) {
      console.log('[TEST 3] Full storeWithIntelligence Flow');
      console.log('-'.repeat(80));
      
      const testMessage = 'I have three pet monkeys and they are adorable!';
      const testResponse = 'That sounds wonderful! Pet monkeys must be quite interesting companions.';
      
      console.log('Input conversation:');
      console.log('  User:', testMessage);
      console.log('  Assistant:', testResponse);
      console.log('');
      
      console.log('Calling storeWithIntelligence (with GPT-4o-mini fact extraction)...');
      const fullResult = await storage.storeWithIntelligence(
        testUserId,
        testMessage,
        testResponse,
        testCategory
      );
      
      console.log('Storage result:');
      console.log('  Action:', fullResult.action);
      console.log('  Memory ID:', fullResult.memoryId);
      console.log('');
      
      // Retrieve and check
      const fullRetrieve = await db.query(
        'SELECT id, content, metadata FROM persistent_memories WHERE id = $1',
        [fullResult.memoryId]
      );
      
      if (fullRetrieve.rows.length > 0) {
        const memory = fullRetrieve.rows[0];
        console.log('Retrieved compressed facts:');
        console.log('  JSON.stringify:', JSON.stringify(memory.content));
        console.log('  Contains \\n?', memory.content.includes('\n'));
        console.log('  Line count:', memory.content.split('\n').length);
        console.log('  Actual content:');
        console.log('    |' + memory.content.replace(/\n/g, '\\n|\n    |') + '|');
        console.log('');
        
        // Check metadata
        const metadata = JSON.parse(memory.metadata);
        console.log('Compression metadata:');
        console.log('  Original tokens:', metadata.original_tokens);
        console.log('  Compressed tokens:', metadata.compressed_tokens);
        console.log('  Compression ratio:', metadata.compression_ratio);
        console.log('  Storage version:', metadata.storage_version);
      }
      console.log('');
    } else {
      console.log('[TEST 3] Skipped (no OPENAI_API_KEY)');
      console.log('');
    }
    
    // ================================================================
    // TEST 4: Character-by-character analysis
    // ================================================================
    console.log('[TEST 4] Character-by-Character Analysis');
    console.log('-'.repeat(80));
    
    const finalRetrieve = await db.query(
      'SELECT content FROM persistent_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [testUserId]
    );
    
    if (finalRetrieve.rows.length > 0) {
      const content = finalRetrieve.rows[0].content;
      console.log('Analyzing stored content character-by-character:');
      
      const chars = Array.from(content);
      let charDisplay = '';
      for (let i = 0; i < Math.min(chars.length, 100); i++) {
        const char = chars[i];
        const code = char.charCodeAt(0);
        if (code === 10) {
          charDisplay += `[${i}:\\n(10)] `;
        } else if (code < 32 || code > 126) {
          charDisplay += `[${i}:?(${code})] `;
        } else {
          charDisplay += `[${i}:${char}(${code})] `;
        }
      }
      console.log(charDisplay);
      console.log('');
      
      // Count newlines
      const newlineCount = (content.match(/\n/g) || []).length;
      console.log(`Total newlines (\\n) in content: ${newlineCount}`);
      console.log(`Total periods (.) in content: ${(content.match(/\./g) || []).length}`);
      console.log('');
      
      // Check for period-newline sequences
      const periodNewlineCount = (content.match(/\.\n/g) || []).length;
      console.log(`Period followed by newline (.\\n): ${periodNewlineCount}`);
      
      // Check for period without newline before capital
      const periodCapitalCount = (content.match(/\.[A-Z]/g) || []).length;
      console.log(`Period followed directly by capital (.[A-Z]): ${periodCapitalCount}`);
      
      if (periodCapitalCount > 0) {
        console.log('');
        console.log('❌ PROBLEM FOUND: Periods followed directly by capitals without newlines!');
        console.log('   This matches the issue description: "monkeys.Assistant" instead of "monkeys.\\nAssistant"');
        console.log('');
        
        // Show the problematic sequences
        const matches = content.match(/\.[A-Z][a-z]*/g);
        if (matches) {
          console.log('Problematic sequences found:');
          matches.forEach(match => {
            console.log(`  - "${match}"`);
          });
        }
      } else if (periodNewlineCount > 0) {
        console.log('');
        console.log('✅ GOOD: Periods are properly followed by newlines before capitals');
      }
    }
    console.log('');
    
    // Cleanup test data
    console.log('[CLEANUP] Removing test data...');
    await db.query(
      'DELETE FROM persistent_memories WHERE user_id = $1',
      [testUserId]
    );
    console.log('[CLEANUP] ✅ Test data removed');
    console.log('');
    
    storage.cleanup();
    await coreSystem.cleanup();
    
  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
  }
  
  console.log('=' .repeat(80));
  console.log('TEST COMPLETE');
  console.log('=' .repeat(80));
}

// Run the test
testNewlineInDatabase().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
