/**
 * eval-helpers.js — Pure, dependency-free helpers for the eval routes.
 *
 * Extracted into their own module so unit tests can import them without
 * pulling in Express (which requires node_modules to be installed).
 *
 * Exported:
 *   caseContextStore      – shared in-memory Map for case contexts
 *   cleanExpiredEntries() – removes expired entries from the store
 *   countTokens(text)     – cheap token estimator (chars / 4)
 *   buildMetrics(opts)    – pure metrics calculation
 */

// ─── In-memory store ─────────────────────────────────────────────────────────
/**
 * Shared Map that holds all active case contexts.
 * Each value is: { context: string, tokens: number, created_at: Date, expires_at: Date }
 *
 * @type {Map<string, {context: string, tokens: number, created_at: Date, expires_at: Date}>}
 */
export const caseContextStore = new Map();

// ─── Token counting ───────────────────────────────────────────────────────────
/**
 * Cheap token estimator (mirrors the pattern used elsewhere in the codebase:
 * Math.ceil(chars / 4)).  Avoids the full tiktoken WASM bundle.
 *
 * @param {string} text
 * @returns {number}
 */
export function countTokens(text) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / 4);
}

// ─── TTL cleanup ──────────────────────────────────────────────────────────────
/**
 * Remove every entry whose expires_at timestamp has passed.
 * Call this at the top of every route handler for passive TTL enforcement.
 */
export function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of caseContextStore.entries()) {
    if (entry.expires_at && entry.expires_at.getTime() <= now) {
      caseContextStore.delete(key);
    }
  }
}

// ─── Metrics builder ─────────────────────────────────────────────────────────
/**
 * Build the metrics object returned by the /api/eval/query endpoint.
 *
 * Keeping all arithmetic in one pure function makes it straightforward to
 * unit-test without starting a server or touching the orchestrator.
 *
 * @param {{
 *   context_tokens_provided: number,
 *   context_tokens_injected: number,
 *   system_tokens: number,
 *   their_tokens_in: number,
 *   their_tokens_out: number,
 *   model: string,
 *   cost: number
 * }} opts
 * @returns {{
 *   context_tokens_provided: number,
 *   context_tokens_injected: number,
 *   system_tokens: number,
 *   our_total_tokens: number,
 *   their_total_tokens: number,
 *   tokens_saved: number,
 *   savings_pct: number,
 *   model: string,
 *   cost: number
 * }}
 */
export function buildMetrics({
  context_tokens_provided,
  context_tokens_injected,
  system_tokens,
  their_tokens_in,
  their_tokens_out,
  model,
  cost,
}) {
  const our_total_tokens = context_tokens_injected + system_tokens;
  const their_total_tokens = (their_tokens_in || 0) + (their_tokens_out || 0);
  const tokens_saved = their_total_tokens - our_total_tokens;
  const savings_pct =
    their_total_tokens > 0
      ? Math.round((tokens_saved / their_total_tokens) * 1000) / 10
      : 0;

  return {
    context_tokens_provided,
    context_tokens_injected,
    system_tokens,
    our_total_tokens,
    their_total_tokens,
    tokens_saved,
    savings_pct,
    model: model || "unknown",
    cost: typeof cost === "number" ? cost : 0,
  };
}
