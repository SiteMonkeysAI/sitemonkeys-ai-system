/**
 * Cost Tracker — Adaptive Degradation Tests
 * CD-001 through CD-007
 *
 * Validates the getDegradationTier() method and the tier-based restrictions
 * applied in orchestrator.js for Issue: Implement adaptive degradation at 75%
 * session cost threshold.
 *
 * CD-001: getDegradationTier returns 'normal' at 50% of ceiling
 * CD-002: getDegradationTier returns 'efficiency' at 65% of ceiling
 * CD-003: getDegradationTier returns 'minimal' at 85% of ceiling
 * CD-004: getDegradationTier returns 'hard_stop' at 96% of ceiling
 * CD-005: efficiency tier disables external lookup (source check)
 * CD-006: minimal tier reduces history to 2 turns and forces mini model (source check)
 * CD-007: high_stakes queries never force minimum model even in minimal tier (source check)
 *
 * Run with: node --test tests/unit/costTracker.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { costTracker, COST_CEILINGS } from '../../api/utils/cost-tracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  const fullPath = join(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Helpers: manufacture a session with a specific cost ratio
// ---------------------------------------------------------------------------

function makeSessionAtRatio(sessionId, mode, ratio) {
  const ceiling = COST_CEILINGS[mode] || COST_CEILINGS.truth_general;
  const targetCost = ceiling * ratio;
  // Record a single cost entry that places the session at the target ratio
  return costTracker.recordCost(sessionId, targetCost, 'test', { mode });
}

// ---------------------------------------------------------------------------

describe('CD. Adaptive Degradation — CostTracker.getDegradationTier()', () => {

  // Use unique session IDs per test so sessions do not bleed into one another
  let sessionBase;
  beforeEach(() => {
    sessionBase = `cd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  it('CD-001: getDegradationTier returns "normal" at 50% of ceiling', async () => {
    const sid = `${sessionBase}-cd001`;
    await makeSessionAtRatio(sid, 'truth_general', 0.50);
    const tier = costTracker.getDegradationTier(sid, 'truth_general');
    assert.strictEqual(tier, 'normal', `CD-001 FAIL: expected 'normal' at 50% but got '${tier}'`);
  });

  it('CD-002: getDegradationTier returns "efficiency" at 65% of ceiling', async () => {
    const sid = `${sessionBase}-cd002`;
    await makeSessionAtRatio(sid, 'truth_general', 0.65);
    const tier = costTracker.getDegradationTier(sid, 'truth_general');
    assert.strictEqual(tier, 'efficiency', `CD-002 FAIL: expected 'efficiency' at 65% but got '${tier}'`);
  });

  it('CD-003: getDegradationTier returns "minimal" at 85% of ceiling', async () => {
    const sid = `${sessionBase}-cd003`;
    await makeSessionAtRatio(sid, 'truth_general', 0.85);
    const tier = costTracker.getDegradationTier(sid, 'truth_general');
    assert.strictEqual(tier, 'minimal', `CD-003 FAIL: expected 'minimal' at 85% but got '${tier}'`);
  });

  it('CD-004: getDegradationTier returns "hard_stop" at 96% of ceiling', async () => {
    const sid = `${sessionBase}-cd004`;
    await makeSessionAtRatio(sid, 'truth_general', 0.96);
    const tier = costTracker.getDegradationTier(sid, 'truth_general');
    assert.strictEqual(tier, 'hard_stop', `CD-004 FAIL: expected 'hard_stop' at 96% but got '${tier}'`);
  });

  it('CD-005: efficiency tier disables external lookup — gate present in orchestrator.js', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CD-005 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orch.includes('getDegradationTier('),
      'CD-005 FAIL: getDegradationTier not called in orchestrator.js'
    );

    assert.ok(
      orch.includes("degradationTier !== 'normal'"),
      "CD-005 FAIL: orchestrator.js must gate external lookup on degradationTier !== 'normal'"
    );

    assert.ok(
      orch.includes('phase4Metadata.degradation_tier = degradationTier'),
      'CD-005 FAIL: orchestrator.js must store degradation_tier in phase4Metadata'
    );
  });

  it('CD-006: minimal tier reduces history to 2 turns and forces gpt-4o-mini', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CD-006 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orch.includes("degradation_tier === 'minimal'"),
      "CD-006 FAIL: orchestrator.js must check degradation_tier === 'minimal' for minimal-mode restrictions"
    );

    // Compressed prompt override
    assert.ok(
      orch.includes("phase4Metadata?.degradation_tier === 'minimal'"),
      "CD-006 FAIL: useCompressedPrompt must be forced true when degradation_tier === 'minimal'"
    );

    // History reduction via tier
    assert.ok(
      orch.includes("_tierForHistory === 'minimal'"),
      "CD-006 FAIL: approachingCeiling must activate on _tierForHistory === 'minimal' to reduce history to 2"
    );

    // Force mini model
    assert.ok(
      orch.includes('gpt-4o-mini') &&
      orch.includes("degradation_tier === 'minimal'"),
      "CD-006 FAIL: orchestrator.js must route to gpt-4o-mini when degradation_tier === 'minimal'"
    );
  });

  it('CD-007: high_stakes queries never forced to gpt-4o-mini in minimal tier', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CD-007 FAIL: Could not read api/core/orchestrator.js');

    // The force-mini block must guard with !highStakes
    assert.ok(
      orch.includes("degradation_tier === 'minimal' && !highStakes"),
      "CD-007 FAIL: force-mini block must include '&& !highStakes' guard to protect high-stakes queries"
    );
  });

});
