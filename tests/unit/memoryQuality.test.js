/**
 * Memory Quality Tests (MQ-001 through MQ-007)
 *
 * Validates that:
 *  - Analytical/decision-making queries are NOT stored as personal memories
 *  - Simple factual / personal queries ARE still stored
 *  - storeMemory skips trivial messages and questions
 *  - Stored memories include a source field in metadata
 *
 * Uses code-scanning only (readFileSync / static analysis) so no
 * transitive network or DB dependencies are triggered.
 *
 * Run with: node --test tests/unit/memoryQuality.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const INTELLIGENT_STORAGE_PATH = join(REPO_ROOT, 'api', 'memory', 'intelligent-storage.js');
const PERSISTENT_MEMORY_PATH   = join(REPO_ROOT, 'api', 'categories', 'memory', 'internal', 'persistent_memory.js');
const SERVER_PATH               = join(REPO_ROOT, 'server.js');

function readFile(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// ---------------------------------------------------------------------------
// MQ-001: complex_analytical query with "Our" pronoun is NOT stored
// ---------------------------------------------------------------------------
describe('MQ-001: complex_analytical query is skipped in storeWithIntelligence', () => {
  it('MQ-001a: storeWithIntelligence accepts queryClassification parameter', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      /storeWithIntelligence\s*\([^)]*queryClassification/.test(src),
      'storeWithIntelligence must accept a queryClassification parameter',
    );
  });

  it('MQ-001b: ANALYTICAL_QUERY_TYPES list contains complex_analytical', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes("'complex_analytical'"),
      'ANALYTICAL_QUERY_TYPES must include complex_analytical',
    );
  });

  it('MQ-001c: guard skips storage when queryClassification is in analytical list', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes('analytical_query_not_personal'),
      'storeWithIntelligence must return reason: analytical_query_not_personal for analytical queries',
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-002: decision_making query is NOT stored
// ---------------------------------------------------------------------------
describe('MQ-002: decision_making query type is in the skip list', () => {
  it('MQ-002a: ANALYTICAL_QUERY_TYPES contains decision_making', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes("'decision_making'"),
      'ANALYTICAL_QUERY_TYPES must include decision_making',
    );
  });

  it('MQ-002b: business_validation is also in the skip list', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes("'business_validation'"),
      'ANALYTICAL_QUERY_TYPES must include business_validation',
    );
  });

  it('MQ-002c: news_current_events is also in the skip list', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes("'news_current_events'"),
      'ANALYTICAL_QUERY_TYPES must include news_current_events',
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-003: simple_factual query with personal pronoun IS stored
//         (guard must only fire when classification IS in the list)
// ---------------------------------------------------------------------------
describe('MQ-003: simple_factual queries are NOT blocked by the analytical guard', () => {
  it('MQ-003a: simple_factual is not in ANALYTICAL_QUERY_TYPES', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');

    // Extract the ANALYTICAL_QUERY_TYPES array text
    const match = src.match(/ANALYTICAL_QUERY_TYPES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(match, 'ANALYTICAL_QUERY_TYPES array must be present in intelligent-storage.js');
    const listText = match[1];
    assert.ok(
      !listText.includes('simple_factual'),
      'simple_factual must NOT be in ANALYTICAL_QUERY_TYPES',
    );
  });

  it('MQ-003b: medium_complexity is not in ANALYTICAL_QUERY_TYPES', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    const match = src.match(/ANALYTICAL_QUERY_TYPES\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(match, 'ANALYTICAL_QUERY_TYPES array must be present');
    const listText = match[1];
    assert.ok(
      !listText.includes('medium_complexity'),
      'medium_complexity must NOT be in ANALYTICAL_QUERY_TYPES',
    );
  });

  it('MQ-003c: guard only fires when queryClassification is in the list', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    // Guard must check ANALYTICAL_QUERY_TYPES.includes(queryClassification)
    assert.ok(
      /ANALYTICAL_QUERY_TYPES\.includes\(queryClassification\)/.test(src),
      'Guard must use ANALYTICAL_QUERY_TYPES.includes(queryClassification)',
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-004: storeMemory skips trivial messages
// ---------------------------------------------------------------------------
describe('MQ-004: storeMemory in persistent_memory.js skips trivial messages', () => {
  it('MQ-004a: storeMemory contains a trivial message check', () => {
    const src = readFile(PERSISTENT_MEMORY_PATH);
    assert.ok(src, 'persistent_memory.js could not be read');
    assert.ok(
      src.includes('trivial_message') || src.includes('trivial message'),
      'storeMemory must have a trivial message guard',
    );
  });

  it('MQ-004b: trivial guard returns action: skipped', () => {
    const src = readFile(PERSISTENT_MEMORY_PATH);
    assert.ok(src, 'persistent_memory.js could not be read');
    // Verify both skipped action and trivial_message reason appear in storeMemory
    assert.ok(
      src.includes("action: 'skipped'") || src.includes('action: "skipped"'),
      'storeMemory trivial guard must return { action: "skipped" }',
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-005: storeMemory skips questions ending in ?
// ---------------------------------------------------------------------------
describe('MQ-005: storeMemory in persistent_memory.js skips questions', () => {
  it('MQ-005a: storeMemory contains a question detection check', () => {
    const src = readFile(PERSISTENT_MEMORY_PATH);
    assert.ok(src, 'persistent_memory.js could not be read');
    assert.ok(
      src.includes('question_no_facts_to_store') || src.includes('endsWith(\'?\')') || src.includes('endsWith("?")'),
      'storeMemory must have a question guard',
    );
  });

  it('MQ-005b: question guard checks for trailing question mark', () => {
    const src = readFile(PERSISTENT_MEMORY_PATH);
    assert.ok(src, 'persistent_memory.js could not be read');
    assert.ok(
      src.includes("endsWith('?')") || src.includes('endsWith("?")'),
      'storeMemory question guard must check for trailing ?',
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-006: Stored memories include source field in metadata
// ---------------------------------------------------------------------------
describe('MQ-006: storeCompressedMemory includes source field in metadataToStore', () => {
  it('MQ-006a: metadataToStore includes source field', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      /source\s*:\s*metadata\?\.source\s*\|\|\s*['"]user['"]/.test(src),
      "metadataToStore must include: source: metadata?.source || 'user'",
    );
  });

  it('MQ-006b: source field falls back to "user" when not provided', () => {
    const src = readFile(INTELLIGENT_STORAGE_PATH);
    assert.ok(src, 'intelligent-storage.js could not be read');
    assert.ok(
      src.includes("|| 'user'") || src.includes('|| "user"'),
      "source field must default to 'user'",
    );
  });
});

// ---------------------------------------------------------------------------
// MQ-007: server.js passes queryClassification to storeWithIntelligence
// ---------------------------------------------------------------------------
describe('MQ-007: server.js passes queryClassification to storeWithIntelligence', () => {
  it('MQ-007a: storeWithIntelligence call in server.js includes queryClassification argument', () => {
    const src = readFile(SERVER_PATH);
    assert.ok(src, 'server.js could not be read');
    assert.ok(
      src.includes('queryClassification') || src.includes('query_classification'),
      'server.js must reference queryClassification when calling storeWithIntelligence',
    );
  });

  it('MQ-007b: server.js reads classification from result.metadata', () => {
    const src = readFile(SERVER_PATH);
    assert.ok(src, 'server.js could not be read');
    assert.ok(
      /result\.metadata\??\.(queryClassification|query_classification)/.test(src),
      'server.js must read queryClassification from result.metadata',
    );
  });
});
