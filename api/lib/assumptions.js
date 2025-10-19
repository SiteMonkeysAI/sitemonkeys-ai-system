// COMPLETE ASSUMPTION HEALTH MONITORING SYSTEM
// TIER 1: ASSUMPTION DETECTION AND TRACKING
// TIER 2: HEALTH ASSESSMENT AND CONFLICT DETECTION
// TIER 3: OVERRIDE TRACKING AND PATTERN ANALYSIS

import crypto from "node:crypto";

// Helper functions for logging and drift status
function logOverride(type, details, _context) {
  console.log(`[ASSUMPTION OVERRIDE] ${type}:`, details);
}

function getDriftStatus() {
  return "stable"; // Default drift status
}

// TIER 3: ASSUMPTION TRACKING DATABASE
let assumptionDatabase = {
  session_assumptions: [],
  override_history: [],
  pattern_warnings: [],
  health_scores: {},
  last_reset: Date.now(),
};

// TIER 1: ASSUMPTION DETECTION
export function checkAssumptionHealth(response) {
  const detectedAssumptions = extractAssumptions(response);
  const healthMetrics = calculateHealthMetrics(detectedAssumptions);

  // Update assumption database
  detectedAssumptions.forEach((assumption) => {
    assumptionDatabase.session_assumptions.push({
      text: assumption.text,
      type: assumption.type,
      confidence: assumption.confidence,
      timestamp: Date.now(),
      health_score: assumption.health_score,
    });
  });

  return {
    assumptions_detected: detectedAssumptions.length,
    assumptions: detectedAssumptions,
    overall_health: healthMetrics.overall_health,
    risk_level: healthMetrics.risk_level,
    recommendations: healthMetrics.recommendations,
  };
}

// TIER 1: ASSUMPTION EXTRACTION
function extractAssumptions(response) {
  const assumptions = [];

  // Pattern-based assumption detection
  const ASSUMPTION_PATTERNS = [
    {
      pattern: /obviously|clearly|everyone knows|it's common knowledge/gi,
      type: "universal_claim",
      risk_level: "high",
      health_penalty: -20,
    },
    {
      pattern: /always works|never fails|guaranteed|100% success/gi,
      type: "absolute_certainty",
      risk_level: "critical",
      health_penalty: -30,
    },
    {
      pattern: /most people|generally|typically|usually/gi,
      type: "generalization",
      risk_level: "medium",
      health_penalty: -10,
    },
    {
      pattern: /should|must|need to|have to/gi,
      type: "normative_assumption",
      risk_level: "low",
      health_penalty: -5,
    },
    {
      pattern: /studies show|research indicates|data suggests/gi,
      type: "evidence_based",
      risk_level: "low",
      health_penalty: 0,
      health_bonus: 15,
    },
  ];

  ASSUMPTION_PATTERNS.forEach((pattern) => {
    const matches = [...response.matchAll(pattern.pattern)];
    matches.forEach((match) => {
      assumptions.push({
        text: match[0],
        type: pattern.type,
        risk_level: pattern.risk_level,
        confidence: calculateAssumptionConfidence(match[0], pattern.type),
        health_score:
          100 + (pattern.health_penalty || 0) + (pattern.health_bonus || 0),
        position: match.index,
        context: extractContext(response, match.index, 50),
      });
    });
  });

  return assumptions;
}

// TIER 2: ASSUMPTION CONFIDENCE CALCULATION
function calculateAssumptionConfidence(assumptionText, type) {
  let baseConfidence = 50;

  // Adjust based on assumption type
  const typeModifiers = {
    evidence_based: 40,
    normative_assumption: 10,
    generalization: -15,
    universal_claim: -25,
    absolute_certainty: -40,
  };

  baseConfidence += typeModifiers[type] || 0;

  // Adjust based on qualifier words
  if (/might|maybe|possibly|perhaps/i.test(assumptionText))
    baseConfidence += 20;
  if (/definitely|absolutely|certainly/i.test(assumptionText))
    baseConfidence -= 20;
  if (/studies|research|data|evidence/i.test(assumptionText))
    baseConfidence += 25;

  return Math.max(0, Math.min(100, baseConfidence));
}

// TIER 2: HEALTH METRICS CALCULATION
function calculateHealthMetrics(assumptions) {
  if (assumptions.length === 0) {
    return {
      overall_health: 100,
      risk_level: "none",
      recommendations: ["Continue with current analytical rigor"],
    };
  }

  const avgHealth =
    assumptions.reduce((sum, a) => sum + a.health_score, 0) /
    assumptions.length;
  const criticalCount = assumptions.filter(
    (a) => a.risk_level === "critical",
  ).length;
  const highRiskCount = assumptions.filter(
    (a) => a.risk_level === "high",
  ).length;

  let risk_level = "low";
  let recommendations = [];

  if (criticalCount > 0) {
    risk_level = "critical";
    recommendations.push("IMMEDIATE ACTION: Remove absolute certainty claims");
    recommendations.push(
      "Add uncertainty qualifiers and evidence requirements",
    );
  } else if (highRiskCount > 2) {
    risk_level = "high";
    recommendations.push("Challenge universal claims with counterexamples");
    recommendations.push("Request evidence for broad generalizations");
  } else if (avgHealth < 70) {
    risk_level = "medium";
    recommendations.push("Add confidence indicators to uncertain claims");
    recommendations.push("Consider alternative perspectives");
  } else {
    recommendations.push("Assumption health is acceptable");
    recommendations.push("Continue current analytical approach");
  }

  return {
    overall_health: Math.round(avgHealth),
    risk_level,
    recommendations,
    critical_assumptions: criticalCount,
    high_risk_assumptions: highRiskCount,
  };
}

// TIER 2: CONFLICT DETECTION
export function detectAssumptionConflicts(response, vaultContext) {
  const conflicts = [];
  const responseAssumptions = extractAssumptions(response);

  if (vaultContext) {
    const vaultAssumptions = extractAssumptions(vaultContext);

    // Check for direct conflicts between response and vault assumptions
    responseAssumptions.forEach((respAssumption) => {
      vaultAssumptions.forEach((vaultAssumption) => {
        const conflictLevel = calculateConflictLevel(
          respAssumption,
          vaultAssumption,
        );
        if (conflictLevel > 0.6) {
          conflicts.push({
            type: "vault_response_conflict",
            response_assumption: respAssumption.text,
            vault_assumption: vaultAssumption.text,
            conflict_level: conflictLevel,
            severity: conflictLevel > 0.8 ? "critical" : "moderate",
            resolution_required: true,
          });
        }
      });
    });
  }

  // Check for internal conflicts within response
  for (let i = 0; i < responseAssumptions.length; i++) {
    for (let j = i + 1; j < responseAssumptions.length; j++) {
      const conflictLevel = calculateConflictLevel(
        responseAssumptions[i],
        responseAssumptions[j],
      );
      if (conflictLevel > 0.7) {
        conflicts.push({
          type: "internal_conflict",
          assumption_1: responseAssumptions[i].text,
          assumption_2: responseAssumptions[j].text,
          conflict_level: conflictLevel,
          severity: "moderate",
          resolution_required: true,
        });
      }
    }
  }

  return conflicts;
}

// TIER 2: CONFLICT LEVEL CALCULATION
function calculateConflictLevel(assumption1, assumption2) {
  // Simplified conflict detection - in production this would be more sophisticated
  const text1 = assumption1.text.toLowerCase();
  const text2 = assumption2.text.toLowerCase();

  // Look for contradictory words
  const contradictions = [
    ["always", "never"],
    ["all", "none"],
    ["must", "cannot"],
    ["required", "optional"],
    ["increase", "decrease"],
    ["profitable", "unprofitable"],
  ];

  let conflictScore = 0;
  contradictions.forEach(([word1, word2]) => {
    if (
      (text1.includes(word1) && text2.includes(word2)) ||
      (text1.includes(word2) && text2.includes(word1))
    ) {
      conflictScore += 0.4;
    }
  });

  // Check for opposing sentiment
  if (
    (assumption1.health_score > 80 && assumption2.health_score < 40) ||
    (assumption1.health_score < 40 && assumption2.health_score > 80)
  ) {
    conflictScore += 0.3;
  }

  return Math.min(1.0, conflictScore);
}

// TIER 3: OVERRIDE TRACKING
export function trackOverride(
  overrideType,
  originalAssumption,
  newAssumption,
  reason,
) {
  const override = {
    timestamp: Date.now(),
    type: overrideType,
    original: originalAssumption,
    new: newAssumption,
    reason: reason,
    session_id: generateSessionId(),
  };

  assumptionDatabase.override_history.push(override);

  // Check for override patterns
  const patterns = detectOverridePatterns();
  if (patterns.length > 0) {
    patterns.forEach((pattern) => {
      assumptionDatabase.pattern_warnings.push({
        pattern: pattern.type,
        frequency: pattern.frequency,
        warning_level: pattern.severity,
        timestamp: Date.now(),
        recommendation: pattern.recommendation,
      });
    });
  }

  // Log to system
  logOverride(overrideType, reason, "assumption_system");

  return {
    override_logged: true,
    override_id: override.timestamp,
    patterns_detected: patterns.length,
    patterns: patterns,
  };
}

// TIER 3: PATTERN DETECTION
function detectOverridePatterns() {
  const patterns = [];
  const recent = assumptionDatabase.override_history.filter(
    (override) => Date.now() - override.timestamp < 24 * 60 * 60 * 1000, // Last 24 hours
  );

  // Pattern 1: Frequent assumption bypassing
  const bypassCount = recent.filter(
    (o) => o.type === "assumption_bypass",
  ).length;
  if (bypassCount >= 3) {
    patterns.push({
      type: "frequent_assumption_bypass",
      frequency: bypassCount,
      severity: "high",
      recommendation:
        "Review assumption validation standards - possible drift detected",
    });
  }

  // Pattern 2: Repeated confidence reduction
  const confidenceReductions = recent.filter(
    (o) => o.type === "confidence_reduction",
  ).length;
  if (confidenceReductions >= 5) {
    patterns.push({
      type: "confidence_erosion",
      frequency: confidenceReductions,
      severity: "medium",
      recommendation: "Evidence standards may need reinforcement",
    });
  }

  // Pattern 3: Same assumption repeatedly overridden
  const assumptionTexts = recent.map((o) => o.original);
  const duplicates = assumptionTexts.filter(
    (text, index) => assumptionTexts.indexOf(text) !== index,
  );

  if (duplicates.length > 0) {
    patterns.push({
      type: "repeated_assumption_override",
      frequency: duplicates.length,
      severity: "critical",
      recommendation:
        "Investigate why the same assumptions are repeatedly challenged",
    });
  }

  return patterns;
}

// TIER 3: HELPER FUNCTIONS
function extractContext(text, position, radius) {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  return text.substring(start, end);
}

function generateSessionId() {
  return `assumption-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

// TIER 3: REPORTING AND ANALYTICS
export function getAssumptionReport() {
  const totalAssumptions = assumptionDatabase.session_assumptions.length;
  const overrideCount = assumptionDatabase.override_history.length;
  const patternWarnings = assumptionDatabase.pattern_warnings.length;

  const healthScores = assumptionDatabase.session_assumptions.map(
    (a) => a.health_score,
  );
  const avgHealth =
    healthScores.length > 0
      ? healthScores.reduce((sum, score) => sum + score, 0) /
        healthScores.length
      : 100;

  const riskDistribution = assumptionDatabase.session_assumptions.reduce(
    (dist, assumption) => {
      const type = assumption.type;
      dist[type] = (dist[type] || 0) + 1;
      return dist;
    },
    {},
  );

  return {
    session_summary: {
      total_assumptions: totalAssumptions,
      override_count: overrideCount,
      pattern_warnings: patternWarnings,
      average_health: Math.round(avgHealth),
      system_drift_status: getDriftStatus(),
    },

    risk_distribution: riskDistribution,

    recent_patterns: assumptionDatabase.pattern_warnings.slice(-5),

    recommendations: generateHealthRecommendations(
      avgHealth,
      overrideCount,
      patternWarnings,
    ),

    session_health: calculateSessionHealth(),
  };
}

function generateHealthRecommendations(
  avgHealth,
  overrideCount,
  patternWarnings,
) {
  const recommendations = [];

  if (avgHealth < 60) {
    recommendations.push(
      "CRITICAL: Assumption health below acceptable threshold. Review evidence standards.",
    );
  } else if (avgHealth < 75) {
    recommendations.push(
      "WARNING: Assumption health declining. Increase evidence requirements.",
    );
  }

  if (overrideCount > 10) {
    recommendations.push(
      "HIGH OVERRIDE RATE: Review system integrity. Possible logic drift detected.",
    );
  }

  if (patternWarnings > 3) {
    recommendations.push(
      "PATTERN ALERT: Multiple warning patterns detected. System review recommended.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Assumption health is within acceptable parameters.");
  }

  return recommendations;
}

function calculateSessionHealth() {
  const assumptions = assumptionDatabase.session_assumptions;
  if (assumptions.length === 0) return 100;

  const avgHealth =
    assumptions.reduce((sum, a) => sum + a.health_score, 0) /
    assumptions.length;
  const overridePenalty = assumptionDatabase.override_history.length * 2;
  const patternPenalty = assumptionDatabase.pattern_warnings.length * 5;

  return Math.max(
    0,
    Math.min(100, avgHealth - overridePenalty - patternPenalty),
  );
}

// TIER 3: SYSTEM RESET AND MAINTENANCE
export function resetAssumptionTracking() {
  assumptionDatabase = {
    session_assumptions: [],
    override_history: [],
    pattern_warnings: [],
    health_scores: {},
    last_reset: Date.now(),
  };

  return {
    status: "Assumption tracking reset successfully",
    timestamp: Date.now(),
  };
}
