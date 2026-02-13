#!/usr/bin/env node

/**
 * Final test of COMPLETE fixes for both primitives
 */

// FIXED list completeness function
function applyListCompletenessFallback(response, memoryContext, userQuery) {
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

  // FIXED: Better pattern that handles O'Shaughnessy correctly
  if (names.length === 0) {
    const parts = memoryContext.split(/[,;]|(?:\s+and\s+)/).map(s => s.trim());
    const properNamePattern = /^([A-ZÀ-ÿ](?:[a-zà-ÿ']|[A-ZÀ-ÿ])*(?:[-\s][A-ZÀ-ÿ](?:[a-zà-ÿ']|[A-ZÀ-ÿ])*)*)$/;
    
    for (const part of parts) {
      const trimmed = part.trim();
      const nameMatch = trimmed.match(properNamePattern);
      if (nameMatch && !names.includes(nameMatch[1])) {
        names.push(nameMatch[1]);
      }
    }
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

// FIXED temporal arithmetic function
function applyTemporalArithmeticFallback(response, memoryContext, userQuery, personalityId) {
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

  const duration = parseInt(durationMatch[1]);
  const anchorYear = parseInt(yearMatches[yearMatches.length - 1]);

  // FIXED: Check if response contains the computed year FIRST
  const computedYear = anchorYear - duration;
  
  const yearPattern = /\b(19\d{2}|20[0-3]\d)\b/g;
  const yearsInResponse = response.match(yearPattern) || [];
  const hasComputedYear = yearsInResponse.some(y => parseInt(y) === computedYear);

  if (hasComputedYear) {
    return { response, primitiveLog };
  }
  
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
    /haven't told me when/i,
    /need more information/i,
    /would need to/i
  ];

  const hasHedging = hedgingPhrases.some(pattern => pattern.test(response));

  let computedStatement = "";
  if (personalityId === "Eli") {
    computedStatement = `Based on working ${duration} years and leaving in ${anchorYear}, you likely started around ${computedYear}.`;
  } else if (personalityId === "Roxy") {
    computedStatement = `From what you've shared — ${duration} years and leaving in ${anchorYear} — that means you started around ${computedYear}.`;
  } else {
    computedStatement = `Given the ${duration}-year duration and the ${anchorYear} end date, the calculated start year would be approximately ${computedYear}.`;
  }

  let modifiedResponse = response;

  if (hasHedging) {
    for (const pattern of hedgingPhrases) {
      if (pattern.test(response)) {
        const sentences = response.split(/\.\s+/);
        const hedgingSentenceIndex = sentences.findIndex(s => pattern.test(s));

        if (hedgingSentenceIndex !== -1) {
          sentences[hedgingSentenceIndex] = computedStatement;
          modifiedResponse = sentences.join('. ');
        } else {
          modifiedResponse = response.replace(/\n*$/, '') + '\n\n' + computedStatement;
        }
        break;
      }
    }
  } else {
    modifiedResponse = response.replace(/\n*$/, '') + '\n\n' + computedStatement;
  }

  primitiveLog.fired = true;
  primitiveLog.reason = "response_missing_computable_temporal_fact";
  primitiveLog.duration_found = `${duration} years`;
  primitiveLog.anchor_year_found = anchorYear;
  primitiveLog.computed_year = computedYear;
  primitiveLog.hedging_detected = hasHedging;
  primitiveLog.layer_one_correct = false;

  return { response: modifiedResponse, primitiveLog };
}

// Run comprehensive tests
console.log("=".repeat(80));
console.log("COMPLETE FIX VERIFICATION");
console.log("=".repeat(80));
console.log("");

console.log("✅ Test 1: List Completeness - All three names with special characters");
console.log("-".repeat(80));
const result1 = applyListCompletenessFallback(
  "I don't see any contact information in your memories.",
  "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López",
  "Who are my contacts?"
);
console.log("  Fired:", result1.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Items Found:", result1.primitiveLog.items_in_memory);
console.log("  Expected: All 3 names");
console.log("  Result:", result1.primitiveLog.items_in_memory?.length === 3 ? "✅ CORRECT" : "❌ WRONG");
console.log("");

console.log("✅ Test 2: Temporal Arithmetic - Hedging response");
console.log("-".repeat(80));
const result2 = applyTemporalArithmeticFallback(
  "I don't know when you started at Google.",
  "worked at Google for 5 years, left in 2020",
  "When did I start at Google?",
  "Eli"
);
console.log("  Fired:", result2.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Computed Year:", result2.primitiveLog.computed_year);
console.log("  Expected: 2015");
console.log("  Result:", result2.primitiveLog.computed_year === 2015 ? "✅ CORRECT" : "❌ WRONG");
console.log("");

console.log("✅ Test 3: Temporal Arithmetic - No hedging but missing year");
console.log("-".repeat(80));
const result3 = applyTemporalArithmeticFallback(
  "I need more information about your start date.",
  "worked at Microsoft for 3 years, left in 2019",
  "When did I start at Microsoft?",
  "Eli"
);
console.log("  Fired:", result3.primitiveLog.fired ? "✅ YES" : "❌ NO");
console.log("  Computed Year:", result3.primitiveLog.computed_year);
console.log("  Expected: 2016");
console.log("  Result:", result3.primitiveLog.computed_year === 2016 ? "✅ CORRECT" : "❌ WRONG");
console.log("");

console.log("✅ Test 4: Temporal Arithmetic - Correct year present (should NOT fire)");
console.log("-".repeat(80));
const result4 = applyTemporalArithmeticFallback(
  "You started at Apple in 2017 based on working 4 years.",
  "worked at Apple for 4 years, left in 2021",
  "When did I start at Apple?",
  "Eli"
);
console.log("  Fired:", result4.primitiveLog.fired ? "❌ YES (BUG)" : "✅ NO (CORRECT)");
console.log("");

console.log("=".repeat(80));
const allPass = 
  result1.primitiveLog.fired && result1.primitiveLog.items_in_memory?.length === 3 &&
  result2.primitiveLog.fired && result2.primitiveLog.computed_year === 2015 &&
  result3.primitiveLog.fired && result3.primitiveLog.computed_year === 2016 &&
  !result4.primitiveLog.fired;

if (allPass) {
  console.log("🎉 ALL TESTS PASSED - Fixes are complete!");
} else {
  console.log("❌ SOME TESTS FAILED - Review needed");
}
console.log("=".repeat(80));
