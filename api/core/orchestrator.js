// /api/core/orchestrator.js
// ORCHESTRATOR - Central Request Coordinator
// Executes all chat requests in correct priority order
// Truth > Memory > Analysis > AI > Personality > Validation > Fallback (last resort)

import { coreSystem, intelligenceSystem } from "../categories/memory/index.js";
import { SemanticAnalyzer } from "../core/intelligence/semantic_analyzer.js";
import { EliFramework } from "../core/personalities/eli_framework.js";
import { RoxyFramework } from "../core/personalities/roxy_framework.js";
import { PersonalitySelector } from "../core/personalities/personality_selector.js";
import { trackApiCall } from "../lib/tokenTracker.js";
import { getVaultStatus, generateVaultContext } from "../lib/vault.js";
import { extractedDocuments } from "../upload-for-analysis.js";
import {
  MODES,
  validateModeCompliance,
  calculateConfidenceScore,
} from "../config/modes.js";
import { EMERGENCY_FALLBACKS } from "../lib/site-monkeys/emergency-fallbacks.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ========== ENFORCEMENT MODULE IMPORTS ==========
import { driftWatcher } from "../lib/validators/drift-watcher.js";
import { initiativeEnforcer } from "../lib/validators/initiative-enforcer.js";
import { costTracker } from "../utils/cost-tracker.js";
import { PoliticalGuardrails } from "../lib/politicalGuardrails.js";
import { ProductValidator } from "../lib/productValidation.js";
import {
  checkFounderProtection,
  handleCostCeiling,
} from "../lib/site-monkeys/emergency-fallbacks.js";
//import { validateCompliance as validateVaultCompliance } from '../lib/vault.js';
// ================================================

// ==================== ORCHESTRATOR CLASS ====================

export class Orchestrator {
  constructor() {
    // Core dependencies
    this.memory = coreSystem;
    this.intelligence = intelligenceSystem;
    this.semanticAnalyzer = new SemanticAnalyzer();
    this.eliFramework = new EliFramework();
    this.roxyFramework = new RoxyFramework();
    this.personalitySelector = new PersonalitySelector();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "sk-dummy-key-for-testing",
    });
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "sk-ant-dummy-key-for-testing",
    });

    // Initialization flag
    this.initialized = false;

    // Performance tracking
    this.requestStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackUsed: 0,
      avgProcessingTime: 0,
      totalCost: 0,
      semanticAnalysisCost: 0,
      semanticAnalysisTime: 0,
      personalityEnhancements: 0,
    };

    // Logging
    this.log = (message) => console.log(`[ORCHESTRATOR] ${message}`);
    this.error = (message, error) =>
      console.error(`[ORCHESTRATOR ERROR] ${message}`, error);
  }

  async initialize() {
    try {
      this.log("[INIT] Initializing SemanticAnalyzer...");
      await this.semanticAnalyzer.initialize();
      this.initialized = true;
      this.log("[INIT] SemanticAnalyzer initialization complete");
      return true;
    } catch (error) {
      this.error(
        "[INIT] SemanticAnalyzer initialization failed - system will use fallback analysis",
        error,
      );
      this.initialized = false;
      return false;
    }
  }

  /**
   * Runs the 6-step enforcement chain on a response
   * CRITICAL: Must execute in exact order - DO NOT REORDER
   */
  async #runEnforcementChain(response, analysis, context, mode, personality) {
    let enforcedResponse = response;
    const complianceMetadata = {
      security_pass: true,
      enforcement_applied: [],
      overrides: [],
      confidence_adjustments: [],
      warnings: [],
    };

    try {
      // ========== STEP 1: DRIFT WATCHER ==========
      try {
        const driftResult = await driftWatcher.validate({
          semanticAnalysis: analysis || {},
          response: enforcedResponse,
          context: context,
        });

        if (driftResult.driftDetected) {
          enforcedResponse = driftResult.adjustedResponse || enforcedResponse;

          if (driftResult.confidenceAdjustment) {
            complianceMetadata.confidence_adjustments.push(
              driftResult.confidenceAdjustment,
            );
          }

          if (driftResult.warning) {
            complianceMetadata.warnings.push(driftResult.warning);
          }
        }

        complianceMetadata.enforcement_applied.push("drift_watcher");
      } catch (error) {
        this.error("Drift watcher failed:", error);
        complianceMetadata.warnings.push(
          "drift_watcher_error: " + error.message,
        );
      }

      // ========== STEP 2: INITIATIVE ENFORCER ==========
      try {
        const initiativeResult = await initiativeEnforcer.enforce({
          response: enforcedResponse,
          personality: personality || "eli",
          context: context,
        });

        if (initiativeResult.modified) {
          enforcedResponse = initiativeResult.response;
          complianceMetadata.overrides.push({
            module: "initiative_enforcer",
            reason: initiativeResult.reason,
          });
        }

        complianceMetadata.enforcement_applied.push("initiative_enforcer");
      } catch (error) {
        this.error("Initiative enforcer failed:", error);
        complianceMetadata.warnings.push(
          "initiative_enforcer_error: " + error.message,
        );
      }

      // ========== STEP 3: POLITICAL GUARDRAILS ==========
      try {
        const politicalResult = await PoliticalGuardrails.check({
          response: enforcedResponse,
          context: context,
        });

        if (politicalResult.politicalContentDetected) {
          enforcedResponse = politicalResult.neutralizedResponse;
          complianceMetadata.overrides.push({
            module: "political_guardrails",
            reason: politicalResult.reason,
          });
        }

        complianceMetadata.enforcement_applied.push("political_guardrails");
      } catch (error) {
        this.error("Political guardrails failed:", error);
        complianceMetadata.warnings.push(
          "political_guardrails_error: " + error.message,
        );
      }

      // ========== STEP 4: PRODUCT VALIDATION ==========
      try {
        const productResult = await ProductValidator.validate({
          response: enforcedResponse,
          context: context,
        });

        if (productResult.needsDisclosure) {
          enforcedResponse = productResult.responseWithDisclosure;
          complianceMetadata.overrides.push({
            module: "product_validation",
            reason: productResult.reason,
          });
        }

        complianceMetadata.enforcement_applied.push("product_validation");
      } catch (error) {
        this.error("Product validation failed:", error);
        complianceMetadata.warnings.push(
          "product_validation_error: " + error.message,
        );
      }

      // ========== STEP 5: FOUNDER PROTECTION ==========
      try {
        const founderResult = await checkFounderProtection({
          response: enforcedResponse,
          mode: mode || "truth_general",
          context: context,
        });

        if (founderResult.violationDetected) {
          enforcedResponse = founderResult.correctedResponse;
          complianceMetadata.overrides.push({
            module: "founder_protection",
            reason: founderResult.reason,
            violations: founderResult.violations,
          });
          complianceMetadata.security_pass = false;
        }

        complianceMetadata.enforcement_applied.push("founder_protection");
      } catch (error) {
        this.error("Founder protection failed:", error);
        complianceMetadata.warnings.push(
          "founder_protection_error: " + error.message,
        );
      }

      // ========== STEP 6: VAULT COMPLIANCE (Site Monkeys only) ==========
      if (mode === "site_monkeys" && context.sources?.hasVault) {
        try {
          // NOTE: validateVaultCompliance function not implemented yet
          // Using basic vault enforcement instead
          // TODO: Implement proper vault compliance validation

          complianceMetadata.enforcement_applied.push(
            "vault_compliance_pending",
          );
        } catch (error) {
          this.error("Vault compliance failed:", error);
          complianceMetadata.warnings.push(
            "vault_compliance_error: " + error.message,
          );
        }
      }
    } catch (error) {
      this.error("Enforcement chain critical failure:", error);
      complianceMetadata.warnings.push(
        "enforcement_chain_failure: " + error.message,
      );
      complianceMetadata.security_pass = false;
    }

    return {
      response: enforcedResponse,
      compliance_metadata: complianceMetadata,
    };
  }

  // ==================== MAIN ENTRY POINT ====================

  async processRequest(requestData) {
    const startTime = Date.now();
    const {
      message,
      userId,
      mode = "truth_general",
      sessionId,
      documentContext = null,
      vaultEnabled = false,
      conversationHistory = [],
    } = requestData;

    const vaultContext = requestData.vaultContext || null;

    try {
      this.log(`[START] User: ${userId}, Mode: ${mode}`);

      // STEP 1: Retrieve memory context (up to 2,500 tokens)
      const memoryContext = await this.#retrieveMemoryContext(userId, message);
      this.log(
        `[MEMORY] Retrieved ${memoryContext.tokens} tokens from ${memoryContext.count} memories`,
      );

      // STEP 2: Load document context (if provided)
      const documentData = documentContext
        ? await this.#loadDocumentContext(documentContext, sessionId)
        : null;
      if (documentData) {
        this.log(
          `[DOCUMENTS] Loaded ${documentData.tokens} tokens from ${documentData.filename}`,
        );
      }

      // STEP 3: Load vault (if Site Monkeys mode and enabled)
      const vaultData = vaultContext
        ? await this.#loadVaultContext(vaultContext, mode)
        : mode === "site_monkeys" && vaultEnabled
          ? await this.#loadVaultContext(null, mode)
          : null;
      if (vaultData) {
        this.log(`[VAULT] Loaded ${vaultData.tokens} tokens`);
      }

      // STEP 4: Assemble complete context
      const context = this.#assembleContext(
        memoryContext,
        documentData,
        vaultData,
      );
      context.userId = userId;
      context.mode = mode;
      context.sessionId = sessionId;
      context.message = message;
      this.log(`[CONTEXT] Total: ${context.totalTokens} tokens`);

      // STEP 5: Perform semantic analysis
      const analysisStartTime = Date.now();
      const analysis = await this.#performSemanticAnalysis(
        message,
        context,
        conversationHistory,
      );
      const analysisTime = Date.now() - analysisStartTime;
      this.requestStats.semanticAnalysisTime += analysisTime;
      this.log(
        `[ANALYSIS] Intent: ${analysis.intent} (${analysis.intentConfidence?.toFixed(2) || "N/A"}), Domain: ${analysis.domain} (${analysis.domainConfidence?.toFixed(2) || "N/A"}), Complexity: ${analysis.complexity.toFixed(2)}, Time: ${analysisTime}ms`,
      );

      // STEP 6: Calculate confidence
      const confidence = await this.#calculateConfidence(analysis, context);
      this.log(`[CONFIDENCE] Score: ${confidence.toFixed(3)}`);

      // STEP 7: Route to appropriate AI
      const aiResponse = await this.#routeToAI(
        message,
        context,
        analysis,
        confidence,
        mode,
        conversationHistory,
      );
      this.log(
        `[AI] Model: ${aiResponse.model}, Cost: $${aiResponse.cost.totalCost.toFixed(4)}`,
      );

      // STEP 8: Apply personality reasoning framework
      const personalityStartTime = Date.now();
      const personalityResponse = await this.#applyPersonality(
        aiResponse.response,
        analysis,
        mode,
        context,
      );
      const personalityTime = Date.now() - personalityStartTime;
      this.log(
        `[PERSONALITY] Applied: ${personalityResponse.personality}, Enhancements: ${personalityResponse.modificationsCount || 0}, Time: ${personalityTime}ms`,
      );
      if (personalityResponse.modificationsCount > 0) {
        this.requestStats.personalityEnhancements++;
      }

      // ========== RUN ENFORCEMENT CHAIN ==========
      this.log("[ENFORCEMENT] Running enforcement chain...");
      const enforcedResult = await this.#runEnforcementChain(
        personalityResponse.response,
        analysis,
        context,
        mode,
        personalityResponse.personality,
      );

      this.log(
        `[ENFORCEMENT] Applied ${enforcedResult.compliance_metadata.enforcement_applied.length} modules`,
      );
      if (enforcedResult.compliance_metadata.overrides.length > 0) {
        this.log(
          `[ENFORCEMENT] ${enforcedResult.compliance_metadata.overrides.length} overrides applied`,
        );
      }

      // STEP 9: Validate compliance (truth-first, mode enforcement)
      const validatedResponse = await this.#validateCompliance(
        enforcedResult.response,
        mode,
        analysis,
        confidence,
      );
      this.log(
        `[VALIDATION] Compliant: ${validatedResponse.compliant ? "PASS" : "FAIL"}`,
      );
      if (!validatedResponse.compliant && validatedResponse.issues.length > 0) {
        this.log(
          `[VALIDATION] Issues: ${validatedResponse.issues.join(", ")}`,
        );
      }
      if (validatedResponse.adjustments.length > 0) {
        this.log(
          `[VALIDATION] Adjustments: ${validatedResponse.adjustments.join(", ")}`,
        );
      }

      // STEP 10: Track performance
      const processingTime = Date.now() - startTime;
      this.#trackPerformance(startTime, true, false);
      this.log(`[COMPLETE] Processing time: ${processingTime}ms`);

      // STEP 11: Return complete response
      return {
        success: true,
        response: enforcedResult.response,
        token_usage: {
          session_total_tokens: aiResponse.cost?.tokens_used || 0,
          session_total_cost: aiResponse.cost?.session_total || 0,
          prompt_tokens: aiResponse.cost?.prompt_tokens || 0,
          completion_tokens: aiResponse.cost?.completion_tokens || 0,
          call_cost: aiResponse.cost?.call_cost || 0,
        },
        metadata: {
          // Context tracking
          memoryUsed: memoryContext.hasMemory,
          memoryTokens: memoryContext.tokens,
          documentTokens: documentData?.tokens || 0,
          vaultTokens: vaultData?.tokens || 0,
          totalContextTokens: context.totalTokens,

          // AI model tracking
          model: aiResponse.model,
          confidence: confidence,

          // Personality tracking
          personalityApplied: personalityResponse.personality,
          personalityEnhancements: personalityResponse.modificationsCount || 0,
          personalityReasoningApplied:
            personalityResponse.reasoningApplied || false,

          // Mode enforcement
          modeEnforced: mode,

          // Performance tracking
          processingTime: processingTime,
          semanticAnalysisTime: analysis.processingTime || 0,

          // Cost tracking
          cost: aiResponse.cost,
          semanticAnalysisCost: analysis.cost || 0,
          totalCostIncludingAnalysis:
            (aiResponse.cost?.totalCost || 0) + (analysis.cost || 0),

          // NEW: Compliance metadata
          compliance_metadata: enforcedResult.compliance_metadata,

          // NEW: Cost tracking
          cost_tracking: {
            session_cost: costTracker.getSessionCost(sessionId),
            ceiling: costTracker.getCostCeiling(mode),
            remaining:
              costTracker.getCostCeiling(mode) -
              costTracker.getSessionCost(sessionId),
          },

          // Fallback tracking
          fallbackUsed: false,
          semanticFallbackUsed: analysis.fallbackUsed || false,

          // Analysis details
          analysis: {
            intent: analysis.intent,
            intentConfidence: analysis.intentConfidence,
            domain: analysis.domain,
            domainConfidence: analysis.domainConfidence,
            complexity: analysis.complexity,
            complexityFactors: analysis.complexityFactors,
            emotionalTone: analysis.emotionalTone,
            emotionalWeight: analysis.emotionalWeight,
            cacheHit: analysis.cacheHit,
          },

          // Validation
          validation: {
            compliant: validatedResponse.compliant,
            issues: validatedResponse.issues,
            adjustments: validatedResponse.adjustments,
          },

          // Personality analysis details
          personalityAnalysis: personalityResponse.analysisApplied || {},
        },
        error: null,
      };
    } catch (error) {
      this.error(`Request failed: ${error.message}`, error);
      this.#trackPerformance(startTime, false, true);

      return await this.#handleEmergencyFallback(error, requestData);
    }
  }

  // ==================== STEP 1: RETRIEVE MEMORY CONTEXT ====================

  async #retrieveMemoryContext(userId, message) {
    try {
      const routingResult = { primaryCategory: "general" };

      // Use global.memorySystem which is already initialized
      let memories = { success: false, memories: "", count: 0 };

      if (
        global.memorySystem &&
        typeof global.memorySystem.retrieveMemory === "function"
      ) {
        try {
          const result = await global.memorySystem.retrieveMemory(
            userId,
            message,
          );

          // Check what we actually got back
          this.log(
            `[MEMORY-DEBUG] Result type: ${typeof result}, has memories: ${!!result?.memories}`,
          );

          if (result && result.memories) {
            // The result.memories might be an object or string - handle both
            const memoryText =
              typeof result.memories === "string"
                ? result.memories
                : JSON.stringify(result.memories);

            memories = {
              success: true,
              memories: memoryText,
              count: result.count || 1,
            };

            this.log(
              `[MEMORY-FIX] Successfully loaded ${memories.count} memories, ${memoryText.length} chars`,
            );
          }
        } catch (error) {
          this.error("[MEMORY] Retrieval error:", error);
        }
      }

      if (!memories || !memories.success) {
        this.log("[MEMORY] No memories found or retrieval failed");
        return {
          memories: "",
          tokens: 0,
          count: 0,
          categories: [],
          hasMemory: false,
        };
      }

      const memoryContent = memories.memories || "";
      const tokenCount = Math.ceil(memoryContent.length / 4);

      return {
        memories: memoryContent,
        tokens: tokenCount,
        count: memories.count || 0,
        categories: routingResult.primaryCategory
          ? [routingResult.primaryCategory]
          : [],
        hasMemory: tokenCount > 0,
      };
    } catch (error) {
      this.error("[MEMORY] Retrieval failed, continuing without memory", error);
      return {
        memories: "",
        tokens: 0,
        count: 0,
        categories: [],
        hasMemory: false,
      };
    }
  }

  // ==================== STEP 2: LOAD DOCUMENT CONTEXT ====================

  async #loadDocumentContext(documentContext, sessionId) {
    try {
      if (!documentContext) {
        console.log('[ORCHESTRATOR] [DOCUMENT] No document context provided');
        return null;
      }

      // FIX: extractedDocuments is a Map using "latest" key, not array with sessionId
      
      // Try sessionId first (for future compatibility)
      let latestDoc = extractedDocuments.get(sessionId);
      
      // Fallback to "latest" key (current implementation)
      if (!latestDoc) {
        latestDoc = extractedDocuments.get("latest");
      }

      if (!latestDoc) {
        console.log('[ORCHESTRATOR] [DOCUMENT] No documents found in storage');
        return null;
      }

      console.log(`[ORCHESTRATOR] [DOCUMENT] Loaded: ${latestDoc.filename}`);

      const content = latestDoc.fullContent || latestDoc.content;
      const tokens = Math.ceil(content.length / 4);

      // Enforce 10K token limit
      if (tokens > 10000) {
        const truncatedContent = content.substring(0, 40000);
        console.log(`[ORCHESTRATOR] [DOCUMENT] Truncated from ${tokens} to ~10000 tokens`);
        return {
          content: truncatedContent,
          tokens: 10000,
          filename: latestDoc.filename,
          processed: true,
          truncated: true
        };
      }

      return {
        content: content,
        tokens: tokens,
        filename: latestDoc.filename,
        wordCount: latestDoc.wordCount,
        processed: true
      };
    } catch (error) {
      console.error('[ORCHESTRATOR] [DOCUMENT] Error loading:', error);
      return null;
    }
  }

  // ==================== STEP 3: LOAD VAULT CONTEXT ====================

  async #loadVaultContext(vaultCandidate, mode) {
    try {
      console.log(`[ORCHESTRATOR] [VAULT] Loading vault for mode: ${mode}`);
      
      if (mode !== 'site_monkeys') {
        console.log('[ORCHESTRATOR] [VAULT] Skipped - not in site_monkeys mode');
        return null;
      }

      // Check all vault sources with detailed logging
      let vaultContent = null;
      
      // Source 1: Request context
      if (vaultCandidate?.content && vaultCandidate.content.length > 1000) {
        vaultContent = vaultCandidate.content;
        console.log('[ORCHESTRATOR] [VAULT] ✅ Loaded from request context');
      }
      
      // Source 2: Global cache
      if (!vaultContent && global.vaultContent && global.vaultContent.length > 1000) {
        vaultContent = global.vaultContent;
        console.log('[ORCHESTRATOR] [VAULT] ✅ Loaded from global cache');
      }
      
      // Source 3: Vault library
      if (!vaultContent) {
        vaultContent = generateVaultContext();
        if (vaultContent && vaultContent.length > 1000) {
          console.log('[ORCHESTRATOR] [VAULT] ✅ Loaded from vault library');
        }
      }

      if (!vaultContent || vaultContent.length < 1000) {
        console.log('[ORCHESTRATOR] [VAULT] ❌ Not available in any source');
        return null;
      }

      const tokens = Math.ceil(vaultContent.length / 4);
      console.log(`[ORCHESTRATOR] [VAULT] ✅ Available: ${tokens} tokens`);

      return {
        content: vaultContent,
        tokens: tokens,
        loaded: true
      };
    } catch (error) {
      console.error('[ORCHESTRATOR] [VAULT] Error:', error);
      return null;
    }
  }

  // ==================== STEP 4: ASSEMBLE CONTEXT ====================

  #assembleContext(memory, documents, vault) {
    // STEP 1: Validate context priority - vault wins over documents

    // STEP 3: Build context strings
    const memoryText = memory?.memories || "";
    const documentText = documents?.content || "";
    const vaultText = vault?.content || "";

    return {
      memory: memoryText,
      documents: documentText,
      vault: vaultText,
      totalTokens:
        (memory?.tokens || 0) + (documents?.tokens || 0) + (vault?.tokens || 0),
      sources: {
        hasMemory: memory?.hasMemory || false,
        hasDocuments: !!documents,
        hasVault: !!vault,
      },
    };
  }

  // ==================== STEP 5: PERFORM SEMANTIC ANALYSIS ====================

  async #performSemanticAnalysis(message, context, conversationHistory) {
    try {
      if (!this.initialized) {
        this.error(
          "[ANALYSIS] SemanticAnalyzer not initialized, using fallback",
        );
        return this.#generateFallbackAnalysis(message, context);
      }

      const semanticResult = await this.semanticAnalyzer.analyzeSemantics(
        message,
        {
          userId: context.userId || "unknown",
          conversationHistory: conversationHistory,
          availableMemory: context.sources?.hasMemory || false,
          documentContext: context.sources?.hasDocuments || false,
          vaultContext: context.sources?.hasVault || false,
          mode: context.mode,
          sessionId: context.sessionId,
        },
      );

      if (semanticResult.cost) {
        this.requestStats.semanticAnalysisCost += semanticResult.cost;
      }

      return {
        intent: semanticResult.intent,
        intentConfidence: semanticResult.intentConfidence,
        domain: semanticResult.domain,
        domainConfidence: semanticResult.domainConfidence,
        complexity: semanticResult.complexity,
        complexityFactors: semanticResult.complexityFactors,
        emotionalTone: semanticResult.emotionalTone,
        emotionalWeight: semanticResult.emotionalWeight,
        personalContext: semanticResult.personalContext,
        temporalContext: semanticResult.temporalContext,
        requiresMemory: semanticResult.requiresMemory,
        requiresCalculation: semanticResult.requiresCalculation,
        requiresComparison: semanticResult.requiresComparison,
        requiresCreativity: semanticResult.requiresCreativity,
        requiresExpertise:
          semanticResult.complexityFactors?.expertiseRequired || false,
        contextDependency: this.#calculateContextDependency(
          context,
          semanticResult,
        ),
        reasoning: `Semantic analysis via embeddings: Intent=${semanticResult.intent} (${semanticResult.intentConfidence?.toFixed(2)}), Domain=${semanticResult.domain} (${semanticResult.domainConfidence?.toFixed(2)})`,
        semanticDetails: semanticResult,
        cacheHit: semanticResult.cacheHit,
        processingTime: semanticResult.processingTime,
        cost: semanticResult.cost,
        fallbackUsed: false,
      };
    } catch (error) {
      this.error("[ANALYSIS] Semantic analysis failed, using fallback", error);
      return this.#generateFallbackAnalysis(message, context);
    }
  }

  #calculateContextDependency(context, semanticResult) {
    let dependency = 0.3;

    if (context.sources?.hasMemory) dependency += 0.2;
    if (context.sources?.hasDocuments) dependency += 0.2;
    if (context.sources?.hasVault) dependency += 0.3;
    if (semanticResult.requiresMemory) dependency += 0.1;
    if (semanticResult.personalContext) dependency += 0.1;

    return Math.min(1.0, dependency);
  }

  #generateFallbackAnalysis(message, context) {
    this.log("[ANALYSIS] Using fallback heuristic analysis");

    const messageLower = message.toLowerCase();

    let intent = "question";
    if (
      messageLower.includes("create") ||
      messageLower.includes("build") ||
      messageLower.includes("make")
    ) {
      intent = "command";
    } else if (
      messageLower.includes("should i") ||
      messageLower.includes("which option")
    ) {
      intent = "decision_making";
    } else if (
      messageLower.includes("how do i") ||
      messageLower.includes("solve")
    ) {
      intent = "problem_solving";
    }

    const domain = this.#determineDomain(message, context);

    const wordCount = message.split(/\s+/).length;
    const questionCount = (message.match(/\?/g) || []).length;
    const complexity = Math.min(1.0, wordCount / 100 + questionCount * 0.1);

    return {
      intent: intent,
      intentConfidence: 0.5,
      domain: domain,
      domainConfidence: 0.5,
      complexity: complexity,
      complexityFactors: {
        conceptualDepth: complexity,
        interdependencies: questionCount > 1 ? 0.5 : 0,
        ambiguity: 0,
        expertiseRequired: false,
      },
      emotionalTone: "neutral",
      emotionalWeight: 0,
      personalContext: /\b(my|I|me)\b/i.test(message),
      temporalContext: "general",
      requiresMemory: false,
      requiresCalculation: /\d/.test(message),
      requiresComparison: /\b(vs|versus|compare)\b/i.test(message),
      requiresCreativity: false,
      requiresExpertise: false,
      contextDependency: 0.5,
      reasoning: "Fallback heuristic analysis (semantic analyzer unavailable)",
      semanticDetails: null,
      cacheHit: false,
      processingTime: 0,
      cost: 0,
      fallbackUsed: true,
    };
  }

  #determineDomain(message, _context) {
    const msg = message.toLowerCase();

    if (/business|revenue|profit|customer|market|strategy|company/i.test(msg)) {
      return "business";
    }
    if (/code|software|programming|technical|system|api|database/i.test(msg)) {
      return "technical";
    }
    if (/feel|emotion|relationship|family|friend|personal/i.test(msg)) {
      return "personal";
    }
    if (/health|medical|doctor|wellness|fitness/i.test(msg)) {
      return "health";
    }

    return "general";
  }

  // ==================== STEP 6: CALCULATE CONFIDENCE ====================

  async #calculateConfidence(analysis, context) {
    try {
      let confidence = 0.85;

      if (analysis.intentConfidence !== undefined) {
        confidence *= 0.7 + analysis.intentConfidence * 0.3;
      }

      if (analysis.domainConfidence !== undefined) {
        confidence *= 0.8 + analysis.domainConfidence * 0.2;
      }

      if (analysis.complexity > 0.8) {
        confidence -= 0.15;
      } else if (analysis.complexity < 0.3) {
        confidence += 0.05;
      }

      if (context.sources?.hasMemory) confidence += 0.05;
      if (context.sources?.hasDocuments) confidence += 0.03;
      if (context.sources?.hasVault) confidence += 0.07;

      if (analysis.domain === "business" || analysis.domain === "technical") {
        confidence -= 0.1;
      }

      if (
        analysis.intent === "problem_solving" ||
        analysis.intent === "decision_making"
      ) {
        confidence -= 0.08;
      }

      if (analysis.fallbackUsed) {
        confidence -= 0.2;
        this.log("[CONFIDENCE] Reduced due to fallback analysis");
      }

      confidence = Math.max(0.0, Math.min(1.0, confidence));

      return confidence;
    } catch (error) {
      this.error("[CONFIDENCE] Calculation failed, using default", error);
      return 0.75;
    }
  }

  // ==================== STEP 7: ROUTE TO AI ====================

  async #routeToAI(
    message,
    context,
    analysis,
    confidence,
    mode,
    conversationHistory,
  ) {
    try {
      const useClaude =
        confidence < 0.85 ||
        analysis.requiresExpertise ||
        (mode === "business_validation" && analysis.complexity > 0.7);

      // ========== COST CEILING CHECK ==========
      if (useClaude && context.sessionId) {
        const estimatedCost = costTracker.estimateClaudeCost(message, context);
        const costCheck = costTracker.wouldExceedCeiling(
          context.sessionId,
          estimatedCost,
          mode,
        );

        if (costCheck.wouldExceed) {
          this.log(
            `[COST CEILING] Exceeded - Total: $${costCheck.totalCost.toFixed(4)}, Ceiling: $${costCheck.ceiling}`,
          );

          const fallbackResult = await handleCostCeiling({
            query: message,
            context: context,
            reason: "cost_ceiling_exceeded",
            currentCost: costCheck.totalCost,
          });

          return {
            response: fallbackResult.response,
            model: "cost_fallback",
            cost: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              inputCost: 0,
              outputCost: 0,
              totalCost: 0,
            },
          };
        }

        this.log(`[COST] Remaining budget: $${costCheck.remaining.toFixed(4)}`);
      }

      const model = useClaude ? "claude-sonnet-4.5" : "gpt-4";

      this.log(
        `[AI ROUTING] Using ${model} (confidence: ${confidence.toFixed(3)})`,
      );

      const contextString = this.#buildContextString(context, mode);

      const historyString =
        conversationHistory.length > 0
          ? "\n\nRecent conversation:\n" +
            conversationHistory
              .slice(-5)
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join("\n")
          : "";

      const systemPrompt = this.#buildSystemPrompt(mode, analysis);

      // VAULT-ONLY MODE: Pure vault queries bypass contamination
      const isVaultQuery =
        context.sources?.hasVault &&
        (message.toLowerCase().includes("vault") ||
          message.toLowerCase().includes("founder") ||
          message.toLowerCase().includes("directive") ||
          mode === "site_monkeys");

      let fullPrompt;
      if (isVaultQuery) {
        console.log("[AI] 🔒 PURE VAULT MODE - Zero contamination");
        fullPrompt = `You are a vault content specialist. Search through the ENTIRE vault systematically.
      
      VAULT CONTENT:
      ${context.vault}
      
      USER QUESTION: ${message}
      
      Instructions: Search thoroughly and quote directly from the vault. Reference document names when quoting.`;
        console.log(`[AI] Pure vault prompt: ${fullPrompt.length} chars`);
      } else {
        fullPrompt = `${systemPrompt}\n\n${contextString}${historyString}\n\nUser query: ${message}`;
      }

      let response, inputTokens, outputTokens;

      if (useClaude) {
        const claudeResponse = await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: fullPrompt }],
        });

        response = claudeResponse.content[0].text;
        inputTokens = claudeResponse.usage.input_tokens;
        outputTokens = claudeResponse.usage.output_tokens;
      } else {
        const gptResponse = await this.openai.chat.completions.create({
          model: "gpt-4",
          messages: isVaultQuery
            ? [{ role: "user", content: fullPrompt }]
            : [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `${contextString}${historyString}\n\n${message}`,
                },
              ],
          temperature: 0.7,
          max_tokens: 2000,
        });

        response = gptResponse.choices[0].message.content;
        inputTokens = gptResponse.usage.prompt_tokens;
        outputTokens = gptResponse.usage.completion_tokens;
      }

      const cost = this.#calculateCost(model, inputTokens, outputTokens);

      // Track cost in cost tracker
      if (context.sessionId) {
        await costTracker.recordCost(context.sessionId, cost.totalCost, model, {
          mode: mode,
        });
      }

      // Map model to personality for token tracking
      let personality = "claude"; // Default for claude model
      if (model === "gpt-4") {
        // For GPT-4, use mode or default to eli
        personality = mode === "business_validation" ? "eli" : "roxy";
      }
      
      trackApiCall(
        personality,
        inputTokens,
        outputTokens,
        context.sources?.hasVault ? (context.vault?.length || 0) / 4 : 0
      );

      return {
        response: response,
        model: model,
        cost: cost,
      };
    } catch (error) {
      this.error("[AI] Routing failed", error);
      throw new Error(`AI routing failed: ${error.message}`);
    }
  }

  // ==================== STEP 8: APPLY PERSONALITY ====================

  async #applyPersonality(response, analysis, mode, context) {
    try {
      const selection = this.personalitySelector.selectPersonality(
        analysis,
        mode,
        context,
      );

      this.log(
        `[PERSONALITY] Selected ${selection.personality} (confidence: ${selection.confidence.toFixed(2)}) - ${selection.reasoning}`,
      );

      let personalityResult;

      if (selection.personality === "eli") {
        personalityResult = await this.eliFramework.analyzeAndEnhance(
          response,
          analysis,
          mode,
          context,
        );
      } else {
        personalityResult = await this.roxyFramework.analyzeAndEnhance(
          response,
          analysis,
          mode,
          context,
        );
      }

      if (personalityResult.reasoningApplied) {
        this.log(
          `[PERSONALITY] ${selection.personality.toUpperCase()} analysis applied:`,
        );

        if (
          selection.personality === "eli" &&
          personalityResult.analysisApplied
        ) {
          const applied = personalityResult.analysisApplied;
          if (applied.risksIdentified?.length > 0) {
            this.log(
              `  - Identified ${applied.risksIdentified.length} unmentioned risks`,
            );
          }
          if (applied.assumptionsChallenged?.length > 0) {
            this.log(
              `  - Challenged ${applied.assumptionsChallenged.length} assumptions`,
            );
          }
          if (applied.downsideScenarios?.length > 0) {
            this.log(
              `  - Modeled ${applied.downsideScenarios.length} downside scenarios`,
            );
          }
          if (applied.blindSpotsFound?.length > 0) {
            this.log(
              `  - Found ${applied.blindSpotsFound.length} potential blind spots`,
            );
          }
        }

        if (
          selection.personality === "roxy" &&
          personalityResult.analysisApplied
        ) {
          const applied = personalityResult.analysisApplied;
          if (applied.opportunitiesIdentified?.length > 0) {
            this.log(
              `  - Identified ${applied.opportunitiesIdentified.length} opportunities`,
            );
          }
          if (applied.simplificationsFound?.length > 0) {
            this.log(
              `  - Found ${applied.simplificationsFound.length} simpler approaches`,
            );
          }
          if (applied.practicalSteps?.length > 0) {
            this.log(
              `  - Added ${applied.practicalSteps.length} practical next steps`,
            );
          }
        }
      }

      return {
        response: personalityResult.enhancedResponse,
        personality: selection.personality,
        modificationsCount: personalityResult.modificationsCount || 0,
        analysisApplied: personalityResult.analysisApplied || {},
        reasoningApplied: personalityResult.reasoningApplied || false,
        selectionReasoning: selection.reasoning,
      };
    } catch (error) {
      this.error(
        "[PERSONALITY] Personality framework failed, using original response",
        error,
      );

      return {
        response: response,
        personality: "none",
        modificationsCount: 0,
        analysisApplied: {},
        reasoningApplied: false,
        error: error.message,
      };
    }
  }

  // ==================== STEP 9: VALIDATE COMPLIANCE ====================

  async #validateCompliance(response, mode, analysis, confidence) {
    try {
      const issues = [];
      const adjustments = [];
      let adjustedResponse = response;

      if (
        confidence < 0.7 &&
        !response.includes("uncertain") &&
        !response.includes("don't know")
      ) {
        issues.push("Low confidence without uncertainty acknowledgment");
        adjustedResponse +=
          "\n\n⚠️ **Confidence Note:** This analysis has moderate certainty based on available information.";
        adjustments.push("Added uncertainty acknowledgment");
      }

      // Relaxed validation - only flag if response is VERY generic
      if (mode === "business_validation") {
        const hasBusinessContext = /risk|cost|revenue|profit|loss|budget|timeline|resource|decision|impact/i.test(
          response,
        );
        const hasSurvivalImpact = /survival|runway|cash flow|burn rate/i.test(
          response,
        );
        
        // Only flag if response has NO business context at all
        if (!hasBusinessContext && !hasSurvivalImpact) {
          issues.push("Response lacks business context in business validation mode");
        }
        
        // Don't require survival keywords on every response
        // (Original strict check removed)
      }

      const hasEngagementBait =
        /would you like me to|should i|want me to|let me know if/i.test(
          response,
        );
      if (hasEngagementBait) {
        issues.push("Contains engagement bait phrases");
        adjustments.push("Flagged engagement phrases for review");
      }

      const isComplete =
        response.length > 100 &&
        !response.endsWith("?") &&
        !response.includes("to be continued");

      if (!isComplete) {
        issues.push("Response may be incomplete");
      }

      const compliant = issues.length === 0;

      return {
        response: adjustedResponse,
        compliant: compliant,
        issues: issues,
        adjustments: adjustments,
      };
    } catch (error) {
      this.error(
        "[VALIDATION] Compliance check failed, using original response",
        error,
      );
      return {
        response: response,
        compliant: true,
        issues: [],
        adjustments: [],
      };
    }
  }

  // ==================== EMERGENCY FALLBACK ====================

  async #handleEmergencyFallback(error, requestData) {
    try {
      this.log("[FALLBACK] Emergency fallback triggered");

      const fallbackResponse =
        EMERGENCY_FALLBACKS.system_failure ||
        "I encountered a technical issue processing your request. I want to be honest: rather than provide potentially incorrect information, I need to acknowledge this limitation. Could you try rephrasing your question or breaking it into smaller parts?";

      return {
        success: false,
        response: fallbackResponse,
        metadata: {
          memoryUsed: false,
          memoryTokens: 0,
          documentTokens: 0,
          vaultTokens: 0,
          totalContextTokens: 0,
          model: "none",
          confidence: 0.0,
          personalityApplied: "none",
          modeEnforced: requestData.mode || "unknown",
          processingTime: 0,
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0,
          },
          fallbackUsed: true,
        },
        error: error.message,
      };
    } catch (fallbackError) {
      this.error("[FALLBACK] Emergency fallback also failed", fallbackError);

      return {
        success: false,
        response:
          "I'm experiencing technical difficulties and cannot process your request at this time. Please try again in a few moments.",
        metadata: {
          fallbackUsed: true,
          error: `Double failure: ${error.message} | ${fallbackError.message}`,
        },
        error: error.message,
      };
    }
  }

  // ==================== UTILITY METHODS ====================

  #buildContextString(context, _mode) {
    let contextStr = "";

    // ========== VAULT TAKES ABSOLUTE PRIORITY IN SITE MONKEYS MODE ==========
    if (context.sources?.hasVault && context.vault) {
      contextStr += `
  ═══════════════════════════════════════════════════════════════
  🍌 SITE MONKEYS BUSINESS VAULT (PRIMARY AUTHORITY)
  ═══════════════════════════════════════════════════════════════
  
  ${context.vault}
  
  ═══════════════════════════════════════════════════════════════
  END OF VAULT CONTENT
  ═══════════════════════════════════════════════════════════════
  
  ⚠️ CRITICAL INSTRUCTION FOR AI:
  The Site Monkeys Business Vault above is the AUTHORITATIVE source. Search through ALL documents in the vault using FLEXIBLE matching:
  
  SEARCH RULES:
  - "founder directives" = look for "Founders_Directive", "Founder's Directive", or any directive content
  - "company rules" = look for operational directives and procedures
  - "pricing" = look for pricing rules and business model info
  - "what must this system do" = look for operational requirements and constraints
  
  RESPONSE RULES:
  - Quote the EXACT text from the vault that answers the question
  - If multiple documents contain relevant info, reference the document name [filename]
  - Search thoroughly through ALL vault content before saying you can't find something
  - Do NOT add interpretation beyond what's written in the vault
  - Only say "I don't see that specific information" if genuinely no relevant content exists after thorough search
  
  The user is asking about vault content - search comprehensively and quote directly.

  ═══════════════════════════════════════════════════════════════
  `;

      console.log(
        "[ORCHESTRATOR] ✅ Vault injected as PRIMARY context - documents will be ignored for vault queries",
      );

      // STOP HERE - Do not add document context when vault is present
      if (context.sources?.hasMemory && context.memory) {
        const memoryCount = Math.ceil(context.memory.length / 200); // Estimate conversation count
        contextStr += `\n\n**📝 MEMORY CONTEXT AVAILABLE (${memoryCount} previous interactions):**\n`;
        contextStr += `IMPORTANT: You have access to the user's previous conversations below. Use this information to answer questions about past discussions.\n\n`;
        contextStr += `${context.memory}\n\n`;
        contextStr += `⚠️ CRITICAL: If the user asks about past conversations and information is present above, USE IT to answer. Do not claim you lack access to previous conversations.\n`;
      }

      return contextStr;
    }

    // ========== FALLBACK: NO VAULT - USE DOCUMENTS AND MEMORY ==========
    console.log(
      "[ORCHESTRATOR] No vault available - using standard context priority",
    );

    if (context.sources?.hasMemory && context.memory) {
      const memoryCount = Math.ceil(context.memory.length / 200); // Estimate conversation count
      contextStr += `\n\n**📝 MEMORY CONTEXT AVAILABLE (${memoryCount} previous interactions):**\n`;
      contextStr += `IMPORTANT: You have access to relevant information from past conversations with this user. Use this information to provide informed, personalized responses.\n\n`;
      contextStr += `**Relevant Information from Past Conversations:**\n${context.memory}\n\n`;
      contextStr += `⚠️ CRITICAL: If the user asks about past conversations and information is present above, USE IT to answer. Do not claim you lack access to previous conversations.\n`;
    } else {
      contextStr += `\n\n**📝 MEMORY STATUS:** No previous conversation history available for this query.\n`;
    }

    if (context.sources?.hasDocuments && context.documents) {
      contextStr += `\n\n**Uploaded Document Context:**\n`;
      contextStr += `IMPORTANT: The user uploaded a document. Use this content to answer questions about the document.\n\n`;
      contextStr += `${context.documents}\n\n`;
      contextStr += `⚠️ CRITICAL: If the user asks about the document and content is present above, USE IT to answer. Do not claim you cannot access the document.\n`;
    }

    return contextStr;
  }

  #buildSystemPrompt(mode, _analysis) {
    const modeConfig = MODES[mode];

    let prompt = `You are a truth-first AI assistant. Your priorities are: Truth > Helpfulness > Engagement.

Core Principles:
- Admit uncertainty openly when you don't know something
- Provide complete answers that respect the user's time
- Never use engagement bait phrases like "Would you like me to elaborate?"
- Challenge assumptions and surface risks
- Be honest about limitations

Mode: ${modeConfig?.display_name || mode}
`;

    if (mode === "business_validation") {
      prompt += `\nBusiness Validation Requirements:
- Always analyze downside scenarios and risks
- Consider cash flow and survival impact
- Provide actionable recommendations with clear trade-offs
- Surface hidden costs and dependencies
`;
    }

    if (mode === "site_monkeys") {
      prompt += `\nSite Monkeys Mode:
- Use vault content as authoritative business guidance
- Enforce founder protection principles
- Focus on operational integrity and quality
- Apply business-specific frameworks and constraints
`;
    }

    return prompt;
  }

  #calculateCost(model, inputTokens, outputTokens) {
    const rates = {
      "gpt-4": { input: 0.01, output: 0.03 },
      "claude-sonnet-4.5": { input: 0.003, output: 0.015 },
    };

    const rate = rates[model] || rates["gpt-4"];

    const inputCost = (inputTokens / 1000) * rate.input;
    const outputCost = (outputTokens / 1000) * rate.output;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost: inputCost,
      outputCost: outputCost,
      totalCost: totalCost,
    };
  }

  #trackPerformance(startTime, success, fallbackUsed) {
    this.requestStats.totalRequests++;

    if (success) {
      this.requestStats.successfulRequests++;
    } else {
      this.requestStats.failedRequests++;
    }

    if (fallbackUsed) {
      this.requestStats.fallbackUsed++;
    }

    const processingTime = Date.now() - startTime;
    const count = this.requestStats.totalRequests;
    this.requestStats.avgProcessingTime =
      (this.requestStats.avgProcessingTime * (count - 1) + processingTime) /
      count;
  }

  getStats() {
    return {
      ...this.requestStats,
      successRate:
        this.requestStats.successfulRequests / this.requestStats.totalRequests,
      fallbackRate:
        this.requestStats.fallbackUsed / this.requestStats.totalRequests,
      timestamp: new Date().toISOString(),
    };
  }
}

export default Orchestrator;
