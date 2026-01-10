# Copilot & Claude Code Instructions for sitemonkeys-ai-system

## Authority & Override Rules

This document overrides coding heuristics and default behaviors of AI assistants within this repo. It does NOT override platform security policies or external system constraints.

**If the Truth Map (verified runtime behavior) and this document disagree, the Truth Map wins until updated with evidence.**

---

## THE BIBLE: Core Behavioral Contract

This system operates on a truth-first architecture. Before doing ANY work, understand this:

```
OLD (Warehouse Worker): "I can't be certain, therefore I should stop."
NEW (CEO): "I can't be certain, therefore I must reason carefully and transparently."
```

**The Core Invariant:** Uncertainty must increase effort, not reduce it.

**Priority Stack:** TRUTH > HELPFULNESS > ENGAGEMENT

**The Caring Family Member Model:** The system should think like the smartest, most caring person you know — someone who tells you the truth because they respect you, works harder when problems get harder, sees what you might miss, and never wastes your time.

Apply this same standard to your own work on this codebase.

---

## SEMANTIC INTELLIGENCE REQUIREMENTS

### Authority Rule

**If the Truth Map (verified runtime behavior) and this document disagree, the Truth Map wins until updated with evidence.**

This section describes both what EXISTS today and what MUST BE BUILT. These are clearly separated. Do not "fix" the repo to match target requirements without explicit issue authorization.

---

### SECTION A: CURRENT VERIFIED REALITY

**⚠️ All claims in CURRENT VERIFIED REALITY must be verified via repo grep before acting. If uncertain, treat as unknown.**

*This section describes what may exist today. Verify before assuming.*

**`api/core/intelligence/semantic_analyzer.js`**
- File exists with embedding-based methods
- May contain `#getEmbedding()` - generates OpenAI embeddings
- May contain `#cosineSimilarity()` - calculates vector similarity
- May contain `analyzeContentImportance()`, `analyzeSupersession()`, `analyzeIntent()`
- **Verify current state:**
  ```bash
  grep -n "getEmbedding\|cosineSimilarity\|analyzeContent\|analyzeSupersession" api/core/intelligence/semantic_analyzer.js
  ```

**`api/memory/intelligent-storage.js`**
- Memory storage operations
- May call semantic_analyzer methods for importance, dedup, supersession depending on current implementation
- **Verify current state:**
  ```bash
  grep -n "semanticAnalyzer\|SEMANTIC-" api/memory/intelligent-storage.js
  ```

**What May NOT Exist (or is partial):**
- Retrieval may still use SQL keyword/category filters in some paths
- Not all retrieval paths may use pgvector semantic search
- Embedding coverage may not be universal
- **Verify retrieval implementation (path-agnostic):**
  ```bash
  grep -rn "FROM persistent_memories" api/ memory_system/
  grep -rn "ILIKE\|<=>\|pgvector\|embedding" api/ memory_system/
  ```

**Current Logging:** When semantic operations ARE used, they should log with `[SEMANTIC-*]` prefixes. Verify:
```bash
grep -rn "\[SEMANTIC-" api/
```

---

### SECTION B: TARGET REQUIREMENTS (For New/Modified Semantic Code)

**Core Principle from the Bible:**
> "Genuine Intelligence Doctrine: Not rule-following. Real reasoning under constraints."

When the system must make a SEMANTIC decision (importance, similarity, intent, supersession), the FINAL decision must come from semantic methods (embeddings, AI reasoning), not from keyword arrays or pattern matching alone.

**Anti-Pattern: "Inject Everything" is NOT Semantic Intelligence**
> Retrieval must demonstrate selectivity. Passing tests by injecting all memories and letting the LLM do semantic work is NOT considered semantic intelligence and must be treated as FAIL at scale.

**Hybrid Approach (Cost-Aware):**

The Token Efficiency Doctrine says: "Every token must earn its existence."

```
ALLOWED PATTERN:
1. Cheap deterministic prefilter (regex, patterns)
   → Quick rejection of obviously non-matching content
   → Reduces embedding API calls, cost, and latency

2. Semantic confirmation (embeddings, AI reasoning)
   → Final decision on candidates that pass prefilter
   → Provides the actual intelligence
```

**Prefilter Finalization Rule:**
- Prefilters may ONLY produce a final decision if the decision is non-semantic by definition (e.g., exact match greeting like "hi" or "thanks")
- If the output affects memory retention, dedup, supersession, or ranking, prefilter CANNOT finalize—it must forward to semantic analysis
- When in doubt, forward to semantic confirmation

**What New Semantic Code MUST Do:**
1. Use existing semantic_analyzer.js methods where they exist (verify first)
2. Final semantic decisions must use semantic methods (embeddings, AI reasoning, vector queries)
3. Add appropriate `[SEMANTIC-*]` logging
4. Include fallback behavior for API failures
5. Cache embeddings for repeated content
6. Demonstrate retrieval selectivity—do not rely on "inject everything"

**What New Semantic Code MUST NOT Do:**
- ❌ Keyword arrays as final intelligence decision
- ❌ String matching as final semantic logic
- ❌ Token/Jaccard similarity for semantic comparison
- ❌ Regex as final semantic decision
- ❌ "Inject everything" retrieval strategies

**Examples - WRONG vs RIGHT:**

```javascript
// ❌ WRONG - keyword array as final decision
const isImportant = KEYWORDS.some(k => content.includes(k));
return { important: isImportant };

// ❌ WRONG - prefilter finalizing a semantic decision
if (content.includes('allergy')) {
  return { important: true }; // This affects retention - can't finalize here
}

// ✅ RIGHT - exact-match prefilter for trivial case (OK to finalize)
if (['hi', 'hello', 'thanks', 'ok'].includes(content.toLowerCase().trim())) {
  return { important: false, reason: 'trivial-greeting' };
}

// ✅ RIGHT - prefilter forwards to semantic for real decisions
const mayBeImportant = /allergy|medication|emergency/i.test(content);
if (!mayBeImportant) {
  // Only reject obvious non-matches; anything uncertain goes to semantic
}
const result = await semanticAnalyzer.analyzeContentImportance(content);
return result; // Semantic method makes final decision
```

---

### SECTION C: CI/GREP ENFORCEMENT

**Scope:** These rules apply ONLY to files in:
- `api/core/intelligence/`
- `api/memory/`
- Files with "semantic" in the name
- Files that query `persistent_memories` for retrieval

They do NOT apply to general utilities, UI code, server config, or test files.

**Warning Checks (Require Human Review):**

These patterns require review to determine if they're prefilters or final decisions:

```bash
# Check for potential keyword arrays
grep -rn "const.*KEYWORD\|const.*PATTERN.*=.*\[" api/core/intelligence/ api/memory/

# Check for .includes() usage
grep -rn "\.includes(" api/core/intelligence/ api/memory/

# Check for regex patterns
grep -rn "\.test(\|\.match(" api/core/intelligence/ api/memory/
```

**Review Guidance:** Ask "Is this a prefilter that forwards to semantic, or is this the final decision?" If final decision on anything affecting importance/dedup/supersession/ranking → requires semantic method.

**Red Flag Patterns (Should Not Exist):**

```bash
# Token overlap similarity - never acceptable for semantic comparison
grep -rn "split.*filter.*includes\|intersection.*tokens" api/core/intelligence/ api/memory/
# Should return NO results

# "Inject everything" patterns - check for unbounded retrieval
grep -rn "LIMIT\|SELECT \*.*FROM persistent_memories" api/ memory_system/
# Review: Is retrieval selective or does it grab everything?
```

**Verification Checks (Not Hard Gates):**

These help verify semantic operations exist but should not be brittle CI gates:

```bash
# If semantic_analyzer exists, should contain embedding methods
grep -n "getEmbedding\|cosineSimilarity" api/core/intelligence/semantic_analyzer.js

# If intelligent-storage does semantic ops, should reference semantic_analyzer
grep -n "semantic_analyzer\|semanticAnalyzer" api/memory/intelligent-storage.js
```

**Note:** These checks are for human review, not automated rejection. Don't create brittle CI gates that you'll later disable.

---

## INVESTIGATION REQUIRED BEFORE FIXING

**STOP. Before writing ANY code, you must answer these questions.**

### 1. Root Cause Analysis
- Where exactly does this behavior originate? (file:function:line)
- What is the current logic flow?
- Why does the current logic produce the wrong result?
- What specific change will fix the ROOT CAUSE, not the symptom?

### 2. Data Flow Trace
```
User query → [what happens here?] → [then here?] → [wrong result]
                              ↑
                    [Identify where it breaks]
```

### 3. Semantic Intelligence Check (if applicable)
- Does `semantic_analyzer.js` already have a method for this? (verify by grep)
- Am I using semantic methods for FINAL decisions?
- Is my prefilter only rejecting trivial/obvious cases?
- Have I added appropriate `[SEMANTIC-*]` logging?

### 4. Verification Plan
- How will you verify the fix works?
- What test cases should pass?
- What could this fix accidentally break?
- Does retrieval demonstrate selectivity (not "inject everything")?

### 5. Completeness Check
- Are there other places with the same pattern?
- List ALL files that need modification.

---

## IMPLEMENTATION RULES

1. **NO surface-level fixes** — Adding keywords to a list without understanding WHY is not a fix.

2. **NO keyword arrays as final semantic decisions** — Use as prefilters only for trivial rejections.

3. **No vague phase-2 handwaving** — If deferring work, explicitly open a follow-up issue with acceptance criteria.

4. **TRACE before you CHANGE** — If you can't explain the current logic flow, you don't understand the problem.

5. **ROOT CAUSE over SYMPTOM** — Find WHERE and WHY, not just WHAT.

6. **USE EXISTING INFRASTRUCTURE** — Verify what exists in semantic_analyzer.js before creating new logic.

7. **Truth Map wins** — If docs and runtime behavior disagree, trust runtime until docs updated with evidence.

8. **Selectivity required** — "Inject everything" is not semantic intelligence.

---

## Project Structure

**Paths are illustrative; verify current locations with repo search before editing.**

Common locations (verify before assuming):
- `/api/core/orchestrator.js` — Main request coordinator
- `/api/core/intelligence/semantic_analyzer.js` — Semantic intelligence methods
- `/api/core/intelligence/` — Truth detection, reasoning enforcement
- `/api/memory/intelligent-storage.js` — Memory storage with semantic operations
- `/memory_system/` — Memory storage and retrieval
- `/api/core/personalities/` — Eli and Roxy frameworks
- `/api/lib/` — Utilities, validators, enforcement
- `/server.js` — Entry point

**Always verify:**
```bash
find api/ memory_system/ -name "*.js" | head -20
ls -la api/core/intelligence/
```

---

## Key Architecture Patterns

- **ESM imports only** — Use `import/export`, never `require()`
- **Async/await** — All database and embedding operations must be async
- **Error handling** — Log but don't crash; include fallbacks
- **Token efficiency** — Every token must earn its existence
- **Orchestrator pattern** — Modules communicate through orchestrator

---

## The Doctrines (Reference)

**Opportunity Doctrine:** "Uncertainty is a reason to work harder, not permission to stop."

**Genuine Intelligence Doctrine:** "Not rule-following. Real reasoning under constraints."

**Injection Doctrine:** "Only inject what is relevant, bounded, labeled, and worth its cost."

**Memory & Intelligence Doctrine:** "Categorization → Intelligent Storage → Contextual Retrieval"

**Token Efficiency Doctrine:** "Every token must earn its existence."

---

## PR Quality Checklist

- [ ] Root cause identified and documented
- [ ] Data flow traced
- [ ] Verified existing methods before creating new ones (grep evidence)
- [ ] Semantic decisions use semantic methods (prefilters only for trivial rejection)
- [ ] Appropriate `[SEMANTIC-*]` logging added
- [ ] Retrieval demonstrates selectivity (not "inject everything")
- [ ] Follow-up issues created for deferred work (with acceptance criteria)
- [ ] No regressions to existing functionality
- [ ] Aligns with Truth Map (verified runtime behavior)

---

## Deployment Notes

- Railway auto-deploys on merge to main
- Check logs for `[SEMANTIC-*]` prefixes to verify semantic operations
- Database connection in `DATABASE_URL` environment variable
