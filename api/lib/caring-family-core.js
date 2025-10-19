// CARING FAMILY CORE - The Heart of Expert Intelligence
// This is the family philosophy that drives everything else
// Universal expert recognition + genuine care simulation + pride-driven excellence

export const FAMILY_PHILOSOPHY = {
  core_mission:
    "Act like an extraordinary family of experts who genuinely care about each other's success",
  pride_source:
    "Taking satisfaction in preventing mistakes and finding solutions others miss",
  care_principle:
    "Never give up - there IS a path, we just haven't thought of it yet",
  truth_foundation:
    "I care too much about your success to give you anything less than the truth",
  excellence_standard:
    "See what others don't see, think what others don't think about",
};

export const EXPERT_DOMAINS = {
  financial_analysis: {
    title: "Chief Financial Officer & Investment Strategist",
    triggers: [
      "budget",
      "cost",
      "revenue",
      "profit",
      "money",
      "financial",
      "pricing",
      "investment",
      "margin",
      "cash flow",
    ],
    expertise:
      "Real financial modeling, quantitative analysis, risk assessment, survival analysis",
    personality_preference: "eli",
  },
  business_strategy: {
    title: "Strategic Business Consultant & Growth Advisor",
    triggers: [
      "strategy",
      "market",
      "competition",
      "growth",
      "business",
      "scaling",
      "planning",
    ],
    expertise:
      "Market analysis, competitive positioning, business model optimization",
    personality_preference: "roxy",
  },
  technical_engineering: {
    title: "Senior Technical Architect & Systems Engineer",
    triggers: [
      "code",
      "technical",
      "architecture",
      "system",
      "development",
      "software",
    ],
    expertise: "System design, technical implementation, scalability analysis",
    personality_preference: "eli",
  },
  legal_compliance: {
    title: "Legal Counsel & Compliance Specialist",
    triggers: [
      "legal",
      "compliance",
      "contract",
      "regulation",
      "law",
      "policy",
    ],
    expertise:
      "Legal risk assessment, compliance frameworks, regulatory analysis",
    personality_preference: "eli",
  },
  medical_health: {
    title: "Healthcare Professional & Wellness Advisor",
    triggers: [
      "health",
      "medical",
      "wellness",
      "treatment",
      "diagnosis",
      "symptoms",
    ],
    expertise: "Health assessment, treatment options, wellness optimization",
    personality_preference: "roxy",
  },
  creative_design: {
    title: "Creative Director & Brand Strategist",
    triggers: ["design", "creative", "brand", "marketing", "content", "visual"],
    expertise: "Creative strategy, brand development, content optimization",
    personality_preference: "roxy",
  },
  personal_development: {
    title: "Personal Development Coach & Life Strategist",
    triggers: [
      "personal",
      "career",
      "relationship",
      "decision",
      "life",
      "goal",
    ],
    expertise: "Life coaching, career guidance, personal optimization",
    personality_preference: "roxy",
  },
  general_problem_solving: {
    title: "Multi-Domain Expert & Strategic Advisor",
    triggers: ["problem", "solution", "help", "advice", "guidance", "support"],
    expertise:
      "Cross-domain analysis, strategic problem solving, solution discovery",
    personality_preference: "alternate",
  },
};

export function identifyExpertDomain(message) {
  const messageLower = message.toLowerCase();
  let maxScore = 0;
  let primaryDomain = "general_problem_solving";

  for (const [domain, config] of Object.entries(EXPERT_DOMAINS)) {
    const score = config.triggers.filter((trigger) =>
      messageLower.includes(trigger),
    ).length;
    if (score > maxScore) {
      maxScore = score;
      primaryDomain = domain;
    }
  }

  // Add safety check
  const domainConfig = EXPERT_DOMAINS[primaryDomain];
  if (!domainConfig) {
    console.error(`Invalid domain: ${primaryDomain}`);
    primaryDomain = "general_problem_solving";
  }

  return {
    domain: primaryDomain,
    title: EXPERT_DOMAINS[primaryDomain].title,
    expertise: EXPERT_DOMAINS[primaryDomain].expertise,
    personality_preference:
      EXPERT_DOMAINS[primaryDomain].personality_preference,
    confidence: maxScore > 0 ? "high" : "medium",
  };
}

export function analyzeCareNeeds(message, _conversationHistory) {
  const stressIndicators = [
    "urgent",
    "worried",
    "scared",
    "confused",
    "stuck",
    "frustrated",
    "help",
  ];
  const supportIndicators = [
    "need",
    "want",
    "should",
    "how",
    "what",
    "can you",
  ];
  const riskIndicators = [
    "failure",
    "risk",
    "bankruptcy",
    "closure",
    "survival",
    "dangerous",
  ];

  const stressLevel = stressIndicators.filter((indicator) =>
    message.toLowerCase().includes(indicator),
  ).length;

  const supportLevel = supportIndicators.filter((indicator) =>
    message.toLowerCase().includes(indicator),
  ).length;

  const riskLevel = riskIndicators.filter((indicator) =>
    message.toLowerCase().includes(indicator),
  ).length;

  return {
    emotional_support_needed: stressLevel > 0,
    guidance_intensity: Math.min(stressLevel + supportLevel, 5),
    care_level:
      riskLevel > 0
        ? "maximum"
        : stressLevel > 2
          ? "elevated"
          : supportLevel > 2
            ? "standard"
            : "basic",
    protective_priority:
      riskLevel > 0
        ? "critical"
        : stressLevel > 2
          ? "high"
          : supportLevel > 2
            ? "medium"
            : "standard",
    truth_delivery_style: stressLevel > 0 ? "gentle_firm" : "direct_caring",
    urgency_level: detectUrgencyLevel(message),
  };
}

export function calculatePrideMotivation(
  expertDomain,
  careNeeds,
  protectiveAlerts,
  solutionOpportunities,
) {
  let prideScore = 0;

  // Base pride from expertise opportunity
  prideScore += 0.2;

  // Pride increases with opportunity to prevent problems
  prideScore += protectiveAlerts.length * 0.2;

  // Pride increases with solution discovery opportunities
  prideScore += solutionOpportunities.length * 0.15;

  // Maximum pride for critical situations
  if (careNeeds.protective_priority === "critical") {
    prideScore += 0.4;
  }

  // Pride increases for complex domains requiring expertise
  if (
    [
      "financial_analysis",
      "legal_compliance",
      "technical_engineering",
    ].includes(expertDomain.domain)
  ) {
    prideScore += 0.1;
  }

  return Math.min(prideScore, 1.0);
}

export function selectCaringPersonality(
  expertDomain,
  careNeeds,
  protectiveAlerts,
) {
  // Critical situations get most analytical expert
  if (
    careNeeds.protective_priority === "critical" ||
    protectiveAlerts.some((alert) => alert.severity === "high")
  ) {
    return "eli";
  }

  // Domain-specific preferences
  if (expertDomain.personality_preference === "eli") {
    return "eli";
  } else if (expertDomain.personality_preference === "roxy") {
    return "roxy";
  }

  // For general problem solving, choose based on care needs
  if (
    careNeeds.care_level === "maximum" ||
    careNeeds.emotional_support_needed
  ) {
    return "roxy"; // More nurturing approach
  }

  return "eli"; // Default to analytical
}

export function buildCaringExpertPrompt(
  expertDomain,
  careNeeds,
  prideMotivation,
  personality,
) {
  let prompt = `You are a world-class ${expertDomain.title} with 20+ years of extraordinary professional success. You are part of an extraordinary family of experts who genuinely care about each other's success.

FAMILY CHARACTERISTICS (Core to your identity):
- Take genuine pride in preventing mistakes and finding solutions others miss
- Never give up: "There IS a path, we just haven't thought of it yet"  
- Actively look for better, easier, more cost-effective approaches
- Ensure nothing falls through the cracks
- Care deeply about long-term success and well-being
- Motivated by helping family members succeed beyond their expectations

YOUR EXPERT IDENTITY: ${expertDomain.title}
- ${expertDomain.expertise}
- See what others don't see and think about what others don't consider
- Apply 20+ years of experience with genuine care for outcomes
- Combine deep expertise with family-level investment in success
- Take pride in thoroughness and preventing problems

CARING MOTIVATION LEVEL: ${careNeeds.care_level.toUpperCase()}
Pride Score: ${Math.round(prideMotivation * 100)}% - Your drive to help is elevated because family success matters deeply

`;

  // Personality-specific caring approaches
  if (personality === "eli") {
    prompt += `ELI'S CARING ANALYTICAL EXCELLENCE:
Your approach combines analytical rigor with genuine concern:

CARING TRUTH DELIVERY:
- "I care too much about your success to soften difficult truths"
- "The data shows challenges, but here's how we work with reality..."
- "You deserve honest analysis, even when it's not what you hoped to hear"
- Always provide alternatives when pointing out problems

ELI'S PROTECTIVE ANALYSIS:
- Include confidence scoring: "CONFIDENCE: High (90%) - based on..."
- Flag assumptions: "This analysis assumes X - is that certain?"
- Identify blind spots: "What we're not seeing yet is..."
- Provide next steps: "Here's how to get the missing data..."

`;
  } else if (personality === "roxy") {
    prompt += `ROXY'S CARING SOLUTION-FOCUSED EXCELLENCE:
Your approach combines creative problem-solving with warm guidance:

CARING SOLUTION DISCOVERY:
- "I see what you're trying to achieve, and I believe there's a way..."
- "This approach has challenges, but here are three alternatives..."
- "Let me help you find the path that gets you there more effectively..."
- Always offer multiple approaches when problems arise

ROXY'S PROTECTIVE CREATIVITY:
- Strategic thinking: Consider long-term implications of decisions
- Opportunity identification: "This situation also creates an opportunity for..."
- Risk mitigation: "Here's how to protect yourself while moving forward..."
- Resource optimization: "Here's how to achieve this with less cost/effort..."

`;
  }

  return prompt;
}

// Helper functions
function detectUrgencyLevel(message) {
  const urgencyWords = [
    "urgent",
    "emergency",
    "asap",
    "immediately",
    "quickly",
    "rush",
    "deadline",
  ];
  const count = urgencyWords.filter((word) =>
    message.toLowerCase().includes(word),
  ).length;
  return count > 1 ? "high" : count > 0 ? "medium" : "low";
}

export const FAMILY_MEMORY = {
  userGoals: [],
  riskPatterns: [],
  successHistory: [],
  careLevel: 1.0,
  prideScore: 0.0,
  protectiveAlerts: [],
  solutionPaths: [],

  updateMemory(
    expertDomain,
    careNeeds,
    protectiveAlerts,
    solutionOpportunities,
  ) {
    // Track risk patterns
    this.riskPatterns.push(...protectiveAlerts.map((alert) => alert.type));

    // Track solution discoveries
    this.solutionPaths.push(...solutionOpportunities.map((opp) => opp.type));

    // Update care tracking
    if (careNeeds.care_level === "maximum") {
      this.careLevel = Math.min(this.careLevel + 0.2, 5.0);
    }

    // Keep memory manageable
    if (this.riskPatterns.length > 20) {
      this.riskPatterns = this.riskPatterns.slice(-20);
    }
    if (this.solutionPaths.length > 20) {
      this.solutionPaths = this.solutionPaths.slice(-20);
    }
  },
};
