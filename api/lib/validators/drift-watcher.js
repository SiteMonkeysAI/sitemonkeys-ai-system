// /api/lib/validators/drift-watcher.js
// DRIFT WATCHER - Validates semantic classifications against baseline categories
// Prevents semantic analyzer from drifting into invalid classifications

// VERIFIED BASELINES - Matched to your actual semantic_analyzer.js
const BASELINE_DOMAINS = [
  "business",
  "technical",
  "personal",
  "health",
  "financial",
  "creative",
  "general",
];

const BASELINE_INTENTS = [
  "question",
  "command",
  "discussion",
  "problem_solving",
  "decision_making",
  "emotional_expression",
  "information_sharing",
];

class DriftWatcher {
  constructor() {
    this.driftHistory = [];
    this.maxHistorySize = 100;
  }

  async validate({ semanticAnalysis, response, context }) {
    try {
      const domain = semanticAnalysis?.domain;
      const intent = semanticAnalysis?.intent;
      const confidence = semanticAnalysis?.confidence || 1.0;

      const result = {
        driftDetected: false,
        adjustedResponse: response,
        confidenceAdjustment: null,
        warning: null,
        domainValid: true,
        intentValid: true,
      };

      // Check domain drift
      if (domain && !BASELINE_DOMAINS.includes(domain)) {
        result.driftDetected = true;
        result.domainValid = false;

        const newConfidence = Math.max(0.5, confidence - 0.2);

        result.confidenceAdjustment = {
          from: confidence,
          to: newConfidence,
          reason: `Domain "${domain}" not in baseline categories`,
        };

        result.warning = `Semantic analyzer classified domain as "${domain}" which is not in baseline. Reduced confidence from ${confidence.toFixed(2)} to ${newConfidence.toFixed(2)}.`;

        this.#recordDrift("domain", domain, context);
      }

      // Check intent drift
      if (intent && !BASELINE_INTENTS.includes(intent)) {
        result.driftDetected = true;
        result.intentValid = false;

        const newConfidence = Math.max(0.5, confidence - 0.15);

        result.confidenceAdjustment = {
          from: confidence,
          to: newConfidence,
          reason: `Intent "${intent}" not in baseline categories`,
        };

        result.warning = `Semantic analyzer classified intent as "${intent}" which is not in baseline. Reduced confidence from ${confidence.toFixed(2)} to ${newConfidence.toFixed(2)}.`;

        this.#recordDrift("intent", intent, context);
      }

      return result;
    } catch (error) {
      console.error("[DRIFT-WATCHER] Validation error:", error);

      return {
        driftDetected: false,
        adjustedResponse: response,
        warning: `drift_watcher_exception: ${error.message}`,
        error: true,
      };
    }
  }

  #recordDrift(type, value, context) {
    const driftRecord = {
      timestamp: new Date().toISOString(),
      type: type,
      invalidValue: value,
      context: {
        mode: context.mode,
        userId: context.userId,
      },
    };

    this.driftHistory.push(driftRecord);

    if (this.driftHistory.length > this.maxHistorySize) {
      this.driftHistory.shift();
    }

    console.warn(`[DRIFT-WATCHER] Drift detected - ${type}: "${value}"`);
  }

  getDriftStats() {
    return {
      totalDrifts: this.driftHistory.length,
      domainDrifts: this.driftHistory.filter((d) => d.type === "domain").length,
      intentDrifts: this.driftHistory.filter((d) => d.type === "intent").length,
      recentDrifts: this.driftHistory.slice(-10),
    };
  }

  clearHistory() {
    this.driftHistory = [];
  }
}

// Singleton instance
const driftWatcher = new DriftWatcher();

// ES6 EXPORTS
export { driftWatcher, BASELINE_DOMAINS, BASELINE_INTENTS };
