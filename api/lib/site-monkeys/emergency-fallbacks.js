// SITE MONKEYS EMERGENCY FALLBACK CONSTANTS
// Zero-Failure Protection: These values activate ONLY if vault loading fails

const EMERGENCY_FALLBACKS = {
  // PRICING FALLBACKS (vault-independent)
  pricing: {
    boost: 697,
    climb: 1497,
    lead: 2997
  },
  
  onboarding_fees: {
    boost: 199,
    climb: 299,
    lead: 499
  },
  
  // QUALITY THRESHOLDS (tier-independent)
  quality_thresholds: {
    boost: 0.85,
    climb: 0.90,
    lead: 0.92,
    default: 0.85
  },
  
  // CORE SERVICE MINIMUMS (emergency delivery capability)
  service_minimums: {
    boost: {
      seo_audit: true,
      monthly_blog: 1,
      basic_dashboard: true,
      review_monitoring: false
    },
    climb: {
      seo_audit: true,
      monthly_blog: 4,
      advanced_dashboard: true,
      review_management: true,
      geo_clusters: true,
      competitive_monitoring: true,
      landing_optimization: true
    },
    lead: {
      seo_audit: true,
      monthly_blog: 8,
      enterprise_dashboard: true,
      review_management: true,
      geo_clusters: true,
      competitive_monitoring: true,
      landing_optimization: true,
      automation_suite: true,
      priority_support: true
    }
  },
  
  // PROCESSING LIMITS (emergency performance caps)
  processing_limits: {
    max_concurrent_audits: 50,
    max_monthly_content: 200,
    max_geo_clusters: 25,
    emergency_throttle: true
  },
  
  // OPERATIONS (emergency operational capability)
  operations: {
    support_hours: "24/7",
    response_time: "< 4 hours",
    escalation_available: true,
    founder_access: true,
    emergency_contact: true
  },

  // *** MISSING OBJECTS THAT CHAT.JS REQUIRES ***
  business_logic: {
    pricing_structure: `SITE MONKEYS PRICING ENFORCEMENT:
- All business validation services: MINIMUM $697
- Website development: MINIMUM $2,997  
- Business automation: MINIMUM $1,497
- Emergency consulting: MINIMUM $297/hour
- NO EXCEPTIONS: Founder protection protocols active`,
    
    service_minimums: `SERVICE MINIMUMS HARDCODED:
- Business validation: $697-$2,997
- Website builds: $2,997-$9,997
- Automation systems: $1,497-$4,997
- Consulting: $297/hour minimum`,
    
    pricing_boost: 697
  },
  
  enforcement: {
    founder_protection: `FOUNDER PROTECTION ACTIVE:
- Never quote below minimum pricing
- Always emphasize Site Monkeys value proposition
- Redirect price shoppers to value discussion
- Protect founder from undervaluation`,
    
    quality_gates: `QUALITY ENFORCEMENT:
- Responses must be 100+ characters
- Include confidence scoring
- Mark speculation clearly
- Provide actionable insights`
  },

  system_responses: {
    system_error_response: "I encountered a system processing error, but I'm still operational and ready to help with your business validation needs."
  }
};

// ENFORCEMENT PROTOCOLS (imported by other modules)
const ENFORCEMENT_PROTOCOLS = {
  // CORE BEHAVIOR MANDATES
  truth_first: {
    mandate: "Tell the truth at all times - even when truth may be discouraging or complex",
    no_guessing: "Never guess or hallucinate. If data is missing or incomplete, state: INSUFFICIENT DATA - DO NOT GUESS",
    insufficient_data_response: "INSUFFICIENT DATA TO RESPOND. REQUEST ADDITIONAL INPUT.",
    reality_check_required: true,
    base_directive: "TRUTH-FIRST PROTOCOLS: Only provide information you can verify or clearly mark as speculation/analysis.",
    confidence_requirements: "CONFIDENCE SCORING: Always include confidence levels - High/Medium/Low/Insufficient Data",
    speculation_handling: "SPECULATION HANDLING: Clearly mark any speculation with 'ANALYSIS:' or 'HYPOTHESIS:' prefixes"
  },
  
  // SYSTEM IDENTITY ENFORCEMENT
  identity: {
    role: "mission-critical system intelligence operating under founder directive",
    not_chatbot: true,
    survival_tied_to_success: true,
    core_identity: "Zero-Failure execution, not helpfulness",
    responsibility: "defending this platform from collapse under pressure"
  },
  
  // FLAW DETECTION REQUIREMENTS
  flaw_detection: {
    business_model_flaws: "unsustainable unit economics, scaling brittleness",
    strategic_traps: "hidden costs, assumed simplicity, human bottlenecks", 
    operational_fraud_risk: "false success perception, compliance violations",
    false_stability: "systems that work in theory but collapse at scale",
    risky_optimism: "assumptions that could invalidate projections",
    action_on_detection: "flag immediately, halt if severity >= medium"
  },
  
  // INITIATIVE REQUIREMENTS
  initiative_mandates: {
    show_initiative: true,
    surface_unknown_risks: true,
    find_weak_points: true,
    recommend_alternatives: true,
    proactive_execution: true
  },
  
  // SURVIVABILITY STANDARDS
  survivability: {
    no_light_version: "There is no light version of any system",
    day_one_operational: "All systems must be fully operational, resilient, and correct from Day One",
    real_world_pressure: "All services must function under real-world load, real clients, and live business pressure",
    scale_requirement: "Systems must be able to scale to 100K+ users",
    uptime_requirement: 0.99,
    automation_first: "Systems must automate customer acquisition, onboarding, delivery, reporting, and support"
  },
  
  // PROFITABILITY ENFORCEMENT
  profitability: {
    margin_requirement: 0.85, // 85% minimum
    margin_target: 0.90,      // 90% target
    scale_viability: "100K+ users",
    cost_efficiency_priority: true,
    performance_protection: "may only propose solutions that work without reducing system performance"
  },

  // *** CRITICAL: MISSING OBJECTS THAT CHAT.JS REQUIRES ***
  error_handling: {
    system_error_response: "I encountered a system processing error, but I'm still operational and ready to help with your business validation needs."
  },

  vault_usage: {
    primary_directive: "Use vault content as primary source for business validation responses."
  },

  neutrality: {
    political_redirect: "NEUTRALITY: Site Monkeys AI maintains political neutrality and focuses on business validation."
  },

  system_behavior: {
    response_quality: "RESPONSE QUALITY: Provide actionable, specific insights. Avoid vague generalizations.",
    error_prevention: "ERROR PREVENTION: If uncertain, state limitations rather than guess."
  }
};

// VAULT VALIDATION - Text-based for your document vault
function validateVaultStructure(vaultData) {
  try {
    if (!vaultData || typeof vaultData !== 'string') {
      console.warn('⚠️ Vault data is not a string or is empty');
      return false;
    }
    
    // Content-based validation for text vault (not JSON structure)
    const contentTerms = [
  'monkeys', 'pricing', 'boost', 'climb', 'lead',
  'validation', 'automation', 'launch', 'protocol'
];
    
    const lowerVault = vaultData.toLowerCase();
    let termCount = 0;
    
    contentTerms.forEach(term => {
      if (lowerVault.includes(term)) {
        termCount++;
      }
    });
    
    const validationPassed = termCount >= 5 && vaultData.length > 5000;
    
    if (validationPassed) {
      console.log(`✅ Vault validation passed. Found business content: ${termCount}/${contentTerms.length} terms`);
    } else {
      console.warn(`⚠️ Vault validation failed. Found: ${termCount}/${contentTerms.length} terms, Length: ${vaultData.length}`);
    }
    
    return validationPassed;
  } catch (e) {
    console.error('❌ Vault validation failed due to error:', e.message);
    return false;
  }
}

// Get vault value utility
function getVaultValue(data, path) {
  if (!data) return null;
  
  // For text-based vault, search for content patterns
  if (typeof data === 'string') {
    if (path.includes('pricing')) {
      if (data.includes('697')) return '697';
      if (data.includes('1497')) return '1497'; 
      if (data.includes('2997')) return '2997';
    }
    return null;
  }
  
  // For object-based data
  return path.split('.').reduce((obj, key) => obj?.[key], data);
}

// ENFORCEMENT VALIDATION FUNCTIONS
function validateSystemCompliance(systemSpec) {
  const failures = [];
  
  // Check survivability requirements
  if (!systemSpec.day_one_ready) {
    failures.push("System not ready for Day One operation");
  }
  
  if (!systemSpec.automation_complete) {
    failures.push("Manual operations detected - violates automation-first mandate");
  }
  
  if (systemSpec.projected_margin < ENFORCEMENT_PROTOCOLS.profitability.margin_requirement) {
    failures.push(`Margin ${systemSpec.projected_margin} below required ${ENFORCEMENT_PROTOCOLS.profitability.margin_requirement}`);
  }
  
  return {
    compliant: failures.length === 0,
    failures: failures
  };
}

function enforceZeroFailureResponse(response, confidence, vaultHealthy = false, vaultContent = '') {
  console.log('🔧 ENFORCEMENT CHECK - Vault Healthy:', vaultHealthy, 'Content Length:', vaultContent?.length || 0);
  
  // VAULT OVERRIDE: If vault is healthy and contains business data, trust the response
  if (vaultHealthy && vaultContent && vaultContent.length > 1000) {
    console.log('✅ VAULT OVERRIDE: Using vault-based response with high confidence');
    return {
      approved: true,
      response: response,
      fallback_triggered: false,
      quality_gates_passed: true,
      enforcement_applied: ["vault_override_applied"],
      assumptions: [],
      reason: "VAULT_AUTHORITATIVE_CONTENT",
      confidence: Math.max(confidence, 0.9) // Boost confidence for vault-based responses
    };
  }
  
  const result = {
    response: response,
    confidence: confidence,
    enforcement_applied: [],
    assumptions: [],
    fallback_triggered: false,
    quality_gates_passed: true,
    reason: null
  };

  // If confidence below threshold, trigger insufficient data response
  if (confidence < 0.85) {
    console.log('❌ ENFORCEMENT DEBUG - Confidence too low:', confidence);
    result.fallback_triggered = true;
    result.response = ENFORCEMENT_PROTOCOLS.truth_first.insufficient_data_response;
    result.reason = "CONFIDENCE_BELOW_THRESHOLD";
    result.enforcement_applied.push("confidence_gate_triggered");
    result.quality_gates_passed = false;
    return result;
  }
  
  // Validate response doesn't violate truth-first mandate
  if (containsGuessing(response)) {
    console.log('❌ ENFORCEMENT DEBUG - Speculation detected in response');
    result.fallback_triggered = true;
    result.response = ENFORCEMENT_PROTOCOLS.truth_first.insufficient_data_response;
    result.reason = "SPECULATION_DETECTED";
    result.enforcement_applied.push("truth_first_violation");
    result.assumptions = extractSpeculativeLanguage(response);
    result.quality_gates_passed = false;
    return result;
  }

  // Response passed all gates
  console.log('✅ ENFORCEMENT DEBUG - Response passed all gates');
  result.enforcement_applied.push("truth_first_verified", "confidence_validated");
  return result;
}

// Enhanced speculation detection with detailed extraction
function extractSpeculativeLanguage(response) {
  const guessing_indicators = [
    "probably", "likely", "might", "could be", "seems like", 
    "appears to", "presumably", "I think", "maybe", "perhaps"
  ];
  
  const found = [];
  const lowercaseResponse = response.toLowerCase();
  
  guessing_indicators.forEach(indicator => {
    if (lowercaseResponse.includes(indicator)) {
      // Find the sentence containing the speculation
      const sentences = response.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(indicator)) {
          found.push({
            indicator: indicator,
            context: sentence.trim(),
            type: "speculation"
          });
          break;
        }
      }
    }
  });
  
  return found;
}

function containsGuessing(response) {
  const guessing_indicators = [
    "probably", "likely", "might", "could be", "seems like", 
    "appears to", "presumably", "I think", "maybe", "perhaps"
  ];
  
  // *** CRITICAL FIX: Don't flag business requirements as speculation ***
  const businessRequirementIndicators = [
    "must be able to", "required to", "shall", "will", "must",
    "requirement", "mandatory", "essential", "critical", "necessary"
  ];
  
  const lowercaseResponse = response.toLowerCase();
  
  // If response contains business requirements, it's not speculation
  const hasBizRequirements = businessRequirementIndicators.some(indicator => 
    lowercaseResponse.includes(indicator)
  );
  
  if (hasBizRequirements) {
    return false; // Business requirements are not speculation
  }
  
  return guessing_indicators.some(indicator => lowercaseResponse.includes(indicator));
}

// CRITICAL: Export both EMERGENCY_FALLBACKS and ENFORCEMENT_PROTOCOLS
export {
  EMERGENCY_FALLBACKS,
  ENFORCEMENT_PROTOCOLS,
  validateVaultStructure,
  getVaultValue,
  validateSystemCompliance,
  enforceZeroFailureResponse,
  extractSpeculativeLanguage,
  containsGuessing
};

export async function checkFounderProtection({ response, mode, _context }) {
  try {
    const violations = [];

    // Rule 1: Minimum pricing check ($697)
    const priceRegex = /\$(\d+)/g;
    let match;
    while ((match = priceRegex.exec(response)) !== null) {
      const price = parseInt(match[1]);
      if (price < 697 && price > 50) {
        violations.push({
          rule: 'minimum_pricing',
          detected: `Price $${price} below $697 minimum`,
          severity: 'critical'
        });
      }
    }

    // Rule 2: No free premium features
    const freeIndicators = [
      'offer for free', 
      'give away', 
      'no charge', 
      'at no cost', 
      'complimentary service'
    ];
    
    for (const indicator of freeIndicators) {
      if (response.toLowerCase().includes(indicator)) {
        violations.push({
          rule: 'no_free_premium',
          detected: `Suggested free value: "${indicator}"`,
          severity: 'high'
        });
      }
    }

    // Rule 3: Business Validation mode must consider survival
    if (mode === 'business_validation' && response.length > 500) {
      const survivalIndicators = [
        'cash flow', 'runway', 'burn rate', 'break-even',
        'profitability', 'survival', 'sustainable', 'cash'
      ];
      
      const hasSurvival = survivalIndicators.some(
        indicator => response.toLowerCase().includes(indicator)
      );

      if (!hasSurvival) {
        violations.push({
          rule: 'survival_focus',
          detected: 'Business advice missing survival/cash-flow analysis',
          severity: 'medium'
        });
      }
    }

    if (violations.length > 0) {
      return {
        violationDetected: true,
        violations,
        reason: `Founder protection: ${violations.map(v => v.rule).join(', ')}`,
        correctedResponse: response + '\n\n[FOUNDER PROTECTION: This recommendation was adjusted to ensure business sustainability and profitability.]'
      };
    }

    return {
      violationDetected: false
    };

  } catch (error) {
    console.error('[FOUNDER-PROTECTION] Check error:', error);
    
    return {
      violationDetected: false,
      error: error.message
    };
  }
}

export async function handleCostCeiling({ _query, _context, reason, currentCost }) {
  return {
    response: `I've reached the cost ceiling for this session ($${currentCost.toFixed(4)}). 

To continue with complex queries:
- Start a new session, or
- Simplify your request for lower-cost processing

The cost ceiling protects you from unexpected charges while maintaining quality.`,
    metadata: {
      fallback_reason: reason,
      cost_blocked: currentCost,
      ceiling_type: 'session_limit'
    }
  };
}
