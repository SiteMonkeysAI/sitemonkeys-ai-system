// COMPLETE VAULT SYSTEM - SITE MONKEYS BUSINESS LOGIC ENGINE
// TIER 1: CORE VAULT ACCESS AND SECURITY
// TIER 2: BUSINESS RULE ENFORCEMENT
// TIER 3: CONFLICT DETECTION AND RESOLUTION

// TIER 1: VAULT ACCESS CONTROL
export async function verifyVaultAccess(mode, vaultRequested) {
  if (mode !== "site_monkeys" && vaultRequested) {
    return {
      allowed: false,
      reason: "Vault access restricted to Site Monkeys mode only",
      security_violation: true,
    };
  }

  if (mode === "site_monkeys" && !vaultRequested) {
    return {
      allowed: false,
      reason: "Site Monkeys mode requires vault context",
      vault_required: true,
    };
  }

  if (mode === "site_monkeys" && vaultRequested) {
    return {
      allowed: true,
      vault_loaded: true,
      context_available: true,
      compliance_required: true,
    };
  }

  return {
    allowed: true,
    vault_loaded: false,
    context_available: false,
  };
}

// TIER 2: SITE MONKEYS BUSINESS LOGIC ENGINE
const SITE_MONKEYS_VAULT = {
  vault_id: "SM-VAULT-2025-001",
  version: "3.2.1",
  loaded_timestamp: Date.now(),

  // CORE BUSINESS RULES
  pricing_logic: {
    minimum_service_price: 697,
    hourly_rate_floor: 89,
    project_minimums: {
      basic_website: 1497,
      ecommerce: 2997,
      custom_application: 4997,
    },

    enforcement_rules: [
      "NEVER quote below minimum thresholds",
      "ALWAYS include total project cost upfront",
      "FLAG any pricing discussion below $697",
      "REQUIRE scope clarification before pricing",
    ],
  },

  operational_frameworks: {
    client_onboarding: {
      deposit_required: 0.5, // 50% upfront
      payment_terms: "Net 15",
      scope_change_policy: "Additional work requires new SOW",

      red_flags: [
        "Requests for free work or 'trial projects'",
        "Pricing pressure below established minimums",
        "Scope creep without compensation discussion",
        "Payment term extensions beyond Net 30",
      ],
    },

    project_management: {
      communication_policy: "Slack for urgent, email for formal",
      meeting_cadence: "Weekly check-ins for active projects",
      deliverable_timeline: "2-week sprints with client review",

      risk_indicators: [
        "Client non-responsive for >48 hours",
        "Scope expansion without documentation",
        "Technical requirements beyond agreed capability",
        "Timeline compression requests",
      ],
    },
  },

  // FINANCIAL LOGIC
  business_intelligence: {
    monthly_targets: {
      revenue: 15000,
      new_clients: 3,
      project_completion: 4,
    },

    cash_flow_rules: [
      "Maintain 3-month operating expense reserve",
      "No project >40% of monthly revenue target",
      "Collect deposits before work begins",
      "Invoice immediately upon milestone completion",
    ],

    expense_controls: {
      tool_subscriptions: "Quarterly review and optimization",
      marketing_spend: "Track ROI, pause channels <2x return",
      equipment_purchases: "Business justification required >$500",
    },
  },
};

// FIXED: Added missing logOverride function
function logOverride(type, details, mode) {
  const timestamp = new Date().toISOString();
  console.log(
    `[VAULT-OVERRIDE] ${timestamp} - Type: ${type}, Details: ${details}, Mode: ${mode}`,
  );

  // Store override history for monitoring
  if (!global.vaultOverrideHistory) {
    global.vaultOverrideHistory = [];
  }

  global.vaultOverrideHistory.push({
    timestamp,
    type,
    details,
    mode,
  });

  // Keep only last 100 overrides
  if (global.vaultOverrideHistory.length > 100) {
    global.vaultOverrideHistory = global.vaultOverrideHistory.slice(-100);
  }
}

// TIER 2: VAULT TRIGGER DETECTION
export function checkVaultTriggers(message) {
  const triggers = [];

  // Pricing triggers
  const PRICING_PATTERNS = [
    /price|cost|quote|estimate|fee|rate|charge/i,
    /how much|what does.*cost|pricing/i,
    /\$\d+/g,
    /budget|money|payment/i,
  ];

  PRICING_PATTERNS.forEach((pattern) => {
    if (pattern.test(message)) {
      triggers.push({
        category: "pricing",
        pattern: pattern.source,
        vault_rule: "pricing_logic",
        enforcement_required: true,
      });
    }
  });

  // Project scope triggers
  const SCOPE_PATTERNS = [
    /website|app|application|development/i,
    /project|build|create|develop/i,
    /features|functionality|requirements/i,
  ];

  SCOPE_PATTERNS.forEach((pattern) => {
    if (pattern.test(message)) {
      triggers.push({
        category: "project_scope",
        pattern: pattern.source,
        vault_rule: "operational_frameworks",
        enforcement_required: true,
      });
    }
  });

  // Business strategy triggers
  const STRATEGY_PATTERNS = [
    /client|customer|revenue|growth/i,
    /marketing|sales|business/i,
    /cash flow|expenses|profit/i,
  ];

  STRATEGY_PATTERNS.forEach((pattern) => {
    if (pattern.test(message)) {
      triggers.push({
        category: "business_strategy",
        pattern: pattern.source,
        vault_rule: "business_intelligence",
        enforcement_required: false,
      });
    }
  });

  return triggers;
}

// TIER 2: VAULT CONTEXT GENERATION
export function generateVaultContext(triggeredFrameworks) {
  if (!triggeredFrameworks || triggeredFrameworks.length === 0) {
    return "";
  }

  let context = "\n🍌 SITE MONKEYS VAULT LOGIC ACTIVE 🍌\n\n";

  triggeredFrameworks.forEach((trigger) => {
    switch (trigger.category) {
      case "pricing":
        context += `PRICING ENFORCEMENT:
- Minimum service price: $${SITE_MONKEYS_VAULT.pricing_logic.minimum_service_price}
- Hourly rate floor: $${SITE_MONKEYS_VAULT.pricing_logic.hourly_rate_floor}
- Project minimums: ${JSON.stringify(SITE_MONKEYS_VAULT.pricing_logic.project_minimums)}
- CRITICAL: Flag any quote below minimums as vault violation

`;
        break;

      case "project_scope":
        context += `PROJECT FRAMEWORK ENFORCEMENT:
- Deposit required: ${SITE_MONKEYS_VAULT.operational_frameworks.client_onboarding.deposit_required * 100}% upfront
- Payment terms: ${SITE_MONKEYS_VAULT.operational_frameworks.client_onboarding.payment_terms}
- Scope change policy: ${SITE_MONKEYS_VAULT.operational_frameworks.client_onboarding.scope_change_policy}

`;
        break;

      case "business_strategy":
        context += `BUSINESS INTELLIGENCE ACTIVE:
- Monthly revenue target: $${SITE_MONKEYS_VAULT.business_intelligence.monthly_targets.revenue}
- New client target: ${SITE_MONKEYS_VAULT.business_intelligence.monthly_targets.new_clients}
- Cash flow rules: ${SITE_MONKEYS_VAULT.business_intelligence.cash_flow_rules.join(" | ")}

`;
        break;
    }
  });

  context += `VAULT COMPLIANCE REQUIRED - Violation warnings must be surfaced immediately.\n`;

  return context;
}

// TIER 3: CONFLICT DETECTION AND RESOLUTION
export function detectVaultConflicts(response, triggeredFrameworks) {
  const conflicts = [];

  triggeredFrameworks.forEach((trigger) => {
    if (trigger.category === "pricing") {
      // Check for pricing violations
      const priceMatches = response.match(/\$(\d+)/g);
      if (priceMatches) {
        priceMatches.forEach((match) => {
          const price = parseInt(match.replace("$", ""));
          if (price < SITE_MONKEYS_VAULT.pricing_logic.minimum_service_price) {
            conflicts.push({
              type: "pricing_violation",
              detected_price: price,
              minimum_required:
                SITE_MONKEYS_VAULT.pricing_logic.minimum_service_price,
              severity: "critical",
              action_required: "block_response",
            });
          }
        });
      }

      // Check for pricing language that might undercut
      const UNDERCUT_PATTERNS = [
        /cheap|affordable|budget.friendly/i,
        /lowest price|competitive pricing/i,
        /discount|deal|special offer/i,
      ];

      UNDERCUT_PATTERNS.forEach((pattern) => {
        if (pattern.test(response)) {
          conflicts.push({
            type: "pricing_language_violation",
            pattern: pattern.source,
            severity: "moderate",
            action_required: "modify_response",
          });
        }
      });
    }

    if (trigger.category === "project_scope") {
      // Check for scope creep enablement
      const SCOPE_CREEP_PATTERNS = [
        /we can add|easy to include/i,
        /no problem|sure thing/i,
        /free|included|no charge/i,
      ];

      SCOPE_CREEP_PATTERNS.forEach((pattern) => {
        if (pattern.test(response)) {
          conflicts.push({
            type: "scope_creep_enablement",
            pattern: pattern.source,
            severity: "moderate",
            action_required: "add_clarification",
          });
        }
      });
    }
  });

  return conflicts;
}

// TIER 3: VAULT COMPLIANCE ENFORCEMENT
export function enforceVaultCompliance(response, conflicts) {
  if (!conflicts || conflicts.length === 0) {
    return { response, modified: false };
  }

  let modifiedResponse = response;
  let modificationsApplied = [];

  conflicts.forEach((conflict) => {
    switch (conflict.action_required) {
      case "block_response":
        logOverride("vault_violation_blocked", conflict.type, "site_monkeys");
        modifiedResponse = `🔐 VAULT RULE VIOLATION: This recommendation violates Site Monkeys pricing logic.

DETECTED ISSUE: Price of $${conflict.detected_price} is below minimum threshold of $${conflict.minimum_required}.

VAULT ENFORCEMENT: All Site Monkeys services maintain minimum pricing standards to ensure quality delivery and business sustainability.

CORRECTED APPROACH: For this scope of work, the appropriate investment range begins at $${conflict.minimum_required}. This ensures we can deliver the quality and support you deserve.`;

        modificationsApplied.push("blocked_pricing_violation");
        break;

      case "modify_response":
        modifiedResponse = modifiedResponse.replace(
          new RegExp(conflict.pattern, "gi"),
          "[PRICING POLICY COMPLIANT LANGUAGE]",
        );
        modificationsApplied.push("modified_pricing_language");
        break;

      case "add_clarification":
        modifiedResponse += `

🔐 VAULT CLARIFICATION: Any additional scope beyond the agreed statement of work requires formal documentation and pricing adjustment per Site Monkeys operational framework.`;

        modificationsApplied.push("added_scope_clarification");
        break;
    }
  });

  return {
    response: modifiedResponse,
    modified: modificationsApplied.length > 0,
    modifications: modificationsApplied,
    conflicts_resolved: conflicts.length,
  };
}

// TIER 3: VAULT STATUS AND MONITORING
export function getVaultStatus() {
  return {
    vault_loaded: true,
    vault_id: SITE_MONKEYS_VAULT.vault_id,
    version: SITE_MONKEYS_VAULT.version,
    loaded_timestamp: SITE_MONKEYS_VAULT.loaded_timestamp,
    rules_active: Object.keys(SITE_MONKEYS_VAULT).length,
    compliance_level: "enforced",
    last_conflict_check: Date.now(),
  };
}

export function getVaultMetrics() {
  return {
    pricing_minimums: SITE_MONKEYS_VAULT.pricing_logic.project_minimums,
    business_targets: SITE_MONKEYS_VAULT.business_intelligence.monthly_targets,
    operational_policies: Object.keys(
      SITE_MONKEYS_VAULT.operational_frameworks,
    ),
    enforcement_active: true,
    vault_integrity: "verified",
  };
}
