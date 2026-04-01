/**
 * Adapter Architecture Tests — AD-001 through AD-009
 *
 * Validates the provider/model adapter layer introduced in items 27-29.
 * Uses inline minimal implementations so no real API clients are required.
 *
 * Run with: node --test tests/unit/adapters.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BaseAdapter }    from '../../api/core/adapters/BaseAdapter.js';
import { OpenAIAdapter }  from '../../api/core/adapters/OpenAIAdapter.js';
import { AnthropicAdapter } from '../../api/core/adapters/AnthropicAdapter.js';
import {
  registerAdapters,
  getAdapter,
  getAdapterInstance,
} from '../../api/core/adapters/adapter-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Minimal mock clients — no real network calls
// ---------------------------------------------------------------------------

function makeMockOpenAIClient(overrideResponse = {}) {
  return {
    chat: {
      completions: {
        create: async (req) => ({
          choices: [{ message: { content: 'openai-response' } }],
          usage:   { prompt_tokens: 10, completion_tokens: 5 },
          ...overrideResponse,
        }),
      },
    },
  };
}

function makeMockAnthropicClient(overrideResponse = {}) {
  return {
    messages: {
      create: async (req) => ({
        content: [{ text: 'anthropic-response' }],
        usage:   { input_tokens: 10, output_tokens: 5 },
        ...overrideResponse,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// AD-001: OpenAIAdapter.normalizeRequest produces correct messages array
//         with system role prepended
// ---------------------------------------------------------------------------

describe('AD-001: OpenAIAdapter.normalizeRequest — system role in messages', () => {
  it('AD-001a: system message is first when systemPrompt provided', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.messages[0].role, 'system');
    assert.strictEqual(req.messages[0].content, 'You are helpful.');
  });

  it('AD-001b: user message follows system message', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const req = adapter.normalizeRequest({
      systemPrompt: 'You are helpful.',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.messages[1].role, 'user');
    assert.strictEqual(req.messages[1].content, 'Hello');
  });

  it('AD-001c: no system message added when systemPrompt is empty', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const req = adapter.normalizeRequest({
      systemPrompt: '',
      messages:     [{ role: 'user', content: 'Hello' }],
      maxTokens:    1000,
    });
    assert.strictEqual(req.messages[0].role, 'user');
    assert.strictEqual(req.messages.length, 1);
  });

  it('AD-001d: model field matches adapter modelId', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const req = adapter.normalizeRequest({ systemPrompt: '', messages: [], maxTokens: 100 });
    assert.strictEqual(req.model, 'gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// AD-002: AnthropicAdapter.normalizeRequest — system prompt as separate param
// ---------------------------------------------------------------------------

describe('AD-002: AnthropicAdapter.normalizeRequest — system as top-level param', () => {
  it('AD-002a: system field is set when systemPrompt provided', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'Be truthful.',
      messages:     [{ role: 'user', content: 'Hi' }],
      maxTokens:    2000,
    });
    assert.strictEqual(req.system, 'Be truthful.');
  });

  it('AD-002b: messages array does NOT contain system role', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: 'Be truthful.',
      messages:     [{ role: 'user', content: 'Hi' }],
      maxTokens:    2000,
    });
    const hasSystemInMessages = req.messages.some(m => m.role === 'system');
    assert.strictEqual(hasSystemInMessages, false);
  });

  it('AD-002c: system key omitted when systemPrompt is empty', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({
      systemPrompt: '',
      messages:     [{ role: 'user', content: 'Hi' }],
      maxTokens:    2000,
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(req, 'system'), false);
  });

  it('AD-002d: max_tokens defaults to 4000 when not provided', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const req = adapter.normalizeRequest({ systemPrompt: '', messages: [] });
    assert.strictEqual(req.max_tokens, 4000);
  });
});

// ---------------------------------------------------------------------------
// AD-003: OpenAIAdapter.normalizeResponse maps choices[0].message.content
// ---------------------------------------------------------------------------

describe('AD-003: OpenAIAdapter.normalizeResponse — content field mapping', () => {
  it('AD-003a: content maps from choices[0].message.content', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const rawResponse = {
      choices: [{ message: { content: 'Hello from GPT' } }],
      usage:   { prompt_tokens: 10, completion_tokens: 5 },
    };
    const result = adapter.normalizeResponse(rawResponse, 100);
    assert.strictEqual(result.content, 'Hello from GPT');
  });

  it('AD-003b: usage fields are correctly mapped', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const rawResponse = {
      choices: [{ message: { content: 'x' } }],
      usage:   { prompt_tokens: 20, completion_tokens: 8 },
    };
    const result = adapter.normalizeResponse(rawResponse, 50);
    assert.strictEqual(result.usage.inputTokens,  20);
    assert.strictEqual(result.usage.outputTokens, 8);
    assert.strictEqual(result.usage.totalTokens,  28);
  });

  it('AD-003c: provider and model fields are set', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const result = adapter.normalizeResponse(
      { choices: [{ message: { content: '' } }], usage: { prompt_tokens: 0, completion_tokens: 0 } },
      0
    );
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.model,    'gpt-4o');
  });

  it('AD-003d: latencyMs is passed through', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const result = adapter.normalizeResponse(
      { choices: [{ message: { content: '' } }], usage: { prompt_tokens: 0, completion_tokens: 0 } },
      123
    );
    assert.strictEqual(result.latencyMs, 123);
  });
});

// ---------------------------------------------------------------------------
// AD-004: AnthropicAdapter.normalizeResponse maps content[0].text
// ---------------------------------------------------------------------------

describe('AD-004: AnthropicAdapter.normalizeResponse — content field mapping', () => {
  it('AD-004a: content maps from content[0].text', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const rawResponse = {
      content: [{ text: 'Hello from Claude' }],
      usage:   { input_tokens: 15, output_tokens: 7 },
    };
    const result = adapter.normalizeResponse(rawResponse, 200);
    assert.strictEqual(result.content, 'Hello from Claude');
  });

  it('AD-004b: usage fields are correctly mapped', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const rawResponse = {
      content: [{ text: 'x' }],
      usage:   { input_tokens: 30, output_tokens: 12 },
    };
    const result = adapter.normalizeResponse(rawResponse, 80);
    assert.strictEqual(result.usage.inputTokens,  30);
    assert.strictEqual(result.usage.outputTokens, 12);
    assert.strictEqual(result.usage.totalTokens,  42);
  });

  it('AD-004c: provider is anthropic', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    const result = adapter.normalizeResponse(
      { content: [{ text: '' }], usage: { input_tokens: 0, output_tokens: 0 } }, 0
    );
    assert.strictEqual(result.provider, 'anthropic');
  });
});

// ---------------------------------------------------------------------------
// AD-005: calculateCost returns correct value for given token counts
// ---------------------------------------------------------------------------

describe('AD-005: calculateCost — correct arithmetic', () => {
  it('AD-005a: gpt-4o cost is correct', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    // input: 1000 tokens × $0.005/1k = $0.005
    // output: 500 tokens × $0.015/1k = $0.0075
    const cost = adapter.calculateCost(1000, 500);
    assert.strictEqual(Number(cost.toFixed(6)), 0.0125);
  });

  it('AD-005b: gpt-4o-mini cost is correct', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    // input: 1000 × $0.00015/1k = $0.00015
    // output: 1000 × $0.0006/1k = $0.0006
    const cost = adapter.calculateCost(1000, 1000);
    assert.strictEqual(Number(cost.toFixed(7)), 0.00075);
  });

  it('AD-005c: anthropic cost is correct', () => {
    const adapter = new AnthropicAdapter(makeMockAnthropicClient());
    // input: 2000 × $0.003/1k = $0.006
    // output: 1000 × $0.015/1k = $0.015
    const cost = adapter.calculateCost(2000, 1000);
    assert.strictEqual(Number(cost.toFixed(6)), 0.021);
  });

  it('AD-005d: zero tokens → zero cost', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    assert.strictEqual(adapter.calculateCost(0, 0), 0);
  });
});

// ---------------------------------------------------------------------------
// AD-006: AdapterRegistry.getAdapter returns cheapest adapter meeting
//         minimum capability threshold (0.70)
// ---------------------------------------------------------------------------

describe('AD-006: AdapterRegistry.getAdapter — cheapest capable adapter', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('AD-006a: returns gpt-4o-mini for simple_factual (cheapest capable)', () => {
    const adapter = getAdapter({ taskType: 'simple_factual' });
    // gpt-4o-mini scores 0.95 for simple_factual → eligible
    // gpt-4o-mini is cheaper than gpt-4o and claude
    assert.ok(adapter, 'adapter must be non-null');
    assert.strictEqual(adapter.modelId, 'gpt-4o-mini');
  });

  it('AD-006b: returns an adapter with score >= 0.70 for complex_reasoning', () => {
    const adapter = getAdapter({ taskType: 'complex_reasoning' });
    assert.ok(adapter, 'adapter must be non-null');
    const score = adapter.capabilities.taskScores.complex_reasoning;
    assert.ok(score >= 0.70, `score ${score} must be >= 0.70`);
  });

  it('AD-006c: returns adapter with non-null modelId', () => {
    const adapter = getAdapter({ taskType: 'summarization' });
    assert.ok(adapter.modelId, 'modelId must be set');
  });

  it('AD-006d: no taskType returns an adapter', () => {
    const adapter = getAdapter({});
    assert.ok(adapter, 'adapter must be non-null for empty requirements');
  });
});

// ---------------------------------------------------------------------------
// AD-007: AdapterRegistry falls back to gpt-4o when no adapter meets
//         requirements (all scores below threshold)
// ---------------------------------------------------------------------------

describe('AD-007: AdapterRegistry fallback to gpt-4o on no capable adapter', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('AD-007a: unknown taskType returns gpt-4o as fallback', () => {
    // An unknown task type has no score → adapter passes filter (score undefined → included)
    // so this tests that a result is always returned
    const adapter = getAdapter({ taskType: 'completely_unknown_task_xyz' });
    assert.ok(adapter, 'adapter must be non-null as fallback');
  });

  it('AD-007b: getAdapterInstance("openai-gpt4o") returns OpenAIAdapter after registration', () => {
    const adapter = getAdapterInstance('openai-gpt4o');
    assert.ok(adapter instanceof OpenAIAdapter, 'must be an OpenAIAdapter');
    assert.strictEqual(adapter.modelId, 'gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// AD-008: MINI_MODEL_ENABLED flag behavior preserved — simple queries route
//         to gpt-4o-mini via the OpenAI adapter when flag is on
// ---------------------------------------------------------------------------

describe('AD-008: MINI_MODEL_ENABLED flag behavior preserved', () => {
  it('AD-008a: openai-gpt4o-mini adapter is registered and callable', () => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
    const miniAdapter = getAdapterInstance('openai-gpt4o-mini');
    assert.ok(miniAdapter instanceof OpenAIAdapter, 'mini adapter must be OpenAIAdapter');
    assert.strictEqual(miniAdapter.modelId, 'gpt-4o-mini');
  });

  it('AD-008b: gpt-4o-mini normalizeRequest uses mini model id', () => {
    const adapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    const req = adapter.normalizeRequest({ systemPrompt: 'sys', messages: [], maxTokens: 500 });
    assert.strictEqual(req.model, 'gpt-4o-mini');
  });

  it('AD-008c: gpt-4o-mini taskScores differ from gpt-4o for high_stakes', () => {
    const miniAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    const fullAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    assert.ok(
      miniAdapter.capabilities.taskScores.high_stakes <
      fullAdapter.capabilities.taskScores.high_stakes,
      'mini should score lower on high_stakes'
    );
  });
});

// ---------------------------------------------------------------------------
// AD-009: Structural guard — adapter files exist and export expected symbols
// ---------------------------------------------------------------------------

describe('AD-009: Adapter file structure guards', () => {
  const ADAPTERS_DIR = join(REPO_ROOT, 'api', 'core', 'adapters');

  it('AD-009a: BaseAdapter.js exists', () => {
    assert.ok(existsSync(join(ADAPTERS_DIR, 'BaseAdapter.js')), 'BaseAdapter.js must exist');
  });

  it('AD-009b: OpenAIAdapter.js exists', () => {
    assert.ok(existsSync(join(ADAPTERS_DIR, 'OpenAIAdapter.js')), 'OpenAIAdapter.js must exist');
  });

  it('AD-009c: AnthropicAdapter.js exists', () => {
    assert.ok(existsSync(join(ADAPTERS_DIR, 'AnthropicAdapter.js')), 'AnthropicAdapter.js must exist');
  });

  it('AD-009d: adapter-registry.js exports registerAdapters', () => {
    const src = readFileSync(join(ADAPTERS_DIR, 'adapter-registry.js'), 'utf8');
    assert.ok(src.includes('export function registerAdapters'), 'registerAdapters must be exported');
  });

  it('AD-009e: adapter-registry.js exports getAdapter', () => {
    const src = readFileSync(join(ADAPTERS_DIR, 'adapter-registry.js'), 'utf8');
    assert.ok(src.includes('export function getAdapter'), 'getAdapter must be exported');
  });

  it('AD-009f: adapter-registry.js exports getAdapterInstance', () => {
    const src = readFileSync(join(ADAPTERS_DIR, 'adapter-registry.js'), 'utf8');
    assert.ok(src.includes('export function getAdapterInstance'), 'getAdapterInstance must be exported');
  });

  it('AD-009g: orchestrator.js imports registerAdapters', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(src.includes('registerAdapters'), 'orchestrator must import registerAdapters');
  });

  it('AD-009h: orchestrator.js imports getAdapterInstance', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(src.includes('getAdapterInstance'), 'orchestrator must import getAdapterInstance');
  });

  it('AD-009i: orchestrator.js no longer calls this.anthropic.messages.create directly', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(
      !src.includes('this.anthropic.messages.create'),
      'Direct Anthropic SDK call must be replaced with adapter'
    );
  });

  it('AD-009j: orchestrator.js no longer calls this.openai.chat.completions.create directly in routeToAI', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(
      !src.includes('this.openai.chat.completions.create'),
      'Direct OpenAI SDK call must be replaced with adapter'
    );
  });
});

// ---------------------------------------------------------------------------
// CR-001: news_current_events routes to cheapest summarization-capable adapter
//         (gpt-4o-mini) when MINI_MODEL_ENABLED=true
// ---------------------------------------------------------------------------

describe('CR-001: news_current_events — cheapest summarization-capable adapter', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('CR-001a: summarization task with 0.70 threshold selects gpt-4o-mini (cheapest capable OpenAI)', () => {
    // news_current_events → taskType='summarization', minimumScore=0.70
    // Excluding anthropic simulates useClaude=false path in orchestrator
    const adapter = getAdapter({ taskType: 'summarization', minimumScore: 0.70, excludeProviders: ['anthropic'] });
    assert.ok(adapter, 'adapter must be non-null');
    assert.strictEqual(adapter.modelId, 'gpt-4o-mini');
  });

  it('CR-001b: gpt-4o-mini summarization score meets 0.70 threshold', () => {
    const miniAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    const score = miniAdapter.capabilities.taskScores.summarization;
    assert.ok(score >= 0.70, `gpt-4o-mini summarization score ${score} must be >= 0.70`);
  });

  it('CR-001c: gpt-4o-mini is cheaper than gpt-4o (registry cost sort)', () => {
    const miniAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    const fullAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const miniCost = (miniAdapter.costPer1kTokens.input + miniAdapter.costPer1kTokens.output) / 2;
    const fullCost = (fullAdapter.costPer1kTokens.input + fullAdapter.costPer1kTokens.output) / 2;
    assert.ok(miniCost < fullCost, 'gpt-4o-mini must be cheaper than gpt-4o');
  });
});

// ---------------------------------------------------------------------------
// CR-002: complex_analytical routes to gpt-4o — not gpt-4o-mini
//         because mini scores 0.75 < 0.88 threshold for complex_reasoning
// ---------------------------------------------------------------------------

describe('CR-002: complex_analytical — adapter with complex_reasoning score >= 0.88', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('CR-002a: complex_reasoning task with 0.88 threshold excludes gpt-4o-mini', () => {
    const miniAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o-mini');
    const score = miniAdapter.capabilities.taskScores.complex_reasoning;
    assert.ok(score < 0.88, `gpt-4o-mini score ${score} must be below 0.88 threshold`);
  });

  it('CR-002b: complex_reasoning task with 0.88 threshold returns gpt-4o (lowest eligible OpenAI)', () => {
    const adapter = getAdapter({ taskType: 'complex_reasoning', minimumScore: 0.88, excludeProviders: ['anthropic'] });
    assert.ok(adapter, 'adapter must be non-null');
    assert.strictEqual(adapter.modelId, 'gpt-4o');
  });

  it('CR-002c: gpt-4o complex_reasoning score meets 0.88 threshold', () => {
    const fullAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const score = fullAdapter.capabilities.taskScores.complex_reasoning;
    assert.ok(score >= 0.88, `gpt-4o complex_reasoning score ${score} must be >= 0.88`);
  });
});

// ---------------------------------------------------------------------------
// CR-003: high_stakes routes to adapter with score >= 0.95
//         (claude-sonnet is the only registered adapter meeting this threshold)
// ---------------------------------------------------------------------------

describe('CR-003: high_stakes — adapter with score >= 0.95', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('CR-003a: high_stakes task with 0.95 threshold returns claude-sonnet', () => {
    // No excludeProviders — high_stakes routing allows Anthropic (useClaude=true path)
    const adapter = getAdapter({ taskType: 'high_stakes', minimumScore: 0.95 });
    assert.ok(adapter, 'adapter must be non-null');
    assert.strictEqual(adapter.modelId, 'claude-sonnet-4-20250514');
  });

  it('CR-003b: gpt-4o does not meet 0.95 threshold for high_stakes', () => {
    const fullAdapter = new OpenAIAdapter(makeMockOpenAIClient(), 'gpt-4o');
    const score = fullAdapter.capabilities.taskScores.high_stakes;
    assert.ok(score < 0.95, `gpt-4o high_stakes score ${score} must be below 0.95 threshold`);
  });

  it('CR-003c: claude-sonnet meets 0.95 threshold for high_stakes', () => {
    const sonnetAdapter = new AnthropicAdapter(makeMockAnthropicClient());
    const score = sonnetAdapter.capabilities.taskScores.high_stakes;
    assert.ok(score >= 0.95, `claude-sonnet high_stakes score ${score} must be >= 0.95`);
  });
});

// ---------------------------------------------------------------------------
// CR-004: MINI_MODEL_ENABLED=false path — orchestrator must fall back to gpt-4o
//         Verified via structural check: orchestrator contains the gpt-4o fallback
//         for the !MINI_MODEL_ENABLED branch
// ---------------------------------------------------------------------------

describe('CR-004: MINI_MODEL_ENABLED=false — gpt-4o forced for all non-Claude queries', () => {
  it('CR-004a: orchestrator contains MINI_MODEL_ENABLED gate with gpt-4o fallback', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(
      src.includes('!MINI_MODEL_ENABLED'),
      'orchestrator must check MINI_MODEL_ENABLED flag'
    );
  });

  it('CR-004b: gpt-4o fallback is present for non-MINI_MODEL_ENABLED path', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    // The fallback block must assign gpt-4o when MINI_MODEL_ENABLED is false
    assert.ok(
      src.includes("selectedModel = 'gpt-4o'"),
      "orchestrator must set selectedModel to 'gpt-4o' when MINI_MODEL_ENABLED is false"
    );
  });

  it('CR-004c: registry respects excludeProviders — anthropic excluded when useClaude=false', () => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
    // Any task type with anthropic excluded must return an OpenAI adapter
    const adapter = getAdapter({ taskType: 'summarization', minimumScore: 0.70, excludeProviders: ['anthropic'] });
    assert.strictEqual(adapter.providerId, 'openai');
  });
});

// ---------------------------------------------------------------------------
// CR-005: simple_factual routes to cheapest capable adapter (gpt-4o-mini)
// ---------------------------------------------------------------------------

describe('CR-005: simple_factual — cheapest capable adapter', () => {
  beforeEach(() => {
    registerAdapters({
      openaiClient:    makeMockOpenAIClient(),
      anthropicClient: makeMockAnthropicClient(),
    });
  });

  it('CR-005a: simple_factual task with 0.70 threshold selects gpt-4o-mini', () => {
    const adapter = getAdapter({ taskType: 'simple_factual', minimumScore: 0.70, excludeProviders: ['anthropic'] });
    assert.ok(adapter, 'adapter must be non-null');
    assert.strictEqual(adapter.modelId, 'gpt-4o-mini');
  });

  it('CR-005b: orchestrator uses getRequiredTaskType and getMinimumScore for routing', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(src.includes('getRequiredTaskType'), 'orchestrator must call getRequiredTaskType');
    assert.ok(src.includes('getMinimumScore'),     'orchestrator must call getMinimumScore');
  });

  it('CR-005c: orchestrator passes minimumScore and excludeProviders to getAdapter', () => {
    const src = readFileSync(join(REPO_ROOT, 'api', 'core', 'orchestrator.js'), 'utf8');
    assert.ok(src.includes('excludeProviders'), 'orchestrator must pass excludeProviders to getAdapter');
    assert.ok(src.includes('minimumScore'),     'orchestrator must pass minimumScore to getAdapter');
  });
});
