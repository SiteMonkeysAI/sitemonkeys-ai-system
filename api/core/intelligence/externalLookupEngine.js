/**
 * externalLookupEngine.js
 * Phase 4: Dual Hierarchy Truth Validation
 * 
 * Purpose: Fetch and validate information from external sources
 * Automatic triggers: freshness markers, high-stakes domains, low confidence
 * Graceful degradation: disclose failure, provide internal answer, give verification path
 * 
 * Location: /api/core/intelligence/externalLookupEngine.js
 */

/* global fetch, AbortController */

import { detectTruthType, TRUTH_TYPES } from './truthTypeDetector.js';
import { get as cacheGet, set as cacheSet } from './ttlCacheManager.js';

// External lookup configuration
export const LOOKUP_CONFIG = {
  MAX_SOURCES_PER_QUERY: 3,
  MAX_FETCHED_TEXT: 15000,
  MAX_LOOKUPS_PER_REQUEST: 1,
  HIGH_STAKES_MAX_LOOKUPS: 2,
  TIMEOUT_MS: 5000,
  CONFIDENCE_THRESHOLD: 0.70
};

// API-based sources with proper parsing (returns structured data)
export const API_SOURCES = {
  CRYPTO: [
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      parser: 'json',
      type: 'api',
      extract: (json) => {
        if (!json) return null;
        const btc = json.bitcoin?.usd;
        const eth = json.ethereum?.usd;
        if (!btc && !eth) return null;
        return `Bitcoin: $${btc || 'N/A'}, Ethereum: $${eth || 'N/A'}`;
      }
    }
  ],
  MEDICAL: [
    {
      name: 'FDA Drug Labels',
      buildUrl: (query) => {
        // PRINCIPLE (Issue #402 Finding #11): Extract drug name from query dynamically
        // Use pattern matching, not hardcoded drug lists (CEO approach)
        
        // Pattern 1: "What is X used for?" or "Side effects of X"
        let drugMatch = query.match(/(?:what is|about|regarding|side effects of|information on)\s+([a-z]{3,20})\b/i);
        
        // Pattern 2: Drug name followed by medical terms
        if (!drugMatch) {
          drugMatch = query.match(/\b([a-z]{3,20})\s+(?:drug|medication|medicine|pill|tablet|capsule|dosage|prescription)\b/i);
        }
        
        // Pattern 3: Medical context followed by drug name  
        if (!drugMatch) {
          drugMatch = query.match(/(?:drug|medication|medicine)\s+(?:called|named)\s+([a-z]{3,20})\b/i);
        }
        
        const drugName = drugMatch ? drugMatch[1].toLowerCase() : null;
        
        if (!drugName) {
          // If we can't extract a drug name, return null to skip this source
          return null;
        }
        
        return `https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encodeURIComponent(drugName)}&limit=1`;
      },
      parser: 'json',
      type: 'api',
      extract: (json) => {
        const result = json.results?.[0];
        if (!result) return null;
        return [
          result.warnings?.[0]?.substring(0, 1000),
          result.adverse_reactions?.[0]?.substring(0, 1000),
          result.indications_and_usage?.[0]?.substring(0, 500)
        ].filter(Boolean).join('\n\n');
      }
    }
  ],
  NEWS: [
    // 1. Google News RSS - primary discovery layer
    {
      name: 'Google News RSS',
      buildUrl: (query) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      parser: 'rss',
      type: 'api',
      extract: (text) => {
        const items = [];
        const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<source[^>]*>(.*?)<\/source>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(text)) !== null && items.length < 5) {
          items.push({ title: match[1], source: match[2], date: match[3] });
        }
        return items.length > 0 ? items.map(i => `[${i.source}] ${i.title} (${i.date})`).join('\n\n') : null;
      }
    },
    // 2. Wikipedia Current Events - fallback context only
    {
      name: 'Wikipedia Current Events',
      url: 'https://en.wikipedia.org/api/rest_v1/page/summary/Portal:Current_events',
      parser: 'json',
      type: 'api',
      extract: (json) => json.extract?.substring(0, 2000) || null
    }
    // NOTE: GDELT API removed due to consistent failures (returns HTML error pages instead of JSON)
    // If re-enabled, need proper error handling for non-JSON responses
  ]
};

// Domain-specific authoritative sources (non-API fallbacks)
export const AUTHORITATIVE_SOURCES = {
  MEDICAL: [
    { name: 'FDA', url: 'https://www.fda.gov', type: 'government', parseable: false },
    { name: 'NIH', url: 'https://www.nih.gov', type: 'government', parseable: false },
    { name: 'CDC', url: 'https://www.cdc.gov', type: 'government', parseable: false },
    { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org', type: 'medical', parseable: false },
    { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', type: 'research', parseable: false }
  ],
  LEGAL: [
    { name: 'Congress.gov', url: 'https://www.congress.gov', type: 'government', parseable: false },
    { name: 'Supreme Court', url: 'https://www.supremecourt.gov', type: 'government', parseable: false },
    { name: 'Federal Register', url: 'https://www.federalregister.gov', type: 'government', parseable: false },
    { name: 'Cornell Law', url: 'https://www.law.cornell.edu', type: 'legal', parseable: false }
  ],
  FINANCIAL: [
    { name: 'SEC', url: 'https://www.sec.gov', type: 'government', parseable: false },
    { name: 'IRS', url: 'https://www.irs.gov', type: 'government', parseable: false },
    { name: 'Federal Reserve', url: 'https://www.federalreserve.gov', type: 'government', parseable: false },
    { name: 'Treasury', url: 'https://home.treasury.gov', type: 'government', parseable: false }
  ],
  SAFETY: [
    { name: 'CPSC', url: 'https://www.cpsc.gov', type: 'government', parseable: false },
    { name: 'NHTSA', url: 'https://www.nhtsa.gov', type: 'government', parseable: false },
    { name: 'OSHA', url: 'https://www.osha.gov', type: 'government', parseable: false },
    { name: 'FDA Recalls', url: 'https://www.fda.gov/safety/recalls', type: 'government', parseable: false }
  ],
  GENERAL: [
    {
      name: 'Wikipedia',
      buildUrl: (query) => {
        // Extract key term from query for Wikipedia lookup
        const cleanQuery = query.replace(/\b(what is|define|definition of|meaning of|explain)\b/gi, '').trim();
        const keyTerm = cleanQuery.split(' ').slice(0, 3).join(' ');
        return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keyTerm)}`;
      },
      parser: 'json',
      type: 'api',
      parseable: true,
      extract: (json) => json.extract?.substring(0, 2000) || null
    }
  ]
};

// Freshness markers that trigger automatic lookup
const FRESHNESS_MARKERS = [
  /\b(current|latest|today|now|live|real-?time)\b/i,
  /\b(price|stock|rate|value|cost)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(news|update|announcement|breaking|situation|happening)\b/i,
  /\b(available|in stock|open|closed)\b/i
];

// High-stakes news markers that require corroboration
const HIGH_STAKES_NEWS_MARKERS = /attack|bombing|invasion|coup|killed|missile|war|strike|assassination|military action|troops|casualties/i;

// News intent structural patterns - detect news queries by STRUCTURE, not specific names
// PRINCIPLE: News intent = question structure + proper nouns, NOT hardcoded name lists
// ISSUE #406 FIX: Added patterns for "top news", "news stories", "headlines"
const NEWS_STRUCTURE_PATTERNS = [
  // "What's the situation with X" patterns
  /\bwhat'?s\s+(the\s+)?(situation|happening|going\s+on|news|latest|update)\s+(with|about|regarding|on|in)\b/i,
  /\bwhat\s+is\s+(the\s+)?(situation|happening|going\s+on|news|latest|update)\s+(with|about|regarding|on|in)\b/i,

  // "Tell me about X" patterns
  /\btell\s+me\s+(about|regarding)\b/i,

  // "Any news about X" patterns
  /\bany\s+(news|updates?|developments?)\s+(about|on|regarding)\b/i,

  // "What's happening with X" variants
  /\b(news|situation|update|happening|development)\s+(with|about|regarding|on|in)\b/i,

  // Current event queries
  /\b(current\s+events?|breaking|this\s+morning|today|yesterday|just\s+now)\b/i,

  // Direct "what happened" patterns
  /\bwhat\s+happened\s+(with|to|in)\b/i,
  /\bwhat'?s\s+going\s+on\s+(with|in)\b/i,

  // ISSUE #406 FIX: "What are..." news patterns
  /\bwhat\s+(are|is)\s+(the\s+)?(top|latest|today'?s|recent)\s+(news|stories|headlines|updates)\b/i,

  // ISSUE #406 FIX: General news request patterns
  /\b(top|latest|recent|breaking)\s+(news|stories|headlines|updates)\b/i,

  // ISSUE #406 FIX: Weather queries
  /\bwhat'?s\s+the\s+weather\b/i,
  /\bweather\s+(in|at|for)\b/i,

  // ISSUE #406 FIX: Celebrity/entertainment news
  /\b(latest|recent)\s+(celebrity|entertainment)\s+(news|gossip|stories)\b/i
];

// Geopolitical context markers (not entity names, but CONTEXT indicators)
// These indicate geopolitical context without hardcoding specific names
const GEOPOLITICAL_CONTEXT_MARKERS = [
  /\b(election|diplomatic|military|conflict|treaty|summit|sanctions|trade\s+war)\b/i,
  /\b(president|prime\s+minister|chancellor|leader|government|parliament|congress|senate)\b/i,
  /\b(country|nation|state|territory|border|international)\b/i
];

// Reputable news sources for corroboration
const REPUTABLE_SOURCES = /reuters|associated press|ap news|bbc|afp|npr|guardian|new york times|nytimes|washington post|wall street journal|wsj|cnn|abc news|cbs news|nbc news/i;

/**
 * Extract clean search query from conversational input
 * Removes filler words and conversational phrasing to create better search queries
 * @param {string} query - The user's conversational query
 * @returns {string} Cleaned search query
 */
export function extractSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return query;
  }

  let cleaned = query.trim();

  // Remove conversational filler at the start
  cleaned = cleaned.replace(/^(well|so|um|uh|okay|ok|now|hey|listen|look),?\s+/i, '');
  cleaned = cleaned.replace(/^(what's even|what is even|that's|that is)\s+/i, '');

  // Remove phrases like "someone told me that", "I heard that", etc.
  cleaned = cleaned.replace(/\b(someone told me that|I heard( that)?|I saw( that)?|they say|apparently|supposedly)\s+/gi, '');

  // For very long queries (>200 chars), try to extract the core topic
  if (cleaned.length > 200) {
    // Look for quoted phrases (likely the core topic)
    const quotedMatch = cleaned.match(/"([^"]+)"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Look for company/product names + key action words
    const entityMatch = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(released|announced|launched|unveiled|introduced|created|built|developed|acquired|bought|sold|hired|fired|quit)\s+([^.?,]+)/);
    if (entityMatch) {
      return `${entityMatch[1]} ${entityMatch[2]} ${entityMatch[3]}`.trim();
    }

    // Fallback: Take first 100 characters
    cleaned = cleaned.substring(0, 100);
  }

  // Remove trailing incomplete sentences
  cleaned = cleaned.replace(/\s+and\s*$/, '');
  cleaned = cleaned.replace(/\s+or\s*$/, '');
  cleaned = cleaned.replace(/\s+but\s*$/, '');

  return cleaned.trim();
}

/**
 * Detect proper nouns in query (capitalized words that likely represent named entities)
 * PRINCIPLE: Proper nouns + news structure = news query (CEO approach, not warehouse worker)
 * @param {string} query - The user's query
 * @returns {boolean} True if proper nouns detected
 */
export function hasProperNouns(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }

  // Look for capitalized words that aren't at sentence start
  // Pattern: word boundary, capital letter, lowercase letters
  // Exclude common sentence starters and question words
  const excludeWords = /^(What|Where|When|Who|Why|How|Is|Are|Does|Do|Can|Could|Would|Should|Tell|Please|The|A|An|I|You|We|They|He|She|It)$/;

  const words = query.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, ''); // Remove punctuation

    // Skip if empty or too short
    if (!word || word.length < 2) continue;

    // Check if word starts with capital and has lowercase letters
    if (/^[A-Z][a-z]+/.test(word)) {
      // If it's the first word, check if it's a common sentence starter
      if (i === 0 && excludeWords.test(word)) {
        continue;
      }

      // Found a proper noun
      return true;
    }

    // Also check for all-caps acronyms (UK, USA, CEO, etc.)
    if (/^[A-Z]{2,}$/.test(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if query has news intent (general news query)
 * PRINCIPLE-BASED: Detects news intent through STRUCTURE + PROPER NOUNS, not hardcoded name lists
 * @param {string} query - The user's query
 * @returns {boolean} True if news intent detected
 */
export function hasNewsIntent(query) {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const normalizedQuery = query.toLowerCase().trim();

  // Check for news structural patterns
  const hasNewsStructure = NEWS_STRUCTURE_PATTERNS.some(pattern => pattern.test(normalizedQuery));

  // Check for proper nouns (named entities)
  const hasNamedEntity = hasProperNouns(query);

  // Check for geopolitical context markers
  const hasGeopoliticalContext = GEOPOLITICAL_CONTEXT_MARKERS.some(pattern => pattern.test(normalizedQuery));

  // Check for time markers indicating current events
  const hasTimeMarker = /\b(today|this morning|yesterday|right now|currently|latest|recent|just now)\b/i.test(normalizedQuery);

  // NEWS INTENT LOGIC (Principle-Based):
  // 1. News structure + proper noun = news query (e.g., "What's the situation with Starmer")
  // 2. News structure + geopolitical context = news query (e.g., "What's happening with the election")
  // 3. Proper noun + time marker = likely news (e.g., "Scholz today")
  // 4. Explicit news structure alone = news (e.g., "breaking news", "current events")

  return (
    (hasNewsStructure && hasNamedEntity) ||
    (hasNewsStructure && hasGeopoliticalContext) ||
    (hasNamedEntity && hasTimeMarker && hasGeopoliticalContext) ||
    (hasNewsStructure && /\b(breaking|current\s+events?)\b/i.test(normalizedQuery))
  );
}

/**
 * Check if query contains freshness markers
 * @param {string} query - The user's query
 * @returns {object} { hasFreshnessMarkers: boolean, markers: array }
 */
export function checkFreshnessMarkers(query) {
  if (!query || typeof query !== 'string') {
    return { hasFreshnessMarkers: false, markers: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedMarkers = [];

  for (const pattern of FRESHNESS_MARKERS) {
    if (pattern.test(normalizedQuery)) {
      matchedMarkers.push(pattern.toString());
    }
  }

  return {
    hasFreshnessMarkers: matchedMarkers.length > 0,
    markers: matchedMarkers
  };
}

/**
 * Check if query requires corroboration (high-stakes news)
 * @param {string} query - The user's query
 * @param {string} truthType - Truth type (VOLATILE, SEMI_STABLE, PERMANENT)
 * @returns {boolean} True if corroboration required
 */
export function requiresCorroboration(query, truthType) {
  return truthType === 'VOLATILE' && HIGH_STAKES_NEWS_MARKERS.test(query);
}

/**
 * Check if fetched content contains reputable sources
 * @param {string} fetchedContent - Combined text from all sources
 * @returns {boolean} True if reputable source found
 */
export function hasReputableSource(fetchedContent) {
  return REPUTABLE_SOURCES.test(fetchedContent);
}

/**
 * Determine if external lookup is required
 * @param {string} query - The user's query
 * @param {object} truthTypeResult - Result from truthTypeDetector
 * @param {number} internalConfidence - Confidence in internal answer (0-1)
 * @returns {object} { required: boolean, reasons: array, priority: string }
 */
export function isLookupRequired(query, truthTypeResult, internalConfidence = 0.5) {
  // Ensure query is a string to avoid type confusion (arrays, objects, etc.)
  if (typeof query !== 'string') {
    console.warn('[externalLookupEngine] isLookupRequired called with non-string query, skipping lookup check');
    return {
      required: false,
      reasons: ['Invalid query type for lookup; expected string'],
      priority: 'none',
      max_lookups: 0
    };
  }

  // HARD BLOCK: Never lookup for document reviews (Issue #380 Fix 2)
  if (truthTypeResult.type === 'DOCUMENT_REVIEW') {
    console.log('[externalLookupEngine] Skipping lookup for document review');
    return {
      required: false,
      reasons: ['Document review requests do not require external lookup'],
      priority: 'none',
      max_lookups: 0
    };
  }

  // HARD BLOCK: Never lookup for queries > 10K characters (Issue #380 Fix 2)
  if (query.length > 10000) {
    console.log('[externalLookupEngine] Skipping lookup for long input');
    return {
      required: false,
      reasons: ['Long-form inputs are not lookup candidates'],
      priority: 'none',
      max_lookups: 0
    };
  }

  const reasons = [];
  let priority = 'normal';
  let maxSources = LOOKUP_CONFIG.MAX_LOOKUPS_PER_REQUEST;

  // Check freshness markers
  const freshnessCheck = checkFreshnessMarkers(query);
  if (freshnessCheck.hasFreshnessMarkers) {
    reasons.push('freshness_markers_detected');
  }

  // Check news intent (NEW)
  if (hasNewsIntent(query)) {
    reasons.push('news_intent_detected');
    priority = 'high';
  }

  // Check truth type
  if (truthTypeResult.type === TRUTH_TYPES.VOLATILE) {
    reasons.push('volatile_truth_type');
    priority = 'high';
  }

  // Check high-stakes domains
  if (truthTypeResult.high_stakes && truthTypeResult.high_stakes.isHighStakes) {
    reasons.push('high_stakes_domain: ' + truthTypeResult.high_stakes.domains.join(', '));
    priority = 'high';
  }

  // Check if corroboration required (high-stakes news)
  if (requiresCorroboration(query, truthTypeResult.type)) {
    reasons.push('news_corroboration_required');
    priority = 'high';
    maxSources = 2; // Fetch from 2 sources for corroboration
  }

  // Check confidence threshold
  if (internalConfidence < LOOKUP_CONFIG.CONFIDENCE_THRESHOLD) {
    reasons.push('low_internal_confidence: ' + internalConfidence);
  }

  return {
    required: reasons.length > 0,
    reasons: reasons,
    priority: priority,
    max_lookups: priority === 'high' ? LOOKUP_CONFIG.HIGH_STAKES_MAX_LOOKUPS : maxSources
  };
}

/**
 * Select sources for query - prioritize API-based sources with reliable parsers
 * PRINCIPLE-BASED: Uses news intent detection, not hardcoded name lists
 * @param {string} query - The user's query
 * @param {string} truthType - Truth type (VOLATILE, SEMI_STABLE, PERMANENT)
 * @param {object} highStakesResult - Result from detectHighStakesDomain
 * @returns {array} Array of source objects (empty if no reliable source)
 */
export function selectSourcesForQuery(query, truthType, highStakesResult) {
  const lowerQuery = query.toLowerCase();

  // Crypto - use API
  if (lowerQuery.match(/bitcoin|btc|ethereum|eth|crypto|cryptocurrency/)) {
    return API_SOURCES.CRYPTO;
  }

  // Medical drug queries - use FDA API with specific field extraction
  if (lowerQuery.match(/side effects?|dosage|drug interactions?/) &&
      lowerQuery.match(/aspirin|ibuprofen|acetaminophen|tylenol|advil/)) {
    return API_SOURCES.MEDICAL;
  }

  // ISSUE #406 FIX: Weather queries - no API source available, return empty for graceful degradation
  if (lowerQuery.match(/weather|temperature|forecast|rain|snow|storm/i)) {
    // No weather API configured - return empty to trigger graceful degradation with disclosure
    console.log('[externalLookupEngine] Weather query detected - no weather API configured');
    return [];
  }

  // News/current events queries - PRINCIPLE-BASED DETECTION
  // Use hasNewsIntent() which detects structure + proper nouns, not hardcoded names
  // ISSUE #406 FIX: Also check for generic news queries without proper nouns
  const isGenericNewsQuery = lowerQuery.match(/\b(top|latest|recent|breaking)\s+(news|stories|headlines|updates)\b/i);
  const isWeatherQuery = lowerQuery.match(/\b(weather|temperature|forecast)\b/i);
  const isEntertainmentQuery = lowerQuery.match(/\b(celebrity|entertainment|gossip)\b/i);
  
  if (hasNewsIntent(query) || isGenericNewsQuery || isWeatherQuery || isEntertainmentQuery) {
    return API_SOURCES.NEWS;
  }

  // Additional news patterns (attacks, breaking events, etc.)
  if (lowerQuery.match(/attack|breaking|killed|died|war|invasion|military|bombing|coup|strike/i)) {
    return API_SOURCES.NEWS;
  }

  // ISSUE #406 FIX: Celebrity/entertainment news
  if (lowerQuery.match(/celebrity|entertainment|gossip|hollywood/i) && lowerQuery.match(/news|latest|recent|stories/i)) {
    return API_SOURCES.NEWS;
  }

  // Wikipedia ONLY for PERMANENT definition/history queries, NOT high-stakes
  if (truthType === TRUTH_TYPES.PERMANENT && !highStakesResult?.isHighStakes) {
    return AUTHORITATIVE_SOURCES.GENERAL;
  }

  // No reliable source available - return empty, trigger graceful degradation
  return [];
}

/**
 * Get authoritative sources for a query based on detected domains (legacy)
 * @param {object} highStakesResult - Result from detectHighStakesDomain
 * @returns {array} Array of source objects
 */
export function getSourcesForQuery(highStakesResult) {
  if (!highStakesResult || !highStakesResult.isHighStakes) {
    return AUTHORITATIVE_SOURCES.GENERAL;
  }

  const sources = [];
  for (const domain of highStakesResult.domains) {
    if (AUTHORITATIVE_SOURCES[domain]) {
      sources.push(...AUTHORITATIVE_SOURCES[domain]);
    }
  }

  // Add general sources as fallback
  if (sources.length < LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY) {
    sources.push(...AUTHORITATIVE_SOURCES.GENERAL);
  }

  // Limit to max sources
  return sources.slice(0, LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY);
}

/**
 * Perform external lookup with real HTTP fetches and proper parsing
 * @param {string} query - The user's query
 * @param {array} sources - Sources to consult
 * @param {string} truthType - Truth type for corroboration check
 * @returns {Promise<object>} Lookup result
 */
export async function performLookup(query, sources, truthType = null) {
  const startTime = Date.now();

  // Extract clean search query from conversational input
  const searchQuery = extractSearchQuery(query);
  const queryWasCleaned = searchQuery !== query;

  if (queryWasCleaned) {
    console.log(`[externalLookupEngine] Cleaned query: "${query.substring(0, 80)}..." → "${searchQuery}"`);
  } else {
    console.log(`[externalLookupEngine] Performing lookup for: "${searchQuery.substring(0, 50)}..."`);
  }
  console.log(`[externalLookupEngine] Sources: ${sources.map(s => s.name).join(', ')}`);

  // Check cache using original query as key (not cleaned query)
  const cached = cacheGet(query);
  if (cached) {
    console.log(`[externalLookupEngine] Cache hit for query`);
    return {
      success: true,
      from_cache: true,
      data: cached.data,
      sources_used: cached.sources_used,
      verified_at: cached.verified_at,
      cache_valid_until: cached.cache_valid_until,
      lookup_time_ms: Date.now() - startTime
    };
  }

  // Perform actual external lookups using cleaned query
  const results = [];
  const sourcesUsed = [];
  let totalTextFetched = 0;

  try {
    // Fetch from each source with timeout
    for (const source of sources.slice(0, LOOKUP_CONFIG.MAX_SOURCES_PER_QUERY)) {
      if (totalTextFetched >= LOOKUP_CONFIG.MAX_FETCHED_TEXT) {
        console.log(`[externalLookupEngine] Reached max fetched text limit`);
        break;
      }

      try {
        // Build URL if function provided - use cleaned search query
        const fetchUrl = source.buildUrl ? source.buildUrl(searchQuery) : source.url;
        
        // Skip this source if buildUrl returned null (couldn't extract required info)
        if (!fetchUrl) {
          console.log(`[externalLookupEngine] ${source.name} buildUrl returned null - skipping source`);
          continue;
        }
        
        console.log(`[externalLookupEngine] Fetching from ${source.name} (${fetchUrl})`);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LOOKUP_CONFIG.TIMEOUT_MS);

        // Perform fetch with timeout
        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SiteMonkeys-AI-System/1.0',
            'Accept': 'application/json,text/html,text/plain'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`[externalLookupEngine] ${source.name} returned ${response.status}`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: `error_${response.status}`,
            success: false
          });
          continue;
        }

        // Parse response based on source parser type
        let parsedData = null;
        let extractedText = null;

        if (source.parser === 'rss') {
          // RSS feed parsing
          const text = await response.text();
          if (source.extract && typeof source.extract === 'function') {
            extractedText = source.extract(text);
          } else {
            extractedText = text.substring(0, 2000);
          }

          // If extraction failed, mark as failed
          if (!extractedText) {
            console.log(`[externalLookupEngine] ${source.name} extraction returned null`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'api',
              status: 'extraction_failed',
              success: false
            });
            continue;
          }

          parsedData = extractedText;
        } else if (source.parser === 'json') {
          // JSON API response
          const jsonData = await response.json();

          // Apply extractor if provided
          if (source.extract && typeof source.extract === 'function') {
            extractedText = source.extract(jsonData);
          } else {
            extractedText = JSON.stringify(jsonData).substring(0, 1000);
          }

          // If extraction failed, mark as failed
          if (!extractedText) {
            console.log(`[externalLookupEngine] ${source.name} extraction returned null`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'api',
              status: 'extraction_failed',
              success: false
            });
            continue;
          }

          parsedData = extractedText;
        } else {
          // HTML or plain text - only if parseable flag is true
          if (source.parseable === false) {
            console.log(`[externalLookupEngine] ${source.name} marked as non-parseable, skipping`);
            sourcesUsed.push({
              name: source.name,
              type: source.type || 'unknown',
              status: 'non_parseable',
              success: false
            });
            continue;
          }

          let text = await response.text();

          // Apply extractor if provided
          if (source.extract && typeof source.extract === 'function') {
            try {
              parsedData = source.extract({ text });
            } catch (extractError) {
              console.log(`[externalLookupEngine] ${source.name} extractor failed: ${extractError.message}`);
              sourcesUsed.push({
                name: source.name,
                type: source.type || 'unknown',
                status: 'extractor_error',
                success: false
              });
              continue;
            }
          } else {
            // No extractor - use raw text (bounded)
            parsedData = text.substring(0, 2000);
          }
        }

        if (!parsedData) {
          console.log(`[externalLookupEngine] ${source.name} produced no usable data`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'no_data',
            success: false
          });
          continue;
        }

        // Track text length
        const textLength = parsedData.length;
        const remainingBudget = LOOKUP_CONFIG.MAX_FETCHED_TEXT - totalTextFetched;
        if (textLength > remainingBudget) {
          parsedData = parsedData.substring(0, remainingBudget);
        }

        totalTextFetched += parsedData.length;

        // Store result
        results.push({
          source: source.name,
          text: parsedData,
          length: parsedData.length,
          type: source.type || 'api'
        });

        sourcesUsed.push({
          name: source.name,
          type: source.type || 'api',
          status: 'success',
          text_length: parsedData.length,
          success: true
        });

        console.log(`[externalLookupEngine] ✓ ${source.name}: ${parsedData.length} chars extracted`);

      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          console.log(`[externalLookupEngine] ${source.name} timed out`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'timeout',
            success: false
          });
        } else {
          console.log(`[externalLookupEngine] ${source.name} fetch error: ${fetchError.message}`);
          sourcesUsed.push({
            name: source.name,
            type: source.type || 'unknown',
            status: 'error',
            error: fetchError.message,
            success: false
          });
        }
      }
    }

    // If we got any results, consider it a success
    if (results.length > 0) {
      const combinedData = {
        query: query,
        sources: results,
        total_text_length: totalTextFetched,
        timestamp: new Date().toISOString()
      };

      // Check for news corroboration if required
      const phase4Metadata = {};
      if (truthType && requiresCorroboration(query, truthType)) {
        // Combine all fetched content for reputable source check
        const fetchedContent = results.map(r => r.text).join(' ');
        phase4Metadata.news_corroborated = hasReputableSource(fetchedContent);
        phase4Metadata.news_sources_checked = sourcesUsed.map(s => s.name);

        // Add disclosure if corroboration failed
        if (!phase4Metadata.news_corroborated) {
          phase4Metadata.disclosure = "Multiple outlets are reporting this, but I cannot confirm from reputable sources like Reuters or AP. Please verify independently.";
        }
      }

      return {
        success: true,
        from_cache: false,
        lookup_attempted: true,
        lookup_completed: true,
        data: combinedData,
        sources_consulted: sourcesUsed,
        sources_succeeded: results.length,
        total_text_fetched: totalTextFetched,
        verified_at: new Date().toISOString(),
        lookup_time_ms: Date.now() - startTime,
        ...phase4Metadata
      };
    }

    // No results - all sources failed
    return {
      success: false,
      from_cache: false,
      lookup_attempted: true,
      lookup_completed: false,
      error: 'All sources failed or returned no data',
      sources_consulted: sourcesUsed,
      verified_at: new Date().toISOString(),
      lookup_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[externalLookupEngine] Lookup failed:`, error);
    return {
      success: false,
      from_cache: false,
      error: error.message,
      lookup_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Execute graceful degradation when lookup fails
 * PRINCIPLE-BASED: Uses hasNewsIntent() instead of hardcoded name lists
 * @param {string} query - The user's query
 * @param {object} lookupResult - Failed lookup result
 * @param {object} internalAnswer - Best internal answer available
 * @returns {object} Degraded response with proper disclosure
 */
export function gracefulDegradation(query, lookupResult, internalAnswer = null) {
  let sources = [];
  let disclosure = "External lookup returned no results.";

  // Determine if this is a news query using principle-based detection
  const isNewsQuery = hasNewsIntent(query);

  if (isNewsQuery) {
    disclosure = "External news lookup returned no results. This may indicate breaking news not yet indexed or a topic with limited coverage.";
    sources = [
      { name: 'Reuters', url: 'https://www.reuters.com' },
      { name: 'Associated Press', url: 'https://apnews.com' },
      { name: 'BBC News', url: 'https://www.bbc.com/news' }
    ];
  } else {
    sources = getSourcesForQuery({ isHighStakes: false, domains: [] });
    sources = sources.slice(0, 3).map(s => ({ name: s.name, url: s.url }));
  }

  return {
    success: true,
    degraded: true,
    disclosure: disclosure,
    internal_answer: internalAnswer,
    internal_answer_labeled: internalAnswer ? {
      data: internalAnswer,
      label: 'Based on training data - may not reflect current information',
      confidence: 'unverified'
    } : null,
    verification_path: {
      message: 'You can verify this information at:',
      sources: sources
    },
    lookup_error: lookupResult.error || 'Lookup did not complete',
    timestamp: new Date().toISOString()
  };
}

/**
 * Main entry point: Execute external lookup with full pipeline
 * @param {string} query - The user's query
 * @param {object} options - Options { internalConfidence, internalAnswer, forceRefresh }
 * @returns {Promise<object>} Complete lookup result with telemetry
 */
export async function lookup(query, options = {}) {
  const startTime = Date.now();
  const {
    internalConfidence = 0.5,
    internalAnswer = null,
    forceRefresh = false
  } = options;

  // Ensure query is a string to avoid type confusion (for example, when multiple query parameters are provided)
  if (typeof query !== 'string') {
    return {
      success: false,
      lookup_performed: false,
      reason: 'Invalid query type; expected string',
      truth_type: null,
      internal_confidence: internalConfidence,
      total_time_ms: Date.now() - startTime
    };
  }

  console.log(`[externalLookupEngine] Lookup requested for: "${query.substring(0, 50)}..."`);

  // Get truth type for the query
  const truthTypeResult = await detectTruthType(query);

  // Check if lookup is required
  const lookupCheck = isLookupRequired(query, truthTypeResult, internalConfidence);

  if (!lookupCheck.required && !forceRefresh) {
    console.log(`[externalLookupEngine] Lookup not required: ${lookupCheck.reasons.length === 0 ? 'no triggers matched' : 'skipped'}`);
    return {
      success: true,
      lookup_performed: false,
      reason: 'Lookup not required - no triggers matched',
      truth_type: truthTypeResult.type,
      internal_confidence: internalConfidence,
      total_time_ms: Date.now() - startTime
    };
  }

  // Select appropriate sources using new query-to-source matching
  const sources = selectSourcesForQuery(query, truthTypeResult.type, truthTypeResult.high_stakes);

  // Handle no reliable source available
  if (sources.length === 0) {
    console.log(`[externalLookupEngine] No reliable parseable source available for this query type`);
    const degraded = gracefulDegradation(query, { error: 'No reliable parseable source available for this query type' }, internalAnswer);
    return {
      ...degraded,
      success: true,
      lookup_performed: false,
      lookup_attempted: true,
      failure_reason: 'No reliable parseable source available for this query type',
      truth_type: truthTypeResult.type,
      lookup_reasons: lookupCheck.reasons,
      total_time_ms: Date.now() - startTime
    };
  }

  // Perform lookup with truth type for corroboration
  const lookupResult = await performLookup(query, sources, truthTypeResult.type);

  // Handle failure with graceful degradation
  if (!lookupResult.success) {
    console.log(`[externalLookupEngine] Lookup failed, executing graceful degradation`);
    const degraded = gracefulDegradation(query, lookupResult, internalAnswer);
    return {
      ...degraded,
      truth_type: truthTypeResult.type,
      lookup_reasons: lookupCheck.reasons,
      total_time_ms: Date.now() - startTime
    };
  }

  // Cache successful result if we have data
  let cacheEntry = null;
  if (lookupResult.data && !lookupResult.from_cache) {
    cacheEntry = cacheSet(
      query,
      lookupResult.data,
      truthTypeResult.type,
      lookupResult.sources_consulted || sources,
      0.8 // Default confidence for external data
    );
  }

  // Pass through corroboration metadata if present
  const corroborationMetadata = {};
  if (lookupResult.news_corroborated !== undefined) {
    corroborationMetadata.news_corroborated = lookupResult.news_corroborated;
  }
  if (lookupResult.news_sources_checked !== undefined) {
    corroborationMetadata.news_sources_checked = lookupResult.news_sources_checked;
  }
  if (lookupResult.disclosure !== undefined) {
    corroborationMetadata.disclosure = lookupResult.disclosure;
  }

  return {
    success: true,
    lookup_performed: true,
    from_cache: lookupResult.from_cache,
    data: lookupResult.data,
    sources_used: lookupResult.sources_consulted || sources,
    verified_at: lookupResult.verified_at,
    cache_valid_until: cacheEntry?.cache_valid_until || lookupResult.cache_valid_until || null,
    truth_type: truthTypeResult.type,
    truth_ttl_ms: truthTypeResult.ttl_ms,
    lookup_reasons: lookupCheck.reasons,
    lookup_priority: lookupCheck.priority,
    lookup_time_ms: lookupResult.lookup_time_ms,
    total_time_ms: Date.now() - startTime,
    ...corroborationMetadata
  };
}

/**
 * Test endpoint handler for /api/test-semantic?action=external-lookup
 * @param {string} query - Query to test
 * @param {object} options - Test options
 * @returns {Promise<object>} Lookup result with telemetry
 */
export async function testLookup(query, options = {}) {
  console.log(`[externalLookupEngine] Test lookup for: "${query}"`);

  if (!query) {
    return {
      success: true,
      message: 'External Lookup Engine operational',
      usage: 'Add &q=your+query to test lookup',
      examples: [
        '?action=external-lookup&q=What%20is%20the%20current%20price%20of%20Bitcoin',
        '?action=external-lookup&q=What%20are%20the%20side%20effects%20of%20aspirin',
        '?action=external-lookup&q=What%20is%20the%20Pythagorean%20theorem'
      ],
      config: LOOKUP_CONFIG
    };
  }

  // Ensure query is a string before passing to lookup to avoid type confusion
  if (typeof query !== 'string') {
    return {
      success: false,
      message: 'Invalid query type; expected string parameter "q"',
      received_type: typeof query
    };
  }

  const result = await lookup(query, options);

  return {
    query: query,
    result: result,
    telemetry: {
      lookup_performed: result.lookup_performed,
      from_cache: result.from_cache || false,
      truth_type: result.truth_type,
      lookup_reasons: result.lookup_reasons || [],
      degraded: result.degraded || false,
      total_time_ms: result.total_time_ms
    }
  };
}

// Default export
export default {
  LOOKUP_CONFIG,
  API_SOURCES,
  AUTHORITATIVE_SOURCES,
  extractSearchQuery,
  hasProperNouns,
  hasNewsIntent,
  checkFreshnessMarkers,
  requiresCorroboration,
  hasReputableSource,
  isLookupRequired,
  selectSourcesForQuery,
  getSourcesForQuery,
  performLookup,
  gracefulDegradation,
  lookup,
  testLookup
};
