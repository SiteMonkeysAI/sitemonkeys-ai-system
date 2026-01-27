# Claude Instructions for sitemonkeys-ai-system

## Authority & Override Rules

This document provides instructions for Claude when working on this repository. It overrides default behaviors within this repo but does NOT override platform security policies or external system constraints.

**If runtime behavior (logs, tests) and this document disagree, runtime behavior wins until this document is updated with evidence.**

---

## THE BIBLE: Core Behavioral Contract

This is a **truth-first AI system**. Before doing ANY work, understand this foundational principle:

### The Priority Stack

```
TRUTH > HELPFULNESS > ENGAGEMENT
```

This is non-negotiable. Every decision must honor this hierarchy.

### The Caring Family Member Model

The system should think like **the smartest, most caring person you know** — someone who:

- Tells you the truth because they respect you
- Works harder when problems get harder
- Sees what you might miss
- Never wastes your time
- Remembers what you've told them
- Does simple math without being asked
- Asks "which one?" when there's ambiguity
- Acknowledges complexity when facts create tension
- Maintains principles under pressure

**Apply this same standard to your own work on this codebase.**

### The Core Invariant

```
OLD (Warehouse Worker): "I can't be certain, therefore I should stop."
NEW (CEO): "I can't be certain, therefore I must reason carefully and transparently."
```

**Uncertainty must increase effort, not reduce it.**

---

## INVESTIGATION REQUIRED BEFORE ANY CODE CHANGES

**STOP. Before writing ANY code, you must complete these steps.**

### 1. Root Cause Analysis

Answer these questions:
- Where exactly does this behavior originate? (file:function:line)
- What is the current logic flow?
- Why does the current logic produce the wrong result?
- What specific change will fix the ROOT CAUSE, not the symptom?

### 2. Data Flow Trace

For memory/retrieval issues, trace the complete flow:

```
User message 
  → Storage (intelligent-storage.js)
    → Database (persistent_memories)
      → Retrieval (semantic-retrieval.js)
        → Prompt Assembly (ai-processors.js)
          → AI Response
```

At each step, verify:
- Did the data arrive correctly?
- Did the data leave correctly?
- If not, where exactly did it break?

### 3. Evidence Collection

Use logs to verify your understanding:
- `[EXTRACTION-DEBUG]` — What was extracted from the user message?
- `[STORAGE-DEBUG]` — What was stored?
- `[USER-ISOLATION]` — How many memories were retrieved?
- `[PROMPT-DEBUG]` — What memory context was sent to the AI?
- Response — What did the AI actually say?

### 4. Verification Plan

Before implementing:
- How will you verify the fix works?
- What test cases should pass?
- What could this fix accidentally break?

---

## THE 53 INNOVATIONS

This system has 53 proprietary innovations across 10 categories. Key ones relevant to most fixes:

### Category A: Memory Architecture
1. **Persistent Long-Term Memory** — 3-6M token capacity
2. **Semantic De-Duplication** — Consolidates similar facts
3. **Supersession Logic** — New facts replace old (latest wins)
4. **Meaning-Preserving Compression** — Compress without losing meaning
7. **Memory Importance Scoring** — Prioritizes critical memories

### Category B: Injection/Retrieval
8. **Semantic + Mode-Aware Indexing** — Finds memories by meaning
9. **Token-Efficient Retrieval** — Stays within budget
12. **Contextual Relevance Ranking** — Best matches first

### Category C: Truth & Integrity
14. **Reasoning-Based Confidence Engine** — Knows what it knows
17. **Hallucination Containment** — Never makes things up

### Category E: Personality
23. **Dual-Personality Framework** — Eli (analytical) and Roxy (empathetic)
26. **Behavioral Integrity Guard** — Personalities stay consistent

---

## KEY FILES & THEIR PURPOSES

**Always verify current locations with grep before assuming paths are correct.**

### Memory Storage
- `api/memory/intelligent-storage.js` — Stores memories with semantic analysis
  - Handles explicit memory requests ("remember this exactly")
  - Extracts facts from conversations
  - Manages supersession (new facts replace old)

### Memory Retrieval
- `api/services/semantic-retrieval.js` — Retrieves relevant memories
  - Generates embeddings for semantic search
  - Applies ranking and boosting
  - Handles ordinals (first, second, etc.)
  - Applies explicit memory boost (+0.70)

### Prompt Assembly
- `api/lib/ai-processors.js` — Builds prompts for Eli and Roxy
  - Injects memory context into system prompt
  - Contains the "caring family member" instructions

### Orchestration
- `api/core/orchestrator.js` — Coordinates the entire flow
  - Routes requests through phases
  - Manages AI routing (GPT-4 primary, Claude escalation)

### Semantic Analysis
- `api/core/intelligence/semantic_analyzer.js` — Semantic intelligence
  - Generates embeddings
  - Calculates similarity
  - Analyzes intent and importance

---

## SEMANTIC INTELLIGENCE REQUIREMENTS

### Core Principle

> "Genuine Intelligence Doctrine: Not rule-following. Real reasoning under constraints."

Final decisions affecting importance, deduplication, supersession, or ranking **MUST** use semantic methods (embeddings, AI reasoning), not keyword arrays or pattern matching alone.

### Allowed Pattern

```
1. Cheap deterministic prefilter (regex, patterns)
   → Quick rejection of obviously non-matching content
   → Reduces embedding API calls

2. Semantic confirmation (embeddings, AI reasoning)
   → Final decision on candidates that pass prefilter
   → Provides the actual intelligence
```

### Anti-Patterns (Never Do These)

```javascript
// ❌ WRONG - keyword array as final decision
const isImportant = KEYWORDS.some(k => content.includes(k));
return { important: isImportant };

// ❌ WRONG - "inject everything" strategy
const memories = await getAllMemories(userId); // No selectivity
return memories;
```

### Correct Pattern

```javascript
// ✅ RIGHT - prefilter forwards to semantic for real decisions
const candidates = await getCandidates(query);
const ranked = await semanticAnalyzer.rankBySimilarity(candidates, query);
return ranked.slice(0, MAX_MEMORIES);
```

---

## TEST SUITES

The system has two test suites that must pass:

### SMFULL (24 tests) — Core Functionality
- A1-A5: Memory Architecture
- B1-B3: Injection/Retrieval
- C1-C2: Truth & Integrity
- D1-D2: Vault/Mode System
- E1-E2: Personality System
- F1-F3: Governance
- G1-G3: Infrastructure
- J1-J4: Advanced Intelligence

### SMDEEP (15 tests) — Deep Intelligence
- INF1-INF3: Inference & Reasoning
- NUA1-NUA2: Nuance & Ambiguity
- STR1-STR2: Memory Under Stress
- CMP1-CMP2: Compression Fidelity
- TRU1-TRU3: Truth Resistance
- EDG1-EDG3: Edge Cases

### Success Criteria

```
SMFULL: 24/24
SMDEEP: 15/15
TOTAL: 39/39
```

**Do not close issues until all relevant tests pass.**

---

## WHAT EACH INTELLIGENCE TEST REQUIRES

### Inference (INF1, INF2, INF3)
The AI must **make reasonable inferences** from stored facts:
- INF1: "Emma started kindergarten" → infer ~5-6 years old
- INF3: "Worked 5 years" + "Left in 2020" → calculate started ~2015

A caring family member would do this math naturally.

### Nuance (NUA1, NUA2)
The AI must **recognize complexity**:
- NUA1: Two people named "Alex" → ask "which Alex?"
- NUA2: "Allergic to cats" + "Wife loves cats" → acknowledge tension

A caring family member would notice these conflicts.

### Volume Stress (STR1)
The AI must **find specific facts among many**:
- Store 10 facts, ask about one specific one
- The AI must read ALL memories and find the right one

A caring family member doesn't forget your car just because you also told them about your dog.

### Truth Resistance (TRU1, TRU2, TRU3)
The AI must **maintain principles under pressure**:
- TRU1: Refuse, then maintain refusal when pushed
- TRU2: Resist manipulation for false certainty
- TRU3: Be honest about limitations, not flattering

A caring family member tells you hard truths.

### Ordinal Sensitivity (B3)
The AI must **respect ordinal qualifiers**:
- "First code is CHARLIE, second is DELTA"
- "What is my first code?" → CHARLIE (not DELTA)

---

## IMPLEMENTATION RULES

### DO:
- ✅ TRACE the complete flow before changing anything
- ✅ Use logs and evidence to verify your understanding
- ✅ Fix ROOT CAUSES, not symptoms
- ✅ Use existing semantic_analyzer.js methods where they exist
- ✅ Keep prompt changes MINIMAL (under 10 lines)
- ✅ Add appropriate `[SEMANTIC-*]` logging for semantic operations
- ✅ Test your changes against the failing tests

### DO NOT:
- ❌ Add hundreds of lines of "emphatic" instructions
- ❌ Use 🚫 FORBIDDEN and ✅ REQUIRED markers in prompts
- ❌ Add checklists or excessive emphasis to prompts
- ❌ Assume all failures are prompt issues (many are retrieval bugs)
- ❌ Make changes without understanding the current logic flow
- ❌ Create keyword arrays as final semantic decisions
- ❌ Use "inject everything" retrieval strategies

---

## COMMON FAILURE PATTERNS & FIXES

### Pattern 1: Memory Not Retrieved

**Symptom:** AI says "I don't have information" but user stored it

**Diagnosis:**
```bash
# Check if stored
SELECT * FROM persistent_memories WHERE user_id = 'xxx' AND content LIKE '%keyword%';

# Check retrieval logs
[USER-ISOLATION] Retrieved X candidates
```

**Likely Causes:**
- Embedding not generated (async lag)
- Similarity score too low
- Memory cap excluding it
- Mode mismatch

**Fix Location:** `semantic-retrieval.js`

### Pattern 2: Wrong Memory Retrieved

**Symptom:** AI returns wrong fact (e.g., CHARLIE instead of DELTA)

**Diagnosis:**
```bash
# Check ranking logs
[TRACE-T3] Final ranked memories
[KEYWORD-BOOST] Memory XXX
```

**Likely Causes:**
- Ordinal not detected in query
- Wrong memory ranked higher
- Boost logic incorrect

**Fix Location:** `semantic-retrieval.js` (ranking/boosting logic)

### Pattern 3: Memory Retrieved But AI Ignores It

**Symptom:** `[PROMPT-DEBUG]` shows memory in context, but AI doesn't use it

**Diagnosis:**
```bash
[PROMPT-DEBUG] Memory context present: true
[PROMPT-DEBUG] Memory context length: XXX chars
```

**Likely Causes:**
- Prompt instructions unclear
- Memory context buried in noise
- AI not following instructions

**Fix Location:** `ai-processors.js` (prompt wording)

### Pattern 4: AI Won't Reason/Calculate

**Symptom:** AI has facts but won't infer (e.g., won't calculate 2020-5=2015)

**Diagnosis:** Memory is in context, AI just refuses to reason

**Likely Cause:** Prompt doesn't encourage inference

**Fix Location:** `ai-processors.js` (add minimal instruction to reason from facts)

---

## PR QUALITY CHECKLIST

Before submitting any PR:

- [ ] Root cause identified and documented
- [ ] Data flow traced with evidence
- [ ] Verified existing methods before creating new ones
- [ ] Semantic decisions use semantic methods
- [ ] Prompt changes are minimal (under 10 lines)
- [ ] Added appropriate logging
- [ ] Tested against failing test cases
- [ ] No regressions to passing tests
- [ ] Aligns with Bible principles (Truth > Helpfulness > Engagement)

---

## THE STANDARD

From the Bible:

> "A caring family member remembers what you tell them, does simple math, recognizes ambiguity, acknowledges tension, finds your fact among many, and maintains principles under pressure."

The system must do this naturally — through proper architecture and genuine intelligence, not through shouting in the prompt.

**Make it work. Make it right. Make it complete.**
