// api/lib/complete-intelligence-system.js
// INTEGRATION FILE - Coordinates all intelligence components

import { ValidationEngine } from "./validation-engine.js";
import { MultimodalGateway } from "./multimodal-gateway.js";
import { LearningEngine } from "./learning-engine.js";
import { AdaptationEngine } from "./adaptation-engine.js";
import { StreamProcessor } from "./stream-processor.js";

// Simple integration class that coordinates everything
class CompleteIntelligenceSystem {
  constructor() {
    this.validation = new ValidationEngine();
    this.multimodal = new MultimodalGateway();
    this.learning = new LearningEngine();
    this.adaptation = new AdaptationEngine();
    this.streams = new StreamProcessor();
    this.initialized = false;
  }

  async initialize() {
    await this.validation.initialize();
    await this.multimodal.initialize();
    await this.learning.initialize();
    await this.adaptation.initialize();
    await this.streams.initialize();
    this.initialized = true;
    return true;
  }

  getSystemStatus() {
    return {
      validation: this.validation.initialized,
      multimodal: this.multimodal.initialized,
      learning: this.learning.initialized,
      adaptation: this.adaptation.initialized,
      streams: this.streams.initialized,
      system_ready: this.initialized,
    };
  }
}

export {
  CompleteIntelligenceSystem,
  ValidationEngine,
  MultimodalGateway,
  LearningEngine,
  AdaptationEngine,
  StreamProcessor,
};
