// ================================================================
// REQUEST FLOW TRACER - PRODUCTION OBSERVABILITY SYSTEM
// Enterprise-grade request lifecycle tracking with zero degradation
// ENV-controlled, JSON-structured, truth-first reporting
// ================================================================

import { performance } from 'perf_hooks';

class RequestFlowTracer {
  constructor() {
    // ENV-driven configuration (follows validator pattern)
    this.enabled = process.env.TRACE_ENABLED === 'true';
    this.verboseMode = process.env.TRACE_VERBOSE === 'true';
    this.logToFile = process.env.TRACE_LOG_FILE === 'true';
    this.alertOnDataLoss = process.env.TRACE_ALERT_DATA_LOSS === 'true';
    
    // Execution tracking
    this.activeTraces = new Map();
    this.traceIdCounter = 0;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulTraces: 0,
      failedTraces: 0,
      dataLossDetected: 0,
      avgExecutionTime: 0,
      moduleExecutionCounts: new Map()
    };
    
    // Critical modules to track (from your architecture)
    this.criticalModules = [
      'modeLinter',
      'productValidation',
      'politicalGuardrails',
      'personalities',
      'optimization',
      'vault',
      'memory-intelligence-bridge',
      'master-intelligence-orchestrator',
      'site-monkeys-enforcement',
      'survival-guardian',
      'quantitative-enforcer',
      'expert-validator',
      'protective-intelligence'
    ];
    
    // Data fields to monitor
    this.monitoredFields = [
      'document_context',
      'vault_content',
      'memoryContext',
      'message',
      'conversation_history',
      'mode'
    ];
    
    console.log(`[TRACER] Initialized - Enabled: ${this.enabled}, Verbose: ${this.verboseMode}`);
  }

  // ================================================================
  // REQUEST ENTRY POINT - Start tracing
  // ================================================================
  
  startTrace(req) {
    if (!this.enabled) return null;
    
    try {
      const traceId = `trace_${++this.traceIdCounter}_${Date.now()}`;
      this.stats.totalRequests++;
      
      const trace = {
        traceId,
        startTime: performance.now(),
        timestamp: new Date().toISOString(),
        request: {
          method: req.method,
          path: req.path,
          body: this.sanitizeRequestBody(req.body)
        },
        stages: [],
        dataFlow: {
          initial: this.captureDataSnapshot(req.body),
          checkpoints: []
        },
        modules: [],
        warnings: [],
        errors: [],
        status: 'active'
      };
      
      this.activeTraces.set(traceId, trace);
      
      this.log('info', `🎯 TRACE START: ${traceId}`, {
        traceId,
        method: req.method,
        path: req.path,
        fields: Object.keys(req.body || {})
      });
      
      return traceId;
      
    } catch (error) {
      console.error('[TRACER ERROR] Failed to start trace:', error);
      return null; // Non-degradation: continue without tracing
    }
  }

  // ================================================================
  // STAGE TRACKING - Track processing stages
  // ================================================================
  
  logStage(traceId, stageName, data = {}) {
    if (!this.enabled || !traceId) return;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return;
      
      const stage = {
        name: stageName,
        timestamp: new Date().toISOString(),
        duration: performance.now() - trace.startTime,
        data: this.sanitizeData(data),
        dataSnapshot: this.captureDataSnapshot(data)
      };
      
      trace.stages.push(stage);
      
      // Check for data loss
      this.checkDataIntegrity(traceId, stage.dataSnapshot);
      
      this.log('stage', `📍 STAGE: ${stageName}`, {
        traceId,
        stageName,
        duration: `${stage.duration.toFixed(2)}ms`,
        dataPresent: Object.keys(stage.dataSnapshot).filter(k => stage.dataSnapshot[k].present)
      });
      
    } catch (error) {
      this.handleTracerError(traceId, 'logStage', error);
    }
  }

  // ================================================================
  // MODULE EXECUTION TRACKING
  // ================================================================
  
  wrapModule(traceId, moduleName, moduleFunction) {
    if (!this.enabled || !traceId) {
      return moduleFunction; // Return unwrapped if tracing disabled
    }
    
    return async (...args) => {
      const moduleStart = performance.now();
      
      try {
        const trace = this.activeTraces.get(traceId);
        if (!trace) return await moduleFunction(...args);
        
        // Log module entry
        const moduleExecution = {
          name: moduleName,
          startTime: performance.now(),
          input: this.sanitizeData(args[0]),
          inputDataSnapshot: this.captureDataSnapshot(args[0]),
          status: 'executing'
        };
        
        this.log('module', `🔧 MODULE START: ${moduleName}`, {
          traceId,
          moduleName,
          inputFields: Object.keys(moduleExecution.inputDataSnapshot)
        });
        
        // Execute module
        const result = await moduleFunction(...args);
        
        // Log module exit
        moduleExecution.endTime = performance.now();
        moduleExecution.duration = moduleExecution.endTime - moduleExecution.startTime;
        moduleExecution.output = this.sanitizeData(result);
        moduleExecution.outputDataSnapshot = this.captureDataSnapshot(result);
        moduleExecution.status = 'completed';
        
        trace.modules.push(moduleExecution);
        
        // Track statistics
        const count = this.stats.moduleExecutionCounts.get(moduleName) || 0;
        this.stats.moduleExecutionCounts.set(moduleName, count + 1);
        
        // Check for data loss in module
        this.checkModuleDataIntegrity(traceId, moduleName, moduleExecution);
        
        this.log('module', `✅ MODULE COMPLETE: ${moduleName}`, {
          traceId,
          moduleName,
          duration: `${moduleExecution.duration.toFixed(2)}ms`,
          dataTransformation: this.compareSnapshots(
            moduleExecution.inputDataSnapshot, 
            moduleExecution.outputDataSnapshot
          )
        });
        
        return result;
        
      } catch (error) {
        const trace = this.activeTraces.get(traceId);
        if (trace) {
          trace.modules.push({
            name: moduleName,
            status: 'failed',
            error: error.message,
            duration: performance.now() - moduleStart
          });
        }
        
        this.log('error', `❌ MODULE FAILED: ${moduleName}`, {
          traceId,
          moduleName,
          error: error.message
        });
        
        throw error; // Preserve original error
      }
    };
  }

  // ================================================================
  // PROMPT ASSEMBLY INSPECTION
  // ================================================================
  
  inspectPrompt(traceId, promptData) {
    if (!this.enabled || !traceId) return;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return;
      
      const promptInspection = {
        timestamp: new Date().toISOString(),
        totalLength: promptData.prompt ? promptData.prompt.length : 0,
        contentVerification: {
          hasMemory: this.searchInPrompt(promptData.prompt, ['memory', 'remember', 'recalled']),
          hasVault: this.searchInPrompt(promptData.prompt, ['vault', 'site monkeys', 'boost', 'climb']),
          hasDocument: this.searchInPrompt(promptData.prompt, ['document', 'uploaded', 'file']),
          hasEnforcement: this.searchInPrompt(promptData.prompt, ['enforcement', 'validation', 'compliance'])
        },
        sections: this.detectPromptSections(promptData.prompt)
      };
      
      trace.promptInspection = promptInspection;
      
      // Alert on missing expected content
      const initialData = trace.dataFlow.initial;
      if (initialData.document_context?.present && !promptInspection.contentVerification.hasDocument) {
        this.addWarning(traceId, 'MISSING_DOCUMENT', 'Document context present in request but not found in prompt');
      }
      if (initialData.vault_content?.present && !promptInspection.contentVerification.hasVault) {
        this.addWarning(traceId, 'MISSING_VAULT', 'Vault content present in request but not found in prompt');
      }
      if (initialData.memoryContext?.present && !promptInspection.contentVerification.hasMemory) {
        this.addWarning(traceId, 'MISSING_MEMORY', 'Memory context present in request but not found in prompt');
      }
      
      this.log('prompt', `📝 PROMPT INSPECTION`, {
        traceId,
        promptLength: promptInspection.totalLength,
        contentPresent: Object.entries(promptInspection.contentVerification)
          .filter(([_k, v]) => v)
          .map(([k]) => k),
        sections: promptInspection.sections.length,
        warnings: trace.warnings.length
      });
      
    } catch (error) {
      this.handleTracerError(traceId, 'inspectPrompt', error);
    }
  }

  // ================================================================
  // FALLBACK DETECTION
  // ================================================================
  
  detectFallback(traceId, responseData) {
    if (!this.enabled || !traceId) return;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return;
      
      const fallbackIndicators = {
        emergencyFallback: responseData.response?.includes('EMERGENCY_FALLBACK'),
        genericResponse: this.detectGenericResponse(responseData.response),
        enforcementOverride: responseData.enforcement_applied === true,
        reasoningReplaced: responseData.reasoning_override === true
      };
      
      const fallbackDetected = Object.values(fallbackIndicators).some(v => v);
      
      if (fallbackDetected) {
        trace.fallbackDetection = {
          detected: true,
          indicators: fallbackIndicators,
          timestamp: new Date().toISOString()
        };
        
        this.log('warning', `⚠️ FALLBACK DETECTED`, {
          traceId,
          indicators: Object.entries(fallbackIndicators)
            .filter(([_k, v]) => v)
            .map(([k]) => k)
        });
      }
      
    } catch (error) {
      this.handleTracerError(traceId, 'detectFallback', error);
    }
  }

  // ================================================================
  // OUTPUT VERIFICATION
  // ================================================================
  
  verifyOutput(traceId, responseData) {
    if (!this.enabled || !traceId) return;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return;
      
      const outputVerification = {
        hasResponse: !!responseData.response,
        responseLength: responseData.response?.length || 0,
        postProcessing: {
          confidenceAttached: responseData.confidence !== undefined,
          assumptionsAttached: responseData.assumptions !== undefined,
          costTrackingAttached: responseData.usage !== undefined,
          enforcementMetadata: responseData.enforcement_metadata !== undefined
        },
        enforcementModules: this.extractEnforcementModules(responseData),
        validationPassed: responseData.validation_passed !== false
      };
      
      trace.outputVerification = outputVerification;
      
      this.log('output', `✅ OUTPUT VERIFICATION`, {
        traceId,
        responseLength: outputVerification.responseLength,
        postProcessingComplete: Object.values(outputVerification.postProcessing).filter(v => v).length,
        enforcementModulesApplied: outputVerification.enforcementModules.length,
        validationPassed: outputVerification.validationPassed
      });
      
    } catch (error) {
      this.handleTracerError(traceId, 'verifyOutput', error);
    }
  }

  // ================================================================
  // TRACE COMPLETION
  // ================================================================
  
  completeTrace(traceId, responseData = {}) {
    if (!this.enabled || !traceId) return null;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return null;
      
      trace.endTime = performance.now();
      trace.totalDuration = trace.endTime - trace.startTime;
      trace.status = 'completed';
      trace.finalResponse = this.sanitizeData(responseData);
      
      // Final data integrity check
      this.performFinalIntegrityCheck(trace);
      
      // Generate summary
      const summary = this.generateTraceSummary(trace);
      
      // Update statistics
      this.stats.successfulTraces++;
      this.stats.avgExecutionTime = 
        (this.stats.avgExecutionTime * (this.stats.successfulTraces - 1) + trace.totalDuration) / 
        this.stats.successfulTraces;
      
      // Log completion
      this.log('info', `🏁 TRACE COMPLETE: ${traceId}`, summary);
      
      // Clean up
      this.activeTraces.delete(traceId);
      
      return {
        traceId,
        summary,
        fullTrace: this.verboseMode ? trace : undefined
      };
      
    } catch (error) {
      this.handleTracerError(traceId, 'completeTrace', error);
      this.stats.failedTraces++;
      return null;
    }
  }

  // ================================================================
  // DATA INTEGRITY CHECKING
  // ================================================================
  
  checkDataIntegrity(traceId, currentSnapshot) {
    if (!this.alertOnDataLoss) return;
    
    try {
      const trace = this.activeTraces.get(traceId);
      if (!trace) return;
      
      const initialSnapshot = trace.dataFlow.initial;
      
      // Check each monitored field
      for (const field of this.monitoredFields) {
        if (initialSnapshot[field]?.present && !currentSnapshot[field]?.present) {
          this.addWarning(traceId, 'DATA_LOSS', `Field '${field}' disappeared during processing`);
          this.stats.dataLossDetected++;
        }
      }
      
      // Store checkpoint
      trace.dataFlow.checkpoints.push({
        timestamp: new Date().toISOString(),
        snapshot: currentSnapshot
      });
      
    } catch (error) {
      this.handleTracerError(traceId, 'checkDataIntegrity', error);
    }
  }

  checkModuleDataIntegrity(traceId, moduleName, moduleExecution) {
    if (!this.alertOnDataLoss) return;
    
    try {
      const inputSnapshot = moduleExecution.inputDataSnapshot;
      const outputSnapshot = moduleExecution.outputDataSnapshot;
      
      // Check if critical data was lost in this module
      for (const field of this.monitoredFields) {
        if (inputSnapshot[field]?.present && !outputSnapshot[field]?.present) {
          this.addWarning(
            traceId, 
            'MODULE_DATA_LOSS', 
            `Module '${moduleName}' dropped field '${field}'`
          );
        }
      }
      
    } catch (error) {
      this.handleTracerError(traceId, 'checkModuleDataIntegrity', error);
    }
  }

  performFinalIntegrityCheck(trace) {
    const initial = trace.dataFlow.initial;
    const _final = trace.outputVerification;
    
    const integrityReport = {
      dataPreserved: true,
      lostFields: [],
      warnings: trace.warnings.length
    };
    
    // Check if any initially present data is missing from output
    for (const field of this.monitoredFields) {
      if (initial[field]?.present) {
        // Check if field influenced the output somehow
        const influenced = trace.stages.some(stage => 
          stage.dataSnapshot[field]?.present
        );
        
        if (!influenced) {
          integrityReport.dataPreserved = false;
          integrityReport.lostFields.push(field);
        }
      }
    }
    
    trace.integrityReport = integrityReport;
  }

  // ================================================================
  // HELPER METHODS
  // ================================================================
  
  captureDataSnapshot(data) {
    const snapshot = {};
    
    for (const field of this.monitoredFields) {
      snapshot[field] = {
        present: this.isFieldPresent(data, field),
        type: typeof data?.[field],
        length: this.getFieldLength(data?.[field])
      };
    }
    
    return snapshot;
  }

  isFieldPresent(data, field) {
    if (!data) return false;
    const value = data[field];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim().length === 0) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  }

  getFieldLength(value) {
    if (!value) return 0;
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object') return Object.keys(value).length;
    return 0;
  }

  compareSnapshots(snapshot1, snapshot2) {
    const changes = {
      added: [],
      removed: [],
      modified: []
    };
    
    for (const field of this.monitoredFields) {
      const before = snapshot1[field]?.present;
      const after = snapshot2[field]?.present;
      
      if (!before && after) changes.added.push(field);
      if (before && !after) changes.removed.push(field);
      if (before && after && snapshot1[field]?.length !== snapshot2[field]?.length) {
        changes.modified.push(field);
      }
    }
    
    return changes;
  }

  searchInPrompt(prompt, keywords) {
    if (!prompt || typeof prompt !== 'string') return false;
    const lowerPrompt = prompt.toLowerCase();
    return keywords.some(keyword => lowerPrompt.includes(keyword.toLowerCase()));
  }

  detectPromptSections(prompt) {
    if (!prompt) return [];
    
    const sections = [];
    const sectionMarkers = [
      'MASTER SYSTEM PROMPT',
      'MEMORY CONTEXT',
      'VAULT CONTENT',
      'DOCUMENT CONTEXT',
      'ENFORCEMENT',
      'USER MESSAGE'
    ];
    
    for (const marker of sectionMarkers) {
      if (prompt.includes(marker)) {
        sections.push(marker);
      }
    }
    
    return sections;
  }

  detectGenericResponse(response) {
    if (!response) return false;
    
    const genericPatterns = [
      /I apologize/i,
      /I cannot/i,
      /I don't have access/i,
      /error occurred/i,
      /something went wrong/i
    ];
    
    return genericPatterns.some(pattern => pattern.test(response));
  }

  extractEnforcementModules(responseData) {
    const modules = [];
    
    if (responseData.enforcement_metadata) {
      const metadata = responseData.enforcement_metadata;
      if (metadata.political_checked) modules.push('political_neutrality');
      if (metadata.product_validated) modules.push('product_validation');
      if (metadata.mode_enforced) modules.push('mode_compliance');
      if (metadata.vault_enforced) modules.push('vault_enforcement');
    }
    
    return modules;
  }

  sanitizeRequestBody(body) {
    if (!body) return {};
    
    return {
      message: body.message?.substring(0, 100) + '...',
      mode: body.mode,
      hasDocumentContext: !!body.document_context,
      hasVaultContent: !!body.vault_content,
      hasMemoryContext: !!body.memoryContext,
      conversationHistoryLength: body.conversation_history?.length || 0
    };
  }

  sanitizeData(data) {
    if (!data) return null;
    if (typeof data === 'string') return data.substring(0, 200) + '...';
    if (Array.isArray(data)) return `Array(${data.length})`;
    if (typeof data === 'object') return Object.keys(data);
    return data;
  }

  addWarning(traceId, type, message) {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;
    
    trace.warnings.push({
      type,
      message,
      timestamp: new Date().toISOString()
    });
    
    if (this.alertOnDataLoss) {
      console.warn(`[TRACER WARNING] ${type}: ${message}`);
    }
  }

  generateTraceSummary(trace) {
    return {
      traceId: trace.traceId,
      duration: `${trace.totalDuration.toFixed(2)}ms`,
      stages: trace.stages.length,
      modulesExecuted: trace.modules.length,
      warnings: trace.warnings.length,
      errors: trace.errors.length,
      dataIntegrity: trace.integrityReport?.dataPreserved ? 'PASS' : 'FAIL',
      lostFields: trace.integrityReport?.lostFields || [],
      promptInspection: trace.promptInspection ? 'COMPLETED' : 'SKIPPED',
      fallbackDetected: trace.fallbackDetection?.detected || false,
      outputVerified: !!trace.outputVerification
    };
  }

  handleTracerError(traceId, operation, error) {
    console.error(`[TRACER ERROR] ${operation}:`, error);
    
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      trace.errors.push({
        operation,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Non-degradation: tracer errors never stop request processing
  }

  log(level, message, data) {
    if (!this.enabled) return;
    
    const _logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    // Console output with color coding
    const colors = {
      info: '\x1b[36m',      // Cyan
      stage: '\x1b[35m',     // Magenta
      module: '\x1b[33m',    // Yellow
      prompt: '\x1b[34m',    // Blue
      output: '\x1b[32m',    // Green
      warning: '\x1b[93m',   // Bright Yellow
      error: '\x1b[31m',     // Red
      reset: '\x1b[0m'
    };
    
    const color = colors[level] || colors.reset;
    
    if (this.verboseMode || level === 'warning' || level === 'error') {
      console.log(`${color}${message}${colors.reset}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${color}${message}${colors.reset}`);
    }
    
    // File logging if enabled
    if (this.logToFile) {
      // Implementation would write to file
      // Not included to keep file self-contained
    }
  }

  // ================================================================
  // STATISTICS & REPORTING
  // ================================================================
  
  getStatistics() {
    return {
      ...this.stats,
      activeTraces: this.activeTraces.size,
      moduleExecutions: Object.fromEntries(this.stats.moduleExecutionCounts)
    };
  }

  resetStatistics() {
    this.stats = {
      totalRequests: 0,
      successfulTraces: 0,
      failedTraces: 0,
      dataLossDetected: 0,
      avgExecutionTime: 0,
      moduleExecutionCounts: new Map()
    };
  }
}

// ================================================================
// MIDDLEWARE WRAPPER FOR EXPRESS
// ================================================================

export function createTracerMiddleware() {
  const tracer = new RequestFlowTracer();
  
  return {
    // Middleware to attach tracer to request
    middleware: (req, res, next) => {
      if (req.path === '/api/chat' && req.method === 'POST') {
        req.traceId = tracer.startTrace(req);
        req.tracer = tracer;
      }
      next();
    },
    
    // Helper functions to use in chat.js
    helpers: {
      logStage: (req, stageName, data) => {
        if (req.traceId) tracer.logStage(req.traceId, stageName, data);
      },
      
      wrapModule: (req, moduleName, moduleFunction) => {
        if (req.traceId) {
          return tracer.wrapModule(req.traceId, moduleName, moduleFunction);
        }
        return moduleFunction;
      },
      
      inspectPrompt: (req, promptData) => {
        if (req.traceId) tracer.inspectPrompt(req.traceId, promptData);
      },
      
      detectFallback: (req, responseData) => {
        if (req.traceId) tracer.detectFallback(req.traceId, responseData);
      },
      
      verifyOutput: (req, responseData) => {
        if (req.traceId) tracer.verifyOutput(req.traceId, responseData);
      },
      
      completeTrace: (req, responseData) => {
        if (req.traceId) return tracer.completeTrace(req.traceId, responseData);
        return null;
      }
    },
    
    // Direct tracer access for advanced usage
    tracer
  };
}

// ================================================================
// EXPORT
// ================================================================

export default RequestFlowTracer;
