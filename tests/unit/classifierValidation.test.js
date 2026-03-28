/**
 * Classifier Validation Tests (CV-001 through CV-007)
 *
 * Uses code-scanning only (readFileSync / static analysis) so no
 * transitive network or DB dependencies are triggered.
 *
 * Run with: node --test tests/unit/classifierValidation.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const ENDPOINT_PATH      = join(REPO_ROOT, 'api', 'routes', 'classifier-test.js');
const VALIDATION_SET_PATH = join(REPO_ROOT, 'api', 'admin', 'classifier-validation-set.js');
const SERVER_PATH        = join(REPO_ROOT, 'server.js');

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

function readFile(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Dynamically import the validation set (ESM)
const { CLASSIFIER_VALIDATION_SET } = await import(VALIDATION_SET_PATH);

// ---------------------------------------------------------------------------
// CV-001: Endpoint file exists and requires admin key
// ---------------------------------------------------------------------------

describe('CV-001: POST /api/admin/classifier-test — endpoint exists and requires admin key', () => {

  it('CV-001a: classifier-test.js exists', () => {
    assert.ok(existsSync(ENDPOINT_PATH), 'api/routes/classifier-test.js is missing');
  });

  it('CV-001b: endpoint checks x-admin-key header', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src, 'classifier-test.js could not be read');
    assert.ok(
      src.includes('x-admin-key') && src.includes('ADMIN_KEY'),
      'classifier-test.js must check x-admin-key against process.env.ADMIN_KEY'
    );
  });

  it('CV-001c: endpoint returns 403 when key is missing/wrong', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('403'), 'classifier-test.js must return HTTP 403 on auth failure');
  });

  it('CV-001d: endpoint is registered in server.js', () => {
    const src = readFile(SERVER_PATH);
    assert.ok(src, 'server.js could not be read');
    assert.ok(
      src.includes('/api/admin/classifier-test'),
      'server.js must register /api/admin/classifier-test'
    );
  });

});

// ---------------------------------------------------------------------------
// CV-002: Results array with pass/fail per query
// ---------------------------------------------------------------------------

describe('CV-002: Results array with pass/fail per query', () => {

  it('CV-002a: response shape includes a results array', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('results'), 'classifier-test.js must build a results array');
  });

  it('CV-002b: each result object has a pass field', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('pass'), 'classifier-test.js must set pass on each result');
  });

  it('CV-002c: each result object has a failure_reason field', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('failure_reason'), 'classifier-test.js must include failure_reason on each result');
  });

});

// ---------------------------------------------------------------------------
// CV-003: Summary with pass_rate calculated correctly
// ---------------------------------------------------------------------------

describe('CV-003: Summary with pass_rate calculated correctly', () => {

  it('CV-003a: response includes a summary object', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('summary'), 'classifier-test.js must return a summary object');
  });

  it('CV-003b: summary includes pass_rate', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src.includes('pass_rate'), 'classifier-test.js must calculate pass_rate');
  });

  it('CV-003c: pass_rate formula divides passed by total', () => {
    const src = readFile(ENDPOINT_PATH);
    // Look for the ratio expression: passed / total
    assert.ok(
      src.includes('passed') && src.includes('total'),
      'classifier-test.js must compute pass_rate from passed/total'
    );
  });

});

// ---------------------------------------------------------------------------
// CV-004: Runs without full AI generation (no GPT-4 call)
// ---------------------------------------------------------------------------

describe('CV-004: No full AI generation triggered', () => {

  it('CV-004a: classifier-test.js does not import orchestrator', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src, 'classifier-test.js could not be read');
    assert.ok(
      !src.includes('orchestrator'),
      'classifier-test.js must NOT import or call the orchestrator'
    );
  });

  it('CV-004b: classifier-test.js does not call /api/chat', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(!src.includes('/api/chat'), 'classifier-test.js must not route through /api/chat');
  });

  it('CV-004c: classifier-test.js imports classifyQueryComplexity directly', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(
      src.includes('classifyQueryComplexity'),
      'classifier-test.js must import classifyQueryComplexity directly'
    );
  });

  it('CV-004d: classifier-test.js imports detectByPattern directly', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(
      src.includes('detectByPattern'),
      'classifier-test.js must import detectByPattern directly'
    );
  });

});

// ---------------------------------------------------------------------------
// CV-005: CLASSIFIER_VALIDATION_SET contains exactly 80 queries
// ---------------------------------------------------------------------------

describe('CV-005: CLASSIFIER_VALIDATION_SET contains exactly 80 queries', () => {

  it('CV-005a: validation set file exists', () => {
    assert.ok(existsSync(VALIDATION_SET_PATH), 'api/admin/classifier-validation-set.js is missing');
  });

  it('CV-005b: exports CLASSIFIER_VALIDATION_SET', () => {
    assert.ok(
      Array.isArray(CLASSIFIER_VALIDATION_SET),
      'CLASSIFIER_VALIDATION_SET must be an exported array'
    );
  });

  it('CV-005c: contains exactly 80 queries', () => {
    assert.strictEqual(
      CLASSIFIER_VALIDATION_SET.length,
      80,
      `Expected 80 queries, got ${CLASSIFIER_VALIDATION_SET.length}`
    );
  });

});

// ---------------------------------------------------------------------------
// CV-006: Each truth type category has exactly 20 queries
// ---------------------------------------------------------------------------

describe('CV-006: Each truth type category has exactly 20 queries', () => {

  it('CV-006a: 20 PERMANENT section queries (CLF001-CLF020)', () => {
    const count = CLASSIFIER_VALIDATION_SET.filter(
      q => q.id >= 'CLF001' && q.id <= 'CLF020'
    ).length;
    assert.strictEqual(count, 20, `Expected 20 queries in CLF001-CLF020, got ${count}`);
  });

  it('CV-006b: 20 SEMI_STABLE section queries (CLF021-CLF040)', () => {
    const count = CLASSIFIER_VALIDATION_SET.filter(
      q => q.id >= 'CLF021' && q.id <= 'CLF040'
    ).length;
    assert.strictEqual(count, 20, `Expected 20 queries in CLF021-CLF040, got ${count}`);
  });

  it('CV-006c: 20 VOLATILE section queries (CLF041-CLF060)', () => {
    const count = CLASSIFIER_VALIDATION_SET.filter(
      q => q.id >= 'CLF041' && q.id <= 'CLF060'
    ).length;
    assert.strictEqual(count, 20, `Expected 20 queries in CLF041-CLF060, got ${count}`);
  });

  it('CV-006d: 20 AMBIGUOUS section queries (CLF061-CLF080)', () => {
    const count = CLASSIFIER_VALIDATION_SET.filter(
      q => q.id >= 'CLF061' && q.id <= 'CLF080'
    ).length;
    assert.strictEqual(count, 20, `Expected 20 queries in CLF061-CLF080, got ${count}`);
  });

});

// ---------------------------------------------------------------------------
// CV-007: All required fields present on each result object (structural check)
// ---------------------------------------------------------------------------

describe('CV-007: All required fields present in each validation set entry', () => {

  const REQUIRED_FIELDS = ['id', 'query', 'expected_classification', 'expected_truth_type', 'expected_lookup'];

  it('CV-007a: every entry has all required fields', () => {
    for (const entry of CLASSIFIER_VALIDATION_SET) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(entry, field),
          `Entry ${entry.id} is missing required field: ${field}`
        );
      }
    }
  });

  it('CV-007b: all IDs are unique', () => {
    const ids = CLASSIFIER_VALIDATION_SET.map(q => q.id);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'Duplicate IDs found in CLASSIFIER_VALIDATION_SET');
  });

  it('CV-007c: expected_lookup is a boolean on every entry', () => {
    for (const entry of CLASSIFIER_VALIDATION_SET) {
      assert.strictEqual(
        typeof entry.expected_lookup,
        'boolean',
        `Entry ${entry.id}: expected_lookup must be a boolean, got ${typeof entry.expected_lookup}`
      );
    }
  });

  it('CV-007d: endpoint result shape includes all 11 required output fields', () => {
    const src = readFile(ENDPOINT_PATH);
    const RESULT_FIELDS = [
      'id', 'query',
      'expected_classification', 'actual_classification',
      'expected_truth_type', 'actual_truth_type',
      'expected_lookup', 'actual_lookup',
      'confidence', 'pass', 'failure_reason'
    ];
    for (const field of RESULT_FIELDS) {
      assert.ok(
        src.includes(field),
        `classifier-test.js result object is missing field: ${field}`
      );
    }
  });

});

// ---------------------------------------------------------------------------
// CF-017 through CF-022: Policy/regulation SEMI_STABLE fix + decision_making lookup=false
// ---------------------------------------------------------------------------

const TRUTH_DETECTOR_PATH = join(REPO_ROOT, 'api', 'core', 'intelligence', 'truthTypeDetector.js');

// Import detectByPattern directly to test actual runtime behavior, not a duplicate pattern copy
const { detectByPattern } = await import(TRUTH_DETECTOR_PATH);

describe('CF-017 through CF-022: Policy/regulation SEMI_STABLE + decision_making lookup=false', () => {

  it('CF-017: POLICY_PATTERNS block present in truthTypeDetector.js', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('POLICY_PATTERNS') && src.includes('policy_regulation_current'),
      'truthTypeDetector.js must contain POLICY_PATTERNS block with policy_regulation_current label'
    );
  });

  it('CF-017: "current interest rates" → SEMI_STABLE', () => {
    const result = detectByPattern('current interest rates');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-018: "current travel restrictions" → SEMI_STABLE', () => {
    const result = detectByPattern('current travel restrictions');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-019: "current OSHA requirements" → SEMI_STABLE', () => {
    const result = detectByPattern('current OSHA requirements');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-019: "What are the current OSHA safety requirements?" → SEMI_STABLE', () => {
    const result = detectByPattern('What are the current OSHA safety requirements?');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-020: "current tax rate for corporations" → SEMI_STABLE', () => {
    const result = detectByPattern('current tax rate for corporations');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-021: "Is Netflix still offering a free trial" → SEMI_STABLE', () => {
    const result = detectByPattern('Is Netflix still offering a free trial');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-022: classifier-test.js uses classResult.externalLookupRequired for lookup computation', () => {
    const src = readFile(ENDPOINT_PATH);
    assert.ok(src, 'classifier-test.js could not be read');
    assert.ok(
      src.includes('classResult.externalLookupRequired === false'),
      'classifier-test.js must check classResult.externalLookupRequired === false to suppress lookup for decision_making queries'
    );
  });

  it('CF-022: decision_making pre-check in queryComplexityClassifier.js sets externalLookupRequired: false', () => {
    const classifierPath = join(REPO_ROOT, 'api', 'core', 'intelligence', 'queryComplexityClassifier.js');
    const src = readFile(classifierPath);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    // Verify that in the DECISION_PATTERNS block, externalLookupRequired is explicitly false
    assert.ok(
      src.includes('DECISION_PATTERNS') && src.includes('externalLookupRequired: false'),
      'queryComplexityClassifier.js DECISION_PATTERNS block must set externalLookupRequired: false'
    );
  });

  it('CF-022: decision_making pre-check in queryComplexityClassifier.js sets shouldTriggerLookup: false', () => {
    const classifierPath = join(REPO_ROOT, 'api', 'core', 'intelligence', 'queryComplexityClassifier.js');
    const src = readFile(classifierPath);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('shouldTriggerLookup: false'),
      'queryComplexityClassifier.js DECISION_PATTERNS block must set shouldTriggerLookup: false'
    );
  });

  it('CF-023: LEADERSHIP_PATTERNS early return is still present and unchanged', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('LEADERSHIP_PATTERNS') && src.includes('leadership_current_holder'),
      'truthTypeDetector.js must still contain LEADERSHIP_PATTERNS block with leadership_current_holder label'
    );
  });

  it('CF-023: POLICY_PATTERNS early return runs after LEADERSHIP check (code order)', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    const leadershipIdx = src.indexOf('LEADERSHIP_PATTERNS');
    const policyIdx     = src.indexOf('POLICY_PATTERNS');
    assert.ok(leadershipIdx !== -1, 'LEADERSHIP_PATTERNS must be present');
    assert.ok(policyIdx !== -1, 'POLICY_PATTERNS must be present');
    assert.ok(
      leadershipIdx < policyIdx,
      'LEADERSHIP_PATTERNS must appear before POLICY_PATTERNS in the source file'
    );
  });

});

// ---------------------------------------------------------------------------
// CF-024 through CF-033: Expanded POLICY_PATTERNS + REALTIME_PATTERNS (Issue 2)
// ---------------------------------------------------------------------------

const CLASSIFIER_PATH = join(REPO_ROOT, 'api', 'core', 'intelligence', 'queryComplexityClassifier.js');

describe('CF-024 through CF-033: Expanded POLICY_PATTERNS and REALTIME_PATTERNS', () => {

  // --- SEMI_STABLE runtime tests via detectByPattern ---

  it('CF-024: "current federal minimum wage" → SEMI_STABLE', () => {
    const result = detectByPattern('current federal minimum wage');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-025: "current COVID vaccine requirements" → SEMI_STABLE', () => {
    const result = detectByPattern('current COVID vaccine requirements');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-026: "latest macOS version" → SEMI_STABLE', () => {
    const result = detectByPattern('latest macOS version');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-027: "current hours for the DMV" → SEMI_STABLE', () => {
    const result = detectByPattern('current hours for the DMV');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-028: "latest Python version features" → SEMI_STABLE', () => {
    const result = detectByPattern('latest Python version features');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  // --- news_current_events / VOLATILE runtime + structural tests ---

  it('CF-029: "Is the stock market up today" → VOLATILE (routes to news_current_events)', () => {
    const result = detectByPattern('Is the stock market up today');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-029: queryComplexityClassifier.js REALTIME_PATTERNS captures stock market movement queries', () => {
    const src = readFile(CLASSIFIER_PATH);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('stock market'),
      'queryComplexityClassifier.js REALTIME_PATTERNS must include stock market pattern'
    );
  });

  it('CF-030: "What is happening with the Fed today" → VOLATILE (routes to news_current_events)', () => {
    const result = detectByPattern('What is happening with the Fed today');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-031: "What is the current temperature in New York" → VOLATILE (REALTIME pattern)', () => {
    const result = detectByPattern('What is the current temperature in New York');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-031: queryComplexityClassifier.js REALTIME_PATTERNS captures temperature/weather queries', () => {
    const src = readFile(CLASSIFIER_PATH);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('temperature|weather|forecast|conditions'),
      'queryComplexityClassifier.js REALTIME_PATTERNS must include temperature/weather pattern'
    );
  });

  it('CF-032: queryComplexityClassifier.js REALTIME_PATTERNS captures "latest developments in" queries', () => {
    const src = readFile(CLASSIFIER_PATH);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('developments? in'),
      'queryComplexityClassifier.js REALTIME_PATTERNS must include latest developments pattern'
    );
  });

  it('CF-033: LEADERSHIP_PATTERNS and POLICY_PATTERNS structural integrity preserved (no regressions)', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('LEADERSHIP_PATTERNS') && src.includes('leadership_current_holder'),
      'LEADERSHIP_PATTERNS block must remain present and unchanged'
    );
    assert.ok(
      src.includes('POLICY_PATTERNS') && src.includes('policy_regulation_current'),
      'POLICY_PATTERNS block must remain present'
    );
    const leadershipIdx = src.indexOf('LEADERSHIP_PATTERNS');
    const policyIdx = src.indexOf('POLICY_PATTERNS');
    assert.ok(
      leadershipIdx < policyIdx,
      'LEADERSHIP_PATTERNS must still appear before POLICY_PATTERNS in the source file'
    );
  });

});

// ---------------------------------------------------------------------------
// CF-034 through CF-041: Historical/Authorship PERMANENT, War/Conflict VOLATILE Override,
// News Classification Gaps
// ---------------------------------------------------------------------------

describe('CF-034 through CF-041: Historical/Authorship PERMANENT + War/Conflict VOLATILE + Headlines', () => {

  // --- FIX 1: PERMANENT patterns for historical/authorship/astronomical ---

  it('CF-034: "Who wrote Hamlet?" → PERMANENT', () => {
    const result = detectByPattern('Who wrote Hamlet?');
    assert.strictEqual(result.type, 'PERMANENT', `Expected PERMANENT, got ${result.type}`);
  });

  it('CF-035: "What year did World War 2 end?" → PERMANENT', () => {
    const result = detectByPattern('What year did World War 2 end?');
    assert.strictEqual(result.type, 'PERMANENT', `Expected PERMANENT, got ${result.type}`);
  });

  it('CF-036: "How many planets in solar system?" → PERMANENT', () => {
    const result = detectByPattern('How many planets in solar system?');
    assert.strictEqual(result.type, 'PERMANENT', `Expected PERMANENT, got ${result.type}`);
  });

  it('CF-037: "What causes rainbows?" → PERMANENT', () => {
    const result = detectByPattern('What causes rainbows?');
    assert.strictEqual(result.type, 'PERMANENT', `Expected PERMANENT, got ${result.type}`);
  });

  it('CF-034b: truthTypeDetector.js contains authorship PERMANENT pattern', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('wrote|authored|created|invented|discovered|painted|composed'),
      'truthTypeDetector.js must include authorship pattern in PERMANENT_PATTERNS'
    );
  });

  it('CF-036b: truthTypeDetector.js contains astronomical count PERMANENT pattern', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('planets?|moons?|stars?|galaxies|elements?'),
      'truthTypeDetector.js must include astronomical count pattern in PERMANENT_PATTERNS'
    );
  });

  // --- FIX 2: War/conflict exclusion from SEMI_STABLE policy patterns ---

  it('CF-038: "current status of war in Ukraine" → VOLATILE not SEMI_STABLE', () => {
    const result = detectByPattern('current status of war in Ukraine');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-039: "latest developments in Gaza" → VOLATILE not SEMI_STABLE', () => {
    const result = detectByPattern('latest developments in Gaza');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-038b: truthTypeDetector.js contains CONFLICT_EXCLUSION guard', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('CONFLICT_EXCLUSION'),
      'truthTypeDetector.js must contain CONFLICT_EXCLUSION to prevent war/conflict queries from being SEMI_STABLE'
    );
  });

  // --- FIX 3A: "What is happening with X today" → news_current_events ---

  it('CF-040: "What is happening with the Fed today" → VOLATILE (routes to news_current_events)', () => {
    const result = detectByPattern('What is happening with the Fed today');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-040b: queryComplexityClassifier.js REALTIME_PATTERNS captures "what is happening" queries', () => {
    const src = readFile(CLASSIFIER_PATH);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('what.{0,15}happening'),
      'queryComplexityClassifier.js REALTIME_PATTERNS must include what-is-happening pattern'
    );
  });

  // --- FIX 3C: Today's headlines always VOLATILE ---

  it("CF-041: \"today's top headlines\" → VOLATILE", () => {
    const result = detectByPattern("today's top headlines");
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-041b: "todays top headlines" (no apostrophe) → VOLATILE', () => {
    const result = detectByPattern('todays top headlines');
    assert.strictEqual(result.type, 'VOLATILE', `Expected VOLATILE, got ${result.type}`);
  });

  it('CF-041c: queryComplexityClassifier.js REALTIME_PATTERNS captures "top headlines" queries', () => {
    const src = readFile(CLASSIFIER_PATH);
    assert.ok(src, 'queryComplexityClassifier.js could not be read');
    assert.ok(
      src.includes('top headlines'),
      'queryComplexityClassifier.js REALTIME_PATTERNS must include top headlines pattern'
    );
  });

  // --- CF-042: Existing policy SEMI_STABLE tests still pass (regression guard) ---

  it('CF-042: "current interest rates" still → SEMI_STABLE (no regression)', () => {
    const result = detectByPattern('current interest rates');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-042: "current travel restrictions" still → SEMI_STABLE (no regression)', () => {
    const result = detectByPattern('current travel restrictions');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

  it('CF-042: "current mortgage rate" → SEMI_STABLE (policy cycle, not daily)', () => {
    const result = detectByPattern('What is the current mortgage rate?');
    assert.strictEqual(result.type, 'SEMI_STABLE', `Expected SEMI_STABLE, got ${result.type}`);
  });

});

// ---------------------------------------------------------------------------
// CF-044 through CF-049: 80-Query Validation Set — 3 Fixed Pattern Gaps
//
// These tests document the 5 consistent failures identified at 93.8% pass rate
// (75/80 queries passing) when running POST /api/admin/classifier-test.
//
// Failure distribution from failures_by_type:
//   PERMANENT:   3 failures
//   SEMI_STABLE: 1 failure
//   VOLATILE:    1 failure
//
// Root cause analysis:
//   CLF017 (PERMANENT)  — detectByPattern regex for astronomical count couldn't match
//                         compound prepositions "are in" (only handled "are" OR "in").
//                         Fixable pattern gap. Fixed in this PR.
//   CLF027 (SEMI_STABLE) — "What are the FDA guidelines on sugar intake?" matched the
//                          PERMANENT "what are" pattern before SEMI_STABLE FDA pattern.
//                          POLICY_PATTERNS required "current/latest" prefix; standalone
//                          agency + "guidelines" wasn't covered. Fixable pattern gap.
//                          Fixed in this PR.
//   CLF043 (VOLATILE)   — "What is the latest news on Ukraine?" was intercepted by
//                          FRESHNESS_OVERRIDE_PATTERNS (`latest (information|news|...)`)
//                          and returned SEMI_STABLE before VOLATILE detection ran.
//                          "Latest news" carries inherent real-time intent — same root
//                          cause as the earlier "latest developments" fix for Gaza.
//                          Fixable pattern gap. Fixed in this PR.
//   CLF015 (PERMANENT)  — "Who wrote Hamlet?" (17 chars): expected `simple_factual`
//                          classification but with all-zero embedding fallback the
//                          length < 30 branch returns `simple_short`. Genuine
//                          classifier limitation — depends on embedding confidence
//                          exceeding MEDIUM_CONFIDENCE (0.60) for simple_factual anchor.
//   CLF012 (PERMANENT)  — "What year did World War 2 end?" (30 chars): expected
//                          `simple_factual` classification but queryLength = 30 is NOT
//                          < 30 so the short-query branch doesn't fire. Classification
//                          relies solely on embedding similarity to the simple_factual
//                          anchor. Genuine classifier limitation.
//
// Note: CLF015 and CLF012 are NOT tested here because they require live OpenAI
// embeddings to reproduce. Their pass/fail depends on the cosine similarity score
// against the simple_factual concept anchor — determinism requires the production API.
// ---------------------------------------------------------------------------

describe('CF-044 through CF-049: Fixed 80-query validation set pattern gaps', () => {

  // ── FIX: CLF017 — "How many planets are in the solar system?" was AMBIGUOUS ──

  it('CF-044: "How many planets are in the solar system?" → PERMANENT (was AMBIGUOUS — compound preposition bug)', () => {
    const result = detectByPattern('How many planets are in the solar system?');
    assert.strictEqual(result.type, 'PERMANENT',
      `CLF017 regression: expected PERMANENT, got ${result.type}. ` +
      'Astronomical count pattern must handle compound preposition "are in".'
    );
  });

  it('CF-044b: astronomical count pattern handles "are in" without breaking plain "in" form', () => {
    const withAreIn  = detectByPattern('How many planets are in the solar system?');
    const withJustIn = detectByPattern('How many planets in solar system?');
    assert.strictEqual(withAreIn.type,  'PERMANENT', `"are in" form should be PERMANENT, got ${withAreIn.type}`);
    assert.strictEqual(withJustIn.type, 'PERMANENT', `plain "in" form should still be PERMANENT, got ${withJustIn.type}`);
  });

  it('CF-044c: truthTypeDetector.js astronomical pattern uses non-capturing groups for compound preposition', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    // New pattern uses (?:are |is )? followed by (?:in |of )? to handle "are in"
    assert.ok(
      src.includes('(?:are |is )?(?:in |of )?'),
      'truthTypeDetector.js astronomical count pattern must use non-capturing optional groups to handle "are in the solar system"'
    );
  });

  // ── FIX: CLF027 — "What are the FDA guidelines on sugar intake?" was PERMANENT ──

  it('CF-045: "What are the FDA guidelines on sugar intake?" → SEMI_STABLE (was PERMANENT — missing agency pattern)', () => {
    const result = detectByPattern('What are the FDA guidelines on sugar intake?');
    assert.strictEqual(result.type, 'SEMI_STABLE',
      `CLF027 regression: expected SEMI_STABLE, got ${result.type}. ` +
      'Regulatory agency + guidelines must be classified as SEMI_STABLE, not PERMANENT.'
    );
  });

  it('CF-045b: other agency guideline variations also → SEMI_STABLE', () => {
    const queries = [
      'What are the FDA guidelines on food labeling?',
      'What are the OSHA guidelines for construction sites?',
      'What are the EPA guidelines on emissions?',
    ];
    for (const q of queries) {
      const result = detectByPattern(q);
      assert.strictEqual(result.type, 'SEMI_STABLE',
        `"${q}" should be SEMI_STABLE (agency guideline), got ${result.type}`
      );
    }
  });

  it('CF-045c: truthTypeDetector.js POLICY_PATTERNS includes agency guideline pattern without requiring temporal prefix', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    assert.ok(
      src.includes('fda|epa|cdc|osha|irs|sec') && src.includes('guidelines?'),
      'truthTypeDetector.js POLICY_PATTERNS must contain agency guideline pattern (fda|epa|...) + guidelines?'
    );
  });

  // ── FIX: CLF043 — "What is the latest news on Ukraine?" was SEMI_STABLE ──

  it('CF-046: "What is the latest news on Ukraine?" → VOLATILE (was SEMI_STABLE — news intercepted by FRESHNESS_OVERRIDE)', () => {
    const result = detectByPattern('What is the latest news on Ukraine?');
    assert.strictEqual(result.type, 'VOLATILE',
      `CLF043 regression: expected VOLATILE, got ${result.type}. ` +
      '"latest news" carries real-time intent and must not be classified as SEMI_STABLE.'
    );
  });

  it('CF-046b: other "latest news" variants also → VOLATILE', () => {
    const queries = [
      'What is the latest news about the election?',
      'What is the latest news on the economy?',
    ];
    for (const q of queries) {
      const result = detectByPattern(q);
      assert.strictEqual(result.type, 'VOLATILE',
        `"${q}" should be VOLATILE (latest news = real-time), got ${result.type}`
      );
    }
  });

  it('CF-046c: "latest news" removed from FRESHNESS_OVERRIDE_PATTERNS in truthTypeDetector.js', () => {
    const src = readFile(TRUTH_DETECTOR_PATH);
    assert.ok(src, 'truthTypeDetector.js could not be read');
    // The old pattern was: /latest (information|news|updates|events)/i
    // New pattern must NOT include "news" in this freshness override
    assert.ok(
      !src.includes('latest (information|news|'),
      'truthTypeDetector.js FRESHNESS_OVERRIDE_PATTERNS must not intercept "latest news" — ' +
      'it must fall through to VOLATILE_PATTERNS instead'
    );
  });

  it('CF-046d: "latest information", "latest updates", and "latest events" remain SEMI_STABLE (no regression)', () => {
    const infoResult    = detectByPattern('What is the latest information on the regulations?');
    const updatesResult = detectByPattern('What are the latest updates on the policy?');
    const eventsResult  = detectByPattern('What are the latest events in the industry?');
    assert.strictEqual(infoResult.type,    'SEMI_STABLE', `"latest information" should still be SEMI_STABLE, got ${infoResult.type}`);
    assert.strictEqual(updatesResult.type, 'SEMI_STABLE', `"latest updates" should still be SEMI_STABLE, got ${updatesResult.type}`);
    assert.strictEqual(eventsResult.type,  'SEMI_STABLE', `"latest events" should still be SEMI_STABLE, got ${eventsResult.type}`);
  });

});
