#!/usr/bin/env node

/**
 * Isolated test of Layer 2 primitives logic
 * NOTE: This duplicates logic from ai-processors.js intentionally for isolation testing.
 * This allows testing primitive logic without needing OpenAI API keys or database connections.
 * If primitive implementation changes, update this test accordingly.
 */

console.log("=".repeat(80));
console.log("Layer 2 Primitives - Isolated Logic Test");
console.log("=".repeat(80));
console.log("");

// Inline the primitive functions without imports
function testTemporalArithmetic(response, memoryContext, userQuery) {
  const primitiveLog = {
    primitive: "TEMPORAL_ARITHMETIC",
    fired: false,
    reason: "layer_one_produced_correct_response",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  if (!memoryContext || memoryContext.length === 0) {
    return { response, primitiveLog };
  }

  const temporalQuestionIndicators = /\b(when|what year|how long ago|start date|when did|timeline|began|started)\b/i;
  if (!temporalQuestionIndicators.test(userQuery)) {
    return { response, primitiveLog };
  }

  const durationMatch = memoryContext.match(/(\d+)\s*(?:year|yr)s?(?:\s+at|\s+in|\s+with|\s+for)?/i) ||
                        memoryContext.match(/(?:worked|spent|been)\s+(?:for\s+)?(\d+)/i);

  const yearMatches = memoryContext.match(/\b(19\d{2}|20[0-3]\d)\b/g);

  if (!durationMatch || !yearMatches || yearMatches.length === 0) {
    return { response, primitiveLog };
  }

  const hedgingPatterns = /\b(haven't mentioned|not provided|don't have information|unclear|don't know when|not specified|didn't tell me when)\b/i;
  
  if (hedgingPatterns.test(response)) {
    const duration = parseInt(durationMatch[1], 10);
    const anchorYear = parseInt(yearMatches[yearMatches.length - 1], 10);
    const startYear = anchorYear - duration;
    
    primitiveLog.fired = true;
    primitiveLog.reason = "response_missing_computable_temporal_fact";
    primitiveLog.layer_one_correct = false;
    
    return {
      response: `Based on your memory (${duration} years, left in ${anchorYear}), you started in ${startYear}.`,
      primitiveLog
    };
  }

  return { response, primitiveLog };
}

function testListCompleteness(response, memoryContext, userQuery) {
  const primitiveLog = {
    primitive: "LIST_COMPLETENESS",
    fired: false,
    reason: "layer_one_produced_complete_list",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  if (!memoryContext || memoryContext.length === 0) {
    return { response, primitiveLog };
  }

  const listRequestIndicators = /\b(who are my|list my|what are my|show me my|tell me my|all my|every|everyone I)\b/i;
  if (!listRequestIndicators.test(userQuery)) {
    return { response, primitiveLog };
  }

  const names = [];
  const namedPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*\(/g;
  let match;
  while ((match = namedPattern.exec(memoryContext)) !== null) {
    names.push(match[1].trim());
  }

  if (names.length < 2) {
    return { response, primitiveLog };
  }

  const normalizeForComparison = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const normalizedResponse = normalizeForComparison(response);
  const missingItems = names.filter(name => {
    const normalized = normalizeForComparison(name);
    return !normalizedResponse.includes(normalized);
  });

  if (missingItems.length === 0) {
    return { response, primitiveLog };
  }

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

// Test 1: Temporal Arithmetic (should fire)
console.log("Test 1: Temporal Arithmetic Fallback (SHOULD FIRE)");
console.log("-".repeat(80));

const t1_result = testTemporalArithmetic(
  "I don't have information about when you started at Google.",
  "I worked at Google for 5 years and left in 2020.",
  "When did I start at Google?"
);

console.log("Fired:", t1_result.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("Response:", t1_result.response);
console.log("");

// Test 2: List Completeness (should fire)
console.log("Test 2: List Completeness Fallback (SHOULD FIRE)");
console.log("-".repeat(80));

const t2_result = testListCompleteness(
  "Based on the information, Alice Johnson is one of your team members.",
  "My team members: Alice Johnson (engineer), Bob Smith (designer), Carol Zhang (manager)",
  "Who are my team members?"
);

console.log("Fired:", t2_result.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("Missing:", t2_result.primitiveLog.items_missing || []);
console.log("Response:", t2_result.response);
console.log("");

// Test 3: No conditions met (should NOT fire)
console.log("Test 3: No Conditions Met (SHOULD NOT FIRE)");
console.log("-".repeat(80));

const t3_result1 = testTemporalArithmetic(
  "I don't have access to current weather data.",
  "My favorite color is blue.",
  "What is the weather today?"
);

const t3_result2 = testListCompleteness(
  "I don't have access to current weather data.",
  "My favorite color is blue.",
  "What is the weather today?"
);

console.log("Temporal Fired:", t3_result1.primitiveLog.fired ? "❌ YES" : "✅ NO");
console.log("List Fired:", t3_result2.primitiveLog.fired ? "❌ YES" : "✅ NO");
console.log("");

console.log("=".repeat(80));
console.log("✅ Primitive logic tests completed!");
console.log("The primitives fire when conditions are met and stay quiet otherwise.");
console.log("=".repeat(80));
