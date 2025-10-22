# Vault Loading Flow - Complete Code Trace

**Date:** 2025-10-22  
**Purpose:** Trace exact code path from frontend "Refresh Vault" button to orchestrator vault usage

---

## Executive Summary

### System Status: ✅ ENDPOINT EXISTS, NEEDS RUNTIME TESTING

**What's Configured:**
- ✅ Frontend refresh button calls `/api/load-vault`
- ✅ Backend endpoint registered in server.js (line 237)
- ✅ Handler function exists (api/load-vault.js)
- ✅ Orchestrator checks 4 storage locations
- ✅ Multiple fallback mechanisms

**What Needs Verification:**
- ❓ Does Google Drive connection work?
- ❓ Is vault content actually loaded and stored?
- ❓ Does orchestrator find the vault content?
- ❓ Why does "No vault available" message appear?

**Confidence Level: MEDIUM (70%)**
- Infrastructure is correct (HIGH confidence)
- Runtime behavior unknown (LOW testability without credentials)

---

## Flow Overview

```
User clicks "Refresh Vault" button
  ↓
Frontend: GET /api/load-vault?refresh=true&manual=true
  ↓
Server route: POST /api/load-vault
  ↓
loadVaultHandler() in api/load-vault.js
  ↓
Option A: getVaultFromKv() [if not refresh]
  → Check KV cache
  → Return if found
  ↓
Option B: loadVaultContent() [if refresh or no cache]
  → Connect to Google Drive
  → Read vault folders
  → Extract content
  → Return vault data
  ↓
storeVaultInKv()
  → Cache for future requests
  ↓
Response sent to frontend
  ↓
Frontend displays "VAULT READY"
  ↓
[Later] User sends chat in site_monkeys mode
  ↓
Orchestrator.#loadVaultContext()
  ↓
Check 4 storage locations:
  1. vaultCandidate from request
  2. global.vaultContent
  3. getVaultFromKv()
  4. process.env.VAULT_CONTENT
  ↓
Return vault context or null
  ↓
Add to AI prompt if found
```

---

## Step 1: Frontend Initiates Vault Refresh

**File:** `public/index.html`  
**Lines:** 1708-1730

### User Action
User clicks "🔄 Refresh Vault" button in site_monkeys mode

### Frontend Code
```javascript
async function refreshVault() {
  console.log("🔄 Refreshing vault...");
  
  const button = document.getElementById("refresh-vault-btn");
  button.innerHTML = "⏳ Refreshing...";
  button.disabled = true;
  
  // Line 1720: API call
  const response = await fetch(
    "/api/load-vault?refresh=true&manual=true",
    {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    }
  );
  
  // Line 1728: Handle response
  const data = await response.json();
  console.log("📊 Vault refresh result:", data);
  console.log("📁 Folders loaded:", data.folders_loaded);
  
  // Update UI with vault status
  if (data.success) {
    // Show "VAULT READY" status
  } else {
    // Show error
  }
}
```

### Request Details
- **Method:** GET (despite route registration as POST)
- **Endpoint:** `/api/load-vault`
- **Query Params:**
  - `refresh=true` - Force reload from Google Drive
  - `manual=true` - User-initiated (for logging)

**⚠️ POTENTIAL ISSUE:** Frontend uses GET, server registers POST
- **Line 237 in server.js:** `app.post("/api/load-vault", loadVaultHandler);`
- **Line 1720 in index.html:** `method: "GET"`
- **Impact:** Request might not reach handler!

---

## Step 2: Server Route Registration

**File:** `server.js`  
**Line:** 237

### Route Registration
```javascript
// Line 63: Import handler
import loadVaultHandler from "./api/load-vault.js";

// Line 237: Register route
app.post("/api/load-vault", loadVaultHandler);
```

**🚨 CRITICAL ISSUE IDENTIFIED:**
- Server expects: POST /api/load-vault
- Frontend sends: GET /api/load-vault
- **Result:** Request not handled by loadVaultHandler!

**Likely Behavior:**
- Express returns 404 or "Cannot GET /api/load-vault"
- Handler never executes
- Vault never loads

**Fix Needed:**
- Change server to `app.get()` OR
- Change frontend to `method: "POST"`

---

## Step 3: Vault Handler Function

**File:** `api/load-vault.js`  
**Lines:** 19-104

### Handler Entry Point
```javascript
export default async function loadVaultHandler(req, res) {
  const refresh = req.query.refresh === "true" || req.body.refresh === true;
  const manual = req.query.manual === "true" || req.body.manual === true;
  
  console.log(
    `[LOAD-VAULT] Request received - refresh: ${refresh}, manual: ${manual}`
  );
  
  try {
    let vaultData = null;
    
    // Check KV cache first (unless refresh requested)
    if (!refresh) {
      vaultData = await getVaultFromKv();
      if (vaultData) {
        return res.json({
          success: true,
          vault_content: vaultData.vault_content,
          folders_loaded: vaultData.folders_loaded,
          vault_status: "operational",
          source: "cache"
        });
      }
    }
    
    // Load from Google Drive
    const result = await loadVaultContent();
    
    vaultData = {
      vault_content: result.vaultContent,
      folders_loaded: result.loadedFolders,
      total_files: result.totalFiles,
      vault_status: "operational",
      source: "google_drive"
    };
    
    // Store in KV cache
    await storeVaultInKv(vaultData);
    
    return res.json({ success: true, ...vaultData });
    
  } catch (error) {
    console.error("[LOAD-VAULT] ❌ Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      vault_status: "error"
    });
  }
}
```

**Note:** This function likely NEVER EXECUTES due to GET/POST mismatch!

---

## Step 4: Load Vault Content from Google Drive

**File:** `lib/vault-loader.js` (referenced but not shown)  
**Function:** `loadVaultContent()`

### Expected Behavior
```javascript
async function loadVaultContent() {
  // 1. Initialize Google Drive API client
  // 2. Authenticate with credentials
  // 3. List folders in vault directory
  // 4. Read files from each folder
  // 5. Concatenate content
  // 6. Return result
  
  return {
    vaultContent: "Full text of all vault files...",
    loadedFolders: ["Business Rules", "Policies", "etc"],
    totalFiles: 42
  };
}
```

### Potential Issues
- Google Drive credentials not configured?
- API limits or rate limiting?
- Network connectivity issues?
- Folder/file permissions?

**Cannot verify without:**
- Examining lib/vault-loader.js implementation
- Testing with actual Google Drive credentials
- Runtime logs from attempted vault load

---

## Step 5: Store in KV Cache

**File:** `lib/vault-loader.js` (referenced but not shown)  
**Function:** `storeVaultInKv()`

### Expected Behavior
```javascript
async function storeVaultInKv(vaultData) {
  // Store vault data in key-value store
  // For quick retrieval on subsequent requests
  // Returns true if successful
  
  return true;
}
```

### Cache Benefits
- Avoid re-reading Google Drive on every request
- Faster response times
- Reduces API quota usage
- Persists across server restarts (if external KV store)

---

## Step 6: Response to Frontend

**File:** `api/load-vault.js`  
**Lines:** 87-90

### Success Response
```javascript
{
  success: true,
  vault_content: "Full text...",
  folders_loaded: ["folder1", "folder2"],
  total_files: 42,
  vault_status: "operational",
  source: "cache" | "google_drive",
  cached: true | false,
  loaded_at: "2025-10-22T..."
}
```

### Error Response
```javascript
{
  success: false,
  error: "Error message",
  vault_status: "error",
  vault_content: "",
  folders_loaded: [],
  total_files: 0
}
```

**But if GET/POST mismatch:** Frontend receives 404 or method not allowed error

---

## Step 7: Frontend Updates UI

**File:** `public/index.html`  
**Lines:** 1728-1760

### UI Update Logic
```javascript
const data = await response.json();

if (data.success) {
  document.getElementById("vault-info").innerHTML = `
    <div><span style="color:#00FF00;">✅</span> VAULT READY</div>
    <div>📁 ${data.folders_loaded.length} FOLDERS LOADED</div>
  `;
} else {
  document.getElementById("vault-info").innerHTML = `
    <div><span style="color:#FF0000;">❌</span> VAULT ERROR</div>
    <div>${data.error}</div>
  `;
}
```

**If vault loads successfully:**
- Green checkmark
- "VAULT READY" message
- Folder count displayed

**If vault fails:**
- Red X
- Error message displayed

**If GET/POST mismatch:**
- Likely shows error (404 or network error)
- Vault never actually loads

---

## Step 8: Chat Request with Vault

**File:** `server.js`  
**Lines:** 293-308

### Chat Endpoint Receives Vault Data

```javascript
app.post("/api/chat", async (req, res) => {
  const {
    message,
    mode,
    vaultEnabled = false,
    vaultContext,
    vault_content,
    // ... other params
  } = req.body;
  
  // Transform vault_content to vaultContext
  let finalVaultContext = vaultContext;
  if (!finalVaultContext && vault_content && vault_content.length > 500) {
    finalVaultContext = {
      content: vault_content,
      loaded: true
    };
  }
  
  // Diagnostic logging for site_monkeys mode
  if (mode === "site_monkeys") {
    console.log("[CHAT] 🍌 Site Monkeys mode detected:");
    console.log(`  - vaultEnabled: ${vaultEnabled}`);
    console.log(`  - vault_content length: ${vault_content?.length || 0}`);
    console.log(`  - finalVaultContext: ${finalVaultContext ? 'present' : 'null'}`);
  }
  
  // Pass to orchestrator
  const result = await orchestrator.processRequest({
    // ... params
    vaultContext: finalVaultContext
  });
});
```

**Vault Data Flow:**
1. Frontend includes `vault_content` in chat request body
2. Server transforms to `vaultContext` object
3. Passed to orchestrator

**Question:** Does frontend actually include vault_content in request?
- Need to check frontend chat submission code
- Likely NOT included automatically
- May need to be added from loaded vault data

---

## Step 9: Orchestrator Loads Vault Context

**File:** `api/core/orchestrator.js`  
**Lines:** 685-719

### Vault Context Loading

```javascript
async #loadVaultContext(vaultCandidate, _maybeSession) {
  try {
    // 1️⃣ Check if vault passed directly from request
    if (vaultCandidate && vaultCandidate.content && vaultCandidate.loaded) {
      const tokens = Math.ceil(vaultCandidate.content.length / 4);
      this.log(`[VAULT] Loaded from request: ${tokens} tokens`);
      return {
        content: vaultCandidate.content,
        tokens,
        loaded: true
      };
    }
    
    // 2️⃣ Check global cache
    if (global.vaultContent && global.vaultContent.length > 1000) {
      const tokens = Math.ceil(global.vaultContent.length / 4);
      this.log(`[VAULT] Loaded from global cache: ${tokens} tokens`);
      return {
        content: global.vaultContent,
        tokens,
        loaded: true
      };
    }
    
    // 3️⃣ Check KV store
    const kvVault = await getVaultFromKv();
    if (kvVault && kvVault.vault_content) {
      const tokens = Math.ceil(kvVault.vault_content.length / 4);
      this.log(`[VAULT] Loaded from KV store: ${tokens} tokens`);
      
      // Cache in global for next time
      global.vaultContent = kvVault.vault_content;
      
      return {
        content: kvVault.vault_content,
        tokens,
        loaded: true
      };
    }
    
    // 4️⃣ Check environment variable
    if (process.env.VAULT_CONTENT) {
      const tokens = Math.ceil(process.env.VAULT_CONTENT.length / 4);
      this.log(`[VAULT] Loaded from environment: ${tokens} tokens`);
      return {
        content: process.env.VAULT_CONTENT,
        tokens,
        loaded: true
      };
    }
    
    // No vault found
    this.log("[VAULT] No vault available");
    return null;
    
  } catch (error) {
    this.error("[VAULT] Loading failed", error);
    return null;
  }
}
```

### Storage Location Priority

**1. Request-passed vault (vaultCandidate):**
- Highest priority
- Requires frontend to pass vault data in request
- Likely NOT happening currently

**2. Global variable (global.vaultContent):**
- In-memory cache
- Lost on server restart
- Set by vault loader or orchestrator

**3. KV store (getVaultFromKv()):**
- Persistent cache
- Survives server restarts
- Requires external KV store configured

**4. Environment variable (process.env.VAULT_CONTENT):**
- Last resort fallback
- Set in deployment config
- Static content, doesn't update

**If all fail:** Returns null, logs "[VAULT] No vault available"

---

## Step 10: Add Vault to AI Prompt

**File:** `api/core/orchestrator.js`  
**Lines:** (in prompt building section)

### Vault Context in Prompt

```javascript
const systemPrompt = `
${basePersonalityPrompt}

${memoryContext}

${documentContext}

${vaultContext ? `
🍌 SITE MONKEYS BUSINESS RULES:
${vaultContext.content}

IMPORTANT: Follow these rules strictly for all site_monkeys mode interactions.
` : ''}
`;
```

The AI receives vault content and enforces business rules.

---

## Root Cause Analysis: "No Vault Available"

### Issue: Orchestrator says vault not available

### Possible Causes (Ranked by Likelihood)

#### 1. GET/POST Method Mismatch (MOST LIKELY)
**Evidence:**
- Server registers: `app.post("/api/load-vault", ...)`
- Frontend calls: `method: "GET"`

**Result:**
- Handler never executes
- Vault never loads into any storage
- Orchestrator finds nothing

**Confidence:** HIGH (90%)

**Fix:**
```javascript
// Option A: Change server.js line 237
app.get("/api/load-vault", loadVaultHandler);

// Option B: Change index.html line 1720
method: "POST"
```

#### 2. Vault Not Passed in Chat Request (LIKELY)
**Evidence:**
- Orchestrator checks vaultCandidate first
- Requires frontend to include vault_content in request
- Frontend may not be doing this

**Result:**
- Fallback to global, KV, or env
- If those also empty, returns null

**Confidence:** MEDIUM (70%)

**Fix:**
```javascript
// In frontend chat submission:
const requestBody = {
  message: userMessage,
  mode: currentMode,
  vault_content: window.vaultData?.vault_content  // Add this
};
```

#### 3. Global Variable Not Set (LIKELY)
**Evidence:**
- global.vaultContent set by vault loader
- But if loader never runs (due to #1), never set
- Cleared on server restart

**Result:**
- Fallback skips to KV or env

**Confidence:** MEDIUM (70%)

**Verification:**
- Add logging: `console.log('Global vault:', !!global.vaultContent);`
- Check if global.vaultContent exists after supposed load

#### 4. KV Store Not Configured (POSSIBLE)
**Evidence:**
- getVaultFromKv() might require external service
- If service not configured, returns null
- No error logs visible

**Result:**
- Fallback skips to env

**Confidence:** MEDIUM (60%)

**Verification:**
- Check lib/vault-loader.js implementation
- Verify KV store credentials/config
- Add error logging to getVaultFromKv()

#### 5. Environment Variable Not Set (POSSIBLE)
**Evidence:**
- process.env.VAULT_CONTENT is last fallback
- If not set in deployment, returns undefined
- Orchestrator returns null

**Result:**
- No vault available message

**Confidence:** MEDIUM (60%)

**Verification:**
- Check Railway environment variables
- Look for VAULT_CONTENT setting
- May need to be set manually

#### 6. Google Drive Connection Failed (LESS LIKELY)
**Evidence:**
- If GET/POST mismatch, never tries to connect
- But if method was correct, could still fail
- Credentials, permissions, network issues

**Result:**
- loadVaultContent() throws error
- Caught and logged
- Returns error response

**Confidence:** LOW (30%, because handler likely not executing)

**Verification:**
- Fix GET/POST mismatch first
- Then check Google Drive credentials
- Review error logs after fixing method

---

## Recommended Fix Sequence

### Fix 1: HTTP Method Mismatch (CRITICAL)
```javascript
// server.js line 237
app.get("/api/load-vault", loadVaultHandler);  // Change POST to GET
```

**Why first:** This blocks everything else from working

### Fix 2: Add Logging to Verify Execution
```javascript
// api/load-vault.js line 20
console.log("[LOAD-VAULT] ✅ Handler executing - method mismatch fixed!");
```

**Why:** Confirm handler is now being called

### Fix 3: Pass Vault in Chat Request
```javascript
// In frontend, when submitting chat:
if (currentMode === 'site_monkeys' && window.vaultData) {
  requestBody.vault_content = window.vaultData.vault_content;
}
```

**Why:** Ensures orchestrator receives vault via primary channel

### Fix 4: Store in Global After Load
```javascript
// api/load-vault.js line 66
global.vaultContent = vaultData.vault_content;
console.log("[LOAD-VAULT] Stored in global cache");
```

**Why:** Provides fallback for subsequent requests

### Fix 5: Set Environment Variable (If Needed)
```
In Railway or deployment config:
VAULT_CONTENT="Business rules and policies text..."
```

**Why:** Ultimate fallback if dynamic loading fails

---

## Testing Checklist

### After Fixing GET/POST Mismatch:
- [ ] Click "Refresh Vault" button
- [ ] Check browser console: Should see `[LOAD-VAULT] Handler executing`
- [ ] Check response: Should be `{ success: true, ... }`
- [ ] Verify UI shows "VAULT READY"

### After Adding Global Storage:
- [ ] Refresh vault
- [ ] Check server logs: `[LOAD-VAULT] Stored in global cache`
- [ ] Send chat in site_monkeys mode
- [ ] Check orchestrator logs: `[VAULT] Loaded from global cache`

### After Passing Vault in Request:
- [ ] Send chat in site_monkeys mode
- [ ] Check server logs: `vault_content length: 5000` (or actual length)
- [ ] Check orchestrator logs: `[VAULT] Loaded from request`

### End-to-End Verification:
- [ ] Refresh vault
- [ ] Send chat: "What is the minimum pricing?"
- [ ] AI should reference business rules from vault
- [ ] Response should enforce $697 minimum or other vault rules

---

## Confidence Assessment

### HIGH Confidence (90-100%)
- ✅ GET/POST mismatch is the primary issue
- ✅ Endpoint and handler exist and are correctly structured
- ✅ Orchestrator checks multiple storage locations

### MEDIUM Confidence (70-89%)
- ⚠️ Vault not being passed in chat request
- ⚠️ Global variable not set after load
- ⚠️ KV store may not be configured

### LOW Confidence (Needs Testing)
- ❓ Does Google Drive connection work after fixing method?
- ❓ Are credentials configured correctly?
- ❓ Does vault content actually get stored?

---

## Conclusion

### System Status: ⚠️ GET/POST MISMATCH BLOCKING VAULT LOAD

**Critical Issue Identified:**
- Server expects POST, frontend sends GET
- Handler never executes
- Vault never loads

**Fix Priority:**
1. **HIGH:** Change server route to GET or frontend method to POST
2. **MEDIUM:** Add vault_content to chat requests
3. **MEDIUM:** Store vault in global after load
4. **LOW:** Verify Google Drive credentials and KV store

**Confidence:** HIGH (90%) that fixing GET/POST will resolve "No vault available" issue

**Next Steps:**
1. Fix GET/POST mismatch
2. Test vault loading
3. Verify vault appears in chat
4. Confirm AI enforces business rules
