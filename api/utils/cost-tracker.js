// /api/utils/cost-tracker.js
// COST TRACKER - Real-time cost tracking with tiered ceilings
// Prevents runaway costs and enforces budget limits per mode

const COST_CEILINGS = {
  truth_general: 2.0,
  business_validation: 4.0,
  site_monkeys: 6.0,
};

const MODEL_COSTS = {
  'gpt-4': {
    input: 0.03 / 1000,
    output: 0.06 / 1000,
  },
  'gpt-4o': {
    input: 0.005 / 1000,
    output: 0.015 / 1000,
  },
  'claude-sonnet-4.5': {
    input: 0.003 / 1000,
    output: 0.015 / 1000,
  },
  'text-embedding-3-small': {
    input: 0.00002 / 1000,
    output: 0,
  },
};

class CostTracker {
  constructor() {
    this.sessionCosts = new Map();
    this.costHistory = [];
  }

  getSessionCost(sessionId) {
    const session = this.sessionCosts.get(sessionId);
    return session ? session.total : 0;
  }

  getCostCeiling(mode) {
    return COST_CEILINGS[mode] || COST_CEILINGS.truth_general;
  }

  wouldExceedCeiling(sessionId, estimatedCost, mode) {
    const currentCost = this.getSessionCost(sessionId);
    const ceiling = this.getCostCeiling(mode);
    const totalCost = currentCost + estimatedCost;

    return {
      wouldExceed: totalCost > ceiling,
      currentCost,
      estimatedCost,
      totalCost,
      ceiling,
      remaining: Math.max(0, ceiling - totalCost),
    };
  }

  estimateClaudeCost(query, context) {
    try {
      const queryTokens = Math.ceil(query.length / 4);
      const contextTokens = this.#estimateContextTokens(context);
      const inputTokens = queryTokens + contextTokens;
      const outputTokens = Math.min(1200, inputTokens * 1.5);

      const model = 'claude-sonnet-4.5';
      const costs = MODEL_COSTS[model];

      const inputCost = inputTokens * costs.input;
      const outputCost = outputTokens * costs.output;

      return inputCost + outputCost;
    } catch (error) {
      console.error('[COST-TRACKER] Estimation error:', error);
      return 0.05;
    }
  }

  async recordCost(sessionId, cost, source, metadata = {}) {
    try {
      if (!this.sessionCosts.has(sessionId)) {
        this.sessionCosts.set(sessionId, {
          total: 0,
          breakdown: [],
          mode: metadata.mode || 'unknown',
          startTime: Date.now(),
        });
      }

      const session = this.sessionCosts.get(sessionId);
      session.total += cost;
      session.breakdown.push({
        timestamp: new Date().toISOString(),
        source,
        cost,
        metadata,
      });

      this.costHistory.push({
        sessionId,
        source,
        cost,
        total: session.total,
        timestamp: new Date().toISOString(),
      });

      if (this.costHistory.length > 1000) {
        this.costHistory.shift();
      }

      return session.total;
    } catch (error) {
      console.error('[COST-TRACKER] Record error:', error);
      return 0;
    }
  }

  calculateCost(usage, model) {
    try {
      const costs = MODEL_COSTS[model];
      if (!costs) {
        console.warn(`[COST-TRACKER] Unknown model: ${model}`);
        return 0;
      }

      const inputCost = (usage.prompt_tokens || usage.input_tokens || 0) * costs.input;
      const outputCost = (usage.completion_tokens || usage.output_tokens || 0) * costs.output;

      return inputCost + outputCost;
    } catch (error) {
      console.error('[COST-TRACKER] Calculation error:', error);
      return 0;
    }
  }

  #estimateContextTokens(context) {
    let tokens = 0;

    if (context.sources?.hasMemory) tokens += 2500;
    if (context.sources?.hasDocuments) tokens += 3000;
    if (context.sources?.hasVault) tokens += 5000;
    if (context.conversationHistory?.length > 0) {
      tokens += context.conversationHistory.length * 200;
    }

    return tokens;
  }

  getSessionSummary(sessionId) {
    const session = this.sessionCosts.get(sessionId);

    if (!session) {
      return {
        found: false,
        sessionId,
      };
    }

    const ceiling = this.getCostCeiling(session.mode);

    return {
      found: true,
      sessionId,
      total: session.total,
      ceiling,
      percentOfCeiling: (session.total / ceiling) * 100,
      remaining: Math.max(0, ceiling - session.total),
      breakdown: session.breakdown,
      mode: session.mode,
      duration: Date.now() - session.startTime,
    };
  }

  clearSession(sessionId) {
    this.sessionCosts.delete(sessionId);
  }

  getGlobalStats() {
    const sessions = Array.from(this.sessionCosts.values());

    return {
      activeSessions: sessions.length,
      totalCost: sessions.reduce((sum, s) => sum + s.total, 0),
      averageCost:
        sessions.length > 0 ? sessions.reduce((sum, s) => sum + s.total, 0) / sessions.length : 0,
      byMode: {
        truth_general: sessions.filter((s) => s.mode === 'truth_general').length,
        business_validation: sessions.filter((s) => s.mode === 'business_validation').length,
        site_monkeys: sessions.filter((s) => s.mode === 'site_monkeys').length,
      },
      totalRecords: this.costHistory.length,
    };
  }
}

// Singleton instance
const costTracker = new CostTracker();

// ES6 EXPORTS
export { costTracker, COST_CEILINGS, MODEL_COSTS };
