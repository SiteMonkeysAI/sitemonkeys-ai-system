// /api/lib/validators/memory-usage-enforcer.js
// MEMORY USAGE ENFORCER - Prevents AI from claiming ignorance when memory was provided

const IGNORANCE_PHRASES = [
  "i dont have information",
  "i dont have any information",
  "i dont know",
  "you havent told me",
  "you didnt tell me",
  "im not aware",
  "i dont recall",
  "you didnt mention",
  "you havent mentioned",
  "i have no record",
  "i dont see any",
  "i dont have access to",
  "i dont have that information",
  "i wasnt told",
  "you havent shared",
  "i cant see any information about",
  "i dont have details about",
  "no information about",
];

class MemoryUsageEnforcer {
  constructor() {
    this.violationHistory = [];
    this.maxHistorySize = 100;
  }

  async enforce({ response, context }) {
    try {
      const hasMemory = context.sources?.hasMemory;
      const memoryTokens = context.tokenBreakdown?.memory || 0;

      if (!hasMemory || memoryTokens === 0) {
        return {
          violation: false,
          reason: "no_memory_provided",
          modified: false,
          response: response,
        };
      }

      const responseLower = response.toLowerCase();
      let violation = false;
      let matchedPhrase = null;

      for (const phrase of IGNORANCE_PHRASES) {
        if (responseLower.includes(phrase)) {
          violation = true;
          matchedPhrase = phrase;
          break;
        }
      }

      if (!violation) {
        return {
          violation: false,
          reason: "memory_usage_compliant",
          modified: false,
          response: response,
        };
      }

      console.log(`[MEMORY-ENFORCER] VIOLATION: AI claimed ignorance with ${memoryTokens} tokens of memory`);

      this.recordViolation(matchedPhrase, memoryTokens, context);

      const correction = this.generateCorrection(memoryTokens);
      const correctedResponse = response + correction;

      return {
        violation: true,
        severity: "high",
        reason: "claimed_ignorance_with_memory",
        matchedPhrase: matchedPhrase,
        memoryTokens: memoryTokens,
        modified: true,
        response: correctedResponse,
      };
    } catch (error) {
      console.error("[MEMORY-ENFORCER] Error:", error);
      return {
        violation: false,
        reason: "enforcer_error",
        error: error.message,
        modified: false,
        response: response,
      };
    }
  }

  generateCorrection(memoryTokens) {
    const memoryCount = Math.ceil(memoryTokens / 10);
    return `

---

**[System Correction]**

I apologize - I need to correct my previous statement. I DO have information from our previous conversations (${memoryCount} relevant memories, ~${memoryTokens} tokens of context).

Let me re-examine the memory context I have available and provide a more accurate response based on what you shared with me previously.`;
  }

  recordViolation(matchedPhrase, memoryTokens, context) {
    const violationRecord = {
      timestamp: new Date().toISOString(),
      matchedPhrase: matchedPhrase,
      memoryTokens: memoryTokens,
      context: {
        mode: context.mode,
        userId: context.userId,
        sessionId: context.sessionId,
      },
    };

    this.violationHistory.push(violationRecord);

    if (this.violationHistory.length > this.maxHistorySize) {
      this.violationHistory.shift();
    }
  }

  getViolationStats() {
    return {
      totalViolations: this.violationHistory.length,
      recentViolations: this.violationHistory.slice(-10),
    };
  }
}

const memoryUsageEnforcer = new MemoryUsageEnforcer();

export { memoryUsageEnforcer, IGNORANCE_PHRASES };
