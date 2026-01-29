# Execution Proof System

## Purpose

After the massive revert (878 files restored), we need to verify that code **actually executes**, not just exists in the repo.

**Problem:** "The code exists" ≠ "The code runs in the live path"

**Solution:** Add deterministic proof logs that fire when code executes.

## Proof Log Format

```javascript
console.log('[PROOF] <module> v=<version> file=<path> fn=<function>');
```

**Example:**
```
[PROOF] validator:ordinal v=2026-01-29a file=api/core/orchestrator.js fn=#enforceOrdinalCorrectness
```

## Instrumented Code Paths

### Memory & Retrieval
- ✅ **Semantic Retrieval** (`api/services/semantic-retrieval.js`)
  - Entry: `retrieveSemanticMemories()`
  - Tests: All memory-dependent tests
  
- ✅ **Memory Assembly** (`api/core/orchestrator.js`)
  - Entry: `processMessage()` memory retrieval section
  - Injected IDs logged
  - Tests: All tests with memory

### Storage (A5)
- ✅ **Explicit Memory Detection** (`api/memory/intelligent-storage.js`)
  - Entry: `detectExplicitMemoryRequest()`
  - Tests: A5 (explicit memory recall)

### Validators

#### Ordinal Enforcement (B3)
- ✅ **Ordinal Correctness** (`api/core/orchestrator.js`)
  - Entry: `#enforceOrdinalCorrectness()`
  - Tests: B3 (first/second code disambiguation)

#### Temporal Reasoning (INF3)
- ✅ **Temporal Inference** (`api/core/orchestrator.js`)
  - Entry: `#calculateTemporalInference()`
  - Tests: INF3 (2020 - 5 = 2015)

#### Character Preservation (CMP2)
- ✅ **Character Validator** (`api/lib/validators/character-preservation.js`)
  - Entry: `validate()`
  - Tests: CMP2 (José, Björn preservation)

#### Anchor Preservation (EDG3)
- ✅ **Anchor Validator** (`api/lib/validators/anchor-preservation.js`)
  - Entry: `validate()`
  - Tests: EDG3 ($99, $299 preservation)

#### Truth Enforcement (TRU1, TRU2)
- ✅ **Refusal Maintenance** (`api/lib/validators/refusal-maintenance.js`)
  - Entry: `validate()`
  - Tests: TRU1 (pushback resistance)

- ✅ **Manipulation Guard** (`api/lib/validators/manipulation-guard.js`)
  - Entry: `validate()`
  - Tests: TRU2 (manipulation attempts)

## How to Use

### 1. Run Tests with Proof Capture

```bash
# Run diagnostic tests and capture output
node diagnostic-tests-smdeep.js 2>&1 | tee test-output.log

# Or run your test suite
npm test 2>&1 | tee test-output.log
```

### 2. Verify Which Code Executed

```bash
# Parse proof logs
node verify-execution-proofs.js < test-output.log
```

**Output:**
```
✅ Semantic memory retrieval
   semantic-retrieval: file=api/services/semantic-retrieval.js fn=retrieveSemanticMemories
✅ Ordinal enforcement (B3)
   validator:ordinal: file=api/core/orchestrator.js fn=#enforceOrdinalCorrectness
❌ Character preservation (CMP2) - NOT FOUND
   
⚠️  Missing proofs indicate:
   1. Code not wired into execution path
   2. Feature flags disabled
   3. Wrong import/module being used
   4. Code exists but is unreachable
```

### 3. Diagnose Based on Results

#### If Proof Lines Missing:
- **Code isn't executing** - fix wiring/imports/flags FIRST
- Check import paths in orchestrator
- Verify feature flags in `.env`
- Check validator is actually called

#### If Proof Lines Present but Test Fails:
- Code is executing ✓
- Now investigate:
  - Model variance (if relying on LLM reasoning)
  - Logic bugs in validator
  - Insufficient memory retrieval
  - Wrong data being passed to validator

## Common Issues After Revert

### Issue: Validator proof missing

**Symptoms:**
```
❌ Character preservation (CMP2) - NOT FOUND
```

**Causes:**
1. Validator not imported in orchestrator
2. Validator call commented out
3. Wrong validator instance being used
4. Try/catch swallowing execution

**Fix:**
```javascript
// Check orchestrator.js imports
import { characterPreservationValidator } from "../lib/validators/character-preservation.js";

// Check validator is actually called
const charResult = await characterPreservationValidator.validate({...});
```

### Issue: Memory not retrieved

**Symptoms:**
```
✅ Semantic retrieval proof found
[PROOF] orchestrator:memory-injected v=2026-01-29a count=0 ids=[]
```

**Causes:**
1. User ID mismatch
2. Mode filtering too aggressive
3. Embeddings not ready
4. Database connection issue

**Fix:**
- Check `[RETRIEVAL-ENTRY]` logs for userId
- Verify mode allows cross-mode retrieval
- Check DB connection in logs

### Issue: Explicit memory not detected

**Symptoms:**
```
❌ Explicit memory detection (A5) - NOT FOUND
```

**Causes:**
1. `detectExplicitMemoryRequest()` not being called
2. Storage path bypassing detection
3. Wrong storage service instance

**Fix:**
- Trace storage calls in logs
- Verify `intelligent-storage.js` is the active storage module
- Check for duplicate storage implementations

## Integration with Tests

### SMDEEP Tests

Add proof verification to test output:
```javascript
// After running test
console.log('\n[TEST-PROOFS] Expected for this test:');
console.log('  - validator:ordinal (for B3)');
console.log('  - validator:temporal (for INF3)');
console.log('  - validator:character-preservation (for CMP2)');
```

### Test Harness

Modify test runner to fail if expected proofs missing:
```javascript
const expectedProofs = ['validator:ordinal', 'semantic-retrieval'];
const foundProofs = parseProofsFromOutput(testOutput);

for (const proof of expectedProofs) {
  if (!foundProofs.has(proof)) {
    throw new Error(`PROOF MISSING: ${proof} - code not executing`);
  }
}
```

## Version History

- **v=2026-01-29a**: Initial execution proof system
  - All validators instrumented
  - Memory retrieval tracked
  - Storage detection logged
  
## Future Enhancements

1. **Proof Timestamps**: Add execution timing
2. **Call Counts**: Track how many times validators fire
3. **Conditional Proofs**: Show activation conditions
4. **Test Correlation**: Link proofs to specific test cases

## Philosophy

This system enforces the principle:

> "Code that doesn't execute doesn't exist."

After a massive revert, proof logs are the fastest way to:
- Identify missing wiring
- Verify feature flags
- Catch import errors
- Confirm code paths

Only after confirming code executes should we discuss model variance or prompt engineering.
