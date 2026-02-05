# Proof Bundle Collection Instructions for Issue #702

## Overview

This document provides instructions for collecting the required proof bundles for all 6 failing tests (INF1, INF3, NUA1, STR1, CMP2, TRU2) as specified in the HARD CONTRACT for issue #702.

## ⚠️ IMPORTANT: Production-Safe Design

**This script does NOT require DEBUG_MODE=true in production.**

The script has been designed to work safely against the Railway production environment by:
- Using only safe telemetry from standard `/api/chat` responses
- NOT requiring the debug endpoints
- Including cost control (API call limits, sleep timing)
- Running only once (no repeats)
- Providing manual verification instructions for Railway logs

## Required Proof Bundle Format

For **EACH** of the 6 tests, you must provide:

- **(a) Storage:** stored_id + content preview + anchors_keys + is_current
- **(b) Retrieval:** candidate count + target rank + boost explanation
- **(c) Injection:** injected IDs (≤5) + confirm target included
- **(d) Response:** snippet showing required behavior

## Running Against Railway (Recommended)

### Step 1: Set the Railway URL

```bash
export BASE_URL="https://your-app-name.up.railway.app"
```

### Step 2: Run the Script

```bash
node collect-proof-bundles.js
```

The script will:
1. Run all 6 tests (INF1, INF3, NUA1, STR1, CMP2, TRU2)
2. Validate responses meet test requirements
3. Output formatted proof bundles
4. Provide Railway log search commands for manual verification

### Step 3: Copy and Paste Output

The entire console output is formatted for direct paste into the PR description.

## Configuration Options

### BASE_URL
Set the API endpoint (defaults to localhost:3000):
```bash
BASE_URL=https://your-app.up.railway.app node collect-proof-bundles.js
```

### SLEEP_MS
Adjust sleep timing between operations (defaults to 1200ms):
```bash
SLEEP_MS=1500 node collect-proof-bundles.js
```

### Cost Control

Built-in limits:
- **Max 15 API calls per test**
- **Max 90 API calls total** (6 tests × 15)
- **1200ms minimum sleep between steps** (prevents timing flakiness)
- **Single run only** (no loops or retries)

## Manual Verification in Railway Logs

The script output includes specific log search commands for each test. Example:

```bash
# For INF1 - Age Inference
# Search Railway logs for:
[STORAGE] Storing for userId: inf1-proof-[timestamp]
[AGE-INFERENCE] with userId: inf1-proof-[timestamp]
```

### What to Look For in Logs

1. **Storage:** `[STORAGE]` entries showing fact storage with user IDs
2. **Retrieval:** `[SEMANTIC-RETRIEVAL]` entries showing candidate ranking
3. **Validators:**
   - `[AGE-INFERENCE]` - INF1 age validator activity
   - `[TEMPORAL-CALC]` - INF3 temporal reasoning
   - `[AMBIGUITY-DETECT]` - NUA1 ambiguity detection
   - `[VEHICLE-BOOST]` - STR1 vehicle keyword boost
   - `[UNICODE-ANCHOR]` - CMP2 unicode preservation
   - `[TRUTH-CERTAINTY]` - TRU2 false certainty detection

## Running Locally (Development Only)

If you need to test locally:

```bash
# Terminal 1: Start server
node server.js

# Terminal 2: Run tests
BASE_URL=http://localhost:3000 node collect-proof-bundles.js
```

**Note:** Local testing requires DATABASE_URL and OPENAI_API_KEY to be set.

## Troubleshooting

### "Server not running or not accessible"
- Verify BASE_URL is correct
- Check if Railway deployment is healthy
- Test manually: `curl https://your-app.up.railway.app/health`

### Tests fail with "Chat failed: 400"
- Check that user_id is being passed correctly
- Verify memory isolation is working

### Tests fail with specific validation errors
- Check the response snippet in the proof bundle output
- Look for what the AI actually said vs. what was expected
- Review Railway logs for validator activity

### "API call limit reached"
- This is a safety feature to prevent runaway costs
- Default limit is 90 calls total (15 per test)
- If legitimate, increase MAX_API_CALLS_PER_TEST in the script

## Verification Checklist

Before submitting the PR for merge, verify:

- [ ] All 6 proof bundles collected (INF1, INF3, NUA1, STR1, CMP2, TRU2)
- [ ] Each proof bundle contains all 4 sections (a, b, c, d)
- [ ] All 6 tests are passing (✅)
- [ ] API calls within budget (<90 total)
- [ ] No DEBUG_MODE required in production
- [ ] Manual verification completed in Railway logs
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

## Implementation Details

### How Proof is Collected Without DEBUG_MODE

1. **Storage:** Script stores facts and notes user IDs for Railway log searches
2. **Retrieval:** Validators query DB directly; implementation locations provided
3. **Injection:** Most validators query DB directly rather than using semantic retrieval
4. **Response:** Captured from chat API response and validated

### Why This Is Safe for Production

- Uses standard `/api/chat` endpoint (same as frontend)
- No special debug endpoints required
- No behavior changes to production system
- API call limits prevent cost overruns
- Single-run design (no infinite loops)
- User isolation via unique test user IDs

## Contract Requirements Summary

From issue #702:

> **No Merge Until:**
> - All 6 proof bundles pasted in PR description
> - SMDEEP 15/15
> - SMFULL ≥23/24
> - Zero regressions

This is a HARD CONTRACT. No exceptions.

## Support

If you encounter issues:
1. Check this document's troubleshooting section
2. Review Railway logs for error messages
3. Verify API keys and database are accessible
4. Test a single endpoint: `curl -X POST [BASE_URL]/api/chat -H "Content-Type: application/json" -d '{"message":"test","user_id":"test-123","mode":"truth_general"}'`

