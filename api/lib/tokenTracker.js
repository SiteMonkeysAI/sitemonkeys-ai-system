// PRODUCTION TOKEN TRACKER - Site Monkeys AI System
// Zero-failure session tracking with cost management and enforcement

let sessionData = {
  totalCalls: 0,
  totalTokens: 0,
  totalCost: 0,
  sessionStart: Date.now(),
  lastCall: null,
  costs: {
    eli: 0,
    roxy: 0,
    claude: 0,
  },
  tokens: {
    eli: 0,
    roxy: 0,
    claude: 0,
  },
  calls: {
    eli: 0,
    roxy: 0,
    claude: 0,
  },
  vaultTokensUsed: 0,
  errorCount: 0,
  lastError: null,
  // NEW numeric totals
  promptTokens: 0,
  completionTokens: 0,
};

// Pricing constants (per 1K tokens)
const PRICING = {
  eli: {
    input: 0.001,
    output: 0.002,
  },
  roxy: {
    input: 0.001,
    output: 0.002,
  },
  claude: {
    input: 0.003,
    output: 0.015,
  },
};

/**
 * Track API call with detailed cost and token analysis
 * @param {string} personality - 'eli', 'roxy', or 'claude'
 * @param {number} promptTokens - Input tokens used
 * @param {number} completionTokens - Output tokens generated
 * @param {number} vaultTokens - Vault context tokens included
 * @returns {object} Complete tracking result with costs and session data
 */
export function trackApiCall(
  personality,
  promptTokens,
  completionTokens,
  vaultTokens = 0,
) {
  try {
    if (!personality || !["eli", "roxy", "claude"].includes(personality)) {
      throw new Error("Invalid personality: " + personality);
    }

    if (typeof promptTokens !== "number" || promptTokens < 0) {
      throw new Error("Invalid promptTokens: " + promptTokens);
    }

    if (typeof completionTokens !== "number" || completionTokens < 0) {
      throw new Error("Invalid completionTokens: " + completionTokens);
    }

    const totalTokens = promptTokens + completionTokens;

    const pricing = PRICING[personality];
    const inputCost = (promptTokens * pricing.input) / 1000;
    const outputCost = (completionTokens * pricing.output) / 1000;
    const callCost = inputCost + outputCost;

    sessionData.totalCalls++;
    sessionData.totalTokens += totalTokens;
    sessionData.totalCost += callCost;
    // NEW numeric totals
    sessionData.promptTokens = (sessionData.promptTokens || 0) + promptTokens;
    sessionData.completionTokens =
      (sessionData.completionTokens || 0) + completionTokens;
    sessionData.vaultTokensUsed =
      (sessionData.vaultTokensUsed || 0) + vaultTokens;

    sessionData.lastCall = {
      timestamp: Date.now(),
      personality,
      promptTokens,
      completionTokens,
      totalTokens,
      callCost,
      vaultTokens,
    };

    sessionData.costs[personality] += callCost;
    sessionData.tokens[personality] += totalTokens;
    sessionData.calls[personality]++;

    const warnings = [];

    if (callCost > 0.25) {
      warnings.push("High cost call: $" + callCost.toFixed(4));
    }

    if (sessionData.totalCost > 2.0) {
      warnings.push("Session cost high: $" + sessionData.totalCost.toFixed(4));
    }

    if (personality === "claude" && callCost > 0.5) {
      warnings.push("Claude cost exceeded limit: $" + callCost.toFixed(4));
    }

    console.log(
      "💰 Token Tracking - " +
        personality +
        ": " +
        promptTokens +
        "+" +
        completionTokens +
        "=" +
        totalTokens +
        " tokens, $" +
        callCost.toFixed(4),
    );
    console.log(
      "📊 Session Total: " +
        sessionData.totalCalls +
        " calls, " +
        sessionData.totalTokens +
        " tokens, $" +
        sessionData.totalCost.toFixed(4),
    );

    if (warnings.length > 0) {
      console.log("⚠️ Cost Warnings: " + warnings.join(", "));
    }

    return {
      tokens_used: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      call_cost: callCost,
      input_cost: inputCost,
      output_cost: outputCost,
      vault_tokens: vaultTokens,
      session_total: sessionData.totalCost,
      session_calls: sessionData.totalCalls,
      cumulative_tokens: sessionData.totalTokens,
      warnings: warnings,
      cost_warning: callCost > 0.25,
      session_warning: sessionData.totalCost > 2.0,
      success: true,
      tracked_at: Date.now(),
    };
  } catch (error) {
    sessionData.errorCount++;
    sessionData.lastError = {
      timestamp: Date.now(),
      error: error.message,
      personality,
      promptTokens,
      completionTokens,
    };

    console.error("❌ Token tracking error:", error.message);

    return {
      tokens_used: promptTokens + completionTokens,
      prompt_tokens: promptTokens || 0,
      completion_tokens: completionTokens || 0,
      call_cost: 0,
      session_total: sessionData.totalCost,
      session_calls: sessionData.totalCalls,
      cumulative_tokens: sessionData.totalTokens,
      warnings: ["Tracking error: " + error.message],
      success: false,
      error: error.message,
      tracked_at: Date.now(),
    };
  }
}

/**
 * Get current session data formatted for UI display
 * @returns {object} Session data formatted for frontend consumption
 */
export function formatSessionDataForUI() {
  try {
    const sessionDuration = Date.now() - sessionData.sessionStart;
    const _sessionHours = sessionDuration / (1000 * 60 * 60);

    return {
      // NEW numeric totals (added; do not remove existing display fields)
      promptTokens: sessionData.promptTokens || 0,
      completionTokens: sessionData.completionTokens || 0,
      vaultTokens: sessionData.vaultTokensUsed || 0,
      totalCost: Number(sessionData.totalCost.toFixed(6)),
      totalCalls: sessionData.totalCalls,
      cost_display: "$" + sessionData.totalCost.toFixed(4),
      vault_display: sessionData.vaultTokensUsed + " tokens",
      efficiency_display: "Normal",
      calls_display: sessionData.totalCalls + " calls",
      status: "ACTIVE",
    };
  } catch (error) {
    console.error("❌ Session data formatting error:", error.message);

    return {
      promptTokens: 0,
      completionTokens: 0,
      vaultTokens: 0,
      totalCost: 0,
      totalCalls: 0,
      cost_display: "$0.0000",
      vault_display: "0 tokens",
      efficiency_display: "Error",
      calls_display: "0 calls",
      status: "ERROR",
    };
  }
}

/**
 * Get detailed session statistics
 * @returns {object} Complete session analytics
 */
export function getSessionStats() {
  return {
    ...sessionData,
    sessionDuration: Date.now() - sessionData.sessionStart,
    averageCostPerCall:
      sessionData.totalCalls > 0
        ? sessionData.totalCost / sessionData.totalCalls
        : 0,
    averageTokensPerCall:
      sessionData.totalCalls > 0
        ? sessionData.totalTokens / sessionData.totalCalls
        : 0,
    costBreakdown: {
      eli: {
        cost: sessionData.costs.eli,
        tokens: sessionData.tokens.eli,
        calls: sessionData.calls.eli,
        percentage:
          sessionData.totalCost > 0
            ? (sessionData.costs.eli / sessionData.totalCost) * 100
            : 0,
      },
      roxy: {
        cost: sessionData.costs.roxy,
        tokens: sessionData.tokens.roxy,
        calls: sessionData.calls.roxy,
        percentage:
          sessionData.totalCost > 0
            ? (sessionData.costs.roxy / sessionData.totalCost) * 100
            : 0,
      },
      claude: {
        cost: sessionData.costs.claude,
        tokens: sessionData.tokens.claude,
        calls: sessionData.calls.claude,
        percentage:
          sessionData.totalCost > 0
            ? (sessionData.costs.claude / sessionData.totalCost) * 100
            : 0,
      },
    },
  };
}

/**
 * Reset session tracking data
 */
export function resetSession() {
  const previousSession = { ...sessionData };

  sessionData = {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    sessionStart: Date.now(),
    lastCall: null,
    costs: { eli: 0, roxy: 0, claude: 0 },
    tokens: { eli: 0, roxy: 0, claude: 0 },
    calls: { eli: 0, roxy: 0, claude: 0 },
    vaultTokensUsed: 0,
    errorCount: 0,
    lastError: null,
    promptTokens: 0,
    completionTokens: 0,
  };

  console.log("🔄 Session tracking reset");
  return previousSession;
}

/**
 * Get cost estimation for a planned call
 * @param {string} personality - Target personality
 * @param {number} estimatedPromptTokens - Expected input tokens
 * @param {number} estimatedCompletionTokens - Expected output tokens
 * @returns {object} Cost estimation
 */
export function estimateCallCost(
  personality,
  estimatedPromptTokens,
  estimatedCompletionTokens,
) {
  if (!PRICING[personality]) {
    throw new Error("Invalid personality for cost estimation: " + personality);
  }

  const pricing = PRICING[personality];
  const inputCost = (estimatedPromptTokens * pricing.input) / 1000;
  const outputCost = (estimatedCompletionTokens * pricing.output) / 1000;
  const totalCost = inputCost + outputCost;

  return {
    personality,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedTotalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    inputCost,
    outputCost,
    totalCost,
    projectedSessionCost: sessionData.totalCost + totalCost,
    costWarning: totalCost > 0.25,
    sessionWarning: sessionData.totalCost + totalCost > 2.0,
  };
}

/**
 * Track error in token processing
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error details
 * @param {object} context - Additional context
 */
export function trackError(errorType, errorMessage, context = {}) {
  sessionData.errorCount++;
  sessionData.lastError = {
    timestamp: Date.now(),
    type: errorType,
    message: errorMessage,
    context,
  };

  console.error(
    `❌ Token Tracker Error [${errorType}]: ${errorMessage}`,
    context,
  );
}

// Export all session data getters for debugging
export function getSessionData() {
  return { ...sessionData };
}

export function getCurrentCosts() {
  return { ...sessionData.costs };
}

export function getCurrentTokens() {
  return { ...sessionData.tokens };
}

export function getCurrentCalls() {
  return { ...sessionData.calls };
}
