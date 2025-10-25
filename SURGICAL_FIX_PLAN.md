# SURGICAL FIX PLAN - Site Monkeys AI System Restoration

## Executive Summary
Based on comprehensive audit, implementing 3 critical fixes with feature flags:
1. **Fix A**: Intelligent routing with topic-based fallback
2. **Fix B**: Enable intelligent storage (compression + deduplication)
3. **Fix C**: Document budget reduction (10K → 1K per spec)

All fixes are **token-neutral or token-reducing**, fully reversible via feature flags.

---

## FIX A: INTELLIGENT ROUTING WITH TOPIC FALLBACK (CRITICAL)

### Problem
**Evidence**: Audit showed 100% routing mismatch (5/5 tests failed)
- Storage: "My kids are named Sarah" → `personal_life_interests`
- Retrieval: "What did I tell you about My?" → `tools_tech_workflow`
- **Impact**: Memories stored but never retrieved ("needle in haystack")

### Root Cause
Query transformation changes semantic context:
- Original: "My kids are named Sarah" (personal sharing intent)
- Retrieval: "What did I tell you" (information request intent)
- Different intents → different categories → no recall

### Solution: Two-Stage Retrieval
**Stage 1**: Try primary category (current behavior)
**Stage 2**: If confidence <0.80 OR results <2, extract topic keywords and search across ALL categories

### Implementation

#### File 1: `api/categories/memory/internal/intelligence.js`

**Location**: After line 1535 (end of extractRelevantMemories function)

**Change**: Add topic-based cross-category fallback

```javascript
// FEATURE FLAG: ENABLE_INTELLIGENT_ROUTING
if (process.env.ENABLE_INTELLIGENT_ROUTING === 'true') {
  // If primary routing confidence is low, try topic-based retrieval
  if (routing.confidence < 0.80 || primaryMemories.length < 2) {
    console.log('[INTELLIGENT-ROUTING] Low confidence or few results, trying topic-based retrieval...');
    
    // Extract topic keywords from original query
    const topics = this.extractImportantNouns(query.toLowerCase());
    
    if (topics.length > 0) {
      // Search across ALL categories for these topics
      const topicMemories = await this.searchByTopics(userId, topics, routing.primaryCategory);
      
      // Merge with primary results
      allMemories = [...scoredPrimary, ...topicMemories];
      console.log(`[INTELLIGENT-ROUTING] Found ${topicMemories.length} additional memories via topic search`);
    }
  }
}
```

**New function to add** (after extractRelevantMemories):

```javascript
/**
 * Search memories across all categories by topic keywords
 * Used when primary routing confidence is low
 */
async searchByTopics(userId, topics, excludeCategory) {
  try {
    return await this.coreSystem.withDbClient(async (client) => {
      // Build topic search query
      const topicFilters = topics
        .map((_, i) => `content::text ILIKE $${i + 3}::text`)
        .join(' OR ');
      
      const query = `
        SELECT id, user_id, category_name, subcategory_name, content, 
               token_count, relevance_score, usage_frequency, 
               created_at, last_accessed, metadata
        FROM persistent_memories 
        WHERE user_id = $1 
          AND category_name != $2
          AND relevance_score > 0.3
          AND (${topicFilters})
        ORDER BY relevance_score DESC, created_at DESC
        LIMIT 10
      `;
      
      const params = [
        userId, 
        excludeCategory || 'none',
        ...topics.map(t => `%${t}%`)
      ];
      
      const result = await client.query(query, params);
      
      return result.rows.map(memory => ({
        ...memory,
        source: 'topic_fallback',
        relevanceScore: memory.relevance_score * 0.8 // Slight penalty for cross-category
      }));
    });
  } catch (error) {
    this.logger.error('Topic-based search failed:', error);
    return [];
  }
}
```

**Token Impact**: NEUTRAL (no additional API calls, just different DB query)
**Risk**: LOW (fallback only, doesn't change primary behavior)
**Testing**: Re-run audit with ENABLE_INTELLIGENT_ROUTING=true

---

## FIX B: ENABLE INTELLIGENT STORAGE (COMPRESSION + DEDUP)

### Problem
- Duplicate memories filling database
- Verbose conversations consuming tokens
- No compression or deduplication active

### Solution
Enable existing intelligent storage feature (already implemented!)

### Implementation

#### File 1: `.env` or Railway environment variables

**Add**:
```bash
ENABLE_INTELLIGENT_STORAGE=true
```

**What this enables** (already coded in server.js line 345):
1. GPT-4o-mini fact extraction (10-20:1 compression)
2. Full-text similarity search (70% threshold)
3. Boost existing memories instead of duplicating
4. Automatic deduplication

**Token Impact**: REDUCES by 10-20x (compression ratio)
**Risk**: LOW (fallback to uncompressed if fails)
**Location**: server.js lines 345-378, intelligent-storage.js entire file

---

## FIX C: DOCUMENT BUDGET REDUCTION (OPTIONAL)

### Problem
- Current: 10,000 token limit
- Spec: 1,000 token limit
- Over-budget by 10x

### Solution
Reduce document token limit to match spec

### Implementation

#### File 1: `api/core/orchestrator.js`

**Location**: Line 675

**Current**:
```javascript
if (tokens > 10000) {
  const truncated = documentContent.substring(0, 40000);
  this.log(`[DOCUMENTS] Truncated from ${tokens} to ~10000 tokens`);
  
  return {
    content: truncated,
    tokens: 10000,
    // ...
  };
}
```

**Changed**:
```javascript
// FEATURE FLAG: ENABLE_STRICT_DOC_BUDGET (default: false for backward compat)
const docBudget = process.env.ENABLE_STRICT_DOC_BUDGET === 'true' ? 1000 : 10000;

if (tokens > docBudget) {
  // 1 token ≈ 4 chars, so multiply by 4
  const truncated = documentContent.substring(0, docBudget * 4);
  this.log(`[DOCUMENTS] Truncated from ${tokens} to ~${docBudget} tokens`);
  
  return {
    content: truncated,
    tokens: docBudget,
    // ...
  };
}
```

**Token Impact**: REDUCES by 9,000 tokens (if enabled)
**Risk**: MEDIUM (may lose document context)
**Recommendation**: Test thoroughly before enabling

---

## WAVE 1: ROUTING FIX (1-2 files)

### PR #1: Intelligent Routing with Topic Fallback
**Files changed**: 1
- `api/categories/memory/internal/intelligence.js` (+50 lines)

**Feature flag**: `ENABLE_INTELLIGENT_ROUTING=true`
**Default**: OFF (safe rollout)
**Tests**: Re-run comprehensive-audit.js

---

## WAVE 2: ENABLE EXISTING FEATURES (0-1 files)

### PR #2: Enable Intelligent Storage
**Files changed**: 0 (environment variable only)
- Set `ENABLE_INTELLIGENT_STORAGE=true` in Railway

**Feature flag**: Already exists
**Default**: OFF → ON
**Tests**: Monitor memory storage logs for compression ratios

---

## WAVE 3: DOCUMENT BUDGET (OPTIONAL)

### PR #3: Strict Document Budget
**Files changed**: 1
- `api/core/orchestrator.js` (~5 lines modified)

**Feature flag**: `ENABLE_STRICT_DOC_BUDGET=true`
**Default**: OFF (10K) for backward compatibility
**Tests**: Upload large document, verify 1K truncation

---

## VERIFICATION CHECKLIST

After implementing fixes:

### Routing Fix Verification
```bash
ENABLE_INTELLIGENT_ROUTING=true node comprehensive-audit.js
```
**Expected**: Routing match rate >80% (was 0%)

### Intelligent Storage Verification
```bash
# Check logs for:
# [INTELLIGENT-STORAGE] 📊 Compression: X → Y tokens (Z:1)
# [DEDUP] ♻️ Found similar memory, boosting instead
```
**Expected**: Compression ratios 10-20:1, dedup working

### Document Budget Verification
```bash
# Upload 10K+ token document
# Check logs for:
# [DOCUMENTS] Truncated from X to ~1000 tokens
```
**Expected**: Truncation at 1K (if flag enabled)

---

## TOKEN BUDGET COMPLIANCE

### Before Fixes
- Memory: ≤2,400 tokens ✅ (already enforced)
- Documents: ≤10,000 tokens ⚠️ (over spec by 9K)
- Vault: ≤9,000 tokens ✅ (intelligent selection working)
- **Total**: ~21,400 tokens per query

### After Fix A (Routing)
- Memory: ≤2,400 tokens ✅ (unchanged)
- Documents: ≤10,000 tokens ⚠️ (unchanged unless Fix C)
- Vault: ≤9,000 tokens ✅ (unchanged)
- **Total**: ~21,400 tokens per query (NEUTRAL)

### After Fix B (Intelligent Storage)
- Memory storage: **10-20x compression** (1000 token conversation → 50-100 tokens stored)
- Memory retrieval: ≤2,400 tokens ✅ (unchanged)
- **Benefit**: Database size reduced, faster queries, less duplication

### After Fix C (Strict Doc Budget) - OPTIONAL
- Memory: ≤2,400 tokens ✅ (unchanged)
- Documents: ≤1,000 tokens ✅ (per spec)
- Vault: ≤9,000 tokens ✅ (unchanged)
- **Total**: ~12,400 tokens per query (REDUCED by 9K)

---

## ROLLBACK PLAN

All fixes are feature-flagged and reversible:

1. **Fix A (Routing)**: Set `ENABLE_INTELLIGENT_ROUTING=false`
2. **Fix B (Storage)**: Set `ENABLE_INTELLIGENT_STORAGE=false`
3. **Fix C (Doc Budget)**: Set `ENABLE_STRICT_DOC_BUDGET=false`

No data loss, immediate rollback, system continues with original behavior.

---

## IMPLEMENTATION ORDER

**Recommended sequence**:
1. ✅ Audit complete (DONE)
2. 🔧 Implement Fix A (routing) - HIGHEST IMPACT
3. 🔧 Enable Fix B (storage) - FREE COMPRESSION
4. ⏸️ Consider Fix C (doc budget) - OPTIONAL, test first

**Total files modified**: 1-2 files
**Total lines changed**: ~50-60 lines
**Risk level**: LOW (all feature-flagged)
**Expected impact**: HIGH (routing mismatch resolved)

---

## GOLDEN TEST CASES

After fixes, these should work:

1. **Nicknames**: Store "My kids are Sarah and Jake" → Retrieve "What are my kids' names?"
2. **Vehicles**: Store "I own a Honda Civic" → Retrieve "What cars do I have?"
3. **Superheroes**: Store "Favorite superhero is Spider-Man" → Retrieve "Who is my favorite hero?"
4. **Programming**: Store "I love Python" → Retrieve "What language do I prefer?"
5. **Relationships**: Store "My wife is stressed at work" → Retrieve "How is my wife doing?"

**Current**: 0/5 working
**After Fix A**: Expected 4-5/5 working
