// Test semantic routing with proper initialization
// This test verifies that the SemanticAnalyzer is being used for routing

import { Orchestrator } from './api/core/orchestrator.js';
import { intelligenceSystem } from './api/categories/memory/index.js';

console.log("=".repeat(80));
console.log("SEMANTIC ROUTING TEST - Issue #423 (With Proper Initialization)");
console.log("=".repeat(80));

// Initialize orchestrator which contains the semantic analyzer
const orchestrator = new Orchestrator();
console.log("\nInitializing orchestrator with SemanticAnalyzer...");

try {
  await orchestrator.initialize();
  console.log("✅ Orchestrator initialized");
  
  // Expose globally so intelligence system can access it
  global.orchestrator = orchestrator;
  console.log("✅ Orchestrator exposed as global.orchestrator");
  
  // Initialize intelligence system
  await intelligenceSystem.initialize();
  console.log("✅ Intelligence system initialized");

  console.log("\n" + "=".repeat(80));
  console.log("TEST: Semantic routing for technical query");
  console.log("=".repeat(80));

  const testQuery = "What are session token limits?";
  console.log(`\nQuery: "${testQuery}"`);
  console.log("\nExpected:");
  console.log("  - Domain: technical (from SemanticAnalyzer)");
  console.log("  - Category: tools_tech_workflow");
  console.log("  - Confidence: > 0.7 (from semantic similarity)");

  console.log("\n" + "-".repeat(80));
  console.log("Running routing...\n");

  const result = await intelligenceSystem.analyzeAndRoute(testQuery, "test-user-123");

  console.log("\n" + "-".repeat(80));
  console.log("RESULT:");
  console.log("-".repeat(80));
  console.log(`Category: ${result.primaryCategory}`);
  console.log(`Subcategory: ${result.subcategory}`);
  console.log(`Confidence: ${result.confidence.toFixed(3)}`);
  console.log(`Reasoning: ${result.reasoning}`);
  if (result.semanticDomain) {
    console.log(`Semantic Domain: ${result.semanticDomain}`);
    console.log(`Semantic Intent: ${result.semanticIntent}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("VERIFICATION:");
  console.log("=".repeat(80));

  const correctCategory = result.primaryCategory === "tools_tech_workflow";
  const highConfidence = result.confidence > 0.7;
  const usedSemanticAnalyzer = result.semanticOverride === true;

  console.log(`✓ Category: tools_tech_workflow? ${correctCategory ? "YES ✅" : "NO ❌"}`);
  console.log(`✓ Confidence > 0.7? ${highConfidence ? "YES ✅" : "NO ❌"}`);
  console.log(`✓ Used SemanticAnalyzer? ${usedSemanticAnalyzer ? "YES ✅" : "NO ❌"}`);

  if (correctCategory && highConfidence && usedSemanticAnalyzer) {
    console.log("\n🎉 SUCCESS - Semantic routing is working correctly!");
    console.log("The system is using embedding-based classification, not keyword matching.");
    process.exit(0);
  } else {
    console.log("\n❌ FAILURE - Issues detected:");
    if (!correctCategory) console.log("  - Wrong category");
    if (!highConfidence) console.log("  - Low confidence (< 0.7)");
    if (!usedSemanticAnalyzer) console.log("  - Not using SemanticAnalyzer");
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Error during test:", error);
  console.error(error.stack);
  process.exit(1);
}
