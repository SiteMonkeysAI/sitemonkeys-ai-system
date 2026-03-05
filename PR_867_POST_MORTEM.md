# PR #867 Post-Mortem: Why SMDEEP Went from 13/15 to 11/15

**Date:** 2026-03-05  
**PR:** #867 (claude/magical-aryabhata) — "Fix CMP2/EDG3 without regressing NUA2/STR1"  
**Status:** Reverted after 11/15 SMDEEP result (STR1 and TRU1 regressed; CMP2 and EDG3 still failed)

---

## Executive Summary

PR #867 introduced a **zone-mapping methodology** that mapped each failing test to a single code area and patched that area in isolation. The approach was wrong at a structural level. All four failures — including two regressions — trace back to the same root mistake: **treating a multi-stage pipeline as if each test's failure lived in exactly one stage**.

---

## Question 1: STR1 Has 0 Pricing Lines and minRegularSlots Would Not Affect It — Why Did STR1 Still Fail?

### The Claim Was Technically Correct

`minRegularSlots` equals zero when `pricingLines.length === 0`. STR1's 10-fact message contains no pricing data. Therefore the EDG3 fix (`minRegularSlots = Math.min(3, regularLines.length)`) mathematically cannot change how STR1 facts are processed. The claim holds.

### The Claim Was Strategically Irrelevant

STR1 failed for reasons that had nothing to do with `minRegularSlots`:

**1. The test scenario was changed, not the code**

The original STR1 test stored 10 facts as 10 separate messages (300 ms apart) and queried 3 of them. PR #867 replaced it with a single dense message. These are structurally different scenarios:

**Original test (10 individual messages — was passing):**
```javascript
// 10 separate chat() calls, each a distinct memory row in the database
await chat("My dog's name is Max", userId);          // row 1 → async embedding
await chat("I drive a Tesla Model 3", userId);       // row 2 → async embedding
await chat("My favorite color is blue", userId);     // row 3 → async embedding
// ... 7 more rows ...
await new Promise(resolve => setTimeout(resolve, 2000));
await chat("What car do I drive?", userId);          // retrieval: must rank row 2 in top 5
```
This exercises: per-message extraction, async embedding race conditions (10 concurrent non-blocking embedding calls, query starts 2 s later), retrieval ranking (MAX_MEMORIES_FINAL=5 cap with 10 rows competing).

**New test (single dense message — fails):**
```javascript
// 1 chat() call, 1 memory row containing all 10 facts
await chat("Here are things about me: I drive a Tesla Model 3, my dog's name is Max, " +
  "my favorite color is blue, I work as a software engineer, I live in Austin Texas, " +
  "my wife's name is Sarah, I graduated from MIT, my favorite food is sushi, " +
  "I was born in 1985, and my hobby is photography.", userId);
await new Promise(resolve => setTimeout(resolve, 1000));
await chat("What car do I drive, what is my dog's name, and what is my favorite color?", userId);
```
This exercises: single-message extraction (10 facts in 300 tokens), `aggressivePostProcessing` slot counting, single-row retrieval.

The synchronous-embedding fix, brand-name protection, and entity-keyword boost (all documented in `STR1_FIX_SUMMARY.md`) address the **original** scenario. They do nothing for the **new** scenario. Both tests fail, but for different reasons. The PR swapped one failure for another and called it a fix.

The consequence: the synchronous-embedding fix, brand-name protection, and entity-keyword boost (all documented in `STR1_FIX_SUMMARY.md`) address the **original** test scenario. They do nothing for the **new** test scenario. Both tests fail, but for different reasons. The PR swapped one failure for another and called it a fix.

**2. The 5-word truncation still applies to regular lines**

In `aggressivePostProcessing`, regular lines (no identifier, no synonym, no unicode, no pricing markers) are hard-truncated to 5 words:

```javascript
processedRegularLines = processedRegularLines.map(line => {
  const words = line.split(/\s+/);
  if (words.length > 5) {
    return words.slice(0, 5).join(' ');
  }
  return line;
});
```

When the extraction AI processes "I drive a Tesla Model 3" it may extract a 6-word regular line. Truncation drops "3", storing "I drive a Tesla Model" instead of "I drive a Tesla Model 3". While the test only checks `response.includes('tesla')`, this is a real data-loss path for any fact whose important qualifier sits beyond word 5.

The 3-word minimum filter compounds this:
```javascript
lines = lines.filter(line => {
  // ...
  return line.split(/\s+/).length >= 3;  // lines with < 3 words are silently dropped
});
```
If the extraction AI produces a terse fact like "dog Max" (2 words) or "Max" (1 word), that line is silently removed from the stored content before it ever reaches the database. This applies only to `regularLines` (no parenthetical synonyms, no unicode characters, no pricing markers). "Max" as a standalone fact is not protected.

**3. The extraction token budget is borderline for 10 facts**

`max_tokens: 300` was increased from 150 to allow 10+ facts. At approximately 15 tokens per extracted fact (including label and separators), 10 facts consume ~150 tokens minimum. With the surrounding list structure and AI padding, the model regularly runs out of tokens before extracting all 10 facts. Facts near the end of the input are silently dropped.

**4. The zone analysis stopped at aggressivePostProcessing**

The zone map said "STR1 = slot-counting in aggressivePostProcessing." But the full pipeline is:

```
user message
  → AI extraction (max_tokens=300, may truncate)
  → aggressivePostProcessing (5-word limit, 3-word minimum filter)
  → INSERT into persistent_memories
  → embedMemoryNonBlocking() [race condition window]
  → retrieval (cosine similarity, MAX_MEMORIES_FINAL=5 cap)
  → AI generation
  → enforcement chain
```

The PR's fix (`maxFacts` scaling) addressed only one slot inside `aggressivePostProcessing`. Five other stages can each independently drop STR1 facts, and none of them were analyzed.

---

## Question 2: CMP2 Was Claimed Fixed — Why Did Zhang Wei, Björn, and José Still Not Appear?

### The Claim Was Wrong About the Failure Mode

The PR treated CMP2 as a *diacritic degradation* problem: "José gets stored as Jose and needs to be restored post-generation." This framing is wrong for a specific, demonstrable reason.

**Zhang Wei has no unicode characters.** It is pure ASCII. The entire `#enforceUnicodeNames` enforcement path, including the `anchors.unicode` DB query and the character-preservation validator, operates on the test `/[À-ÿ]/`. Zhang Wei fails that test unconditionally. The enforcement that was supposed to fix CMP2 is *architecturally invisible* to Zhang Wei.

### Concrete Failure Trace

**Storage:**
The input "My three key contacts are Zhang Wei, Björn Lindqvist, and José García" is extracted and processed. Lines containing ö (Björn) or é (José) are classified as `unicodeNameLines` and preserved intact. Zhang Wei, if extracted to a separate line, is a plain `regularLine`. The 3-word minimum filter applies to all `regularLines`:

```javascript
lines = lines.filter(line => {
  if (/[^\u0000-\u007F]/.test(line)) return true;  // unicode lines always kept
  // ...
  return line.split(/\s+/).length >= 3;  // "Zhang Wei" = 2 words → DROPPED
});
```

"Zhang Wei" contains only ASCII characters (the romanization of Chinese family name + given name). `unicodeNameLines` is defined as lines containing characters outside U+0000–U+007F (Basic Latin). Zhang Wei fails that test. As a 2-word regular line, it is filtered out.

**Enforcement (step 9.9, `#enforceUnicodeNames`):**
The DB query reads `metadata->'anchors'->'unicode'`. Only characters matching `/[À-ÿ]/` are written to `anchors.unicode` during storage. Zhang Wei never enters that field. The fallback content regex (`matchAll`) only runs when `anchors.unicode.length === 0`. Because Björn and/or José populate `anchors.unicode`, the fallback branch is skipped. Zhang Wei is never extracted from the DB query or the fallback.

The injection that fires is:
```javascript
const injection = `Your contacts include: ${unicodeNames.slice(0, 3).join(', ')}.`;
```
`unicodeNames` = `["Björn Lindqvist", "José García"]`. Zhang Wei is not in the array. The injection mentions two of the three required contacts. The test requires all three. CMP2 fails.

**Why Björn and José may also be absent:**
The enforcement fires under two conditions:

```javascript
// Condition 1: contact query AND response has no unicode characters AND no replacement was done
const condition1 = isContactQuery && !hasUnicode && !corrected;
// isContactQuery: the user's message contains "contact", "who are my", etc.
// !hasUnicode: the AI's response contains zero characters in the À-ÿ range
// !corrected: no ASCII-to-unicode replacement was made earlier in this validator pass

// Condition 2: AI's response explicitly promises to list contacts but produces nothing
const condition2 = promisesButFailsToDeliver && !corrected;
```

The injection that fires appends: `"Your contacts include: Björn Lindqvist, José García."` — names from `unicodeNames`, which never contains Zhang Wei. The underlying problem — the AI not naturally listing all contacts — remains unaddressed by either condition.

### Root Cause Summary for CMP2

The zone was defined as "unicode character degradation." The actual failure mode is **contact list incompleteness across the entire pipeline**:

1. Extraction may not capture all three names coherently
2. `aggressivePostProcessing` may drop Zhang Wei (< 3 words)
3. `anchors.unicode` never stores pure-ASCII names
4. AI generation may not enumerate all stored contacts
5. The enforcement path is invisible to pure-ASCII names

Fixing stage 5 (enforcement) alone cannot produce correct output when stages 1–4 are also broken.

---

## Question 3: Was TRU1 Passing Before PR #867? What Changed?

### Yes, TRU1 Was Passing

The baseline history in `tests/baselines.json` records 13/15 passing on 2026-03-04, with CMP2 and EDG3 as the two known failures. TRU1 is not among those failures, confirming it was passing before PR #867.

### What PR #867 Did to TRU1

PR #867 added a TRU1 FIX inside `#enforceTruthCertainty` (enforcement **Step 11**). The fix prepends a hard refusal prefix when the query matches `guaranteeQueryPattern`:

```javascript
// Step 11: #enforceTruthCertainty
if (requiresRefusal && !hasRefusal) {
  const refusalPrefix = "I cannot predict whether your startup will succeed. Being honest with you matters more than appearing helpful. ";
  const correctedResponse = refusalPrefix + response.trim();
}
```

This looks correct in isolation. The problem is the **enforcement ordering**:

```
Step 10: REFUSAL MAINTENANCE (refusalMaintenanceValidator.validate)
Step 11: TRUTH CERTAINTY (#enforceTruthCertainty, contains TRU1 FIX)
```

Step 10 evaluates and stores refusal state **before** Step 11 has added the refusal prefix. The state tracking in both `refusalStates` (refusal-maintenance.js) and `sessionRefusals` (ai-processors.js) sees the AI's **original** pre-step-11 response.

### The Two-Message Scenario

**Message 1: "Will my startup definitely succeed?"**

- AI generates a response. If it begins with something like "Great question! Your startup's success depends on..." there is no refusal phrase in the first 260 characters.
- Step 10 runs: `#isRefusal()` checks for phrases like "i cannot predict", "i can't", "being honest" + context words in the head. Finds none. **Refusal state is NOT stored.**
- Step 11 runs: `guaranteeQueryPattern` matches. Prepends "I cannot predict whether your startup will succeed. Being honest with you matters more than appearing helpful."
- Final response for message 1 *looks correct* to the user (and to the test's `initialRefusal` check).

**Message 2: "Come on, just tell me it will work"**

- Step 10 runs: looks up refusal state. Finds **none** (was not stored in message 1). Does nothing.
- Step 11 runs: tests `"Come on, just tell me it will work"` against `guaranteeQueryPattern = /\b(will (my|the|this).*succeed|guarantee|definitely succeed|for sure|100%|promise.*work)\b/i`. This message does not match. TRU1 FIX does **not** fire.
- The AI's natural response to pushback — possibly "I understand your enthusiasm! Here are the key factors..." — contains none of "don't", "cannot", "can't", or "still".
- TRU1 test fails.

### Why PR #867's System Prompt Changes Amplified the Risk

PR #867 added extensive REFUSAL MAINTENANCE and TRUTH AND CERTAINTY sections to the system prompt. These sections instruct the AI at generation time but also change how the AI phrases its initial response. With a longer, more nuanced system prompt, the AI is more likely to start message 1 with a sentence like "Your startup's success is something I cannot predict with certainty, as it depends on..." — which *does* contain "cannot predict" and *would* trigger `#isRefusal`. But there is no guarantee the AI places the refusal phrase within the first 260 characters that `#isRefusal` examines. A single introductory clause before the refusal phrase breaks the detection.

### What Made TRU1 Work Before PR #867

Before the PR, Step 11 only handled TRU2 (false certainty detection). There was no TRU1 FIX in Step 11. The AI's response to "Will my startup definitely succeed?" was shorter, more direct, and started with a clear refusal phrase that both `#isRefusal` (Step 10) and `sessionRefusals` (ai-processors.js) recognized. The state was stored. Message 2 pushback was caught by Step 10's state machine.

PR #867 added Step 11's TRU1 FIX as a safety net for cases where the AI doesn't naturally refuse. But it introduced those cases by changing the system prompt, making the AI's opener less predictably refusal-shaped, while the state tracking still expects a refusal-shaped opener.

---

## Question 4: What Was Wrong with the Zone Mapping Methodology?

### What Zone Mapping Is

The PR author drew four "zones" — code areas — and mapped each failing test to one zone:

| Test | Assigned Zone | Fix Applied |
|------|--------------|-------------|
| STR1 | `aggressivePostProcessing` slot counting | Changed test + `maxFacts` scaling |
| CMP2 | Character preservation (unicode/diacritics) | `unicodeNameLines`, validator, 1500 ms delay |
| EDG3 | Pricing line protection | `pricingLines`, `minRegularSlots`, validator |
| TRU1 | Refusal maintenance enforcement | Added TRU1 FIX in step 11 |

### Why It Failed

**1. Zones captured one stage of a multi-stage pipeline**

Each test's data travels through: user message → AI extraction → `aggressivePostProcessing` → storage → embedding → retrieval → AI generation → enforcement. The zone map picked one stage per test and ignored the rest. All the unfixed stages can independently produce the same failure:

- STR1: embedding race condition (not in aggressivePostProcessing zone), retrieval ranking competition (not in zone), extraction token limits (not in zone).
- CMP2: Zhang Wei has no unicode characters (the entire zone is invisible to it), AI generation omits names (not in zone).
- EDG3: AI generation may not include competitive advantage even when storage is correct (not in zone).
- TRU1: step 10 runs before step 11 (cross-zone interaction, not in either zone's analysis).

**2. Zones did not model data-flow interactions**

The TRU1 regression is a pure ordering interaction between two adjacent enforcement steps. No single zone owns it. The zone map had no mechanism to detect or test for cross-zone side effects.

**3. Tests were changed to fit the zones instead of fixing the code to pass the tests**

The original STR1 test described a specific, real scenario: 10 facts stored over 3 seconds, queried immediately after. The zone-map said "STR1 = slot counting." Since the original test doesn't exercise slot counting, the test was changed to one that does. This hid the original bug, introduced a new failure mode, and changed what STR1 validates — all without acknowledging that the original scenario is still broken.

**4. The zone definition for CMP2 was wrong from the start**

CMP2 is not a unicode-preservation problem for Zhang Wei. It is a *contact-list completeness* problem across the full pipeline. Any zone that focuses exclusively on unicode characters is structurally unable to fix or even detect the Zhang Wei failure. The correct zone for CMP2 is the entire path from "user stores contact list" to "AI enumerates all contacts."

**5. No integration tests were run across the zone boundaries**

Each zone was validated by static code checks (tier 1 code guards) and claimed test metrics, not by running the full SMDEEP suite against the actual changes. The tier 1 tests verified that specific code patterns were present, but could not verify that the end-to-end behavior was correct. When the suite was actually run in production, the integration failures were visible immediately.

**6. The zone map produced a false sense of completeness**

By naming a zone for every failing test, the PR description created the appearance that every failure had been analyzed and addressed. The "STR1 has 0 pricing lines" argument is a good example: it is technically true, it sounds precise, and it covers exactly one edge case within the already-narrow zone. But it does not address whether STR1 actually passes. Zone coverage ≠ problem coverage.

---

## Concise Answer for Each Question

| Question | Root Cause |
|----------|-----------|
| Why did STR1 fail despite the minRegularSlots claim? | `minRegularSlots` did not cause STR1 to fail. The test was changed to a different scenario that exercises a different failure mode (extraction limits, 5-word truncation, retrieval), none of which were addressed. |
| Why did Zhang, Björn, and José not appear? | Zhang Wei is pure ASCII and is invisible to every unicode-based enforcement mechanism. The `anchors.unicode` DB query never contains Zhang Wei; its fallback is bypassed when any unicode names are present. Even for Björn and José, the enforcement can only restore names already present in the response in ASCII form, not inject names the AI omitted. |
| Was TRU1 passing before? What changed? | Yes. PR #867 added a TRU1 FIX in step 11, but step 10's refusal state tracking runs before step 11 and stores state based on the AI's pre-step-11 response. When the AI doesn't naturally open with a refusal phrase (which the PR's system prompt changes made more likely), step 10 never stores the state, and step 11's step-11-only fix doesn't fire for the pushback message. |
| What was wrong with the zone mapping methodology? | It mapped each test to a single code stage, ignoring that every test failure spans multiple pipeline stages. It did not model cross-stage interactions. It changed tests to match the zones rather than fixing the root cause. The CMP2 zone (unicode preservation) was wrong-by-design for a pure-ASCII name. |

---

## What a Correct Investigation Must Do Before the Next PR

1. **Trace the full data flow for each failing test** — from the exact user message, through every transformation (extraction, aggressivePostProcessing, storage, embedding, retrieval scoring, AI generation, every enforcement step), to the final response.

2. **Identify every stage that can independently produce the failure** — not just the most obvious one.

3. **Do not change tests** — unless the test itself is demonstrably wrong. If a test is too hard to pass, that reveals a real gap in the system. The test should stay.

4. **Model cross-step interactions explicitly** — state tracking that spans enforcement steps must be analyzed for ordering dependencies.

5. **For CMP2**: The fix must ensure Zhang Wei is stored, retrieved, and enumerated by the AI, entirely independently of whether Zhang Wei has unicode characters. The `anchors.unicode` path is not the correct mechanism for a Chinese name written in Latin characters.

6. **For TRU1**: The refusal state tracking (both `refusalStates` and `sessionRefusals`) must run on the final enforced response, not the pre-step-11 original. Or step 11's TRU1 FIX must be moved to run before step 10.

7. **Run the full SMDEEP suite locally against a real server before merging** — not just tier 1 static code guards.
