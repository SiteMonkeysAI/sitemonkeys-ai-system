# MEMORY SYSTEM DIAGNOSTIC DELIVERABLE

This document provides the exact information requested in the GitHub issue for memory system diagnostics.

---

## 1. ALL TOKEN LIMIT VALUES WITH SOURCES

### Subcategory Token Limit (the "50K" value)

```
SUBCATEGORY_TOKEN_LIMIT = 50000
```

**Source:**
- File: `/api/categories/memory/internal/core.js`
- Line: 36

```javascript
this.categoryLimits = {
  tokenLimit: 50000,
  memoryLimit: 1000,
};
```

**Also Defined In Database Schema:**
- File: `/api/categories/memory/internal/core.js`
- Line: 174

```sql
max_tokens INTEGER DEFAULT 50000
```

---

### Response Token Budget (retrieval limit)

```
RESPONSE_TOKEN_BUDGET = 2400
```

**Source:**
- File: `/api/categories/memory/internal/intelligence.js`
- Line: 2325

```javascript
// CRITICAL FIX: Enforce strict 2400 token budget
const tokenBudget = 2400;
```

**Secondary Sources:**
- File: `/api/lib/master-intelligence-orchestrator.js`, Line: 27
  ```javascript
  memoryInjection: 2400
  ```

- File: `/api/core/orchestrator.js`, Line: 1144
  ```javascript
  MEMORY: 2500  // Note: Higher, but overridden by intelligence.js
  ```

---

### Cross-Category Fallback Token Cap

```
CROSS_CATEGORY_FALLBACK_CAP = 2400 (same as response budget)
```

**Source:**
- No separate limit exists
- Cross-category search uses same 2400 token enforcement
- File: `/api/categories/memory/internal/intelligence.js`, Lines: 1503-1537

**Trigger Conditions:**
- Routing confidence < 0.80
- OR memory results < 3

---

### Memory Compression Ratio Target

```
COMPRESSION_RATIO_TARGET = "10-20:1"
```

**Source:**
- File: `/api/memory/intelligent-storage.js`
- Line: 3 (comment) and Line: 95 (docstring)

```javascript
// Provides 10-20:1 compression ratio and duplicate detection
/**
 * Target: 10-20:1 compression ratio
 */
```

---

### Deduplication Similarity Threshold

```
DEDUPLICATION_SIMILARITY_THRESHOLD = 0.3
```

**Source:**
- File: `/api/memory/intelligent-storage.js`
- Line: 144

```javascript
if (result.rows.length > 0 && result.rows[0].similarity > 0.3) {
  console.log(`[DEDUP] 📊 Found similar memory...`);
  return result.rows[0];
}
```

**Method:** PostgreSQL `ts_rank()` full-text similarity score

---

## 2. COMPLETE SQL QUERY OUTPUTS

**⚠️ DATABASE CONNECTION NOT AVAILABLE IN DIAGNOSTIC ENVIRONMENT**

The following queries need to be run manually against the Railway PostgreSQL database:

### Query 1: Category Distribution

```sql
SELECT 
  category_name, 
  subcategory_name, 
  COUNT(*) as memory_count,
  SUM(token_count) as total_tokens
FROM persistent_memories 
WHERE user_id = 'anonymous'
GROUP BY category_name, subcategory_name
ORDER BY category_name, subcategory_name;
```

**Expected Columns:**
- category_name: VARCHAR(100)
- subcategory_name: VARCHAR(100)
- memory_count: INTEGER
- total_tokens: BIGINT

---

### Query 2: Table Structures

#### persistent_memories

```sql
\d persistent_memories
```

**Schema (from code):**

```
Column           | Type                     | Modifiers
-----------------+--------------------------+---------------------------
id               | SERIAL                   | PRIMARY KEY
user_id          | TEXT                     | NOT NULL
category_name    | VARCHAR(100)             | NOT NULL
subcategory_name | VARCHAR(100)             |
content          | TEXT                     | NOT NULL
token_count      | INTEGER                  | NOT NULL DEFAULT 0
relevance_score  | DECIMAL(3,2)             | DEFAULT 0.50
usage_frequency  | INTEGER                  | DEFAULT 0
last_accessed    | TIMESTAMP                | DEFAULT CURRENT_TIMESTAMP
created_at       | TIMESTAMP                | DEFAULT CURRENT_TIMESTAMP
metadata         | JSONB                    | DEFAULT '{}'::jsonb

Indexes:
  "idx_memories_user_category" btree (user_id, category_name)
  "idx_memories_relevance" btree (relevance_score DESC)
```

**Source:** `/api/categories/memory/internal/core.js`, Lines: 150-192

---

#### memory_categories

```sql
\d memory_categories
```

**Schema (from code):**

```
Column           | Type                     | Modifiers
-----------------+--------------------------+---------------------------
id               | SERIAL                   | PRIMARY KEY
user_id          | TEXT                     | NOT NULL
category_name    | VARCHAR(100)             | NOT NULL
subcategory_name | VARCHAR(100)             |
current_tokens   | INTEGER                  | DEFAULT 0
max_tokens       | INTEGER                  | DEFAULT 50000
is_dynamic       | BOOLEAN                  | DEFAULT FALSE
created_at       | TIMESTAMP                | DEFAULT CURRENT_TIMESTAMP
updated_at       | TIMESTAMP                | DEFAULT CURRENT_TIMESTAMP

Constraints:
  UNIQUE(user_id, category_name, subcategory_name)
```

**Source:** `/api/categories/memory/internal/core.js`, Lines: 168-180

---

#### user_memory_profiles

```
⚠️ TABLE NOT FOUND IN CODEBASE
```

No schema definition for `user_memory_profiles` exists in the code. This table may not be implemented.

---

### Query 3: Sample Memory Record

```sql
SELECT id, category_name, subcategory_name, 
       LENGTH(content) as content_length, 
       token_count, relevance_score, usage_frequency,
       created_at, last_accessed
FROM persistent_memories 
WHERE user_id = 'anonymous'
LIMIT 1;
```

**Cannot execute without database access** - Need to run on Railway.

---

## 3. CURRENT ROUTING LOGIC CODE

### Main Routing Function

**Function:** `analyzeAndRoute(query, userId)`  
**Location:** `/api/categories/memory/internal/intelligence.js`, Lines: 674-766

### Category Scoring Logic

**Function:** `calculateAdvancedCategoryScores(query, semanticAnalysis, userId)`  
**Location:** `/api/categories/memory/internal/intelligence.js`, Lines: 900-975

#### Scoring Formula (in execution order):

```javascript
// 1. SEMANTIC BOOST (PRIMARY DRIVER)
score += semanticScore * 8.0;  // 8x amplification

// 2. KEYWORD MATCHING (REDUCED)
for (const keyword of config.keywords) {
  if (query.includes(keyword)) {
    score += 0.3 * config.weight;  // 0.3x weight
  }
}

// 3. PATTERN MATCHING (REDUCED)
for (const pattern of config.patterns) {
  if (pattern.test(query)) {
    score += 0.5 * config.weight;  // 0.5x weight
  }
}

// 4. ENTITY ALIGNMENT
score += this.calculateEntityAlignmentBoost(categoryName, semanticAnalysis);

// 5. PRIORITY BOOST
if (config.priority === "high" && semanticAnalysis.urgencyLevel > 0.5) {
  score += 1.0;
}

// 6. KEYWORD DENSITY
if (keywordMatches > 1) {
  score += Math.min(keywordMatches * 0.2, 1.0);
}

// 7. SEMANTIC OVERRIDE (if applicable)
const semanticOverride = this.applySemanticOverride(
  categoryName,
  semanticAnalysis,
  score
);
if (semanticOverride.override) {
  score = semanticOverride.newScore;
}
```

**Key Weights:**
- Semantic boost: 8.0x (PRIMARY)
- Keywords: 0.3x (reduced from 2.0x)
- Patterns: 0.5x (reduced from 3.5x)
- Priority: +1.0 flat
- Keyword density: 0.2x per match (max 1.0)

---

### Confidence Thresholds

**Function:** `determineBestCategoryWithConfidence()`  
**Location:** `/api/categories/memory/internal/intelligence.js`, Lines: 1158-1209

```javascript
// Base confidence
let confidence = Math.min(bestScore / 12.0, 0.6);

// Score separation bonus
const separation = bestScore - secondScore;
confidence += Math.min(separation / 8.0, 0.2);

// Semantic boost
confidence += semanticAnalysis.confidence * 0.1;

// Clear winner bonus
if (bestScore > secondScore * 1.5) {
  confidence += 0.1;
}

// Multiple indicators bonus
if (semanticAnalysis.topicEntities.size > 0) {
  confidence += Math.min(semanticAnalysis.topicEntities.size * 0.05, 0.1);
}

// Clamp to [0.2, 1.0]
return Math.max(0.2, Math.min(confidence, 1.0));
```

**Confidence Thresholds:**
- **High:** > 0.8 → Use primary category only
- **Medium:** 0.5 - 0.8 → Use primary with potential fallback
- **Low:** < 0.5 → Force fallback to `mental_emotional`

**Critical Threshold for Intelligent Routing:**
- **< 0.80** triggers cross-category topic search (Line 1507)

---

### Storage vs Retrieval Routing

#### Storage Routing
- **Used when:** Storing new memory
- **Method:** `analyzeAndRoute()` → picks single best category
- **Result:** Memory stored in ONE category

#### Retrieval Routing
- **Used when:** Searching for memories
- **Method:** `analyzeAndRoute()` → can search MULTIPLE categories
- **Fallback Logic:**
  ```javascript
  // Line 1503-1537
  if (process.env.ENABLE_INTELLIGENT_ROUTING === 'true') {
    const shouldUseFallback = routing.confidence < 0.80 || allMemories.length < 3;
    
    if (shouldUseFallback) {
      // Extract topic keywords
      const topics = this.extractImportantNouns(query);
      
      // Search across ALL categories for topics
      const topicMemories = await this.searchByTopics(userId, topics, primaryCategory);
      
      // Merge results
      allMemories = [...allMemories, ...topicMemories];
    }
  }
  ```

**Key Difference:**
- **Storage:** Single category decision
- **Retrieval:** Can pull from multiple categories when confidence is low

This solves the "needle in haystack" problem where memory stored in Category A can be retrieved when searching Category B.

---

## 4. COMPRESSION STATUS AND METRICS

### Is extractKeyFacts() Being Called?

**✅ YES - Compression is ACTIVE**

**Invocation Point:**  
File: `/api/memory/intelligent-storage.js`, Line: 55

```javascript
async storeWithIntelligence(userId, userMessage, aiResponse, category) {
  console.log('[INTELLIGENT-STORAGE] 📝 Extracting key facts...');
  const facts = await this.extractKeyFacts(userMessage, aiResponse);
  
  const originalTokens = this.countTokens(userMessage + aiResponse);
  const compressedTokens = this.countTokens(facts);
  const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;
  
  console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);
}
```

---

### What Model is Used?

**✅ gpt-4o-mini** (correct)

**Source:**  
File: `/api/memory/intelligent-storage.js`, Line: 101

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

---

### Actual Compression Ratio Achieved

**⚠️ NEED PRODUCTION LOGS TO VERIFY**

**Target:** 10-20:1

**How to Check:**

#### From Railway Logs:
```bash
railway logs --filter="INTELLIGENT-STORAGE.*Compression"
```

Look for log lines like:
```
[INTELLIGENT-STORAGE] 📊 Compression: 500 → 50 tokens (10.0:1)
```

#### From Database:
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

### Compression Statistics

**Stored in:** `metadata` JSONB column

**Example:**
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

**Log Messages:**
1. `[INTELLIGENT-STORAGE] 📝 Extracting key facts...`
2. `[INTELLIGENT-STORAGE] ✅ Extracted {n} facts`
3. `[INTELLIGENT-STORAGE] 📊 Compression: {orig} → {comp} tokens ({ratio}:1)`
4. `[INTELLIGENT-STORAGE] ✅ Stored compressed memory: ID={id}, tokens={tokens}`

---

## SUMMARY

### All Token Limits Found ✅

| Constant | Value | Source File | Line |
|----------|-------|-------------|------|
| SUBCATEGORY_TOKEN_LIMIT | 50000 | api/categories/memory/internal/core.js | 36 |
| RESPONSE_TOKEN_BUDGET | 2400 | api/categories/memory/internal/intelligence.js | 2325 |
| CROSS_CATEGORY_FALLBACK_CAP | 2400 | (same as response budget) | 1503-1537 |
| COMPRESSION_RATIO_TARGET | "10-20:1" | api/memory/intelligent-storage.js | 3, 95 |
| DEDUPLICATION_SIMILARITY_THRESHOLD | 0.3 | api/memory/intelligent-storage.js | 144 |

### Database Queries ⚠️

Cannot execute without database connection. Queries provided for manual execution on Railway.

### Routing Logic ✅

- Semantic-first scoring (8x amplification)
- Confidence threshold: 0.80 for fallback
- Storage uses single category
- Retrieval can search multiple categories when confidence < 0.80

### Compression Status ✅

- Active and using correct model (gpt-4o-mini)
- Target: 10-20:1
- Need production logs to verify actual ratios

---

**Deliverable Complete** ✅
