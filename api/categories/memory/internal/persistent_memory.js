// ================================================================
// persistent_memory.js - Main Orchestrator & Global Interface
// Primary entry point and orchestration hub for Site Monkeys Memory System
// ================================================================

import coreSystem from "./core.js";
import intelligenceSystem from "./intelligence.js";

class PersistentMemoryOrchestrator {
  constructor() {
    this.coreSystem = coreSystem;
    this.intelligenceSystem = intelligenceSystem;

    // System state management
    this.isInitialized = false;
    this.initPromise = null;
    this.initStarted = false;
    this.isHealthy = false;

    // Fallback memory for complete system failure
    this.fallbackMemory = new Map();
    this.lastHealthCheck = null;

    // Performance monitoring
    this.performanceStats = {
      totalRequests: 0,
      avgResponseTime: 0,
      successRate: 0,
      errorCount: 0,
      fallbackUsage: 0,
      lastReset: Date.now(),
    };

    this.logger = {
      log: (message) =>
        console.log(
          `[PERSISTENT_MEMORY] ${new Date().toISOString()} ${message}`,
        ),
      error: (message, error) =>
        console.error(
          `[PERSISTENT_MEMORY ERROR] ${new Date().toISOString()} ${message}`,
          error,
        ),
      warn: (message) =>
        console.warn(
          `[PERSISTENT_MEMORY WARN] ${new Date().toISOString()} ${message}`,
        ),
    };

    // Set up global interface immediately for compatibility
    // this.setupGlobalInterface();
  }

  // ... rest of the file unchanged ...

  // Example: if you see these in the file, comment them as follows:
  // await this.performComprehensiveHealthCheck();
  // if (!persistentMemory.isReady()) { ... }
}

// Export instance, not class - ready for immediate use
const persistentMemory = new PersistentMemoryOrchestrator();

export default persistentMemory;
