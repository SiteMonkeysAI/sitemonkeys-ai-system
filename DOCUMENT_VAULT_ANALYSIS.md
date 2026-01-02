# Document/File Upload and Vault Functionality Analysis

**Date:** 2026-01-02  
**Repository:** SiteMonkeysAI/sitemonkeys-ai-system  
**Purpose:** Comprehensive analysis of existing document/file upload and vault systems

---

## Executive Summary

The SiteMonkeys AI system has **extensive document upload and vault functionality** already implemented. This analysis documents all existing capabilities, storage mechanisms, and integration points.

**Key Findings:**
- ✅ Two complete file upload endpoints with extensive file type support
- ✅ Document processing for DOCX, TXT, and other formats
- ✅ Google Drive-based vault system with multi-source retrieval
- ✅ In-memory document storage with automatic cleanup
- ✅ Semantic memory system integration
- ⚠️ No persistent document storage (documents are temporary, 10-minute TTL)
- ⚠️ No document chunking for large files (size limits instead)

---

## 1. Document/File Upload Functionality

### 1.1 Upload Endpoints

#### **Endpoint 1: `/api/upload` - General File Upload**
- **File:** `/api/upload-file.js`
- **Purpose:** Basic file upload for all file types
- **Configuration:**
  - Max file size: 50MB per file
  - Max files: 10 files per request
  - Storage: In-memory (no disk persistence)

**Supported File Types:**
- **Images:** JPG, JPEG, PNG, GIF, BMP, SVG, TIFF, WEBP
- **Documents:** PDF, DOC, DOCX, TXT, MD, RTF, ODT
- **Spreadsheets:** XLS, XLSX, CSV, ODS
- **Presentations:** PPT, PPTX, ODP
- **Audio:** MP3, WAV, M4A, OGG, AAC, FLAC
- **Video:** MP4, AVI, MOV, WMV, FLV, WEBM, MKV
- **Archives:** ZIP, RAR, 7Z, TAR, GZ
- **Code:** JS, HTML, CSS, JSON, XML, PY, JAVA, CPP, C, PHP, RB, GO, RS

**Response Format:**
```json
{
  "status": "success",
  "message": "Upload complete: X successful, Y failed",
  "successful_uploads": 2,
  "failed_uploads": 0,
  "files": [
    {
      "success": true,
      "filename": "document.docx",
      "message": "Document uploaded: document.docx",
      "type": "document",
      "size": 15234,
      "folder": "vault",
      "preview": "Text content extracted and ready for analysis",
      "metadata": {
        "filename": "document.docx",
        "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "size": 15234,
        "uploadTime": "2026-01-02T21:27:22.425Z",
        "fileType": "document"
      }
    }
  ]
}
```

#### **Endpoint 2: `/api/upload-for-analysis` - Document Analysis Upload**
- **File:** `/api/upload-for-analysis.js`
- **Purpose:** Enhanced upload with content extraction and analysis
- **Additional Features:**
  - DOCX content extraction using `mammoth` library
  - Word count and character count
  - Content type detection (Business, Resume, Legal, etc.)
  - Reading time estimation
  - Key phrase extraction
  - Full text storage for AI access

**DOCX Processing Details:**
```javascript
// Content extraction result
{
  success: true,
  wordCount: 500,
  characterCount: 3000,
  preview: "First 200 characters...",
  fullText: "Complete document text",
  hasContent: true
}

// Analysis result
{
  contentType: "Business Document",
  readingTime: 3, // minutes
  summary: "Business Document with 500 words (3 minute read)",
  keyPhrases: ["objective: increase revenue", "deadline: Q1 2026"]
}
```

**Document Storage:**
```javascript
// Stored in Map with "latest" key
extractedDocuments.set("latest", {
  id: "1704221242425_document.docx",
  filename: "document.docx",
  content: "Preview (200 chars)",
  fullContent: "Complete text",
  wordCount: 500,
  contentType: "Business Document",
  keyPhrases: ["objective...", "deadline..."],
  timestamp: 1704221242425
});
```

**Automatic Cleanup:**
- Documents older than 10 minutes are automatically removed
- Max 100 documents in memory at any time
- Cleanup runs every 60 seconds
- Storage limit protection with 429 status when full

### 1.2 Document Processing Code

#### **DOCX Parsing**
- **Library:** `mammoth` (v1.6.0)
- **Files:** 
  - `/api/upload-for-analysis.js` (lines 148-191)
  - `/lib/vault-loader.js` (lines 20-70)
- **Capabilities:**
  - Extract raw text from DOCX files
  - Preserve document structure
  - Handle complex formatting

**Example Code:**
```javascript
async function extractDocxContent(fileBuffer) {
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const extractedText = result.value;
  const wordCount = extractedText.split(/\s+/).length;
  
  return {
    success: true,
    wordCount: wordCount,
    characterCount: extractedText.length,
    preview: extractedText.substring(0, 200),
    fullText: extractedText
  };
}
```

#### **PDF Parsing**
- **Library:** `pdf-parse` (v1.1.1) installed
- **Status:** ⚠️ Library installed but not actively used in endpoints
- **Potential:** Can be integrated for PDF text extraction

#### **TXT/MD Parsing**
- **Method:** Direct buffer-to-string conversion
- **Files:** `/lib/vault-loader.js`
- **Used for:** Vault document loading from Google Drive

#### **Google Docs Parsing**
- **Method:** Google Drive API export to plain text
- **Files:** `/lib/vault-loader.js` (lines 226-380)
- **Used for:** Vault documents stored in Google Drive

### 1.3 Chunking Logic

**Current State:** ❌ **No document chunking implemented**

**Existing Approach:**
- Size limits (50MB max) instead of chunking
- Full document loaded into memory
- Content truncation for embeddings (8000 char limit)

**Code Reference:**
```javascript
// In embedding-service.js
const EMBEDDING_CONFIG = {
  maxContentLength: 8000  // Truncate if longer
};
```

**Recommendation:** For large document support, consider implementing:
- Token-based chunking (512-1024 tokens per chunk)
- Overlapping chunks (10-20% overlap)
- Chunk metadata storage (chunk index, source document)

---

## 2. Vault System

### 2.1 What is the Vault System?

**Definition:** The vault is a **Google Drive-based knowledge repository** containing business-critical documents that provide context to AI responses.

**Purpose:**
- Store Site Monkeys business intelligence
- Provide pricing strategies and guidelines
- Maintain service offerings documentation
- Supply margin enforcement rules

**Vault Structure:**
```
Google Drive Folder: 1LAkbqjN7g-HJV9BRWV-AsmMpY1JzJiIM
├── 00_EnforcementShell/
│   └── Business enforcement rules
├── 01_Core_Directives/
│   └── Core business directives
└── VAULT_MEMORY_FILES/
    └── Essential vault memory documents
```

### 2.2 vaultTokens in Response Metadata

**Location:** Found in chat response metadata in orchestrator
**File:** `/api/core/orchestrator.js` (line 624, 1487-1509)

**Purpose:** Token budget tracking for vault content included in AI context

**Code Example:**
```javascript
// In orchestrator response metadata
{
  metadata: {
    memoryTokens: 150,
    documentTokens: 200,
    vaultTokens: 450,  // ← Tokens used by vault content
    totalContextTokens: 800,
    budgetStatus: {
      memory: true,
      documents: true,
      vault: true  // Whether vault is within budget
    }
  }
}
```

**Token Budget Limits:**
```javascript
const BUDGET = {
  MEMORY: 2500,
  DOCUMENTS: 1500,
  VAULT: 3000,  // Max tokens from vault
  TOTAL: 7000
};
```

**Warning Logic:**
```javascript
const vaultTokens = vault?.tokens || 0;
if (vaultTokens > BUDGET.VAULT) {
  this.log(`[TOKEN-BUDGET] WARNING: Vault exceeds limit: ${vaultTokens} > ${BUDGET.VAULT}`);
}
```

### 2.3 Vault Data Storage Locations

**Multiple Storage Layers for Performance:**

#### **Layer 1: Google Drive (Source of Truth)**
- **Location:** Google Drive Folder `1LAkbqjN7g-HJV9BRWV-AsmMpY1JzJiIM`
- **Access:** Via `googleapis` library (v126.0.1)
- **Files:** `/lib/vault-loader.js`, `/utils/memoryLoader.js`
- **Credentials Required:**
  - `GOOGLE_CREDENTIALS_JSON`
  - `GOOGLE_PROJECT_ID`
  - `GOOGLE_PROJECT_NUMBER`

#### **Layer 2: Railway KV Cache**
- **Purpose:** Fast retrieval without Google Drive API calls
- **TTL:** Configurable, typically hours/days
- **Files:** `/lib/vault-loader.js` (functions: `getVaultFromKv`, `storeVaultInKv`)
- **Configuration:**
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`

#### **Layer 3: Environment Variable**
- **Variable:** `process.env.VAULT_CONTENT`
- **Purpose:** Pre-loaded vault content at startup
- **File:** `/api/vault.js` (line 11)
- **Validation:**
  ```javascript
  vault_healthy: process.env.VAULT_CONTENT && 
                 process.env.VAULT_CONTENT.length > 1000
  ```

#### **Layer 4: Global Variable (Runtime)**
- **Variable:** `global.vaultContent`
- **Purpose:** In-memory cache during runtime
- **Set by:** `/api/load-vault.js` (lines 70-89)
- **Accessed by:** Orchestrator (lines 1534-1541)

### 2.4 Vault Retrieval Flow

**Complete Retrieval Priority Chain:**

```
1. Request Scope (req.vaultContent)
   ↓ (if missing)
2. Global Runtime (global.vaultContent)
   ↓ (if missing)
3. Environment Variable (process.env.VAULT_CONTENT)
   ↓ (if missing)
4. Railway KV Cache (getVaultFromKv)
   ↓ (if missing)
5. Google Drive (loadVaultContent)
```

**Code Reference (`/api/core/orchestrator.js` lines 1534-1541):**
```javascript
// Priority chain for vault access
let vaultContent = 
  req.vaultContent ||           // Request-specific
  global.vaultContent ||        // Global runtime cache
  process.env.VAULT_CONTENT ||  // Environment variable
  null;

if (!vaultContent) {
  // Try KV cache or Google Drive
  const vaultData = await getVaultFromKv() || await loadVaultContent();
  vaultContent = vaultData?.vault_content;
}
```

**Refresh Endpoint:** `POST /api/load-vault`
- **Purpose:** Manually refresh vault from Google Drive
- **Query Params:**
  - `?refresh=true` - Force reload from Google Drive (bypass cache)
  - `?manual=true` - Indicates manual user refresh
- **Response:**
  ```json
  {
    "success": true,
    "vault_content": "...",
    "folders_loaded": ["EnforcementShell", "Core_Directives", "VAULT_MEMORY_FILES"],
    "total_files": 42,
    "vault_status": "operational",
    "source": "google_drive"  // or "cache"
  }
  ```

### 2.5 Vault Trigger System

**Purpose:** Detect when vault content should be included in AI context

**File:** `/api/vault.js` (function: `checkVaultTriggers`)

**Trigger Keywords:**
```javascript
const triggers = {
  pricing: ["pricing", "cost", "budget"],
  margin_enforcement: ["margin", "profit"],
  site_monkeys_products: ["boost", "climb", "lead"]
};
```

**Generated Context:**
```javascript
generateVaultContext(triggeredFrameworks) {
  let context = "SITE MONKEYS BUSINESS INTELLIGENCE:\n\n";
  
  if (trigger === "pricing") {
    context += "💰 **PRICING STRATEGY:**\n";
    context += "- Boost Plan: $697/month (85% margin minimum)\n";
    context += "- Climb Plan: $1,497/month (85% margin minimum)\n";
    context += "- Lead Plan: $2,997/month (85% margin minimum)\n";
  }
  // ... more triggers
  
  return context;
}
```

---

## 3. Storage Integration

### 3.1 File Storage

**Current Implementation:** ❌ **No persistent file storage**

**Existing Approach:**
- **In-Memory Only:** Files stored in `Map` data structure
- **Temporary:** 10-minute TTL, then deleted
- **Volatile:** Lost on server restart

**Storage Location:**
```javascript
// In upload-for-analysis.js
export const extractedDocuments = new Map();
// Key: "latest" or session-specific ID
// Value: Document object with full text
```

**Why No Persistent Storage:**
- Design for temporary analysis, not long-term storage
- Reduces storage costs
- Simplifies privacy/data retention
- Documents intended for immediate AI context

**Potential Integrations (Not Implemented):**
- ❌ AWS S3
- ❌ Google Cloud Storage
- ❌ Azure Blob Storage
- ❌ Local file system
- ✅ Google Drive (for vault only, not user uploads)

### 3.2 Database Schema for Documents

**Database:** PostgreSQL  
**Connection:** `DATABASE_URL` environment variable

**Existing Tables:**

#### **Table 1: `persistent_memories`**
- **Purpose:** Store user conversation memories
- **Relevant Columns:**
  - `content` (TEXT) - Memory content (could include document references)
  - `metadata` (JSONB) - Flexible metadata storage
  - `embedding` (FLOAT4[]) - Semantic search vectors
  - `token_count` (INTEGER) - Token usage tracking

**Schema:**
```sql
CREATE TABLE persistent_memories (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  content TEXT NOT NULL,
  token_count INTEGER,
  relevance_score DECIMAL(3,2),
  usage_frequency INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding FLOAT4[],  -- 1536 dimensions for OpenAI embeddings
  embedding_status TEXT DEFAULT 'pending',
  superseded_by INTEGER REFERENCES persistent_memories(id),
  fingerprint TEXT
);
```

#### **Table 2: `session` (PostgreSQL-backed sessions)**
- **Purpose:** Store user session data
- **Managed by:** `connect-pg-simple` library
- **Could store:** Document references, upload history

**No Dedicated Document Tables:**
- ❌ No `documents` table
- ❌ No `document_chunks` table
- ❌ No `document_embeddings` table

**Metadata Storage Pattern:**
Documents could be referenced in `persistent_memories.metadata`:
```json
{
  "storage_version": "intelligent_v1",
  "document_reference": {
    "filename": "business_plan.docx",
    "upload_time": "2026-01-02T21:27:22.425Z",
    "word_count": 500,
    "content_type": "Business Document"
  }
}
```

### 3.3 External Service Integrations

#### **Google Drive Integration**
- **Purpose:** Vault document storage
- **Library:** `googleapis` (v126.0.1)
- **Scope:** Read-only access (`drive.readonly`)
- **Files:**
  - `/lib/vault-loader.js` - Main integration
  - `/utils/memoryLoader.js` - Alternative loader
  - `/api/migrate-vault/index.py` - Python migration script

**Code Example:**
```javascript
async function getGoogleDriveService() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  });
  
  return google.drive({ version: "v3", auth });
}
```

**Supported File Types:**
- `.txt` files - Direct text read
- Google Docs - Export to plain text
- `.docx` files - Binary extraction with JSZip + xml2js

#### **Railway KV Store**
- **Purpose:** Fast caching layer
- **Used for:** Vault content caching
- **API:** REST-based key-value store
- **Configuration:**
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`

#### **OpenAI Integration**
- **Purpose:** Document analysis and embeddings
- **Used for:**
  - Content summarization
  - Fact extraction
  - Semantic embeddings for search
- **Model:** `text-embedding-3-small` (1536 dimensions)

---

## 4. Integration with Semantic Memory System

### 4.1 Document → Memory Flow

**Current Integration Pattern:**

```
1. User uploads document → /api/upload-for-analysis
2. DOCX content extracted → mammoth library
3. Document stored in Map → extractedDocuments.set("latest", {...})
4. User asks about document → AI chat request
5. Orchestrator retrieves document → extractedDocuments.get("latest")
6. Document added to AI context → Combined with memories
7. AI generates response → References document content
8. Conversation stored in memory → persistent_memories table
```

**Key Integration Point: Orchestrator**

**File:** `/api/core/orchestrator.js` (lines 958-1015)

```javascript
// Document retrieval in orchestrator
const documentContext = this.loadDocumentContext(sessionId);

loadDocumentContext(sessionId) {
  const doc = extractedDocuments.get("latest");
  
  if (!doc) {
    this.log("[DOCUMENTS] No document found in storage");
    return null;
  }
  
  return {
    text: doc.fullContent,
    tokens: this.countTokens(doc.fullContent),
    metadata: {
      filename: doc.filename,
      wordCount: doc.wordCount,
      contentType: doc.contentType
    }
  };
}
```

**Context Assembly:**
```javascript
// Orchestrator combines all context sources
const contextParts = [];

// 1. Memory context (from database)
if (memoryText) {
  contextParts.push(`## Your Memory:\n${memoryText}`);
}

// 2. Document context (from uploaded files)
if (documentText) {
  contextParts.push(`## Document Context:\n${documentText}`);
}

// 3. Vault context (from Google Drive)
if (vaultText) {
  contextParts.push(`## Business Intelligence:\n${vaultText}`);
}

const fullContext = contextParts.join('\n\n');
```

### 4.2 Semantic Memory Features

#### **Semantic Retrieval**
- **File:** `/api/services/semantic-retrieval.js`
- **Method:** Vector similarity search using embeddings
- **Database:** PostgreSQL with pgvector extension
- **Embedding Model:** OpenAI `text-embedding-3-small`

**Integration Pattern:**
```javascript
// 1. Generate query embedding
const queryEmbedding = await generateEmbedding(userMessage);

// 2. Semantic search in database
const semanticMemories = await retrieveSemanticMemories(
  pool,
  userId,
  queryEmbedding,
  {
    limit: 5,
    minScore: 0.7,
    categories: ['personal_life_interests', 'health_wellness']
  }
);

// 3. Combined with traditional category-based retrieval
const allMemories = [...categoryMemories, ...semanticMemories];
```

#### **Embedding Service**
- **File:** `/api/services/embedding-service.js`
- **Purpose:** Generate embeddings for stored content
- **Features:**
  - Non-blocking embedding generation
  - Automatic retry logic
  - Graceful degradation (never blocks storage)
  - Batch processing support

**Document Embedding Flow:**
```javascript
// After document content is stored in memory
const memoryId = result.memoryId;
const content = doc.fullContent;

// Generate embedding asynchronously (doesn't block)
await embedMemoryNonBlocking(pool, memoryId, content);

// Embedding stored in persistent_memories.embedding column
// Status tracked in persistent_memories.embedding_status
```

#### **Supersession System**
- **File:** `/api/services/supersession.js`
- **Purpose:** Automatic fact updating when new information supersedes old
- **Example:** "My phone is 555-1234" supersedes "My phone is 555-5678"

**Fingerprint-Based Tracking:**
```javascript
// Generate fingerprint for factual content
const fingerprint = generateFactFingerprint(content);
// Example: "entity:phone_number:user"

// Check for existing facts with same fingerprint
const existingFacts = await findSupersedableFacts(fingerprint);

// Mark old facts as superseded
if (existingFacts.length > 0) {
  await markAsSuperseded(existingFacts[0].id, newMemoryId);
}
```

### 4.3 Memory Storage Categories

**11 Semantic Categories:** (used for both documents and memories)

1. `personal_life_interests` - Personal information, hobbies, preferences
2. `professional_expertise` - Career, skills, work experience
3. `health_wellness` - Health info, fitness, medical
4. `learning_education` - Educational goals, courses, certifications
5. `creative_projects` - Creative work, artistic projects
6. `social_connections` - Relationships, social networks
7. `goals_aspirations` - Future plans, dreams, objectives
8. `mental_emotional` - Mental health, emotions, feelings
9. `business_operations` - Business processes, operations
10. `technical_implementation` - Technical details, code, systems
11. `site_monkeys_specific` - Site Monkeys business context

**Category Routing:**
```javascript
// Analyze content and route to appropriate category
const routing = await intelligenceSystem.analyzeAndRoute(
  userMessage,
  userId
);

const category = routing.primaryCategory; // e.g., "health_wellness"
const subcategory = routing.subcategory;  // e.g., "fitness"
const confidence = routing.confidence;     // e.g., 0.85
```

---

## 5. Stubs and Placeholder Code

### 5.1 Implemented Features (Not Stubs)

✅ **Fully Functional:**
- File upload endpoints (2 complete implementations)
- DOCX text extraction
- Document analysis and metadata
- In-memory document storage
- Google Drive vault integration
- Vault caching (KV store)
- Semantic memory system
- Embedding generation
- Category-based retrieval
- Token budget tracking

### 5.2 Potential Enhancement Areas

**Areas that could be expanded:**

#### **A. PDF Processing**
- **Status:** Library installed (`pdf-parse`) but not used
- **Location:** `package.json` line 18
- **Potential:** Add PDF text extraction to upload endpoints
- **Stub Code:** None exists, would need to add

#### **B. Document Chunking**
- **Status:** Not implemented
- **Current:** Size limits only
- **Potential:** Chunk large documents for better context management
- **Would need:**
  - Chunking algorithm
  - Chunk storage schema
  - Chunk retrieval logic

#### **C. Persistent Document Storage**
- **Status:** In-memory only
- **Potential:** Add database table for long-term document storage
- **Would need:**
  ```sql
  CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT,
    chunks JSONB,
    metadata JSONB,
    embedding FLOAT4[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

#### **D. Image Analysis**
- **Status:** Images can be uploaded but not analyzed
- **Potential:** Use OpenAI Vision API for image understanding
- **Would need:**
  - Vision API integration
  - Image-to-text conversion
  - Image metadata extraction

#### **E. Audio/Video Transcription**
- **Status:** Files can be uploaded but not transcribed
- **Potential:** Use OpenAI Whisper API for transcription
- **Would need:**
  - Whisper API integration
  - Audio format conversion
  - Transcription storage

### 5.3 Commented Code / TODOs

**Search Results:** No significant TODO comments found related to documents/vault

**Clean Codebase:** The document and vault systems appear to be production-ready with no placeholder implementations.

---

## 6. Architecture Diagrams

### 6.1 Document Upload Flow

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ Upload file
       ▼
┌─────────────────────────────────────────┐
│  Upload Endpoint                        │
│  /api/upload-for-analysis               │
│                                         │
│  1. Multer receives file (in-memory)   │
│  2. Detect file type                    │
│  3. Process based on type               │
└──────┬──────────────────────────────────┘
       │
       ├─ DOCX → mammoth.extractRawText()
       ├─ TXT  → buffer.toString()
       └─ Other → metadata only
       │
       ▼
┌─────────────────────────────────────────┐
│  Document Analysis                      │
│                                         │
│  1. Extract full text                   │
│  2. Count words/characters              │
│  3. Detect content type                 │
│  4. Extract key phrases                 │
│  5. Calculate reading time              │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Storage: extractedDocuments Map        │
│                                         │
│  Key: "latest"                          │
│  Value: {                               │
│    id, filename, content,               │
│    fullContent, wordCount,              │
│    contentType, keyPhrases,             │
│    timestamp                            │
│  }                                      │
│                                         │
│  TTL: 10 minutes                        │
│  Limit: 100 documents                   │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│  Auto-Cleanup Service                   │
│  Runs every 60 seconds                  │
│  Removes documents > 10 min old         │
└─────────────────────────────────────────┘
```

### 6.2 Vault Retrieval Flow

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ Ask question about pricing
       ▼
┌───────────────────────────────────────────┐
│  Orchestrator                             │
│  /api/core/orchestrator.js                │
│                                           │
│  1. Check if vault trigger keyword        │
│  2. Retrieve vault content                │
└──────┬────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────┐
│  Priority Chain (Check in order)          │
│                                           │
│  1. req.vaultContent                      │
│     ↓ (if missing)                        │
│  2. global.vaultContent                   │
│     ↓ (if missing)                        │
│  3. process.env.VAULT_CONTENT             │
│     ↓ (if missing)                        │
│  4. Railway KV Cache                      │
│     ↓ (if missing)                        │
│  5. Google Drive API                      │
└──────┬────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────┐
│  Vault Loader (if needed)                 │
│  /lib/vault-loader.js                     │
│                                           │
│  1. Initialize Google Drive API           │
│  2. List folders in vault                 │
│  3. For each folder:                      │
│     - List files                          │
│     - Download files                      │
│     - Extract text                        │
│  4. Combine all content                   │
│  5. Cache in KV store                     │
│  6. Return vault data                     │
└──────┬────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────┐
│  Context Assembly                         │
│                                           │
│  Combined Context:                        │
│  - User memories (from DB)                │
│  - Uploaded documents (from Map)          │
│  - Vault content (from Google Drive)      │
│                                           │
│  Token Budget Enforcement:                │
│  - Memory: 2500 tokens max                │
│  - Documents: 1500 tokens max             │
│  - Vault: 3000 tokens max                 │
│  - Total: 7000 tokens max                 │
└──────┬────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────┐
│  AI Response Generation                   │
│  With full context from all sources       │
└───────────────────────────────────────────┘
```

### 6.3 Memory Integration Flow

```
┌────────────────────┐
│  Document Upload   │
└─────────┬──────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  extractedDocuments Map             │
│  (In-Memory, Temporary)             │
└─────────┬───────────────────────────┘
          │
          │ User asks about document
          ▼
┌─────────────────────────────────────┐
│  Orchestrator                       │
│                                     │
│  Retrieves:                         │
│  1. Semantic memories (DB)          │
│  2. Category memories (DB)          │
│  3. Document content (Map)          │
│  4. Vault content (Multiple sources)│
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  AI Processes Combined Context      │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Conversation Stored in Memory      │
│  persistent_memories table          │
│                                     │
│  Content may include:               │
│  - Document references              │
│  - Document insights                │
│  - Vault-informed responses         │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Embedding Generated (async)        │
│  For semantic search                │
└─────────────────────────────────────┘
```

---

## 7. File Paths Reference

### Core Upload Files
- `/api/upload-file.js` - Basic upload endpoint
- `/api/upload-for-analysis.js` - Enhanced upload with analysis
- `/api/repo-snapshot.js` - Repository file handling

### Vault System Files
- `/lib/vault-loader.js` - Main vault loading with Google Drive
- `/utils/memoryLoader.js` - Alternative optimized vault loader
- `/api/vault.js` - Vault status and trigger detection
- `/api/lib/vault.js` - Vault business logic engine
- `/api/load-vault.js` - Vault refresh endpoint
- `/api/utilities/vault-loader.js` - Utility vault functions

### Document Processing Files
- `package.json` - Dependencies (mammoth, pdf-parse, jszip, xml2js)

### Memory Integration Files
- `/api/core/orchestrator.js` - Central request coordinator
- `/api/services/semantic-retrieval.js` - Semantic search
- `/api/services/embedding-service.js` - Embedding generation
- `/api/services/supersession.js` - Fact supersession

### Database Files
- `/sql/migrate_memory_entries_to_persistent_memories.sql` - Schema migration
- `/api/categories/memory/internal/persistent_memory.js` - Memory storage
- `/api/categories/memory/internal/core.js` - Memory core logic

### Configuration
- `/.env` - Environment variables (not in repo)
- `/railway.json` - Railway deployment config

---

## 8. Dependencies

### Installed Packages (from package.json)

**File Processing:**
- `mammoth` (v1.6.0) - DOCX text extraction
- `pdf-parse` (v1.1.1) - PDF text extraction
- `jszip` (v3.10.1) - ZIP/DOCX file handling
- `xml2js` (v0.6.2) - XML parsing for DOCX
- `multer` (v2.0.2) - File upload middleware

**Google Drive:**
- `googleapis` (v126.0.1) - Google Drive API client

**Database:**
- `pg` (v8.11.3) - PostgreSQL client

**AI/ML:**
- `@anthropic-ai/sdk` (v0.27.0) - Claude API
- `openai` (v4.0.0) - OpenAI API (embeddings, GPT-4)
- `tiktoken` (v1.0.22) - Token counting

**Utilities:**
- `axios` (v1.5.0) - HTTP client
- `lodash` (v4.17.21) - Utility functions

---

## 9. Environment Variables

### Required for Full Functionality

**Google Drive (Vault System):**
```bash
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PROJECT_NUMBER=123456789
```

**Railway KV (Caching):**
```bash
KV_REST_API_URL=https://your-kv-instance.railway.app
KV_REST_API_TOKEN=your-kv-token
```

**Database (Memory Storage):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

**AI Services:**
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**Optional Features:**
```bash
ENABLE_INTELLIGENT_STORAGE=true  # Enable compressed memory storage
VAULT_CONTENT=...  # Pre-loaded vault content (alternative to Google Drive)
```

---

## 10. Summary Table

| Feature | Status | Files | Details |
|---------|--------|-------|---------|
| **File Upload Endpoint** | ✅ Complete | `upload-file.js`, `upload-for-analysis.js` | 2 endpoints, 50MB limit, 10 files max |
| **DOCX Processing** | ✅ Complete | `upload-for-analysis.js`, `vault-loader.js` | Text extraction, analysis, metadata |
| **PDF Processing** | ⚠️ Library Only | `package.json` | Library installed but not integrated |
| **TXT Processing** | ✅ Complete | `vault-loader.js` | Direct text read |
| **Document Chunking** | ❌ Not Implemented | N/A | Size limits instead of chunking |
| **Document Storage** | ⚠️ Temporary Only | `upload-for-analysis.js` | In-memory Map, 10-minute TTL |
| **Persistent Storage** | ❌ Not Implemented | N/A | No database table for documents |
| **Vault System** | ✅ Complete | `vault-loader.js`, `vault.js` | Google Drive integration |
| **Vault Caching** | ✅ Complete | `vault-loader.js` | Railway KV + multiple fallbacks |
| **vaultTokens Tracking** | ✅ Complete | `orchestrator.js` | Token budget enforcement |
| **Google Drive Integration** | ✅ Complete | `vault-loader.js`, `memoryLoader.js` | Read-only access, 3 folders |
| **S3 Integration** | ❌ Not Implemented | N/A | No cloud storage for uploads |
| **Document→Memory Integration** | ✅ Complete | `orchestrator.js` | Documents included in AI context |
| **Semantic Search** | ✅ Complete | `semantic-retrieval.js` | pgvector embeddings |
| **Embedding Generation** | ✅ Complete | `embedding-service.js` | OpenAI text-embedding-3-small |
| **Supersession System** | ✅ Complete | `supersession.js` | Automatic fact updating |

---

## 11. Recommendations

### For Document Features

1. **Implement Document Chunking**
   - Purpose: Support larger documents
   - Method: Token-based chunks (512-1024 tokens)
   - Storage: Add chunks to JSONB metadata

2. **Add Persistent Document Storage**
   - Create `documents` table
   - Store document content and metadata
   - Link to user sessions
   - Support cross-session retrieval

3. **Integrate PDF Processing**
   - Use existing `pdf-parse` library
   - Add to upload endpoints
   - Extract text and metadata

4. **Add Document Embedding**
   - Generate embeddings for each document chunk
   - Enable semantic document search
   - Store in pgvector column

### For Vault System

1. **Add Vault Analytics**
   - Track vault usage frequency
   - Monitor token consumption
   - Identify most-used vault sections

2. **Implement Vault Versioning**
   - Track vault content changes
   - Support rollback to previous versions
   - Audit trail for vault updates

3. **Add Vault Search**
   - Full-text search within vault
   - Semantic search for relevant sections
   - Return specific vault excerpts

### For Memory Integration

1. **Cross-Reference Documents and Memories**
   - Store document IDs in memory metadata
   - Link memories to source documents
   - Enable "source attribution" in AI responses

2. **Document-Based Memory Triggers**
   - Auto-generate memories from document content
   - Create summaries and key facts
   - Store as structured memories

3. **Improve Context Assembly**
   - Prioritize most relevant document sections
   - Implement smart truncation
   - Optimize token usage

---

## Conclusion

The SiteMonkeys AI system has a **comprehensive and well-architected** document upload and vault system with:

✅ **Strengths:**
- Complete file upload infrastructure
- Rich document processing (DOCX analysis)
- Sophisticated vault system with multi-layer caching
- Deep integration with semantic memory
- Production-ready code quality

⚠️ **Limitations:**
- Temporary document storage (no persistence)
- No document chunking for large files
- PDF processing not yet integrated
- No cloud storage for uploads

🔮 **Potential:**
- Easy to extend with persistent storage
- Foundation ready for advanced features
- Well-structured for future enhancements

The system is **production-ready for its current use case** (temporary document analysis for AI context) and has a solid foundation for future document management features.
