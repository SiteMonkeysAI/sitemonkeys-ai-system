// ================================================================
// PERSONALITY INTEGRATION BRIDGE
// Connects your existing sophisticated server.js to personalities.js
// WITHOUT replacing any existing functionality
// ================================================================

import {
  generateEliResponse,
  generateRoxyResponse,
  determinePersonalityRoute,
} from "./personalities.js";
import OpenAI from "openai";

export class PersonalityBridge {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.logger = {
      log: (msg) =>
        console.log(`[PERSONALITY-BRIDGE] ${new Date().toISOString()} ${msg}`),
      error: (msg, err) =>
        console.error(
          `[PERSONALITY-BRIDGE ERROR] ${new Date().toISOString()} ${msg}`,
          err,
        ),
      warn: (msg) =>
        console.warn(
          `[PERSONALITY-BRIDGE WARN] ${new Date().toISOString()} ${msg}`,
        ),
    };
  }

  // ================================================================
  // BRIDGE METHOD: Use personalities.js if available, fallback to existing system
  // ================================================================

  async generatePersonalityResponse(
    message,
    mode,
    vaultContent,
    conversationHistory,
    personality,
    fallbackFunction,
  ) {
    try {
      this.logger.log(`Attempting to use personalities.js for ${personality}`);

      // Try to use the personality functions from personalities.js
      if (personality === "eli" && generateEliResponse) {
        this.logger.log("Using Eli from personalities.js");
        return await generateEliResponse(
          message,
          mode,
          vaultContent,
          conversationHistory,
          this.openai,
        );
      } else if (personality === "roxy" && generateRoxyResponse) {
        this.logger.log("Using Roxy from personalities.js");
        return await generateRoxyResponse(
          message,
          mode,
          vaultContent,
          conversationHistory,
          this.openai,
        );
      } else {
        this.logger.warn(
          `Personality ${personality} not available in personalities.js, using fallback`,
        );
        return await fallbackFunction();
      }
    } catch (error) {
      this.logger.error(
        `Personality function failed for ${personality}, using fallback:`,
        error,
      );
      return await fallbackFunction();
    }
  }

  // ================================================================
  // BRIDGE METHOD: Enhanced personality routing
  // ================================================================

  selectPersonalityWithBridge(
    message,
    mode,
    vaultHealthy,
    fallbackPersonalityFunction,
  ) {
    try {
      this.logger.log(
        "Attempting to use enhanced personality routing from personalities.js",
      );

      if (determinePersonalityRoute) {
        const route = determinePersonalityRoute(message, mode, vaultHealthy);
        this.logger.log(
          `Enhanced routing selected: ${route.personality} (${route.reason})`,
        );
        return route;
      } else {
        this.logger.warn(
          "Enhanced routing not available, using existing system",
        );
        return {
          personality: fallbackPersonalityFunction(message, mode, vaultHealthy),
          reason: "Using existing server.js personality selection",
          confidence: 0.8,
          cognitive_firewall: "existing_system_enforcement",
        };
      }
    } catch (error) {
      this.logger.error("Enhanced routing failed, using fallback:", error);
      return {
        personality: fallbackPersonalityFunction(message, mode, vaultHealthy),
        reason: "Fallback due to routing error",
        confidence: 0.5,
        cognitive_firewall: "error_fallback",
      };
    }
  }

  // ================================================================
  // DIAGNOSTIC METHODS
  // ================================================================

  checkPersonalitySystemHealth() {
    const health = {
      bridge_active: true,
      personalities_js_available: !!(
        generateEliResponse && generateRoxyResponse
      ),
      routing_available: !!determinePersonalityRoute,
      openai_configured: !!this.openai,
      functions_detected: {
        generateEliResponse: !!generateEliResponse,
        generateRoxyResponse: !!generateRoxyResponse,
        determinePersonalityRoute: !!determinePersonalityRoute,
      },
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      "Personality system health check:",
      JSON.stringify(health, null, 2),
    );
    return health;
  }
}

// ================================================================
// INTEGRATION HELPER FUNCTIONS
// ================================================================

// Format personality response to match existing server.js expectations
export function formatPersonalityResponseForServer(
  personalityResponse,
  personality,
) {
  return {
    response: personalityResponse.response || "No response generated",
    usage: {
      total_tokens: personalityResponse.tokens_used || 0,
      prompt_tokens: Math.floor((personalityResponse.tokens_used || 0) * 0.7),
      completion_tokens: Math.floor(
        (personalityResponse.tokens_used || 0) * 0.3,
      ),
    },
    cost: personalityResponse.cost || 0,
    ai_personality: personality,
    enhanced_intelligence: personalityResponse.enhanced_intelligence || false,
    validation_applied: personalityResponse.validation_applied || false,
    compliance_score: personalityResponse.compliance_score || 100,
    personality_system_used: true,
  };
}

// Export singleton bridge instance
export const personalityBridge = new PersonalityBridge();
