#!/usr/bin/env node

/**
 * Test the fixed primitives with problem scenarios
 */

import { applyTemporalArithmeticFallback, applyListCompletenessFallback } from './api/lib/ai-processors.js';

console.log("=".repeat(80));
console.log("Testing FIXED Layer 2 Primitives");
console.log("=".repeat(80));
console.log("");

// Test 1: List Completeness - Exact problem scenario
console.log("Test 1: List Completeness - Comma-separated names with special chars");
console.log("-".repeat(80));
console.log("Memory: 'Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López'");
console.log("Query: 'Who are my contacts?'");
console.log("Response: 'I don't see any contact information'");
console.log("");

const result1 = applyListCompletenessFallback(
  "I don't see any contact information in your memories.",
  "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López",
  "Who are my contacts?"
);

console.log("Result:");
console.log("  Fired:", result1.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Layer One Correct:", result1.primitiveLog.layer_one_correct);
console.log("  Items in Memory:", result1.primitiveLog.items_in_memory);
console.log("  Items Missing:", result1.primitiveLog.items_missing);
console.log("");
console.log("Modified Response:", result1.response);
console.log("");

// Test 2: Temporal Arithmetic - Missing year (hedging)
console.log("\n" + "=".repeat(80));
console.log("Test 2: Temporal Arithmetic - Hedging response");
console.log("-".repeat(80));
console.log("Memory: 'worked at Google for 5 years, left in 2020'");
console.log("Query: 'When did I start at Google?'");
console.log("Response: 'I don't know when you started'");
console.log("");

const result2 = applyTemporalArithmeticFallback(
  "I don't know when you started at Google.",
  "worked at Google for 5 years, left in 2020",
  "When did I start at Google?",
  "Eli"
);

console.log("Result:");
console.log("  Fired:", result2.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Layer One Correct:", result2.primitiveLog.layer_one_correct);
console.log("  Computed Year:", result2.primitiveLog.computed_year);
console.log("");
console.log("Modified Response:", result2.response);
console.log("");

// Test 3: Temporal Arithmetic - Missing year (no hedging)
console.log("\n" + "=".repeat(80));
console.log("Test 3: Temporal Arithmetic - Non-hedging but missing year");
console.log("-".repeat(80));
console.log("Memory: 'worked at Microsoft for 3 years, left in 2019'");
console.log("Query: 'When did I start at Microsoft?'");
console.log("Response: 'I need more information'");
console.log("");

const result3 = applyTemporalArithmeticFallback(
  "I need more information about your start date.",
  "worked at Microsoft for 3 years, left in 2019",
  "When did I start at Microsoft?",
  "Eli"
);

console.log("Result:");
console.log("  Fired:", result3.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Layer One Correct:", result3.primitiveLog.layer_one_correct);
console.log("  Computed Year:", result3.primitiveLog.computed_year);
console.log("");
console.log("Modified Response:", result3.response);
console.log("");

// Test 4: Temporal Arithmetic - Correct year present (should NOT fire)
console.log("\n" + "=".repeat(80));
console.log("Test 4: Temporal Arithmetic - Correct year in response (SHOULD NOT FIRE)");
console.log("-".repeat(80));
console.log("Memory: 'worked at Apple for 4 years, left in 2021'");
console.log("Query: 'When did I start at Apple?'");
console.log("Response: 'You started at Apple in 2017'");
console.log("");

const result4 = applyTemporalArithmeticFallback(
  "You started at Apple in 2017 based on working 4 years.",
  "worked at Apple for 4 years, left in 2021",
  "When did I start at Apple?",
  "Eli"
);

console.log("Result:");
console.log("  Fired:", result4.primitiveLog.fired ? "❌ YES (BUG)" : "✅ NO (CORRECT)");
console.log("  Layer One Correct:", result4.primitiveLog.layer_one_correct);
console.log("");

console.log("=".repeat(80));
console.log("✅ ALL TESTS COMPLETED");
console.log("=".repeat(80));
