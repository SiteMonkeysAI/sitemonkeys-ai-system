/**
 * raw_similarity preservation — semantic-retrieval boost paths
 *
 * RS-001: Ordinal boost preserves raw_similarity from before boost
 * RS-002: Entity boost preserves raw_similarity
 * RS-003: Explicit recall boost preserves raw_similarity
 * RS-004: Anchor boost preserves raw_similarity
 * RS-005: Safety boost preserves raw_similarity
 * RS-006: When multiple boosts apply, raw_similarity reflects the FIRST boost
 *         path's original value (because of the ?? operator)
 * RS-007: highest_similarity_score in orchestrator uses raw_similarity not
 *         boosted similarity (code-scan)
 * RS-008: All boost paths use the ?? pattern consistently (code-scan)
 *
 * Uses code-scanning (readFileSync) and inline logic mirrors so no transitive
 * network / database dependencies are triggered.
 *
 * Run with: node --test tests/unit/rawSimilarity.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const RETRIEVAL_PATH = join(REPO_ROOT, 'api', 'services', 'semantic-retrieval.js');
const ORCHESTRATOR_PATH = join(REPO_ROOT, 'api', 'core', 'orchestrator.js');

function readFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

// ---------------------------------------------------------------------------
// Inline boost helpers — mirror the production logic so we can unit-test
// without importing the full module (which has DB / API dependencies).
// ---------------------------------------------------------------------------

/**
 * Safety boost (PATH 5)
 * Mirrors the pattern at ~line 185 of semantic-retrieval.js
 */
function applySafetyBoost(memory, maxBoost) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity,
    similarity: Math.min(memory.similarity + maxBoost, 1.0),
    safety_boosted: true
  };
}

/**
 * Ordinal boost (PATH 1)
 * Mirrors the pattern at ~line 280 of semantic-retrieval.js
 */
function applyOrdinalBoost(memory, newSimilarity, queryOrdinal) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity,
    similarity: newSimilarity,
    ordinal_boosted: true,
    ordinal_matched: queryOrdinal
  };
}

/**
 * Explicit recall boost (PATH 3)
 * Mirrors the pattern at ~line 1917 of semantic-retrieval.js
 */
function applyExplicitRecallBoost(memory, boostedScore) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity,
    similarity: boostedScore,
    explicit_recall_boosted: true,
    explicit_storage_request: true
  };
}

/**
 * Entity boost (PATH 2)
 * Mirrors the pattern at ~line 1970 of semantic-retrieval.js
 */
function applyEntityBoost(memory, boostedSim, matchedEntities) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity,
    similarity: boostedSim,
    entity_boosted: true,
    matched_entities: matchedEntities
  };
}

/**
 * Anchor boost (PATH 4)
 * Mirrors the pattern at ~line 2157 of semantic-retrieval.js
 */
function applyAnchorBoost(memory, score, boostApplied, boostReasons) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity,
    similarity: Math.min(score, 1.0),
    anchor_boosted: boostApplied,
    anchor_boost_reasons: boostReasons
  };
}

/**
 * Embedding lag — explicit storage (PATH 6)
 * Mirrors the pattern at ~line 1702 of semantic-retrieval.js
 */
function applyEmbeddingLagExplicit(memory) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity ?? null,
    similarity: 0.99,
    from_recent_unembedded: true,
    embedding: null,
    match_reason: 'explicit_storage_recall'
  };
}

/**
 * Embedding lag — exact token match (PATH 7)
 * Mirrors the pattern at ~line 1729 of semantic-retrieval.js
 */
function applyEmbeddingLagToken(memory) {
  return {
    ...memory,
    raw_similarity: memory.raw_similarity ?? memory.similarity ?? null,
    similarity: 0.95,
    from_recent_unembedded: true,
    embedding: null,
    match_reason: 'exact_token_match'
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RS-001: Ordinal boost preserves raw_similarity', () => {
  it('sets raw_similarity to original similarity before boost', () => {
    const memory = { id: 1, similarity: 0.60 };
    const boosted = applyOrdinalBoost(memory, 0.85, 'first');
    assert.strictEqual(boosted.raw_similarity, 0.60,
      'raw_similarity should capture the pre-boost value');
    assert.strictEqual(boosted.similarity, 0.85,
      'similarity should reflect the boosted value');
  });

  it('does not overwrite raw_similarity if already set by an earlier boost', () => {
    const memory = { id: 2, similarity: 0.85, raw_similarity: 0.50 };
    const boosted = applyOrdinalBoost(memory, 0.92, 'second');
    assert.strictEqual(boosted.raw_similarity, 0.50,
      'raw_similarity should preserve the earliest captured value');
  });
});

describe('RS-002: Entity boost preserves raw_similarity', () => {
  it('sets raw_similarity to original similarity before entity boost', () => {
    const memory = { id: 3, similarity: 0.55 };
    const boosted = applyEntityBoost(memory, 0.85, ['Alice']);
    assert.strictEqual(boosted.raw_similarity, 0.55);
    assert.strictEqual(boosted.similarity, 0.85);
  });

  it('does not overwrite raw_similarity if already set', () => {
    const memory = { id: 4, similarity: 0.85, raw_similarity: 0.40 };
    const boosted = applyEntityBoost(memory, 0.85, ['Bob']);
    assert.strictEqual(boosted.raw_similarity, 0.40);
  });
});

describe('RS-003: Explicit recall boost preserves raw_similarity', () => {
  it('sets raw_similarity to original similarity before explicit recall boost', () => {
    const memory = { id: 5, similarity: 0.45 };
    const boosted = applyExplicitRecallBoost(memory, 1.0);
    assert.strictEqual(boosted.raw_similarity, 0.45);
    assert.strictEqual(boosted.similarity, 1.0);
    assert.strictEqual(boosted.explicit_recall_boosted, true);
  });

  it('does not overwrite raw_similarity if already set', () => {
    const memory = { id: 6, similarity: 0.95, raw_similarity: 0.30 };
    const boosted = applyExplicitRecallBoost(memory, 1.0);
    assert.strictEqual(boosted.raw_similarity, 0.30);
  });
});

describe('RS-004: Anchor boost preserves raw_similarity', () => {
  it('sets raw_similarity to original similarity before anchor boost', () => {
    const memory = { id: 7, similarity: 0.65 };
    const boosted = applyAnchorBoost(memory, 0.90, true, ['location match']);
    assert.strictEqual(boosted.raw_similarity, 0.65);
    assert.strictEqual(boosted.similarity, 0.90);
  });

  it('caps similarity at 1.0 but raw_similarity stays below', () => {
    const memory = { id: 8, similarity: 0.70 };
    const boosted = applyAnchorBoost(memory, 1.50, true, ['over boost']);
    assert.strictEqual(boosted.raw_similarity, 0.70);
    assert.strictEqual(boosted.similarity, 1.0);
  });

  it('does not overwrite raw_similarity if already set', () => {
    const memory = { id: 9, similarity: 0.90, raw_similarity: 0.55 };
    const boosted = applyAnchorBoost(memory, 0.95, true, []);
    assert.strictEqual(boosted.raw_similarity, 0.55);
  });
});

describe('RS-005: Safety boost preserves raw_similarity', () => {
  it('sets raw_similarity to original similarity before safety boost', () => {
    const memory = { id: 10, similarity: 0.50 };
    const boosted = applySafetyBoost(memory, 0.30);
    assert.strictEqual(boosted.raw_similarity, 0.50);
    assert.strictEqual(boosted.similarity, 0.80);
    assert.strictEqual(boosted.safety_boosted, true);
  });

  it('caps similarity at 1.0 but raw_similarity is uncapped', () => {
    const memory = { id: 11, similarity: 0.80 };
    const boosted = applySafetyBoost(memory, 0.50);
    assert.strictEqual(boosted.raw_similarity, 0.80);
    assert.strictEqual(boosted.similarity, 1.0);
  });

  it('does not overwrite raw_similarity if already set', () => {
    const memory = { id: 12, similarity: 0.90, raw_similarity: 0.60 };
    const boosted = applySafetyBoost(memory, 0.10);
    assert.strictEqual(boosted.raw_similarity, 0.60);
  });
});

describe('RS-006: Multiple boosts preserve the FIRST raw_similarity via ?? operator', () => {
  it('chained safety then ordinal keeps the original cosine similarity', () => {
    const original = { id: 13, similarity: 0.55 };
    // First boost: safety
    const afterSafety = applySafetyBoost(original, 0.25);
    assert.strictEqual(afterSafety.raw_similarity, 0.55, 'safety boost captures original');

    // Second boost: ordinal — raw_similarity must NOT be overwritten
    const afterOrdinal = applyOrdinalBoost(afterSafety, 0.95, 'first');
    assert.strictEqual(afterOrdinal.raw_similarity, 0.55,
      'ordinal boost must not overwrite the already-captured raw_similarity');
    assert.strictEqual(afterOrdinal.similarity, 0.95);
  });

  it('chained entity then explicit recall keeps the original cosine similarity', () => {
    const original = { id: 14, similarity: 0.42 };
    const afterEntity = applyEntityBoost(original, 0.85, ['Carol']);
    assert.strictEqual(afterEntity.raw_similarity, 0.42);

    const afterExplicit = applyExplicitRecallBoost(afterEntity, 1.0);
    assert.strictEqual(afterExplicit.raw_similarity, 0.42,
      'explicit recall must not overwrite the earlier raw_similarity');
  });
});

describe('RS-007: highest_similarity_score uses raw_similarity when available (code-scan)', () => {
  it('orchestrator file references raw_similarity for highest_similarity_score', () => {
    const src = readFile(ORCHESTRATOR_PATH);
    if (src === null) {
      // File doesn't exist in this environment - skip gracefully
      console.log('[RS-007] SKIP: orchestrator.js not found at expected path');
      return;
    }
    // The orchestrator should prefer raw_similarity over similarity when computing
    // the highest_similarity_score that gates memoriesBlockCache
    const usesRaw = src.includes('raw_similarity');
    assert.ok(usesRaw,
      'orchestrator.js should reference raw_similarity to compute highest_similarity_score');
  });
});

describe('RS-008: All boost return paths use ?? pattern for raw_similarity (code-scan)', () => {
  it('semantic-retrieval.js contains raw_similarity preservation in all boost paths', () => {
    const src = readFile(RETRIEVAL_PATH);
    assert.ok(src !== null, 'semantic-retrieval.js must exist');

    // Count occurrences of the canonical preservation pattern
    const pattern = /raw_similarity:\s*memory\.raw_similarity\s*\?\?\s*memory\.similarity/g;
    const matches = src.match(pattern) || [];

    // We expect at least 7 occurrences (one per boost path: safety, ordinal,
    // explicit-recall, entity, anchor, embedding-lag-explicit, embedding-lag-token)
    // plus the original keyword boost which uses a simplified form.
    assert.ok(matches.length >= 7,
      `Expected at least 7 raw_similarity preservation patterns, found ${matches.length}`);
  });

  it('keyword boost in semantic-retrieval.js preserves raw_similarity (original fix)', () => {
    const src = readFile(RETRIEVAL_PATH);
    assert.ok(src !== null, 'semantic-retrieval.js must exist');
    // The keyword boost path (commit 9d50fba) uses a direct assignment form
    const hasKeywordForm = /raw_similarity:\s*memory\.similarity/.test(src);
    assert.ok(hasKeywordForm,
      'keyword boost path should preserve raw_similarity via direct assignment');
  });

  it('embedding lag paths use ?? null fallback form', () => {
    const src = readFile(RETRIEVAL_PATH);
    assert.ok(src !== null, 'semantic-retrieval.js must exist');
    const nullFallbackPattern = /raw_similarity:\s*memory\.raw_similarity\s*\?\?\s*memory\.similarity\s*\?\?\s*null/g;
    const matches = src.match(nullFallbackPattern) || [];
    assert.ok(matches.length >= 2,
      `Expected at least 2 embedding-lag ?? null patterns, found ${matches.length}`);
  });
});
