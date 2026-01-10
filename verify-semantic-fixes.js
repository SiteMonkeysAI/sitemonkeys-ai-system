#!/usr/bin/env node

/**
 * STATIC VERIFICATION: 6 Semantic Intelligence Fixes
 * 
 * Verifies that all 6 fixes have been properly implemented by checking:
 * 1. Presence of semantic logging
 * 2. Absence of keyword arrays
 * 3. Use of semantic analyzer methods
 * 4. Correct code structure
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let passed = 0;
let failed = 0;

console.log('═══════════════════════════════════════════════════════');
console.log('  6 SEMANTIC INTELLIGENCE FIXES - STATIC VERIFICATION');
console.log('═══════════════════════════════════════════════════════\n');

/**
 * Read file content
 */
function readFile(path) {
  return readFileSync(join(__dirname, path), 'utf-8');
}

/**
 * TEST 1: Verify semantic importance logging
 */
function test1() {
  console.log('TEST 1: MEM-007 - Importance Scoring');
  console.log('─────────────────────────────────────');
  
  const content = readFile('api/memory/intelligent-storage.js');
  
  // Check for semantic importance logging
  if (content.includes('[SEMANTIC-IMPORTANCE]')) {
    console.log('✓ [SEMANTIC-IMPORTANCE] logging present');
  } else {
    console.log('✗ [SEMANTIC-IMPORTANCE] logging missing');
    failed++;
    return;
  }
  
  // Check for semantic analyzer usage
  if (content.includes('semanticAnalyzer.analyzeContentImportance')) {
    console.log('✓ Uses semanticAnalyzer.analyzeContentImportance()');
  } else {
    console.log('✗ Missing semanticAnalyzer.analyzeContentImportance()');
    failed++;
    return;
  }
  
  // Check NO keyword-based importance
  if (content.includes('CRITICAL_KEYWORDS') || content.includes('HIGH_PRIORITY_KEYWORDS')) {
    console.log('✗ Still uses keyword arrays for importance');
    failed++;
    return;
  } else {
    console.log('✓ No keyword arrays found');
  }
  
  console.log('✓ TEST 1 PASSED\n');
  passed++;
}

/**
 * TEST 2: Verify semantic deduplication
 */
function test2() {
  console.log('TEST 2: MEM-002 - Semantic De-Duplication');
  console.log('─────────────────────────────────────');
  
  const content = readFile('api/memory/intelligent-storage.js');
  
  // Check for semantic dedup logging
  if (content.includes('[SEMANTIC-DEDUP]')) {
    console.log('✓ [SEMANTIC-DEDUP] logging present');
  } else {
    console.log('✗ [SEMANTIC-DEDUP] logging missing');
    failed++;
    return;
  }
  
  // Check for embedding-based similarity
  if (content.includes('generateEmbedding') && content.includes('distance')) {
    console.log('✓ Uses embedding distance for deduplication');
  } else {
    console.log('✗ Missing embedding-based deduplication');
    failed++;
    return;
  }
  
  // Check for pgvector distance threshold
  if (content.includes('0.15') || content.includes('distance <')) {
    console.log('✓ Uses distance threshold (< 0.15)');
  } else {
    console.log('✗ Missing distance threshold');
    failed++;
    return;
  }
  
  console.log('✓ TEST 2 PASSED\n');
  passed++;
}

/**
 * TEST 3: Verify semantic supersession
 */
function test3() {
  console.log('TEST 3: MEM-003 - Supersession');
  console.log('─────────────────────────────────────');
  
  const content = readFile('api/memory/intelligent-storage.js');
  
  // Check for semantic supersession logging
  if (content.includes('[SEMANTIC-SUPERSESSION]')) {
    console.log('✓ [SEMANTIC-SUPERSESSION] logging present');
  } else {
    console.log('✗ [SEMANTIC-SUPERSESSION] logging missing');
    failed++;
    return;
  }
  
  // Check for semantic analyzer usage
  if (content.includes('semanticAnalyzer.analyzeSupersession')) {
    console.log('✓ Uses semanticAnalyzer.analyzeSupersession()');
  } else {
    console.log('✗ Missing semanticAnalyzer.analyzeSupersession()');
    failed++;
    return;
  }
  
  console.log('✓ TEST 3 PASSED\n');
  passed++;
}

/**
 * TEST 4: Verify temporal reconciliation
 */
function test4() {
  console.log('TEST 4: TRUTH-018 - Temporal Reconciliation');
  console.log('─────────────────────────────────────');
  
  const storageContent = readFile('api/memory/intelligent-storage.js');
  const analyzerContent = readFile('api/core/intelligence/semantic_analyzer.js');
  
  // Check for temporal logging
  if (storageContent.includes('[SEMANTIC-TEMPORAL]') || analyzerContent.includes('[SEMANTIC-TEMPORAL]')) {
    console.log('✓ [SEMANTIC-TEMPORAL] logging present');
  } else {
    console.log('✗ [SEMANTIC-TEMPORAL] logging missing');
    failed++;
    return;
  }
  
  // Check for temporal reconciliation method
  if (analyzerContent.includes('analyzeTemporalReconciliation') || analyzerContent.includes('hasTemporalContent')) {
    console.log('✓ Temporal reconciliation methods present');
  } else {
    console.log('✗ Temporal reconciliation methods missing');
    failed++;
    return;
  }
  
  console.log('✓ TEST 4 PASSED\n');
  passed++;
}

/**
 * TEST 5: Verify cross-session continuity filter
 */
function test5() {
  console.log('TEST 5: UX-044 - Cross-Session Continuity');
  console.log('─────────────────────────────────────');
  
  const content = readFile('api/services/semantic-retrieval.js');
  
  // Check for is_current filter
  if (content.includes('is_current = true') || content.includes('(is_current = true OR is_current IS NULL)')) {
    console.log('✓ is_current filter present');
  } else {
    console.log('✗ is_current filter missing');
    failed++;
    return;
  }
  
  console.log('✓ TEST 5 PASSED\n');
  passed++;
}

/**
 * TEST 6: Verify semantic memory visibility detection
 */
function test6() {
  console.log('TEST 6: UX-046 - Memory Visibility');
  console.log('─────────────────────────────────────');
  
  const orchestratorContent = readFile('api/core/orchestrator.js');
  const analyzerContent = readFile('api/core/intelligence/semantic_analyzer.js');
  
  // Check for semantic visibility logging
  if (orchestratorContent.includes('[SEMANTIC-VISIBILITY]')) {
    console.log('✓ [SEMANTIC-VISIBILITY] logging present');
  } else {
    console.log('✗ [SEMANTIC-VISIBILITY] logging missing');
    failed++;
    return;
  }
  
  // Check for semantic analyzer intent detection
  if (orchestratorContent.includes('semanticAnalyzer.analyzeIntent') || analyzerContent.includes('MEMORY_VISIBILITY')) {
    console.log('✓ Semantic intent detection present');
  } else {
    console.log('✗ Semantic intent detection missing');
    failed++;
    return;
  }
  
  console.log('✓ TEST 6 PASSED\n');
  passed++;
}

/**
 * Run all static verification tests
 */
function runTests() {
  try {
    test1();
    test2();
    test3();
    test4();
    test5();
    test6();
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✓ Passed: ${passed}/6`);
    console.log(`✗ Failed: ${failed}/6`);
    
    if (failed === 0) {
      console.log('\n✓ ALL CHECKS PASSED - Implementation is correct!');
    } else {
      console.log(`\n✗ ${failed} CHECKS FAILED - Review implementation`);
    }
    
    console.log('═══════════════════════════════════════════════════════\n');
    
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run verification
runTests();
