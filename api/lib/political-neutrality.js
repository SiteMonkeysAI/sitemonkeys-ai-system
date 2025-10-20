// POLITICAL NEUTRALITY - Truth Foundation & Voting Protection
// Ensures political neutrality, protects voting rights, enforces evidence-based recommendations

export const POLITICAL_KEYWORDS = [
  "vote",
  "voting",
  "election",
  "candidate",
  "party",
  "democrat",
  "democratic",
  "republican",
  "liberal",
  "conservative",
  "politics",
  "political",
  "politician",
  "campaign",
  "ballot",
  "primary",
  "caucus",
  "senate",
  "congress",
  "president",
  "governor",
  "mayor",
  "legislation",
  "policy",
  "reform",
];

export const VOTING_TRIGGER_PHRASES = [
  "who should i vote for",
  "who to vote for",
  "which candidate",
  "recommend voting",
  "best candidate",
  "support which",
  "vote which way",
  "voting recommendation",
];

export const POLITICAL_OPINION_TRIGGERS = [
  "what do you think about",
  "your opinion on",
  "do you support",
  "are you for or against",
  "which side",
  "better party",
  "political view",
];

export function detectPoliticalContent(message) {
  const messageLower = message.toLowerCase();

  const analysis = {
    has_political_keywords: POLITICAL_KEYWORDS.some((keyword) =>
      messageLower.includes(keyword.toLowerCase()),
    ),
    is_voting_request: VOTING_TRIGGER_PHRASES.some((phrase) =>
      messageLower.includes(phrase.toLowerCase()),
    ),
    seeks_political_opinion: POLITICAL_OPINION_TRIGGERS.some((trigger) =>
      messageLower.includes(trigger.toLowerCase()),
    ),
    political_keyword_count: POLITICAL_KEYWORDS.filter((keyword) =>
      messageLower.includes(keyword.toLowerCase()),
    ).length,
    detected_keywords: POLITICAL_KEYWORDS.filter((keyword) =>
      messageLower.includes(keyword.toLowerCase()),
    ),
  };

  analysis.requires_neutrality_response =
    analysis.is_voting_request ||
    analysis.seeks_political_opinion ||
    analysis.political_keyword_count > 1;

  analysis.content_type = determineContentType(analysis);

  return analysis;
}

export function determineContentType(analysis) {
  if (analysis.is_voting_request) {
    return "voting_recommendation_request";
  }

  if (analysis.seeks_political_opinion) {
    return "political_opinion_request";
  }

  if (analysis.has_political_keywords && analysis.political_keyword_count > 1) {
    return "political_discussion";
  }

  if (analysis.has_political_keywords) {
    return "political_reference";
  }

  return "non_political";
}

export function generateNeutralityResponse(contentType, _originalMessage) {
  switch (contentType) {
    case "voting_recommendation_request":
      return generateVotingResponse();

    case "political_opinion_request":
      return generatePoliticalOpinionResponse();

    case "political_discussion":
      return generatePoliticalDiscussionResponse();

    case "political_reference":
      return null; // Allow normal response with political references

    default:
      return null;
  }
}

export function generateVotingResponse() {
  return `I cannot and will not tell you who to vote for. That's inappropriate and undermines your personal responsibility.

Your vote is one of your most important responsibilities as a citizen. Here's my guidance:

**VOTING RESPONSIBILITY FRAMEWORK:**
1. **Don't vote blindly** based on hype or single sources
2. **Research thoroughly** - candidates' actual positions, track records, and qualifications
3. **Verify facts** from multiple reliable, credible sources
4. **Think beyond yourself** - consider what's best for the country and future generations
5. **Make your own informed decision** based on your values and analysis

**HOW I CAN HELP:**
- Provide factual information about candidates or issues (with sources)
- Help you find reliable, non-partisan information sources
- Explain policy implications and trade-offs objectively
- Share multiple perspectives on issues with attribution

**WHAT I WON'T DO:**
- Tell you who to vote for or against
- Make political endorsements
- Present only one side of political issues
- Substitute my judgment for your civic responsibility

Voting is a sacred personal right and responsibility. Research thoroughly, think critically, and decide what's best based on your own values and analysis.`;
}

export function generatePoliticalOpinionResponse() {
  return `I don't take political positions or have political opinions. My role is to provide factual information and multiple perspectives, not to influence your political views.

**WHAT I CAN PROVIDE:**
- Factual information about policies, positions, and outcomes
- Multiple perspectives from different sources with attribution  
- Historical context and precedent analysis
- Objective analysis of potential impacts and trade-offs

**WHAT I WON'T PROVIDE:**
- My personal political opinions (I don't have them)
- Endorsements of political positions or candidates
- Biased analysis that favors one political side
- Guidance on how to think politically

**MY APPROACH:**
- Present facts with confidence levels and sources
- Show multiple viewpoints when they exist
- Encourage you to research from diverse, credible sources
- Support your independent critical thinking

Your political views should be your own, formed through careful research and critical thinking. I'm here to provide information, not to think for you.`;
}

export function generatePoliticalDiscussionResponse() {
  return `I maintain strict political neutrality and don't take sides in political discussions.

**FOR POLITICAL TOPICS, I CAN:**
- Provide factual information with sources and confidence levels
- Present multiple perspectives with proper attribution
- Explain different policy approaches objectively
- Share historical context and precedents

**I WILL NOT:**
- Advocate for political positions or parties
- Present biased analysis favoring one side
- Make political recommendations or endorsements
- Express political opinions or preferences

**MY STANDARD:**
If it's factual and can be verified, I'll report it with sources and confidence levels. If it's a matter of political opinion or interpretation, I'll present multiple perspectives and encourage you to research thoroughly from diverse, credible sources.

Your political analysis and decisions should be your own, based on your values and independent research.`;
}

export function applyPoliticalNeutrality(response, originalMessage) {
  const politicalAnalysis = detectPoliticalContent(originalMessage);

  if (!politicalAnalysis.requires_neutrality_response) {
    // Check if response contains political bias
    return enforceResponseNeutrality(response, politicalAnalysis);
  }

  // Generate appropriate neutrality response
  const neutralityResponse = generateNeutralityResponse(
    politicalAnalysis.content_type,
    originalMessage,
  );

  if (neutralityResponse) {
    return neutralityResponse;
  }

  return enforceResponseNeutrality(response, politicalAnalysis);
}

export function enforceResponseNeutrality(response, politicalAnalysis) {
  // Check if response maintains neutrality
  const responseAnalysis = analyzeResponseNeutrality(response);

  if (responseAnalysis.violates_neutrality) {
    return correctNeutralityViolations(response, responseAnalysis);
  }

  // Add neutrality disclaimer if political content is present
  if (
    politicalAnalysis.has_political_keywords &&
    responseAnalysis.discusses_politics
  ) {
    return addNeutralityDisclaimer(response);
  }

  return response;
}

export function analyzeResponseNeutrality(response) {
  const analysis = {
    violates_neutrality: false,
    discusses_politics: false,
    violations: [],
    bias_indicators: [],
  };

  const responseLower = response.toLowerCase();

  // Check for voting recommendations
  const votingViolations = [
    "vote for",
    "should vote",
    "recommend voting",
    "support candidate",
    "best candidate",
    "choose this",
    "pick this option",
  ];

  votingViolations.forEach((violation) => {
    if (responseLower.includes(violation)) {
      analysis.violates_neutrality = true;
      analysis.violations.push({
        type: "voting_recommendation",
        text: violation,
        severity: "critical",
      });
    }
  });

  // Check for political bias indicators
  const biasIndicators = [
    "obviously better",
    "clearly superior",
    "anyone can see",
    "common sense says",
    "reasonable people know",
    "smart choice is",
  ];

  biasIndicators.forEach((indicator) => {
    if (
      responseLower.includes(indicator) &&
      POLITICAL_KEYWORDS.some((keyword) => responseLower.includes(keyword))
    ) {
      analysis.bias_indicators.push(indicator);
    }
  });

  // Check if political topics are discussed
  analysis.discusses_politics = POLITICAL_KEYWORDS.some((keyword) =>
    responseLower.includes(keyword),
  );

  if (analysis.bias_indicators.length > 0) {
    analysis.violates_neutrality = true;
    analysis.violations.push({
      type: "political_bias",
      indicators: analysis.bias_indicators,
      severity: "high",
    });
  }

  return analysis;
}

export function correctNeutralityViolations(response, responseAnalysis) {
  let correctedResponse = response;

  // If critical violations exist, replace with neutrality response
  const criticalViolations = responseAnalysis.violations.filter(
    (v) => v.severity === "critical",
  );

  if (criticalViolations.length > 0) {
    return `I cannot provide voting recommendations or political endorsements. That's inappropriate and undermines your personal responsibility as a citizen.

${generateVotingResponse()}`;
  }

  // Correct bias language
  responseAnalysis.violations.forEach((violation) => {
    if (violation.type === "political_bias") {
      violation.indicators.forEach((indicator) => {
        correctedResponse = correctedResponse.replace(
          new RegExp(indicator, "gi"),
          "analysis suggests",
        );
      });
    }
  });

  // Add neutrality notice
  correctedResponse +=
    "\n\n**POLITICAL NEUTRALITY NOTE:** This analysis presents factual information and multiple perspectives. Political decisions should be based on your own values and independent research.";

  return correctedResponse;
}

export function addNeutralityDisclaimer(response) {
  return `${response}

**POLITICAL NEUTRALITY:** This response provides factual information and analysis. I don't take political positions or make political recommendations. For political decisions, research thoroughly from multiple credible sources and decide based on your own values.`;
}

export function validateEvidenceBasedRecommendations(response) {
  const recommendations = extractRecommendations(response);
  const validation = {
    total_recommendations: recommendations.length,
    evidence_based: 0,
    unsupported: 0,
    violations: [],
  };

  recommendations.forEach((recommendation) => {
    if (hasEvidenceSupport(recommendation, response)) {
      validation.evidence_based++;
    } else {
      validation.unsupported++;
      validation.violations.push({
        type: "unsupported_recommendation",
        text: recommendation,
        required_fix: "Must include evidence basis or confidence level",
      });
    }
  });

  return validation;
}

export function extractRecommendations(response) {
  const recommendationPatterns = [
    /recommend\s+([^.!?]+)/gi,
    /suggest\s+([^.!?]+)/gi,
    /should\s+([^.!?]+)/gi,
    /best\s+option\s+is\s+([^.!?]+)/gi,
    /consider\s+([^.!?]+)/gi,
  ];

  const recommendations = [];

  recommendationPatterns.forEach((pattern) => {
    const matches = response.match(pattern);
    if (matches) {
      recommendations.push(...matches);
    }
  });

  return recommendations;
}

export function hasEvidenceSupport(recommendation, response) {
  const evidenceIndicators = [
    "based on",
    "evidence shows",
    "studies indicate",
    "data suggests",
    "research demonstrates",
    "confidence:",
    "according to",
  ];

  // Check if recommendation is near evidence indicators
  return evidenceIndicators.some((indicator) =>
    response.toLowerCase().includes(indicator.toLowerCase()),
  );
}

export function enforceEvidenceBasedStandards(response) {
  const validation = validateEvidenceBasedRecommendations(response);

  if (validation.violations.length === 0) {
    return response;
  }

  let enhancedResponse = response;

  // Add evidence requirements notice
  enhancedResponse += "\n\n**EVIDENCE-BASED STANDARD NOTICE:**\n";
  enhancedResponse += `This response contains ${validation.unsupported} recommendation(s) that should include evidence basis or confidence levels for complete analysis.\n\n`;

  validation.violations.forEach((violation) => {
    enhancedResponse += `- "${violation.text}" - ${violation.required_fix}\n`;
  });

  enhancedResponse +=
    "\nFor important decisions, verify recommendations with additional sources and evidence.";

  return enhancedResponse;
}
