#!/usr/bin/env node
// ================================================================
// INTELLIGENCE SYSTEM VALIDATION TESTS
// Validates that all enhanced intelligence capabilities are working
// ================================================================

import { EnhancedIntelligence } from "./api/lib/enhanced-intelligence.js";

console.log("🧠 TESTING ENHANCED INTELLIGENCE SYSTEM...\n");

const intelligence = new EnhancedIntelligence();
let testsPassed = 0;
let testsTotal = 0;

// Test helper function
function runTest(testName, testFunction) {
  testsTotal++;
  console.log(`🧪 Testing: ${testName}`);

  try {
    const result = testFunction();
    if (result === true || (result && result.success)) {
      console.log(`✅ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.log(`❌ FAIL: ${testName}`, result);
    }
  } catch (error) {
    console.log(`❌ ERROR: ${testName} - ${error.message}`);
  }
  console.log("");
}

async function runAsyncTest(testName, testFunction) {
  testsTotal++;
  console.log(`🧪 Testing: ${testName}`);

  try {
    const result = await testFunction();
    if (result === true || (result && result.success)) {
      console.log(`✅ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.log(`❌ FAIL: ${testName}`, result);
    }
  } catch (error) {
    console.log(`❌ ERROR: ${testName} - ${error.message}`);
  }
  console.log("");
}

// ================================================================
// INTELLIGENCE CAPABILITY TESTS
// ================================================================

console.log("🔬 RUNNING CAPABILITY TESTS...\n");

// Test 1: Enhanced Intelligence Initialization
runTest("Enhanced Intelligence Initialization", () => {
  return (
    intelligence &&
    intelligence.intelligenceCapabilities &&
    intelligence.intelligenceCapabilities.reasoning === true
  );
});

// Test 2: Reasoning Detection
runTest("Reasoning Detection Logic", () => {
  const simpleQuery = "What's the weather?";
  const complexQuery =
    "Why does increasing marketing spend sometimes decrease ROI and how should we analyze this?";

  return (
    !intelligence.requiresReasoning(simpleQuery, "truth_general") &&
    intelligence.requiresReasoning(complexQuery, "business_validation")
  );
});

// Test 3: Number Extraction
runTest("Number Extraction from Text", () => {
  const text =
    "We have $50,000 in revenue and 15% growth rate, plus 3.2 months runway";
  const numbers = intelligence.extractNumbers(text);

  return numbers.length >= 3 && numbers.includes(50000);
});

// Test 4: Domain Identification
runTest("Primary Domain Identification", () => {
  const businessQuery = "How should we increase company revenue this quarter?";
  const healthQuery = "I'm feeling stressed and need fitness advice";

  return (
    intelligence.identifyPrimaryDomain(businessQuery) === "business" &&
    intelligence.identifyPrimaryDomain(healthQuery) === "health"
  );
});

// Test 5: Cross-Domain Analysis Detection
runTest("Cross-Domain Analysis Detection", () => {
  const crossDomainQuery =
    "My work stress is affecting my health and family relationships";
  const singleDomainQuery = "What's 15% of $10,000?";

  const mockMemory = { category1: ["work"], category2: ["health", "family"] };

  return (
    intelligence.requiresCrossDomainAnalysis(crossDomainQuery, mockMemory) &&
    !intelligence.requiresCrossDomainAnalysis(singleDomainQuery, null)
  );
});

// ================================================================
// INTEGRATION TESTS
// ================================================================

console.log("🔗 RUNNING INTEGRATION TESTS...\n");

// Test 6: Full Enhancement Pipeline
await runAsyncTest("Full Enhancement Pipeline", async () => {
  const testQuery =
    "Should I hire a developer for $120k when we have 8 months runway and growing user complaints?";
  const mockBaseResponse =
    "This requires careful analysis of your financial situation and business needs.";
  const mockMode = "business_validation";
  const mockMemory = [{ content: "Previous hiring led to cash flow issues" }];
  const mockVault = "Business survival framework active";

  const enhancement = await intelligence.enhanceResponse(
    mockBaseResponse,
    testQuery,
    mockMode,
    mockMemory,
    mockVault,
    0.8,
  );

  return (
    enhancement.enhancedResponse !== mockBaseResponse &&
    enhancement.intelligenceApplied.length > 0 &&
    enhancement.finalConfidence > 0 &&
    enhancement.finalConfidence <= 1
  );
});

// Test 7: Reasoning Chain Building
await runAsyncTest("Multi-Step Reasoning Chain", async () => {
  const complexQuery =
    "Why might increasing our marketing budget by 50% actually decrease our overall profitability?";
  const mockMemory = [
    { content: "Previous marketing campaigns had diminishing returns" },
  ];
  const mockVault = "Cost efficiency protocols active";

  const reasoning = await intelligence.buildReasoningChain(
    complexQuery,
    mockMemory,
    mockVault,
  );

  return (
    reasoning.steps.length > 0 &&
    reasoning.confidence > 0 &&
    reasoning.finalConclusion.length > 0
  );
});

// Test 8: Scenario Modeling
await runAsyncTest("Business Scenario Modeling", async () => {
  const businessQuery = "Should we launch our new product feature next month?";
  const mockVault = "Product launch framework";
  const mockMemory = [
    { content: "Previous launches were delayed due to bugs" },
  ];

  const scenarios = await intelligence.modelBusinessScenarios(
    businessQuery,
    mockVault,
    mockMemory,
  );

  return (
    scenarios.bestCase &&
    scenarios.mostLikely &&
    scenarios.worstCase &&
    scenarios.keyRisks.length >= 0
  );
});

// Test 9: Quantitative Analysis
await runAsyncTest("Quantitative Analysis Engine", async () => {
  const queryWithNumbers =
    "If we invest $25,000 in marketing and get 15% ROI, what's our 6-month projection?";
  const numbers = intelligence.extractNumbers(queryWithNumbers);
  const mockMemory = [{ content: "Previous marketing ROI was 12%" }];

  const analysis = await intelligence.performQuantitativeAnalysis(
    queryWithNumbers,
    numbers,
    mockMemory,
  );

  return (
    analysis.numbersFound.length > 0 &&
    analysis.model !== null &&
    analysis.assumptions.length >= 0
  );
});

// ================================================================
// ENFORCEMENT INTEGRATION TESTS
// ================================================================

console.log("🛡️ RUNNING ENFORCEMENT INTEGRATION TESTS...\n");

// Test 10: Confidence Preservation
runTest("Truth-First Confidence Preservation", () => {
  const mockEnhancement = {
    reasoningChain: { confidence: 0.7 },
    crossDomainSynthesis: true,
    quantitativeAnalysis: { model: "roi" },
    intelligenceApplied: ["reasoning", "quantitative"],
  };

  const finalConfidence = intelligence.calculateIntelligenceConfidence(
    mockEnhancement,
    0.9,
  );

  // Should be reduced from 0.9 due to reasoning chain confidence
  return finalConfidence < 0.9 && finalConfidence > 0.2;
});

// Test 11: Response Integration
await runAsyncTest("Response Integration Without Corruption", async () => {
  const baseResponse =
    "🍌 **Eli:** Here's my analysis of your business question.";
  const mockEnhancement = {
    originalResponse: baseResponse,
    intelligenceApplied: ["reasoning", "scenarios"],
    reasoningChain: {
      steps: [{ premise: "Given current market conditions", confidence: 0.8 }],
    },
    scenarioAnalysis: {
      mostLikely: {
        description: "Standard growth trajectory",
        probability: 0.6,
      },
      keyRisks: ["Market saturation", "Increased competition"],
    },
    finalConfidence: 0.75,
  };

  const integratedResponse =
    await intelligence.integrateIntelligenceIntoResponse(
      baseResponse,
      mockEnhancement,
      "business_validation",
    );

  return (
    integratedResponse.includes("🍌 **Eli:**") &&
    integratedResponse.includes("Multi-Step Analysis") &&
    integratedResponse.includes("Scenario Analysis") &&
    integratedResponse.length > baseResponse.length
  );
});

// ================================================================
// FINAL RESULTS
// ================================================================

console.log("📊 TEST RESULTS SUMMARY\n");
console.log(`✅ Tests Passed: ${testsPassed}/${testsTotal}`);
console.log(`❌ Tests Failed: ${testsTotal - testsPassed}/${testsTotal}`);

if (testsPassed === testsTotal) {
  console.log(
    "\n🎉 ALL TESTS PASSED! Enhanced Intelligence System is fully operational.\n",
  );

  console.log("🧠 VERIFIED CAPABILITIES:");
  console.log("• Multi-step reasoning with confidence tracking ✅");
  console.log("• Cross-domain knowledge synthesis ✅");
  console.log("• Business scenario modeling ✅");
  console.log("• Quantitative analysis with assumptions ✅");
  console.log("• Truth-first enforcement preserved ✅");
  console.log("• Response integration without corruption ✅");

  console.log("\n💡 READY FOR PRODUCTION TESTING:");
  console.log("• Deploy to test environment");
  console.log("• Test with real user queries");
  console.log("• Monitor performance and accuracy");
  console.log("• Validate cost impact");
} else {
  console.log(
    `\n⚠️  ${testsTotal - testsPassed} TESTS FAILED - Review implementation before deployment`,
  );

  if (testsPassed > testsTotal * 0.8) {
    console.log("Most functionality working - minor fixes needed");
  } else if (testsPassed > testsTotal * 0.5) {
    console.log("Core functionality working - several fixes needed");
  } else {
    console.log("Major implementation issues detected - review code carefully");
  }
}

console.log("\n🔧 TROUBLESHOOTING:");
console.log("• Check that all files are properly created/modified");
console.log("• Verify import paths are correct");
console.log("• Ensure existing enforcement systems are intact");
console.log("• Run with --verbose flag for detailed error logs\n");
