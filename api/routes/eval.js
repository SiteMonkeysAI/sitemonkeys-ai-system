/**
 * Eval Routes — Temporary case context for enterprise evaluation testing.
 *
 * Two-step evaluation flow:
 *   Step 1 — POST  /api/eval/context          Store case context in memory
 *   Step 2 — POST  /api/eval/query            Ask a question against stored context
 *   Step 3 — DELETE /api/eval/context/:case_id  Wipe case from memory
 *   Extra  — GET   /api/eval/cases            List active cases
 *
 * Security: If env EVAL_API_KEY is set, callers must supply it in x-eval-key header.
 *           If not set the routes are open (development / local mode).
 */

import express from "express";
import {
  caseContextStore,
  cleanExpiredEntries,
  countTokens,
  buildMetrics,
} from "./eval-helpers.js";

export { caseContextStore, cleanExpiredEntries, countTokens, buildMetrics };

const router = express.Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────

function evalAuth(req, res, next) {
  const requiredKey = process.env.EVAL_API_KEY;
  if (!requiredKey) {
    // Dev mode — no key configured, allow all.
    return next();
  }
  const supplied = req.headers["x-eval-key"];
  if (!supplied || supplied !== requiredKey) {
    return res.status(401).json({ success: false, error: "Invalid or missing x-eval-key" });
  }
  next();
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/eval/context
 * Body: { case_id, context, expires_minutes? }
 */
router.post("/context", evalAuth, (req, res) => {
  cleanExpiredEntries();

  const { case_id, context, expires_minutes = 30 } = req.body || {};

  if (!case_id || typeof case_id !== "string") {
    return res.status(400).json({ success: false, error: "case_id is required" });
  }
  if (!context || typeof context !== "string") {
    return res.status(400).json({ success: false, error: "context is required" });
  }

  const tokens = countTokens(context);
  const created_at = new Date();
  const expires_at = new Date(created_at.getTime() + expires_minutes * 60 * 1000);

  caseContextStore.set(case_id, { context, tokens, created_at, expires_at });

  console.log(`[EVAL] Context stored for case_id="${case_id}" (${tokens} tokens, expires ${expires_at.toISOString()})`);

  return res.json({
    success: true,
    case_id,
    tokens_loaded: tokens,
    expires_at: expires_at.toISOString(),
  });
});

/**
 * POST /api/eval/query
 * Body: { case_id, question, their_tokens_in?, their_tokens_out? }
 */
router.post("/query", evalAuth, async (req, res) => {
  cleanExpiredEntries();

  const { case_id, question, their_tokens_in = 0, their_tokens_out = 0 } = req.body || {};

  if (!case_id || typeof case_id !== "string") {
    return res.status(400).json({ success: false, error: "case_id is required" });
  }
  if (!question || typeof question !== "string") {
    return res.status(400).json({ success: false, error: "question is required" });
  }

  const entry = caseContextStore.get(case_id);
  if (!entry) {
    return res.status(404).json({ success: false, error: `No context found for case_id="${case_id}". Load context first via POST /api/eval/context.` });
  }

  // Verify not expired (cleanExpiredEntries already ran but double-check)
  if (entry.expires_at && entry.expires_at.getTime() <= Date.now()) {
    caseContextStore.delete(case_id);
    return res.status(404).json({ success: false, error: `Context for case_id="${case_id}" has expired.` });
  }

  const orch = global.orchestrator;
  if (!orch) {
    return res.status(503).json({ success: false, error: "Orchestrator not ready" });
  }

  let result;
  try {
    result = await orch.processRequest({
      message: question,
      userId: `eval-${case_id}`,
      mode: "truth_general",
      // Pass stored context through the document injection pipeline so our
      // relevance-filtering and token-budget logic applies — NOT stuffed into
      // the user message.
      documentContext: entry.context,
      sessionId: `eval-session-${case_id}`,
    });
  } catch (err) {
    console.error("[EVAL] Orchestrator error for case_id:", case_id, err.message);
    return res.status(500).json({ success: false, error: "Orchestrator processing error" });
  }

  const meta = result.metadata || {};
  const tokenUsage = meta.token_usage || {};

  // context_tokens_injected = tokens actually sent to the model for the document.
  const context_tokens_injected = meta.documentTokens || 0;

  // system_tokens = everything that went to the model EXCEPT the document tokens
  // (i.e. system prompt, memory, instructions, the question itself).
  const prompt_tokens = tokenUsage.prompt_tokens || 0;
  const system_tokens = Math.max(0, prompt_tokens - context_tokens_injected);

  const metrics = buildMetrics({
    context_tokens_provided: entry.tokens,
    context_tokens_injected,
    system_tokens,
    their_tokens_in,
    their_tokens_out,
    model: meta.model || "gpt-4o-mini",
    cost: meta.cost?.totalCost || 0,
  });

  console.log(`[EVAL] Query answered for case_id="${case_id}". Savings: ${metrics.savings_pct}% (${metrics.tokens_saved} tokens)`);

  return res.json({
    success: true,
    answer: result.response || "",
    metrics,
  });
});

/**
 * DELETE /api/eval/context/:case_id
 */
router.delete("/context/:case_id", evalAuth, (req, res) => {
  cleanExpiredEntries();

  const { case_id } = req.params;
  const existed = caseContextStore.has(case_id);
  caseContextStore.delete(case_id);

  console.log(`[EVAL] Context ${existed ? "deleted" : "not found (already gone)"} for case_id="${case_id}"`);

  return res.json({ success: true, case_id, was_present: existed });
});

/**
 * GET /api/eval/cases
 * List all active (non-expired) cases.
 */
router.get("/cases", evalAuth, (req, res) => {
  cleanExpiredEntries();

  const cases = [];
  for (const [case_id, entry] of caseContextStore.entries()) {
    cases.push({
      case_id,
      tokens: entry.tokens,
      created_at: entry.created_at.toISOString(),
      expires_at: entry.expires_at.toISOString(),
    });
  }

  return res.json({ success: true, active_cases: cases.length, cases });
});

export default router;
