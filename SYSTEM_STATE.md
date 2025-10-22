# System State Analysis - Phase 2

**Date:** 2025-10-22  
**Branch:** copilot/run-comprehensive-diagnostics  
**Purpose:** Document current system configuration, storage, and operational state

---

## System Architecture Overview

### Technology Stack
- **Runtime:** Node.js v20.19.5
- **Framework:** Express.js 4.18.2
- **Database:** PostgreSQL (via `pg` 8.11.3)
- **Session Store:** connect-pg-simple 10.0.0 (PostgreSQL-backed)
- **AI Providers:** 
  - OpenAI (GPT-4) via `openai` 4.0.0
  - Anthropic (Claude) via `@anthropic-ai/sdk` 0.27.0
- **File Processing:** multer, mammoth, pdf-parse
- **Cloud Storage:** Google Drive via `googleapis` 126.0.1

### Module System
- **Type:** ESM (ES Modules) - `"type": "module"` in package.json
- **Import Aliases:** 
  - `#config/*` → `./config/*`
  - `#lib/*` → `./lib/*`

---

## Server Configuration (server.js)

### Initialization Sequence

1. **Dependencies Loading** (Lines 48-63)
   ```javascript
   import express from "express";
   import { persistentMemory } from "./api/categories/memory/index.js";
   import Orchestrator from "./api/core/orchestrator.js";
   import loadVaultHandler from "./api/load-vault.js";
   ```

2. **Orchestrator Creation** (Line 68)
   ```javascript
   const orchestrator = new Orchestrator();
   ```

3. **Session Configuration** (Lines 116-145)
   - **Session Secret:** `process.env.SESSION_SECRET` or fallback
   - **Max Age:** 30 days
   - **Storage:** PostgreSQL if `DATABASE_URL` available, else MemoryStore
   - **Table Name:** `user_sessions`
   - **Auto-cleanup:** Every 15 minutes

4. **Async Initialization** (Lines 372-399)
   ```javascript
   (async () => {
     await initializeMemorySystem();  // With 30s timeout
     await orchestrator.initialize();  // SemanticAnalyzer init
     setInterval(keepalive, 60000);    // Keepalive timer
   })();
   ```

### Critical Configuration Details

#### Memory System Initialization (Lines 153-198)
- **Timeout:** 30 seconds max
- **Global Exposure:** `global.memorySystem = persistentMemory`
- **Initialization Order:**
  1. `persistentMemory.coreSystem.initialize()`
  2. `persistentMemory.intelligenceSystem.initialize()`
- **Fallback:** Server continues with in-memory fallback if DB unavailable

#### Session Storage Decision Logic (Lines 128-143)
```javascript
if (process.env.DATABASE_URL) {
  // PostgreSQL session store (production-ready)
  sessionConfig.store = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "user_sessions",
    pruneSessionInterval: 60 * 15,
    createTableIfMissing: true
  });
} else {
  // MemoryStore (development only - will leak memory)
  console.warn("⚠️ MemoryStore - development only");
}
```

---

## Database Schema

### Table 1: persistent_memories

**Purpose:** Store all user memories with categorization and relevance scoring

**Schema:**
```sql
CREATE TABLE persistent_memories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  subcategory_name VARCHAR(100),
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  relevance_score DECIMAL(3,2) DEFAULT 0.50,
  usage_frequency INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_memories_user_category` ON (user_id, category_name)
- `idx_memories_relevance` ON (relevance_score DESC)

**Key Fields:**
- `user_id`: Text identifier (can be 'user', 'anonymous', or custom)
- `category_name`: One of 11 valid categories (underscore format)
- `relevance_score`: Decimal 0.00-1.00 for ranking
- `usage_frequency`: Incremented each time memory is accessed
- `metadata`: JSONB for flexible additional data

### Table 2: memory_categories

**Purpose:** Track token usage per category to enforce limits

**Schema:**
```sql
CREATE TABLE memory_categories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  subcategory_name VARCHAR(100),
  current_tokens INTEGER DEFAULT 0,
  max_tokens INTEGER DEFAULT 50000,
  is_dynamic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category_name, subcategory_name)
)
```

**Key Fields:**
- `current_tokens`: Running total of tokens in this category
- `max_tokens`: Token limit per category (default 50,000)
- `is_dynamic`: Whether category can grow beyond limits

### Table 3: user_sessions

**Purpose:** PostgreSQL-backed session storage (created by connect-pg-simple)

**Schema:** (Standard connect-pg-simple schema)
```sql
CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
)
```

**Auto-cleanup:** Expired sessions pruned every 15 minutes

### Valid Memory Categories (11 total)

From `core.js` lines 21-33:
1. `mental_emotional`
2. `health_wellness`
3. `relationships_social`
4. `work_career`
5. `money_income_debt`
6. `money_spending_goals`
7. `goals_active_current`
8. `goals_future_dreams`
9. `tools_tech_workflow`
10. `daily_routines_habits`
11. `personal_life_interests`

---

## Document Storage System

### Storage Location: In-Memory Map

**File:** `api/upload-for-analysis.js`
**Data Structure:**
```javascript
export const extractedDocuments = new Map();
```

**Storage Pattern:**
```javascript
extractedDocuments.set("latest", {
  id: "test-doc-timestamp",
  filename: "document.txt",
  content: "Preview content (first 1000 chars)",
  fullContent: "Complete document text",
  wordCount: 1234,
  contentType: "text/plain",
  keyPhrases: ["key", "phrases"],
  timestamp: Date.now()
});
```

### Document Lifecycle

**Upload → Storage → Retrieval → Cleanup**

1. **Upload** (Lines 1604-1646 in public/index.html)
   - Frontend: `POST /api/upload-for-analysis` with FormData
   - Backend: `handleAnalysisUpload()` in upload-for-analysis.js
   - Processing: Extract text, create preview, calculate word count
   - Storage: `extractedDocuments.set("latest", docObject)`

2. **Auto-Cleanup** (Lines 14-37 in upload-for-analysis.js)
   - **Interval:** Every 60 seconds
   - **Retention:** 10 minutes
   - **Max Documents:** 100 concurrent
   - **Cleanup Logic:** Remove documents older than 10 minutes

3. **Retrieval in Orchestrator** (Lines 635-681 in orchestrator.js)
   ```javascript
   const latestDoc = extractedDocuments.get("latest");
   if (latestDoc) {
     const documentContent = latestDoc.fullContent || latestDoc.content;
     // Use content in AI request
   }
   ```

### Frontend Document Storage

**Location:** `public/index.html` lines 1627-1629
```javascript
const docToStore = {
  filename: file.filename,
  content: analysis.preview,
  fullContent: analysis.fullText,
  // ... other fields
};
extractedDocuments.push(docToStore);  // Frontend array
```

**Issue Identified:** Frontend uses array, backend uses Map with "latest" key

---

## Vault Storage System

### Storage Locations (Multiple)

1. **Environment Variable** (Primary)
   ```javascript
   process.env.VAULT_CONTENT  // Full vault text
   ```

2. **Global Variable** (Runtime Cache)
   ```javascript
   global.vaultContent  // Set by vault loader
   ```

3. **KV Store** (Persistent Cache)
   - Managed by `lib/vault-loader.js`
   - Functions: `getVaultFromKv()`, `storeVaultInKv()`

### Vault Loading Flow

#### Frontend Initiation (public/index.html lines 1708-1730)
```javascript
// Check vault status
const response = await fetch("/api/load-vault", {
  method: "GET",
  headers: { "Content-Type": "application/json" }
});

// Manual refresh
const response = await fetch("/api/load-vault?refresh=true&manual=true", {
  method: "GET",
  headers: { "Content-Type": "application/json" }
});
```

#### Backend Endpoint (api/load-vault.js)

**Registered:** Line 237 in server.js
```javascript
app.post("/api/load-vault", loadVaultHandler);
```

**Handler Logic:**
1. Check query parameters: `refresh` and `manual`
2. If not refresh, try KV cache: `getVaultFromKv()`
3. If no cache or refresh requested: `loadVaultContent()`
4. Store result in KV: `storeVaultInKv()`
5. Return JSON response with vault data

**Response Structure:**
```javascript
{
  success: true,
  vault_content: "...",
  folders_loaded: ["folder1", "folder2"],
  total_files: 42,
  vault_status: "operational",
  source: "cache" | "google_drive",
  cached: boolean,
  loaded_at: "ISO timestamp"
}
```

#### Orchestrator Retrieval (orchestrator.js lines 685-719)

**Vault Context Loading Priority:**
1. **Request-passed vault:** `vaultCandidate.content` if `loaded: true`
2. **Global cache:** `global.vaultContent` if > 1000 chars
3. **KV store:** `getVaultFromKv()` as fallback
4. **Environment:** `process.env.VAULT_CONTENT` as last resort

**Code Path:**
```javascript
async #loadVaultContext(vaultCandidate, _maybeSession) {
  // 1️⃣ Direct pass from request
  if (vaultCandidate?.content && vaultCandidate.loaded) {
    return { content: vaultCandidate.content, tokens, loaded: true };
  }
  
  // 2️⃣ Global cache
  if (global.vaultContent && global.vaultContent.length > 1000) {
    return { content: global.vaultContent, tokens, loaded: true };
  }
  
  // 3️⃣ KV store
  const kvVault = await getVaultFromKv();
  if (kvVault?.vault_content) {
    return { content: kvVault.vault_content, tokens, loaded: true };
  }
  
  // 4️⃣ Environment variable
  if (process.env.VAULT_CONTENT) {
    return { content: process.env.VAULT_CONTENT, tokens, loaded: true };
  }
  
  return null; // No vault available
}
```

---

## Chat Request Flow

### Endpoint: POST /api/chat (server.js lines 259-354)

#### Request Parameters
```javascript
{
  message: string (required),
  userId: string (default: "anonymous"),
  mode: string (default: "truth_general"),
  sessionId: string,
  documentContext: object,
  vaultEnabled: boolean (default: false),
  vaultContext: object,
  vault_content: string,
  conversationHistory: array (default: [])
}
```

#### Processing Flow

1. **Validation** (Lines 280-285)
   - Check message is not empty
   - Return 400 if invalid

2. **Vault Transform** (Lines 293-300)
   ```javascript
   if (!vaultContext && vault_content && vault_content.length > 500) {
     finalVaultContext = {
       content: vault_content,
       loaded: true
     };
   }
   ```

3. **Orchestrator Processing** (Lines 311-320)
   ```javascript
   const result = await orchestrator.processRequest({
     message,
     userId,
     mode,
     sessionId,
     documentContext,
     vaultEnabled,
     vaultContext: finalVaultContext,
     conversationHistory
   });
   ```

4. **Memory Storage** (Lines 323-342)
   - **Condition:** `result.success && global.memorySystem`
   - **Function:** `global.memorySystem.storeMemory(userId, message, response, metadata)`
   - **Error Handling:** Silent failure, doesn't block response
   - **Log:** `[CHAT] 💾 Conversation stored in memory system`

5. **Response** (Line 344)
   ```javascript
   res.json(result);
   ```

---

## API Endpoints Inventory

### Health & Status
- `GET /health` - Simple health check for Railway (returns `{ status: "healthy" }`)
- `GET /api/health` - Detailed health with uptime, memory, orchestrator status
- `GET /api/system-status` - Comprehensive system status (from system-status.js)

### Core Chat
- `POST /api/chat` - Main chat endpoint, processes through orchestrator

### File Upload
- `POST /api/upload` - Standard file upload (via upload-file.js)
- `POST /api/upload-for-analysis` - Document upload for AI analysis

### Vault Management
- `POST /api/load-vault` - Load/refresh vault from Google Drive
  - Query param `refresh=true` - Force reload from Google Drive
  - Query param `manual=true` - User-initiated refresh (logging)

### Testing
- `GET /api/run-tests` - Run comprehensive test suite (returns JSON)

### Repository
- `/api/*` - Repo snapshot routes (from repo-snapshot.js)

---

## Session Storage Details

### Configuration

**Session Store Type:**
- **Production (with DATABASE_URL):** PostgreSQL via connect-pg-simple
- **Development (no DATABASE_URL):** MemoryStore (not production-safe)

**Session Settings:**
```javascript
{
  secret: process.env.SESSION_SECRET || "sitemonkeys-fallback-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
    sameSite: "lax",                    // CSRF protection
    httpOnly: true,                      // Prevent JS access
    secure: NODE_ENV === "production"    // HTTPS only in prod
  },
  store: PgSession or MemoryStore
}
```

### What's Stored in Sessions

**Session Table Schema:**
- `sid`: Session ID (primary key)
- `sess`: JSON object containing session data
- `expire`: Expiration timestamp

**Expected Session Data:**
- User preferences
- Temporary state
- Authentication data (if implemented)

**NOT Stored in Sessions:**
- ❌ Extracted documents (stored in in-memory Map)
- ❌ Vault content (stored in global/KV/env)
- ❌ Conversation history (stored in database via memory system)

---

## Memory System Architecture

### Component Structure

**Main Module:** `api/categories/memory/index.js`
```javascript
export { default as persistentMemory } from "./internal/persistent_memory.js";
export { default as coreSystem } from "./internal/core.js";
export { default as intelligenceSystem } from "./internal/intelligence.js";
```

### Core System (core.js)

**Responsibilities:**
1. Database connection pooling
2. Schema creation and migration
3. Health monitoring
4. Base memory CRUD operations

**Connection Pool Configuration:**
```javascript
{
  max: 30,                      // Max connections
  idleTimeoutMillis: 60000,     // 60s idle timeout
  connectionTimeoutMillis: 15000, // 15s connection timeout
  allowExitOnIdle: true         // Clean up idle connections
}
```

**Keep-Alive:** Every 30 seconds, runs `SELECT 1` to prevent pool shutdown

**Health Check:** Updates every query execution
```javascript
{
  overall: boolean,
  database: { healthy: boolean },
  initialized: boolean,
  lastCheck: ISO timestamp
}
```

### Intelligence System (intelligence.js)

**Responsibilities:**
1. Semantic routing (query → category)
2. Memory extraction with relevance scoring
3. Cross-category searching
4. Token-aware memory retrieval

**Category Routing:** Pattern-based matching with keyword sets
- 11 categories with extensive keyword lists
- Intent detection (memory_recall, information_request, etc.)
- Multi-step fallback if primary category yields few results

**Memory Retrieval SQL Pattern:**
```sql
WHERE user_id IN ('user', 'anonymous')
  AND category_name = $1
ORDER BY relevance_score DESC, created_at DESC
LIMIT $2
```

**Token Enforcement:**
- Max 50,000 tokens per category
- Truncates memories if total exceeds limit
- Tracks usage frequency for prioritization

---

## Orchestrator Architecture

### Initialization (orchestrator.js lines 89-105)

**Sequence:**
1. Initialize SemanticAnalyzer (with 20s timeout protection)
2. Pre-compute intent embeddings (7 categories)
3. Pre-compute domain embeddings (7 categories)
4. Set `this.initialized = true`
5. Graceful fallback if initialization fails

**Dependencies:**
- OpenAI client for embeddings
- Anthropic client for Claude API
- Memory system (coreSystem + intelligenceSystem)
- Personality frameworks (Eli, Roxy)
- Various validators and enforcers

### Request Processing Pipeline

**Entry Point:** `processRequest(params)`

**Pipeline Stages:**
1. **Load Memory Context** - Extract relevant memories from database
2. **Load Document Context** - Retrieve uploaded documents from Map
3. **Load Vault Context** - Get vault content from storage
4. **Personality Selection** - Choose Eli or Roxy based on mode
5. **Build AI Prompt** - Combine all contexts into prompt
6. **Call AI API** - OpenAI or Anthropic
7. **Validate Response** - Check compliance with mode/vault rules
8. **Track Tokens** - Record usage and costs
9. **Return Result** - Format response for frontend

**Document Retrieval Location:** Lines 635-681
```javascript
async #loadDocumentContext(documentContext, sessionId) {
  const latestDoc = extractedDocuments.get("latest");
  if (!latestDoc) return null;
  
  const documentContent = latestDoc.fullContent || latestDoc.content;
  const tokens = Math.ceil(documentContent.length / 4);
  
  if (tokens > 10000) {
    // Truncate to 10,000 tokens
  }
  
  return {
    content: documentContent,
    tokens: tokens,
    filename: latestDoc.filename,
    processed: true
  };
}
```

---

## Environment Variables Required

### Database
- `DATABASE_URL` - PostgreSQL connection string (format: `postgresql://user:pass@host:port/db`)

### AI Providers
- `OPENAI_API_KEY` - OpenAI API key for GPT-4 and embeddings
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude

### Session Management
- `SESSION_SECRET` - Secret for session cookie signing (auto-generated fallback exists)

### Google Drive (for Vault)
- Google Drive credentials (managed by googleapis library)
- Exact env var names depend on vault-loader.js implementation

### Optional
- `NODE_ENV` - Set to "production" for production behaviors (HTTPS, no verbose logs)
- `PORT` - Server port (default: 3000)

---

## Current System State Summary

### ✅ What's Configured and Working

1. **Server Initialization:**
   - Express server configured correctly
   - Async initialization with graceful degradation
   - Keepalive timer prevents process exit
   - Health check endpoints responding

2. **Database Schema:**
   - Two main tables: persistent_memories, memory_categories
   - Proper indexes for performance
   - Session table auto-created by connect-pg-simple

3. **Session Management:**
   - PostgreSQL-backed sessions (when DATABASE_URL present)
   - 30-day expiration
   - Auto-cleanup every 15 minutes
   - Secure cookie settings

4. **Document Storage:**
   - In-memory Map for recent documents
   - Auto-cleanup every 60 seconds
   - 10-minute retention window
   - Orchestrator knows how to retrieve from Map

5. **Vault System:**
   - API endpoint registered: `POST /api/load-vault`
   - Frontend has refresh button
   - Multiple storage fallbacks (request → global → KV → env)
   - Orchestrator checks all storage locations

6. **Memory System:**
   - Core system with robust pool management
   - Intelligence system with semantic routing
   - SQL queries fixed to search both user IDs
   - Token tracking and enforcement

7. **Chat Flow:**
   - Main endpoint registered
   - Orchestrator processing pipeline
   - Memory storage after successful responses
   - Error handling with graceful degradation

### ⚠️ Potential Issues Identified

1. **Document Storage Mismatch:**
   - **Frontend:** Stores in array: `extractedDocuments.push()`
   - **Backend:** Uses Map: `extractedDocuments.set("latest")`
   - **Orchestrator:** Expects Map: `extractedDocuments.get("latest")`
   - **Issue:** Frontend array and backend Map are different objects

2. **Vault Context Passing:**
   - Multiple storage locations could cause confusion
   - Orchestrator checks 4 different places
   - Frontend expects vault to be available after refresh
   - Unclear if vault data persists between requests

3. **Session Storage vs. Document Storage:**
   - Documents NOT stored in sessions
   - Documents only in in-memory Map (lost on server restart)
   - 10-minute cleanup might delete documents user is still working with

4. **Memory Retrieval:**
   - SQL queries fixed to search both user IDs
   - But semantic routing might send queries to wrong category
   - Cross-category fallback exists but adds latency

### ❓ Unknowns (Requires Live Testing)

1. **Does vault loading actually work?**
   - Endpoint exists
   - Code looks correct
   - But does Google Drive connection work?
   - Does vault content persist after loading?

2. **Do documents persist through chat requests?**
   - Upload stores in Map
   - Chat retrieves from Map
   - But is the Map shared correctly across modules?

3. **Does memory storage work in production?**
   - Code is in place
   - SQL is fixed
   - But does database have data?
   - Are memories actually being retrieved?

4. **Frontend-Backend synchronization:**
   - Frontend has array of documents
   - Backend has Map with "latest"
   - Are these synchronized?

---

## Database Health Monitoring

### Built-in Health Checks

1. **Pool Events** (core.js lines 75-106)
   - `connect` event logged
   - `error` event logged
   - `remove` event logged and triggers reconnection warning

2. **Keep-Alive Query** (Every 30 seconds)
   ```javascript
   await this.pool.query("SELECT 1");
   ```
   - On failure: Logs error, closes pool, creates new pool

3. **Health Status Object** (core.js lines 196-218)
   ```javascript
   {
     overall: boolean,
     database: { healthy: boolean },
     initialized: boolean,
     lastCheck: ISO timestamp
   }
   ```
   - Updated on every query execution
   - Accessible via `coreSystem.healthStatus`

### Query Execution Wrapper (core.js lines 128-139)
```javascript
async executeQuery(query, params = []) {
  if (!this.pool) {
    throw new Error("Database pool not initialized");
  }
  const result = await this.pool.query(query, params);
  return result;
}
```

**Error Handling:** Throws error, logs with timestamp

---

## Token Tracking System

### Implementation: `api/lib/tokenTracker.js`

**Function Signature:**
```javascript
trackApiCall(personality, promptTokens, completionTokens)
```

**Returns:**
```javascript
{
  prompt_tokens: number,
  completion_tokens: number,
  tokens_used: number,
  call_cost: number,
  personality: string
}
```

**Cost Calculation:**
- Different rates for different personalities
- Eli, Roxy: Lower cost (GPT-3.5 rates)
- Claude: Higher cost (Claude API rates)

**Session Totals:**
- Accumulated across calls
- Displayed in logs
- Format: `📊 Session Total: X calls, Y tokens, $Z`

---

## Next Steps for Phase 3

### Document Upload Flow - Complete Trace Needed:
1. ✅ Frontend sends POST to /api/upload-for-analysis
2. ✅ Backend receives in handleAnalysisUpload()
3. ⚠️ **VERIFY:** Document stored in Map correctly
4. ⚠️ **VERIFY:** Frontend array vs backend Map synchronization
5. ✅ Orchestrator retrieves with extractedDocuments.get("latest")
6. ❓ **TEST:** Does document persist through multiple chat requests?

### Memory Retrieval Flow - Complete Trace Needed:
1. ✅ User sends query in chat
2. ✅ Intelligence system routes to category
3. ✅ SQL query with IN ('user', 'anonymous')
4. ⚠️ **VERIFY:** Does routing pick correct category?
5. ⚠️ **VERIFY:** Are relevant memories ranked correctly?
6. ❓ **TEST:** Do memories actually get retrieved in production?

### Vault Loading Flow - Complete Trace Needed:
1. ✅ Frontend calls GET /api/load-vault
2. ✅ Backend endpoint registered
3. ⚠️ **VERIFY:** Does Google Drive connection work?
4. ⚠️ **VERIFY:** Is vault content stored in accessible location?
5. ✅ Orchestrator checks 4 storage locations
6. ❓ **TEST:** Does "No vault available" message still appear?

---

## Confidence Assessment

### HIGH Confidence (90-100%)
- ✅ Server initialization sequence
- ✅ Database schema structure
- ✅ Session configuration
- ✅ API endpoint registration
- ✅ Orchestrator pipeline structure
- ✅ Token tracking implementation

### MEDIUM Confidence (70-89%)
- ⚠️ Document storage and retrieval (code looks correct, needs runtime test)
- ⚠️ Vault loading mechanism (endpoint exists, needs credentials test)
- ⚠️ Memory retrieval accuracy (SQL fixed, routing needs verification)

### LOW Confidence (Needs Investigation)
- ❓ Frontend-backend document synchronization
- ❓ Vault persistence between requests
- ❓ Memory retrieval in production with real data
- ❓ Cross-module shared state (Map, global variables)

---

## Recommendations for Phase 3

**Focus on Integration Points:**
1. Trace exact code path from frontend upload to orchestrator retrieval
2. Verify Map object is shared correctly between modules
3. Test vault loading with actual Google Drive connection
4. Examine memory routing logic with real queries
5. Document exact breaking points with line numbers
