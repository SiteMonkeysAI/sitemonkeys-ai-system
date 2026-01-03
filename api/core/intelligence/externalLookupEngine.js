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

import { detectTruthType, TRUTH_TYPES, HIGH_STAKES_DOMAINS } from './truthTypeDetector.js';
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
        // Extract drug name from query
        const drugMatch = query.match(/\b(aspirin|ibuprofen|acetaminophen|tylenol|advil)\b/i);
        const drugName = drugMatch ? drugMatch[1].toLowerCase() : 'aspirin';
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
  /\b(news|update|announcement|breaking)\b/i,
  /\b(available|in stock|open|closed)\b/i
];

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
 * Determine if external lookup is required
 * @param {string} query - The user's query
 * @param {object} truthTypeResult - Result from truthTypeDetector
 * @param {number} internalConfidence - Confidence in internal answer (0-1)
 * @returns {object} { required: boolean, reasons: array, priority: string }
 */
export function isLookupRequired(query, truthTypeResult, internalConfidence = 0.5) {
  const reasons = [];
  let priority = 'normal';

  // Check freshness markers
  const freshnessCheck = checkFreshnessMarkers(query);
  if (freshnessCheck.hasFreshnessMarkers) {
    reasons.push('freshness_markers_detected');
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

  // Check confidence threshold
  if (internalConfidence < LOOKUP_CONFIG.CONFIDENCE_THRESHOLD) {
    reasons.push('low_internal_confidence: ' + internalConfidence);
  }

  return {
    required: reasons.length > 0,
    reasons: reasons,
    priority: priority,
    max_lookups: priority === 'high' ? LOOKUP_CONFIG.HIGH_STAKES_MAX_LOOKUPS : LOOKUP_CONFIG.MAX_LOOKUPS_PER_REQUEST
  };
}

/**
 * Select sources for query - prioritize API-based sources with reliable parsers
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
 * @returns {Promise<object>} Lookup result
 */
export async function performLookup(query, sources) {
  const startTime = Date.now();

  console.log(`[externalLookupEngine] Performing lookup for: "${query.substring(0, 50)}..."`);
  console.log(`[externalLookupEngine] Sources: ${sources.map(s => s.name).join(', ')}`);

  // Check cache first
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

  // Perform actual external lookups
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
        // Build URL if function provided
        const fetchUrl = source.buildUrl ? source.buildUrl(query) : source.url;
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

        if (source.parser === 'json') {
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
        lookup_time_ms: Date.now() - startTime
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
 * @param {string} query - The user's query
 * @param {object} lookupResult - Failed lookup result
 * @param {object} internalAnswer - Best internal answer available
 * @returns {object} Degraded response with proper disclosure
 */
export function gracefulDegradation(query, lookupResult, internalAnswer = null) {
  const sources = getSourcesForQuery({ isHighStakes: false, domains: [] });

  return {
    success: true,
    degraded: true,
    disclosure: "I couldn't verify current information from external sources.",
    internal_answer: internalAnswer,
    internal_answer_labeled: internalAnswer ? {
      data: internalAnswer,
      label: 'Based on training data - may not reflect current information',
      confidence: 'unverified'
    } : null,
    verification_path: {
      message: 'You can verify this information at:',
      sources: sources.slice(0, 3).map(s => ({ name: s.name, url: s.url }))
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

  // Perform lookup
  const lookupResult = await performLookup(query, sources);

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
    total_time_ms: Date.now() - startTime
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
  checkFreshnessMarkers,
  isLookupRequired,
  selectSourcesForQuery,
  getSourcesForQuery,
  performLookup,
  gracefulDegradation,
  lookup,
  testLookup
};
