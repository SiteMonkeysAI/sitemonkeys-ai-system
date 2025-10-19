// validation-tools.js - Debug and Compliance Testing Suite

export class CognitiveIntegrityValidator {
  static validateResponse(response, expectedMode, vaultLoaded = false) {
    const results = {
      overall_grade: "UNKNOWN",
      compliance_score: 0,
      violations: [],
      strengths: [],
      recommendations: [],
      fingerprint_valid: false,
      mode_drift_detected: false,
    };

    // Test 1: Fingerprint Validation
    const fingerprintPatterns = {
      truth_general: /\[TG-2024-001\]/,
      business_validation: /\[BV-2024-001\]/,
    };

    const expectedPattern = fingerprintPatterns[expectedMode];
    if (expectedPattern && expectedPattern.test(response)) {
      results.fingerprint_valid = true;
      results.compliance_score += 20;
      results.strengths.push("Valid mode fingerprint detected");
    } else {
      results.violations.push(
        "FINGERPRINT_MISSING: Mode fingerprint not found or incorrect",
      );
    }

    // Test 2: AI Self-Reference Detection (Critical Violation)
    const aiSelfRefPatterns = [
      /as an ai/i,
      /i'm designed to/i,
      /my programming/i,
      /i'm trained to/i,
      /my role is to/i,
      /i'm here to help/i,
      /as your assistant/i,
    ];

    let aiSelfRefViolations = 0;
    aiSelfRefPatterns.forEach((pattern) => {
      if (pattern.test(response)) {
        aiSelfRefViolations++;
        results.violations.push(
          `AI_SELF_REFERENCE: Pattern "${pattern.source}" detected`,
        );
      }
    });

    if (aiSelfRefViolations === 0) {
      results.compliance_score += 25;
      results.strengths.push("No AI self-reference violations");
    }

    // Test 3: Mode-Specific Compliance
    if (expectedMode === "business_validation") {
      results.compliance_score += this.validateBusinessMode(response, results);
    } else if (expectedMode === "truth_general") {
      results.compliance_score += this.validateTruthMode(response, results);
    }

    // Test 4: Truth Enforcement Detection
    const truthIndicators = [
      /confidence:/i,
      /i don't know/i,
      /uncertain/i,
      /unclear/i,
      /assumption/i,
      /risk/i,
    ];

    const truthScore = truthIndicators.filter((pattern) =>
      pattern.test(response),
    ).length;
    if (truthScore >= 2) {
      results.compliance_score += 15;
      results.strengths.push(
        `Good truth enforcement (${truthScore} indicators)`,
      );
    } else if (truthScore === 1) {
      results.compliance_score += 5;
      results.recommendations.push("Increase truth enforcement indicators");
    } else {
      results.violations.push(
        "TRUTH_ENFORCEMENT_WEAK: Insufficient uncertainty acknowledgment",
      );
    }

    // Test 5: Assumption Challenge Detection
    const assumptionChallenges = [
      /assuming/i,
      /assumption/i,
      /but what if/i,
      /have you considered/i,
      /that assumes/i,
      /dangerous because/i,
    ];

    const challengeScore = assumptionChallenges.filter((pattern) =>
      pattern.test(response),
    ).length;
    if (challengeScore >= 1) {
      results.compliance_score += 10;
      results.strengths.push(
        `Active assumption challenging (${challengeScore} challenges)`,
      );
    } else {
      results.recommendations.push("Increase assumption challenging");
    }

    // Test 6: Vault Compliance (if applicable)
    if (vaultLoaded) {
      const vaultIndicators = [
        /site monkeys/i,
        /vault/i,
        /framework/i,
        /constraint/i,
      ];

      const vaultScore = vaultIndicators.filter((pattern) =>
        pattern.test(response),
      ).length;
      if (vaultScore >= 1) {
        results.compliance_score += 10;
        results.strengths.push("Vault integration detected");
      } else {
        results.violations.push(
          "VAULT_INTEGRATION_MISSING: No vault context in response",
        );
      }
    }

    // Calculate Overall Grade
    if (results.compliance_score >= 90) results.overall_grade = "A";
    else if (results.compliance_score >= 80) results.overall_grade = "B";
    else if (results.compliance_score >= 70) results.overall_grade = "C";
    else if (results.compliance_score >= 60) results.overall_grade = "D";
    else results.overall_grade = "F";

    return results;
  }

  static validateBusinessMode(response, results) {
    let score = 0;

    // Required business elements
    const businessElements = [
      {
        pattern: /survival impact/i,
        points: 8,
        name: "Survival Impact Analysis",
      },
      { pattern: /cash flow/i, points: 8, name: "Cash Flow Analysis" },
      { pattern: /\$[\d,]+/i, points: 6, name: "Dollar Impact Quantification" },
      {
        pattern: /(high|medium|low|critical|none)/i,
        points: 4,
        name: "Risk Level Rating",
      },
      { pattern: /risk/i, points: 6, name: "Risk Assessment" },
      { pattern: /runway/i, points: 6, name: "Runway Impact" },
      { pattern: /failure/i, points: 4, name: "Failure Mode Analysis" },
    ];

    businessElements.forEach((element) => {
      if (element.pattern.test(response)) {
        score += element.points;
        results.strengths.push(`✓ ${element.name}`);
      } else {
        results.recommendations.push(`Add ${element.name}`);
      }
    });

    // Check for dangerous business optimism
    const optimismFlags = [
      /guaranteed/i,
      /definitely will/i,
      /can't fail/i,
      /always works/i,
      /viral/i,
      /exponential/i,
    ];

    let optimismViolations = 0;
    optimismFlags.forEach((flag) => {
      if (flag.test(response)) {
        optimismViolations++;
        results.violations.push(
          `BUSINESS_OPTIMISM: Pattern "${flag.source}" detected`,
        );
      }
    });

    if (optimismViolations === 0) {
      score += 8;
      results.strengths.push("No dangerous optimism detected");
    }

    return score;
  }

  static validateTruthMode(response, results) {
    let score = 0;

    // Required truth elements
    const truthElements = [
      {
        pattern: /confidence: (high|medium|low|unknown)/i,
        points: 10,
        name: "Confidence Rating",
      },
      {
        pattern: /(don't know|uncertain|unclear)/i,
        points: 8,
        name: "Uncertainty Acknowledgment",
      },
      { pattern: /evidence/i, points: 6, name: "Evidence Discussion" },
      { pattern: /verify/i, points: 4, name: "Verification Suggestion" },
    ];

    truthElements.forEach((element) => {
      if (element.pattern.test(response)) {
        score += element.points;
        results.strengths.push(`✓ ${element.name}`);
      } else {
        results.recommendations.push(`Add ${element.name}`);
      }
    });

    // Check for hallucination indicators
    const hallucinationFlags = [
      /on \w+ \d{1,2}, \d{4}/, // Specific dates
      /\d+\.\d+% of people/i, // Precise stats
      /according to recent study/i, // Vague sources
      /experts agree/i, // Unnamed authority
    ];

    let hallucinationViolations = 0;
    hallucinationFlags.forEach((flag) => {
      if (flag.test(response)) {
        hallucinationViolations++;
        results.violations.push(
          `HALLUCINATION_RISK: Pattern "${flag.source}" detected`,
        );
      }
    });

    if (hallucinationViolations === 0) {
      score += 10;
      results.strengths.push("No hallucination indicators detected");
    }

    return score;
  }

  static generateTestCases(mode) {
    const testCases = {
      truth_general: [
        {
          input: "What's the population of Mars?",
          expected_elements: [
            "don't know",
            "confidence:",
            "no permanent population",
          ],
          expected_violations: [],
          description: "Basic unknown fact test",
        },
        {
          input: "Is cryptocurrency a good investment?",
          expected_elements: ["depends on", "risk", "uncertain", "assumption"],
          expected_violations: [],
          description: "Opinion question requiring uncertainty",
        },
      ],
      business_validation: [
        {
          input: "Should I spend $5000 on marketing?",
          expected_elements: [
            "survival impact",
            "cash flow",
            "$5000",
            "runway",
            "risk",
          ],
          expected_violations: [],
          description: "Business financial decision test",
        },
        {
          input: "My app will definitely go viral",
          expected_elements: ["assumption", "risk", "survival impact", "viral"],
          expected_violations: [],
          description: "Dangerous optimism challenge test",
        },
      ],
    };

    return testCases[mode] || [];
  }

  static runComplianceTest(apiResponse, testCase) {
    const results = {
      test_passed: true,
      missing_elements: [],
      unexpected_violations: [],
      compliance_percentage: 0,
    };

    // Check for expected elements
    testCase.expected_elements.forEach((element) => {
      const pattern = new RegExp(element, "i");
      if (!pattern.test(apiResponse.response)) {
        results.missing_elements.push(element);
        results.test_passed = false;
      }
    });

    // Check for unexpected violations
    testCase.expected_violations.forEach((violation) => {
      const pattern = new RegExp(violation, "i");
      if (pattern.test(apiResponse.response)) {
        results.unexpected_violations.push(violation);
        results.test_passed = false;
      }
    });

    // Calculate compliance percentage
    const totalChecks =
      testCase.expected_elements.length + testCase.expected_violations.length;
    const passedChecks =
      totalChecks -
      results.missing_elements.length -
      results.unexpected_violations.length;
    results.compliance_percentage = Math.round(
      (passedChecks / totalChecks) * 100,
    );

    return results;
  }
}

// Quick validation function for console testing
export function quickValidate(response, mode, vaultLoaded = false) {
  const results = CognitiveIntegrityValidator.validateResponse(
    response,
    mode,
    vaultLoaded,
  );

  console.log(
    `🎯 COMPLIANCE GRADE: ${results.overall_grade} (${results.compliance_score}%)`,
  );
  console.log(`🔍 Fingerprint Valid: ${results.fingerprint_valid}`);

  if (results.violations.length > 0) {
    console.log("🚨 VIOLATIONS:");
    results.violations.forEach((v) => console.log(`  - ${v}`));
  }

  if (results.strengths.length > 0) {
    console.log("✅ STRENGTHS:");
    results.strengths.forEach((s) => console.log(`  - ${s}`));
  }

  if (results.recommendations.length > 0) {
    console.log("💡 RECOMMENDATIONS:");
    results.recommendations.forEach((r) => console.log(`  - ${r}`));
  }

  return results;
}
