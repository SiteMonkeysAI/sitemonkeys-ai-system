# Verification Commands

Quick reference commands to verify the Layer 2 Fallback Primitives implementation.

## 1. Verify Functions Exist

```bash
grep -n "function applyTemporalArithmeticFallback" api/lib/ai-processors.js
grep -n "function applyListCompletenessFallback" api/lib/ai-processors.js
```

**Expected Output**:
```
1201:function applyTemporalArithmeticFallback(response, memoryContext, userQuery, personalityId) {
1312:function applyListCompletenessFallback(response, memoryContext, userQuery) {
```

## 2. Verify Functions Are Called

```bash
grep -n "applyTemporalArithmeticFallback(" api/lib/ai-processors.js
grep -n "applyListCompletenessFallback(" api/lib/ai-processors.js
```

**Expected Output**:
```
656:    const temporalResult = applyTemporalArithmeticFallback(
1201:function applyTemporalArithmeticFallback(response, memoryContext, userQuery, personalityId) {

667:    const completenessResult = applyListCompletenessFallback(
1312:function applyListCompletenessFallback(response, memoryContext, userQuery) {
```

## 3. Verify Logging Exists

```bash
grep -n "\[PRIMITIVE-TEMPORAL\]" api/lib/ai-processors.js
grep -n "\[PRIMITIVE-COMPLETENESS\]" api/lib/ai-processors.js
```

**Expected Output**:
```
663:    console.log(`[PRIMITIVE-TEMPORAL] ${JSON.stringify(temporalResult.primitiveLog)}`);
673:    console.log(`[PRIMITIVE-COMPLETENESS] ${JSON.stringify(completenessResult.primitiveLog)}`);
```

## 4. Verify Position in Code

```bash
sed -n '644,680p' api/lib/ai-processors.js | grep -n "FINAL QUALITY\|LAYER-2\|PRIMITIVE\|REFUSAL"
```

**Expected Output**:
```
1:    // STEP 6: FINAL QUALITY PASS - Remove engagement bait
10:    // LAYER 2 FALLBACK PRIMITIVES (Issue #746)
20:    console.log(`[PRIMITIVE-TEMPORAL] ${JSON.stringify(temporalResult.primitiveLog)}`);
30:    console.log(`[PRIMITIVE-COMPLETENESS] ${JSON.stringify(completenessResult.primitiveLog)}`);
34:    // REFUSAL DETECTION AND TRACKING (Issue #744 - TRU1)
```

## 5. Verify Correct Parameters

```bash
sed -n '656,660p' api/lib/ai-processors.js
```

**Expected Output**:
```
    const temporalResult = applyTemporalArithmeticFallback(
      response.response,
      memoryContext,
      message,
      aiUsed
```

```bash
sed -n '667,671p' api/lib/ai-processors.js
```

**Expected Output**:
```
    const completenessResult = applyListCompletenessFallback(
      response.response,
      memoryContext,
      message
    );
```

## 6. Verify Response Update

```bash
grep -n "response.response = temporalResult.response" api/lib/ai-processors.js
grep -n "response.response = completenessResult.response" api/lib/ai-processors.js
```

**Expected Output**:
```
662:    response.response = temporalResult.response;
672:    response.response = completenessResult.response;
```

## 7. Verify Metadata in Response

```bash
grep -A3 "layer2_primitives:" api/lib/ai-processors.js
```

**Expected Output**:
```
      layer2_primitives: {
        temporal_arithmetic: temporalResult.primitiveLog,
        list_completeness: completenessResult.primitiveLog,
      },
```

## 8. Verify Inside processWithEliAndRoxy

```bash
grep -n "export async function processWithEliAndRoxy" api/lib/ai-processors.js
```

**Expected Output**:
```
96:export async function processWithEliAndRoxy({
```

Now verify primitives are called within this function (between lines 96 and the end of the function):

```bash
awk '/^export async function processWithEliAndRoxy/,/^}$/ {print NR": "$0}' api/lib/ai-processors.js | grep "applyTemporal\|applyList" | head -4
```

**Expected Output**: Lines showing the function calls within processWithEliAndRoxy

## 9. Run Unit Test

```bash
node test-primitives-unit.js
```

**Expected Output**:
```
🧪 UNIT TEST: Layer 2 Fallback Primitives
...
🎉 ALL TESTS PASSED!
```

## 10. Check Git History

```bash
git log --oneline --all --grep="746\|primitive" | head -5
```

**Expected Output**:
```
8246ee1 Merge pull request #747 from SiteMonkeysAI/fix-issue-746-20260211205549
```

## Railway Log Search Commands

When checking Railway logs, search for these exact strings:

1. `[PRIMITIVE-TEMPORAL]` - Will show primitive was called
2. `[PRIMITIVE-COMPLETENESS]` - Will show primitive was called
3. `[LAYER-2]` - Will show layer 2 is executing
4. `TEMPORAL_ARITHMETIC` - Part of the JSON log
5. `LIST_COMPLETENESS` - Part of the JSON log
6. `"fired":true` - Will show when primitives actually modified response
7. `"fired":false` - Will show when Layer 1 (AI) handled correctly

## Expected Railway Log Pattern

```
🧠 COGNITIVE FIREWALL: Full enforcement processing initiated
...
🎯 Applying final quality pass - removing engagement bait
🔧 [LAYER-2] Applying temporal arithmetic fallback primitive...
[PRIMITIVE-TEMPORAL] {"primitive":"TEMPORAL_ARITHMETIC","fired":false,"reason":"layer_one_produced_correct_response",...}
🔧 [LAYER-2] Applying list completeness fallback primitive...
[PRIMITIVE-COMPLETENESS] {"primitive":"LIST_COMPLETENESS","fired":false,"reason":"layer_one_produced_complete_list",...}
```

## Quick Verification Script

```bash
#!/bin/bash
echo "=== PRIMITIVE INTEGRATION VERIFICATION ==="
echo ""
echo "1. Functions exist:"
grep -c "function applyTemporalArithmeticFallback" api/lib/ai-processors.js
grep -c "function applyListCompletenessFallback" api/lib/ai-processors.js
echo ""
echo "2. Functions called:"
grep -c "applyTemporalArithmeticFallback(" api/lib/ai-processors.js
grep -c "applyListCompletenessFallback(" api/lib/ai-processors.js
echo ""
echo "3. Logs exist:"
grep -c "\[PRIMITIVE-TEMPORAL\]" api/lib/ai-processors.js
grep -c "\[PRIMITIVE-COMPLETENESS\]" api/lib/ai-processors.js
echo ""
echo "4. Metadata in response:"
grep -c "layer2_primitives:" api/lib/ai-processors.js
echo ""
echo "✅ If all counts are > 0, integration is complete"
```

Save as `verify-primitives.sh`, make executable with `chmod +x verify-primitives.sh`, and run with `./verify-primitives.sh`.
