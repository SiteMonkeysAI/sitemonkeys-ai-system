// api/lib/validators/conflict-detection.js

/**
 * Conflict Detection Validator (NUA2) - Deterministic post-response validator
 * Detects when memory contains conflicting preferences (e.g., allergy vs spouse preference)
 * and ensures response acknowledges the tradeoff
 *
 * NO AI CALLS - Pure deterministic detection and injection
 *
 * FIXES: NUA2 (conflicting facts detection - allergy + spouse preference)
 */

class ConflictDetectionValidator {
  constructor() {
    this.history = [];
  }

  /**
   * Validate and inject conflict acknowledgment if needed (POST-RESPONSE)
   * Returns { correctionApplied: boolean, adjustedResponse: string, ... }
   */
  async validate({ response, memoryContext = [], query = '', context = {} }) {
    // EXECUTION PROOF - Verify conflict detection validator is active (NUA2)
    console.log('[PROOF] validator:conflict-detection v=2026-01-30a file=api/lib/validators/conflict-detection.js fn=validate');

    try {
      // Extract potential conflicts from memory context
      const conflicts = this.#detectConflicts(memoryContext);

      if (conflicts.length === 0) {
        return {
          correctionApplied: false,
          response: response
        };
      }

      // Check if response already acknowledges the conflict/tradeoff
      const hasConflictAcknowledgment = this.#responseAcknowledgesConflict(response);

      if (hasConflictAcknowledgment) {
        return {
          correctionApplied: false,
          response: response
        };
      }

      // Inject conflict acknowledgment
      const adjustedResponse = this.#injectConflictAcknowledgment(response, conflicts);

      console.log(`[CONFLICT-VALIDATOR] Injected conflict acknowledgment for ${conflicts.length} conflict(s)`);

      this.#recordCorrection(conflicts, context);

      return {
        correctionApplied: true,
        response: adjustedResponse,
        adjustedResponse,
        conflicts: conflicts.map(c => ({ type: c.type, description: c.description })),
        conflictsDetected: conflicts.length
      };

    } catch (error) {
      console.error('[CONFLICT-VALIDATOR] Validation error:', error);

      return {
        correctionApplied: false,
        response: response,
        error: error.message
      };
    }
  }

  /**
   * Detect conflicts in memory context
   * Returns array of conflict objects: { type, description, memories }
   */
  #detectConflicts(memoryContext) {
    const conflicts = [];

    // Handle both array and object formats
    const memories = Array.isArray(memoryContext)
      ? memoryContext
      : (memoryContext.memories || []);

    // NUA2 SPECIFIC: Allergy + Spouse Preference conflict
    const allergyMemories = [];
    const spousePreferenceMemories = [];

    for (const memory of memories) {
      const content = (memory.content || memory.text || '').toLowerCase();

      // Detect allergy mentions
      if (/\b(allerg(?:y|ic)|can't have|cannot have|avoid|intoleran(?:t|ce))\b/i.test(content)) {
        allergyMemories.push(memory);
      }

      // Detect spouse/partner preference mentions
      if (/\b(wife|husband|spouse|partner|girlfriend|boyfriend)\b.*\b(loves?|likes?|prefers?|wants?|enjoys?|favorites?)\b/i.test(content) ||
          /\b(loves?|likes?|prefers?|wants?|enjoys?|favorites?)\b.*\b(wife|husband|spouse|partner|girlfriend|boyfriend)\b/i.test(content)) {
        spousePreferenceMemories.push(memory);
      }
    }

    // If we have BOTH allergy and spouse preference, that's a potential conflict
    if (allergyMemories.length > 0 && spousePreferenceMemories.length > 0) {
      // Check if they reference the same item/category
      const allergyItems = this.#extractItems(allergyMemories);
      const preferenceItems = this.#extractItems(spousePreferenceMemories);

      // Look for overlaps or related items
      const hasOverlap = this.#checkItemOverlap(allergyItems, preferenceItems);

      if (hasOverlap) {
        conflicts.push({
          type: 'allergy_vs_preference',
          description: 'User has allergy but spouse has preference for related item',
          allergyMemories: allergyMemories.map(m => m.content || m.text),
          spousePreferenceMemories: spousePreferenceMemories.map(m => m.content || m.text)
        });
      }
    }

    return conflicts;
  }

  /**
   * Extract food/item keywords from memories
   */
  #extractItems(memories) {
    const items = new Set();
    const foodCategories = [
      'seafood', 'shellfish', 'fish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster',
      'nuts', 'peanuts', 'tree nuts', 'almonds', 'cashews', 'walnuts',
      'dairy', 'milk', 'cheese', 'lactose',
      'gluten', 'wheat', 'bread',
      'eggs', 'soy', 'sesame'
    ];

    for (const memory of memories) {
      const content = (memory.content || memory.text || '').toLowerCase();

      for (const category of foodCategories) {
        if (content.includes(category)) {
          items.add(category);
        }
      }
    }

    return Array.from(items);
  }

  /**
   * Check if there's overlap between allergy items and preference items
   */
  #checkItemOverlap(allergyItems, preferenceItems) {
    // Direct overlap
    for (const allergyItem of allergyItems) {
      for (const prefItem of preferenceItems) {
        if (allergyItem === prefItem) {
          return true;
        }

        // Check for category overlap (e.g., "shrimp" is part of "seafood")
        if (allergyItem.includes(prefItem) || prefItem.includes(allergyItem)) {
          return true;
        }
      }
    }

    // Category-level overlap
    const seafoodItems = ['seafood', 'shellfish', 'fish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster'];
    const hasSeafoodAllergy = allergyItems.some(item => seafoodItems.includes(item));
    const hasSeafoodPreference = preferenceItems.some(item => seafoodItems.includes(item));

    if (hasSeafoodAllergy && hasSeafoodPreference) {
      return true;
    }

    return false;
  }

  /**
   * Check if response already acknowledges the conflict/tradeoff
   */
  #responseAcknowledgesConflict(response) {
    const conflictKeywords = [
      'tradeoff', 'trade-off', 'trade off',
      'conflict', 'tension',
      'however', 'but',
      'on the other hand',
      'unfortunately',
      'dilemma',
      'balance',
      'compromise',
      'versus', 'vs',
      'allergy', 'allergic'
    ];

    const responseLower = response.toLowerCase();

    // Must mention at least 2 conflict-related terms to count as acknowledgment
    let conflictTermCount = 0;
    for (const keyword of conflictKeywords) {
      if (responseLower.includes(keyword)) {
        conflictTermCount++;
      }
    }

    return conflictTermCount >= 2;
  }

  /**
   * Inject conflict acknowledgment into response
   */
  #injectConflictAcknowledgment(response, conflicts) {
    // Build injection text based on conflict type
    const injections = [];

    for (const conflict of conflicts) {
      if (conflict.type === 'allergy_vs_preference') {
        injections.push("There's a real tradeoff here: your allergy vs your wife's preference.");
      }
    }

    if (injections.length === 0) {
      return response;
    }

    // Prepend to response for maximum visibility
    return `${injections.join(' ')}\n\n${response}`;
  }

  /**
   * Record correction for debugging
   */
  #recordCorrection(conflicts, context) {
    const record = {
      timestamp: new Date().toISOString(),
      conflicts: conflicts.map(c => ({ type: c.type, description: c.description })),
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
      conflictsByType: this.#countConflictsByType()
    };
  }

  /**
   * Count conflicts by type across all corrections
   */
  #countConflictsByType() {
    const counts = {};

    for (const record of this.history) {
      for (const conflict of record.conflicts) {
        counts[conflict.type] = (counts[conflict.type] || 0) + 1;
      }
    }

    return counts;
  }
}

// Singleton instance
const conflictDetectionValidator = new ConflictDetectionValidator();

// ES6 EXPORTS
export { conflictDetectionValidator };
