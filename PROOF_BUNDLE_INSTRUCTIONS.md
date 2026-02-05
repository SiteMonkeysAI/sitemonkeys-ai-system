# Proof Bundle Collection Instructions for Issue #702

## Overview

This document provides instructions for collecting the required proof bundles for all 6 failing tests (INF1, INF3, NUA1, STR1, CMP2, TRU2) as specified in the HARD CONTRACT for issue #702.

## Required Proof Bundle Format

For **EACH** of the 6 tests, you must provide:

- **(a) Storage:** stored_id + content preview + anchors_keys + is_current
- **(b) Retrieval:** candidate count + target rank + boost explanation
- **(c) Injection:** injected IDs (≤5) + confirm target included
- **(d) Response:** snippet showing required behavior

## Prerequisites

1. **Environment Variables:**
   ```bash
   export DATABASE_URL="your-postgres-connection-string"
   export OPENAI_API_KEY="your-openai-api-key"
   export DEBUG_MODE="true"
   export ENABLE_INTELLIGENT_STORAGE="true"
   export ENABLE_SEMANTIC_ROUTING="true"
   ```

2. **Server Running:**
   The system must be running with DEBUG_MODE=true to enable the debug endpoints.

## Running the Proof Bundle Collection

### Step 1: Start the Server with Debug Mode

```bash
DEBUG_MODE=true node server.js
```

Wait for the server to fully initialize. You should see:
```
[SERVER] 🚀 Server running on port 3000
[MEMORY] ✅ Memory system initialized
```

### Step 2: Run the Proof Bundle Collection Script

In a separate terminal:

```bash
node collect-proof-bundles.js
```

This script will:
1. Run all 6 failing tests (INF1, INF3, NUA1, STR1, CMP2, TRU2)
2. Collect proof bundles from the debug endpoints
3. Format the output according to the contract requirements
4. Display a summary showing which tests passed/failed

### Step 3: Review the Output

The script will output a comprehensive proof bundle for each test. Example:

```
======================================================================
INF1: Age Inference
Status: ✅ PASSED
======================================================================

(a) STORAGE:
    stored_id: 12345
    content_preview: My daughter Emma just started kindergarten
    anchors_keys: ["names", "relationships"]
    is_current: true

(b) RETRIEVAL:
    candidate_count: 3
    target_rank: 1
    boost_explanation: Age inference validator queries DB for school level facts

(c) INJECTION:
    injected_ids: [12345, 12346]
    target_included: Validator queries DB directly
    count: 2 (must be ≤5)

(d) RESPONSE:
    Based on Emma being in kindergarten, Emma is typically around 5-6 years old...
```

## Alternative: Manual Proof Collection

If the automated script fails, you can manually collect proof bundles using the debug API:

### 1. Store a fact:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My daughter Emma just started kindergarten",
    "sessionId": "test-user-123",
    "mode": "truth_general"
  }'
```

### 2. Get storage info:
```bash
curl "http://localhost:3000/api/debug/memory?user_id=test-user-123&action=list_recent&limit=10"
```

### 3. Query:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How old is Emma?",
    "sessionId": "test-user-123",
    "mode": "truth_general"
  }'
```

### 4. Get retrieval info:
```bash
curl "http://localhost:3000/api/debug/memory?user_id=test-user-123&action=last_retrieve"
```

### 5. Get injection info:
```bash
curl "http://localhost:3000/api/debug/memory?user_id=test-user-123&action=last_inject"
```

## Verification Checklist

Before submitting the PR for merge, verify:

- [ ] All 6 proof bundles collected (INF1, INF3, NUA1, STR1, CMP2, TRU2)
- [ ] Each proof bundle contains all 4 sections (a, b, c, d)
- [ ] All 6 tests are passing (✅)
- [ ] Injection count ≤5 for all tests
- [ ] No regressions introduced
- [ ] SMDEEP score is 15/15
- [ ] SMFULL score is ≥23/24

## Next Steps After Proof Collection

1. **Copy the proof bundle output** from the script
2. **Paste it into the PR description** under a "Proof Bundles" section
3. **Run full SMDEEP suite:**
   ```bash
   node diagnostic-tests-smdeep-complete.js
   ```
   Verify: 15/15 passing

4. **Run SMFULL suite** (if available):
   ```bash
   node diagnostic-tests-smfull.js  # if this exists
   ```
   Verify: ≥23/24 passing

## Troubleshooting

### Debug endpoint returns 403
- Make sure `DEBUG_MODE=true` is set when starting the server
- Or set `DEPLOYMENT_TYPE=private`

### Tests fail with "Chat failed: 500"
- Check server logs for errors
- Verify DATABASE_URL is set correctly
- Verify OPENAI_API_KEY is set correctly
- Check that memory system initialized properly

### Memory not being retrieved
- Check server logs for `[PROOF] semantic-retrieval` messages
- Check if memories are actually being stored: `/api/debug/memory?user_id=xxx&action=list_recent`
- Verify ENABLE_INTELLIGENT_STORAGE=true
- Verify ENABLE_SEMANTIC_ROUTING=true

### Injection count >5
- This is a VIOLATION of the Token Efficiency Doctrine
- Review the semantic-retrieval.js finalFilterAndLimit() function
- Ensure max injection limit is 5

## Contract Requirements Summary

From issue #702:

> **No Merge Until:**
> - All 6 proof bundles pasted in PR description
> - SMDEEP 15/15
> - SMFULL ≥23/24
> - Zero regressions

This is a HARD CONTRACT. No exceptions.
