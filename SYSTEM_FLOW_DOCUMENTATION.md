# System Flow Documentation

This document explains how key features in the Site Monkeys AI System currently work, including vault loading, token tracking display, memory-to-AI flow, document upload, and validation.

---

## 1. Vault Loading

### What triggers vault loading in site_monkeys mode?

**Frontend Trigger:**
- File: `/public/js/app.js`
- Function: `loadVaultOnDemand()` (lines 5-82)
- Trigger conditions:
  1. User must be in `site_monkeys` mode
  2. Vault is loaded on-demand when needed for a chat request
  3. Manual refresh via "Refresh Vault" button calls `improvedRefreshVault()` (lines 90-100)

**Backend Trigger:**
- When `mode === "site_monkeys"` in chat request
- File: `/api/core/orchestrator.js`
- Method: `#loadVaultContext()` (lines 625-656)

### Which files handle it?

**Frontend:**
- `/public/js/app.js` - Vault loading and caching (lines 1-100)
  - `loadVaultOnDemand()` - Primary loader
  - `improvedRefreshVault()` - Manual refresh handler
  - `window.currentVaultContent` - Global vault cache

**Backend:**
- `/api/core/orchestrator.js` - Orchestrator vault loading (lines 625-656)
  - `#loadVaultContext()` - Loads vault from multiple sources
- `/api/lib/vault.js` - Vault business logic engine
  - `SITE_MONKEYS_VAULT` - Vault data structure (lines 41-113)
  - `generateVaultContext()` - Context generation (lines 203-245)
  - `getVaultStatus()` - Status checking (lines 365-375)

### Why might logs show "No vault available"?

**Three possible reasons:**

1. **Mode mismatch:**
   - Vault only loads in `site_monkeys` mode
   - Frontend check: `app.js` line 18: `if (currentMode !== "site_monkeys")`
   - Backend check: `orchestrator.js` line 304: `mode === "site_monkeys" && vaultEnabled`

2. **No vault content in sources:**
   - Line 639-647 in `orchestrator.js`: Checks `global.vaultContent`
   - If `global.vaultContent` is empty or < 1000 chars, vault isn't loaded
   - Line 650: "Not available in any source" log

3. **Frontend cache empty:**
   - `app.js` line 7-14: Checks `window.currentVaultContent`
   - If cache is empty and mode isn't site_monkeys, returns empty string

### Where should vault content be stored once loaded?

**Frontend storage:**
- `window.currentVaultContent` - Main vault cache (app.js line 58)
- `window.vaultStatus` - Vault status metadata (app.js line 59)

**Backend storage:**
- `global.vaultContent` - Global vault cache (orchestrator.js line 639)
- `vaultData.content` - Per-request vault content (orchestrator.js line 632)

**Context assembly:**
- File: `orchestrator.js` line 666
- Assembled into `context.vault` for AI consumption

---

## 2. Token Tracking Display

### Backend logs show token tracking - where should users see this on frontend?

**Current state:** Token tracking is **backend-only** - no frontend display exists yet.

**Backend implementation:**
- File: `/api/lib/tokenTracker.js`
- Function: `trackApiCall()` (lines 57-189)
- Console log: Line 121-132
  ```javascript
  console.log("💰 Token Tracking - " + personality + ": " + 
    promptTokens + "+" + completionTokens + "=" + totalTokens + 
    " tokens, $" + callCost.toFixed(4));
  ```

**Data available for frontend:**
- Function: `formatSessionDataForUI()` (lines 195-229)
- Returns structured data:
  ```javascript
  {
    promptTokens: number,
    completionTokens: number,
    vaultTokens: number,
    totalCost: number,
    totalCalls: number,
    cost_display: "$X.XXXX",
    vault_display: "X tokens",
    status: "ACTIVE"
  }
  ```

### What passes token data from backend to frontend?

**Current flow (no frontend display yet):**

1. **Token tracking happens:** `tokenTracker.js` `trackApiCall()` line 57
2. **Data included in orchestrator response:** `orchestrator.js` lines 443-447
   ```javascript
   cost: aiResponse.cost,  // Contains inputTokens, outputTokens, totalCost
   semanticAnalysisCost: analysis.cost || 0,
   totalCostIncludingAnalysis: (aiResponse.cost?.totalCost || 0) + (analysis.cost || 0)
   ```
3. **Returned in API response:** `server.js` line 239: `res.json(result)`
4. **Frontend receives it but doesn't display it**

### Complete flow from orchestrator to user's screen

**Current implementation (backend to response):**

```
1. AI API call made
   ↓
2. tokenTracker.trackApiCall(personality, promptTokens, completionTokens)
   → File: api/lib/tokenTracker.js lines 57-189
   ↓
3. Returns cost object with:
   - tokens_used, prompt_tokens, completion_tokens
   - call_cost, session_total, cumulative_tokens
   ↓
4. Orchestrator includes in response metadata
   → File: api/core/orchestrator.js lines 443-447
   ↓
5. Server sends to frontend
   → File: server.js line 239: res.json(result)
   ↓
6. Frontend receives metadata.cost but DOES NOT DISPLAY
   → File: public/js/app.js (no code to display tokens)
```

**To add frontend display, would need to:**
- Extract `response.metadata.cost` in frontend
- Create UI element to show tokens/cost
- Update display after each message

---

## 3. Memory to AI Flow

### How does the AI receive memories?

**Step-by-step flow:**

1. **Memory retrieval triggered:** `orchestrator.js` line 285-288
   ```javascript
   const memoryContext = await this.#retrieveMemoryContext(userId, message);
   ```

2. **Memory system called:** `orchestrator.js` lines 509-514
   ```javascript
   const result = await global.memorySystem.retrieveMemory(userId, message);
   ```
   - Uses global memory system initialized in `server.js` lines 88-100
   - Memory system from `/api/categories/memory/internal/core.js`

3. **Memories formatted:** `orchestrator.js` lines 522-532
   ```javascript
   const memoryText = typeof result.memories === "string" 
     ? result.memories 
     : JSON.stringify(result.memories);
   ```

4. **Context assembled:** `orchestrator.js` line 311-315
   ```javascript
   const context = this.#assembleContext(memoryContext, documentData, vaultData);
   ```

5. **Prompt built with memories:** `orchestrator.js` line 945
   ```javascript
   const contextString = this.#buildContextString(context, mode);
   ```

6. **Full prompt to AI:** `orchestrator.js` line 979
   ```javascript
   fullPrompt = `${systemPrompt}\n\n${contextString}${historyString}\n\nUser query: ${message}`;
   ```

### Where is the prompt constructed that tells AI about memories?

**Primary construction location:**
- File: `api/core/orchestrator.js`
- Method: `#buildContextString()` (lines 1265-1400)

**Key sections:**

```javascript
#buildContextString(context, mode) {
  let contextParts = [];

  // Memory context (lines 1270-1280)
  if (context.memory && context.memory.length > 0) {
    contextParts.push("MEMORY CONTEXT (Previous conversations and stored information):");
    contextParts.push(context.memory);
    contextParts.push("");
  }

  // Document context (lines 1282-1292)
  if (context.documents && context.documents.length > 0) {
    contextParts.push("DOCUMENT CONTEXT (User uploaded content):");
    contextParts.push(context.documents);
    contextParts.push("");
  }

  // Vault context (lines 1294-1304)
  if (context.vault && context.vault.length > 0) {
    contextParts.push("🍌 SITE MONKEYS VAULT (Business rules and policies):");
    contextParts.push(context.vault);
    contextParts.push("");
  }

  return contextParts.join("\n");
}
```

### Show the code that builds the AI prompt with memory context

**Complete prompt construction flow:**

```javascript
// LOCATION: api/core/orchestrator.js

// STEP 1: Build system prompt (lines 956)
const systemPrompt = this.#buildSystemPrompt(mode, analysis);

// STEP 2: Build context string with memories (line 945)
const contextString = this.#buildContextString(context, mode);
// This includes:
// - MEMORY CONTEXT: Retrieved memories from database
// - DOCUMENT CONTEXT: Uploaded document content
// - VAULT CONTEXT: Business rules (site_monkeys mode only)

// STEP 3: Build conversation history (lines 947-954)
const historyString = conversationHistory.length > 0
  ? "\n\nRecent conversation:\n" +
    conversationHistory.slice(-5)
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n")
  : "";

// STEP 4: Assemble final prompt (line 979)
fullPrompt = `${systemPrompt}\n\n${contextString}${historyString}\n\nUser query: ${message}`;

// STEP 5: Send to AI (lines 984-993 for Claude, 995-1008 for GPT)
const claudeResponse = await this.anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 2000,
  messages: [{ role: "user", content: fullPrompt }]
});
```

**System prompt construction (`#buildSystemPrompt`):**
- File: `orchestrator.js` lines 1305-1400
- Includes mode-specific instructions
- Example for `business_validation` mode (lines 1357-1380):
  ```javascript
  You are an AI assistant specializing in business validation with survival-first thinking.
  
  CORE PRINCIPLES:
  - Model downside scenarios before upside
  - Calculate runway impact for all decisions
  - Surface hidden costs and dependencies
  - Challenge optimistic assumptions
  ```

---

## 4. Document Upload Flow

### How are uploaded documents stored during session?

**Storage mechanism:**
- File: `/api/upload-for-analysis.js`
- Global storage: `extractedDocuments` Map (line 9)
- Stored with key: `"latest"` (line 492)

**Document storage structure (lines 492-507):**
```javascript
extractedDocuments.set("latest", {
  id: documentId,
  filename: file.filename,
  content: file.docxAnalysis.preview,      // 200 char preview
  fullContent: file.docxAnalysis.fullText,  // Complete document text
  wordCount: file.docxAnalysis.wordCount,
  contentType: file.docxAnalysis.contentType,
  keyPhrases: file.docxAnalysis.keyPhrases,
  timestamp: Date.now()
});
```

**Automatic cleanup:**
- Function: `autoCleanupDocuments()` (lines 14-37)
- Runs every 60 seconds (line 40)
- Removes documents older than 10 minutes (line 15)
- Maximum 100 documents stored (line 10)

### How is document content passed to AI in requests?

**Document loading flow:**

1. **Document retrieval:** `orchestrator.js` lines 290-298
   ```javascript
   const documentData = documentContext 
     ? await this.#loadDocumentContext(documentContext, sessionId)
     : null;
   ```

2. **Load from storage:** `orchestrator.js` lines 580-621
   ```javascript
   async #loadDocumentContext(documentContext, sessionId) {
     // NOTE: Code tries to access extractedDocuments[sessionId] as array
     // but upload-for-analysis.js stores with .set("latest", {...})
     // This means document loading may not work as intended
     
     if (!extractedDocuments[sessionId] || extractedDocuments[sessionId].length === 0) {
       return null;
     }
     
     const docs = extractedDocuments[sessionId];
     const latestDoc = docs[docs.length - 1];
     
     const tokens = Math.ceil(latestDoc.content.length / 4);
     
     return {
       content: latestDoc.content,
       tokens: tokens,
       filename: latestDoc.filename,
       processed: true
     };
   }
   ```

3. **Assembled into context:** `orchestrator.js` lines 660-680
   ```javascript
   #assembleContext(memory, documents, vault) {
     const documentText = documents?.content || "";
     
     return {
       documents: documentText,
       sources: {
         hasDocuments: !!documents
       }
     };
   }
   ```

4. **Added to AI prompt:** `orchestrator.js` lines 1282-1292
   ```javascript
   if (context.documents && context.documents.length > 0) {
     contextParts.push("DOCUMENT CONTEXT (User uploaded content):");
     contextParts.push(context.documents);
   }
   ```

### Show where documents are accessed when building AI context

**Document access points:**

1. **Upload endpoint receives file:**
   - File: `api/upload-for-analysis.js` lines 363-527
   - Processes DOCX via `extractDocxContent()` (lines 148-191)
   - Stores in `extractedDocuments.set("latest", ...)` (line 492)

2. **Chat endpoint loads document:**
   - File: `api/core/orchestrator.js` lines 290-298
   - Calls `#loadDocumentContext()` which accesses `extractedDocuments`

3. **Document content retrieved:**
   - File: `api/core/orchestrator.js` lines 580-621
   - Accesses: `extractedDocuments[sessionId]` (but storage uses Map with "latest" key)
   - **NOTE:** Potential mismatch between storage and retrieval methods

4. **Content assembled for AI:**
   - File: `api/core/orchestrator.js` lines 1282-1292
   - Formatted as: `"DOCUMENT CONTEXT (User uploaded content):\n{content}"`

**Token limit enforcement:**
- Line 594-604 in `orchestrator.js`
- Documents > 10,000 tokens are truncated to 40,000 characters (~10,000 tokens)

---

## 5. Validation System

### What causes validation to fail with "Missing survival impact"?

**Validation location:**
- File: `api/core/orchestrator.js`
- Method: `#validateCompliance()` (lines 1163-1234)

**Specific check (lines 1180-1194):**
```javascript
if (mode === "business_validation") {
  const hasRiskAnalysis = /risk|downside|worst case|if this fails/i.test(response);
  const hasSurvivalImpact = /survival|runway|cash flow|burn rate/i.test(response);

  if (!hasRiskAnalysis) {
    issues.push("Missing risk analysis in business validation mode");
  }
  if (!hasSurvivalImpact) {
    issues.push("Missing survival impact in business validation mode");  // ← THIS LINE
  }
}
```

**Triggers "Missing survival impact" failure when:**
1. Mode is `business_validation`
2. Response doesn't contain any of these keywords:
   - "survival"
   - "runway"
   - "cash flow"
   - "burn rate"

### Where are validation rules defined?

**Two validation systems:**

1. **Mode-specific validation:** `api/core/orchestrator.js` lines 1163-1234
   - Business validation checks (lines 1180-1194)
   - Confidence checks (lines 1169-1178)
   - Engagement bait detection (lines 1196-1203)
   - Completeness check (lines 1205-1212)

2. **Mode definitions:** `api/config/modes.js`
   - `business_validation` enforcement rules (lines 53-61)
   - Example rules:
     ```javascript
     "ALWAYS model downside scenarios before upside",
     "SURFACE cost cascades and hidden dependencies",
     "FLAG survivability risks explicitly with timeline"
     ```

3. **Enforcement chain:** `api/core/orchestrator.js` lines 97-263
   - 6-step enforcement (lines 137-250):
     1. Drift detection
     2. Initiative enforcement
     3. Political guardrails
     4. Product validation
     5. Founder protection
     6. Vault compliance

### What determines PASS vs FAIL?

**PASS conditions:**
- `compliant = true` (line 1214)
- Occurs when `issues.length === 0`

**FAIL conditions:**
- `compliant = false`
- Any of these issues detected:

1. **Low confidence without acknowledgment** (lines 1169-1178)
   - Confidence < 0.7 AND response doesn't mention "uncertain" or "don't know"

2. **Business validation mode missing required elements** (lines 1180-1194)
   - Missing risk analysis keywords
   - Missing survival impact keywords

3. **Engagement bait detected** (lines 1196-1203)
   - Contains phrases like: "would you like me to", "should i", "want me to"

4. **Incomplete response** (lines 1205-1212)
   - Length < 100 characters
   - Ends with "?"
   - Contains "to be continued"

### Show validation logic

**Complete validation logic:**

```javascript
// FILE: api/core/orchestrator.js
// METHOD: #validateCompliance (lines 1163-1234)

async #validateCompliance(response, mode, analysis, confidence) {
  try {
    const issues = [];
    const adjustments = [];
    let adjustedResponse = response;

    // CHECK 1: Confidence validation (lines 1169-1178)
    if (confidence < 0.7 && 
        !response.includes("uncertain") && 
        !response.includes("don't know")) {
      issues.push("Low confidence without uncertainty acknowledgment");
      adjustedResponse += "\n\n⚠️ **Confidence Note:** This analysis has moderate certainty.";
      adjustments.push("Added uncertainty acknowledgment");
    }

    // CHECK 2: Business validation mode requirements (lines 1180-1194)
    if (mode === "business_validation") {
      const hasRiskAnalysis = /risk|downside|worst case|if this fails/i.test(response);
      const hasSurvivalImpact = /survival|runway|cash flow|burn rate/i.test(response);

      if (!hasRiskAnalysis) {
        issues.push("Missing risk analysis in business validation mode");
      }
      if (!hasSurvivalImpact) {
        issues.push("Missing survival impact in business validation mode");
      }
    }

    // CHECK 3: Engagement bait detection (lines 1196-1203)
    const hasEngagementBait = /would you like me to|should i|want me to|let me know if/i.test(response);
    if (hasEngagementBait) {
      issues.push("Contains engagement bait phrases");
      adjustments.push("Flagged engagement phrases for review");
    }

    // CHECK 4: Completeness check (lines 1205-1212)
    const isComplete = response.length > 100 && 
                       !response.endsWith("?") && 
                       !response.includes("to be continued");
    if (!isComplete) {
      issues.push("Response may be incomplete");
    }

    // DETERMINE PASS/FAIL (line 1214)
    const compliant = issues.length === 0;

    return {
      response: adjustedResponse,
      compliant: compliant,        // ← PASS if true, FAIL if false
      issues: issues,              // ← List of validation failures
      adjustments: adjustments     // ← Auto-corrections applied
    };
  } catch (error) {
    // Fallback on error: assume compliant
    return {
      response: response,
      compliant: true,
      issues: [],
      adjustments: []
    };
  }
}
```

**Validation result logged:**
- File: `orchestrator.js` line 395-400
- Logs: `[VALIDATION] Compliant: PASS` or `[VALIDATION] Compliant: FAIL`
- Also logs issues and adjustments if any exist

---

## Summary Flow Diagrams

### Complete Chat Request Flow

```
1. User sends message
   ↓
2. server.js /api/chat endpoint (line 173)
   ↓
3. orchestrator.processRequest() (line 267)
   ↓
4. STEP 1: Retrieve memories (line 285)
   - Calls global.memorySystem.retrieveMemory()
   - Returns memory text + token count
   ↓
5. STEP 2: Load documents if present (line 290)
   - Loads from extractedDocuments storage
   - Returns document content + token count
   ↓
6. STEP 3: Load vault if site_monkeys mode (line 300)
   - Checks global.vaultContent or vaultContext
   - Returns vault content + token count
   ↓
7. STEP 4: Assemble context (line 311)
   - Combines memory + documents + vault
   - Total token count calculated
   ↓
8. STEP 5: Semantic analysis (line 324)
   - Analyzes intent, domain, complexity
   ↓
9. STEP 6: Calculate confidence (line 336)
   - Based on analysis + context availability
   ↓
10. STEP 7: Route to AI (line 340)
    - Build system prompt
    - Build context string with memories/docs/vault
    - Send to Claude or GPT-4
    - Track tokens via tokenTracker.trackApiCall()
    ↓
11. STEP 8: Apply personality (line 354)
    - Eli or Roxy framework enhancement
    ↓
12. STEP 9: Run enforcement chain (line 369)
    - 6 enforcement modules
    ↓
13. STEP 10: Validate compliance (line 388)
    - Check for required elements
    - PASS or FAIL determination
    ↓
14. STEP 11: Return response (line 414)
    - Includes metadata with costs, tokens, validation
    ↓
15. Store conversation in memory (line 220)
    - Save user message + AI response
    ↓
16. Send response to frontend (line 239)
```

### Memory Storage and Retrieval Flow

```
STORAGE (after each chat):
server.js line 220 → global.memorySystem.storeMemory(userId, message, response)
   ↓
categories/memory/internal/core.js → Store in PostgreSQL
   ↓
persistent_memories table with category classification

RETRIEVAL (at start of each chat):
orchestrator.js line 285 → #retrieveMemoryContext(userId, message)
   ↓
global.memorySystem.retrieveMemory(userId, message)
   ↓
Database query for relevant memories
   ↓
Returns formatted memory text + token count
   ↓
Assembled into AI prompt context
```

---

## Key Files Reference

| Feature | Primary File | Lines |
|---------|-------------|-------|
| Vault Loading (Frontend) | `/public/js/app.js` | 1-100 |
| Vault Loading (Backend) | `/api/core/orchestrator.js` | 625-656 |
| Vault Business Logic | `/api/lib/vault.js` | 1-388 |
| Token Tracking | `/api/lib/tokenTracker.js` | 57-189 |
| Memory Retrieval | `/api/core/orchestrator.js` | 499-576 |
| Memory Storage | `/api/categories/memory/internal/core.js` | - |
| Document Upload | `/api/upload-for-analysis.js` | 363-527 |
| Document Loading | `/api/core/orchestrator.js` | 580-621 |
| Validation Rules | `/api/core/orchestrator.js` | 1163-1234 |
| Mode Definitions | `/api/config/modes.js` | 1-126 |
| Prompt Construction | `/api/core/orchestrator.js` | 1265-1400 |
| Main Chat Endpoint | `/server.js` | 173-249 |

---

## Notes

1. **Token tracking is backend-only** - No frontend display exists yet. The data is available in API responses but not rendered in the UI.

2. **Vault loading is mode-dependent** - Only works in `site_monkeys` mode. Other modes will skip vault loading entirely.

3. **Document storage is temporary** - Documents are stored in memory only, cleaned up after 10 minutes or when limit (100 docs) is reached.

4. **Document storage/retrieval mismatch** - Upload stores documents in Map with `"latest"` key (`extractedDocuments.set("latest", {...})`), but orchestrator tries to access as array (`extractedDocuments[sessionId]`). This may prevent documents from being properly loaded into AI context.

5. **Validation is automatic** - All responses go through validation after enforcement chain, but validation failures don't block response (they're logged and flagged).

6. **Memory is persistent** - Unlike documents and vault (in-memory), conversation memories are stored in PostgreSQL database.

7. **Cost tracking exists** - Backend tracks all token costs but frontend doesn't display this information yet.
