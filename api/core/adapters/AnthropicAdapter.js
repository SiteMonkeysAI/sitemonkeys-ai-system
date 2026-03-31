// AnthropicAdapter — wraps the Anthropic SDK messages API
// Claude receives the system prompt as a top-level parameter,
// not inside the messages array. This adapter handles that asymmetry.

import { BaseAdapter } from './BaseAdapter.js';

export class AnthropicAdapter extends BaseAdapter {
  constructor(anthropicClient) {
    super({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      capabilities: {
        maxContextTokens: 200000,
        taskScores: {
          simple_factual:    0.95,
          complex_reasoning: 0.98,
          creative:          0.97,
          summarization:     0.97,
          high_stakes:       0.98,
        },
      },
      costPer1kTokens: {
        input:  0.003,
        output: 0.015,
      },
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
