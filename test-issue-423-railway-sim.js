// Simulate the exact Railway log scenario from Issue #423
// This test verifies the fix produces the expected log output

import intelligence from './api/categories/memory/internal/intelligence.js';

console.log("=".repeat(80));
console.log("RAILWAY LOG SIMULATION - Issue #423");
console.log("=".repeat(80));
console.log("\nThis test simulates the exact scenario from Railway logs:");
console.log('Query: "What are session token limits?"');
console.log("\nExpected Log:");
console.log("[INTELLIGENCE] SEMANTIC ROUTING: tools_tech_workflow/... | Confidence: > 0.500");
console.log("\nOriginal (Broken) Log:");
console.log("[INTELLIGENCE] SEMANTIC ROUTING: mental_emotional/General Emotional | Confidence: 0.200");
console.log("\n" + "=".repeat(80));

// Initialize
if (!intelligence.isInitialized) {
  await intelligence.initialize();
}

// Run the exact query from the issue
const query = "What are session token limits?";
console.log("\nRunning query...\n");

const result = await intelligence.analyzeAndRoute(query, "railway-test-user");

// The analyzeAndRoute function already logs the SEMANTIC ROUTING line
// Now verify the result programmatically
console.log("\n" + "=".repeat(80));
console.log("VERIFICATION:");
console.log("=".repeat(80));

const isCorrectCategory = result.primaryCategory === "tools_tech_workflow";
const hasHighConfidence = result.confidence > 0.5;

console.log(`\nCategory: ${result.primaryCategory}`);
console.log(`✓ Correct category: ${isCorrectCategory ? "YES ✅" : "NO ❌"}`);
console.log(`\nConfidence: ${result.confidence.toFixed(3)}`);
console.log(`✓ High confidence (> 0.5): ${hasHighConfidence ? "YES ✅" : "NO ❌"}`);

console.log("\n" + "=".repeat(80));
if (isCorrectCategory && hasHighConfidence) {
  console.log("🎉 SUCCESS - Issue #423 is FIXED!");
  console.log("\nThe semantic routing now correctly identifies technical queries");
  console.log("and routes them to tools_tech_workflow with high confidence.");
  console.log("=".repeat(80));
  process.exit(0);
} else {
  console.log("❌ FAILURE - Issue #423 is NOT fixed");
  console.log("=".repeat(80));
  process.exit(1);
}
