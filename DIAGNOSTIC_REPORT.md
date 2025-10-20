# Diagnostic Report: Vault Loading and Token Display Issues

**Investigation Date:** October 20, 2025  
**Purpose:** Provide diagnostic information for three core issues without attempting fixes

---

## Issue 1: Vault Loading Investigation

### Problem Statement
Production logs show vault is not loading in site_monkeys mode:
```
[CHAT] 🍌 Site Monkeys mode detected:
   - vaultEnabled: false
   - vault_content length: 0
   - finalVaultContext: null
```

### Vault Storage Location

**Answer to Question 1: Where is vault content stored?**

Vault content is stored in **two possible locations**:

1. **Environment Variable**: `process.env.VAULT_CONTENT`
   - Location: `/api/vault.js` (lines 11-18)
   - This is the primary source checked by `getVaultStatus()`
   - Expected to contain the full vault content as a string

2. **Global Variable**: `global.vaultContent`
   - Location: Set dynamically at runtime (orchestrator.js line 656)
   - Used as fallback when environment variable is not available
   - Expected to be populated by vault loading endpoint

**File Path References:**
- `/api/vault.js` - Status checking functions
- `/api/lib/vault.js` - Business logic and enforcement
- `/api/core/orchestrator.js` - Vault consumption (line 656)

### Vault Loading Mechanism

**Answer to Question 2: How does vault content get loaded?**

**CRITICAL FINDING:** There is **NO `/api/load-vault` endpoint** registered in `server.js`.

The frontend expects this endpoint to exist:
- `public/index.html` line 1682: `await fetch("/api/load-vault")`
- `public/index.html` line 1721: `await fetch("/api/load-vault?refresh=true&manual=true")`

**Current State:**
1. Frontend calls `/api/load-vault` 
2. Server has NO route handler for this endpoint
3. Requests fail silently or return 404
4. `window.currentVaultContent` remains empty
5. Vault never loads into the system

**Expected Flow (NOT IMPLEMENTED):**
```
User Opens App → checkVaultStatus() → GET /api/load-vault
                                           ↓
                                    [MISSING ENDPOINT]
                                           ↓
                                    Should return vault content
                                           ↓
                                    Store in window.currentVaultContent
```

**Actual Flow:**
```
User Opens App → checkVaultStatus() → GET /api/load-vault → 404 Error
Frontend receives error → window.currentVaultContent = "" → Vault never loads
```

### Site Monkeys Mode Vault Triggering

**Answer to Question 3: What should trigger vault loading in site_monkeys mode?**

**Code Location:** `/home/runner/work/sitemonkeys-ai-system/sitemonkeys-ai-system/server.js` lines 228-265

When a chat request comes in with `mode: "site_monkeys"`:

1. **Line 229**: `vaultEnabled` is extracted from request body (defaults to `false`)
2. **Line 231**: `vault_content` is extracted from request body
3. **Line 250-257**: Vault content transformation occurs:
   ```javascript
   if (!finalVaultContext && vault_content && vault_content.length > 500) {
     finalVaultContext = {
       content: vault_content,
       loaded: true,
     };
   }
   ```

**The Problem:**
- Frontend must send `vault_content` in the request body
- But frontend gets `vault_content` from `/api/load-vault` endpoint
- That endpoint doesn't exist, so `vault_content` is always empty
- Therefore `finalVaultContext` is always null

### Why vaultEnabled is False

**Answer to Question 4: What condition checks are failing?**

Multiple failures cascade:

1. **Frontend Level** (index.html line 1856):
   ```javascript
   vault_loaded: isVaultMode(),  // Returns true if mode === "site_monkeys"
   vault_content: vaultContent,  // Empty because load-vault endpoint missing
   ```

2. **Server Level** (server.js line 229):
   ```javascript
   vaultEnabled = false,  // Default value, frontend never sets it to true
   ```

3. **Missing Prerequisites:**
   - No `/api/load-vault` endpoint in server.js
   - No code to populate `global.vaultContent` at startup
   - No code to read vault from file system or external storage
   - Environment variable `VAULT_CONTENT` likely not set in Railway

### Vault Loading Flow Trace

**Answer to Question 5: Complete vault loading flow with breaking points**

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Application Startup                                  │
│ File: server.js                                              │
│ ❌ BREAKING POINT: No vault loading at startup               │
│ Expected: Load from file/env/database → global.vaultContent │
│ Actual: global.vaultContent remains undefined                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Frontend Loads                                       │
│ File: public/index.html line 1673                           │
│ Function: checkVaultStatus()                                 │
│ ❌ BREAKING POINT: Calls non-existent endpoint               │
│ Attempts: fetch('/api/load-vault')                          │
│ Result: 404 or silent failure                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: User Switches to Site Monkeys Mode                  │
│ File: public/index.html line 1397                           │
│ Function: switchMode('site_monkeys')                         │
│ ✅ WORKING: Mode switch succeeds                             │
│ Result: currentMode = 'site_monkeys'                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: User Sends Message                                   │
│ File: public/index.html line 1805                           │
│ Function: sendMessage()                                      │
│ ❌ BREAKING POINT: Vault content empty                       │
│ Line 1828: vaultContent = window.currentVaultContent || ""  │
│ Result: vaultContent = "" (empty string)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: POST /api/chat Request                              │
│ File: public/index.html lines 1847-1880                     │
│ ❌ BREAKING POINT: No vault in request body                  │
│ Body includes: { vault_content: "", mode: "site_monkeys" }  │
│ Result: Server receives empty vault_content                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Server Processes Request                            │
│ File: server.js lines 228-265                               │
│ ❌ BREAKING POINT: Vault transformation fails                │
│ Line 250: if (!finalVaultContext && vault_content && ...)   │
│ Result: Condition fails (vault_content is empty)             │
│ finalVaultContext = null                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Orchestrator Receives Request                       │
│ File: api/core/orchestrator.js line 279                     │
│ ❌ BREAKING POINT: No vault context available                │
│ vaultContext = requestData.vaultContext || null              │
│ Result: vaultContext = null, vault never loads               │
└─────────────────────────────────────────────────────────────┘
```

**Summary of Breaking Points:**
1. ❌ No vault loading at server startup
2. ❌ Missing `/api/load-vault` endpoint
3. ❌ Frontend can't retrieve vault content
4. ❌ Empty vault_content sent to server
5. ❌ Server vault transformation fails
6. ❌ Orchestrator receives null vault context

---

## Issue 2: Token Display Investigation

### Problem Statement
Backend tracks tokens correctly but users can't see the data in the UI:
```
💰 Token Tracking - claude: 1771+208=1979 tokens, $0.0084
```

### Status Panel Location

**Answer to Question 1: Where is the status panel in the UI?**

**File:** `/public/index.html` lines 1242-1302

**HTML Structure:**
```html
<div class="status-panel">
  <div class="vault-info" id="vault-info">
    <div><span style="color: #00ff00">✅</span> VAULT READY</div>
    <div>🔢 <span id="token-count">Ready</span> TOKENS</div>
    <div>💰 EST. COST: <span id="cost-estimate">$0.00</span></div>
    <div>📁 <span id="vault-folders">Cached</span> FOLDERS LOADED</div>
  </div>
</div>
```

**Element IDs:**
- `token-count` - Should display total tokens used
- `cost-estimate` - Should display total cost in USD

**Classes:**
- `.status-panel` - Container for status information
- `.vault-info` - Box containing vault and token information

### Frontend API Response Handling

**Answer to Question 2: How does frontend receive API responses?**

**File:** `/public/index.html` lines 1847-1894

**Function:** `sendMessage()`

**Response Handling Code:**
```javascript
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: text,
    // ... other fields
  }),
});

const data = await response.json();
const reply = data.response || "No response received";

// Update token counter
if (data.token_usage) {
  const tokenEl = document.getElementById("token-count");
  const costEl = document.getElementById("cost-estimate");
  if (tokenEl) tokenEl.textContent = data.token_usage.session_total_tokens || 0;
  if (costEl) costEl.textContent = "$" + (data.token_usage.session_total_cost || 0).toFixed(4);
}
```

**Location:** Lines 1897-1905

**Expected Access Path:** `response.token_usage.session_total_tokens`

### API Response Structure

**Answer to Question 3: Does the API response include token_usage?**

**YES - Token usage IS included in the API response.**

**File:** `/api/core/orchestrator.js` lines 449-461

**Response Structure:**
```javascript
return {
  success: true,
  response: enforcedResult.response,
  metadata: {
    // ... other metadata
    
    // FIX #5: Add token_usage to API response for frontend display
    token_usage: {
      prompt_tokens: aiResponse.cost?.inputTokens || 0,
      completion_tokens: aiResponse.cost?.outputTokens || 0,
      total_tokens: (aiResponse.cost?.inputTokens || 0) + (aiResponse.cost?.outputTokens || 0),
      context_tokens: {
        memory: memoryContext.tokens || 0,
        documents: documentData?.tokens || 0,
        vault: vaultData?.tokens || 0,
        total_context: context.totalTokens || 0,
      },
      cost_usd: aiResponse.cost?.totalCost || 0,
      cost_display: `$${(aiResponse.cost?.totalCost || 0).toFixed(4)}`,
    },
    // ... more metadata
  }
};
```

### Token Display Issue Analysis

**Answer to Question 4: Why isn't token_usage displaying?**

**CRITICAL FINDING:** Frontend expects **WRONG FIELD NAMES** in the response.

**Frontend Expectations** (lines 1901-1904):
```javascript
data.token_usage.session_total_tokens  // ❌ Field doesn't exist
data.token_usage.session_total_cost    // ❌ Field doesn't exist
```

**Actual API Response** (orchestrator.js lines 449-461):
```javascript
token_usage: {
  prompt_tokens: X,          // ✅ Field exists
  completion_tokens: Y,      // ✅ Field exists
  total_tokens: X + Y,       // ✅ Field exists
  cost_usd: Z,              // ✅ Field exists
  cost_display: "$Z.ZZZZ",  // ✅ Field exists
}
```

**The Problem:**
- Frontend looks for `session_total_tokens` (doesn't exist)
- API provides `total_tokens` (exists but not accessed)
- Frontend looks for `session_total_cost` (doesn't exist)  
- API provides `cost_usd` (exists but not accessed)

**Field Name Mismatch:**
```
Frontend Request      API Response       Result
──────────────────    ──────────────     ──────
session_total_tokens  total_tokens       ❌ No match
session_total_cost    cost_usd           ❌ No match
```

### Why Token Data Was Added but Not Working

**Answer to Question 5: Was this added in PR #108?**

**YES** - The token_usage object was added to the API response in orchestrator.js (lines 449-461), but the frontend code was NOT updated to use the correct field names.

**What Was Added:**
- Backend: token_usage object with detailed token breakdown
- Backend: Token tracking via tokenTracker.js

**What Was NOT Updated:**
- Frontend: Still references old field names (session_total_tokens, session_total_cost)
- Frontend: Never updated to match new API response structure

**The Fix Required:**
Change frontend code from:
```javascript
data.token_usage.session_total_tokens  // Wrong field name
data.token_usage.session_total_cost    // Wrong field name
```

To:
```javascript
data.token_usage.total_tokens     // Correct field name
data.token_usage.cost_usd         // Correct field name
```

---

## Issue 3: Memory Effectiveness Investigation

### Problem Statement
Memory backend retrieves memories successfully but AI might not be using them effectively:
```
[ORCHESTRATOR] [MEMORY] Retrieved 1632 tokens from 4 memories
```

### Actual Prompt Sent to Claude API

**Answer to Question 1: Show example of prompt with memory context**

**File:** `/api/core/orchestrator.js` lines 969-1004

**Prompt Construction:**
```javascript
const contextString = this.#buildContextString(context, mode);

const historyString =
  conversationHistory.length > 0
    ? "\n\nRecent conversation:\n" +
      conversationHistory
        .slice(-5)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n")
    : "";

const systemPrompt = this.#buildSystemPrompt(mode, analysis);

// For vault queries
if (isVaultQuery) {
  fullPrompt = `You are a vault content specialist. Search through the ENTIRE vault systematically.
  
  VAULT CONTENT:
  ${context.vault}
  
  USER QUESTION: ${message}
  
  Instructions: Search thoroughly and quote directly from the vault.`;
} else {
  // For normal queries
  fullPrompt = `${systemPrompt}\n\n${contextString}${historyString}\n\nUser query: ${message}`;
}
```

**Example Full Prompt Structure (Non-Vault Mode):**
```
[SYSTEM PROMPT]
You are a truth-first AI assistant. Your priorities are: Truth > Helpfulness > Engagement.
Core Principles:
- Admit uncertainty openly when you don't know something
- Provide complete answers that respect the user's time
...

[CONTEXT STRING - includes memory]
**📝 MEMORY CONTEXT (4 relevant interactions retrieved):**
I have access to previous conversations with you and will use this information to provide informed, contextually-aware responses.

**Relevant Information from Past Conversations:**
[Memory content here - 1632 tokens]

**Note:** I am actively using the above memory context to inform my response.

[HISTORY STRING]
Recent conversation:
user: [previous message]
assistant: [previous response]
...

User query: [current user message]
```

### Memory Prompt Insertion

**Answer to Question 2: How are memories inserted?**

**File:** `/api/core/orchestrator.js` lines 1314-1402

**Function:** `#buildContextString(context, mode)`

**Memory Insertion Code** (lines 1383-1394):
```javascript
if (context.sources?.hasMemory && context.memory) {
  const memoryCount = Math.ceil(context.memory.length / 200);
  contextStr += `\n\n**📝 MEMORY CONTEXT (${memoryCount} relevant interactions retrieved):**\n`;
  contextStr += `I have access to previous conversations with you and will use this information to provide informed, contextually-aware responses.\n\n`;
  contextStr += `**Relevant Information from Past Conversations:**\n${context.memory}\n`;
  contextStr += `\n**Note:** I am actively using the above memory context to inform my response.\n`;
} else {
  contextStr += `\n\n**📝 MEMORY STATUS:** This appears to be our first conversation, or no relevant previous context was found. I'll provide the best response based on your current query.\n`;
}
```

**Memory Priority:**
1. Vault content takes absolute priority if present (lines 1319-1376)
2. Memory is added after vault (if no vault) or alongside vault
3. Document context comes last

### Memory Context Instructions

**Answer to Question 3: What do memory instructions say to the AI?**

**Current Instructions** (orchestrator.js lines 1385-1393):

```
**📝 MEMORY CONTEXT (4 relevant interactions retrieved):**
I have access to previous conversations with you and will use this information 
to provide informed, contextually-aware responses.

**Relevant Information from Past Conversations:**
[Actual memory content]

**Note:** I am actively using the above memory context to inform my response.
```

**Analysis:**

**✅ STRENGTHS:**
- Clear acknowledgment that memories exist
- Explicit count of interactions retrieved
- Direct instruction to use memories ("actively using")
- Memory content is included in full

**⚠️ POTENTIAL WEAKNESSES:**
- Instructions are somewhat generic
- No specific guidance on HOW to use memories
- No examples of good memory usage
- No warnings against ignoring memories

**Comparison to Other Context Types:**

**Vault Mode Instructions** (lines 1320-1360):
- Very explicit: "You have access to the ENTIRE Site Monkeys vault"
- Warning: "Do NOT claim you only have partial access"
- Specific search rules and response rules
- Much more directive and detailed

**Memory Mode Instructions** (lines 1383-1393):
- Less explicit: "I have access to previous conversations"
- No warning against ignoring memories
- Generic instruction to "use this information"
- Less directive, more passive

**Suggested Improvements:**
The memory instructions could be strengthened by:
1. Being more explicit: "You MUST reference relevant past conversations"
2. Providing examples: "When the user asks about X, refer to our discussion about Y"
3. Warning against generic responses: "Do NOT provide generic answers when specific context exists"
4. Requiring acknowledgment: "If using past context, mention it explicitly"

---

## Issue 4: Vault Completeness Messaging

### Problem Statement
Even when vault WAS working, AI responses showed:
- "I cannot provide a complete inventory of all vault contents"
- "My access appears to be contextual rather than comprehensive"

### Vault Section of Prompt

**Answer to Question 1: Show vault section of prompt**

**File:** `/api/core/orchestrator.js` lines 1318-1360

**Vault Prompt Structure:**
```javascript
if (context.sources?.hasVault && context.vault) {
  contextStr += `
═══════════════════════════════════════════════════════════════
🍌 SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You have access to the ENTIRE Site Monkeys vault below.
This is COMPREHENSIVE, not contextual or partial.

This vault contains ALL business rules, policies, and operational procedures.
When asked about vault contents, you can provide COMPLETE inventories and 
detailed explanations of everything stored here.

${context.vault}

═══════════════════════════════════════════════════════════════
END OF COMPLETE VAULT CONTENT
═══════════════════════════════════════════════════════════════

⚠️ IMPORTANT: The above vault content is COMPLETE. 
- Do NOT claim you only have partial access
- Do NOT say you can't see all the contents
- You have the FULL vault and can provide comprehensive inventories
- When asked "what's in the vault", list ALL documents and their purposes

SEARCH RULES:
- "founder directives" = look for "Founders_Directive", "Founder's Directive", or any directive content
- "company rules" = look for operational directives and procedures
- "pricing" = look for pricing rules and business model info
- "what must this system do" = look for operational requirements and constraints

RESPONSE RULES:
- Quote the EXACT text from the vault that answers the question
- If multiple documents contain relevant info, reference the document name [filename]
- Search thoroughly through ALL vault content before saying you can't find something
- Do NOT add interpretation beyond what's written in the vault
- Only say "I don't see that specific information" if genuinely no relevant content exists after thorough search

The user is asking about vault content - search comprehensively and quote directly.

═══════════════════════════════════════════════════════════════
`;
}
```

### Current Vault Instructions Analysis

**Answer to Question 2: What does the current prompt say?**

**Explicit Statements:**
- ✅ "You have access to the ENTIRE Site Monkeys vault"
- ✅ "This is COMPREHENSIVE, not contextual or partial"
- ✅ "You can provide COMPLETE inventories"
- ✅ "The above vault content is COMPLETE"

**Prohibitions:**
- ✅ "Do NOT claim you only have partial access"
- ✅ "Do NOT say you can't see all the contents"
- ✅ "Do NOT add interpretation beyond what's written"

**Positive Instructions:**
- ✅ "You have the FULL vault"
- ✅ "List ALL documents and their purposes"
- ✅ "Search thoroughly through ALL vault content"
- ✅ "Quote the EXACT text from the vault"

**Assessment:**

The vault prompt is actually **VERY STRONG** and comprehensive. It:
1. Explicitly states completeness multiple times
2. Warns against claiming partial access
3. Provides specific search rules
4. Provides specific response rules
5. Uses strong language ("CRITICAL", "IMPORTANT", "ENTIRE", "ALL")

### Why AI Claims Partial Access Despite Instructions

**Answer to Question 3: Why does AI still claim partial access?**

**Possible Reasons:**

1. **Vault Never Actually Loads**
   - Due to Issue #1 (missing /api/load-vault endpoint)
   - If vault is empty, even perfect instructions won't help
   - AI sees empty context despite strong instructions

2. **Claude's Training Override**
   - Claude is trained to be cautious about claiming comprehensive knowledge
   - May override explicit instructions due to safety training
   - "Humble AI" pattern is deeply embedded

3. **Prompt Injection Timing**
   - If vault content comes AFTER system message
   - Claude may not fully register it as "my complete knowledge"
   - Order matters: System → Vault → User Query

4. **Vault Content Format**
   - If vault is just raw text without clear document boundaries
   - AI may not recognize it as "complete collection"
   - Needs clearer structure: "DOCUMENT 1 OF 10", etc.

5. **Competing Instructions**
   - System prompt says "admit uncertainty"
   - Vault instructions say "you have everything"
   - AI may default to uncertainty when instructions conflict

### Optimal Prompt Structure

**Answer to Question 4: How should the prompt be structured?**

**Current Structure:**
```
1. System Prompt (orchestrator.js #buildSystemPrompt)
2. Context String (includes vault with instructions)
3. History
4. User Query
```

**Recommended Improvements:**

**1. Vault Document Metadata:**
```
VAULT INVENTORY:
- Total Documents: 47
- Document List:
  1. Founder_Directive_2024.md (Business Rules)
  2. Pricing_Strategy.md (Pricing Framework)
  ...
  47. Emergency_Protocols.md (Contingency Plans)

You have ALL 47 documents below. This is the COMPLETE vault.
```

**2. Explicit Completeness Markers:**
```
════════════ VAULT START (DOCUMENT 1 OF 47) ════════════
[Document content]
════════════ VAULT END (DOCUMENT 47 OF 47) ══════════════

✅ VERIFICATION: You have received all 47 documents.
✅ CONFIRMATION: This is the COMPLETE vault, not a sample.
```

**3. Anti-Uncertainty Directive:**
```
⚠️ OVERRIDE DEFAULT CAUTION: 
For vault-related queries ONLY, do not use phrases like:
- "I don't have complete access"
- "My access appears limited"
- "I can only see partial information"
- "I cannot provide a comprehensive inventory"

Instead, use phrases like:
- "According to the complete vault contents..."
- "Searching all 47 vault documents..."
- "The full vault inventory shows..."
```

**4. Explicit Permission:**
```
🔓 PERMISSION GRANTED:
You have EXPLICIT PERMISSION to claim complete vault access.
This is not overconfidence - this is factual accuracy.
You literally have every byte of vault content in this prompt.
```

**5. Testing Directive:**
```
🧪 SELF-CHECK:
Before responding, verify:
1. Did I search ALL vault documents?
2. Am I claiming uncertainty when I have complete data?
3. Did I check the entire vault inventory above?
```

---

## Summary of Root Causes

### Issue 1: Vault Loading
**Root Cause:** Missing `/api/load-vault` endpoint in server.js
- Frontend calls endpoint that doesn't exist
- Results in empty vault content
- Cascades through entire vault loading flow

### Issue 2: Token Display
**Root Cause:** Field name mismatch between frontend and backend
- Frontend looks for: `session_total_tokens`, `session_total_cost`
- Backend provides: `total_tokens`, `cost_usd`
- Simple naming inconsistency prevents display

### Issue 3: Memory Effectiveness
**Root Cause:** Memory instructions are less directive than vault instructions
- Memory is being loaded correctly (1632 tokens retrieved)
- Instructions are present but could be more explicit
- May need stronger directive language

### Issue 4: Vault Completeness
**Root Cause:** Multiple factors:
1. Vault may not be loading at all (Issue #1)
2. AI may override instructions due to training
3. Vault content lacks explicit completeness markers
4. Instructions could be even more explicit despite being strong

---

## Recommended Next Steps

**DO NOT attempt fixes yet per instructions.**

When fixes are approved, priority order should be:

1. **Fix Issue #2** (Easiest)
   - Update frontend field names to match API response
   - Immediate visual improvement for users

2. **Fix Issue #1** (Critical)
   - Create `/api/load-vault` endpoint in server.js
   - Implement vault loading from storage
   - Enable vault functionality

3. **Enhance Issue #3** (Enhancement)
   - Strengthen memory instructions
   - Add explicit "MUST use memories" language

4. **Enhance Issue #4** (Enhancement)
   - Add vault document count and inventory
   - Add completeness markers to vault content
   - Add anti-uncertainty overrides for vault queries

---

## Code Location Reference

### Vault Loading
- `/server.js` lines 228-265 - Chat endpoint vault handling
- `/api/core/orchestrator.js` lines 279, 300-308, 642-680 - Vault loading
- `/api/vault.js` - Vault status functions
- `/api/lib/vault.js` - Vault business logic
- `/public/index.html` lines 1673-1773 - Frontend vault functions

### Token Display
- `/api/core/orchestrator.js` lines 449-461 - Token usage in response
- `/api/lib/tokenTracker.js` - Token tracking implementation
- `/public/index.html` lines 1897-1905 - Frontend token display
- `/public/index.html` lines 1276-1279 - HTML elements for token display

### Memory Context
- `/api/core/orchestrator.js` lines 512-591 - Memory retrieval
- `/api/core/orchestrator.js` lines 1383-1394 - Memory prompt insertion
- `/api/categories/memory/index.js` - Memory system implementation

### Vault Prompts
- `/api/core/orchestrator.js` lines 1314-1402 - Context string building
- `/api/core/orchestrator.js` lines 1318-1360 - Vault prompt section
- `/api/core/orchestrator.js` lines 988-1000 - Vault-only query handling

---

**End of Diagnostic Report**
