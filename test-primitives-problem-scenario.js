#!/usr/bin/env node

/**
 * Test the EXACT scenario from the problem statement
 */

console.log("=".repeat(80));
console.log("Testing EXACT Problem Scenario");
console.log("=".repeat(80));
console.log("");

// Inline the primitive functions from ai-processors.js
function applyListCompletenessFallback(response, memoryContext, userQuery) {
  const primitiveLog = {
    primitive: "LIST_COMPLETENESS",
    fired: false,
    reason: "layer_one_produced_complete_list",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  // Gate 1: Check if memory context exists
  if (!memoryContext || memoryContext.length === 0) {
    console.log("  [GATE 1] FAILED: No memory context");
    return { response, primitiveLog };
  }
  console.log("  [GATE 1] PASSED: Memory context exists");

  // Gate 2: Check if user query requests a list
  const listRequestIndicators = /\b(who are my|list my|what are my|show me my|tell me my|all my|every|everyone I)\b/i;
  if (!listRequestIndicators.test(userQuery)) {
    console.log("  [GATE 2] FAILED: Query doesn't request a list");
    return { response, primitiveLog };
  }
  console.log("  [GATE 2] PASSED: Query requests a list");

  // Gate 3: Extract enumerable items from memory context
  const names = [];

  // Pattern 1: Name (descriptor) format
  const namedPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*\(/g;
  let match;
  while ((match = namedPattern.exec(memoryContext)) !== null) {
    names.push(match[1].trim());
  }

  // Pattern 2: Comma-separated list (if no parenthetical descriptors found)
  if (names.length === 0) {
    const commaListPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*(?:,|and)/g;
    while ((match = commaListPattern.exec(memoryContext)) !== null) {
      const name = match[1].trim();
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  console.log(`  [GATE 3] Extracted names from memory: ${JSON.stringify(names)}`);

  if (names.length < 2) {
    console.log("  [GATE 3] FAILED: Not enough items to constitute a list");
    return { response, primitiveLog };
  }
  console.log("  [GATE 3] PASSED: Found list items in memory");

  // Gate 4: Check if AI response is missing items
  const normalizeForComparison = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const normalizedResponse = normalizeForComparison(response);
  console.log(`  [GATE 4] Normalized response: "${normalizedResponse}"`);
  
  const missingItems = names.filter(name => {
    const normalized = normalizeForComparison(name);
    const isPresent = normalizedResponse.includes(normalized);
    console.log(`    - Checking "${name}" (normalized: "${normalized}"): ${isPresent ? "FOUND" : "MISSING"}`);
    return !isPresent;
  });

  console.log(`  [GATE 4] Missing items: ${JSON.stringify(missingItems)}`);

  if (missingItems.length === 0) {
    console.log("  [GATE 4] FAILED: All items present in response");
    return { response, primitiveLog };
  }
  console.log("  [GATE 4] PASSED: Items are missing from response");

  // All gates passed - primitive fires
  let modifiedResponse = response;

  if (names.length === missingItems.length) {
    modifiedResponse += `\n\nYour contacts are: ${names.join(', ')}.`;
  } else {
    modifiedResponse += `\n\nAlso, your contacts include: ${missingItems.join(', ')}.`;
  }

  primitiveLog.fired = true;
  primitiveLog.reason = "response_missing_items_from_injected_memory";
  primitiveLog.items_in_memory = names;
  primitiveLog.items_missing = missingItems;
  primitiveLog.layer_one_correct = false;

  return { response: modifiedResponse, primitiveLog };
}

// Test EXACT scenario from problem statement
console.log("Scenario: Memory has 'Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López'");
console.log("Query: 'Who are my contacts?'");
console.log("AI Response: Omits all three names");
console.log("");

const memoryContext = "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López";
const userQuery = "Who are my contacts?";
const aiResponse = "I don't see any contact information in your memories.";

console.log("Running primitive detection...");
console.log("");

const result = applyListCompletenessFallback(aiResponse, memoryContext, userQuery);

console.log("");
console.log("=".repeat(80));
console.log("RESULT:");
console.log("  Fired:", result.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Layer One Correct:", result.primitiveLog.layer_one_correct);
console.log("  Items in Memory:", result.primitiveLog.items_in_memory);
console.log("  Items Missing:", result.primitiveLog.items_missing);
console.log("");
console.log("Modified Response:");
console.log(result.response);
console.log("=".repeat(80));
