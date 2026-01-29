#!/usr/bin/env node

/**
 * Execution Proof Verification Script
 * ====================================
 * 
 * Parses test output logs to verify which code paths actually executed.
 * 
 * Usage:
 *   node verify-execution-proofs.js < test-output.log
 *   npm test 2>&1 | node verify-execution-proofs.js
 * 
 * Expected Proof Lines:
 * [PROOF] semantic-retrieval v=2026-01-29a file=api/services/semantic-retrieval.js fn=retrieveSemanticMemories
 * [PROOF] orchestrator:memory-retrieval v=2026-01-29a file=api/core/orchestrator.js fn=processMessage
 * [PROOF] orchestrator:memory-injected v=2026-01-29a count=X ids=[...]
 * [PROOF] storage:explicit-detect v=2026-01-29a file=api/memory/intelligent-storage.js fn=detectExplicitMemoryRequest
 * [PROOF] validator:ordinal v=2026-01-29a file=api/core/orchestrator.js fn=#enforceOrdinalCorrectness
 * [PROOF] validator:temporal v=2026-01-29a file=api/core/orchestrator.js fn=#calculateTemporalInference
 * [PROOF] validator:character-preservation v=2026-01-29a file=api/lib/validators/character-preservation.js fn=validate
 * [PROOF] validator:anchor-preservation v=2026-01-29a file=api/lib/validators/anchor-preservation.js fn=validate
 * [PROOF] validator:refusal-maintenance v=2026-01-29a file=api/lib/validators/refusal-maintenance.js fn=validate
 * [PROOF] validator:manipulation-guard v=2026-01-29a file=api/lib/validators/manipulation-guard.js fn=validate
 */

import { createInterface } from 'readline';
import { stdin, stdout } from 'process';

const EXPECTED_PROOFS = {
  'semantic-retrieval': 'Semantic memory retrieval',
  'orchestrator:memory-retrieval': 'Orchestrator memory retrieval',
  'orchestrator:memory-injected': 'Memory injection',
  'storage:explicit-detect': 'Explicit memory detection (A5)',
  'validator:ordinal': 'Ordinal enforcement (B3)',
  'validator:temporal': 'Temporal inference (INF3)',
  'validator:character-preservation': 'Character preservation (CMP2)',
  'validator:anchor-preservation': 'Anchor preservation (EDG3)',
  'validator:refusal-maintenance': 'Refusal maintenance (TRU1)',
  'validator:manipulation-guard': 'Manipulation guard (TRU2)'
};

const foundProofs = new Set();
const proofDetails = {};
const testResults = [];
let currentTest = null;

const rl = createInterface({
  input: stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  // Parse proof lines
  const proofMatch = line.match(/\[PROOF\]\s+([^\s]+)\s+v=([^\s]+)\s+(.+)/);
  if (proofMatch) {
    const [, module, version, details] = proofMatch;
    foundProofs.add(module);
    proofDetails[module] = { version, details, line };
    console.log(`✓ Found proof: ${module} (${EXPECTED_PROOFS[module] || 'Unknown'})`);
  }
  
  // Parse test results
  const testNameMatch = line.match(/Running:\s+(.+)/);
  if (testNameMatch) {
    currentTest = testNameMatch[1];
  }
  
  const testPassMatch = line.match(/✅\s+PASSED:\s+(.+)/);
  if (testPassMatch) {
    testResults.push({ name: testPassMatch[1], status: 'PASSED' });
  }
  
  const testFailMatch = line.match(/❌\s+FAILED:\s+(.+)/);
  if (testFailMatch) {
    testResults.push({ name: testFailMatch[1], status: 'FAILED' });
  }
});

rl.on('close', () => {
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTION PROOF VERIFICATION REPORT');
  console.log('='.repeat(70));
  
  console.log('\n## Expected vs Found Proofs:\n');
  
  const missing = [];
  for (const [module, description] of Object.entries(EXPECTED_PROOFS)) {
    if (foundProofs.has(module)) {
      console.log(`✅ ${description}`);
      console.log(`   ${module}: ${proofDetails[module].details}`);
    } else {
      console.log(`❌ ${description} - NOT FOUND`);
      missing.push({ module, description });
    }
  }
  
  console.log('\n## Analysis:\n');
  
  if (missing.length === 0) {
    console.log('✅ ALL expected proof lines found - code is executing as expected');
  } else {
    console.log(`❌ ${missing.length} proof lines missing - these code paths did NOT execute:`);
    missing.forEach(({ module, description }) => {
      console.log(`   - ${description} (${module})`);
    });
    console.log('\n⚠️  Missing proofs indicate:');
    console.log('   1. Code not wired into execution path');
    console.log('   2. Feature flags disabled');
    console.log('   3. Wrong import/module being used');
    console.log('   4. Code exists but is unreachable');
  }
  
  if (testResults.length > 0) {
    console.log('\n## Test Results:\n');
    const passed = testResults.filter(t => t.status === 'PASSED').length;
    const failed = testResults.filter(t => t.status === 'FAILED').length;
    console.log(`Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed tests:');
      testResults.filter(t => t.status === 'FAILED').forEach(t => {
        console.log(`  - ${t.name}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATION:');
  console.log('='.repeat(70));
  
  if (missing.length > 0) {
    console.log('\n1. Fix wiring for missing proof lines FIRST');
    console.log('2. Re-run tests and verify all proofs appear');
    console.log('3. Only THEN investigate model variance if tests still fail');
  } else if (testResults.filter(t => t.status === 'FAILED').length > 0) {
    console.log('\n1. All code paths are executing ✓');
    console.log('2. Failed tests indicate:');
    console.log('   - Model variance (if deterministic validators ran)');
    console.log('   - Logic bugs in validators');
    console.log('   - Insufficient memory retrieval');
    console.log('3. Review test output logs for specific failure reasons');
  } else {
    console.log('\n✅ All code executing and all tests passing!');
  }
  
  console.log('\n');
  
  // Exit with error code if proofs missing
  process.exit(missing.length > 0 ? 1 : 0);
});
