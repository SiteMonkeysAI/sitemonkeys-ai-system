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
import _ from "lodash";
// ========== ENFORCEMENT MODULE IMPORTS ==========
import { driftWatcher } from "../lib/validators/drift-watcher.js";
import { initiativeEnforcer } from "../lib/validators/initiative-enforcer.js";
import { memoryUsageEnforcer } from "../lib/validators/memory-usage-enforcer.js";
import { costTracker } from "../utils/cost-tracker.js";
import { PoliticalGuardrails } from "../lib/politicalGuardrails.js";
import { ProductValidator } from "../lib/productValidation.js";
import {
  checkFounderProtection,
  handleCostCeiling,
} from "../lib/site-monkeys/emergency-fallbacks.js";
import { logMemoryOperation } from "../routes/debug.js";
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

    // Logging with timestamp for Railway visibility
    this.log = (message) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ORCHESTRATOR] ${message}`);
      // Force flush for Railway
      if (process.stdout && process.stdout.write) {
        process.stdout.write("");
      }
    };
    this.error = (message, error) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [ORCHESTRATOR ERROR] ${message}`, error || "");
      // Force flush for Railway
      if (process.stderr && process.stderr.write) {
        process.stderr.write("");
      }
    };
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
   * Runs the 7-step enforcement chain on a response
   * CRITICAL: Must execute in exact order - DO NOT REORDER
   * Sacred order: RETRIEVE → INJECT → GENERATE → VALIDATE
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

      // ========== STEP 3: MEMORY USAGE ENFORCER ==========
      try {
        const memoryResult = await memoryUsageEnforcer.enforce({
          response: enforcedResponse,
          context: context,
        });

        if (memoryResult.modified) {
          enforcedResponse = memoryResult.response;
          complianceMetadata.overrides.push({
            module: "memory_usage_enforcer",
            reason: memoryResult.reason,
            matchedPhrase: memoryResult.matchedPhrase,
            memoryTokens: memoryResult.memoryTokens,
          });
        }

        complianceMetadata.enforcement_applied.push("memory_usage_enforcer");
      } catch (error) {
        this.error("Memory usage enforcer failed:", error);
        complianceMetadata.warnings.push(
          "memory_usage_enforcer_error: " + error.message,
        );
      }

      // ========== STEP 4: POLITICAL GUARDRAILS ==========
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

      // ========== STEP 5: PRODUCT VALIDATION ==========
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

      // ========== STEP 6: FOUNDER PROTECTION ==========
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

      // ========== STEP 7: VAULT COMPLIANCE (Site Monkeys only) ==========
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
      // Enhanced telemetry for memory injection verification
      if (memoryContext.hasMemory) {
        this.log(`[MEMORY] ✓ Memory WILL be injected into prompt (${memoryContext.tokens} tokens)`);
        if (memoryContext.memory_ids && memoryContext.memory_ids.length > 0) {
          this.log(`[MEMORY] Memory IDs: [${memoryContext.memory_ids.join(', ')}]`);
        }
      } else {
        this.log(`[MEMORY] ✗ No memory to inject (first conversation or no relevant context)`);
      }

      // STEP 2: Load document context (always check if document available)
      // Check extractedDocuments Map first, then use documentContext if provided
      const documentData = await this.#loadDocumentContext(documentContext, sessionId);
      if (documentData) {
        this.log(
          `[DOCUMENTS] Loaded ${documentData.tokens} tokens from ${documentData.filename}`,
        );
      } else {
        this.log("[DOCUMENTS] No document available");
      }

      // STEP 3: Load vault (if Site Monkeys mode and enabled)
      let vaultData = vaultContext
        ? await this.#loadVaultContext(vaultContext)
        : mode === "site_monkeys" && vaultEnabled
          ? await this.#loadVaultContext(userId, sessionId)
          : null;
      
      // Apply intelligent section selection to vault content
      if (vaultData && vaultData.fullContent) {
        const selection = this.#selectRelevantVaultSections(vaultData.fullContent, message);
        vaultData = {
          content: selection.content,
          tokens: selection.tokens,
          loaded: true,
          sectionsSelected: selection.sectionsSelected,
          totalSections: selection.totalSections,
          selectionReason: selection.selectionReason,
        };
        this.log(`[VAULT] Selected ${selection.sectionsSelected}${selection.totalSections ? `/${selection.totalSections}` : ''} sections: ${selection.tokens} tokens (${selection.selectionReason})`);
      } else if (vaultData) {
        this.log(`[VAULT] Loaded ${vaultData.tokens} tokens (no selection applied)`);
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

      // ========== RUN ENFORCEMENT CHAIN (BEFORE PERSONALITY) ==========
      // CRITICAL FIX: Enforcement must run BEFORE personality to ensure
      // business rules and security policies are applied to raw AI output
      this.log("[ENFORCEMENT] Running enforcement chain on AI response...");
      const enforcedResult = await this.#runEnforcementChain(
        aiResponse.response,
        analysis,
        context,
        mode,
        null, // No personality yet
      );

      this.log(
        `[ENFORCEMENT] Applied ${enforcedResult.compliance_metadata.enforcement_applied.length} modules`,
      );
      if (enforcedResult.compliance_metadata.overrides.length > 0) {
        this.log(
          `[ENFORCEMENT] ${enforcedResult.compliance_metadata.overrides.length} overrides applied`,
        );
        // Enhanced telemetry: Log specific enforcement actions
        enforcedResult.compliance_metadata.overrides.forEach((override) => {
          this.log(`[ENFORCEMENT] - ${override.module}: ${override.reason || 'applied'}`);
          if (override.module === 'memory_usage_enforcer') {
            this.log(`[ENFORCEMENT] ⚠️  MEMORY VIOLATION: AI claimed ignorance despite ${override.memoryTokens} tokens of memory`);
          }
        });
      }

      // STEP 8: Apply personality reasoning framework (AFTER ENFORCEMENT)
      // Personality enhances the already-compliant response
      const personalityStartTime = Date.now();
      const personalityResponse = await this.#applyPersonality(
        enforcedResult.response,
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

      // STEP 9: Validate compliance (truth-first, mode enforcement)
      const validatedResponse = await this.#validateCompliance(
        personalityResponse.response,
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
        response: personalityResponse.response,
        metadata: {
          // Context tracking
          memoryUsed: memoryContext.hasMemory,
          memoryTokens: context.tokenBreakdown?.memory || memoryContext.tokens,
          memory_ids: memoryContext.memory_ids || [],
          memory_count: memoryContext.count || 0,
          documentTokens: context.tokenBreakdown?.documents || (documentData?.tokens || 0),
          vaultTokens: context.tokenBreakdown?.vault || (vaultData?.tokens || 0),
          totalContextTokens: context.totalTokens,

          // Memory retrieval telemetry (Issue #206, enhanced in Issue #208)
          memory_retrieval: {
            method: "sql_keyword_category_filter",
            memories_considered: memoryContext.count || 0,
            memories_injected: memoryContext.count || 0,
            tokens_injected: memoryContext.tokens || 0,
            categories_searched: memoryContext.categories || [],
            selection_criteria: "relevance_recency_hybrid",
            injected_memory_ids: memoryContext.memory_ids || [],
            injected_tokens_total: memoryContext.tokens || 0
          },

          // Token budget compliance
          budgetCompliance: context.budgetCompliance || {},
          vaultSectionsSelected: vaultData?.sectionsSelected,
          vaultSelectionReason: vaultData?.selectionReason,

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

          // FIX #5: Add token_usage to API response for frontend display
          token_usage: {
            prompt_tokens: aiResponse.cost?.inputTokens || 0,
            completion_tokens: aiResponse.cost?.outputTokens || 0,
            total_tokens: (aiResponse.cost?.inputTokens || 0) + (aiResponse.cost?.outputTokens || 0),
            context_tokens: {
              memory: context.tokenBreakdown?.memory || 0,
              documents: context.tokenBreakdown?.documents || 0,
              vault: context.tokenBreakdown?.vault || 0,
              total_context: context.totalTokens || 0,
            },
            cost_usd: aiResponse.cost?.totalCost || 0,
            cost_display: `$${(aiResponse.cost?.totalCost || 0).toFixed(4)}`,
          },

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

      // Add debug info in private/debug mode
      if (process.env.DEPLOYMENT_TYPE === 'private' || process.env.DEBUG_MODE === 'true') {
        result._debug = {
          memory_injected: memoryContext.hasMemory,
          memory_count: memoryContext.count,
          memory_ids: [], // IDs are logged separately in debug endpoint
          category: routing?.primaryCategory || 'unknown'
        };
      }

      return result;
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

          // Enhanced memory result handling - support multiple return formats
          if (result) {
            let memoryText = "";
            let memoryCount = 0;

            // Format 1: result.memories is a string
            if (typeof result.memories === "string" && result.memories.length > 0) {
              memoryText = result.memories;
              memoryCount = result.count || 1;
            }
            // Format 2: result.memories is an array of memory objects
            else if (Array.isArray(result.memories) && result.memories.length > 0) {
              memoryText = result.memories
                .map((m) => {
                  if (typeof m === "string") return m;
                  if (m.content) return m.content;
                  if (m.text) return m.text;
                  return JSON.stringify(m);
                })
                .join("\n\n");
              memoryCount = result.memories.length;
            }
            // Format 3: result.memories is an object
            else if (typeof result.memories === "object" && result.memories !== null) {
              memoryText = JSON.stringify(result.memories, null, 2);
              memoryCount = result.count || 1;
            }
            // Format 4: result itself is the memory string
            else if (typeof result === "string" && result.length > 0) {
              memoryText = result;
              memoryCount = 1;
            }

            if (memoryText.length > 0) {
              memories = {
                success: true,
                memories: memoryText,
                count: memoryCount,
              };

              this.log(
                `[MEMORY] Successfully loaded ${memoryCount} memories, ${memoryText.length} chars`,
              );
            } else {
              this.log("[MEMORY] Result received but no usable memory content found");
            }
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
          memory_ids: [],
        };
      }

      const memoryContent = memories.memories || "";
      const tokenCount = Math.ceil(memoryContent.length / 4);

      // Extract memory IDs from the result - ensure consistency
      let memoryIds = memories.memory_ids || [];

      // Fix inconsistency: if we have memories but no IDs, try to extract them
      if (tokenCount > 0 && memoryIds.length === 0 && memories.count > 0) {
        this.log(`[MEMORY] WARNING: memory_count=${memories.count} but memory_ids=[] - inconsistency detected`);
        // Try to get IDs from the memories array if available
        if (Array.isArray(memories.memories)) {
          memoryIds = memories.memories.map(m => m.id).filter(id => id !== undefined);
        }
      }

      // Debug logging hook for test harness (memory injection)
      logMemoryOperation(userId, 'inject', {
        memory_injected: tokenCount > 0,
        memory_ids: memoryIds,
        token_count: tokenCount
      });

      return {
        memories: memoryContent,
        tokens: tokenCount,
        count: memories.count || 0,
        categories: routingResult.primaryCategory
          ? [routingResult.primaryCategory]
          : [],
        hasMemory: tokenCount > 0,
        memory_ids: memoryIds,
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
      // Access extractedDocuments Map correctly (stored with .set("latest", {...}))
      const latestDoc = extractedDocuments.get("latest");
      
      if (!latestDoc) {
        this.log("[DOCUMENTS] No document found in storage");
        return null;
      }

      // Use fullContent if available, otherwise fall back to preview content
      const documentContent = latestDoc.fullContent || latestDoc.content;
      
      if (!documentContent || documentContent.length === 0) {
        this.log("[DOCUMENTS] Document has no content");
        return null;
      }
      
      const tokens = Math.ceil(documentContent.length / 4);

      // FEATURE FLAG: ENABLE_STRICT_DOC_BUDGET
      // Spec calls for ≤1,000 tokens, current is 10,000
      // Default to 10K for backward compatibility
      const docBudget = process.env.ENABLE_STRICT_DOC_BUDGET === 'true' ? 1000 : 10000;

      if (tokens > docBudget) {
        // 1 token ≈ 4 chars, so multiply by 4
        const truncated = documentContent.substring(0, docBudget * 4);
        this.log(`[DOCUMENTS] Truncated from ${tokens} to ~${docBudget} tokens`);

        return {
          content: truncated,
          tokens: docBudget,
          filename: latestDoc.filename,
          processed: true,
          truncated: true,
        };
      }

      this.log(`[DOCUMENTS] Loaded: ${latestDoc.filename} (${tokens} tokens)`);
      return {
        content: documentContent,
        tokens: tokens,
        filename: latestDoc.filename,
        processed: true,
        truncated: false,
      };
    } catch (error) {
      this.error(
        "[DOCUMENTS] Loading failed, continuing without documents",
        error,
      );
      return null;
    }
  }

  // ==================== STEP 3: LOAD VAULT CONTEXT ====================

  async #loadVaultContext(vaultCandidate, _maybeSession) {
    try {
      // 1️⃣ If vault object was passed directly from the server
      if (vaultCandidate && vaultCandidate.content && vaultCandidate.loaded) {
        const tokens = Math.ceil(vaultCandidate.content.length / 4);
        this.log(`[VAULT] Loaded from request: ${tokens} tokens (full vault)`);
        return {
          content: vaultCandidate.content,
          fullContent: vaultCandidate.content, // Store full vault for selection
          tokens,
          loaded: true,
        };
      }

      // 2️⃣ Otherwise try the global cache
      if (global.vaultContent && global.vaultContent.length > 1000) {
        const tokens = Math.ceil(global.vaultContent.length / 4);
        this.log(`[VAULT] Loaded from global: ${tokens} tokens (full vault)`);
        return {
          content: global.vaultContent,
          fullContent: global.vaultContent, // Store full vault for selection
          tokens,
          loaded: true,
        };
      }

      // FIX #2: Better error handling - provide more context
      // 3️⃣ No vault found - provide helpful diagnostic info
      this.log("[VAULT] Not available - vault requires site_monkeys mode and vault content to be loaded");
      this.log(`[VAULT] Diagnostic: global.vaultContent exists: ${!!global.vaultContent}, length: ${global.vaultContent?.length || 0}`);
      return null;
    } catch (error) {
      // FIX #2: Improved error logging with more context
      this.error("[VAULT] Loading failed - Error details:", {
        message: error.message,
        hasGlobalVault: !!global.vaultContent,
        hasVaultCandidate: !!vaultCandidate,
      });
      return null;
    }
  }

  // ==================== INTELLIGENT VAULT SECTION SELECTION ====================
  
  /**
   * Selects relevant vault sections based on query analysis
   * Enforces 9,000 token maximum for vault content
   * @param {string} vaultContent - Full vault content
   * @param {string} query - User query
   * @returns {object} Selected vault sections with metadata
   */
  #selectRelevantVaultSections(vaultContent, query) {
    const MAX_VAULT_TOKENS = 9000;
    
    try {
      if (!vaultContent || vaultContent.length === 0) {
        return { content: "", tokens: 0, sectionsSelected: 0 };
      }

      // Keywords to look for in query
      const queryLower = query.toLowerCase();
      const keywords = this.#extractKeywords(queryLower);
      
      // Special handling for "what's in the vault" type queries - return full inventory
      const isInventoryQuery = /what'?s?\s+(in|inside|stored|contained|within)\s+(the\s+)?vault/i.test(query) ||
                              /list\s+(all|everything|vault|contents)/i.test(query) ||
                              /show\s+(me\s+)?(all|everything|vault|contents)/i.test(query);
      
      if (isInventoryQuery) {
        this.log("[VAULT SELECTION] Inventory query detected - allowing full vault access");
        const targetTokens = Math.min(MAX_VAULT_TOKENS, Math.ceil(vaultContent.length / 4));
        const targetChars = targetTokens * 4;
        
        if (vaultContent.length <= targetChars) {
          return {
            content: vaultContent,
            tokens: Math.ceil(vaultContent.length / 4),
            sectionsSelected: 1,
            selectionReason: "Full vault for inventory query"
          };
        }
        
        // Truncate intelligently for inventory
        const truncated = this.#truncateVaultIntelligently(vaultContent, targetChars);
        return {
          content: truncated,
          tokens: Math.ceil(truncated.length / 4),
          sectionsSelected: 1,
          selectionReason: "Truncated vault for inventory query"
        };
      }

      // ENHANCEMENT: Detect folder/file queries (from spec - Priority 1)
      const isFolderQuery = /(?:folder|directory|files?|documents?)\s+(?:named|called|labeled|in|called)\s+(\w+)/i.test(query);
      const folderMatch = query.match(/(?:folder|directory|files?|documents?)\s+(?:named|called|labeled|in|called)\s+(\w+)/i);
      
      if (isFolderQuery && folderMatch) {
        const folderName = folderMatch[1].toLowerCase();
        this.log(`[VAULT SELECTION] Folder query detected: "${folderName}"`);
        
        // Find sections that reference this folder
        const sections = this.#splitVaultIntoSections(vaultContent);
        const folderSections = sections.filter(section => {
          const sectionLower = section.toLowerCase();
          return sectionLower.includes(folderName) || 
                 sectionLower.includes(`/${folderName}/`) ||
                 sectionLower.includes(`folder: ${folderName}`) ||
                 sectionLower.includes(`directory: ${folderName}`);
        });
        
        if (folderSections.length > 0) {
          this.log(`[VAULT SELECTION] Found ${folderSections.length} sections matching folder "${folderName}"`);
          
          // Return folder sections within token budget
          let selectedContent = [];
          let totalTokens = 0;
          let sectionsUsed = 0;
          
          for (const section of folderSections) {
            const sectionTokens = Math.ceil(section.length / 4);
            if (totalTokens + sectionTokens <= MAX_VAULT_TOKENS) {
              selectedContent.push(section);
              totalTokens += sectionTokens;
              sectionsUsed++;
            }
          }
          
          return {
            content: selectedContent.join("\n\n"),
            tokens: totalTokens,
            sectionsSelected: sectionsUsed,
            totalSections: folderSections.length,
            selectionReason: `Folder "${folderName}" sections`
          };
        }
      }

      // Split vault into sections (by document markers or paragraphs)
      const sections = this.#splitVaultIntoSections(vaultContent);
      
      if (sections.length === 0) {
        // Fallback: treat entire vault as one section
        const targetTokens = Math.min(MAX_VAULT_TOKENS, Math.ceil(vaultContent.length / 4));
        const targetChars = targetTokens * 4;
        const content = vaultContent.substring(0, targetChars);
        return {
          content,
          tokens: Math.ceil(content.length / 4),
          sectionsSelected: 1,
          selectionReason: "Full vault (no sections found)"
        };
      }

      // Score each section by relevance (with enhanced folder/file name matching)
      const scoredSections = sections.map(section => ({
        content: section,
        score: this.#scoreVaultSection(section, keywords, queryLower),
        tokens: Math.ceil(section.length / 4)
      }));

      // Sort by relevance score (descending)
      scoredSections.sort((a, b) => b.score - a.score);

      // ENHANCEMENT: Multi-section retrieval (from spec)
      // Instead of just taking top sections, ensure we get variety if multiple sections score well
      let selectedContent = [];
      let totalTokens = 0;
      let sectionsUsed = 0;
      const MIN_SECTION_SCORE = 10; // Only include sections with meaningful relevance

      for (const section of scoredSections) {
        // Skip sections with very low scores unless we have nothing
        if (section.score < MIN_SECTION_SCORE && sectionsUsed > 0) {
          break;
        }

        if (totalTokens + section.tokens <= MAX_VAULT_TOKENS) {
          selectedContent.push(section.content);
          totalTokens += section.tokens;
          sectionsUsed++;
        } else {
          // Try to fit partial section if we have room
          const remainingTokens = MAX_VAULT_TOKENS - totalTokens;
          if (remainingTokens > 500 && section.score >= 50) { // Only high-scoring sections
            const partialChars = remainingTokens * 4;
            const partial = section.content.substring(0, partialChars);
            selectedContent.push(partial);
            totalTokens += Math.ceil(partial.length / 4);
            sectionsUsed++;
          }
          break;
        }
      }

      const finalContent = selectedContent.join("\n\n");
      
      this.log(`[VAULT SELECTION] Selected ${sectionsUsed}/${sections.length} sections, ${totalTokens} tokens`);
      
      // Calculate better selection reason
      let selectionReason = `Selected ${sectionsUsed} relevant sections`;
      if (scoredSections[0]?.score >= 50) {
        selectionReason = `High relevance match (${sectionsUsed} sections)`;
      } else if (sectionsUsed === sections.length) {
        selectionReason = `All sections relevant (${sectionsUsed} sections)`;
      }
      
      return {
        content: finalContent,
        tokens: totalTokens,
        sectionsSelected: sectionsUsed,
        totalSections: sections.length,
        selectionReason: selectionReason
      };

    } catch (error) {
      this.error("[VAULT SELECTION] Selection failed, using truncated vault", error);
      
      // Fallback: truncate to MAX_VAULT_TOKENS
      const maxChars = MAX_VAULT_TOKENS * 4;
      const truncated = vaultContent.substring(0, maxChars);
      
      return {
        content: truncated,
        tokens: Math.ceil(truncated.length / 4),
        sectionsSelected: 1,
        selectionReason: "Fallback truncation"
      };
    }
  }

  /**
   * Extract relevant keywords from query
   * Enhanced to better identify folder names, file names, and important nouns
   */
  #extractKeywords(queryLower) {
    // Remove common words
    const stopWords = new Set(['what', 'is', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'show', 'me', 'list', 'all']);
    
    const words = queryLower.match(/\b\w+\b/g) || [];
    const keywords = words.filter(word => word.length > 2 && !stopWords.has(word));
    
    // Identify potential folder/file names (capitalized words or quoted terms in original query)
    // Note: We're working with lowercased query, but we can still identify longer meaningful terms
    const importantTerms = keywords.filter(word => word.length > 4);
    
    return [...new Set([...keywords, ...importantTerms])]; // Remove duplicates
  }

  /**
   * Split vault content into logical sections
   */
  #splitVaultIntoSections(vaultContent) {
    // Look for document boundaries or major section markers
    const patterns = [
      /={3,}/g,  // === separators
      /\n\n[A-Z][^\n]+\n={2,}/g, // Markdown headers
      /\[DOCUMENT:\s*[^\]]+\]/gi, // Document markers
      /FILE:\s*[^\n]+/gi, // File markers
    ];

    let sections = [];
    let lastIndex = 0;
    
    // Try to find natural section boundaries
    const allMatches = [];
    patterns.forEach(pattern => {
      const matches = [...vaultContent.matchAll(pattern)];
      matches.forEach(match => {
        allMatches.push({ index: match.index, text: match[0] });
      });
    });

    // Sort by position
    allMatches.sort((a, b) => a.index - b.index);

    // Split at boundaries
    if (allMatches.length > 0) {
      allMatches.forEach(match => {
        if (match.index > lastIndex) {
          const section = vaultContent.substring(lastIndex, match.index).trim();
          if (section.length > 100) { // Minimum section size
            sections.push(section);
          }
        }
        lastIndex = match.index;
      });
      
      // Add final section
      const finalSection = vaultContent.substring(lastIndex).trim();
      if (finalSection.length > 100) {
        sections.push(finalSection);
      }
    }

    // Fallback: split by large paragraphs if no sections found
    if (sections.length === 0) {
      sections = vaultContent.split(/\n\n+/).filter(s => s.length > 200);
    }

    // If still no sections, split by size
    if (sections.length === 0) {
      const chunkSize = 4000; // ~1000 tokens per chunk
      for (let i = 0; i < vaultContent.length; i += chunkSize) {
        sections.push(vaultContent.substring(i, i + chunkSize));
      }
    }

    return sections.filter(s => s.length > 0);
  }

  /**
   * Score a vault section by relevance to query
   * Enhanced with folder and file name matching (Priority 1 & 2 from spec)
   */
  #scoreVaultSection(section, keywords, queryLower) {
    let score = 0;
    const sectionLower = section.toLowerCase();

    // PRIORITY 1: Folder name matching (from spec)
    // Check if section contains folder indicators and match against query
    const folderPatterns = [
      /folder[:\s]+([^\n]{1,200})/i,
      /directory[:\s]+([^\n]{1,200})/i,
      /path[:\s]+([^\n\/]{1,200})/i,
      /\/([^\/\n]{1,100})\//g, // Extract folder names from paths, limit to 100 chars
    ];

    for (const pattern of folderPatterns) {
      const matches = section.match(pattern);
      if (matches) {
        for (const match of Array.isArray(matches) ? matches : [matches]) {
          const folderName = (match[1] || match).toLowerCase();
          // Check if any keyword matches the folder name
          for (const keyword of keywords) {
            if (folderName.includes(keyword) || keyword.includes(folderName)) {
              score += 50; // High priority boost for folder match
              this.log(`[VAULT] Folder match: "${folderName}" matches keyword "${keyword}"`);
            }
          }
        }
      }
    }

    // PRIORITY 2: File name matching (from spec)
    // Look for file name indicators in section
    const filePatterns = [
      /file:\s*([^\n]{1,200})/i,
      /document:\s*([^\n]{1,200})/i,
      /\[DOCUMENT:\s{0,5}([^\]]{1,200})\]/i, // Fixed: limited whitespace and length to prevent ReDoS
      /FILE:\s*([^\n]{1,200})/i,
    ];

    for (const pattern of filePatterns) {
      const match = section.match(pattern);
      if (match && match[1]) {
        const fileName = match[1].toLowerCase();
        // Check if any keyword matches the file name
        for (const keyword of keywords) {
          if (fileName.includes(keyword) || keyword.includes(fileName)) {
            score += 30; // Medium-high priority boost for file match
            this.log(`[VAULT] File match: "${fileName}" matches keyword "${keyword}"`);
          }
        }
      }
    }

    // PRIORITY 3: Content keyword matching (existing logic)
    keywords.forEach(keyword => {
      const count = (sectionLower.match(new RegExp(_.escapeRegExp(keyword), 'g')) || []).length;
      score += count * 10;
    });

    // Boost for exact phrase matches
    if (sectionLower.includes(queryLower)) {
      score += 100;
    }

    // Boost for document/section headers
    if (/^\s*[A-Z][^\n]+\n={2,}/m.test(section)) {
      score += 20;
    }

    // Boost for founder-related content (high priority)
    if (/founder|directive|rule|policy|must|required/i.test(section)) {
      score += 30;
    }

    // Boost for pricing/business content
    if (/pricing|price|cost|\$\d+|revenue|business/i.test(section)) {
      score += 25;
    }

    // Boost for legal content (if query mentions legal terms)
    if (/legal|contract|agreement|terms|privacy|policy/i.test(queryLower)) {
      if (/legal|contract|agreement|terms|privacy|policy/i.test(sectionLower)) {
        score += 40;
      }
    }

    return score;
  }

  /**
   * Truncate vault intelligently, preserving complete sections
   */
  #truncateVaultIntelligently(vaultContent, maxChars) {
    if (vaultContent.length <= maxChars) {
      return vaultContent;
    }

    // Try to truncate at a section boundary
    const truncated = vaultContent.substring(0, maxChars);
    
    // Find the last complete section (look for double newline)
    const lastSectionBreak = truncated.lastIndexOf('\n\n');
    
    if (lastSectionBreak > maxChars * 0.8) { // If we're not losing too much
      return truncated.substring(0, lastSectionBreak) + "\n\n[Vault content truncated - more available on request]";
    }
    
    return truncated + "\n\n[Vault content truncated - more available on request]";
  }

  // ==================== STEP 4: ASSEMBLE CONTEXT ====================

  /**
   * Enforce token budgets across all context sources
   * CRITICAL: Must be called before AI routing to prevent token overflow
   */
  #enforceTokenBudget(memory, documents, vault) {
    const BUDGET = {
      MEMORY: 2500,
      DOCUMENTS: 3000,
      VAULT: 9000,
      TOTAL: 15000,
    };

    // Enforce memory budget (≤2,500 tokens)
    let memoryText = memory?.memories || "";
    let memoryTokens = memory?.tokens || 0;
    
    if (memoryTokens > BUDGET.MEMORY) {
      this.log(`[TOKEN-BUDGET] Memory exceeds limit: ${memoryTokens} > ${BUDGET.MEMORY}, truncating...`);
      const targetChars = BUDGET.MEMORY * 4;
      memoryText = memoryText.substring(0, targetChars);
      memoryTokens = BUDGET.MEMORY;
    }

    // Enforce document budget (≤3,000 tokens)
    let documentText = documents?.content || "";
    let documentTokens = documents?.tokens || 0;
    
    if (documentTokens > BUDGET.DOCUMENTS) {
      this.log(`[TOKEN-BUDGET] Documents exceed limit: ${documentTokens} > ${BUDGET.DOCUMENTS}, truncating...`);
      const targetChars = BUDGET.DOCUMENTS * 4;
      documentText = documentText.substring(0, targetChars);
      documentTokens = BUDGET.DOCUMENTS;
    }

    // Enforce vault budget (≤9,000 tokens) - should already be enforced by selection
    const vaultText = vault?.content || "";
    const vaultTokens = vault?.tokens || 0;
    
    if (vaultTokens > BUDGET.VAULT) {
      this.log(`[TOKEN-BUDGET] WARNING: Vault exceeds limit: ${vaultTokens} > ${BUDGET.VAULT}`);
      // This shouldn't happen due to selection, but log it
    }

    // Calculate total and verify budget compliance
    const totalTokens = memoryTokens + documentTokens + vaultTokens;
    
    if (totalTokens > BUDGET.TOTAL) {
      this.log(`[TOKEN-BUDGET] WARNING: Total context exceeds limit: ${totalTokens} > ${BUDGET.TOTAL}`);
    } else {
      this.log(`[TOKEN-BUDGET] ✅ Context within budget: ${totalTokens}/${BUDGET.TOTAL} tokens`);
    }

    return {
      memoryText,
      memoryTokens,
      documentText,
      documentTokens,
      vaultText,
      vaultTokens,
      totalTokens,
      budget: BUDGET,
      compliant: {
        memory: memoryTokens <= BUDGET.MEMORY,
        documents: documentTokens <= BUDGET.DOCUMENTS,
        vault: vaultTokens <= BUDGET.VAULT,
        total: totalTokens <= BUDGET.TOTAL,
      }
    };
  }

  #assembleContext(memory, documents, vault) {
    // Call explicit token budget enforcement method
    const enforcement = this.#enforceTokenBudget(memory, documents, vault);
    
    // Use enforced values
    const memoryText = enforcement.memoryText;
    const memoryTokens = enforcement.memoryTokens;
    const documentText = enforcement.documentText;
    const documentTokens = enforcement.documentTokens;
    const vaultText = enforcement.vaultText;
    const vaultTokens = enforcement.vaultTokens;
    const totalTokens = enforcement.totalTokens;

    // Build context strings
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ORCHESTRATOR] [CONTEXT] Assembling context - Memory: ${memoryText.length} chars (${memoryTokens}t), Documents: ${documentText.length} chars (${documentTokens}t), Vault: ${vaultText.length} chars (${vaultTokens}t)`);

    return {
      memory: memoryText,
      documents: documentText,
      vault: vaultText,
      totalTokens: totalTokens,
      tokenBreakdown: {
        memory: memoryTokens,
        documents: documentTokens,
        vault: vaultTokens,
      },
      budgetCompliance: enforcement.compliant,
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
      // ========== CRITICAL FIX: Check vault/tokens BEFORE confidence ==========
      // Priority order: Vault presence → Token budget → Then confidence
      
      let useClaude = false;
      let routingReason = [];

      // PRIORITY 1: Vault presence (Site Monkeys mode always uses Claude)
      if (context.sources?.hasVault && mode === "site_monkeys") {
        useClaude = true;
        routingReason.push("vault_access");
      }

      // PRIORITY 2: Token budget check (high token count prefers Claude)
      if (context.totalTokens > 10000) {
        useClaude = true;
        routingReason.push(`high_token_count:${context.totalTokens}`);
      }

      // PRIORITY 3: Confidence and complexity (original logic)
      if (!useClaude) {
        if (confidence < 0.85 || 
            analysis.requiresExpertise ||
            (mode === "business_validation" && analysis.complexity > 0.7)) {
          useClaude = true;
          routingReason.push(`confidence:${confidence.toFixed(2)}`);
          if (analysis.requiresExpertise) routingReason.push("requires_expertise");
          if (mode === "business_validation" && analysis.complexity > 0.7) {
            routingReason.push(`high_complexity:${analysis.complexity.toFixed(2)}`);
          }
        }
      }

      const model = useClaude ? "claude-sonnet-4.5" : "gpt-4";
      
      this.log(
        `[AI ROUTING] Using ${model} (reasons: ${routingReason.join(", ") || "default"})`,
      );

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

      // FIX #3: Less strict confidence validation - only flag very low confidence
      if (
        confidence < 0.5 &&
        !response.includes("uncertain") &&
        !response.includes("don't know")
      ) {
        issues.push("Low confidence without uncertainty acknowledgment");
        adjustedResponse +=
          "\n\n⚠️ **Confidence Note:** This analysis has moderate certainty based on available information.";
        adjustments.push("Added uncertainty acknowledgment");
      }

      // FIX #3: Less strict business validation - accept more flexible language
      if (mode === "business_validation") {
        // Accept broader range of risk-related keywords
        const hasRiskAnalysis = /risk|downside|worst case|if this fails|concern|challenge|issue|problem|difficulty|obstacle/i.test(
          response,
        );
        // Accept broader range of business impact keywords
        const hasSurvivalImpact = /survival|runway|cash flow|burn rate|revenue|cost|budget|timeline|deadline|financial/i.test(
          response,
        );

        // Only flag if BOTH are missing (not each individually)
        if (!hasRiskAnalysis && !hasSurvivalImpact) {
          issues.push("Business validation response could be more specific about risks and business impact");
        }
      }

      // FIX #3: More lenient engagement bait detection - only flag obvious cases
      const hasEngagementBait =
        /would you like me to specifically|should i create|want me to build|let me know if you need me to/i.test(
          response,
        );
      if (hasEngagementBait) {
        issues.push("Contains engagement bait phrases");
        adjustments.push("Flagged engagement phrases for review");
      }

      // FIX #3: More lenient completeness check
      const isComplete =
        response.length > 50 &&
        !response.includes("to be continued") &&
        !response.includes("[incomplete]");

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
  🍌 SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE
  ═══════════════════════════════════════════════════════════════
  
  ⚠️ CRITICAL: You have access to the ENTIRE Site Monkeys vault below.
  This is COMPREHENSIVE, not contextual or partial.
  
  This vault contains ALL business rules, policies, and operational procedures.
  When asked about vault contents, you can provide COMPLETE inventories and 
  detailed explanations of everything stored here.
  
  ${context.vault}
  
  ═══════════════════════════════════════════════════════════════
  END OF COMPLETE VAULT CONTENT
  ═══════════════════════════════════════════════════════════════
  
  ⚠️ IMPORTANT: The above vault content is COMPLETE. 
  - Do NOT claim you only have partial access
  - Do NOT say you can't see all the contents
  - You have the FULL vault and can provide comprehensive inventories
  - When asked "what's in the vault", list ALL documents and their purposes
  
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
      // FIX #4: Enhanced memory acknowledgment in vault mode
      if (context.sources?.hasMemory && context.memory) {
        const memoryCount = Math.ceil(context.memory.length / 200); // Estimate conversation count
        contextStr += `\n\n**📝 MEMORY CONTEXT (${memoryCount} relevant interactions retrieved):**\n`;
        contextStr += `I have access to previous conversations with you. I will use this context to provide personalized, contextually-aware responses.\n`;
        contextStr += `${context.memory}\n`;
        contextStr += `\n**Note:** I am actively using the above memory to inform my response.\n`;
      }

      return contextStr;
    }

    // ========== FALLBACK: NO VAULT - USE DOCUMENTS AND MEMORY ==========
    console.log(
      "[ORCHESTRATOR] No vault available - using standard context priority",
    );

    // FIX #4: Enhanced memory acknowledgment in standard mode
    if (context.sources?.hasMemory && context.memory) {
      const memoryCount = Math.ceil(context.memory.length / 200); // Estimate conversation count
      contextStr += `\n\n**📝 MEMORY CONTEXT (${memoryCount} relevant interactions retrieved):**\n`;
      contextStr += `I have access to previous conversations with you and will use this information to provide informed, contextually-aware responses.\n\n`;
      contextStr += `**Relevant Information from Past Conversations:**\n${context.memory}\n`;
      contextStr += `\n**Note:** I am actively using the above memory context to inform my response.\n`;
    } else {
      contextStr += `\n\n**📝 MEMORY STATUS:** This appears to be our first conversation, or no relevant previous context was found. I'll provide the best response based on your current query.\n`;
    }

    if (context.sources?.hasDocuments && context.documents) {
      contextStr += `\n\n**📄 UPLOADED DOCUMENT CONTEXT:**\n`;
      contextStr += `I have access to the uploaded document and will reference it in my response.\n\n`;
      contextStr += `${context.documents}\n`;
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
