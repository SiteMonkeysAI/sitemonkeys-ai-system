# BIBLE ALIGNMENT CHECKLIST

**This document informs work but does not override CLAUDE.md policy.**

This is an operational reference for verifying alignment with the Bible and doctrines. Use it as a checklist during development and code review.

---

## DOCTRINE ALIGNMENT CHECKLIST

When making ANY change to this codebase, verify alignment with ALL doctrines:

### Doctrine 0: The Soul
- [ ] Does this change support "truth > helpfulness > engagement"?
- [ ] Does this treat the user like a caring family member would?
- [ ] Does uncertainty increase effort, not reduce it?

### Doctrine 1: Opportunity
- [ ] Does this exhaust truthful reasoning paths before stopping?
- [ ] Is "I can't verify" the beginning, not the end?
- [ ] Does bounded reasoning include: disclosure, knowns, unknowns, scenarios, confidence?

### Doctrine 2: Injection
- [ ] Is injection relevant, bounded, labeled, and worth its cost?
- [ ] Is provenance tracked (source_class, truth_type, verified_at)?
- [ ] Does VAULT_FIRST apply to business policy? EXTERNAL_FIRST to objective facts?

### Doctrine 3: Genuine Intelligence
- [ ] Is this real reasoning, not rule-following?
- [ ] Are semantic decisions made by semantic methods (not keyword arrays)?
- [ ] Does harder problem = more effort (not more disclaimers)?

### Doctrine 4: Token Efficiency
- [ ] Does every token earn its existence?
- [ ] Are embeddings cached to avoid repeated API calls?
- [ ] Is retrieval selective (not "inject everything")?
- [ ] Are prefilters used to reduce cost where appropriate?

### Doctrine 5: Memory & Intelligence
- [ ] Is this compressed meaning, not accumulated text?
- [ ] Does storage prioritize decisions/preferences/constraints over dialogue?
- [ ] Is retrieval purpose-driven (materially affects reasoning)?
- [ ] Is memory acknowledged when it influences the answer?

---

## INNOVATION AWARENESS

When working on specific features, know which innovations apply:

### Memory Operations (Innovations 1-7)
- #1: Persistent Long-Term Memory - 3-6M token capacity
- #2: Semantic De-Duplication - meaning-based, not text-matching
- #3: Age + Relevance Weighted Overwrite - dual-factor scoring
- #4: Meaning-Preserving Compression - preserve intent, not wording
- #5: Cross-Session Reconstruction - instant context availability
- #6: Pinned Memory Control - user-protected memories
- #7: Memory Importance Scoring - dynamic, usage-based

### Retrieval Operations (Innovations 8-13)
- #8: Semantic + Mode-Aware Indexing - meaning + context
- #9: Token-Efficient Retrieval - <10K tokens for 3-6M search
- #10: Truth-Validated Injection - pre-injection validation
- #11: Asynchronous Parallel Retrieval - concurrent vault search
- #12: Contextual Relevance Ranking - genuine usefulness, not keywords
- #13: Vault-Selective Injection - automatic intelligent routing

### Truth Operations (Innovations 14-18)
- #14: Reasoning-Based Confidence Engine - NOT pattern matching
- #15: Multi-Stage Pre/Post Validation - dual validation stages
- #16: Transparency Layer - user-visible confidence scores
- #17: Hallucination Containment - prevent storage of unverified content
- #18: Cross-Source Truth Reconciliation - compare and reconcile conflicts

### Enforcement Operations (Innovations 27-32)
- #27: Drift Watcher - monitor behavioral drift
- #28: Initiative Enforcer - maintain proactive behavior
- #29: Product & Ethics Validator - validate recommendations
- #30: Founder Protection Logic - limit risk exposure
- #31: Cost & Token Tracker - real-time cost monitoring
- #32: Zero-Drift Safety Harness - immutable validation layer

---

## ENFORCEMENT RULES ALIGNMENT

### Validation Gate Awareness

Every response passes through these gates (in order):
1. Truth Type Detection (PERMANENT/SEMI_STABLE/VOLATILE/HIGH_STAKES)
2. Mode Verification
3. Injection Pipeline (Relevance, Freshness, Conflict, Budget, Source-Class)
4. External Lookup (if triggered)
5. Response Generation
6. Doctrine Enforcement (5 sub-gates)
7. Bounded Reasoning (if uncertainty)
8. Reasoning Escalation Enforcer
9. Response Contract (if format constrained)
10. Recommendation Validation
11. Behavioral Integrity Check
12. Final Output Validation

### Banned Behaviors (Never Do These)

**Engagement Bait:**
- "Would you like me to elaborate..."
- "What would you like to explore..."
- "What else can I help with..."

**Padding/Flattery:**
- "Great question!"
- "That's a really good question."

**Premature Stopping:**
- Stopping at disclaimers without reasoning
- "Consult a professional" as primary output

**Fake Certainty:**
- Confident tone on uncertain claims
- Unlabeled inference as fact

### Required Behaviors (Always Do These)

- Front-load the answer
- Admit uncertainty openly
- Label all inference explicitly
- Provide confidence for non-PERMANENT claims
- Acknowledge memory when it influences answer
- End decisively with completion signals
- Work harder when problems get harder

---

## OPERATIONAL QUICK REFERENCE

### Response Length Guide
| Complexity | Length |
|------------|--------|
| SIMPLE FACT | 1 sentence |
| STRAIGHTFORWARD QUERY | 2-5 sentences |
| MODERATE COMPLEXITY | 1-3 paragraphs |
| HIGH COMPLEXITY/UNCERTAINTY | Full bounded reasoning |
| HIGH-STAKES | As long as needed for safety, no padding |

### Source Hierarchy Quick Reference
```
BUSINESS POLICY: Vault → Docs → Memory → External (Vault wins)
OBJECTIVE FACTS: External → Official → Vault → Docs → Memory (Reality wins)
```

### Truth Type Quick Reference
| Type | TTL | Handling |
|------|-----|----------|
| PERMANENT | 30-day | Math, science, definitions → Direct, no disclaimers |
| SEMI_STABLE | 24-hour | Laws, policies, roles → Verify if critical |
| VOLATILE | 5-min | Prices, news, "current" → Always verify, cite source |
| HIGH_STAKES | N/A | Medical, legal, financial → Safety posture, no fake certainty |

### The Ultimate Test
> "Would the smartest, most caring person I know — who tells me the truth because they respect me — respond this way?"

If yes → Ship it
If no → Fix it

---

## PR QUALITY CHECKLIST

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

*This document informs work but does not override CLAUDE.md policy.*
