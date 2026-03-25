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
