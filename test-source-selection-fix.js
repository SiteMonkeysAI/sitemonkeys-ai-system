/**
 * Simple unit test for Issue #406 source selection fix
 * Tests only the source selection logic without requiring full system
 */

// Direct import of just the functions we need to test
import { selectSourcesForQuery, hasNewsIntent } from './api/core/intelligence/externalLookupEngine.js';

console.log('='.repeat(80));
console.log('ISSUE #406: SOURCE SELECTION FIX VERIFICATION');
console.log('='.repeat(80));
console.log('');

const testCases = [
  {
    query: "What's the current Bitcoin price?",
    expectedSourceFound: true,
    expectedSourceName: "CoinGecko",
    description: "Crypto query should match CoinGecko API",
  },
  {
    query: "What are today's top news stories?",
    expectedSourceFound: true,
    expectedSourceName: "Google News RSS",
    description: "Generic news query should match Google News RSS",
  },
  {
    query: "What's the weather in New York?",
    expectedSourceFound: true,
    expectedSourceName: "Google News RSS",
    description: "Weather query should match news source (no weather API configured)",
  },
  {
    query: "What's the latest celebrity gossip?",
    expectedSourceFound: true,
    expectedSourceName: "Google News RSS",
    description: "Entertainment query should match Google News RSS",
  },
  {
    query: "What's the latest news about Keir Starmer?",
    expectedSourceFound: true,
    expectedSourceName: "Google News RSS",
    description: "Political news query should match Google News RSS",
  },
];

let passed = 0;
let failed = 0;

console.log('Test 1: News Intent Detection');
console.log('-'.repeat(80));

const newsIntentQueries = [
  { query: "What are today's top news stories?", expected: false }, // Generic query uses pattern matching, not news intent
  { query: "What's the weather in New York?", expected: true }, // Weather can be news context
  { query: "What's the latest celebrity gossip?", expected: true }, // Entertainment news
  { query: "What's the latest news about Keir Starmer?", expected: true }, // Has proper noun + news structure
];

for (const testCase of newsIntentQueries) {
  const result = hasNewsIntent(testCase.query);
  const match = result === testCase.expected;
  console.log(`  ${match ? '✓' : '✗'} "${testCase.query}": ${result ? 'YES' : 'NO'} (expected: ${testCase.expected ? 'YES' : 'NO'})`);
  if (match) passed++; else failed++;
}

console.log('');
console.log('Test 2: Source Selection');
console.log('-'.repeat(80));

for (const testCase of testCases) {
  console.log(`\n  Query: "${testCase.query}"`);
  console.log(`  Description: ${testCase.description}`);
  
  const sources = selectSourcesForQuery(testCase.query, 'VOLATILE', { isHighStakes: false });
  const hasSource = sources && sources.length > 0;
  const sourceNames = sources ? sources.map(s => s.name).join(', ') : 'None';
  
  const sourceMatch = hasSource === testCase.expectedSourceFound;
  const nameMatch = !testCase.expectedSourceName || sourceNames.includes(testCase.expectedSourceName);
  
  console.log(`  Sources Found: ${sourceNames}`);
  console.log(`  Result: ${sourceMatch && nameMatch ? '✓ PASS' : '✗ FAIL'}`);
  
  if (sourceMatch && nameMatch) {
    passed++;
  } else {
    failed++;
    if (!sourceMatch) {
      console.log(`    Expected source: ${testCase.expectedSourceFound ? 'YES' : 'NO'}, Got: ${hasSource ? 'YES' : 'NO'}`);
    }
    if (!nameMatch) {
      console.log(`    Expected name: ${testCase.expectedSourceName}, Got: ${sourceNames}`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(80));

process.exit(failed > 0 ? 1 : 0);
