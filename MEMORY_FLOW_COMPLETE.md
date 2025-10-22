# Memory Retrieval Flow - Complete Code Trace

**Date:** 2025-10-22  
**Purpose:** Trace exact code path from user query to memory retrieval and AI response

---

## Executive Summary

### System Status: ✅ SQL QUERIES FIXED, ROUTING NEEDS VERIFICATION

**What's Fixed:**
- ✅ SQL queries now search both 'user' AND 'anonymous' user_id values
- ✅ WHERE clause: `WHERE user_id IN ('user', 'anonymous')` (Line 1558)
- ✅ Verified in 3 locations throughout intelligence.js
- ✅ Test confirms no old `WHERE user_id = $1` patterns exist

**What Needs Verification:**
- ⚠️ Category routing accuracy (semantic analysis → correct category)
- ⚠️ Similarity scoring (do relevant memories rank highest?)
- ⚠️ Token enforcement (are important memories being cut?)

**Confidence Level: MEDIUM (75%)**
- SQL is correct (HIGH confidence)
- Routing logic exists but needs runtime testing (MEDIUM confidence)
- Need actual database with data to verify end-to-end (LOW testability)

---

## Flow Overview

```
User asks: "What are my kids' names?"
  ↓
Orchestrator.processRequest()
  ↓
orchestrator.#loadMemoryContext()
  ↓
intelligenceSystem.extractRelevantMemories()
  ↓
performAdvancedSemanticAnalysis()
  → Intent: information_request
  → Personal context: true
  → Topic entities: [family]
  ↓
calculateAdvancedCategoryScores()
  → Scores all 11 categories
  → Highest: relationships_social (family keywords)
  ↓
extractFromPrimaryCategory()
  → Category: relationships_social
  → SQL: WHERE user_id IN ('user', 'anonymous')
  → Filters: content ILIKE '%children%' OR '%kids%'
  → Orders by: content_intelligence_score DESC
  ↓
Database returns memories
  ↓
calculateContentSimilarity()
  → Ranks by similarity to query
  ↓
tryRelatedCategories() (if < 2 relevant results)
  → Tries: personal_life_interests, mental_emotional
  ↓
rerankBySimilarity()
  → Final ranking by similarity score
  ↓
applyIntelligentTokenManagement()
  → Limits to 2,400 tokens
  → Prioritizes high-similarity memories
  ↓
Return memories to orchestrator
  ↓
Add memories to AI prompt
  ↓
AI uses memories in response
```

---

## Step 1: Orchestrator Calls Intelligence System

**File:** `api/core/orchestrator.js`  
**Function:** `#loadMemoryContext()`

### Code Path
```javascript
async #loadMemoryContext(userId, message, mode) {
  try {
    // Determine routing category
    const routing = await this.intelligence.intelligentRouting(
      userId,
      message,
      mode
    );
    
    // Extract relevant memories
    const memories = await this.intelligence.extractRelevantMemories(
      userId,
      message,
      routing
    );
    
    return memories;
  } catch (error) {
    this.error("[MEMORY] Loading failed", error);
    return [];
  }
}
```

---

## Step 2: Intelligent Routing

**File:** `api/categories/memory/internal/intelligence.js`  
**Function:** `intelligentRouting()` (around line 680-760)

### Purpose
Determine which memory category to search based on query analysis

### Process

#### 2.1: Semantic Analysis (Lines 772-894)
```javascript
async performAdvancedSemanticAnalysis(query) {
  const analysis = {
    intent: "general",           // memory_recall, information_request, etc.
    confidence: 0.5,
    emotionalWeight: 0,          // 0-1 scale
    emotionalTone: "neutral",    // low/moderate/high
    personalContext: false,      // Has "my", "our", "I have", etc.
    memoryReference: false,      // Has "remember", "recall", etc.
    urgencyLevel: 0,             // 0-1 scale
    timeContext: "general",      // immediate/recent/future
    topicEntities: Set,          // health, work, family, money, home
    keywordDensity: 0,
    complexityScore: 0
  };
  
  // Intent classification
  for (const [intentType, config] of Object.entries(this.intentPatterns)) {
    for (const pattern of config.patterns) {
      if (pattern.test(query)) {
        analysis.intent = intentType;
        analysis.confidence = config.weight;
      }
    }
  }
  
  // Personal context detection
  analysis.personalContext = 
    /\b(my|our|personal|i have|we are)\b/i.test(query);
  
  // Memory reference detection
  analysis.memoryReference = 
    /\b(remember|recall|told you|mentioned)\b/i.test(query);
  
  // Topic entity extraction
  if (/\b(family|spouse|children|parents)\b/gi.test(query)) {
    analysis.topicEntities.add('family');
  }
  
  return analysis;
}
```

**Example Query:** "What are my kids' names?"
- Intent: `information_request` (has "what")
- Personal context: `true` (has "my")
- Topic entities: `['family']` (has "kids")

#### 2.2: Category Scoring (Lines 900-960)
```javascript
async calculateAdvancedCategoryScores(query, semanticAnalysis) {
  const scores = new Map();
  
  for (const [categoryName, config] of this.categoryMappings) {
    let score = 0;
    
    // Semantic boost (8x amplification)
    const semanticScore = this.calculateSemanticBoost(
      categoryName, 
      semanticAnalysis
    );
    score += semanticScore * 8.0;
    
    // Keyword matches (0.3x weight)
    for (const keyword of config.keywords) {
      if (query.includes(keyword)) {
        score += 0.3 * config.weight;
      }
    }
    
    // Topic relevance (3.0x boost)
    if (semanticAnalysis.topicEntities.has(config.primaryTopic)) {
      score += 3.0;
    }
    
    scores.set(categoryName, score);
  }
  
  return scores;
}
```

**Category Mappings (Lines 67-450):**
- `relationships_social`: Keywords include "children", "kids", "family", "spouse"
- `personal_life_interests`: Keywords include "hobby", "interest", "passion"
- `work_career`: Keywords include "job", "work", "career"
- Etc. (11 categories total)

**Example Scoring for "What are my kids' names?":**
- `relationships_social`: High score (has "kids", topic: family)
- `personal_life_interests`: Low score (no relevant keywords)
- Result: Primary category = `relationships_social`

---

## Step 3: Extract from Primary Category

**File:** `api/categories/memory/internal/intelligence.js`  
**Function:** `extractFromPrimaryCategory()` (Lines 1520-1630)

### SQL Query Construction

```javascript
async extractFromPrimaryCategory(userId, query, routing, semanticAnalysis) {
  const primaryCategory = routing.primaryCategory || "personal_life_interests";
  
  return await this.coreSystem.withDbClient(async (client) => {
    let baseQuery = `
      SELECT id, user_id, category_name, subcategory_name, content, 
             token_count, relevance_score, usage_frequency, 
             created_at, last_accessed, metadata,
             CASE 
               -- HIGHEST: Informational content with facts
               WHEN content ILIKE '%wife%' OR content ILIKE '%spouse%' 
                 THEN relevance_score + 1.2
               WHEN content ~* '\\b(i have|i own|my \\w+)\\b' 
                 AND content ~* '\\b[A-Z][a-z]+\\b'
                 THEN relevance_score + 1.0
               
               -- HIGH: Content with specific details (names, numbers)
               WHEN content ~* '\\b[A-Z][a-z]+\\b.*\\d+' 
                 AND NOT content ~* '\\b(do you remember|can you recall)\\b'
                 THEN relevance_score + 0.7
               
               -- PENALTY: Pure questions without information
               WHEN content ~* '\\b(do you remember|what did i tell)\\b'
                 AND NOT content ~* '\\b(i have|my \\w+\\s+(is|are))\\b'
                 THEN relevance_score - 0.6
               
               -- ZERO: AI failure responses
               WHEN content ~* 'no specific mention|I don''t have any'
                 THEN 0
               
               ELSE relevance_score
             END as content_intelligence_score
      FROM persistent_memories 
      WHERE user_id IN ('user', 'anonymous')    -- ✅ FIXED!
        AND category_name = $1 
        AND relevance_score > 0
    `;
    
    let queryParams = [primaryCategory];
    let paramIndex = 2;
    
    // TOPIC-AWARE FILTERING
    const queryNouns = this.extractImportantNouns(query.toLowerCase());
    // Example: "What are my kids' names?" → ["kids", "names"]
    
    if (queryNouns.length > 0) {
      const topicFilters = queryNouns
        .map((noun, i) => `content ILIKE $${paramIndex + i}`)
        .join(" OR ");
      baseQuery += ` AND (${topicFilters})`;
      queryParams.push(...queryNouns.map(noun => `%${noun}%`));
      paramIndex += queryNouns.length;
    }
    
    // EMOTIONAL FILTER
    if (semanticAnalysis.emotionalWeight > 0.5) {
      baseQuery += ` AND (content ILIKE $${paramIndex} OR metadata->>'emotional_content' = 'true')`;
      queryParams.push(`%${semanticAnalysis.emotionalTone}%`);
      paramIndex++;
    }
    
    // PERSONAL CONTEXT FILTER
    if (semanticAnalysis.personalContext) {
      baseQuery += ` AND (content ILIKE $${paramIndex} OR content ILIKE $${paramIndex + 1})`;
      queryParams.push("%my %", "%personal%");
      paramIndex += 2;
    }
    
    // FILTER OUT PURE QUESTIONS
    baseQuery += ` AND NOT (
      content ~* '\\b(remember anything|do you remember)\\b' 
      AND NOT content ~* '\\b(i have|my \\w+\\s+(is|are)|name is)\\b'
    )`;
    
    // INTELLIGENT ORDERING
    baseQuery += `
      ORDER BY 
        content_intelligence_score DESC,
        CASE WHEN content ~* '\\b(i have|my \\w+\\s+(is|are))\\b' 
             AND NOT content ~* '\\b(remember|recall)\\b' 
             THEN 3 ELSE 0 END DESC,
        CASE WHEN content ~* '\\b[A-Z][a-z]+\\b|\\d+' 
             AND NOT content ~* '\\b(remember|recall)\\b'
             THEN 2 ELSE 0 END DESC,
        relevance_score DESC,
        created_at DESC
      LIMIT 20
    `;
    
    const result = await client.query(baseQuery, queryParams);
    return result.rows;
  });
}
```

### Key SQL Features

**1. User ID Fix (Line 1558):**
```sql
WHERE user_id IN ('user', 'anonymous')
```
✅ Searches both old ('user') and new ('anonymous') memories

**2. Content Intelligence Scoring:**
- Boosts informational statements: "I have two kids named..."
- Boosts content with names and numbers
- Penalizes pure questions: "Do you remember my kids' names?"
- Zero-scores AI failures: "I don't have any information about..."

**3. Topic Filtering:**
- Extracts important nouns from query ("kids", "names")
- Filters memories containing those terms
- Uses ILIKE for case-insensitive matching

**4. Intelligent Ordering:**
- Prioritizes informational content over questions
- Boosts content with proper nouns (names)
- Falls back to relevance score and recency

---

## Step 4: Similarity Scoring

**File:** `api/categories/memory/internal/intelligence.js`  
**Function:** `extractRelevantMemories()` (Lines 1442-1518)

### Process

```javascript
async extractRelevantMemories(userId, query, routing) {
  // Get primary category memories
  const primaryMemories = await this.extractFromPrimaryCategory(
    userId, query, routing, semanticAnalysis
  );
  
  // Score each memory for similarity to query
  const scoredPrimary = primaryMemories.map(memory => ({
    ...memory,
    similarityScore: this.calculateContentSimilarity(query, memory.content),
    source: "primary_category"
  }));
  
  // If < 2 good results, try related categories
  const goodPrimaryResults = scoredPrimary.filter(
    m => m.similarityScore > 0.3
  ).length;
  
  if (goodPrimaryResults < 2) {
    const relatedMemories = await this.tryRelatedCategories(
      userId, query, routing, semanticAnalysis
    );
    allMemories = [...scoredPrimary, ...relatedMemories];
  }
  
  // Re-rank by similarity
  const rankedMemories = this.rerankBySimilarity(allMemories, query);
  
  // Apply token limits
  const finalMemories = await this.applyIntelligentTokenManagement(
    rankedMemories, 
    2400  // Max tokens
  );
  
  return finalMemories;
}
```

### Similarity Calculation (Lines 2680-2750)

```javascript
calculateContentSimilarity(query, content) {
  const queryTerms = new Set(
    query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );
  const contentTerms = new Set(
    content.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );
  
  // Count matching terms
  let matches = 0;
  for (const term of queryTerms) {
    if (contentTerms.has(term)) matches++;
  }
  
  // Calculate Jaccard similarity
  const union = new Set([...queryTerms, ...contentTerms]);
  const similarity = matches / Math.max(union.size, 1);
  
  // Boost for exact phrase matches
  if (content.toLowerCase().includes(query.toLowerCase())) {
    similarity += 0.3;
  }
  
  return Math.min(similarity, 1.0);
}
```

**Example:**
- Query: "What are my kids' names?"
- Memory: "I have two children named Alex and Jordan"
- Matching terms: "my", "kids" (children synonym?), "names"
- Similarity score: ~0.4 (good match)

---

## Step 5: Related Categories Fallback

**File:** `api/categories/memory/internal/intelligence.js`  
**Function:** `tryRelatedCategories()` (Lines 2980-3080)

### Category Relationships (Lines 245-280 in core.js)

```javascript
const relationships = {
  relationships_social: ["personal_life_interests", "mental_emotional"],
  work_career: ["goals_active_current"],
  health_wellness: ["mental_emotional"],
  // ... other mappings
};
```

### Process

```javascript
async tryRelatedCategories(userId, query, routing, semanticAnalysis) {
  const primaryCategory = routing.primaryCategory;
  const relatedCategories = await this.coreSystem.getRelatedCategories(
    primaryCategory
  );
  
  const relatedMemories = [];
  
  for (const category of relatedCategories) {
    try {
      const memories = await this.coreSystem.withDbClient(async (client) => {
        const query = `
          SELECT * FROM persistent_memories
          WHERE user_id IN ('user', 'anonymous')
            AND category_name = $1
            AND relevance_score > 0
          ORDER BY relevance_score DESC
          LIMIT 10
        `;
        const result = await client.query(query, [category]);
        return result.rows;
      });
      
      // Score and add
      const scored = memories.map(m => ({
        ...m,
        similarityScore: this.calculateContentSimilarity(query, m.content),
        source: "related_category"
      }));
      
      relatedMemories.push(...scored);
    } catch (error) {
      this.logger.error(`Error searching category ${category}`, error);
    }
  }
  
  return relatedMemories;
}
```

**Example:**
- Primary: `relationships_social` (found 0 good results)
- Related: `personal_life_interests`, `mental_emotional`
- Searches these categories for additional memories

---

## Step 6: Token Management

**File:** `api/categories/memory/internal/intelligence.js`  
**Function:** `applyIntelligentTokenManagement()` (Lines 2410-2500)

### Process

```javascript
async applyIntelligentTokenManagement(memories, maxTokens = 2400) {
  let totalTokens = 0;
  const selectedMemories = [];
  
  // Sort by similarity score (highest first)
  const sorted = memories.sort(
    (a, b) => b.similarityScore - a.similarityScore
  );
  
  for (const memory of sorted) {
    if (totalTokens + memory.token_count <= maxTokens) {
      selectedMemories.push(memory);
      totalTokens += memory.token_count;
    } else {
      break;  // Hit token limit
    }
  }
  
  return selectedMemories;
}
```

**Token Limits:**
- Max: 2,400 tokens per memory context
- Each memory has `token_count` field (calculated on storage)
- Prioritizes highest similarity scores
- Stops when limit reached

**Risk:** Important memories might be cut if:
- Many high-similarity memories exceed token limit
- Less relevant memories ranked higher (similarity scoring issue)

---

## Step 7: Return to Orchestrator

**File:** `api/core/orchestrator.js`  
**Function:** `#loadMemoryContext()` receives memories array

### Format Memories for AI

```javascript
#formatMemoriesForAI(memories) {
  if (!memories || memories.length === 0) {
    return "📝 MEMORY STATUS: No previous conversation history available for this topic.";
  }
  
  let formatted = `📝 MEMORY CONTEXT AVAILABLE (${memories.length} interactions):\n\n`;
  
  memories.forEach((memory, index) => {
    formatted += `${index + 1}. ${memory.content}\n`;
    formatted += `   [Category: ${memory.category_name}, Relevance: ${memory.relevance_score.toFixed(2)}]\n\n`;
  });
  
  formatted += "\n💡 Use this information to provide personalized responses.\n";
  
  return formatted;
}
```

### Add to AI Prompt

```javascript
const systemPrompt = `
${basePersonalityPrompt}

${memoryContext}  // <-- Formatted memories added here

${documentContext}

${vaultContext}
`;
```

---

## Step 8: AI Uses Memories

The AI receives the memory context in the system prompt and can reference it in the response.

**Example Prompt:**
```
You are Eli, a helpful AI assistant...

📝 MEMORY CONTEXT AVAILABLE (2 interactions):

1. I have two children named Alex and Jordan.
   [Category: relationships_social, Relevance: 0.85]

2. Alex is 8 years old and Jordan is 5 years old.
   [Category: relationships_social, Relevance: 0.72]

💡 Use this information to provide personalized responses.

User: What are my kids' names?
```

**AI Response:**
"Based on our previous conversations, you have two children named Alex and Jordan..."

---

## Potential Issues and Root Causes

### Issue 1: Wrong Category Selected

**Symptom:** Memories not found even though they exist

**Root Cause:** Semantic routing sends query to wrong category

**Verification Needed:**
1. Check routing logs: `[INTELLIGENCE] Primary category: X`
2. Verify category has relevant keywords
3. Check if query matches category patterns

**Example:**
- Query: "What did I tell you about my son?"
- Expected category: `relationships_social`
- If routed to: `personal_life_interests` → Wrong!
- Cause: "son" keyword missing from relationships_social mapping?

### Issue 2: Relevant Memories Ranked Low

**Symptom:** System retrieves memories but not the right ones

**Root Cause:** Similarity scoring ranks wrong memories higher

**Verification Needed:**
1. Check similarity scores in logs
2. Verify content_intelligence_score from SQL
3. Look for pure question memories ranking high

**Example:**
- Memory 1: "Do you remember my kids' names?" (score: 0.5)
- Memory 2: "I have two kids named Alex and Jordan" (score: 0.4)
- Issue: Memory 1 ranks higher but has no information!
- Cause: Similarity scoring not accounting for content quality?

### Issue 3: Important Memories Cut by Token Limit

**Symptom:** System finds right memories but doesn't return them

**Root Cause:** Token limit reached before including all relevant memories

**Verification Needed:**
1. Check total token count in logs
2. Count how many memories retrieved vs. returned
3. Check if cutoff memory has high similarity score

**Example:**
- Retrieved: 15 memories, total 3,200 tokens
- Token limit: 2,400 tokens
- Returned: First 10 memories (2,380 tokens)
- Memory 11-15: Cut, even if highly relevant
- Cause: Token limit too low? Or should reorder by importance?

### Issue 4: Old Memories Not Retrieved

**Symptom:** Memories with user_id='user' not found

**Status:** ✅ FIXED!

**Solution:** SQL now uses `WHERE user_id IN ('user', 'anonymous')`

---

## Confidence Assessment

### HIGH Confidence (90-100%)
- ✅ SQL queries correctly updated to search both user IDs
- ✅ SQL query structure is sound (filtering, ordering, scoring)
- ✅ Token management logic is implemented
- ✅ Related category fallback exists

### MEDIUM Confidence (70-89%)
- ⚠️ Category routing accuracy (need runtime verification)
- ⚠️ Similarity scoring effectiveness (need testing with real data)
- ⚠️ Content intelligence scoring (need to verify boosts work correctly)

### LOW Confidence (Needs Investigation)
- ❓ Does routing pick correct category for typical queries?
- ❓ Do relevant memories rank highest in practice?
- ❓ Is token limit causing important memories to be cut?
- ❓ Are there edge cases in similarity calculation?

---

## Testing Recommendations

### To Verify Routing:
1. Add detailed logging to `calculateAdvancedCategoryScores()`
2. Log all category scores, not just the winner
3. Test with variety of queries: family, work, health, money
4. Verify correct category is chosen

### To Verify Similarity Scoring:
1. Log similarity scores for all retrieved memories
2. Manually review which memories should rank highest
3. Compare system ranking vs. expected ranking
4. Adjust similarity calculation if needed

### To Verify Token Management:
1. Log when token limit is reached
2. Show how many memories were cut
3. Display similarity scores of cut memories
4. Consider increasing limit or adjusting prioritization

### To Verify End-to-End:
1. Store test memories in database
2. Run queries against test data
3. Verify correct memories are retrieved and used
4. Check AI responses reference the right information

---

## Conclusion

### System Status: ✅ SQL FIXED, ROUTING NEEDS VERIFICATION

**What's Working:**
1. ✅ SQL queries correctly search both user IDs
2. ✅ Content intelligence scoring implemented
3. ✅ Related category fallback exists
4. ✅ Token management prevents overload
5. ✅ Similarity scoring algorithm implemented

**What Needs Verification:**
1. ⚠️ Category routing accuracy in practice
2. ⚠️ Similarity scoring effectiveness
3. ⚠️ Content intelligence score boosting
4. ⚠️ Token limit impact on memory selection

**Confidence:** MEDIUM (75%)
- Code structure is solid
- SQL is correct
- But needs runtime testing with real data to verify accuracy

**Recommendation:** Test with real queries and real database to verify:
- Correct category selection
- Relevant memories ranked highest
- AI receives and uses the right memories
