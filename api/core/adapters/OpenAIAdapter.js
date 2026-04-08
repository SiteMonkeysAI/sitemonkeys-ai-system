// OpenAIAdapter — wraps the OpenAI SDK chat.completions API
// Handles gpt-4o and gpt-4o-mini model variants.

import { BaseAdapter } from './BaseAdapter.js';

export class OpenAIAdapter extends BaseAdapter {
  constructor(openaiClient, modelId) {
    super({
      providerId: 'openai',
      modelId: modelId,
      capabilities: {
        maxContextTokens: 128000,
        taskScores: {
          simple_factual:    modelId.includes('mini') ? 0.95 : 0.98,
          complex_reasoning: modelId.includes('mini') ? 0.75 : 0.95,
          creative:          modelId.includes('mini') ? 0.80 : 0.92,
          summarization:     modelId.includes('mini') ? 0.90 : 0.95,
          high_stakes:       modelId.includes('mini') ? 0.60 : 0.90,
        },
      },
      costPer1kTokens: modelId.includes('mini')
        ? { input: 0.00015, output: 0.0006 }
        : { input: 0.005,   output: 0.015  },
    });
    this.client = openaiClient;
  }

  normalizeRequest(request) {
    // Prepend system message only when a system prompt is provided.
    const systemMessages = request.systemPrompt
      ? [{ role: 'system', content: request.systemPrompt }]
      : [];
    return {
      model: this.modelId,
      messages: [
        ...systemMessages,
        ...request.messages,
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.7,
    };
  }

  normalizeResponse(response, latencyMs) {
    const usage = response.usage;
    const inputTokens  = usage.prompt_tokens;
    const outputTokens = usage.completion_tokens;
    return {
      content: response.choices[0].message.content,
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
    let response;
    try {
      response = await this.client.chat.completions.create(providerRequest);
    } catch (err) {
      if (err.status === 429) {
        const retryAfter = parseInt(err.headers?.['retry-after'] || '5') * 1000;
        console.log(`[RETRY] Backoff ${retryAfter}ms before retry attempt 1`);
        await new Promise(r => setTimeout(r, retryAfter));
        response = await this.client.chat.completions.create(providerRequest);
      } else {
        throw err;
      }
    }
    const details = response.usage?.prompt_tokens_details;
    if (details?.cached_tokens) {
      const cachedTokens   = details.cached_tokens;
      const uncachedTokens = (response.usage.prompt_tokens ?? 0) - cachedTokens;
      const hitRate        = ((cachedTokens / (cachedTokens + uncachedTokens)) * 100).toFixed(1);
      console.log(`[CACHE] OpenAI prompt cache hit: cached=${cachedTokens} uncached=${uncachedTokens} hit_rate=${hitRate}%`);
    }
    return this.normalizeResponse(response, Date.now() - start);
  }
}
