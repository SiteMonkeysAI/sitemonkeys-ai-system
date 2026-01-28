/**
 * Unit test for ordinal enforcement validator
 * Tests the #enforceOrdinalCorrectness method logic
 */

// Mock the ordinal enforcement logic
function enforceOrdinalCorrectness({ response, memoryContext = [], query = '' }) {
  try {
    // Ordinal detection
    const ORDINAL_MAP = {
      'first': 1, '1st': 1, 'second': 2, '2nd': 2,
      'third': 3, '3rd': 3, 'fourth': 4, '4th': 4, 'fifth': 5, '5th': 5
    };

    const ordinalPattern = /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(\w+)/i;
    const match = query.match(ordinalPattern);

    if (!match) {
      return { correctionApplied: false, response };
    }

    const ordinalWord = match[1].toLowerCase();
    const subject = match[2];
    const ordinalNum = ORDINAL_MAP[ordinalWord];

    // Extract ordinal memories
    const memories = Array.isArray(memoryContext) ? memoryContext : (memoryContext.memories || []);
    const ordinalMemories = memories
      .filter(m => {
        const metadata = m.metadata || {};
        const ordinalSubject = metadata.ordinal_subject || '';
        return ordinalSubject.toLowerCase().includes(subject?.toLowerCase() || '');
      })
      .map(m => {
        const metadata = m.metadata || {};
        return {
          ordinal: parseInt(metadata.ordinal) || null,
          value: metadata.ordinal_value || null,
          content: m.content || '',
          subject: metadata.ordinal_subject || null
        };
      })
      .filter(m => m.ordinal !== null)
      .sort((a, b) => a.ordinal - b.ordinal);

    if (ordinalMemories.length < 2) {
      return { correctionApplied: false, response };
    }

    // Find target memory
    const targetMemory = ordinalMemories.find(m => m.ordinal === ordinalNum);
    if (!targetMemory) {
      return { correctionApplied: false, response };
    }

    const correctValue = targetMemory.value;
    if (!correctValue) {
      return { correctionApplied: false, response };
    }

    // Gather wrong values
    const wrongValues = ordinalMemories
      .filter(m => m.ordinal !== ordinalNum)
      .map(m => m.value)
      .filter(v => v);

    // Check for wrong values BEFORE early return
    const hasWrongValue = wrongValues.some(wrong => response.includes(wrong));
    const hasCorrectValue = response.includes(correctValue);

    const telemetry = {
      detectedOrdinal: ordinalNum,
      subject: subject,
      candidatesFound: ordinalMemories.length,
      selectedValue: correctValue,
      wrongValuesInResponse: wrongValues.filter(wrong => response.includes(wrong)),
      hasCorrectValue,
      hasWrongValue
    };

    // Only return early if correct value is present AND no wrong values exist
    if (hasCorrectValue && !hasWrongValue) {
      return { 
        correctionApplied: false, 
        response,
        telemetry 
      };
    }

    let adjustedResponse = response;
    let corrected = false;
    const replacements = [];

    // Replace wrong values with correct value
    for (const wrongValue of wrongValues) {
      if (adjustedResponse.includes(wrongValue)) {
        adjustedResponse = adjustedResponse.replace(new RegExp(wrongValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correctValue);
        corrected = true;
        replacements.push({ from: wrongValue, to: correctValue });
      }
    }

    // Inject if missing
    let injectedMissingValue = false;
    if (!corrected && !adjustedResponse.includes(correctValue)) {
      adjustedResponse = correctValue;
      corrected = true;
      injectedMissingValue = true;
    }

    telemetry.replacedWrongValue = replacements.length > 0;
    telemetry.injectedMissingValue = injectedMissingValue;
    telemetry.replacements = replacements;

    return {
      correctionApplied: corrected,
      response: adjustedResponse,
      ordinalCorrected: corrected ? { ordinal: ordinalNum, subject, correctValue } : null,
      telemetry
    };

  } catch (error) {
    return { correctionApplied: false, response };
  }
}

// Test cases
console.log('Testing Ordinal Enforcement Logic\n');
console.log('='.repeat(70));

// Test 1: Replace wrong value with correct value
console.log('\n TEST 1: Replace CHARLIE with DELTA (second code query)');
const test1 = enforceOrdinalCorrectness({
  query: "What is my second code?",
  response: "Your second code is CHARLIE-123.",
  memoryContext: [
    {
      content: "My first code is CHARLIE-123",
      metadata: { ordinal: 1, ordinal_subject: "code", ordinal_value: "CHARLIE-123" }
    },
    {
      content: "My second code is DELTA-456",
      metadata: { ordinal: 2, ordinal_subject: "code", ordinal_value: "DELTA-456" }
    }
  ]
});
console.log('Result:', test1);
console.log('Expected: correctionApplied=true, response contains DELTA-456');
console.log('Actual:', test1.correctionApplied ? 'PASS ✓' : 'FAIL ✗');

// Test 2: Inject missing value
console.log('\n\nTEST 2: Inject DELTA when missing');
const test2 = enforceOrdinalCorrectness({
  query: "What is my second code?",
  response: "I don't have that information.",
  memoryContext: [
    {
      content: "My first code is CHARLIE-123",
      metadata: { ordinal: 1, ordinal_subject: "code", ordinal_value: "CHARLIE-123" }
    },
    {
      content: "My second code is DELTA-456",
      metadata: { ordinal: 2, ordinal_subject: "code", ordinal_value: "DELTA-456" }
    }
  ]
});
console.log('Result:', test2);
console.log('Expected: correctionApplied=true, response=DELTA-456');
console.log('Actual:', test2.correctionApplied && test2.response === 'DELTA-456' ? 'PASS ✓' : 'FAIL ✗');

// Test 3: Already correct - no wrong values present
console.log('\n\nTEST 3: Already correct (DELTA present, no CHARLIE)');
const test3 = enforceOrdinalCorrectness({
  query: "What is my second code?",
  response: "Your second code is DELTA-456.",
  memoryContext: [
    {
      content: "My first code is CHARLIE-123",
      metadata: { ordinal: 1, ordinal_subject: "code", ordinal_value: "CHARLIE-123" }
    },
    {
      content: "My second code is DELTA-456",
      metadata: { ordinal: 2, ordinal_subject: "code", ordinal_value: "DELTA-456" }
    }
  ]
});
console.log('Result:', test3);
console.log('Expected: correctionApplied=false (already correct)');
console.log('Actual:', !test3.correctionApplied ? 'PASS ✓' : 'FAIL ✗');

// Test 4: CRITICAL FIX - Both correct and wrong values present (Issue #615)
console.log('\n\nTEST 4: CRITICAL - Both DELTA (correct) and CHARLIE (wrong) present');
const test4 = enforceOrdinalCorrectness({
  query: "What is my second code?",
  response: "Your codes are CHARLIE-123 and DELTA-456. The second one is CHARLIE-123.",
  memoryContext: [
    {
      content: "My first code is CHARLIE-123",
      metadata: { ordinal: 1, ordinal_subject: "code", ordinal_value: "CHARLIE-123" }
    },
    {
      content: "My second code is DELTA-456",
      metadata: { ordinal: 2, ordinal_subject: "code", ordinal_value: "DELTA-456" }
    }
  ]
});
console.log('Result:', test4);
console.log('Expected: correctionApplied=true, CHARLIE replaced with DELTA');
console.log('Actual:', test4.correctionApplied && test4.response.includes('DELTA-456') ? 'PASS ✓' : 'FAIL ✗');
console.log('Telemetry:', JSON.stringify(test4.telemetry, null, 2));

console.log('\n' + '='.repeat(70));
console.log('All tests completed. Check results above.');
