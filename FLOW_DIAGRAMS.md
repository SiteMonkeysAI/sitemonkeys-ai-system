# Visual Flow Diagrams for Diagnostic Issues

## Issue 1: Vault Loading Flow (Complete Breakdown)

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SERVER STARTUP (server.js)                        │
│                                                                        │
│  Expected: Load vault from file/database/env → global.vaultContent   │
│  Actual: ❌ NO VAULT LOADING CODE EXISTS                              │
│                                                                        │
│  Result: global.vaultContent = undefined                              │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│               FRONTEND LOADS (public/index.html:1673)                 │
│                                                                        │
│  checkVaultStatus() → fetch('/api/load-vault')                       │
│                            ↓                                          │
│                      ❌ 404 ERROR                                      │
│                   (Endpoint doesn't exist)                            │
│                            ↓                                          │
│  window.currentVaultContent = "" (empty)                              │
│  Vault UI shows: "VAULT NEEDS REFRESH"                               │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│            USER CLICKS "Site Monkeys" MODE BUTTON                     │
│                     (index.html:1397)                                 │
│                                                                        │
│  switchMode('site_monkeys')                                           │
│  ✅ Success: currentMode = 'site_monkeys'                             │
│  Mode button becomes active (gray background)                         │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│               USER TYPES MESSAGE AND CLICKS SEND                      │
│                     (index.html:1805)                                 │
│                                                                        │
│  sendMessage() function executes                                      │
│                            ↓                                          │
│  Line 1828: vaultContent = window.currentVaultContent || ""          │
│  ❌ Result: vaultContent = "" (empty string)                          │
│                            ↓                                          │
│  Prepares POST request to /api/chat                                   │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│              FRONTEND SENDS REQUEST (index.html:1847)                 │
│                                                                        │
│  POST /api/chat                                                       │
│  {                                                                    │
│    message: "What pricing rules do we have?",                        │
│    mode: "site_monkeys",                                              │
│    vault_loaded: true,                                                │
│    vault_content: "",  ← ❌ EMPTY!                                    │
│    ...                                                                │
│  }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│           SERVER RECEIVES REQUEST (server.js:216)                     │
│                                                                        │
│  app.post('/api/chat', async (req, res) => {                         │
│    const { vault_content } = req.body;                                │
│    // vault_content = "" (empty)                                     │
│                            ↓                                          │
│    Line 250: if (!finalVaultContext && vault_content &&              │
│                  vault_content.length > 500) {                        │
│      // ❌ Condition FAILS: vault_content.length = 0                 │
│      // finalVaultContext stays null                                 │
│    }                                                                  │
│                            ↓                                          │
│    Logs: "vaultEnabled: false"                                       │
│    Logs: "vault_content length: 0"                                   │
│    Logs: "finalVaultContext: null"                                   │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│        ORCHESTRATOR PROCESSES REQUEST (orchestrator.js:267)           │
│                                                                        │
│  async processRequest(requestData) {                                  │
│    const vaultContext = requestData.vaultContext || null;            │
│    // ❌ vaultContext = null                                          │
│                            ↓                                          │
│    Line 303: const vaultData = vaultContext                           │
│      ? await this.#loadVaultContext(vaultContext)                    │
│      : mode === 'site_monkeys' && vaultEnabled                       │
│        ? await this.#loadVaultContext(userId, sessionId)              │
│        : null;                                                        │
│    // ❌ All conditions fail, vaultData = null                        │
│                            ↓                                          │
│    Logs: "[VAULT] Not available"                                     │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│             AI RESPONSE GENERATED WITHOUT VAULT                       │
│                                                                        │
│  AI responds based on general knowledge only                          │
│  No business rules applied                                            │
│  No founder directives enforced                                       │
│  ❌ Site Monkeys mode effectively broken                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Breaking Points Summary

| Step | Location | Problem | Impact |
|------|----------|---------|--------|
| 1 | Server startup | No vault loading code | global.vaultContent undefined |
| 2 | Frontend checkVaultStatus() | Calls non-existent /api/load-vault | 404 error, empty vault |
| 3 | Frontend sendMessage() | Uses empty window.currentVaultContent | Sends empty vault_content |
| 4 | Server vault transformation | Checks vault_content.length > 500 | Fails because length = 0 |
| 5 | Orchestrator loadVaultContext | Receives null vaultContext | Returns null vaultData |
| 6 | AI generation | No vault available | Generic response, no rules |

---

## Issue 2: Token Display Flow (Field Name Mismatch)

```
┌──────────────────────────────────────────────────────────────────────┐
│          BACKEND: TOKEN TRACKING (tokenTracker.js:57)                │
│                                                                        │
│  trackApiCall(personality, promptTokens, completionTokens)            │
│  ✅ Tracks: claude: 1771+208=1979 tokens, $0.0084                    │
│  ✅ Stores in sessionData                                             │
│  Console log: "💰 Token Tracking - claude: 1771+208=1979..."         │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│      BACKEND: API RESPONSE BUILDING (orchestrator.js:414)            │
│                                                                        │
│  return {                                                             │
│    success: true,                                                     │
│    response: "...",                                                   │
│    metadata: {                                                        │
│      token_usage: {                                                   │
│        prompt_tokens: 1771,          ← ✅ Field name                 │
│        completion_tokens: 208,       ← ✅ Field name                 │
│        total_tokens: 1979,           ← ✅ Field name                 │
│        cost_usd: 0.0084,             ← ✅ Field name                 │
│        cost_display: "$0.0084"       ← ✅ Field name                 │
│      }                                                                │
│    }                                                                  │
│  }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│            FRONTEND: RECEIVES RESPONSE (index.html:1893)              │
│                                                                        │
│  const data = await response.json();                                  │
│  // data.token_usage exists ✅                                        │
│  // data.token_usage.total_tokens = 1979 ✅                          │
│  // data.token_usage.cost_usd = 0.0084 ✅                            │
│                                                                        │
│  Console shows: Response received successfully                        │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│          FRONTEND: TOKEN DISPLAY CODE (index.html:1897)              │
│                                                                        │
│  if (data.token_usage) {  // ✅ Condition passes                     │
│    const tokenEl = document.getElementById("token-count");            │
│    const costEl = document.getElementById("cost-estimate");           │
│                                                                        │
│    if (tokenEl)                                                       │
│      tokenEl.textContent =                                            │
│        data.token_usage.session_total_tokens || 0;                   │
│        ↑                 ↑                                            │
│        ✅ Element exists  ❌ FIELD DOESN'T EXIST!                      │
│                                                                        │
│    if (costEl)                                                        │
│      costEl.textContent =                                             │
│        "$" + (data.token_usage.session_total_cost || 0).toFixed(4);  │
│               ↑                  ↑                                    │
│               ✅ Element exists   ❌ FIELD DOESN'T EXIST!              │
│  }                                                                    │
│                                                                        │
│  Result:                                                              │
│  - tokenEl.textContent = 0 (because undefined || 0 = 0)              │
│  - costEl.textContent = "$0.0000" (because (undefined || 0) = 0)     │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    UI DISPLAYS WRONG VALUES                           │
│                                                                        │
│  🔢 0 TOKENS                   ← ❌ Should be 1979                    │
│  💰 EST. COST: $0.0000         ← ❌ Should be $0.0084                │
│                                                                        │
│  User sees: No token usage (looks broken)                            │
│  Reality: Token data exists but wrong field names used               │
└──────────────────────────────────────────────────────────────────────┘
```

### Field Name Mapping

| Frontend Request | Backend Response | Result |
|-----------------|------------------|--------|
| `session_total_tokens` | `total_tokens` | ❌ Mismatch |
| `session_total_cost` | `cost_usd` | ❌ Mismatch |
| - | `prompt_tokens` | ⚠️ Not accessed |
| - | `completion_tokens` | ⚠️ Not accessed |
| - | `cost_display` | ⚠️ Not accessed |

### The Fix (Not Implemented Yet)

```javascript
// CURRENT (WRONG):
data.token_usage.session_total_tokens  // undefined
data.token_usage.session_total_cost    // undefined

// SHOULD BE (CORRECT):
data.token_usage.total_tokens          // 1979
data.token_usage.cost_usd              // 0.0084
```

---

## Issue 3: Memory Context Flow (Working but Could Be Better)

```
┌──────────────────────────────────────────────────────────────────────┐
│       USER SENDS MESSAGE → ORCHESTRATOR RETRIEVES MEMORY              │
│                    (orchestrator.js:514)                              │
│                                                                        │
│  #retrieveMemoryContext(userId, message)                              │
│  ✅ Calls global.memorySystem.retrieveMemory()                        │
│  ✅ Success: Retrieved 4 memories, 1632 tokens                        │
│  Console: "[MEMORY] Retrieved 1632 tokens from 4 memories"           │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│          ORCHESTRATOR BUILDS CONTEXT (orchestrator.js:1383)           │
│                                                                        │
│  #buildContextString(context, mode) {                                 │
│    if (context.sources?.hasMemory && context.memory) {                │
│      contextStr += `                                                  │
│                                                                        │
│ **📝 MEMORY CONTEXT (4 relevant interactions retrieved):**           │
│ I have access to previous conversations with you and will use        │
│ this information to provide informed, contextually-aware responses.  │
│                                                                        │
│ **Relevant Information from Past Conversations:**                    │
│ [1632 tokens of actual memory content]                               │
│                                                                        │
│ **Note:** I am actively using the above memory context               │
│ to inform my response.                                                │
│      `;                                                               │
│    }                                                                  │
│  }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│            FULL PROMPT SENT TO CLAUDE API                             │
│                  (orchestrator.js:1004)                               │
│                                                                        │
│  System Prompt:                                                       │
│  "You are a truth-first AI assistant..."                             │
│  "Admit uncertainty openly when you don't know something"            │
│                                                                        │
│  Context:                                                             │
│  **📝 MEMORY CONTEXT (4 relevant interactions retrieved):**          │
│  [memory content here]                                                │
│                                                                        │
│  User Query:                                                          │
│  "What did we discuss about pricing last time?"                      │
│                                                                        │
│  ⚠️ POTENTIAL ISSUE:                                                  │
│  Memory instructions are present but somewhat generic                │
│  "I will use this information" vs "I MUST use this information"      │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    CLAUDE GENERATES RESPONSE                          │
│                                                                        │
│  ✅ Memory is available in context (1632 tokens)                     │
│  ⚠️ Instructions are somewhat passive:                                │
│     - "I have access to previous conversations"                      │
│     - "I will use this information"                                   │
│     - "I am actively using the above memory context"                 │
│                                                                        │
│  Compare to VAULT instructions (much stronger):                       │
│     - "You have access to the ENTIRE vault"                          │
│     - "Do NOT claim you only have partial access"                    │
│     - "You MUST search thoroughly"                                    │
│     - "Quote EXACT text from the vault"                              │
│                                                                        │
│  Result: AI MAY use memories but not REQUIRED to                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Memory vs Vault Instructions Comparison

| Aspect | Memory Instructions | Vault Instructions |
|--------|-------------------|-------------------|
| **Explicitness** | "I have access" | "You have the ENTIRE vault" |
| **Strength** | "I will use" | "Do NOT claim partial access" |
| **Requirements** | Suggested | Mandatory |
| **Search Rules** | None specified | Detailed search rules |
| **Response Rules** | None specified | "Quote EXACT text" |
| **Warnings** | None | "Do NOT say you can't see all" |
| **Permission** | Implied | Explicit ("You can provide COMPLETE") |

### Suggested Improvements (Not Implemented)

```
CURRENT (PASSIVE):
**📝 MEMORY CONTEXT (4 relevant interactions retrieved):**
I have access to previous conversations with you and will use this 
information to provide informed, contextually-aware responses.

SUGGESTED (DIRECTIVE):
**📝 MEMORY CONTEXT (4 relevant interactions retrieved):**
⚠️ CRITICAL: You MUST reference relevant past conversations when applicable.

RULES:
- When the user asks about something we discussed before, EXPLICITLY mention it
- Do NOT provide generic answers when specific context exists in the memories above
- If using past context, acknowledge it: "In our previous conversation about X..."
- Search ALL 4 memory interactions before claiming you don't remember something

The memories above contain COMPLETE relevant context for this query.
```

---

## Issue 4: Vault Completeness Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│              VAULT CONTENT IS LOADED (Hypothetical)                   │
│                    (orchestrator.js:656)                              │
│                                                                        │
│  Assume vault loads successfully:                                     │
│  - 47 documents                                                       │
│  - 50,000 characters                                                  │
│  - ~12,500 tokens                                                     │
│  ✅ global.vaultContent populated                                     │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│         VAULT CONTEXT BUILT (orchestrator.js:1318)                    │
│                                                                        │
│  contextStr += `                                                      │
│  ════════════════════════════════════════════════════                │
│  🍌 SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE            │
│  ════════════════════════════════════════════════════                │
│                                                                        │
│  ⚠️ CRITICAL: You have access to the ENTIRE Site Monkeys vault.      │
│  This is COMPREHENSIVE, not contextual or partial.                    │
│                                                                        │
│  ${context.vault}  ← [50,000 characters of vault content]            │
│                                                                        │
│  ⚠️ IMPORTANT: The above vault content is COMPLETE.                  │
│  - Do NOT claim you only have partial access                         │
│  - Do NOT say you can't see all the contents                         │
│  - You have the FULL vault                                            │
│  `;                                                                   │
│                                                                        │
│  ✅ Instructions are VERY STRONG                                      │
│  ✅ Multiple completeness assertions                                  │
│  ✅ Explicit prohibitions against partial claims                      │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                USER ASKS: "What's in the vault?"                      │
│                                                                        │
│  Full prompt sent to Claude:                                          │
│                                                                        │
│  System: "You are a truth-first AI assistant..."                     │
│          "Admit uncertainty openly..."  ← ⚠️ Conflict?               │
│                                                                        │
│  Vault: "You have the ENTIRE vault"                                   │
│         "Do NOT claim partial access"                                 │
│         [50,000 chars of content]                                     │
│                                                                        │
│  Query: "What's in the vault?"                                        │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    CLAUDE PROCESSES REQUEST                           │
│                                                                        │
│  Claude's Training:                                                   │
│  - Be cautious about claiming complete knowledge ✅                   │
│  - Default to uncertainty when unsure ✅                              │
│  - Avoid overconfidence ✅                                             │
│                                                                        │
│  Explicit Instructions:                                               │
│  - "You have the ENTIRE vault" ✅                                     │
│  - "Do NOT claim partial access" ✅                                   │
│  - "This is COMPREHENSIVE" ✅                                          │
│                                                                        │
│  ⚠️ TENSION: Training vs Instructions                                 │
│                                                                        │
│  Claude may think:                                                    │
│  "I see vault content in my context, but my training says            │
│   I should be cautious about claiming complete knowledge.             │
│   What if there's more vault content I don't see?                     │
│   Better to be safe and say 'partial access'."                       │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                AI RESPONSE (PROBLEMATIC)                              │
│                                                                        │
│  "I cannot provide a complete inventory of all vault contents.        │
│   My access appears to be contextual rather than comprehensive."      │
│                                                                        │
│  ❌ IGNORES EXPLICIT INSTRUCTIONS                                      │
│  ❌ DEFAULTS TO CAUTIOUS TRAINING                                      │
│  ❌ USER GETS WRONG IMPRESSION                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Why This Happens (Root Causes)

```
┌─────────────────────────────────────────────────────────────┐
│ REASON 1: Training Override                                  │
│ Claude's safety training is VERY strong                      │
│ "Admit uncertainty" is deeply embedded                       │
│ May override explicit instructions in edge cases             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REASON 2: Lack of Explicit Completeness Markers              │
│ Vault content is just raw text:                              │
│ "Founder Directive... Pricing Policy... etc."                │
│                                                               │
│ Should be:                                                    │
│ "DOCUMENT 1 OF 47: Founder Directive"                        │
│ "DOCUMENT 2 OF 47: Pricing Policy"                           │
│ "..."                                                         │
│ "DOCUMENT 47 OF 47: Emergency Protocols"                     │
│ "✅ END OF COMPLETE VAULT (ALL 47 DOCUMENTS)"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REASON 3: No Vault Inventory Summary                         │
│ Claude sees content but no metadata:                         │
│ - How many documents total?                                  │
│ - What's the complete list?                                  │
│ - Am I seeing everything or just a sample?                   │
│                                                               │
│ Should have at the top:                                      │
│ "VAULT INVENTORY: 47 total documents                         │
│  1. Founder_Directive.md                                     │
│  2. Pricing_Strategy.md                                      │
│  ...                                                          │
│  47. Emergency_Protocols.md"                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REASON 4: Competing Directives                               │
│ System prompt: "Admit uncertainty openly"                    │
│ Vault prompt: "Do NOT claim partial access"                  │
│                                                               │
│ When in doubt, Claude defaults to caution                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ REASON 5: Issue #1 (Vault Never Loads)                       │
│ If vault isn't loading at all due to missing endpoint,       │
│ then even perfect instructions won't help                    │
│ Claude sees empty vault → correctlyclaims no access          │
└─────────────────────────────────────────────────────────────┘
```

### Improved Prompt Structure (Not Implemented)

```
CURRENT STRUCTURE:
═══════════════════════════════════════════════════════════════
🍌 SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════

⚠️ CRITICAL: You have access to the ENTIRE Site Monkeys vault below.

[Vault content]

END OF COMPLETE VAULT CONTENT
═══════════════════════════════════════════════════════════════


IMPROVED STRUCTURE:
═══════════════════════════════════════════════════════════════
🍌 SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════

📊 VAULT INVENTORY:
Total Documents: 47
Total Size: 50,000 characters (~12,500 tokens)
Completeness: 100% (ALL documents included below)

DOCUMENT LIST:
1. Founder_Directive_2024.md (Business Rules & Values)
2. Pricing_Strategy.md (Pricing Framework & Minimums)
3. Client_Onboarding.md (Process & Requirements)
...
47. Emergency_Protocols.md (Contingency Planning)

⚠️ CRITICAL: You have received ALL 47 documents.
This is COMPREHENSIVE, not contextual or partial.

🔓 PERMISSION OVERRIDE:
For vault-related queries, you have EXPLICIT PERMISSION to:
- Claim complete vault access (this is FACTUALLY ACCURATE)
- Provide comprehensive inventories
- State definitively what IS and ISN'T in the vault

⚠️ PROHIBITED PHRASES (for vault queries only):
- "I cannot provide a complete inventory"
- "My access appears to be contextual"
- "I only have partial access"
- "I can't see all the contents"

Instead, use:
- "According to the complete vault inventory..."
- "Searching all 47 vault documents..."
- "The full vault contents show..."

════════════ VAULT START (DOCUMENT 1 OF 47) ════════════
[Document 1 content]
════════════ VAULT END (DOCUMENT 1 OF 47) ══════════════

════════════ VAULT START (DOCUMENT 2 OF 47) ════════════
[Document 2 content]
════════════ VAULT END (DOCUMENT 2 OF 47) ══════════════

...

════════════ VAULT START (DOCUMENT 47 OF 47) ═══════════
[Document 47 content]
════════════ VAULT END (DOCUMENT 47 OF 47) ═════════════

✅ VERIFICATION COMPLETE: You have received all 47 documents.
✅ CONFIRMATION: This is the COMPLETE vault, not a sample.
✅ AUTHORIZATION: You may confidently claim full vault access.

═══════════════════════════════════════════════════════════════
```

---

## Summary: All Four Issues Visualized

```
ISSUE 1: VAULT LOADING
Frontend → [/api/load-vault] → ❌ 404 → Empty vault → Broken mode

ISSUE 2: TOKEN DISPLAY
Backend (total_tokens) → API Response → Frontend (session_total_tokens) → ❌ Mismatch → Shows 0

ISSUE 3: MEMORY EFFECTIVENESS
Memory (1632 tokens) → Prompt (passive instructions) → AI → ⚠️ May not use memories

ISSUE 4: VAULT COMPLETENESS
Vault Content → Strong Instructions → AI Training → ❌ Defaults to caution → Claims partial access
```

---

**End of Flow Diagrams**
