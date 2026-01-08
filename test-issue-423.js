// Test semantic routing with the exact query from the issue #423

const testQuery = "What are session token limits?";

console.log("=".repeat(80));
console.log("SEMANTIC ROUTING TEST - Issue #423");
console.log("=".repeat(80));
console.log("\nQuery:", testQuery);
console.log("\nExpected:");
console.log("  - Category: tools_tech_workflow");
console.log("  - Confidence: > 0.5");
console.log("\n" + "=".repeat(80));

// Import the intelligence system
import intelligence from './api/categories/memory/internal/intelligence.js';

// Initialize if needed
if (!intelligence.isInitialized) {
  await intelligence.initialize();
}

// Test the routing
const result = await intelligence.analyzeAndRoute(testQuery, "test-user-123");

console.log("\nActual Result:");
console.log("  - Category:", result.primaryCategory);
console.log("  - Subcategory:", result.subcategory);
console.log("  - Confidence:", result.confidence.toFixed(3));
console.log("  - Alternative:", result.alternativeCategory);
console.log("  - Reasoning:", result.reasoning);

console.log("\n" + "=".repeat(80));
console.log("TEST RESULT:");
if (result.primaryCategory === "tools_tech_workflow" && result.confidence > 0.5) {
  console.log("✅ PASS - Query correctly routes to tools_tech_workflow with confidence > 0.5");
  process.exit(0);
} else {
  console.log("❌ FAIL");
  if (result.primaryCategory !== "tools_tech_workflow") {
    console.log("  - Wrong category:", result.primaryCategory, "(expected: tools_tech_workflow)");
  }
  if (result.confidence <= 0.5) {
    console.log("  - Low confidence:", result.confidence.toFixed(3), "(expected: > 0.5)");
  }
  process.exit(1);
}
console.log("=".repeat(80));
