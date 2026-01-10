# PHASE 4: EXTERNAL TRUTH VALIDATION — Implementation Plan

**This document informs work but does not override CLAUDE.md policy.**

This is an engineering specification for Phase 4 implementation. It describes the target architecture for external truth validation.

---

## The Dual Hierarchy Breakthrough

**Two claim types require fundamentally different source hierarchies:**

| Claim Type | Hierarchy | Rationale |
|------------|-----------|-----------|
| **Business Policy** (Site Monkeys) | Vault → Memory → Docs → External | Your curated truth wins. External corroborates only. |
| **Objective Factual** (Reality) | External → Vault → Docs → Memory | Reality wins when freshness matters. |

**External sources CANNOT override founder-defined business rules.** This is non-negotiable.

---

## Truth Type Classification (Mandatory)

Every claim must be classified before retrieval/caching:

| Type | TTL | When to Use |
|------|-----|-------------|
| **VOLATILE** | 5 min | Prices, weather, breaking news, "current", "latest", "today" |
| **SEMI_STABLE** | 24 hr | Regulations, policies, "who is the CEO", product specs |
| **PERMANENT** | 30 days | Definitions, history, math, science, established facts |

**Two-stage detection:**
1. Stage 1: Deterministic pattern matching (zero tokens)
2. Stage 2: AI classifier (only if Stage 1 = AMBIGUOUS)

---

## External Lookup Triggers

External lookup is automatic for volatile/freshness/high-stakes content **unless the user explicitly opts out**.

**Trigger conditions (any one met):**
- Freshness markers: `current`, `latest`, `today`, `price`, `availability`
- High-stakes domain: medical, legal, financial, safety
- Low confidence (< 0.70) AND wrong answer would cause harm

**If user opts out of external lookup:**
- Disclose that verification wasn't performed
- Proceed with conservative guidance
- Label any claims as unverified

---

## Cost Constraints (Absolute Caps)

| Parameter | Limit |
|-----------|-------|
| Max external sources per query | 3 |
| Max fetched text per query | 15,000 chars |
| Max external lookups per request | 1 (2 only for conflicts/high-stakes) |
| Stage 1 detection | 0 tokens (deterministic only) |

---

## Provenance Tags (Required)

Every externally-supported claim must carry:
- `source_class`: external | vault | memory | docs
- `verified_at`: ISO timestamp
- `cache_valid_until`: ISO timestamp
- `truth_type`: VOLATILE | SEMI_STABLE | PERMANENT
- `confidence`: 0.0–1.0

---

## Failure Handling (Graceful Degradation)

When external lookup fails:
1. **DISCLOSE:** "I couldn't verify current information from external sources."
2. **PROVIDE:** Best internal answer WITH explicit labels
3. **PATH:** "You can verify at [authoritative source URL]"

**Never bluff. Never hide lookup failure.**

---

## Implementation Files

Target location: `/api/core/intelligence/`

| File | Purpose | Order |
|------|---------|-------|
| `truthTypeDetector.js` | Foundation - classify truth types | 1st |
| `ttlCacheManager.js` | Cache with TTL management | 2nd |
| `hierarchyRouter.js` | Route to correct source hierarchy | 3rd |
| `externalLookupEngine.js` | External verification | 4th |

**Note:** Verify actual file locations exist before implementing. These are target paths, not claims about current state.

---

## Test Requirements

- Every component ships with console-testable endpoint under `/api/test-semantic`
- No merge without proof outputs
- Telemetry required: `truth_type`, `source_class`, `verified_at`, `cache_valid_until`, `conflict_detected`, `cost_tokens`

---

## Critical Phase 4 Rule

**Measured ≠ Enforced.** Phase 4 measures truth behavior. Phase 5 enforces it. Do not collapse these phases.

---

*This document informs work but does not override CLAUDE.md policy.*
