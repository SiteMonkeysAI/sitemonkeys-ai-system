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
// ========== SEMANTIC INTEGRATION ==========
import { retrieveSemanticMemories } from "../services/semantic-retrieval.js";
// ========== PHASE 4/5/6 INTEGRATION ==========
import { detectTruthType } from "../core/intelligence/truthTypeDetector.js";
import { route } from "../core/intelligence/hierarchyRouter.js";
import { lookup } from "../core/intelligence/externalLookupEngine.js";
import { enforceAll } from "../core/intelligence/doctrineEnforcer.js";
import { enforceBoundedReasoning } from "../core/intelligence/boundedReasoningGate.js";
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

    // Database pool for semantic retrieval (set during initialization)
    this.pool = null;

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

      // Get database pool from global memory system
      if (global.memorySystem?.pool) {
        this.pool = global.memorySystem.pool;
        this.log("[INIT] Database pool acquired from memory system");
      } else {
        this.log("[INIT] WARNING: No database pool available - semantic retrieval will use keyword fallback");
      }

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

  /**
   * Applies doctrine gates to enforce truth-first standards
   * CRITICAL: Runs AFTER enforcement chain, BEFORE personality
   */
  async #applyDoctrineGates(response, context, message) {
    try {
      this.log('[DOCTRINE-GATES] Loading doctrine gates module...');
      const { enforceDoctrineGates } = await import('../services/doctrine-gates.js');
      const { enhanceToPassGates } = await import('../services/response-enhancer.js');
      const { DOCTRINE_CONFIG } = await import('../config/doctrine-config.js');

      // Skip if disabled
      if (!DOCTRINE_CONFIG.enabled) {
        this.log('[DOCTRINE-GATES] Disabled in config');
        return {
          response: response,
          gateResults: { passed: true, compositeScore: 1.0, minimumScore: 0.6 },
          enhanced: false,
          enhancements: []
        };
      }

      this.log('[DOCTRINE-GATES] Module loaded, config enabled');

      // Evaluate with doctrine gates
      const gateContext = {
        mode: context.mode,
        message: message,
        highStakes: DOCTRINE_CONFIG.highStakesPatterns.some(pattern => pattern.test(message))
      };

      const gateResults = enforceDoctrineGates(response, gateContext);

      // Handle based on enforcement level
      const enforcementLevel = DOCTRINE_CONFIG.currentLevel;

      if (!gateResults.passed) {
        if (enforcementLevel === 'warn') {
          // Just log warning
          this.log(`[DOCTRINE-GATES] ⚠️ Response failed gates (score: ${gateResults.compositeScore})`);
          return {
            response: response,
            gateResults: gateResults,
            enhanced: false,
            enhancements: []
          };
        } else if (enforcementLevel === 'enhance') {
          // Auto-enhance the response
          this.log('[DOCTRINE-GATES] Enhancing response to meet standards...');
          const enhancementResult = enhanceToPassGates(response, gateResults, gateContext);

          return {
            response: enhancementResult.enhanced,
            gateResults: enhancementResult.newResults,
            enhanced: true,
            enhancements: enhancementResult.enhancements
          };
        } else if (enforcementLevel === 'block') {
          // Try to enhance, but block if still failing
          const enhancementResult = enhanceToPassGates(response, gateResults, gateContext);

          if (!enhancementResult.newResults.passed) {
            this.log('[DOCTRINE-GATES] ❌ Response blocked - cannot meet standards');
            throw new Error('Response does not meet truth-first standards and cannot be enhanced');
          }

          return {
            response: enhancementResult.enhanced,
            gateResults: enhancementResult.newResults,
            enhanced: true,
            enhancements: enhancementResult.enhancements
          };
        }
      }

      // Passed gates
      return {
        response: response,
        gateResults: gateResults,
        enhanced: false,
        enhancements: []
      };

    } catch (error) {
      this.error('[DOCTRINE-GATES] Evaluation failed, using original response', error);
      return {
        response: response,
        gateResults: { passed: true, compositeScore: 1.0, minimumScore: 0.6, error: error.message },
        enhanced: false,
        enhancements: []
      };
    }
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
      const memoryContext = await this.#retrieveMemoryContext(userId, message, { mode });
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

      // STEP 6.5: PHASE 4 - Truth Type Detection and External Lookup (PRE-GENERATION)
      this.log("🔍 PHASE 4: Truth type detection and external lookup");
      let phase4Metadata = {
        truth_type: null,
        source_class: "internal",
        verified_at: null,
        cache_valid_until: null,
        external_lookup: false,
        lookup_attempted: false,
        sources_used: 0,
        claim_type: null,
        hierarchy: null,
        confidence: confidence,
        high_stakes: null,
        phase4_error: null,
      };

      try {
        // Step 1: Detect truth type
        const truthTypeResult = await detectTruthType(message, {
          conversationHistory,
          mode,
          vaultContext,
        });
        phase4Metadata.truth_type = truthTypeResult.type;
        phase4Metadata.confidence = truthTypeResult.confidence || 0.8;
        phase4Metadata.high_stakes = truthTypeResult.high_stakes;

        this.log(`[PHASE 4] Truth type: ${truthTypeResult.type}, confidence: ${phase4Metadata.confidence}`);

        // Step 2: Route through hierarchy
        const routeResult = await route(message, mode);
        phase4Metadata.claim_type = routeResult.claim_type;
        phase4Metadata.hierarchy = routeResult.hierarchy_name;

        this.log(`[PHASE 4] Claim type: ${routeResult.claim_type}, hierarchy: ${routeResult.hierarchy_name}`);

        // Step 3: External lookup if needed
        // Trigger conditions: VOLATILE truth type, high-stakes domains, or router requires external

        // Additional news/geopolitical pattern check
        const newsPatterns = /\b(venezuela|ukraine|russia|china|iran|israel|gaza|attack|election|president|war|invasion|military|conflict|strike|bombing|sanctions|crisis|coup|protest|news|breaking)\b/i;
        const matchesNewsPattern = newsPatterns.test(message);

        const shouldLookup =
          truthTypeResult.type === 'VOLATILE' ||
          matchesNewsPattern ||
          (truthTypeResult.high_stakes && truthTypeResult.high_stakes.isHighStakes) ||
          (routeResult.requires_external && routeResult.hierarchy_name === "external_first" && phase4Metadata.confidence < 0.9);

        // Debug logging for lookup decision
        console.log('[ORCHESTRATOR] Lookup decision:', {
          message: message.substring(0, 100),
          truthType: truthTypeResult.type,
          isVolatile: truthTypeResult.type === 'VOLATILE',
          matchesNewsPattern: matchesNewsPattern,
          highStakes: truthTypeResult.high_stakes?.isHighStakes || false,
          routerRequiresLookup: routeResult.requires_external,
          hierarchyName: routeResult.hierarchy_name,
          confidence: phase4Metadata.confidence,
          willAttemptLookup: shouldLookup
        });

        if (shouldLookup) {
          this.log(`[PHASE4] 1. Lookup triggered for: ${message.substring(0, 50)}...`);
          this.log(`🌐 External lookup required (type: ${truthTypeResult.type}, high_stakes: ${truthTypeResult.high_stakes?.isHighStakes || false}), performing lookup...`);
          const lookupResult = await lookup(message, {
            internalConfidence: phase4Metadata.confidence,
            truthType: truthTypeResult.type,
          });

          // Debug: Log what lookup returned
          console.log('[PHASE4] Lookup result:', JSON.stringify(lookupResult, null, 2));

          // Check if lookup was performed and has data
          if (lookupResult.lookup_performed && lookupResult.data) {
            // Successful lookup with data
            phase4Metadata.external_lookup = true;
            phase4Metadata.lookup_attempted = true;
            phase4Metadata.source_class = "external";
            phase4Metadata.verified_at = lookupResult.verified_at || new Date().toISOString();
            phase4Metadata.external_data = lookupResult.data;

            // Extract fetched content from the lookup result
            // lookupResult.data.sources is an array of {source, text, length, type}
            if (lookupResult.data.sources && Array.isArray(lookupResult.data.sources) && lookupResult.data.sources.length > 0) {
              phase4Metadata.fetched_content = lookupResult.data.sources
                .map(s => `[Source: ${s.source}]\n${s.text}`)
                .join('\n\n---\n\n');
              phase4Metadata.sources_used = lookupResult.data.sources.length;
            } else {
              phase4Metadata.fetched_content = null;
              // Count successful sources from sources_consulted
              const successfulSources = lookupResult.sources_used?.filter(s => s.success === true) || [];
              phase4Metadata.sources_used = successfulSources.length;
            }

            // CRITICAL: If sources_used is 0 but external_lookup is true, this is inconsistent
            // This means graceful degradation occurred - mark as failed lookup
            if (phase4Metadata.sources_used === 0) {
              phase4Metadata.external_lookup = false;
              phase4Metadata.lookup_attempted = true;
              phase4Metadata.failure_reason = lookupResult.failure_reason || 'No reliable parseable source available';
              this.log(`⚠️ External lookup attempted but no sources succeeded (graceful degradation)`);
            } else {
              // Update cache validity if provided
              if (lookupResult.cache_valid_until) {
                phase4Metadata.cache_valid_until = lookupResult.cache_valid_until;
              }

              // Log complete lookup success with details
              this.log(`[PHASE4] 2. Fetching completed`);
              if (lookupResult.data.sources) {
                lookupResult.data.sources.forEach((src, idx) => {
                  this.log(`[PHASE4] 3. Received: ${src.length} bytes from ${src.source}`);
                });
              }
              this.log(`[PHASE4] 4. Stored in phase4Metadata: ${phase4Metadata.sources_used} sources, ${lookupResult.data.total_text_length} total chars`);
              this.log(
                `✅ External lookup successful: ${phase4Metadata.sources_used} sources, ${phase4Metadata.fetched_content ? phase4Metadata.fetched_content.length : 0} chars`,
              );
            }
          } else if (lookupResult.lookup_attempted && !lookupResult.lookup_performed) {
            // Lookup was attempted but no reliable source available (graceful degradation)
            phase4Metadata.external_lookup = false;
            phase4Metadata.lookup_attempted = true;
            phase4Metadata.fetched_content = null;
            phase4Metadata.sources_used = 0;
            phase4Metadata.failure_reason = lookupResult.failure_reason || 'No reliable parseable source available for this query type';
            this.log(`⚠️ External lookup: ${phase4Metadata.failure_reason}`);
          } else {
            // Lookup failed or returned no data
            phase4Metadata.external_lookup = false;
            phase4Metadata.lookup_attempted = lookupResult.lookup_attempted || false;
            phase4Metadata.fetched_content = null;
            phase4Metadata.sources_used = 0;
            phase4Metadata.failure_reason = lookupResult.error || 'External lookup failed or returned no data';
            this.log("⚠️ External lookup failed or returned no data");
          }
        }
      } catch (phase4Error) {
        this.error("⚠️ Phase 4 pipeline error:", phase4Error);
        // Continue with internal processing even if Phase 4 fails
        phase4Metadata.phase4_error = phase4Error.message;
      }

      // STEP 6.5: Inject external data into context if available
      if (phase4Metadata.external_lookup && phase4Metadata.external_data) {
        this.log(`[PHASE4] 5. Injecting external context: ${phase4Metadata.external_data.total_text_length} chars from ${phase4Metadata.sources_used} sources`);
        // Add external data to context for AI injection
        context.external = phase4Metadata.external_data;
        context.sources = context.sources || {};
        context.sources.hasExternal = true;
      }

      // STEP 7: Route to appropriate AI
      const aiResponse = await this.#routeToAI(
        message,
        context,
        analysis,
        confidence,
        mode,
        conversationHistory,
        phase4Metadata,
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

      // ========== RUN DOCTRINE GATES (AFTER ENFORCEMENT, BEFORE PERSONALITY) ==========
      this.log("[DOCTRINE-GATES] Evaluating truth-first standards...");
      const doctrineResult = await this.#applyDoctrineGates(
        enforcedResult.response,
        context,
        message
      );

      this.log(
        `[DOCTRINE-GATES] Score: ${doctrineResult.gateResults.compositeScore.toFixed(2)}/${doctrineResult.gateResults.minimumScore.toFixed(2)} ${doctrineResult.gateResults.passed ? '✅' : '❌'}`,
      );

      if (doctrineResult.enhanced) {
        this.log(
          `[DOCTRINE-GATES] Response enhanced: ${doctrineResult.enhancements.join(', ')}`,
        );
      }

      // STEP 8: Apply personality reasoning framework (AFTER ENFORCEMENT AND DOCTRINE GATES)
      // Personality enhances the already-compliant response
      const personalityStartTime = Date.now();
      const personalityResponse = await this.#applyPersonality(
        doctrineResult.response,
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

      // STEP 8.5: PHASE 5 - Doctrine Enforcement Gates (POST-GENERATION)
      this.log("🛡️ PHASE 5: Applying doctrine enforcement gates");
      let phase5Enforcement = {
        enforcement_passed: true,
        violations: [],
        gate_results: [],
        gates_run: [],
        original_response_modified: false,
        phase5_error: null,
      };

      try {
        const modeForEnforcement = mode === "site_monkeys"
          ? "site_monkeys"
          : mode === "business_validation"
          ? "business_validation"
          : "truth";

        phase5Enforcement = enforceAll(
          personalityResponse.response,
          phase4Metadata,
          modeForEnforcement,
        );

        if (!phase5Enforcement.enforcement_passed) {
          this.log(
            `⚠️ Phase 5 enforcement violations: ${phase5Enforcement.violations.map(v => v.gate).join(", ")}`,
          );

          // Apply corrected response if enforcement modified it
          if (phase5Enforcement.corrected_response) {
            personalityResponse.response = phase5Enforcement.corrected_response;
            phase5Enforcement.original_response_modified = true;
            this.log("✏️ Response corrected by Phase 5 enforcement");
          }
        } else {
          this.log(`✅ Phase 5 enforcement passed: ${phase5Enforcement.gates_run.length} gates`);
        }
      } catch (phase5Error) {
        this.error("⚠️ Phase 5 enforcement error:", phase5Error);
        phase5Enforcement.phase5_error = phase5Error.message;
      }

      // ============================================
      // PHASE 6: BOUNDED REASONING ENFORCEMENT
      // ============================================
      // ⚠️ THIS IS A HARD GATE, NOT ADVISORY
      // It MUST run post-generation. Skipping it reintroduces epistemic dishonesty.
      this.log("🧠 PHASE 6: Bounded Reasoning Enforcement");
      let phase6BoundedReasoning = {
        required: false,
        disclosure_added: false,
        enforcement_passed: true,
        violations: [],
      };

      try {
        const boundedReasoningResult = enforceBoundedReasoning(
          personalityResponse.response,
          phase4Metadata,
          {
            isInference: phase4Metadata.source_class !== 'vault' && phase4Metadata.source_class !== 'external',
            // Add other context as available
          }
        );

        phase6BoundedReasoning = {
          required: boundedReasoningResult.bounded_reasoning_required,
          disclosure_added: boundedReasoningResult.disclosure_added,
          enforcement_passed: boundedReasoningResult.enforcement_passed,
          violations: boundedReasoningResult.violations || [],
        };

        if (boundedReasoningResult.disclosure_added) {
          personalityResponse.response = boundedReasoningResult.enforced_response;
          this.log('🧠 Bounded reasoning disclosure added');
        }

        if (!boundedReasoningResult.enforcement_passed) {
          this.log('⚠️ Bounded reasoning violations:', boundedReasoningResult.violations);
          // Handle violations - either modify response or add warnings
        } else {
          this.log('✅ Bounded reasoning enforcement passed');
        }
      } catch (phase6Error) {
        this.error("⚠️ Phase 6 bounded reasoning error:", phase6Error);
        phase6BoundedReasoning.phase6_error = phase6Error.message;
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

          // Memory retrieval telemetry (Issue #206, enhanced in Issue #208, #210, #212, #242)
          retrieval: this._lastRetrievalTelemetry || {
            method: 'keyword_fallback',
            fallback_reason: 'no_telemetry',
            memories_retrieved: memoryContext.count || 0,
            tokens_retrieved: memoryContext.tokens || 0
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

          // NEW: Doctrine gates results
          doctrine_gates: doctrineResult.gateResults,
          doctrine_enhanced: doctrineResult.enhanced || false,
          doctrine_enhancements: doctrineResult.enhancements || [],

          // PHASE 4: Truth Validation Metadata
          phase4_metadata: {
            truth_type: phase4Metadata.truth_type,
            source_class: phase4Metadata.source_class,
            verified_at: phase4Metadata.verified_at,
            cache_valid_until: phase4Metadata.cache_valid_until,
            external_lookup: phase4Metadata.external_lookup,
            lookup_attempted: phase4Metadata.lookup_attempted,
            sources_used: phase4Metadata.sources_used,
            failure_reason: phase4Metadata.failure_reason || null,
            claim_type: phase4Metadata.claim_type,
            hierarchy: phase4Metadata.hierarchy,
            confidence: phase4Metadata.confidence,
            high_stakes: phase4Metadata.high_stakes,
            phase4_error: phase4Metadata.phase4_error,
            // Include sources summary (bounded, not full content)
            sources: phase4Metadata.external_data?.sources?.map(s => ({
              name: s.source,
              type: s.type,
              success: true
            })) || null,
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

          // PHASE 6: Bounded Reasoning Enforcement
          phase6_bounded_reasoning: {
            required: phase6BoundedReasoning.required,
            disclosure_added: phase6BoundedReasoning.disclosure_added,
            enforcement_passed: phase6BoundedReasoning.enforcement_passed,
            violations: phase6BoundedReasoning.violations,
            phase6_error: phase6BoundedReasoning.phase6_error || null,
          },

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

        // PHASE 4 & 5 at top level for client access
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
          high_stakes: phase4Metadata.high_stakes,
          phase4_error: phase4Metadata.phase4_error,
        },
        phase5_enforcement: {
          enforcement_passed: phase5Enforcement.enforcement_passed,
          violations: phase5Enforcement.violations,
          gate_results: phase5Enforcement.gate_results,
          gates_run: phase5Enforcement.gates_run,
          original_response_modified: phase5Enforcement.original_response_modified,
          phase5_error: phase5Enforcement.phase5_error,
        },
        phase6_bounded_reasoning: {
          required: phase6BoundedReasoning.required,
          disclosure_added: phase6BoundedReasoning.disclosure_added,
          enforcement_passed: phase6BoundedReasoning.enforcement_passed,
          violations: phase6BoundedReasoning.violations,
          phase6_error: phase6BoundedReasoning.phase6_error || null,
        },
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

  async #retrieveMemoryContext(userId, message, options = {}) {
    const { mode = 'truth-general', tokenBudget = 2000 } = options;

    let telemetry = {
      method: 'keyword_fallback',
      fallback_reason: 'initialization',
      candidates_considered: 0,
      latency_ms: 0
    };

    try {
      // Attempt semantic retrieval
      const pool = global.memorySystem?.pool || this.pool;

      if (!pool) {
        this.error("[MEMORY] No database pool available, using keyword fallback");
        telemetry.fallback_reason = 'no_pool';
        return await this.#keywordRetrievalFallback(userId, message, mode);
      }

      const result = await retrieveSemanticMemories(pool, message, {
        userId,
        mode,
        tokenBudget,
        includePinned: true
      });

      telemetry = result.telemetry;

      // Store telemetry for response metadata
      this._lastRetrievalTelemetry = telemetry;

      // Format memories into string for context injection
      let memoryText = "";
      let memoryIds = [];

      if (result.memories && result.memories.length > 0) {
        memoryText = result.memories
          .map((m) => {
            if (m.id) memoryIds.push(m.id);
            return m.content || "";
          })
          .filter(c => c.length > 0)
          .join("\n\n");
      }

      const tokenCount = Math.ceil(memoryText.length / 4);

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'inject', {
        memory_injected: tokenCount > 0,
        memory_ids: memoryIds,
        token_count: tokenCount
      });

      this.log(
        `[MEMORY] Semantic retrieval: ${result.memories.length} memories, ${tokenCount} tokens (method: ${telemetry.method})`
      );

      return {
        memories: memoryText,
        tokens: tokenCount,
        count: result.memories.length,
        categories: [], // Semantic retrieval doesn't use category filtering
        hasMemory: tokenCount > 0,
        memory_ids: memoryIds,
      };

    } catch (error) {
      this.error(`[MEMORY] Semantic retrieval failed: ${error.message}`);
      telemetry.method = 'keyword_fallback';
      telemetry.fallback_reason = error.message;
      telemetry.latency_ms = Date.now() - (telemetry.startTime || Date.now());

      this._lastRetrievalTelemetry = telemetry;

      // Fallback to existing keyword/category retrieval
      return await this.#keywordRetrievalFallback(userId, message, mode);
    }
  }

  /**
   * Fallback keyword retrieval when semantic retrieval fails
   */
  async #keywordRetrievalFallback(userId, message, mode) {
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
                memory_ids: result.memory_ids || [],
              };

              this.log(
                `[MEMORY] Keyword fallback loaded ${memoryCount} memories, ${memoryText.length} chars`,
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

      // CRITICAL FIX (Issue #210): If we have memories but no IDs, this is a TELEMETRY FAILURE
      if (tokenCount > 0 && memoryIds.length === 0 && memories.count > 0) {
        this.error(`[TELEMETRY] ❌ CRITICAL: memory_count=${memories.count} but memory_ids=[] - telemetry integrity failure`);

        // Try to extract IDs from the memories array if available
        if (Array.isArray(memories.memories)) {
          memoryIds = memories.memories.map(m => m.id).filter(id => id !== undefined);
          if (memoryIds.length > 0) {
            this.log(`[TELEMETRY] ⚠️  Recovered ${memoryIds.length} IDs from memories array - but this should not be necessary`);
          }
        }

        // If still no IDs after recovery attempt, this is a FAIL condition
        if (memoryIds.length === 0) {
          this.error(`[TELEMETRY] ❌ FAILED: Cannot recover memory IDs - retrieval layer not returning IDs`);
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
      this.error("[MEMORY] Fallback retrieval failed, continuing without memory", error);
      return {
        memories: "",
        tokens: 0,
        count: 0,
        categories: [],
        hasMemory: false,
        memory_ids: [],
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
    phase4Metadata = null,
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

      // Log if external context is being used
      if (context.sources?.hasExternal && phase4Metadata) {
        this.log(`[PHASE4] 6. AI generation starting with external context (${context.external?.total_text_length || 0} chars)`);
      }

      const historyString =
        conversationHistory.length > 0
          ? "\n\nRecent conversation:\n" +
            conversationHistory
              .slice(-5)
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join("\n")
          : "";

      const systemPrompt = this.#buildSystemPrompt(mode, analysis);

      // PHASE 4: Inject external content if fetched
      let externalContext = "";
      if (phase4Metadata.fetched_content && phase4Metadata.sources_used > 0) {
        externalContext = `\n\n[CURRENT EXTERNAL INFORMATION - Use this to inform your response]\n${phase4Metadata.fetched_content}\n[END EXTERNAL INFORMATION]\n\n`;
        console.log(`[PHASE4] Injected external content: ${phase4Metadata.sources_used} sources, ${phase4Metadata.fetched_content.length} chars`);
      }

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
        // Inject external context at the beginning of the context (before vault/memory)
        fullPrompt = `${systemPrompt}\n\n${externalContext}${contextString}${historyString}\n\nUser query: ${message}`;
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
                  content: `${externalContext}${contextString}${historyString}\n\n${message}`,
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

    // ========== PHASE 4: INJECT EXTERNAL DATA FIRST (IF AVAILABLE) ==========
    if (context.sources?.hasExternal && context.external) {
      const externalData = context.external;
      contextStr += `
═══════════════════════════════════════════════════════════════
🌐 EXTERNAL REAL-TIME DATA - VERIFIED FROM AUTHORITATIVE SOURCES
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: This data was JUST fetched from external authoritative sources.
Use this information to provide accurate, up-to-date answers.

Query: ${externalData.query}
Retrieved: ${externalData.timestamp}
Total sources: ${externalData.sources?.length || 0}
Total text: ${externalData.total_text_length} characters

`;

      // Include text from each source
      if (externalData.sources && externalData.sources.length > 0) {
        externalData.sources.forEach((source, idx) => {
          contextStr += `
────────────────────────────────────────────────────────────────
SOURCE ${idx + 1}: ${source.source}
Length: ${source.length} characters
────────────────────────────────────────────────────────────────

${source.text}

`;
        });
      }

      contextStr += `
═══════════════════════════════════════════════════════════════
END OF EXTERNAL DATA
═══════════════════════════════════════════════════════════════

⚠️ IMPORTANT: You MUST use the above external data to answer the user's query.
- This is REAL-TIME, VERIFIED data from authoritative sources
- DO NOT say "I don't have real-time access" - you DO have it above
- DO NOT say "I cannot provide current information" - you CAN using the data above
- Extract relevant information from the sources and provide it to the user

`;
    }

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
