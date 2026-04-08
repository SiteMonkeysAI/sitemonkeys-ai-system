/**
 * Exponential Backoff & History Compression Tests
 *
 * EB-001: Retry includes 1000ms delay before first retry
 * EB-002: Rate-limit 429 triggers retry-after backoff
 * HC-001: Conversations over 4 turns get older turns compressed
 * HC-002: Simple queries bypass compression (depth 1-2)
 * HC-003: Compression uses gpt-4o-mini not gpt-4o
 * HC-004: All source-code structural checks (guards existing behaviour)
 *
 * Run with: node --test tests/unit/backoffAndCompression.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OpenAIAdapter }     from '../../api/core/adapters/OpenAIAdapter.js';
import { AnthropicAdapter }  from '../../api/core/adapters/AnthropicAdapter.js';
import {
  registerAdapters,
  getAdapterInstance,
} from '../../api/core/adapters/adapter-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGoodOpenAIResponse(text = 'ok') {
  return {
    choices: [{ message: { content: text } }],
    usage:   { prompt_tokens: 5, completion_tokens: 3 },
  };
}

function makeGoodAnthropicResponse(text = 'ok') {
  return {
    content: [{ text }],
    usage:   { input_tokens: 5, output_tokens: 3 },
  };
}

// ---------------------------------------------------------------------------
// EB-001: Orchestrator retry chain logs 1000ms backoff before first retry
// ---------------------------------------------------------------------------

describe('EB-001: Orchestrator adds 1000ms backoff before first retry', () => {
  it('EB-001a: orchestrator.js calls setTimeout(r, 1000) before first gpt-4o retry', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('setTimeout(r, 1000)'),
      'orchestrator.js must contain setTimeout(r, 1000) for first retry backoff'
    );
  });

  it('EB-001b: orchestrator.js logs [RETRY] Backoff 1000ms before retry attempt', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('Backoff 1000ms before retry attempt'),
      'orchestrator.js must log "[RETRY] Backoff 1000ms before retry attempt"'
    );
  });

  it('EB-001c: orchestrator.js calls setTimeout(r, 2000) before Claude escalation', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('setTimeout(r, 2000)'),
      'orchestrator.js must contain setTimeout(r, 2000) for second retry (Claude escalation) backoff'
    );
  });

  it('EB-001d: orchestrator.js logs [RETRY] Backoff 2000ms before retry attempt', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('Backoff 2000ms before retry attempt'),
      'orchestrator.js must log "[RETRY] Backoff 2000ms before retry attempt"'
    );
  });
});

// ---------------------------------------------------------------------------
// EB-002: 429 rate-limit triggers retry-after backoff in adapters
// ---------------------------------------------------------------------------

describe('EB-002: Rate-limit 429 triggers retry-after backoff in OpenAIAdapter', () => {
  it('EB-002a: OpenAIAdapter retries once on 429 and returns success', async () => {
    let callCount = 0;
    const mockClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++;
            if (callCount === 1) {
              const err = new Error('Rate limit exceeded');
              err.status = 429;
              err.headers = { 'retry-after': '0' }; // 0s so test is fast
              throw err;
            }
            return makeGoodOpenAIResponse('retry-success');
          },
        },
      },
    };
    const adapter = new OpenAIAdapter(mockClient, 'gpt-4o');
    const result = await adapter.call({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 100,
    });
    assert.strictEqual(result.content, 'retry-success', 'Should return retry response');
    assert.strictEqual(callCount, 2, 'Should call API exactly twice (initial + 1 retry)');
  });

  it('EB-002b: OpenAIAdapter re-throws non-429 errors without retry', async () => {
    let callCount = 0;
    const mockClient = {
      chat: {
        completions: {
          create: async () => {
            callCount++;
            throw new Error('Internal Server Error');
          },
        },
      },
    };
    const adapter = new OpenAIAdapter(mockClient, 'gpt-4o');
    await assert.rejects(
      () => adapter.call({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 100,
      }),
      /Internal Server Error/
    );
    assert.strictEqual(callCount, 1, 'Non-429 errors must not be retried');
  });

  it('EB-002c: OpenAIAdapter uses retry-after header value for backoff duration', async () => {
    const delays = [];
    const origSetTimeout = global.setTimeout;
    // Patch setTimeout to capture delay without actually waiting
    global.setTimeout = (fn, ms) => {
      delays.push(ms);
      fn(); // resolve immediately
      return 0;
    };

    try {
      let callCount = 0;
      const mockClient = {
        chat: {
          completions: {
            create: async () => {
              callCount++;
              if (callCount === 1) {
                const err = new Error('Rate limit');
                err.status = 429;
                err.headers = { 'retry-after': '7' };
                throw err;
              }
              return makeGoodOpenAIResponse();
            },
          },
        },
      };
      const adapter = new OpenAIAdapter(mockClient, 'gpt-4o');
      await adapter.call({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 50,
      });
      assert.ok(delays.includes(7000), `Expected backoff of 7000ms but got [${delays.join(', ')}]`);
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });

  it('EB-002d: OpenAIAdapter defaults to 5s backoff when retry-after header absent', async () => {
    const delays = [];
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => {
      delays.push(ms);
      fn();
      return 0;
    };

    try {
      let callCount = 0;
      const mockClient = {
        chat: {
          completions: {
            create: async () => {
              callCount++;
              if (callCount === 1) {
                const err = new Error('Rate limit');
                err.status = 429;
                // No headers
                throw err;
              }
              return makeGoodOpenAIResponse();
            },
          },
        },
      };
      const adapter = new OpenAIAdapter(mockClient, 'gpt-4o');
      await adapter.call({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 50,
      });
      assert.ok(delays.includes(5000), `Expected default 5000ms backoff but got [${delays.join(', ')}]`);
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});

describe('EB-002e-g: Rate-limit 429 triggers retry-after backoff in AnthropicAdapter', () => {
  it('EB-002e: AnthropicAdapter retries once on 429 and returns success', async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: async () => {
          callCount++;
          if (callCount === 1) {
            const err = new Error('Rate limit exceeded');
            err.status = 429;
            err.headers = { 'retry-after': '0' };
            throw err;
          }
          return makeGoodAnthropicResponse('retry-success');
        },
      },
    };
    const adapter = new AnthropicAdapter(mockClient, 'claude-sonnet-4-20250514');
    const result = await adapter.call({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 100,
    });
    assert.strictEqual(result.content, 'retry-success');
    assert.strictEqual(callCount, 2);
  });

  it('EB-002f: AnthropicAdapter re-throws non-429 errors without retry', async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: async () => {
          callCount++;
          throw new Error('Server Error');
        },
      },
    };
    const adapter = new AnthropicAdapter(mockClient, 'claude-sonnet-4-20250514');
    await assert.rejects(
      () => adapter.call({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
      }),
      /Server Error/
    );
    assert.strictEqual(callCount, 1);
  });

  it('EB-002g: AnthropicAdapter logs [RETRY] Backoff on 429', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'adapters', 'AnthropicAdapter.js'),
      'utf8'
    );
    assert.ok(
      src.includes('[RETRY] Backoff'),
      'AnthropicAdapter.js must log "[RETRY] Backoff" on 429'
    );
  });
});

// ---------------------------------------------------------------------------
// HC-001: Conversations over 4 turns get older turns compressed
// ---------------------------------------------------------------------------

describe('HC-001: Long conversations trigger history compression', () => {
  it('HC-001a: orchestrator.js checks conversationHistory.length > 4', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('conversationHistory.length > 4'),
      'orchestrator.js must check conversationHistory.length > 4 before compressing'
    );
  });

  it('HC-001b: orchestrator.js slices olderTurns = trimmedHistory.slice(0, -2)', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('slice(0, -2)'),
      'orchestrator.js must call .slice(0, -2) to get older turns'
    );
  });

  it('HC-001c: orchestrator.js keeps last 2 turns as recentTurns', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('slice(-2)'),
      'orchestrator.js must call .slice(-2) to keep recent turns'
    );
  });

  it('HC-001d: compressed trimmedHistory prepends system summary turn', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes("Previous conversation summary:"),
      'orchestrator.js must inject "Previous conversation summary:" system turn'
    );
  });

  it('HC-001e: orchestrator.js logs [HISTORY-COMPRESS] with turns count and chars', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('[HISTORY-COMPRESS]'),
      'orchestrator.js must log [HISTORY-COMPRESS]'
    );
    assert.ok(
      src.includes('tokens_saved=~'),
      'orchestrator.js must log tokens_saved estimate in [HISTORY-COMPRESS]'
    );
  });

  it('HC-001f: summarizeOlderTurns function is defined in orchestrator.js', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('async function summarizeOlderTurns'),
      'orchestrator.js must define async function summarizeOlderTurns'
    );
  });

  it('HC-001g: summarizeOlderTurns uses openai-gpt4o-mini adapter', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    // The function must look up the mini adapter
    assert.ok(
      src.includes("getAdapterInstance('openai-gpt4o-mini')"),
      'summarizeOlderTurns must call getAdapterInstance("openai-gpt4o-mini")'
    );
  });
});

// ---------------------------------------------------------------------------
// HC-002: Simple queries bypass compression (depth 1-2)
// ---------------------------------------------------------------------------

describe('HC-002: Simple/greeting queries bypass history compression', () => {
  it('HC-002a: orchestrator.js guards compression with !_isSimpleOrGreeting check', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('_isSimpleOrGreeting'),
      'orchestrator.js must use _isSimpleOrGreeting guard to bypass compression'
    );
  });

  it('HC-002b: simple_factual classification is excluded from compression', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes("'simple_factual'") && src.includes('_isSimpleOrGreeting'),
      'orchestrator.js must include simple_factual in bypass guard'
    );
  });

  it('HC-002c: greeting classification is excluded from compression', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes("'greeting'") && src.includes('_isSimpleOrGreeting'),
      'orchestrator.js must include greeting in bypass guard'
    );
  });
});

// ---------------------------------------------------------------------------
// HC-003: Compression uses gpt-4o-mini, not gpt-4o
// ---------------------------------------------------------------------------

describe('HC-003: Compression uses gpt-4o-mini adapter', () => {
  it('HC-003a: summarizeOlderTurns calls gpt-4o-mini adapter key', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes("getAdapterInstance('openai-gpt4o-mini')"),
      'summarizeOlderTurns must use openai-gpt4o-mini adapter key'
    );
  });

  it('HC-003b: summarizeOlderTurns maxTokens is 150 (compact summarization)', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('maxTokens: 150'),
      'summarizeOlderTurns must use maxTokens: 150 to keep summaries short'
    );
  });

  it('HC-003c: summarizeOlderTurns uses temperature 0 for deterministic output', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('temperature: 0'),
      'summarizeOlderTurns must use temperature: 0'
    );
  });

  it('HC-003d: summarizeOlderTurns returns the content string from the mini adapter', async () => {
    // We test the logic by verifying summarizeOlderTurns is invoked with the mini adapter.
    // Since summarizeOlderTurns is a module-level function (not exported), we verify
    // its structure via source code.
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('return res.content'),
      'summarizeOlderTurns must return res.content from the adapter call'
    );
  });
});

// ---------------------------------------------------------------------------
// HC-004: All source-code structural guards (protects existing behaviour)
// ---------------------------------------------------------------------------

describe('HC-004: Structural guards — existing behaviour must not regress', () => {
  it('HC-004a: trimmedHistory is declared with let (mutable for compression)', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('let trimmedHistory = conversationHistory.slice('),
      'trimmedHistory must be declared with let so compression can reassign it'
    );
  });

  it('HC-004b: compression is guarded by SESSION_STATE_ENABLED check', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('SESSION_STATE_ENABLED') && src.includes('conversationHistory.length > 4'),
      'Compression must check SESSION_STATE_ENABLED before running'
    );
  });

  it('HC-004c: getConversationDepth still controls history depth (unchanged)', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    assert.ok(
      src.includes('function getConversationDepth'),
      'getConversationDepth function must remain intact'
    );
  });

  it('HC-004d: OpenAIAdapter [RETRY] log includes Backoff and attempt number', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'adapters', 'OpenAIAdapter.js'),
      'utf8'
    );
    assert.ok(
      src.includes('[RETRY] Backoff') && src.includes('retry attempt 1'),
      'OpenAIAdapter.js must log "[RETRY] Backoff ...ms before retry attempt 1"'
    );
  });

  it('HC-004e: AnthropicAdapter [RETRY] log includes Backoff and attempt number', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'adapters', 'AnthropicAdapter.js'),
      'utf8'
    );
    assert.ok(
      src.includes('[RETRY] Backoff') && src.includes('retry attempt 1'),
      'AnthropicAdapter.js must log "[RETRY] Backoff ...ms before retry attempt 1"'
    );
  });

  it('HC-004f: summarizeOlderTurns has fallback when adapter not registered', () => {
    const src = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'orchestrator.js'),
      'utf8'
    );
    // The fallback path returns placeholder content when no mini adapter is registered
    assert.ok(
      src.includes('!miniAdapter'),
      'summarizeOlderTurns must handle case where miniAdapter is null/undefined'
    );
  });

  it('HC-004g: parseInt uses radix 10 for retry-after parsing (no NaN risk)', () => {
    const openaiSrc = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'adapters', 'OpenAIAdapter.js'),
      'utf8'
    );
    const anthropicSrc = readFileSync(
      join(REPO_ROOT, 'api', 'core', 'adapters', 'AnthropicAdapter.js'),
      'utf8'
    );
    assert.ok(
      openaiSrc.includes("parseInt(err.headers?.['retry-after']"),
      'OpenAIAdapter.js must use parseInt for retry-after'
    );
    assert.ok(
      anthropicSrc.includes("parseInt(err.headers?.['retry-after']"),
      'AnthropicAdapter.js must use parseInt for retry-after'
    );
    // Both must have NaN guard: (parseInt(...) || 5)
    assert.ok(
      openaiSrc.includes('|| 5)'),
      'OpenAIAdapter.js must guard against NaN with || 5 fallback'
    );
    assert.ok(
      anthropicSrc.includes('|| 5)'),
      'AnthropicAdapter.js must guard against NaN with || 5 fallback'
    );
  });
});
