# Memory Storage and Retrieval Pipeline Analysis

## Executive Summary
This document provides a comprehensive trace of the memory storage and retrieval pipeline with exact FILE:LINE references as requested in the issue.

---

## 1. MEMORY STORAGE PATH

### Primary Storage Function
**File**: `api/categories/memory/internal/persistent_memory.js`
**Function**: `storeMemory` (LINE 129)

### EXACT INSERT Statement
**File**: `api/categories/memory/internal/persistent_memory.js`
**Lines**: 159-178

```sql
INSERT INTO persistent_memories (
  user_id, category_name, subcategory_name, content, 
  token_count, relevance_score, usage_frequency, 
  last_accessed, created_at, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8)
RETURNING id
```

**Parameters**:
- `$1` = userId
- `$2` = **routing.primaryCategory** ← CRITICAL: Category determined here
- `$3` = routing.subcategory
- `$4` = conversationContent
- `$5` = tokenCount
- `$6` = relevanceScore
- `$7` = 0 (initial usage frequency)
- `$8` = JSON.stringify(metadata)

### Column Storing Category Name
**Column**: `category_name` (LINE 162)
**Value Source**: `routing.primaryCategory` (LINE 170)

---

## 2. MEMORY RETRIEVAL PATH

### Primary Retrieval Function
**File**: `api/categories/memory/internal/persistent_memory.js`
**Function**: `retrieveMemory` (LINE 60)

### Retrieval Flow
1. **Route Query** (LINE 71-74):
   ```javascript
   const routing = await this.intelligenceSystem.analyzeAndRoute(query, userId);
   ```

2. **Extract Memories** (LINE 75-79):
   ```javascript
   const memories = await this.intelligenceSystem.extractRelevantMemories(
     userId, query, routing
   );
   ```

### EXACT SELECT Statement
**File**: `api/categories/memory/internal/intelligence.js`
**Function**: `extractFromPrimaryCategory` (LINE 1576)
**Lines**: 1584-1615

```sql
SELECT id, user_id, category_name, subcategory_name, content, token_count, 
       relevance_score, usage_frequency, created_at, last_accessed, metadata,
       CASE 
         -- HIGHEST PRIORITY: Informational content
         WHEN content ILIKE '%wife%' OR content ILIKE '%spouse%' OR content ILIKE '%partner%' 
              THEN relevance_score + 1.2
         WHEN content::text ~ '\\b(i have|i own|my \\w+|i work|i live)\\b'  
              AND content::text ~ '\\b[A-Z][a-z]+\\b' 
              THEN relevance_score + 1.0
         -- ... additional scoring logic ...
         ELSE relevance_score
       END as content_intelligence_score
FROM persistent_memories 
WHERE user_id = $1 AND category_name = $2 AND relevance_score > 0
```

**Parameters**:
- `$1` = userId
- `$2` = **primaryCategory** ← CRITICAL: Category filter applied here

### Column Filtering By Category
**Column**: `category_name` (LINE 1614)
**Value Source**: `primaryCategory` from routing (LINE 1579)

---

## 3. CATEGORY DETERMINATION

### During STORAGE
**File**: `api/categories/memory/internal/persistent_memory.js`
**Lines**: 141-144

```javascript
// Route to determine category
const routing = await this.intelligenceSystem.analyzeAndRoute(
  userMessage,  // ← Uses USER MESSAGE ONLY
  userId,
);
```

**Category Determination Function**:
- **File**: `api/categories/memory/internal/intelligence.js`
- **Function**: `analyzeAndRoute` (LINE 674)
- **Lines**: 698-705

```javascript
// Advanced semantic analysis
const semanticAnalysis = await this.performAdvancedSemanticAnalysis(normalizedQuery);

// Calculate category scores
const categoryScores = await this.calculateAdvancedCategoryScores(
  normalizedQuery,
  semanticAnalysis,
  userId,
);
```

### During RETRIEVAL
**File**: `api/categories/memory/internal/persistent_memory.js`
**Lines**: 71-74

```javascript
// Use intelligenceSystem to route and extract memories
const routing = await this.intelligenceSystem.analyzeAndRoute(
  query,  // ← Uses QUERY MESSAGE
  userId,
);
```

**CRITICAL FINDING**: Both storage and retrieval use the SAME function (`analyzeAndRoute`) but:
- **Storage**: Routes based on user's ORIGINAL MESSAGE
- **Retrieval**: Routes based on user's RECALL QUERY (which may be different)

### Example of Problem:
1. **Storage Time**: User says "My kids are Sarah and Jake" 
   - Routes to `relationships_social` (family keywords detected)
   - Stored in: `category_name = 'relationships_social'`

2. **Retrieval Time**: User asks "do you recall Home Run Pizza?"
   - Routes to `personal_life_interests` (hobby/interest keywords)  
   - Searches in: `category_name = 'personal_life_interests'`
   - **RESULT**: Cannot find the memory because it's in wrong category!

---

## 4. VAULT PIPELINE

### Vault Loading
**File**: `api/utilities/vault-loader.js`
**Class**: `VaultLoader` (LINE 37)

### Where Vault Content is STORED
**File**: `api/utilities/vault-loader.js`
**Lines**: 83-86

```javascript
// Step 3: Set global vault content for backward compatibility
if (this.coreContent) {
  global.vaultContent = this.coreContent;  // ← STORED HERE
  this.log('Global vault content set for orchestrator compatibility');
}
```

**Variable Name**: `global.vaultContent`
**Line**: 85

### Where Vault Content is READ
**File**: `api/core/orchestrator.js`
**Function**: `#loadVaultContext` (LINE 713)
**Lines**: 728-736

```javascript
// 2️⃣ Otherwise try the global cache
if (global.vaultContent && global.vaultContent.length > 1000) {
  const tokens = Math.ceil(global.vaultContent.length / 4);
  this.log(`[VAULT] Loaded from global: ${tokens} tokens (full vault)`);
  return {
    content: global.vaultContent,  // ← READ HERE
    fullContent: global.vaultContent,
    tokens,
    loaded: true,
  };
}
```

**Variable Name**: `global.vaultContent`
**Line**: 728, 732, 733

**FINDING**: ✅ Same variable path is used for storage and retrieval

---

## 5. SPECIFIC ISSUE: "Home Run Pizza" Example

### Scenario Analysis
When memory is stored with information about "Home Run Pizza":

#### Storage Path:
1. User message contains "Home Run Pizza" context
2. **Category Determination** (LINE 674 in intelligence.js):
   - Analyzes message semantically
   - Extracts keywords: "pizza", "home", "run" 
   - Routes to category based on semantic analysis
   - **Likely Result**: `personal_life_interests` or `relationships_social`

3. **INSERT** (LINE 161 in persistent_memory.js):
   - Stores with `category_name = [determined_category]`

#### Retrieval Path:
1. User asks "do you recall Home Run Pizza?"
2. **Category Determination** (LINE 674 in intelligence.js):
   - Analyzes RECALL QUERY semantically
   - Query contains "recall" + "pizza" terms
   - **Problem**: Recall queries often route differently than original content!
   - Routes to potentially DIFFERENT category

3. **SELECT** (LINE 1584 in intelligence.js):
   - Filters by `WHERE category_name = $2`
   - If category differs from storage, memory NOT FOUND

### Root Cause Identified:
**File**: `api/categories/memory/internal/intelligence.js`
**Lines**: 1503-1537 (INTELLIGENT ROUTING feature flag)

The system has a fallback mechanism (INTELLIGENT ROUTING) that was designed to solve this:

```javascript
// FEATURE FLAG: INTELLIGENT ROUTING WITH TOPIC FALLBACK
if (process.env.ENABLE_INTELLIGENT_ROUTING === 'true') {
  // If primary routing confidence is low OR we have few results, try topic-based retrieval
  const shouldUseFallback = routing.confidence < 0.80 || allMemories.length < 3;
  
  if (shouldUseFallback) {
    // Extract topic keywords from original query
    const topics = this.extractImportantNouns(query.toLowerCase());
    
    // Search across ALL categories for these topics
    const topicMemories = await this.searchByTopics(
      userId,
      topics,
      routing.primaryCategory,
    );
  }
}
```

**CRITICAL**: This feature is disabled by default (requires env var)!

---

## 6. KEY FINDINGS

### Storage Issues:
1. **Category determined once at storage** (LINE 141-144, persistent_memory.js)
2. **No verification that category makes sense for content**
3. **Uses semantic analysis of user message only**

### Retrieval Issues:
1. **Category determined again at retrieval** (LINE 71-74, persistent_memory.js)
2. **Uses semantic analysis of recall query** (which differs from original)
3. **Strict category filtering** (LINE 1614, intelligence.js)
4. **Fallback mechanism exists but is DISABLED** (LINE 1503, intelligence.js)

### The Disconnect:
```
STORAGE CATEGORY ≠ RETRIEVAL CATEGORY
   ↓                     ↓
Based on CONTENT    Based on QUERY
   ↓                     ↓
Original message    Recall question
```

---

## 7. RECOMMENDATIONS

### Immediate Fixes:
1. **Enable Intelligent Routing** (LINE 1504, intelligence.js):
   - Set `ENABLE_INTELLIGENT_ROUTING=true` in environment
   - This enables cross-category topic search when confidence is low

2. **Lower Confidence Threshold** (LINE 1506, intelligence.js):
   - Current: `routing.confidence < 0.80`
   - Suggested: `routing.confidence < 0.90` (more aggressive fallback)

3. **Add Topic Extraction at Storage** (persistent_memory.js):
   - Store extracted topics in metadata
   - Use for faster cross-category retrieval

### Longer-term Solutions:
1. **Semantic Embeddings**: Store vector embeddings of content
2. **Multi-category Storage**: Store important memories in multiple categories
3. **Category-agnostic Primary Index**: Full-text search across all categories first
4. **Improve Routing Consistency**: Train model on storage→retrieval pairs

---

## 8. DETAILED FILE REFERENCES

### Memory Storage:
- **Entry Point**: `api/categories/memory/internal/persistent_memory.js:129` (storeMemory)
- **Category Routing**: `api/categories/memory/internal/intelligence.js:674` (analyzeAndRoute)
- **INSERT Statement**: `api/categories/memory/internal/persistent_memory.js:161-166`
- **Category Field**: `persistent_memory.js:162` (category_name)
- **Category Value**: `persistent_memory.js:170` (routing.primaryCategory)

### Memory Retrieval:
- **Entry Point**: `api/categories/memory/internal/persistent_memory.js:60` (retrieveMemory)
- **Category Routing**: `api/categories/memory/internal/intelligence.js:674` (analyzeAndRoute)
- **SELECT Statement**: `api/categories/memory/internal/intelligence.js:1584-1615`
- **Category Filter**: `intelligence.js:1614` (WHERE category_name = $2)
- **Topic Fallback**: `intelligence.js:1503-1537` (FEATURE FLAG - DISABLED)

### Vault Pipeline:
- **Storage**: `api/utilities/vault-loader.js:85` (global.vaultContent)
- **Retrieval**: `api/core/orchestrator.js:728,732,733` (global.vaultContent)
- **✅ Vault pipeline is consistent** (same variable path)

---

## 9. CONCLUSION

The memory storage and retrieval pipeline has a **fundamental architectural issue**:

1. **Storage routes based on CONTENT** (user's original message)
2. **Retrieval routes based on QUERY** (user's recall question)  
3. These often produce **different categories**
4. Strict category filtering prevents cross-category matches
5. A solution exists (Intelligent Routing) but is **DISABLED BY DEFAULT**

**Next Step**: Enable `ENABLE_INTELLIGENT_ROUTING=true` to activate cross-category topic search and immediately improve recall success rate.
