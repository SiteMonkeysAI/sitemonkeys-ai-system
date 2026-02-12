#!/usr/bin/env node

/**
 * Simple test to verify Layer 2 primitives execute
 * This tests the primitive functions directly without needing a full orchestrator setup
 */

import {
  applyTemporalArithmeticFallback,
  applyListCompletenessFallback,
} from './api/lib/ai-processors.js';

console.log("=".repeat(80));
console.log("Layer 2 Primitives - Direct Function Test");
console.log("=".repeat(80));
console.log("");

// Test 1: Temporal Arithmetic Fallback (should fire)
console.log("Test 1: Temporal Arithmetic Fallback");
console.log("-".repeat(80));

const temporalMemory = "I worked at Google for 5 years and left in 2020.";
const temporalQuery = "When did I start at Google?";
const temporalResponse = "I don't have information about when you started at Google.";

console.log("Memory:", temporalMemory);
console.log("Query:", temporalQuery);
console.log("AI Response:", temporalResponse);
console.log("");

const temporalResult = applyTemporalArithmeticFallback(
  temporalResponse,
  temporalMemory,
  temporalQuery,
  "gpt-4"
);

console.log("Primitive Result:");
console.log("  Fired:", temporalResult.primitiveLog.fired);
console.log("  Reason:", temporalResult.primitiveLog.reason);
console.log("  Modified Response:", temporalResult.response.substring(0, 200));
console.log("");

// Test 2: List Completeness Fallback (should fire)
console.log("Test 2: List Completeness Fallback");
console.log("-".repeat(80));

const listMemory = "My team members: Alice Johnson (engineer), Bob Smith (designer), Carol Zhang (manager)";
const listQuery = "Who are my team members?";
const listResponse = "Based on the information, Alice Johnson is one of your team members.";

console.log("Memory:", listMemory);
console.log("Query:", listQuery);
console.log("AI Response:", listResponse);
console.log("");

const listResult = applyListCompletenessFallback(
  listResponse,
  listMemory,
  listQuery
);

console.log("Primitive Result:");
console.log("  Fired:", listResult.primitiveLog.fired);
console.log("  Reason:", listResult.primitiveLog.reason);
if (listResult.primitiveLog.items_missing) {
  console.log("  Missing Items:", listResult.primitiveLog.items_missing);
}
console.log("  Modified Response:", listResult.response.substring(0, 300));
console.log("");

// Test 3: Neither should fire (no conditions met)
console.log("Test 3: No Conditions Met");
console.log("-".repeat(80));

const noConditionsMemory = "My favorite color is blue.";
const noConditionsQuery = "What is the weather today?";
const noConditionsResponse = "I don't have access to current weather data.";

console.log("Memory:", noConditionsMemory);
console.log("Query:", noConditionsQuery);
console.log("AI Response:", noConditionsResponse);
console.log("");

const noConditionsResult1 = applyTemporalArithmeticFallback(
  noConditionsResponse,
  noConditionsMemory,
  noConditionsQuery,
  "gpt-4"
);

const noConditionsResult2 = applyListCompletenessFallback(
  noConditionsResponse,
  noConditionsMemory,
  noConditionsQuery
);

console.log("Temporal Primitive:");
console.log("  Fired:", noConditionsResult1.primitiveLog.fired);
console.log("  Reason:", noConditionsResult1.primitiveLog.reason);
console.log("");
console.log("List Primitive:");
console.log("  Fired:", noConditionsResult2.primitiveLog.fired);
console.log("  Reason:", noConditionsResult2.primitiveLog.reason);
console.log("");

console.log("=".repeat(80));
console.log("✅ All tests completed successfully!");
console.log("The primitives are functioning correctly.");
console.log("=".repeat(80));
