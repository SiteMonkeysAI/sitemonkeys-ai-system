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
