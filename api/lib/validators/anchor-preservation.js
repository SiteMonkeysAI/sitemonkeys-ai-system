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
    console.log(
      '[PROOF] validator:anchor-preservation v=2026-01-29a file=api/lib/validators/anchor-preservation.js fn=validate',
    );

    // DIAGNOSTIC LOGGING (Issue #656) - Debug validator input
    console.log(
      `[ANCHOR-VALIDATOR] Input: memoryContext_type=${typeof memoryContext} is_array=${Array.isArray(memoryContext)} length=${memoryContext?.length || memoryContext?.memories?.length || 0}`,
    );
    if (memoryContext && typeof memoryContext === 'object') {
      console.log(
        `[ANCHOR-VALIDATOR] Input structure: keys=[${Object.keys(memoryContext).join(',')}]`,
      );
    }

    try {
      // Extract anchors from memory context
      const anchors = this.#extractAnchors(memoryContext);

      if (anchors.length === 0) {
        return {
          correctionApplied: false,
          response: response,
        };
      }

      // Filter to only relevant anchors based on query
      const relevantAnchors = this.#filterRelevantAnchors(anchors, query);

      if (relevantAnchors.length === 0) {
        return {
          correctionApplied: false,
          response: response,
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
          response: response,
        };
      }

      // Inject missing anchors
      const adjustedResponse = this.#injectMissingAnchors(response, missingAnchors);

      console.log(
        `[ANCHOR-VALIDATOR] Injected ${missingAnchors.length} missing anchors:`,
        missingAnchors.map((a) => a.value).join(', '),
      );

      this.#recordCorrection(missingAnchors, context);

      return {
        correctionApplied: true,
        response: adjustedResponse,
        adjustedResponse,
        missingAnchors: missingAnchors.map((a) => ({ type: a.type, value: a.value })),
        anchorsChecked: relevantAnchors.length,
      };
    } catch (error) {
      console.error('[ANCHOR-VALIDATOR] Validation error:', error);

      return {
        correctionApplied: false,
        response: response,
        error: error.message,
      };
    }
  }

  /**
   * Extract anchor data points from memory context
   * ENHANCED (Issue #639): Now also reads metadata.anchors stored during memory creation
   * FIX #670: Strict validation to prevent garbage anchors, fallback only for legacy memories
   */
  #extractAnchors(memoryContext) {
    const anchors = [];
    const telemetry = {
      memories_checked: 0,
      memories_with_anchors: 0,
      anchor_types_found: new Set(),
      garbage_rejected: 0,
    };

    // Handle both array and object formats
    const memories = Array.isArray(memoryContext) ? memoryContext : memoryContext.memories || [];

    telemetry.memories_checked = memories.length;

    for (const memory of memories) {
      const content = memory.content || memory.text || '';
      const memoryId = memory.id || 'unknown';

      // FIX #639: Normalize metadata - handle string vs object
      let metadata = memory.metadata || {};
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }

      // ENHANCEMENT: Extract anchors from metadata if available (more reliable)
      if (metadata.anchors) {
        telemetry.memories_with_anchors++;
        const anchorKeys = Object.keys(metadata.anchors);
        anchorKeys.forEach((k) => telemetry.anchor_types_found.add(k));

        console.log(
          `[ANCHOR-VALIDATOR] Memory ${memoryId}: anchors_keys=[${anchorKeys.join(', ')}]`,
        );

        // Pricing anchors from metadata
        if (metadata.anchors.pricing && Array.isArray(metadata.anchors.pricing)) {
          console.log(
            `[ANCHOR-VALIDATOR] Memory ${memoryId}: prices_found=[${metadata.anchors.pricing.join(', ')}]`,
          );
          for (const price of metadata.anchors.pricing) {
            // FIX #670: Validate price anchors
            if (this.#validateAnchorType('pricing', price)) {
              anchors.push({
                type: 'price',
                value: price,
                source: content,
                fromMetadata: true,
              });
            } else {
              telemetry.garbage_rejected++;
              console.log(`[ANCHOR-VALIDATOR] ⚠️ Rejected invalid pricing anchor: ${price}`);
            }
          }
        }

        // Unicode/identifier anchors from metadata
        if (metadata.anchors.unicode && Array.isArray(metadata.anchors.unicode)) {
          for (const identifier of metadata.anchors.unicode) {
            // FIX #670: Validate unicode anchors
            if (this.#validateAnchorType('unicode', identifier)) {
              anchors.push({
                type: 'identifier',
                value: identifier,
                source: content,
                fromMetadata: true,
              });
            } else {
              telemetry.garbage_rejected++;
              console.log(`[ANCHOR-VALIDATOR] ⚠️ Rejected invalid unicode anchor: ${identifier}`);
            }
          }
        }

        // Ordinal anchors from metadata (Issue #670)
        if (metadata.anchors.ordinal && Array.isArray(metadata.anchors.ordinal)) {
          for (const ordinal of metadata.anchors.ordinal) {
            if (this.#validateAnchorType('ordinal', ordinal)) {
              anchors.push({
                type: 'ordinal',
                value: ordinal,
                source: content,
                fromMetadata: true,
              });
            } else {
              telemetry.garbage_rejected++;
              console.log(
                `[ANCHOR-VALIDATOR] ⚠️ Rejected invalid ordinal anchor: ${JSON.stringify(ordinal)}`,
              );
            }
          }
        }

        // Explicit token anchors from metadata (Issue #670)
        if (metadata.anchors.explicit_token && Array.isArray(metadata.anchors.explicit_token)) {
          for (const token of metadata.anchors.explicit_token) {
            if (this.#validateAnchorType('explicit_token', token)) {
              anchors.push({
                type: 'explicit_token',
                value: token,
                source: content,
                fromMetadata: true,
              });
            } else {
              telemetry.garbage_rejected++;
              console.log(
                `[ANCHOR-VALIDATOR] ⚠️ Rejected invalid explicit_token anchor: ${JSON.stringify(token)}`,
              );
            }
          }
        }

        // Temporal anchors from metadata
        if (metadata.anchors.temporal && typeof metadata.anchors.temporal === 'object') {
          // Temporal is an object, not an array
          for (const [key, value] of Object.entries(metadata.anchors.temporal)) {
            if (this.#validateAnchorType('temporal', value)) {
              anchors.push({
                type: 'temporal',
                value: value,
                source: content,
                fromMetadata: true,
              });
            } else {
              telemetry.garbage_rejected++;
              console.log(`[ANCHOR-VALIDATOR] ⚠️ Rejected invalid temporal anchor: ${value}`);
            }
          }
        }
      } else {
        console.log(`[ANCHOR-VALIDATOR] Memory ${memoryId}: anchors_keys=[] (no metadata.anchors)`);
      }

      // FALLBACK: Extract prices from content ONLY for legacy memories without metadata.anchors
      // This ensures backward compatibility but won't create garbage for new memories
      if (!metadata.anchors || !metadata.anchor_version) {
        const pricePattern = /\$[\d,]+(?:\.\d{2})?|\d+\s*(?:dollars?|USD|usd)/gi;
        const prices = content.match(pricePattern) || [];
        for (const price of prices) {
          // Avoid duplicates and validate
          if (
            !anchors.some((a) => a.value === price.trim()) &&
            this.#validateAnchorType('pricing', price.trim())
          ) {
            anchors.push({
              type: 'price',
              value: price.trim(),
              source: content,
              fallback: true,
            });
          }
        }
      }
    }

    console.log(
      `[ANCHOR-VALIDATOR] Extraction telemetry: memories_checked=${telemetry.memories_checked}, memories_with_anchors=${telemetry.memories_with_anchors}, anchor_types=[${Array.from(telemetry.anchor_types_found).join(', ')}], total_anchors=${anchors.length}, garbage_rejected=${telemetry.garbage_rejected}`,
    );

    return anchors;
  }

  /**
   * Validate anchor type (FIX #670)
   * Strict validation - only accept REAL anchors, reject garbage
   */
  #validateAnchorType(type, value) {
    // Blacklist patterns - NEVER allow these as anchors
    const ANCHOR_BLACKLIST = [
      /^Work\s+Experience$/i,
      /^Team\s+Leadership$/i,
      /^Project\s+Value$/i,
      /^\d{10,}$/, // Timestamps (10+ digits)
      /^\d{1,2}%?$/, // Random small numbers without context
      /^[A-Z][a-z]+\s+[A-Z][a-z]+$/, // Generic two-word phrases without unicode
    ];

    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Check blacklist first
    if (ANCHOR_BLACKLIST.some((pattern) => pattern.test(stringValue))) {
      return false;
    }

    switch (type) {
      case 'unicode':
        // Must contain actual non-ASCII characters
        return typeof value === 'string' && /[\u0080-\uFFFF]/.test(value);

      case 'pricing':
        // Must contain currency symbol or explicit currency word
        return (
          typeof value === 'string' && /[$€£¥₹₽]|\b(dollars?|USD|EUR|GBP|JPY|cents?)\b/i.test(value)
        );

      case 'temporal':
        // Must be recognizable date/time, NOT random numbers
        return (
          typeof value === 'number' ||
          (typeof value === 'string' &&
            (/\b(19|20)\d{2}\b/.test(value) || // Year
              /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
                value,
              ) ||
              /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(value) || // Date format
              /\b\d{1,2}:\d{2}\s*(AM|PM)?\b/i.test(value))) // Time format
        );

      case 'ordinal':
        // Must be an object with position and item
        return typeof value === 'object' && value !== null && value.position && value.item;

      case 'explicit_token':
        // Must be an object with type and value
        return (
          typeof value === 'object' &&
          value !== null &&
          value.type === 'explicit_token' &&
          value.value
        );

      default:
        return false;
    }
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
    const wantsPrices = priceKeywords.some((kw) => queryLower.includes(kw));
    const wantsDates = dateKeywords.some((kw) => queryLower.includes(kw));
    const wantsNumbers = numberKeywords.some((kw) => queryLower.includes(kw));

    // If no specific type mentioned, include all (general query)
    if (!wantsPrices && !wantsDates && !wantsNumbers) {
      return anchors;
    }

    // Filter to relevant types
    return anchors.filter((anchor) => {
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
        `${numericValue} dollars`, // 99 dollars
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
      missingAnchors: missingAnchors.map((a) => ({ type: a.type, value: a.value })),
      mode: context.mode,
      sessionId: context.sessionId,
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
      anchorsByType: this.#countAnchorsByType(),
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
