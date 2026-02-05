# NUA1: #enforceAmbiguityDisclosure Independence Proof

## Reviewer Question
> Please confirm #enforceAmbiguityDisclosure does an entity-filtered DB query independent of injected memories (i.e., it will find both Alex records even if neither is in the top-5 injection).

## Confirmation: YES - Fully Independent

### Code Evidence

**Location**: `api/core/orchestrator.js`, lines 5206-5380

**Method Signature**:
```javascript
async #enforceAmbiguityDisclosure({ response, memoryContext = [], query = '', context = {} })
```

**Key Implementation Details**:

1. **Independent DB Query** (lines 5236-5244):
```javascript
const dbResult = await this.pool.query(
  `SELECT id, content
   FROM persistent_memories
   WHERE user_id = $1
   AND (${ilikeClauses})
   AND (is_current = true OR is_current IS NULL)
   LIMIT 10`,
  [userId, ...likeParams]
);
```

2. **Entity Extraction from Query** (lines 5213-5214):
```javascript
const namePattern = /\b([A-Z][a-z]{2,})\b/g;
const names = [...query.matchAll(namePattern)].map(m => m[1]);
```

3. **Pattern Matching**:
```javascript
const ilikeClauses = candidateNames.map((_, idx) => `content ILIKE $${idx + 2}`).join(' OR ');
const likeParams = candidateNames.map(name => `%${name}%`);
```

### Why It's Independent

1. **Does NOT use `memoryContext` parameter**: The method receives `memoryContext` but never reads from it for entity detection
2. **Extracts entities from QUERY**: Parses the user's query text directly (line 5214)
3. **Direct DB access**: Uses `this.pool.query()` to query the database directly (line 5236)
4. **Returns up to 10 records**: `LIMIT 10` ensures it can find multiple entities even if none are in top-5 injection (line 5242)
5. **Runs AFTER response generation**: Part of the enforcement pipeline (Step 9.7), meaning it validates/corrects after AI generates response

### Execution Flow for "Tell me about Alex"

**Scenario**: Two Alex memories exist (IDs 100, 200), but only ID 100 is in top-5 injected memories.

```
Step 1: Memory Retrieval
├─ Semantic search returns 10 candidates ranked by similarity
├─ Top 5 selected: [100, 101, 102, 103, 104] ← Alex ID 100 injected, Alex ID 200 NOT injected
└─ memoriesToFormat = memories.slice(0, 5)

Step 2: AI Response Generation
├─ AI sees only Alex ID 100 in context
└─ May respond about only one Alex (incomplete)

Step 3: #enforceAmbiguityDisclosure Validation
├─ Extracts "Alex" from query: ["Alex"]
├─ Performs DB query: SELECT ... WHERE content ILIKE '%Alex%' LIMIT 10
├─ Finds BOTH records: [ID 100, ID 200] ← Independent of injection!
├─ Detects different descriptors (e.g., "colleague" vs "brother")
└─ Prepends ambiguity disclosure to response
```

### Code Path Verification

**Query Execution** (line 5236):
```javascript
this.pool.query(...) // Direct PostgreSQL connection pool
```

**Result Processing** (lines 5299-5378):
- Groups records by entity name
- Extracts descriptors using regex patterns
- Detects ambiguity if 2+ different descriptors found
- Does NOT check if entities are in injected memories

### Logging Evidence Points

When this validator runs, it logs:
```javascript
console.log(`[PROOF] authoritative-db domain=ambiguity ran=true rows=${dbResult.rows.length}`);
console.log(`[AMBIGUITY-AUTHORITATIVE] db_rows=${dbResult.rows?.length || 0}`);
console.log(`[AMBIGUITY-DEBUG] Query names: ${candidateNames.join(', ')}`);
```

These logs will show that the validator finds records INDEPENDENT of what was injected.

## Conclusion

✅ **CONFIRMED**: `#enforceAmbiguityDisclosure` performs an entity-filtered DB query that is **100% independent** of injected memories.

**Why this works for NUA1**:
- Even if both Alex memories are ranked #6 and #7 (below top-5 cap)
- Even if only one Alex is injected into AI context
- Even if ZERO Alexes are injected
- The validator will still query the DB directly and find all Alex records
- It will detect the ambiguity and prepend disclosure to the response

**Token Efficiency Maintained**:
- MAX_MEMORIES_FINAL = 5 (strict cap enforced)
- Ambiguity detection costs: 1 DB query (bounded)
- No additional memory injection required
