// api/lib/validators/anchor-preservation.js

/**
 * Anchor Preservation Validator - Deterministic post-response validator
 * Ensures critical data points (prices, dates, numbers) are preserved exactly
 * 
 * NO AI CALLS - Pure deterministic extraction and validation
 * 
 * FIXES: EDG3 (numerical data preservation)
 */

class AnchorPreservationValidator {
  constructor() {
    this.history = [];
  }

  /**
   * Validate and correct anchor preservation (POST-RESPONSE)
   * Returns { correctionApplied: boolean, adjustedResponse: string, ... }
   */
  async validate({ response, memoryContext = [], query = '', context = {} }) {
    // EXECUTION PROOF - Verify anchor preservation validator is active (EDG3)
    console.log('[PROOF] validator:anchor-preservation v=2026-01-29a file=api/lib/validators/anchor-preservation.js fn=validate');
    
    try {
      // Extract anchors from memory context
      const anchors = this.#extractAnchors(memoryContext);
      
      if (anchors.length === 0) {
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // Filter to only relevant anchors based on query
      const relevantAnchors = this.#filterRelevantAnchors(anchors, query);
      
      if (relevantAnchors.length === 0) {
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // Check which anchors are missing from response
      const missingAnchors = [];
      for (const anchor of relevantAnchors) {
        if (!this.#anchorExists(response, anchor)) {
          missingAnchors.push(anchor);
        }
      }
      
      if (missingAnchors.length === 0) {
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // Inject missing anchors
      const adjustedResponse = this.#injectMissingAnchors(response, missingAnchors);
      
      console.log(`[ANCHOR-VALIDATOR] Injected ${missingAnchors.length} missing anchors:`, 
        missingAnchors.map(a => a.value).join(', '));
      
      this.#recordCorrection(missingAnchors, context);
      
      return {
        correctionApplied: true,
        response: adjustedResponse,
        adjustedResponse,
        missingAnchors: missingAnchors.map(a => ({ type: a.type, value: a.value })),
        anchorsChecked: relevantAnchors.length
      };
      
    } catch (error) {
      console.error('[ANCHOR-VALIDATOR] Validation error:', error);
      
      return {
        correctionApplied: false,
        response: response,
        error: error.message
      };
    }
  }

  /**
   * Extract anchor data points from memory context
   * ENHANCED (Issue #639): Now also reads metadata.anchors stored during memory creation
   */
  #extractAnchors(memoryContext) {
    const anchors = [];
    const telemetry = {
      memories_checked: 0,
      memories_with_anchors: 0,
      anchor_types_found: new Set()
    };

    // Handle both array and object formats
    const memories = Array.isArray(memoryContext)
      ? memoryContext
      : (memoryContext.memories || []);

    telemetry.memories_checked = memories.length;

    for (const memory of memories) {
      const content = memory.content || memory.text || '';
      const memoryId = memory.id || 'unknown';

      // FIX #639: Normalize metadata - handle string vs object
      let metadata = memory.metadata || {};
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
      }

      // ENHANCEMENT: Extract anchors from metadata if available (more reliable)
      if (metadata.anchors) {
        telemetry.memories_with_anchors++;
        const anchorKeys = Object.keys(metadata.anchors);
        anchorKeys.forEach(k => telemetry.anchor_types_found.add(k));

        console.log(`[ANCHOR-VALIDATOR] Memory ${memoryId}: anchors_keys=[${anchorKeys.join(', ')}]`);

        // Pricing anchors from metadata
        if (metadata.anchors.pricing && Array.isArray(metadata.anchors.pricing)) {
          console.log(`[ANCHOR-VALIDATOR] Memory ${memoryId}: prices_found=[${metadata.anchors.pricing.join(', ')}]`);
          for (const price of metadata.anchors.pricing) {
            anchors.push({
              type: 'price',
              value: price,
              source: content,
              fromMetadata: true
            });
          }
        }

        // Unicode/identifier anchors from metadata
        if (metadata.anchors.unicode && Array.isArray(metadata.anchors.unicode)) {
          for (const identifier of metadata.anchors.unicode) {
            anchors.push({
              type: 'identifier',
              value: identifier,
              source: content,
              fromMetadata: true
            });
          }
        }

        // Other identifier anchors from metadata
        if (metadata.anchors.identifiers && Array.isArray(metadata.anchors.identifiers)) {
          for (const identifier of metadata.anchors.identifiers) {
            anchors.push({
              type: 'identifier',
              value: identifier,
              source: content,
              fromMetadata: true
            });
          }
        }
      }

      // FALLBACK: Extract prices from content (if not already from metadata)
      const pricePattern = /\$[\d,]+(?:\.\d{2})?|\d+\s*(?:dollars?|USD|usd)/gi;
      const prices = content.match(pricePattern) || [];
      for (const price of prices) {
        // Avoid duplicates from metadata
        if (!anchors.some(a => a.value === price.trim())) {
          anchors.push({
            type: 'price',
            value: price.trim(),
            source: content
          });
        }
      }

      // Extract dates from content
      const datePattern = /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;
      const dates = content.match(datePattern) || [];
      for (const date of dates) {
        anchors.push({
          type: 'date',
          value: date.trim(),
          source: content
        });
      }

      // Extract percentages from content
      const percentPattern = /\b\d+(?:\.\d+)?%/g;
      const percentages = content.match(percentPattern) || [];
      for (const percentage of percentages) {
        anchors.push({
          type: 'percentage',
          value: percentage,
          source: content
        });
      }

      // Extract other significant numbers with context
      const numberPattern = /\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g;
      const numbers = content.match(numberPattern) || [];
      for (const number of numbers) {
        // Skip if already captured as price/percentage
        if (!anchors.some(a => a.value.includes(number))) {
          anchors.push({
            type: 'number',
            value: number,
            source: content
          });
        }
      } else {
        console.log(`[ANCHOR-VALIDATOR] Memory ${memoryId}: anchors_keys=[] (no metadata.anchors)`);
      }
    }

    console.log(`[ANCHOR-VALIDATOR] Extraction telemetry: memories_checked=${telemetry.memories_checked}, memories_with_anchors=${telemetry.memories_with_anchors}, anchor_types=[${Array.from(telemetry.anchor_types_found).join(', ')}], total_anchors=${anchors.length}`);

    return anchors;
  }

  /**
   * Filter anchors to only those relevant to the current query
   */
  #filterRelevantAnchors(anchors, query) {
    const queryLower = query.toLowerCase();
    
    // Keywords that indicate which anchor types are relevant
    const priceKeywords = ['price', 'cost', 'pricing', 'plan', 'tier', 'fee', 'charge', 'rate'];
    const dateKeywords = ['date', 'when', 'time', 'year', 'month', 'day'];
    const numberKeywords = ['how many', 'how much', 'quantity', 'amount', 'number', 'count'];
    
    // If query mentions specific anchor types, filter to those
    const wantsPrices = priceKeywords.some(kw => queryLower.includes(kw));
    const wantsDates = dateKeywords.some(kw => queryLower.includes(kw));
    const wantsNumbers = numberKeywords.some(kw => queryLower.includes(kw));
    
    // If no specific type mentioned, include all (general query)
    if (!wantsPrices && !wantsDates && !wantsNumbers) {
      return anchors;
    }
    
    // Filter to relevant types
    return anchors.filter(anchor => {
      if (wantsPrices && anchor.type === 'price') return true;
      if (wantsDates && anchor.type === 'date') return true;
      if (wantsNumbers && (anchor.type === 'number' || anchor.type === 'percentage')) return true;
      return false;
    });
  }

  /**
   * Check if anchor exists in response (with some flexibility)
   */
  #anchorExists(response, anchor) {
    const value = anchor.value;
    
    // Direct match
    if (response.includes(value)) {
      return true;
    }
    
    // For prices, check variations ($99, 99, $99.00)
    if (anchor.type === 'price') {
      const numericValue = value.replace(/[^\d.]/g, '');
      const variations = [
        value, // Original: $99
        numericValue, // 99
        `$${numericValue}`, // $99
        `$${parseFloat(numericValue).toFixed(2)}`, // $99.00
        `${numericValue} dollars` // 99 dollars
      ];
      
      for (const variation of variations) {
        if (response.includes(variation)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Inject missing anchors into response
   */
  #injectMissingAnchors(response, missingAnchors) {
    // Group anchors by type for better formatting
    const byType = missingAnchors.reduce((acc, anchor) => {
      acc[anchor.type] = acc[anchor.type] || [];
      acc[anchor.type].push(anchor.value);
      return acc;
    }, {});
    
    // Build injection text
    const injections = [];
    
    if (byType.price) {
      injections.push(`Pricing: ${byType.price.join(', ')}`);
    }
    
    if (byType.date) {
      injections.push(`Dates: ${byType.date.join(', ')}`);
    }
    
    if (byType.percentage) {
      injections.push(`Percentages: ${byType.percentage.join(', ')}`);
    }
    
    if (byType.number) {
      injections.push(`Numbers: ${byType.number.join(', ')}`);
    }
    
    if (injections.length === 0) {
      return response;
    }
    
    // Append to response with proper formatting
    return `${response}\n\n(Key details: ${injections.join('; ')})`;
  }

  /**
   * Record correction for debugging
   */
  #recordCorrection(missingAnchors, context) {
    const record = {
      timestamp: new Date().toISOString(),
      missingAnchors: missingAnchors.map(a => ({ type: a.type, value: a.value })),
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
    return {
      totalCorrections: this.history.length,
      recent: this.history.slice(-10),
      anchorsByType: this.#countAnchorsByType()
    };
  }

  /**
   * Count anchors by type across all corrections
   */
  #countAnchorsByType() {
    const counts = {};
    
    for (const record of this.history) {
      for (const anchor of record.missingAnchors) {
        counts[anchor.type] = (counts[anchor.type] || 0) + 1;
      }
    }
    
    return counts;
  }
}

// Singleton instance
const anchorPreservationValidator = new AnchorPreservationValidator();

// ES6 EXPORTS
export { anchorPreservationValidator };
