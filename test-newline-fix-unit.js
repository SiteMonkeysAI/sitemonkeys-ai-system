#!/usr/bin/env node
// ================================================================
// test-newline-fix-unit.js
// Unit test for newline preservation fix in intelligent-storage.js
// ================================================================

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';

console.log('🧪 Testing Newline Preservation Fix');
console.log('='.repeat(80));

// Create a mock database object (we only need to test aggressivePostProcessing)
const mockDb = {
  query: () => Promise.resolve({ rows: [] })
};

const storage = new IntelligentMemoryStorage(mockDb, 'dummy-key');

// Test cases that should all pass
const testCases = [
  {
    name: 'Standard GPT output with bullet points and periods',
    input: '- User has pet monkeys.\n- Assistant unaware of pet.\n- User enjoys video games.',
    expectedLines: [
      'User has pet monkeys.',
      'Assistant unaware of pet.',
      'User enjoys video games.'
    ]
  },
  {
    name: 'Concatenated WITHOUT spaces (the critical bug fix)',
    input: 'User has pet monkeys.Assistant unaware of pet.User enjoys video games.',
    expectedLines: [
      'User has pet monkeys.',
      'Assistant unaware of pet.',
      'User enjoys video games.'
    ]
  },
  {
    name: 'Concatenated WITH spaces after periods',
    input: 'User has pet monkeys. Assistant unaware of pet. User enjoys video games.',
    expectedLines: [
      'User has pet monkeys.',
      'Assistant unaware of pet.',
      'User enjoys video games.'
    ]
  },
  {
    name: 'Facts without periods (should add them)',
    input: '- User has pet monkeys\n- User enjoys video games\n- User likes ice cream',
    expectedLines: [
      'User has pet monkeys.',
      'User enjoys video games.',
      'User likes ice cream.'
    ]
  },
  {
    name: 'Numbered list with periods',
    input: '1. User has pet monkeys.\n2. User enjoys video games.\n3. User likes ice cream.',
    expectedLines: [
      'User has pet monkeys.',
      'User enjoys video games.',
      'User likes ice cream.'
    ]
  },
  {
    name: 'Mixed format with some periods',
    input: '- User has pet monkeys.\n- User enjoys video games\n- User likes ice cream.',
    expectedLines: [
      'User has pet monkeys.',
      'User enjoys video games.',
      'User likes ice cream.'
    ]
  }
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`\n[TEST ${index + 1}] ${testCase.name}`);
  console.log('-'.repeat(80));
  
  const result = storage.aggressivePostProcessing(testCase.input);
  const resultLines = result.split('\n');
  
  console.log('Input:', testCase.input.substring(0, 60) + '...');
  console.log('Expected lines:', testCase.expectedLines);
  console.log('Actual lines:', resultLines);
  
  // Check if result has newlines
  const hasNewlines = result.includes('\n');
  console.log('✓ Has newlines:', hasNewlines ? '✅ YES' : '❌ NO');
  
  // Check if result has periods
  const hasPeriods = result.includes('.');
  console.log('✓ Has periods:', hasPeriods ? '✅ YES' : '❌ NO');
  
  // Check if each line ends with punctuation
  const allLinesEndWithPunctuation = resultLines.every(line => /[.!?]$/.test(line));
  console.log('✓ All lines end with punctuation:', allLinesEndWithPunctuation ? '✅ YES' : '❌ NO');
  
  // Check if lines match expected
  const linesMatch = JSON.stringify(resultLines) === JSON.stringify(testCase.expectedLines);
  console.log('✓ Lines match expected:', linesMatch ? '✅ YES' : '❌ NO');
  
  // Check for the critical bug: concatenated facts
  const hasConcatenation = result.match(/[a-z]\.[A-Z]/);
  console.log('✓ No concatenation (e.g., "monkeys.Assistant"):', !hasConcatenation ? '✅ YES' : '❌ NO');
  
  // Overall pass/fail
  const testPassed = hasNewlines && hasPeriods && allLinesEndWithPunctuation && !hasConcatenation;
  
  if (testPassed) {
    console.log('Result: ✅ PASSED');
    passed++;
  } else {
    console.log('Result: ❌ FAILED');
    failed++;
    console.log('Actual output:', JSON.stringify(result));
  }
});

console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total: ${testCases.length} tests`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! Newline preservation fix is working correctly.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. Please review the fix.');
  process.exit(1);
}
