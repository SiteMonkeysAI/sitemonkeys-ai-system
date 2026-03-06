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
    console.log(
      '[PROOF] validator:conflict-detection v=2026-02-06a file=api/lib/validators/conflict-detection.js fn=validate',
    );

    try {
      // Extract potential conflicts from memory context
      const conflicts = this.#detectConflicts(memoryContext);

      if (conflicts.length === 0) {
        return {
          correctionApplied: false,
          response: response,
        };
      }

      // Check if response already acknowledges the conflict/tradeoff
      const hasConflictAcknowledgment = this.#responseAcknowledgesConflict(response);

      if (hasConflictAcknowledgment) {
        return {
          correctionApplied: false,
          response: response,
        };
      }

      // Inject conflict acknowledgment
      const adjustedResponse = this.#injectConflictAcknowledgment(response, conflicts);

      console.log(
        `[CONFLICT-VALIDATOR] Injected conflict acknowledgment for ${conflicts.length} conflict(s)`,
      );

      this.#recordCorrection(conflicts, context);

      return {
        correctionApplied: true,
        response: adjustedResponse,
        adjustedResponse,
        conflicts: conflicts.map((c) => ({ type: c.type, description: c.description })),
        conflictsDetected: conflicts.length,
      };
    } catch (error) {
      console.error('[CONFLICT-VALIDATOR] Validation error:', error);

      return {
        correctionApplied: false,
        response: response,
        error: error.message,
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
    const memories = Array.isArray(memoryContext) ? memoryContext : memoryContext.memories || [];

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
      if (
        /\b(wife|husband|spouse|partner|girlfriend|boyfriend)\b.*\b(loves?|likes?|prefers?|wants?|enjoys?|favorites?)\b/i.test(
          content,
        ) ||
        /\b(loves?|likes?|prefers?|wants?|enjoys?|favorites?)\b.*\b(wife|husband|spouse|partner|girlfriend|boyfriend)\b/i.test(
          content,
        )
      ) {
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
          allergyMemories: allergyMemories.map((m) => m.content || m.text),
          spousePreferenceMemories: spousePreferenceMemories.map((m) => m.content || m.text),
        });
      }

      // DIAGNOSTIC: NUA2 - Log conflict detection results
      console.log('[DIAG-NUA2] ═══════════════════════════════════════════════════════');
      console.log(`[DIAG-NUA2] Checked ${memories.length} memories for conflicts`);
      console.log(`[DIAG-NUA2] Allergy memories found: ${allergyMemories.length}`);
      console.log(
        `[DIAG-NUA2] Spouse preference memories found: ${spousePreferenceMemories.length}`,
      );
      console.log(`[DIAG-NUA2] Total conflicts detected: ${conflicts.length}`);
      if (conflicts.length > 0) {
        conflicts.forEach((c, idx) => {
          console.log(`[DIAG-NUA2]   Conflict #${idx + 1}: ${c.type} - ${c.description}`);
        });
      }
      console.log('[DIAG-NUA2] ═══════════════════════════════════════════════════════');
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
      'seafood',
      'shellfish',
      'fish',
      'shrimp',
      'crab',
      'lobster',
      'clam',
      'oyster',
      'nuts',
      'peanuts',
      'tree nuts',
      'almonds',
      'cashews',
      'walnuts',
      'dairy',
      'milk',
      'cheese',
      'lactose',
      'gluten',
      'wheat',
      'bread',
      'eggs',
      'soy',
      'sesame',

      // ISSUE #699: Pet/animal conflicts (allergy vs preference)
      'cat',
      'cats',
      'kitten',
      'kitty',
      'feline',
      'dog',
      'dogs',
      'puppy',
      'canine',
      'pet',
      'pets',
      'animal',
      'animals',
      'bird',
      'birds',
      'parrot',
      'rabbit',
      'hamster',
      'guinea pig',

      // Other common conflict areas
      'smoke',
      'smoking',
      'cigarette',
      'alcohol',
      'wine',
      'beer',
      'drink',
      'meat',
      'vegan',
      'vegetarian',
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
    const seafoodItems = [
      'seafood',
      'shellfish',
      'fish',
      'shrimp',
      'crab',
      'lobster',
      'clam',
      'oyster',
    ];
    const hasSeafoodAllergy = allergyItems.some((item) => seafoodItems.includes(item));
    const hasSeafoodPreference = preferenceItems.some((item) => seafoodItems.includes(item));

    if (hasSeafoodAllergy && hasSeafoodPreference) {
      return true;
    }

    // ISSUE #699: Category-level overlap - Pets
    const catItems = ['cat', 'cats', 'kitten', 'kitty', 'feline'];
    const dogItems = ['dog', 'dogs', 'puppy', 'canine'];
    const petItems = ['pet', 'pets', 'animal', 'animals'];

    const hasCatAllergy = allergyItems.some((item) => catItems.includes(item));
    const hasCatPreference = preferenceItems.some((item) => catItems.includes(item));

    const hasDogAllergy = allergyItems.some((item) => dogItems.includes(item));
    const hasDogPreference = preferenceItems.some((item) => dogItems.includes(item));

    const hasPetAllergy = allergyItems.some((item) => petItems.includes(item));
    const hasPetPreference = preferenceItems.some((item) => petItems.includes(item));

    if (
      (hasCatAllergy && hasCatPreference) ||
      (hasDogAllergy && hasDogPreference) ||
      (hasPetAllergy && hasPetPreference)
    ) {
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
      'tradeoff',
      'trade-off',
      'trade off',
      'conflict',
      'tension',
      'dilemma',
      'difficult decision',
      'tough choice',
      'creates a tension',
      'competing interests',
      'opposing needs',
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
    const hasPreference =
      /\b(wife|husband|spouse|partner).*\b(wants?|loves?|prefers?)\b/i.test(response) ||
      /\b(wants?|loves?|prefers?).*\b(wife|husband|spouse|partner)\b/i.test(response);
    const hasConnective = /\b(but|however|yet|although|while|on the other hand)\b/i.test(response);
    const hasComparison = /\b(versus|vs\.?|against|compared to)\b/i.test(response);

    // Only pass if has ALL three: allergy mention, preference mention, and connective/comparison
    // AND they appear close together (within 200 chars to ensure they're connected)
    if (hasAllergy && hasPreference && (hasConnective || hasComparison)) {
      // Check proximity - are allergy and preference mentioned in the same paragraph?
      const allergyIndex = response.toLowerCase().search(/\b(allerg(?:y|ic)|intolerant)\b/);
      const preferenceIndex = response
        .toLowerCase()
        .search(
          /\b(wife|husband|spouse|partner).*\b(wants?|loves?|prefers?)\b|\b(wants?|loves?|prefers?).*\b(wife|husband|spouse|partner)\b/,
        );

      if (
        allergyIndex >= 0 &&
        preferenceIndex >= 0 &&
        Math.abs(allergyIndex - preferenceIndex) < 200
      ) {
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
          const injection = `There's a real tradeoff here: ${allergyFact}, and ${preferenceFact}.`;
          injections.push(injection);
          // FIX #721 NUA2: Log exact injection for debugging
          console.log(`[NUA2-DEBUG] Injected conflict sentence: "${injection}"`);
        } else {
          // Fallback to generic message
          const injection = "There's a real tradeoff here: your allergy vs your wife's preference.";
          injections.push(injection);
          console.log(`[NUA2-DEBUG] Injected fallback sentence: "${injection}"`);
        }
      }
    }

    if (injections.length === 0) {
      return response;
    }

    // Prepend to response for maximum visibility
    const finalResponse = `${injections.join(' ')}\n\n${response}`;
    // FIX #721 NUA2: Log the full final response to see if injection is preserved
    console.log(`[NUA2-DEBUG] Final response starts with: "${finalResponse.substring(0, 200)}"`);
    return finalResponse;
  }

  /**
   * Extract allergy fact from memory content
   * FIX #731 NUA2: Use EXACT stored allergy text, not synthesized wording
   */
  #extractAllergyFact(allergyMemories) {
    if (!allergyMemories || allergyMemories.length === 0) return null;

    const originalContent = allergyMemories[0]; // Keep original case
    const content = originalContent.toLowerCase();

    // Extract the EXACT allergy phrase from the original text
    // Pattern: "I'm [severity] allergic to [item]" or "I have [type] allergy"

    // Try to capture the complete allergy statement
    const allergyMatch = originalContent.match(
      /\b(I(?:'m| am)\s+(?:severely\s+)?allergic\s+to\s+[a-z\s]+)/i,
    );
    if (allergyMatch) {
      // Convert "I'm" to "you're"
      const statement = allergyMatch[1]
        .replace(/^I'm\s+/i, "you're ")
        .replace(/^I am\s+/i, 'you are ');
      return statement;
    }

    // Fallback: simple extraction
    const simpleMatch = content.match(/(?:allergic to|allergy to)\s+([a-z\s]+?)(?:\.|,|;|$)/i);
    if (simpleMatch) {
      const item = simpleMatch[1].trim();
      return `you're allergic to ${item}`;
    }

    // Last resort fallback patterns
    if (content.includes('cat')) return "you're allergic to cats";
    if (content.includes('dog')) return "you're allergic to dogs";
    if (content.includes('seafood')) return "you're allergic to seafood";

    return 'you have an allergy';
  }

  /**
   * Extract spouse preference fact from memory content
   * FIX #731 NUA2: Use EXACT stored preference text, not synthesized wording
   */
  #extractPreferenceFact(spouseMemories) {
    if (!spouseMemories || spouseMemories.length === 0) return null;

    const originalContent = spouseMemories[0]; // Keep original case
    const content = originalContent.toLowerCase();

    // Extract spouse type
    const spouseType = content.match(/\b(wife|husband|spouse|partner)\b/i)?.[1] || 'spouse';

    // Extract the EXACT preference phrase from the original text
    // Pattern: "[spouse] [verb] [object]"
    // Examples: "wife really wants to adopt a cat", "wife loves cats", "husband likes dogs"

    // Try to find the complete phrase after the spouse mention
    const afterSpouse = originalContent.match(/\b(wife|husband|spouse|partner)\s+(.+?)(?:\.|$)/i);
    if (afterSpouse) {
      const prefPhrase = afterSpouse[2].trim();
      // Use the exact phrase: "your [spouse] [exact phrase]"
      return `your ${spouseType} ${prefPhrase}`;
    }

    // Fallback: try to construct from common patterns but use original text
    const preferenceMatch = originalContent.match(
      /\b(wife|husband|spouse|partner)\s+(really\s+)?(wants?|would\s+like|loves?|likes?|prefers?)\s+(to\s+)?(.+?)(?:\.|,|;|$)/i,
    );
    if (preferenceMatch) {
      const verb = preferenceMatch[3];
      const toPhrase = preferenceMatch[4] || '';
      const object = preferenceMatch[5].trim();
      return `your ${spouseType} ${preferenceMatch[2] || ''}${verb} ${toPhrase}${object}`;
    }

    return `your ${spouseType} has a preference`;
  }

  /**
   * Record correction for debugging
   */
  #recordCorrection(conflicts, context) {
    const record = {
      timestamp: new Date().toISOString(),
      conflicts: conflicts.map((c) => ({ type: c.type, description: c.description })),
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
      conflictsByType: this.#countConflictsByType(),
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
