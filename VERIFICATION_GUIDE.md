# Production Verification Guide - PR #419

This guide provides step-by-step instructions for capturing production evidence that the implemented features work correctly.

## Prerequisites

1. Deploy this PR to Railway
2. Have access to Railway logs
3. Have a test user account

---

## Verification 1: Semantic Routing Quality

**Goal:** Demonstrate semantic retrieval correctly identifies relevant memories

### Test Steps:

1. **Store technical memory:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Remember: Our session tokens expire after 30 minutes of inactivity. We use JWT tokens stored in httpOnly cookies for security.",
    "user_id": "test_user_semantic",
    "mode": "truth_general"
  }'
```

2. **Query for that memory:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What do you remember about our session token configuration?",
    "user_id": "test_user_semantic",
    "mode": "truth_general"
  }'
```

### Expected Railway Logs:

Look for semantic retrieval logs showing:
```
[MEMORY] Semantic retrieval: X memories, YYY tokens (method: semantic)
[MEMORY] ✓ Memory WILL be injected into prompt (YYY tokens)
```

The response should reference JWT tokens, 30-minute expiry, and httpOnly cookies.

### Alternative Test - Category vs Semantic:

If semantic retrieval is working, queries about different topics should retrieve relevant memories regardless of "category":

**Technical Query:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do we handle authentication in our system?",
    "user_id": "test_user_semantic",
    "mode": "truth_general"
  }'
```

Should retrieve the JWT token memory even though it's not explicitly categorized.

### What to Capture:
- Railway logs showing `[MEMORY] Semantic retrieval: X memories, YYY tokens (method: semantic)`
- The AI response demonstrating it has the stored technical information
- Any confidence scores from the retrieval telemetry

---

## Verification 2: Performance Monitoring with Real Timings

**Goal:** Capture actual performance markers and target validation

### Test Steps:

1. **Simple query (target: <2000ms):**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is 2+2?",
    "user_id": "test_user_perf",
    "mode": "truth_general"
  }'
```

2. **Query with memory (target: <3000ms):**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What do you remember about me?",
    "user_id": "test_user_perf",
    "mode": "truth_general"
  }'
```

### Expected Railway Logs:

```
[START] User: test_user_perf, Mode: truth_general
[MEMORY] Retrieved XXX tokens from Y memories (ZZZms)
[AI] Model: gpt-4, Cost: $0.XXXX, Duration: XXXXms
[PERFORMANCE] ✅ Total: XXXXms (target: simple <2000ms)
[PERFORMANCE] Breakdown: Memory XXXms, AI XXXXms
```

Or if target exceeded:
```
[PERFORMANCE] ⚠️ Total: XXXXms (target: memory <3000ms)
[PERFORMANCE] Breakdown: Memory XXXms, AI XXXXms
[PERFORMANCE] ⚠️ EXCEEDED TARGET by XXXms
```

### What to Capture:
- Complete log sequence from `[START]` to `[PERFORMANCE]`
- Actual millisecond timings for memory, AI, and total
- Target validation showing ✅ or ⚠️

---

## Verification 3: Document Extraction

**Goal:** Show intelligent document extraction working with large documents

### Test Steps:

1. **Create a large test document (>10K tokens / ~40K chars):**

Save this as `test_large_doc.txt`:
```
[Paste 40,000+ characters of content here - could be a long article, documentation, etc.]
```

2. **Upload via API:**
```bash
# If using upload endpoint
curl -X POST https://your-railway-app.railway.app/api/upload \
  -F "file=@test_large_doc.txt" \
  -F "user_id=test_user_doc"
```

3. **Query about the document:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Summarize the document I just uploaded",
    "user_id": "test_user_doc",
    "mode": "truth_general"
  }'
```

### Expected Railway Logs:

```
[DOCUMENTS] Large message detected (XXXXX chars), treating as pasted document
[TOKEN-BUDGET] Query classified as 'medium', budget: 30000 tokens (effective: YYYY)
[COST-CONTROL] Document extracted: XXXXX → YYYY tokens (ZZ% coverage, strategy: key-sections)
[DOCUMENTS] Loaded YYYY tokens from document
```

### Alternative - Paste Large Content:

```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"$(cat test_large_doc.txt | head -c 50000)\",
    \"user_id\": \"test_user_doc\",
    \"mode\": \"truth_general\"
  }"
```

### What to Capture:
- Log showing document size before extraction (XXXXX tokens)
- Log showing extracted size (YYYY tokens)
- Coverage percentage (ZZ%)
- Extraction strategy used (key-sections, query-relevant, or structured)

---

## Verification 4: Claude Confirmation Flow

**Goal:** Trigger confirmation dialog and verify flow

### Test Steps:

1. **Create a query that triggers Claude escalation:**

A complex business query with ambiguous requirements should trigger low confidence:

```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Should I pivot my SaaS startup from B2B to B2C given that our current MRR is $5k, burn rate is $15k/month, and we have 6 months runway? Our competitor just raised $10M.",
    "user_id": "test_user_confirm",
    "mode": "business_validation"
  }'
```

### Expected Response:

```json
{
  "success": true,
  "needsConfirmation": true,
  "response": "This query would benefit from Claude Sonnet 4.5 analysis (confidence:0.XX). This will cost approximately $0.05-0.15. Would you like to proceed with Claude, or use GPT-4 (faster, $0.01-0.03)?",
  "reason": "confidence:0.XX",
  "estimatedCost": {
    "claude": "$0.05-0.15",
    "gpt4": "$0.01-0.03"
  }
}
```

### Expected Railway Logs:

```
[AI ROUTING] Confidence: 0.XX < 0.85 threshold
[AI ROUTING] Query would benefit from Claude Sonnet 4.5 (confidence:0.XX)
[AI ROUTING] Claude escalation requires user confirmation (reasons: confidence:0.XX)
[AI ROUTING] Returning confirmation request to user
[CHAT] ⚠️ Claude escalation requires user confirmation
```

2. **Confirm and re-submit:**

```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Should I pivot my SaaS startup from B2B to B2C given that our current MRR is $5k, burn rate is $15k/month, and we have 6 months runway? Our competitor just raised $10M.",
    "user_id": "test_user_confirm",
    "mode": "business_validation",
    "claude_confirmed": true
  }'
```

### Expected Railway Logs:

```
[AI ROUTING] Using claude-sonnet-4.5 (reasons: confidence:0.XX, confirmed)
[AI] Model: claude-sonnet-4.5, Cost: $0.XXXX, Duration: XXXXms
```

### What to Capture:
- Initial response with `needsConfirmation: true`
- Railway logs showing confirmation request
- Second request logs showing Claude being used after confirmation

---

## Verification 5: Complete End-to-End Request

**Goal:** Capture one complete request showing all features working together

### Test Steps:

1. **Store a memory first:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Remember: I am working on a fintech startup that processes credit card payments. We use Stripe for payment processing.",
    "user_id": "test_user_e2e",
    "mode": "truth_general"
  }'
```

2. **Upload a document with business requirements (>10K tokens):**
Create a file with detailed product requirements (~40K chars).

3. **Query with memory + document:**
```bash
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Based on what you know about my startup and the requirements document, should we build our own payment processing or continue with Stripe?",
    "user_id": "test_user_e2e",
    "mode": "business_validation"
  }'
```

### Expected Complete Railway Log Sequence:

```
[START] User: test_user_e2e, Mode: business_validation
[MEMORY] Retrieved XXX tokens from Y memories (ZZZms)
[MEMORY] ✓ Memory WILL be injected into prompt (XXX tokens)
[DOCUMENTS] Loaded YYYY tokens from document
[COST-CONTROL] Document extracted: XXXXX → YYYY tokens (ZZ% coverage, strategy: key-sections)
[CONTEXT] Total: ZZZZ tokens
[ANALYSIS] Intent: analyze_business (0.XX), Domain: business (0.XX), Complexity: 0.XX
[AI ROUTING] Confidence: 0.XX < 0.85 threshold
[AI ROUTING] Claude escalation requires user confirmation
→ Returns needsConfirmation or proceeds with confirmed flag
[AI] Model: gpt-4 or claude-sonnet-4.5, Cost: $0.XXXX, Duration: XXXXms
[ENFORCEMENT] Applied X modules
[DOCTRINE-GATES] Score: X.X/7.0 ✅
[PERFORMANCE] ✅ Total: XXXXms (target: document <5000ms)
[PERFORMANCE] Breakdown: Memory XXXms, AI XXXXms
[COMPLETE] Response delivered
```

### What to Capture:
- Complete log sequence from START to COMPLETE
- All performance markers with real timings
- Memory injection confirmation
- Document extraction details
- Target validation result

---

## Checklist for Final Verification

After deployment, capture evidence for:

- [ ] **Semantic Routing:** Logs showing semantic retrieval with actual confidence scores
- [ ] **Performance Monitoring:** Logs with real millisecond timings and target validation
- [ ] **Document Extraction:** Logs showing XXXXX → YYYY token extraction with coverage %
- [ ] **Claude Confirmation:** Response with `needsConfirmation: true` and cost estimates
- [ ] **Complete E2E:** Full request trace with all features working together

---

## How to Access Railway Logs

1. Go to Railway dashboard: https://railway.app/project/YOUR_PROJECT
2. Click on your service
3. Click "Deployments" tab
4. Click on the active deployment
5. Click "View Logs"
6. Filter for relevant timeframe when you ran the tests
7. Search for `[MEMORY]`, `[PERFORMANCE]`, `[COST-CONTROL]`, etc.

---

## Troubleshooting

### If semantic retrieval isn't working:
- Check if memories are being stored: Look for `[STORAGE]` logs
- Verify embedding service is available: Look for embedding generation logs
- Check fallback: System should fall back to keyword retrieval if semantic fails

### If performance monitoring isn't showing:
- Verify you're on the latest deployment with commit `de62f05`
- Check that logs aren't being truncated (Railway has log limits)

### If document extraction isn't triggering:
- Ensure document is actually >10K tokens (~40K characters)
- Try pasting content directly in message rather than upload
- Check `[DOCUMENTS]` logs to see if document was detected

---

## Success Criteria

**Semantic Routing:** ✅ When memories retrieved match query topic (regardless of category labels)

**Performance Monitoring:** ✅ When logs show actual ms timings and target validation (✅ or ⚠️)

**Document Extraction:** ✅ When logs show: `Document extracted: XXXXX → YYYY tokens (ZZ% coverage, strategy: ...)`

**Claude Confirmation:** ✅ When API returns `needsConfirmation: true` with cost estimates

**Complete E2E:** ✅ When single request logs show all features working together
