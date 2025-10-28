# MEMORY SYSTEM DIAGNOSTIC REPORT
**Generated:** 2025-10-28  
**Task:** Discovery-only diagnostic of token limits, routing logic, and compression

---

## TASK 1: TOKEN LIMIT CONSTANTS

### 1.1 Subcategory Token Limit (Per-Category Storage Limit)

```javascript
SUBCATEGORY_TOKEN_LIMIT = 50000 tokens
```
**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/core.js:36`

```javascript
this.categoryLimits = {
  tokenLimit: 50000,
  memoryLimit: 1000,
};
```

**Also in Database Schema:**
**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/core.js:174`

```sql
CREATE TABLE IF NOT EXISTS memory_categories (
  ...
  max_tokens INTEGER DEFAULT 50000,
  ...
)
```

### 1.2 Response Token Budget (Memory Retrieval Limit)

```javascript
RESPONSE_TOKEN_BUDGET = 2400 tokens
```

**Primary Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/intelligence.js:2325`

```javascript
// CRITICAL FIX: Enforce strict 2400 token budget
let budgetUsed = 0;
const tokenBudget = 2400;
```

**Secondary Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/lib/master-intelligence-orchestrator.js:27`

```javascript
this.tokenLimits = {
  ...
  memoryInjection: 2400, // Align with existing enforcement
  ...
};
```

**Tertiary Source (Orchestrator):** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/core/orchestrator.js:1144`

```javascript
const BUDGET = {
  MEMORY: 2500,  // Note: Higher limit in orchestrator, but intelligence.js enforces 2400
  DOCUMENTS: 3000,
  VAULT: 9000,
  TOTAL: 15000,
};
```

**ACTUAL ENFORCEMENT:** The strictest limit of **2400 tokens** is enforced by `intelligence.js:2325`, which runs AFTER orchestrator budget checks.

### 1.3 Cross-Category Fallback Token Cap

**No explicit cross-category fallback cap found.** However, the system uses the same 2400-token budget for all memory retrieval regardless of whether it's from primary or related categories.

**Related Logic:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/intelligence.js:1503-1538`

The `ENABLE_INTELLIGENT_ROUTING` feature flag triggers cross-category topic-based search when:
- Routing confidence < 0.80 (line 1507)
- OR results count < 3

This cross-category search is still subject to the 2400-token budget enforcement.

### 1.4 Memory Compression Ratio Target

```javascript
COMPRESSION_RATIO_TARGET = "10-20:1"
```

**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/memory/intelligent-storage.js:3`

```javascript
// Provides 10-20:1 compression ratio and duplicate detection
```

**Also documented at:** Line 95 in same file:

```javascript
/**
 * Target: 10-20:1 compression ratio
 */
async extractKeyFacts(userMsg, aiResponse) {
  const prompt = `Extract ATOMIC FACTS from this conversation.
Format: One fact per line, 3-8 words max, bullet points.
...
```

**Model Used:** `gpt-4o-mini` (line 101)

```javascript
const response = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
  max_tokens: 150
});
```

### 1.5 Deduplication Similarity Threshold

```javascript
DEDUPLICATION_SIMILARITY_THRESHOLD = 0.3
```

**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/memory/intelligent-storage.js:144`

```javascript
// Return most similar if above threshold
if (result.rows.length > 0 && result.rows[0].similarity > 0.3) {
  console.log(`[DEDUP] 📊 Found similar memory with similarity score: ${result.rows[0].similarity.toFixed(3)}`);
  return result.rows[0];
}
```

**Method:** PostgreSQL full-text search using `ts_rank()` with keyword overlap detection (line 127-141).

---

## TASK 2: DATABASE STATE ANALYSIS

### 2.1 Database Tables Schema

**Note:** Database connection is not available in the diagnostic environment, so schemas are derived from code.

#### persistent_memories Table

**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/core.js:150-164`

```sql
CREATE TABLE IF NOT EXISTS persistent_memories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  subcategory_name VARCHAR(100),
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  relevance_score DECIMAL(3,2) DEFAULT 0.50,
  usage_frequency INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_memories_user_category` ON (user_id, category_name)
- `idx_memories_relevance` ON (relevance_score DESC)

#### memory_categories Table

**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/core.js:168-180`

```sql
CREATE TABLE IF NOT EXISTS memory_categories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  subcategory_name VARCHAR(100),
  current_tokens INTEGER DEFAULT 0,
  max_tokens INTEGER DEFAULT 50000,
  is_dynamic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category_name, subcategory_name)
)
```

#### user_memory_profiles Table

**NOT FOUND** - No schema for `user_memory_profiles` exists in the codebase. This table may not be implemented yet.

### 2.2 SQL Query Results

**DATABASE CONNECTION NOT AVAILABLE IN DIAGNOSTIC ENVIRONMENT**

The following queries would need to be run manually with access to the production/staging database:

```sql
-- Query 1: What categories have data?
SELECT 
  category_name, 
  subcategory_name, 
  COUNT(*) as memory_count,
  SUM(token_count) as total_tokens
FROM persistent_memories 
WHERE user_id = 'anonymous'
GROUP BY category_name, subcategory_name
ORDER BY category_name, subcategory_name;

-- Query 2: Sample memory record
SELECT id, category_name, subcategory_name, 
       LENGTH(content) as content_length, 
       token_count, relevance_score, usage_frequency,
       created_at, last_accessed
FROM persistent_memories 
WHERE user_id = 'anonymous'
LIMIT 1;
```

**Recommendation:** Run these queries directly against the Railway PostgreSQL instance to get actual data distribution.

---

## TASK 3: CURRENT ROUTING LOGIC

### 3.1 Semantic Routing Function

**Primary Function:** `analyzeAndRoute(query, userId)`  
**Source:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/categories/memory/internal/intelligence.js:674-766`

### 3.2 Category Scoring Logic

The routing system uses a **multi-factor scoring algorithm**:

#### Scoring Components (in priority order):

1. **SEMANTIC SCORE (Primary Driver - 8x amplification)**
   - Intent-based boosting (lines 1054-1090)
   - Emotional weight boosting (lines 1097-1106)
   - Personal context amplification (lines 1109-1117)
   - **Applied at:** Line 911: `score += semanticScore * 8.0`

2. **KEYWORD MATCHES (Reduced - 0.3x weight)**
   - Per-keyword match adds `0.3 * config.weight`
   - **Applied at:** Line 919
   - **Note:** Reduced from 2.0x in earlier versions

3. **PATTERN MATCHES (Reduced - 0.5x weight)**
   - Per-pattern match adds `0.5 * config.weight`
   - **Applied at:** Line 925
   - **Note:** Reduced from 3.5x in earlier versions

4. **ENTITY ALIGNMENT BOOST**
   - Calculates overlap between query topics and category topics
   - **Method:** `calculateEntityAlignmentBoost()` (lines 1121-1152)

5. **PRIORITY-BASED WEIGHTING**
   - High-priority categories get +1.0 when urgency > 0.5
   - **Applied at:** Lines 936-938

6. **KEYWORD DENSITY BONUS**
   - Multiple keyword matches: `min(matches * 0.2, 1.0)`
   - **Applied at:** Line 942

### 3.3 Confidence Thresholds

#### Confidence Calculation

**Source:** Lines 1158-1208 in `intelligence.js`

```javascript
// Advanced confidence calculation
let confidence = Math.min(bestScore / 12.0, 0.6);

// Score separation bonus
const separation = bestScore - secondScore;
confidence += Math.min(separation / 8.0, 0.2);

// Semantic analysis confidence boost
confidence += semanticAnalysis.confidence * 0.1;

// Clear winner bonus
if (bestScore > secondScore * 1.5) {
  confidence += 0.1;
}

// Multiple indicators bonus
if (semanticAnalysis.topicEntities.size > 0) {
  confidence += Math.min(semanticAnalysis.topicEntities.size * 0.05, 0.1);
}

return {
  primaryCategory: bestCategory,
  confidence: Math.max(0.2, Math.min(confidence, 1.0)),
  ...
}
```

#### Confidence Thresholds Used in System

**High Confidence:** > 0.8  
- Tracked in `routingStats.highConfidenceRoutes`
- Used to decide whether to apply intelligent routing fallback

**Medium Confidence:** 0.5 - 0.8  
- Tracked in `routingStats.confidenceDistribution.medium`

**Low Confidence:** < 0.5  
- Tracked in `routingStats.confidenceDistribution.low`
- Triggers fallback to `mental_emotional` category (lines 1269-1278)

#### Intelligent Routing Fallback Trigger

**Source:** Lines 1503-1537 in `intelligence.js`

```javascript
if (process.env.ENABLE_INTELLIGENT_ROUTING === 'true') {
  const shouldUseFallback = routing.confidence < 0.80 || allMemories.length < 3;
  
  if (shouldUseFallback) {
    // Try topic-based retrieval across ALL categories
  }
}
```

**CRITICAL THRESHOLD:** Confidence < **0.80** triggers cross-category topic search

### 3.4 Storage vs Retrieval Routing Differences

#### Storage Routing
- **Purpose:** Determine which category to store new memory in
- **Method:** Uses `analyzeAndRoute()` with full semantic analysis
- **Called from:** Memory storage operations in orchestrator
- **Category selection:** Based on highest scoring category with confidence

#### Retrieval Routing
- **Purpose:** Determine which category to search for relevant memories
- **Method:** Uses same `analyzeAndRoute()` but with additional fallback mechanisms
- **Feature:** Intelligent routing with topic-based fallback (when enabled)
- **Key difference:** Retrieval can search MULTIPLE categories if confidence is low (<0.80)

#### Storage-Retrieval Mismatch Issue

**Problem:** Memory stored in Category A might be retrieved from Category B, causing "needle in haystack" problem.

**Solution:** `ENABLE_INTELLIGENT_ROUTING` feature flag (line 1504)
- When routing confidence < 0.80, extract topic keywords
- Search across ALL categories for those topics
- Merge results from primary + topic-based search

**Topic Search Method:** `searchByTopics()` (lines 1742-1818)

---

## TASK 4: COMPRESSION IMPLEMENTATION

### 4.1 Is extractKeyFacts() Being Called?

**YES** - Compression is active

**Invocation Point:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/api/memory/intelligent-storage.js:55`

```javascript
async storeWithIntelligence(userId, userMessage, aiResponse, category) {
  // Step 1: Extract facts (compression)
  console.log('[INTELLIGENT-STORAGE] 📝 Extracting key facts...');
  const facts = await this.extractKeyFacts(userMessage, aiResponse);
  
  const originalTokens = this.countTokens(userMessage + aiResponse);
  const compressedTokens = this.countTokens(facts);
  const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;
  
  console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);
  ...
}
```

### 4.2 What Model is Used?

**Model:** `gpt-4o-mini` ✅ (Correct as specified)

**Source:** Line 101 in `intelligent-storage.js`

```javascript
const response = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
  max_tokens: 150
});
```

**Parameters:**
- Temperature: 0 (deterministic)
- Max tokens: 150 (for extracted facts)

### 4.3 Actual Compression Ratio Achieved

**Target:** 10-20:1

**Actual:** Would need to check production logs

**Calculation Logic:** Lines 58-61 in `intelligent-storage.js`

```javascript
const originalTokens = this.countTokens(userMessage + aiResponse);
const compressedTokens = this.countTokens(facts);
const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;

console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);
```

**Stored in Metadata:** Line 76

```javascript
return await this.storeCompressedMemory(userId, category, facts, {
  original_tokens: originalTokens,
  compressed_tokens: compressedTokens,
  compression_ratio: parseFloat(ratio)
});
```

### 4.4 Compression Statistics Location

**Log Messages to Search For:**

1. `[INTELLIGENT-STORAGE] 📊 Compression: {original} → {compressed} tokens ({ratio}:1)`
2. `[INTELLIGENT-STORAGE] ✅ Extracted {count} facts`
3. `[INTELLIGENT-STORAGE] ✅ Stored compressed memory: ID={id}, tokens={tokens}`

**Metadata Storage:** Compression statistics are stored in the `metadata` JSONB column:

```json
{
  "original_tokens": 500,
  "compressed_tokens": 50,
  "compression_ratio": 10.0,
  "compressed": true,
  "dedup_checked": true,
  "storage_version": "intelligent_v1"
}
```

**SQL Query to Get Average Compression:**

```sql
SELECT 
  AVG((metadata->>'compression_ratio')::float) as avg_compression_ratio,
  MIN((metadata->>'compression_ratio')::float) as min_compression_ratio,
  MAX((metadata->>'compression_ratio')::float) as max_compression_ratio,
  COUNT(*) as compressed_memories
FROM persistent_memories
WHERE metadata->>'compressed' = 'true'
  AND metadata->>'compression_ratio' IS NOT NULL;
```

---

## SUMMARY OF FINDINGS

### Token Limits Hierarchy

1. **Per-Category Storage:** 50,000 tokens per category/subcategory
2. **Per-Request Retrieval:** 2,400 tokens (strictly enforced)
3. **Orchestrator Memory Budget:** 2,500 tokens (looser, overridden by 2400)
4. **Cross-Category Fallback:** Same 2,400 token budget applies

### Routing Confidence Behavior

- **High confidence (>0.8):** Uses primary category only
- **Low confidence (<0.8):** Triggers topic-based cross-category search
- **Very low (<0.5):** Falls back to `mental_emotional` category

### Compression Status

- ✅ **Active** and using correct model (gpt-4o-mini)
- ✅ **Target:** 10-20:1 compression ratio
- ✅ **Deduplication:** Active with 0.3 similarity threshold
- ⚠️ **Metrics:** Need production logs to verify actual ratios achieved

### Database Schema

- ✅ `persistent_memories` table exists with proper indexes
- ✅ `memory_categories` table exists with 50K token limit
- ❌ `user_memory_profiles` table NOT FOUND in codebase

---

## RECOMMENDATIONS FOR PRODUCTION VERIFICATION

1. **Check actual compression ratios** in Railway logs:
   ```bash
   railway logs --filter="INTELLIGENT-STORAGE.*Compression"
   ```

2. **Query database for memory distribution:**
   ```sql
   -- Run the queries from Task 2.2 against production DB
   ```

3. **Verify intelligent routing is enabled:**
   ```bash
   railway variables get ENABLE_INTELLIGENT_ROUTING
   ```

4. **Check average tokens per retrieval:**
   ```sql
   SELECT 
     category_name,
     COUNT(*) as memory_count,
     SUM(token_count) as total_tokens,
     AVG(token_count) as avg_tokens_per_memory
   FROM persistent_memories
   GROUP BY category_name
   ORDER BY total_tokens DESC;
   ```

---

**End of Diagnostic Report**
