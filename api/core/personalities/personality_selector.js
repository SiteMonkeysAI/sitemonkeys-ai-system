// /api/core/personalities/personality_selector.js
// PERSONALITY SELECTOR - Chooses between Eli and Roxy based on analysis
// Uses scoring system to determine optimal personality for each request

const MIN_SELECTION_CONFIDENCE = 0.3;

export class PersonalitySelector {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[SELECTOR] ${msg}`),
      error: (msg, err) => console.error(`[SELECTOR ERROR] ${msg}`, err),
    };
  }

  selectPersonality(analysis, mode, context) {
    try {
      this.logger.log("Selecting personality based on analysis...");

      let score = {
        eli: 0,
        roxy: 0,
      };

      // Domain-based selection
      if (analysis.domain === "business" || analysis.domain === "technical") {
        score.eli += 3;
      } else if (
        analysis.domain === "personal" ||
        analysis.domain === "creative"
      ) {
        score.roxy += 3;
      }

      // Intent-based selection
      if (
        analysis.intent === "problem_solving" ||
        analysis.intent === "decision_making"
      ) {
        if (analysis.complexity > 0.7) {
          score.eli += 2;
        } else {
          score.roxy += 2;
        }
      }

      // Emotional context
      if (analysis.emotionalWeight > 0.6) {
        score.roxy += 2;
      }

      // Mode preference
      if (mode === "business_validation" || mode === "site_monkeys") {
        score.eli += 2;
      }

      // Complexity consideration
      if (analysis.complexity > 0.8) {
        score.eli += 1;
      }

      const totalScore = score.eli + score.roxy;
      const eliConfidence = totalScore > 0 ? score.eli / totalScore : 0.5;
      const roxyConfidence = totalScore > 0 ? score.roxy / totalScore : 0.5;
      const selectionConfidence = Math.max(eliConfidence, roxyConfidence);

      // ========== COMPLIANCE FALLBACK (NEW) ==========
      if (selectionConfidence < MIN_SELECTION_CONFIDENCE) {
        this.logger.log(
          `Selection confidence too low (${selectionConfidence.toFixed(2)}), using safe default`,
        );

        return {
          personality: "eli",
          confidence: selectionConfidence,
          fallback: true,
          reason:
            "Selection confidence below threshold, defaulted to Eli for analytical safety",
        };
      }

      // ========== CONTRACT VALIDATION (NEW) ==========
      if (mode === "site_monkeys") {
        const isBusinessTechnical =
          analysis.domain === "business" || analysis.domain === "technical";

        if (
          isBusinessTechnical &&
          Math.abs(eliConfidence - roxyConfidence) < 0.15
        ) {
          return {
            personality: "eli",
            confidence: eliConfidence,
            override: true,
            reason:
              "Site Monkeys mode + business/technical domain requires Eli's analytical approach",
          };
        }
      }

      // ========== NORMAL SELECTION ==========
      const selectedPersonality =
        eliConfidence > roxyConfidence ? "eli" : "roxy";
      const selectedConfidence = Math.max(eliConfidence, roxyConfidence);

      this.logger.log(
        `Selected ${selectedPersonality} (Eli: ${score.eli}, Roxy: ${score.roxy})`,
      );

      return {
        personality: selectedPersonality,
        confidence: selectedConfidence,
        scores: score,
        reasoning: `Domain: ${analysis.domain}, Intent: ${analysis.intent}, Mode: ${mode}`,
      };
    } catch (error) {
      this.logger.error("Personality selection failed", error);

      return {
        personality: "eli",
        confidence: 0.5,
        fallback: true,
        error: error.message,
      };
    }
  }

  #explainSelection(selected, analysis, mode, score) {
    const reasons = [];

    if (analysis.domain === "business" && selected === "eli") {
      reasons.push("Business domain benefits from analytical framework");
    }

    if (analysis.emotionalWeight > 0.6 && selected === "roxy") {
      reasons.push("Emotional context requires empathetic approach");
    }

    if (mode === "business_validation" && selected === "eli") {
      reasons.push("Business validation mode prioritizes risk analysis");
    }

    if (analysis.complexity > 0.8 && selected === "eli") {
      reasons.push("High complexity requires protective intelligence");
    }

    if (analysis.domain === "personal" && selected === "roxy") {
      reasons.push("Personal domain benefits from supportive approach");
    }

    return reasons.length > 0 ? reasons.join("; ") : "Score-based selection";
  }
}
