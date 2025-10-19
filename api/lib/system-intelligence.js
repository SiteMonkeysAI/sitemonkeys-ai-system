// SYSTEM INTELLIGENCE INTEGRATION - CORRECTED VERSION
// This file properly connects your actual modules with correct function calls
// ADD THIS FILE: api/lib/system-intelligence.js

import {
  requiresQuantitativeReasoning,
  enforceQuantitativeAnalysis,
} from "./quantitative-enforcer.js";
import {
  checkVaultTriggers,
  generateVaultContext,
  getVaultStatus,
} from "./vault.js";
import { identifyExpertDomain } from "./caring-family-core.js";

/**
 * MASTER INTEGRATION FUNCTION - CORRECTED
 * Uses your actual module functions with correct parameters
 */
export function integrateSystemIntelligence(
  message,
  vaultContent,
  vaultHealthy,
) {
  const integration = {
    vaultIntelligenceActive: false,
    expertDomain: "general",
    quantitativeRequired: false,
    intelligenceContext: "",
    vaultStatus: "inactive",
    vaultTriggers: [],
  };

  try {
    // 1. EXPERT DOMAIN RECOGNITION (using your caring-family-core.js)
    if (typeof identifyExpertDomain === "function") {
      integration.expertDomain = identifyExpertDomain(message);
    }

    // 2. QUANTITATIVE ANALYSIS DETECTION (using your quantitative-enforcer.js)
    if (typeof requiresQuantitativeReasoning === "function") {
      integration.quantitativeRequired = requiresQuantitativeReasoning(message);
    }

    // 3. VAULT INTELLIGENCE ACTIVATION (using your vault.js)
    if (
      vaultContent &&
      vaultHealthy &&
      typeof checkVaultTriggers === "function"
    ) {
      // Using correct parameter - your function expects just message
      integration.vaultTriggers = checkVaultTriggers(message);

      if (integration.vaultTriggers && integration.vaultTriggers.length > 0) {
        integration.vaultIntelligenceActive = true;
        integration.vaultStatus = "operational";

        // Generate vault context using your actual function
        if (typeof generateVaultContext === "function") {
          // Your function expects triggeredFrameworks (the triggers array)
          integration.intelligenceContext = generateVaultContext(
            integration.vaultTriggers,
          );
        }
      }
    }

    // 4. FALLBACK PROTECTION (when vault is loaded but triggers don't fire)
    if (
      !integration.vaultIntelligenceActive &&
      vaultContent &&
      vaultContent.length > 1000
    ) {
      integration.vaultIntelligenceActive = true;
      integration.vaultStatus = "fallback_active";
      // Use Site Monkeys pricing if available
      integration.intelligenceContext =
        "SITE MONKEYS PRICING: Boost ($697), Climb ($1,497), Lead ($2,997)";
    }
  } catch (error) {
    console.warn("System intelligence integration error:", error.message);
    // Graceful degradation - system still works without intelligence
  }

  return integration;
}

/**
 * PROMPT ENHANCEMENT FUNCTION - CORRECTED
 * Adds intelligence context to AI prompts using your actual vault data
 */
export function enhancePromptWithIntelligence(
  basePrompt,
  intelligence,
  message,
) {
  let enhancedPrompt = basePrompt;

  try {
    // Add quantitative requirements if needed (using your enforcer logic)
    if (
      intelligence.quantitativeRequired &&
      intelligence.vaultIntelligenceActive
    ) {
      enhancedPrompt += `\n\n🎯 QUANTITATIVE ANALYSIS REQUIRED:
This request requires actual numerical calculations. Use Site Monkeys pricing data:
- Boost: $697/month
- Climb: $1,497/month  
- Lead: $2,997/month

CRITICAL: Provide step-by-step calculations with real numbers, confidence levels, and assumptions.
DO NOT give generic business advice - provide actual mathematical analysis.
Target margins: Must maintain business survival standards.`;
    }

    // Add vault intelligence context if available (from your vault.js)
    if (
      intelligence.vaultIntelligenceActive &&
      intelligence.intelligenceContext
    ) {
      enhancedPrompt += `\n\nVAULT INTELLIGENCE ACTIVE:\n${intelligence.intelligenceContext}`;
    }

    // Add vault triggers information
    if (intelligence.vaultTriggers && intelligence.vaultTriggers.length > 0) {
      const triggerCategories = intelligence.vaultTriggers
        .map((t) => t.category)
        .join(", ");
      enhancedPrompt += `\n\nVAULT RULES TRIGGERED: ${triggerCategories} - Enforcement required.`;
    }

    // Add expert domain guidance
    if (intelligence.expertDomain !== "general") {
      enhancedPrompt += `\n\nEXPERT DOMAIN: ${intelligence.expertDomain} - Think like a 20-year professional in this field.`;
    }
  } catch (error) {
    console.warn("Prompt enhancement error:", error.message);
    // Return base prompt if enhancement fails
  }

  return enhancedPrompt;
}

/**
 * RESPONSE VALIDATION FUNCTION - CORRECTED
 * Uses your actual quantitative-enforcer validation
 */
export function validateIntelligentResponse(response, intelligence, message) {
  const validation = {
    valid: true,
    issues: [],
    enhancements: [],
  };

  try {
    // Use your actual quantitative validation logic
    if (
      intelligence.quantitativeRequired &&
      typeof enforceQuantitativeAnalysis === "function"
    ) {
      // Your function signature: enforceQuantitativeAnalysis(response, originalMessage, expertDomain, vaultContent)
      const enhancedResponse = enforceQuantitativeAnalysis(
        response,
        message,
        intelligence.expertDomain,
        intelligence.intelligenceContext,
      );

      // If your enforcer modified the response, it found issues
      if (enhancedResponse !== response) {
        validation.valid = false;
        validation.issues.push("Quantitative analysis enforcement applied");
        validation.enhancements.push("Added required calculations");
      }
    }

    // Check vault intelligence application
    if (
      intelligence.vaultIntelligenceActive &&
      intelligence.quantitativeRequired
    ) {
      const hasVaultData = /697|1497|2997|Boost|Climb|Lead/.test(response);
      if (!hasVaultData) {
        validation.issues.push(
          "Site Monkeys pricing data not applied to calculations",
        );
      }
    }
  } catch (error) {
    console.warn("Response validation error:", error.message);
  }

  return validation;
}

/**
 * SYSTEM STATUS REPORTING - CORRECTED
 * Uses your actual vault status function
 */
export function getSystemIntelligenceStatus(intelligence) {
  let vaultStatusObj = { vault_loaded: false };

  try {
    // Use your actual getVaultStatus function
    if (typeof getVaultStatus === "function") {
      vaultStatusObj = getVaultStatus();
    }
  } catch (error) {
    console.warn("Vault status error:", error.message);
  }

  return {
    vault_intelligence_active: intelligence.vaultIntelligenceActive,
    vault_status: intelligence.vaultStatus,
    expert_domain: intelligence.expertDomain,
    quantitative_analysis_applied:
      intelligence.quantitativeRequired && intelligence.vaultIntelligenceActive,
    intelligence_context_length: intelligence.intelligenceContext.length,
    vault_triggers_count: intelligence.vaultTriggers.length,
    vault_triggers: intelligence.vaultTriggers.map((t) => t.category),
    system_health: intelligence.vaultIntelligenceActive
      ? "operational"
      : "degraded",
    vault_system_status: vaultStatusObj,
  };
}
