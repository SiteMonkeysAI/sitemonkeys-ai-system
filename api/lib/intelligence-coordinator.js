// /api/lib/intelligence-coordinator.js
import { EnhancedIntelligence } from "./enhanced-intelligence.js";

class IntelligenceCoordinator {
  constructor() {
    this.enhanced = new EnhancedIntelligence();
  }

  async processQuery(query, context = {}, mode = "truth_general") {
    const results = {
      response: "",
      intelligenceEnhanced: false,
      memoryIntegrated: !!context?.memory,
      enginesActivated: [],
      confidence: 0.9,
    };

    try {
      // STEP 1: Try Extraordinary Intelligence (if integrated)
      if (context?.extraordinary) {
        try {
          const extraordinaryResponse = await context.extraordinary.process(
            query,
            context,
            mode,
          );
          if (extraordinaryResponse?.content) {
            results.response = extraordinaryResponse.content;
            results.intelligenceEnhanced = true;
            results.enginesActivated.push("extraordinary_intelligence");
            results.confidence = extraordinaryResponse.confidence || 0.9;
            return results;
          }
        } catch (e) {
          console.warn(
            "[Coordinator] Extraordinary intelligence failed:",
            e.message,
          );
        }
      }

      // STEP 2: Use pre-enhanced message if provided (contains document context)
      const messageToUse = context?.enhancedMessage || query;
      const baseResponse =
        context?.enhancedMessage || (await this.getBaseResponse(query, mode));

      console.log(
        "📄 [Coordinator] Using message:",
        messageToUse.substring(0, 100) + "...",
      );
      console.log(
        "📄 [Coordinator] Message includes DOCUMENT:",
        messageToUse.includes("DOCUMENT:"),
      );

      // STEP 3: Enhance Response with Intelligence
      const enhanced = await this.enhanced.enhanceResponse(
        baseResponse,
        messageToUse, // ← NOW USES DOCUMENT-ENHANCED MESSAGE
        mode,
        context?.memory || null,
        context?.vault || "",
        0.7,
      );

      results.response = enhanced.enhancedResponse;
      results.intelligenceEnhanced = true;
      results.enginesActivated.push("enhanced_intelligence");
      results.confidence = enhanced.finalConfidence || 0.7;
      return results;
    } catch (err) {
      console.error("[Coordinator] Critical error:", err.message);

      // STEP 4: Attempt Memory-Only Fallback
      if (context?.memory?.memories) {
        try {
          const messageToUse = context?.enhancedMessage || query;
          const base = `Based on historical memory:\n\n${context.memory.memories}\n\nUser asked: ${messageToUse}`;
          const memoryEnhanced = await this.enhanced.enhanceResponse(
            base,
            messageToUse,
            mode,
            context?.memory || null,
            context?.vault || "",
            0.6,
          );
          results.response = memoryEnhanced.enhancedResponse;
          results.intelligenceEnhanced = true;
          results.enginesActivated.push("memory_enhancement");
          results.confidence = memoryEnhanced.finalConfidence || 0.6;
          return results;
        } catch (memError) {
          console.warn(
            "[Coordinator] Memory enhancement failed:",
            memError.message,
          );
        }
      }

      // STEP 5: Basic fallback
      const messageToUse = context?.enhancedMessage || query;
      results.response = `Let's work through this together. You asked: ${messageToUse}`;
      results.enginesActivated.push("basic_fallback");
      results.confidence = 0.9;
      return results;
    }
  }

  async getBaseResponse(query, mode) {
    // You can upgrade this later to use OpenAI or Claude, but keep it minimal for fallback
    return `Let's work through this together. You asked: ${query}`;
  }
}

const coordinator = new IntelligenceCoordinator();
export { IntelligenceCoordinator, coordinator };
