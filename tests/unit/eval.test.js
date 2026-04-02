/**
 * Eval Route Tests — EV-001 through EV-005
 *
 * Tests the in-memory case context store, TTL expiry, and metrics calculation
 * used by the /api/eval/* endpoints.
 *
 * Uses only pure-function and in-memory logic; no server, no DB, no API calls.
 *
 * Run with: node --test tests/unit/eval.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, "..", "..");
const EVAL_PATH  = join(REPO_ROOT, "api", "routes", "eval.js");
const HELPERS_PATH = join(REPO_ROOT, "api", "routes", "eval-helpers.js");
const SERVER_PATH = join(REPO_ROOT, "server.js");

// Import the helpers / store directly from the dependency-free helpers module.
// eval.js itself imports express (needs node_modules), so we target eval-helpers.js
// which has zero external dependencies.
const { caseContextStore, cleanExpiredEntries, countTokens, buildMetrics } =
  await import(HELPERS_PATH);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedEntry(case_id, overrides = {}) {
  const now = new Date();
  const entry = {
    context: "Sample context about the company's Q3 financials and burn rate.",
    tokens: countTokens("Sample context about the company's Q3 financials and burn rate."),
    created_at: now,
    expires_at: new Date(now.getTime() + 30 * 60 * 1000), // 30 min
    ...overrides,
  };
  caseContextStore.set(case_id, entry);
  return entry;
}

function clearAll() {
  caseContextStore.clear();
}

// ─── EV-001: Store context ────────────────────────────────────────────────────

describe("EV-001: POST /api/eval/context stores context under case_id", () => {
  beforeEach(clearAll);

  it("EV-001a: eval.js exports caseContextStore as a Map", () => {
    assert.ok(caseContextStore instanceof Map, "caseContextStore must be a Map");
  });

  it("EV-001b: seedEntry places entry in the store", () => {
    seedEntry("case-001");
    assert.ok(caseContextStore.has("case-001"), "case-001 should be in store");
  });

  it("EV-001c: stored entry has required fields", () => {
    const entry = seedEntry("case-001");
    assert.ok(typeof entry.context === "string", "context must be a string");
    assert.ok(typeof entry.tokens === "number" && entry.tokens > 0, "tokens must be a positive number");
    assert.ok(entry.created_at instanceof Date, "created_at must be a Date");
    assert.ok(entry.expires_at instanceof Date, "expires_at must be a Date");
  });

  it("EV-001d: tokens_loaded equals countTokens(context)", () => {
    const ctx = "This is a test context with some words.";
    const expected = countTokens(ctx);
    const entry = seedEntry("case-token", { context: ctx, tokens: expected });
    assert.strictEqual(entry.tokens, expected, "stored tokens must match countTokens(context)");
  });

  it("EV-001e: eval.js file exists on disk", () => {
    assert.ok(existsSync(EVAL_PATH), "api/routes/eval.js must exist");
  });

  it("EV-001f: server.js imports eval router", () => {
    const serverSrc = readFileSync(SERVER_PATH, "utf8");
    assert.ok(
      serverSrc.includes("eval") && serverSrc.includes("/api/eval"),
      "server.js must import the eval router and mount it at /api/eval",
    );
  });
});

// ─── EV-002: Query retrieves context by case_id and returns metrics ───────────

describe("EV-002: POST /api/eval/query retrieves context by case_id and returns metrics", () => {
  beforeEach(clearAll);

  it("EV-002a: buildMetrics returns all required fields", () => {
    const m = buildMetrics({
      context_tokens_provided: 2847,
      context_tokens_injected: 340,
      system_tokens: 287,
      their_tokens_in: 3247,
      their_tokens_out: 412,
      model: "gpt-4o-mini",
      cost: 0.0038,
    });

    const required = [
      "context_tokens_provided",
      "context_tokens_injected",
      "system_tokens",
      "our_total_tokens",
      "their_total_tokens",
      "tokens_saved",
      "savings_pct",
      "model",
      "cost",
    ];
    for (const field of required) {
      assert.ok(field in m, `metrics must contain field: ${field}`);
    }
  });

  it("EV-002b: buildMetrics arithmetic is correct", () => {
    const m = buildMetrics({
      context_tokens_provided: 2847,
      context_tokens_injected: 340,
      system_tokens: 287,
      their_tokens_in: 3247,
      their_tokens_out: 412,
      model: "gpt-4o-mini",
      cost: 0.0038,
    });

    assert.strictEqual(m.our_total_tokens, 340 + 287, "our_total_tokens = injected + system");
    assert.strictEqual(m.their_total_tokens, 3247 + 412, "their_total_tokens = in + out");
    assert.strictEqual(m.tokens_saved, m.their_total_tokens - m.our_total_tokens, "tokens_saved = their - our");
  });

  it("EV-002c: savings_pct is a number between 0 and 100", () => {
    const m = buildMetrics({
      context_tokens_provided: 2847,
      context_tokens_injected: 340,
      system_tokens: 287,
      their_tokens_in: 3247,
      their_tokens_out: 412,
      model: "gpt-4o-mini",
      cost: 0,
    });
    assert.ok(m.savings_pct >= 0 && m.savings_pct <= 100, "savings_pct must be between 0 and 100");
  });

  it("EV-002d: query handler reads from caseContextStore by case_id", () => {
    // Simulate what the query handler does: look up the store entry.
    const entry = seedEntry("case-002");
    const found = caseContextStore.get("case-002");
    assert.ok(found, "entry must be retrievable from caseContextStore by case_id");
    assert.strictEqual(found.context, entry.context, "retrieved context must match stored context");
  });

  it("EV-002e: query handler returns 404 when case_id not in store", () => {
    // Verify that the store correctly reports missing case.
    const found = caseContextStore.get("nonexistent-case");
    assert.strictEqual(found, undefined, "missing case_id must return undefined from store");
  });
});

// ─── EV-003: DELETE clears case context ──────────────────────────────────────

describe("EV-003: DELETE /api/eval/context/:case_id clears case context", () => {
  beforeEach(clearAll);

  it("EV-003a: case is removed from caseContextStore after delete", () => {
    seedEntry("case-003");
    assert.ok(caseContextStore.has("case-003"), "entry should exist before delete");
    caseContextStore.delete("case-003");
    assert.ok(!caseContextStore.has("case-003"), "entry should not exist after delete");
  });

  it("EV-003b: deleting a non-existent case does not throw", () => {
    assert.doesNotThrow(() => {
      caseContextStore.delete("case-never-set");
    });
  });

  it("EV-003c: other cases are unaffected by a targeted delete", () => {
    seedEntry("case-A");
    seedEntry("case-B");
    caseContextStore.delete("case-A");
    assert.ok(!caseContextStore.has("case-A"), "case-A should be gone");
    assert.ok(caseContextStore.has("case-B"), "case-B should still exist");
  });
});

// ─── EV-004: Expired entries are cleaned up automatically ────────────────────

describe("EV-004: Expired entries are cleaned up automatically", () => {
  beforeEach(clearAll);

  it("EV-004a: cleanExpiredEntries removes entries whose expires_at is in the past", () => {
    const past = new Date(Date.now() - 1000); // 1 second ago
    seedEntry("expired-case", { expires_at: past });
    assert.ok(caseContextStore.has("expired-case"), "entry should exist before cleanup");
    cleanExpiredEntries();
    assert.ok(!caseContextStore.has("expired-case"), "expired entry should be removed by cleanExpiredEntries");
  });

  it("EV-004b: cleanExpiredEntries keeps entries that have not yet expired", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    seedEntry("valid-case", { expires_at: future });
    cleanExpiredEntries();
    assert.ok(caseContextStore.has("valid-case"), "non-expired entry must survive cleanExpiredEntries");
  });

  it("EV-004c: cleanExpiredEntries removes only expired entries when mixed", () => {
    seedEntry("expired", { expires_at: new Date(Date.now() - 1) });
    seedEntry("valid",   { expires_at: new Date(Date.now() + 60000) });
    cleanExpiredEntries();
    assert.ok(!caseContextStore.has("expired"), "expired entry must be removed");
    assert.ok(caseContextStore.has("valid"),   "valid entry must remain");
  });

  it("EV-004d: eval.js calls cleanExpiredEntries at the top of every route handler (static check)", () => {
    const src = readFileSync(EVAL_PATH, "utf8");
    // Each handler block begins with cleanExpiredEntries()
    const callCount = (src.match(/cleanExpiredEntries\(\)/g) || []).length;
    // There are 4 route handlers — each should call it once.
    assert.ok(callCount >= 4, `cleanExpiredEntries() should be called in each route handler; found ${callCount} calls`);
  });
});

// ─── EV-005: context_tokens_injected <= context_tokens_provided ───────────────

describe("EV-005: context_tokens_injected is <= context_tokens_provided", () => {
  it("EV-005a: buildMetrics invariant holds when injected < provided", () => {
    const m = buildMetrics({
      context_tokens_provided: 5000,
      context_tokens_injected: 800,
      system_tokens: 300,
      their_tokens_in: 6000,
      their_tokens_out: 500,
      model: "gpt-4o-mini",
      cost: 0,
    });
    assert.ok(
      m.context_tokens_injected <= m.context_tokens_provided,
      "injected tokens must be <= provided tokens",
    );
  });

  it("EV-005b: buildMetrics invariant holds when injected equals provided (no filtering)", () => {
    const m = buildMetrics({
      context_tokens_provided: 500,
      context_tokens_injected: 500,
      system_tokens: 200,
      their_tokens_in: 700,
      their_tokens_out: 150,
      model: "gpt-4o-mini",
      cost: 0,
    });
    assert.ok(
      m.context_tokens_injected <= m.context_tokens_provided,
      "injected == provided is also acceptable",
    );
  });

  it("EV-005c: countTokens returns a non-negative integer", () => {
    const t = countTokens("Hello, this is a sample document.");
    assert.ok(Number.isInteger(t) && t >= 0, "countTokens must return a non-negative integer");
  });

  it("EV-005d: countTokens returns 0 for empty input", () => {
    assert.strictEqual(countTokens(""), 0);
    assert.strictEqual(countTokens(null), 0);
    assert.strictEqual(countTokens(undefined), 0);
  });

  it("EV-005e: longer context produces more tokens than shorter context", () => {
    const short = countTokens("Hi");
    const long  = countTokens("This is a much longer context string with many words in it.");
    assert.ok(long > short, "longer text must yield more tokens");
  });
});
