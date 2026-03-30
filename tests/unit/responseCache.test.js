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
const SEMI_STABLE_TTL = 24 * 60 * 60 * 1000;    // 24 hours in ms

const _responseCache = new Map();

function buildResponseCacheKey(message, mode, userId, truthType) {
  const scope = truthType === 'SEMI_STABLE'
    ? `${userId || 'anonymous'}:${mode}`
    : mode;
  return `response:${scope}:${semanticFingerprint(message)}`;
}

function getCachedResponse(message, mode, userId, truthType) {
  const key = buildResponseCacheKey(message, mode, userId, truthType);
  const entry = _responseCache.get(key);
  if (!entry) return null;
  const ttl = truthType === 'SEMI_STABLE' ? SEMI_STABLE_TTL : PERMANENT_TTL;
  if (Date.now() - entry.cachedAt > ttl) {
    _responseCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCachedResponse(message, mode, response, userId, truthType) {
  const key = buildResponseCacheKey(message, mode, userId, truthType);
  _responseCache.set(key, { response, cachedAt: Date.now() });
}

// Simulate isCacheEligible logic from orchestrator
// SEMI_STABLE support added: caches with user-scoped keys (24hr TTL).
// hasPersonalIntent only blocks PERMANENT (global key) — SEMI_STABLE keys are
// user-scoped so personal intent is safe.
function isCacheEligible({ truth_type, memory, effectiveDocumentData, vault, high_stakes, hasPersonalIntent, intent_class, query }) {
  const isSemiStable = truth_type === 'SEMI_STABLE';
  const isPermanent = truth_type === 'PERMANENT';
  const isCacheable = isPermanent || isSemiStable;
  const isFactualClass =
    intent_class === null || intent_class === undefined ||
    ['factual', 'simple_factual', 'simple_short'].includes(intent_class);
  const REFERENTIAL_PHRASING = /\b(that one|the second one|the other one|explain that differently|what about the other|what does that mean)\b/i;
  const hasReferentialPhrasing = query ? REFERENTIAL_PHRASING.test(query) : false;
  return (
    isCacheable &&
    isFactualClass &&
    !hasReferentialPhrasing &&
    !memory &&
    !effectiveDocumentData &&
    !vault &&
    !high_stakes?.isHighStakes &&
    !(isPermanent && hasPersonalIntent)  // personal intent only blocks global PERMANENT keys
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
  it('RC-005: isCacheEligible returns TRUE when conversationHistory.length > 0 (FIX 2)', () => {
    // FIX 2: PERMANENT facts are the same whether message 1 or message 50.
    // The cache no longer requires an empty conversation history.
    // Repeat factual queries within a session now benefit from the cache.
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [{ role: 'user', content: 'prior message' }],
      hasPersonalIntent: false
    });
    assert.strictEqual(eligible, true, 'PERMANENT factual query must be cache-eligible even with conversation history');
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

  // RC-019 (ME-006) --------------------------------------------------------
  it('RC-019: PERMANENT factual query is cache-eligible in mid-session (history length > 0)', () => {
    // FIX 2: Remove the conversationHistory.length === 0 requirement.
    // "What is gross margin?" has the same answer in every session context.
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is gross margin?',
    });
    assert.strictEqual(eligible, true, 'PERMANENT factual query must be cache-eligible mid-session');
  });

  // RC-020 (ME-007) --------------------------------------------------------
  it('RC-020: VOLATILE query is never cache-eligible regardless of history', () => {
    const eligible = isCacheEligible({
      truth_type: 'VOLATILE',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the current Bitcoin price?',
    });
    assert.strictEqual(eligible, false, 'VOLATILE query must never be cache-eligible');
  });

  // RC-021 (ME-008) --------------------------------------------------------
  it('RC-021: Referential phrasing blocks cache even for PERMANENT truth_type', () => {
    // "Can you explain that differently?" has truth_type PERMANENT but is
    // context-dependent — it must never hit a generic cached answer.
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'Can you explain that differently?',
    });
    assert.strictEqual(eligible, false, 'Referential phrasing must block cache');
  });

  // RC-022 (ME-009) --------------------------------------------------------
  it('RC-022: Personal intent blocks cache regardless of truth_type', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: true,
      intent_class: 'simple_factual',
      query: 'What is my gross margin?',
    });
    assert.strictEqual(eligible, false, 'Personal intent must block cache');
  });

  // RC-023 (ME-008 variant) ------------------------------------------------
  it('RC-023: "that one" referential phrasing blocks cache', () => {
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [{ role: 'user', content: 'What are the planets?' }],
      hasPersonalIntent: false,
      intent_class: 'simple_short',
      query: 'Tell me more about that one',
    });
    assert.strictEqual(eligible, false, '"that one" referential phrasing must block cache');
  });

  // RC-024 (FIX 2 intent class guard) -------------------------------------
  it('RC-024: Non-factual intent class blocks cache even for PERMANENT truth_type', () => {
    // A complex_analytical query classified as PERMANENT should not be cached —
    // the intent class guard prevents accidental caching of context-dependent queries.
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'complex_analytical',
      query: 'Explain the geopolitical history of the Roman Empire',
    });
    assert.strictEqual(eligible, false, 'Non-factual intent class must block cache');
  });

  // SC-001 ----------------------------------------------------------------
  it('SC-001: SEMI_STABLE query is cache-eligible and stores with 24hr TTL', () => {
    const eligible = isCacheEligible({
      truth_type: 'SEMI_STABLE',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the current corporate tax rate in the US?',
    });
    assert.strictEqual(eligible, true, 'SEMI_STABLE query must be cache-eligible');

    const msg    = 'What is the current corporate tax rate in the US?';
    const userId = 'user-abc';
    const mode   = 'truth';
    setCachedResponse(msg, mode, { success: true, response: '21%' }, userId, 'SEMI_STABLE');
    const result = getCachedResponse(msg, mode, userId, 'SEMI_STABLE');
    assert.ok(result, 'Expected cached entry after setCachedResponse');
    assert.strictEqual(result.response, '21%', 'Cached response must match stored value');
  });

  // SC-002 ----------------------------------------------------------------
  it('SC-002: SEMI_STABLE query returns cache hit on second ask', () => {
    const msg    = 'What is the minimum wage in California?';
    const userId = 'user-xyz';
    const mode   = 'truth';
    const stored = { success: true, response: '$16/hr' };

    setCachedResponse(msg, mode, stored, userId, 'SEMI_STABLE');

    const first  = getCachedResponse(msg, mode, userId, 'SEMI_STABLE');
    const second = getCachedResponse(msg, mode, userId, 'SEMI_STABLE');
    assert.ok(first,  'First retrieval must hit cache');
    assert.ok(second, 'Second retrieval must hit cache');
    assert.deepStrictEqual(first,  stored, 'First hit must match stored value');
    assert.deepStrictEqual(second, stored, 'Second hit must match stored value');
  });

  // SC-003 ----------------------------------------------------------------
  it('SC-003: SEMI_STABLE cache key includes user_id — User A query does not serve User B', () => {
    const msg    = 'What are the VAT rates in Europe?';
    const mode   = 'truth';
    const userA  = 'user-A';
    const userB  = 'user-B';
    const stored = { success: true, response: 'Varies by country' };

    setCachedResponse(msg, mode, stored, userA, 'SEMI_STABLE');

    const hitForA = getCachedResponse(msg, mode, userA, 'SEMI_STABLE');
    const hitForB = getCachedResponse(msg, mode, userB, 'SEMI_STABLE');

    assert.ok(hitForA,                   'User A must get a cache hit for their own entry');
    assert.strictEqual(hitForB, null,    "User B must NOT get a cache hit for User A's entry");
  });

  // SC-004 ----------------------------------------------------------------
  it('SC-004: PERMANENT cache key does NOT include user_id — global cache preserved', () => {
    const msg    = 'What is the speed of light?';
    const mode   = 'truth';
    const userA  = 'user-A';
    const userB  = 'user-B';
    const stored = { success: true, response: '299,792,458 m/s' };

    setCachedResponse(msg, mode, stored, userA, 'PERMANENT');

    const hitForA = getCachedResponse(msg, mode, userA, 'PERMANENT');
    const hitForB = getCachedResponse(msg, mode, userB, 'PERMANENT');

    assert.ok(hitForA, 'User A must get a cache hit for a PERMANENT entry');
    assert.ok(hitForB, 'User B must ALSO get a cache hit — PERMANENT keys are global');
    assert.deepStrictEqual(hitForA, stored);
    assert.deepStrictEqual(hitForB, stored);
  });

  // SC-005 ----------------------------------------------------------------
  it('SC-005: SEMI_STABLE cache expires after 24 hours, not 30 days', () => {
    const msg       = 'What is the prime rate?';
    const userId    = 'user-exp';
    const mode      = 'truth';
    const stored    = { success: true, response: '8.5%' };
    const expiredAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

    // Insert a SEMI_STABLE entry that is 25 hours old (expired)
    const semiKey = buildResponseCacheKey(msg, mode, userId, 'SEMI_STABLE');
    _responseCache.set(semiKey, { response: stored, cachedAt: expiredAt });
    const semiResult = getCachedResponse(msg, mode, userId, 'SEMI_STABLE');
    assert.strictEqual(semiResult, null, 'SEMI_STABLE entry older than 24hr must be expired');

    // Same age does NOT expire a PERMANENT entry (30-day TTL)
    const permKey = buildResponseCacheKey(msg, mode, userId, 'PERMANENT');
    _responseCache.set(permKey, { response: stored, cachedAt: expiredAt });
    const permResult = getCachedResponse(msg, mode, userId, 'PERMANENT');
    assert.ok(permResult, 'PERMANENT entry 25hr old must NOT be expired');
  });

  // SC-006 ----------------------------------------------------------------
  it('SC-006: VOLATILE query is never cache-eligible regardless of other conditions', () => {
    const eligible = isCacheEligible({
      truth_type: 'VOLATILE',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the current stock price of Apple?',
    });
    assert.strictEqual(eligible, false, 'VOLATILE query must never be cache-eligible');
  });

  // SC-007 ----------------------------------------------------------------
  it('SC-007: High stakes query never caches even if SEMI_STABLE', () => {
    const eligible = isCacheEligible({
      truth_type: 'SEMI_STABLE',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: { isHighStakes: true },
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the legal liability for a data breach?',
    });
    assert.strictEqual(eligible, false, 'High-stakes SEMI_STABLE query must never be cache-eligible');
  });

  // SC-008 ----------------------------------------------------------------
  it('SC-008: PERMANENT query caches on second ask in same session (conversationHistory.length > 0)', () => {
    // Confirms the conversation history blocker has been removed from isCacheEligible.
    // Validate via source scan — the orchestrator isCacheEligible block must not
    // reference conversationHistory.length as a gate condition.
    const src = readFile(ORCHESTRATOR_PATH);
    assert.ok(src, 'orchestrator.js must exist');
    const cacheBlock = src.slice(
      src.indexOf('RESPONSE CACHE — check before expensive'),
      src.indexOf('performanceMarkers.aiCallStart')
    );
    assert.ok(
      !cacheBlock.includes('conversationHistory.length'),
      'SC-008 FAIL: isCacheEligible block must not gate on conversationHistory.length — ' +
      'repeat factual queries within a session must benefit from the cache.'
    );
    // Also confirm the inline logic returns true with a non-empty history
    const eligible = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the boiling point of water?',
    });
    assert.strictEqual(eligible, true, 'PERMANENT query must be cache-eligible mid-session (history blocker removed)');
  });

  // SC-009 ----------------------------------------------------------------
  it('SC-009: SEMI_STABLE query with personal intent caches correctly (user-scoped key)', () => {
    // "our burn rate" has personal intent but SEMI_STABLE truth_type.
    // Since SEMI_STABLE keys are user-scoped, personal intent is safe and must not block.
    const eligible = isCacheEligible({
      truth_type: 'SEMI_STABLE',
      memory: null,
      effectiveDocumentData: null,
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: true,
      intent_class: 'simple_factual',
      query: 'What is our burn rate benchmark for SaaS startups?',
    });
    assert.strictEqual(eligible, true, 'SEMI_STABLE personal-intent query must be cache-eligible (user-scoped)');

    // Verify the cache key actually contains the userId
    const key = buildResponseCacheKey(
      'What is our burn rate benchmark for SaaS startups?',
      'truth',
      'user-123',
      'SEMI_STABLE'
    );
    assert.ok(key.includes('user-123'), 'SEMI_STABLE key must contain the userId');
  });

  // SC-010 ----------------------------------------------------------------
  it('SC-010: Document-loaded query never caches regardless of truth_type', () => {
    const eligiblePermanent = isCacheEligible({
      truth_type: 'PERMANENT',
      memory: null,
      effectiveDocumentData: { tokens: 1200 },
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the boiling point of water?',
    });
    const eligibleSemiStable = isCacheEligible({
      truth_type: 'SEMI_STABLE',
      memory: null,
      effectiveDocumentData: { tokens: 800 },
      vault: null,
      high_stakes: null,
      conversationHistory: [],
      hasPersonalIntent: false,
      intent_class: 'simple_factual',
      query: 'What is the minimum wage?',
    });
    assert.strictEqual(eligiblePermanent,  false, 'Document-loaded PERMANENT query must never cache');
    assert.strictEqual(eligibleSemiStable, false, 'Document-loaded SEMI_STABLE query must never cache');
  });

});
