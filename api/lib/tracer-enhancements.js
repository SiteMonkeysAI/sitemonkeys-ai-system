// ================================================================
// REQUEST TRACER ENHANCEMENTS
// Adds: File logging, Sampling, Session tracking, Orchestrator hooks
// Add these to the existing request-flow-tracer.js
// ================================================================

import fs from "fs";
import path from "path";

// ================================================================
// ENHANCEMENT 1: FILE LOGGING IMPLEMENTATION
// ================================================================

class FileLogger {
  constructor() {
    this.enabled = process.env.TRACE_LOG_FILE === "true";
    this.logDir = process.env.TRACE_LOG_DIR || "./logs/traces";
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.currentFile = null;
    this.currentFileSize = 0;

    if (this.enabled) {
      this.initializeLogDirectory();
    }
  }

  initializeLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      console.log(`[FILE LOGGER] Initialized at ${this.logDir}`);
    } catch (error) {
      console.error("[FILE LOGGER] Failed to initialize:", error);
      this.enabled = false;
    }
  }

  log(traceData) {
    if (!this.enabled) return;

    try {
      // Create new log file if needed
      if (!this.currentFile || this.currentFileSize >= this.maxFileSize) {
        this.rotateLogFile();
      }

      // Write trace data as JSONL (one JSON object per line)
      const logLine =
        JSON.stringify({
          timestamp: new Date().toISOString(),
          ...traceData,
        }) + "\n";

      fs.appendFileSync(this.currentFile, logLine);
      this.currentFileSize += logLine.length;
    } catch (error) {
      console.error("[FILE LOGGER] Write error:", error);
    }
  }

  rotateLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.currentFile = path.join(this.logDir, `trace-${timestamp}.jsonl`);
    this.currentFileSize = 0;
    console.log(`[FILE LOGGER] Rotated to new file: ${this.currentFile}`);
  }

  // Query logs for analysis
  queryLogs(filter = {}) {
    if (!this.enabled) return [];

    try {
      const logFiles = fs
        .readdirSync(this.logDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(this.logDir, f));

      const traces = [];

      for (const file of logFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          try {
            const trace = JSON.parse(line);

            // Apply filters
            if (
              filter.startTime &&
              new Date(trace.timestamp) < filter.startTime
            )
              continue;
            if (filter.endTime && new Date(trace.timestamp) > filter.endTime)
              continue;
            if (filter.hasWarnings && (!trace.warnings || trace.warnings === 0))
              continue;
            if (filter.hasErrors && (!trace.errors || trace.errors === 0))
              continue;
            if (filter.sessionId && trace.sessionId !== filter.sessionId)
              continue;

            traces.push(trace);
          } catch (e) {
            // Skip malformed lines
          }
        }
      }

      return traces;
    } catch (error) {
      console.error("[FILE LOGGER] Query error:", error);
      return [];
    }
  }
}

// ================================================================
// ENHANCEMENT 2: TRACE SAMPLING
// ================================================================

class TraceSampler {
  constructor() {
    // Sampling configuration from ENV
    this.samplingEnabled = process.env.TRACE_SAMPLING_ENABLED === "true";
    this.samplingRate = parseFloat(process.env.TRACE_SAMPLING_RATE || "1.0"); // 1.0 = 100%, 0.1 = 10%
    this.alwaysTraceConditions = this.parseAlwaysTraceConditions();

    console.log(
      `[TRACE SAMPLER] Enabled: ${this.samplingEnabled}, Rate: ${this.samplingRate * 100}%`,
    );
  }

  parseAlwaysTraceConditions() {
    // Parse ENV for conditions that should always be traced
    const conditions = process.env.TRACE_ALWAYS_IF || "";
    return {
      hasDocument: conditions.includes("document"),
      hasError: conditions.includes("error"),
      hasWarning: conditions.includes("warning"),
      specificModes: conditions.includes("site_monkeys")
        ? ["site_monkeys"]
        : [],
      specificUsers: process.env.TRACE_ALWAYS_USERS?.split(",") || [],
    };
  }

  shouldTrace(req) {
    // Always trace if sampling disabled
    if (!this.samplingEnabled) return true;

    // Check always-trace conditions
    if (this.shouldAlwaysTrace(req)) {
      console.log("[TRACE SAMPLER] Always-trace condition met");
      return true;
    }

    // Apply sampling rate
    const shouldSample = Math.random() < this.samplingRate;

    if (!shouldSample) {
      console.log(
        `[TRACE SAMPLER] Request skipped (sampling: ${this.samplingRate * 100}%)`,
      );
    }

    return shouldSample;
  }

  shouldAlwaysTrace(req) {
    const body = req.body || {};

    // Always trace if document uploaded
    if (this.alwaysTraceConditions.hasDocument && body.document_context) {
      return true;
    }

    // Always trace specific modes
    if (this.alwaysTraceConditions.specificModes.includes(body.mode)) {
      return true;
    }

    // Always trace specific users
    if (this.alwaysTraceConditions.specificUsers.includes(body.user_id)) {
      return true;
    }

    return false;
  }

  getStats() {
    return {
      enabled: this.samplingEnabled,
      rate: this.samplingRate,
      alwaysTraceConditions: this.alwaysTraceConditions,
    };
  }
}

// ================================================================
// ENHANCEMENT 3: SESSION CORRELATION
// ================================================================

class SessionTracker {
  constructor() {
    this.sessions = new Map();
    this.maxSessionAge = 60 * 60 * 1000; // 1 hour
    this.cleanupInterval = 5 * 60 * 1000; // Clean every 5 minutes

    // Start cleanup routine
    setInterval(() => this.cleanupOldSessions(), this.cleanupInterval);
  }

  getOrCreateSession(req) {
    // Try to get session ID from multiple sources
    let sessionId =
      req.headers["x-session-id"] ||
      req.body?.session_id ||
      req.body?.user_id || // Fallback to user_id
      "anonymous";

    // Create conversation ID (ties multiple requests together)
    const conversationId =
      req.body?.conversation_id ||
      `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Track session
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        requestCount: 0,
        conversations: new Map(),
      });
    }

    const session = this.sessions.get(sessionId);
    session.lastSeen = Date.now();
    session.requestCount++;

    // Track conversation within session
    if (!session.conversations.has(conversationId)) {
      session.conversations.set(conversationId, {
        conversationId,
        startTime: Date.now(),
        requestCount: 0,
        traces: [],
      });
    }

    const conversation = session.conversations.get(conversationId);
    conversation.requestCount++;

    return {
      sessionId,
      conversationId,
      requestNumber: conversation.requestCount,
      sessionRequestNumber: session.requestCount,
    };
  }

  addTraceToSession(sessionId, conversationId, traceId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const conversation = session.conversations.get(conversationId);
    if (!conversation) return;

    conversation.traces.push({
      traceId,
      timestamp: Date.now(),
    });
  }

  getSessionHistory(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getConversationHistory(sessionId, conversationId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return session.conversations.get(conversationId) || null;
  }

  cleanupOldSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeen > this.maxSessionAge) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SESSION TRACKER] Cleaned ${cleaned} old sessions`);
    }
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      totalConversations: Array.from(this.sessions.values()).reduce(
        (sum, s) => sum + s.conversations.size,
        0,
      ),
    };
  }
}

// ================================================================
// ENHANCEMENT 4: MASTER ORCHESTRATOR INTEGRATION
// ================================================================

export class OrchestratorTracer {
  constructor(tracer, traceId) {
    this.tracer = tracer;
    this.traceId = traceId;
    this.enabled = !!tracer && !!traceId;
  }

  // Hook into orchestrator phases
  tracePhase(phaseName, data) {
    if (!this.enabled) return;

    this.tracer.logStage(this.traceId, `ORCHESTRATOR_${phaseName}`, {
      phase: phaseName,
      ...data,
    });
  }

  // Specific orchestrator tracking methods
  traceContextPreparation(context) {
    this.tracePhase("CONTEXT_PREP", {
      hasVault: !!context.vaultContent,
      hasMemory: !!context.memoryContext,
      hasDocument: !!context.document_context,
      mode: context.mode,
      vaultConflictsResolved:
        context.safeguardsApplied?.vaultConflictResolved || false,
    });
  }

  traceIntelligenceProcessing(result) {
    this.tracePhase("INTELLIGENCE", {
      source: result.source,
      intelligenceEnhanced: result.intelligenceEnhanced,
      confidence: result.confidence,
      enginesActivated: result.enginesActivated,
    });
  }

  traceValidation(validationResult) {
    this.tracePhase("VALIDATION", {
      passed: validationResult.passed,
      checks: validationResult.checks,
      warnings: validationResult.warnings,
    });
  }

  traceDocumentProcessing(documentAnalysis) {
    this.tracePhase("DOCUMENT_PROCESSING", {
      multipleDocuments: documentAnalysis.multipleDocuments,
      totalDocuments: documentAnalysis.processedDocuments?.length || 0,
      anyLimited: documentAnalysis.anyLimited,
      totalTokens: documentAnalysis.totalTokens,
    });
  }

  traceAdaptiveCostOptimization(optimization) {
    this.tracePhase("COST_OPTIMIZATION", {
      strategy: optimization.strategy,
      costSavings: optimization.savings,
      qualityMaintained: optimization.qualityMaintained,
    });
  }

  traceError(error, phase) {
    if (!this.enabled) return;

    const trace = this.tracer.activeTraces.get(this.traceId);
    if (trace) {
      trace.errors.push({
        phase: `ORCHESTRATOR_${phase}`,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// ================================================================
// ENHANCED TRACER CLASS (extends original)
// ================================================================

export class EnhancedRequestFlowTracer {
  constructor(originalTracer) {
    this.tracer = originalTracer;
    this.fileLogger = new FileLogger();
    this.sampler = new TraceSampler();
    this.sessionTracker = new SessionTracker();
  }

  // Override startTrace to add enhancements
  startTrace(req) {
    // Check sampling
    if (!this.sampler.shouldTrace(req)) {
      return null; // Skip this trace
    }

    // Get session info
    const sessionInfo = this.sessionTracker.getOrCreateSession(req);

    // Start original trace
    const traceId = this.tracer.startTrace(req);
    if (!traceId) return null;

    // Enhance trace with session info
    const trace = this.tracer.activeTraces.get(traceId);
    if (trace) {
      trace.sessionId = sessionInfo.sessionId;
      trace.conversationId = sessionInfo.conversationId;
      trace.requestNumber = sessionInfo.requestNumber;
      trace.sessionRequestNumber = sessionInfo.sessionRequestNumber;

      // Add to session tracking
      this.sessionTracker.addTraceToSession(
        sessionInfo.sessionId,
        sessionInfo.conversationId,
        traceId,
      );
    }

    return traceId;
  }

  // Override completeTrace to add file logging
  completeTrace(traceId, responseData = {}) {
    const result = this.tracer.completeTrace(traceId, responseData);

    if (result && this.fileLogger.enabled) {
      // Log to file
      this.fileLogger.log({
        ...result.summary,
        sessionId: result.sessionId,
        conversationId: result.conversationId,
        fullTrace: result.fullTrace,
      });
    }

    return result;
  }

  // Create orchestrator tracer for integration
  createOrchestratorTracer(traceId) {
    return new OrchestratorTracer(this.tracer, traceId);
  }

  // Query capabilities
  queryTraces(filter) {
    return this.fileLogger.queryLogs(filter);
  }

  getSessionHistory(sessionId) {
    return this.sessionTracker.getSessionHistory(sessionId);
  }

  getConversationTraces(sessionId, conversationId) {
    const conversation = this.sessionTracker.getConversationHistory(
      sessionId,
      conversationId,
    );
    if (!conversation) return [];

    return conversation.traces.map((t) => t.traceId);
  }

  // Enhanced statistics
  getEnhancedStats() {
    return {
      ...this.tracer.getStatistics(),
      sampling: this.sampler.getStats(),
      sessions: this.sessionTracker.getStats(),
      fileLogging: {
        enabled: this.fileLogger.enabled,
        logDir: this.fileLogger.logDir,
      },
    };
  }
}

// ================================================================
// INTEGRATION HELPER FOR MASTER ORCHESTRATOR
// ================================================================

export function wrapMasterOrchestrator(masterOrchestrator, enhancedTracer) {
  const originalProcess =
    masterOrchestrator.processWithUnifiedIntelligence.bind(masterOrchestrator);

  masterOrchestrator.processWithUnifiedIntelligence = async function (context) {
    // Get tracer from request context
    const traceId = context.traceId || context.req?.traceId;
    const orchestratorTracer = traceId
      ? enhancedTracer.createOrchestratorTracer(traceId)
      : null;

    // Add tracer to context
    context.orchestratorTracer = orchestratorTracer;

    try {
      // Call original with tracing
      if (orchestratorTracer) {
        orchestratorTracer.tracePhase("START", {
          mode: context.mode,
          hasVault: !!context.vaultContent,
          hasMemory: !!context.memoryContext,
          hasDocument: !!context.document_context,
        });
      }

      const result = await originalProcess(context);

      if (orchestratorTracer) {
        orchestratorTracer.tracePhase("COMPLETE", {
          success: true,
          source: result.source,
          confidence: result.confidence,
        });
      }

      return result;
    } catch (error) {
      if (orchestratorTracer) {
        orchestratorTracer.traceError(error, "PROCESSING");
      }
      throw error;
    }
  };

  console.log("[TRACER] Master orchestrator wrapped with enhanced tracing");
}

// ================================================================
// EXPORT
// ================================================================

export { FileLogger, TraceSampler, SessionTracker };
