// ================================================================
// intelligent-storage.js - Intelligent Memory Storage with Compression & Deduplication
// Provides 10-20:1 compression ratio and duplicate detection
// ================================================================

import { OpenAI } from 'openai';
import { encoding_for_model } from 'tiktoken';
import { logMemoryOperation } from '../routes/debug.js';
import { embedMemoryNonBlocking } from '../services/embedding-service.js';
import { generateFactFingerprint, storeWithSupersession } from '../services/supersession.js';
import { SemanticAnalyzer } from '../core/intelligence/semantic_analyzer.js';

// Initialize semantic analyzer for importance scoring
const semanticAnalyzer = new SemanticAnalyzer();

/**
 * Boilerplate patterns that should NEVER be stored in memory
 */
const BOILERPLATE_PATTERNS = [
  /I don't retain memory/i,
  /session-based memory/i,
  /this appears to be our first interaction/i,
  /I'm an AI assistant/i,
  /confidence is lower than ideal/i,
  /I should clarify/i,
  /founder protection/i,
  /I cannot access previous conversations/i,
  /I don't have access to/i
];

/**
 * Intelligent Memory Storage System
 * Compresses verbose conversations and prevents duplicate storage
 */
export class IntelligentMemoryStorage {
  constructor(db, openaiKey) {
    // VALIDATION ADDED: ensure a usable database handle is provided
    if (!db || typeof db.query !== 'function') {
      throw new Error('Invalid database handle passed to IntelligentMemoryStorage');
    }

    this.db = db;
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.encoder = null;

    // Initialize encoder lazily to avoid blocking constructor
    this.initEncoder();
  }

  /**
   * Initialize tiktoken encoder
   */
  initEncoder() {
    try {
      this.encoder = encoding_for_model('gpt-4');
      console.log('[INTELLIGENT-STORAGE] ✅ Tiktoken encoder initialized');
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoder initialization failed:', error.message);
      console.log('[INTELLIGENT-STORAGE] Will use fallback token counting');
    }
  }

  /**
   * Sanitize content before storage - remove AI boilerplate
   * @param {string} content - Content to sanitize
   * @returns {string|null} - Sanitized content or null if should not be stored
   */
  sanitizeForStorage(content) {
    if (!content || typeof content !== 'string') return null;

    let sanitized = content;

    // Remove boilerplate patterns
    for (const pattern of BOILERPLATE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Trim and check if anything meaningful remains
    sanitized = sanitized.trim();

    // Reject if too short or looks like pure boilerplate
    if (sanitized.length < 10) return null;
    if (sanitized.toLowerCase().includes("i'm an ai")) return null;

    return sanitized;
  }

  /**
   * Detect fingerprint from EXTRACTED FACTS using semantic pattern matching
   * This is the CRITICAL FIX for Issue #498
   *
   * Instead of running brittle regex on raw user input, we detect fingerprints
   * on the CLEANED/COMPRESSED facts that the system already extracts.
   *
   * DOCTRINE ALIGNMENT:
   * - Genuine Intelligence (Doctrine 3): Uses semantic understanding on compressed facts
   * - Innovation #2: Enables semantic deduplication by detecting canonical fact types
   * - Innovation #3: Enables supersession by identifying updatable facts
   *
   * @param {string} facts - Extracted facts (compressed, cleaned content)
   * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string }>}
   */
  async detectFingerprintFromFacts(facts) {
    if (!facts || typeof facts !== 'string') {
      return { fingerprint: null, confidence: 0, method: 'invalid_input' };
    }

    const factsLower = facts.toLowerCase();
    console.log('[SEMANTIC-FINGERPRINT] Analyzing facts:', facts.substring(0, 100));

    // CANONICAL FACT PATTERNS - Semantic, comprehensive detection
    // These patterns work on CLEANED facts, not raw user input
    // They detect semantic indicators (what the fact is about) + value patterns (specific values)
    const canonicalPatterns = [
      {
        id: 'user_salary',
        semanticIndicators: ['salary', 'income', 'pay', 'compensation', 'earning', 'wage', 'make', 'paid', 'raise', 'paying', 'giving', 'bumped', 'increased', 'promoted'],
        // Using bounded patterns to prevent ReDoS vulnerability
        // Pattern matches: $123, $1,234, $123.45, $1,234.56, 123k, 90k, 12345 (5-9 digits)
        valuePatterns: [/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/, /\$\d+/, /\d{1,6}k\b/i, /\d{5,9}/],
        confidence: 0.90
      },
      {
        id: 'user_job_title',
        semanticIndicators: ['job', 'position', 'role', 'title', 'work as', 'employed as', 'engineer', 'manager', 'developer', 'analyst', 'director'],
        confidence: 0.85
      },
      {
        id: 'user_employer',
        semanticIndicators: ['company', 'employer', 'work at', 'employed by', 'organization', 'firm', 'working for'],
        confidence: 0.85
      },
      {
        id: 'user_phone_number',
        semanticIndicators: ['phone', 'number', 'call', 'mobile', 'cell', 'telephone', 'reach'],
        valuePatterns: [/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/, /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/],
        confidence: 0.95
      },
      {
        id: 'user_email',
        semanticIndicators: ['email', 'e-mail', 'mail', 'contact'],
        valuePatterns: [/[\w.-]+@[\w.-]+\.\w+/],
        confidence: 0.95
      },
      {
        id: 'user_location',
        semanticIndicators: ['address', 'live', 'reside', 'location', 'home', 'house', 'moved', 'moving', 'based', 'from', 'relocate', 'relocated', 'city', 'town', 'state'],
        // Value patterns are optional - location is often detected by semantic indicators alone
        // Pattern matches city names like "Austin", "Austin Texas", "Seattle, WA"
        valuePatterns: [/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,?\s*[A-Z]{2})?\b/],
        confidence: 0.85
      },
      {
        id: 'user_name',
        semanticIndicators: ['name', 'called', 'i\'m', 'i am'],
        confidence: 0.85
      },
      {
        id: 'user_allergy',
        semanticIndicators: ['allergy', 'allergic', 'intolerant', 'cannot eat', 'reaction to', 'peanut', 'shellfish', 'lactose', 'anaphylaxis', 'sensitivity'],
        priority: 'critical',  // CRITICAL - Safety critical
        confidence: 0.95  // HIGH - Safety critical
      },
      {
        id: 'user_medical',
        semanticIndicators: ['medical', 'condition', 'diagnosis', 'disease', 'illness', 'health', 'doctor'],
        confidence: 0.90  // HIGH - Health critical
      },
      {
        id: 'user_age',
        semanticIndicators: ['age', 'years old', 'born', 'birthday'],
        valuePatterns: [/\d{1,3}\s*years/, /\d{1,3}\s*old/, /age\s*\d+/],
        confidence: 0.90
      },
      {
        id: 'user_marital_status',
        semanticIndicators: ['married', 'single', 'divorced', 'engaged', 'spouse', 'wife', 'husband', 'partner'],
        confidence: 0.90
      },
      {
        id: 'user_spouse_name',
        semanticIndicators: ['wife', 'husband', 'spouse', 'partner', 'married to'],
        confidence: 0.85
      },
      {
        id: 'user_children_count',
        semanticIndicators: ['child', 'children', 'kid', 'son', 'daughter'],
        confidence: 0.85
      },
      {
        id: 'user_pet',
        semanticIndicators: ['pet', 'dog', 'cat', 'bird', 'fish', 'animal'],
        confidence: 0.80
      },
      {
        id: 'user_meeting_time',
        semanticIndicators: ['meeting', 'appointment', 'call', 'scheduled', 'rescheduled', 'moved', 'changed'],
        valuePatterns: [/\d{1,2}:\d{2}/, /\d{1,2}\s?(am|pm)/i, /\d{1,2}pm/i],
        confidence: 0.90
      },
      {
        id: 'user_favorite_color',
        semanticIndicators: ['favorite color', 'favourite color', 'color', 'like', 'prefer'],
        confidence: 0.80
      },
      {
        id: 'user_timezone',
        semanticIndicators: ['timezone', 'time zone', 'est', 'pst', 'cst', 'mst', 'utc', 'gmt'],
        confidence: 0.85
      }
    ];

    // Semantic matching: Check for indicator presence + value patterns (if required)
    for (const pattern of canonicalPatterns) {
      const hasIndicator = pattern.semanticIndicators.some(ind => factsLower.includes(ind.toLowerCase()));

      if (hasIndicator) {
        // If value patterns exist, verify at least one matches
        if (pattern.valuePatterns) {
          const hasValue = pattern.valuePatterns.some(vp => vp.test(facts));
          if (hasValue) {
            console.log(`[SEMANTIC-FINGERPRINT] ✅ Detected ${pattern.id} from facts (indicator + value, confidence: ${pattern.confidence})`);
            return {
              fingerprint: pattern.id,
              confidence: pattern.confidence,
              method: 'semantic_facts_with_value'
            };
          } else {
            // Indicator found but no value - assign with LOWER confidence
            // This ensures supersession still triggers, just with less certainty
            console.log(`[SEMANTIC-FINGERPRINT] ⚠️ Found ${pattern.id} indicator but no value pattern - assigning with reduced confidence`);
            return {
              fingerprint: pattern.id,
              confidence: pattern.confidence * 0.6,  // 60% of normal confidence
              method: 'semantic_indicator_only'
            };
          }
        } else {
          // No value pattern required, indicator is sufficient
          console.log(`[SEMANTIC-FINGERPRINT] ✅ Detected ${pattern.id} from facts (semantic indicator, confidence: ${pattern.confidence})`);
          return {
            fingerprint: pattern.id,
            confidence: pattern.confidence,
            method: 'semantic_facts'
          };
        }
      }
    }

    console.log('[SEMANTIC-FINGERPRINT] ❌ No fingerprint detected in facts');
    return { fingerprint: null, confidence: 0, method: 'no_match' };
  }

  /**
   * PROBLEM 3 FIX: Detect non-user-specific queries that shouldn't be stored
   * Memory is for information ABOUT the user, not general world information
   * @param {string} content - User message to check
   * @returns {object} - { shouldSkip: boolean, reason: string }
   */
  detectNonUserQuery(content) {
    if (!content || typeof content !== 'string') {
      return { shouldSkip: false, reason: null };
    }

    const contentLower = content.toLowerCase();

    // News/current events queries (not about the user)
    const newsPatterns = [
      /what'?s (?:in|on) the news/i,
      /what'?s happening (?:in|with|on|today)/i,
      /tell me (?:about|the) (?:latest|current|today'?s) (?:news|headlines|stories)/i,
      /(?:top|latest|recent) (?:news|headlines|stories)/i,
      /what happened (?:with|to|in)/i  // "what happened with Tesla" - not about user
    ];

    for (const pattern of newsPatterns) {
      if (pattern.test(content)) {
        return { shouldSkip: true, reason: 'general_news_query_not_about_user' };
      }
    }

    // Weather queries (unless personal context like "should I bring umbrella")
    if (/what'?s the weather/i.test(content) && !/\b(i|my|should i|do i need)\b/i.test(content)) {
      return { shouldSkip: true, reason: 'general_weather_query_not_about_user' };
    }

    // General information queries without personal context
    const generalInfoPatterns = [
      /^(?:what|who|when|where|why|how) (?:is|are|was|were|did|does|do)/i,  // "What is Bitcoin?"
      /^define /i,
      /^explain /i
    ];

    // Only skip if NO personal indicators
    const hasPersonalIndicators = /\b(i|my|me|our|we|should i|can i|do i|am i)\b/i.test(content);

    if (!hasPersonalIndicators) {
      for (const pattern of generalInfoPatterns) {
        if (pattern.test(content)) {
          return { shouldSkip: true, reason: 'general_info_query_no_personal_context' };
        }
      }
    }

    return { shouldSkip: false, reason: null };
  }

  /**
   * Detect if message is a question (retrieval request vs storage statement)
   * Questions should not trigger storage because they don't contain facts
   * Fix #586: Prevents storing garbage like "(No facts to extract)."
   * @param {string} content - User message to check
   * @returns {boolean} - True if message is a question
   */
  detectQuestion(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }

    const trimmed = content.trim();

    // Question mark at the end is the most reliable indicator
    if (trimmed.endsWith('?')) {
      return true;
    }

    // Question words at the start (what, where, when, why, who, how, which, can, do, does, is, are, was, were)
    const questionStarters = [
      /^what\s/i,
      /^where\s/i,
      /^when\s/i,
      /^why\s/i,
      /^who\s/i,
      /^how\s/i,
      /^which\s/i,
      /^can\s(i|you|we)/i,
      /^could\s(i|you|we)/i,
      /^do\s(i|you|we)/i,
      /^does\s/i,
      /^did\s(i|you|we)/i,
      /^is\s(there|this|that)/i,
      /^are\s(there|these|those)/i,
      /^was\s/i,
      /^were\s/i,
      /^should\s(i|we)/i,
      /^would\s(you|it)/i,
      /^will\s(you|it)/i
    ];

    for (const pattern of questionStarters) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect if user is expressing priorities (UX-049)
   * @param {string} content - Content to check
   * @returns {boolean} - True if priority language detected
   */
  detectUserPriority(content) {
    if (!content || typeof content !== 'string') return false;

    const PRIORITY_PATTERNS = [
      /(?:i |my )(?:priority|priorities|most important|care most about)/i,
      /(?:always|never) (?:want|need|prefer)/i,
      /(?:this is|that's) (?:important|critical|essential)/i,
      /(?:don't|do not) ever/i,
      /(?:make sure|ensure|remember that)/i
    ];

    for (const pattern of PRIORITY_PATTERNS) {
      if (pattern.test(content)) {
        console.log(`[PRIORITY-DETECT] Pattern matched: ${pattern.toString()}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Extract temporal anchors from content (Issue #643 - INF3)
   * Detects end years and duration information for temporal memory
   * @param {string} content - Content to analyze
   * @returns {object} - Temporal metadata { end_year, duration_years }
   */
  extractTemporalAnchors(content) {
    if (!content || typeof content !== 'string') return {};

    // SECURITY: Bound input to prevent ReDoS (CodeQL fix for polynomial regex)
    const safeContent = content.substring(0, 500);

    const temporal = {};

    // Detect end-year pattern: "left in 2020", "quit in 2019", "until 2021"
    const endYearMatch = safeContent.match(/(left|quit|ended|until|departed|finished|stopped).*?((?:19|20)\d{2})/i);
    if (endYearMatch) {
      temporal.end_year = parseInt(endYearMatch[2]);
      console.log(`[TEMPORAL] anchor_stored end_year=${temporal.end_year}`);
    }

    // Detect duration pattern: "worked for 5 years", "spent 3 years"
    const durationMatch = safeContent.match(/(worked|spent|for)\s+(\d+)\s+years?/i);
    if (durationMatch) {
      temporal.duration_years = parseInt(durationMatch[2]);
      console.log(`[TEMPORAL] anchor_stored duration_years=${temporal.duration_years}`);
    }

    return temporal;
  }

  /**
   * Extract pricing anchors from content (Issue #648 - EDG3)
   * Detects monetary values and pricing information
   * @param {string} content - Content to analyze
   * @returns {string[]} - Array of pricing strings
   */
  extractPricingAnchors(content) {
    if (!content || typeof content !== 'string') return [];

    // SECURITY: Bound input to prevent ReDoS
    const safeContent = content.substring(0, 500);

    const prices = [];

    // Pattern 1: Dollar amounts: $99, $1,234, $1,234.56
    const dollarPattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
    const dollarMatches = safeContent.match(dollarPattern) || [];
    prices.push(...dollarMatches);

    // Pattern 2: Price with context: "costs $99", "price is $299"
    // Already captured by dollarPattern

    // Pattern 3: Abbreviated amounts: "99/month", "$50 per month"
    const perPattern = /\$?\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:per|\/)\s*(?:month|year|mo|yr)/gi;
    const perMatches = safeContent.match(perPattern) || [];
    prices.push(...perMatches);

    // Deduplicate and clean
    const uniquePrices = [...new Set(prices)]
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (uniquePrices.length > 0) {
      console.log(`[PRICING] anchors_stored prices=[${uniquePrices.join(', ')}]`);
    }

    return uniquePrices;
  }

  /**
   * Extract unicode names from content (Issue #643 - CMP2)
   * Preserves names with diacritics and non-ASCII characters
   * Extracts full name spans, not fragments
   * FIX #648: Support single-word names with diacritics and CJK names
   * @param {string} content - Content to analyze
   * @returns {string[]} - Array of unicode names
   */
  extractUnicodeNames(content) {
    if (!content || typeof content !== 'string') return [];

    // SECURITY: Bound input to prevent ReDoS (CodeQL fix for polynomial regex)
    const safeContent = content.substring(0, 500);

    console.log(`[STORAGE-CONTRACT] unicode_input="${safeContent.substring(0, 100)}"`);

    // Pattern 1: Multi-word names like "José García-López"
    const multiWordPattern = /(?:[A-Z][a-zÀ-ÿ]+[-\s]?)+[A-ZÀ-ÿ][a-zÀ-ÿ]+/g;

    // Pattern 2: Single words with diacritics like "Björn", "José"
    // Must have at least one diacritic character (À-ÿ)
    const singleWordPattern = /\b[A-ZÀ-ÿ][a-zÀ-ÿ]*[À-ÿ][a-zÀ-ÿ]*\b/g;

    // Pattern 3: CJK names (Chinese, Japanese, Korean characters)
    // Matches 2-4 consecutive CJK characters
    const cjkPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]{2,4}/g;

    // Pattern 4: Capitalized words adjacent to CJK (like "Zhang Wei")
    // This catches romanized Asian names near context clues
    const cjkAdjacentPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;

    const multiMatches = safeContent.match(multiWordPattern) || [];
    const singleMatches = safeContent.match(singleWordPattern) || [];
    const cjkMatches = safeContent.match(cjkPattern) || [];

    // For adjacent pattern, only include if near "contact", "name", or other context
    let adjacentMatches = [];
    if (/contact|name|colleague|friend|client/i.test(safeContent)) {
      adjacentMatches = safeContent.match(cjkAdjacentPattern) || [];
    }

    // Combine all matches and deduplicate
    const allMatches = [...new Set([...multiMatches, ...singleMatches, ...cjkMatches, ...adjacentMatches])];

    console.log(`[STORAGE-CONTRACT] pattern_matches=${JSON.stringify(allMatches)}`);

    // Clean up matches
    const unicodeNames = allMatches
      .map(m => m.replace(/[.,;:!?'")\]}>]+$/, '').trim())
      .filter(m => m.length > 0)
      .filter(m => {
        // Keep if: has diacritic, has CJK, or is multi-word capitalized
        return /[À-ÿ\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(m) ||
               /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(m);
      });

    if (unicodeNames.length > 0) {
      console.log(`[UNICODE] anchors_stored names=[${unicodeNames.join(', ')}]`);
    } else {
      console.log(`[UNICODE] anchors_stored names=[] (no matches found)`);
    }

    return unicodeNames;
  }

  /**
   * Extract descriptor signature for entity (Issue #643 - NUA1)
   * Identifies relationship descriptors to prevent inappropriate deduplication
   * @param {string} content - Content to analyze
   * @returns {string} - Descriptor like 'friend', 'colleague', 'unknown'
   */
  getDescriptorSignature(content) {
    if (!content || typeof content !== 'string') return 'unknown';

    const descriptors = ['friend', 'colleague', 'coworker', 'manager', 'boss',
                        'neighbor', 'brother', 'sister', 'partner', 'wife', 'husband',
                        'cousin', 'uncle', 'aunt', 'client', 'vendor', 'contractor'];
    const contentLower = content.toLowerCase();

    for (const descriptor of descriptors) {
      if (contentLower.includes(descriptor)) {
        console.log(`[STORAGE-CONTRACT] descriptor_content="${content.substring(0, 50)}" detected="${descriptor}"`);
        return descriptor;
      }
    }

    console.log(`[STORAGE-CONTRACT] descriptor_content="${content.substring(0, 50)}" detected="unknown"`);
    return 'unknown';
  }

  /**
   * Detect explicit memory storage requests (Fix #557-T2)
   * When user explicitly asks to remember something, store it verbatim without compression
   *
   * SECURITY NOTE: Uses string-based detection instead of regex to prevent ReDoS attacks
   *
   * @param {string} content - User message to check
   * @returns {{isExplicit: boolean, extractedContent: string|null}} - Detection result
   */
  detectExplicitMemoryRequest(content) {
    // EXECUTION PROOF - Verify explicit memory detection is active (A5)
    console.log('[PROOF] storage:explicit-detect v=2026-01-29a file=api/memory/intelligent-storage.js fn=detectExplicitMemoryRequest');
    
    if (!content || typeof content !== 'string') {
      return { isExplicit: false, extractedContent: null };
    }

    // SECURITY: Limit input length to prevent ReDoS attacks
    const MAX_CONTENT_LENGTH = 10000;
    if (content.length > MAX_CONTENT_LENGTH) {
      console.warn('[SECURITY] Content exceeds max length for pattern detection, skipping');
      return { isExplicit: false, extractedContent: null };
    }

    // Use string-based detection instead of regex to prevent ReDoS
    // All prefixes in lowercase for case-insensitive matching
    const lowerContent = content.toLowerCase().trim();
    const prefixes = [
      'remember this exactly:',
      'please remember this exactly:',
      'remember this:',
      'please remember this:',
      'please remember:',
      'remember:',
      'store this:',
      'save this:',
      'keep this:',
      'store this ',
      'save this ',
      'keep this ',
      'i need you to remember ',
      'please remember ',
      "don't forget ",
      "do not forget "
    ];

    for (const prefix of prefixes) {
      if (lowerContent.startsWith(prefix)) {
        // Extract content after the prefix (use original content to preserve case)
        // Since lowerContent and content have same length, prefix length is consistent
        const startIdx = prefix.length;
        const extracted = content.slice(startIdx).trim();
        
        if (extracted && extracted.length > 0) {
          console.log(`[EXPLICIT-MEMORY] ✅ Detected explicit storage request`);
          console.log(`[EXPLICIT-MEMORY] Trigger: "${prefix}"`);
          console.log(`[EXPLICIT-MEMORY] Content to store: "${extracted.substring(0, 100)}..."`);
          return { isExplicit: true, extractedContent: extracted };
        }
      }
    }

    return { isExplicit: false, extractedContent: null };
  }

  /**
   * Detect ordinal facts in content (e.g., "my first code is X", "my second code is Y")
   * Returns ordinal metadata for storage
   * @param {string} content - User message
   * @returns {object} - { hasOrdinal, ordinal, subject, pattern, value }
   */
  detectOrdinalFact(content) {
    if (!content || typeof content !== 'string') {
      return { hasOrdinal: false };
    }

    const contentLower = content.toLowerCase();

    // Ordinal mapping
    const ORDINAL_PATTERNS = {
      // Word ordinals
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
      sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
      // Number ordinals
      '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
      '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
      // Numeric
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };

    // Pattern: "my [ordinal] [subject]" or "the [ordinal] [subject]"
    const ordinalRegex = /\b(my|the)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|one|two|three|four|five|six|seven|eight|nine|ten)\s+(\w+)/gi;
    const matches = [...contentLower.matchAll(ordinalRegex)];

    if (matches.length > 0) {
      const match = matches[0]; // Use first match
      const ordinalWord = match[2].toLowerCase();
      const ordinalNum = ORDINAL_PATTERNS[ordinalWord];
      const subject = match[3];

      // Try to extract the value after "is/was/are"
      // Example: "My first code is CHARLIE-123" → extract "CHARLIE-123"
      let value = null;
      if (typeof match.index === 'number') {
        const afterMatchIndex = match.index + match[0].length;
        const remainder = content.slice(afterMatchIndex);

        // Skip leading whitespace
        const wsMatch = remainder.match(/^\s+/);
        const startAfterWs = wsMatch ? wsMatch[0].length : 0;
        const afterWs = remainder.slice(startAfterWs);

        // Check for "is", "was", "are" or ":"
        const verbMatch = afterWs.match(/^(is|was|are|:)\b/i);
        if (verbMatch) {
          const afterVerb = afterWs.slice(verbMatch[0].length);
          const wsAfterVerbMatch = afterVerb.match(/^\s+/);
          const startValue = wsAfterVerbMatch ? wsAfterVerbMatch[0].length : 0;
          const valueCandidate = afterVerb.slice(startValue);

          // Extract and validate the value using a static regex
          const staticValueMatch = valueCandidate.match(/^([A-Z0-9][A-Z0-9-_]{2,})/i);
          if (staticValueMatch) {
            value = staticValueMatch[1];
            console.log(`[ORDINAL-DETECT] Found ordinal with value: ${ordinalWord} ${subject} = ${value} (#${ordinalNum})`);
          }
        }
      }

      return {
        hasOrdinal: true,
        ordinal: ordinalNum,
        subject: subject,
        pattern: `${ordinalWord} ${subject}`,
        value: value
      };
    }

    return { hasOrdinal: false };
  }

  /**
   * Main entry point - stores memory with compression and deduplication
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result with action taken
   */
  async storeWithIntelligence(userId, userMessage, aiResponse, category, mode = 'truth-general') {
    try {
      // TRACE LOGGING - Intelligent storage entry
      console.log('[TRACE-INTELLIGENT] I1. storeWithIntelligence called');
      console.log('[TRACE-INTELLIGENT] I2. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I3. category:', category);
      console.log('[TRACE-INTELLIGENT] I4. userMessage length:', userMessage?.length || 0);
      console.log('[TRACE-INTELLIGENT] I5. aiResponse length:', aiResponse?.length || 0);

      // CRITICAL TRACE #560: Log the actual user message for T2 debugging
      console.log('[TRACE-T2] User message:', userMessage?.substring(0, 200));

      // STORAGE CONTRACT DIAGNOSTIC LOGGING (Issue #648)
      console.log(`[STORAGE-CONTRACT] input_length=${userMessage?.length || 0} first_100_chars="${userMessage?.substring(0, 100) || ''}"`);

      console.log('[INTELLIGENT-STORAGE] 🧠 Processing conversation for intelligent storage');

      // FIX #633: Detect ordinal facts for B3 validator
      const ordinalInfo = this.detectOrdinalFact(userMessage);
      if (ordinalInfo.hasOrdinal) {
        console.log(`[ORDINAL] Detected ordinal fact: ${ordinalInfo.pattern} (#${ordinalInfo.ordinal})`);
        if (ordinalInfo.value) {
          console.log(`[ORDINAL] Detected value: ${ordinalInfo.value}`);
        }
      }

      // FIX #557-T2: Check for explicit memory storage requests FIRST
      // When user says "Remember this exactly: X", store X verbatim without compression
      console.log('[TRACE-T2] Calling detectExplicitMemoryRequest...');
      const explicitRequest = this.detectExplicitMemoryRequest(userMessage);
      console.log('[TRACE-T2] detectExplicitMemoryRequest result:', JSON.stringify(explicitRequest));
      console.log(`[A5-DEBUG] Storage: detectExplicitMemoryRequest returned: ${JSON.stringify(explicitRequest)}`);

      if (explicitRequest.isExplicit) {
        console.log('[INTELLIGENT-STORAGE] 🎯 EXPLICIT MEMORY REQUEST - storing verbatim without compression');

        const verbatimFacts = explicitRequest.extractedContent;
        const verbatimTokens = this.countTokens(verbatimFacts);

        // Store with very high importance (explicit user request)
        const explicitMetadata = {
          original_tokens: verbatimTokens,
          compressed_tokens: verbatimTokens,
          compression_ratio: 1.0,  // No compression for explicit requests
          user_priority: true,  // Always treat as high priority
          fingerprint: null,  // No fingerprint needed for explicit storage
          fingerprintConfidence: 0,
          importance_score: 0.95,  // Very high importance for explicit requests
          original_user_phrase: userMessage.substring(0, 200),
          explicit_storage_request: true,  // Mark as explicit for retrieval optimization
          wait_for_embedding: true  // FIX #566-STR1: Wait for embedding to complete for explicit requests
        };

        // FIX #633: Include ordinal metadata only if detected
        if (ordinalInfo.hasOrdinal) {
          explicitMetadata.ordinal = ordinalInfo.ordinal;
          explicitMetadata.ordinal_subject = ordinalInfo.subject;
          explicitMetadata.ordinal_pattern = ordinalInfo.pattern;
          if (ordinalInfo.value) {
            explicitMetadata.ordinal_value = ordinalInfo.value;
          }
        }

        const result = await this.storeCompressedMemory(userId, category, verbatimFacts, explicitMetadata, mode);
        console.log(`[A5-DEBUG] Storage: Set explicit_storage_request=true in metadata`);
        console.log(`[A5-DEBUG] Storage: Set wait_for_embedding=true in metadata`);

        console.log('[INTELLIGENT-STORAGE] ✅ Explicit memory stored verbatim');
        return result;
      }

      // PROBLEM 3 FIX: Filter out non-user-specific queries
      // Storage should only keep information ABOUT the user, not general world information
      const isNonUserQuery = this.detectNonUserQuery(userMessage);
      if (isNonUserQuery.shouldSkip) {
        console.log(`[INTELLIGENT-STORAGE] ⏭️ Skipping storage - ${isNonUserQuery.reason}`);
        return { action: 'skipped', reason: isNonUserQuery.reason };
      }

      // CRITICAL FIX #586: Skip storage for questions (retrieval requests)
      // Questions ask for information, they don't provide it
      // Extraction on questions produces garbage like "(No facts to extract)."
      const isQuestion = this.detectQuestion(userMessage);
      if (isQuestion) {
        console.log(`[INTELLIGENT-STORAGE] ⏭️ Skipping storage - message is a question (retrieval request, not storage)`);
        return { action: 'skipped', reason: 'question_no_facts_to_store' };
      }

      // Step 0: Sanitize AI response before processing
      // CRITICAL FIX #586: Don't reject storage if AI response is boilerplate
      // The USER MESSAGE may contain facts even if AI response is generic
      console.log('[TRACE-INTELLIGENT] I6. About to sanitize content...');
      const sanitizedResponse = this.sanitizeForStorage(aiResponse);
      const hasBoilerplate = !sanitizedResponse || sanitizedResponse.length < 10;

      if (hasBoilerplate) {
        console.log('[TRACE-INTELLIGENT] I7. AI response contains boilerplate, will extract from user message only');
        console.log('[INTELLIGENT-STORAGE] AI response is boilerplate, but proceeding with user message extraction');
      } else {
        console.log('[TRACE-INTELLIGENT] I8. Content sanitized, length:', sanitizedResponse.length);
      }

      // Use sanitized response if available, otherwise use empty string for extraction
      const responseForExtraction = sanitizedResponse || '';

      // CRITICAL FIX: Detect fingerprint and importance BEFORE extraction
      // This preserves original content for analysis instead of analyzing compressed garbage

      // Step 0.5: Detect user priorities (UX-049) - on ORIGINAL message
      const userPriorityDetected = this.detectUserPriority(userMessage);
      if (userPriorityDetected) {
        console.log('[INTELLIGENT-STORAGE] 🎯 User priority detected - will boost importance');
      }

      // Step 0.7: Calculate importance score on ORIGINAL user message (before extraction)
      console.log('[INTELLIGENT-STORAGE] 🧠 Using semantic analyzer for importance scoring on original message...');
      const importanceResult = await semanticAnalyzer.analyzeContentImportance(userMessage, category);
      let importanceScore = importanceResult.importanceScore;
      console.log(`[SEMANTIC-IMPORTANCE] Score: ${importanceScore.toFixed(2)}, Reason: ${importanceResult.reasoning}`);

      // Boost importance if user priority detected (UX-049)
      if (userPriorityDetected) {
        console.log('[INTELLIGENT-STORAGE] 🎯 Boosting importance due to user priority (0.85 minimum)');
        importanceScore = Math.max(importanceScore, 0.85);
      }

      console.log(`[INTELLIGENT-STORAGE] 📊 Final importance score: ${importanceScore.toFixed(2)} (category: ${category})`);

      // Step 1: Extract facts (compression)
      console.log('[FLOW] Step 1: Extracting key facts from conversation...');
      let facts = await this.extractKeyFacts(userMessage, responseForExtraction);
      console.log('[FLOW] Step 1: Facts extracted ✓');

      // STORAGE CONTRACT DIAGNOSTIC LOGGING (Issue #648)
      console.log(`[STORAGE-CONTRACT] extracted_facts_length=${facts?.length || 0} first_100_chars="${facts?.substring(0, 100) || ''}"`);


      // Validation: Check if numeric values from input survived extraction
      // Using bounded patterns to prevent ReDoS vulnerability
      // Pattern matches: $123, $1,234, $123.45, $1,234.56, 123k, 12345 (5-9 digits)
      const amountPattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\d+|\d{1,6}k|\d{5,9}/i;
      const inputHasAmount = amountPattern.test(userMessage);
      const factsHaveAmount = amountPattern.test(facts);

      if (inputHasAmount && !factsHaveAmount) {
        console.warn('[EXTRACTION-WARNING] Input contained numeric value but extraction lost it');
        console.warn('[EXTRACTION-WARNING] Input:', userMessage.substring(0, 100));
        console.warn('[EXTRACTION-WARNING] Extracted:', facts);
      }

      // GUARD: Never store empty or meaningless content - fallback to user message
      const isMeaningless = !facts ||
                           facts.trim().length === 0 ||
                           facts.toLowerCase().includes('no essential facts') ||
                           facts.toLowerCase().includes('no key facts') ||
                           facts.toLowerCase().includes('nothing to extract') ||
                           facts.toLowerCase().includes('no facts to extract') ||
                           /^\(no facts/i.test(facts.trim());

      if (isMeaningless) {
        console.log('[INTELLIGENT-STORAGE] ⚠️ No meaningful facts extracted, using fallback to original message');
        // Fallback: Use original user message directly (already has fingerprint and importance calculated)
        facts = userMessage.substring(0, 200).trim();

        // If user message also empty, skip storage entirely
        if (!facts || facts.trim().length === 0) {
          console.log('[INTELLIGENT-STORAGE] ⏭️ Skipping storage - no content');
          return { action: 'skipped', reason: 'no_content' };
        }

        console.log('[INTELLIGENT-STORAGE] ✅ Using original user message as facts:', facts.substring(0, 80));
      }

      const originalTokens = this.countTokens(userMessage + (responseForExtraction || ''));
      const compressedTokens = this.countTokens(facts);
      const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;

      console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);

      // Step 2: Detect fingerprint on EXTRACTED FACTS (not raw input)
      // This is the CRITICAL FIX for Issue #498 - semantic fingerprint detection
      // CRITICAL: Only detect fingerprint if facts contain actual user information
      console.log('[FLOW] Step 2: Detecting fingerprint on extracted facts...');

      let fingerprintResult;
      // Validate facts are from user, not assistant boilerplate
      const factsContainUserInfo = facts &&
                                    facts.trim().length > 10 &&
                                    !facts.toLowerCase().includes('no relevant facts') &&
                                    !facts.toLowerCase().includes('general query');

      if (factsContainUserInfo) {
        fingerprintResult = await this.detectFingerprintFromFacts(facts);
        console.log('[FLOW] Step 2: Fingerprint detected ✓', fingerprintResult);
        console.log(`[INTELLIGENT-STORAGE] Fingerprint result: ${fingerprintResult.fingerprint || 'none'} (confidence: ${fingerprintResult.confidence}, method: ${fingerprintResult.method})`);
      } else {
        console.log('[FLOW] Step 2: Skipping fingerprint detection - facts appear to be non-user content');
        fingerprintResult = { fingerprint: null, confidence: 0, method: 'skipped_invalid_facts' };
      }

      // Step 3: Check for duplicates (now also checks for supersession)
      console.log('[FLOW] Step 3: Checking for similar memories and supersession candidates...');
      const existing = await this.findSimilarMemories(userId, category, facts);

      // Step 4: Update existing OR create new (with supersession handled internally)
      if (existing) {
        // findSimilarMemories returns non-null only for TRUE DUPLICATES (not supersessions)
        console.log(`[DEDUP] ♻️ Found similar memory (id=${existing.id}), boosting instead of duplicating`);
        const boostResult = await this.boostExistingMemory(existing.id);

        // Debug logging hook for dedup case
        logMemoryOperation(userId, 'store', {
          memory_id: existing.id,
          content_preview: facts.substring(0, 120),
          category: category,
          dedup_triggered: true,
          dedup_merged_with: existing.id,
          stored: false
        });

        return boostResult;
      } else {
        // No duplicate found - either new fact or supersession
        // If supersession, storeCompressedMemory will detect and mark old memory as superseded
        console.log('[FLOW] Step 4: Storing new memory (supersession handled internally if applicable)...');

        // FIX #643: Extract temporal anchors from ORIGINAL user message first (INF3)
        // Compressed facts may have dropped "left in 2020" - extract from source
        const temporalAnchors = this.extractTemporalAnchors(userMessage);

        // Fallback to facts only if nothing found in original
        if (Object.keys(temporalAnchors).length === 0) {
          Object.assign(temporalAnchors, this.extractTemporalAnchors(facts));
        }

        // FIX #643: Extract unicode names from ORIGINAL message first, then facts (CMP2)
        // Compression might have damaged unicode characters
        let unicodeNames = this.extractUnicodeNames(userMessage);
        if (unicodeNames.length === 0) {
          unicodeNames = this.extractUnicodeNames(facts);
        }

        // FIX #648: Extract pricing anchors from ORIGINAL message (EDG3)
        // Compression might have dropped pricing details
        let pricingAnchors = this.extractPricingAnchors(userMessage);
        if (pricingAnchors.length === 0) {
          pricingAnchors = this.extractPricingAnchors(facts);
        }

        const regularMetadata = {
          original_tokens: originalTokens,
          compressed_tokens: compressedTokens,
          compression_ratio: parseFloat(ratio),
          user_priority: userPriorityDetected,
          fingerprint: fingerprintResult.fingerprint,
          fingerprintConfidence: fingerprintResult.confidence,
          importance_score: importanceScore,
          original_user_phrase: userMessage.substring(0, 200)  // CRITICAL FIX #504: Store original for fallback matching
        };

        // FIX #633: Include ordinal metadata only if detected
        if (ordinalInfo.hasOrdinal) {
          regularMetadata.ordinal = ordinalInfo.ordinal;
          regularMetadata.ordinal_subject = ordinalInfo.subject;
          regularMetadata.ordinal_pattern = ordinalInfo.pattern;
          if (ordinalInfo.value) {
            regularMetadata.ordinal_value = ordinalInfo.value;
          }
        }

        // FIX #643/#648: Add anchors metadata for temporal, unicode, and pricing (INF3, CMP2, EDG3)
        if (Object.keys(temporalAnchors).length > 0 || unicodeNames.length > 0 || pricingAnchors.length > 0) {
          regularMetadata.anchors = {};

          if (Object.keys(temporalAnchors).length > 0) {
            regularMetadata.anchors.temporal = temporalAnchors;
          }

          if (unicodeNames.length > 0) {
            regularMetadata.anchors.unicode = unicodeNames;
          }

          if (pricingAnchors.length > 0) {
            regularMetadata.anchors.pricing = pricingAnchors;
          }

          // FIX #659: UNICODE-TRACE diagnostic logging (gated by DEBUG_DIAGNOSTICS)
          if (process.env.DEBUG_DIAGNOSTICS === 'true') {
            console.log(`[UNICODE-TRACE] extracted_unicode=${JSON.stringify(unicodeNames)}`);
            console.log(`[UNICODE-TRACE] before_storage anchors_keys=[${Object.keys(regularMetadata.anchors).join(',')}] unicode_count=${unicodeNames.length}`);
            console.log(`[UNICODE-TRACE] metadata_type=${typeof regularMetadata}`);
          }
        }

        // FIX #658: UNICODE TRACE - Prove unicode extraction before storage
        const DEBUG_DIAGNOSTICS = process.env.DEBUG_DIAGNOSTICS === 'true';
        if (DEBUG_DIAGNOSTICS || unicodeNames.length > 0) {
          console.log(`[UNICODE-TRACE] extracted_unicode=[${unicodeNames.slice(0, 3).join(', ')}${unicodeNames.length > 3 ? '...' : ''}] count=${unicodeNames.length}`);
          console.log(`[UNICODE-TRACE] before_insert anchors_keys=[${Object.keys(regularMetadata.anchors || {}).join(', ')}] unicode_count=${regularMetadata.anchors?.unicode?.length || 0}`);
          console.log(`[UNICODE-TRACE] metadata_type=${typeof regularMetadata} metadata_is_object=${typeof regularMetadata === 'object'}`);
        }

        const result = await this.storeCompressedMemory(userId, category, facts, regularMetadata, mode);
        console.log('[FLOW] Step 4: Memory stored ✓');
        return result;
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Error:', error.message);
      console.error('[INTELLIGENT-STORAGE] Stack:', error.stack?.substring(0, 200));

      // Fallback: store uncompressed to prevent data loss
      console.warn('[INTELLIGENT-STORAGE] ⚠️ Falling back to uncompressed storage');
      return await this.storeUncompressed(userId, userMessage, aiResponse, category, mode);
    }
  }

  /**
   * Extract key facts from conversation using GPT-4o-mini
   * Target: 10-20:1 compression ratio
   * CRITICAL: Preserves unique identifiers and high-entropy tokens
   * CRITICAL FIX (Issue #504): Handles casual language and preserves user's original terminology
   * @param {string} userMsg - User's message
   * @param {string} aiResponse - AI's response
   * @returns {Promise<string>} - Extracted facts as bullet points
   */
  async extractKeyFacts(userMsg, aiResponse) {
    // IDENTIFIER-PRESERVING PROMPT: Compress while retaining unique tokens
    // CRITICAL: Must preserve financial amounts, salaries, and numeric values for supersession
    // CRITICAL FIX #504: Handle casual formats like "55k", "make", "earn" and preserve user terminology
    // CRITICAL FIX #540: NEVER extract historical context from AI responses
    const prompt = `Extract ONLY the essential facts from this conversation. Be extremely brief but PRESERVE all identifiers, numeric values, and the USER'S EXACT TERMINOLOGY.

CRITICAL RULES:
1. ALWAYS preserve exact alphanumeric identifiers (e.g., ECHO-123-ABC, ALPHA-456)
2. ALWAYS preserve names exactly as written (e.g., Dr. Smith, Dr. FOXTROT-123)
3. ALWAYS preserve numbers, codes, IDs, license plates, serial numbers VERBATIM
4. ALWAYS preserve salary/income amounts EXACTLY including casual formats:
   - "55k" → store as "55k" AND "$55,000"
   - "70K" → store as "70K" AND "$70,000"
   - "$85,000" → store as "$85,000"
   - Include BOTH the user's exact term AND a searchable synonym
5. Handle casual income terminology - preserve the user's verb:
   - "I make 55k" → "Income: make 55k ($55,000)"
   - "They pay me 70k" → "Income: pay 70k ($70,000)"
   - "My compensation is $85k" → "Income: compensation $85k ($85,000)"
   - "I earn 90k" → "Income: earn 90k ($90,000)"
6. ALWAYS preserve times, dates, and numeric values EXACTLY (e.g., 3pm, 4pm, Tuesday)
7. Never generalize unique identifiers into descriptions like "identifier" or "code"
8. If user says "My X is Y", output MUST contain Y exactly
9. PRIORITIZE extracting from the USER's message - the AI response is context only
10. Include searchable synonyms in parentheses for better retrieval matching

11. *** CRITICAL: NEVER EXTRACT HISTORICAL CONTEXT FROM ASSISTANT RESPONSES ***
   The Assistant's response often includes historical context for continuity.
   This historical context is NOT new information and must NOT be stored.

   FORBIDDEN PATTERNS - DO NOT EXTRACT:
   - "You were previously X" → DO NOT extract "previously X"
   - "You used to be X" → DO NOT extract "used to be X"
   - "Before, you were X" → DO NOT extract "before, you were X"
   - "Your old X was Y" → DO NOT extract "old X was Y"
   - "Earlier you mentioned X" → DO NOT extract historical X
   - "You had mentioned X" → DO NOT extract historical X
   - "You told me X" → DO NOT extract if it's past tense
   - "Previously you worked at X" → DO NOT extract old employer
   - "You lived in X before" → DO NOT extract old location

   ONLY extract CURRENT facts from the USER's message.
   If the Assistant says something like "You were previously a Junior Developer,
   and now you're a Senior Architect" - extract ONLY "Senior Architect" from
   the USER's message, NOT "Junior Developer" from the Assistant's response.

12. UPDATE LANGUAGE means NEW VALUE IS PRIMARY:
   - "increased to $X" → Current income: $X (not the old value)
   - "raised to $X" → Current income: $X
   - "bumped to $X" → Current income: $X
   - "giving me $X now" → Current income: $X
   - "now making $X" → Current income: $X
   - "promoted... $X" → Current income: $X
   - The word "now" or "increased/raised/bumped" signals the NEW value

13. When message contains BOTH old and new values, extract ONLY the new:
   - "Was $50k, now $70k" → Income: $70k (ignore $50k)
   - "Increased from $60k to $80k" → Income: $80k (ignore $60k)

14. LOCATION UPDATES supersede old locations:
   - "moved to Austin" → Current location: Austin (not previous city)
   - "relocated to Denver" → Current location: Denver
   - "now living in Seattle" → Current location: Seattle
   - The words "moved", "relocated", "now living" signal NEW location

15. SALARY VALUES without $ are still salary:
   - "90k" = $90,000
   - "75k a year" = $75,000/year
   - "making 85" in salary context = $85,000
   - Always extract the NUMERIC VALUE as income

16. *** CRITICAL: PRESERVE TEMPORAL PATTERNS EXACTLY FOR REASONING ***
   - "worked 5 years" → preserve exactly (NOT "worked for duration")
   - "left in 2020" → preserve exactly (NOT "left recently")
   - "spent 3 months" → preserve exactly
   - "until 2015" → preserve exactly
   - "for 5 years" → preserve exactly
   - Pattern forms: "worked/for/spent X years/months" AND "left/until/ended/quit in/at YYYY"
   - Temporal patterns are CRITICAL for calculating start dates from (duration + end date)

17. VEHICLE INFORMATION must be preserved (FIX #648-STR1):
   - Car make/model: "Tesla Model 3", "Honda Civic", "Toyota Camry"
   - Always preserve brand + model exactly
   - CRITICAL: Vehicle info is HIGH PRIORITY - never drop it
   - When multiple facts present, vehicle is CRITICAL and must be extracted

18. WHEN MULTIPLE FACTS PROVIDED (10+), extract ALL of them:
   - User provided each fact intentionally
   - Do not prioritize or drop ANY facts
   - If space limited, use extreme brevity but keep ALL facts
   - Format: "Dog: Max. Color: blue. Car: Tesla Model 3. Job: software engineer." etc.

Examples:
Input User: "I make 55k a year" | AI: "That's a good starting salary..."
Output: "Income: make 55k ($55,000/year salary pay compensation earnings)"
NOT: "Has income" or "Makes money"

Input User: "Great news - my compensation was bumped to $85,000!" | AI: "Congratulations..."
Output: "Income: compensation $85,000 (salary pay earnings raised bumped)"
NOT: "Got a raise" or "Higher income"

Input User: "I live in Seattle" | AI: "Seattle is a great city..."
Output: "Location: live Seattle (home residence based in)"
NOT: "Has location"

Input User: "My job title is Senior Engineer" | AI: "That's a great role..."
Output: "Job: Senior Engineer (title position role work)"
NOT: "Has job"

Input: "My license plate is ABC-123-XYZ"
Output: "License plate: ABC-123-XYZ"

Input: "Meeting moved to 4pm"
Output: "Meeting: 4pm (moved rescheduled changed)"

Input User: "My salary increased to $92,000 per year" | AI: "Congratulations..."
Output: "Income: salary $92,000 (pay compensation earnings increased)"
NOT: "Income: increased" or historical context

Input User: "Just got promoted! They're giving me 90k now" | AI: "That's great..."
Output: "Income: 90k ($90,000 salary pay compensation promoted)"
NOT: "Got promoted" without the salary value

Input User: "Was making 50k, now I'm at 75k" | AI: "Nice raise..."
Output: "Income: 75k ($75,000 salary pay compensation)"
NOT: Both values or just the old value

Input User: "Just moved to Austin, Texas for a new job" | AI: "That's exciting..."
Output: "Location: Austin Texas (home residence city moved relocated)"
NOT: Historical context about previous location

Input User: "They're giving me 90k now" | AI: "Congratulations..."
Output: "Income: 90k ($90,000 salary pay compensation)"
NOT: "Got promoted" without the salary value

Input User: "I worked at Google for 5 years and left in 2020" | AI: "That's interesting..."
Output: "Work: worked 5 years at Google. Left in 2020 (employment duration ended quit)"
NOT: "Worked at Google" without duration/end date

Input User: "My car is a Tesla Model 3" | AI: "Nice vehicle..."
Output: "Vehicle: Tesla Model 3 (car automobile drive)"
NOT: "Has car" without make/model

*** CRITICAL ANTI-PATTERN - Issue #540 Fix ***
Input User: "I just got promoted! My current job title is Senior Architect" |
AI: "Congratulations! You were previously a Junior Developer, and now you're a Senior Architect..."
Output: "Job: Senior Architect (title position role promoted current)"
FORBIDDEN: "Job: Junior Developer" or "previously Junior Developer"
REASON: The AI's historical context ("You were previously a Junior Developer") is NOT new information.
        Only extract CURRENT facts from the USER's message: "Senior Architect"

Input User: "My new salary is $95,000" |
AI: "That's great! Your previous salary was $80,000, so that's a nice increase..."
Output: "Income: $95,000 (salary pay compensation new current)"
FORBIDDEN: "$80,000" or "previous salary $80,000"
REASON: The AI's historical reference is NOT new information from the user.
        Only extract the NEW value from the USER's message.

Rules for compression:
- FIX #648-STR1: Extract ALL facts provided by user (no maximum limit)
- When 10+ facts present, use EXTREME brevity but keep ALL facts
- Each fact: Include user's exact terminology (synonyms optional if space tight)
- Include ONLY: Names, numbers, specific entities, user statements, amounts, times
- PRESERVE ALL NUMBERS EXACTLY: Years (2010), durations (5 years), prices ($99, $299), quantities, dates
- PRESERVE BRAND NAMES AND PROPER NOUNS: Tesla Model 3, iPhone 15, Google, Microsoft, etc.
- PRESERVE SPECIFIC ENTITIES: Car models, product names, company names, locations
- EXCLUDE: Questions, greetings, explanations, AI responses
- Format: "Category: user_exact_term (synonym1 synonym2)" OR "Category: user_exact_term" if space limited
- CRITICAL: Numbers AND brand names are MORE important than descriptions - always preserve exact values
- CRITICAL: If choosing between brevity and completeness, choose completeness - store ALL facts

User: ${userMsg}
Assistant: ${aiResponse}

Facts (preserve user terminology + add synonyms):`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 150  // Increased to allow room for identifiers and synonyms
      });

      let facts = response.choices[0].message.content.trim();

      // CRITICAL: Post-processing protection - verify identifiers survived
      facts = this.protectHighEntropyTokens(userMsg, facts);

      // CRITICAL FIX #504 + #566: Verify ALL numeric values survived extraction
      // Enhanced to protect ALL numbers: prices, years, durations, quantities
      const amountPattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\d+|\d{1,6}k/i;
      const yearPattern = /\b(19|20)\d{2}\b/g;  // Years like 2010, 2015
      const durationPattern = /\b\d+\s*(year|years|month|months|week|weeks|day|days|hour|hours)\b/gi;  // 5 years, 3 months
      const generalNumberPattern = /\b\d+(?:\.\d+)?(?:,\d{3})*\b/g;  // Any number including decimals
      
      // FIX #566-STR1: Protect brand names and proper nouns (capitalized multi-word phrases)
      // Matches: Tesla Model 3, iPhone 15, Google Pixel, MacBook Pro, etc.
      // Pattern: Captures multi-word brand names with capitals or numbers, but avoids common words
      // Strategy: Match sequences where each word starts with capital OR is a number
      const brandNamePattern = /\b(?:[A-Z][a-zA-Z]*|[a-z]*[A-Z][a-zA-Z]*)(?:\s+(?:[A-Z][a-zA-Z]*|\d+))+\b/g;

      const inputAmounts = userMsg.match(amountPattern) || [];
      const factsAmounts = facts.match(amountPattern) || [];

      const inputYears = userMsg.match(yearPattern) || [];
      const factsYears = facts.match(yearPattern) || [];

      const inputDurations = userMsg.match(durationPattern) || [];
      const factsDurations = facts.match(durationPattern) || [];
      
      const inputBrandNames = userMsg.match(brandNamePattern) || [];
      const factsBrandNames = facts.match(brandNamePattern) || [];

      let missingNumbers = [];
      let missingBrandNames = [];

      // Check for missing amounts
      if (inputAmounts.length > factsAmounts.length) {
        console.warn('[EXTRACTION-FIX #566] Input had amounts but extraction lost some');
        missingNumbers.push(...inputAmounts.filter(amt => !facts.includes(amt)));
      }

      // Check for missing years
      if (inputYears.length > factsYears.length) {
        console.warn('[EXTRACTION-FIX #566] Input had years but extraction lost some');
        missingNumbers.push(...inputYears.filter(yr => !facts.includes(yr)));
      }

      // Check for missing durations
      if (inputDurations.length > factsDurations.length) {
        console.warn('[EXTRACTION-FIX #566] Input had durations but extraction lost some');
        missingNumbers.push(...inputDurations.filter(dur => !facts.includes(dur)));
      }
      
      // FIX #566-STR1: Check for missing brand names
      if (inputBrandNames.length > factsBrandNames.length) {
        console.warn('[EXTRACTION-FIX #566-STR1] Input had brand names but extraction lost some');
        // Filter out generic words like "Remember", "Drive", etc.
        const genericWords = ['Remember', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why', 'Who', 'My', 'Your', 'Their', 'Drive', 'Name', 'Max'];
        missingBrandNames.push(...inputBrandNames.filter(brand => 
          !facts.includes(brand) && !genericWords.includes(brand)
        ));
      }

      // Inject ALL missing numbers back into facts
      if (missingNumbers.length > 0) {
        console.warn(`[EXTRACTION-FIX #566] Re-injecting ${missingNumbers.length} lost numbers:`, missingNumbers);
        facts += '\n' + missingNumbers.join(', ');
      }
      
      // Inject ALL missing brand names back into facts
      if (missingBrandNames.length > 0) {
        console.warn(`[EXTRACTION-FIX #566-STR1] Re-injecting ${missingBrandNames.length} lost brand names:`, missingBrandNames);
        facts += '\n' + missingBrandNames.join(', ');
      }

      // FIX #633-INF3: Verify temporal patterns survived extraction
      const temporalDurationPattern = /(?:worked|for|spent)\s+\d+\s+(?:years?|months?)/i;
      const temporalEndPattern = /(?:left|until|ended|quit).*?(?:in|at)?\s*\d{4}/i;

      // CodeQL Fix: Bound input before regex to prevent polynomial regex performance issues
      const safeUserMsg = userMsg.substring(0, 500);
      const safeFacts = facts.substring(0, 500);

      const inputHasDuration = temporalDurationPattern.test(safeUserMsg);
      const factsHaveDuration = temporalDurationPattern.test(safeFacts);

      const inputHasEnd = temporalEndPattern.test(safeUserMsg);
      const factsHaveEnd = temporalEndPattern.test(safeFacts);

      let missingTemporal = [];

      if (inputHasDuration && !factsHaveDuration) {
        const match = safeUserMsg.match(temporalDurationPattern);
        if (match) {
          console.warn('[EXTRACTION-FIX #633-INF3] Input had duration but extraction lost it');
          missingTemporal.push(match[0]);
        }
      }

      if (inputHasEnd && !factsHaveEnd) {
        const match = safeUserMsg.match(temporalEndPattern);
        if (match) {
          console.warn('[EXTRACTION-FIX #633-INF3] Input had end date but extraction lost it');
          missingTemporal.push(match[0]);
        }
      }

      // Re-inject missing temporal patterns
      if (missingTemporal.length > 0) {
        console.warn(`[EXTRACTION-FIX #633-INF3] Re-injecting ${missingTemporal.length} lost temporal patterns:`, missingTemporal);
        facts += '\n' + missingTemporal.join(', ');
      }

      // Store original user message snippet for fallback retrieval
      const originalSnippet = userMsg.substring(0, 100).trim();

      // CRITICAL: Validate extracted facts don't contain assistant boilerplate
      // This prevents storing AI response content as user facts
      const factsLower = facts.toLowerCase();
      const hasAssistantLanguage =
        factsLower.includes('no relevant facts') ||
        factsLower.includes('no essential facts') ||
        factsLower.includes('no key facts') ||
        factsLower.includes('nothing to extract') ||
        factsLower.includes('no facts to extract') ||
        /^\(no facts/i.test(facts.trim()) ||
        factsLower.includes('general query') ||
        factsLower.includes('general question') ||
        factsLower.includes('no user-specific') ||
        factsLower.includes('ai assistant') ||
        factsLower.includes("i'm an ai") ||
        factsLower.includes('i cannot') ||
        factsLower.includes("i don't have access");

      // CRITICAL FIX #533-A2 + #540: Prevent extraction of historical references from AI responses
      // When AI says "You were previously X", that's historical context, NOT a new user fact
      const hasHistoricalLanguage =
        factsLower.includes('was previously') ||
        factsLower.includes('were previously') ||
        factsLower.includes('used to') ||
        factsLower.includes('used to be') ||
        factsLower.includes('formerly') ||
        factsLower.includes('previously') ||
        factsLower.includes('before that') ||
        factsLower.includes('before you') ||
        factsLower.includes('earlier you') ||
        factsLower.includes('you mentioned that you were') ||
        factsLower.includes('you were') ||
        factsLower.includes('you had') ||
        factsLower.includes('your old') ||
        factsLower.includes('old job') ||
        factsLower.includes('old title') ||
        factsLower.includes('old position') ||
        factsLower.includes('old employer') ||
        factsLower.includes('old salary') ||
        factsLower.includes('old location') ||
        factsLower.includes('worked at') && !factsLower.includes('now work') ||
        factsLower.includes('lived in') && !factsLower.includes('now live');

      if (hasAssistantLanguage) {
        console.log('[INTELLIGENT-STORAGE] ⚠️ Extracted facts contain assistant boilerplate, rejecting');
        console.log(`[EXTRACTION-DEBUG] Rejected facts: "${facts.substring(0, 100)}"`);
        // Return empty string to trigger fallback to user message
        return '';
      }

      if (hasHistoricalLanguage) {
        console.log('[INTELLIGENT-STORAGE] ⚠️ Extracted facts contain historical references from AI, rejecting');
        console.log(`[EXTRACTION-DEBUG] Rejected historical facts: "${facts.substring(0, 100)}"`);
        // Return empty string to trigger fallback to user message
        return '';
      }

      // AGGRESSIVE POST-PROCESSING: Guarantee 10-20:1 compression
      const processedFacts = this.aggressivePostProcessing(facts);

      console.log(`[INTELLIGENT-STORAGE] ✅ Extracted ${processedFacts.split('\n').filter(l => l.trim()).length} facts`);
      console.log(`[EXTRACTION-DEBUG] Original: "${originalSnippet}"`);
      console.log(`[EXTRACTION-DEBUG] Extracted: "${processedFacts.substring(0, 150)}"`);

      return processedFacts;
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fact extraction failed:', error.message);
      // Fallback: ultra-compressed version WITH identifier protection
      const userKeywords = userMsg.split(/\s+/).slice(0, 5).join(' ');
      return this.protectHighEntropyTokens(userMsg, userKeywords);
    }
  }

  /**
   * Protect high-entropy tokens from being lost during compression
   * Scans original message for unique identifiers and ensures they appear in facts
   * @param {string} originalMessage - Original user message
   * @param {string} facts - Extracted facts from GPT
   * @returns {string} - Facts with identifiers preserved
   */
  protectHighEntropyTokens(originalMessage, facts) {
    // Patterns to detect high-entropy unique identifiers:
    // - ALPHA-123456789 (test identifiers)
    // - ECHO-123-9K7X (license plates)
    // - Dr. FOXTROT-123 (names with identifiers)
    // - Any long alphanumeric strings
    const tokenPattern = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/gi;
    const originalTokens = originalMessage.match(tokenPattern) || [];

    if (originalTokens.length === 0) {
      return facts; // No special tokens to protect
    }

    // Check which tokens are missing from facts
    const missingTokens = originalTokens.filter(token => {
      // Case-insensitive check if token appears in facts
      return !facts.toLowerCase().includes(token.toLowerCase());
    });

    if (missingTokens.length > 0) {
      console.log(`[INTELLIGENT-STORAGE] 🛡️ Protecting ${missingTokens.length} high-entropy tokens:`, missingTokens);

      // Append missing tokens to facts
      for (const token of missingTokens) {
        // Try to preserve context by finding surrounding words
        // Allow 1-3 words before the token (handles "My doctor's name is Dr. X" or "license plate number is Y")
        const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const contextMatch = originalMessage.match(new RegExp(`([\\w.']+\\s+){0,3}${escapedToken}`, 'i'));
        if (contextMatch) {
          facts += `\n${contextMatch[0]}.`;
        } else {
          facts += `\nIdentifier: ${token}.`;
        }
      }
    }

    return facts;
  }

  /**
   * Aggressive post-processing to guarantee 10-20:1 compression
   * Enforces ULTRA-strict limits: max 3-5 facts, max 5-8 words each
   * CRITICAL: Preserves lines containing high-entropy identifiers
   * CRITICAL FIX #504: Preserves synonym lists in parentheses for better retrieval
   * @param {string} facts - Raw facts from AI
   * @returns {string} - Aggressively compressed facts
   */
  aggressivePostProcessing(facts) {
    // Split into lines and clean
    let lines = facts.split(/\n|\.(?=\s|[A-Z]|$)/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Remove bullet points, numbers, and other formatting
      .map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim())
      .filter(line => line.length > 0);

    // Pattern to detect high-entropy identifiers
    const HIGH_ENTROPY_PATTERN = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/i;

    // CRITICAL FIX #504: Safe function to detect lines with synonym lists (for retrieval matching)
    // Avoids ReDoS vulnerability from regex on user-controlled input
    /**
     * Detects if a line contains synonym lists in parentheses.
     * Returns true if the line contains at least one occurrence of (content)
     * where content is one or more characters.
     * @param {string} line - The line to check for synonym patterns
     * @returns {boolean} True if line contains (content) pattern with non-empty content
     */
    const hasSynonyms = (line) => {
      // Find all opening parens and check if any have a valid closing paren after them
      let pos = 0;
      while (pos < line.length) {
        const openParen = line.indexOf('(', pos);
        if (openParen === -1) break;
        
        const closeParen = line.indexOf(')', openParen + 1);
        if (closeParen !== -1 && closeParen > openParen + 1) {
          return true; // Found valid (content) pattern
        }
        
        pos = openParen + 1;
      }
      return false;
    };

    // Separate lines by type: identifiers, synonyms, regular
    const identifierLines = lines.filter(line => HIGH_ENTROPY_PATTERN.test(line));
    const synonymLines = lines.filter(line => !HIGH_ENTROPY_PATTERN.test(line) && hasSynonyms(line));
    const regularLines = lines.filter(line => !HIGH_ENTROPY_PATTERN.test(line) && !hasSynonyms(line));

    // ADAPTIVE LIMIT: Allow more facts if they contain identifiers or synonyms
    const maxFacts = (identifierLines.length + synonymLines.length) > 0 ? 5 : 3;

    // Process regular lines with strict limits
    let processedRegularLines = regularLines.slice(0, maxFacts - identifierLines.length - synonymLines.length);

    // ADAPTIVE WORD LIMIT: Don't truncate lines with identifiers or synonyms
    processedRegularLines = processedRegularLines.map(line => {
      const words = line.split(/\s+/);
      if (words.length > 5) {
        return words.slice(0, 5).join(' ');
      }
      return line;
    });

    // Identifier lines: Allow up to 8 words to preserve context
    const processedIdentifierLines = identifierLines.map(line => {
      const words = line.split(/\s+/);
      if (words.length > 8) {
        // Keep identifier intact, trim other words
        const identifierMatch = line.match(HIGH_ENTROPY_PATTERN);
        if (identifierMatch) {
          // Preserve the identifier and a few context words
          const identifier = identifierMatch[0];
          const contextWords = line.split(/\s+/).filter(w => w.includes(identifier.split('-')[0]) || w === identifier || w.toLowerCase() === 'dr.' || ['license', 'plate', 'doctor', 'name'].includes(w.toLowerCase())).slice(0, 8);
          return contextWords.join(' ');
        }
      }
      return line;
    });

    // CRITICAL FIX #504: Synonym lines - preserve the entire line including parentheses
    // These are critical for semantic matching during retrieval
    // Don't apply word limits to lines with synonyms - they need the full synonym list
    const processedSynonymLines = synonymLines.slice(0, 5);  // Just limit the count, not the content

    // Combine: Identifier lines first (most important), then synonym lines, then regular lines
    lines = [...processedIdentifierLines, ...processedSynonymLines, ...processedRegularLines];

    // Remove duplicates (case-insensitive)
    const seen = new Set();
    lines = lines.filter(line => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    // Remove very short facts (< 3 words), UNLESS they contain identifiers or synonyms
    lines = lines.filter(line => {
      if (HIGH_ENTROPY_PATTERN.test(line)) {
        return true; // Always keep lines with identifiers
      }
      if (hasSynonyms(line)) {
        return true; // Always keep lines with synonyms
      }
      return line.split(/\s+/).length >= 3;
    });

    // Ultra-aggressive compression: remove ALL filler words (but not from identifier or synonym lines)
    const fillerWords = ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'has', 'have', 'had'];
    lines = lines.map(line => {
      // Don't remove filler words from identifier lines - preserve full context
      if (HIGH_ENTROPY_PATTERN.test(line)) {
        return line;
      }

      // CRITICAL FIX #504: Don't remove filler words from synonym lines - preserve full content
      if (hasSynonyms(line)) {
        return line;
      }

      let words = line.split(/\s+/);
      // Remove filler words except first word (to preserve meaning)
      words = [words[0], ...words.slice(1).filter(w => !fillerWords.includes(w.toLowerCase()))];
      return words.join(' ');
    });

    // Final cleanup: ensure no empty lines
    lines = lines.filter(line => line.length > 0);

    // Ensure each fact ends with a period
    lines = lines.map(line => {
      if (!/[.!?]$/.test(line)) {
        return line + '.';
      }
      return line;
    });

    // Join with newlines for clean formatting
    // Result: "Income: make 55k ($55,000 salary pay compensation).\nLocation: live Seattle (home residence)."
    return lines.join('\n');
  }

  /**
   * Check if dedup merge should be prevented due to different high-entropy tokens
   * CRITICAL FIX (Issue #218): Properly compares NEW content tokens against EXISTING memory tokens
   * Logic: If NEW content has unique identifiers that DON'T appear in EXISTING memory, block the merge
   * @param {string} existingContent - Content from existing memory in database
   * @param {string} newContent - Content from new facts to be stored
   * @returns {boolean} - True if merge should be PREVENTED (block), False if merge is allowed
   */
  shouldPreventMerge(existingContent, newContent) {
    // Issue #214 Fix 2: Enhanced pattern to catch format like ALPHA-1767213514286
    // Pattern breakdown:
    // - \b[A-Z]+-\d+-[A-Z0-9]+\b : Matches ABC-123-XYZ format
    // - \b[A-Z]+-\d{10,}\b : Matches ABC-1234567890 format (10+ digits)
    // - \bDr\.\s*[A-Z]+-\d+\b : Matches Dr. ABC-123 format
    // - \b[A-Z0-9]{12,}\b : Matches long alphanumeric codes
    const HIGH_ENTROPY_PATTERN = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/gi;

    // Extract tokens from BOTH existing and new content
    const existingTokens = existingContent.match(HIGH_ENTROPY_PATTERN) || [];
    const newTokens = newContent.match(HIGH_ENTROPY_PATTERN) || [];

    // Normalize tokens to uppercase for case-insensitive comparison
    const normalizedExisting = existingTokens.map(t => t.toUpperCase());
    const normalizedNew = newTokens.map(t => t.toUpperCase());

    // Validation: Ensure we got the parameters in the right order
    console.log(`[DEDUP-VALIDATE] shouldPreventMerge called with:`);
    console.log(`[DEDUP-VALIDATE]   existingContent (first param): "${existingContent.substring(0, 100)}..."`);
    console.log(`[DEDUP-VALIDATE]   newContent (second param): "${newContent.substring(0, 100)}..."`);
    console.log(`[DEDUP-VALIDATE]   Extracted EXISTING tokens: [${normalizedExisting.join(', ')}]`);
    console.log(`[DEDUP-VALIDATE]   Extracted NEW tokens: [${normalizedNew.join(', ')}]`);

    // If new content has no high-entropy tokens, allow normal dedup
    if (normalizedNew.length === 0) {
      return false; // Allow merge
    }

    // If existing memory has no high-entropy tokens, allow merge
    if (normalizedExisting.length === 0) {
      return false; // Allow merge
    }

    // CRITICAL FIX (#220): Check if ANY new token is unique (not in existing memory)
    // If NEW content has ANY unique identifier not present in EXISTING memory, block the merge
    // Example: NEW=[DELTA,ALPHA,CHARLIE] vs EXISTING=[CHARLIE,ALPHA] → hasUniqueNewToken=TRUE (DELTA is unique) → block merge
    // Example: NEW=[ALPHA] vs EXISTING=[ALPHA,BRAVO] → hasUniqueNewToken=FALSE → allow merge
    // Example: NEW=[ALPHA,CHARLIE] vs EXISTING=[ALPHA,BRAVO,CHARLIE] → hasUniqueNewToken=FALSE → allow merge
    const hasUniqueNewToken = normalizedNew.some(newToken =>
      !normalizedExisting.includes(newToken)
    );

    // DEBUG: Log what we're comparing to catch any logic errors
    console.log(`[DEDUP-DEBUG] Comparing tokens:`);
    console.log(`[DEDUP-DEBUG]   NEW tokens: [${normalizedNew.join(', ')}]`);
    console.log(`[DEDUP-DEBUG]   EXISTING tokens: [${normalizedExisting.join(', ')}]`);
    console.log(`[DEDUP-DEBUG]   hasUniqueNewToken: ${hasUniqueNewToken}`);

    if (hasUniqueNewToken) {
      // New content has a unique identifier - store separately
      const uniqueTokens = normalizedNew.filter(t => !normalizedExisting.includes(t));
      console.log(`[DEDUP] 🛡️ Unique new token detected: new=[${normalizedNew.join(',')}] vs existing=[${normalizedExisting.join(',')}] - BLOCKING merge (unique: ${uniqueTokens.join(',')})`);
      return true; // PREVENT merge - new identifier must be stored separately
    } else {
      // All new tokens already exist in memory - safe to merge
      console.log(`[DEDUP] ✓ All tokens exist in memory: [${normalizedNew.join(',')}] - merge allowed`);
      return false; // Allow merge - no new unique identifiers
    }
  }

  /**
   * Find similar memories using semantic embeddings with pgvector
   * CRITICAL: Distinguishes DUPLICATES (boost) from SUPERSESSIONS (replace)
   * Threshold: distance < 0.15 = high similarity (may be duplicate OR update)
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Extracted facts to compare
   * @returns {Promise<object|null>} - Similar memory to boost, or null if supersession/no match
   */
  async findSimilarMemories(userId, category, facts) {
    try {
      // Generate embedding for new content
      const { generateEmbedding } = await import('../services/embedding-service.js');
      const embeddingResult = await generateEmbedding(facts);

      if (!embeddingResult.success || !embeddingResult.embedding) {
        console.log('[DEDUP] ⚠️ Could not generate embedding, falling back to text search');
        // Fallback to text-based search
        const result = await this.db.query(`
          SELECT id, content, 0.5 as distance
          FROM persistent_memories
          WHERE user_id = $1
            AND category_name = $2
            AND is_current = true
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 5
        `, [userId, category]);

        if (result.rows.length > 0) {
          return result.rows[0];
        }
        return null;
      }

      // Query for similar memories using pgvector cosine distance
      // CRITICAL: Also retrieve embedding for supersession analysis
      const result = await this.db.query(`
        SELECT
          id,
          content,
          embedding,
          embedding <=> $1::vector as distance
        FROM persistent_memories
        WHERE user_id = $2
          AND category_name = $3
          AND is_current = true
          AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 5
      `, [JSON.stringify(embeddingResult.embedding), userId, category]);

      // Check for semantic duplicates (distance < 0.15)
      for (const row of result.rows) {
        if (row.distance < 0.15) {
          // CRITICAL FIX: Check if this is an UPDATE (supersession) or DUPLICATE (same fact)
          // High similarity could mean either:
          // 1. DUPLICATE: "My wife is Sarah" + "My wife Sarah" = SAME FACT → Boost
          // 2. SUPERSESSION: "My salary is $80K" + "My salary is $95K" = UPDATED FACT → Don't boost, supersede instead

          console.log(`[DEDUP] High similarity detected (distance: ${row.distance.toFixed(3)}), checking if update or duplicate...`);

          // Use semantic analyzer to determine if this is an update
          // Pass the OLD memory's embedding from the database
          const isUpdate = await semanticAnalyzer.analyzeSupersession(facts, [{
            id: row.id,
            content: row.content,
            embedding: row.embedding  // Use the embedding from the database row
          }]);

          if (isUpdate.supersedes && isUpdate.supersedes.length > 0) {
            // This is a SUPERSESSION (update), not a duplicate
            console.log(`[DEDUP] 🔄 SUPERSESSION detected - new content updates old memory (id=${row.id})`);
            console.log(`[DEDUP]    Old: "${row.content.substring(0, 60)}..."`);
            console.log(`[DEDUP]    New: "${facts.substring(0, 60)}..."`);
            console.log(`[DEDUP]    Reason: ${isUpdate.supersedes[0].reason}`);
            // Return null to signal this should be stored as new (supersession will handle marking old as superseded)
            return null;
          }

          // Apply high-entropy guard before merging
          if (this.shouldPreventMerge(row.content, facts)) {
            console.log(`[DEDUP] ⏭️ Skipping similar memory (id=${row.id}) due to high-entropy mismatch`);
            continue; // Skip this match, check next one
          }

          // FIX #643-NUA1: Check descriptor mismatch (different relationships for same name)
          const existingDescriptor = this.getDescriptorSignature(row.content);
          const newDescriptor = this.getDescriptorSignature(facts);

          // STORAGE CONTRACT DIAGNOSTIC LOGGING (Issue #648)
          console.log(`[STORAGE-CONTRACT] dedup_decision existing_id=${row.id} existing_desc="${existingDescriptor}" new_desc="${newDescriptor}"`);

          // FIX #648-NUA1: Block merge if EITHER descriptor is known and they differ
          // Original logic required BOTH to be non-unknown, but we should block if we detect ANY descriptor mismatch
          if ((existingDescriptor !== 'unknown' || newDescriptor !== 'unknown') && existingDescriptor !== newDescriptor) {
            console.log(`[DEDUP] force_separate=true reason=descriptor_mismatch existing="${existingDescriptor}" new="${newDescriptor}"`);
            console.log(`[DEDUP] ⏭️ Same entity name but different relationship - storing as separate memory`);
            console.log(`[STORAGE-CONTRACT] dedup_decision action=force_separate reason=descriptor_mismatch`);
            // Return null means "no duplicate found" - caller will proceed to store new memory normally
            return null;
          }

          console.log(`[SEMANTIC-DEDUP] ✅ True DUPLICATE detected (same fact repeated), will boost existing memory`);
          return row;
        }
      }

      console.log('[DEDUP] ✅ No similar memories found');
      return null;
    } catch (error) {
      console.error('[DEDUP] ⚠️ Similarity search failed:', error.message);
      return null; // Continue with new storage if dedup fails
    }
  }

  /**
   * Boost existing memory instead of creating duplicate
   * Makes it more likely to be retrieved
   * Innovation #7: Importance increases when memory is semantically retrieved
   * @param {number} memoryId - ID of existing memory
   * @returns {Promise<object>} - Boost result
   */
  async boostExistingMemory(memoryId) {
    try {
      // SEMANTIC BOOST: Increase importance score based on semantic access
      // This implements Innovation #7 - semantic access patterns determine importance
      await this.db.query(`
        UPDATE persistent_memories
        SET
          usage_frequency = usage_frequency + 1,
          relevance_score = LEAST(relevance_score + 0.05, 1.0),
          last_accessed = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [memoryId]);

      console.log(`[SEMANTIC-IMPORTANCE] ✅ Boosted memory ${memoryId} (semantic access tracked)`);
      return { action: 'boosted', memoryId };
    } catch (error) {
      console.error('[DEDUP] ❌ Boost failed:', error.message);
      throw error;
    }
  }

  /**
   * Store compressed memory with metadata
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Compressed facts
   * @param {object} metadata - Compression metadata
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result
   */
  async storeCompressedMemory(userId, category, facts, metadata, mode = 'truth-general') {
    try {
      // Normalize mode: convert underscore to hyphen for consistency
      const normalizedMode = mode.replace(/_/g, '-');

      // TRACE LOGGING - Store compressed memory
      console.log('[TRACE-INTELLIGENT] I9. storeCompressedMemory called');
      console.log('[TRACE-INTELLIGENT] I10. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I11. category:', category);
      console.log('[TRACE-INTELLIGENT] I12. facts length:', facts?.length || 0);
      console.log('[TRACE-INTELLIGENT] I12a. mode (normalized):', normalizedMode);
      console.log('[SESSION-DIAG] Storing for userId:', userId);

      // GUARD: Refuse to store empty or meaningless content at database layer
      const isMeaningless = !facts ||
                           facts.trim().length === 0 ||
                           facts.toLowerCase().includes('no essential facts') ||
                           facts.toLowerCase().includes('no key facts') ||
                           facts.toLowerCase().includes('nothing to extract');

      if (isMeaningless) {
        console.log('[INTELLIGENT-STORAGE] ❌ Refusing to store empty/meaningless content:', facts?.substring(0, 100));
        return { action: 'skipped', reason: 'meaningless_content' };
      }

      const tokenCount = this.countTokens(facts);
      console.log('[TRACE-INTELLIGENT] I13. tokenCount:', tokenCount);

      // CRITICAL FIX: Use PRE-CALCULATED fingerprint and importance from metadata
      // These were already calculated on the ORIGINAL user message before extraction
      const fingerprintResult = {
        fingerprint: metadata.fingerprint || null,
        confidence: metadata.fingerprintConfidence || 0,
        method: 'pre-calculated'
      };
      console.log(`[INTELLIGENT-STORAGE] Using pre-calculated fingerprint: ${fingerprintResult.fingerprint || 'none'} (confidence: ${fingerprintResult.confidence})`);

      // SEMANTIC SUPERSESSION CHECK - Check existing memories for semantic similarity
      // This catches updates that don't match regex patterns (e.g., "My salary is now $100K" after "I earn $80K")
      try {
        console.log('[INTELLIGENT-STORAGE] 🔍 Checking for semantic supersession...');
        
        // Query existing memories in same category
        // Cast vector type to text for JSON parsing in Node.js
        const existingMemories = await this.db.query(`
          SELECT id, content, embedding::text as embedding
          FROM persistent_memories
          WHERE user_id = $1
            AND category_name = $2
            AND is_current = true
            AND embedding IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 10
        `, [userId, category]);

        if (existingMemories.rows.length > 0) {
          // Use semantic analyzer to detect supersession
          const supersessionResult = await semanticAnalyzer.analyzeSupersession(
            facts,
            existingMemories.rows.map(row => ({
              id: row.id,
              content: row.content,
              embedding: row.embedding
            }))
          );

          if (supersessionResult.supersedes && supersessionResult.supersedes.length > 0) {
            // Semantic supersession detected - mark old memories as superseded
            for (const superseded of supersessionResult.supersedes) {
              console.log(`[SEMANTIC-SUPERSESSION] Memory ${superseded.memoryId} superseded (similarity: ${superseded.similarity.toFixed(3)}, reason: ${superseded.reason})`);
              
              // Also check for temporal reconciliation
              const existingMem = existingMemories.rows.find(m => m.id === superseded.memoryId);
              if (existingMem) {
                const temporalResult = await semanticAnalyzer.analyzeTemporalReconciliation(
                  facts,
                  existingMem.content,
                  superseded.similarity
                );

                if (temporalResult.shouldSupersede) {
                  console.log(`[SEMANTIC-TEMPORAL] ${temporalResult.explanation}`);
                }
              }
              
              await this.db.query(`
                UPDATE persistent_memories
                SET is_current = false,
                    superseded_at = NOW()
                WHERE id = $1
              `, [superseded.memoryId]);
            }
          }
        }
      } catch (semanticError) {
        console.error('[INTELLIGENT-STORAGE] ⚠️ Semantic supersession check failed:', semanticError.message);
        // Continue with normal storage
      }

      // PROBLEM 2 FIX: Lower confidence threshold for supersession
      // If fingerprint detected with ANY confidence > 0.5, route through supersession
      // This ensures updates like "my phone is 555-1234" supersede "my phone is 555-0000"
      // even when value patterns don't match perfectly (e.g., different formats)
      if (fingerprintResult.fingerprint && fingerprintResult.confidence >= 0.5) {
        console.log(`[INTELLIGENT-STORAGE] ✨ Routing through supersession for fingerprint: ${fingerprintResult.fingerprint} (confidence: ${fingerprintResult.confidence})`);

        const supersessionResult = await storeWithSupersession(this.db, {
          userId,
          content: facts,
          factFingerprint: fingerprintResult.fingerprint,
          fingerprintConfidence: fingerprintResult.confidence,
          mode: normalizedMode,  // CRITICAL FIX: Use normalized mode (hyphen, not underscore)
          categoryName: category,
          tokenCount,
          metadata  // FIX #659: Pass metadata to preserve anchors in supersession path
        });

        if (supersessionResult.success) {
          const memoryId = supersessionResult.memoryId;

          // Generate embedding for the newly stored memory
          // FIX #566-STR1: Support synchronous embedding for explicit storage requests
          if (memoryId && this.db) {
            console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
            
            // Check if we should wait for embedding completion (explicit storage requests)
            const shouldWaitForEmbedding = metadata.wait_for_embedding === true;
            
            if (shouldWaitForEmbedding) {
              console.log(`[EMBEDDING] 🔄 SYNCHRONOUS MODE - waiting for embedding to complete (supersession path)`);
              try {
                // Import embedMemory for synchronous operation
                const { embedMemory } = await import('../services/embedding-service.js');
                const embedResult = await embedMemory(this.db, memoryId, facts, { timeout: 5000 });
                
                if (embedResult.success) {
                  console.log(`[EMBEDDING] ✅ Synchronous embedding completed for memory ${memoryId} (${embedResult.timeMs}ms, status: ${embedResult.status})`);
                } else {
                  console.log(`[EMBEDDING] ⚠️ Synchronous embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
                }
              } catch (error) {
                console.error(`[EMBEDDING] ❌ Synchronous embedding failed for memory ${memoryId}: ${error.message}`);
                // Don't throw - memory is already stored, embedding can be backfilled
              }
            } else {
              embedMemoryNonBlocking(this.db, memoryId, facts, { timeout: 3000 })
                .then(embedResult => {
                  if (embedResult.success) {
                    console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
                  } else {
                    console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
                  }
                })
                .catch(error => {
                  console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
                });
            }
          }

          // Debug logging hook
          logMemoryOperation(userId, 'store', {
            memory_id: memoryId,
            content_preview: facts.substring(0, 120),
            category: category,
            dedup_triggered: false,
            dedup_merged_with: null,
            stored: true,
            fingerprint: fingerprintResult.fingerprint,
            superseded_count: supersessionResult.supersededCount
          });

          return {
            action: 'created',
            memoryId,
            superseded: supersessionResult.supersededCount,
            fingerprint: fingerprintResult.fingerprint
          };
        }
      }

      // No fingerprint or confidence too low - use normal storage

      // CRITICAL FIX: Use PRE-CALCULATED importance score from metadata
      // This was already calculated on the ORIGINAL user message before extraction
      let importanceScore = metadata.importance_score || 0.5;
      console.log(`[INTELLIGENT-STORAGE] 📊 Using pre-calculated importance score: ${importanceScore.toFixed(2)} (category: ${category})`);

      console.log('[TRACE-INTELLIGENT] I14. About to execute INSERT query...');

      // CRITICAL FIX #504: Store original user message snippet in metadata for fallback matching
      const originalUserSnippet = metadata.original_user_phrase || '';

      // FIX #658: UNICODE TRACE - Final verification before DB write
      const DEBUG_DIAGNOSTICS = process.env.DEBUG_DIAGNOSTICS === 'true';
      const metadataForInsert = {
        ...metadata,
        compressed: true,
        dedup_checked: true,
        storage_version: 'intelligent_v1',
        original_user_phrase: originalUserSnippet
      };

      if (DEBUG_DIAGNOSTICS || metadata.anchors?.unicode?.length > 0) {
        console.log(`[UNICODE-TRACE] pre_insert metadata.anchors=${JSON.stringify(metadata.anchors || {})}`);
        console.log(`[UNICODE-TRACE] pre_insert metadataForInsert.anchors=${JSON.stringify(metadataForInsert.anchors || {})}`);
      }

      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          mode,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        normalizedMode,
        category,
        'general', // Default subcategory
        facts,
        tokenCount,
        importanceScore, // Use pre-calculated importance score
        JSON.stringify(metadataForInsert)
      ]);

      console.log('[TRACE-INTELLIGENT] I15. INSERT query completed');

      const memoryId = result.rows[0].id;
      console.log('[TRACE-INTELLIGENT] I16. Stored memory ID:', memoryId);
      console.log(`[INTELLIGENT-STORAGE] ✅ Stored compressed memory: ID=${memoryId}, tokens=${tokenCount}`);

      // STORAGE CONTRACT DIAGNOSTIC LOGGING (Issue #648)
      const metadataKeys = Object.keys(metadata || {}).join(',');
      console.log(`[STORAGE-CONTRACT] stored_id=${memoryId} category=${category} metadata_keys=${metadataKeys}`);

      // ANCHOR STORAGE DIAGNOSTIC LOGGING (Issue #656)
      // Prove anchors are persisted at storage time
      const anchorKeys = Object.keys(metadata.anchors || {});
      const unicodeCount = (metadata.anchors?.unicode || []).length;
      const pricingCount = (metadata.anchors?.pricing || []).length;
      console.log(`[ANCHOR-STORAGE] stored_id=${memoryId} anchors_keys=[${anchorKeys.join(',')}] unicode_count=${unicodeCount} pricing_count=${pricingCount}`);

      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored:', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: facts.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });

      // CRITICAL: Generate embedding for the newly stored memory
      // This enables semantic retrieval for this memory
      // FIX #566-STR1: Support synchronous embedding for explicit storage requests
      if (memoryId && this.db) {
        console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
        
        // Check if we should wait for embedding completion (explicit storage requests)
        const shouldWaitForEmbedding = metadata.wait_for_embedding === true;
        
        if (shouldWaitForEmbedding) {
          console.log(`[EMBEDDING] 🔄 SYNCHRONOUS MODE - waiting for embedding to complete (explicit storage)`);
          try {
            // Import embedMemory for synchronous operation
            const { embedMemory } = await import('../services/embedding-service.js');
            const embedResult = await embedMemory(this.db, memoryId, facts, { timeout: 5000 });
            
            if (embedResult.success) {
              console.log(`[EMBEDDING] ✅ Synchronous embedding completed for memory ${memoryId} (${embedResult.timeMs}ms, status: ${embedResult.status})`);
            } else {
              console.log(`[EMBEDDING] ⚠️ Synchronous embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
            }
          } catch (error) {
            console.error(`[EMBEDDING] ❌ Synchronous embedding failed for memory ${memoryId}: ${error.message}`);
            // Don't throw - memory is already stored, embedding can be backfilled
          }
        } else {
          // Use non-blocking embedding to avoid delaying the response
          embedMemoryNonBlocking(this.db, memoryId, facts, { timeout: 3000 })
            .then(embedResult => {
              if (embedResult.success) {
                console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
              } else {
                console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
              }
            })
            .catch(error => {
              console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
            });
        }
      }

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'store', {
        memory_id: memoryId,
        content_preview: facts.substring(0, 120),
        category: category,
        dedup_triggered: false,
        dedup_merged_with: null,
        stored: true
      });

      return { action: 'created', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Compressed storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Fallback: store uncompressed if compression fails
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result
   */
  async storeUncompressed(userId, userMessage, aiResponse, category, mode = 'truth-general') {
    try {
      // Normalize mode: convert underscore to hyphen for consistency
      const normalizedMode = mode.replace(/_/g, '-');

      // TRACE LOGGING - Fallback storage
      console.log('[TRACE-INTELLIGENT] I17. storeUncompressed (fallback) called');
      console.log('[TRACE-INTELLIGENT] I18. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I19. category:', category);
      console.log('[TRACE-INTELLIGENT] I19a. mode (normalized):', normalizedMode);

      const content = `User: ${userMessage}\nAssistant: ${aiResponse}`;
      const tokenCount = this.countTokens(content);
      console.log('[TRACE-INTELLIGENT] I20. Uncompressed content length:', content.length);
      console.log('[TRACE-INTELLIGENT] I21. About to execute INSERT query (fallback)...');

      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          mode,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        normalizedMode,
        category,
        'general',
        content,
        tokenCount,
        0.50,
        JSON.stringify({
          compressed: false,
          fallback: true,
          storage_version: 'uncompressed_fallback'
        })
      ]);
      
      const memoryId = result.rows[0].id;
      console.log(`[INTELLIGENT-STORAGE] ⚠️ Stored uncompressed fallback: ID=${memoryId}, tokens=${tokenCount}`);

      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored (fallback):', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: content.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });

      // CRITICAL: Generate embedding for the newly stored memory
      // This enables semantic retrieval for this memory
      if (memoryId && this.db) {
        console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
        // Use non-blocking embedding to avoid delaying the response
        embedMemoryNonBlocking(this.db, memoryId, content, { timeout: 3000 })
          .then(embedResult => {
            if (embedResult.success) {
              console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
            } else {
              console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
            }
          })
          .catch(error => {
            console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
          });
      }

      return { action: 'fallback', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fallback storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Accurate token counting using tiktoken
   * Falls back to character-based estimation if tiktoken unavailable
   * @param {string} text - Text to count tokens for
   * @returns {number} - Token count
   */
  countTokens(text) {
    if (!text) return 0;
    
    try {
      if (this.encoder) {
        return this.encoder.encode(text).length;
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoding failed:', error.message);
    }
    
    // Fallback to character-based estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  /**
   * Cleanup: free encoder resources
   * Call this when done with the storage instance
   */
  cleanup() {
    try {
      if (this.encoder) {
        this.encoder.free();
        console.log('[INTELLIGENT-STORAGE] ✅ Encoder resources freed');
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Cleanup error:', error.message);
    }
  }
}