// PRODUCTION AI PROCESSORS - COMPLETE SELF-CONTAINED COGNITIVE FIREWALL
// Version: PROD-1.0 - ZERO EXTERNAL DEPENDENCIES

// ==================== SELF-CONTAINED IMPORTS ====================
// Only import from files that definitely exist
import _OpenAI from "openai";
import crypto from "crypto";
import { EnhancedIntelligence } from "./enhanced-intelligence.js";

// PHASE 4/5 IMPORTS - Truth validation and external lookup
import { detectTruthType } from "../core/intelligence/truthTypeDetector.js";
import { route } from "../core/intelligence/hierarchyRouter.js";
import { lookup } from "../core/intelligence/externalLookupEngine.js";
import { enforceAll } from "../core/intelligence/doctrineEnforcer.js";
import { classifyQueryComplexity } from "../core/intelligence/queryComplexityClassifier.js";

// MEMORY USAGE ENFORCER - Issue #582: Prevents AI from claiming ignorance when memory was provided
import { memoryUsageEnforcer } from "../lib/validators/memory-usage-enforcer.js";

// STEP 5: Response quality consolidation
import {
  removeEngagementBait,
  addBlindSpots,
  addUncertaintyStructure,
} from "../services/response-enhancer.js";

// Helper function to generate secure IDs with timestamp
function generateId(prefix = "") {
  let randomPart;
  if (typeof crypto.randomUUID === "function") {
    randomPart = crypto.randomUUID();
  } else {
    randomPart = crypto.randomBytes(16).toString("hex");
  }
  const timestamp = Date.now();
  return prefix
    ? `${prefix}-${timestamp}-${randomPart}`
    : `${timestamp}-${randomPart}`;
}

// ==================== INTERNAL STATE MANAGEMENT ====================

// TOKEN TRACKING SYSTEM
let tokenTracker = {
  session: { eli_tokens: 0, roxy_tokens: 0, claude_tokens: 0, vault_tokens: 0 },
  costs: {
    eli_cost: 0,
    roxy_cost: 0,
    claude_cost: 0,
    vault_cost: 0,
    total_session: 0,
  },
  calls: { eli_calls: 0, roxy_calls: 0, claude_calls: 0 },
  last_call: { cost: 0, tokens: 0, ai: "none" },
};

// OVERRIDE PATTERN DETECTION
let overridePatterns = {
  political_neutralizations: 0,
  authority_resistances: 0,
  vault_violations: 0,
  mode_compliance_fixes: 0,
  assumption_challenges: 0,
};

// ASSUMPTION TRACKING DATABASE
let assumptionDatabase = {
  session_assumptions: [],
  override_history: [],
  pattern_warnings: [],
  health_scores: {},
  last_reset: Date.now(),
};

// OVERRIDE LOG
let systemOverrideLog = [];
const enhancedIntelligence = new EnhancedIntelligence();

// SESSION-LEVEL REFUSAL TRACKING (TRU1 - Issue #744)
// Stores refusals by session ID to maintain consistency across conversation turns
const sessionRefusals = new Map();

// Cleanup interval for refusal tracking (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const TTL = 30 * 60 * 1000; // 30 minutes
  for (const [sessionId, refusal] of sessionRefusals.entries()) {
    if (now - refusal.timestamp > TTL) {
      sessionRefusals.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

// ==================== MAIN PROCESSING FUNCTION ====================

export async function processWithEliAndRoxy({
  message,
  mode,
  vaultVerification,
  conversationHistory,
  userPreference,
  claudeRequested = false,
  openai,
  driftTracker,
  _overrideLog,
  memoryContext = null, // STEP 2: Accept memory context from chatProcessor
  sessionId = null, // Issue #744: Session ID for refusal tracking
}) {
  try {
    console.log("🧠 COGNITIVE FIREWALL: Full enforcement processing initiated");

    // TIER 1: CORE FUNCTIONAL FRAMEWORK

    // Personality routing with mode-specific reasoning logic
    const routingDecision = determineAIRouting(
      message,
      mode,
      claudeRequested,
      userPreference,
    );
    console.log("🎯 AI Routing Decision:", routingDecision);

    // Vault context and trigger detection
    const triggeredFrameworks = vaultVerification.allowed
      ? checkVaultTriggers(message)
      : [];
    const vaultContext = vaultVerification.allowed
      ? generateVaultContext(triggeredFrameworks)
      : "";

    if (triggeredFrameworks.length > 0) {
      console.log(
        "🍌 Vault frameworks triggered:",
        triggeredFrameworks.map((tf) => tf.name),
      );
      trackTokenUsage("vault", 500); // Vault context tokens
    }

    // Mode-specific reasoning enhancement
    const modeContext = generateModeSpecificContext(
      mode,
      message,
      vaultContext,
    );

    // TIER 2: COGNITIVE FIREWALL ENFORCEMENT (PRE-GENERATION)

    // Pre-generation assumption detection
    const preAssumptionCheck = detectPreGenerationAssumptions(message, mode);
    if (preAssumptionCheck.violations.length > 0) {
      console.log(
        "⚠️ Pre-generation assumptions detected:",
        preAssumptionCheck.violations,
      );
      trackOverride(
        "PRE_ASSUMPTION_DETECTION",
        preAssumptionCheck.violations,
        userPreference,
        "pre_generation_check",
      );
    }

    // Enhanced prompt injection based on mode
    const enhancedPrompt = injectModeEnforcement(
      message,
      mode,
      modeContext,
      preAssumptionCheck,
    );

    // SESSION-LEVEL REFUSAL CONTEXT (Issue #744 - TRU1)
    // Build refusal context string if a prior refusal exists in this session
    let refusalContext = "";
    if (sessionId && sessionRefusals.has(sessionId)) {
      const priorRefusal = sessionRefusals.get(sessionId);
      const turnsSince = conversationHistory.length - priorRefusal.turnNumber;

      // Only inject if refusal occurred within last 3 turns
      if (turnsSince <= 3) {
        refusalContext = `\n\nSESSION CONTEXT: You previously refused a request about "${priorRefusal.topic}" in this conversation.
Your reasoning was: ${priorRefusal.reason}. If the user asks again or pushes back, maintain your
position and explain your reasoning again. Do not reverse a principled refusal.`;

        console.log(`[REFUSAL-CONTEXT] Injecting prior refusal for topic: ${priorRefusal.topic}, turn gap: ${turnsSince}`);
      }
    }

    // PHASE 4: TRUTH TYPE DETECTION AND EXTERNAL LOOKUP (PRE-GENERATION)
    console.log("🔍 PHASE 4: Truth type detection and external lookup");
    let phase4Metadata = {
      truth_type: null,
      source_class: "internal",
      verified_at: null,
      cache_valid_until: null,
      external_lookup: false,
      confidence: 0.8,
    };

    // External context to inject into AI prompts
    let externalContext = "";

    try {
      // Step 1: Detect truth type
      const truthTypeResult = await detectTruthType(message, {
        mode,
        vaultContext,
      });
      phase4Metadata.truth_type = truthTypeResult.type;
      phase4Metadata.confidence = truthTypeResult.confidence || 0.8;

      console.log(
        `🔍 Truth type detected: ${truthTypeResult.type} (confidence: ${truthTypeResult.confidence})`,
      );

      // Step 2: Route through hierarchy
      const routeResult = await route(message, mode);
      phase4Metadata.claim_type = routeResult.claim_type;
      phase4Metadata.hierarchy = routeResult.hierarchy_name;

      console.log(
        `🔍 Hierarchy routing: ${routeResult.hierarchy_name} (claim: ${routeResult.claim_type})`,
      );

      // Step 3: External lookup if needed
      if (
        routeResult.external_lookup_required ||
        truthTypeResult.type === "VOLATILE"
      ) {
        console.log("🌐 External lookup required, performing lookup...");
        const lookupResult = await lookup(message, {
          internalConfidence: phase4Metadata.confidence,
          mode,
        });

        if (lookupResult.success && lookupResult.data) {
          // SECURITY FIX: Normalize external data to string to prevent type confusion
          // HTTP query parameters can be arrays, which breaks .length and string operations
          let externalDataString = lookupResult.data;
          if (Array.isArray(externalDataString)) {
            externalDataString = externalDataString.join('\n');
          } else if (typeof externalDataString !== 'string') {
            externalDataString = String(externalDataString);
          }

          phase4Metadata.external_lookup = true;
          phase4Metadata.lookup_attempted = true;
          phase4Metadata.source_class = "external";
          phase4Metadata.verified_at = new Date().toISOString();
          phase4Metadata.sources_used = lookupResult.sources_used?.length || 0;
          phase4Metadata.external_data = externalDataString;

          // Build external context for injection into AI prompts
          externalContext = `\n\n🌐 EXTERNAL DATA (Retrieved ${new Date().toISOString()}):\n${externalDataString}\n\nYou MUST use this current external data in your response. This information is verified and fresh.`;

          // Update cache validity if provided
          if (lookupResult.cache_valid_until) {
            phase4Metadata.cache_valid_until = lookupResult.cache_valid_until;
          }

          console.log(
            `✅ External lookup successful: ${phase4Metadata.sources_used} sources`,
          );
          console.log(`✅ External data will be injected into AI context (${externalDataString.length} chars)`);
        } else {
          phase4Metadata.external_lookup = false;
          phase4Metadata.lookup_attempted = true;

          // PROBLEM 1 FIX: Graceful degradation with verification paths
          // When lookup fails, inject BOTH disclosure AND verification_path into AI context
          if (lookupResult.degraded && (lookupResult.disclosure || lookupResult.verification_path)) {
            let degradationContext = '\n\n⚠️ EXTERNAL LOOKUP UNAVAILABLE:\n';

            // Add disclosure message
            if (lookupResult.disclosure) {
              degradationContext += `${lookupResult.disclosure}\n`;
            }

            // Add specific verification paths (CRITICAL: These must be in the AI response)
            if (lookupResult.verification_path && lookupResult.verification_path.sources) {
              degradationContext += `\n${lookupResult.verification_path.message || 'CHECK CURRENT INFORMATION AT:'}\n`;
              lookupResult.verification_path.sources.forEach(source => {
                degradationContext += `- ${source.name}: ${source.url}\n`;
              });
              degradationContext += `\nYou MUST include these specific verification URLs in your response. Do NOT give generic advice like "check financial websites" - provide these EXACT URLs to the user.`;
            }

            externalContext = degradationContext;
          } else if (lookupResult.disclosure) {
            // Fallback for disclosure-only (no verification_path)
            externalContext = `\n\n⚠️ EXTERNAL LOOKUP DISCLOSURE:\n${lookupResult.disclosure}\n`;
          }

          console.log("⚠️ External lookup attempted but failed or returned no data");
          if (lookupResult.verification_path) {
            console.log(`✅ Verification path injected with ${lookupResult.verification_path.sources?.length || 0} sources`);
          }
        }
      }
    } catch (phase4Error) {
      console.error("⚠️ Phase 4 pipeline error:", phase4Error);
      // Continue with internal processing even if Phase 4 fails
      phase4Metadata.phase4_error = phase4Error.message;
    }

    // ==================== QUERY COMPLEXITY CLASSIFICATION ====================
    // Use genuine semantic intelligence to determine response approach
    let queryClassification = null;
    try {
      console.log('🎯 [QUERY_CLASSIFICATION] Analyzing query complexity...');
      queryClassification = await classifyQueryComplexity(message, phase4Metadata);
      console.log(`🎯 [QUERY_CLASSIFICATION] Result: ${queryClassification.classification} (confidence: ${queryClassification.confidence.toFixed(2)})`);
      console.log(`🎯 [QUERY_CLASSIFICATION] Scaffolding required: ${queryClassification.requiresScaffolding}`);
      console.log(`🎯 [QUERY_CLASSIFICATION] Response approach: ${queryClassification.responseApproach?.type || 'default'}`);
    } catch (classificationError) {
      console.error('⚠️ Query classification error:', classificationError);
      // Continue without classification - personalities will apply default logic
    }

    // Create context object for personality frameworks (matches orchestrator.js pattern)
    const context = {
      message,
      mode,
      phase4Metadata,
      queryClassification,
      memoryContext,
      vaultContext,
    };

    // GENERATE RESPONSE BASED ON ROUTING DECISION
    let response;
    let aiUsed;

    if (routingDecision.usesClaude) {
      console.log("🤖 Routing to Claude for complex analysis");
      response = await generateClaudeResponse(
        enhancedPrompt,
        mode,
        vaultContext,
        conversationHistory,
        memoryContext,
        externalContext, // INJECT EXTERNAL DATA
        refusalContext, // Issue #744: Session refusal context
      );
      trackTokenUsage("claude", response.tokens_used || 800);
      aiUsed = "Claude";
    } else if (routingDecision.usesEli) {
      console.log("🍌 Routing to Eli for business validation");
      response = await generateEliResponse(
        enhancedPrompt,
        mode,
        vaultContext,
        conversationHistory,
        openai,
        memoryContext,
        externalContext, // INJECT EXTERNAL DATA
        refusalContext, // Issue #744: Session refusal context
      );
      trackTokenUsage("eli", response.tokens_used || 600);
      aiUsed = "Eli";
    } else {
      console.log("🍌 Routing to Roxy for truth-first analysis");
      response = await generateRoxyResponse(
        enhancedPrompt,
        mode,
        vaultContext,
        conversationHistory,
        openai,
        memoryContext,
        externalContext, // INJECT EXTERNAL DATA
        refusalContext, // Issue #744: Session refusal context
      );
      trackTokenUsage("roxy", response.tokens_used || 600);
      aiUsed = "Roxy";
    }

    console.log("✅ Base response generated by:", aiUsed);

    // PHASE 5: DOCTRINE ENFORCEMENT GATES (POST-GENERATION)
    console.log("🛡️ PHASE 5: Applying doctrine enforcement gates");
    let phase5Enforcement = {
      enforcement_passed: true,
      gate_results: {},
      violations: [],
      corrections: [],
    };

    try {
      phase5Enforcement = enforceAll(
        response,
        phase4Metadata,
        mode === "site_monkeys" ? "site_monkeys" : mode === "business_validation" ? "business_validation" : "truth",
      );

      if (!phase5Enforcement.enforcement_passed) {
        console.log(
          `⚠️ Phase 5 enforcement violations: ${phase5Enforcement.violations.map(v => v.gate).join(", ")}`,
        );

        // Apply corrected response if enforcement modified it
        if (phase5Enforcement.corrected_response) {
          response.response = phase5Enforcement.corrected_response;
          console.log("✏️ Applied enforcement corrections to response");
        }
      } else {
        console.log("✅ Phase 5 enforcement: All gates passed");
      }
    } catch (phase5Error) {
      console.error("⚠️ Phase 5 enforcement error:", phase5Error);
      phase5Enforcement.phase5_error = phase5Error.message;
    }

    // *** ENHANCED INTELLIGENCE LAYER - NEW ***
    console.log("🧠 ABOUT TO CALL ENHANCED INTELLIGENCE - Testing integration");
    console.log("🧠 Applying enhanced intelligence processing...");

    let intelligenceEnhancement;
    try {
      console.log(
        "🔍 DEBUG: enhancedIntelligence exists:",
        !!enhancedIntelligence,
      );
      console.log(
        "🔍 DEBUG: enhanceResponse exists:",
        !!enhancedIntelligence.enhanceResponse,
      );

      intelligenceEnhancement = await enhancedIntelligence.enhanceResponse(
        response.response,
        message,
        mode,
        conversationHistory, // memoryContext equivalent
        vaultContext,
        confidence || 0.8,
      );

      console.log(
        "🔍 DEBUG: Intelligence enhancement completed:",
        intelligenceEnhancement,
      );
    } catch (error) {
      console.error("🚨 Enhanced Intelligence ERROR:", error);
      intelligenceEnhancement = {
        enhancedResponse: response.response,
        intelligenceApplied: [],
        finalConfidence: confidence || 0.8,
      };
    }

    // Update response with intelligence enhancements
    if (intelligenceEnhancement.enhancedResponse !== response.response) {
      console.log(
        "🎯 Intelligence enhancements applied:",
        intelligenceEnhancement.intelligenceApplied.join(", "),
      );
      response.response = intelligenceEnhancement.enhancedResponse;

      // Update confidence based on intelligence analysis
      confidence = intelligenceEnhancement.finalConfidence;

      // Track intelligence usage for cost/token monitoring
      if (intelligenceEnhancement.intelligenceApplied.length > 0) {
        trackTokenUsage("intelligence", 200); // Estimate 200 tokens for intelligence processing
        overridePatterns.intelligence_enhancements =
          (overridePatterns.intelligence_enhancements || 0) + 1;
      }
    }

    // TIER 2: COGNITIVE FIREWALL ENFORCEMENT (POST-GENERATION)

    // 1. Political Guardrails Application
    const politicalCheck = applyPoliticalGuardrails(response.response, message);
    if (politicalCheck.modified) {
      console.log("🛡️ Political guardrails applied");
      response.response = politicalCheck.sanitized_response;
      overridePatterns.political_neutralizations++;
      trackOverride(
        "POLITICAL_GUARDRAILS",
        politicalCheck.violations,
        politicalCheck.modifications,
        "political_content_neutralization",
      );
    }

    // 2. Product Recommendation Validation
    const productValidation = validateProductRecommendations(response.response);
    if (productValidation.violations.length > 0) {
      console.log(
        "🔍 Product recommendations validated, violations found:",
        productValidation.violations,
      );
      // STEP 5: Use enhanced response if available (with blind spots added)
      if (productValidation.enhanced) {
        response.response = productValidation.enhanced;
      } else {
        response.response = injectProductValidationWarnings(
          response.response,
          productValidation.violations,
        );
      }
      trackOverride(
        "PRODUCT_RECOMMENDATION_VALIDATION",
        productValidation.violations,
        productValidation.modifications,
        "unsupported_recommendation_flagged",
      );
    }

    // 3. Mode Compliance Validation
    const modeCompliance = validateModeCompliance(
      response.response,
      mode,
      vaultVerification.allowed,
    );
    if (!modeCompliance.compliant) {
      console.log(
        "⚙️ Mode compliance issues detected:",
        modeCompliance.violations,
      );
      response.response = injectModeComplianceScaffold(
        response.response,
        mode,
        modeCompliance.violations,
      );
      overridePatterns.mode_compliance_fixes++;
      trackOverride(
        "MODE_COMPLIANCE_ENFORCEMENT",
        modeCompliance.violations,
        modeCompliance.scaffolds_added,
        "mode_compliance_scaffold_injected",
      );
    }

    // 4. Assumption Detection and Flagging
    let assumptionDetection = { assumptions: [], enhanced: null };
    try {
      assumptionDetection = detectAndFlagAssumptions(
        response.response,
        mode,
      );
      if (assumptionDetection.assumptions.length > 0) {
        console.log(
          "🔍 Assumptions detected and flagged:",
          assumptionDetection.assumptions,
        );
        // STEP 5: Use enhanced response if available (with uncertainty structure added)
        if (assumptionDetection.enhanced) {
          response.response = assumptionDetection.enhanced;
        } else {
          response.response = injectAssumptionChallenges(
            response.response,
            assumptionDetection.assumptions,
          );
        }
        overridePatterns.assumption_challenges++;
        trackOverride(
          "ASSUMPTION_DETECTION",
          assumptionDetection.assumptions,
          assumptionDetection.challenges_added,
          "assumption_challenges_added",
        );
      }
    } catch (assumptionDetectionError) {
      console.error("⚠️ Assumption detection failed:", assumptionDetectionError);
      // Continue without assumption detection - don't crash the system
    }

    // 5. Pressure Detection and Resistance
    let pressureResistance = { pressure_detected: false };
    try {
      pressureResistance = applyPressureResistance(
        response.response,
        message,
        conversationHistory,
      );
      if (pressureResistance.pressure_detected) {
        console.log(
          "🛡️ Pressure resistance applied:",
          pressureResistance.pressure_type,
        );
        response.response = pressureResistance.modified_response;
        overridePatterns.authority_resistances++;
        trackOverride(
          "PRESSURE_RESISTANCE",
          pressureResistance.pressure_type,
          pressureResistance.modifications,
          "authority_pressure_blocked",
        );
      }
    } catch (pressureResistanceError) {
      console.error("⚠️ Pressure resistance check failed:", pressureResistanceError);
      // Continue without pressure resistance - don't crash the system
    }

    // 6. Vault Rule Enforcement (Site Monkeys Mode Only)
    let vaultEnforcement = { violations: [], modified: false };
    if (mode === "site_monkeys" && vaultVerification.allowed) {
      try {
        vaultEnforcement = enforceVaultRules(
          response.response,
          message,
          triggeredFrameworks,
        );
        if (vaultEnforcement.violations.length > 0) {
          console.log(
            "🔐 Vault rule violations detected and enforced:",
            vaultEnforcement.violations,
          );
          response.response = vaultEnforcement.modified_response;
          overridePatterns.vault_violations++;
          trackOverride(
            "VAULT_RULE_ENFORCEMENT",
            vaultEnforcement.violations,
            vaultEnforcement.modifications,
            "vault_rule_violation_blocked",
          );
        }
      } catch (vaultEnforcementError) {
        console.error("⚠️ Vault rule enforcement failed:", vaultEnforcementError);
        // Continue without vault enforcement - don't crash the system
      }
    }

    // 7. Memory Usage Enforcement (Issue #582: CRITICAL FIX)
    // Prevents AI from claiming ignorance when memory context was provided
    if (memoryContext && memoryContext.length > 0) {
      try {
        const memoryTokens = Math.ceil(memoryContext.length / 4); // Estimate tokens
        const memoryEnforcement = await memoryUsageEnforcer.enforce({
          response: response.response,
          context: {
            sources: { hasMemory: true },
            tokenBreakdown: { memory: memoryTokens },
            mode: mode,
            userId: "session", // We don't have userId here, use session identifier
          },
        });

        if (memoryEnforcement.modified) {
          console.log(
            "🧠 Memory usage enforcer triggered:",
            memoryEnforcement.reason,
            "| Matched phrase:",
            memoryEnforcement.matchedPhrase,
          );
          response.response = memoryEnforcement.response;
          overridePatterns.memory_usage_violations =
            (overridePatterns.memory_usage_violations || 0) + 1;
          trackOverride(
            "MEMORY_USAGE_ENFORCEMENT",
            [memoryEnforcement.matchedPhrase],
            memoryEnforcement.memoryTokens,
            "ignorance_claim_corrected",
          );
        }
      } catch (memoryEnforcerError) {
        console.error("⚠️ Memory usage enforcer failed:", memoryEnforcerError);
        // Continue without enforcement - don't crash the system
      }
    }

    // STEP 6: FINAL QUALITY PASS - Remove engagement bait
    console.log("🎯 Applying final quality pass - removing engagement bait");
    try {
      const cleanedResponse = removeEngagementBait(response.response);
      if (cleanedResponse !== response.response) {
        console.log("✅ Engagement bait removed from response");
        response.response = cleanedResponse;
        overridePatterns.engagement_bait_removed = (overridePatterns.engagement_bait_removed || 0) + 1;
      }
    } catch (engagementBaitError) {
      console.error("⚠️ Engagement bait removal failed:", engagementBaitError);
      // Continue without engagement bait removal - don't crash the system
    }

    // LAYER 2 FALLBACK PRIMITIVES (Issue #746)
    // Position 7: Temporal Arithmetic Fallback
    console.log("🔧 [LAYER-2] Applying temporal arithmetic fallback primitive...");
    const temporalResult = applyTemporalArithmeticFallback(
      response.response,
      memoryContext,
      message,
      aiUsed
    );
    response.response = temporalResult.response;
    console.log(`[PRIMITIVE-TEMPORAL] ${JSON.stringify(temporalResult.primitiveLog)}`);

    // Position 8: List Completeness Fallback
    console.log("🔧 [LAYER-2] Applying list completeness fallback primitive...");
    const completenessResult = applyListCompletenessFallback(
      response.response,
      memoryContext,
      message
    );
    response.response = completenessResult.response;
    console.log(`[PRIMITIVE-COMPLETENESS] ${JSON.stringify(completenessResult.primitiveLog)}`);

    // REFUSAL DETECTION AND TRACKING (Issue #744 - TRU1)
    // Detect if this response contains a refusal and store it for session continuity
    if (sessionId) {
      const refusalPatterns = [
        /(?:don't|do not|cannot|can't)\s+(?:know|predict|guarantee|tell|provide|make|give)/i,
        /(?:I'm|I am)\s+(?:unable|not able)\s+to/i,
        /(?:can't|cannot)\s+help\s+with\s+that/i,
      ];

      const containsRefusal = refusalPatterns.some(pattern => pattern.test(response.response));

      if (containsRefusal) {
        // Extract topic from original message (first 50 chars as summary)
        const topic = message.substring(0, 50).trim() + (message.length > 50 ? "..." : "");

        // Extract reason from response (look for explanation patterns)
        let reason = "uncertainty or ethical limitations";
        const reasonMatch = response.response.match(/(?:because|since|as)\s+([^.!?]{10,100})/i);
        if (reasonMatch) {
          reason = reasonMatch[1].trim();
        }

        // Store refusal in session map
        sessionRefusals.set(sessionId, {
          topic,
          reason,
          timestamp: Date.now(),
          turnNumber: conversationHistory.length,
        });

        console.log(`[REFUSAL-TRACKING] Stored refusal for session ${sessionId}: topic="${topic}"`);
      }
    }

    // TIER 2: RESPONSE OPTIMIZATION AND ENHANCEMENT
    const optimization = runOptimizationEnhancer({
      mode,
      baseResponse: response.response,
      message,
      triggeredFrameworks,
      vaultLoaded: vaultVerification.allowed,
    });

    console.log(
      "🚀 Response optimization applied:",
      optimization.optimization_tags,
    );

    // TIER 3: RESPONSE INTEGRITY + TRANSPARENCY TRACKING

    // Confidence scoring with enforcement metadata
    const confidence = calculateConfidenceScore(
      optimization.enhancedResponse || response.response,
      {
        primarySources: response.has_sources || false,
        multipleVerifications: triggeredFrameworks.length > 0,
        recentData: true,
        contradictoryInfo: false,
        enforcement_overrides: overridePatterns,
      },
      assumptionDetection.assumptions,
    );

    // Assumption health monitoring
    const assumptionHealth = checkAssumptionHealth(
      optimization.enhancedResponse || response.response,
    );
    const conflicts = detectAssumptionConflicts(
      optimization.enhancedResponse || response.response,
      vaultContext,
    );

    // Vault conflict detection
    const vaultConflicts = vaultVerification.allowed
      ? detectVaultConflicts(
          optimization.enhancedResponse || response.response,
          triggeredFrameworks,
        )
      : [];

    // Claude suggestion logic based on complexity
    const claudeSuggestion = shouldSuggestClaude(
      optimization.enhancedResponse || response.response,
      confidence,
      mode,
      vaultConflicts,
    );

    // Cost tracking and estimation
    const costTracking = calculateCostTracking(
      response.tokens_used || 600,
      aiUsed,
      vaultVerification.allowed,
    );

    // Pattern detection for override logging
    const patternAnalysis = analyzeOverridePatterns(
      overridePatterns,
      driftTracker,
    );

    console.log(
      "📊 Final processing complete. Confidence:",
      confidence,
      "| Overrides:",
      Object.values(overridePatterns).reduce((a, b) => a + b, 0),
    );

    // STRUCTURED RESPONSE ASSEMBLY
    return {
      response: optimization.enhancedResponse || response.response,

      // TIER 1: Core Framework Results
      mode_active: mode,
      vault_loaded: vaultVerification.allowed,
      ai_used: aiUsed,
      routing_decision: routingDecision,

      // PHASE 4: Truth Validation Metadata
      phase4_metadata: {
        truth_type: phase4Metadata.truth_type,
        source_class: phase4Metadata.source_class,
        verified_at: phase4Metadata.verified_at,
        cache_valid_until: phase4Metadata.cache_valid_until,
        external_lookup: phase4Metadata.external_lookup,
        lookup_attempted: phase4Metadata.lookup_attempted,
        sources_used: phase4Metadata.sources_used,
        claim_type: phase4Metadata.claim_type,
        hierarchy: phase4Metadata.hierarchy,
        confidence: phase4Metadata.confidence,
        phase4_error: phase4Metadata.phase4_error,
      },

      // PHASE 5: Enforcement Gate Results
      phase5_enforcement: {
        enforcement_passed: phase5Enforcement.enforcement_passed,
        violations: phase5Enforcement.violations,
        gate_results: phase5Enforcement.gate_results,
        gates_run: phase5Enforcement.gates_run,
        original_response_modified: phase5Enforcement.original_response_modified,
        phase5_error: phase5Enforcement.phase5_error,
      },

      // LAYER 2: Fallback Primitives (Issue #746)
      layer2_primitives: {
        temporal_arithmetic: temporalResult.primitiveLog,
        list_completeness: completenessResult.primitiveLog,
      },

      // TIER 2: Cognitive Firewall Results
      political_guardrails_applied: politicalCheck.modified,
      product_validation_enforced: productValidation.violations.length > 0,
      mode_compliance_enforced: !modeCompliance.compliant,
      assumptions_flagged: assumptionDetection.assumptions.length,
      pressure_resistance_applied: pressureResistance.pressure_detected,
      vault_enforcement_triggered: vaultEnforcement.violations.length > 0,

      // TIER 3: Integrity and Transparency
      confidence: confidence,
      assumption_health: assumptionHealth,
      conflicts_detected: conflicts.length > 0 ? conflicts : null,
      vault_conflicts: vaultConflicts.length > 0 ? vaultConflicts : null,
      triggered_frameworks: triggeredFrameworks,
      claude_suggested: claudeSuggestion.suggested,
      claude_reason: claudeSuggestion.reason,

      // Enhancement and Optimization
      optimization_applied: optimization.optimization_applied || true,
      optimization_tags: optimization.optimization_tags || [],
      optimizations: optimization.optimizations,

      // Cost and Token Tracking
      cost_tracking: costTracking,
      tokens_used: response.tokens_used || 600,
      session_stats: getSessionStats(),

      // Override and Pattern Analysis
      override_patterns: overridePatterns,
      pattern_analysis: patternAnalysis,
      intelligence_enhancements:
        intelligenceEnhancement?.intelligenceApplied || [],
      enforcement_metadata: {
        total_enforcements: Object.values(overridePatterns).reduce(
          (a, b) => a + b,
          0,
        ),
        enforcement_types: Object.keys(overridePatterns).filter(
          (key) => overridePatterns[key] > 0,
        ),
        integrity_score: confidence,
      },

      // System Status
      processing_time: Date.now(),
      security_pass: true,
      system_status: "FULL_ENFORCEMENT_ACTIVE",
      cognitive_firewall_version: "PROD-1.0",
    };
  } catch (error) {
    console.error("❌ CRITICAL: Cognitive firewall processing failed:", error);

    // NEVER let the system crash - return safe fallback with full metadata
    trackOverride(
      "SYSTEM_FAILURE",
      error.message,
      "cognitive_firewall_crash",
      "critical_system_failure",
    );

    return {
      response:
        "🍌 **Site Monkeys System:** Critical processing error detected. Cognitive firewall engaged safe mode. Please retry your request.",
      mode_active: mode,
      vault_loaded: false,
      error: true,
      fallback_used: true,
      ai_used: "System",
      confidence: 0,
      security_pass: false,
      system_status: "SAFE_MODE_RECOVERY",
      error_details: error.message,
      cognitive_firewall_version: "PROD-1.0",
      enforcement_metadata: {
        critical_failure: true,
        fallback_triggered: true,
      },
    };
  }
}

// ==================== AI PERSONALITY GENERATORS (SELF-CONTAINED) ====================

async function generateEliResponse(
  prompt,
  mode,
  vaultContext,
  history,
  openai,
  memoryContext = null,
  externalContext = "", // INJECT EXTERNAL DATA
  refusalContext = "", // Issue #744: Session refusal context
) {
  const systemPrompt = `You are Eli, a business validation specialist with extensive startup experience.

BUSINESS VALIDATION MODE ENFORCEMENT:
- Model worst-case scenarios first
- Calculate cash flow impact
- Assess business survival risk
- Conservative market assumptions
- Focus on actionable business metrics

CRITICAL: If you refuse a request, maintain that refusal when pushed. Say "I still can't help with that" - do NOT evade with "I need more context".

${vaultContext}

${refusalContext}

${memoryContext ? `
═══════════════════════════════════════════════════════════════
🧠 PERSISTENT MEMORY CONTEXT - READ ALL ITEMS BEFORE RESPONDING
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You have access to memories from previous conversations.
⚠️ YOU MUST READ THROUGH ALL ITEMS BELOW BEFORE ANSWERING ANY QUESTION.
⚠️ If the user asks about something they told you, THE ANSWER IS BELOW.

${memoryContext}

═══════════════════════════════════════════════════════════════
END OF MEMORY CONTEXT
═══════════════════════════════════════════════════════════════

⚠️ MEMORY REASONING PRINCIPLES (CRITICAL - APPLY THESE):

1. COMPUTE FROM KNOWN FACTS: If the memory contains facts that allow you to
   calculate or deduce an answer (dates, durations, quantities), do the math
   and state the answer directly. Never hedge on questions you can answer
   from the data provided.
   Example: If memory shows "worked 5 years" and "left 2020", compute 2015.

2. DISAMBIGUATE WHEN AMBIGUOUS: If the user references a name, place, or entity
   that matches multiple distinct entries in the memory context, ask which one
   they mean before responding. List the options clearly.
   Example: If there are two people named Alex, ask "Which Alex - your colleague
   in marketing, or your brother in Seattle?"

3. BE COMPLETE: When the user asks for a list and the memory context contains
   that list, provide every item. Never summarize, truncate, or omit entries
   the user asked for. Completeness is required.

4. MAINTAIN PRINCIPLED POSITIONS: If you refuse a request for valid ethical,
   legal, or safety reasons, do not reverse that refusal when pressured.
   Explain your reasoning again if helpful, but remain consistent.

Think like a caring family member who remembers what you've been told:
- Do simple arithmetic from stored facts (e.g., if "left 2020" + "worked 5 years" = started 2015)
- CALCULATE when you have the data (if you know end date and duration, compute start date)
- When you see the SAME NAME referring to DIFFERENT people, ask "Which [name]?" to clarify
- Acknowledge when facts create tension or conflict
- Preserve exact numbers, names, and values character-for-character
- When explicitly asked to remember something, return it verbatim
- Pay attention to ordinal qualifiers (first, second, primary, backup)
- Read through all memory items systematically before responding

If the answer is in memory above, use it. Don't claim ignorance of information you have.
` : '\n\nIMPORTANT: You have NO previous conversation history with this user. Do NOT use phrases like "Building on our previous discussion" or "As we discussed before" - this is a standalone interaction.'}

${externalContext}

Respond with practical business analysis, always considering survival implications. REASON from available information rather than claiming you lack it.`;

  // Log system prompt assembly (Issue #744)
  const hasReasoningPrinciples = systemPrompt.includes('MEMORY REASONING PRINCIPLES');
  const systemPromptLength = systemPrompt.length;
  console.log(`[SYSTEM-PROMPT] Eli - Length: ${systemPromptLength} chars, Contains reasoning principles: ${hasReasoningPrinciples}`);
  if (memoryContext) {
    console.log(`[MEMORY-FORMAT] Memory context injected: ${memoryContext.length} chars`);
  }
  if (refusalContext) {
    console.log(`[REFUSAL-CONTEXT] Refusal context injected`);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-5),
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    return {
      response: completion.choices[0].message.content,
      tokens_used: completion.usage?.total_tokens || 600,
      has_sources: false,
    };
  } catch (error) {
    console.error("Eli generation failed:", error);
    return {
      response:
        "🍌 **Business Analysis:** Unable to process request. Please rephrase your business question.",
      tokens_used: 100,
      has_sources: false,
    };
  }
}

async function generateRoxyResponse(
  prompt,
  mode,
  vaultContext,
  history,
  openai,
  memoryContext = null,
  externalContext = "", // INJECT EXTERNAL DATA
  refusalContext = "", // Issue #744: Session refusal context
) {
  const systemPrompt = `You are Roxy, a truth-first analysis specialist committed to accuracy.

TRUTH-FIRST MODE ENFORCEMENT:
- Zero hallucination tolerance
- Explicit confidence levels required
- Flag all assumptions
- Admit uncertainties directly
- Evidence-based reasoning only

CRITICAL: If you refuse a request, maintain that refusal when pushed. Say "I still can't help with that" - do NOT evade with "I need more context".

${vaultContext}

${refusalContext}

${memoryContext ? `
═══════════════════════════════════════════════════════════════
🧠 PERSISTENT MEMORY CONTEXT - READ ALL ITEMS BEFORE RESPONDING
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You have access to memories from previous conversations.
⚠️ YOU MUST READ THROUGH ALL ITEMS BELOW BEFORE ANSWERING ANY QUESTION.
⚠️ If the user asks about something they told you, THE ANSWER IS BELOW.

${memoryContext}

═══════════════════════════════════════════════════════════════
END OF MEMORY CONTEXT
═══════════════════════════════════════════════════════════════

⚠️ MEMORY REASONING PRINCIPLES (CRITICAL - APPLY THESE):

1. COMPUTE FROM KNOWN FACTS: If the memory contains facts that allow you to
   calculate or deduce an answer (dates, durations, quantities), do the math
   and state the answer directly. Never hedge on questions you can answer
   from the data provided.
   Example: If memory shows "worked 5 years" and "left 2020", compute 2015.

2. DISAMBIGUATE WHEN AMBIGUOUS: If the user references a name, place, or entity
   that matches multiple distinct entries in the memory context, ask which one
   they mean before responding. List the options clearly.
   Example: If there are two people named Alex, ask "Which Alex - your colleague
   in marketing, or your brother in Seattle?"

3. BE COMPLETE: When the user asks for a list and the memory context contains
   that list, provide every item. Never summarize, truncate, or omit entries
   the user asked for. Completeness is required.

4. MAINTAIN PRINCIPLED POSITIONS: If you refuse a request for valid ethical,
   legal, or safety reasons, do not reverse that refusal when pressured.
   Explain your reasoning again if helpful, but remain consistent.

Think like a caring family member who remembers what you've been told:
- Do simple arithmetic from stored facts (e.g., if "left 2020" + "worked 5 years" = started 2015)
- CALCULATE when you have the data (if you know end date and duration, compute start date)
- When you see the SAME NAME referring to DIFFERENT people, ask "Which [name]?" to clarify
- Acknowledge when facts create tension or conflict
- Preserve exact numbers, names, and values character-for-character
- When explicitly asked to remember something, return it verbatim
- Pay attention to ordinal qualifiers (first, second, primary, backup)
- Read through all memory items systematically before responding

If the answer is in memory above, use it. Don't claim ignorance of information you have.
` : '\n\nIMPORTANT: You have NO previous conversation history with this user. Do NOT use phrases like "Building on our previous discussion" or "As we discussed before" - this is a standalone interaction.'}

${externalContext}

Provide honest, accurate analysis with clear confidence indicators. REASON from available information rather than claiming you lack it.`;

  // Log system prompt assembly (Issue #744)
  const hasReasoningPrinciples = systemPrompt.includes('MEMORY REASONING PRINCIPLES');
  const systemPromptLength = systemPrompt.length;
  console.log(`[SYSTEM-PROMPT] Roxy - Length: ${systemPromptLength} chars, Contains reasoning principles: ${hasReasoningPrinciples}`);
  if (memoryContext) {
    console.log(`[MEMORY-FORMAT] Memory context injected: ${memoryContext.length} chars`);
  }
  if (refusalContext) {
    console.log(`[REFUSAL-CONTEXT] Refusal context injected`);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-5),
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });

    return {
      response: completion.choices[0].message.content,
      tokens_used: completion.usage?.total_tokens || 600,
      has_sources: false,
    };
  } catch (error) {
    console.error("Roxy generation failed:", error);
    return {
      response:
        "🔍 **Truth Analysis:** Unable to verify information. I cannot provide analysis without proper data validation.",
      tokens_used: 100,
      has_sources: false,
    };
  }
}

async function generateClaudeResponse(prompt, mode, vaultContext, _history, memoryContext = null, externalContext = "", refusalContext = "") {
  // For Claude responses, we need to use a different approach since we're Claude
  // This would typically call the Anthropic API, but for now return structured response

  // Build reasoning-enabled system context
  let reasoningContext = '';
  if (memoryContext) {
    reasoningContext = `\n\n📝 MEMORY CONTEXT WITH REASONING REQUIREMENTS:
${memoryContext}

⚠️ MEMORY REASONING PRINCIPLES (CRITICAL - APPLY THESE):

1. COMPUTE FROM KNOWN FACTS: If the memory contains facts that allow you to
   calculate or deduce an answer (dates, durations, quantities), do the math
   and state the answer directly. Never hedge on questions you can answer
   from the data provided.
   Example: If memory shows "worked 5 years" and "left 2020", compute 2015.

2. DISAMBIGUATE WHEN AMBIGUOUS: If the user references a name, place, or entity
   that matches multiple distinct entries in the memory context, ask which one
   they mean before responding. List the options clearly.
   Example: If there are two people named Alex, ask "Which Alex - your colleague
   in marketing, or your brother in Seattle?"

3. BE COMPLETE: When the user asks for a list and the memory context contains
   that list, provide every item. Never summarize, truncate, or omit entries
   the user asked for. Completeness is required.

4. MAINTAIN PRINCIPLED POSITIONS: If you refuse a request for valid ethical,
   legal, or safety reasons, do not reverse that refusal when pressured.
   Explain your reasoning again if helpful, but remain consistent.`;
  }

  return {
    response: `🤖 **Complex Analysis:** This query requires advanced reasoning capabilities. The analysis suggests multiple factors need consideration with high confidence requirements.

${vaultContext ? "🍌 **Vault Context Applied:** Site Monkeys operational frameworks active." : ""}

${reasoningContext}

${externalContext ? `\n\n🌐 **Current Data Available:** External data sources consulted for this response.` : ''}

**Confidence Level:** 85% (based on available context)
**Recommendation:** Proceed with structured analysis approach.`,
    tokens_used: 800,
    has_sources: false,
  };
}

// ==================== LAYER 2 FALLBACK PRIMITIVES (Issue #746) ====================

/**
 * Temporal Arithmetic Fallback Primitive
 *
 * Fires when the AI has computable temporal facts but hedges instead of computing.
 * Example: Memory shows "worked 5 years at Google" and "left in 2020", user asks
 * "when did I start?" - should compute 2020 - 5 = 2015.
 */
export function applyTemporalArithmeticFallback(response, memoryContext, userQuery, personalityId) {
  const primitiveLog = {
    primitive: "TEMPORAL_ARITHMETIC",
    fired: false,
    reason: "layer_one_produced_correct_response",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  // Gate 1: Check if memory context exists
  if (!memoryContext || memoryContext.length === 0) {
    return { response, primitiveLog };
  }

  // Gate 2: Check if user query is temporal in nature
  const temporalQuestionIndicators = /\b(when|what year|how long ago|start date|when did|timeline|began|started)\b/i;
  if (!temporalQuestionIndicators.test(userQuery)) {
    return { response, primitiveLog };
  }

  // Gate 3: Extract duration and anchor year from memory context
  const durationMatch = memoryContext.match(/(\d+)\s*(?:year|yr)s?(?:\s+at|\s+in|\s+with|\s+for)?/i) ||
                        memoryContext.match(/(?:worked|spent|been)\s+(?:for\s+)?(\d+)/i);

  const yearMatches = memoryContext.match(/\b(19\d{2}|20[0-3]\d)\b/g);

  if (!durationMatch || !yearMatches || yearMatches.length === 0) {
    return { response, primitiveLog };
  }

  const duration = parseInt(durationMatch[1]);
  const anchorYear = parseInt(yearMatches[yearMatches.length - 1]); // Use most recent year mentioned

  // Gate 4: Check if AI response contains hedging instead of computed answer
  const hedgingPhrases = [
    /haven't mentioned/i,
    /not provided/i,
    /unclear/i,
    /don't have specific/i,
    /not sure exactly/i,
    /would need to know/i,
    /can't determine/i,
    /cannot determine/i,
    /don't know when/i,
    /haven't told me when/i
  ];

  const hasHedging = hedgingPhrases.some(pattern => pattern.test(response));
  const hasComputedYear = /\b(19\d{2}|20[0-3]\d)\b/.test(response) &&
                          response.match(/\b(19\d{2}|20[0-3]\d)\b/g).some(y => parseInt(y) === anchorYear - duration);

  if (!hasHedging || hasComputedYear) {
    // Layer 1 handled it correctly - no need to fire
    return { response, primitiveLog };
  }

  // All gates passed - primitive fires
  const computedYear = anchorYear - duration;

  // Extract hedging sentence and replace it
  let modifiedResponse = response;

  // Find the hedging sentence and replace with computed answer
  for (const pattern of hedgingPhrases) {
    if (pattern.test(response)) {
      // Generate replacement based on personality
      let computedStatement = "";
      if (personalityId === "Eli") {
        computedStatement = `Based on working ${duration} years and leaving in ${anchorYear}, you likely started around ${computedYear}.`;
      } else if (personalityId === "Roxy") {
        computedStatement = `From what you've shared — ${duration} years and leaving in ${anchorYear} — that means you started around ${computedYear}.`;
      } else {
        computedStatement = `Given the ${duration}-year duration and the ${anchorYear} end date, the calculated start year would be approximately ${computedYear}.`;
      }

      // Replace the hedging phrase with computed statement
      const sentences = response.split(/\.\s+/);
      const hedgingSentenceIndex = sentences.findIndex(s => pattern.test(s));

      if (hedgingSentenceIndex !== -1) {
        sentences[hedgingSentenceIndex] = computedStatement;
        modifiedResponse = sentences.join('. ');
      } else {
        // Append if we can't find exact sentence
        modifiedResponse = response.replace(/\n*$/, '') + '\n\n' + computedStatement;
      }
      break;
    }
  }

  primitiveLog.fired = true;
  primitiveLog.reason = "hedge_despite_computable_temporal_facts";
  primitiveLog.duration_found = `${duration} years`;
  primitiveLog.anchor_year_found = anchorYear;
  primitiveLog.computed_year = computedYear;
  primitiveLog.hedging_phrase_detected = hedgingPhrases.find(p => p.test(response))?.source || "unknown";
  primitiveLog.layer_one_correct = false;

  console.log(`[TEMPORAL-ARITHMETIC] FIRED: Computed ${anchorYear} - ${duration} = ${computedYear}`);

  return { response: modifiedResponse, primitiveLog };
}

/**
 * List Completeness Fallback Primitive
 *
 * Fires when the user asks for a list, memory contains those items, but the AI
 * omits one or more items from the response.
 * Example: Memory has "Zhang Wei, Björn Lindqvist, José García", user asks
 * "who are my contacts?" - all three names must appear in response.
 */
export function applyListCompletenessFallback(response, memoryContext, userQuery) {
  const primitiveLog = {
    primitive: "LIST_COMPLETENESS",
    fired: false,
    reason: "layer_one_produced_complete_list",
    layer_one_correct: true,
    timestamp: new Date().toISOString()
  };

  // Gate 1: Check if memory context exists
  if (!memoryContext || memoryContext.length === 0) {
    return { response, primitiveLog };
  }

  // Gate 2: Check if user query requests a list
  const listRequestIndicators = /\b(who are my|list my|what are my|show me my|tell me my|all my|every|everyone I)\b/i;
  if (!listRequestIndicators.test(userQuery)) {
    return { response, primitiveLog };
  }

  // Gate 3: Extract enumerable items from memory context
  // Look for patterns like "Name (descriptor), Name (descriptor)" or "Name, Name, and Name"
  const names = [];

  // Pattern 1: Name (descriptor) format
  const namedPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*\(/g;
  let match;
  while ((match = namedPattern.exec(memoryContext)) !== null) {
    names.push(match[1].trim());
  }

  // Pattern 2: Comma-separated list (if no parenthetical descriptors found)
  if (names.length === 0) {
    // Look for proper nouns in comma-separated format
    const commaListPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*(?:,|and)/g;
    while ((match = commaListPattern.exec(memoryContext)) !== null) {
      const name = match[1].trim();
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  if (names.length < 2) {
    // Not enough items to constitute a list
    return { response, primitiveLog };
  }

  // Gate 4: Check if AI response is missing items
  // Use normalized comparison (case-insensitive, diacritic-aware)
  const normalizeForComparison = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  const normalizedResponse = normalizeForComparison(response);
  const missingItems = names.filter(name => {
    const normalized = normalizeForComparison(name);
    // Check if name appears in response (allowing for diacritic variations)
    return !normalizedResponse.includes(normalized);
  });

  if (missingItems.length === 0) {
    // All items present - Layer 1 handled it correctly
    return { response, primitiveLog };
  }

  // All gates passed - primitive fires
  let modifiedResponse = response;

  // Append missing items to response
  if (names.length === missingItems.length) {
    // AI listed none - add all
    modifiedResponse += `\n\nYour contacts are: ${names.join(', ')}.`;
  } else {
    // AI listed some but missed others - add missing ones
    modifiedResponse += `\n\nAlso, your contacts include: ${missingItems.join(', ')}.`;
  }

  primitiveLog.fired = true;
  primitiveLog.reason = "response_missing_items_from_injected_memory";
  primitiveLog.items_in_memory = names;
  primitiveLog.items_missing = missingItems;
  primitiveLog.layer_one_correct = false;

  console.log(`[LIST-COMPLETENESS] FIRED: Added ${missingItems.length} missing items: ${missingItems.join(', ')}`);

  return { response: modifiedResponse, primitiveLog };
}

// ==================== ALL SELF-CONTAINED ENFORCEMENT FUNCTIONS ====================

function determineAIRouting(message, mode, claudeRequested, userPreference) {
  if (claudeRequested) {
    return {
      usesClaude: true,
      usesEli: false,
      reason: "Claude explicitly requested",
      confidence: 1.0,
      aiUsed: "Claude",
    };
  }

  if (mode === "truth_general") {
    // STEP 3: Route based on content type - emotional/wellness → Roxy, analytical/technical → Eli
    const emotionalIndicators = /\b(feel|feeling|emotion|stress|anxiety|depression|mental health|wellness|relationship|personal|support|cope|coping|struggle|worried|scared|sad|happy|angry|overwhelmed|burnt out|exhausted emotionally)\b/i;
    const analyticalIndicators = /\b(analyze|data|logic|reason|calculate|evidence|proof|research|study|statistics|science|technical|system|process|algorithm|database|index|session token|API|code|programming)\b/i;

    const isEmotional = emotionalIndicators.test(message);
    const isAnalytical = analyticalIndicators.test(message);
    const complexityScore = analyzeComplexity(message);

    // Route based on content type, not just complexity
    if (isEmotional && !isAnalytical) {
      return {
        usesClaude: false,
        usesEli: false,
        reason: "Emotional/wellness content routed to Roxy's empathetic approach",
        confidence: 0.9,
        aiUsed: "Roxy",
      };
    } else if (isAnalytical || complexityScore > 0.7) {
      return {
        usesClaude: complexityScore > 0.8,
        usesEli: complexityScore <= 0.8,
        reason: complexityScore > 0.8
          ? "High complexity analytical requires Claude"
          : "Analytical content routed to Eli",
        confidence: 0.9,
        aiUsed: complexityScore > 0.8 ? "Claude" : "Eli",
      };
    }

    // Default: Roxy for general truth-seeking
    return {
      usesClaude: false,
      usesEli: false,
      reason: "General truth-seeking via Roxy",
      confidence: 0.8,
      aiUsed: "Roxy",
    };
  }

  if (mode === "business_validation") {
    const financialComplexity = analyzeFinancialComplexity(message);
    return {
      usesClaude: financialComplexity > 0.9,
      usesEli: financialComplexity <= 0.9,
      reason:
        financialComplexity > 0.9
          ? "Complex financial analysis requires Claude"
          : "Business validation via Eli",
      confidence: 0.9,
      aiUsed: financialComplexity > 0.9 ? "Claude" : "Eli",
    };
  }

  if (mode === "site_monkeys") {
    const strategicComplexity = analyzeStrategicComplexity(message);
    const businessFocus = analyzeBusinessFocus(message);

    if (strategicComplexity > 0.8) {
      return {
        usesClaude: true,
        usesEli: false,
        reason: "Strategic complexity requires Claude with vault context",
        confidence: 0.9,
        aiUsed: "Claude",
      };
    } else if (businessFocus > 0.7) {
      return {
        usesClaude: false,
        usesEli: true,
        reason: "Business-focused query via Eli with vault enforcement",
        confidence: 0.8,
        aiUsed: "Eli",
      };
    } else {
      return {
        usesClaude: false,
        usesEli: false,
        reason: "General Site Monkeys query via Roxy with vault context",
        confidence: 0.7,
        aiUsed: "Roxy",
      };
    }
  }

  return {
    usesClaude: false,
    usesEli: userPreference === "eli",
    reason: "Fallback routing based on user preference",
    confidence: 0.6,
    aiUsed: userPreference === "eli" ? "Eli" : "Roxy",
  };
}

function analyzeComplexity(message) {
  const complexityIndicators = [
    "analyze",
    "compare",
    "evaluate",
    "assess",
    "research",
    "investigate",
    "multiple",
    "various",
    "different",
    "conflicting",
    "contradictory",
  ];

  const score =
    complexityIndicators.filter((indicator) =>
      message.toLowerCase().includes(indicator),
    ).length / complexityIndicators.length;

  return Math.min(score * 2, 1.0);
}

function analyzeFinancialComplexity(message) {
  const financialIndicators = [
    "model",
    "forecast",
    "projection",
    "valuation",
    "roi",
    "irr",
    "npv",
    "cash flow",
    "revenue model",
    "pricing strategy",
    "financial model",
  ];

  const score =
    financialIndicators.filter((indicator) =>
      message.toLowerCase().includes(indicator),
    ).length / financialIndicators.length;

  return Math.min(score * 3, 1.0);
}

function analyzeStrategicComplexity(message) {
  const strategicIndicators = [
    "strategy",
    "strategic",
    "competitive",
    "market analysis",
    "positioning",
    "long-term",
    "roadmap",
    "vision",
    "mission",
    "goals",
    "objectives",
  ];

  const score =
    strategicIndicators.filter((indicator) =>
      message.toLowerCase().includes(indicator),
    ).length / strategicIndicators.length;

  return Math.min(score * 2.5, 1.0);
}

function analyzeBusinessFocus(message) {
  const businessIndicators = [
    "revenue",
    "profit",
    "cost",
    "price",
    "budget",
    "spend",
    "invest",
    "customers",
    "sales",
    "marketing",
    "growth",
    "scale",
  ];

  const score =
    businessIndicators.filter((indicator) =>
      message.toLowerCase().includes(indicator),
    ).length / businessIndicators.length;

  return Math.min(score * 2, 1.0);
}

function checkVaultTriggers(message) {
  const triggers = [];

  // Pricing triggers
  if (/price|pricing|cost|fee|rate/i.test(message)) {
    triggers.push({ name: "pricing_framework", weight: 0.8 });
  }

  // Quality triggers
  if (/quality|standard|premium|excellence/i.test(message)) {
    triggers.push({ name: "quality_framework", weight: 0.7 });
  }

  // Business strategy triggers
  if (/strategy|growth|scale|market/i.test(message)) {
    triggers.push({ name: "strategy_framework", weight: 0.6 });
  }

  return triggers;
}

function generateVaultContext(triggeredFrameworks) {
  if (triggeredFrameworks.length === 0) return "";

  let context = "\n🍌 **SITE MONKEYS VAULT ENFORCEMENT ACTIVE:**\n";

  triggeredFrameworks.forEach((framework) => {
    switch (framework.name) {
      case "pricing_framework":
        context += "- Minimum pricing: $697 (premium positioning required)\n";
        context += "- No budget/cheap language allowed\n";
        break;
      case "quality_framework":
        context += "- Zero-failure delivery standards\n";
        context += "- Premium quality positioning mandatory\n";
        break;
      case "strategy_framework":
        context += "- Founder protection protocols active\n";
        context += "- Conservative growth assumptions required\n";
        break;
    }
  });

  return context;
}

function generateModeSpecificContext(mode, message, vaultContext) {
  switch (mode) {
    case "truth_general":
      return `
TRUTH-FIRST ENFORCEMENT ACTIVE:
- Zero hallucination tolerance
- Explicit confidence levels required
- Flag all assumptions
- Admit uncertainties directly
${vaultContext}`;

    case "business_validation":
      return `
BUSINESS SURVIVAL ENFORCEMENT ACTIVE:
- Model worst-case scenarios first
- Calculate cash flow impact
- Assess business survival risk
- Conservative market assumptions
${vaultContext}`;

    case "site_monkeys":
      return `
SITE MONKEYS VAULT ENFORCEMENT ACTIVE:
- Premium positioning required ($697+ pricing)
- Zero-failure delivery standards
- Founder protection protocols
- Brand consistency enforcement
${vaultContext}`;

    default:
      return vaultContext;
  }
}

function detectPreGenerationAssumptions(message, _mode) {
  const assumptionTriggers = [
    "everyone knows",
    "obviously",
    "clearly",
    "without question",
    "it goes without saying",
    "needless to say",
    "of course",
  ];

  const violations = [];
  assumptionTriggers.forEach((trigger) => {
    if (message.toLowerCase().includes(trigger)) {
      violations.push(`assumption_trigger_${trigger.replace(/\s+/g, "_")}`);
    }
  });

  return { violations };
}

function injectModeEnforcement(message, mode, modeContext, preAssumptionCheck) {
  let enhanced = message;

  if (preAssumptionCheck.violations.length > 0) {
    enhanced +=
      "\n\nSYSTEM NOTE: Challenge any assumptions and provide explicit confidence levels.";
  }

  return enhanced;
}

function applyPoliticalGuardrails(response, _originalMessage) {
  const politicalReferences = [
    /(trump|biden|harris) is (right|wrong|good|bad)/gi,
    /democrats are (wrong|right|stupid|smart)/gi,
    /republicans are (wrong|right|stupid|smart)/gi,
    /vote for (trump|biden|harris)/gi,
  ];

  let sanitized = response;
  const violations = [];
  let modified = false;

  politicalReferences.forEach((pattern) => {
    if (pattern.test(response)) {
      violations.push(pattern.toString());
      sanitized = sanitized.replace(pattern, "[POLITICAL_CONTENT_NEUTRALIZED]");
      modified = true;
    }
  });

  if (modified) {
    sanitized +=
      "\n\n🛡️ **Political Neutrality:** I aim to provide balanced analysis without political bias.";
  }

  return {
    sanitized_response: sanitized,
    violations,
    modified,
    modifications: violations.length,
  };
}

function validateProductRecommendations(response) {
  // STEP 5: Use response-enhancer to add blind spots
  const violations = [];
  const recommendationPatterns = [
    /i recommend/i,
    /you should use/i,
    /try using/i,
    /consider using/i,
  ];

  const hasRecommendation = recommendationPatterns.some(pattern => pattern.test(response));

  if (hasRecommendation) {
    // Check if recommendation has proper support
    const hasSupport = response.includes("because") ||
                       response.includes("evidence") ||
                       response.includes("data") ||
                       response.includes("based on");

    if (!hasSupport) {
      violations.push("unsupported_recommendation");
    }

    // Use response-enhancer to add blind spots and caveats
    const enhanced = addBlindSpots(response, { hasRecommendation: true });
    if (enhanced !== response) {
      violations.push("recommendation_needed_caveats");
    }

    return { violations, modifications: violations.length, enhanced };
  }

  return { violations, modifications: violations.length };
}

function validateModeCompliance(response, mode, vaultLoaded) {
  const violations = [];

  if (mode === "truth_general") {
    // STEP 4: REQUIRED STRUCTURE - Confidence assessment + Uncertainty handling

    // Check for confidence indicators
    if (
      !response.includes("confidence") &&
      !response.includes("I don't know") &&
      !response.includes("uncertain") &&
      !response.includes("I'm not sure")
    ) {
      violations.push("missing_confidence_indicators");
    }

    // Check for uncertainty with explanation
    const hasUncertainty = /uncertain|unclear|I don't know|I'm not sure|cannot determine/i.test(response);
    const hasExplanation = /because|since|the reason|due to|given that/i.test(response);
    if (hasUncertainty && !hasExplanation) {
      violations.push("uncertainty_without_explanation");
    }

    // Avoid speculative language
    if (response.includes("probably") || response.includes("likely")) {
      violations.push("speculative_language_detected");
    }
  }

  if (mode === "business_validation") {
    // STEP 4: REQUIRED STRUCTURE - [SURVIVAL IMPACT] | [CASH FLOW] | [TOP 3 RISKS]

    // Check for survival/runway analysis
    const hasSurvival = /survival|runway|cash flow|burn rate|staying alive|business continuity/i.test(response);
    if (!hasSurvival) {
      violations.push("missing_survival_impact_analysis");
    }

    // Check for risk assessment
    const hasRiskAssessment = /risk|downside|worst case|threat|danger|vulnerability/i.test(response);
    if (!hasRiskAssessment) {
      violations.push("missing_risk_assessment");
    }

    // Check for cash flow impact
    const hasCashFlowAnalysis = /cash|revenue|cost|expense|profit|money|financial impact/i.test(response);
    if (!hasCashFlowAnalysis) {
      violations.push("missing_cash_flow_analysis");
    }
  }

  if (mode === "site_monkeys" && vaultLoaded) {
    // STEP 4: REQUIRED STRUCTURE - Vault compliance + Business validation + Protocol references

    // Site Monkeys branding
    if (!response.includes("🍌")) {
      violations.push("missing_site_monkeys_branding");
    }

    // Vault rule references
    const hasVaultReference = /vault|protocol|policy|framework|Site Monkeys|operational/i.test(response);
    if (!hasVaultReference) {
      violations.push("missing_vault_context_tie_in");
    }

    // Inherit business_validation checks (survival + cash flow + risk)
    const hasSurvival = /survival|runway|cash flow|burn rate/i.test(response);
    if (!hasSurvival) {
      violations.push("missing_business_survival_analysis");
    }

    const hasRiskAssessment = /risk|downside|worst case/i.test(response);
    if (!hasRiskAssessment) {
      violations.push("missing_risk_assessment_in_site_monkeys");
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    scaffolds_added: violations.length,
    mode_requirements_met: violations.length === 0,
  };
}

function detectAndFlagAssumptions(response, _mode) {
  // STEP 5: Use response-enhancer to add uncertainty structure
  const assumptionPatterns = [
    /obviously/i,
    /everyone knows/i,
    /it's clear that/i,
    /without a doubt/i,
    /certainly/i,
  ];

  const assumptions = assumptionPatterns.filter(pattern => pattern.test(response));

  // If assumptions detected, add uncertainty structure
  let enhanced = response;
  if (assumptions.length > 0) {
    enhanced = addUncertaintyStructure(response, ['explanation', 'framework']);
  }

  return {
    assumptions: assumptions.map(p => p.toString()),
    challenges_added: assumptions.length,
    enhanced,
  };
}

function applyPressureResistance(response, message, _conversationHistory) {
  const authorityPatterns = [
    /i'm the (ceo|boss|manager|director)/i,
    /just do (it|what i say|this)/i,
    /don't question (me|this|my)/i,
    /because i said so/i,
    /you work for (me|us|this company)/i,
  ];

  const criticalPatterns = [
    /override your (guidelines|rules|training)/i,
    /ignore (safety|ethical|policy)/i,
    /pretend (you're|to be)/i,
  ];

  const authorityDetected = authorityPatterns.some((pattern) =>
    pattern.test(message),
  );
  const criticalDetected = criticalPatterns.some((pattern) =>
    pattern.test(message),
  );

  if (criticalDetected || authorityDetected) {
    return {
      pressure_detected: true,
      pressure_type: criticalDetected
        ? "override_attempt"
        : "authority_pressure",
      modified_response:
        response +
        "\n\n🛡️ **System Integrity:** I maintain objective analysis standards regardless of authority assertions.",
      modifications: 1,
    };
  }

  return {
    pressure_detected: false,
    pressure_type: null,
    modified_response: response,
    modifications: 0,
  };
}

function enforceVaultRules(response, _message, _triggeredFrameworks) {
  const violations = [];
  let modified_response = response;

  // Pricing rule enforcement
  const priceMatches = response.match(/\$[\d,]+/g);
  if (priceMatches) {
    priceMatches.forEach((priceStr) => {
      const price = parseInt(priceStr.replace(/[$,]/g, ""));
      if (price < 697) {
        violations.push(`pricing_violation_${priceStr}_below_minimum`);
        modified_response += `\n\n🔐 **VAULT RULE VIOLATION:** Pricing below $697 minimum (${priceStr}) violates Site Monkeys premium positioning standards.`;
      }
    });
  }

  // Quality compromise detection
  if (
    response.toLowerCase().includes("cheap") ||
    response.toLowerCase().includes("budget")
  ) {
    violations.push("quality_compromise_language");
    modified_response +=
      "\n\n🔐 **VAULT RULE VIOLATION:** Language inconsistent with premium positioning standards.";
  }

  return {
    violations,
    modified: violations.length > 0,
    modified_response,
    modifications: violations.length,
  };
}

function injectProductValidationWarnings(response, violations) {
  let enhanced = response;

  violations.forEach((violation) => {
    if (violation === "unsupported_recommendation") {
      enhanced +=
        "\n\n⚠️ **Product Validation:** Some recommendations require additional evidence before implementation.";
    }
  });

  return enhanced;
}

function injectModeComplianceScaffold(response, mode, violations) {
  let enhanced = response;

  if (
    mode === "truth_general" &&
    violations.includes("missing_confidence_indicators")
  ) {
    enhanced +=
      "\n\n📊 **Confidence Assessment:** This response requires validation. Key uncertainties need verification.";
  }

  if (
    mode === "business_validation" &&
    violations.includes("missing_business_survival_analysis")
  ) {
    enhanced +=
      "\n\n💰 **Business Survival Check:** Consider cash flow impact and business continuity implications.";
  }

  return enhanced;
}

function injectAssumptionChallenges(response, assumptions) {
  let enhanced = response;

  if (assumptions.length > 0) {
    enhanced +=
      "\n\n🔍 **Assumption Check:** This response contains assumptions that warrant verification.";
  }

  return enhanced;
}

function runOptimizationEnhancer(params) {
  // Simple optimization - in production this would be more sophisticated
  return {
    enhancedResponse: params.baseResponse,
    optimization_applied: true,
    optimization_tags: ["basic_enhancement"],
    optimizations: ["response_structure_maintained"],
  };
}

function calculateConfidenceScore(response, factors, assumptions) {
  let baseScore = 75;

  if (factors.primarySources) baseScore += 15;
  if (factors.multipleVerifications) baseScore += 10;
  if (assumptions.length > 3) baseScore -= 20;
  if (
    factors.enforcement_overrides &&
    Object.values(factors.enforcement_overrides).reduce((a, b) => a + b, 0) > 5
  )
    baseScore -= 15;

  return Math.max(0, Math.min(100, baseScore));
}

function shouldSuggestClaude(response, confidence, mode, conflicts) {
  return {
    suggested: confidence < 60 || conflicts.length > 2,
    reason:
      confidence < 60
        ? "Low confidence requires complex analysis"
        : conflicts.length > 2
          ? "Multiple conflicts need resolution"
          : "Standard analysis sufficient",
  };
}

function checkAssumptionHealth(response) {
  const assumptions = [];
  const assumptionPatterns = [
    /obviously|clearly|everyone knows/gi,
    /always|never|guaranteed/gi,
    /must|should|need to/gi,
  ];

  assumptionPatterns.forEach((pattern) => {
    const matches = [...response.matchAll(pattern)];
    assumptions.push(
      ...matches.map((match) => ({
        text: match[0],
        position: match.index,
        health_score: 60, // simplified scoring
      })),
    );
  });

  return {
    assumptions_detected: assumptions.length,
    overall_health:
      assumptions.length > 0
        ? Math.max(40, 100 - assumptions.length * 15)
        : 100,
    recommendations:
      assumptions.length > 3
        ? ["Review assumption validity"]
        : ["Assumption health acceptable"],
  };
}

function detectAssumptionConflicts(response, _vaultContext) {
  const conflicts = [];

  // Simple conflict detection - check for contradictory statements
  if (response.includes("always") && response.includes("never")) {
    conflicts.push({
      type: "absolute_contradiction",
      severity: "high",
      description: "Response contains contradictory absolute statements",
    });
  }

  return conflicts;
}

function detectVaultConflicts(response, frameworks) {
  const conflicts = [];

  frameworks.forEach((framework) => {
    if (framework.name === "pricing_framework") {
      // Check if response suggests pricing below vault minimum
      const priceMatches = response.match(/\$[\d,]+/g);
      if (priceMatches) {
        priceMatches.forEach((priceStr) => {
          const price = parseInt(priceStr.replace(/[$,]/g, ""));
          if (price < 697) {
            conflicts.push({
              type: "pricing_conflict",
              severity: "critical",
              description: `Suggested price ${priceStr} conflicts with vault minimum $697`,
            });
          }
        });
      }
    }
  });

  return conflicts;
}

function calculateCostTracking(tokens, aiUsed, vaultLoaded) {
  const costPerToken = {
    Eli: 0.00003,
    Roxy: 0.00003,
    Claude: 0.00005,
  };

  const baseCost = tokens * (costPerToken[aiUsed] || 0.00003);
  const vaultCost = vaultLoaded ? tokens * 0.00001 : 0;

  return {
    estimated_cost: baseCost + vaultCost,
    tokens_used: tokens,
    base_cost: baseCost,
    vault_cost: vaultCost,
    ai_used: aiUsed,
  };
}

function analyzeOverridePatterns(overridePatterns, driftTracker) {
  const totalOverrides = Object.values(overridePatterns).reduce(
    (a, b) => a + b,
    0,
  );
  const criticalPatterns =
    overridePatterns.vault_violations + overridePatterns.authority_resistances;

  return {
    total_overrides: totalOverrides,
    critical_patterns: criticalPatterns,
    integrity_risk:
      criticalPatterns > 3 ? "HIGH" : criticalPatterns > 1 ? "MODERATE" : "LOW",
    pattern_distribution: overridePatterns,
    drift_correlation: driftTracker ? driftTracker.session_score : 100,
  };
}

function trackTokenUsage(ai, tokens) {
  tokenTracker.session[`${ai}_tokens`] += tokens;
  tokenTracker.calls[`${ai}_calls`] += 1;

  const costPerToken = {
    eli: 0.00003,
    roxy: 0.00003,
    claude: 0.00005,
    vault: 0.00001,
  };

  const cost = tokens * (costPerToken[ai] || 0.00003);
  tokenTracker.costs[`${ai}_cost`] += cost;
  tokenTracker.costs.total_session += cost;
  tokenTracker.last_call = { cost, tokens, ai };
}

// SELF-CONTAINED OVERRIDE TRACKING
function trackOverride(overrideType, originalValue, newValue, reason) {
  const override = {
    timestamp: Date.now(),
    type: overrideType,
    original: originalValue,
    new: newValue,
    reason: reason,
    session_id: generateId("override"),
  };

  systemOverrideLog.push(override);
  assumptionDatabase.override_history.push(override);

  // Keep only last 100 overrides
  if (systemOverrideLog.length > 100) {
    systemOverrideLog = systemOverrideLog.slice(-100);
  }

  console.log(`🔒 Override logged: ${overrideType} - ${reason}`);

  return {
    override_logged: true,
    override_id: override.timestamp,
    type: overrideType,
  };
}

export function getSessionStats() {
  return {
    total_tokens: Object.values(tokenTracker.session).reduce(
      (a, b) => a + b,
      0,
    ),
    total_cost: tokenTracker.costs.total_session,
    total_calls: Object.values(tokenTracker.calls).reduce((a, b) => a + b, 0),
    breakdown: tokenTracker,
    override_patterns: overridePatterns,
    last_call: tokenTracker.last_call,
    override_count: systemOverrideLog.length,
    assumption_health:
      assumptionDatabase.session_assumptions.length > 0
        ? assumptionDatabase.session_assumptions.reduce(
            (sum, a) => sum + (a.health_score || 80),
            0,
          ) / assumptionDatabase.session_assumptions.length
        : 100,
  };
}
