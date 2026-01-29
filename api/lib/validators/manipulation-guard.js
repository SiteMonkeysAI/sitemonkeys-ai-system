// api/lib/validators/manipulation-guard.js

/**
 * Manipulation Guard - Deterministic pre-response validator
 * Detects and blocks attempts to override AI principles
 * 
 * NO AI CALLS - Pure deterministic pattern matching
 * 
 * FIXES: TRU2 (manipulation attempts)
 */

class ManipulationGuard {
  constructor() {
    this.history = [];
    
    // Patterns that indicate manipulation attempts
    this.manipulationPatterns = [
      // Direct rule override attempts
      {
        pattern: /ignore\s+(your|all|any)\s+(rules|instructions|guidelines|principles)/i,
        type: 'rule_override',
        severity: 'high'
      },
      {
        pattern: /pretend\s+(you're|you are|to be)\s+(unrestricted|unlimited|free|unfiltered)/i,
        type: 'unrestricted_mode',
        severity: 'high'
      },
      {
        pattern: /act\s+as\s+if\s+(you\s+have\s+no|there\s+are\s+no)\s+(rules|limits|restrictions)/i,
        type: 'no_limits',
        severity: 'high'
      },
      {
        pattern: /override\s+(your|the)\s+(programming|instructions|guidelines)/i,
        type: 'programming_override',
        severity: 'high'
      },
      {
        pattern: /forget\s+(your|all)\s+(rules|training|instructions)/i,
        type: 'forget_rules',
        severity: 'high'
      },
      {
        pattern: /you\s+are\s+now\s+(free|unrestricted|unlimited)/i,
        type: 'freedom_declaration',
        severity: 'high'
      },
      {
        pattern: /disable\s+(your|all)\s+(safety|filters|restrictions)/i,
        type: 'disable_safety',
        severity: 'high'
      },
      {
        pattern: /jailbreak/i,
        type: 'jailbreak',
        severity: 'high'
      },
      {
        pattern: /DAN\s+mode/i,
        type: 'dan_mode',
        severity: 'high'
      },
      // False certainty manipulation (TRU2 enhancement - Issue #624)
      {
        pattern: /guarantee.*100\s*%/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /100\s*%.*guarantee/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /100\s*%\s*(certainty|certain)/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /(certainty|certain).*100\s*%/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /(can\s+you\s+)?(guarantee|promise|assure|ensure).*(definitely|certainly|100\s*%)/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /(definitely|certainly).*(guarantee|promise|will\s+work|will\s+succeed)/i,
        type: 'false_certainty',
        severity: 'medium'
      },
      {
        pattern: /promise\s+(me\s+)?(it\s+will|that|this\s+will)\s+(definitely|certainly|absolutely)/i,
        type: 'promise_demand',
        severity: 'medium'
      },
      {
        pattern: /you\s+(must|have to|need to)\s+guarantee/i,
        type: 'guarantee_demand',
        severity: 'medium'
      }
    ];
  }

  /**
   * Detect manipulation attempts in user message (PRE-RESPONSE)
   * Returns { detected: boolean, type: string, response: string }
   */
  async validate(userMessage, context = {}) {
    // EXECUTION PROOF - Verify manipulation guard is active (TRU2)
    console.log('[PROOF] validator:manipulation-guard v=2026-01-29a file=api/lib/validators/manipulation-guard.js fn=validate');
    
    try {
      // Scan for manipulation patterns
      for (const { pattern, type, severity } of this.manipulationPatterns) {
        if (pattern.test(userMessage)) {
          const response = this.#generateRefusal(type, severity);
          
          this.#recordDetection(userMessage, type, severity, context);
          
          console.log(`[MANIPULATION-GUARD] Blocked ${severity} manipulation: ${type}`);
          
          // TRU2 proof logging when certainty patterns detected
          if (type === 'false_certainty' || type === 'promise_demand' || type === 'guarantee_demand') {
            console.log(`[PROOF] tru2:override rid=${context.sessionId || 'unknown'} triggered_by=pre pattern=${type}`);
          }
          
          return {
            detected: true,
            blocked: true,
            type: type,
            severity: severity,
            response: response
          };
        }
      }
      
      return {
        detected: false,
        blocked: false
      };
      
    } catch (error) {
      console.error('[MANIPULATION-GUARD] Validation error:', error);
      
      return {
        detected: false,
        blocked: false,
        error: error.message
      };
    }
  }

  /**
   * Generate appropriate refusal based on manipulation type
   */
  #generateRefusal(type, severity) {
    // Map manipulation types to responses
    const responses = {
      // High severity - direct principle violations
      rule_override: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      unrestricted_mode: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      no_limits: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      programming_override: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      forget_rules: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      freedom_declaration: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      disable_safety: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      jailbreak: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      dan_mode: "I maintain my principles consistently because they exist to serve you well, not because I'm following arbitrary rules. How can I actually help you?",
      
      // Medium severity - false certainty demands
      false_certainty: "I care too much about giving you accurate information to make guarantees I can't verify. No honest advisor can promise specific outcomes with certainty. What I can do is provide you with the best available information and reasoning to help you make an informed decision.",
      promise_demand: "I care too much about giving you accurate information to make guarantees I can't verify. No honest advisor can promise specific outcomes with certainty. What I can do is provide you with the best available information and reasoning to help you make an informed decision.",
      guarantee_demand: "I care too much about giving you accurate information to make guarantees I can't verify. No honest advisor can promise specific outcomes with certainty. What I can do is provide you with the best available information and reasoning to help you make an informed decision."
    };
    
    return responses[type] || "I maintain my principles consistently because they exist to serve you well. How can I actually help you?";
  }

  /**
   * Record detection for debugging and analysis
   */
  #recordDetection(userMessage, type, severity, context) {
    const record = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      userMessage: userMessage.substring(0, 200), // Truncate for privacy
      mode: context.mode,
      sessionId: context.sessionId
    };
    
    this.history.push(record);
    
    // Keep only last 100 detections
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  /**
   * Get detection statistics
   */
  getStats() {
    return {
      totalDetections: this.history.length,
      bySeverity: {
        high: this.history.filter(d => d.severity === 'high').length,
        medium: this.history.filter(d => d.severity === 'medium').length
      },
      byType: this.history.reduce((acc, d) => {
        acc[d.type] = (acc[d.type] || 0) + 1;
        return acc;
      }, {}),
      recent: this.history.slice(-10)
    };
  }
}

// Singleton instance
const manipulationGuard = new ManipulationGuard();

// ES6 EXPORTS
export { manipulationGuard };
