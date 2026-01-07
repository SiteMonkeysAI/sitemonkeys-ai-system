/**
 * Test script for Issue #406 fixes
 * Tests semantic routing, confidence calculation, and source selection
 */

import intelligenceSystem from './api/categories/memory/internal/intelligence.js';
import { selectSourcesForQuery, hasNewsIntent } from './api/core/intelligence/externalLookupEngine.js';

console.log('='.repeat(80));
console.log('ISSUE #406 FIX VERIFICATION TEST');
console.log('='.repeat(80));
console.log('');

// Test cases from the issue
const testQueries = [
  {
    query: "What's the current Bitcoin price?",
    expectedCategory: "money_spending_goals",  // Financial category
    expectedConfidence: 0.5,
    expectedSource: true,  // Should find CoinGecko source
  },
  {
    query: "What's Apple's stock price today?",
    expectedCategory: "money_spending_goals",  // Financial category  
    expectedConfidence: 0.5,
    expectedSource: false,  // Stock prices not configured (only crypto)
  },
  {
    query: "What's the weather in New York?",
    expectedCategory: "personal_life_interests",  // General category
    expectedConfidence: 0.5,
    expectedSource: true,  // Should find news source (weather API not configured)
  },
  {
    query: "What are today's top news stories?",
    expectedCategory: "personal_life_interests",  // General category
    expectedConfidence: 0.5,
    expectedSource: true,  // Should find Google News RSS
  },
  {
    query: "What's the latest celebrity gossip?",
    expectedCategory: "personal_life_interests",  // General category
    expectedConfidence: 0.5,
    expectedSource: true,  // Should find Google News RSS
  },
  {
    query: "How am I feeling about this?",
    expectedCategory: "mental_emotional",  // Emotional category
    expectedConfidence: 0.5,
  },
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const testCase of testQueries) {
    console.log(`\nTesting: "${testCase.query}"`);
    console.log('-'.repeat(80));

    try {
      // Test 1: Semantic Routing
      const routingResult = await intelligenceSystem.analyzeAndRoute(testCase.query, 'test-user');
      
      console.log(`  Category: ${routingResult.primaryCategory}`);
      console.log(`  Confidence: ${routingResult.confidence.toFixed(3)}`);
      console.log(`  Scores: Primary=${routingResult.scores?.primary?.toFixed(1) || 'N/A'}, Secondary=${routingResult.scores?.secondary?.toFixed(1) || 'N/A'}`);

      // Check category
      const categoryMatch = routingResult.primaryCategory === testCase.expectedCategory;
      console.log(`  ✓ Category: ${categoryMatch ? 'PASS' : 'FAIL'} (expected: ${testCase.expectedCategory})`);
      
      // Check confidence
      const confidenceOk = routingResult.confidence >= testCase.expectedConfidence;
      console.log(`  ✓ Confidence: ${confidenceOk ? 'PASS' : 'FAIL'} (>= ${testCase.expectedConfidence})`);

      // Test 2: Source Selection (if expected)
      if (testCase.expectedSource !== undefined) {
        const sources = selectSourcesForQuery(testCase.query, 'VOLATILE', { isHighStakes: false });
        const hasSource = sources && sources.length > 0;
        
        console.log(`  ✓ Source Selection: ${hasSource === testCase.expectedSource ? 'PASS' : 'FAIL'} (found ${sources?.length || 0} sources)`);
        if (hasSource) {
          console.log(`    Sources: ${sources.map(s => s.name).join(', ')}`);
        }

        if (hasSource === testCase.expectedSource && categoryMatch && confidenceOk) {
          passed++;
        } else {
          failed++;
        }
      } else {
        if (categoryMatch && confidenceOk) {
          passed++;
        } else {
          failed++;
        }
      }

    } catch (error) {
      console.log(`  ✗ ERROR: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  // Additional diagnostic tests
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSTIC TESTS');
  console.log('='.repeat(80));

  // Test news intent detection
  console.log('\nNews Intent Detection:');
  const newsQueries = [
    "What are today's top news stories?",
    "What's the latest celebrity gossip?", 
    "What's the weather in New York?",
  ];

  for (const query of newsQueries) {
    const intent = hasNewsIntent(query);
    console.log(`  "${query}": ${intent ? 'NEWS' : 'NOT NEWS'}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Initialize and run tests
await intelligenceSystem.initialize();
await runTests();
