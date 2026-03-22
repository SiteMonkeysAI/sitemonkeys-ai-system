// Model Adapter Registry
//
// CONTRACT PRESERVATION RULE (supersedes all other routing logic):
// "The customer's current provider/model path is the default contract path.
//  The system must never trade away expected behavior, tool compatibility,
//  output contract, or provider constraints in pursuit of lower cost or
//  capability."
//
// Adapters are ONLY active when the corresponding API key is present.
// The system never routes to inactive adapters.
//
// Capability tiers use coarse values — not decimal scores.
// Decimal precision requires real evaluations and will be added after evals.

const ADAPTER_REGISTRY = {

  'openai-gpt4o': {
    provider: 'openai',
    model: 'gpt-4o',
    api: 'chat-completions',
    // This is the default primary model — the customer's expected contract path.
    // Never swap this away silently.
    primary: true,
    active: () => !!process.env.OPENAI_API_KEY,
    capabilities: {
      reasoning_tier: 'standard',     // standard | advanced
      tool_reliable: true,            // stable tool/function call support
      structured_output: true,        // reliable JSON / formatted output
      long_context: 'medium',         // low | medium | high (128K window)
      hallucination_control: 'standard' // standard | high
    },
    tier: 'standard'
  },

  'anthropic-claude-sonnet': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    api: 'anthropic-messages',
    primary: false,
    active: () => !!process.env.ANTHROPIC_API_KEY,
    capabilities: {
      reasoning_tier: 'advanced',
      tool_reliable: true,
      structured_output: true,
      long_context: 'high',           // 200K window
      hallucination_control: 'high'
    },
    tier: 'advanced'
  }

  // Future adapters added here:
  // 'openai-gpt54': { ... }
  // 'google-gemini-pro': { ... }
  // 'meta-llama': { ... }
};

/**
 * Returns only adapters with an active API key.
 */
export function getActiveAdapters() {
  return Object.entries(ADAPTER_REGISTRY)
    .filter(([, adapter]) => adapter.active())
    .reduce((acc, [key, adapter]) => {
      acc[key] = adapter;
      return acc;
    }, {});
}

/**
 * Returns the customer's configured primary adapter.
 * This is the contract default — never silently change it.
 *
 * Falls back to the first active adapter only if the primary
 * adapter's API key is not configured.
 */
export function getDefaultAdapter() {
  const active = getActiveAdapters();
  // Prefer the adapter explicitly marked as primary
  const primary = Object.values(active).find(a => a.primary === true);
  if (primary) return primary;
  // If the primary model is not configured, return the first active adapter
  const all = Object.values(active);
  return all.length > 0 ? all[0] : null;
}

/**
 * Returns the best active adapter that meets all required capability tiers.
 * "Best" means the advanced-tier adapter, since tiers are coarse.
 * Returns null if no active adapter satisfies the requirements.
 *
 * @param {Object} required  - capability requirements map from detectRequiredCapabilities()
 */
export function getBestAdapterForCapabilities(required) {
  const active = getActiveAdapters();

  const qualified = Object.values(active).filter(adapter => {
    return Object.entries(required).every(([capability, requiredValue]) => {
      const current = adapter.capabilities[capability];
      if (current === undefined) return false;

      switch (capability) {
        case 'reasoning_tier':
          // 'advanced' satisfies both 'standard' and 'advanced'
          if (requiredValue === 'advanced') return current === 'advanced';
          return true; // 'standard' requirement is met by any tier
        case 'hallucination_control':
          if (requiredValue === 'high') return current === 'high';
          return true;
        case 'long_context':
          {
            const rank = { low: 0, medium: 1, high: 2 };
            return (rank[current] ?? -1) >= (rank[requiredValue] ?? 0);
          }
        case 'tool_reliable':
        case 'structured_output':
          // Boolean: required true means adapter must have true
          return requiredValue ? current === true : true;
        default:
          return true;
      }
    });
  });

  if (qualified.length === 0) return null;

  // Among qualified adapters, prefer advanced tier, then primary
  const advanced = qualified.filter(a => a.tier === 'advanced');
  if (advanced.length > 0) return advanced[0];
  return qualified[0];
}

/**
 * Contract lock gate — must pass before any escalation is allowed.
 *
 * Returns { locked: true, reason } if escalation is prohibited.
 * Returns { locked: false } if escalation may proceed.
 *
 * @param {Object} context - request context (sessionId, mode, etc.)
 */
export function checkContractLock(context) {
  // Gate 1: Explicit provider lock via environment variable
  // Set PROVIDER_LOCKED=true in environment to prevent all escalations
  if (process.env.PROVIDER_LOCKED === 'true') {
    return { locked: true, reason: 'provider_locked_by_environment' };
  }

  // Gate 2: Tool compatibility
  // If context carries a tool requirement that is incompatible with the
  // escalation target, escalation must be blocked.
  if (context.requiresSpecificProvider) {
    return {
      locked: true,
      reason: `tool_requires_provider:${context.requiresSpecificProvider}`
    };
  }

  // Gate 3: Output contract
  // If the request carries a strict output contract tied to a specific
  // provider's format guarantees, escalation is not safe.
  if (context.outputContractProvider &&
      context.outputContractProvider !== 'any') {
    return {
      locked: true,
      reason: `output_contract_locked_to:${context.outputContractProvider}`
    };
  }

  return { locked: false };
}
