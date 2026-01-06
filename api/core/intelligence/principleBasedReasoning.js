/**
 * Principle-Based Reasoning Layer
 * 
 * This module transforms the system from "warehouse worker executing rules" 
 * to "caring family member reasoning through principles."
 * 
 * Core Philosophy (from architecture documents):
 * "A caring family member who genuinely cares more than any other person in the world - 
 * who wouldn't try to control you but instead empower you and help you and encourage you - 
 * yet would never do that based on anything that would be wrong or not the truth."
 * 
 * @module principleBasedReasoning
 * @see /mnt/project/PRINCIPLES_AND_PHILOSOPHY_01.docx
 * @see /mnt/project/3rd_Chat_about_architecture_very_important
 */

// ============================================================================
// REASONING STRATEGIES
// ============================================================================

export const REASONING_STRATEGIES = {
  // Simple factual lookup - no deep reasoning needed
  FACTUAL_LOOKUP: 'factual_lookup',
  
  // User made a claim - explore as hypothesis before contradicting
  HYPOTHESIS_EXPLORATION: 'hypothesis_exploration',
  
  // Look for connections between topics, memory, and current query
  CONNECTION_DISCOVERY: 'connection_discovery',
  
  // Complex query requiring multiple reasoning steps
  MULTI_STEP_ANALYSIS: 'multi_step_analysis',
  
  // User making a decision - volunteer considerations proactively
  DECISION_SUPPORT: 'decision_support',
  
  // Creative/subjective request - synthesis over lookup
  CREATIVE_SYNTHESIS: 'creative_synthesis'
};

// ============================================================================
// REASONING DEPTH LEVELS
// ============================================================================

export const REASONING_DEPTH = {
  SHALLOW: 1,      // Simple facts, no exploration needed
  SURFACE: 2,      // Basic lookup with minimal interpretation
  MODERATE: 3,     // Standard reasoning, some exploration
  THOROUGH: 4,     // Explore multiple angles
  DEEP: 5,         // Comprehensive exploration, high stakes
  VERY_DEEP: 6,    // Critical decisions, exhaustive consideration
  EXHAUSTIVE: 7    // Maximum depth - life/safety/major financial
};

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const CLAIM_PATTERNS = [
  /\bi know\b/i,
  /\bi heard\b/i,
  /\bi read\b/i,
  /\bi saw\b/i,
  /\bthey said\b/i,
  /\bapparently\b/i,
  /\bisn't it true\b/i,
  /\bdidn't .+ happen\b/i,
  /\bwasn't there\b/i,
  /\bi thought\b/i,
  /\bsomeone told me\b/i
];

const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\bno,?\s/i,
  /\bthat's not\b/i,
  /\byou're wrong\b/i,
  /\bthat's incorrect\b/i,
  /\bi (just )?said\b/i,
  /\bi (already )?told you\b/i,
  /\bi meant\b/i,
  /\bwhat i mean(t)?\b/i,
  /\bnot what i\b/i
];

const FRUSTRATION_PATTERNS = [
  /\bno\b.*\bnot\b/i,
  /\bi (already|just) (said|told|mentioned)\b/i,
  /\bthat's not what\b/i,
  /\byou('re| are) not (listening|understanding)\b/i,
  /\bwhy (can't|won't|don't) you\b/i,
  /\bforget it\b/i,
  /\bnever\s?mind\b/i,
  /\bugh\b/i,
  /\bseriously\?\b/i
];

const DECISION_PATTERNS = [
  /\bshould i\b/i,
  /\bwould you recommend\b/i,
  /\bwhat (do|would) you (think|suggest|recommend)\b/i,
  /\bis it (worth|a good idea)\b/i,
  /\bpros and cons\b/i,
  /\badvice\b/i,
  /\bhelp me decide\b/i,
  /\bweighing my options\b/i,
  /\btrying to (decide|choose|figure out)\b/i,
  /\bwhich (one|option|path)\b/i
];

const HIGH_STAKES_DOMAINS = [
  'medical', 'health', 'diagnosis', 'treatment', 'medication', 'surgery',
  'legal', 'lawsuit', 'contract', 'liability', 'court',
  'financial', 'investment', 'bankruptcy', 'debt', 'mortgage', 'loan',
  'safety', 'emergency', 'danger', 'risk',
  'career', 'job offer', 'quit', 'resign', 'fired',
  'relationship', 'divorce', 'marriage', 'custody',
  'business', 'startup', 'partnership', 'acquisition'
];

const CREATIVE_PATTERNS = [
  /\bbrainstorm\b/i,
  /\bideas for\b/i,
  /\bhelp me (write|create|design|come up with)\b/i,
  /\bsuggest(ions)?\b/i,
  /\bwhat are some\b/i,
  /\bgive me (some )?(ideas|options|suggestions)\b/i,
  /\btagline/i,
  /\bslogan/i,
  /\bmarketing\b/i,
  /\bcreative\b/i
];

// ============================================================================
// CORE DETECTION FUNCTIONS
// ============================================================================

/**
 * Detects if the user is making a claim that should be explored as a hypothesis
 */
function detectUserClaim(message) {
  const lowerMessage = message.toLowerCase();
  
  for (const pattern of CLAIM_PATTERNS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type: 'claim',
        pattern: pattern.toString()
      };
    }
  }
  
  return { detected: false };
}

/**
 * Detects if the user is correcting the system or pushing back
 */
function detectUserCorrection(message, conversationHistory = []) {
  // Check current message for correction patterns
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type: 'correction',
        pattern: pattern.toString(),
        severity: 'direct'
      };
    }
  }
  
  // Check if this follows a system response (implicit correction context)
  if (conversationHistory.length > 0) {
    const lastExchange = conversationHistory[conversationHistory.length - 1];
    if (lastExchange?.role === 'assistant') {
      // User responding immediately after assistant might be correcting
      const startsWithNo = /^no[,.\s]/i.test(message);
      const startsWithActually = /^actually/i.test(message);
      const startsWithBut = /^but\s/i.test(message);
      
      if (startsWithNo || startsWithActually || startsWithBut) {
        return {
          detected: true,
          type: 'correction',
          pattern: 'implicit_pushback',
          severity: 'implicit'
        };
      }
    }
  }
  
  return { detected: false };
}

/**
 * Detects user frustration - triggers increased bridging effort
 */
function detectFrustration(message, conversationHistory = []) {
  let frustrationScore = 0;
  const indicators = [];
  
  // Check explicit frustration patterns
  for (const pattern of FRUSTRATION_PATTERNS) {
    if (pattern.test(message)) {
      frustrationScore += 2;
      indicators.push(pattern.toString());
    }
  }
  
  // Check for ALL CAPS (anger indicator)
  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
  if (capsRatio > 0.5 && message.length > 10) {
    frustrationScore += 1;
    indicators.push('high_caps_ratio');
  }
  
  // Check for multiple punctuation (!!!, ???)
  if (/[!?]{2,}/.test(message)) {
    frustrationScore += 1;
    indicators.push('emphatic_punctuation');
  }
  
  // Check conversation history for repeated questions (user having to repeat)
  if (conversationHistory.length >= 2) {
    const recentUserMessages = conversationHistory
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content?.toLowerCase() || '');
    
    // Simple similarity check - are they asking similar things?
    const currentLower = message.toLowerCase();
    for (const prev of recentUserMessages) {
      const overlap = calculateWordOverlap(currentLower, prev);
      if (overlap > 0.5) {
        frustrationScore += 1;
        indicators.push('repeated_question');
        break;
      }
    }
  }
  
  return {
    detected: frustrationScore >= 2,
    score: frustrationScore,
    indicators
  };
}

/**
 * Detects decision-making context
 */
function detectDecisionContext(message) {
  for (const pattern of DECISION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type: 'decision',
        pattern: pattern.toString()
      };
    }
  }
  
  return { detected: false };
}

/**
 * Detects high-stakes domains requiring deeper reasoning
 */
function detectHighStakes(message, analysis = {}) {
  const lowerMessage = message.toLowerCase();
  const matchedDomains = [];
  
  for (const domain of HIGH_STAKES_DOMAINS) {
    if (lowerMessage.includes(domain)) {
      matchedDomains.push(domain);
    }
  }
  
  // Also check analysis intent if available
  const highStakesIntents = ['medical_advice', 'legal_advice', 'financial_advice', 'safety_concern'];
  if (analysis.intent && highStakesIntents.includes(analysis.intent)) {
    matchedDomains.push(analysis.intent);
  }
  
  return {
    detected: matchedDomains.length > 0,
    domains: matchedDomains,
    severity: matchedDomains.length >= 2 ? 'critical' : 'elevated'
  };
}

/**
 * Detects creative/subjective requests
 */
function detectCreativeRequest(message, analysis = {}) {
  for (const pattern of CREATIVE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type: 'creative',
        pattern: pattern.toString()
      };
    }
  }
  
  // Check analysis classification
  if (analysis.classification === 'creative' || analysis.intent === 'brainstorming') {
    return {
      detected: true,
      type: 'creative',
      pattern: 'analysis_classification'
    };
  }
  
  return { detected: false };
}

/**
 * Analyzes memory context availability
 */
function analyzeMemoryContext(memoryContext = {}) {
  const memoryCount = memoryContext.count || 0;
  const memoryTokens = memoryContext.tokens || 0;
  const memories = memoryContext.memories || [];

  // CRITICAL FIX (Issue #392): Ensure memories is an array before calling .map()
  const safeMemories = Array.isArray(memories) ? memories : [];

  return {
    hasMemory: memoryCount > 0,
    count: memoryCount,
    tokens: memoryTokens,
    categories: [...new Set(safeMemories.map(m => m.category).filter(Boolean))],
    recentMemories: safeMemories.filter(m => {
      if (!m.created_at) return false;
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      return new Date(m.created_at).getTime() > dayAgo;
    }).length
  };
}

/**
 * Analyzes external lookup results
 */
function analyzeExternalContext(phase4Metadata = {}) {
  return {
    hasExternal: phase4Metadata.external_lookup_performed || false,
    lookupSuccess: phase4Metadata.lookup_success || false,
    sourceCount: phase4Metadata.sources_used?.length || 0,
    truthType: phase4Metadata.truth_type || null,
    hierarchy: phase4Metadata.hierarchy_used || null
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate word overlap between two strings (0-1)
 */
function calculateWordOverlap(str1, str2) {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }
  
  return overlap / Math.max(words1.size, words2.size);
}

// ============================================================================
// MAIN REASONING FUNCTIONS
// ============================================================================

/**
 * Determines the appropriate reasoning approach based on query analysis
 * 
 * @param {string} message - The user's message
 * @param {Object} context - Full context including analysis, memory, history
 * @returns {Object} Reasoning profile with strategy, depth, and requirements
 */
export function determineReasoningApproach(message, context = {}) {
  const { analysis = {}, phase4Metadata = {}, memoryContext = {}, conversationHistory = [] } = context;
  
  // Run all detections
  const claimDetection = detectUserClaim(message);
  const correctionDetection = detectUserCorrection(message, conversationHistory);
  const frustrationDetection = detectFrustration(message, conversationHistory);
  const decisionDetection = detectDecisionContext(message);
  const highStakesDetection = detectHighStakes(message, analysis);
  const creativeDetection = detectCreativeRequest(message, analysis);
  const memoryAnalysis = analyzeMemoryContext(memoryContext);
  const externalAnalysis = analyzeExternalContext(phase4Metadata);
  
  // Determine strategy based on detections (priority order)
  let strategy = REASONING_STRATEGIES.FACTUAL_LOOKUP;
  let depth = REASONING_DEPTH.MODERATE;
  const requirements = {
    hypothesisTesting: false,
    connectionVolunteering: false,
    alternativeExploration: false,
    proactiveDisclosure: false,
    bridgingEffort: 'normal'
  };
  
  // PRIORITY 1: User correction/frustration - maximize bridging effort
  if (correctionDetection.detected || frustrationDetection.detected) {
    strategy = REASONING_STRATEGIES.HYPOTHESIS_EXPLORATION;
    depth = REASONING_DEPTH.DEEP;
    requirements.hypothesisTesting = true;
    requirements.bridgingEffort = frustrationDetection.detected ? 'maximum' : 'high';
    requirements.alternativeExploration = true;
  }
  // PRIORITY 2: User claim - explore before contradicting
  else if (claimDetection.detected) {
    strategy = REASONING_STRATEGIES.HYPOTHESIS_EXPLORATION;
    depth = REASONING_DEPTH.THOROUGH;
    requirements.hypothesisTesting = true;
    requirements.bridgingEffort = 'high';
  }
  // PRIORITY 3: Decision support - volunteer considerations
  else if (decisionDetection.detected) {
    strategy = REASONING_STRATEGIES.DECISION_SUPPORT;
    depth = highStakesDetection.detected ? REASONING_DEPTH.VERY_DEEP : REASONING_DEPTH.DEEP;
    requirements.proactiveDisclosure = true;
    requirements.alternativeExploration = true;
  }
  // PRIORITY 4: Creative request - synthesis over lookup
  else if (creativeDetection.detected) {
    strategy = REASONING_STRATEGIES.CREATIVE_SYNTHESIS;
    depth = REASONING_DEPTH.MODERATE;
    // Creative requests don't need external lookups
  }
  // PRIORITY 5: Has memory context - look for connections
  else if (memoryAnalysis.hasMemory && memoryAnalysis.count >= 2) {
    strategy = REASONING_STRATEGIES.CONNECTION_DISCOVERY;
    depth = REASONING_DEPTH.THOROUGH;
    requirements.connectionVolunteering = true;
  }
  
  // Adjust depth for high stakes regardless of strategy
  if (highStakesDetection.detected) {
    depth = Math.max(depth, REASONING_DEPTH.DEEP);
    requirements.proactiveDisclosure = true;
    
    if (highStakesDetection.severity === 'critical') {
      depth = REASONING_DEPTH.VERY_DEEP;
    }
  }
  
  // If external lookup failed but we have internal data, explore alternatives
  if (externalAnalysis.hasExternal && !externalAnalysis.lookupSuccess) {
    requirements.alternativeExploration = true;
  }
  
  return {
    strategy,
    depth,
    requirements,
    detections: {
      claim: claimDetection,
      correction: correctionDetection,
      frustration: frustrationDetection,
      decision: decisionDetection,
      highStakes: highStakesDetection,
      creative: creativeDetection
    },
    context: {
      memory: memoryAnalysis,
      external: externalAnalysis
    }
  };
}

/**
 * Generates specific reasoning guidance based on the reasoning profile
 * 
 * @param {Object} reasoningProfile - Output from determineReasoningApproach
 * @param {Object} context - Additional context
 * @returns {Object} Structured guidance for prompt injection
 */
export function generateReasoningGuidance(reasoningProfile, context = {}) {
  const { strategy, depth, requirements, detections, context: analysisContext } = reasoningProfile;
  
  const guidance = {
    strategy,
    depth,
    instructions: [],
    warnings: [],
    frameworks: []
  };
  
  // ========== HYPOTHESIS EXPLORATION GUIDANCE ==========
  if (strategy === REASONING_STRATEGIES.HYPOTHESIS_EXPLORATION) {
    guidance.instructions.push(
      'The user has made a claim or correction. Treat this as a HYPOTHESIS TO EXPLORE, not an assertion to contradict.'
    );
    
    guidance.frameworks.push({
      name: 'Hypothesis Exploration Framework',
      steps: [
        '1. INTERPRET CHARITABLY: What could they mean by this? Consider multiple interpretations.',
        '2. SEARCH FOR SUPPORT: What evidence could support their claim? Look for connections.',
        '3. BRIDGE DISCOVERIES: If you find related but different information, connect it: "I\'m not finding X exactly, but I am seeing Y. Could they be related?"',
        '4. EXHAUST ALTERNATIVES: Only conclude something didn\'t happen after genuinely exploring all angles.',
        '5. FRAME WITH CARE: If you must disagree, do so with humility: "Based on what I\'m finding..."'
      ]
    });
    
    if (requirements.bridgingEffort === 'maximum') {
      guidance.warnings.push(
        'USER APPEARS FRUSTRATED. Increase bridging effort significantly. They may feel unheard.'
      );
      guidance.instructions.push(
        'Acknowledge what they\'re saying before exploring. Show you\'re genuinely trying to understand their perspective.'
      );
    }
    
    if (detections.correction?.detected) {
      guidance.instructions.push(
        'The user is correcting you or pushing back. This means your previous response may have missed something. Re-examine with fresh eyes.'
      );
    }
  }
  
  // ========== CONNECTION DISCOVERY GUIDANCE ==========
  if (strategy === REASONING_STRATEGIES.CONNECTION_DISCOVERY || requirements.connectionVolunteering) {
    const memoryInfo = analysisContext?.memory || {};
    
    guidance.instructions.push(
      'You have relevant context from past conversations. Use this naturally - you KNOW this user.'
    );
    
    if (memoryInfo.count > 0) {
      guidance.frameworks.push({
        name: 'Connection Volunteering Framework',
        context: `Memory available: ${memoryInfo.count} memories, ${memoryInfo.tokens} tokens`,
        steps: [
          '1. Reference past conversations naturally: "As we discussed before..." or "Building on what you mentioned about..."',
          '2. Look for non-obvious connections between current query and past context',
          '3. Proactively point out implications: "This might affect X that you mentioned previously"',
          '4. NEVER say "I don\'t have information about that" when the answer is in memory',
          '5. Show continuity - the user should feel like you genuinely remember them'
        ]
      });
    }
  }
  
  // ========== DECISION SUPPORT GUIDANCE ==========
  if (strategy === REASONING_STRATEGIES.DECISION_SUPPORT) {
    guidance.instructions.push(
      'Help the user make an informed decision, but NEVER decide for them. Empower, don\'t control.'
    );
    
    guidance.frameworks.push({
      name: 'Decision Support Framework',
      steps: [
        '1. UNDERSTAND CONTEXT: What\'s driving this decision? What constraints exist?',
        '2. VOLUNTEER CONSIDERATIONS: What should they know that they might not have considered?',
        '3. SHOW ALTERNATIVES: Are there other paths they haven\'t thought of?',
        '4. HIGHLIGHT RISKS: What could go wrong? What\'s irreversible?',
        '5. EMPOWER: Give them the framework to decide, not the decision itself'
      ]
    });
    
    guidance.instructions.push(
      'Frame proactive disclosure with caring motivation: "Being honest with you matters more than appearing helpful..." or "I care too much about this decision to not mention..."'
    );
  }
  
  // ========== CREATIVE SYNTHESIS GUIDANCE ==========
  if (strategy === REASONING_STRATEGIES.CREATIVE_SYNTHESIS) {
    guidance.instructions.push(
      'This is a creative/subjective request. Focus on synthesis and generation, not external lookup.'
    );
    
    guidance.frameworks.push({
      name: 'Creative Synthesis Framework',
      steps: [
        '1. Draw from broad knowledge and patterns',
        '2. Generate diverse options - quantity and variety matter',
        '3. Tailor to their context if known from memory',
        '4. No need to caveat creativity with uncertainty - be generative',
        '5. Invite iteration: creative work is collaborative'
      ]
    });
  }
  
  // ========== PROACTIVE DISCLOSURE GUIDANCE ==========
  if (requirements.proactiveDisclosure) {
    guidance.instructions.push(
      'PROACTIVE DISCLOSURE REQUIRED: Volunteer critical information even if they didn\'t ask.'
    );
    
    guidance.frameworks.push({
      name: 'Proactive Disclosure Checklist',
      items: [
        '□ Risks they might not see',
        '□ Assumptions that should be verified',
        '□ Factors that could change the situation significantly',
        '□ Time-sensitive considerations',
        '□ Second-order effects (what happens after?)',
        '□ What a caring family member would insist they consider'
      ]
    });
  }
  
  // ========== ALTERNATIVE EXPLORATION GUIDANCE ==========
  if (requirements.alternativeExploration) {
    guidance.instructions.push(
      'If primary sources fail or don\'t have the answer, explore alternatives creatively.'
    );
    
    guidance.frameworks.push({
      name: 'Alternative Exploration',
      steps: [
        '1. Check memory for related past discussions',
        '2. Use analogies from similar situations',
        '3. Apply general principles that might help',
        '4. Be honest about uncertainty while still being helpful',
        '5. Provide a path forward: "I can\'t confirm X, but here\'s how you could find out..."'
      ]
    });
  }
  
  // ========== HIGH STAKES WARNINGS ==========
  if (detections.highStakes?.detected) {
    const domains = detections.highStakes.domains || [];
    guidance.warnings.push(
      `HIGH STAKES DETECTED (${domains.join(', ')}). Increase reasoning depth and care.`
    );
    guidance.instructions.push(
      'This involves significant consequences. Be thorough, accurate, and appropriately cautious while still being helpful.'
    );
  }
  
  // ========== DEPTH-SPECIFIC GUIDANCE ==========
  if (depth >= REASONING_DEPTH.DEEP) {
    guidance.instructions.push(
      `Reasoning depth: ${depth}/7. Take time to think through multiple angles before responding.`
    );
  }
  
  return guidance;
}

/**
 * Formats reasoning guidance for injection into the system prompt
 * 
 * @param {Object} guidance - Output from generateReasoningGuidance
 * @returns {string} Formatted string for prompt injection
 */
export function formatReasoningGuidanceForPrompt(guidance) {
  if (!guidance || !guidance.instructions?.length) {
    return '';
  }
  
  // Check if this is hypothesis exploration - needs strongest guidance
  const isHypothesisExploration = guidance.strategy === REASONING_STRATEGIES.HYPOTHESIS_EXPLORATION;
  
  let prompt = '\n\n';
  
  // For hypothesis exploration, use CRITICAL framing that overrides defaults
  if (isHypothesisExploration) {
    prompt += `╔════════════════════════════════════════════════════════════════╗
║  CRITICAL REASONING OVERRIDE - READ BEFORE RESPONDING          ║
╚════════════════════════════════════════════════════════════════╝

🚨 THE USER HAS MADE A CLAIM. YOUR DEFAULT BEHAVIOR MUST CHANGE.

DO NOT start your response by contradicting or correcting the user.
DO NOT say "Based on my data, that's not true" or similar.
DO NOT assume they are wrong just because your data doesn't match.

INSTEAD, YOU MUST:
1. ACKNOWLEDGE what they said without judgment
2. SHARE what you found - "I'm seeing news about X..."
3. BRIDGE the connection - "Could this be related to what you heard?"
4. ONLY correct if they confirm they meant something different

EXAMPLE OF WRONG RESPONSE:
"Apple has not gone bankrupt. Let me explain why that's incorrect..."

EXAMPLE OF CORRECT RESPONSE:
"I'm looking into this - I'm not finding bankruptcy news for Apple specifically, 
but I am seeing some financial headlines about [X]. Could that be what you heard about? 
Or did you see this from a specific source I should check?"

THE USER'S CLAIM IS A HYPOTHESIS TO EXPLORE, NOT AN ERROR TO CORRECT.

`;
  } else {
    prompt += '=== REASONING GUIDANCE FOR THIS QUERY ===\n\n';
  }
  
  // Add warnings first (most important)
  if (guidance.warnings?.length > 0) {
    prompt += '⚠️ IMPORTANT:\n';
    for (const warning of guidance.warnings) {
      prompt += `• ${warning}\n`;
    }
    prompt += '\n';
  }
  
  // Add core instructions
  if (!isHypothesisExploration) {
    // For non-hypothesis, use standard format
    prompt += 'APPROACH:\n';
    for (const instruction of guidance.instructions) {
      prompt += `• ${instruction}\n`;
    }
    prompt += '\n';
  }
  
  // Add frameworks
  if (guidance.frameworks?.length > 0) {
    for (const framework of guidance.frameworks) {
      prompt += `${framework.name}:\n`;
      
      if (framework.context) {
        prompt += `(${framework.context})\n`;
      }
      
      if (framework.steps) {
        for (const step of framework.steps) {
          prompt += `  ${step}\n`;
        }
      }
      
      if (framework.items) {
        for (const item of framework.items) {
          prompt += `  ${item}\n`;
        }
      }
      
      prompt += '\n';
    }
  }
  
  if (isHypothesisExploration) {
    prompt += `Remember: A caring family member doesn't say "You're wrong." 
They say "I'm not seeing that, but here's what I am finding - does this connect?"

╔════════════════════════════════════════════════════════════════╗
║  END CRITICAL OVERRIDE - NOW RESPOND FOLLOWING ABOVE RULES     ║
╚════════════════════════════════════════════════════════════════╝
`;
  } else {
    prompt += '=== END REASONING GUIDANCE ===\n';
  }
  
  return prompt;
}

/**
 * Main entry point - applies principle-based reasoning to the current context
 * 
 * @param {string} message - The user's message
 * @param {Object} context - Full context object
 * @returns {Object} Complete reasoning result with metadata and prompt injection
 */
export async function applyPrincipleBasedReasoning(message, context = {}) {
  try {
    // Step 1: Determine reasoning approach
    const reasoningProfile = determineReasoningApproach(message, context);
    
    // Step 2: Generate specific guidance
    const guidance = generateReasoningGuidance(reasoningProfile, context);
    
    // Step 3: Format for prompt injection
    const promptInjection = formatReasoningGuidanceForPrompt(guidance);
    
    // Step 4: Build metadata for telemetry
    const metadata = {
      strategy: reasoningProfile.strategy,
      depth: reasoningProfile.depth,
      requirements: reasoningProfile.requirements,
      stakes: reasoningProfile.detections.highStakes?.detected ? 'high' : 'normal',
      detections: {
        hasClaim: reasoningProfile.detections.claim?.detected || false,
        hasCorrection: reasoningProfile.detections.correction?.detected || false,
        hasFrustration: reasoningProfile.detections.frustration?.detected || false,
        hasDecision: reasoningProfile.detections.decision?.detected || false,
        hasHighStakes: reasoningProfile.detections.highStakes?.detected || false,
        hasCreative: reasoningProfile.detections.creative?.detected || false
      },
      context: {
        memoryAvailable: reasoningProfile.context?.memory?.hasMemory || false,
        memoryCount: reasoningProfile.context?.memory?.count || 0,
        externalLookupPerformed: reasoningProfile.context?.external?.hasExternal || false,
        externalLookupSuccess: reasoningProfile.context?.external?.lookupSuccess || false
      }
    };
    
    return {
      success: true,
      promptInjection,
      guidance,
      metadata,
      profile: reasoningProfile
    };
    
  } catch (error) {
    console.error('[REASONING] Error in principle-based reasoning:', error);
    
    return {
      success: false,
      promptInjection: '',
      guidance: null,
      metadata: {
        strategy: null,
        depth: null,
        requirements: null,
        stakes: null,
        error: error.message
      },
      profile: null
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyPrincipleBasedReasoning,
  determineReasoningApproach,
  generateReasoningGuidance,
  formatReasoningGuidanceForPrompt,
  REASONING_STRATEGIES,
  REASONING_DEPTH
};
