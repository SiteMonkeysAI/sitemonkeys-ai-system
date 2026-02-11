#!/usr/bin/env node

/**
 * TEST: Verify LAYER 2 Fallback Primitives Execute on Every Request
 * Issue #746: Lines 653-673 should execute and produce [PRIMITIVE-TEMPORAL] and [PRIMITIVE-COMPLETENESS] logs
 */

import { processWithEliAndRoxy } from './api/lib/ai-processors.js';

console.log("=".repeat(80));
console.log("TEST: LAYER 2 Fallback Primitives Execution Verification");
console.log("=".repeat(80));
console.log("");

// Mock OpenAI instance
const mockOpenAI = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{ message: { content: "Test response from AI" } }],
        usage: { total_tokens: 100 }
      })
    }
  }
};

// Mock drift tracker
const mockDriftTracker = {
  track: () => {},
  getStatus: () => ({ status: 'ok' })
};

// Test parameters
const testParams = {
  message: "What's 2 + 2?",
  mode: "truth",
  vaultVerification: { allowed: false },
  conversationHistory: [],
  userPreference: "roxy",
  claudeRequested: false,
  openai: mockOpenAI,
  driftTracker: mockDriftTracker,
  _overrideLog: [],
  memoryContext: null,
  sessionId: null
};

console.log("Test Parameters:");
console.log("  - Message:", testParams.message);
console.log("  - Mode:", testParams.mode);
console.log("  - Personality:", testParams.userPreference);
console.log("");
console.log("Expected Log Output:");
console.log("  ✅ Should see: 🔧 [LAYER-2] Applying temporal arithmetic fallback primitive...");
console.log("  ✅ Should see: [PRIMITIVE-TEMPORAL] {\"applied\":...}");
console.log("  ✅ Should see: 🔧 [LAYER-2] Applying list completeness fallback primitive...");
console.log("  ✅ Should see: [PRIMITIVE-COMPLETENESS] {\"applied\":...}");
console.log("");
console.log("Running test...");
console.log("-".repeat(80));

try {
  const result = await processWithEliAndRoxy(testParams);
  
  console.log("-".repeat(80));
  console.log("");
  console.log("✅ Test completed successfully!");
  console.log("");
  console.log("Response received:", result.response ? "YES" : "NO");
  console.log("AI Used:", result.ai_used || "UNKNOWN");
  console.log("Mode Active:", result.mode_active || "UNKNOWN");
  console.log("");
  console.log("VERIFICATION INSTRUCTIONS:");
  console.log("  1. Check the console output above for [PRIMITIVE-TEMPORAL] logs");
  console.log("  2. Check the console output above for [PRIMITIVE-COMPLETENESS] logs");
  console.log("  3. If both appear, the fix is successful ✅");
  console.log("  4. If neither appears, the bug still exists ❌");
  console.log("");
} catch (error) {
  console.log("-".repeat(80));
  console.log("");
  console.log("❌ Test failed with error:", error.message);
  console.log("");
  console.log("Stack trace:");
  console.log(error.stack);
  console.log("");
  process.exit(1);
}
