#!/usr/bin/env node

/**
 * Quick Proof Test Runner
 * =======================
 * 
 * Runs diagnostic tests and immediately shows which proofs executed.
 * 
 * Usage:
 *   node run-with-proofs.js [test-file]
 * 
 * Example:
 *   node run-with-proofs.js diagnostic-tests-smdeep.js
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const testFile = process.argv[2] || 'diagnostic-tests-smdeep.js';

console.log(`🔍 Running ${testFile} with execution proof tracking...\n`);

const testProcess = spawn('node', [testFile], {
  cwd: process.cwd(),
  env: { ...process.env, FORCE_COLOR: '1' }
});

const foundProofs = new Set();
let testOutput = [];

const rl = createInterface({
  input: testProcess.stdout,
  terminal: false
});

const rlErr = createInterface({
  input: testProcess.stderr,
  terminal: false
});

// Process stdout
rl.on('line', (line) => {
  testOutput.push(line);
  
  // Show test output in real-time
  console.log(line);
  
  // Track proofs
  const proofMatch = line.match(/\[PROOF\]\s+([^\s]+)/);
  if (proofMatch) {
    foundProofs.add(proofMatch[1]);
  }
});

// Process stderr  
rlErr.on('line', (line) => {
  testOutput.push(line);
  console.error(line);
  
  // Track proofs in stderr too
  const proofMatch = line.match(/\[PROOF\]\s+([^\s]+)/);
  if (proofMatch) {
    foundProofs.add(proofMatch[1]);
  }
});

testProcess.on('close', (code) => {
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTION PROOFS FOUND:');
  console.log('='.repeat(70));
  
  if (foundProofs.size === 0) {
    console.log('❌ NO PROOF LINES FOUND');
    console.log('\nPossible reasons:');
    console.log('  1. Test didn\'t run (check for errors above)');
    console.log('  2. Server not started (API tests need server running)');
    console.log('  3. Test doesn\'t exercise instrumented code paths');
    console.log('\nRun: node verify-execution-proofs.js < output.log');
    console.log('For detailed analysis');
  } else {
    console.log(`\n✅ Found ${foundProofs.size} proof lines:\n`);
    
    const proofMap = {
      'semantic-retrieval': 'Semantic retrieval',
      'orchestrator:memory-retrieval': 'Memory retrieval',
      'orchestrator:memory-injected': 'Memory injection',
      'storage:explicit-detect': 'Explicit memory (A5)',
      'validator:ordinal': 'Ordinal enforcement (B3)',
      'validator:temporal': 'Temporal inference (INF3)',
      'validator:character-preservation': 'Character preservation (CMP2)',
      'validator:anchor-preservation': 'Anchor preservation (EDG3)',
      'validator:refusal-maintenance': 'Refusal maintenance (TRU1)',
      'validator:manipulation-guard': 'Manipulation guard (TRU2)'
    };
    
    for (const proof of foundProofs) {
      const description = proofMap[proof] || 'Unknown';
      console.log(`  ✓ ${proof} (${description})`);
    }
    
    const expected = Object.keys(proofMap);
    const missing = expected.filter(p => !foundProofs.has(p));
    
    if (missing.length > 0) {
      console.log(`\n⚠️  Expected but missing (${missing.length}):\n`);
      for (const proof of missing) {
        const description = proofMap[proof];
        console.log(`  ✗ ${proof} (${description})`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`Test exit code: ${code}`);
  console.log('='.repeat(70) + '\n');
  
  if (foundProofs.size > 0) {
    console.log('💡 For detailed analysis, run:');
    console.log(`   node ${testFile} 2>&1 | node verify-execution-proofs.js\n`);
  }
  
  process.exit(code);
});

testProcess.on('error', (err) => {
  console.error(`\n❌ Failed to start test: ${err.message}`);
  process.exit(1);
});
