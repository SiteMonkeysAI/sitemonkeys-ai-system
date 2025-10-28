# Direct Answers to Issue Questions

This document provides specific FILE:LINE answers to each question in the issue.

---

## 1. MEMORY STORAGE PATH

### Question: What is the EXACT INSERT statement when storing a memory?

**Answer**: There are TWO different INSERT statements depending on which storage path is active:

#### Path A: Intelligent Storage (when `ENABLE_INTELLIGENT_STORAGE=true`)
**File**: `api/memory/intelligent-storage.js`
**Line**: 194-221

```sql
INSERT INTO persistent_memories (
  user_id,
  category_name,
  subcategory_name,
  content,
  token_count,
  relevance_score,
  metadata,
  created_at,
  usage_frequency,
  last_accessed
) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
RETURNING id
```

#### Path B: Legacy Storage (default)
**File**: `api/categories/memory/internal/persistent_memory.js`
**Line**: 161-166

```sql
INSERT INTO persistent_memories (
  user_id, category_name, subcategory_name, content, 
  token_count, relevance_score, usage_frequency, 
  last_accessed, created_at, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8)
RETURNING id
```

### Question: What column/field stores the category name?

**Answer**: `category_name` column in both INSERT statements.

**Specific Lines**:
- Intelligent Storage: `api/memory/intelligent-storage.js:197`
- Legacy Storage: `api/categories/memory/internal/persistent_memory.js:162`

---

## 2. MEMORY RETRIEVAL PATH

### Question: What is the EXACT SELECT statement when retrieving memories?

**Answer**: 
**File**: `api/categories/memory/internal/intelligence.js`
**Line**: 1584-1615

```sql
SELECT id, user_id, category_name, subcategory_name, content, token_count, 
       relevance_score, usage_frequency, created_at, last_accessed, metadata,
       CASE 
         -- HIGHEST PRIORITY: Informational content (answers with facts)
         WHEN content ILIKE '%wife%' OR content ILIKE '%spouse%' OR content ILIKE '%partner%' 
              THEN relevance_score + 1.2
         WHEN content::text ~ '\\b(i have|i own|my \\w+|i work|i live)\\b'  
              AND content::text ~ '\\b[A-Z][a-z]+\\b' 
              THEN relevance_score + 1.0
         -- HIGH PRIORITY: Content with specific details (names, numbers)  
         WHEN content::text ~* '\\b[A-Z][a-z]+\\b.*\\b[A-Z][a-z]+\\b|\\d+' 
              AND NOT content::text ~* '\\b(do you remember|what did i tell|can you recall)\\b' 
              THEN relevance_score + 0.7
         -- ... additional scoring logic ...
         ELSE relevance_score
       END as content_intelligence_score
FROM persistent_memories 
WHERE user_id = $1 AND category_name = $2 AND relevance_score > 0
-- Additional filters may be added based on semantic analysis
ORDER BY content_intelligence_score DESC, relevance_score DESC, created_at DESC
LIMIT 10
```

### Question: What column/field it filters by for category?

**Answer**: `category_name` column

**Specific Line**: `api/categories/memory/internal/intelligence.js:1614`
```sql
WHERE user_id = $1 AND category_name = $2 AND relevance_score > 0
```

---

## 3. CATEGORY DETERMINATION

### Question: When storing - How is the category name determined? (which function, which line)

**Answer**: Depends on storage path:

#### Path A: Intelligent Storage
**File**: `server.js`
**Line**: 356

```javascript
const category = mode === 'site_monkeys' ? 'business' : 'general';
```

**Function**: None - simple ternary based on mode
**Problem**: ❌ Categories 'business' and 'general' don't match retrieval system!

#### Path B: Legacy Storage
**File**: `api/categories/memory/internal/persistent_memory.js`
**Line**: 141-144

```javascript
const routing = await this.intelligenceSystem.analyzeAndRoute(
  userMessage,
  userId,
);
```

**Function**: `analyzeAndRoute()` in `api/categories/memory/internal/intelligence.js:674`
**Result**: `routing.primaryCategory` (Line 170)

### Question: When retrieving - How is the category name determined? (which function, which line)

**Answer**: 
**File**: `api/categories/memory/internal/persistent_memory.js`
**Line**: 71-74

```javascript
const routing = await this.intelligenceSystem.analyzeAndRoute(
  query,  // ← NOTE: Uses query, not original message!
  userId,
);
```

**Function**: `analyzeAndRoute()` in `api/categories/memory/internal/intelligence.js:674`
**Result**: `routing.primaryCategory` (used at Line 1579 in intelligence.js)

### Question: Are these using the same logic/values?

**Answer**: 

**For Path A (Intelligent Storage)**: ❌ **NO**
- Storage: Simple mode-based ('business' or 'general') - server.js:356
- Retrieval: Semantic analysis (11 different categories) - intelligence.js:674
- **RESULT**: NEVER matches!

**For Path B (Legacy Storage)**: ⚠️ **SAME FUNCTION, DIFFERENT INPUT**
- Storage: `analyzeAndRoute(userMessage, userId)` - persistent_memory.js:141
- Retrieval: `analyzeAndRoute(query, userId)` - persistent_memory.js:71
- Uses same function BUT different text input
- **RESULT**: Often produces different categories!

**Example**:
```javascript
// Storage
analyzeAndRoute("Home Run Pizza is my favorite place")
// → 'personal_life_interests' (has "favorite", "place")

// Retrieval  
analyzeAndRoute("Do you recall Home Run Pizza?")
// → 'tools_tech_workflow' (has "recall", technical-sounding words)

// Different categories → Memory not found!
```

---

## 4. VAULT PIPELINE

### Question: Where does vault-loader.js STORE the vault content? (exact variable name, line number)

**Answer**:
**File**: `api/utilities/vault-loader.js`
**Line**: 85
**Variable**: `global.vaultContent`

```javascript
// Step 3: Set global vault content for backward compatibility
if (this.coreContent) {
  global.vaultContent = this.coreContent;
  this.log('Global vault content set for orchestrator compatibility');
}
```

### Question: Where does orchestrator.js READ the vault content? (exact variable name, line number)

**Answer**:
**File**: `api/core/orchestrator.js`
**Lines**: 728, 732, 733
**Variable**: `global.vaultContent`

```javascript
// 2️⃣ Otherwise try the global cache
if (global.vaultContent && global.vaultContent.length > 1000) {
  const tokens = Math.ceil(global.vaultContent.length / 4);
  this.log(`[VAULT] Loaded from global: ${tokens} tokens (full vault)`);
  return {
    content: global.vaultContent,
    fullContent: global.vaultContent,
    tokens,
    loaded: true,
  };
}
```

### Question: Are these the same variable path?

**Answer**: ✅ **YES** - Both use `global.vaultContent`

The vault pipeline is working correctly and consistently.

---

## 5. SPECIFIC ISSUE: "Home Run Pizza" Example

### Question: When a memory is stored with information about "Home Run Pizza", which category it gets stored to?

**Answer**: Depends on storage path and mode:

#### If `ENABLE_INTELLIGENT_STORAGE=true`:
**File**: `server.js:356`
**Category**: 
- `'business'` (if mode = 'site_monkeys')
- `'general'` (if any other mode)

#### If Legacy Storage (default):
**File**: `api/categories/memory/internal/intelligence.js:674-760`
**Category Determination**:
1. Analyzes message: "Home Run Pizza is my favorite restaurant"
2. Extracts keywords: "home", "pizza", "favorite", "restaurant"
3. Matches category patterns in Lines 465-505 (`personal_life_interests`)
4. **Result**: `'personal_life_interests'`

### Question: Which category the system searches when asked "do you recall Home Run Pizza?"?

**Answer**: 
**File**: `api/categories/memory/internal/intelligence.js:674-760`
**Category Determination**:
1. Analyzes query: "do you recall Home Run Pizza?"
2. Extracts keywords: "recall", "pizza", "run"
3. Detects "recall" as memory reference (Line 831)
4. "run" might be misinterpreted as technical/workflow term
5. **Likely Result**: `'tools_tech_workflow'` OR `'personal_life_interests'`

**Depends on semantic scoring**:
- If "recall" + "run" score high → `'tools_tech_workflow'`
- If "pizza" scores higher → `'personal_life_interests'`

### Question: Why these might be different?

**Answer**: Three reasons:

#### Reason #1: Intelligent Storage Category Mismatch (CRITICAL)
**File**: `server.js:356`
```
Storage:   category = 'general'
Retrieval: category = 'personal_life_interests'
Match: NO ❌
```

#### Reason #2: Different Input Text for Same Routing Function
**Storage**: Analyzes original statement (declarative)
**Retrieval**: Analyzes recall question (interrogative)
```
"Home Run Pizza is my favorite"  → personal_life_interests
"do you recall Home Run Pizza?"  → tools_tech_workflow (possibly)
```

#### Reason #3: Keyword Weighting Differences
**File**: `api/categories/memory/internal/intelligence.js:900-975`

Storage text has:
- "favorite" (personal_life_interests boost)
- "restaurant" (personal_life_interests boost)

Retrieval text has:
- "recall" (memory_recall intent)
- "run" (could match tools/tech keywords)

Different keyword combinations = different category scores

---

## ROOT CAUSE SUMMARY

### Primary Issue: Dual Storage Paths with Incompatible Categories

**Path A (Intelligent Storage)**:
- Uses: `'business'` or `'general'`
- Location: `server.js:356`
- Problem: These categories don't exist in retrieval system

**Path B (Legacy Storage)**:
- Uses: 11 semantic categories
- Location: `api/categories/memory/internal/intelligence.js:674`
- Problem: Different input text causes different routing

**Retrieval System**:
- Searches: 11 semantic categories ONLY
- Location: `api/categories/memory/internal/intelligence.js:1614`
- Never searches: `'business'` or `'general'`

### The Disconnect Chain:

```
1. Storage (Path A): 
   server.js:356 → category = 'general'
   ↓
2. Database: 
   INSERT category_name='general'
   ↓
3. Retrieval:
   intelligence.js:674 → category = 'personal_life_interests'
   ↓
4. Database:
   SELECT WHERE category_name='personal_life_interests'
   ↓
5. Result:
   NO MATCH (different categories) ❌
```

---

## VERIFICATION COMMANDS

To verify these findings:

### Check which storage path is active:
```bash
# Check server logs for:
grep "Intelligent storage complete" logs.txt  # Path A active
grep "Successfully stored memory" logs.txt    # Path B active
```

### Check database categories:
```sql
SELECT category_name, COUNT(*) 
FROM persistent_memories 
GROUP BY category_name 
ORDER BY COUNT(*) DESC;
```

### Expected results:
**If Path A active**: Will see 'business' and 'general'
**If Path B active**: Will see semantic categories (personal_life_interests, etc.)

### Test retrieval:
Store a test memory and try to retrieve it:
```javascript
// Store
await storeMemory("user123", "Home Run Pizza is my favorite", "That's great!", {});

// Check database
SELECT category_name FROM persistent_memories WHERE content LIKE '%Home Run Pizza%';

// Retrieve
await retrieveMemory("user123", "do you recall Home Run Pizza?");
```

---

## FILES REFERENCE INDEX

All files mentioned in this analysis:

1. `server.js:345-366` - Storage path selection and intelligent storage call
2. `api/memory/intelligent-storage.js:49,194-221` - Intelligent storage INSERT
3. `api/categories/memory/internal/persistent_memory.js:60,71,129,141,161-170` - Legacy storage/retrieval
4. `api/categories/memory/internal/intelligence.js:674,772,900,1158,1442,1504,1576,1584-1615,1755` - Routing and retrieval
5. `api/utilities/vault-loader.js:37,61,85,237` - Vault loading
6. `api/core/orchestrator.js:713,728,732,733` - Vault reading

---

## NEXT STEPS

Based on this analysis:

1. **Fix intelligent storage** (server.js:356) to use semantic routing
2. **Enable cross-category search** (ENABLE_INTELLIGENT_ROUTING=true)
3. **Verify fix** with test scenarios
4. **Monitor** retrieval success rate

All fixes are documented in `MEMORY_PIPELINE_ANALYSIS.md`.
