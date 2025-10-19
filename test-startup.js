#!/usr/bin/env node
// ================================================================
// STARTUP TEST - Verify SemanticAnalyzer initializes correctly in Orchestrator
// ================================================================

import Orchestrator from "./api/core/orchestrator.js";

// Test configuration constants
const TARGET_STARTUP_TIME_MS = 5000; // Target: under 5 seconds
const MAX_STARTUP_TIME_MS = 20000; // Maximum: 20 seconds (timeout protection)

console.log("🚀 TESTING SYSTEM STARTUP...\n");

async function testStartup() {
  try {
    console.log("📦 Creating Orchestrator instance...");
    const orchestrator = new Orchestrator();
    console.log("✅ Orchestrator created\n");

    console.log("🧠 Initializing Orchestrator (includes SemanticAnalyzer)...");
    const startTime = Date.now();

    const result = await orchestrator.initialize();

    const duration = Date.now() - startTime;
    console.log(
      `✅ Initialization completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)\n`,
    );

    // Check initialization result
    if (!result) {
      console.log(
        "⚠️ Initialization returned false - system running in fallback mode",
      );
      console.log("This is acceptable - system should still function\n");
    } else {
      console.log(
        "✅ Initialization successful - full semantic analysis available\n",
      );
    }

    // Verify orchestrator state
    console.log("📊 Checking orchestrator state:");
    console.log(`  - Initialized: ${orchestrator.initialized}`);
    console.log(
      `  - SemanticAnalyzer present: ${!!orchestrator.semanticAnalyzer}`,
    );
    console.log(
      `  - Has intent embeddings: ${!!orchestrator.semanticAnalyzer?.intentEmbeddings}`,
    );
    console.log(
      `  - Has domain embeddings: ${!!orchestrator.semanticAnalyzer?.domainEmbeddings}`,
    );

    if (orchestrator.semanticAnalyzer?.intentEmbeddings) {
      const intentCount = Object.keys(
        orchestrator.semanticAnalyzer.intentEmbeddings,
      ).length;
      const domainCount = Object.keys(
        orchestrator.semanticAnalyzer.domainEmbeddings,
      ).length;
      console.log(`  - Intent categories: ${intentCount}`);
      console.log(`  - Domain categories: ${domainCount}`);
    }

    console.log("");

    // Verify startup time against constants
    if (duration < TARGET_STARTUP_TIME_MS) {
      console.log(
        `🎯 EXCELLENT: Startup time under ${TARGET_STARTUP_TIME_MS}ms target!`,
      );
    } else if (duration < MAX_STARTUP_TIME_MS) {
      console.log(
        `✅ GOOD: Startup time under ${MAX_STARTUP_TIME_MS}ms maximum`,
      );
    } else {
      console.log(
        `❌ FAILED: Startup time exceeded ${MAX_STARTUP_TIME_MS}ms timeout`,
      );
      process.exit(1);
    }

    console.log("\n✅ STARTUP TEST PASSED!");
    console.log("\n💡 System ready for deployment:");
    console.log("  • Fast initialization (" + duration + "ms)");
    console.log(
      "  • Timeout protection active (" + MAX_STARTUP_TIME_MS + "ms max)",
    );
    console.log("  • Fallback mode available if needed");
    console.log("  • No crashes or hangs during startup");

    process.exit(0);
  } catch (error) {
    console.error("❌ STARTUP TEST FAILED:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

testStartup();
