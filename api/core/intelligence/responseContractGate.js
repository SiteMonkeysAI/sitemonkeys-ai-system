/**
 * responseContractGate.js
 *
 * RUNS LAST - After all other processing
 * Enforces user format constraints AND response hygiene (Issue #378)
 *
 * HYGIENE PRINCIPLE: Engagement padding = lying through theater
 * Strip phrases that add no value unless explicitly requested
 */

const FORMAT_CONSTRAINTS = [
  { pattern: /answer only|only (the |a )?(number|answer|result)/i, style: 'answer_only' },
  { pattern: /one (paragraph|sentence) (max|only|maximum)/i, style: 'single_block' },
  { pattern: /keep it (short|brief)|be (brief|concise|short)|briefly|make it (short|brief|concise)/i, style: 'minimal' },
  { pattern: /no disclaimers|without disclaimers/i, style: 'no_disclaimers' },
  { pattern: /reply with only|respond with only/i, style: 'strict_format' }
];

// User patterns that indicate they WANT guidance/steps (keep these sections)
const GUIDANCE_REQUEST_PATTERNS = [
  /give me (some |a )?step/i,
  /what (should|can) i do/i,
  /how (do|can) i/i,
  /what are my options/i,
  /show me alternatives/i,
  /what else could/i,
];

// HYGIENE BAD: Engagement padding sections (Issue #378)
// Strip by default UNLESS user explicitly requested guidance
const ENGAGEMENT_PADDING_SECTIONS = [
  /\*\*Simpler Paths Forward:\*\*[\s\S]*?(?=\n\n\*\*[A-Z]|\n\n---|\n\n[A-Z][a-z]|$)/gi,
  /\*\*Practical Next Steps:\*\*[\s\S]*?(?=\n\n\*\*[A-Z]|\n\n---|\n\n[A-Z][a-z]|$)/gi,
  /\*\*Do More With Less:\*\*[\s\S]*?(?=\n\n\*\*[A-Z]|\n\n---|\n\n[A-Z][a-z]|$)/gi,
  /\*\*Opportunities I See:\*\*[\s\S]*?(?=\n\n\*\*[A-Z]|\n\n---|\n\n[A-Z][a-z]|$)/gi,
];

// HYGIENE BAD: False claims and theater phrases (ALWAYS strip)
const ALWAYS_STRIP_SECTIONS = [
  /\[Note: Evaluate this recommendation.*?\]/gs,
  /\[FOUNDER PROTECTION:.*?\]/gs,
  /I want to be honest with you—I'm not as confident.*?perspectives\./gs,
  /My confidence in this analysis is lower than ideal.*?expert input\./gs,
  /To verify this information, you could:[\s\S]*?(?=\n\n[A-Z]|$)/gi,
  /I'm reasoning from general knowledge here, not verified specifics\.\n\n/g,
  /I'm reasoning about future possibilities, not verified facts\.\n\n/g,
  // False capability denials (Issue #378 Problem 2)
  /I don't have access to real-time information or current news feeds\.?\n*/gi,
  /I cannot access real-time information\.?\n*/gi,
  /I don't have the ability to access real-time data\.?\n*/gi,
];

const STRIPPABLE_SECTIONS = [...ALWAYS_STRIP_SECTIONS, ...ENGAGEMENT_PADDING_SECTIONS];

function detectFormatConstraint(query) {
  for (const constraint of FORMAT_CONSTRAINTS) {
    if (constraint.pattern.test(query)) {
      return constraint.style;
    }
  }
  return null;
}

function enforceResponseContract(response, query, phase4Metadata = {}) {
  const constraint = detectFormatConstraint(query);
  const userRequestedGuidance = GUIDANCE_REQUEST_PATTERNS.some(p => p.test(query));

  const result = {
    triggered: constraint !== null,
    hygiene_enforced: true, // Always enforce hygiene (Issue #378)
    style: constraint,
    stripped_sections_count: 0,
    stripped_sections: [],
    original_length: response.length,
    user_requested_guidance: userRequestedGuidance
  };

  let cleanedResponse = response;

  // ALWAYS strip these (false claims, theater)
  for (const pattern of ALWAYS_STRIP_SECTIONS) {
    const matches = cleanedResponse.match(pattern);
    if (matches) {
      result.stripped_sections.push(...matches.map(m => m.substring(0, 50) + '...'));
      result.stripped_sections_count += matches.length;
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }
  }

  // Strip engagement padding UNLESS user explicitly requested guidance
  if (!userRequestedGuidance) {
    for (const pattern of ENGAGEMENT_PADDING_SECTIONS) {
      const matches = cleanedResponse.match(pattern);
      if (matches) {
        result.stripped_sections.push(...matches.map(m => m.substring(0, 50) + '...'));
        result.stripped_sections_count += matches.length;
        cleanedResponse = cleanedResponse.replace(pattern, '');
      }
    }
  } else {
    console.log('[RESPONSE-CONTRACT] User requested guidance - keeping engagement sections');
  }

  // If format constraint detected, apply additional stripping
  if (constraint) {
    for (const pattern of STRIPPABLE_SECTIONS) {
      const matches = cleanedResponse.match(pattern);
      if (matches) {
        result.stripped_sections.push(...matches.map(m => m.substring(0, 50) + '...'));
        result.stripped_sections_count += matches.length;
        cleanedResponse = cleanedResponse.replace(pattern, '');
      }
    }
  }

  // For 'single_block', keep only the first paragraph
  if (constraint === 'single_block') {
    // Split by double newlines (paragraph breaks)
    const paragraphs = cleanedResponse.split(/\n\s*\n/).filter(p => p.trim());
    if (paragraphs.length > 0) {
      // Keep just the first substantial paragraph
      // Skip any that are just emoji headers like "🍌 **Roxy:**"
      let firstReal = paragraphs.find(p => p.trim().length > 50) || paragraphs[0];
      // Remove personality headers if present
      firstReal = firstReal.replace(/^🍌 \*\*(?:Eli|Roxy):\*\*.*?\n+/i, '').trim();
      cleanedResponse = firstReal;
    }
  }

  if (constraint === 'answer_only') {
    const numberMatch = cleanedResponse.match(/^\s*(\d[\d,\.]*)\s*$/m);
    if (numberMatch) {
      cleanedResponse = numberMatch[1];
    }
  }

  // For 'minimal', enforce brevity
  if (constraint === 'minimal') {
    // Strip all coaching/enhancement blocks
    cleanedResponse = cleanedResponse
      .replace(/🎯 \*\*Confidence Assessment:\*\*[\s\S]*?(?=\n\n[^🎯]|$)/gi, '')
      .replace(/\*\*Why:\*\*.*?\n/gi, '')
      .replace(/🍌 \*\*(?:Eli|Roxy):\*\*.*?\n+/gi, '')
      .replace(/\((?:Analytical|Empathetic) framework applied.*?\)\n*/gi, '');

    // If still too long, keep only first substantive sections
    if (cleanedResponse.length > 600) {
      const paragraphs = cleanedResponse.split(/\n\s*\n/).filter(p => p.trim());
      cleanedResponse = paragraphs.slice(0, 2).join('\n\n');
    }
  }

  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n').trim();
  result.final_length = cleanedResponse.length;
  result.hygiene_bad = result.stripped_sections_count > 0; // Issue #378

  console.log('[RESPONSE-CONTRACT]', {
    constraint: constraint || 'none',
    hygiene_stripped: result.stripped_sections_count,
    user_requested_guidance: userRequestedGuidance,
    hygiene_bad: result.hygiene_bad
  });

  return { response: cleanedResponse, contract: result };
}

export {
  detectFormatConstraint,
  enforceResponseContract,
  FORMAT_CONSTRAINTS,
  STRIPPABLE_SECTIONS
};
