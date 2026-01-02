/**
 * Response Enhancer - Fix responses that fail doctrine gates
 *
 * This service improves AI responses to meet truth-first standards
 * by adding missing structure, caveats, and specificity.
 */

import { enforceDoctrineGates } from './doctrine-gates.js';

// ==================== ENHANCEMENT FUNCTIONS ====================

/**
 * Adds proper uncertainty structure to responses that lack it
 *
 * @param {string} response - The AI response to enhance
 * @param {array} missingParts - Parts missing from structure (explanation, framework)
 * @returns {string} Enhanced response
 */
export function addUncertaintyStructure(response, missingParts) {
  if (!missingParts || missingParts.length === 0) {
    return response;
  }

  let enhanced = response;

  // Add explanation if missing
  if (missingParts.includes('explanation')) {
    // Find the uncertainty statement
    const uncertaintyMatch = response.match(/(I don't know|I'm not sure|uncertain|unclear|cannot determine)[^.!?]*/i);

    if (uncertaintyMatch) {
      const uncertaintyStatement = uncertaintyMatch[0];
      const explanation = ' because my training data may not include this specific information';

      // Insert explanation after the uncertainty statement
      enhanced = response.replace(
        uncertaintyStatement,
        uncertaintyStatement + explanation
      );
    }
  }

  // Add framework if missing
  if (missingParts.includes('framework')) {
    // Add framework at the end
    const framework = '\n\nTo verify this information, you could:\n- Consult official documentation or authoritative sources\n- Seek expert advice from a qualified professional\n- Cross-reference multiple reliable sources';

    enhanced += framework;
  }

  return enhanced;
}

/**
 * Adds blind spots and caveats to advice/recommendations
 *
 * @param {string} response - The AI response to enhance
 * @param {object} context - Context about the request
 * @returns {string} Enhanced response
 */
export function addBlindSpots(response, context = {}) {
  // Detect where advice is given
  const advicePatterns = [
    /I recommend/i,
    /you should/i,
    /I suggest/i,
    /the best approach/i,
  ];

  let enhanced = response;

  // Check if this is high-stakes advice
  const isHighStakes = /invest|stock|crypto|financial|medical|diagnosis|legal|lawsuit/i.test(response);

  // Prepare caveats based on context
  let caveats = [];

  if (isHighStakes) {
    caveats.push('However, keep in mind that your specific situation may differ, and this advice may not apply universally.');
    caveats.push('Consider consulting with a qualified professional who can evaluate your individual circumstances.');
  } else {
    caveats.push('That said, this approach may not work for every situation, so consider your specific context and constraints.');
  }

  // Find a good place to insert caveats (after the first advice statement)
  for (const pattern of advicePatterns) {
    if (pattern.test(enhanced)) {
      // Find the first paragraph with advice
      const paragraphs = enhanced.split(/\n\n+/);
      let adviceParagraphIndex = -1;

      for (let i = 0; i < paragraphs.length; i++) {
        if (pattern.test(paragraphs[i])) {
          adviceParagraphIndex = i;
          break;
        }
      }

      if (adviceParagraphIndex >= 0 && adviceParagraphIndex < paragraphs.length - 1) {
        // Insert caveats after the advice paragraph
        paragraphs.splice(adviceParagraphIndex + 1, 0, caveats.join(' '));
        enhanced = paragraphs.join('\n\n');
        break;
      }
    }
  }

  // If no good insertion point found, add at end
  if (enhanced === response) {
    enhanced += '\n\n' + caveats.join(' ');
  }

  return enhanced;
}

/**
 * Removes engagement-prolonging phrases from response
 *
 * @param {string} response - The AI response to enhance
 * @returns {string} Enhanced response
 */
export function removeEngagementBait(response) {
  const baitPatterns = [
    /let me know if[^.!?\n]*/gi,
    /feel free to[^.!?\n]*/gi,
    /don't hesitate to[^.!?\n]*/gi,
    /I'm here if you[^.!?\n]*/gi,
    /happy to help with anything else[^.!?\n]*/gi,
    /any other questions[^.!?\n?]*/gi,
    /anything else I can[^.!?\n]*/gi,
    /I'm always here[^.!?\n]*/gi,
    /reach out anytime[^.!?\n]*/gi,
    /just ask[^.!?\n]*/gi,
  ];

  let cleaned = response;

  // Remove engagement bait phrases
  for (const pattern of baitPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean up any resulting double punctuation or extra whitespace
  cleaned = cleaned.replace(/[.!?]\s*[.!?]+/g, '.');
  cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Improves generic examples to be more specific
 *
 * @param {string} response - The AI response to enhance
 * @returns {string} Enhanced response
 */
export function improveExamples(response) {
  let improved = response;

  // Replace common generic patterns with more specific language
  const replacements = [
    { pattern: /such as X or Y/gi, replacement: 'such as [specific examples based on context]' },
    { pattern: /for example, you could/gi, replacement: 'For example, you could' },
    { pattern: /things like that/gi, replacement: 'similar approaches' },
    { pattern: /and so on/gi, replacement: '' },
    { pattern: /,\s*etc\.?/gi, replacement: '' },
  ];

  for (const { pattern, replacement } of replacements) {
    improved = improved.replace(pattern, replacement);
  }

  // Clean up double spaces and punctuation
  improved = improved.replace(/\s+/g, ' ');
  improved = improved.replace(/\s+([.,!?])/g, '$1');

  // Add note about examples if improvement is limited
  if (improved === response || /\[specific examples based on context\]/.test(improved)) {
    // Can't automatically improve - add note
    improved += '\n\n_Note: For more specific guidance, please provide additional context about your use case._';
  }

  return improved;
}

// ==================== MAIN ENHANCEMENT PIPELINE ====================

/**
 * Enhances a response to pass doctrine gates
 *
 * @param {string} response - The AI response to enhance
 * @param {object} gateResults - Results from doctrine gates evaluation
 * @param {object} context - Context about the request
 * @returns {object} Enhanced response and new evaluation results
 */
export function enhanceToPassGates(response, gateResults, context = {}) {
  let enhanced = response;
  const enhancements = [];

  // Apply enhancements for each failing gate
  if (gateResults.uncertainty.applicable && !gateResults.uncertainty.passed) {
    enhanced = addUncertaintyStructure(enhanced, gateResults.uncertainty.missing);
    enhancements.push('Added uncertainty structure');
  }

  if (gateResults.blindSpots.applicable && !gateResults.blindSpots.passed) {
    enhanced = addBlindSpots(enhanced, context);
    enhancements.push('Added blind spots and caveats');
  }

  if (!gateResults.antiEngagement.passed) {
    enhanced = removeEngagementBait(enhanced);
    enhancements.push('Removed engagement bait');
  }

  if (gateResults.exampleQuality.applicable && !gateResults.exampleQuality.passed) {
    enhanced = improveExamples(enhanced);
    enhancements.push('Improved example quality');
  }

  // Re-evaluate after enhancement
  const newResults = enforceDoctrineGates(enhanced, context);

  return {
    enhanced,
    newResults,
    enhancements,
    improved: newResults.compositeScore > gateResults.compositeScore,
  };
}
