/**
 * Business Context Classifier Fix Tests (BCTX-001 through BCTX-004)
 *
 * Verifies that business analysis queries containing freshness words ("current", "latest")
 * are classified as AMBIGUOUS (not VOLATILE) so Stage 2 can correctly assign SEMI_STABLE.
 *
 * Root cause fixed: VOLATILE Pattern 0 matched "current" regardless of context.
 * "Current burn rate" is business context, not "current price of Bitcoin" (real-time data).
 *
 * Run with: node --test tests/unit/businessContextClassifier.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectByPattern, TRUTH_TYPES } from '../../api/core/intelligence/truthTypeDetector.js';

// ---------------------------------------------------------------------------
// BCTX-001: Business burn-rate query with "current" → AMBIGUOUS, not VOLATILE
// ---------------------------------------------------------------------------

describe('BCTX-001: "Current burn rate $280k revenue $4.8M" → AMBIGUOUS, not VOLATILE', () => {

  it('BCTX-001a: returns AMBIGUOUS (not VOLATILE)', () => {
    const result = detectByPattern('Current burn rate $280k revenue $4.8M');
    assert.strictEqual(
      result.type,
      TRUTH_TYPES.AMBIGUOUS,
      `Expected AMBIGUOUS but got ${result.type}. Reason: ${result.reason}`
    );
  });

  it('BCTX-001b: reason is business_context_override', () => {
    const result = detectByPattern('Current burn rate $280k revenue $4.8M');
    assert.strictEqual(
      result.reason,
      'business_context_override',
      `Expected reason 'business_context_override' but got '${result.reason}'`
    );
  });

  it('BCTX-001c: stage is 1 (Stage 2 must be invoked by caller)', () => {
    const result = detectByPattern('Current burn rate $280k revenue $4.8M');
    assert.strictEqual(result.stage, 1, 'detectByPattern must return stage 1 for AMBIGUOUS result');
  });

});

// ---------------------------------------------------------------------------
// BCTX-002: Real-time price query still returns VOLATILE (price signal overrides)
// ---------------------------------------------------------------------------

describe('BCTX-002: "Current price of Bitcoin" still returns VOLATILE', () => {

  it('BCTX-002a: price signal keeps VOLATILE classification', () => {
    const result = detectByPattern('Current price of Bitcoin');
    assert.strictEqual(
      result.type,
      TRUTH_TYPES.VOLATILE,
      `Expected VOLATILE but got ${result.type}. Reason: ${result.reason}`
    );
  });

});

// ---------------------------------------------------------------------------
// BCTX-003: Board/profitability query routes to Stage 2
// ---------------------------------------------------------------------------

describe('BCTX-003: "Board wants path to profitability current burn $280k" → AMBIGUOUS', () => {

  it('BCTX-003a: returns AMBIGUOUS (routes to Stage 2)', () => {
    const result = detectByPattern('Board wants path to profitability current burn $280k');
    assert.strictEqual(
      result.type,
      TRUTH_TYPES.AMBIGUOUS,
      `Expected AMBIGUOUS but got ${result.type}. Reason: ${result.reason}`
    );
  });

  it('BCTX-003b: reason is business_context_override', () => {
    const result = detectByPattern('Board wants path to profitability current burn $280k');
    assert.strictEqual(
      result.reason,
      'business_context_override',
      `Expected reason 'business_context_override' but got '${result.reason}'`
    );
  });

});

// ---------------------------------------------------------------------------
// BCTX-004: Full example from issue report → AMBIGUOUS
// ---------------------------------------------------------------------------

describe('BCTX-004: Full issue example returns AMBIGUOUS', () => {

  it('BCTX-004a: "Board wants path to profitability. Current burn $280k/month. Revenue $4.8M ARR growing 40%" → AMBIGUOUS', () => {
    const result = detectByPattern(
      'Board wants path to profitability. Current burn $280k/month. Revenue $4.8M ARR growing 40%'
    );
    assert.strictEqual(
      result.type,
      TRUTH_TYPES.AMBIGUOUS,
      `Expected AMBIGUOUS but got ${result.type}. Reason: ${result.reason}`
    );
  });

});
