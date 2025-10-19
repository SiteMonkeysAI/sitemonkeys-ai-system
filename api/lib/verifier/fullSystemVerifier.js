// import ledger from './masterLedger.json' with { type: 'json' };
import * as Memory from "../../categories/memory/verify.js";
import * as Injection from "../../categories/injection/verify.js";
import * as Truth from "../../categories/truth/verify.js";
import * as Vaults from "../../categories/vaults/verify.js";
import * as Personality from "../../categories/personality/verify.js";
import * as Governance from "../../categories/governance/verify.js";
import * as Security from "../../categories/security/verify.js";
import * as Infra from "../../categories/infra/verify.js";
import * as Platform from "../../categories/platform/verify.js";
import * as Future from "../../categories/future/verify.js";

// Temporary ledger placeholder until masterLedger.json is available
const ledger = { items: [] };

const categoryMap = {
  Memory,
  Injection,
  Truth,
  Vaults,
  Personality,
  Governance,
  Security,
  Infra,
  Platform,
  Future,
};

async function safeRun(fn, args) {
  try {
    const result = await fn(args);
    return { ok: result === true };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

export async function runVerifier() {
  const results = [];

  for (const item of ledger.items) {
    const category = categoryMap[item.category];

    if (!category) {
      results.push({
        id: item.id,
        name: item.name,
        ok: false,
        err: "Category not implemented yet",
      });
      continue;
    }

    const testFn = category[item.testFunction];

    if (!testFn) {
      results.push({
        id: item.id,
        name: item.name,
        ok: false,
        err: "Test function not found",
      });
      continue;
    }

    const result = await safeRun(testFn, item.testArgs);
    results.push({
      id: item.id,
      name: item.name,
      ok: result.ok,
      err: result.err,
    });
  }

  const passed = results.filter((r) => r.ok).length;

  return {
    summary: {
      total: results.length,
      passed: passed,
      failed: results.length - passed,
    },
    failed: results.filter((r) => !r.ok),
  };
}
