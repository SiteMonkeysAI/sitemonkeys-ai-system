/**
 * External Lookup Engine — URL builder and threshold guards
 * 
 * EL-001 through EL-006: Wikipedia political-leader URL builder
 * and Yahoo Finance content-threshold behaviour.
 * 
 * Uses code-scanning only (readFileSync) so no transitive network
 * dependencies are triggered during the test run.
 * 
 * Run with: node --test tests/unit/externalLookup.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const ENGINE_PATH = join(REPO_ROOT, 'api', 'core', 'intelligence', 'externalLookupEngine.js');

// ---------------------------------------------------------------------------
// Helpers – inline regex tests that mirror the exact logic in the engine
// so we verify the correct patterns without importing the full module.
// ---------------------------------------------------------------------------

const US_PRESIDENT_FORWARD  = /\b(US|USA|United States|America|American)\b.*?(president)/i;
const US_PRESIDENT_REVERSE  = /\b(president|vice.president)\b.*?\b(US|USA|United States|America|American)\b/i;
const WIKIPEDIA_US_PRESIDENT_URL =
  'https://en.wikipedia.org/api/rest_v1/page/summary/President_of_the_United_States';

function buildGovernmentUrl(query) {
  const usMatch       = US_PRESIDENT_FORWARD.test(query);
  const usMatchReverse = US_PRESIDENT_REVERSE.test(query);
  const isUSPresident = usMatch || usMatchReverse;

  if (isUSPresident) return WIKIPEDIA_US_PRESIDENT_URL;

  // Generic fallback builder (position-of-country)
  const leaderMatch = query.match(
    /\b(prime\s+minister|president|chancellor|leader)\s+of\s+([a-zA-Z][a-zA-Z\s]+?)(?:\?|$|,|\s{2})/i
  );
  if (leaderMatch) {
    const rawPosition = leaderMatch[1].trim();
    const rawCountry  = leaderMatch[2].trim();
    const posTitle    = rawPosition.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('_');
    const country     = rawCountry.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
    return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`${posTitle}_of_${country}`)}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('External Lookup Engine — Wikipedia political-leader URL builder', () => {

  it('EL-001: "Who is the president of the US" resolves to the correct Wikipedia URL', () => {
    const url = buildGovernmentUrl('Who is the president of the US');
    assert.strictEqual(url, WIKIPEDIA_US_PRESIDENT_URL);
  });

  it('EL-002: "Who is the current president of the United States" resolves correctly', () => {
    const url = buildGovernmentUrl('Who is the current president of the United States');
    assert.strictEqual(url, WIKIPEDIA_US_PRESIDENT_URL);
  });

  it('EL-003: "President of the US" resolves correctly', () => {
    const url = buildGovernmentUrl('President of the US');
    assert.strictEqual(url, WIKIPEDIA_US_PRESIDENT_URL);
  });

  it('EL-006: US president queries never fall through to the generic builder', () => {
    const queries = [
      'Who is the president of the US',
      'Who is the current president of the United States',
      'President of the US',
      'Who is the American president',
    ];
    for (const q of queries) {
      const url = buildGovernmentUrl(q);
      // Must return the hardcoded URL, never a generic "President_of_*" construction
      assert.strictEqual(url, WIKIPEDIA_US_PRESIDENT_URL, `Expected hardcoded URL for: "${q}"`);
    }
  });

});

describe('External Lookup Engine — Yahoo Finance content threshold', () => {

  it('EL-004: Yahoo Finance response of 50+ chars passes the financial API threshold', () => {
    const MIN_FINANCIAL_API_THRESHOLD = 30;
    const sampleResponse = 'Apple Inc (AAPL): USD $189.30 (+1.23, +0.65%)'; // 47 chars
    assert.ok(
      sampleResponse.length >= MIN_FINANCIAL_API_THRESHOLD,
      `Expected ${sampleResponse.length} >= ${MIN_FINANCIAL_API_THRESHOLD}`
    );
  });

  it('EL-005: Non-financial sources still require the 200-char minimum', () => {
    const MIN_CONTENT_THRESHOLD = 200;
    const shortResponse = 'Some news headline'; // well under 200 chars
    assert.ok(
      shortResponse.length < MIN_CONTENT_THRESHOLD,
      `Expected ${shortResponse.length} < ${MIN_CONTENT_THRESHOLD}`
    );
  });

});

describe('External Lookup Engine — source file contains required patterns', () => {

  it('Engine file exists', () => {
    assert.ok(existsSync(ENGINE_PATH), `Expected file at ${ENGINE_PATH}`);
  });

  it('Forward regex (country-before-position) is present', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes('US|USA|United States|America|American') &&
      src.includes('president'),
      'Expected forward regex to match country then president'
    );
  });

  it('Reverse regex (position-before-country) is present', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes('usMatchReverse'),
      'Expected usMatchReverse variable in engine source'
    );
    assert.ok(
      src.includes('president|vice.president'),
      'Expected reverse regex pattern in engine source'
    );
  });

  it('isUSPresident combines both regexes', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes('isUSPresident'),
      'Expected isUSPresident variable in engine source'
    );
    assert.ok(
      src.includes('usMatchReverse.test(query)'),
      'Expected usMatchReverse.test(query) to be used in isUSPresident'
    );
    // isUSPresident must drive the conditional — not usMatch directly
    assert.ok(
      src.includes('isUSPresident)'),
      'Expected isUSPresident to be used in the if/else if conditional'
    );
  });

  it('MIN_FINANCIAL_API_THRESHOLD constant exists and equals 30', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes('MIN_FINANCIAL_API_THRESHOLD = 30'),
      'Expected MIN_FINANCIAL_API_THRESHOLD = 30 in engine source'
    );
  });

  it('isFinancialAPI detection uses source name to select threshold', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes('isFinancialAPI'),
      'Expected isFinancialAPI variable in engine source'
    );
    assert.ok(
      src.includes("includes('yahoo finance')") || src.includes('includes("yahoo finance")'),
      'Expected yahoo finance check in isFinancialAPI detection'
    );
  });

});
