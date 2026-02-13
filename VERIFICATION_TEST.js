#!/usr/bin/env node

/**
 * Verification test for Layer 2 primitive fixes
 * Run this to verify the fixes work correctly
 * Usage: node VERIFICATION_TEST.js
 */

console.log("=".repeat(80));
console.log("LAYER 2 PRIMITIVES - VERIFICATION TEST");
console.log("=".repeat(80));
console.log("");

// Standalone copies of the fixed functions for testing without dependencies
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

  let computedStatement = `Based on working ${duration} years and leaving in ${anchorYear}, you likely started around ${computedYear}.`;
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

// Test scenarios
const tests = [
  {
    name: "Problem Scenario: List Completeness with Special Characters",
    fn: () => applyListCompletenessFallback(
      "I don't see any contact information.",
      "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López",
      "Who are my contacts?"
    ),
    expect: {
      fired: true,
      itemsCount: 3,
      allNamesExtracted: ["Xiaoying Zhang-Müller", "Björn O'Shaughnessy", "José García-López"]
    }
  },
  {
    name: "Temporal Arithmetic: Hedging Response",
    fn: () => applyTemporalArithmeticFallback(
      "I don't know when you started.",
      "worked 5 years, left in 2020",
      "When did I start?",
      "Eli"
    ),
    expect: {
      fired: true,
      computedYear: 2015
    }
  },
  {
    name: "Temporal Arithmetic: No Hedging, Missing Year",
    fn: () => applyTemporalArithmeticFallback(
      "I need more information.",
      "worked 3 years, left in 2019",
      "When did I start?",
      "Eli"
    ),
    expect: {
      fired: true,
      computedYear: 2016
    }
  },
  {
    name: "Temporal Arithmetic: Correct Year Present (Should NOT Fire)",
    fn: () => applyTemporalArithmeticFallback(
      "You started in 2017.",
      "worked 4 years, left in 2021",
      "When did I start?",
      "Eli"
    ),
    expect: {
      fired: false
    }
  }
];

// Run tests
let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log("-".repeat(80));
  
  const result = test.fn();
  let testPassed = true;
  const failures = [];
  
  // Check fired status
  if (result.primitiveLog.fired !== test.expect.fired) {
    testPassed = false;
    failures.push(`Expected fired=${test.expect.fired}, got ${result.primitiveLog.fired}`);
  }
  
  // Check computed year for temporal tests
  if (test.expect.computedYear !== undefined) {
    if (result.primitiveLog.computed_year !== test.expect.computedYear) {
      testPassed = false;
      failures.push(`Expected year=${test.expect.computedYear}, got ${result.primitiveLog.computed_year}`);
    }
  }
  
  // Check items count for list tests
  if (test.expect.itemsCount !== undefined) {
    const actualCount = result.primitiveLog.items_in_memory?.length || 0;
    if (actualCount !== test.expect.itemsCount) {
      testPassed = false;
      failures.push(`Expected ${test.expect.itemsCount} items, got ${actualCount}`);
    }
  }
  
  // Check all names extracted
  if (test.expect.allNamesExtracted !== undefined) {
    const missing = test.expect.allNamesExtracted.filter(
      name => !result.primitiveLog.items_in_memory?.includes(name)
    );
    if (missing.length > 0) {
      testPassed = false;
      failures.push(`Missing names: ${missing.join(', ')}`);
    }
  }
  
  if (testPassed) {
    console.log("✅ PASSED");
    passed++;
  } else {
    console.log("❌ FAILED");
    failures.forEach(f => console.log(`   - ${f}`));
    failed++;
  }
  
  console.log("");
});

console.log("=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED - Layer 2 primitives are working correctly!");
} else {
  console.log("❌ SOME TESTS FAILED - Review the failures above");
}
console.log("=".repeat(80));

process.exit(failed > 0 ? 1 : 0);
