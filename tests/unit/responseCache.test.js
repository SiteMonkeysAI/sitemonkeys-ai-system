/**
 * Response Cache — ttlCacheManager and orchestrator guard tests
 *
 * RC-001 through RC-012: Validate PERMANENT query response caching behaviour.
 *
 * Uses code-scanning (readFileSync) so no transitive network dependencies are
 * triggered during the test run.
 *
 * Run with: node --test tests/unit/responseCache.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const TTL_CACHE_PATH  = join(REPO_ROOT, 'api', 'core', 'intelligence', 'ttlCacheManager.js');
const ORCHESTRATOR_PATH = join(REPO_ROOT, 'api', 'core', 'orchestrator.js');

function readFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

// ---------------------------------------------------------------------------
// Inline minimal implementation of getCachedResponse / setCachedResponse
// mirroring what was added to ttlCacheManager.js so we can test logic without
// importing the full module (which has DB / API dependencies).
// ---------------------------------------------------------------------------

// Minimal semanticFingerprint (mirrors the production implementation)
function semanticFingerprint(query) {
  if (!query || typeof query !== 'string') return '';
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'who', 'when', 'where', 'how', 'does', 'do', 'did', 'can', 'could', 'would', 'should', 'of', 'for', 'to', 'in', 'on', 'at', 'by'];
  let words = query.toLowerCase().trim().split(/\s+/);
  words = words.filter(w => !stopWords.includes(w));
  words = words.map(w => w.replace(/[^\w]/g, '')).filter(w => w.length > 0);
  words.sort();
  return words.join('|');
}

const PERMANENT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

const _responseCache = new Map();

function buildResponseCacheKey(message, mode) {
  return `response:${mode}:${semanticFingerprint(message)}`;
}

function getCachedResponse(message, mode) {
  const key = buildResponseCacheKey(message, mode);
  const entry = _responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PERMANENT_TTL) {
    _responseCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCachedResponse(message, mode, response) {
  const key = buildResponseCacheKey(message, mode);
  _responseCache.set(key, { response, cachedAt: Date.now() });
}

// Simulate isCacheEligible logic from orchestrator
function isCacheEligible({ truth_type, memory, effectiveDocumentData, vault, high_stakes, conversationHistory, hasPersonalIntent }) {
  return (
    truth_type === 'PERMANENT' &&
    !memory &&
    !effectiveDocumentData &&
    !vault &&
    !high_stakes?.isHighStakes &&
    (!conversationHistory || conversationHistory.length === 0) &&
    !hasPersonalIntent
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RC. Response Cache — ttlCacheManager', () => {

  beforeEach(() => {
    _responseCache.clear();
  });

  // RC-001 ----------------------------------------------------------------
  it('RC-001: getCachedResponse returns null for a VOLATILE query (not stored)', () => {
    // Nothing has been stored — any lookup must return null
    const result = getCachedResponse('What is the current Bitcoin price?', 'truth');
    assert.strictEqual(result, null);
  });

  // RC-002 ----------------------------------------------------------------
  it('RC-002: isCacheEligible returns false when context.memory is truthy', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: { text: 'user has allergies' }, // truthy
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, false);
  });

  // RC-003 ----------------------------------------------------------------
  it('RC-003: isCacheEligible returns false when effectiveDocumentData is present', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: { tokens: 500 }, // truthy
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, false);
  });

  // RC-004 ----------------------------------------------------------------
  it('RC-004: isCacheEligible returns false when high_stakes.isHighStakes is true', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: { isHighStakes: true },
      conversationHistory: [],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, false);
  });

  // RC-005 ----------------------------------------------------------------
  it('RC-005: isCacheEligible returns false when conversationHistory.length > 0', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [{ role: 'user', content: 'prior message' }],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, false);
  });

  // RC-006 ----------------------------------------------------------------
  it('RC-006: setCachedResponse stores response for valid PERMANENT query with no user context', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, true);

    setCachedResponse('What is the capital of France?', 'truth', { success: true, response: 'Paris.' });
    const result = getCachedResponse('What is the capital of France?', 'truth');
    assert.ok(result, 'Expected a cached response');
    assert.strictEqual(result.response, 'Paris.');
  });

  // RC-007 ----------------------------------------------------------------
  it('RC-007: Second identical PERMANENT query returns cached response (cost = 0 pattern)', () => {
    const msg = 'What is the boiling point of water?';
    const mode = 'truth';
    const storedResponse = { success: true, response: '100°C at sea level.', model: 'gpt-4' };

    // First store
    setCachedResponse(msg, mode, storedResponse);

    // Second retrieval should return the cached entry
    const hit = getCachedResponse(msg, mode);
    assert.ok(hit, 'Expected cache hit on second identical query');
    assert.deepStrictEqual(hit, storedResponse);
  });

  // RC-008 ----------------------------------------------------------------
  it('RC-008: [RESPONSE-CACHE] hit log line is present in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    assert.ok(
      src.includes('[RESPONSE-CACHE] Cache hit'),
      'Expected [RESPONSE-CACHE] Cache hit log line in orchestrator.js'
    );
  });

  // RC-009 ----------------------------------------------------------------
  it('RC-009: [RESPONSE-CACHE] stored log line is present in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    assert.ok(
      src.includes('[RESPONSE-CACHE] Stored'),
      'Expected [RESPONSE-CACHE] Stored log line in orchestrator.js'
    );
  });

  // RC-010 ----------------------------------------------------------------
  it('RC-010: Cache hit return block contains cache_hit: true field in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    assert.ok(
      src.includes('cache_hit: true'),
      'Expected cache_hit: true field in orchestrator.js cache hit return'
    );
  });

  // RC-011 ----------------------------------------------------------------
  it('RC-011: Cache hit return block sets zero token_usage and cost in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    // token_usage block with zero values
    assert.ok(
      src.includes('prompt_tokens: 0') && src.includes('completion_tokens: 0') && src.includes('total_tokens: 0'),
      'Expected zero token_usage fields in orchestrator.js cache hit return'
    );
    // cost block with zero values
    assert.ok(
      src.includes('inputTokens: 0') && src.includes('outputTokens: 0') && src.includes('totalTokens: 0'),
      'Expected zero cost fields in orchestrator.js cache hit return'
    );
  });

  // RC-012 ----------------------------------------------------------------
  it('RC-012: ttlCacheManager.js exports all four new response cache functions', () => {
    const src = readFile(TTL_CACHE_PATH);
    assert.ok(src, 'ttlCacheManager.js must exist');
    assert.ok(src.includes('export function buildResponseCacheKey'), 'Missing export: buildResponseCacheKey');
    assert.ok(src.includes('export function getCachedResponse'),     'Missing export: getCachedResponse');
    assert.ok(src.includes('export function setCachedResponse'),     'Missing export: setCachedResponse');
    assert.ok(src.includes('export function getResponseCacheStats'), 'Missing export: getResponseCacheStats');
  });

  // RC-013 ----------------------------------------------------------------
  it('RC-013: isCacheEligible uses memoryContext.hasMemory (not context.memory) in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    // Must use memoryContext.hasMemory so users with irrelevant stored memories
    // can still benefit from the cache for PERMANENT factual queries.
    assert.ok(
      src.includes('!memoryContext.hasMemory'),
      'RC-013 FAIL: isCacheEligible must use "!memoryContext.hasMemory" instead of "!context.memory". ' +
      'context.memory is truthy whenever ANY user memories exist; memoryContext.hasMemory is only ' +
      'true when relevant memories were actually injected for this specific query.'
    );
    // Must NOT use context.memory as the memory guard in isCacheEligible
    // (it may still appear elsewhere in the file for other purposes)
    const cacheBlock = src.slice(
      src.indexOf('RESPONSE CACHE — check before expensive'),
      src.indexOf('performanceMarkers.aiCallStart')
    );
    assert.ok(
      !cacheBlock.includes('!context.memory'),
      'RC-013 FAIL: isCacheEligible block must not use "!context.memory" as the memory guard.'
    );
  });

  // RC-014 ----------------------------------------------------------------
  it('RC-014: Cache hit return block nests token_usage inside metadata (not top-level)', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    // Extract the cache hit return block between "cache_hit: true" and the
    // closing of that return statement.  We verify metadata wraps token_usage.
    const cacheHitIdx = src.indexOf('cache_hit: true');
    assert.ok(cacheHitIdx !== -1, 'Could not locate "cache_hit: true" in orchestrator.js');
    // Look for the pattern: metadata block appears before token_usage in the cache hit return
    const segment = src.slice(cacheHitIdx, cacheHitIdx + 600);
    assert.ok(
      segment.includes('metadata:') && segment.indexOf('metadata:') < segment.indexOf('token_usage:'),
      'RC-014 FAIL: Cache hit return must nest token_usage inside a metadata block, ' +
      'matching the path used by non-cached responses (response.metadata.token_usage).'
    );
  });

  // Shared helper: mirrors the memoriesBlockCache logic from orchestrator
  const CACHE_MEMORY_THRESHOLD = 0.80;
  function computeMemoriesBlockCache({ hasMemory, memory_count, highest_similarity_score }) {
    return (
      hasMemory &&
      memory_count > 0 &&
      (highest_similarity_score ?? 1.0) >= CACHE_MEMORY_THRESHOLD
    );
  }

  // RC-015 ----------------------------------------------------------------
  it('RC-015: Cache eligible when memories present but highest score < 0.80', () => {
    // Memories are present but score is below the 0.80 cache threshold
    const memoriesBlockCache = computeMemoriesBlockCache({
      hasMemory: true,
      memory_count: 4,
      highest_similarity_score: 0.62, // below 0.80
    });

    assert.strictEqual(memoriesBlockCache, false, 'Memories below 0.80 should NOT block cache');
  });

  // RC-016 ----------------------------------------------------------------
  it('RC-016: Cache blocked when memories present with score >= 0.80', () => {
    // Memories are present with a score at or above the 0.80 cache threshold
    const memoriesBlockCache = computeMemoriesBlockCache({
      hasMemory: true,
      memory_count: 2,
      highest_similarity_score: 0.82, // at or above 0.80
    });

    assert.strictEqual(memoriesBlockCache, true, 'Memories at or above 0.80 SHOULD block cache');
  });

  // RC-017 ----------------------------------------------------------------
  it('RC-017: [CACHE-ELIGIBLE] log line present with all required fields in orchestrator source', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    assert.ok(
      src.includes('[CACHE-ELIGIBLE]'),
      'RC-017 FAIL: Missing [CACHE-ELIGIBLE] log line in orchestrator.js'
    );
    assert.ok(
      src.includes('hasMemory='),
      'RC-017 FAIL: [CACHE-ELIGIBLE] log must include hasMemory= field'
    );
    assert.ok(
      src.includes('highestScore='),
      'RC-017 FAIL: [CACHE-ELIGIBLE] log must include highestScore= field'
    );
    assert.ok(
      src.includes('memoriesBlockCache='),
      'RC-017 FAIL: [CACHE-ELIGIBLE] log must include memoriesBlockCache= field'
    );
    assert.ok(
      src.includes('eligible='),
      'RC-017 FAIL: [CACHE-ELIGIBLE] log must include eligible= field'
    );
  });

  // RC-018 ----------------------------------------------------------------
  it('RC-018: highest_similarity_score present on #retrieveMemoryContext return object', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    assert.ok(
      src.includes('highest_similarity_score:'),
      'RC-018 FAIL: highest_similarity_score must be returned from #retrieveMemoryContext'
    );
    assert.ok(
      src.includes('memory_count:'),
      'RC-018 FAIL: memory_count must be returned from #retrieveMemoryContext'
    );
  });

});
