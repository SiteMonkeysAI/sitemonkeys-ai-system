// /api/lib/validators/initiative-enforcer.js
// INITIATIVE ENFORCER - Removes passive language, enforces proactive tone
// Ensures AI takes ownership and provides actionable guidance

const PASSIVE_PATTERNS = [
  {
    pattern: /\bmight want to consider\b/gi,
    eli: "should consider",
    roxy: "I recommend considering",
  },
  {
    pattern: /\byou could try\b/gi,
    eli: "try",
    roxy: "I suggest trying",
  },
  {
    pattern: /\bmaybe think about\b/gi,
    eli: "consider",
    roxy: "think about",
  },
  {
    pattern: /\bit depends on many factors\b/gi,
    eli: "the key factors are",
    roxy: "what matters most is",
  },
  {
    pattern: /\bprobably should\b/gi,
    eli: "should",
    roxy: "I recommend",
  },
  {
    pattern: /\byou might want to\b/gi,
    eli: "you should",
    roxy: "I recommend you",
  },
  {
    pattern: /\bperhaps you could\b/gi,
    eli: "you should",
    roxy: "consider",
  },
  {
    pattern: /\bI don't know, but\b/gi,
    eli: "Based on available information,",
    roxy: "What I can tell you is",
  },
];

class InitiativeEnforcer {
  constructor() {
    this.enforcementHistory = [];
  }

  async enforce({ response, personality = "eli", context = {} }) {
    try {
      let modified = false;
      let enforcedResponse = response;
      let reason = "";
      const modificationsApplied = [];

      for (const { pattern, eli, roxy } of PASSIVE_PATTERNS) {
        if (pattern.test(enforcedResponse)) {
          modified = true;

          const replacement = personality === "roxy" ? roxy : eli;
          const originalPhrase =
            enforcedResponse.match(pattern)?.[0] || "passive language";

          enforcedResponse = enforcedResponse.replace(pattern, replacement);

          modificationsApplied.push({
            original: originalPhrase,
            replacement: replacement,
          });

          reason = "Removed passive language, enforced proactive tone";
          break;
        }
      }

      if (modified) {
        this.#recordEnforcement(modificationsApplied, personality, context);
      }

      return {
        modified,
        response: enforcedResponse,
        reason: modified ? reason : undefined,
        modificationsApplied: modified ? modificationsApplied : [],
      };
    } catch (error) {
      console.error("[INITIATIVE-ENFORCER] Enforcement error:", error);

      return {
        modified: false,
        response: response,
        error: error.message,
      };
    }
  }

  #recordEnforcement(modifications, personality, context) {
    const record = {
      timestamp: new Date().toISOString(),
      personality,
      modifications,
      mode: context.mode,
    };

    this.enforcementHistory.push(record);

    if (this.enforcementHistory.length > 100) {
      this.enforcementHistory.shift();
    }
  }

  getEnforcementStats() {
    return {
      totalEnforcements: this.enforcementHistory.length,
      byPersonality: {
        eli: this.enforcementHistory.filter((e) => e.personality === "eli")
          .length,
        roxy: this.enforcementHistory.filter((e) => e.personality === "roxy")
          .length,
      },
      recentEnforcements: this.enforcementHistory.slice(-10),
    };
  }
}

// Singleton instance
const initiativeEnforcer = new InitiativeEnforcer();

// ES6 EXPORTS
export { initiativeEnforcer, PASSIVE_PATTERNS };
