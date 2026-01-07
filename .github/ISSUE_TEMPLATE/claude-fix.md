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
<!-- Paste relevant logs, error messages, or test results that demonstrate the problem -->
```
[paste logs here]
```

## Expected Behavior
<!-- What SHOULD happen according to the Bible/Doctrines -->


## Actual Behavior
<!-- What IS happening -->


---

## INVESTIGATION REQUIREMENTS

**Claude Code / Copilot: You MUST complete this section before writing any fix code.**

### 1. Root Cause Analysis
For each problem identified above, answer:
- [ ] Where exactly does this behavior originate? (file:function:line)
- [ ] What is the current logic flow?
- [ ] Why does the current logic produce the wrong result?
- [ ] What specific change will fix the ROOT CAUSE, not the symptom?

### 2. Data Flow Trace
Trace the complete path:
```
User input → [step 1] → [step 2] → [step 3] → Wrong output
                              ↑
                    [Identify where it breaks]
```

### 3. Files That Need Modification
List ALL files (not just the obvious ones):
- [ ] File 1: reason
- [ ] File 2: reason
- [ ] (add more as needed)

### 4. Verification Plan
- [ ] What test cases should pass after the fix?
- [ ] What could this fix accidentally break?

---

## SUCCESS CRITERIA
<!-- What must be true for this issue to be considered complete -->

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] No regressions to existing functionality
- [ ] No "phase 2" items left behind

---

## DOCTRINE REFERENCE

**Core Invariant:** Uncertainty must increase effort, not reduce it.

**Opportunity Doctrine:** "Uncertainty is a reason to work harder, not permission to stop."

**Genuine Intelligence Doctrine:** "Not rule-following. Real reasoning under constraints."

**Token Efficiency Doctrine:** "Every token must earn its existence."

---

## IMPLEMENTATION RULES

1. **NO surface-level fixes** - Understand WHY before changing anything
2. **NO "phase 2" promises** - Complete everything in this PR
3. **TRACE before you CHANGE** - Document the logic flow before implementing
4. **ROOT CAUSE over SYMPTOM** - Find where the problem originates, don't patch the output
5. **COMPLETE the investigation section above** - Do not skip it
```

---

**Why this helps:**

1. **Checkboxes force completion** - Claude/Copilot sees unchecked boxes and knows work remains

2. **Investigation section is IN the issue** - Not a separate file they might ignore

3. **Structure prevents shortcuts** - Can't just jump to "add keywords to list" without explaining the root cause first

4. **Success criteria are explicit** - Clear definition of done

5. **Doctrine reminder is present** - The Bible principles are right there

---

**To create it:**
```
mkdir -p .github/ISSUE_TEMPLATE
