// GrokAdapter — wraps the xAI Grok API using OpenAI-compatible format.
// Grok 4 Fast has real-time X/Twitter data and a 2M token context window.
// The xAI API is OpenAI-compatible — same message format, different endpoint.
// Accepts an OpenAI-SDK client pre-configured with the xAI base URL and API key.

import { BaseAdapter } from './BaseAdapter.js';

/** xAI API endpoint — OpenAI-compatible */
export const GROK_BASE_URL = 'https://api.x.ai/v1';

export class GrokAdapter extends BaseAdapter {
  constructor(openaiCompatibleClient, modelId = 'grok-4-fast') {
    const isHighCapability = modelId === 'grok-4';
    super({
      providerId: 'xai',
      modelId,
      capabilities: {
        maxContextTokens: 2000000,
        supportsRealTimeData: true,
        contextWindow: 2000000,
        provider: 'xai',
        taskScores: {
          simple_factual:      isHighCapability ? 0.98 : 0.95,
          complex_reasoning:   isHighCapability ? 0.95 : 0.80,
          creative:            isHighCapability ? 0.92 : 0.82,
          summarization:       isHighCapability ? 0.95 : 0.92,
          high_stakes:         isHighCapability ? 0.90 : 0.70,
          news_current_events: 0.99, // Real-time data is Grok's primary advantage
        },
      },
      costPer1kTokens: isHighCapability
        ? { input: 0.003,   output: 0.015  }   // grok-4: $3.00/$15.00 per million
        : { input: 0.0002,  output: 0.0005 },   // grok-4-fast: $0.20/$0.50 per million
    });

    this.client = openaiCompatibleClient;
  }

  /** @returns {boolean} true when GROK_API_KEY is configured */
  static active() {
    return !!process.env.GROK_API_KEY;
  }

  getCapabilities() {
    return {
      ...this.capabilities,
      supportsRealTimeData: true,
      contextWindow: 2000000,
      provider: 'xai',
    };
  }

  normalizeRequest(request) {
    // xAI uses the same OpenAI message format — identical to OpenAIAdapter
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
        const retryAfter = (parseInt(err.headers?.['retry-after'] || '5', 10) || 5) * 1000;
        console.log(`[RETRY] Grok backoff ${retryAfter}ms before retry attempt 1`);
        await new Promise(r => setTimeout(r, retryAfter));
        response = await this.client.chat.completions.create(providerRequest);
      } else {
        throw err;
      }
    }

    // Log cache hits if xAI returns usage details (automatic caching on xAI)
    const details = response.usage?.prompt_tokens_details;
    if (details?.cached_tokens) {
      const cachedTokens   = details.cached_tokens;
      const uncachedTokens = (response.usage.prompt_tokens ?? 0) - cachedTokens;
      const hitRate        = ((cachedTokens / (cachedTokens + uncachedTokens)) * 100).toFixed(1);
      console.log(`[CACHE] Grok prompt cache hit: cached=${cachedTokens} uncached=${uncachedTokens} hit_rate=${hitRate}%`);
    }

    return this.normalizeResponse(response, Date.now() - start);
  }
}
