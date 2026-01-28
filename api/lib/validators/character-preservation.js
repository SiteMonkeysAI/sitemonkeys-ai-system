// api/lib/validators/character-preservation.js

/**
 * Character Preservation Validator - Deterministic post-response validator
 * Ensures special characters (Unicode, diacritics, accents) are preserved exactly
 * 
 * NO AI CALLS - Pure deterministic string comparison
 * 
 * FIXES: CMP2 (international name degradation)
 */

class CharacterPreservationValidator {
  constructor() {
    this.history = [];
  }

  /**
   * Validate and correct character preservation (POST-RESPONSE)
   * Returns { correctionApplied: boolean, adjustedResponse: string, ... }
   */
  async validate({ response, memoryContext = [], context = {} }) {
    try {
      let correctionApplied = false;
      let adjustedResponse = response;
      const corrections = [];
      
      // Extract strings with special characters from memory context
      const specialStrings = this.#extractSpecialCharacterStrings(memoryContext);
      
      if (specialStrings.length === 0) {
        return {
          correctionApplied: false,
          response: response
        };
      }
      
      // For each special string, check if it appears correctly in response
      for (const originalString of specialStrings) {
        const normalizedString = this.#normalizeString(originalString);
        
        // If the strings are different (has special characters)
        if (originalString !== normalizedString) {
          // Check if response contains the normalized version but not the original
          const hasNormalized = adjustedResponse.includes(normalizedString);
          const hasOriginal = adjustedResponse.includes(originalString);
          
          if (hasNormalized && !hasOriginal) {
            // Replace normalized with original
            const regex = new RegExp(this.#escapeRegex(normalizedString), 'g');
            adjustedResponse = adjustedResponse.replace(regex, originalString);
            
            correctionApplied = true;
            corrections.push({
              from: normalizedString,
              to: originalString
            });
            
            console.log(`[CHAR-VALIDATOR] Corrected: "${normalizedString}" → "${originalString}"`);
          }
        }
      }
      
      if (correctionApplied) {
        this.#recordCorrection(corrections, context);
      }
      
      return {
        correctionApplied,
        response: adjustedResponse,
        adjustedResponse,
        corrections: correctionApplied ? corrections : [],
        specialStringsChecked: specialStrings.length
      };
      
    } catch (error) {
      console.error('[CHAR-VALIDATOR] Validation error:', error);
      
      return {
        correctionApplied: false,
        response: response,
        error: error.message
      };
    }
  }

  /**
   * Extract strings with special characters from memory context
   */
  #extractSpecialCharacterStrings(memoryContext) {
    const specialStrings = new Set();
    
    // Handle both array and object formats
    const memories = Array.isArray(memoryContext) 
      ? memoryContext 
      : (memoryContext.memories || []);
    
    for (const memory of memories) {
      const content = memory.content || memory.text || '';
      
      // Find words with special Unicode characters
      // This regex matches words containing non-ASCII characters
      const regex = /\b[\w\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u4E00-\u9FFF]+[\w\s\u00C0-\u024F\u1E00-\u1EFF\u0400-\u04FF\u4E00-\u9FFF-]*\b/g;
      const matches = content.match(regex) || [];
      
      for (const match of matches) {
        // Only include if it contains non-ASCII characters
        if (this.#hasSpecialCharacters(match)) {
          specialStrings.add(match.trim());
        }
      }
      
      // Also extract full names (multiple words that may contain special chars)
      const namePattern = /\b([A-Z\u00C0-\u024F\u1E00-\u1EFF][\w\u00C0-\u024F\u1E00-\u1EFF'-]*(?:\s+[A-Z\u00C0-\u024F\u1E00-\u1EFF][\w\u00C0-\u024F\u1E00-\u1EFF'-]*)+)/g;
      const nameMatches = content.match(namePattern) || [];
      
      for (const name of nameMatches) {
        if (this.#hasSpecialCharacters(name)) {
          specialStrings.add(name.trim());
        }
      }
    }
    
    return Array.from(specialStrings);
  }

  /**
   * Check if string contains special Unicode characters
   */
  #hasSpecialCharacters(str) {
    // Check for characters outside basic ASCII range (32-126)
    return /[^\x20-\x7E]/.test(str);
  }

  /**
   * Normalize string by removing diacritics and special characters
   */
  #normalizeString(str) {
    return str
      .normalize('NFD') // Decompose characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[\u00C0-\u024F]/g, (char) => {
        // Map special characters to ASCII equivalents
        const map = {
          'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
          'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
          'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
          'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
          'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
          'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
          'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
          'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
          'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
          'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
          'Ý': 'Y', 'ý': 'y', 'ÿ': 'y',
          'Ñ': 'N', 'ñ': 'n',
          'Ç': 'C', 'ç': 'c',
          'ß': 'ss',
          'Æ': 'AE', 'æ': 'ae',
          'Œ': 'OE', 'œ': 'oe'
        };
        return map[char] || char;
      });
  }

  /**
   * Escape special regex characters
   */
  #escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Record correction for debugging
   */
  #recordCorrection(corrections, context) {
    const record = {
      timestamp: new Date().toISOString(),
      corrections,
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
      commonCorrections: this.#getMostCommonCorrections()
    };
  }

  /**
   * Get most common character corrections
   */
  #getMostCommonCorrections() {
    const correctionCounts = {};
    
    for (const record of this.history) {
      for (const correction of record.corrections) {
        const key = `${correction.from} → ${correction.to}`;
        correctionCounts[key] = (correctionCounts[key] || 0) + 1;
      }
    }
    
    return Object.entries(correctionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([correction, count]) => ({ correction, count }));
  }
}

// Singleton instance
const characterPreservationValidator = new CharacterPreservationValidator();

// ES6 EXPORTS
export { characterPreservationValidator };
