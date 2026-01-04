/**
 * responseContractGate.js
 * 
 * RUNS LAST - After all other processing
 * Enforces user format constraints by stripping non-essential additions
 */

const FORMAT_CONSTRAINTS = [
  { pattern: /answer only|only (the |a )?(number|answer|result)/i, style: 'answer_only' },
  { pattern: /one (paragraph|sentence) (max|only|maximum)/i, style: 'single_block' },
  { pattern: /keep it (short|brief)|be (brief|concise|short)|briefly|make it (short|brief|concise)/i, style: 'minimal' },
  { pattern: /no disclaimers|without disclaimers/i, style: 'no_disclaimers' },
  { pattern: /reply with only|respond with only/i, style: 'strict_format' }
];

const STRIPPABLE_SECTIONS = [
  /\[Note: Evaluate this recommendation.*?\]/gs,
  /\[FOUNDER PROTECTION:.*?\]/gs,
  /Simpler Paths Forward:[\s\S]*?(?=\n\n[A-Z]|\n\n---|\n\nPractical|$)/gi,
  /Practical Next Steps:[\s\S]*?(?=\n\n[A-Z]|\n\n---|\n\nDo More|$)/gi,
  /Do More With Less:[\s\S]*?(?=\n\n[A-Z]|\n\n---|\n\nOpportunities|$)/gi,
  /Opportunities I See:[\s\S]*?(?=\n\n[A-Z]|\n\n---|\n\nSimpler|$)/gi,
  /I want to be honest with you—I'm not as confident.*?perspectives\./gs,
  /To verify this information, you could:[\s\S]*?(?=\n\n[A-Z]|$)/gi,
  /I'm reasoning from general knowledge here, not verified specifics\.\n\n/g,
  /I'm reasoning about future possibilities, not verified facts\.\n\n/g
];

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
  const result = {
    triggered: constraint !== null,
    style: constraint,
    stripped_sections_count: 0,
    stripped_sections: [],
    original_length: response.length
  };
  
  if (!constraint) {
    return { response, contract: result };
  }
  
  let cleanedResponse = response;
  
  for (const pattern of STRIPPABLE_SECTIONS) {
    const matches = cleanedResponse.match(pattern);
    if (matches) {
      result.stripped_sections.push(...matches.map(m => m.substring(0, 50) + '...'));
      result.stripped_sections_count += matches.length;
      cleanedResponse = cleanedResponse.replace(pattern, '');
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
  
  console.log('[RESPONSE-CONTRACT] Constraint:', constraint, '| Stripped:', result.stripped_sections_count);
  
  return { response: cleanedResponse, contract: result };
}

export {
  detectFormatConstraint,
  enforceResponseContract,
  FORMAT_CONSTRAINTS,
  STRIPPABLE_SECTIONS
};
