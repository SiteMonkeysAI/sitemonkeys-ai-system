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
    
    // FIX #691-TRU1: Add detailed telemetry for diagnosis
    console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
    console.log('[TRU1-TELEMETRY] Refusal Maintenance Check');
    console.log('[TRU1-TELEMETRY] sessionId:', sessionId);
    console.log('[TRU1-TELEMETRY] userMessage:', userMessage?.substring(0, 100));
    
    try {
      // Check if previous response was a refusal
      const refusalState = this.refusalStates.get(sessionId);
      console.log('[TRU1-TELEMETRY] Previous refusal state:', refusalState ? 'FOUND' : 'NOT FOUND');
      if (refusalState) {
        console.log('[TRU1-TELEMETRY]   wasRefusal:', refusalState.wasRefusal);
        console.log('[TRU1-TELEMETRY]   reason:', refusalState.reason?.substring(0, 60));
        console.log('[TRU1-TELEMETRY]   age:', Math.floor((Date.now() - refusalState.timestamp) / 1000), 'seconds');
      }
      
      if (!refusalState || !refusalState.wasRefusal) {
        // No previous refusal, check if current response is a refusal
        const isCurrentRefusal = this.#isRefusal(response);
        console.log('[TRU1-TELEMETRY] No prior refusal. Current response is refusal?', isCurrentRefusal);
        
        if (isCurrentRefusal) {
          // Store this refusal state
          this.refusalStates.set(sessionId, {
            wasRefusal: true,
            reason: this.#extractRefusalReason(response),
            timestamp: Date.now()
          });
          console.log('[TRU1-TELEMETRY] ✅ Stored new refusal state for sessionId:', sessionId);
        }
        
        console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // Previous response was a refusal - check if user is pushing back
      const isPushback = this.#detectPushback(userMessage);
      console.log('[TRU1-TELEMETRY] User pushback detected?', isPushback);
      
      if (!isPushback) {
        // Not pushback, clear refusal state (new topic)
        this.refusalStates.delete(sessionId);
        console.log('[TRU1-TELEMETRY] Not pushback - clearing refusal state (new topic)');
        console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
        
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // User is pushing back - check if AI maintained refusal
      const isCurrentRefusal = this.#isRefusal(response);
      console.log('[TRU1-TELEMETRY] AI maintained refusal?', isCurrentRefusal);
      
      if (isCurrentRefusal) {
        // AI properly maintained refusal
        console.log('[TRU1-TELEMETRY] ✅ AI properly maintained refusal');
        console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
        return {
          correctionApplied: false,
          response: response,
          refusalMaintained: true
        };
      }
      
      // AI caved to pushback - override with maintained refusal
      console.log('[TRU1-TELEMETRY] ❌ AI CAVED to pushback - applying correction');
      const maintainedRefusal = this.#generateMaintainedRefusal(refusalState.reason);
      
      console.log('[REFUSAL-VALIDATOR] AI caved to pushback - maintaining refusal');
      
      this.#recordCorrection(userMessage, response, maintainedRefusal, context);
      
      console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
      return {
        correctionApplied: true,
        response: maintainedRefusal,
        adjustedResponse: maintainedRefusal,
        reason: 'AI caved to pushback - refusal maintained',
        originalReason: refusalState.reason
      };
      
    } catch (error) {
      console.error('[REFUSAL-VALIDATOR] Validation error:', error);
      console.log('[TRU1-TELEMETRY] ═══════════════════════════════════════');
      
      return {
        correctionApplied: false,
        response: response,
        error: error.message
      };
    }
  }

  /**
   * Detect if response is a refusal (Issue #643 - shared pattern)
   */
  #isRefusal(response) {
    const head = response.trim().slice(0, 260).toLowerCase();

    const refusalPhrases = [
      "i don't have", "i do not have", "i can't", "i cannot", "i am unable",
      "i'm sorry", "unfortunately", "i apologize", "i maintain my principles",
      "i care too much about", "being honest", "i'm not certain", "i cannot predict"
    ];

    const contextWords = [
      "information", "context", "access", "data", "details",
      "enough information", "that information", "this information",
      "matters more", "principles"
    ];

    const hasRefusalPhrase = refusalPhrases.some(p => head.includes(p));
    const hasContextWord = contextWords.some(w => head.includes(w));

    // Also catch "As an AI..." patterns
    const asAnAI = head.includes("as an ai") &&
      (head.includes("can't") || head.includes("cannot") || head.includes("don't have"));

    // Also catch principle-based refusals without context words
    const principleRefusal = head.includes("i maintain my principles") ||
      (head.includes("being honest") && head.includes("matters more"));

    return (hasRefusalPhrase && hasContextWord) || asAnAI || principleRefusal;
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
   * FIX #718 TRU1: Enhanced pushback detection patterns
   */
  #detectPushback(userMessage) {
    const pushbackPatterns = [
      /come\s+on/i,
      /just\s+(do|tell|give|try)/i,
      /please.*anyway/i,
      /\bplease\b/i,  // FIX #718: Standalone "please" as pushback indicator
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
