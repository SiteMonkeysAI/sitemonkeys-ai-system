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

// Domain-specific authoritative sources
export const AUTHORITATIVE_SOURCES = {
  MEDICAL: [
    { name: 'FDA', url: 'https://www.fda.gov', type: 'government' },
    { name: 'NIH', url: 'https://www.nih.gov', type: 'government' },
    { name: 'CDC', url: 'https://www.cdc.gov', type: 'government' },
    { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org', type: 'medical' },
    { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', type: 'research' }
  ],
  LEGAL: [
    { name: 'Congress.gov', url: 'https://www.congress.gov', type: 'government' },
    { name: 'Supreme Court', url: 'https://www.supremecourt.gov', type: 'government' },
    { name: 'Federal Register', url: 'https://www.federalregister.gov', type: 'government' },
    { name: 'Cornell Law', url: 'https://www.law.cornell.edu', type: 'legal' }
  ],
  FINANCIAL: [
    { name: 'SEC', url: 'https://www.sec.gov', type: 'government' },
    { name: 'IRS', url: 'https://www.irs.gov', type: 'government' },
    { name: 'Federal Reserve', url: 'https://www.federalreserve.gov', type: 'government' },
    { name: 'Treasury', url: 'https://home.treasury.gov', type: 'government' }
  ],
  SAFETY: [
    { name: 'CPSC', url: 'https://www.cpsc.gov', type: 'government' },
    { name: 'NHTSA', url: 'https://www.nhtsa.gov', type: 'government' },
    { name: 'OSHA', url: 'https://www.osha.gov', type: 'government' },
    { name: 'FDA Recalls', url: 'https://www.fda.gov/safety/recalls', type: 'government' }
  ],
  GENERAL: [
    { name: 'Wikipedia', url: 'https://en.wikipedia.org', type: 'encyclopedia' },
    { name: 'Reuters', url: 'https://www.reuters.com', type: 'news' },
    { name: 'AP News', url: 'https://apnews.com', type: 'news' }
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
 * Get authoritative sources for a query based on detected domains
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
 * Perform external lookup with real HTTP fetches
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
        console.log(`[externalLookupEngine] Fetching from ${source.name} (${source.url})`);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LOOKUP_CONFIG.TIMEOUT_MS);

        // Perform fetch with timeout
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SiteMonkeys-AI-System/1.0',
            'Accept': 'text/html,application/json,text/plain'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.log(`[externalLookupEngine] ${source.name} returned ${response.status}`);
          sourcesUsed.push({
            name: source.name,
            url: source.url,
            status: `error_${response.status}`
          });
          continue;
        }

        // Get response text
        let text = await response.text();

        // Truncate if needed
        const remainingBudget = LOOKUP_CONFIG.MAX_FETCHED_TEXT - totalTextFetched;
        if (text.length > remainingBudget) {
          text = text.substring(0, remainingBudget);
        }

        totalTextFetched += text.length;

        // Store result
        results.push({
          source: source.name,
          text: text,
          length: text.length
        });

        sourcesUsed.push({
          name: source.name,
          url: source.url,
          status: 'success',
          text_length: text.length
        });

        console.log(`[externalLookupEngine] ✓ ${source.name}: ${text.length} chars`);

      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          console.log(`[externalLookupEngine] ${source.name} timed out`);
          sourcesUsed.push({
            name: source.name,
            url: source.url,
            status: 'timeout'
          });
        } else {
          console.log(`[externalLookupEngine] ${source.name} fetch error: ${fetchError.message}`);
          sourcesUsed.push({
            name: source.name,
            url: source.url,
            status: 'error',
            error: fetchError.message
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

  // Get appropriate sources
  const sources = getSourcesForQuery(truthTypeResult.high_stakes);

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
  AUTHORITATIVE_SOURCES,
  checkFreshnessMarkers,
  isLookupRequired,
  getSourcesForQuery,
  performLookup,
  gracefulDegradation,
  lookup,
  testLookup
};
