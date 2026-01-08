// Test script for root cause fixes (Issue #419)
// Tests semantic domain classification and confirmation loop fix

import { SemanticAnalyzer } from './api/core/intelligence/semantic_analyzer.js';

console.log('='.repeat(80));
console.log('ROOT CAUSE FIX VERIFICATION');
console.log('='.repeat(80));

// Initialize semantic analyzer
const analyzer = new SemanticAnalyzer();

async function runTests() {
  console.log('\n🔧 Initializing SemanticAnalyzer...');
  await analyzer.initialize();
  console.log('✅ Initialization complete\n');

  // ========== TEST 1: Technical Domain Classification ==========
  console.log('=' .repeat(80));
  console.log('TEST 1: TECHNICAL DOMAIN CLASSIFICATION');
  console.log('Success Criteria: All queries should route to "technical" domain with confidence >0.7');
  console.log('='.repeat(80));

  const technicalQueries = [
    "What are session token limits?",
    "API rate limiting best practices",
    "How do OAuth tokens work?",
    "Database connection pool sizing",
    "JWT token expiration handling",
    "Refresh token rotation strategies",
    "API throttling mechanisms",
    "Session management in distributed systems"
  ];

  const results = [];

  for (const query of technicalQueries) {
    console.log(`\n📝 Query: "${query}"`);
    
    const analysis = await analyzer.analyzeSemantics(query, {});
    
    const pass = analysis.domain === 'technical' && analysis.domainConfidence > 0.7;
    const status = pass ? '✅ PASS' : '❌ FAIL';
    
    console.log(`   Domain: ${analysis.domain}`);
    console.log(`   Confidence: ${analysis.domainConfidence.toFixed(3)}`);
    console.log(`   ${status}`);
    
    results.push({
      query,
      domain: analysis.domain,
      confidence: analysis.domainConfidence,
      pass
    });
  }

  // ========== TEST 2: Financial vs Technical Separation ==========
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: FINANCIAL VS TECHNICAL TOKEN SEPARATION');
  console.log('Verify "token" context matters (crypto vs API)');
  console.log('='.repeat(80));

  const tokenQueries = [
    { query: "What is Bitcoin token price?", expectedDomain: "financial" },
    { query: "API access token best practices", expectedDomain: "technical" },
    { query: "Ethereum token economics", expectedDomain: "financial" },
    { query: "JWT bearer token validation", expectedDomain: "technical" },
    { query: "DeFi token staking rewards", expectedDomain: "financial" },
    { query: "OAuth refresh token flow", expectedDomain: "technical" }
  ];

  const separationResults = [];

  for (const test of tokenQueries) {
    console.log(`\n📝 Query: "${test.query}"`);
    console.log(`   Expected: ${test.expectedDomain}`);
    
    const analysis = await analyzer.analyzeSemantics(test.query, {});
    
    const pass = analysis.domain === test.expectedDomain;
    const status = pass ? '✅ PASS' : '❌ FAIL';
    
    console.log(`   Actual: ${analysis.domain}`);
    console.log(`   Confidence: ${analysis.domainConfidence.toFixed(3)}`);
    console.log(`   ${status}`);
    
    separationResults.push({
      query: test.query,
      expected: test.expectedDomain,
      actual: analysis.domain,
      confidence: analysis.domainConfidence,
      pass
    });
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  const technicalPassed = results.filter(r => r.pass).length;
  const technicalTotal = results.length;
  const separationPassed = separationResults.filter(r => r.pass).length;
  const separationTotal = separationResults.length;

  console.log(`\nTest 1 - Technical Domain Classification:`);
  console.log(`  Passed: ${technicalPassed}/${technicalTotal}`);
  console.log(`  Success Rate: ${(technicalPassed / technicalTotal * 100).toFixed(1)}%`);

  console.log(`\nTest 2 - Financial vs Technical Separation:`);
  console.log(`  Passed: ${separationPassed}/${separationTotal}`);
  console.log(`  Success Rate: ${(separationPassed / separationTotal * 100).toFixed(1)}%`);

  const overallPassed = technicalPassed + separationPassed;
  const overallTotal = technicalTotal + separationTotal;
  const overallRate = (overallPassed / overallTotal * 100).toFixed(1);

  console.log(`\nOverall:`);
  console.log(`  Total Passed: ${overallPassed}/${overallTotal}`);
  console.log(`  Success Rate: ${overallRate}%`);

  if (overallRate >= 90) {
    console.log(`\n✅ SUCCESS: Root cause fixes are working! (${overallRate}% pass rate)`);
  } else if (overallRate >= 70) {
    console.log(`\n⚠️  PARTIAL: Some improvements but needs more work (${overallRate}% pass rate)`);
  } else {
    console.log(`\n❌ FAILURE: Root cause not adequately addressed (${overallRate}% pass rate)`);
  }

  // ========== DETAILED FAILURES ==========
  const failures = [...results, ...separationResults].filter(r => !r.pass);
  
  if (failures.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED FAILURE ANALYSIS');
    console.log('='.repeat(80));
    
    for (const failure of failures) {
      console.log(`\n❌ "${failure.query}"`);
      if (failure.expected) {
        console.log(`   Expected: ${failure.expected}, Got: ${failure.actual}`);
      } else {
        console.log(`   Domain: ${failure.domain} (needed: technical)`);
      }
      console.log(`   Confidence: ${failure.confidence.toFixed(3)}`);
      console.log(`   Issue: ${failure.confidence < 0.7 ? 'Low confidence' : 'Wrong domain'}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('NOTE: Test 3 (Confirmation Loop) requires manual testing in UI');
  console.log('Steps:');
  console.log('1. Ask a complex query that triggers Claude escalation');
  console.log('2. Click "Use GPT-4" button');
  console.log('3. Verify: System processes with GPT-4 (no loop back to confirmation)');
  console.log('4. Verify: Response is generated successfully');
  console.log('='.repeat(80));
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test execution failed:', error);
  process.exit(1);
});
