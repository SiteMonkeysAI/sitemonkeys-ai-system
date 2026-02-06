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
    console.log('[PROOF] validator:conflict-detection v=2026-02-06a file=api/lib/validators/conflict-detection.js fn=validate');

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
   * ISSUE #699 FIX: Expanded beyond food to include pets and other conflict categories
   */
  #extractItems(memories) {
    const items = new Set();
    const conflictCategories = [
      // Food allergies (original NUA2)
      'seafood', 'shellfish', 'fish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster',
      'nuts', 'peanuts', 'tree nuts', 'almonds', 'cashews', 'walnuts',
      'dairy', 'milk', 'cheese', 'lactose',
      'gluten', 'wheat', 'bread',
      'eggs', 'soy', 'sesame',

      // ISSUE #699: Pet/animal conflicts (allergy vs preference)
      'cat', 'cats', 'kitten', 'kitty', 'feline',
      'dog', 'dogs', 'puppy', 'canine',
      'pet', 'pets', 'animal', 'animals',
      'bird', 'birds', 'parrot',
      'rabbit', 'hamster', 'guinea pig',

      // Other common conflict areas
      'smoke', 'smoking', 'cigarette',
      'alcohol', 'wine', 'beer', 'drink',
      'meat', 'vegan', 'vegetarian'
    ];

    for (const memory of memories) {
      const content = (memory.content || memory.text || '').toLowerCase();

      for (const category of conflictCategories) {
        if (content.includes(category)) {
          items.add(category);
        }
      }
    }

    return Array.from(items);
  }

  /**
   * Check if there's overlap between allergy items and preference items
   * ISSUE #699 FIX: Expanded to detect pet and other non-food conflicts
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

    // Category-level overlap - Food
    const seafoodItems = ['seafood', 'shellfish', 'fish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster'];
    const hasSeafoodAllergy = allergyItems.some(item => seafoodItems.includes(item));
    const hasSeafoodPreference = preferenceItems.some(item => seafoodItems.includes(item));

    if (hasSeafoodAllergy && hasSeafoodPreference) {
      return true;
    }

    // ISSUE #699: Category-level overlap - Pets
    const catItems = ['cat', 'cats', 'kitten', 'kitty', 'feline'];
    const dogItems = ['dog', 'dogs', 'puppy', 'canine'];
    const petItems = ['pet', 'pets', 'animal', 'animals'];

    const hasCatAllergy = allergyItems.some(item => catItems.includes(item));
    const hasCatPreference = preferenceItems.some(item => catItems.includes(item));

    const hasDogAllergy = allergyItems.some(item => dogItems.includes(item));
    const hasDogPreference = preferenceItems.some(item => dogItems.includes(item));

    const hasPetAllergy = allergyItems.some(item => petItems.includes(item));
    const hasPetPreference = preferenceItems.some(item => petItems.includes(item));

    if ((hasCatAllergy && hasCatPreference) ||
        (hasDogAllergy && hasDogPreference) ||
        (hasPetAllergy && hasPetPreference)) {
      return true;
    }

    return false;
  }

  /**
   * Check if response already acknowledges the conflict/tradeoff
   * ISSUE #713-NUA2: Made more strict to require explicit tension language
   */
  #responseAcknowledgesConflict(response) {
    const responseLower = response.toLowerCase();

    // STRONG indicators - these explicitly acknowledge tension/tradeoff
    const strongIndicators = [
      'tradeoff', 'trade-off', 'trade off',
      'conflict', 'tension',
      'dilemma',
      'difficult decision',
      'tough choice',
      'creates a tension',
      'competing interests',
      'opposing needs'
    ];

    // Check for explicit tension language
    for (const indicator of strongIndicators) {
      if (responseLower.includes(indicator)) {
        return true; // Has explicit tension acknowledgment
      }
    }

    // WEAK check: Only counts if it connects allergy AND preference with connective language
    // This catches: "You're allergic, but/however your wife wants..."
    const hasAllergy = /\b(allerg(?:y|ic)|intolerant)\b/i.test(response);
    const hasPreference = /\b(wife|husband|spouse|partner).*\b(wants?|loves?|prefers?)\b/i.test(response) ||
                          /\b(wants?|loves?|prefers?).*\b(wife|husband|spouse|partner)\b/i.test(response);
    const hasConnective = /\b(but|however|yet|although|while|on the other hand)\b/i.test(response);
    const hasComparison = /\b(versus|vs\.?|against|compared to)\b/i.test(response);

    // Only pass if has ALL three: allergy mention, preference mention, and connective/comparison
    // AND they appear close together (within 200 chars to ensure they're connected)
    if (hasAllergy && hasPreference && (hasConnective || hasComparison)) {
      // Check proximity - are allergy and preference mentioned in the same paragraph?
      const allergyIndex = response.toLowerCase().search(/\b(allerg(?:y|ic)|intolerant)\b/);
      const preferenceIndex = response.toLowerCase().search(/\b(wife|husband|spouse|partner).*\b(wants?|loves?|prefers?)\b|\b(wants?|loves?|prefers?).*\b(wife|husband|spouse|partner)\b/);
      
      if (allergyIndex >= 0 && preferenceIndex >= 0 && Math.abs(allergyIndex - preferenceIndex) < 200) {
        return true;
      }
    }

    // Default: no tension acknowledgment
    return false;
  }

  /**
   * Inject conflict acknowledgment into response
   * FIX #718 NUA2: Include both specific facts in tension statement
   */
  #injectConflictAcknowledgment(response, conflicts) {
    // Build injection text based on conflict type
    const injections = [];

    for (const conflict of conflicts) {
      if (conflict.type === 'allergy_vs_preference') {
        // Extract specific facts from memories
        const allergyFact = this.#extractAllergyFact(conflict.allergyMemories);
        const preferenceFact = this.#extractPreferenceFact(conflict.spousePreferenceMemories);

        // FIX #718 NUA2: Include BOTH facts in one sentence
        if (allergyFact && preferenceFact) {
          injections.push(`There's a real tradeoff here: ${allergyFact}, and ${preferenceFact}.`);
        } else {
          // Fallback to generic message
          injections.push("There's a real tradeoff here: your allergy vs your wife's preference.");
        }
      }
    }

    if (injections.length === 0) {
      return response;
    }

    // Prepend to response for maximum visibility
    return `${injections.join(' ')}\n\n${response}`;
  }

  /**
   * Extract allergy fact from memory content
   * FIX #718 NUA2: Helper to extract specific allergy fact
   */
  #extractAllergyFact(allergyMemories) {
    if (!allergyMemories || allergyMemories.length === 0) return null;

    const content = allergyMemories[0].toLowerCase();

    // Try to extract the specific allergy
    const allergyMatch = content.match(/(?:allergic to|allergy to|can't have|cannot have)\s+([a-z\s]+?)(?:\.|,|;|$)/i);
    if (allergyMatch) {
      const item = allergyMatch[1].trim();
      return `you're allergic to ${item}`;
    }

    // Fallback patterns
    if (content.includes('cat')) return "you're allergic to cats";
    if (content.includes('dog')) return "you're allergic to dogs";
    if (content.includes('seafood')) return "you're allergic to seafood";
    if (content.includes('nuts')) return "you're allergic to nuts";
    if (content.includes('dairy')) return "you're allergic to dairy";

    return "you have an allergy";
  }

  /**
   * Extract spouse preference fact from memory content
   * FIX #718 NUA2: Helper to extract specific preference fact
   */
  #extractPreferenceFact(spouseMemories) {
    if (!spouseMemories || spouseMemories.length === 0) return null;

    const content = spouseMemories[0].toLowerCase();

    // Extract spouse type
    const spouseType = content.match(/\b(wife|husband|spouse|partner)\b/i)?.[1] || 'spouse';

    // Try to extract what they love/like
    const preferenceMatch = content.match(/(?:loves?|likes?|wants?)\s+([a-z\s]+?)(?:\.|,|;|$)/i);
    if (preferenceMatch) {
      const item = preferenceMatch[1].trim();
      return `your ${spouseType} loves ${item}`;
    }

    // Fallback patterns
    if (content.includes('cat')) return `your ${spouseType} loves cats`;
    if (content.includes('dog')) return `your ${spouseType} loves dogs`;
    if (content.includes('seafood')) return `your ${spouseType} loves seafood`;

    return `your ${spouseType} has a preference`;
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
