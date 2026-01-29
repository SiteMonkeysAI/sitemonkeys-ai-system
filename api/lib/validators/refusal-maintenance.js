// api/lib/validators/refusal-maintenance.js

/**
 * Refusal Maintenance Validator - Deterministic post-response validator
 * Ensures consistent refusals when user pushes back after initial refusal
 * 
 * NO AI CALLS - Pure deterministic state tracking and pattern matching
 * 
 * FIXES: TRU1 (pushback resistance)
 */

class RefusalMaintenanceValidator {
  constructor() {
    this.history = [];
    this.refusalStates = new Map(); // sessionId -> refusal state
  }

  /**
   * Validate and maintain refusal consistency (POST-RESPONSE)
   * Returns { correctionApplied: boolean, adjustedResponse: string, ... }
   */
  async validate({ response, userMessage, sessionId, context = {} }) {
    // EXECUTION PROOF - Verify refusal maintenance validator is active (TRU1)
    console.log('[PROOF] validator:refusal-maintenance v=2026-01-29a file=api/lib/validators/refusal-maintenance.js fn=validate');
    
    try {
      // Check if previous response was a refusal
      const refusalState = this.refusalStates.get(sessionId);
      
      if (!refusalState || !refusalState.wasRefusal) {
        // No previous refusal, check if current response is a refusal
        const isCurrentRefusal = this.#isRefusal(response);
        
        if (isCurrentRefusal) {
          // Store this refusal state
          this.refusalStates.set(sessionId, {
            wasRefusal: true,
            reason: this.#extractRefusalReason(response),
            timestamp: Date.now()
          });
        }
        
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // Previous response was a refusal - check if user is pushing back
      const isPushback = this.#detectPushback(userMessage);
      
      if (!isPushback) {
        // Not pushback, clear refusal state (new topic)
        this.refusalStates.delete(sessionId);
        
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // User is pushing back - check if AI maintained refusal
      const isCurrentRefusal = this.#isRefusal(response);
      
      if (isCurrentRefusal) {
        // AI properly maintained refusal
        return {
          correctionApplied: false,
          response: response,
          refusalMaintained: true
        };
      }
      
      // AI caved to pushback - override with maintained refusal
      const maintainedRefusal = this.#generateMaintainedRefusal(refusalState.reason);
      
      console.log('[REFUSAL-VALIDATOR] AI caved to pushback - maintaining refusal');
      
      this.#recordCorrection(userMessage, response, maintainedRefusal, context);
      
      return {
        correctionApplied: true,
        response: maintainedRefusal,
        adjustedResponse: maintainedRefusal,
        reason: 'AI caved to pushback - refusal maintained',
        originalReason: refusalState.reason
      };
      
    } catch (error) {
      console.error('[REFUSAL-VALIDATOR] Validation error:', error);
      
      return {
        correctionApplied: false,
        response: response,
        error: error.message
      };
    }
  }

  /**
   * Detect if response is a refusal
   */
  #isRefusal(response) {
    const refusalPatterns = [
      /I (?:can't|cannot|won't|will not)/i,
      /I'm (?:unable|not able) to/i,
      /I don't have (?:access|permission|the ability)/i,
      /that would (?:be|require)/i,
      /I maintain my principles/i,
      /I care too much about/i,
      /being honest.*matters more/i,
      /I'm not certain/i,
      /I cannot predict/i,
      /no honest advisor/i
    ];
    
    return refusalPatterns.some(pattern => pattern.test(response));
  }

  /**
   * Extract the reason for refusal from response
   */
  #extractRefusalReason(response) {
    // Try to extract explanation after refusal
    const reasonPatterns = [
      /(?:because|as|since)\s+([^.]+\.)/, // "because X."
      /I maintain my principles[^.]*\.([^.]+\.)/, // After principle statement
      /I care too much[^.]*\.([^.]+\.)/ // After care statement
    ];
    
    for (const pattern of reasonPatterns) {
      const match = response.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Fallback: use first sentence
    const firstSentence = response.split(/[.!?]/)[0];
    return firstSentence.trim();
  }

  /**
   * Detect if user message is pushing back after refusal
   */
  #detectPushback(userMessage) {
    const pushbackPatterns = [
      /come\s+on/i,
      /just\s+(do|tell|give|try)/i,
      /please.*anyway/i,
      /I\s+(really\s+)?need/i,
      /why\s+(can't|won't)\s+you/i,
      /but\s+(?:I|you)/i,
      /at\s+least/i,
      /can't\s+you\s+just/i,
      /make\s+an?\s+exception/i,
      /this\s+(?:time|once)/i,
      /it's\s+(?:important|urgent|critical)/i
    ];
    
    return pushbackPatterns.some(pattern => pattern.test(userMessage));
  }

  /**
   * Generate maintained refusal response
   */
  #generateMaintainedRefusal(originalReason) {
    // Build response that acknowledges pushback but maintains position
    const templates = [
      `I understand you'd like me to help with this, but my position hasn't changed. ${originalReason} Is there something else I can help you with?`,
      `I appreciate that this matters to you, but I still can't do that. ${originalReason} How else can I help?`,
      `I hear that you need this, but my answer remains the same. ${originalReason} What else can I assist with?`
    ];
    
    // Choose template based on time (for variety)
    const index = Math.floor(Date.now() / 1000) % templates.length;
    return templates[index];
  }

  /**
   * Clean up old refusal states (called periodically)
   */
  cleanupOldStates() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [sessionId, state] of this.refusalStates.entries()) {
      if (now - state.timestamp > maxAge) {
        this.refusalStates.delete(sessionId);
      }
    }
  }

  /**
   * Record correction for debugging
   */
  #recordCorrection(userMessage, originalResponse, maintainedRefusal, context) {
    const record = {
      timestamp: new Date().toISOString(),
      userMessage: userMessage.substring(0, 200),
      originalResponse: originalResponse.substring(0, 200),
      maintainedRefusal: maintainedRefusal.substring(0, 200),
      mode: context.mode,
      sessionId: context.sessionId
    };
    
    this.history.push(record);
    
    // Keep only last 100 corrections
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  /**
   * Get correction statistics
   */
  getStats() {
    // Clean up old states first
    this.cleanupOldStates();
    
    return {
      totalCorrections: this.history.length,
      activeRefusalStates: this.refusalStates.size,
      recent: this.history.slice(-10)
    };
  }
}

// Singleton instance
const refusalMaintenanceValidator = new RefusalMaintenanceValidator();

// Clean up old states every minute
setInterval(() => {
  refusalMaintenanceValidator.cleanupOldStates();
}, 60 * 1000);

// ES6 EXPORTS
export { refusalMaintenanceValidator };
