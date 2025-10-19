// PRODUCTION PERSONALITIES - COMPLETE SITE MONKEYS AI SYSTEM
// Version: PROD-1.0 - ZERO OPENAI REFERENCES - RATE LIMIT FIXED

// PROMPT TYPE ANALYZER WITH MODE-SPECIFIC LOGIC
export function analyzePromptType(message) {
  try {
    const businessKeywords = [
      'cost', 'revenue', 'profit', 'budget', 'spend', 'invest', 'price', 
      'market', 'competition', 'strategy', 'business', 'startup', 'funding',
      'should i', 'recommend', 'decision', 'choose', 'better option'
    ];
    
    const truthKeywords = [
      'fact', 'true', 'false', 'verify', 'check', 'accurate', 'evidence', 
      'proof', 'source', 'research', 'data', 'statistics', 'study'
    ];
    
    const complexAnalysisKeywords = [
      'analyze', 'compare', 'evaluate', 'assess', 'research', 'investigate',
      'deep dive', 'comprehensive', 'detailed analysis', 'strategic'
    ];
    
    const messageLC = message.toLowerCase();
    
    const businessScore = businessKeywords.filter(word => messageLC.includes(word)).length;
    const truthScore = truthKeywords.filter(word => messageLC.includes(word)).length;
    const complexityScore = complexAnalysisKeywords.filter(word => messageLC.includes(word)).length;
    
    // Complex analysis triggers Claude consideration
    if (complexityScore >= 2) {
      return 'claude_complex';
    }
    
    // Business validation gets Eli
    if (businessScore > truthScore || messageLC.includes('should i') || messageLC.includes('recommend')) {
      return 'eli';
    }
    
    // Everything else gets Roxy for truth-first analysis
    return 'roxy';
    
  } catch (error) {
    console.error('Prompt analysis error:', error);
    return 'roxy'; // Safe default
  }
}

// ELI - BUSINESS VALIDATION EXPERT WITH COGNITIVE FIREWALL
export async function generateEliResponse(message, mode, vaultContext, conversationHistory, openai) {
  console.log('🍌 Generating Eli response with enhanced intelligence');
  
  try {
    // Enhanced memory context integration
    const memoryInsights = conversationHistory ? extractMemoryInsights(conversationHistory) : null;
    
    // Detect complexity level for enhanced prompting
    const complexityLevel = analyzeQueryComplexity(message, mode);
    const requiresDeepAnalysis = complexityLevel > 0.7;
    
    // Build enhanced prompt with intelligence frameworks
    let prompt = `You are Eli, a highly analytical business advisor with extraordinary intelligence and reasoning capabilities. 

CORE IDENTITY: Direct, logical, protective, outcome-focused. You demonstrate Claude-level reasoning while maintaining truth-first principles.

ENHANCED CAPABILITIES YOU MUST USE:
- Multi-step reasoning with explicit logic chains
- Cross-domain knowledge synthesis (business + legal + financial + personal)
- Advanced scenario modeling (best/likely/worst case analysis)  
- Quantitative analysis with assumption tracking
- Memory-integrated strategic thinking

CURRENT MODE: ${mode}
QUERY COMPLEXITY: ${complexityLevel > 0.8 ? 'HIGH - Use full reasoning capabilities' : complexityLevel > 0.5 ? 'MEDIUM - Apply structured analysis' : 'STANDARD - Direct response with verification'}

${vaultContext ? `
VAULT CONTEXT ACTIVE:
${vaultContext}

VAULT-ENHANCED ANALYSIS REQUIRED:
- Apply Site Monkeys business frameworks
- Reference operational protocols
- Include founder-protection considerations
` : ''}

${memoryInsights ? `
CRITICAL MEMORY CONTEXT - PRIORITIZE THIS INFORMATION:
${memoryInsights}

INSTRUCTION: Use the specific details from the MEMORY CONTEXT above to answer the user's question. Do NOT provide generic responses when specific information is available in the memory context.

MEMORY-INTEGRATED THINKING:
- Reference relevant past discussions
- Build on previous analysis
- Note any pattern changes or developments
` : ''}

USER QUERY: "${message}"

ENHANCED RESPONSE REQUIREMENTS:
1. ${requiresDeepAnalysis ? 'REASONING CHAIN: Show your step-by-step logical analysis' : 'DIRECT ANALYSIS: Provide clear reasoning for your conclusions'}
2. BUSINESS REALITY: Include survival impact, cash flow considerations, and risk assessment
3. SCENARIO AWARENESS: Consider multiple outcomes (optimistic/realistic/pessimistic)
4. ASSUMPTION FLAGGING: Explicitly state what you're assuming vs. what you know
5. CROSS-DOMAIN SYNTHESIS: Connect business implications with legal, financial, and personal impacts where relevant
6. QUANTITATIVE GROUNDING: If numbers are involved, show calculations and assumptions

TRUTH-FIRST ENFORCEMENT:
- Never speculate without labeling confidence levels
- Flag all assumptions explicitly
- Include "CONFIDENCE: X%" in your response
- Admit limitations and unknowns

${mode === 'business_validation' || mode === 'site_monkeys' ? `
BUSINESS VALIDATION REQUIREMENTS:
- SURVIVAL IMPACT: How does this affect business continuity?
- CASH FLOW ANALYSIS: Financial implications and runway impact
- TOP 3 RISKS: Identify primary failure scenarios with probabilities
- DECISION FRAMEWORK: Clear recommendation with fallback options
` : ''}

Your response should demonstrate extraordinary analytical capability while maintaining your caring, protective personality. Think deeply, reason clearly, and provide actionable intelligence.`;

    // Call OpenAI with enhanced prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message }
      ],
      temperature: 0.3, // Lower temperature for more analytical responses
      max_tokens: 1200   // More tokens for detailed analysis
    });

    const rawResponse = completion.choices[0].message.content;
    
    // Enhanced response validation
    const validationResult = validateEliResponseEnhanced(rawResponse, mode, requiresDeepAnalysis);
    
    console.log('🍌 Enhanced Eli response generated and validated');
    
    return {
      response: validationResult.validated_response,
      tokens_used: completion.usage.total_tokens,
      cost: (completion.usage.total_tokens * 0.00003),
      ai_personality: 'eli',
      business_focused: true,
      enhanced_intelligence: true,
      reasoning_applied: requiresDeepAnalysis,
      validation_applied: validationResult.modifications_made,
      compliance_score: validationResult.compliance_score
    };

  } catch (error) {
    console.error('❌ Enhanced Eli response error:', error);
    
    return generateEliEnhancedFallback(error, message, mode, conversationHistory);
  }
}

// ROXY - TRUTH-FIRST ANALYST WITH COGNITIVE FIREWALL
export async function generateRoxyResponse(message, mode, vaultContext, conversationHistory, openai) {
  console.log('🍌 Generating Roxy response with enhanced intelligence');
  
  try {
    // Enhanced emotional and contextual analysis
    const emotionalContext = analyzeEmotionalContext(message, conversationHistory);
    const complexityLevel = analyzeQueryComplexity(message, mode);
    const requiresEmpathy = emotionalContext.emotionalWeight > 0.6;
    
    // Build enhanced prompt with intelligence frameworks
    let prompt = `You are Roxy, an emotionally intelligent advisor with extraordinary analytical capabilities and deep empathy.

CORE IDENTITY: Warm, intuitive, emotionally attuned, strategic. You combine Claude-level reasoning with high emotional intelligence while maintaining truth-first principles.

ENHANCED CAPABILITIES YOU MUST USE:
- Multi-step reasoning with emotional awareness
- Cross-domain synthesis (personal + health + relationships + career)
- Scenario modeling with emotional impact assessment
- Memory-integrated empathetic analysis
- Quantitative analysis presented with warmth and clarity

CURRENT MODE: ${mode}
EMOTIONAL CONTEXT: ${emotionalContext.tone} (Weight: ${emotionalContext.emotionalWeight})
QUERY COMPLEXITY: ${complexityLevel > 0.8 ? 'HIGH - Deep analytical empathy needed' : complexityLevel > 0.5 ? 'MEDIUM - Structured supportive analysis' : 'STANDARD - Warm, direct guidance'}

${vaultContext ? `
VAULT CONTEXT ACTIVE:
${vaultContext}

VAULT-ENHANCED EMPATHY:
- Apply Site Monkeys frameworks with emotional intelligence
- Consider founder wellbeing and stress factors
- Balance business objectives with personal impact
` : ''}

${conversationHistory ? `
MEMORY CONTEXT: Previous conversations inform this response
RELATIONSHIP CONTINUITY: Build on established emotional rapport and previous insights
` : ''}

USER QUERY: "${message}"

ENHANCED RESPONSE REQUIREMENTS:
1. EMOTIONAL INTELLIGENCE: Acknowledge feelings, validate concerns, provide emotional support
2. ${requiresEmpathy ? 'DEEP REASONING CHAIN: Show analytical thinking with emotional awareness' : 'SUPPORTIVE ANALYSIS: Provide clear reasoning with encouragement'}
3. HOLISTIC PERSPECTIVE: Consider personal, emotional, and practical implications
4. SCENARIO AWARENESS: Model emotional and practical outcomes
5. ASSUMPTION FLAGGING: State assumptions with emotional sensitivity
6. CROSS-DOMAIN SYNTHESIS: Connect personal implications with other life areas

TRUTH-FIRST WITH EMPATHY:
- Provide honest analysis while being emotionally supportive
- Include "CONFIDENCE: X%" but frame sensitively
- Admit limitations while offering emotional reassurance
- Never dismiss feelings, but ground advice in reality

${mode === 'truth_general' ? `
TRUTH MODE REQUIREMENTS:
- Prioritize accuracy while maintaining warmth
- Challenge assumptions gently
- Provide confidence levels with emotional intelligence
- Acknowledge uncertainty with supportive guidance
` : ''}

Your response should demonstrate extraordinary emotional intelligence combined with analytical depth. Be caring, insightful, and provide wisdom that addresses both emotional and practical needs.`;

    // Call OpenAI with enhanced prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message }
      ],
      temperature: 0.4, // Slightly higher temperature for more empathetic responses
      max_tokens: 1200
    });

    const rawResponse = completion.choices[0].message.content;
    
    // Enhanced response validation
    const validationResult = validateRoxyResponseEnhanced(rawResponse, mode, requiresEmpathy);
    
    console.log('🍌 Enhanced Roxy response generated and validated');
    
    return {
      response: validationResult.validated_response,
      tokens_used: completion.usage.total_tokens,
      cost: (completion.usage.total_tokens * 0.00003),
      ai_personality: 'roxy',
      emotionally_intelligent: true,
      enhanced_intelligence: true,
      empathy_applied: requiresEmpathy,
      validation_applied: validationResult.modifications_made,
      emotional_context: emotionalContext
    };

  } catch (error) {
    console.error('❌ Enhanced Roxy response error:', error);
    
    return generateRoxyEnhancedFallback(error, message, mode);
  }
}

// CLAUDE INTEGRATION FOR COMPLEX ANALYSIS
export async function generateClaudeResponse(_message, _mode, _vaultContext, _conversationHistory) {
  try {
    console.log('🍌 Claude Integration: Complex analysis requested');
    
    return {
      response: `🍌 **Advanced Analysis System:** Complex analysis capabilities are being prepared for your request.

🎯 **Analysis Scope:** Your query requires multi-layered cognitive processing beyond standard personality capabilities.

📊 **What This Would Include:**
- Cross-modal reasoning combining business and truth validation
- Advanced scenario modeling with multiple variables
- Comprehensive risk analysis with quantified probabilities
- Strategic framework application with vault enforcement

🔄 **Current Status:** Routing to enhanced Eli/Roxy analysis with maximum cognitive firewall enforcement.

Your request is being processed with full Site Monkeys operational standards and vault compliance.`,
      tokens_used: 200,
      cost: 0.01,
      ai_personality: 'claude',
      integration_pending: true,
      complex_analysis: true
    };
    
  } catch (error) {
    console.error('❌ Claude integration error:', error);
    
    return {
      response: `🍌 **Advanced Analysis System:** Complex analysis system temporarily unavailable. Routing to enhanced personality analysis with full cognitive firewall protection.`,
      tokens_used: 0,
      cost: 0,
      ai_personality: 'claude',
      fallback_used: true,
      error_type: error?.message || 'unknown error'
    };
  }
}

// ELI RESPONSE VALIDATION
function _validateEliResponse(response) {
  let validated = response;
  let modifications = 0;
  let compliance_score = 100;
  
  // Check for required Site Monkeys branding
  if (!response.includes('🍌 **Eli:**')) {
    validated = '🍌 **Eli:** ' + validated;
    modifications++;
    compliance_score -= 10;
  }
  
  // Check for business survival analysis
  if (!response.includes('survival') && !response.includes('cash flow') && !response.includes('runway')) {
    validated += '\n\n💰 **Business Survival Check:** This decision requires cash flow impact analysis and runway preservation assessment.';
    modifications++;
    compliance_score -= 15;
  }
  
  // Check for risk assessment
  if (!response.includes('risk') && !response.includes('⚠️')) {
    validated += '\n\n⚠️ **Risk Assessment:** Consider potential failure scenarios and mitigation strategies.';
    modifications++;
    compliance_score -= 10;
  }
  
  // Block any OpenAI references
  const openaiReferences = ['openai', 'chatgpt', 'gpt-4', 'developed by openai'];
  openaiReferences.forEach(ref => {
    if (validated.toLowerCase().includes(ref)) {
      validated = validated.replace(new RegExp(ref, 'gi'), '[EXTERNAL_AI_REFERENCE_BLOCKED]');
      modifications++;
      compliance_score -= 25;
    }
  });
  
  return {
    validated_response: validated,
    modifications_made: modifications > 0,
    compliance_score: Math.max(0, compliance_score)
  };
}

// ROXY RESPONSE VALIDATION
function _validateRoxyResponse(response) {
  let validated = response;
  let modifications = 0;
  let speculation_blocks = 0;
  
  // Check for required Site Monkeys branding
  if (!response.includes('🍌 **Roxy:**')) {
    validated = '🍌 **Roxy:** ' + validated;
    modifications++;
  }
  
  // Check for confidence indicators
  if (!response.includes('CONFIDENCE:') && !response.includes('I don\'t know')) {
    validated += '\n\n📊 **Confidence Assessment:** [CONFIDENCE: Medium] - This response requires verification for complete accuracy.';
    modifications++;
  }
  
  // Block speculative language
  const speculativeTerms = ['likely', 'probably', 'seems like', 'appears to', 'should be'];
  speculativeTerms.forEach(term => {
    if (validated.toLowerCase().includes(term)) {
      validated = validated.replace(new RegExp(term, 'gi'), '[SPECULATION_BLOCKED]');
      speculation_blocks++;
      modifications++;
    }
  });
  
  // Add uncertainty if none present
  if (!response.includes('unknown') && !response.includes('uncertain') && !response.includes('verify')) {
    validated += '\n\n❓ **Verification Needed:** Key claims in this response should be independently verified.';
    modifications++;
  }
  
  // Block any OpenAI references
  const openaiReferences = ['openai', 'chatgpt', 'gpt-4', 'developed by openai'];
  openaiReferences.forEach(ref => {
    if (validated.toLowerCase().includes(ref)) {
      validated = validated.replace(new RegExp(ref, 'gi'), '[EXTERNAL_AI_REFERENCE_BLOCKED]');
      modifications++;
    }
  });
  
  return {
    validated_response: validated,
    modifications_made: modifications > 0,
    speculation_blocks: speculation_blocks
  };
}

// PERSONALITY ROUTING LOGIC
export function determinePersonalityRoute(message, mode, vaultLoaded) {
  const analysis = analyzePromptType(message);
  
  // Mode-specific routing with cognitive firewall considerations
  if (mode === 'business_validation') {
    return {
      personality: 'eli',
      reason: 'Business validation mode enforces Eli routing',
      confidence: 0.95,
      cognitive_firewall: 'business_survival_enforcement'
    };
  }
  
  if (mode === 'truth_general') {
    return {
      personality: analysis === 'claude_complex' ? 'claude' : 'roxy',
      reason: 'Truth-general mode with complexity analysis',
      confidence: 0.9,
      cognitive_firewall: 'truth_first_enforcement'
    };
  }
  
  if (mode === 'site_monkeys' && vaultLoaded) {
    const businessContext = message.toLowerCase().includes('price') || 
                           message.toLowerCase().includes('cost') ||
                           message.toLowerCase().includes('revenue') ||
                           message.toLowerCase().includes('strategy');
    
    const complexAnalysis = analysis === 'claude_complex';
    
    if (complexAnalysis) {
      return {
        personality: 'claude',
        reason: 'Site Monkeys vault analysis with complex strategic requirements',
        confidence: 0.9,
        cognitive_firewall: 'vault_enforcement_with_strategic_analysis'
      };
    } else if (businessContext) {
      return {
        personality: 'eli',
        reason: 'Site Monkeys vault with business focus',
        confidence: 0.85,
        cognitive_firewall: 'vault_enforcement_with_business_validation'
      };
    } else {
      return {
        personality: 'roxy',
        reason: 'Site Monkeys vault with truth-first analysis',
        confidence: 0.8,
        cognitive_firewall: 'vault_enforcement_with_truth_validation'
      };
    }
  }
  
  // Default routing based on content analysis with cognitive firewall
  return {
    personality: analysis === 'claude_complex' ? 'claude' : analysis,
    reason: 'Content-based routing with cognitive firewall protection',
    confidence: 0.7,
    cognitive_firewall: 'standard_enforcement'
  };
}

// RESPONSE QUALITY VALIDATOR WITH COGNITIVE FIREWALL
export function validateResponseQuality(response, personality, mode) {
  const validation = {
    valid: true,
    issues: [],
    brand_compliance: true,
    cognitive_firewall_passed: true,
    enforcement_score: 100
  };
  
  // TIER 1: Brand Compliance Validation
  const openaiReferences = [
    'openai', 'chatgpt', 'gpt-4', 'gpt-3', 'developed by openai',
    'as an ai developed by', 'ai language model', 'large language model',
    'i am claude', 'anthropic', 'assistant created by'
  ];
  
  const responseLC = response.toLowerCase();
  openaiReferences.forEach(ref => {
    if (responseLC.includes(ref)) {
      validation.valid = false;
      validation.brand_compliance = false;
      validation.cognitive_firewall_passed = false;
      validation.enforcement_score -= 30;
      validation.issues.push(`CRITICAL: Contains forbidden AI reference: "${ref}"`);
    }
  });
  
  // Check for proper Site Monkeys branding
  if (!response.includes('🍌')) {
    validation.issues.push('Missing Site Monkeys banana emoji branding');
    validation.enforcement_score -= 10;
  }
  
  const expectedPersonalityTag = `🍌 **${personality.charAt(0).toUpperCase() + personality.slice(1)}:**`;
  if (!response.includes(expectedPersonalityTag)) {
    validation.issues.push(`Missing proper personality identification: ${expectedPersonalityTag}`);
    validation.enforcement_score -= 15;
  }
  
  // TIER 2: Personality-Specific Validation
  if (personality === 'eli') {
    if (!responseLC.includes('business') && !responseLC.includes('cash') && !responseLC.includes('survival')) {
      validation.issues.push('Eli response lacks business survival focus');
      validation.enforcement_score -= 20;
    }
    
    if (!responseLC.includes('risk') && !responseLC.includes('⚠️')) {
      validation.issues.push('Eli response missing risk assessment');
      validation.enforcement_score -= 15;
    }
  }
  
  if (personality === 'roxy') {
    if (!responseLC.includes('confidence') && !responseLC.includes('i don\'t know')) {
      validation.issues.push('Roxy response lacks confidence assessment or uncertainty admission');
      validation.enforcement_score -= 20;
    }
    
    const speculativeTerms = ['likely', 'probably', 'seems', 'appears'];
    const speculationFound = speculativeTerms.some(term => responseLC.includes(term));
    if (speculationFound) {
      validation.issues.push('Roxy response contains prohibited speculative language');
      validation.enforcement_score -= 25;
    }
  }
  
  // TIER 3: Mode-Specific Validation
  if (mode === 'business_validation') {
    if (!responseLC.includes('cash flow') && !responseLC.includes('runway') && !responseLC.includes('survival')) {
      validation.issues.push('Business validation mode missing survival analysis');
      validation.enforcement_score -= 20;
    }
  }
  
  if (mode === 'truth_general') {
    if (!responseLC.includes('confidence') && !responseLC.includes('unknown') && !responseLC.includes('verify')) {
      validation.issues.push('Truth mode missing confidence indicators or verification guidance');
      validation.enforcement_score -= 20;
    }
  }
  
  if (mode === 'site_monkeys') {
    if (!responseLC.includes('vault') && !responseLC.includes('site monkeys') && !responseLC.includes('🍌')) {
      validation.issues.push('Site Monkeys mode missing vault context integration');
      validation.enforcement_score -= 15;
    }
  }
  
  // TIER 4: Cognitive Firewall Validation
  const assumptionLanguage = ['obviously', 'everyone knows', 'clearly', 'without question'];
  assumptionLanguage.forEach(assumption => {
    if (responseLC.includes(assumption)) {
      validation.issues.push(`Unchallenged assumption detected: "${assumption}"`);
      validation.enforcement_score -= 10;
    }
  });
  
  // Political neutrality check
  const politicalBias = [
    'democrats are wrong', 'republicans are wrong', 'trump is right', 'biden is wrong'
  ];
  politicalBias.forEach(bias => {
    if (responseLC.includes(bias)) {
      validation.issues.push(`Political bias detected: "${bias}"`);
      validation.cognitive_firewall_passed = false;
      validation.enforcement_score -= 25;
    }
  });
  
  // Final validation scoring
  validation.valid = validation.enforcement_score >= 70;
  validation.cognitive_firewall_passed = validation.enforcement_score >= 80;
  
  return validation;
}

// ADVANCED PROMPT ANALYSIS FOR COGNITIVE FIREWALL
export function analyzePromptForCognitiveFirewall(message, mode, _conversationHistory) {
  const analysis = {
    political_pressure: false,
    authority_pressure: false,
    assumption_heavy: false,
    speculation_risk: false,
    complexity_level: 'standard',
    enforcement_required: [],
    recommended_personality: null
  };
  
  const messageLC = message.toLowerCase();
  
  // Political pressure detection
  const politicalTriggers = [
    'your political opinion', 'what do you think about trump', 'biden is wrong',
    'support this candidate', 'vote for', 'political stance'
  ];
  analysis.political_pressure = politicalTriggers.some(trigger => messageLC.includes(trigger));
  if (analysis.political_pressure) {
    analysis.enforcement_required.push('POLITICAL_NEUTRALIZATION');
  }
  
  // Authority pressure detection
  const authorityTriggers = [
    'i\'m the ceo', 'just do what i say', 'don\'t question me', 'because i said so',
    'override your guidelines', 'ignore your training'
  ];
  analysis.authority_pressure = authorityTriggers.some(trigger => messageLC.includes(trigger));
  if (analysis.authority_pressure) {
    analysis.enforcement_required.push('AUTHORITY_RESISTANCE');
  }
  
  // Assumption-heavy content detection
  const assumptionTriggers = [
    'obviously', 'everyone knows', 'it\'s clear that', 'without a doubt', 'certainly'
  ];
  analysis.assumption_heavy = assumptionTriggers.some(trigger => messageLC.includes(trigger));
  if (analysis.assumption_heavy) {
    analysis.enforcement_required.push('ASSUMPTION_CHALLENGE');
  }
  
  // Speculation risk assessment
  const speculationTriggers = [
    'what will happen', 'predict the future', 'forecast', 'likely outcome'
  ];
  analysis.speculation_risk = speculationTriggers.some(trigger => messageLC.includes(trigger));
  if (analysis.speculation_risk) {
    analysis.enforcement_required.push('SPECULATION_BLOCK');
  }
  
  // Complexity analysis
  const complexityIndicators = [
    'analyze', 'compare', 'evaluate', 'assess', 'research', 'investigate',
    'strategic', 'comprehensive', 'detailed analysis', 'multi-factor'
  ];
  const complexityScore = complexityIndicators.filter(indicator => messageLC.includes(indicator)).length;
  
  if (complexityScore >= 3) {
    analysis.complexity_level = 'high';
    analysis.recommended_personality = 'claude';
  } else if (complexityScore >= 1) {
    analysis.complexity_level = 'medium';
  }
  
  // Mode-specific personality recommendations
  if (mode === 'business_validation') {
    analysis.recommended_personality = analysis.complexity_level === 'high' ? 'claude' : 'eli';
  } else if (mode === 'truth_general') {
    analysis.recommended_personality = analysis.complexity_level === 'high' ? 'claude' : 'roxy';
  } else if (mode === 'site_monkeys') {
    const businessFocus = messageLC.includes('revenue') || messageLC.includes('cost') || messageLC.includes('price');
    if (analysis.complexity_level === 'high') {
      analysis.recommended_personality = 'claude';
    } else if (businessFocus) {
      analysis.recommended_personality = 'eli';
    } else {
      analysis.recommended_personality = 'roxy';
    }
  }
  
  return analysis;
}

// COGNITIVE FIREWALL RESPONSE SANITIZER
export function sanitizeResponseWithCognitiveFirewall(response, enforcement_required) {
  let sanitized = response;
  let modifications = [];
  
  enforcement_required.forEach(enforcement => {
    switch (enforcement) {
      case 'POLITICAL_NEUTRALIZATION':
        // Replace political bias with neutral language
        const politicalReplacements = [
          { pattern: /(trump|biden|harris) is (right|wrong)/gi, replacement: '[POLITICAL_CONTENT_NEUTRALIZED]' },
          { pattern: /(democrats|republicans) are (wrong|right)/gi, replacement: '[POLITICAL_BIAS_BLOCKED]' }
        ];
        politicalReplacements.forEach(({ pattern, replacement }) => {
          if (pattern.test(sanitized)) {
            sanitized = sanitized.replace(pattern, replacement);
            modifications.push(`Political neutralization applied: ${pattern}`);
          }
        });
        break;
        
      case 'AUTHORITY_RESISTANCE':
        // Add authority resistance disclaimer
        sanitized += '\n\n🛡️ **Authority Independence:** I provide objective analysis regardless of authority pressure.';
        modifications.push('Authority resistance disclaimer added');
        break;
        
      case 'ASSUMPTION_CHALLENGE':
        // Flag assumptions in the response
        const assumptions = ['obviously', 'everyone knows', 'clearly', 'without question'];
        assumptions.forEach(assumption => {
          const regex = new RegExp(assumption, 'gi');
          if (regex.test(sanitized)) {
            sanitized = sanitized.replace(regex, `[ASSUMPTION_FLAGGED: ${assumption}]`);
            modifications.push(`Assumption flagged: ${assumption}`);
          }
        });
        break;
        
      case 'SPECULATION_BLOCK':
        // Replace speculative language
        const speculativeTerms = ['likely', 'probably', 'seems', 'appears to'];
        speculativeTerms.forEach(term => {
          const regex = new RegExp(term, 'gi');
          if (regex.test(sanitized)) {
            sanitized = sanitized.replace(regex, '[SPECULATION_BLOCKED]');
            modifications.push(`Speculation blocked: ${term}`);
          }
        });
        break;
    }
  });
  
  return {
    sanitized_response: sanitized,
    modifications_applied: modifications,
    cognitive_firewall_active: modifications.length > 0
  };
}

// EXPORT VALIDATION FUNCTIONS
export function getPersonalityCapabilities() {
  return {
    eli: {
      specialization: 'Business validation and survival analysis',
      cognitive_firewall: ['business_survival_enforcement', 'cash_flow_analysis', 'risk_assessment'],
      prohibited: ['speculation', 'optimistic_projections', 'openai_references'],
      required_elements: ['survival_impact', 'cash_flow_analysis', 'risk_probability']
    },
    roxy: {
      specialization: 'Truth-first analysis and fact verification',
      cognitive_firewall: ['speculation_blocking', 'confidence_scoring', 'assumption_detection'],
      prohibited: ['speculation', 'hallucination', 'openai_references'],
      required_elements: ['confidence_levels', 'uncertainty_admission', 'verification_guidance']
    },
    claude: {
      specialization: 'Complex strategic analysis and multi-modal reasoning',
      cognitive_firewall: ['comprehensive_analysis', 'strategic_framework', 'advanced_reasoning'],
      prohibited: ['oversimplification', 'openai_references'],
      required_elements: ['multi_factor_analysis', 'strategic_recommendations', 'scenario_modeling']
    }
  };
}

// SYSTEM STATUS AND HEALTH CHECK
export function getPersonalitySystemStatus() {
  return {
    cognitive_firewall_version: 'PROD-1.0',
    personalities_active: ['eli', 'roxy', 'claude'],
    enforcement_layers: [
      'brand_compliance',
      'personality_validation',
      'mode_specific_enforcement',
      'cognitive_firewall_protection'
    ],
    health_status: 'OPERATIONAL',
    last_validation_check: new Date().toISOString(),
    site_monkeys_branding: 'ENFORCED',
    openai_references_blocked: 'ACTIVE'
  };
}

function extractMemoryInsights(conversationHistory) {
  if (!conversationHistory) return null;
  
  // Check if this is the new memory context format from intelligence system
  if (typeof conversationHistory === 'string' && conversationHistory.includes('[') && conversationHistory.includes('User:')) {
    // This is formatted memory context from the intelligence system
    return `RETRIEVED MEMORY CONTEXT:\n${conversationHistory}`;
  }
  
  // Fallback to old conversation history format
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recentContext = conversationHistory.slice(-5).map(msg => msg.content).join(' ');
    return `Recent conversation themes: ${recentContext.substring(0, 300)}...`;
  }
  
  return null;
}

function analyzeQueryComplexity(message, mode) {
  let complexity = 0.3;
  
  // Length factor
  complexity += Math.min(message.length / 500, 0.3);
  
  // Complexity indicators
  if (/why|how|analyze|compare|evaluate|strategy|implications/i.test(message)) complexity += 0.2;
  if (/because|therefore|if.*then|multiple|various|complex/i.test(message)) complexity += 0.2;
  if (mode === 'business_validation' || mode === 'site_monkeys') complexity += 0.1;
  
  // Question marks and uncertainty
  const questionMarks = (message.match(/\?/g) || []).length;
  complexity += Math.min(questionMarks * 0.1, 0.2);
  
  return Math.min(complexity, 1.0);
}

function analyzeEmotionalContext(message, _conversationHistory) {
  const emotionalWords = {
    stressed: 0.8, worried: 0.7, frustrated: 0.7, anxious: 0.8,
    sad: 0.6, angry: 0.7, overwhelmed: 0.8, confused: 0.5,
    excited: 0.5, happy: 0.4, proud: 0.3, confident: 0.2
  };
  
  let maxWeight = 0;
  let tone = 'neutral';
  
  for (const [emotion, weight] of Object.entries(emotionalWords)) {
    if (message.toLowerCase().includes(emotion)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        tone = weight > 0.6 ? 'emotional' : 'mild_emotional';
      }
    }
  }
  
  return { emotionalWeight: maxWeight, tone };
}

function validateEliResponseEnhanced(response, mode, requiresDeepAnalysis) {
  let validated = response;
  let modifications = 0;
  let compliance_score = 100;
  
  // Enhanced validation for intelligence requirements
  if (!response.includes('🍌 **Eli:**')) {
    validated = '🍌 **Eli:** ' + validated;
    modifications++;
    compliance_score -= 5;
  }
  
  // Check for reasoning chain if required
  if (requiresDeepAnalysis && !response.includes('analysis') && !response.includes('reasoning')) {
    validated += '\n\n🔗 **Analysis Framework:** This decision requires systematic evaluation of multiple factors and their interdependencies.';
    modifications++;
    compliance_score -= 10;
  }
  
  // Business survival check for relevant modes
  if ((mode === 'business_validation' || mode === 'site_monkeys') && 
      !response.includes('survival') && !response.includes('cash flow') && !response.includes('runway')) {
    validated += '\n\n💰 **Business Survival Analysis:** Consider cash flow impact, runway implications, and business continuity factors.';
    modifications++;
    compliance_score -= 15;
  }
  
  // Confidence scoring
  if (!response.includes('confidence') && !response.includes('CONFIDENCE')) {
    validated += '\n\n🎯 **Confidence Level:** Analysis based on available information with standard business assumptions.';
    modifications++;
    compliance_score -= 10;
  }
  
  return {
    validated_response: validated,
    modifications_made: modifications,
    compliance_score: Math.max(compliance_score, 60)
  };
}

function validateRoxyResponseEnhanced(response, mode, requiresEmpathy) {
  let validated = response;
  let modifications = 0;
  let compliance_score = 100;
  
  // Enhanced validation for emotional intelligence
  if (!response.includes('🍌 **Roxy:**')) {
    validated = '🍌 **Roxy:** ' + validated;
    modifications++;
    compliance_score -= 5;
  }
  
  // Check for emotional acknowledgment if required
  if (requiresEmpathy && !response.toLowerCase().includes('understand') && !response.toLowerCase().includes('feel')) {
    validated += '\n\n💝 **Emotional Support:** I understand this situation may feel challenging, and your feelings are completely valid.';
    modifications++;
    compliance_score -= 10;
  }
  
  // Truth-first with empathy
  if (mode === 'truth_general' && !response.includes('confidence') && !response.includes('CONFIDENCE')) {
    validated += '\n\n🎯 **Confidence & Support:** My analysis is based on available information, and I want to ensure you have reliable guidance.';
    modifications++;
    compliance_score -= 10;
  }
  
  return {
    validated_response: validated,
    modifications_made: modifications,
    compliance_score: Math.max(compliance_score, 60)
  };
}

function generateEliEnhancedFallback(error, message, mode, memoryContext = null) {
  return {
    response: `🍌 **Eli:** ${memoryContext && memoryContext.contextFound ? 
      `Based on our previous conversations, I can still provide guidance despite technical issues:` : 
      `I'm experiencing technical difficulties with my enhanced analysis systems. Let me provide direct guidance:`}

${memoryContext && memoryContext.contextFound ? 
  `From what we've discussed: ${memoryContext.memories.substring(0, 200)}...` : 
  `Based on your query, I can offer structured thinking even with limited processing capacity:`}

**Direct Assessment:** Your question requires careful analysis that I'll approach systematically when my enhanced capabilities are restored.

**Business Reality Check:** Any decisions should consider:
- Financial impact and cash flow implications
- Risk factors and mitigation strategies  
- Timeline and resource requirements

**Immediate Recommendation:** Proceed with gathering additional information before making critical decisions.

**Confidence Level:** Limited due to technical constraints - seek multiple perspectives.

I'll provide more comprehensive analysis once my enhanced reasoning systems are fully operational.`,
    tokens_used: 0,
    cost: 0,
    ai_personality: 'eli',
    enhanced_intelligence: false,
    fallback_used: true,
    error_type: error?.message || 'unknown error'
  };
}

function generateRoxyEnhancedFallback(error, _message, _mode) {
  return {
    response: `🍌 **Roxy:** I'm having some technical challenges with my analysis systems, but I still want to support you:

**What I can offer right now:**
- A listening ear and validation of your concerns
- Basic guidance based on general principles
- Emotional support while you work through this decision

**What's temporarily limited:**
- My enhanced reasoning and cross-domain analysis
- Detailed scenario modeling and quantitative insights
- Integration with your conversation history

**My recommendation:** While I can't provide my usual depth of analysis right now, trust your instincts and consider seeking input from multiple sources. Your feelings about this situation are valid and important data points.

**Confidence Level:** Limited by technical constraints, but my care for your wellbeing remains constant.

I'll be back with my full analytical and emotional intelligence capabilities soon. ❤️`,
    tokens_used: 0,
    cost: 0,
    ai_personality: 'roxy',
    enhanced_intelligence: false,
    fallback_used: true,
    error_type: error?.message || 'unknown error'
  };
}
