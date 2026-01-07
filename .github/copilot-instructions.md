# Copilot & Claude Code Instructions for sitemonkeys-ai-system

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

## INVESTIGATION REQUIRED BEFORE FIXING

**STOP. Before writing ANY code, you must answer these questions.**

Do not proceed to implementation until you can answer all of these in your commit message or PR description.

### 1. Root Cause Analysis
For each problem identified:
- Where exactly does this behavior originate? (file:function:line)
- What is the current logic flow? (A calls B which returns C because D)
- Why does the current logic produce the wrong result?
- What specific change will fix the ROOT CAUSE, not the symptom?

### 2. Data Flow Trace
Trace the complete path from input to incorrect output:
```
User query → [what happens here?] → [then here?] → [wrong result]
```
Identify the EXACT point where the logic diverges from expected behavior.

### 3. Verification Plan
Before implementing, state:
- How will you verify the fix works?
- What test cases should pass after the fix?
- What could this fix accidentally break?

### 4. Completeness Check
- Are there other places in the codebase with the same pattern/problem?
- Does fixing this require changes in multiple files?
- List ALL files that need modification, not just the obvious ones.

---

## IMPLEMENTATION RULES

1. **NO surface-level fixes** - Adding keywords to a list without understanding WHY the list isn't working is not a fix.

2. **NO "phase 2" promises** - Everything identified must be addressed in this PR. Do not leave incomplete work.

3. **TRACE before you CHANGE** - If you can't explain the current logic flow, you don't understand the problem well enough to fix it.

4. **ROOT CAUSE over SYMPTOM** - If the symptom is "wrong category assigned," the fix isn't "add more categories" - it's finding WHERE and WHY the wrong assignment happens.

5. **COMPLETE, not incremental** - The pattern of fixing one thing and saying "other things need to happen" is not acceptable. Fix everything or document exactly why something cannot be fixed in this PR.

---

## Project Structure

- `/api/core/orchestrator.js` - Main request coordinator that handles all chat requests
- `/api/core/intelligence/` - Semantic analysis, truth detection, reasoning enforcement
- `/memory_system/core.js` - Memory storage and retrieval system
- `/memory_system/persistent_memory.js` - Database operations for memory
- `/api/core/personalities/` - Eli and Roxy personality frameworks
- `/api/lib/` - Utility functions, guardrails, validators, enforcement modules
- `/server.js` - Main server entry point and initialization
- Railway deployment platform (auto-deploys from main branch)
- PostgreSQL database for persistent memory storage

---

## Key Architecture Patterns

- **ESM imports only** - Use `import/export`, never `require()`
- **Memory system imports** - Always import from `/memory_system/core.js` or `/memory_system/persistent_memory.js`
- **Orchestrator pattern** - All modules communicate through orchestrator, never directly
- **Async/await** - All database operations must be async
- **Error handling** - Always handle errors gracefully, log but don't crash
- **Initialization order** - Memory system must initialize before orchestrator
- **Token efficiency** - Every token must earn its existence. Do not add unnecessary logging or bloat.

---

## The Doctrines (Reference for All Work)

When making changes, ensure they align with these doctrines:

**Opportunity Doctrine:** "Uncertainty is a reason to work harder, not permission to stop."
- Never default to fallbacks when the system should be reasoning

**Genuine Intelligence Doctrine:** "Not rule-following. Real reasoning under constraints."
- Pattern matching to defaults is warehouse worker behavior
- Understanding the problem before acting is CEO behavior

**Injection Doctrine:** "Only inject what is relevant, bounded, labeled, and worth its cost."
- MUST trigger external lookup when truth_type is VOLATILE

**Memory & Intelligence Doctrine:** "Categorization → Intelligent Storage → Contextual Retrieval"
- Wrong categorization = degraded retrieval over time
- Category assignment must be intelligent, not defaulted

**Token Efficiency Doctrine:** "Every token must earn its existence."
- No unnecessary logging verbosity
- No bloated implementations
- Prefer deterministic improvements over AI-based classification where possible

---

## Common Issues to Avoid

- **Import paths** - Must use exact file locations, check if file exists first
- **Memory availability** - Memory system must return `available: true` after initialization
- **Database connection** - Ensure PostgreSQL connection works before memory operations
- **Circular dependencies** - Modules should not import each other directly
- **Silent errors** - Never swallow errors without logging
- **Surface-level fixes** - Adding keywords without understanding root cause
- **Incomplete PRs** - Leaving work for "phase 2" or "future cleanup"
- **Symptom-chasing** - Fixing what you see without tracing WHY it happens

---

## Coding Standards

- Log all major operations with descriptive messages: `console.log('[MODULE] Operation description')`
- Use try-catch blocks for all database operations
- Return structured objects: `{ success: boolean, data?: any, error?: string }`
- Store conversations after each response (user message + AI response)
- Retrieve memories at start of each request
- Follow existing patterns in the codebase - don't introduce new conventions

---

## Testing Requirements

- Test memory storage: Send message, verify it's stored in database
- Test memory retrieval: Send message with name, ask for name, should remember
- Test error handling: Ensure graceful degradation when modules fail
- Check Railway logs for errors after deployment
- Verify success criteria stated in the issue before marking complete

---

## Deployment Notes

- Railway auto-deploys on merge to main
- Deployment takes ~2 minutes
- Check Railway logs after deploy: `[ORCHESTRATOR] [MEMORY]` for memory operations
- Database connection string in `DATABASE_URL` environment variable

---

## PR Quality Checklist

Before submitting a PR, verify:

- [ ] Root cause identified and documented
- [ ] Data flow traced from input to output
- [ ] All related issues addressed (not just the obvious one)
- [ ] No "phase 2" or "future work" items left behind
- [ ] Changes align with the doctrines above
- [ ] Token efficiency maintained (no bloat)
- [ ] Success criteria from the issue would pass
- [ ] No regressions to existing functionality
