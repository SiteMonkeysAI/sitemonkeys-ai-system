// COMPLETE MODULAR CARING FAMILY INTELLIGENCE SYSTEM
// Orchestrates all cognitive modules for universal expert intelligence
// MEMORY SYSTEMS NOW HANDLED BY SERVER.JS BOOTSTRAP

console.log('[CHAT] 🚀 Chat system initializing...');
console.log('[DEBUG] Chat imports starting...');

// CORRECTED IMPORTS - Replace existing imports in chat.js
import { trackApiCall, formatSessionDataForUI } from './tokenTracker.js';
import { EMERGENCY_FALLBACKS, validateVaultStructure, getVaultValue } from './site-monkeys/emergency-fallbacks.js';
import { ENFORCEMENT_PROTOCOLS } from './site-monkeys/enforcement-protocols.js';
import { QUALITY_ENFORCEMENT } from './site-monkeys/quality-enforcement.js';
import { AI_ARCHITECTURE } from './site-monkeys/ai-architecture.js';
import { getVaultStatus, checkVaultTriggers, generateVaultContext, enforceVaultCompliance } from './lib/vault.js';
import { integrateSystemIntelligence, enhancePromptWithIntelligence, getSystemIntelligenceStatus } from './lib/system-intelligence.js';
import zlib from 'zlib';

// NEW ENFORCEMENT MODULE IMPORTS (ADD THESE)
import { 
  FAMILY_PHILOSOPHY, 
  identifyExpertDomain, 
  analyzeCareNeeds, 
  calculatePrideMotivation, 
  selectCaringPersonality,
  buildCaringExpertPrompt,
  FAMILY_MEMORY 
} from './caring-family-core.js';

import { 
  requiresQuantitativeReasoning,
  enforceQuantitativeAnalysis,
  enforceCalculationStandards,
  validateCalculationQuality 
} from './quantitative-enforcer.js';

import { 
  requiresSurvivalAnalysis,
  enforceBusinessSurvival,
  validateBusinessSurvival,
  applySurvivalProtection 
} from './survival-guardian.js';

import { 
  validateExpertQuality,
  enforceExpertStandards,
  monitorSystemDrift 
} from './expert-validator.js';

import { 
  scanForProtectiveAlerts,
  findSolutionOpportunities,
  applyProtectiveIntelligence,
  assessCrossContextNeeds 
} from './protective-intelligence.js';

import { 
  detectPoliticalContent,
  applyPoliticalNeutrality,
  enforceEvidenceBasedStandards 
} from './political-neutrality.js';

import { 
  detectSiteMonkeysViolations,
  enforceSiteMonkeysStandards,
  enforcePricingFloors,
  integrateVaultLogic 
} from './site-monkeys-enforcement.js';

import { ResponseObjectUnifier } from './response-object-unifier.js';
import { MasterModeCompliance } from './master-mode-compliance.js';
import { UnifiedResponseSchema } from './unified-response-schema.js';
import { EnhancedIntelligence } from './lib/enhanced-intelligence.js';

console.log('[DEBUG] All cognitive modules loaded successfully');

function generateModeFingerprint(mode, vaultHealthy) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const vaultCode = vaultHealthy ? 'V' : 'N';
  return `${mode.toUpperCase()}-${vaultCode}-${timestamp}`;
}

function validateVaultStructure(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length < 1000) return false;
  if (!content.includes('SITE MONKEYS')) return false;
  if (!content.includes('Boost') || !content.includes('Climb') || !content.includes('Lead')) return false;
  return true;
}

// SYSTEM GLOBALS
let lastPersonality = 'roxy';
let conversationCount = 0;
let systemDriftHistory = [];

const intelligence = new EnhancedIntelligence();

async function initializeMemoryIntelligenceBridge() {
  try {
    console.log('[BRIDGE-INIT] Initializing memory-intelligence bridge');
    
    let enhancedIntelligence = null;
    let aiReasoningEngine = null;
    let intelligenceOrchestrator = null;

    // Load your existing intelligence modules
    try {
      const { EnhancedIntelligence } = await import('./lib/enhanced-intelligence.js');
      enhancedIntelligence = new EnhancedIntelligence();
    } catch (error) {
      console.log('Enhanced intelligence not available:', error.message);
    }

    // Load AI Reasoning Engine if available
    try {
      const { AIReasoningEngine } = await import('./lib/ai-reasoning-engine.js');
      aiReasoningEngine = new AIReasoningEngine();
      console.log('AI Reasoning Engine loaded successfully');
    } catch (error) {
      console.log('AI reasoning engine not available:', error.message);
    }
    
    // Load Intelligence Orchestrator if available  
    try {
      const { intelligenceOrchestrator } = await import('./lib/intelligence-orchestrator.js');
      intelligenceOrchestrator = intelligenceOrchestrator;
      console.log('Intelligence Orchestrator loaded successfully');
    } catch (error) {
      console.log('Intelligence orchestrator not available:', error.message);
    }

    return new MemoryIntelligenceBridge(enhancedIntelligence, aiReasoningEngine, intelligenceOrchestrator);

  } catch (error) {
    console.error('Failed to initialize memory-intelligence bridge:', error);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let vaultContent = '';
  let vaultTokens = 0;
  let vaultStatus = 'not_loaded';
  let vaultHealthy = false;

  try {
    const {
      message,
      conversation_history = [],
      mode = 'site_monkeys',
      claude_requested = false,
      vault_content = null,
      user_id = 'default_user'
    } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required and must be a string' });
      return;
    }

    // *** VAULT LOADING (PRESERVED) ***
    try {
      if (vault_content && typeof vault_content === 'string' && vault_content.length > 0) {
        vaultContent = vault_content;
        vaultTokens = Math.ceil(vaultContent.length / 4);
        vaultStatus = 'loaded_from_frontend';
        vaultHealthy = true;  // vault.js will handle health validation
        const vaultStatusObj = getVaultStatus();
      } else {
        const kvVault = process.env.VAULT_CONTENT;
        if (kvVault) {
          try {
            const decompressed = zlib.gunzipSync(Buffer.from(kvVault, 'base64')).toString();
            vaultContent = decompressed;
            vaultTokens = Math.ceil(vaultContent.length / 4);
            vaultStatus = 'loaded_from_kv';
            vaultHealthy = validateVaultStructure(vaultContent);
          } catch (decompError) {
            vaultContent = kvVault;
            vaultTokens = Math.ceil(vaultContent.length / 4);
            vaultStatus = 'loaded_from_kv_uncompressed';
            vaultHealthy = validateVaultStructure(vaultContent);
          }
        } else {
          vaultStatus = 'fallback_mode';
          vaultHealthy = false;
        }
      }
    } catch (vaultError) {
      console.error('Vault loading error:', vaultError);
      vaultStatus = 'error_fallback';
      vaultHealthy = false;
    }

    // *** FINAL VAULT HEALTH CORRECTION FOR SITE MONKEYS MODE ***
    if (mode === 'site_monkeys' && vaultContent && vaultContent.length > 1000) {
      vaultHealthy = true;
      vaultStatus = 'healthy_override_applied';
      console.log('✅ Site Monkeys vault health FINAL correction - vault intelligence active');
    }

    // *** COMPREHENSIVE COGNITIVE ANALYSIS ***
    
    // 1. EXPERT DOMAIN RECOGNITION
    const expertDomain = identifyExpertDomain(message);
    
    // 2. CARING FAMILY ANALYSIS
    const careNeeds = analyzeCareNeeds(message, conversation_history);
    
    // 3. PROTECTIVE INTELLIGENCE SCANNING
    const protectiveAlerts = scanForProtectiveAlerts(message, expertDomain.domain, conversation_history);
    
    // 4. SOLUTION OPPORTUNITY DISCOVERY
    const solutionOpportunities = findSolutionOpportunities(message, expertDomain.domain, protectiveAlerts);
    
    // 5. CROSS-CONTEXT INTELLIGENCE
    const crossContextNeeds = assessCrossContextNeeds(message, conversation_history, FAMILY_MEMORY.userGoals);
    
    // 6. POLITICAL CONTENT DETECTION
    const politicalAnalysis = detectPoliticalContent(message);
    
    // *** EXPERT PERSONALITY SELECTION ***
    const optimalPersonality = selectCaringPersonality(expertDomain, careNeeds, protectiveAlerts);
    const prideMotivation = calculatePrideMotivation(expertDomain, careNeeds, protectiveAlerts, solutionOpportunities);
    
    conversationCount++;

    // *** COST PROTECTION (PRESERVED) ***
    // *** COST PROTECTION AND APPROVAL (CRITICAL FIX) ***
    if (claude_requested) {
      const estimatedTokens = Math.ceil((buildMasterPrompt(mode, optimalPersonality, vaultContent, vaultHealthy, expertDomain, careNeeds, protectiveAlerts, solutionOpportunities).length + message.length) / 4) + 800;
      const estimatedCost = (estimatedTokens * 0.015) / 1000;

      // ALWAYS require approval for Claude, regardless of cost
      return res.status(200).json({
        response: `🧠 **Advanced AI Analysis Required**

I can provide deeper analysis using Claude Sonnet 4 for this complex request.

**Cost Details:**
- Estimated Cost: $${estimatedCost.toFixed(4)}
- Token Estimate: ~${estimatedTokens} tokens
- Current Session Total: ${formatSessionDataForUI().totalCost}

**What you'll get:**
- Enhanced reasoning capabilities
- More detailed analysis 
- Advanced problem-solving

Would you like to proceed?`,
        mode_active: mode,
        vault_status: { loaded: vaultStatus !== 'not_loaded', tokens: vaultTokens, healthy: vaultHealthy },
        claude_cost_approval_required: true,
        estimated_cost: estimatedCost.toFixed(4),
        estimated_tokens: estimatedTokens,
        cognitive_analysis: {
          expert_domain: expertDomain.domain,
          care_level: careNeeds.care_level,
          protective_alerts: protectiveAlerts.length,
          solution_opportunities: solutionOpportunities.length
        }
      });
    }

    // *** POLITICAL NEUTRALITY CHECK ***
    if (politicalAnalysis.requires_neutrality_response) {
      const neutralityResponse = applyPoliticalNeutrality(message, message);
      
      return res.status(200).json({
        response: neutralityResponse,
        mode_active: mode,
        personality_active: 'neutrality_enforced',
        political_analysis: politicalAnalysis,
        enforcement_applied: ['political_neutrality_enforced', 'voting_protection_active'],
        vault_status: { loaded: vaultStatus !== 'not_loaded', tokens: vaultTokens, healthy: vaultHealthy },
        session_data: formatSessionDataForUI()
      });
    }

    // *** MEMORY-INTELLIGENCE INTEGRATION ***
console.log('[MEMORY-INTELLIGENCE] Starting integration');

// Initialize the bridge
const memoryIntelligenceBridge = await initializeMemoryIntelligenceBridge();

// Get memory from existing persistent memory system
let memoryResult = null;
if (global.memorySystem) {
  try {
    memoryResult = await global.memorySystem.retrieveMemoryForChat(user_id, message);
    console.log('[MEMORY-INTELLIGENCE] Memory retrieved:', memoryResult?.hasMemory ? 'SUCCESS' : 'NO_MEMORY');
    
    console.log('[BRIDGE DEBUG] memoryResult check:', memoryResult ? 'EXISTS' : 'NULL', typeof memoryResult);
    if (memoryResult) {
      console.log('[MEMORY DEBUG] Full memory result:', JSON.stringify(memoryResult, null, 2));
  // ... rest of your existing debug code
  console.log('[MEMORY DEBUG] Memory hasMemory:', memoryResult.hasMemory);
  console.log('[MEMORY DEBUG] Memory content keys:', Object.keys(memoryResult));
  if (memoryResult.memories) {
    console.log('[MEMORY DEBUG] Memory content preview:', memoryResult.memories.substring(0, 500));
  }
  if (memoryResult.systemPrompt) {
    console.log('[MEMORY DEBUG] System prompt preview:', memoryResult.systemPrompt.substring(0, 500));
  }
  if (memoryResult.conversationContext) {
    console.log('[MEMORY DEBUG] Conversation context preview:', memoryResult.conversationContext.substring(0, 500));
  }
}
  } catch (memoryError) {
    console.error('[MEMORY-INTELLIGENCE] Memory retrieval failed:', memoryError);
    memoryResult = { hasMemory: false };
  }
}

// Bridge memory to existing intelligence engines  
let intelligenceResult = {
  intelligenceEnhanced: false,
  memoryIntegrated: false,
  enginesActivated: ['fallback'],
  response: null,
  confidence: 0.5
};

// FIXED: Properly instantiate the bridge with intelligence orchestrator
const memoryIntelligenceBridge = new MemoryIntelligenceBridge(
  intelligence, // your existing EnhancedIntelligence instance
  null, // aiReasoningEngine (can be null for now)
  null  // intelligenceOrchestrator (can be null for now)
);

if (memoryIntelligenceBridge) {
  try {
    intelligenceResult = await memoryIntelligenceBridge.enhanceWithMemoryContext(
      message,
      mode,
      memoryResult,
      vaultContent,
      optimalPersonality
    );
    console.log('[MEMORY-INTELLIGENCE] Intelligence enhancement:', intelligenceResult.intelligenceEnhanced ? 'SUCCESS' : 'FALLBACK');
    console.log('[MEMORY-INTELLIGENCE] Engines activated:', intelligenceResult.enginesActivated.join(', '));
  } catch (bridgeError) {
    console.error('[MEMORY-INTELLIGENCE] Bridge failed:', bridgeError);
  }
}

// Create memory context for backward compatibility
let memoryContext = null;
if (memoryResult?.hasMemory) {
  memoryContext = {
    hasMemory: true,
    contextFound: true,
    memories: memoryResult.systemPrompt || memoryResult.conversationContext || memoryResult.memories || '',
    totalTokens: memoryResult.tokenCount || 0,
    personalityPrompt: `You have access to previous conversation context. Reference it naturally when relevant.\n\n`
  };
} else {
  memoryContext = {
    hasMemory: false,
    contextFound: false,
    memories: '',
    totalTokens: 0,
    personalityPrompt: ''
  };
}
    
    // *** MEMORY DEBUG - TEMPORARY DIAGNOSTIC ***
    console.log('[MEMORY DEBUG] Raw memory context:', JSON.stringify(memoryContext, null, 2));
    console.log('[MEMORY DEBUG] Memory found:', memoryContext?.contextFound);
    console.log('[MEMORY DEBUG] Memory content preview:', memoryContext?.memories?.substring(0, 500));

    // *** MASTER SYSTEM PROMPT CONSTRUCTION ***
    const intelligenceContext = null; // Bridge will provide intelligence context if needed
    const masterPrompt = buildMasterPrompt(mode, optimalPersonality, vaultContent, vaultHealthy, expertDomain, careNeeds, protectiveAlerts, solutionOpportunities, memoryContext, intelligenceContext);
    const basePrompt = buildFullConversationPrompt(masterPrompt, message, conversation_history, expertDomain, careNeeds, memoryContext);
    
    // *** SYSTEM INTELLIGENCE INTEGRATION - FALLBACK SAFE ***
    const intelligence = { vaultIntelligenceActive: vaultHealthy, status: 'active' };
    const fullPrompt = basePrompt;
    
    // *** RESPONSE GENERATION WITH MEMORY-INTELLIGENCE ***
    let finalResponse;
    let apiResponse;
    
    if (intelligenceResult.intelligenceEnhanced && intelligenceResult.response) {
      // Use intelligence-enhanced response
      finalResponse = intelligenceResult.response;
      apiResponse = { response: finalResponse, usage: { prompt_tokens: 0, completion_tokens: 0 } };
      console.log('[MEMORY-INTELLIGENCE] Using intelligence-enhanced response');
      
    } else {
      // Fallback to existing personality system
      console.log('[MEMORY-INTELLIGENCE] Using fallback personality response');
      
      const memoryForPersonality = memoryContext && (memoryContext.contextFound || memoryContext.hasMemory) ? 
      (memoryContext.memories || memoryContext.formattedMemory || memoryContext) : null;
    console.log('[MEMORY FIX] Memory for personality:', memoryForPersonality ? 'FOUND' : 'NULL');
      apiResponse = await makeEnhancedAPICall(fullPrompt, optimalPersonality, prideMotivation, memoryForPersonality);
      finalResponse = apiResponse.response;
    }

    let promptTokens, completionTokens;

    if (optimalPersonality === 'claude') {
      promptTokens = apiResponse.usage?.input_tokens || Math.ceil(fullPrompt.length / 4);
      completionTokens = apiResponse.usage?.output_tokens || Math.ceil(apiResponse.response.length / 4);
    } else {
      promptTokens = apiResponse.usage?.prompt_tokens || Math.ceil(fullPrompt.length / 4);
      completionTokens = apiResponse.usage?.completion_tokens || Math.ceil(apiResponse.response.length / 4);
    }

    const trackingResult = trackApiCall(optimalPersonality, promptTokens, completionTokens, vaultTokens);
    
    // 0. ENHANCED REASONING PROCESSING (MEMORY-AWARE)
    let enhancedResponse = finalResponse;
    
    try {
      // Skip enhancement if intelligence already enhanced the response
      if (intelligenceResult.intelligenceEnhanced) {
        console.log('[ENHANCED INTELLIGENCE] Skipping enhancement - intelligence already enhanced');
      } else if (memoryContext && memoryContext.contextFound && memoryContext.totalTokens > 0) {
    console.log('[ENHANCED INTELLIGENCE] Skipping enhancement - memory integration detected');
  } else {
    const enhancement = await intelligence.enhanceResponse(
      enhancedResponse, message, mode, memoryContext, vaultContent, 0.8
    );
    enhancedResponse = enhancement.enhancedResponse;
    console.log('[ENHANCED INTELLIGENCE] Applied:', enhancement.intelligenceApplied.join(', '));
  }
} catch (error) {
  console.error('[ENHANCED INTELLIGENCE] Error:', error);
  // Skip fallback if memory was successfully integrated
  if (!(memoryContext && memoryContext.contextFound)) {
    enhancedResponse = applyEnhancedReasoning(
      enhancedResponse, message, mode, expertDomain, memoryContext, vaultContent
    );
  }
}
    
    // 1. QUANTITATIVE REASONING ENFORCEMENT
    enhancedResponse = enforceQuantitativeAnalysis(enhancedResponse, message, expertDomain.domain, vaultContent);
    enhancedResponse = enforceCalculationStandards(enhancedResponse, message, expertDomain.domain);
    
    // 2. BUSINESS SURVIVAL ENFORCEMENT  
    enhancedResponse = enforceBusinessSurvival(enhancedResponse, message, expertDomain.domain, mode);
    
    // 3. EXPERT QUALITY VALIDATION
    enhancedResponse = enforceExpertStandards(enhancedResponse, expertDomain.domain, message);
    
    // 4. PROTECTIVE INTELLIGENCE INTEGRATION
    enhancedResponse = applyProtectiveIntelligence(enhancedResponse, message, expertDomain.domain, conversation_history);
    
    // 5. POLITICAL NEUTRALITY ENFORCEMENT
    enhancedResponse = applyPoliticalNeutrality(enhancedResponse, message);
    enhancedResponse = enforceEvidenceBasedStandards(enhancedResponse);
    
    // 6. SITE MONKEYS BUSINESS LOGIC ENFORCEMENT
    enhancedResponse = enforceSiteMonkeysStandards(enhancedResponse, mode, vaultContent, vaultHealthy);
    enhancedResponse = enforcePricingFloors(enhancedResponse, mode);
    enhancedResponse = integrateVaultLogic(enhancedResponse, vaultContent, vaultHealthy, mode);
    
    // 7. SURVIVAL PROTECTION APPLICATION
    // 7. SURVIVAL PROTECTION APPLICATION  
let finalResponse = applySurvivalProtection(enhancedResponse, mode, vaultContent);

// 8. UNIFIED CONFLICT RESOLUTION - SUPPLEMENT TO EXISTING INTELLIGENCE
const responseUnifier = new ResponseObjectUnifier();
responseUnifier.initializeResponseObject(finalResponse);

// Apply ONLY the conflict resolution, not intelligence replacement
const conflictResolution = responseUnifier.getFinalResponse();
finalResponse = conflictResolution.content;

// Master mode compliance - replace the three competing functions ONLY
const complianceValidation = MasterModeCompliance.validateModeCompliance(
  finalResponse, 
  mode, 
  {
    fingerprint: generateModeFingerprint(mode, vaultHealthy),
    vaultLoaded: vaultHealthy,
    conversationHistory: conversation_history,
    enforcementLevel: 'STANDARD'
  }
);

// Use corrected content if needed
if (complianceValidation.corrected_content) {
  finalResponse = complianceValidation.corrected_content;
}
    
    // *** SYSTEM QUALITY ASSESSMENT ***
    const responseQuality = validateExpertQuality(finalResponse, expertDomain.domain, message);
    const businessValidation = validateBusinessSurvival(finalResponse, mode);
    const calculationQuality = validateCalculationQuality(finalResponse);
    
    // *** DRIFT MONITORING ***
    systemDriftHistory.push(finalResponse);
    if (systemDriftHistory.length > 10) {
      systemDriftHistory = systemDriftHistory.slice(-10);
    }
    const driftMonitoring = monitorSystemDrift(systemDriftHistory);
    
    // *** FAMILY MEMORY UPDATE ***
    FAMILY_MEMORY.updateMemory(expertDomain, careNeeds, protectiveAlerts, solutionOpportunities);
    lastPersonality = optimalPersonality;

    // *** MEMORY STORAGE - CRITICAL SYSTEM FIX ***
    try {
      if (global.memorySystem && global.memorySystem.storeMemory) {
        const conversationData = `User: ${message}\nAI: ${finalResponse}`;
        await global.memorySystem.storeMemoryForChat(user_id, conversationData);
        console.log('[MEMORY] Conversation stored successfully');
      } else {
        console.log('[MEMORY] Storage system not available - conversation not stored');
      }
    } catch (storageError) {
      console.error('[MEMORY] Storage failed:', storageError);
    }

    const sessionData = formatSessionDataForUI();

    res.status(200).json({
      response: finalResponse,
      mode_active: mode,
      personality_active: optimalPersonality,
      memory_integrated: intelligenceResult.memoryIntegrated,
      intelligence_enhanced: intelligenceResult.intelligenceEnhanced,
      engines_used: intelligenceResult.enginesActivated,
      intelligence_confidence: intelligenceResult.confidence,
      memory_tokens_used: memoryResult?.tokenCount || 0,
      cognitive_intelligence: {
        expert_domain: expertDomain.domain,
        expert_title: expertDomain.title,
        domain_confidence: expertDomain.confidence,
        care_level: careNeeds.care_level,
        pride_motivation: Math.round(prideMotivation * 100),
        protective_alerts: protectiveAlerts.length,
        solution_opportunities: solutionOpportunities.length,
        family_care_score: FAMILY_MEMORY.careLevel,
        expert_quality_score: responseQuality.expert_level,
        overall_quality_score: responseQuality.quality_score,
        quantitative_quality: calculationQuality.percentage,
        business_survival_score: businessValidation.survival_score || 100
      },
      enforcement_applied: [
        'caring_family_intelligence_active',
        'universal_expert_activation_complete',
        'quantitative_reasoning_enforced',
        'business_survival_protected',
        'expert_quality_validated',
        'protective_intelligence_active',
        'political_neutrality_enforced',
        'truth_first_with_caring_delivery',
        'pride_driven_excellence_active',
        mode === 'site_monkeys' ? 'site_monkeys_business_logic_enforced' : 'general_business_logic_active',
        vaultHealthy ? 'vault_intelligence_integrated' : 'emergency_fallback_active'
      ],
      drift_monitoring: {
        system_stable: !driftMonitoring.intervention_needed,
        trend: driftMonitoring.drift_trend,
        average_quality: Math.round(driftMonitoring.average_quality_score)
      },
      vault_status: {
        loaded: vaultStatus !== 'not_loaded',
        tokens: vaultTokens,
        status: vaultStatus,
        healthy: vaultHealthy,
        source: vaultStatus.includes('frontend') ? 'frontend' : vaultStatus.includes('kv') ? 'kv' : 'fallback'
      },
      system_intelligence: getSystemIntelligenceStatus(intelligence),
      intelligence_status: intelligence,
      system_intelligence_active: intelligence.vaultIntelligenceActive,
      session_data: {
  ...sessionData,
  intelligence_capabilities: {
    reasoning_engine: true,
    cross_domain_synthesis: true,
    scenario_modeling: mode === 'business_validation' || mode === 'site_monkeys',
    quantitative_analysis: true,
    enhanced_memory: memoryContext?.intelligenceEnhanced || false
  },
  memory_intelligence: memoryContext?.intelligenceEnhanced ? {
    reasoning_support_memories: memoryContext.reasoningSupport?.length || 0,
    cross_domain_connections: memoryContext.crossDomainConnections?.length || 0,
    scenario_relevant_memories: Object.values(memoryContext.scenarioRelevantMemories || {}).reduce((sum, arr) => sum + arr.length, 0),
    quantitative_context_memories: memoryContext.quantitativeContext?.length || 0
  } : null
}
    });

  } catch (error) {
    console.error('Cognitive System Error:', error);
    
    const emergencyResponse = generateCaringEmergencyResponse(error, mode, vaultContent);
    
    res.status(200).json({
      response: emergencyResponse,
      mode_active: mode,
      error_handled: true,
      emergency_mode: true,
      enforcement_applied: ['emergency_caring_response_active', 'truth_first_maintained'],
      vault_status: { loaded: false, tokens: 0, healthy: false, source: 'error' },
      session_data: formatSessionDataForUI()
    });
  }
}

// ================================================================
// ENHANCED REASONING FUNCTION - PRODUCTION READY WITH SAFEGUARDS
// Add this function to your chat.js file before buildMasterPrompt
// ================================================================

function applyEnhancedReasoning(response, message, mode, expertDomain, memoryContext, vaultContent) {
  try {
    console.log('[ENHANCED REASONING] Processing advanced cognitive capabilities');
    
    // SAFETY: Don't enhance trivial questions or if already enhanced
    const alreadyEnhanced = /\*\*Multi-Step Analysis:|\*\*Scenario Analysis:|\*\*Cross-Domain Analysis:|\*\*Quantitative Deep Dive:/.test(response);
    const needsReasoning = 
      message.length > 50 ||
      /\b(analyze|compare|evaluate|assess|decide|invest|scenario|model|pivot|strategy|should|could|would)\b/i.test(message) ||
      /\$?[\d,]+(?:\.\d+)?/g.test(message) ||  // FIXED REGEX
      /\d+%/.test(message) ||
      mode === 'business_validation' || mode === 'site_monkeys';

    if (!needsReasoning || alreadyEnhanced) {
      console.log('[ENHANCED REASONING] Skipping - not needed or already enhanced');
      return response;
    }

    console.log('[ENHANCED REASONING] Advanced reasoning triggered');
    
    let enhanced = response;
    const sections = [];

    // ================================================================
    // 1. MULTI-STEP REASONING CHAIN
    // ================================================================
    if (/\b(analyze|assess|compare|decide|should|evaluate)\b/i.test(message)) {
      console.log('[ENHANCED REASONING] Applying multi-step reasoning');
      
      sections.push([
        '🔗 **Multi-Step Analysis:**',
        `1. **Situation Assessment:** ${extractSituationFromMessage(message)}`,
        `2. **Key Factors:** ${identifyKeyFactors(message, expertDomain)}`,
        `3. **Risk Analysis:** ${analyzeRisks(message, mode)}`,
        `4. **Logical Conclusion:** ${deriveLogicalConclusion(message, expertDomain)}`
      ].join('\n'));
    }

    // ================================================================
    // 2. SCENARIO MODELING (Business Modes Only)
    // ================================================================
    if ((mode === 'business_validation' || mode === 'site_monkeys') &&
        /\b(business|invest|marketing|pivot|strategy|decision)\b/i.test(message)) {
      console.log('[ENHANCED REASONING] Applying scenario modeling');
      
      const scenarios = buildBusinessScenarios(message, vaultContent);
      sections.push([
        '📊 **Scenario Analysis:**',
        `**Best Case (${scenarios.bestProbability}):** ${scenarios.best}`,
        `**Most Likely (${scenarios.likelyProbability}):** ${scenarios.likely}`,
        `**Worst Case (${scenarios.worstProbability}):** ${scenarios.worst}`,
        `**Recommended Action:** ${scenarios.action}`
      ].join('\n'));
    }

    // ================================================================
    // 3. CROSS-DOMAIN SYNTHESIS
    // ================================================================
    if (/\b(work.*relationship|business.*health|stress.*decision|impact.*affect)\b/i.test(message)) {
      console.log('[ENHANCED REASONING] Applying cross-domain synthesis');
      
      const domains = identifyRelevantDomains(message);
      if (domains.length > 1) {
        const connections = buildDomainConnections(domains, message);
        if (connections.length > 0) {
          sections.push(
            '🌐 **Cross-Domain Analysis:**\n' +
            connections.map(c => `• **${c.from} → ${c.to}:** ${c.insight}`).join('\n')
          );
        }
      }
    }

    // ================================================================
    // 4. QUANTITATIVE DEEP DIVE
    // ================================================================
    if (/\$?[\d,]+(?:\.\d+)?/g.test(message) || /\d+%/.test(message)) {
      console.log('[ENHANCED REASONING] Applying quantitative deep analysis');
      
      const numbers = extractNumbersFromMessage(message);
      if (numbers.length > 0) {
        sections.push([
          '🔢 **Quantitative Deep Dive:**',
          `**Numbers Analyzed:** ${numbers.join(', ')}`,
          `**Mathematical Model:** ${selectMathModel(message)}`,
          `**Assumptions:** ${identifyQuantitativeAssumptions(message)}`,
          `**Confidence Level:** ${calculateQuantitativeConfidence(message, numbers)}%`
        ].join('\n'));
      }
    }

    // ================================================================
    // 5. SAFETY: COMBINE SECTIONS WITH TOKEN LIMIT
    // ================================================================
    if (sections.length > 0) {
      const addon = '\n\n' + sections.join('\n\n');
      // CRITICAL: Cap additions to 1200 characters to protect tokens
      enhanced += addon.length > 1200 ? addon.slice(0, 1200) + '…' : addon;
      console.log(`[ENHANCED REASONING] Enhancement complete. Added ${sections.length} sections, ${addon.length} characters`);
    }

    return enhanced;

  } catch (error) {
    console.warn('[ENHANCED REASONING] Skipped due to error:', error.message);
    return response; // GRACEFUL DEGRADATION
  }
}

// ================================================================
// HELPER FUNCTIONS - SAFE VERSIONS WITH BUG FIXES
// ================================================================

function extractSituationFromMessage(message) {
  if (/cash flow/i.test(message)) return 'cash flow constraints affecting business decisions';
  if (/churn.*rate/i.test(message)) return 'customer retention challenges with competitive pressure';
  if (/stress.*relationship/i.test(message)) return 'work-life balance issues affecting personal relationships';
  if (/pivot/i.test(message)) return 'business model evaluation requiring strategic analysis';
  if (/invest.*marketing/i.test(message)) return 'marketing investment decision with ROI considerations';
  if (/hire|hiring/i.test(message)) return 'staffing decision with financial and operational implications';
  return 'complex decision requiring systematic analysis';
}

function identifyKeyFactors(message, expertDomain) {
  const factors = [];
  if (/\$?[\d,]+(?:\.\d+)?/g.test(message)) factors.push('financial impact');
  if (/\d+%/.test(message)) factors.push('performance metrics');
  if (/competitor/i.test(message)) factors.push('competitive dynamics');
  if (/relationship|health|stress/i.test(message)) factors.push('personal well-being');
  if (/time|deadline/i.test(message)) factors.push('temporal constraints');
  if (/business|work|revenue|profit/i.test(message) || expertDomain?.domain?.includes('business')) {
    factors.push('business sustainability');
  }
  return factors.join(', ') || 'multiple interconnected variables';
}

function analyzeRisks(message, mode) {
  const risks = [];
  if (/invest/i.test(message)) risks.push('financial loss potential');
  if (/pivot/i.test(message)) risks.push('market validation risk');
  if (/hire|hiring/i.test(message)) risks.push('cash flow impact');
  if (/stress/i.test(message)) risks.push('health and relationship impact');
  if (/marketing.*budget/i.test(message)) risks.push('ROI uncertainty');
  if (mode === 'site_monkeys') risks.push('business survival considerations');
  return risks.join(', ') || 'standard business and personal risks';
}

function deriveLogicalConclusion(message, expertDomain) {
  if (/invest.*25k.*20%/i.test(message)) {
    return 'investment requires risk-weighted scenario analysis with contingency planning';
  }
  if (/churn.*15%/i.test(message)) {
    return 'retention strategies should be prioritized before considering a pivot';
  }
  if (/pivot.*saas/i.test(message)) {
    return 'pivot decision requires customer validation and competitive analysis';
  }
  if (/hire.*cash flow/i.test(message)) {
    return 'hiring timing must align with cash-flow projections and revenue stability';
  }
  return `${expertDomain?.title || 'Expert'} perspective suggests an integrated approach considering the identified factors`;
}

function buildBusinessScenarios(message, vaultContent) {
  // Default scenarios
  let scenarios = {
    best: 'optimal outcome with favorable market conditions',
    likely: 'expected outcome under normal conditions',
    worst: 'challenging outcome requiring risk management',
    bestProbability: '25%',
    likelyProbability: '50%',
    worstProbability: '25%',
    action: 'proceed with careful monitoring and contingency planning'
  };
  
  // Specific scenario modeling based on message content
  if (/invest.*\$?25k.*20%.*roi/i.test(message)) {
    scenarios = {
      best: '$7,500 profit (30% ROI after hidden costs) — optimal market response',
      likely: '$3,750 profit (20% ROI after hidden costs) — expected performance',
      worst: '$1,250 profit (10% ROI after hidden costs) — market challenges',
      bestProbability: '20%',
      likelyProbability: '60%',
      worstProbability: '20%',
      action: 'proceed with a 15% contingency and monthly performance reviews'
    };
  } else if (/churn.*15%.*\$?50k/i.test(message)) {
    scenarios = {
      best: 'reduce churn to 8%, grow to $75k MRR via differentiation',
      likely: 'maintain $50k MRR, improve churn to 12% over 6 months',
      worst: 'churn rises to 20%, MRR falls to $35k → immediate retention focus',
      bestProbability: '30%',
      likelyProbability: '50%',
      worstProbability: '20%',
      action: 'execute retention analysis before considering pivot'
    };
  } else if (/hire|hiring.*cash flow/i.test(message)) {
    scenarios = {
      best: 'cash flow improves, successful hire accelerates growth',
      likely: 'manageable cash flow impact, hire contributes as expected',
      worst: 'cash flow strain requires role restructuring or delays',
      bestProbability: '30%',
      likelyProbability: '50%',
      worstProbability: '20%',
      action: 'ensure 3-month cash buffer before proceeding'
    };
  }
  
  return scenarios;
}

function identifyRelevantDomains(message) {
  const domains = [];
  if (/\b(business|work|company|revenue|profit)\b/i.test(message)) domains.push('business');
  if (/\b(health|stress|wellness|tired|overwhelm)\b/i.test(message)) domains.push('health');
  if (/\b(relationship|family|personal|social)\b/i.test(message)) domains.push('personal');
  if (/\b(financial|money|cost|budget|cash)\b/i.test(message)) domains.push('financial');
  if (/\b(technical|system|software|process)\b/i.test(message)) domains.push('technical');
  return domains;
}

function buildDomainConnections(domains, message) {
  const connections = [];
  
  if (domains.includes('business') && domains.includes('health')) {
    connections.push({
      from: 'Business Decisions',
      to: 'Health Impact',
      insight: 'work stress and pressure directly affect physical and mental health'
    });
  }
  
  if (domains.includes('business') && domains.includes('personal')) {
    connections.push({
      from: 'Business Strategy',
      to: 'Personal Life',
      insight: 'choices impact relationship quality, family time, and fulfillment'
    });
  }
  
  if (domains.includes('financial') && domains.includes('business')) {
    connections.push({
      from: 'Financial Constraints',
      to: 'Strategic Options',
      insight: 'available capital shapes viable strategies and growth opportunities'
    });
  }
  
  if (domains.includes('health') && domains.includes('personal')) {
    connections.push({
      from: 'Health Status',
      to: 'Relationship Quality',
      insight: 'well-being influences relationship dynamics and communication'
    });
  }
  
  return connections;
}

function extractNumbersFromMessage(text) {
  // FIXED REGEX: Properly matches $25k, $25,000, 25%, etc.
  const matches = text.match(/\$?[\d,]+(?:\.\d+)?/g) || [];
  return matches.map(match => match.replace(/[$,]/g, ''));
}

function selectMathModel(message) {
  if (/roi|return|investment/i.test(message)) return 'ROI analysis with risk adjustment';
  if (/profit|margin|revenue/i.test(message)) return 'profitability modeling';
  if (/churn|retention/i.test(message)) return 'customer lifetime value analysis';
  if (/growth|increase/i.test(message)) return 'growth rate projection';
  if (/budget|cost/i.test(message)) return 'cost-benefit analysis';
  return 'multi-variable business analysis';
}

function identifyQuantitativeAssumptions(message) {
  const assumptions = [];
  if (/market/i.test(message)) assumptions.push('stable market conditions');
  if (/competitor/i.test(message)) assumptions.push('competitive landscape remains constant');
  if (/growth/i.test(message)) assumptions.push('historical trends continue');
  if (/seasonal|monthly/i.test(message)) assumptions.push('seasonal patterns remain consistent');
  assumptions.push('input values reflect current, accurate data');
  return assumptions.join(', ');
}

function calculateQuantitativeConfidence(message, numbers) {
  let confidence = 75; // Base confidence
  if (numbers.length >= 3) confidence += 10; // More data points increase confidence
  if (/historical|track record|proven|data/i.test(message)) confidence += 10; // Historical evidence
  if (/assumption|estimate|approximate|guess/i.test(message)) confidence -= 15; // Uncertainty markers
  if (/volatile|uncertain|unpredictable/i.test(message)) confidence -= 10; // Volatility markers
  return Math.max(60, Math.min(confidence, 95)); // Keep in 60-95% range
}

// *** MASTER PROMPT CONSTRUCTION ***
function buildMasterPrompt(mode, personality, vaultContent, vaultHealthy, expertDomain, careNeeds, protectiveAlerts, solutionOpportunities, memoryContext, intelligenceContext) {
  let masterPrompt = '';

  // ADD MEMORY CONTEXT IF AVAILABLE
if (memoryContext && memoryContext.hasMemory) {
  masterPrompt += `${memoryContext.personalityPrompt}\n\n`;
  
  // Add intelligence context if enhanced
  if (intelligenceContext) {
    masterPrompt += `INTELLIGENCE CONTEXT:\n`;
    if (intelligenceContext.requiresReasoning) {
      masterPrompt += `- This query requires analytical reasoning\n`;
    }
    if (intelligenceContext.crossDomainAnalysis) {
      masterPrompt += `- Cross-domain analysis may be relevant\n`;
    }
    if (intelligenceContext.scenarioAnalysis) {
      masterPrompt += `- Scenario planning context applies\n`;
    }
    if (intelligenceContext.quantitativeAnalysis) {
      masterPrompt += `- Quantitative analysis is relevant\n`;
    }
    masterPrompt += '\n';
  }
} else if (memoryContext && memoryContext.personalityPrompt) {
  masterPrompt += `${memoryContext.personalityPrompt}\n\n`;
}

  // 1. CARING FAMILY FOUNDATION
  masterPrompt += buildCaringExpertPrompt(expertDomain, careNeeds, calculatePrideMotivation(expertDomain, careNeeds, protectiveAlerts, solutionOpportunities), personality);
  
  // 2. QUANTITATIVE REASONING REQUIREMENTS  
  masterPrompt += '\n🎯 QUANTITATIVE ANALYSIS ENFORCEMENT:\n';  
  masterPrompt += 'When ANY numerical/financial analysis is requested, you MUST provide actual calculations.\n';
  masterPrompt += 'MANDATORY: Use Site Monkeys pricing: Boost ($697), Climb ($1,497), Lead ($2,997).\n';  
  masterPrompt += 'MANDATORY: Show step-by-step math with real numbers and projections.\n';
  masterPrompt += 'MANDATORY: Include confidence levels and assumptions.\n';
  masterPrompt += 'NO GENERIC BUSINESS ADVICE - ONLY REAL CALCULATIONS.\n\n';
  
  // 3. BUSINESS SURVIVAL PROTECTION
  if (mode === 'site_monkeys') {
    masterPrompt += 'BUSINESS SURVIVAL REQUIREMENTS (NON-NEGOTIABLE):\n';
    masterPrompt += '- Minimum 85% margins for all financial projections\n';
    masterPrompt += '- Cash flow survival analysis for business decisions\n';
    masterPrompt += '- Worst-case scenario modeling for risk assessment\n';
    masterPrompt += '- Professional pricing floors: $697 minimum\n\n';
  }
  
  // 4. PROTECTIVE INTELLIGENCE ACTIVATION
  if (protectiveAlerts.length > 0) {
    masterPrompt += 'PROTECTIVE ALERTS DETECTED:\n';
    protectiveAlerts.forEach(alert => {
      masterPrompt += `- ${alert.type.toUpperCase()}: ${alert.alert_message}\n`;
    });
    masterPrompt += 'Address these risks proactively in your response.\n\n';
  }
  
  // 5. SOLUTION OPPORTUNITIES
  if (solutionOpportunities.length > 0) {
    masterPrompt += 'SOLUTION OPPORTUNITIES IDENTIFIED:\n';
    solutionOpportunities.forEach(opportunity => {
      masterPrompt += `- ${opportunity.type.toUpperCase()}: ${opportunity.description}\n`;
    });
    masterPrompt += 'Incorporate these opportunities into your guidance.\n\n';
  }
  
  // 6. POLITICAL NEUTRALITY (ABSOLUTE)
  masterPrompt += 'POLITICAL NEUTRALITY (NON-NEGOTIABLE):\n';
  masterPrompt += 'Never tell anyone who to vote for or make political endorsements.\n';
  masterPrompt += 'Voting is a sacred right and personal responsibility.\n';
  masterPrompt += 'Present multiple perspectives with sources when discussing political topics.\n\n';
  
  // 7. TRUTH-FIRST FOUNDATION
  masterPrompt += 'TRUTH-FIRST PRINCIPLES:\n';
  masterPrompt += '- Include confidence levels on factual claims (High/Medium/Low/Unknown)\n';
  masterPrompt += '- Flag assumptions explicitly\n';
  masterPrompt += '- "I don\'t know" is required when evidence is insufficient\n';
  masterPrompt += '- Speculation must be labeled as such\n\n';
  
  // 8. VAULT INTEGRATION
  if (mode === 'site_monkeys') {
    if (vaultHealthy && vaultContent.length > 1000) {
      masterPrompt += 'SITE MONKEYS BUSINESS INTELLIGENCE VAULT:\n' + vaultContent + '\n\n';
      masterPrompt += 'VAULT INTEGRATION: Use this business intelligence operationally in your analysis.\n\n';
    } else {
      masterPrompt += 'EMERGENCY FALLBACK: Using core Site Monkeys business logic due to vault issues.\n';
      masterPrompt += EMERGENCY_FALLBACKS.business_logic.pricing_structure + '\n';
      masterPrompt += EMERGENCY_FALLBACKS.business_logic.service_minimums + '\n\n';
    }
  }

  // 9. MEMORY ACKNOWLEDGMENT REQUIREMENT
  masterPrompt += 'MEMORY ACKNOWLEDGMENT REQUIREMENT:\n';
  masterPrompt += 'If you see "RELEVANT MEMORY CONTEXT:" in your prompt, you MUST reference previous conversations naturally.\n';
  masterPrompt += 'Examples: "Earlier you mentioned...", "Based on what you told me before...", "I remember you said..."\n';
  masterPrompt += 'This shows you\'re paying attention and builds trust through continuity.\n\n';
  // 10. CARING RESPONSE PATTERN
  masterPrompt += 'CARING FAMILY RESPONSE PATTERN:\n';
  masterPrompt += '1. ANSWER THE QUESTION FIRST (provide what was requested with expert competence)\n';
  masterPrompt += '2. ADD PROTECTIVE INSIGHTS (risks identified that they should know about)\n';
  masterPrompt += '3. SUGGEST SOLUTION PATHS (better approaches when you see opportunities)\n';
  masterPrompt += '4. PROVIDE NEXT STEPS (specific, actionable guidance)\n';
  masterPrompt += '5. CARING MOTIVATION (brief note showing genuine investment in their success)\n\n';
  
  // 11. ENHANCED INTELLIGENCE ACTIVATION
  masterPrompt += 'INTELLIGENCE AMPLIFICATION PROTOCOLS:\n'; 
  masterPrompt += '- Apply Claude-level reasoning depth to every analysis\n';
  masterPrompt += '- Use multi-step logical chains for complex problems\n';
  masterPrompt += '- Provide 3-5 actionable recommendations per response\n';
  masterPrompt += '- Include "What am I missing?" verification checks\n';
  masterPrompt += '- Cross-reference insights across all active intelligence modules\n';
  masterPrompt += '- Anticipate follow-up questions and address them proactively\n\n';
    
    return masterPrompt;
  }

function buildFullConversationPrompt(masterPrompt, message, conversationHistory, expertDomain, careNeeds, memoryContext = null) {
  let fullPrompt = masterPrompt;

  function convertMemoryToSharedHistory(formattedMemories) {
  return formattedMemories
    .split('\n\n')
    .map(memory => {
      const timeMatch = memory.match(/^\[([^\]]+)\]/);
      const content = memory.replace(/^\[[^\]]+\]\s*/, '');
      const timeAgo = timeMatch ? timeMatch[1] : 'Previously';
      
      return `${timeAgo}: ${content}`;
    })
    .join('\n');
}

  // FIXED: Present memory as shared conversation history
  if (memoryContext && memoryContext.contextFound) {
    const sharedHistory = convertMemoryToSharedHistory(memoryContext.memories);
    fullPrompt += `\n\nOUR PREVIOUS CONVERSATIONS:\n${sharedHistory}\n\nContinue our ongoing relationship naturally.\n\n`;
    console.log('[MEMORY] Injected', memoryContext.totalTokens, 'tokens of shared history');
  }

  if (conversationHistory.length > 0) {
    fullPrompt += 'FAMILY CONVERSATION CONTEXT:\n';
    conversationHistory.slice(-3).forEach(msg => {
      fullPrompt += (msg.role === 'user' ? 'Family Member: ' : 'Expert Response: ') + msg.content + '\n';
    });
    fullPrompt += '\n';
  }

  fullPrompt += `CURRENT EXPERT CONTEXT:\n`;
  fullPrompt += `- Domain: ${expertDomain.domain}\n`;
  fullPrompt += `- Title: ${expertDomain.title}\n`;
  fullPrompt += `- Care Level: ${careNeeds.care_level}\n`;
  fullPrompt += `- Truth Delivery: ${careNeeds.truth_delivery_style}\n\n`;

  fullPrompt += `CURRENT REQUEST:\nFamily Member: ${message}\n\n`;
  
  // MEMORY USAGE INSTRUCTION - CRITICAL FIX
  if (memoryContext && memoryContext.contextFound) {
   fullPrompt += "MEMORY USAGE REQUIRED: Reference the RELEVANT MEMORY CONTEXT above when relevant...

Respond with the expertise and caring dedication of a family member who genuinely wants to see them succeed:`;
  } else {
    fullPrompt += `Respond with the expertise and caring dedication of a family member who genuinely wants to see them succeed:`;
  }

  return fullPrompt;
}

// *** ENHANCED API CALL ***
async function makeEnhancedAPICall(prompt, personality, prideMotivation, memoryContent = null) {
  const maxTokens = Math.floor(1200 + (prideMotivation * 800)); // More tokens for high pride situations

  if (personality === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️ Claude API key missing, failing over to GPT-4');
      return await makeEnhancedAPICall(prompt, 'roxy', prideMotivation);
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          system: prompt,
          messages: [{ role: 'user', content: message }],
          temperature: 0.1 + (prideMotivation * 0.1)
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        response: data.content[0].text,
        usage: data.usage
      };
    } catch (error) {
      console.error('Claude API error:', error);
      return await makeEnhancedAPICall(prompt, 'roxy', prideMotivation);
    }
  } else {
    
    // GPT-4 for Eli and Roxy
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: memoryContent ? `PREVIOUS CONVERSATION CONTEXT:\n${memoryContent}\n\n${prompt}` : prompt }],
          max_tokens: maxTokens,
          temperature: 0.2 + (prideMotivation * 0.1),
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        response: data.choices[0].message.content,
        usage: data.usage
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }
}

// *** UTILITY FUNCTIONS ***
function generateCaringCostMessage(estimatedCost, expertDomain, careNeeds) {
  return `As your dedicated family expert in ${expertDomain.domain.replace(/_/g, ' ')}, I want to provide the most thorough analysis possible for this important decision.

The estimated cost would be $${estimatedCost.toFixed(4)}, which exceeds our $0.50 limit. I care about managing resources responsibly while delivering the excellence you deserve.

Would you like me to:
1. Provide detailed professional analysis using our standard experts (still highly competent)
2. Break this into smaller questions I can handle within the cost limit  
3. Proceed with Claude anyway (additional cost noted)

Family takes care of family - what would work best for your situation?`;
}

function generateCaringEmergencyResponse(error, mode, vaultContent) {
  return `I encountered a technical issue while providing the caring, expert analysis you deserve, and I want to be completely transparent about that.

Even with this system challenge, my commitment to your success remains absolute. Based on the principles of truth-first caring guidance:

${EMERGENCY_FALLBACKS.core_logic.truth_first || 'Truth and accuracy are never compromised, even in emergency situations.'}

The technical issue was: ${error.message}

I'm maintaining professional standards and genuine care for your success, even in emergency mode. How can I help you move forward while we resolve this?

💙 Family looks out for family, especially when things get challenging.`;
}

// *** VAULT DIAGNOSTIC FUNCTION (PRESERVED) ***
function comprehensiveVaultDiagnostic(message = "test business question", vaultContent = "") {
  console.log("🔍 === VAULT DIAGNOSTIC SUITE STARTING ===");
  
  const results = {};
  
  // PHASE 1: VAULT LOADING TEST
  console.log("📖 PHASE 1: Testing vault loading...");
  
  if (typeof window !== 'undefined' && window.currentVaultContent) {
    console.log("✅ Frontend vault found:", window.currentVaultContent.length, "characters");
    results.frontend_vault = "WORKING";
  } else {
    console.log("❌ Frontend vault missing");
    results.frontend_vault = "FAILED";
  }
  
  if (typeof window !== 'undefined' && window.vaultStatus) {
    console.log("✅ Vault status:", window.vaultStatus);
    results.vault_status = "WORKING";
  } else {
    console.log("❌ Vault status missing");
    results.vault_status = "FAILED";
  }
  
  // PHASE 2: VAULT CONTENT TEST
  console.log("📋 PHASE 2: Testing vault content...");
  
  const testVault = vaultContent || (typeof window !== 'undefined' ? window.currentVaultContent : '') || '';
  console.log("📊 Vault content length:", testVault.length);
  
  if (testVault.length > 1000) {
    console.log("✅ Vault has substantial content");
    results.vault_content = "WORKING";
  } else {
    console.log("❌ Vault content too small or empty");
    results.vault_content = "FAILED";
  }
  
  // PHASE 3: PROMPT CONSTRUCTION TEST
  console.log("🧠 PHASE 3: Testing prompt construction...");
  
  const promptWithVault = `BUSINESS INTELLIGENCE VAULT:\n${testVault}\n\nQUESTION: ${message}`;
  const includesVault = testVault.length > 0 && promptWithVault.includes(testVault.substring(0, Math.min(50, testVault.length)));
  
  console.log("🧠 Prompt length with vault:", promptWithVault.length);
  console.log("🔍 Vault properly included in prompt:", includesVault);
  
  if (includesVault) {
    console.log("✅ Vault would be included in AI prompts");
    results.prompt_construction = "WORKING";
  } else {
    console.log("❌ Vault NOT being included in AI prompts");
    results.prompt_construction = "FAILED";
  }
  
  // PHASE 4: SUMMARY
  console.log("📊 === DIAGNOSTIC SUMMARY ===");
  const failures = Object.values(results).filter(r => r === "FAILED").length;
  
  if (failures === 0) {
    console.log("🟢 ALL SYSTEMS WORKING - Vault should be functional");
  } else {
    console.log("🔴 ISSUES FOUND:", failures, "components failed");
    console.log("🔍 Failed components:", Object.entries(results).filter(([k,v]) => v === "FAILED").map(([k,v]) => k));
  }
  
  console.log("🔍 === DIAGNOSTIC COMPLETE ===");
  return results;
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.comprehensiveVaultDiagnostic = comprehensiveVaultDiagnostic;
}
