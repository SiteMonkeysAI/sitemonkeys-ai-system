#!/usr/bin/env node
/**
 * UNIT TEST: Fingerprint Fallback Logic Fix
 * 
 * Tests the critical fix for Issue #498 comment feedback:
 * 1. Partial matches (indicator without value) still assign fingerprint at reduced confidence
 * 2. Flow logging traces execution order
 * 3. Extraction validation warns if values are lost
 */

import { IntelligentMemoryStorage } from './api/memory/intelligent-storage.js';

console.log('═══════════════════════════════════════════════════════');
console.log('  FINGERPRINT FALLBACK FIX - UNIT TEST');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

/**
 * TEST 1: Partial Match Fallback
 * When indicator is found but no value pattern matches, should assign fingerprint at 60% confidence
 */
async function test1_PartialMatchFallback() {
  console.log('TEST 1: Partial Match Fallback (Indicator Only)');
  console.log('─────────────────────────────────────────────────');
  
  try {
    // Create a mock storage instance (no DB needed for this unit test)
    const storage = new IntelligentMemoryStorage({ query: () => {} }, 'mock-key');
    
    // Test case: "salary" indicator present but no numeric value
    const result1 = await storage.detectFingerprintFromFacts('My salary is confidential');
    
    if (result1.fingerprint === 'user_salary') {
      console.log('✓ Fingerprint assigned despite missing value pattern');
      console.log(`  Fingerprint: ${result1.fingerprint}`);
      console.log(`  Confidence: ${result1.confidence} (expected: ${0.90 * 0.6})`);
      console.log(`  Method: ${result1.method}`);
      
      if (result1.confidence === 0.90 * 0.6) {
        console.log('✓ Confidence correctly reduced to 60% of original (0.54)');
      } else {
        console.log(`✗ Confidence incorrect: ${result1.confidence} (expected: 0.54)`);
        failed++;
        return;
      }
      
      if (result1.method === 'semantic_indicator_only') {
        console.log('✓ Method correctly set to "semantic_indicator_only"');
      } else {
        console.log(`✗ Method incorrect: ${result1.method}`);
        failed++;
        return;
      }
    } else {
      console.log(`✗ Fingerprint not assigned (got: ${result1.fingerprint})`);
      console.log('  This means the fix failed - partial matches should still assign fingerprint');
      failed++;
      return;
    }
    
    // Test case: "meeting" indicator with value pattern
    const result2 = await storage.detectFingerprintFromFacts('Meeting at 3pm');
    
    if (result2.fingerprint === 'user_meeting_time' && result2.confidence === 0.90) {
      console.log('✓ Full match still works correctly (indicator + value)');
      console.log(`  Fingerprint: ${result2.fingerprint}, Confidence: ${result2.confidence}`);
    } else {
      console.log(`✗ Full match broken: ${result2.fingerprint} @ ${result2.confidence}`);
      failed++;
      return;
    }
    
    console.log('✓ TEST 1 PASSED\n');
    passed++;
  } catch (error) {
    console.log(`✗ TEST 1 FAILED: ${error.message}\n`);
    failed++;
  }
}

/**
 * TEST 2: Verify Flow Logging Exists
 * Check that code contains [FLOW] logging at each step
 */
async function test2_FlowLogging() {
  console.log('TEST 2: Flow Logging Present');
  console.log('─────────────────────────────────────────────────');
  
  try {
    const fs = await import('fs');
    const content = fs.readFileSync('./api/memory/intelligent-storage.js', 'utf-8');
    
    const flowSteps = [
      '[FLOW] Step 1: Extracting key facts',
      '[FLOW] Step 1: Facts extracted ✓',
      '[FLOW] Step 2: Detecting fingerprint',
      '[FLOW] Step 2: Fingerprint detected ✓',
      '[FLOW] Step 3: Checking for similar memories',
      '[FLOW] Step 4: Storing new memory'
    ];
    
    let allPresent = true;
    for (const step of flowSteps) {
      if (content.includes(step)) {
        console.log(`✓ Found: ${step}`);
      } else {
        console.log(`✗ Missing: ${step}`);
        allPresent = false;
      }
    }
    
    if (allPresent) {
      console.log('✓ TEST 2 PASSED\n');
      passed++;
    } else {
      console.log('✗ TEST 2 FAILED: Missing flow logging steps\n');
      failed++;
    }
  } catch (error) {
    console.log(`✗ TEST 2 FAILED: ${error.message}\n`);
    failed++;
  }
}

/**
 * TEST 3: Verify Extraction Validation Exists
 * Check that code contains [EXTRACTION-WARNING] validation
 */
async function test3_ExtractionValidation() {
  console.log('TEST 3: Extraction Validation Present');
  console.log('─────────────────────────────────────────────────');
  
  try {
    const fs = await import('fs');
    const content = fs.readFileSync('./api/memory/intelligent-storage.js', 'utf-8');
    
    const validationChecks = [
      'inputHasAmount',
      'factsHaveAmount',
      '[EXTRACTION-WARNING] Input contained numeric value but extraction lost it',
      '[EXTRACTION-WARNING] Input:',
      '[EXTRACTION-WARNING] Extracted:'
    ];
    
    let allPresent = true;
    for (const check of validationChecks) {
      if (content.includes(check)) {
        console.log(`✓ Found: ${check}`);
      } else {
        console.log(`✗ Missing: ${check}`);
        allPresent = false;
      }
    }
    
    if (allPresent) {
      console.log('✓ TEST 3 PASSED\n');
      passed++;
    } else {
      console.log('✗ TEST 3 FAILED: Missing extraction validation\n');
      failed++;
    }
  } catch (error) {
    console.log(`✗ TEST 3 FAILED: ${error.message}\n`);
    failed++;
  }
}

/**
 * TEST 4: Verify No Continue Statement in Partial Match
 * The bug was that 'continue' skipped fingerprint assignment
 */
async function test4_NoContinueInPartialMatch() {
  console.log('TEST 4: No Continue Statement in Partial Match Logic');
  console.log('─────────────────────────────────────────────────');
  
  try {
    const fs = await import('fs');
    const content = fs.readFileSync('./api/memory/intelligent-storage.js', 'utf-8');
    
    // Find the section where we handle "has indicator but no value pattern"
    const partialMatchSection = content.match(
      /indicator but no value pattern[\s\S]{0,300}/
    );
    
    if (!partialMatchSection) {
      console.log('✗ Cannot find partial match handling code');
      failed++;
      return;
    }
    
    const sectionText = partialMatchSection[0];
    
    if (sectionText.includes('continue')) {
      console.log('✗ Bug still exists: "continue" statement found in partial match handling');
      console.log('  This will skip fingerprint assignment!');
      failed++;
      return;
    }
    
    if (sectionText.includes('return {') && sectionText.includes('fingerprint: pattern.id')) {
      console.log('✓ Correct: Returns fingerprint object instead of using continue');
      console.log('✓ Partial matches now properly assign fingerprints');
    } else {
      console.log('✗ Unexpected code structure in partial match handling');
      failed++;
      return;
    }
    
    console.log('✓ TEST 4 PASSED\n');
    passed++;
  } catch (error) {
    console.log(`✗ TEST 4 FAILED: ${error.message}\n`);
    failed++;
  }
}

// Run all tests
(async () => {
  await test1_PartialMatchFallback();
  await test2_FlowLogging();
  await test3_ExtractionValidation();
  await test4_NoContinueInPartialMatch();
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✓ Passed: ${passed}/4`);
  console.log(`✗ Failed: ${failed}/4`);
  
  if (failed === 0) {
    console.log('\n✓ ALL TESTS PASSED - Fix is correct!');
    console.log('\nNext Steps:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Set up database with DATABASE_URL');
    console.log('3. Run innovation test suite: node test-six-semantic-fixes.js');
    process.exit(0);
  } else {
    console.log('\n✗ SOME TESTS FAILED - Review the fix');
    process.exit(1);
  }
})();
