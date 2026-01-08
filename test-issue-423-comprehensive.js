// Comprehensive test suite for semantic routing after Issue #423 fix

import intelligence from './api/categories/memory/internal/intelligence.js';

// Initialize if needed
if (!intelligence.isInitialized) {
  await intelligence.initialize();
}

const testCases = [
  {
    query: "What are session token limits?",
    expectedCategory: "tools_tech_workflow",
    minConfidence: 0.5,
    description: "Technical API query (Issue #423)"
  },
  {
    query: "How do I configure database authentication?",
    expectedCategory: "tools_tech_workflow",
    minConfidence: 0.5,
    description: "Technical configuration query"
  },
  {
    query: "I'm feeling stressed about work",
    expectedCategory: "mental_emotional",
    minConfidence: 0.5,
    description: "Emotional expression query"
  },
  {
    query: "What's my morning routine?",
    expectedCategory: "daily_routines_habits",
    minConfidence: 0.5,
    description: "Routine query"
  },
  {
    query: "Tell me about my family",
    expectedCategory: "relationships_social",
    minConfidence: 0.5,
    description: "Family/relationship query"
  },
  {
    query: "What are API endpoint parameters?",
    expectedCategory: "tools_tech_workflow",
    minConfidence: 0.5,
    description: "Another technical query"
  },
  {
    query: "My health symptoms",
    expectedCategory: "health_wellness",
    minConfidence: 0.5,
    description: "Health query"
  }
];

console.log("=".repeat(80));
console.log("COMPREHENSIVE SEMANTIC ROUTING TEST - Issue #423");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n${"-".repeat(80)}`);
  console.log(`Query: "${testCase.query}"`);
  console.log(`Expected: ${testCase.expectedCategory} (confidence > ${testCase.minConfidence})`);
  console.log(`Description: ${testCase.description}`);
  
  const result = await intelligence.analyzeAndRoute(testCase.query, "test-user-123");
  
  console.log(`Actual: ${result.primaryCategory} (confidence: ${result.confidence.toFixed(3)})`);
  
  const categoryMatch = result.primaryCategory === testCase.expectedCategory;
  const confidenceMatch = result.confidence >= testCase.minConfidence;
  
  if (categoryMatch && confidenceMatch) {
    console.log("✅ PASS");
    passed++;
  } else {
    console.log("❌ FAIL");
    if (!categoryMatch) {
      console.log(`  - Wrong category: got ${result.primaryCategory}, expected ${testCase.expectedCategory}`);
    }
    if (!confidenceMatch) {
      console.log(`  - Low confidence: got ${result.confidence.toFixed(3)}, expected >= ${testCase.minConfidence}`);
    }
    failed++;
  }
}

console.log("\n" + "=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log(`Total tests: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log("=".repeat(80));

process.exit(failed > 0 ? 1 : 0);
