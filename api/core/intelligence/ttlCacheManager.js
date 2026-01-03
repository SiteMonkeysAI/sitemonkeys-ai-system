/**
 * ttlCacheManager.js
 * Phase 4: Dual Hierarchy Truth Validation
 * 
 * Purpose: Manage time-based caching with truth-type-specific durations
 * Handles cache storage, retrieval, expiration, and semantic fingerprinting
 * 
 * Location: /api/core/intelligence/ttlCacheManager.js
 */

import { TRUTH_TYPES, TTL_CONFIG } from './truthTypeDetector.js';

// In-memory cache (can be migrated to PostgreSQL later)
const cache = new Map();

// Cache statistics for telemetry
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  stores: 0
};

/**
 * Generate semantic fingerprint for cache key matching
 * Normalizes queries so equivalent queries hit same cache entry
 * @param {string} query - The user's query
 * @returns {string} Normalized fingerprint
 */
export function semanticFingerprint(query) {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Normalize: lowercase, remove extra spaces, remove punctuation
  let normalized = query.toLowerCase().trim();
  
  // Remove common stop words that don't affect meaning
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'who', 'when', 'where', 'how', 'does', 'do', 'did', 'can', 'could', 'would', 'should', 'of', 'for', 'to', 'in', 'on', 'at', 'by'];
  
  let words = normalized.split(/\s+/);
  words = words.filter(word => !stopWords.includes(word));
  
  // Remove punctuation from each word
  words = words.map(word => word.replace(/[^\w]/g, ''));
  
  // Filter empty strings
  words = words.filter(word => word.length > 0);
  
  // Sort alphabetically for consistent fingerprint
  words.sort();
  
  // Join with single delimiter
  return words.join('|');
}

/**
 * Create a cache entry with required provenance tags
 * @param {string} query - Original query
 * @param {object} data - Data to cache
 * @param {string} truthType - VOLATILE, SEMI_STABLE, or PERMANENT
 * @param {array} sources - Array of source objects { url, name, type }
 * @param {number} confidence - Confidence score 0.0-1.0
 * @returns {object} Complete cache entry
 */
export function createCacheEntry(query, data, truthType, sources = [], confidence = 0.5) {
  const now = new Date();
  const ttl = TTL_CONFIG[truthType] || TTL_CONFIG.SEMI_STABLE;
  const expiresAt = new Date(now.getTime() + ttl);

  return {
    query_fingerprint: semanticFingerprint(query),
    original_query: query,
    data: data,
    truth_type: truthType,
    source_class: sources.length > 0 ? 'external' : 'internal',
    sources_used: sources,
    confidence: confidence,
    verified_at: now.toISOString(),
    cache_valid_until: expiresAt.toISOString(),
    ttl_ms: ttl,
    created_at: now.toISOString()
  };
}

/**
 * Check if a cache entry is still valid
 * @param {object} entry - Cache entry to check
 * @returns {boolean} True if entry is still valid
 */
export function isEntryValid(entry) {
  if (!entry || !entry.cache_valid_until) {
    return false;
  }
  
  const expiresAt = new Date(entry.cache_valid_until);
  const now = new Date();
  
  return now < expiresAt;
}

/**
 * Get time remaining until cache entry expires
 * @param {object} entry - Cache entry
 * @returns {number} Milliseconds until expiration (negative if expired)
 */
export function getTimeRemaining(entry) {
  if (!entry || !entry.cache_valid_until) {
    return -1;
  }
  
  const expiresAt = new Date(entry.cache_valid_until);
  const now = new Date();
  
  return expiresAt.getTime() - now.getTime();
}

/**
 * Store data in cache
 * @param {string} query - Query to use as key
 * @param {object} data - Data to cache
 * @param {string} truthType - Truth type for TTL determination
 * @param {array} sources - Sources used
 * @param {number} confidence - Confidence score
 * @returns {object} The stored cache entry
 */
export function set(query, data, truthType, sources = [], confidence = 0.5) {
  const fingerprint = semanticFingerprint(query);
  
  if (!fingerprint) {
    console.warn('[ttlCacheManager] Cannot cache empty or invalid query');
    return null;
  }

  const entry = createCacheEntry(query, data, truthType, sources, confidence);
  
  cache.set(fingerprint, entry);
  cacheStats.stores++;
  
  console.log(`[ttlCacheManager] Cached: "${query.substring(0, 50)}..." (${truthType}, TTL: ${entry.ttl_ms}ms)`);
  
  return entry;
}

/**
 * Retrieve data from cache
 * @param {string} query - Query to look up
 * @returns {object|null} Cache entry if found and valid, null otherwise
 */
export function get(query) {
  const fingerprint = semanticFingerprint(query);
  
  if (!fingerprint) {
    cacheStats.misses++;
    return null;
  }

  const entry = cache.get(fingerprint);
  
  if (!entry) {
    cacheStats.misses++;
    console.log(`[ttlCacheManager] Cache miss: "${query.substring(0, 50)}..."`);
    return null;
  }

  if (!isEntryValid(entry)) {
    // Entry expired, remove it
    cache.delete(fingerprint);
    cacheStats.misses++;
    cacheStats.evictions++;
    console.log(`[ttlCacheManager] Cache expired: "${query.substring(0, 50)}..."`);
    return null;
  }

  cacheStats.hits++;
  console.log(`[ttlCacheManager] Cache hit: "${query.substring(0, 50)}..." (${getTimeRemaining(entry)}ms remaining)`);
  
  return entry;
}

/**
 * Invalidate a specific cache entry
 * @param {string} query - Query to invalidate
 * @returns {boolean} True if entry was found and removed
 */
export function invalidate(query) {
  const fingerprint = semanticFingerprint(query);
  
  if (!fingerprint) {
    return false;
  }

  const existed = cache.has(fingerprint);
  cache.delete(fingerprint);
  
  if (existed) {
    cacheStats.evictions++;
    console.log(`[ttlCacheManager] Invalidated: "${query.substring(0, 50)}..."`);
  }
  
  return existed;
}

/**
 * Invalidate all entries of a specific truth type
 * @param {string} truthType - Truth type to invalidate
 * @returns {number} Number of entries invalidated
 */
export function invalidateByTruthType(truthType) {
  let count = 0;
  
  for (const [fingerprint, entry] of cache.entries()) {
    if (entry.truth_type === truthType) {
      cache.delete(fingerprint);
      count++;
      cacheStats.evictions++;
    }
  }
  
  console.log(`[ttlCacheManager] Invalidated ${count} entries of type ${truthType}`);
  return count;
}

/**
 * Clear all expired entries from cache
 * @returns {number} Number of entries cleared
 */
export function clearExpired() {
  let count = 0;
  
  for (const [fingerprint, entry] of cache.entries()) {
    if (!isEntryValid(entry)) {
      cache.delete(fingerprint);
      count++;
      cacheStats.evictions++;
    }
  }
  
  if (count > 0) {
    console.log(`[ttlCacheManager] Cleared ${count} expired entries`);
  }
  
  return count;
}

/**
 * Clear entire cache
 * @returns {number} Number of entries cleared
 */
export function clearAll() {
  const count = cache.size;
  cache.clear();
  cacheStats.evictions += count;
  
  console.log(`[ttlCacheManager] Cleared all ${count} cache entries`);
  return count;
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
export function getStats() {
  // Clean expired entries first
  clearExpired();
  
  // Count entries by truth type
  const byTruthType = {
    [TRUTH_TYPES.VOLATILE]: 0,
    [TRUTH_TYPES.SEMI_STABLE]: 0,
    [TRUTH_TYPES.PERMANENT]: 0
  };
  
  for (const entry of cache.values()) {
    if (byTruthType.hasOwnProperty(entry.truth_type)) {
      byTruthType[entry.truth_type]++;
    }
  }

  return {
    total_entries: cache.size,
    by_truth_type: byTruthType,
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    stores: cacheStats.stores,
    evictions: cacheStats.evictions,
    hit_rate: cacheStats.hits + cacheStats.misses > 0 
      ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(3) 
      : 0
  };
}

/**
 * Test endpoint handler for /api/test-semantic/cache
 * @param {string} action - Action to perform (get, set, stats, clear)
 * @param {object} params - Parameters for the action
 * @returns {object} Result of the action
 */
export function testCache(action, params = {}) {
  console.log(`[ttlCacheManager] Test action: ${action}`);
  
  switch (action) {
    case 'set':
      if (!params.query || !params.data || !params.truthType) {
        return { success: false, error: 'Missing required params: query, data, truthType' };
      }
      const setResult = set(params.query, params.data, params.truthType, params.sources || [], params.confidence || 0.5);
      return { success: true, action: 'set', entry: setResult };
    
    case 'get':
      if (!params.query) {
        return { success: false, error: 'Missing required param: query' };
      }
      const getResult = get(params.query);
      return { 
        success: true, 
        action: 'get', 
        found: getResult !== null, 
        entry: getResult,
        fingerprint: semanticFingerprint(params.query)
      };
    
    case 'invalidate':
      if (!params.query) {
        return { success: false, error: 'Missing required param: query' };
      }
      const invalidated = invalidate(params.query);
      return { success: true, action: 'invalidate', was_cached: invalidated };
    
    case 'stats':
      return { success: true, action: 'stats', stats: getStats() };
    
    case 'clear':
      const cleared = clearAll();
      return { success: true, action: 'clear', entries_cleared: cleared };
    
    case 'fingerprint':
      if (!params.query) {
        return { success: false, error: 'Missing required param: query' };
      }
      return { 
        success: true, 
        action: 'fingerprint', 
        query: params.query,
        fingerprint: semanticFingerprint(params.query)
      };
    
    default:
      return { 
        success: false, 
        error: `Unknown action: ${action}`,
        available_actions: ['set', 'get', 'invalidate', 'stats', 'clear', 'fingerprint']
      };
  }
}

// Default export
export default {
  TRUTH_TYPES,
  TTL_CONFIG,
  semanticFingerprint,
  createCacheEntry,
  isEntryValid,
  getTimeRemaining,
  set,
  get,
  invalidate,
  invalidateByTruthType,
  clearExpired,
  clearAll,
  getStats,
  testCache
};
