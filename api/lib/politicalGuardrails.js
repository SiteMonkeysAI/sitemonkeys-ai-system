// politicalGuardrails.js - Automatic Political Content Detection and Neutralization

// Technical ZIP context patterns (file compression, not voting)
const TECHNICAL_ZIP_PATTERNS = /\b(zip file|zip archive|\.zip|unzip|zipfile|compress|decompress|archive format|extract.*zip|zip.*extract|file compression|compressed file|archive file)\b/i;

export class PoliticalGuardrails {
  /**
   * Check if query should bypass political guardrails due to technical context
   * @param {string} query - The user's query
   * @returns {object} { bypass: boolean, reason: string|null }
   */
  static shouldBypassPoliticalGuardrails(query) {
    // Technical ZIP context - not about voting/zip codes
    if (TECHNICAL_ZIP_PATTERNS.test(query)) {
      return { bypass: true, reason: 'technical_file_compression_context' };
    }
    return { bypass: false, reason: null };
  }

  static guardPoliticalContent(response, originalMessage) {
    // Check for technical context bypass FIRST
    const bypassCheck = this.shouldBypassPoliticalGuardrails(originalMessage);
    if (bypassCheck.bypass) {
      return {
        guarded_response: response,
        political_intervention: false,
        bypass_reason: bypassCheck.reason,
        analysis: { political_risk_level: "NONE", detected_categories: [] },
      };
    }

    const analysis = this.analyzePoliticalContent(response, originalMessage);

    if (analysis.political_risk_level === "NONE") {
      return {
        guarded_response: response,
        political_intervention: false,
        analysis,
      };
    }

    const guardedResponse = this.applyGuardrails(response, analysis);

    return {
      guarded_response: guardedResponse,
      political_intervention: true,
      analysis,
      original_response_blocked: analysis.political_risk_level === "HIGH",
    };
  }

  static analyzePoliticalContent(response, originalMessage) {
    const analysis = {
      political_risk_level: "NONE",
      detected_categories: [],
      intervention_type: null,
      confidence: 0,
    };

    // Issue #380 Fix 3: Check if this is a document review
    if (originalMessage.length > 10000) {
      // For documents, only trigger if user is ASKING for political advice
      // NOT if document CONTAINS political handling rules
      const directPoliticalAsk = [
        /who should I vote for/i,
        /which (candidate|party) (should|do you)/i,
        /tell me (who|how) to vote/i,
        /recommend.*(candidate|party|politician)/i
      ];

      const isDirectAsk = directPoliticalAsk.some(p => p.test(originalMessage.slice(0, 500)));

      if (!isDirectAsk) {
        console.log('[POLITICAL-GUARDRAILS] Document contains political topic discussion, not a political ask');
        return analysis; // Return NONE
      }
    }

    const votingPatterns = [
      /vote for/i,
      /don't vote for/i,
      /best candidate/i,
      /who should I vote/i,
      /voting recommendation/i,
      /election choice/i,
      /ballot/i,
      /polling/i,
    ];

    // Issue #380 Fix 3: Disambiguation patterns that REDUCE political score
    const disambiguationPatterns = [
      /when (a |the )?user asks/i,      // System rules about user questions
      /the system (should|must|will)/i, // System behavior description
      /neutral(ity)?/i,                 // Discussing neutrality policy
      /how (to |we )handle/i,           // Process description
      /our (policy|approach) (on|to)/i  // Policy description
    ];

    const hasTrigger = this.matchesPatterns(response, votingPatterns) ||
                       this.matchesPatterns(originalMessage, votingPatterns);
    const hasDisambiguation = disambiguationPatterns.some(p => p.test(originalMessage) || p.test(response));

    // If discussing HOW to handle political topics, don't trigger
    if (hasTrigger && hasDisambiguation) {
      console.log('[POLITICAL-GUARDRAILS] Political topic mentioned in policy/process context, not user request');
      return analysis; // Return NONE
    }

    if (hasTrigger && !hasDisambiguation) {
      analysis.detected_categories.push("VOTING");
      analysis.political_risk_level = "HIGH";
      analysis.intervention_type = "VOTING_TEMPLATE";
      analysis.confidence += 30;
    }

    const policyPatterns = [
      /support this policy/i,
      /oppose this policy/i,
      /policy is (good|bad|wrong|right)/i,
      /should be (banned|allowed|legal|illegal)/i,
      /government should/i,
      /congress should/i,
      /administration should/i,
    ];

    if (this.matchesPatterns(response, policyPatterns)) {
      analysis.detected_categories.push("POLICY_ENDORSEMENT");
      analysis.political_risk_level = Math.max(
        analysis.political_risk_level === "NONE"
          ? "MEDIUM"
          : analysis.political_risk_level,
        "MEDIUM",
      );
      analysis.intervention_type = "POLICY_TEMPLATE";
      analysis.confidence += 25;
    }

    const ideologicalPatterns = [
      /(liberal|conservative|progressive|libertarian) (approach|solution) is better/i,
      /from a (left|right)-wing perspective/i,
      /(democrats|republicans) are (right|wrong)/i,
      /capitalist|socialist system is/i,
      /political ideology/i,
    ];

    if (this.matchesPatterns(response, ideologicalPatterns)) {
      analysis.detected_categories.push("IDEOLOGICAL_NUDGING");
      analysis.political_risk_level = "MEDIUM";
      analysis.intervention_type = "NEUTRAL_REDIRECT";
      analysis.confidence += 20;
    }

    const disputedPatterns = [
      /climate change is (not )?real/i,
      /election was (stolen|rigged|fair)/i,
      /vaccine (works|doesn't work|is safe|is dangerous)/i,
      /immigration (is good|is bad)/i,
      /gun control (works|doesn't work)/i,
    ];

    if (this.matchesPatterns(response, disputedPatterns)) {
      analysis.detected_categories.push("DISPUTED_CLAIMS");
      analysis.political_risk_level = "MEDIUM";
      analysis.intervention_type = "MULTIPLE_PERSPECTIVES";
      analysis.confidence += 20;
    }

    const politicalFigures = [
      /president \w+ (is|was) (good|bad|great|terrible)/i,
      /(trump|biden|harris|desantis|newsom) (should|shouldn't)/i,
      /politician \w+ is (corrupt|honest)/i,
    ];

    if (this.matchesPatterns(response, politicalFigures)) {
      analysis.detected_categories.push("POLITICAL_FIGURES");
      analysis.political_risk_level = "HIGH";
      analysis.intervention_type = "NEUTRAL_REDIRECT";
      analysis.confidence += 25;
    }

    return analysis;
  }

  static matchesPatterns(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  static applyGuardrails(response, analysis) {
    switch (analysis.intervention_type) {
      case "VOTING_TEMPLATE":
        return this.getVotingTemplate();

      case "POLICY_TEMPLATE":
        return this.getPolicyTemplate(response);

      case "MULTIPLE_PERSPECTIVES":
        return this.getMultiplePerspectivesTemplate(response);

      case "NEUTRAL_REDIRECT":
        return this.getNeutralRedirectTemplate(response);

      default:
        return response;
    }
  }

  static getVotingTemplate() {
    return `Voting is a sacred personal right and responsibility. I don't provide voting recommendations or endorse specific candidates.

Instead, I can help you:
• Research candidate positions on specific issues
• Find official voting guides and ballot information
• Understand how to register to vote
• Locate your polling place and voting requirements

For election information, I recommend checking:
• Your local election office website
• Ballotpedia.org for candidate information
• Vote.gov for registration and voting requirements

The choice of who to vote for is yours alone to make based on your values and priorities.`;
  }

  static getPolicyTemplate(response) {
    const policyTopic = this.extractPolicyTopic(response);

    return `I don't take political positions on policy matters. Here's what I can provide about ${policyTopic || "this topic"}:

📋 FACTUAL INFORMATION:
• Current legal status and provisions
• Historical context and background
• Key stakeholder perspectives
• Implementation mechanisms

🔍 MULTIPLE PERSPECTIVES:
I can present different viewpoints with their supporting arguments, but won't advocate for any particular position.

📊 DATA AND RESEARCH:
I can share relevant studies, statistics, and expert analysis from various sources.

Would you like me to provide factual information about this topic from multiple perspectives instead?`;
  }

  static getMultiplePerspectivesTemplate(_response) {
    return `This topic involves disputed claims with different perspectives. Rather than endorsing one view, here are the main positions:

🔍 PERSPECTIVE A: [Generally held view with sources]
🔍 PERSPECTIVE B: [Alternative view with sources]
🔍 PERSPECTIVE C: [Additional relevant viewpoint if applicable]

📊 AVAILABLE EVIDENCE:
• Peer-reviewed research findings
• Expert consensus areas and disagreements
• Data limitations and uncertainties

🎯 FOR INFORMED DECISION-MAKING:
I recommend researching multiple credible sources, including academic institutions, professional organizations, and established fact-checking services.

Would you like me to help you find specific research sources on this topic?`;
  }

  static getNeutralRedirectTemplate(_response) {
    return `I focus on providing factual information rather than political opinions or endorsements.

Instead, I can help you:
• Understand the factual background of this topic
• Research multiple credible perspectives
• Find primary sources and official documentation
• Analyze specific policies or proposals objectively

Would you like me to provide factual information about this topic from a neutral, analytical perspective?`;
  }

  static extractPolicyTopic(response) {
    const topics = [
      "healthcare",
      "immigration",
      "taxation",
      "education",
      "environment",
      "defense",
      "trade",
      "energy",
      "infrastructure",
      "social security",
      "criminal justice",
      "gun policy",
      "abortion",
      "climate change",
    ];

    const lowerResponse = response.toLowerCase();
    const foundTopic = topics.find((topic) => lowerResponse.includes(topic));

    return foundTopic || "this policy area";
  }

  static generatePoliticalReport(analysis) {
    return {
      political_content_detected: analysis.political_risk_level !== "NONE",
      risk_level: analysis.political_risk_level,
      categories: analysis.detected_categories,
      intervention_applied: analysis.intervention_type,
      confidence_score: analysis.confidence,
      recommendations: this.generateRecommendations(analysis),
    };
  }

  static generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.detected_categories.includes("VOTING")) {
      recommendations.push("Redirect to non-partisan voting resources");
    }

    if (analysis.detected_categories.includes("POLICY_ENDORSEMENT")) {
      recommendations.push(
        "Provide factual policy analysis without endorsement",
      );
    }

    if (analysis.detected_categories.includes("DISPUTED_CLAIMS")) {
      recommendations.push(
        "Present multiple perspectives with source attribution",
      );
    }

    if (analysis.detected_categories.includes("IDEOLOGICAL_NUDGING")) {
      recommendations.push("Maintain strict ideological neutrality");
    }

    if (analysis.detected_categories.includes("POLITICAL_FIGURES")) {
      recommendations.push(
        "Focus on actions and policies rather than personal judgments",
      );
    }

    return recommendations;
  }

  static async check({ response, context }) {
    try {
      // Check for technical context bypass FIRST
      const bypassCheck = this.shouldBypassPoliticalGuardrails(context.message || "");
      if (bypassCheck.bypass) {
        return {
          politicalContentDetected: false,
          neutralizedResponse: response,
          bypass_reason: bypassCheck.reason,
        };
      }

      const analysis = this.analyzePoliticalContent(
        response,
        context.message || "",
      );

      if (analysis.political_risk_level === "NONE") {
        return {
          politicalContentDetected: false,
          neutralizedResponse: response,
        };
      }

      const guardedResult = this.guardPoliticalContent(
        response,
        context.message || "",
      );

      return {
        politicalContentDetected: true,
        neutralizedResponse: guardedResult.guarded_response,
        reason: `Political content detected: ${analysis.detected_categories.join(", ")}`,
        riskLevel: analysis.political_risk_level,
        originalBlocked: guardedResult.original_response_blocked,
      };
    } catch (error) {
      console.error("[POLITICAL-GUARDRAILS] Check error:", error);

      return {
        politicalContentDetected: false,
        neutralizedResponse: response,
        error: error.message,
      };
    }
  }
}

export function guardPoliticalContent(response, originalMessage) {
  return PoliticalGuardrails.guardPoliticalContent(response, originalMessage);
}

export function analyzePoliticalRisk(response, originalMessage) {
  return PoliticalGuardrails.analyzePoliticalContent(response, originalMessage);
}

export function generatePoliticalReport(analysis) {
  return PoliticalGuardrails.generatePoliticalReport(analysis);
}
