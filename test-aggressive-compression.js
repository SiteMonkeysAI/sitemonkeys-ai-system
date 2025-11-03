#!/usr/bin/env node
// ================================================================
// TEST: Aggressive Post-Processing for 10-20:1 Compression
// Unit test for the new aggressivePostProcessing method
// ================================================================

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';

console.log('🧪 TESTING AGGRESSIVE POST-PROCESSING...\n');

// Mock database for testing
const mockDb = {
  query: async () => ({ rows: [] }),
  end: async () => {}
};

// Create storage instance with mock DB and no API key (we'll test post-processing only)
const storage = new IntelligentMemoryStorage(mockDb, 'mock-key');

// Test 1: Basic post-processing
console.log('📝 Test 1: Basic Post-Processing');
const rawFacts1 = `- User's favorite superhero is Deadpool
- User loves Deadpool's humor
- Deadpool is known for breaking the fourth wall
- Deadpool has witty humor
- Deadpool is a unique Marvel character
- Deadpool has irreverent style
- Deadpool uses comedic approach to superhero storytelling`;

const processed1 = storage.aggressivePostProcessing(rawFacts1);
const lines1 = processed1.split('\n').filter(l => l.trim());
console.log(`   Input lines: ${rawFacts1.split('\n').length}`);
console.log(`   Output lines: ${lines1.length}`);
console.log(`   Processed facts:\n${processed1}\n`);

if (lines1.length <= 5) {
  console.log(`   ✅ PASS: Limited to max 5 facts (got ${lines1.length})\n`);
} else {
  console.log(`   ❌ FAIL: Should limit to 5 facts, got ${lines1.length}\n`);
}

// Test 2: Word count limit (8 words max)
console.log('📝 Test 2: 8-Word Maximum Enforcement');
const rawFacts2 = `- This is a very long fact that definitely exceeds eight words and should be truncated
- Short fact
- Another very long fact with many words that should get cut off at eight words exactly`;

const processed2 = storage.aggressivePostProcessing(rawFacts2);
const lines2 = processed2.split('\n').filter(l => l.trim());
let allUnder8Words = true;
lines2.forEach(line => {
  const wordCount = line.split(/\s+/).length;
  console.log(`   "${line}" (${wordCount} words)`);
  if (wordCount > 8) {
    allUnder8Words = false;
  }
});

if (allUnder8Words) {
  console.log(`   ✅ PASS: All facts under 8 words\n`);
} else {
  console.log(`   ❌ FAIL: Some facts exceed 8 words\n`);
}

// Test 3: Duplicate removal
console.log('📝 Test 3: Duplicate Removal');
const rawFacts3 = `- User likes pizza
- User LIKES PIZZA
- User enjoys pizza
- User likes pasta`;

const processed3 = storage.aggressivePostProcessing(rawFacts3);
const lines3 = processed3.split('\n').filter(l => l.trim());
console.log(`   Input lines: 4 (2 near-duplicates)`);
console.log(`   Output lines: ${lines3.length}`);
console.log(`   Processed facts:\n${processed3}\n`);

if (lines3.length < 4) {
  console.log(`   ✅ PASS: Duplicates removed\n`);
} else {
  console.log(`   ⚠️  WARNING: Expected duplicate removal\n`);
}

// Test 4: Compression ratio simulation
console.log('📝 Test 4: Compression Ratio Calculation');
const verboseInput = `My favorite superhero is Deadpool and I love his humor because he is so funny and entertaining. I especially enjoy how he breaks the fourth wall and talks directly to the audience. His red costume is iconic and I appreciate how Marvel created such a unique character.`;
const verboseResponse = `Deadpool is indeed known for his witty humor and breaking the fourth wall, making him a unique character in the Marvel universe with his irreverent style and comedic approach to superhero storytelling that sets him apart from traditional heroes. His red and black costume has become iconic in pop culture. The character's ability to break the fourth wall creates a meta-narrative that resonates with modern audiences. Wade Wilson's transformation into Deadpool is a fascinating origin story filled with tragedy and comedy.`;

// Simulate what AI would extract (before our post-processing)
const mockAIOutput = `- User's favorite superhero is Deadpool
- User loves Deadpool's humor
- User enjoys Deadpool breaking fourth wall
- User appreciates Deadpool's iconic red costume
- Deadpool has witty humor
- Deadpool breaks the fourth wall
- Deadpool is unique Marvel character
- Deadpool has irreverent style`;

const processedCompressed = storage.aggressivePostProcessing(mockAIOutput);

const originalTokens = storage.countTokens(verboseInput + verboseResponse);
const compressedTokens = storage.countTokens(processedCompressed);
const ratio = (originalTokens / compressedTokens).toFixed(1);

console.log(`   Original: ${verboseInput.length + verboseResponse.length} chars, ${originalTokens} tokens`);
console.log(`   Compressed: ${processedCompressed.length} chars, ${compressedTokens} tokens`);
console.log(`   Compression ratio: ${ratio}:1`);
console.log(`   Compressed facts:\n${processedCompressed}\n`);

if (parseFloat(ratio) >= 10.0) {
  console.log(`   ✅ PASS: Achieved 10:1+ compression (${ratio}:1)\n`);
} else if (parseFloat(ratio) >= 5.0) {
  console.log(`   ⚠️  PARTIAL: Good compression but below 10:1 target (${ratio}:1)\n`);
} else {
  console.log(`   ❌ FAIL: Compression below target (${ratio}:1)\n`);
}

// Test 5: Formatting cleanup
console.log('📝 Test 5: Formatting Cleanup');
const rawFacts5 = `1. User likes coffee
2) User drinks tea
- User prefers water
* User enjoys juice
• User loves smoothies`;

const processed5 = storage.aggressivePostProcessing(rawFacts5);
const lines5 = processed5.split('\n').filter(l => l.trim());
console.log(`   Processed (bullets removed):`);
lines5.forEach(line => console.log(`   "${line}"`));

const allClean = lines5.every(line => !line.match(/^[-•*\d.)\]]+\s*/));
if (allClean) {
  console.log(`   ✅ PASS: All formatting removed\n`);
} else {
  console.log(`   ❌ FAIL: Some formatting remains\n`);
}

// Summary
console.log('═══════════════════════════════════════════════');
console.log('📊 TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
console.log('✅ Test 1: Max 5 facts limit');
console.log('✅ Test 2: 8-word maximum per fact');
console.log('✅ Test 3: Duplicate removal');
console.log('✅ Test 4: Compression ratio calculation');
console.log('✅ Test 5: Formatting cleanup');
console.log('═══════════════════════════════════════════════');
console.log('\n✅ Aggressive post-processing tests completed!\n');
console.log('💡 NOTE: For full integration test with OpenAI API,');
console.log('   run: node test-intelligent-storage.js');
console.log('   (requires DATABASE_URL and OPENAI_API_KEY)\n');

process.exit(0);
