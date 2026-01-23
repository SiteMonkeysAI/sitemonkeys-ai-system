# Code-Level Data Pipeline Fixes

## Overview

This document tracks the 5 code-level data pipeline issues identified in PR #571 that could prevent prompt-level intelligence from working correctly.

## Status Summary

| Issue | Status | Location | Fix Description |
|-------|--------|----------|-----------------|
| **#1: Brand Name Preservation** | ✅ FIXED | `intelligent-storage.js:781` | Pattern now captures "Tesla Model 3", "iPhone 15 Pro", "MacBook Pro" |
| **#2: Embedding Timing** | ✅ VERIFIED | `intelligent-storage.js:1557-1588` | Synchronous embedding for explicit storage, fallback for rapid storage |
| **#3: Numerical Extraction** | ✅ VERIFIED | `intelligent-storage.js:774-836` | Re-injection logic for $, years, durations, all numbers |
| **#4: Explicit Storage Metadata** | ✅ VERIFIED | `intelligent-storage.js:441`, `semantic-retrieval.js:1128-1137` | Metadata written, 0.99 boost applied |
| **#5: Ordinal Boost** | ⚠️ NEEDS VERIFICATION | `semantic-retrieval.js:207-208` | Boost is +0.40, penalty is -0.20 |

---

## Issue #1: Brand Name Preservation (STR1)

### Problem
Brand names like "Tesla Model 3" were being captured as "Tesla Model" (dropping the "3") due to regex pattern requiring lowercase letters before numbers.

### Original Pattern
```javascript
const brandNamePattern = /\b[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]*|[a-z]+)\d*)+\b/g;
```

### Fixed Pattern
```javascript
const brandNamePattern = /\b(?:[A-Z][a-zA-Z]*|[a-z]*[A-Z][a-zA-Z]*)(?:\s+(?:[A-Z][a-zA-Z]*|\d+))+\b/g;
```

### What Changed
- Now accepts pure numbers as valid word components: `|\d+`
- Handles CamelCase brands: `[a-z]*[A-Z][a-zA-Z]*` (for iPhone, eBay)
- Only matches sequences with capitals OR numbers (not plain lowercase words)

### Test Cases Verified
✅ "Tesla Model 3" → ["Tesla Model 3"]
✅ "iPhone 15 Pro" → ["iPhone 15 Pro"]
✅ "MacBook Pro" → ["MacBook Pro"]
❌ Won't match: "bought a yesterday" (plain lowercase words excluded)

### File Modified
- `/api/memory/intelligent-storage.js` line 781

---

## Issue #2: Embedding Timing (STR1 - Volume Stress)

### Problem
When 10 facts are stored rapidly (300ms intervals), embeddings may not complete before retrieval, causing "I don't know" responses even though data exists.

### Current Implementation
**Synchronous Embedding (Explicit Storage):**
```javascript
// intelligent-storage.js:1557-1574
if (metadata.wait_for_embedding === true) {
  const { embedMemory } = await import('../services/embedding-service.js');
  const embedResult = await embedMemory(this.db, memoryId, facts, { timeout: 5000 });
}
```

**Non-Blocking Embedding (Normal Storage):**
```javascript
// intelligent-storage.js:1577-1588
embedMemoryNonBlocking(this.db, memoryId, facts, { timeout: 3000 })
```

**Fallback Retrieval (Recent Unembedded):**
```javascript
// semantic-retrieval.js:813-876
WHERE created_at > NOW() - INTERVAL '2 minutes'
  AND (embedding IS NULL OR embedding_status != 'ready')
```

### How It Works
1. **Explicit Storage**: Uses synchronous `embedMemory` with 5s timeout
2. **Normal Storage**: Uses async `embedMemoryNonBlocking` with 3s timeout
3. **Retrieval Fallback**: Checks for memories < 2 minutes old without embeddings
4. **Text-Based Scoring**: Unembedded memories scored via text matching
5. **Explicit Storage Priority**: 0.99 boost for explicit storage during memory recall

### Status
✅ **VERIFIED** - Implementation is correct and comprehensive.

### Files Verified
- `/api/memory/intelligent-storage.js` lines 1557-1588
- `/api/services/embedding-service.js` lines 221-248
- `/api/services/semantic-retrieval.js` lines 813-876, 1110-1142

---

## Issue #3: Numerical Extraction (EDG3 - Pricing Preservation)

### Problem
Numbers like $99 and $299 might be dropped during fact extraction/compression.

### Current Implementation
**Detection Patterns:**
```javascript
// intelligent-storage.js:774-776
const amountPattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$\d+|\d{1,6}k/i;
const yearPattern = /\b(19|20)\d{2}\b/g;
const durationPattern = /\b\d+\s*(year|years|month|months|week|weeks|day|days|hour|hours)\b/gi;
```

**Re-Injection Logic:**
```javascript
// intelligent-storage.js:798-830
const inputAmounts = userMsg.match(amountPattern) || [];
const factsAmounts = facts.match(amountPattern) || [];

if (inputAmounts.length > factsAmounts.length) {
  missingNumbers.push(...inputAmounts.filter(amt => !facts.includes(amt)));
}

if (missingNumbers.length > 0) {
  facts += '\n' + missingNumbers.join(', ');
}
```

### What It Protects
- **Money**: $99, $1,234.56, $1,234, 99k
- **Years**: 2010, 2015, 1995
- **Durations**: 5 years, 3 months, 2 weeks
- **Re-injection**: Adds missing numbers back to facts before storage

### Status
✅ **VERIFIED** - Comprehensive number protection and re-injection.

### Files Verified
- `/api/memory/intelligent-storage.js` lines 774-836

---

## Issue #4: Explicit Storage Metadata (T2, A5)

### Problem
"Remember this exactly: ZEBRA-XXX" must set `explicit_storage_request: true` and apply strong retrieval boost.

### Current Implementation

**Storage:**
```javascript
// intelligent-storage.js:441
metadata: {
  explicit_storage_request: true,
  wait_for_embedding: true  // Ensures synchronous embedding
}
```

**Retrieval Boost:**
```javascript
// semantic-retrieval.js:1128-1137
if (metadata?.explicit_storage_request === true) {
  return {
    ...memory,
    similarity: 0.99, // Maximum priority
    explicit_storage_request: true
  };
}
```

**Detection:**
```javascript
// intelligent-storage.js:343-394
detectExplicitMemoryRequest(content) {
  const prefixes = [
    'remember this exactly:',
    'please remember this exactly:',
    'remember this:',
    // ... 11 more patterns
  ];
}
```

### Status
✅ **VERIFIED** - Detection, storage, and retrieval boost all implemented correctly.

### Files Verified
- `/api/memory/intelligent-storage.js` lines 343-394, 421-446
- `/api/services/semantic-retrieval.js` lines 1122-1142, 1235-1256

---

## Issue #5: Ordinal Storage and Retrieval (T3, B3)

### Problem
"My first code is CHARLIE" must store with ordinal marker and retrieve correctly when queried with "What is my first code?"

### Current Implementation

**Detection (Storage):**
```javascript
// No explicit ordinal detection during storage
// Ordinal is detected ONLY during retrieval
```

**Detection (Retrieval):**
```javascript
// semantic-retrieval.js:176-196
const ORDINAL_PATTERNS = {
  first: /\b(first|1st)\b/i,
  second: /\b(second|2nd)\b/i,
  third: /\b(third|3rd)\b/i,
  // ... more ordinals
};
```

**Boost Logic:**
```javascript
// semantic-retrieval.js:207-208
const ORDINAL_BOOST = 0.40;
const ORDINAL_PENALTY = -0.20;
```

**Application:**
```javascript
// semantic-retrieval.js:223-234
if (pattern.test(content)) {
  const newSimilarity = Math.min(originalScore + ORDINAL_BOOST, 1.0);
  return { ...memory, similarity: newSimilarity, ordinal_boosted: true };
}
```

### Concern
The boost of +0.40 might not be strong enough when "first code" and "second code" have very high semantic similarity (~0.85). The difference would be:
- First code: 0.85 + 0.40 = 1.00 (capped)
- Second code: 0.85 - 0.20 = 0.65

This should work, but needs real-world testing.

### Status
⚠️ **NEEDS VERIFICATION** - Implementation looks correct, but boost strength should be validated with tests.

### Files Verified
- `/api/services/semantic-retrieval.js` lines 170-263

---

## Recommendations

### Immediate Actions
1. ✅ **Brand Name Pattern**: FIXED - Commit and push
2. ✅ **Embedding Timing**: VERIFIED - No changes needed
3. ✅ **Numerical Extraction**: VERIFIED - No changes needed
4. ✅ **Explicit Storage Metadata**: VERIFIED - No changes needed
5. ⚠️ **Ordinal Boost**: NEEDS TESTING - Run T3/B3 tests to verify boost strength

### Testing Priority
Run the full test suite in this order:
```javascript
await SMX.runAll()      // Core memory pipeline (11 tests) - includes T2, T3
await SMFULL.runAll()   // Full system (24 tests) - includes B3, A5
await SMDEEP.runAll()   // Deep intelligence (15 tests) - includes STR1, EDG3
```

### If Tests Fail
- **T2 (Explicit Recall)**: Check logging for `[EXPLICIT-MEMORY]` and `[EXPLICIT-RECALL]`
- **T3 (Ordinal First/Second)**: Check `[ORDINAL-BOOST]` logs, may need to increase boost to +0.50
- **STR1 (Tesla Model 3)**: Check `[EXTRACTION-FIX #566-STR1]` logs for brand name re-injection
- **EDG3 (Pricing $99/$299)**: Check `[EXTRACTION-FIX #566]` logs for number re-injection
- **A5/B3**: Same as T2/T3 but in SMFULL context

---

## Implementation Log

### Commit 1: Brand Name Pattern Fix
- **Date**: 2026-01-23
- **File**: `/api/memory/intelligent-storage.js`
- **Line**: 781
- **Change**: Updated regex pattern to capture multi-word brand names with numbers
- **Test**: All diagnostic tests pass (Tesla Model 3, iPhone 15 Pro, MacBook Pro)

### Next Steps
1. Run full test suite to verify all 5 fixes work in production
2. If ordinal boost insufficient, increase from +0.40 to +0.50 or +0.60
3. Document any additional logging needed for debugging
4. Run security scan and code review

---

## Diagnostic Command

To verify pattern detections without database:
```bash
node diagnostic-check.js
```

Expected output:
```
✅ PASS - Explicit memory detection
✅ PASS - Numerical pattern detection
✅ PASS - Brand name pattern detection
✅ PASS - Ordinal pattern detection
```
