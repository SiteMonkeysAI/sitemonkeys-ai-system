#!/usr/bin/env node

/**
 * Test temporal arithmetic with the scenario from problem statement
 */

console.log("=".repeat(80));
console.log("Testing Temporal Arithmetic Detection");
console.log("=".repeat(80));

function applyTemporalArithmeticFallback(response, memoryContext, userQuery, personalityId) {
  const primitiveLog = {
    primitive: "TEMPORAL_ARITHMETIC",
    fired: false,
    reason: "layer_one_produced_correct_response",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  console.log("\n[GATE 1] Checking memory context...");
  if (!memoryContext || memoryContext.length === 0) {
    console.log("  FAILED: No memory context");
    return { response, primitiveLog };
  }
  console.log("  PASSED: Memory context exists");

  console.log("\n[GATE 2] Checking if query is temporal...");
  const temporalQuestionIndicators = /\b(when|what year|how long ago|start date|when did|timeline|began|started)\b/i;
  if (!temporalQuestionIndicators.test(userQuery)) {
    console.log("  FAILED: Query is not temporal");
    return { response, primitiveLog };
  }
  console.log("  PASSED: Query is temporal");

  console.log("\n[GATE 3] Extracting duration and year from memory...");
  const durationMatch = memoryContext.match(/(\d+)\s*(?:year|yr)s?(?:\s+at|\s+in|\s+with|\s+for)?/i) ||
                        memoryContext.match(/(?:worked|spent|been)\s+(?:for\s+)?(\d+)/i);

  const yearMatches = memoryContext.match(/\b(19\d{2}|20[0-3]\d)\b/g);

  console.log("  Duration match:", durationMatch ? durationMatch[1] : "NONE");
  console.log("  Year matches:", yearMatches);

  if (!durationMatch || !yearMatches || yearMatches.length === 0) {
    console.log("  FAILED: Could not extract duration and/or year");
    return { response, primitiveLog };
  }

  const duration = parseInt(durationMatch[1]);
  const anchorYear = parseInt(yearMatches[yearMatches.length - 1]);
  console.log(`  PASSED: Found duration=${duration}, anchorYear=${anchorYear}`);

  console.log("\n[GATE 4] Checking if response has hedging...");
  const hedgingPhrases = [
    /haven't mentioned/i,
    /not provided/i,
    /unclear/i,
    /don't have specific/i,
    /not sure exactly/i,
    /would need to know/i,
    /can't determine/i,
    /cannot determine/i,
    /don't know when/i,
    /haven't told me when/i
  ];

  const hasHedging = hedgingPhrases.some(pattern => pattern.test(response));
  console.log("  Hedging detected:", hasHedging);

  const hasComputedYear = /\b(19\d{2}|20[0-3]\d)\b/.test(response) &&
                          response.match(/\b(19\d{2}|20[0-3]\d)\b/g).some(y => parseInt(y) === anchorYear - duration);
  console.log("  Has computed year in response:", hasComputedYear);

  // THIS IS THE KEY LOGIC - Line 1274 in ai-processors.js
  console.log("\n[GATE 4 DECISION]");
  console.log("  Condition: if (!hasHedging || hasComputedYear)");
  console.log("  Evaluates to: if (!" + hasHedging + " || " + hasComputedYear + ")");
  console.log("  = if (" + !hasHedging + " || " + hasComputedYear + ")");
  console.log("  = if (" + (!hasHedging || hasComputedYear) + ")");
  
  if (!hasHedging || hasComputedYear) {
    console.log("  RESULT: Returning early - Layer 1 considered correct");
    console.log("  ❌ PRIMITIVE DOES NOT FIRE");
    return { response, primitiveLog };
  }

  console.log("  RESULT: All conditions met");
  console.log("  ✅ PRIMITIVE FIRES");

  const computedYear = anchorYear - duration;
  primitiveLog.fired = true;
  primitiveLog.reason = "hedge_despite_computable_temporal_facts";
  primitiveLog.duration_found = `${duration} years`;
  primitiveLog.anchor_year_found = anchorYear;
  primitiveLog.computed_year = computedYear;
  primitiveLog.layer_one_correct = false;

  return { 
    response: `Based on working ${duration} years and leaving in ${anchorYear}, you likely started around ${computedYear}.`,
    primitiveLog 
  };
}

// Test Scenario 1: AI response fails to compute year (SHOULD FIRE)
console.log("\n" + "=".repeat(80));
console.log("Scenario 1: AI hedges despite having computable facts");
console.log("Memory: 'worked at Google for 5 years, left in 2020'");
console.log("Query: 'When did I start at Google?'");
console.log("AI Response: 'I don't know when you started'");
console.log("=".repeat(80));

const result1 = applyTemporalArithmeticFallback(
  "I don't know when you started at Google.",
  "worked at Google for 5 years, left in 2020",
  "When did I start at Google?",
  "Eli"
);

console.log("\n\n🎯 FINAL RESULT:");
console.log("  Fired:", result1.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Reason:", result1.primitiveLog.reason);

// Test Scenario 2: AI provides NO year at all (SHOULD FIRE)
console.log("\n\n" + "=".repeat(80));
console.log("Scenario 2: AI response has no year at all");
console.log("Memory: 'worked at Microsoft for 3 years, left in 2019'");
console.log("Query: 'When did I start at Microsoft?'");
console.log("AI Response: 'I need more information'");
console.log("=".repeat(80));

const result2 = applyTemporalArithmeticFallback(
  "I need more information about when you started.",
  "worked at Microsoft for 3 years, left in 2019",
  "When did I start at Microsoft?",
  "Eli"
);

console.log("\n\n🎯 FINAL RESULT:");
console.log("  Fired:", result2.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Reason:", result2.primitiveLog.reason);

// Test Scenario 3: AI computes correctly (SHOULD NOT FIRE)
console.log("\n\n" + "=".repeat(80));
console.log("Scenario 3: AI correctly computes the year");
console.log("Memory: 'worked at Apple for 4 years, left in 2021'");
console.log("Query: 'When did I start at Apple?'");
console.log("AI Response: 'You started at Apple in 2017'");
console.log("=".repeat(80));

const result3 = applyTemporalArithmeticFallback(
  "You started at Apple in 2017 (2021 - 4 years).",
  "worked at Apple for 4 years, left in 2021",
  "When did I start at Apple?",
  "Eli"
);

console.log("\n\n🎯 FINAL RESULT:");
console.log("  Fired:", result3.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Reason:", result3.primitiveLog.reason);

console.log("\n" + "=".repeat(80));
