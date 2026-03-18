# TOKEN EFFICIENCY AUDIT: SITE MONKEYS AI
**Date:** 2026-03-18  
**Auditor:** Automated codebase analysis  
**Scope:** Full codebase — `api/core/orchestrator.js`, `api/core/intelligence/`, `api/memory/`, `api/services/`, `api/lib/`  
**Status:** READ-ONLY — No code changes made

---

## Baseline Context

Production data (from problem statement):
- Simple memory recall query: ~3,300 tokens, $0.034 (GPT-4)
- Complex external lookup query: ~5,600 tokens, $0.062 (GPT-4)
- Memory compression: GPT-4o-mini ✅ correct
- All other AI calls: GPT-4

Current savings vs naive GPT-4: **65–75%**  
Audit goal: Identify further savings without compromising intelligence, truth enforcement, or memory quality.

---

## Request Processing Architecture (Verified)

The following occurs on every `processRequest` call in `api/core/orchestrator.js`:

```
STEP 0:    analyzeIntent(msg)             → embedding call #1  [SemanticAnalyzer, memory visibility]
STEP 0.5:  classifyQueryComplexity(msg)   → embedding call #2  [QueryComplexityClassifier, EARLY]
STEP 1:    retrieveSemanticMemories()     → embedding call #3  [EmbeddingService, memory retrieval]
STEP 3.5:  detectTruthType(msg)           → deterministic only (zero tokens) ✅
STEP 5:    analyzeSemantics(msg)          → embedding calls #4+ [SemanticAnalyzer, full analysis]
STEP 6.4:  classifyQueryComplexity(msg)   → embedding call #5  [QueryComplexityClassifier, FULL]
STEP 6.8:  applyPrincipleBasedReasoning() → no AI call (deterministic text) ✅
STEP AI:   GPT-4 or Claude Sonnet 4.5    → main generation call
```

Each embedding is `text-embedding-3-small` at $0.00002/1K tokens (near-zero cost individually but adds latency).

---

## CATEGORY 1: PRE-AI SHORTCUT OPPORTUNITIES

### Finding 1-A: Memory Recall Queries with High-Confidence Exact Matches

**Pattern:** User asks for a fact they previously told the system, the fact is stored verbatim in persistent memory, semantic retrieval returns a single high-confidence result (similarity > 0.90), and GPT-4 is invoked solely to format a one-sentence answer.

**Example queries:**
- "What's my name?"
- "What's my daughter's name?"
- "What code did you give me?"
- "What's my email?"
- "What job do I have?"

**Where routing happens:** `api/core/orchestrator.js` → `#routeToAI()` (line ~3937). No shortcut exists here — all queries reach the AI regardless of memory confidence.

**What would be needed:**
- Confidence threshold: semantic retrieval `topResult.score > 0.90` AND single unambiguous match
- Safety check: query contains personal pronoun (my, I, me) AND no calculation/comparison required
- Risk of getting it wrong: returns the wrong memory fact to user with no LLM sanity check

**Estimated % of total queries:** 8–15% of users with established memory profiles

**Estimated savings potential:** 8–12%  
**Risk:** MEDIUM — Requires reliable confidence calibration. A false shortcut returns wrong personal facts without LLM correction.

---

### Finding 1-B: Greeting Responses Still Reach GPT-4

**Pattern:** "Hi", "Hello", "Hey there", "Good morning" are detected as greetings by `classifyQueryComplexity` (STEP 0.5). Memory retrieval is skipped for pure greetings when confidence > 0.70 and `hasPersonalIntent = false`. However, **GPT-4 is still called** to generate the greeting response.

**Where routing happens:** `api/core/orchestrator.js` line ~978. The skip is only for memory — the AI call is not skipped.

**Current system prompt injection for greetings** (line ~5055):
```
IMPORTANT - GREETING DETECTED:
Respond warmly and concisely in ONE LINE. Maximum response length: 100 characters.
Example: "Hello! How can I help you today?"
```

GPT-4 is used to produce a response that is essentially deterministic: ~100 characters, no reasoning, no knowledge.

**Estimated % of total queries:** 3–7% (greetings/closings)

**Estimated savings potential:** 3–5%  
**Risk:** LOW — A deterministic greeting template contains zero intelligence. Zero risk of truth/memory violation for pure greetings with no personal intent detected.

---

### Finding 1-C: Simple Math / Unit Conversion Still Reaches GPT-4

**Pattern:** Queries like "What is 15% of 340?" or "How many feet in a mile?" are classified as `PERMANENT` truth type by `truthTypeDetector.js` (deterministic, zero tokens). However, they still reach GPT-4 for response generation.

**Where routing happens:** `api/core/orchestrator.js` — `detectTruthType` result is stored in `phase4Metadata` but does not shortcut the AI call.

**What would be needed:**
- Intercept at the routing layer when `truth_type === 'PERMANENT'` AND `earlyClassification.classification === 'simple_factual'` AND query passes a safe-computation check
- Risk: Math edge cases, unit ambiguity

**Estimated % of total queries:** 2–4%

**Estimated savings potential:** 2–4%  
**Risk:** MEDIUM — Math is not always deterministic (ambiguous unit systems, floating point). GPT-4's sanity check has value.

---

**Category 1 Total Estimated Savings Potential: 10–18%**  
**Risk: MEDIUM for 1-A and 1-C, LOW for 1-B**

---

## CATEGORY 2: MODEL ROUTING ANALYSIS

### Complete AI Call Map

| Call | File / Function | Current Model | Purpose | Cheaper Candidate | Risk |
|------|----------------|---------------|---------|-------------------|------|
| Main response generation | `orchestrator.js` → `#routeToAI()` line ~4232/4280 | GPT-4 (default) or Claude Sonnet 4.5 (escalated) | Primary answer generation | GPT-4o-mini for simple queries | MEDIUM |
| Memory compression | `api/memory/intelligent-storage.js` line ~1525 | GPT-4o-mini ✅ | Compress user conversation into storable facts | N/A — already optimal | — |
| Supersession confirmation | `api/core/intelligence/semantic_analyzer.js` line ~882 | GPT-4o-mini ✅ | "Does new fact supersede old?" (yes/no, 10 tokens) | N/A — already optimal | — |
| Memory visibility intent | `orchestrator.js` STEP 0, via `semanticAnalyzer.analyzeIntent()` | text-embedding-3-small | Detect if user wants to see their stored memories | N/A (near-zero cost) | — |
| Early query classification | `orchestrator.js` STEP 0.5, via `classifyQueryComplexity()` | text-embedding-3-small | Classify as greeting/simple_factual/complex | N/A (near-zero cost) | — |
| Memory retrieval | `api/services/semantic-retrieval.js` via `retrieveSemanticMemories()` | text-embedding-3-small | Embed query for pgvector similarity search | N/A (near-zero cost) | — |
| Full semantic analysis | `orchestrator.js` STEP 5, via `semanticAnalyzer.analyzeSemantics()` | text-embedding-3-small | Intent/domain classification for routing | N/A (near-zero cost) | — |
| Full query classification | `orchestrator.js` STEP 6.4, via `classifyQueryComplexity()` | text-embedding-3-small | Post-phase4 complexity classification (second call) | Eliminate — see Finding 2-B | — |
| Store-time embeddings | `api/services/embedding-service.js` | text-embedding-3-small | Embed memories for future retrieval (async, non-blocking) | N/A — correct design | — |

---

### Finding 2-A: Claude Escalation Threshold Too Aggressive

**Current logic** (`orchestrator.js` lines ~3990–4005):
```javascript
if (confidence < 0.85 ||
    analysis.requiresExpertise ||
    (mode === 'business_validation' && analysis.complexity > 0.7)) {
  useClaude = true;
}
```

**Problem:** Confidence 0.85 is a very high threshold. Most non-trivial queries will have confidence below 0.85 (uncertainty is the default). This means the majority of non-greeting, non-simple queries will attempt Claude escalation — which is then paused waiting for user confirmation (unless vault, high-stakes, or payload-overflow).

The user confirmation flow (lines ~4016–4035) prevents unauthorized spend, but it adds a round-trip message for the user. If users routinely confirm Claude, those costs ($0.05–0.15 per call) quickly exceed GPT-4 costs ($0.01–0.03).

**GPT-4 pricing vs Claude Sonnet 4.5:** GPT-4 is $0.01/1K input + $0.03/1K output. Claude Sonnet 4.5 is $0.003/1K input + $0.015/1K output. **Claude is actually cheaper per token** — but only when the query genuinely needs 200K context. For standard 2–4K token queries, both produce similar real costs and Claude provides no advantage.

**Estimated savings potential:** 5–10% (by raising confidence threshold to 0.75 or scoping `requiresExpertise` more narrowly)  
**Risk:** MEDIUM — Requires benchmarking. Reducing Claude use may reduce response quality for genuinely complex queries.

---

### Finding 2-B: Duplicate Query Complexity Classification

**Current behavior:** `classifyQueryComplexity(message, ...)` is called **twice** per request:
- STEP 0.5 (line ~938): Early classification with minimal metadata
- STEP 6.4 (line ~1478): Full classification with complete `phase4Metadata`

Both calls embed the **same message**. The embedding cache in `QueryComplexityClassifier` (module-level `Map`) should deduplicate the embedding API cost between calls. However, the classification logic runs twice from scratch, and the first call's result is stored in `earlyClassification` while the second in `queryClassification`. The second call primarily adds `phase4Metadata` context but the classification model only uses the message embedding — `phase4Metadata` is used for post-classification annotations, not for the embedding itself.

**Estimated savings potential:** 1–2% latency reduction (no API cost, but 1 fewer async classification pass)  
**Risk:** LOW — Could merge the two calls with lazy metadata injection, but requires care to preserve the early-exit behavior.

---

### Finding 2-C: GPT-4o-mini Not Used for Simple Response Generation

**Observation:** GPT-4 is the default response model. For queries classified as `greeting` or `simple_factual`, the system still uses GPT-4 with a `max_tokens: 2000` cap, even though the actual output is constrained to 100–200 characters by the system prompt.

**What GPT-4o-mini benchmarks suggest:** For greeting responses and simple factual answers (definitions, calculations, single-fact recall), GPT-4o-mini performs comparably to GPT-4. Cost: GPT-4o-mini is ~20x cheaper than GPT-4.

**What would need to be benchmarked:** Truth-first enforcement, confidence calibration, and refusal maintenance at the GPT-4o-mini tier before deploying to production.

**Estimated savings potential:** 8–15% (if 30–40% of queries qualify as simple/greeting and route to mini)  
**Risk:** MEDIUM — Must be benchmarked for: (1) hallucination rate on memory recall, (2) engagement bait insertion, (3) refusal maintenance under pressure. Do not implement without benchmark evidence.

---

**Category 2 Total Estimated Savings Potential: 10–22%** (most requires benchmarking)

---

## CATEGORY 3: CONTEXT INJECTION AUDIT

### Finding 3-A: System Prompt Size

**Verified:** `#buildSystemPrompt()` (`orchestrator.js` line ~4989) generates a prompt string of approximately **2,800–3,500 tokens** on every request. This includes:

| Component | Approximate Tokens |
|-----------|-------------------|
| Core identity + anti-hallucination rules | ~400 |
| Capabilities disclosure block | ~100 |
| Bounded inference guidelines + examples | ~350 |
| Memory contamination warnings | ~250 |
| Uncertainty handling framework (4 numbered steps) | ~300 |
| Refusal maintenance doctrine | ~250 |
| Truth and certainty doctrine + examples | ~500 |
| Business success query pattern | ~200 |
| Mode-specific additions (business_validation / site_monkeys) | ~150 |
| Principle-based reasoning guidance (injected per request) | ~200–600 |

**Total system prompt: ~2,700–3,100 tokens per request** (confirmed against ~3,300 token total for simple memory recall queries where memory adds ~200–600 tokens).

**Observation:** The system prompt is fully rebuilt on every request via string interpolation. The static core (~2,100 tokens) could be cached as a string constant. Only the dynamic sections (query classification instructions, reasoning guidance, mode-specific additions) need to be appended per-request.

**Redundancy identified:** The system prompt contains the full `MEMORY FABRICATION` and `CROSS-TOPIC MEMORY CONTAMINATION` doctrines (two large blocks, ~250 tokens combined) even on requests where `hasMemoryContext = false`. These instructions are irrelevant when no memory is present.

**Estimated savings potential:** 3–5% (by conditionally injecting memory-specific doctrine only when memory is present)  
**Risk:** LOW — Static text removal has no intelligence impact when the condition is false.

---

### Finding 3-B: Reasoning Guidance Redundancy

**Observation:** `applyPrincipleBasedReasoning()` (`orchestrator.js` STEP 6.8) generates a `promptInjection` string injected into the system prompt. This guidance contains reasoning strategy instructions such as "HYPOTHESIS TESTING REQUIRED" or "CONNECTION VOLUNTEERING."

On ~60–70% of queries, this guidance is a short boilerplate block (~100–200 tokens) that provides minimal marginal value beyond what the base system prompt already establishes. Only for queries that trigger `HYPOTHESIS_EXPLORATION`, `MULTI_STEP_ANALYSIS`, or `DECISION_SUPPORT` strategies does the guidance add substantive unique instructions.

**Estimated savings potential:** 1–3%  
**Risk:** LOW — Trivial reasoning guidance blocks add output tokens in the system prompt with low per-query value.

---

### Finding 3-C: External Context Disclosure Instructions

**When external lookup succeeds** (`externalContext` string, line ~4097–4108), the injected block includes:
```
[VERIFIED EXTERNAL DATA — MANDATORY SOURCE]
IMPORTANT: The following data was JUST retrieved from live external sources...
```

When external lookup fails (`lookup_attempted` but no data returned), a separate disclosure block is injected (lines ~4157–4162). This is correct behavior and cannot be removed.

**When external lookup is not triggered at all** (deterministic for PERMANENT truth type with `external_lookup = false`), zero external context is injected. This is correct.

**Observation:** No redundancy in external context injection. The gating logic is sound.

**Estimated savings potential:** 0% — No change recommended.  
**Risk:** N/A

---

### Finding 3-D: Vault Context Injection Scope

**Current:** Vault content is capped at 9,000 tokens (`MAX_VAULT_TOKENS`, line ~3218). Intelligent section selection via `#selectRelevantVaultSections()` is applied when the vault has structured sections, reducing injection to only relevant content.

**Observation:** The vault section selection logic appears well-implemented. Vault content is only injected in `site_monkeys` mode and auto-routes to Claude (200K context). No redundancy identified.

**Estimated savings potential:** 0% — Already optimized via section selection.  
**Risk:** N/A

---

### Finding 3-E: Document Context Injection Gating

**Current:** Document context (up to 3,000 tokens) is only injected when one of these is true:
- Query contains document keywords (`document`, `file`, `pdf`, `upload`, etc.)
- Classifier returns `document_review`
- Query contains document verbs (`summarize`, `analyze`, `review`, etc.)
- Pronoun reference to uploaded content
- Document was uploaded within the last 90 seconds

**Observation:** The gating logic is correct and prevents document context waste on unrelated queries. No redundancy identified.

**Estimated savings potential:** 0% — Already well-gated.  
**Risk:** N/A

---

**Category 3 Total Estimated Savings Potential: 4–8%**

---

## CATEGORY 4: OUTPUT TOKEN ANALYSIS

### Finding 4-A: `max_tokens: 2000` Applied Uniformly

**Current configuration** (`orchestrator.js` lines ~4233/4281–4284):
```javascript
// Claude path:
{ model: "claude-sonnet-4-20250514", max_tokens: 2000, ... }

// GPT-4 path:
{ model: "gpt-4", max_tokens: 2000, temperature: 0.7, ... }
```

A uniform 2,000 output token cap is applied regardless of query type. The query classification system detects greetings (100 char limit) and simple queries (200 char limit) via system prompt instructions — but these limits are **enforced by the model instructions, not by `max_tokens`**. The API is told to reserve 2,000 output tokens whether the response will be 50 tokens or 1,500 tokens.

**Impact on token counting:** OpenAI bills for actual output tokens consumed, not for `max_tokens`. So this is not a direct cost issue. However, it does affect model routing: the pre-flight check reserves 2,000 output tokens from the context budget (`reservedOutput: 2000`), which reduces the available input budget for GPT-4 from 8,192 to 6,192. Reducing `max_tokens` for known-simple queries would increase the input budget, potentially avoiding Claude escalation for slightly over-budget requests.

**Estimated savings potential:** 2–4% (reduced Claude escalations for marginally over-budget queries if `max_tokens` set dynamically by query type)  
**Risk:** LOW — Dynamic `max_tokens` is a well-understood optimization.

---

### Finding 4-B: Post-Processing Validators Add No Output Tokens

**Verified:** The 9-validator enforcement chain (`#runEnforcementChain()`, lines ~182–660) operates on the **already-generated** response string. It modifies, trims, or rejects content but does not append tokens to the final response delivered to the user.

The response enhancer (`api/services/response-enhancer.js`) similarly operates post-generation. It may add caveats, blind spots, or uncertainty structure — but these are only triggered when doctrine gates fail (response does not meet truth-first criteria).

**Engagement bait removal** (lines ~2053–2088): Removes sentences containing engagement bait patterns. This **reduces** output tokens, not increases them.

**Estimated savings potential:** 0% — Validators are output-reducing, not output-adding.  
**Risk:** N/A

---

### Finding 4-C: Principle-Based Reasoning Guidance Adds ~200–600 Input Tokens Per Request

**Verified:** `context.reasoningGuidance` (from `applyPrincipleBasedReasoning`) is injected into the system prompt on every request via `#buildSystemPrompt()` line ~5192. This adds ~200–600 tokens to the input context that tell the AI **how to reason** for this specific query.

**Observation:** For queries with `FACTUAL_LOOKUP` or `SHALLOW` reasoning depth, the guidance is minimal and the same structure could be covered by the base system prompt. The reasoning guidance adds unique value primarily for `HYPOTHESIS_EXPLORATION`, `DECISION_SUPPORT`, and `MULTI_STEP_ANALYSIS` strategies.

**Estimated savings potential:** 2–4% (suppress guidance injection for simple/factual queries)  
**Risk:** LOW to MEDIUM — The reasoning layer is part of the truth-first architecture. Suppression should only apply to deterministically simple queries.

---

**Category 4 Total Estimated Savings Potential: 4–8%**

---

## CATEGORY 5: CACHING OPPORTUNITIES

### What Is Currently Cached

| Cache | Location | Type | Scope |
|-------|----------|------|-------|
| Embedding cache | `SemanticAnalyzer` (constructor, `this.embeddingCache`) | In-memory Map (max 500 entries) | Process lifetime, per-instance |
| Embedding cache | `QueryComplexityClassifier` (`embeddingCache` module-level Map) | In-memory Map (no size limit) | Process lifetime |
| Pre-computed category embeddings | `SemanticAnalyzer.initialize()` | In-memory object | Process lifetime, one-time |
| TTL cache (external lookup results) | `api/core/intelligence/ttlCacheManager.js` | In-memory Map | VOLATILE: 5min, SEMI_STABLE: 24hr, PERMANENT: 30 days |
| Session document token tracking | `orchestrator.sessionCache` | In-memory Map | Session lifetime |

### Finding 5-A: No Response-Level Cache for Identical Queries

**Observation:** Identical queries from the same user with the same memory state produce full GPT-4 calls on every request. There is no response deduplication or response cache.

**Safe caching candidates** (PERMANENT truth type, no memory injection, low personalisation):
- "What is the speed of light?" → PERMANENT, same answer every time
- "Define photosynthesis" → PERMANENT, same answer every time
- "What is 15% of 200?" → PERMANENT, deterministic

**What should NOT be cached:**
- Any query with memory injection (personalised by definition)
- Any VOLATILE truth type
- Any SEMI_STABLE truth type where the answer may change
- Queries with document or vault context
- Business validation mode queries

**Estimated % of queries that could benefit:** 5–10% (pure factual, no context, PERMANENT type)  
**Estimated savings potential:** 5–10%  
**Risk:** LOW for PERMANENT + no-memory-context queries, HIGH for anything involving personal context.

---

### Finding 5-B: QueryComplexityClassifier Cache Has No Size Limit

**Observation:** The module-level `embeddingCache` Map in `queryComplexityClassifier.js` has no maximum size (unlike `SemanticAnalyzer`'s 500-entry limit). In a long-running process with high query volume and diverse queries, this cache could grow unboundedly. The individual embeddings are small (~6KB each for 1536-dimensional float32), but 10,000 unique queries × 6KB ≈ 60MB. This is a memory leak risk, not a token cost risk.

**Estimated savings potential:** 0% for token cost — but relevant to operational stability at scale.  
**Risk:** LOW (memory leak, not cost issue).

---

### Finding 5-C: System Prompt Not Cached

**Observation:** `#buildSystemPrompt()` is a pure string construction function (no API calls). Its ~2,100 token static core is rebuilt identically on every request. The dynamic portions (query classification instructions: ~50–150 tokens; reasoning guidance: ~200–600 tokens; mode additions: ~150 tokens) change per request.

**Optimization:** The static core (~2,100 tokens of string) could be computed once at initialization and stored. Per-request, only dynamic sections would be appended. This saves CPU/string concatenation time but **zero API tokens** — both paths produce the same prompt string that is billed identically by OpenAI.

**Estimated savings potential:** 0% API cost, minor latency improvement (< 5ms).  
**Risk:** N/A

---

**Category 5 Total Estimated Savings Potential: 5–10%** (response-level caching of PERMANENT queries only)

---

## CATEGORY 6: SESSION EFFICIENCY

### Finding 6-A: Conversation History Growth — Controlled

**Current behavior:** `conversationHistory.slice(-5)` is applied before including history in the AI messages array (`orchestrator.js` lines ~4204, ~4251). This caps the history included in any single API call at the last 5 exchanges.

**However:** The `conversationHistory` array is passed in from the client on every request (`requestData.conversationHistory`). The server does not cap the **incoming array size** before slicing — it applies `slice(-5)` only when building the messages array for the API. The server also uses `conversationHistory.slice(-3)` for follow-up detection and `slice(-maxTurns=3)` for topic extraction.

**Assessment:** The `.slice(-5)` cap is correctly enforced at the AI call boundary. History growth does not compound token costs on the server side. The client is responsible for managing history length in their request payload.

**Session document limit:** Hard capped at 30,000 total uploaded tokens per session (`SESSION_LIMITS.maxUploadedTokens`, line ~3064). Well-designed.

**Estimated savings potential:** 0% — Already well-controlled.  
**Risk:** N/A

---

### Finding 6-B: No Per-Request Context Fingerprinting

**Observation:** If a user asks the same question twice in a session (e.g., "What's my name?"), the system runs the full pipeline both times:
- 3–5 embedding calls
- Full memory retrieval (same memories returned)
- Full semantic analysis
- Full GPT-4 call
- Full enforcement chain

There is no within-session deduplication or result reuse for identical queries.

**Estimated savings potential:** 1–3% (duplicate queries are uncommon but non-zero in user testing scenarios)  
**Risk:** LOW for exact-match deduplication of within-session identical queries with the same memory state.

---

### Finding 6-C: Long Sessions Do Not Degrade Proportionally

**Assessment:** Since history is capped at slice(-5), long sessions do not compound token costs at the AI call layer. However, the TTL cache (external lookups) and embedding caches are in-memory and grow across all sessions since server start (not per-session). These are process-level caches, not session-level.

On high-traffic deployments, the process-level embedding caches would absorb repeated query costs well. On Railway with restarts, these caches reset — a cold start serves no benefit from previous session history.

**Estimated savings potential:** 0% — Architecture is sound for session efficiency.  
**Risk:** N/A

---

**Category 6 Total Estimated Savings Potential: 1–3%**

---

## SUMMARY

```
=== TOKEN EFFICIENCY AUDIT: SITE MONKEYS AI ===
Current efficiency: 65–75% savings vs naive GPT-4 implementations
```

### Estimated Addressable Efficiency Improvement: 15–35% reduction in remaining costs

Current costs are 25–35% of naive (65–75% already saved). The opportunities below would reduce those *remaining* costs by a further 15–35%, compounding with existing savings:

- Lower bound: 25% remaining × 15% reducible = 3.75% of naive → total ~68–79%
- Upper bound: 35% remaining × 35% reducible = 12.25% of naive → total ~77–87%

These are multiplicative (compound) reductions on the already-optimized baseline, not additive percentages on the naive total.

| Category | Estimated Reduction of Remaining Cost | Risk |
|----------|--------------------------------------|------|
| 1. Pre-AI Shortcuts | 10–18% of remaining | MEDIUM |
| 2. Model Routing | 10–22% of remaining (requires benchmarking) | MEDIUM |
| 3. Context Injection | 4–8% of remaining | LOW–MEDIUM |
| 4. Output Token Analysis | 4–8% of remaining | LOW–MEDIUM |
| 5. Caching Opportunities | 5–10% of remaining | LOW |
| 6. Session Efficiency | 1–3% of remaining | LOW |

*Note: Categories overlap (e.g., skipping GPT-4 for greetings in Cat 1 also addresses Cat 2). Non-overlapping addressable reduction estimated at 15–35% of current remaining costs.*

---

### Highest ROI / Lowest Risk Opportunities (Ranked)

1. **Response cache for PERMANENT truth-type + no-memory-context queries** *(Cat 5-A)*  
   Implementation: Add TTL cache lookup at `processRequest` entry before any embedding calls. Key = semantic fingerprint of query (reuse existing `ttlCacheManager.semanticFingerprint()`). Only cache when `truth_type === 'PERMANENT'` AND no memory context AND no vault AND no document. **Zero risk to truth enforcement.** Estimated savings: 5–10%.

2. **Deterministic greeting shortcut — bypass GPT-4** *(Cat 1-B)*  
   Implementation: When `earlyClassification.classification === 'greeting'` AND `hasPersonalIntent === false` AND `memoryContext.count === 0`, return a templated greeting without calling GPT-4. Savings: $0.034 per greeting query. Estimated frequency: 3–7%. **Near-zero risk.**

3. **Conditional system prompt — suppress memory doctrine when no memory present** *(Cat 3-A)*  
   Implementation: Move the `MEMORY FABRICATION` and `CROSS-TOPIC CONTAMINATION` instruction blocks to a conditional section that only appends when `hasMemoryContext === true`. Saves ~250 input tokens on queries without memory. Estimated savings: 3–5%. **No intelligence impact when memory is absent.**

4. **Suppress principle-based reasoning guidance for simple/factual queries** *(Cat 3-B / Cat 4-C)*  
   Implementation: Skip `context.reasoningGuidance` injection (and the `applyPrincipleBasedReasoning()` call itself) when `earlyClassification.classification` is `greeting` or `simple_factual` with confidence > 0.80. Saves ~200–400 input tokens and one async function call. Estimated savings: 2–4%.

5. **Dynamic `max_tokens` by query type** *(Cat 4-A)*  
   Implementation: When query is classified as `greeting` set `max_tokens: 150`, `simple_factual` set `max_tokens: 400`, standard set `max_tokens: 1500`, complex/vault set `max_tokens: 2000`. This widens the effective GPT-4 input budget and may reduce Claude escalations for borderline queries. Estimated savings: 2–4%.

---

### Opportunities Requiring Benchmarking Before Implementation

- **GPT-4o-mini for main response generation on simple queries** *(Cat 2-C)*  
  Must benchmark: hallucination rate on memory-recall queries, engagement bait frequency, refusal maintenance under pressure, confidence calibration. Potential savings: 8–15%. Do not implement without verified benchmark results showing parity on truth-first metrics.

- **Raise confidence threshold for Claude escalation from 0.85** *(Cat 2-A)*  
  Must benchmark: response quality difference at confidence 0.70–0.85 threshold bracket. Evaluate whether Claude is meaningfully better for queries in this range or whether GPT-4 produces equivalent truth-first results. Potential savings: 5–10%.

- **Memory recall shortcut (high-confidence exact match bypass)** *(Cat 1-A)*  
  Must benchmark: false-positive rate on memory confidence scores, test against deliberately ambiguous queries where the top-1 memory match is misleading. Potential savings: 8–12%.

---

### Opportunities NOT Recommended (Risk Too High)

- **Reduce memory retrieval threshold below current 0.20 minimum similarity** — Protected zone; do not adjust.
- **Bypass enforcement chain for any query type** — Protected zone; 9 validators enforce core truth-first guarantees.
- **Cache responses for VOLATILE or SEMI_STABLE truth types** — Stale answer risk is unacceptable. The TTL cache for external lookup data already handles this correctly.
- **Remove external context disclosure instruction on lookup failure** — Truth-first doctrine requires explicit disclosure when verification fails; removing this would be a doctrine violation.
- **Remove the user confirmation step for Claude escalation** — Cost control protection; removal would allow unbounded Claude spend without user consent.
- **Reduce `slice(-5)` conversation history limit** — Already minimal; reduction would harm coherence in multi-turn conversations.

---

*End of audit. No code was modified. All findings are read-only analysis based on static code review of the repository as of 2026-03-18.*
