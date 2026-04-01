// AnthropicAdapter — wraps the Anthropic SDK messages API
// Claude receives the system prompt as a top-level parameter,
// not inside the messages array. This adapter handles that asymmetry.

import { BaseAdapter } from './BaseAdapter.js';

// Per-model configuration lookup — avoids fragile string pattern matching.
const ANTHROPIC_MODEL_CONFIG = {
  'claude-sonnet-4-20250514': {
    costPer1kTokens: { input: 0.003, output: 0.015 },
    taskScores: {
      simple_factual:    0.95,
      complex_reasoning: 0.98,
      creative:          0.97,
      summarization:     0.97,
      high_stakes:       0.98,
    },
  },
  'claude-haiku-4-5-20251001': {
    costPer1kTokens: { input: 0.0008, output: 0.004 },
    taskScores: {
      simple_factual:    0.85,
      complex_reasoning: 0.75,
      creative:          0.80,
      summarization:     0.85,
      high_stakes:       0.65,
    },
  },
};

// Fallback for models not yet in the lookup table — use sonnet defaults.
const DEFAULT_MODEL_CONFIG = ANTHROPIC_MODEL_CONFIG['claude-sonnet-4-20250514'];

export class AnthropicAdapter extends BaseAdapter {
  constructor(anthropicClient, modelId = 'claude-sonnet-4-20250514') {
    const modelConfig = ANTHROPIC_MODEL_CONFIG[modelId] ?? DEFAULT_MODEL_CONFIG;
    super({
      providerId: 'anthropic',
      modelId,
      capabilities: {
        maxContextTokens: 200000,
        taskScores: modelConfig.taskScores,
      },
      costPer1kTokens: modelConfig.costPer1kTokens,
    });
    this.client = anthropicClient;
  }

  normalizeRequest(request) {
    // Claude takes system as a separate top-level parameter, not in messages.
    // Omit the system key entirely when no system prompt is provided.
    const providerRequest = {
      model:      this.modelId,
      messages:   request.messages,
      max_tokens: request.maxTokens ?? 4000,
    };
    if (request.systemPrompt) {
      providerRequest.system = request.systemPrompt;
    }
    return providerRequest;
  }

  normalizeResponse(response, latencyMs) {
    const usage = response.usage;
    const inputTokens  = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    return {
      content: response.content[0].text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost:     this.calculateCost(inputTokens, outputTokens),
      model:    this.modelId,
      provider: this.providerId,
      latencyMs,
    };
  }

  async call(request) {
    const start = Date.now();
    const providerRequest = this.normalizeRequest(request);
    const response = await this.client.messages.create(providerRequest);
    return this.normalizeResponse(response, Date.now() - start);
  }
}
