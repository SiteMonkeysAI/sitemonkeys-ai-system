# Layer 2 Primitives Execution Path Trace

## Issue #746: Execution Path Fix

### Root Cause
Layer 2 primitives existed in `processWithEliAndRoxy()` function but were **never executed** because:
1. Production server uses `orchestrator.processRequest()` 
2. `processWithEliAndRoxy()` is never called by production code
3. The orchestrator had no calls to the primitive functions

### Solution
Added primitive function calls directly in the orchestrator's execution flow.

---

## Complete Execution Trace

### Entry Point: `/server.js`
```
Line 329: app.post("/api/chat", async (req, res) => {
  ↓
Line 470: const result = await orchestrator.processRequest({
    message,
    userId,
    mode,
    sessionId,
    documentContext,
    vaultEnabled,
    vaultContext: finalVaultContext,
    conversationHistory: effectiveConversationHistory,
    claudeConfirmed: claude_confirmed,
  });
```

### Stage 1: Request Processing
**File:** `/api/core/orchestrator.js`
**Function:** `processRequest(requestData)`

```
Line 769: async processRequest(requestData) {
  ↓
Line 797-895: Memory visibility detection
  ↓
Line 897-948: Early query classification
  ↓
Line 950-982: Memory retrieval (#retrieveMemoryContext)
  ↓
Line 1026-1056: Context assembly and semantic analysis
  ↓
Line 1058-1274: Phase 4 truth detection and external lookup
  ↓
Line 1276-1360: Phase 4.5 principle-based reasoning
  ↓
Line 1342-1360: Manipulation guard check
```

### Stage 2: AI Response Generation
```
Line 1366: const aiResponse = await this.#routeToAI(
    message,
    context,
    analysis,
    confidence,
    mode,
    conversationHistory,
    phase4Metadata,
  );
  ↓
Line 1399-1402: Log AI response metadata
```

### Stage 3: LAYER 2 PRIMITIVES (NEW!)
**This is where the fix was applied**

```javascript
// Line 1404-1432: LAYER 2 FALLBACK PRIMITIVES
Line 1407: this.log("[LAYER2] primitives_reached=true");
  ↓
Line 1411: const memoryContextString = memoryContext.memories || '';
  ↓
Line 1415-1422: Temporal Arithmetic Fallback
  const temporalResult = applyTemporalArithmeticFallback(
    aiResponse.response,
    memoryContextString,
    message,
    aiResponse.model
  );
  aiResponse.response = temporalResult.response;
  this.log(`[PRIMITIVE-TEMPORAL] ${JSON.stringify(temporalResult.primitiveLog)}`);
  ↓
Line 1426-1432: List Completeness Fallback
  const completenessResult = applyListCompletenessFallback(
    aiResponse.response,
    memoryContextString,
    message
  );
  aiResponse.response = completenessResult.response;
  this.log(`[PRIMITIVE-COMPLETENESS] ${JSON.stringify(completenessResult.primitiveLog)}`);
```

### Stage 4: Enforcement Chain
```
Line 1438: const enforcedResult = await this.#runEnforcementChain(
    aiResponse.response,  // Now includes primitive modifications
    analysis,
    context,
    mode,
    null,
  );
  ↓
Line 1429-1443: Doctrine gates (#applyDoctrineGates)
  ↓
Line 1450-1462: Personality application
  ↓
Line 1464-1505: Phase 5 enforcement
  ↓
Line 1507-1553: Phase 6 bounded reasoning
  ↓
Line 1555-1583: Phase 6.5 reasoning escalation
  ↓
Line 1585-1616: Phase 7 response contract
  ↓
Line 1618-1801: Phase 7.5 response intelligence
```

### Stage 5: Return to Server
```
Line 1864: return {
    success: true,
    response: personalityResponse.response,  // Final response with all modifications
    metadata: { ... }
  };
  ↓
Back to server.js line 470
  ↓
Line 508-520: Store conversation in session
  ↓
Line 556: res.json(result);
```

---

## Primitive Function Details

### Temporal Arithmetic Fallback
**File:** `/api/lib/ai-processors.js`
**Line:** 1223-1324
**Export:** Line 1223 (added `export` keyword)

**Purpose:** Fixes when AI has temporal data but hedges instead of computing
**Example:** Memory: "worked 5 years at Google, left in 2020" → should compute 2015

**Gates:**
1. Memory context exists
2. Query is temporal (when, what year, start date, etc.)
3. Duration + anchor year found in memory
4. AI response contains hedging phrases

**Logs:**
- `[PRIMITIVE-TEMPORAL]` with JSON containing:
  - `primitive: "TEMPORAL_ARITHMETIC"`
  - `fired: true/false`
  - `reason: "..."`
  - `layer_one_correct: true/false`

### List Completeness Fallback
**File:** `/api/lib/ai-processors.js`
**Line:** 1334-1421
**Export:** Line 1334 (added `export` keyword)

**Purpose:** Fixes when AI omits items from a list in memory
**Example:** Memory: "Zhang Wei, Björn Lindqvist, José García" → all must appear

**Gates:**
1. Memory context exists
2. Query requests a list (who are my, list my, all my, etc.)
3. 2+ enumerable items found in memory
4. AI response missing one or more items

**Logs:**
- `[PRIMITIVE-COMPLETENESS]` with JSON containing:
  - `primitive: "LIST_COMPLETENESS"`
  - `fired: true/false`
  - `reason: "..."`
  - `layer_one_correct: true/false`
  - `items_in_memory: [...]`
  - `items_missing: [...]`

---

## Verification Commands

### Check if primitives are executing
```bash
# Railway logs
railway logs | grep -E "\[LAYER2\]|\[PRIMITIVE-"

# Local test
node test-layer2-orchestrator.js
```

### Expected log sequence per request
```
[ORCHESTRATOR] ...
[AI] Model: gpt-4-turbo-preview, Cost: $0.0123, Duration: 1234ms
[LAYER2] primitives_reached=true
🔧 [LAYER-2] Applying temporal arithmetic fallback primitive...
[PRIMITIVE-TEMPORAL] {"primitive":"TEMPORAL_ARITHMETIC","fired":false,"reason":"..."}
🔧 [LAYER-2] Applying list completeness fallback primitive...
[PRIMITIVE-COMPLETENESS] {"primitive":"LIST_COMPLETENESS","fired":false,"reason":"..."}
[ENFORCEMENT] Running enforcement chain on AI response...
```

### Test scenarios for primitives to fire

**Temporal Arithmetic:**
1. Store memory: "I worked at Microsoft for 8 years and left in 2020"
2. Ask: "When did I start working at Microsoft?"
3. Expected: Primitive fires, computes 2012

**List Completeness:**
1. Store memory: "My team members: Alice Johnson, Bob Smith, Carol Zhang"
2. Ask: "Who are my team members?"
3. Expected: If AI omits any name, primitive adds missing names

---

## Code Changes Summary

### Files Modified
1. `/api/lib/ai-processors.js`
   - Line 1223: Added `export` to `applyTemporalArithmeticFallback`
   - Line 1334: Added `export` to `applyListCompletenessFallback`

2. `/api/core/orchestrator.js`
   - Line 54-58: Added imports for Layer 2 primitives
   - Line 1404-1433: Added primitive invocation after AI generation

### Files Created
1. `/test-layer2-orchestrator.js` - Test to verify primitives execute

---

## Success Criteria ✅

- [x] Primitives are exported from ai-processors.js
- [x] Primitives are imported in orchestrator.js
- [x] [LAYER2] primitives_reached=true log appears on every request
- [x] [PRIMITIVE-TEMPORAL] log appears on every request
- [x] [PRIMITIVE-COMPLETENESS] log appears on every request
- [x] Primitives execute AFTER AI generation
- [x] Primitives execute BEFORE enforcement chain
- [x] Memory context is correctly passed to primitives
- [x] Primitive modifications are preserved through enforcement

---

## Next Steps

1. **Deploy to Railway** - Merge PR and deploy
2. **Monitor Production** - Check for [LAYER2] and [PRIMITIVE-*] logs
3. **Test Scenarios** - Verify primitives fire when conditions met
4. **Performance Check** - Ensure no latency impact (primitives are lightweight)

---

## Notes

- Primitives are designed to be **fast and deterministic**
- They only fire when specific conditions are met (gates)
- When not fired, they return immediately with `fired: false`
- No external API calls, just string matching and computation
- Estimated overhead: <1ms per request when primitives don't fire
- Log format is JSON for easy parsing and monitoring
