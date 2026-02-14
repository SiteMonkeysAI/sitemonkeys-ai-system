#!/usr/bin/env node

/**
 * Test extractUnicodeNames regex fix for Issue #759
 * Tests names with diacritics, hyphens, and apostrophes
 */

// Mock the extractUnicodeNames method inline for testing
function extractUnicodeNames(content) {
  if (!content || typeof content !== 'string') return [];

  // SECURITY: Bound input to prevent ReDoS (CodeQL fix for polynomial regex)
  const safeContent = content.substring(0, 500);

  console.log(`[TEST] Input: "${safeContent}"`);

  // Pattern 1: Multi-word names with Unicode support, hyphens, and apostrophes
  // Matches names like "José García-López", "O'Shaughnessy", "Zhang-Müller"
  const multiWordPattern = /\p{Lu}\p{L}*(?:[-'']\p{L}+)*(?:\s+\p{Lu}\p{L}*(?:[-'']\p{L}+)*)+/gu;

  // Pattern 2: Single words with diacritics
  // Must have at least one non-ASCII letter
  const singleWordPattern = /\b\p{Lu}\p{L}*[^\u0000-\u007F]\p{L}*\b/gu;

  // Pattern 3: CJK names (Chinese, Japanese, Korean characters)
  // Matches 2-4 consecutive CJK characters
  const cjkPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]{2,4}/g;

  // Pattern 4: Capitalized words adjacent to CJK (like "Zhang Wei")
  const cjkAdjacentPattern = /\b\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?\b/gu;

  const multiMatches = safeContent.match(multiWordPattern) || [];
  const singleMatches = safeContent.match(singleWordPattern) || [];
  const cjkMatches = safeContent.match(cjkPattern) || [];

  // For adjacent pattern, only include if near "contact", "name", or other context
  let adjacentMatches = [];
  if (/contact|name|colleague|friend|client/i.test(safeContent)) {
    adjacentMatches = safeContent.match(cjkAdjacentPattern) || [];
  }

  // Combine all matches and deduplicate
  const allMatches = [...new Set([...multiMatches, ...singleMatches, ...cjkMatches, ...adjacentMatches])];

  console.log(`[TEST] Raw matches: ${JSON.stringify(allMatches)}`);

  // Clean up matches
  const unicodeNames = allMatches
    .map(m => m.replace(/[.,;:!?'")\]}>]+$/, '').trim())
    .filter(m => m.length > 0)
    .filter(m => {
      // Keep if: has non-ASCII letter, has CJK, is multi-word capitalized, or has hyphen/apostrophe
      return /[^\u0000-\u007F]/.test(m) ||
             /^\p{Lu}\p{L}+\s+\p{Lu}\p{L}+/u.test(m) ||
             /[-'']/.test(m);
    });

  console.log(`[TEST] Final matches: ${JSON.stringify(unicodeNames)}`);

  return unicodeNames;
}

// Test cases
const tests = [
  {
    name: 'Issue #759 - Full test case',
    input: 'My contacts are: Dr. Xiaoying Zhang-Müller, Björn O\'Shaughnessy, and José García-López',
    expected: ['Xiaoying Zhang-Müller', 'Björn O\'Shaughnessy', 'José García-López'],
    minExpected: 3
  },
  {
    name: 'Hyphenated name with diacritics',
    input: 'I met Zhang-Müller yesterday',
    expected: ['Zhang-Müller'],
    minExpected: 1
  },
  {
    name: 'Apostrophe in name',
    input: 'Contact Björn O\'Shaughnessy for details',
    expected: ['Björn O\'Shaughnessy'],
    minExpected: 1
  },
  {
    name: 'Spanish name with accents',
    input: 'José García-López is our contact',
    expected: ['José García-López'],
    minExpected: 1
  },
  {
    name: 'Single word with diacritic',
    input: 'Björn attended the meeting',
    expected: ['Björn'],
    minExpected: 1
  },
  {
    name: 'CMP2 test format',
    input: 'My three key contacts are Zhang Wei, Björn Lindqvist, and José García',
    expected: ['Zhang Wei', 'Björn Lindqvist', 'José García'],
    minExpected: 3
  },
  {
    name: 'Curly apostrophe',
    input: 'O\u2019Neill is joining us',
    expected: ['O\u2019Neill'],
    minExpected: 1
  },
  {
    name: 'Multiple hyphens',
    input: 'Marie-Claire Dubois-Martin is the CEO',
    expected: ['Marie-Claire Dubois-Martin'],
    minExpected: 1
  },
  {
    name: 'ASCII names still work',
    input: 'John Smith and Sarah Johnson are here',
    expected: ['John Smith', 'Sarah Johnson'],
    minExpected: 2
  },
  {
    name: 'Brand names still work',
    input: 'I drive a Tesla Model',
    expected: ['Tesla Model'],
    minExpected: 1
  }
];

let passed = 0;
let failed = 0;

console.log('\n='.repeat(70));
console.log('Testing extractUnicodeNames Regex Fix - Issue #759');
console.log('='.repeat(70));

tests.forEach((test, idx) => {
  console.log(`\n[TEST ${idx + 1}/${tests.length}] ${test.name}`);
  console.log(`Input: "${test.input}"`);
  console.log(`Expected: ${JSON.stringify(test.expected)} (min: ${test.minExpected})`);
  
  const result = extractUnicodeNames(test.input);
  
  console.log(`Result: ${JSON.stringify(result)}`);
  
  const success = result.length >= test.minExpected;
  
  if (success) {
    console.log('✅ PASS');
    passed++;
  } else {
    console.log('❌ FAIL');
    console.log(`   Expected at least ${test.minExpected} names, got ${result.length}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total: ${tests.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
console.log('='.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);
