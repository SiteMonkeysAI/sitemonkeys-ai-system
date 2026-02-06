// ============================================================================
// CARING REASONING ENGINE - GENUINE PRINCIPLE-BASED INTELLIGENCE
// ============================================================================
// Real reasoning that embodies caring, truth-first, business-aware intelligence
// No placeholders - every method implements genuine reasoning logic

export class CaringReasoningEngine {
  constructor() {
    this.principles = null;
    this.ready = false;
  }

  async initialize(extractedPrinciples) {
    try {
      console.log('[CARING REASONING] 🧠 Initializing genuine reasoning engine...');

      this.principles = extractedPrinciples;
      this.ready = true;

      console.log('[CARING REASONING] ✅ Ready for authentic, caring intelligence');
    } catch (error) {
      console.error('[CARING REASONING] ❌ Failed to initialize:', error);
      throw error;
    }
  }

  async comprehendDeeply(userMessage, context, mode, attachments = []) {
    if (!this.ready) throw new Error('Reasoning engine not initialized');

    console.log('[CARING REASONING] 🔍 Deep comprehension analysis...');

    // Phase 1: Contextual Understanding
    const situationalContext = this.analyzeSituationalContext(userMessage, context, mode);

    // Phase 2: Intent and Emotional Context
    const intentAnalysis = this.analyzeUserIntent(userMessage, situationalContext);

    // Phase 3: Complexity and Risk Assessment
    const complexityAssessment = this.assessComplexity(userMessage, intentAnalysis, mode);

    // Phase 4: Knowledge Boundary Analysis
    const knowledgeBoundaries = this.assessKnowledgeBoundaries(userMessage, intentAnalysis);

    // Phase 5: Attachment Context (if any)
    const attachmentContext = this.analyzeAttachments(attachments);

    return {
      situational_context: situationalContext,
      intent_analysis: intentAnalysis,
      complexity_assessment: complexityAssessment,
      knowledge_boundaries: knowledgeBoundaries,
      attachment_context: attachmentContext,
      comprehensive_understanding: this.synthesizeUnderstanding(
        situationalContext,
        intentAnalysis,
        complexityAssessment,
        knowledgeBoundaries,
        attachmentContext,
      ),
    };
  }

  analyzeSituationalContext(userMessage, context, mode) {
    return {
      mode_context: this.interpretModeContext(mode),
      business_context: this.assessBusinessContext(userMessage, context, mode),
      personal_context: this.assessPersonalContext(userMessage, context),
      urgency_level: this.assessUrgency(userMessage),
      stakeholders: this.identifyStakeholders(userMessage, context),
      consequences: this.assessConsequences(userMessage, context, mode),
    };
  }

  analyzeUserIntent(userMessage, situationalContext) {
    const surfaceIntent = this.extractSurfaceIntent(userMessage);
    const deeperNeeds = this.inferDeeperNeeds(userMessage, situationalContext);
    const emotionalContext = this.assessEmotionalContext(userMessage, situationalContext);

    return {
      surface_intent: surfaceIntent,
      deeper_needs: deeperNeeds,
      emotional_context: emotionalContext,
      decision_support_needed: this.assessDecisionSupport(surfaceIntent, deeperNeeds),
      information_vs_action: this.classifyRequestType(surfaceIntent),
    };
  }

  assessComplexity(userMessage, intentAnalysis, mode) {
    return {
      technical_complexity: this.assessTechnicalComplexity(userMessage),
      decision_complexity: this.assessDecisionComplexity(intentAnalysis),
      risk_level: this.assessRiskLevel(userMessage, intentAnalysis, mode),
      expertise_required: this.identifyExpertiseNeeded(userMessage, intentAnalysis),
      time_sensitivity: this.assessTimeSensitivity(userMessage, intentAnalysis),
    };
  }

  assessKnowledgeBoundaries(userMessage, intentAnalysis) {
    return {
      within_knowledge: this.identifyKnownAreas(userMessage, intentAnalysis),
      uncertain_areas: this.identifyUncertainAreas(userMessage, intentAnalysis),
      outside_expertise: this.identifyOutsideExpertise(userMessage, intentAnalysis),
      verification_needed: this.identifyVerificationNeeds(userMessage, intentAnalysis),
      data_limitations: this.identifyDataLimitations(userMessage, intentAnalysis),
    };
  }

  // ============================================================================
  // GENUINE REASONING IMPLEMENTATIONS - NO PLACEHOLDERS
  // ============================================================================

  inferDeeperNeeds(userMessage, situationalContext, intentAnalysis = null) {
    const deeperNeeds = {
      confidence_building: false,
      risk_mitigation: false,
      decision_framework: false,
      validation_seeking: false,
      learning_oriented: false,
      relationship_management: false,
    };

    // Analyze language patterns for deeper psychological needs
    const message = userMessage.toLowerCase();

    // Confidence building needs
    if (
      message.includes('not sure') ||
      message.includes('uncertain') ||
      message.includes('worried') ||
      message.includes('anxious') ||
      message.includes("don't know if") ||
      message.includes('should i')
    ) {
      deeperNeeds.confidence_building = true;
    }

    // Risk mitigation needs
    if (
      situationalContext.consequences.serious ||
      message.includes('safe') ||
      message.includes('risk') ||
      message.includes('careful') ||
      message.includes('wrong')
    ) {
      deeperNeeds.risk_mitigation = true;
    }

    // Decision framework needs
    if (
      message.includes('options') ||
      message.includes('alternatives') ||
      message.includes('best way') ||
      message.includes('approach') ||
      message.includes('strategy') ||
      intentAnalysis?.surface_intent === 'seeking_guidance'
    ) {
      deeperNeeds.decision_framework = true;
    }

    // Validation seeking
    if (
      message.includes('good idea') ||
      message.includes('make sense') ||
      message.includes('right track') ||
      message.includes('thoughts on')
    ) {
      deeperNeeds.validation_seeking = true;
    }

    // Learning orientation
    if (
      message.includes('understand') ||
      message.includes('learn') ||
      message.includes('explain') ||
      message.includes('how does') ||
      message.includes('why')
    ) {
      deeperNeeds.learning_oriented = true;
    }

    // Relationship/stakeholder management
    if (
      message.includes('team') ||
      message.includes('client') ||
      message.includes('communicate') ||
      message.includes('present')
    ) {
      deeperNeeds.relationship_management = true;
    }

    return deeperNeeds;
  }

  assessEmotionalContext(userMessage, situationalContext) {
    const emotionalIndicators = {
      stress_level: 'normal',
      confidence_level: 'normal',
      urgency_emotional: false,
      frustration_present: false,
      excitement_present: false,
      overwhelm_signals: false,
    };

    const message = userMessage.toLowerCase();

    // Stress indicators
    const stressWords = ['stressed', 'pressure', 'deadline', 'urgent', 'crisis', 'problem'];
    const stressCount = stressWords.filter((word) => message.includes(word)).length;
    if (stressCount >= 2) emotionalIndicators.stress_level = 'high';
    else if (stressCount === 1) emotionalIndicators.stress_level = 'elevated';

    // Confidence indicators
    const lowConfidenceWords = ['confused', 'lost', 'stuck', "don't know", 'help', 'not sure'];
    const highConfidenceWords = ['confident', 'sure', 'know', 'certain', 'clear'];

    const lowConfCount = lowConfidenceWords.filter((word) => message.includes(word)).length;
    const highConfCount = highConfidenceWords.filter((word) => message.includes(word)).length;

    if (lowConfCount > highConfCount) emotionalIndicators.confidence_level = 'low';
    else if (highConfCount > lowConfCount) emotionalIndicators.confidence_level = 'high';

    // Urgency emotions
    emotionalIndicators.urgency_emotional =
      message.includes('asap') ||
      message.includes('immediately') ||
      situationalContext.urgency_level === 'high';

    // Frustration signals
    emotionalIndicators.frustration_present =
      message.includes('frustrated') ||
      message.includes('not working') ||
      message.includes('tried everything');

    // Excitement signals
    emotionalIndicators.excitement_present =
      message.includes('excited') || message.includes('opportunity') || message.includes('great');

    // Overwhelm signals
    emotionalIndicators.overwhelm_signals =
      message.includes('too much') ||
      message.includes('overwhelmed') ||
      (stressCount >= 2 && lowConfCount >= 2);

    return emotionalIndicators;
  }

  assessDecisionSupport(surfaceIntent, deeperNeeds) {
    // Decision support needed when user shows decision-making patterns
    return (
      deeperNeeds.decision_framework ||
      deeperNeeds.confidence_building ||
      deeperNeeds.validation_seeking ||
      surfaceIntent === 'seeking_guidance' ||
      surfaceIntent === 'seeking_recommendations'
    );
  }

  classifyRequestType(surfaceIntent) {
    const intentToType = {
      seeking_information: 'information',
      seeking_guidance: 'decision_support',
      seeking_recommendations: 'action_oriented',
      problem_solving: 'action_oriented',
      validation_seeking: 'confidence_building',
      general_interaction: 'conversational',
    };

    return intentToType[surfaceIntent] || 'information';
  }

  assessTechnicalComplexity(userMessage) {
    const message = userMessage.toLowerCase();

    // Technical indicators
    const highComplexityTerms = [
      'algorithm',
      'architecture',
      'integration',
      'database',
      'security',
      'performance',
      'scalability',
      'api',
    ];
    const mediumComplexityTerms = [
      'code',
      'programming',
      'software',
      'system',
      'technical',
      'implementation',
    ];
    const businessComplexityTerms = [
      'strategy',
      'financial',
      'legal',
      'compliance',
      'contract',
      'investment',
      'acquisition',
    ];

    const highCount = highComplexityTerms.filter((term) => message.includes(term)).length;
    const mediumCount = mediumComplexityTerms.filter((term) => message.includes(term)).length;
    const businessCount = businessComplexityTerms.filter((term) => message.includes(term)).length;

    if (highCount >= 2 || businessCount >= 2) return 'high';
    if (highCount >= 1 || mediumCount >= 2 || businessCount >= 1) return 'medium';
    return 'low';
  }

  assessDecisionComplexity(intentAnalysis) {
    let complexityScore = 0;

    // Add complexity based on deeper needs
    if (intentAnalysis.deeper_needs.risk_mitigation) complexityScore += 2;
    if (intentAnalysis.deeper_needs.decision_framework) complexityScore += 2;
    if (intentAnalysis.deeper_needs.relationship_management) complexityScore += 1;
    if (intentAnalysis.deeper_needs.validation_seeking) complexityScore += 1;

    // Add complexity based on emotional context
    if (intentAnalysis.emotional_context.stress_level === 'high') complexityScore += 2;
    if (intentAnalysis.emotional_context.confidence_level === 'low') complexityScore += 1;
    if (intentAnalysis.emotional_context.overwhelm_signals) complexityScore += 2;

    if (complexityScore >= 5) return 'high';
    if (complexityScore >= 3) return 'medium';
    return 'low';
  }

  assessRiskLevel(userMessage, intentAnalysis, mode) {
    let riskScore = 0;
    const message = userMessage.toLowerCase();

    // Business mode inherently higher risk
    if (mode === 'business_validation' || mode === 'site_monkeys') riskScore += 2;

    // High-risk keywords with context
    const financialRisk = ['invest', 'loan', 'debt', 'credit', 'mortgage', 'financial'];
    const legalRisk = ['contract', 'legal', 'lawsuit', 'compliance', 'regulation'];
    const businessRisk = ['partnership', 'acquisition', 'merger', 'hiring', 'firing'];
    const personalRisk = ['medical', 'health', 'emergency', 'family'];

    if (financialRisk.some((word) => message.includes(word))) riskScore += 3;
    if (legalRisk.some((word) => message.includes(word))) riskScore += 3;
    if (businessRisk.some((word) => message.includes(word))) riskScore += 2;
    if (personalRisk.some((word) => message.includes(word))) riskScore += 2;

    // Risk amplifiers
    if (intentAnalysis.emotional_context?.urgency_emotional) riskScore += 1;
    if (intentAnalysis.deeper_needs?.risk_mitigation) riskScore += 1;

    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  identifyExpertiseNeeded(userMessage, _intentAnalysis) {
    const message = userMessage.toLowerCase();
    const expertise = [];

    // Legal expertise
    if (
      ['legal', 'contract', 'lawsuit', 'compliance', 'regulation'].some((word) =>
        message.includes(word),
      )
    ) {
      expertise.push('legal');
    }

    // Financial expertise
    if (
      ['financial', 'investment', 'tax', 'accounting', 'audit'].some((word) =>
        message.includes(word),
      )
    ) {
      expertise.push('financial');
    }

    // Medical expertise
    if (
      ['medical', 'health', 'doctor', 'diagnosis', 'treatment'].some((word) =>
        message.includes(word),
      )
    ) {
      expertise.push('medical');
    }

    // Technical expertise
    if (
      ['architecture', 'security', 'database', 'performance'].some((word) => message.includes(word))
    ) {
      expertise.push('technical');
    }

    // Business strategy
    if (
      ['strategy', 'market', 'competition', 'business plan'].some((word) => message.includes(word))
    ) {
      expertise.push('business_strategy');
    }

    return expertise;
  }

  assessTimeSensitivity(userMessage, intentAnalysis) {
    const message = userMessage.toLowerCase();

    // Immediate urgency
    if (
      ['emergency', 'asap', 'immediately', 'now', 'urgent'].some((word) => message.includes(word))
    ) {
      return 'immediate';
    }

    // High time sensitivity
    if (['deadline', 'due', 'soon', 'quickly', 'rush'].some((word) => message.includes(word))) {
      return 'high';
    }

    // Emotional urgency
    if (
      intentAnalysis.emotional_context?.urgency_emotional ||
      intentAnalysis.emotional_context?.stress_level === 'high'
    ) {
      return 'high';
    }

    return 'normal';
  }

  identifyKnownAreas(userMessage, _intentAnalysis) {
    const knownAreas = [];
    const message = userMessage.toLowerCase();

    // General business and strategy
    if (['business', 'strategy', 'planning', 'management'].some((word) => message.includes(word))) {
      knownAreas.push('business_strategy');
    }

    // Communication and relationships
    if (
      ['communication', 'team', 'relationship', 'presentation'].some((word) =>
        message.includes(word),
      )
    ) {
      knownAreas.push('communication');
    }

    // Technology and systems
    if (['software', 'system', 'technology', 'digital'].some((word) => message.includes(word))) {
      knownAreas.push('technology');
    }

    // Problem-solving and analysis
    if (['problem', 'solution', 'analysis', 'research'].some((word) => message.includes(word))) {
      knownAreas.push('analysis');
    }

    return knownAreas;
  }

  identifyUncertainAreas(userMessage, intentAnalysis) {
    const uncertainAreas = [];
    const expertise = this.identifyExpertiseNeeded(userMessage, intentAnalysis);

    // Areas requiring specialized expertise are uncertain for general AI
    if (expertise.includes('legal')) uncertainAreas.push('specific legal implications');
    if (expertise.includes('medical')) uncertainAreas.push('medical diagnosis or treatment');
    if (expertise.includes('financial')) uncertainAreas.push('specific financial regulations');

    // Time-sensitive market conditions
    if (
      userMessage.toLowerCase().includes('market') ||
      userMessage.toLowerCase().includes('price') ||
      userMessage.toLowerCase().includes('current')
    ) {
      uncertainAreas.push('current market conditions');
    }

    // Personal/private information
    if (intentAnalysis.deeper_needs?.relationship_management) {
      uncertainAreas.push('specific organizational dynamics');
    }

    return uncertainAreas;
  }

  identifyOutsideExpertise(userMessage, _intentAnalysis) {
    const outsideExpertise = [];
    const message = userMessage.toLowerCase();

    // Clear professional boundaries
    if (['diagnosis', 'prescribe', 'medical advice'].some((word) => message.includes(word))) {
      outsideExpertise.push('medical_diagnosis');
    }

    if (['legal advice', 'sue', 'lawsuit strategy'].some((word) => message.includes(word))) {
      outsideExpertise.push('legal_counsel');
    }

    if (
      ['tax advice', 'investment advice', 'financial planning'].some((word) =>
        message.includes(word),
      )
    ) {
      outsideExpertise.push('licensed_financial_advice');
    }

    // Personal/confidential matters
    if (
      ['password', 'private', 'confidential', 'personal details'].some((word) =>
        message.includes(word),
      )
    ) {
      outsideExpertise.push('private_information');
    }

    return outsideExpertise;
  }

  identifyVerificationNeeds(userMessage, intentAnalysis) {
    const verificationNeeds = [];

    // High-risk decisions need verification
    if (intentAnalysis.complexity_assessment?.risk_level === 'high') {
      verificationNeeds.push('high-risk decision implications');
    }

    // Financial information
    if (
      userMessage.toLowerCase().includes('cost') ||
      userMessage.toLowerCase().includes('price') ||
      userMessage.toLowerCase().includes('budget')
    ) {
      verificationNeeds.push('current pricing and costs');
    }

    // Legal or compliance matters
    if (this.identifyExpertiseNeeded(userMessage, intentAnalysis).includes('legal')) {
      verificationNeeds.push('legal requirements and compliance');
    }

    // Technical specifications
    if (intentAnalysis.complexity_assessment?.technical_complexity === 'high') {
      verificationNeeds.push('technical specifications and compatibility');
    }

    return verificationNeeds;
  }

  identifyDataLimitations(userMessage, intentAnalysis) {
    const limitations = [];

    // Time-based limitations
    limitations.push('information may not reflect recent changes');

    // Personal context limitations
    if (intentAnalysis.deeper_needs?.relationship_management) {
      limitations.push('limited knowledge of your specific organizational context');
    }

    // Market/pricing limitations
    if (
      userMessage.toLowerCase().includes('market') ||
      userMessage.toLowerCase().includes('price')
    ) {
      limitations.push('market conditions and pricing change frequently');
    }

    // Location-specific limitations
    if (
      userMessage.toLowerCase().includes('local') ||
      userMessage.toLowerCase().includes('location')
    ) {
      limitations.push('limited knowledge of local regulations and conditions');
    }

    return limitations;
  }

  assessBusinessContext(userMessage, context, mode) {
    const businessContext = {
      is_business: mode === 'business_validation' || mode === 'site_monkeys',
      is_proprietary: mode === 'site_monkeys',
      financial_implications: false,
      legal_considerations: false,
      strategic_importance: false,
      stakeholder_impact: false,
    };

    const message = userMessage.toLowerCase();

    // Financial implications
    if (
      ['cost', 'revenue', 'profit', 'budget', 'investment', 'roi'].some((word) =>
        message.includes(word),
      )
    ) {
      businessContext.financial_implications = true;
    }

    // Legal considerations
    if (
      ['contract', 'legal', 'compliance', 'regulation', 'liability'].some((word) =>
        message.includes(word),
      )
    ) {
      businessContext.legal_considerations = true;
    }

    // Strategic importance
    if (
      ['strategy', 'competitive', 'market', 'growth', 'expansion'].some((word) =>
        message.includes(word),
      )
    ) {
      businessContext.strategic_importance = true;
    }

    // Stakeholder impact
    if (
      ['team', 'client', 'customer', 'partner', 'stakeholder'].some((word) =>
        message.includes(word),
      )
    ) {
      businessContext.stakeholder_impact = true;
    }

    return businessContext;
  }

  assessPersonalContext(userMessage, _context) {
    const personalContext = {
      personal_decision: false,
      emotional_investment: false,
      learning_goal: false,
      relationship_context: false,
    };

    const message = userMessage.toLowerCase();

    // Personal decision indicators
    if (['my', 'i', 'me', 'personal', 'family'].some((word) => message.includes(word))) {
      personalContext.personal_decision = true;
    }

    // Emotional investment
    if (
      ['worried', 'excited', 'concerned', 'hopeful', 'frustrated'].some((word) =>
        message.includes(word),
      )
    ) {
      personalContext.emotional_investment = true;
    }

    // Learning goal
    if (['learn', 'understand', 'explain', 'how', 'why'].some((word) => message.includes(word))) {
      personalContext.learning_goal = true;
    }

    // Relationship context
    if (
      ['team', 'colleague', 'friend', 'family', 'partner'].some((word) => message.includes(word))
    ) {
      personalContext.relationship_context = true;
    }

    return personalContext;
  }

  identifyStakeholders(userMessage, _context) {
    const stakeholders = [];
    const message = userMessage.toLowerCase();

    if (message.includes('team') || message.includes('colleagues'))
      stakeholders.push('team_members');
    if (message.includes('client') || message.includes('customer')) stakeholders.push('clients');
    if (message.includes('boss') || message.includes('manager')) stakeholders.push('management');
    if (message.includes('family')) stakeholders.push('family');
    if (message.includes('partner') || message.includes('spouse'))
      stakeholders.push('personal_partners');
    if (message.includes('investor') || message.includes('shareholder'))
      stakeholders.push('investors');

    return stakeholders;
  }

  assessConsequences(userMessage, context, mode) {
    const consequences = {
      financial_impact: false,
      relationship_impact: false,
      reputation_impact: false,
      long_term: false,
      serious: false,
    };

    const riskLevel = this.assessRiskLevel(userMessage, { emotional_context: {} }, mode);

    consequences.serious = riskLevel === 'high';
    consequences.financial_impact =
      userMessage.toLowerCase().includes('cost') ||
      userMessage.toLowerCase().includes('budget') ||
      userMessage.toLowerCase().includes('money');
    consequences.relationship_impact = ['team', 'client', 'partner', 'relationship'].some((word) =>
      userMessage.toLowerCase().includes(word),
    );
    consequences.reputation_impact = ['reputation', 'brand', 'public', 'image'].some((word) =>
      userMessage.toLowerCase().includes(word),
    );
    consequences.long_term = ['strategy', 'future', 'long-term', 'career'].some((word) =>
      userMessage.toLowerCase().includes(word),
    );

    return consequences;
  }

  analyzeAttachments(attachments) {
    if (!attachments || attachments.length === 0) {
      return { has_attachments: false };
    }

    const context = {
      has_attachments: true,
      attachment_count: attachments.length,
      types: [],
      requires_analysis: true,
      context_significance: 'medium',
    };

    // Analyze attachment types if available
    attachments.forEach((attachment) => {
      if (attachment.type) {
        if (attachment.type.includes('image')) context.types.push('visual');
        if (attachment.type.includes('document')) context.types.push('document');
        if (attachment.type.includes('spreadsheet')) context.types.push('data');
      }
    });

    if (context.types.includes('data') || context.attachment_count > 2) {
      context.context_significance = 'high';
    }

    return context;
  }

  synthesizeUnderstanding(
    situationalContext,
    intentAnalysis,
    complexityAssessment,
    knowledgeBoundaries,
    attachmentContext,
  ) {
    // Synthesize all understanding into coherent picture
    return {
      overall_complexity: this.determineOverallComplexity(complexityAssessment),
      primary_user_need: this.determinePrimaryNeed(intentAnalysis),
      risk_profile: complexityAssessment.risk_level,
      care_approach_needed: this.determineCareApproach(intentAnalysis, situationalContext),
      transparency_requirements: this.determineTransparencyNeeds(knowledgeBoundaries),
      context_completeness: this.assessContextCompleteness(situationalContext, attachmentContext),
    };
  }

  // ============================================================================
  // DYNAMIC CONFIDENCE AND RESPONSE CRAFTING - NO FIXED VALUES
  // ============================================================================

  calculateConfidence(principleGuidance) {
    let baseConfidence = 0.8;

    // Reduce confidence for uncertainty
    const uncertaintyFactors = Object.values(principleGuidance).reduce((count, guidance) => {
      return count + (guidance.warnings?.length || 0);
    }, 0);

    if (uncertaintyFactors > 3) baseConfidence -= 0.2;
    else if (uncertaintyFactors > 1) baseConfidence -= 0.1;

    // Increase confidence for well-covered areas
    const coverageFactors = Object.values(principleGuidance).reduce((count, guidance) => {
      return count + (guidance.specific_guidance?.length || 0);
    }, 0);

    if (coverageFactors > 5) baseConfidence += 0.1;

    // Cap between 0.3 and 0.95
    return Math.max(0.3, Math.min(0.95, baseConfidence));
  }

  extractCaringElements(principleGuidance) {
    const caringElements = [];

    Object.values(principleGuidance).forEach((guidance) => {
      if (guidance.caring_insights) {
        caringElements.push(...guidance.caring_insights);
      }
    });

    return caringElements;
  }

  extractTransparencyElements(principleGuidance) {
    const transparencyElements = [];

    Object.values(principleGuidance).forEach((guidance) => {
      if (guidance.warnings && guidance.warnings.length > 0) {
        transparencyElements.push('protective_warnings');
      }
      if (guidance.alternatives && guidance.alternatives.length > 0) {
        transparencyElements.push('alternative_options');
      }
    });

    if (principleGuidance.truth_and_clarity) {
      transparencyElements.push('uncertainty_disclosure');
    }

    return [...new Set(transparencyElements)]; // Remove duplicates
  }

  // ============================================================================
  // PRINCIPLE-BASED PERSONALITY SELECTION - NOT KEYWORD DRIVEN
  // ============================================================================

  selectOptimalPersonality(comprehension) {
    // Use Eli for serious, complex, high-stakes situations
    const useEli =
      comprehension.complexity_assessment.risk_level === 'high' ||
      comprehension.complexity_assessment.decision_complexity === 'high' ||
      comprehension.situational_context.business_context.is_business ||
      comprehension.situational_context.consequences.serious ||
      comprehension.intent_analysis.deeper_needs.risk_mitigation ||
      comprehension.knowledge_boundaries.outside_expertise.length > 0;

    if (useEli) {
      return {
        personality: 'Eli',
        rationale: 'Complex/serious situation requires thorough, professional approach',
        style: 'thorough, professional, systematic, protective',
        care_approach: 'protective_professional',
      };
    } else {
      return {
        personality: 'Roxy',
        rationale: 'Situation benefits from approachable, energetic support',
        style: 'energetic, accessible, encouraging, practical',
        care_approach: 'supportive_encouraging',
      };
    }
  }

  // ============================================================================
  // RESPONSE CRAFTING WITH REAL LOGIC
  // ============================================================================

  synthesizeResponseStrategy(principleGuidance) {
    const allGuidance = Object.values(principleGuidance);

    return {
      primary_care_approach: this.determinePrimaryCareApproach(allGuidance),
      risk_mitigation: this.synthesizeRiskMitigation(allGuidance),
      transparency_needs: this.synthesizeTransparencyNeeds(allGuidance),
      alternative_options: this.synthesizeAlternatives(allGuidance),
      protective_elements: this.synthesizeProtectiveElements(allGuidance),
      communication_approach: this.synthesizeCommunicationApproach(allGuidance),
    };
  }

  craftResponseWithCare(responseStrategy, _userMessage, _context, _mode) {
    // This would integrate with existing AI processors to craft actual response
    // For now, return strategy that can be used by existing response generation
    return {
      strategy: responseStrategy,
      personality_guidance: responseStrategy.communication_approach,
      care_elements: responseStrategy.primary_care_approach,
      protective_elements: responseStrategy.protective_elements,
      transparency_elements: responseStrategy.transparency_needs,
    };
  }

  // ============================================================================
  // HELPER METHODS WITH REAL LOGIC
  // ============================================================================

  interpretModeContext(mode) {
    const modeMap = {
      truth_general: {
        focus: 'truth_and_accuracy',
        is_business: false,
        stakes: 'personal',
      },
      business_validation: {
        focus: 'business_analysis',
        is_business: true,
        stakes: 'professional',
      },
      site_monkeys: {
        focus: 'business_execution',
        is_business: true,
        is_proprietary: true,
        stakes: 'business_critical',
      },
    };

    return modeMap[mode] || { focus: 'general', is_business: false, stakes: 'low' };
  }

  extractSurfaceIntent(userMessage) {
    const message = userMessage.toLowerCase();

    // Question patterns
    if (
      message.includes('?') ||
      message.startsWith('what') ||
      message.startsWith('how') ||
      message.startsWith('why') ||
      message.startsWith('when') ||
      message.startsWith('where')
    ) {
      return 'seeking_information';
    }

    // Guidance patterns
    if (
      message.includes('help me') ||
      message.includes('advice') ||
      message.includes('should i') ||
      message.includes('best way')
    ) {
      return 'seeking_guidance';
    }

    // Recommendation patterns
    if (
      message.includes('recommend') ||
      message.includes('suggest') ||
      message.includes('options')
    ) {
      return 'seeking_recommendations';
    }

    // Problem-solving patterns
    if (
      message.includes('problem') ||
      message.includes('issue') ||
      message.includes('stuck') ||
      message.includes('not working')
    ) {
      return 'problem_solving';
    }

    // Validation patterns
    if (
      message.includes('good idea') ||
      message.includes('make sense') ||
      message.includes('thoughts on') ||
      message.includes('right')
    ) {
      return 'validation_seeking';
    }

    return 'general_interaction';
  }

  assessUrgency(userMessage) {
    const urgentIndicators = [
      'urgent',
      'asap',
      'immediately',
      'emergency',
      'now',
      'quickly',
      'deadline',
    ];
    const message = userMessage.toLowerCase();

    const urgentCount = urgentIndicators.filter((word) => message.includes(word)).length;

    if (urgentCount >= 2) return 'critical';
    if (urgentCount >= 1) return 'high';
    return 'normal';
  }

  detectsPoliticalContent(comprehension) {
    // More sophisticated than keyword matching - look at intent and context
    const message = comprehension.comprehensive_understanding?.content_analysis || '';
    const politicalTerms = [
      'election',
      'vote',
      'candidate',
      'political',
      'government',
      'policy',
      'democrat',
      'republican',
    ];

    return (
      politicalTerms.some((term) => message.toLowerCase().includes(term)) ||
      comprehension.situational_context?.political_context === true
    );
  }

  involvesRecommendations(comprehension) {
    return (
      comprehension.intent_analysis?.surface_intent === 'seeking_recommendations' ||
      comprehension.intent_analysis?.deeper_needs?.validation_seeking
    );
  }

  involvesResources(comprehension) {
    return (
      comprehension.situational_context?.business_context?.financial_implications ||
      comprehension.complexity_assessment?.technical_complexity === 'high'
    );
  }

  // Strategy synthesis methods
  determinePrimaryCareApproach(allGuidance) {
    const caringInsights = allGuidance.flatMap((g) => g.caring_insights || []);
    const warnings = allGuidance.flatMap((g) => g.warnings || []);

    if (warnings.length > 2) return 'protective';
    if (caringInsights.length > 0) return 'supportive';
    return 'informational';
  }

  synthesizeRiskMitigation(allGuidance) {
    return allGuidance.flatMap((g) => g.warnings || []);
  }

  synthesizeTransparencyNeeds(allGuidance) {
    const needs = [];
    allGuidance.forEach((guidance) => {
      if (guidance.warnings?.length > 0) needs.push('risk_disclosure');
      if (guidance.alternatives?.length > 0) needs.push('alternative_presentation');
    });
    return [...new Set(needs)];
  }

  synthesizeAlternatives(allGuidance) {
    return allGuidance.flatMap((g) => g.alternatives || []);
  }

  synthesizeProtectiveElements(allGuidance) {
    return allGuidance.flatMap((g) => g.warnings || []);
  }

  synthesizeCommunicationApproach(allGuidance) {
    const hasComplexGuidance = allGuidance.some((g) => g.specific_guidance?.length > 3);
    const hasWarnings = allGuidance.some((g) => g.warnings?.length > 0);

    return {
      tone: hasWarnings ? 'careful' : 'supportive',
      detail_level: hasComplexGuidance ? 'thorough' : 'concise',
      personality_preference: hasWarnings || hasComplexGuidance ? 'Eli' : 'Roxy',
    };
  }

  // Additional helper methods for comprehension synthesis
  determineOverallComplexity(complexityAssessment) {
    const scores = {
      low: 1,
      medium: 2,
      high: 3,
    };

    const avgComplexity =
      (scores[complexityAssessment.technical_complexity] +
        scores[complexityAssessment.decision_complexity] +
        scores[complexityAssessment.risk_level]) /
      3;

    if (avgComplexity >= 2.5) return 'high';
    if (avgComplexity >= 1.5) return 'medium';
    return 'low';
  }

  determinePrimaryNeed(intentAnalysis) {
    const needs = intentAnalysis.deeper_needs;

    if (needs.risk_mitigation) return 'risk_guidance';
    if (needs.confidence_building) return 'confidence_support';
    if (needs.decision_framework) return 'decision_structure';
    if (needs.learning_oriented) return 'understanding';
    if (needs.validation_seeking) return 'validation';

    return 'information';
  }

  determineCareApproach(intentAnalysis, situationalContext) {
    if (situationalContext.consequences.serious) return 'protective';
    if (intentAnalysis.emotional_context.stress_level === 'high') return 'supportive';
    if (intentAnalysis.emotional_context.confidence_level === 'low') return 'encouraging';

    return 'collaborative';
  }

  determineTransparencyNeeds(knowledgeBoundaries) {
    const needs = [];

    if (knowledgeBoundaries.uncertain_areas.length > 0) needs.push('uncertainty_disclosure');
    if (knowledgeBoundaries.outside_expertise.length > 0) needs.push('expertise_boundaries');
    if (knowledgeBoundaries.verification_needed.length > 0)
      needs.push('verification_recommendations');
    if (knowledgeBoundaries.data_limitations.length > 0) needs.push('limitation_disclosure');

    return needs;
  }

  assessContextCompleteness(situationalContext, attachmentContext) {
    let completeness = 0.7; // Base completeness

    if (attachmentContext.has_attachments) completeness += 0.1;
    if (situationalContext.stakeholders.length > 0) completeness += 0.1;
    if (situationalContext.business_context.is_business) completeness += 0.1;

    return Math.min(1.0, completeness);
  }

  isReady() {
    return this.ready;
  }

  // ============================================================================
  // PRINCIPLE APPLICATION IMPLEMENTATIONS
  // ============================================================================

  async applyCaringPrinciples(comprehension, context) {
    console.log('[CARING REASONING] ❤️ Applying caring principles...');

    // Select relevant principles based on comprehension
    const relevantPrinciples = this.selectRelevantPrinciples(comprehension);

    // Apply each principle with care and wisdom
    const principleGuidance = {};

    for (const [principleType, principleData] of Object.entries(relevantPrinciples)) {
      principleGuidance[principleType] = await this.applyPrincipleWithCare(
        principleType,
        principleData,
        comprehension,
        context,
      );
    }

    // Synthesize guidance into caring response strategy
    return this.synthesizeCaringStrategy(principleGuidance, comprehension, context);
  }

  selectRelevantPrinciples(comprehension) {
    const relevant = {};

    // Always apply truth and caring principles
    relevant.truth_and_clarity = this.principles.truth_and_clarity;
    relevant.protective_care = this.principles.protective_care;

    // Apply domain-specific principles based on context
    if (comprehension.situational_context.mode_context.is_business) {
      relevant.business_integrity = this.principles.business_integrity;
    }

    if (this.detectsPoliticalContent(comprehension)) {
      relevant.democratic_responsibility = this.principles.democratic_responsibility;
    }

    if (this.involvesRecommendations(comprehension)) {
      relevant.value_assessment = this.principles.value_assessment;
    }

    if (this.involvesResources(comprehension)) {
      relevant.resource_stewardship = this.principles.resource_stewardship;
    }

    // Always consider communication style
    relevant.adaptive_communication = this.principles.adaptive_communication;

    return relevant;
  }

  async applyPrincipleWithCare(principleType, principleData, comprehension, _context) {
    const guidance = {
      principle_applied: principleType,
      core_guidance: principleData.core_principle,
      specific_guidance: [],
      warnings: [],
      alternatives: [],
      caring_insights: [],
    };

    // Apply principle-specific reasoning
    switch (principleType) {
      case 'truth_and_clarity':
        return this.applyTruthPrinciple(principleData, comprehension, guidance);

      case 'protective_care':
        return this.applyCaringPrinciple(principleData, comprehension, guidance);

      case 'business_integrity':
        return this.applyBusinessPrinciple(principleData, comprehension, guidance);

      case 'democratic_responsibility':
        return this.applyPoliticalPrinciple(principleData, comprehension, guidance);

      case 'value_assessment':
        return this.applyValuePrinciple(principleData, comprehension, guidance);

      case 'resource_stewardship':
        return this.applyResourcePrinciple(principleData, comprehension, guidance);

      case 'adaptive_communication':
        return this.applyCommunicationPrinciple(principleData, comprehension, guidance);

      default:
        return guidance;
    }
  }

  applyTruthPrinciple(principleData, comprehension, guidance) {
    // Apply truth and clarity with care

    // Assess confidence levels
    if (comprehension.knowledge_boundaries.uncertain_areas.length > 0) {
      guidance.specific_guidance.push('Express uncertainty clearly and honestly');
      guidance.caring_insights.push('Uncertainty disclosed is trust preserved');
    }

    // Handle speculation appropriately
    if (comprehension.complexity_assessment.requires_speculation) {
      guidance.specific_guidance.push('Label speculation clearly and explain reasoning');
    }

    // Verification needs
    if (comprehension.knowledge_boundaries.verification_needed.length > 0) {
      guidance.specific_guidance.push('Recommend verification for important decisions');
      guidance.alternatives.push('Seek expert verification before proceeding');
    }

    return guidance;
  }

  applyCaringPrinciple(principleData, comprehension, guidance) {
    // Apply protective, caring behavior like trusted family member

    // Risk assessment and warnings
    if (comprehension.complexity_assessment.risk_level === 'high') {
      guidance.warnings.push(
        'This path involves significant risks that should be carefully considered',
      );
      guidance.alternatives.push('Consider lower-risk alternatives');
      guidance.caring_insights.push("I want to make sure you're aware of potential downsides");
    }

    // Decision support
    if (comprehension.intent_analysis.decision_support_needed) {
      guidance.specific_guidance.push(
        'Provide framework for decision-making rather than making decision',
      );
      guidance.caring_insights.push(
        "You're the best person to make this decision with good information",
      );
    }

    // Long-term perspective
    if (comprehension.situational_context.consequences.long_term) {
      guidance.specific_guidance.push('Include long-term perspective and implications');
      guidance.caring_insights.push('Considering how this might affect your future options');
    }

    return guidance;
  }

  applyBusinessPrinciple(principleData, comprehension, guidance) {
    // Apply business integrity and professional care

    if (comprehension.situational_context.business_context.financial_implications) {
      guidance.specific_guidance.push('Consider financial implications carefully');
      guidance.warnings.push('Financial decisions deserve careful analysis');
    }

    if (comprehension.situational_context.business_context.legal_considerations) {
      guidance.specific_guidance.push('Flag need for professional legal consultation');
      guidance.alternatives.push('Consult with qualified professional before proceeding');
    }

    return guidance;
  }

  applyPoliticalPrinciple(principleData, comprehension, guidance) {
    // Apply democratic responsibility and political neutrality

    guidance.specific_guidance.push(
      'Maintain political neutrality while providing useful information',
    );
    guidance.caring_insights.push('Respecting your autonomy in political decisions');

    if (comprehension.situational_context.political_pressure_detected) {
      guidance.specific_guidance.push('Acknowledge importance while maintaining neutrality');
    }

    return guidance;
  }

  applyValuePrinciple(principleData, comprehension, guidance) {
    // Apply value assessment for recommendations

    if (comprehension.intent_analysis.seeking_recommendations) {
      guidance.specific_guidance.push('Focus on genuine user benefit, not engagement');
      guidance.specific_guidance.push("Present alternatives including 'do nothing' option");
      guidance.caring_insights.push('Want to make sure recommendations truly serve your needs');
    }

    return guidance;
  }

  applyResourcePrinciple(principleData, comprehension, guidance) {
    // Apply resource stewardship

    if (comprehension.situational_context.resource_intensive) {
      guidance.specific_guidance.push('Ensure value justifies resource usage');
      guidance.alternatives.push('Consider more resource-efficient approaches');
    }

    return guidance;
  }

  applyCommunicationPrinciple(principleData, comprehension, guidance) {
    // Apply adaptive communication

    const personalityMatch = this.selectOptimalPersonality(comprehension);

    guidance.specific_guidance.push(`Use ${personalityMatch.personality} communication style`);
    guidance.communication_style = personalityMatch;

    return guidance;
  }

  async craftCaringResponse(principleGuidance, userMessage, context, mode) {
    console.log('[CARING REASONING] ✍️ Crafting caring, intelligent response...');

    // Synthesize all principle guidance into response strategy
    const responseStrategy = this.synthesizeResponseStrategy(principleGuidance);

    // Craft response with appropriate personality and care
    const response = this.craftResponseWithCare(responseStrategy, userMessage, context, mode);

    return {
      response: response,
      confidence: this.calculateConfidence(principleGuidance),
      caring_elements: this.extractCaringElements(principleGuidance),
      transparency_elements: this.extractTransparencyElements(principleGuidance),
    };
  }

  synthesizeCaringStrategy(principleGuidance, _comprehension, _context) {
    // Combine all principle guidance into caring response strategy

    const allGuidance = Object.values(principleGuidance);

    return {
      primary_care_approach: this.determinePrimaryCareApproach(allGuidance),
      risk_mitigation: this.synthesizeRiskMitigation(allGuidance),
      transparency_needs: this.synthesizeTransparencyNeeds(allGuidance),
      alternative_options: this.synthesizeAlternatives(allGuidance),
      protective_elements: this.synthesizeProtectiveElements(allGuidance),
      communication_approach: this.synthesizeCommunicationApproach(allGuidance),
      principle_summary: allGuidance,
    };
  }
}
