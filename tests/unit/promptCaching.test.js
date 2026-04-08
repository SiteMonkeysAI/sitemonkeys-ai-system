/**
 * Prompt Caching Tests — PC-001 through PC-004
 *
 * Validates:
 *   PC-001/PC-002: Static sections appear before the variable query-classification
 *                  block in both #buildSystemPrompt and #buildCompressedSystemPrompt,
 *                  enabling OpenAI automatic prompt caching on the longest stable prefix.
 *   PC-003: AnthropicAdapter wraps systemPrompt in an array with cache_control when
 *           systemPrompt is provided (explicit Anthropic prompt caching).
 *   PC-004: AnthropicAdapter omits the system key entirely when systemPrompt is empty.
 *
 * Run with: node --test tests/unit/promptCaching.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AnthropicAdapter } from '../../api/core/adapters/AnthropicAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');

const orchestratorSrc = readFileSync(
  join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers — locate sections within the method bodies to verify ordering
// ---------------------------------------------------------------------------

/**
 * Return the index of the first occurrence of `needle` inside the first
 * occurrence of `methodMarker` in the orchestrator source.  Returns -1 if
 * not found.
 */
function positionInMethod(methodMarker, needle) {
  const methodStart = orchestratorSrc.indexOf(methodMarker);
  if (methodStart === -1) return -1;
  return orchestratorSrc.indexOf(needle, methodStart);
}

// ---------------------------------------------------------------------------
// PC-001: Static sections precede the query-classification block
//         in BOTH #buildSystemPrompt and #buildCompressedSystemPrompt
// ---------------------------------------------------------------------------

describe('PC-001: Static prompt sections appear before query-classification (full prompt)', () => {
  const FULL_MARKER   = '#buildSystemPrompt(mode, _analysis,';
  const STATIC_ANCHOR = 'REFUSAL MAINTENANCE (TRU1)';
  const VAR_ANCHOR    = "// ISSUE #443: Add query-specific response guidance (VARIABLE";

  it('PC-001a: REFUSAL MAINTENANCE section exists in #buildSystemPrompt', () => {
    const pos = positionInMethod(FULL_MARKER, STATIC_ANCHOR);
    assert.ok(pos !== -1, 'REFUSAL MAINTENANCE block must be present in #buildSystemPrompt');
  });

  it('PC-001b: query-classification block exists in #buildSystemPrompt', () => {
    const pos = positionInMethod(FULL_MARKER, VAR_ANCHOR);
    assert.ok(pos !== -1, 'query-classification comment must be present in #buildSystemPrompt');
  });

  it('PC-001c: REFUSAL MAINTENANCE appears before query-classification in full prompt', () => {
    const fullStart = orchestratorSrc.indexOf(FULL_MARKER);
    const staticPos = orchestratorSrc.indexOf(STATIC_ANCHOR, fullStart);
    const varPos    = orchestratorSrc.indexOf(VAR_ANCHOR,    fullStart);
    assert.ok(
      staticPos < varPos,
      `REFUSAL MAINTENANCE (static) must appear before query-classification (variable) in #buildSystemPrompt. ` +
      `staticPos=${staticPos}, varPos=${varPos}`,
    );
  });

  it('PC-001d: UNCERTAINTY HANDLING section exists in #buildSystemPrompt', () => {
    const pos = positionInMethod(FULL_MARKER, 'UNCERTAINTY HANDLING:');
    assert.ok(pos !== -1, 'UNCERTAINTY HANDLING block must be present in #buildSystemPrompt');
  });

  it('PC-001e: UNCERTAINTY HANDLING appears before query-classification in full prompt', () => {
    const fullStart = orchestratorSrc.indexOf(FULL_MARKER);
    const uncPos    = orchestratorSrc.indexOf('UNCERTAINTY HANDLING:', fullStart);
    const varPos    = orchestratorSrc.indexOf(VAR_ANCHOR, fullStart);
    assert.ok(
      uncPos < varPos,
      `UNCERTAINTY HANDLING (static) must appear before query-classification (variable) in #buildSystemPrompt. ` +
      `uncPos=${uncPos}, varPos=${varPos}`,
    );
  });
});

describe('PC-001: Static prompt sections appear before query-classification (compressed prompt)', () => {
  const COMP_MARKER   = '#buildCompressedSystemPrompt(mode,';
  const STATIC_ANCHOR = 'Mode: ${modeConfig?.display_name || mode}';
  const VAR_ANCHOR    = "// ISSUE #443: Add query-specific response guidance (VARIABLE";

  it('PC-001f: Mode line exists in #buildCompressedSystemPrompt', () => {
    const pos = positionInMethod(COMP_MARKER, STATIC_ANCHOR);
    assert.ok(pos !== -1, 'Mode line must be present in #buildCompressedSystemPrompt');
  });

  it('PC-001g: query-classification block exists in #buildCompressedSystemPrompt', () => {
    const pos = positionInMethod(COMP_MARKER, VAR_ANCHOR);
    assert.ok(pos !== -1, 'query-classification comment must be present in #buildCompressedSystemPrompt');
  });

  it('PC-001h: Mode line appears before query-classification in compressed prompt', () => {
    const compStart  = orchestratorSrc.indexOf(COMP_MARKER);
    const staticPos  = orchestratorSrc.indexOf(STATIC_ANCHOR, compStart);
    const varPos     = orchestratorSrc.indexOf(VAR_ANCHOR,    compStart);
    assert.ok(
      staticPos < varPos,
      `Mode line (static) must appear before query-classification (variable) in #buildCompressedSystemPrompt. ` +
      `staticPos=${staticPos}, varPos=${varPos}`,
    );
  });
});

// ---------------------------------------------------------------------------
// PC-002: Query-classification block appears AFTER refusal maintenance and
//         uncertainty handling in #buildSystemPrompt
// ---------------------------------------------------------------------------

describe('PC-002: Query-classification block is after refusal/uncertainty handling', () => {
  const FULL_MARKER = '#buildSystemPrompt(mode, _analysis,';
  const VAR_ANCHOR  = "// ISSUE #443: Add query-specific response guidance (VARIABLE";

  it('PC-002a: query-classification is after REFUSAL MAINTENANCE', () => {
    const fullStart   = orchestratorSrc.indexOf(FULL_MARKER);
    const refusalPos  = orchestratorSrc.indexOf('REFUSAL MAINTENANCE (TRU1):', fullStart);
    const varPos      = orchestratorSrc.indexOf(VAR_ANCHOR, fullStart);
    assert.ok(
      refusalPos < varPos,
      `REFUSAL MAINTENANCE must precede query-classification. ` +
      `refusalPos=${refusalPos}, varPos=${varPos}`,
    );
  });

  it('PC-002b: query-classification is after UNCERTAINTY HANDLING', () => {
    const fullStart    = orchestratorSrc.indexOf(FULL_MARKER);
    const uncertainPos = orchestratorSrc.indexOf('UNCERTAINTY HANDLING:', fullStart);
    const varPos       = orchestratorSrc.indexOf(VAR_ANCHOR, fullStart);
    assert.ok(
      uncertainPos < varPos,
      `UNCERTAINTY HANDLING must precede query-classification. ` +
      `uncertainPos=${uncertainPos}, varPos=${varPos}`,
    );
  });

  it('PC-002c: query-classification is after mode-specific rules', () => {
    const fullStart  = orchestratorSrc.indexOf(FULL_MARKER);
    const modePos    = orchestratorSrc.indexOf("Mode: ${modeConfig?.display_name || mode}", fullStart);
    const varPos     = orchestratorSrc.indexOf(VAR_ANCHOR, fullStart);
    assert.ok(
      modePos < varPos,
      `Mode display line must precede query-classification in #buildSystemPrompt. ` +
      `modePos=${modePos}, varPos=${varPos}`,
    );
  });

  it('PC-002d: reasoning guidance injection is after query-classification in full prompt', () => {
    const fullStart     = orchestratorSrc.indexOf(FULL_MARKER);
    const varPos        = orchestratorSrc.indexOf(VAR_ANCHOR, fullStart);
    const reasoningPos  = orchestratorSrc.indexOf('// INJECT PRINCIPLE-BASED REASONING GUIDANCE', fullStart);
    assert.ok(
      varPos < reasoningPos,
      `query-classification must precede reasoning guidance. ` +
      `varPos=${varPos}, reasoningPos=${reasoningPos}`,
    );
  });
});

// ---------------------------------------------------------------------------
// PC-003: AnthropicAdapter wraps systemPrompt in array with cache_control
// ---------------------------------------------------------------------------

function makeMockAnthropicClient() {
  return {
    messages: {
      create: async () => ({
        content: [{ text: 'response' }],
        usage:   { input_tokens: 10, output_tokens: 5 },
      }),
    },
  };
}

describe('PC-003: AnthropicAdapter system parameter is array with cache_control', () => {
  it('PC-003a: system is an array when systemPrompt is provided', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.ok(Array.isArray(req.system), 'system must be an array');
  });

  it('PC-003b: system array has exactly one element', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.system.length, 1, 'system array must have exactly one element');
  });

  it('PC-003c: system element has type "text"', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.system[0].type, 'text');
  });

  it('PC-003d: system element text matches systemPrompt', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.system[0].text, 'You are helpful.');
  });

  it('PC-003e: system element has cache_control with type "ephemeral"', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.deepEqual(req.system[0].cache_control, { type: 'ephemeral' });
  });
});

// ---------------------------------------------------------------------------
// PC-004: AnthropicAdapter omits system key when systemPrompt is empty/absent
// ---------------------------------------------------------------------------

describe('PC-004: AnthropicAdapter system parameter is undefined when systemPrompt is empty', () => {
  it('PC-004a: system key absent when systemPrompt is empty string', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: '',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.ok(!('system' in req), 'system key must be absent when systemPrompt is empty');
  });

  it('PC-004b: system key absent when systemPrompt is not provided', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      messages:  [{ role: 'user', content: 'Hello' }],
      maxTokens: 1000,
    });
    assert.ok(!('system' in req), 'system key must be absent when systemPrompt is not provided');
  });
});
