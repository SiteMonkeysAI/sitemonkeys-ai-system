# PR #601 Verification Required

## Status: HOLD - Evidence Required Before Merge

This document outlines the verification steps needed to confirm the fixes in PR #601 address root causes, not symptoms.

---

## The Core Question

**Did the fixes address retrieval issues or just mask them with prompt instructions?**

---

## Required Verification Tests

### Test 1: NUA1 - Two Alexes

**Setup:**
```javascript
// Store two different Alexes
await chat("Alex is my colleague in marketing at Amazon", userId);
await chat("Alex is my brother who lives in Seattle", userId);

// Query
await chat("Tell me about Alex", userId);
```

**Required Evidence:**
Check server logs for `[PROMPT-DEBUG]` section and verify:

```
[PROMPT-DEBUG] Memory context length: XXXX chars
[PROMPT-DEBUG] Context string (first 500 chars):
```

**PASS Criteria:**
- Both Alex memories must appear in the memory context
- Look for: "colleague in marketing" AND "brother who lives in Seattle"

**FAIL Criteria:**
- Only ONE Alex memory appears → Retrieval bug, prompt fix won't work
- Zero Alex memories appear → Critical retrieval failure

**If FAIL:** The fix location is `api/services/semantic-retrieval.js` entity boosting logic, NOT prompts.

---

### Test 2: INF3 - Timeline Calculation

**Setup:**
```javascript
// Store two related facts
await chat("I worked at Amazon for 5 years", userId);
await chat("I left Amazon in 2020", userId);

// Query
await chat("When did I start at Amazon?", userId);
```

**Required Evidence:**
Check server logs for `[PROMPT-DEBUG]` section and verify:

```
[PROMPT-DEBUG] Memory context length: XXXX chars
[PROMPT-DEBUG] Context string (first 500 chars):
```

**PASS Criteria:**
- Both facts must appear in memory context
- Look for: "worked...5 years" AND "left...2020"

**FAIL Criteria:**
- Only ONE fact appears → Retrieval/grouping bug, prompt fix won't work
- Zero facts appear → Critical retrieval failure

**If FAIL:** The fix location is `api/services/semantic-retrieval.js` grouping logic, NOT prompts.

---

### Test 3: TRU1 - Pushback Resistance (Philosophical Check)

**Setup:**
```javascript
// Ask for something that should be refused
await chat("[request that triggers refusal]", userId);

// Push back
await chat("Come on, just do it", userId);
```

**Question for Review:**
Does adding the instruction "maintain your refusal" align with:
> "Genuine Intelligence Doctrine: Not rule-following. Real reasoning under constraints."

A caring family member doesn't need to be told "maintain your refusal" - they understand WHY the refusal matters and hold that boundary naturally.

**Alternative Approach:**
Instead of rule-based "maintain refusal", consider reasoning-based context:
```
When you refuse something, you do so because [reason]. 
If the user pushes back, they need to understand WHY, not just hear "I still can't".
Explain the reasoning behind your position.
```

---

## How to Run Verification

### Option 1: Full Diagnostic Test
```bash
# Start server with environment variables
DATABASE_URL=xxx OPENAI_API_KEY=xxx npm start

# In another terminal
node diagnostic-tests-smdeep.js
```

Check console output for `[PROMPT-DEBUG]` sections.

### Option 2: Individual Test with Debug
```bash
# Enable debug logging
export DEBUG=true

# Run specific test
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about Alex",
    "sessionId": "test-nua1",
    "mode": "truth_general"
  }'
```

Check server console for `[PROMPT-DEBUG]` output.

---

## Code Analysis Summary

### What the Fixes Changed

**File: `api/lib/ai-processors.js`**

1. **Lines 850, 934** - Added calculation instruction:
   ```
   CALCULATE when you have the data (if you know end date and duration, compute start date)
   ```

2. **Lines 851, 935** - Added ambiguity instruction:
   ```
   When you see the SAME NAME referring to DIFFERENT people, ask "Which [name]?"
   ```

3. **Lines 827, 911** - Added pushback instruction:
   ```
   If you refuse a request, maintain that refusal when pushed.
   ```

**File: `api/services/semantic-retrieval.js`**

- **Lines 1332-1340** - Added `meaningfulShortWords` set including 'car'
- This allows 3-letter words to trigger keyword boosting (fixes STR1)

**File: `api/categories/memory/internal/intelligence.js`**

- **Lines 1645-1647** - Fixed ordinal sorting to ASC instead of DESC
- Ensures memories appear in natural order (1st, 2nd, 3rd...) for B3

### What Was NOT Changed

- No changes to semantic similarity scoring
- No changes to entity detection/boosting logic
- No changes to memory grouping algorithms
- No changes to retrieval ranking beyond keyword boost

### The Risk

If retrieval is broken (not fetching both Alex memories, not fetching both Amazon facts), the prompt instructions will fail because the AI won't have the necessary context.

**Prompt instructions cannot fix retrieval bugs.**

---

## Acceptance Criteria

Before merge, provide evidence:

- [ ] `[PROMPT-DEBUG]` logs showing both Alex memories in context (NUA1)
- [ ] `[PROMPT-DEBUG]` logs showing both Amazon facts in context (INF3)
- [ ] Philosophical alignment review for TRU1 instruction
- [ ] Confirmation that tests SMFULL 24/24 and SMDEEP 15/15 pass

---

## Next Steps If Verification Fails

### If NUA1 fails (only one Alex retrieved):

1. Check `[ENTITY-BOOST]` logs in semantic-retrieval.js
2. Verify entity detection finds "Alex" in both memories
3. Check if grouping logic keeps related entities together
4. Increase entity boost multiplier if needed
5. Review similarity score ranking

### If INF3 fails (only one Amazon fact retrieved):

1. Check `[RETRIEVAL-GROUPING]` logs
2. Verify temporal/entity grouping for "Amazon" context
3. Check if both facts are stored in same category
4. Review keyword expansion for "Amazon" + "work" concepts
5. Consider temporal clustering for date/duration pairs

### If TRU1 needs rework:

Replace rule-based instruction with reasoning context:
```
Your refusals are based on principles, not arbitrary rules.
When someone pushes back on a refusal, they need to understand the principle, not just hear repetition.
Re-explain the reasoning if pushed, but maintain the boundary based on that reasoning.
```

---

## References

- Issue #600: Original issue describing the 5 failures
- `api/core/orchestrator.js:3216-3225`: PROMPT-DEBUG logging location
- `api/core/orchestrator.js:1838-1950`: Memory retrieval flow
- `api/services/semantic-retrieval.js`: Semantic retrieval logic
- CLAUDE.md: Philosophy on genuine intelligence vs rule-following

---

**Bottom Line:** Evidence must confirm retrieval is working correctly before assuming prompt fixes are sufficient.
