# Layer 2 Primitives Detection Logic - Bug Fix Summary

## Problem Statement
Layer 2 primitives (temporal arithmetic and list completeness) were executing on every request but never firing (`fired: false` with `layer_one_correct: true`). The detection logic always concluded the AI response was correct, even when it demonstrably wasn't.

## Root Cause Analysis

### Bug 1: Temporal Arithmetic Detection Logic (Line 1274)

**Original Code:**
```javascript
const hasHedging = hedgingPhrases.some(pattern => pattern.test(response));
const hasComputedYear = /\b(19\d{2}|20[0-3]\d)\b/.test(response) &&
                        response.match(/\b(19\d{2}|20[0-3]\d)\b/g).some(y => parseInt(y) === anchorYear - duration);

if (!hasHedging || hasComputedYear) {
  // Layer 1 handled it correctly - no need to fire
  return { response, primitiveLog };
}
```

**Problem:** The condition `if (!hasHedging || hasComputedYear)` meant:
- Return early if no hedging detected OR if computed year is present
- This caused the primitive to not fire when response had no hedging phrases but was still missing the year
- Example: "I need more information" has no hedging → returns early → primitive doesn't fire

**Fixed Code:**
```javascript
const computedYear = anchorYear - duration;

// Check if the response contains the computed year
const yearPattern = /\b(19\d{2}|20[0-3]\d)\b/g;
const yearsInResponse = response.match(yearPattern) || [];
const hasComputedYear = yearsInResponse.some(y => parseInt(y) === computedYear);

if (hasComputedYear) {
  // Layer 1 handled it correctly - the computed year is in the response
  return { response, primitiveLog };
}

// Response is missing the computed year - primitive fires
```

**Fix:** Check for computed year presence FIRST. If it's there, Layer 1 succeeded. If not, fire the primitive regardless of hedging.

### Bug 2: List Completeness Name Extraction (Lines 1377-1395)

**Original Code:**
```javascript
const properNamePattern = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+)*)$/;
```

**Problem:** Pattern failed to match "Björn O'Shaughnessy":
- Pattern expects: `[Uppercase][lowercase+]` then optionally `[separator][Uppercase][lowercase+]`
- "O'Shaughnessy" breaks this: `O` (uppercase) → `'` (separator) → `S` (uppercase)
- The pattern expected lowercase letters after the first uppercase in each part
- Result: Only extracted "Xiaoying Zhang-Müller" and partially "Shaughnessy"

**Fixed Code:**
```javascript
const properNamePattern = /^([A-ZÀ-ÿ](?:[a-zà-ÿ']|[A-ZÀ-ÿ])*(?:[-\s][A-ZÀ-ÿ](?:[a-zà-ÿ']|[A-ZÀ-ÿ])*)*)$/;
```

**Fix:** Allow uppercase letters WITHIN name parts using `(?:[a-zà-ÿ']|[A-ZÀ-ÿ])*` which permits mixed case for names like "O'Shaughnessy".

## Test Results

### Before Fix
```
Test: "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López"
Query: "Who are my contacts?"
Response: "I don't see any contact information"

Result:
  Fired: ❌ NO
  Items Found: ["Xiaoying Zhang-Müller", "Shaughnessy"] (missing Björn, José)
  layer_one_correct: true (WRONG)
```

### After Fix
```
Test: "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López"
Query: "Who are my contacts?"
Response: "I don't see any contact information"

Result:
  Fired: ✅ YES
  Items Found: ["Xiaoying Zhang-Müller", "Björn O'Shaughnessy", "José García-López"]
  Items Missing: All 3
  layer_one_correct: false (CORRECT)
```

## Verification

All test scenarios now pass:

1. ✅ **List Completeness**: Extracts all 3 names including special characters
2. ✅ **Temporal Arithmetic (Hedging)**: Fires when response has hedging phrases
3. ✅ **Temporal Arithmetic (No Hedging)**: Fires when response missing year without hedging
4. ✅ **Temporal Arithmetic (Correct)**: Doesn't fire when response has correct year

## Files Modified
- `/api/lib/ai-processors.js` (Lines 1256-1395)
  - Fixed temporal arithmetic detection logic
  - Fixed list completeness name extraction regex
  - Added additional hedging phrases

## Impact
The primitives will now correctly fire when:
- AI response is missing information that exists in memory
- Names with apostrophes and international characters are properly extracted
- Temporal facts can be computed but aren't in the response

This aligns with the expected behavior: Layer 2 primitives should catch and fix cases where Layer 1 (the AI) failed to use injected memory correctly.
