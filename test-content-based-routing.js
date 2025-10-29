// Test Content-Based Semantic Routing
// Validates that routing is based on CONTENT not INTENT

import { intelligenceSystem } from './api/categories/memory/index.js';

console.log('='.repeat(80));
console.log('CONTENT-BASED SEMANTIC ROUTING TEST');
console.log('='.repeat(80));
console.log();

async function testRouting() {
  await intelligenceSystem.initialize();

  const testCases = [
    {
      name: 'Test 1: Vehicles Query (should route to personal_life_interests)',
      query: 'Do you recall my vehicles?',
      expectedCategory: 'personal_life_interests',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = vehicles, not relationships',
    },
    {
      name: 'Test 2: Family Query (should route to relationships_social)',
      query: 'Tell me about my family',
      expectedCategory: 'relationships_social',
      expectedNotCategory: 'personal_life_interests',
      reason: 'Content = family, which is relationships',
    },
    {
      name: 'Test 3: Work Query (should route to work_career)',
      query: 'What did I tell you about my job?',
      expectedCategory: 'work_career',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = job/work, not relationships',
    },
    {
      name: 'Test 4: Money Query (should route to money category)',
      query: 'Do you remember my income?',
      expectedCategory: 'money_income_debt',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = income/money, not relationships',
    },
    {
      name: 'Test 5: Health Query (should route to health_wellness)',
      query: 'What do you recall about my exercise routine?',
      expectedCategory: 'health_wellness',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = exercise/health, not relationships',
    },
    {
      name: 'Test 6: Pet Query (should route to personal_life_interests)',
      query: 'Do you remember my pet?',
      expectedCategory: 'personal_life_interests',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = pet/hobby, which is personal interests',
    },
    {
      name: 'Test 7: Hobby Query (should route to personal_life_interests)',
      query: 'Can you recall my hobby?',
      expectedCategory: 'personal_life_interests',
      expectedNotCategory: 'relationships_social',
      reason: 'Content = hobby, which is personal interests',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log('-'.repeat(80));
    console.log(`\n${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    console.log(`Reason: ${testCase.reason}`);
    console.log();

    try {
      const result = await intelligenceSystem.analyzeAndRoute(
        testCase.query,
        'test_user_123',
      );

      console.log(`Routed to: ${result.primaryCategory}`);
      console.log(`Confidence: ${result.confidence.toFixed(3)}`);
      console.log(`Intent detected: ${result.semanticAnalysis?.intent || 'N/A'}`);
      
      if (result.semanticAnalysis?.topicEntities) {
        console.log(
          `Topic entities: ${Array.from(result.semanticAnalysis.topicEntities).join(', ')}`,
        );
      }

      // Check if routing matches expected category
      const matchesExpected = result.primaryCategory === testCase.expectedCategory;
      const avoidsWrong = result.primaryCategory !== testCase.expectedNotCategory;

      if (matchesExpected && avoidsWrong) {
        console.log('\n✅ PASSED: Correct content-based routing');
        passed++;
      } else {
        console.log('\n❌ FAILED:');
        if (!matchesExpected) {
          console.log(
            `  Expected: ${testCase.expectedCategory}, Got: ${result.primaryCategory}`,
          );
        }
        if (!avoidsWrong) {
          console.log(
            `  Should NOT route to: ${testCase.expectedNotCategory}, but did`,
          );
        }
        failed++;
      }
    } catch (error) {
      console.log('\n❌ FAILED: Error during routing');
      console.error(error);
      failed++;
    }

    console.log();
  }

  console.log('='.repeat(80));
  console.log('\nTEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log();

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Content-based routing is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Review the routing logic.');
  }

  console.log('='.repeat(80));

  process.exit(failed === 0 ? 0 : 1);
}

testRouting().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
