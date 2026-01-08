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

// FALSE CONTINUITY CLAIMS (Issue #435 - ALWAYS strip these lies)
const FALSE_CONTINUITY_PATTERNS = [
  /\b(as|like) (we|I) (discussed|talked about|mentioned|said) (before|earlier|previously)\b/gi,
  /\b(as|like) (I|we) (said|mentioned|noted) (earlier|before|previously)\b/gi,
  /\byou (told|said to|mentioned to|asked) me (earlier|before|previously)\b/gi,
  /\bearlier (in|during) (our|this) (conversation|discussion|chat)\b/gi,
  /\bwhen (we|you) (discussed|talked about|mentioned) this (earlier|before)\b/gi,
  /\bremember (when|that) (we|you|I) (discussed|talked about|said)\b/gi,
];

// ENGAGEMENT BAIT ENDINGS (Issue #435 - strip for simple/factual queries)
const ENGAGEMENT_BAIT_ENDINGS = [
  /\n*Is there anything else (you'?d like to know|I can help you with|you need)\??\s*$/gi,
  /\n*Would you like (to know more|me to explain|further details)\??\s*$/gi,
  /\n*Do you (have|want) (other|any|more) questions\??\s*$/gi,
  /\n*Should I explain (further|more|this)\??\s*$/gi,
  /\n*Let me know if you (need|want|would like) (anything else|more information|help with anything)\!?\s*$/gi,
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

/**
 * Extract technical/unique terms from document (Issue #380 Fix 6)
 * @param {string} text - Text to extract terms from
 * @returns {array} Array of unique terms
 */
function extractDocumentTerms(text) {
  // SECURITY: Sanitize input to prevent ReDoS
  const safeText = typeof text === 'string' ? text.slice(0, 50000) : '';
  if (!safeText) return [];
  
  const terms = [];

  // CamelCase terms - bounded to prevent ReDoS
  // Allow optional lowercase after uppercase to catch patterns like 'XMLHttpRequest'
  const camelCase = safeText.match(/\b[A-Z][a-z]{0,30}(?:[A-Z][a-z]{0,30})+\b/g) || [];
  terms.push(...camelCase);

  // ACRONYMS - bounded to prevent ReDoS
  const acronyms = safeText.match(/\b[A-Z]{2,20}\b/g) || [];
  terms.push(...acronyms);

  // snake_case - bounded to prevent ReDoS, supports multiple segments
  const snakeCase = safeText.match(/[a-z]{1,50}(?:_[a-z]{1,50})+/gi) || [];
  terms.push(...snakeCase);

  // Unique set, lowercased
  return [...new Set(terms.map(t => t.toLowerCase()))];
}

/**
 * Validate response relevance to query (Issue #380 Fix 6, Issue #412 Fix)
 * @param {string} userQuery - The user's query
 * @param {string} aiResponse - The AI response
 * @param {object} context - Context including phase4Metadata and documentMetadata
 * @returns {object} { valid: boolean, reason: string, recommendation: string }
 */
function validateResponseRelevance(userQuery, aiResponse, context) {
  const documentMetadata = context?.documentMetadata || {};

  // Issue #412 Fix: Skip document relevance check if document was blocked
  if (documentMetadata.blocked === true) {
    console.log('[RESPONSE-CONTRACT] Skipping document relevance check - document was blocked by session limits');
    return { valid: true, skipped: true, reason: 'document_blocked' };
  }

  // For long documents, check that response addresses the document
  if (userQuery.length > 10000) {
    // Response should reference document content
    const documentTerms = extractDocumentTerms(userQuery);
    const responseTerms = extractDocumentTerms(aiResponse);

    const termOverlap = documentTerms.filter(t => responseTerms.includes(t)).length;
    const relevanceRatio = termOverlap / Math.max(documentTerms.length, 1);

    if (relevanceRatio < 0.1) {
      // Issue #412 Fix: If document was extracted (partial), this is a warning not a failure
      if (documentMetadata.extracted === true) {
        console.log('[RESPONSE-CONTRACT] Response may not fully address partial document extraction');
        return {
          valid: true,
          warning: true,
          reason: 'partial_extraction_incomplete_coverage',
          relevanceScore: relevanceRatio
        };
      }

      // Full document was provided but not addressed - this is a real failure
      console.log('[RESPONSE-CONTRACT] Response does not address document content');
      return {
        valid: false,
        reason: 'Response does not address document content',
        recommendation: 'REGENERATE_RESPONSE',
        relevanceScore: relevanceRatio
      };
    }
  }

  // Check for obvious misroutes
  const misrouteIndicators = [
    { pattern: /voting is a sacred/i, mismatch: 'political_redirect' },
    { pattern: /Bitcoin.*Ethereum.*price/i, mismatch: 'crypto_injection' },
    { pattern: /focus on the 20%.*80%/i, mismatch: 'generic_productivity' },
    { pattern: /combine approaches in novel ways/i, mismatch: 'template_injection' }
  ];

  for (const indicator of misrouteIndicators) {
    if (indicator.pattern.test(aiResponse)) {
      // Check if user actually asked about this
      if (!indicator.pattern.test(userQuery)) {
        console.log(`[RESPONSE-CONTRACT] Detected misroute: ${indicator.mismatch}`);
        return {
          valid: false,
          reason: `Detected misroute: ${indicator.mismatch}`,
          recommendation: 'REGENERATE_RESPONSE'
        };
      }
    }
  }

  return { valid: true };
}

function detectFormatConstraint(query) {
  for (const constraint of FORMAT_CONSTRAINTS) {
    if (constraint.pattern.test(query)) {
      return constraint.style;
    }
  }
  return null;
}

function enforceResponseContract(response, query, phase4Metadata = {}, documentMetadata = {}, queryClassification = null) {
  // ISSUE #435: If external lookup failed for volatile data, enforce MINIMAL response
  // The user doesn't need 200 words about why we can't answer - they need 20 words + where to find the answer
  const lookupFailed = phase4Metadata?.degraded === true;
  const minimalResponseRequired = phase4Metadata?.minimal_response_required === true;
  const maxResponseWords = phase4Metadata?.max_response_words || 50;

  if (lookupFailed && minimalResponseRequired) {
    console.log(`[RESPONSE-CONTRACT] External lookup failed - enforcing minimal response (max ${maxResponseWords} words)`);

    // Extract verification path from phase4Metadata
    const verificationSources = phase4Metadata?.verification_path?.sources || [];
    const disclosure = phase4Metadata?.disclosure || "I can't access current data for this query.";

    // Build minimal response: disclosure + verification path
    const sourceLinks = verificationSources
      .map(s => `${s.name}: ${s.url}`)
      .join(' or ');

    const minimalResponse = `${disclosure} Check current information at: ${sourceLinks}`;

    return {
      response: minimalResponse,
      contract: {
        triggered: true,
        style: 'minimal_redirect',
        minimal_response_enforced: true,
        original_length: response.length,
        final_length: minimalResponse.length,
        words_saved: Math.floor((response.length - minimalResponse.length) / 6),
        lookup_degraded: true
      }
    };
  }

  // ISSUE #431 FIX: Respect intelligent query classification
  // Simple queries should not have scaffolding stripped - they shouldn't have scaffolding added in the first place
  // However, we still enforce TRUTH checks (false claims, theater phrases)
  const respectClassification = queryClassification?.requiresScaffolding === false;

  if (respectClassification) {
    console.log(`[RESPONSE-CONTRACT] Respecting query classification: ${queryClassification.classification} - minimal hygiene only`);
  }

  const constraint = detectFormatConstraint(query);
  const userRequestedGuidance = GUIDANCE_REQUEST_PATTERNS.some(p => p.test(query));

  const result = {
    triggered: constraint !== null,
    hygiene_enforced: true, // Always enforce hygiene (Issue #378)
    style: constraint,
    stripped_sections_count: 0,
    stripped_sections: [],
    original_length: response.length,
    user_requested_guidance: userRequestedGuidance,
    classification_respected: respectClassification
  };

  // Issue #380 Fix 6, Issue #412 Fix: Validate response relevance with document metadata
  const relevanceValidation = validateResponseRelevance(query, response, { phase4Metadata, documentMetadata });

  // Handle skipped validation (blocked document)
  if (relevanceValidation.skipped) {
    result.relevance_valid = true;
    result.relevance_skipped = true;
    result.relevance_skip_reason = relevanceValidation.reason;
  }
  // Handle warning (partial extraction)
  else if (relevanceValidation.warning) {
    result.relevance_valid = true;
    result.relevance_warning = true;
    result.relevance_warning_reason = relevanceValidation.reason;
    if (relevanceValidation.relevanceScore !== undefined) {
      result.relevance_score = relevanceValidation.relevanceScore;
    }
  }
  // Handle failure
  else if (!relevanceValidation.valid) {
    console.log(`[RESPONSE-CONTRACT] Relevance validation failed: ${relevanceValidation.reason}`);
    result.relevance_valid = false;
    result.relevance_reason = relevanceValidation.reason;
    result.relevance_recommendation = relevanceValidation.recommendation;
    if (relevanceValidation.relevanceScore !== undefined) {
      result.relevance_score = relevanceValidation.relevanceScore;
    }
    // Note: We log the failure but still return the cleaned response
    // The orchestrator can decide whether to regenerate based on this
  } else {
    result.relevance_valid = true;
  }

  let cleanedResponse = response;

  // CRITICAL: Strip false continuity claims (ALWAYS - these are LIES)
  for (const pattern of FALSE_CONTINUITY_PATTERNS) {
    const matches = cleanedResponse.match(pattern);
    if (matches) {
      result.stripped_sections.push(...matches.map(m => `FALSE_CONTINUITY: "${m.substring(0, 40)}..."`));
      result.stripped_sections_count += matches.length;
      result.false_continuity_detected = true;
      // Replace with empty string or just the rest of the sentence
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }
  }

  // Strip engagement bait endings for simple/factual queries
  // Issue #435: Simple factual answers should end decisively, not invite more questions
  const isSimpleFact = queryClassification?.classification === 'simple_factual' ||
                       queryClassification?.classification === 'simple_short' ||
                       queryClassification?.classification === 'greeting';

  if (isSimpleFact) {
    for (const pattern of ENGAGEMENT_BAIT_ENDINGS) {
      const matches = cleanedResponse.match(pattern);
      if (matches) {
        result.stripped_sections.push(...matches.map(m => `ENGAGEMENT_BAIT: "${m.substring(0, 30)}..."`));
        result.stripped_sections_count += matches.length;
        result.engagement_bait_detected = true;
        cleanedResponse = cleanedResponse.replace(pattern, '');
      }
    }
  }

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
