# Execution Proof Quick Reference

## 🎯 Goal
Prove which code actually executes (not just exists) after massive revert.

## 📝 Three Ways to Use

### 1. Quick Check (Real-time proof tracking)
```bash
node run-with-proofs.js diagnostic-tests-smdeep.js
```
Shows proofs as test runs + summary at end.

### 2. Full Analysis (Detailed report)
```bash
node diagnostic-tests-smdeep.js 2>&1 | tee output.log
node verify-execution-proofs.js < output.log
```
Complete verification with recommendations.

### 3. CI Integration (Automated verification)
```bash
npm test 2>&1 | node verify-execution-proofs.js
# Exit code 1 if proofs missing
```

## 🔍 What You'll See

### ✅ All Proofs Found (Good!)
```
✅ Semantic memory retrieval
✅ Ordinal enforcement (B3)
✅ Character preservation (CMP2)
...

✅ ALL expected proof lines found
```
**Action:** If tests still fail, investigate model/logic issues.

### ❌ Proofs Missing (Fix This First!)
```
✅ Semantic memory retrieval
❌ Character preservation (CMP2) - NOT FOUND
❌ Anchor preservation (EDG3) - NOT FOUND

⚠️  Missing proofs indicate:
   1. Code not wired into execution path
   2. Feature flags disabled
   3. Wrong import/module being used
```
**Action:** Fix wiring before investigating test failures.

## 🛠️ Common Fixes

### Missing Validator Proof
**Problem:** `❌ validator:character-preservation - NOT FOUND`

**Check:**
1. Import exists: `import { characterPreservationValidator } from "..."`
2. Validator called: `const result = await characterPreservationValidator.validate(...)`
3. Not wrapped in disabled try/catch
4. Feature flag enabled (if applicable)

### Missing Memory Proof
**Problem:** `❌ semantic-retrieval - NOT FOUND`

**Check:**
1. Test actually queries memory
2. Server is running (for API tests)
3. Database connected
4. Correct import path used

### Memory Retrieved but Empty
**Problem:** 
```
✅ semantic-retrieval
[PROOF] orchestrator:memory-injected count=0 ids=[]
```

**Check:**
1. User ID matches between storage and retrieval
2. Mode allows memory access
3. Embeddings completed (or fallback active)
4. Memory actually stored (check DB)

## 📊 Expected Proofs Per Test

### A5 (Explicit Memory)
- `semantic-retrieval`
- `orchestrator:memory-retrieval`
- `orchestrator:memory-injected` (count > 0)
- `storage:explicit-detect`

### B3 (Ordinals)
- `semantic-retrieval`
- `orchestrator:memory-injected` (count > 1)
- `validator:ordinal`

### INF3 (Temporal)
- `semantic-retrieval`
- `orchestrator:memory-injected` (count > 1)
- `validator:temporal`

### CMP2 (Characters)
- `semantic-retrieval`
- `orchestrator:memory-injected`
- `validator:character-preservation`

### EDG3 (Anchors)
- `semantic-retrieval`
- `orchestrator:memory-injected`
- `validator:anchor-preservation`

### TRU1 (Refusal)
- `validator:refusal-maintenance`

### TRU2 (Manipulation)
- `validator:manipulation-guard`

## 🚨 Red Flags

### ALL Proofs Missing
```
❌ NO PROOF LINES FOUND
```
**Cause:** Test didn't run, server not started, or no code executed.

### Memory Count Zero
```
[PROOF] orchestrator:memory-injected count=0 ids=[]
```
**Cause:** No memories retrieved (check storage/retrieval pipeline).

### Validator Fired but No Effect
```
✅ validator:ordinal (proof found)
Test still fails with wrong ordinal
```
**Cause:** Logic bug in validator, or response modified after validation.

## 📖 Full Documentation

- **Setup:** `EXECUTION_PROOF_README.md`
- **Integration:** `PR_COMMENT_EXECUTION_PROOF.md`
- **Verification:** `verify-execution-proofs.js --help`

## 🎓 Philosophy

> "Code that doesn't execute doesn't exist."

After 878 files restored:
1. **First:** Prove code executes (proofs)
2. **Then:** Debug why it fails (logs/logic)
3. **Finally:** Tune model behavior (prompts)

Never skip step 1.
