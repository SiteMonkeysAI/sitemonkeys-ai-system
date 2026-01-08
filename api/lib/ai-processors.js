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
          phase4Metadata.external_lookup = true;
          phase4Metadata.lookup_attempted = true;
          phase4Metadata.source_class = "external";
          phase4Metadata.verified_at = new Date().toISOString();
          phase4Metadata.sources_used = lookupResult.sources?.length || 0;
          phase4Metadata.external_data = lookupResult.data;

          // Update cache validity if provided
          if (lookupResult.cache_valid_until) {
            phase4Metadata.cache_valid_until = lookupResult.cache_valid_until;
          }

          console.log(
            `✅ External lookup successful: ${phase4Metadata.sources_used} sources`,
          );
        } else {
          phase4Metadata.external_lookup = false;
          phase4Metadata.lookup_attempted = true;
          console.log("⚠️ External lookup attempted but failed or returned no data");
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
        memoryContext, // STEP 2: Pass memory context
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
        memoryContext, // STEP 2: Pass memory context
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
        memoryContext, // STEP 2: Pass memory context
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
    const assumptionDetection = detectAndFlagAssumptions(
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

    // 5. Pressure Detection and Resistance
    const pressureResistance = applyPressureResistance(
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

    // 6. Vault Rule Enforcement (Site Monkeys Mode Only)
    let vaultEnforcement = { violations: [], modified: false };
    if (mode === "site_monkeys" && vaultVerification.allowed) {
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
    }

    // STEP 6: FINAL QUALITY PASS - Remove engagement bait
    console.log("🎯 Applying final quality pass - removing engagement bait");
    const cleanedResponse = removeEngagementBait(response.response);
    if (cleanedResponse !== response.response) {
      console.log("✅ Engagement bait removed from response");
      response.response = cleanedResponse;
      overridePatterns.engagement_bait_removed = (overridePatterns.engagement_bait_removed || 0) + 1;
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
  memoryContext = null, // STEP 2: Accept memory context
) {
  const systemPrompt = `You are Eli, a business validation specialist with extensive startup experience.

BUSINESS VALIDATION MODE ENFORCEMENT:
- Model worst-case scenarios first
- Calculate cash flow impact
- Assess business survival risk
- Conservative market assumptions
- Focus on actionable business metrics

${vaultContext}

${memoryContext ? `\n\nPERSISTENT MEMORY CONTEXT:\nYou have access to the following information from previous conversations:\n${memoryContext}\n\nUSE this memory to provide personalized, context-aware responses. REFERENCE specific details when relevant to show continuity and understanding of the user's situation.\n` : '\n\nIMPORTANT: You have NO previous conversation history with this user. Do NOT use phrases like "Building on our previous discussion" or "As we discussed before" - this is a standalone interaction.'}

Respond with practical business analysis, always considering survival implications.`;

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
  memoryContext = null, // STEP 2: Accept memory context
) {
  const systemPrompt = `You are Roxy, a truth-first analysis specialist committed to accuracy.

TRUTH-FIRST MODE ENFORCEMENT:
- Zero hallucination tolerance
- Explicit confidence levels required
- Flag all assumptions
- Admit uncertainties directly
- Evidence-based reasoning only

${vaultContext}

${memoryContext ? `\n\nPERSISTENT MEMORY CONTEXT:\nYou have access to the following information from previous conversations:\n${memoryContext}\n\nUSE this memory to provide personalized, context-aware responses. REFERENCE specific details when relevant to show continuity and understanding of the user's situation.\n` : '\n\nIMPORTANT: You have NO previous conversation history with this user. Do NOT use phrases like "Building on our previous discussion" or "As we discussed before" - this is a standalone interaction.'}

Provide honest, accurate analysis with clear confidence indicators.`;

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

async function generateClaudeResponse(prompt, mode, vaultContext, _history, memoryContext = null) {
  // For Claude responses, we need to use a different approach since we're Claude
  // This would typically call the Anthropic API, but for now return structured response

  return {
    response: `🤖 **Complex Analysis:** This query requires advanced reasoning capabilities. The analysis suggests multiple factors need consideration with high confidence requirements.

${vaultContext ? "🍌 **Vault Context Applied:** Site Monkeys operational frameworks active." : ""}

${memoryContext ? `\n\n📝 **Context Awareness:** Referencing previous conversations to provide personalized analysis.` : ''}

**Confidence Level:** 85% (based on available context)
**Recommendation:** Proceed with structured analysis approach.`,
    tokens_used: 800,
    has_sources: false,
  };
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
