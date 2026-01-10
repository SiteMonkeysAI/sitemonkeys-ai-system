# Copilot Repository Automation Rules

## Authority Rule

**If the Truth Map (verified runtime behavior) and this document disagree, the Truth Map wins until updated with evidence.**

---

## Repository Automation Rules

- Always merge feature and fix branches into the staging branch `copilot/consolidate-fixes-from-open-prs`.
- Run all workflows (Quality-Chain, CodeQL, Security) after each merge.
- If all required checks are green, mark PRs "Ready for review" and auto-merge into `main`.
- When lint or format errors occur, run `eslint --fix` and `prettier --write` automatically.
- For "no-unused-vars" errors, prefix unused parameters with `_` or remove them.
- If CodeQL flags "insecure randomness," replace `Math.random()` with `crypto.randomUUID()` or a secure fallback.
- When `main` is updated, trigger Railway deployment automatically.

---

## Semantic Intelligence Enforcement

### Scope

These rules apply ONLY to files in:
- `api/core/intelligence/`
- `api/memory/`
- Files with "semantic" in the name
- Files that query `persistent_memories` for retrieval

They do NOT apply to general utilities, UI code, server config, or test files.

### Core Rules

1. **Prefilters allowed, semantic final decisions required**
   - Deterministic prefilters (regex, keywords) may reject obvious non-matches
   - Final decisions affecting importance/dedup/supersession/ranking MUST use semantic methods

2. **Prefilter finalization only for trivialities**
   - Prefilters may only finalize for exact-match trivial cases (e.g., "hi", "thanks")
   - Anything uncertain or affecting retention must forward to semantic analysis

3. **"Inject everything" is not semantic intelligence**
   - Retrieval must demonstrate selectivity
   - Tests that pass by injecting all memories are NOT considered passing at scale

### Warning Checks (Require Human Review)

```bash
# Potential keyword arrays - review if prefilter or final decision
grep -rn "const.*KEYWORD\|const.*PATTERN.*=.*\[" api/core/intelligence/ api/memory/

# .includes() usage - review if prefilter or final decision
grep -rn "\.includes(" api/core/intelligence/ api/memory/

# Regex patterns - review if prefilter or final decision
grep -rn "\.test(\|\.match(" api/core/intelligence/ api/memory/
```

**Review question:** "Is this a prefilter that forwards to semantic, or the final decision?"

### Red Flag Patterns

```bash
# Token overlap similarity - never acceptable
grep -rn "split.*filter.*includes\|intersection.*tokens" api/core/intelligence/ api/memory/
# Should return NO results

# Check retrieval selectivity
grep -rn "FROM persistent_memories" api/ memory_system/
# Review: Is there a LIMIT? Is it selective or grabbing everything?
```

### Verification Guidance (Not Hard Gates)

These are for human review, not automated rejection:

```bash
# Verify semantic methods exist
grep -n "getEmbedding\|cosineSimilarity" api/core/intelligence/semantic_analyzer.js

# Verify semantic integration
grep -n "semantic_analyzer\|semanticAnalyzer" api/memory/intelligent-storage.js

# Verify semantic logging
grep -rn "\[SEMANTIC-" api/
```

**Note:** Don't create brittle CI gates. These checks guide review, not block merges automatically.

---

## PR Checklist for Semantic Changes

When a PR modifies semantic/memory intelligence code:

- [ ] Verified existing methods via grep before creating new ones?
- [ ] Are keyword/regex patterns ONLY prefilters for trivial rejection?
- [ ] Do final decisions affecting importance/dedup/supersession use semantic methods?
- [ ] Is there `[SEMANTIC-*]` logging for semantic operations?
- [ ] Does retrieval demonstrate selectivity (not "inject everything")?
- [ ] Is there fallback behavior if embedding API fails?
- [ ] Does it align with Truth Map (verified runtime behavior)?
- [ ] If work deferred, is there follow-up issue with acceptance criteria?

---

## Log Prefix Reference

| Prefix | Usage |
|--------|-------|
| `[SEMANTIC-IMPORTANCE]` | Importance scoring |
| `[SEMANTIC-DEDUP]` | Deduplication |
| `[SEMANTIC-SUPERSESSION]` | Supersession analysis |
| `[SEMANTIC-TEMPORAL]` | Temporal reconciliation |
| `[SEMANTIC-TEMPORAL-DETECT]` | Temporal detection |
| `[SEMANTIC-INTENT]` | Intent classification |
| `[SEMANTIC-VISIBILITY]` | Memory visibility |

---

## Path Verification

**Paths in documentation are illustrative. Always verify current locations:**

```bash
find api/ memory_system/ -name "*.js" | head -20
ls -la api/core/intelligence/
```
