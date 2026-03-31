// BaseAdapter — contract every provider adapter must implement
//
// Standard request format (input):
//   systemPrompt: string
//   messages: [{role, content}]
//   maxTokens: number
//   temperature: number
//   queryClassification: string
//   truthType: string
//
// Standard response format (output):
//   content: string
//   usage: { inputTokens, outputTokens, totalTokens }
//   cost: number
//   model: string
//   provider: string
//   latencyMs: number

export class BaseAdapter {
  constructor(config) {
    this.providerId = config.providerId;
    this.modelId = config.modelId;
    this.capabilities = config.capabilities;
    this.costPer1kTokens = config.costPer1kTokens;
  }

  // Must implement — send request to provider and return normalized response
  async call(_request) {
    throw new Error('call() must be implemented');
  }

  // Normalize internal request format to provider-specific format
  normalizeRequest(_request) {
    throw new Error('normalizeRequest() must be implemented');
  }

  // Normalize provider response to standard internal format
  normalizeResponse(_response, _latencyMs) {
    throw new Error('normalizeResponse() must be implemented');
  }

  // Calculate cost for this call
  calculateCost(inputTokens, outputTokens) {
    return (
      (inputTokens * this.costPer1kTokens.input) / 1000 +
      (outputTokens * this.costPer1kTokens.output) / 1000
    );
  }
}
