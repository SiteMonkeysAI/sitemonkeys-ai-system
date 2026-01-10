---
name: Claude/Copilot Fix
about: Issue for Claude Code or Copilot to fix
title: '[claude-fix] '
labels: claude-fix
assignees: ''
---

## Problem Summary
<!-- One sentence describing what's wrong -->

## Evidence
<!-- Paste relevant logs, error messages, or test results -->
```
[paste logs here]
```

## Expected Behavior
<!-- What SHOULD happen according to the Bible/Doctrines -->

## Actual Behavior
<!-- What IS happening -->

---

## Authority Rule

**If the Truth Map (verified runtime behavior) and this document disagree, the Truth Map wins until updated with evidence.**

Do not "fix" the repo to match documentation claims. Fix actual broken behavior.

**All claims about current system state must be verified via repo grep before acting. If uncertain, treat as unknown.**

---

## INVESTIGATION REQUIREMENTS

**Complete this section BEFORE writing any fix code.**

### 1. Root Cause Analysis
- [ ] Where exactly does this behavior originate? (file:function:line)
- [ ] What is the current logic flow?
- [ ] Why does the current logic produce the wrong result?
- [ ] What specific change will fix the ROOT CAUSE?

### 2. Data Flow Trace
```
User input → [step 1] → [step 2] → [step 3] → Wrong output
                              ↑
                    [Identify where it breaks]
```

### 3. Semantic Intelligence Check (if this involves semantic operations)

**First, verify what exists:**
```bash
grep -n "getEmbedding\|cosineSimilarity\|analyzeContent" api/core/intelligence/semantic_analyzer.js
grep -rn "FROM persistent_memories" api/ memory_system/
```

Then answer:
- [ ] Does `semantic_analyzer.js` already have a method for this? (verified by grep)
- [ ] Am I using semantic methods for FINAL decisions?
- [ ] Is my prefilter only rejecting trivial/obvious cases?
- [ ] Does retrieval demonstrate selectivity (not "inject everything")?
- [ ] Have I added appropriate `[SEMANTIC-*]` logging?

### 4. Files That Need Modification

**Verify paths exist before listing:**
```bash
ls -la api/core/intelligence/
ls -la api/memory/
```

- [ ] File 1: reason
- [ ] File 2: reason

### 5. Verification Plan
- [ ] What test cases should pass after the fix?
- [ ] What could this fix accidentally break?

---

## SEMANTIC INTELLIGENCE RULES (If Applicable)

**If this fix involves semantic/memory intelligence:**

### Prefilter vs Final Decision

| Type | Can Finalize? | Example |
|------|---------------|---------|
| Trivial exact match | ✅ Yes | `if (content === 'hi') return false` |
| Pattern suggesting importance | ❌ No | `if (/allergy/.test(content))` must forward to semantic |
| Anything affecting retention/dedup/supersession | ❌ No | Must use semantic method |

### "Inject Everything" is NOT Semantic Intelligence

Retrieval must demonstrate selectivity. Tests that pass by injecting all memories are NOT considered passing at scale.

### Examples

```javascript
// ❌ WRONG - prefilter finalizing a semantic decision
if (content.includes('allergy')) {
  return { important: true }; // Affects retention - can't finalize here
}

// ✅ RIGHT - trivial prefilter (OK to finalize)
if (['hi', 'thanks', 'ok'].includes(content.trim())) {
  return { important: false, reason: 'trivial' };
}

// ✅ RIGHT - prefilter forwards to semantic
const mayBeImportant = /allergy|medication/i.test(content);
if (!mayBeImportant) { /* only reject obvious non-matches */ }
return await semanticAnalyzer.analyzeContentImportance(content);
```

---

## SUCCESS CRITERIA

- [ ] Root cause fixed (not just symptom)
- [ ] Verified existing methods before creating new ones
- [ ] Prefilters only finalize trivial cases
- [ ] Final semantic decisions use semantic methods
- [ ] `[SEMANTIC-*]` logging if semantic operation added
- [ ] Retrieval demonstrates selectivity
- [ ] No regressions to existing functionality
- [ ] Aligns with Truth Map (verified runtime behavior)

---

## IMPLEMENTATION RULES

1. **NO surface-level fixes** — Understand WHY before changing
2. **TRACE before you CHANGE** — Document logic flow first
3. **ROOT CAUSE over SYMPTOM** — Find WHERE and WHY
4. **VERIFY before assuming** — Grep to confirm what exists
5. **Truth Map wins** — If docs and runtime disagree, trust runtime
6. **Prefilters for trivialities only** — Semantic decisions need semantic methods
7. **No vague phase-2** — If deferring, create follow-up issue with acceptance criteria
8. **Selectivity required** — "Inject everything" is not semantic intelligence

---

## DOCTRINE REFERENCE

**Core Invariant:** Uncertainty must increase effort, not reduce it.

**Genuine Intelligence Doctrine:** "Not rule-following. Real reasoning under constraints."

**Token Efficiency Doctrine:** "Every token must earn its existence."
