# NUA1 DB Query Clarifications

## Question 1: Does the query filter to current records?

**YES** - The query includes comprehensive filtering:

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

**Filters Applied** (lines 5239-5241):
1. ✅ `user_id = $1` - Scopes to correct user
2. ✅ `is_current = true OR is_current IS NULL` - Excludes superseded records
3. ✅ `LIMIT 10` - Bounds query complexity

**Why this is safe**:
- Superseded records have `is_current = false` and are excluded
- Only current/active memories can trigger ambiguity detection
- User isolation prevents cross-user contamination

## Question 2: Does the query ignore category/mode?

**YES** - The query intentionally does NOT filter by category or mode.

**Rationale**:
- Ambiguity detection should work across ALL contexts where an entity appears
- A person named "Alex" should trigger ambiguity whether mentioned in:
  - Personal relationships category
  - Work/professional category
  - Family category
  - Any other category

**Current Behavior**:
```sql
-- Searches across ALL categories
WHERE user_id = $1 
AND content ILIKE '%Alex%'
AND (is_current = true OR is_current IS NULL)
```

### Potential Issue: False Positives

**Risk**: Generic "Alex" mentions in non-person memories could trigger false positives.

**Example False Positive**:
- Memory 1: "My friend Alex works in marketing"
- Memory 2: "I use Alexandria, Virginia as my home address"
- Query: "Tell me about Alex"
- Result: False ambiguity ("Alex" matches "Alexandria")

### Proposed Guard (Not Yet Implemented)

To prevent false positives, consider adding:

1. **Minimum match length**: Require entity name to be standalone word
   - Current: `ILIKE '%Alex%'` matches "Alexandria", "Alexis", "Alex"
   - Better: Use word boundaries or exact word matching

2. **Descriptor validation**: Only flag ambiguity if different PERSON descriptors found
   - Current: Any two mentions with different context → ambiguity
   - Better: Check if descriptors indicate person relationships

3. **Category awareness**: Prioritize person-related categories
   - Current: Searches all categories equally
   - Better: Boost matches from relationship/person categories

### Current Implementation Analysis

**Lines 5326-5378**: Descriptor extraction logic
```javascript
// Patterns used to find descriptors
const relationPattern = /\b(friend|colleague|coworker|neighbor|boss|manager|partner)\s+([A-Z][a-z]{2,})\b/gi;
const myRelationPattern = /\bmy\s+(\w+)\s+([A-Z][a-z]{2,})\b/gi;
```

**Safety Mechanism**:
- Requires finding 2+ **different descriptors** to flag ambiguity (line 5370)
- If "Alexandria" appears without person-descriptors, it won't trigger
- Partial protection against false positives

**Weakness**:
- Still vulnerable if generic text happens to match patterns
- Example: "Alex from Alexandria" and "Alex my friend" → could trigger

### Recommendation

**SHORT-TERM (Current State)**:
- Acceptable risk: Descriptor patterns provide reasonable filtering
- False positives are rare and non-harmful (worst case: unnecessary clarification)
- Better to over-ask than miss real ambiguity

**LONG-TERM (Future Enhancement)**:
- Add word boundary matching: `ILIKE '% Alex %' OR ILIKE 'Alex %' OR ILIKE '% Alex'`
- Add category scoring: Boost person-related categories in ambiguity detection
- Add minimum descriptor quality check: Ensure descriptors indicate person relationships

## Summary

1. ✅ **Filters to current records**: `is_current = true OR is_current IS NULL`
2. ✅ **Scoped by user_id**: `user_id = $1`
3. ⚠️ **No category filtering**: Intentional, but has false positive risk
4. 🛡️ **Partial guard exists**: Requires 2+ different descriptors to trigger
5. 📋 **Future enhancement**: Add word boundary matching to reduce false positives

**Current state is SAFE but not perfect** - acceptable trade-off for initial implementation.
