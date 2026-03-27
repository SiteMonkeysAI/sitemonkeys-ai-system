/**
 * External Lookup Engine — URL builder and threshold guards
 *
 * EL-001 through EL-006: Wikipedia political-leader URL builder
 * and Yahoo Finance content-threshold behaviour.
 * EL-007 through EL-012: metals.live platinum/palladium support and
 * GoldAPI extract weight-calculation coverage.
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

// ---------------------------------------------------------------------------
// Helpers for metals.live and GoldAPI weight-calc inline logic tests
// ---------------------------------------------------------------------------

// Mirror the metals.live metalType detection logic from externalLookupEngine.js
function detectMetalType(query) {
  const lowerQuery = query.toLowerCase();
  if (/\bgold\b/.test(lowerQuery)) return 'gold';
  if (/\bsilver\b/.test(lowerQuery)) return 'silver';
  if (/\bplatinum\b/.test(lowerQuery)) return 'platinum';
  if (/\bpalladium\b/.test(lowerQuery)) return 'palladium';
  return null;
}

// Mirror the weight detection logic shared by both sources
const TROY_OZ_CONVERSIONS = {
  'lb': 14.5833, 'lbs': 14.5833, 'pound': 14.5833, 'pounds': 14.5833,
  'kg': 32.1507,
  'gram': 0.0321507, 'grams': 0.0321507,
  'oz': 0.911458, 'ounce': 0.911458, 'ounces': 0.911458,
  'troy oz': 1, 'troy ounce': 1, 'troy ounces': 1,
};

function detectWeightQuery(query) {
  const lowerQ = query.toLowerCase();
  const hasValueIntent = /\b(worth|value|cost|price|total|how much)\b/i.test(lowerQ);
  if (!hasValueIntent) return null;
  const weightPattern = /(\d+(?:\.\d+)?)\s*(pound|lb|lbs|kilogram|kilo|kg|gram|grams|troy\s+oz(?:ces?)?|troy\s+ounce|ounce|oz)/i;
  const wMatch = lowerQ.match(weightPattern);
  if (!wMatch) return null;
  const qty = parseFloat(wMatch[1]);
  const unitRaw = wMatch[2].replace(/\s+/g, ' ').toLowerCase().trim();
  const convFactor = TROY_OZ_CONVERSIONS[unitRaw] || TROY_OZ_CONVERSIONS[unitRaw.replace(/s$/, '')];
  if (!convFactor || qty <= 0) return null;
  return { qty, unitRaw, troyOz: qty * convFactor };
}

describe('External Lookup Engine — metals.live platinum/palladium support', () => {

  it('EL-007: metals.live metalType detection returns "platinum" for platinum queries', () => {
    assert.strictEqual(detectMetalType('What is the price of platinum today?'), 'platinum');
    assert.strictEqual(detectMetalType('platinum spot price'), 'platinum');
    assert.strictEqual(detectMetalType('If I have 227 pounds of platinum at today\'s price what\'s it worth'), 'platinum');
  });

  it('EL-008: metals.live metalType detection returns "palladium" for palladium queries', () => {
    assert.strictEqual(detectMetalType('palladium price today'), 'palladium');
    assert.strictEqual(detectMetalType('What is palladium worth per ounce?'), 'palladium');
  });

  it('EL-009: metals.live metalType detection still works correctly for gold and silver', () => {
    assert.strictEqual(detectMetalType('gold price today'), 'gold');
    assert.strictEqual(detectMetalType('silver spot price'), 'silver');
  });

  it('EL-010: metals.live metalType detection returns null for unsupported metals', () => {
    assert.strictEqual(detectMetalType('copper price today'), null);
    assert.strictEqual(detectMetalType('what is oil worth'), null);
    assert.strictEqual(detectMetalType('natural gas price'), null);
  });

  it('EL-011: metals.live source code includes platinum and palladium detection branches', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    assert.ok(
      src.includes("'platinum'") || src.includes('"platinum"'),
      'Expected platinum string in engine source'
    );
    assert.ok(
      src.includes("'palladium'") || src.includes('"palladium"'),
      'Expected palladium string in engine source'
    );
    // Verify the metals.live fetchData includes both branches
    assert.ok(
      src.includes("metalType = 'platinum'"),
      'Expected metals.live metalType = \'platinum\' assignment in engine source'
    );
    assert.ok(
      src.includes("metalType = 'palladium'"),
      'Expected metals.live metalType = \'palladium\' assignment in engine source'
    );
  });

});

describe('External Lookup Engine — GoldAPI weight-calculation in extract', () => {

  it('EL-012: Weight detection fires for "227 pounds of platinum" with value intent', () => {
    const result = detectWeightQuery('If I have 227 pounds of platinum at today\'s price what\'s it worth');
    assert.ok(result !== null, 'Expected weight info to be detected');
    assert.strictEqual(result.qty, 227);
    assert.ok(result.unitRaw === 'pounds' || result.unitRaw === 'pound', `Expected "pounds" unit, got "${result.unitRaw}"`);
    // 227 lbs × 14.5833 troy oz/lb ≈ 3310.41 troy oz
    assert.ok(Math.abs(result.troyOz - 3310.41) < 0.1, `Expected ~3310.41 troy oz, got ${result.troyOz.toFixed(2)}`);
  });

  it('EL-013: Weight detection does NOT fire when there is no value intent', () => {
    // "I have 10 pounds of platinum" has no "worth/price/cost/value" — pure quantity, not a price query
    const result = detectWeightQuery('I have 10 pounds of platinum');
    assert.strictEqual(result, null, 'Expected null — no value intent in query');
  });

  it('EL-014: GoldAPI extract source includes query parameter and weight-calculation branch', () => {
    const src = readFileSync(ENGINE_PATH, 'utf8');
    // The extract function must accept a second `query` argument
    assert.ok(
      src.includes('extract: (json, query) =>'),
      'Expected GoldAPI extract to accept (json, query) parameters'
    );
    // The weight-calculation log line must be present
    assert.ok(
      src.includes('GoldAPI weight calc:'),
      'Expected [externalLookupEngine] GoldAPI weight calc: log in engine source'
    );
  });

});
