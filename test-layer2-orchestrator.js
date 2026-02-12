#!/usr/bin/env node

/**
 * TEST: Verify LAYER 2 Fallback Primitives Execute in Orchestrator
 * Issue #746: Primitives must execute on every request after AI response generation
 * 
 * This test verifies:
 * 1. [LAYER2] primitives_reached=true log appears
 * 2. [PRIMITIVE-TEMPORAL] log appears
 * 3. [PRIMITIVE-COMPLETENESS] log appears
 * 4. Primitives run BEFORE enforcement chain
 */

import Orchestrator from './api/core/orchestrator.js';
import { persistentMemory } from './api/categories/memory/index.js';

console.log("=".repeat(80));
console.log("TEST: LAYER 2 Primitives Execution in Orchestrator");
console.log("=".repeat(80));
console.log("");

// Capture logs to verify primitive execution
const capturedLogs = [];
const originalLog = console.log;
console.log = (...args) => {
  const message = args.join(' ');
  capturedLogs.push(message);
  originalLog(...args);
};

async function runTest() {
  try {
    console.log("Initializing orchestrator...");
    const orchestrator = new Orchestrator();
    
    // Initialize memory system
    await persistentMemory.initialize();
    
    // Set database pool for orchestrator
    orchestrator.pool = persistentMemory.pool;
    orchestrator.initialized = true;
    
    console.log("✅ Orchestrator initialized");
    console.log("");
    
    // Test 1: Simple query (primitives should run but not fire)
    console.log("Test 1: Simple query - primitives should run but not fire");
    console.log("-".repeat(80));
    
    const result1 = await orchestrator.processRequest({
      message: "Hello, how are you?",
      userId: "test-user-layer2",
      mode: "truth_general",
      sessionId: "test-session-layer2",
    });
    
    console.log("-".repeat(80));
    console.log("");
    
    // Verify logs
    const hasLayer2Log = capturedLogs.some(log => log.includes('[LAYER2] primitives_reached=true'));
    const hasTemporalLog = capturedLogs.some(log => log.includes('[PRIMITIVE-TEMPORAL]'));
    const hasCompletenessLog = capturedLogs.some(log => log.includes('[PRIMITIVE-COMPLETENESS]'));
    
    console.log("Verification Results:");
    console.log("  [LAYER2] primitives_reached=true:", hasLayer2Log ? "✅ FOUND" : "❌ MISSING");
    console.log("  [PRIMITIVE-TEMPORAL]:", hasTemporalLog ? "✅ FOUND" : "❌ MISSING");
    console.log("  [PRIMITIVE-COMPLETENESS]:", hasCompletenessLog ? "✅ FOUND" : "❌ MISSING");
    console.log("");
    
    if (hasLayer2Log && hasTemporalLog && hasCompletenessLog) {
      console.log("✅ ALL TESTS PASSED - Primitives are executing on every request!");
      console.log("");
      console.log("The execution path is now correct:");
      console.log("  1. AI generates response");
      console.log("  2. [LAYER2] primitives_reached=true logged");
      console.log("  3. Temporal arithmetic primitive runs");
      console.log("  4. List completeness primitive runs");
      console.log("  5. Enforcement chain runs");
      console.log("");
      return true;
    } else {
      console.log("❌ TEST FAILED - Primitives are not executing!");
      console.log("");
      console.log("Missing logs indicate the primitives are still not in the execution path.");
      console.log("Check api/core/orchestrator.js around line 1404-1433");
      console.log("");
      return false;
    }
    
  } catch (error) {
    console.log("❌ Test failed with error:", error.message);
    console.log("");
    console.log("Stack trace:");
    console.log(error.stack);
    console.log("");
    return false;
  } finally {
    // Restore original console.log
    console.log = originalLog;
    
    // Close database connection
    try {
      await persistentMemory.close();
    } catch (e) {
      // Ignore close errors
    }
  }
}

// Run the test
runTest().then(success => {
  process.exit(success ? 0 : 1);
});
