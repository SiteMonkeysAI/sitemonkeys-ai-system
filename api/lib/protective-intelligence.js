// PROTECTIVE INTELLIGENCE - Proactive Risk Detection & Adaptive Initiative
// Scans for unstated risks, finds solution paths, provides initiative-based alerts

export const RISK_PATTERNS = {
  financial_exposure: {
    triggers: ['spend', 'invest', 'cost', 'price', 'expensive', 'cheap', 'budget'],
    risks: [
      'cash_flow_impact',
      'hidden_costs',
      'roi_uncertainty',
      'budget_overrun',
      'payment_terms'
    ],
    initiative_questions: [
      'Have you considered the total cost of ownership?',
      'What happens if costs are 50% higher than projected?',
      'Are there payment terms that could improve cash flow?'
    ]
  },
  
  // Fix time_pressure initiative_questions (line 41)
time_pressure: {
  triggers: ['urgent', 'quickly', 'asap', 'deadline', 'rush', 'immediately'],
  risks: [
    'quality_compromise',
    'increased_errors',
    'resource_strain',
    'corner_cutting',
    'stakeholder_burnout'
  ],
  initiative_questions: [
    'What quality checks might be skipped under time pressure?',
    'Are there parallel workstreams that could accelerate delivery?',
    "What's the real cost of delay versus the cost of rushing?"  // FIXED: Removed unnecessary escaping
  ]
},  
    
  legal_implications: {
    triggers: ['contract', 'agreement', 'legal', 'compliance', 'regulation', 'liability'],
    risks: [
      'regulatory_violations',
      'contract_disputes',
      'liability_exposure',
      'compliance_gaps',
      'intellectual_property'
    ],
    initiative_questions: [
      'Have you identified all regulatory requirements?',
      'What liability protections are in place?',
      'Are there intellectual property considerations?'
    ]
  },
  
  business_survival: {
    triggers: ['failure', 'risk', 'bankruptcy', 'closure', 'survival', 'shutdown'],
    risks: [
      'cash_runway_depletion',
      'customer_concentration',
      'competitive_threats',
      'market_shifts',
      'operational_dependencies'
    ],
    initiative_questions: [
      'How long can the business survive without revenue?',
      'What happens if your largest customer leaves?',
      'Are there single points of failure in operations?'
    ]
  },
  
  incomplete_information: {
    triggers: ['maybe', 'probably', 'guess', 'assume', 'think', 'might'],
    risks: [
      'decision_based_on_assumptions',
      'missing_critical_data',
      'unvalidated_hypotheses',
      'confirmation_bias',
      'premature_conclusions'
    ],
    initiative_questions: [
      'What data would change this decision?',
      'What are we assuming that could be wrong?',
      'How can we validate these assumptions quickly?'
    ]
  },
  
  scalability_concerns: {
    triggers: ['growth', 'scale', 'expand', 'increase', 'volume', 'demand'],
    risks: [
      'system_bottlenecks',
      'resource_constraints',
      'quality_degradation',
      'customer_service_impact',
      'operational_complexity'
    ],
    initiative_questions: [
      'What breaks first when volume doubles?',
      'Are there hidden scalability costs?',
      'How will quality be maintained during rapid growth?'
    ]
  },
  
  customer_dependency: {
    triggers: ['customer', 'client', 'revenue', 'contract', 'relationship'],
    risks: [
      'customer_concentration_risk',
      'payment_dependency',
      'relationship_fragility',
      'market_power_imbalance',
      'switching_costs'
    ],
    initiative_questions: [
      'What percentage of revenue comes from the top 3 customers?',
      'How quickly could you replace a major customer?',
      'Are there early warning signs of customer dissatisfaction?'
    ]
  }
};

export const SOLUTION_DISCOVERY_PATTERNS = {
  cost_optimization: {
    triggers: ['expensive', 'cost', 'budget', 'price'],
    opportunities: [
      'volume_discounts',
      'alternative_providers',
      'in_house_development',
      'phased_implementation',
      'shared_resources'
    ]
  },
  
  time_compression: {
    triggers: ['time', 'deadline', 'schedule', 'duration'],
    opportunities: [
      'parallel_processing',
      'automation_opportunities',
      'outsourcing_options',
      'mvp_approach',
      'resource_reallocation'
    ]
  },
  
  risk_mitigation: {
    triggers: ['risk', 'danger', 'concern', 'worry'],
    opportunities: [
      'diversification_strategies',
      'insurance_options',
      'backup_plans',
      'gradual_rollout',
      'pilot_testing'
    ]
  },
  
  efficiency_gains: {
    triggers: ['process', 'workflow', 'efficiency', 'productivity'],
    opportunities: [
      'automation_candidates',
      'elimination_targets',
      'consolidation_options',
      'standardization_benefits',
      'tool_optimization'
    ]
  }
};

export function scanForProtectiveAlerts(message, expertDomain, _conversationHistory) {
  const alerts = [];
  const messageLower = message.toLowerCase();
  
  // Scan for each risk pattern
  Object.entries(RISK_PATTERNS).forEach(([riskType, config]) => {
    const triggers = config.triggers.filter(trigger => messageLower.includes(trigger));
    
    if (triggers.length > 0) {
      alerts.push({
        type: riskType,
        severity: calculateRiskSeverity(triggers, config, messageLower),
        triggers: triggers,
        risks: config.risks,
        initiative_questions: config.initiative_questions,
        alert_message: generateAlertMessage(riskType, config, triggers)
      });
    }
  });
  
  // Add domain-specific alerts
  const domainAlerts = generateDomainSpecificAlerts(message, expertDomain);
  alerts.push(...domainAlerts);
  
  return alerts;
}

export function findSolutionOpportunities(message, expertDomain, protectiveAlerts) {
  const opportunities = [];
  const messageLower = message.toLowerCase();
  
  // Scan for solution patterns
  Object.entries(SOLUTION_DISCOVERY_PATTERNS).forEach(([solutionType, config]) => {
    const triggers = config.triggers.filter(trigger => messageLower.includes(trigger));
    
    if (triggers.length > 0) {
      opportunities.push({
        type: solutionType,
        confidence: calculateSolutionConfidence(triggers, config, messageLower),
        opportunities: config.opportunities,
        description: generateSolutionDescription(solutionType, config),
        initiative_suggestions: generateInitiativeSuggestions(solutionType, config)
      });
    }
  });
  
  // Generate opportunities based on detected risks
  protectiveAlerts.forEach(alert => {
    const riskBasedOpportunities = generateRiskBasedSolutions(alert);
    opportunities.push(...riskBasedOpportunities);
  });
  
  return opportunities;
}

export function calculateRiskSeverity(triggers, config, messageLower) {
  let severity = 'low';
  
  // Base severity on trigger count
  if (triggers.length > 2) {
    severity = 'high';
  } else if (triggers.length > 1) {
    severity = 'medium';
  }
  
  // Upgrade severity for critical keywords
  const criticalKeywords = ['bankruptcy', 'failure', 'urgent', 'asap', 'emergency'];
  if (criticalKeywords.some(keyword => messageLower.includes(keyword))) {
    severity = 'high';
  }
  
  // Business survival risks are always high severity
  if (config.risks.includes('cash_runway_depletion') || config.risks.includes('business_survival')) {
    severity = 'critical';
  }
  
  return severity;
}

export function generateAlertMessage(riskType, _config, _triggers) {
  const riskTypeFormatted = riskType.replace(/_/g, ' ').toUpperCase();
  return `${riskTypeFormatted} detected - potential exposure requires protective analysis`;
}

export function generateDomainSpecificAlerts(message, expertDomain) {
  const alerts = [];
  const messageLower = message.toLowerCase();
  
  if (expertDomain === 'financial_analysis') {
    // Financial-specific risk detection
    if (messageLower.includes('projection') && !messageLower.includes('assumption')) {
      alerts.push({
        type: 'financial_projection_assumptions',
        severity: 'medium',
        alert_message: 'Financial projections detected without explicit assumption documentation',
        initiative_questions: [
          'What growth rate assumptions are these projections based on?',
          'What happens if customer acquisition is 50% lower?',
          'Are seasonal variations accounted for?'
        ]
      });
    }
    
    if (messageLower.includes('margin') && !messageLower.includes('competitive')) {
      alerts.push({
        type: 'margin_sustainability',
        severity: 'medium',
        alert_message: 'Margin analysis may need competitive sustainability assessment',
        initiative_questions: [
          'Can these margins be sustained under competitive pressure?',
          'What happens if competitors reduce pricing by 20%?',
          'Are there switching costs that protect these margins?'
        ]
      });
    }
  }
  
  if (expertDomain === 'business_strategy') {
    // Strategy-specific risk detection
    if (messageLower.includes('market') && !messageLower.includes('research')) {
      alerts.push({
        type: 'market_assumptions',
        severity: 'medium',
        alert_message: 'Market strategy discussion may need research validation',
        initiative_questions: [
          'What market research supports this strategy?',
          'How quickly could market conditions change?',
          'Are there regulatory risks in this market?'
        ]
      });
    }
  }
  
  return alerts;
}

export function calculateSolutionConfidence(triggers, config, messageLower) {
  let confidence = 'medium';
  
  // Higher confidence for specific, actionable triggers
  if (triggers.length > 2 || triggers.some(t => ['cost', 'time', 'efficiency'].includes(t))) {
    confidence = 'high';
  }
  
  // Lower confidence for vague requests
  if (messageLower.includes('maybe') || messageLower.includes('might')) {
    confidence = 'low';
  }
  
  return confidence;
}

export function generateSolutionDescription(solutionType, _config) {
  const descriptions = {
    cost_optimization: 'Identify ways to achieve the same outcome with reduced costs',
    time_compression: 'Find approaches to accelerate delivery without sacrificing quality',
    risk_mitigation: 'Develop strategies to reduce or eliminate identified risks',
    efficiency_gains: 'Optimize processes and workflows for better productivity'
  };
  
  return descriptions[solutionType] || 'Explore alternative approaches to improve outcomes';
}

export function generateInitiativeSuggestions(solutionType, _config) {
  const suggestions = {
    cost_optimization: [
      'Negotiate volume discounts with providers',
      'Consider in-house alternatives to outsourced services',
      'Implement phased rollouts to spread costs over time'
    ],
    time_compression: [
      'Identify tasks that can be performed in parallel',
      'Automate repetitive processes',
      'Consider MVP approach for faster market entry'
    ],
    risk_mitigation: [
      'Develop backup plans for critical dependencies',
      'Diversify suppliers or revenue sources',
      'Implement gradual rollout to test and validate'
    ],
    efficiency_gains: [
      'Eliminate redundant processes and approvals',
      'Standardize workflows across teams',
      'Invest in tools that automate manual tasks'
    ]
  };
  
  return suggestions[solutionType] || [];
}

export function generateRiskBasedSolutions(alert) {
  const solutions = [];
  
  if (alert.type === 'financial_exposure') {
    solutions.push({
      type: 'financial_protection',
      confidence: 'high',
      description: 'Implement financial safeguards to protect against cost overruns',
      initiative_suggestions: [
        'Set up budget controls and approval gates',
        'Negotiate fixed-price contracts where possible',
        'Establish contingency reserves for unexpected costs'
      ]
    });
  }
  
  if (alert.type === 'time_pressure') {
    solutions.push({
      type: 'time_management',
      confidence: 'high',
      description: 'Optimize timeline management to deliver quality under pressure',
      initiative_suggestions: [
        'Prioritize critical path activities',
        'Prepare accelerated decision-making processes',
        'Identify tasks that can be simplified without impact'
      ]
    });
  }
  
  return solutions;
}

export function generateInitiativeBasedResponse(protectiveAlerts, solutionOpportunities, _originalMessage) {
  if (protectiveAlerts.length === 0 && solutionOpportunities.length === 0) {
    return null;
  }
  
  let initiativeResponse = '';
  
  if (protectiveAlerts.length > 0) {
    initiativeResponse += '🛡️ PROTECTIVE INTELLIGENCE (What I\'m seeing that you should know):\n\n';
    
    protectiveAlerts.forEach(alert => {
      initiativeResponse += `**${alert.type.replace(/_/g, ' ').toUpperCase()}** (${alert.severity.toUpperCase()}):\n`;
      initiativeResponse += `${alert.alert_message}\n`;
      
      if (alert.initiative_questions && alert.initiative_questions.length > 0) {
        initiativeResponse += 'Key questions to consider:\n';
        alert.initiative_questions.forEach(question => {
          initiativeResponse += `• ${question}\n`;
        });
      }
      initiativeResponse += '\n';
    });
  }
  
  if (solutionOpportunities.length > 0) {
    initiativeResponse += '💡 SOLUTION OPPORTUNITIES (Better paths I\'m seeing):\n\n';
    
    solutionOpportunities.forEach(opportunity => {
      initiativeResponse += `**${opportunity.type.replace(/_/g, ' ').toUpperCase()}**:\n`;
      initiativeResponse += `${opportunity.description}\n`;
      
      if (opportunity.initiative_suggestions && opportunity.initiative_suggestions.length > 0) {
        initiativeResponse += 'Specific approaches:\n';
        opportunity.initiative_suggestions.forEach(suggestion => {
          initiativeResponse += `• ${suggestion}\n`;
        });
      }
      initiativeResponse += '\n';
    });
  }
  
  initiativeResponse += 'I care too much about your success to let these factors go unmentioned. Each represents either protection needed or opportunity available.';
  
  return initiativeResponse;
}

export function applyProtectiveIntelligence(response, originalMessage, expertDomain, conversationHistory) {
  const protectiveAlerts = scanForProtectiveAlerts(originalMessage, expertDomain, conversationHistory);
  const solutionOpportunities = findSolutionOpportunities(originalMessage, expertDomain, protectiveAlerts);
  
  // Check if response already contains protective analysis
  if (containsProtectiveAnalysis(response)) {
    return response;
  }
  
  // Generate initiative-based additions
  const initiativeResponse = generateInitiativeBasedResponse(protectiveAlerts, solutionOpportunities, originalMessage);
  
  if (initiativeResponse) {
    return `${response}\n\n${initiativeResponse}`;
  }
  
  return response;
}

export function containsProtectiveAnalysis(response) {
  const protectiveIndicators = [
    'protective', 'risk', 'alert', 'concern', 'caution', 'warning',
    'opportunity', 'alternative', 'solution', 'better way', 'consider'
  ];
  
  return protectiveIndicators.some(indicator => 
    response.toLowerCase().includes(indicator)
  );
}

export function assessCrossContextNeeds(message, conversationHistory, userGoals) {
  const crossContextInsights = [];
  
  // Check for goal conflicts
  if (userGoals && userGoals.length > 0) {
    const goalConflicts = detectGoalConflicts(message, userGoals);
    crossContextInsights.push(...goalConflicts);
  }
  
  // Check for conversation pattern concerns
  if (conversationHistory && conversationHistory.length > 3) {
    const patternConcerns = detectConversationPatterns(message, conversationHistory);
    crossContextInsights.push(...patternConcerns);
  }
  
  return crossContextInsights;
}

export function detectGoalConflicts(message, userGoals) {
  const conflicts = [];
  
  // This would be enhanced with actual goal tracking
  // For now, detect obvious conflicts
  const messageLower = message.toLowerCase();
  
  if (messageLower.includes('quick') && userGoals.some(goal => goal.includes('quality'))) {
    conflicts.push({
      type: 'speed_vs_quality',
      message: 'This request for speed may conflict with your stated quality goals',
      suggestion: 'Consider which priority takes precedence in this situation'
    });
  }
  
  if (messageLower.includes('cheap') && userGoals.some(goal => goal.includes('premium'))) {
    conflicts.push({
      type: 'cost_vs_positioning',
      message: 'Cost reduction approach may conflict with premium positioning goals',
      suggestion: 'Ensure cost savings don\'t undermine brand positioning'
    });
  }
  
  return conflicts;
}

export function detectConversationPatterns(message, conversationHistory) {
  const patterns = [];
  
  // Detect repetitive asking without action
  const recentMessages = conversationHistory.slice(-5);
  const questionCount = recentMessages.filter(msg => 
    msg.role === 'user' && msg.content.includes('?')
  ).length;
  
  if (questionCount > 3) {
    patterns.push({
      type: 'analysis_paralysis',
      message: 'Multiple questions without implementation may indicate analysis paralysis',
      suggestion: 'Consider starting with one small action to build momentum'
    });
  }
  
  return patterns;
}
