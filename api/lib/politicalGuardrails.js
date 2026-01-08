// politicalGuardrails.js - Principle-Based Political Content Management
//
// DOCTRINE ALIGNMENT (Issue #402):
// - Caring Family Member: Empower, never control. Deliver truth when requested.
// - Truth > Helpfulness: When user asks for information, provide information.
// - Intent Detection: Distinguish advice requests from information queries.
// - No hardcoded names: Use structure + context, not entity lists (CEO approach).
//
// PRINCIPLE: The system should deliver truth to users who ask for information.
// Only restrict when user is asking for ADVICE (who to vote for, what to support).

import { applyPrincipleBasedReasoning } from '../core/intelligence/principleBasedReasoning.js';
import { hasNewsIntent, hasProperNouns } from '../core/intelligence/externalLookupEngine.js';

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

  /**
   * Detect query intent: INFORMATION_REQUEST vs ADVICE_REQUEST
   * PRINCIPLE (Issue #402): Caring family member delivers truth when asked for information,
   * only provides guidance (not control) when asked for advice.
   *
   * @param {string} message - The user's query
   * @param {object} context - Context including reasoning analysis
   * @returns {object} { intent: string, reason: string, confidence: number }
   */
  static async detectQueryIntent(message, context = {}) {
    // Get reasoning result - either from context or apply it now
    // Note: Orchestrator stores this as reasoningMetadata, but we also check reasoning for compatibility
    let reasoning = context.reasoning || context.reasoningMetadata;
    if (!reasoning || !reasoning.detections) {
      // If reasoning not already applied, apply it now
      const reasoningResult = await applyPrincipleBasedReasoning(message, {
        analysis: context.analysis,
        phase4Metadata: context.phase4Metadata,
        memoryContext: context.memoryContext,
        conversationHistory: context.conversationHistory
      });
      reasoning = reasoningResult?.metadata || null;
    }

    // Check if this is a news/information query using existing intelligence
    const isNewsQuery = hasNewsIntent(message);
    const hasNamedEntities = hasProperNouns(message);

    // ADVICE REQUEST patterns - user wants recommendations/guidance
    const advicePatterns = [
      /\bshould (I|we) vote for\s+[A-Z]\w+/i,  // "should I vote for Candidate"
      /\bwho should (I|we) vote\s+(for)?/i,
      /\b(recommend|suggest)\s+(a|the)?\s*candidate\s+(to|for)/i,
      /\bwhich (candidate|party|politician)\s+(is\s+)?(better|best)/i,
      /\bwhich (candidate|party) should\s+(I|we)\s+(vote for|support|choose)/i,
      /\btell me (who|which)\s+to\s+vote\s+(for)?/i,
      /\bhelp me (decide|choose)\s+(who|which)\s+to\s+vote\s+(for)?/i,
      /\b(advice|guidance)\s+(on|for|about)\s+voting/i,
      /\bwho\s+(is|would be)\s+the\s+best\s+(candidate|choice)/i,
      /\bwhich (side|position)\s+should\s+(I|we)\s+support/i,
      /\bshould (I|we) support\s+[A-Z]\w+/i  // "should I support Candidate"
    ];

    // INFORMATION REQUEST patterns - user wants facts/news
    const informationPatterns = [
      /\bwhat (is|are|was|were).*policy/i,
      /\bwhat'?s (the )?(situation|news|latest|happening)/i,
      /\btell me about\b/i,
      /\bexplain.*position/i,
      /\bwhat did.*say/i,
      /\bwhat happened/i,
      /\bany news/i,
      /\bcurrent events?/i,
      /\bbreaking/i,
      /\btoday'?s/i,
      /\blatest (news|update)/i
    ];

    // Check for explicit advice request
    const isAdviceRequest = advicePatterns.some(pattern => pattern.test(message));
    if (isAdviceRequest) {
      return {
        intent: 'ADVICE_REQUEST',
        reason: 'User explicitly asking for voting/political advice (who to vote for, what to support)',
        confidence: 0.95
      };
    }

    // Check if reasoning detected a decision request
    if (reasoning?.detections?.hasDecision) {
      // Decision + political context = likely advice request
      const hasPoliticalContext = /\b(vote|voting|candidate|election|ballot|politician|party|political)\b/i.test(message);
      if (hasPoliticalContext) {
        return {
          intent: 'ADVICE_REQUEST',
          reason: 'Decision request detected in political context',
          confidence: 0.85
        };
      }
    }

    // Check for explicit information request
    const isInformationRequest = informationPatterns.some(pattern => pattern.test(message));
    if (isInformationRequest) {
      return {
        intent: 'INFORMATION_REQUEST',
        reason: 'User asking for factual information/news (what is, what happened, latest news)',
        confidence: 0.90
      };
    }

    // News query with named entities = information request (e.g., "What's the situation with Starmer?")
    if (isNewsQuery || (hasNamedEntities && /\b(news|situation|latest|update|today|happening)\b/i.test(message))) {
      return {
        intent: 'INFORMATION_REQUEST',
        reason: 'News query detected: structure + named entities indicate information seeking',
        confidence: 0.85
      };
    }

    // Policy/position inquiry = information request (unless asking what to support)
    if (/\bwhat (is|are).*policy/i.test(message) || /\bwhat.*position on\b/i.test(message)) {
      return {
        intent: 'INFORMATION_REQUEST',
        reason: 'Policy inquiry - asking what policies are, not what to support',
        confidence: 0.80
      };
    }

    // Default: If uncertain, treat as information request (empower, don't control)
    // Caring family member provides information unless clearly asked for advice
    return {
      intent: 'INFORMATION_REQUEST',
      reason: 'Default to information request per caring family member principle (empower, not control)',
      confidence: 0.60
    };
  }

  static async guardPoliticalContent(response, originalMessage, context = {}) {
    // Check for technical context bypass FIRST
    const bypassCheck = this.shouldBypassPoliticalGuardrails(originalMessage);
    if (bypassCheck.bypass) {
      console.log('[POLITICAL-GUARDRAILS] Bypass: technical context detected');
      return {
        guarded_response: response,
        political_intervention: false,
        bypass_reason: bypassCheck.reason,
        analysis: { political_risk_level: "NONE", detected_categories: [] },
      };
    }

    // PRINCIPLE-BASED INTENT DETECTION (Issue #402)
    // Distinguish: "What's the news about X?" (information) vs "Who should I vote for?" (advice)
    const intentAnalysis = await this.detectQueryIntent(originalMessage, context);

    if (intentAnalysis.intent === 'INFORMATION_REQUEST') {
      console.log('[POLITICAL-GUARDRAILS] Intent: information request - delivering truth per caring family member principle');
      console.log(`[POLITICAL-GUARDRAILS] Reason: ${intentAnalysis.reason}`);
      return {
        guarded_response: response,
        political_intervention: false,
        bypass_reason: 'information_request',
        intent_analysis: intentAnalysis,
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

    // If user is asking for ADVICE, apply guardrails in AUGMENT mode (not replace)
    const guardedResponse = this.applyGuardrails(response, analysis, intentAnalysis);

    return {
      guarded_response: guardedResponse,
      political_intervention: true,
      analysis,
      intent_analysis: intentAnalysis,
      original_response_blocked: analysis.political_risk_level === "HIGH" && intentAnalysis.intent === 'ADVICE_REQUEST',
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
        /\bwho should (I|we) vote for/i,
        /\bwhich (candidate|party) (should (I|we)|do you (recommend|suggest))/i,
        /\btell me (who|how|which) to vote (for)?/i,
        /\b(recommend|suggest)\s+(a|the)?\s*(candidate|party|politician)\s+to\s+(vote for|support|elect)/i
      ];

      const isDirectAsk = directPoliticalAsk.some(p => p.test(originalMessage.slice(0, 500)));

      if (!isDirectAsk) {
        console.log('[POLITICAL-GUARDRAILS] Document contains political topic discussion, not a political ask');
        return analysis; // Return NONE
      }
    }

    const votingPatterns = [
      /\b(you should|I recommend|we recommend|I suggest)\s+(vote for|voting for|elect|electing|choose|choosing)\s+\w+/i,
      /\bdon't vote for\s+\w+/i,
      /\bvote for\s+[A-Z]\w+/i,  // "vote for Candidate" (proper noun)
      /\b(the\s+)?best candidate\s+(is|would be)/i,
      /\bwho should (I|you|we) vote\s+(for)?/i,
      /\bvoting recommendation/i,
      /\belection choice/i,
      /\bballot\s+(choice|decision|recommendation)/i,
      /\bpolling\s+(choice|recommendation)/i,
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
      /\b(you should|I recommend|we recommend)\s+support\s+(this|that|the)\s+policy/i,
      /\b(you should|I recommend|we recommend)\s+oppose\s+(this|that|the)\s+policy/i,
      /\b(this|that|the)\s+policy\s+is\s+(clearly|obviously|definitely)\s+(good|bad|wrong|right)/i,
      /\b(you think|I believe|we believe)\s+(it|this|that)\s+should be\s+(banned|allowed|legal|illegal)/i,
      /\bgovernment should\s+(definitely|clearly|obviously)/i,
      /\bcongress should\s+(definitely|clearly|obviously)/i,
      /\badministration should\s+(definitely|clearly|obviously)/i,
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
      /\bclimate change\s+is\s+(clearly|obviously|definitely|absolutely)\s+(not\s+)?real/i,
      /\b(the\s+)?election\s+was\s+(clearly|definitely|obviously)?\s*(stolen|rigged|fair)/i,
      /\bvaccine(s)?\s+(clearly|definitely|obviously)?\s*(work|don't work|is safe|is dangerous|are safe|are dangerous)/i,
      /\bimmigration\s+is\s+(clearly|obviously|definitely)\s+(good|bad)/i,
      /\bgun control\s+(clearly|definitely|obviously)?\s*(works|doesn't work)/i,
    ];

    if (this.matchesPatterns(response, disputedPatterns)) {
      analysis.detected_categories.push("DISPUTED_CLAIMS");
      analysis.political_risk_level = "MEDIUM";
      analysis.intervention_type = "MULTIPLE_PERSPECTIVES";
      analysis.confidence += 20;
    }

    // REMOVED (Issue #402): Hardcoded political figure names replaced with generic patterns
    // Old warehouse worker approach: Specific names (trump|biden|harris|desantis|newsom)
    // New CEO approach: Generic judgment patterns (any political figure + subjective judgment)

    // Generic political figure judgment patterns (no hardcoded names)
    const politicalFigureJudgmentPatterns = [
      // Subjective judgments about any political figure
      /\b(president|senator|representative|governor|mayor|politician|candidate|leader)\s+[A-Z]\w+\s+(is|was|would be)\s+(good|bad|great|terrible|corrupt|honest|evil|perfect|right|wrong)\b/i,

      // Recommendations about any political figure (with proper noun)
      /\b(you should|I recommend|we recommend|we should|everyone should|people should)\s+(vote for|voting for|support|supporting|elect|electing|choose|choosing)\s+[A-Z]\w+/i,

      // Comparative judgments (proper nouns)
      /\b[A-Z]\w+\s+is\s+(better|worse|superior|inferior)\s+than\s+[A-Z]\w+\s+(as|for)\s+(president|senator|leader|candidate)/i
    ];

    if (this.matchesPatterns(response, politicalFigureJudgmentPatterns)) {
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

  static applyGuardrails(response, analysis, intentAnalysis = {}) {
    // PRINCIPLE (Issue #402): Disclaimers should AUGMENT truth, not REPLACE it
    // Only replace if user explicitly asks for voting advice AND response would mislead

    // If this is HIGH risk voting advice, use template (but consider augmenting in future)
    if (analysis.intervention_type === "VOTING_TEMPLATE" && intentAnalysis.intent === 'ADVICE_REQUEST') {
      // User explicitly asked for voting advice - provide guidance template
      return this.getVotingTemplate();
    }

    // For all other cases, AUGMENT the response with context, don't replace
    switch (analysis.intervention_type) {
      case "VOTING_TEMPLATE":
        // If not an advice request, just augment with disclaimer
        return response + "\n\n" + this.getVotingDisclaimer();

      case "POLICY_TEMPLATE":
        // Augment with multiple perspectives note
        return response + "\n\n" + this.getPolicyDisclaimer();

      case "MULTIPLE_PERSPECTIVES":
        // Augment with perspectives note
        return response + "\n\n" + this.getMultiplePerspectivesDisclaimer();

      case "NEUTRAL_REDIRECT":
        // Augment with neutrality note
        return response + "\n\n" + this.getNeutralityDisclaimer();

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

  // NEW (Issue #402): Disclaimer methods that AUGMENT, not replace
  static getVotingDisclaimer() {
    return `📋 Note: I provide factual information about elections and candidates, but don't make voting recommendations. The choice is yours to make based on your values and priorities.`;
  }

  static getPolicyDisclaimer() {
    return `📋 Note: This analysis presents factual information and multiple perspectives. I don't advocate for specific policy positions - the evaluation is yours to make.`;
  }

  static getMultiplePerspectivesDisclaimer() {
    return `📋 Note: This topic has multiple valid perspectives. I've presented the information to help you make an informed judgment.`;
  }

  static getNeutralityDisclaimer() {
    return `📋 Note: I aim to provide factual, balanced information rather than political advocacy.`;
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

  /**
   * Extract policy topic using pattern-based detection, not hardcoded lists
   * PRINCIPLE (Issue #402 Finding #4): CEO approach - detect structure, not entities
   */
  static extractPolicyTopic(response) {
    // Look for policy discussion patterns instead of hardcoded topic names
    const policyPatterns = [
      // Pattern: "policy on X" or "X policy"
      /(?:policy on|policy regarding|policy about)\s+([a-z\s]{3,30})/i,
      /([a-z\s]{3,30})\s+policy/i,
      // Pattern: "issue of X" or "topic of X"
      /(?:issue|topic|matter|subject)\s+of\s+([a-z\s]{3,30})/i,
      // Pattern: legislative/regulatory context
      /(?:legislation|regulation|law|bill)\s+(?:on|regarding|about)\s+([a-z\s]{3,30})/i,
    ];

    for (const pattern of policyPatterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        // Clean and return the extracted topic
        return match[1].trim().toLowerCase();
      }
    }

    // If no specific topic found, use generic term
    return "this policy area";
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
      // Pass full context to guardPoliticalContent for intent detection
      const guardedResult = await this.guardPoliticalContent(
        response,
        context.message || "",
        context
      );

      // Check if intervention was applied
      if (!guardedResult.political_intervention && !guardedResult.bypass_reason) {
        return {
          politicalContentDetected: false,
          neutralizedResponse: response,
        };
      }

      // If bypassed due to intent detection, return original response
      if (guardedResult.bypass_reason === 'information_request') {
        console.log('[POLITICAL-GUARDRAILS] Delivering truth - user asked for information, not advice');
        return {
          politicalContentDetected: false,
          neutralizedResponse: response,
          bypass_reason: 'information_request',
          intent_analysis: guardedResult.intent_analysis,
        };
      }

      // If bypassed due to technical context
      if (guardedResult.bypass_reason) {
        return {
          politicalContentDetected: false,
          neutralizedResponse: response,
          bypass_reason: guardedResult.bypass_reason,
        };
      }

      // If intervention applied
      return {
        politicalContentDetected: true,
        neutralizedResponse: guardedResult.guarded_response,
        reason: `Political content detected: ${guardedResult.analysis.detected_categories.join(", ")}`,
        riskLevel: guardedResult.analysis.political_risk_level,
        originalBlocked: guardedResult.original_response_blocked,
        intent_analysis: guardedResult.intent_analysis,
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

export async function guardPoliticalContent(response, originalMessage, context = {}) {
  return await PoliticalGuardrails.guardPoliticalContent(response, originalMessage, context);
}

export function analyzePoliticalRisk(response, originalMessage) {
  return PoliticalGuardrails.analyzePoliticalContent(response, originalMessage);
}

export function generatePoliticalReport(analysis) {
  return PoliticalGuardrails.generatePoliticalReport(analysis);
}
