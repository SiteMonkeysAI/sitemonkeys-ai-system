// COMPLETE CARING FAMILY INTELLIGENCE SYSTEM
// Preserves all breakthrough insights from this conversation
// Ready for immediate Railway deployment
//Redeploy2

// Enhanced logging for Railway visibility
console.log = ((oldLog) => {
  return (...args) => {
    oldLog.apply(console, args);
    // Force flush for Railway
    if (process.stdout && process.stdout.write) {
      process.stdout.write("");
    }
  };
})(console.log);

console.error = ((oldError) => {
  return (...args) => {
    oldError.apply(console, args);
    // Force flush for Railway
    if (process.stderr && process.stderr.write) {
      process.stderr.write("");
    }
  };
})(console.error);

console.log("[SERVER] 🎬 Starting Site Monkeys AI System...");
console.log("[SERVER] 📦 Loading dependencies...");

import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { persistentMemory } from "./api/categories/memory/index.js";
import { uploadMiddleware, handleFileUpload } from "./api/upload-file.js";
import {
  analysisMiddleware,
  handleAnalysisUpload,
} from "./api/upload-for-analysis.js";
import repoSnapshotRoute from "./api/repo-snapshot.js";
import { addInventoryEndpoint } from "./system-inventory-endpoint.js";
import Orchestrator from "./api/core/orchestrator.js";
import systemStatus from "./api/system-status.js"; // <-- ADDED
import { runAllTests } from "./api/test-suite.js";
import loadVaultHandler from "./api/load-vault.js";
import { vaultLoader } from "./api/utilities/vault-loader.js";
import { sessionManager } from "./api/lib/session-manager.js";
import debugRoutes from "./api/routes/debug.js";
import memoryFullCheckRoutes from "./api/test/memory-full-check.js";
import migrateSemanticHandler from "./api/routes/migrate-semantic.js";
import migrateSemanticV2Handler from "./api/routes/migrate-semantic-v2.js";
import testSemanticHandler from "./api/routes/test-semantic.js";
import dbMigrationRouter from "./api/admin/db-migration.js";
import rateLimit from "express-rate-limit";
// ========== SEMANTIC INTEGRATION ==========
import { storeWithSupersession, generateFactFingerprint } from "./api/services/supersession.js";
import { embedMemoryNonBlocking } from "./api/services/embedding-service.js";
import { sanitizePII } from "./api/memory/pii-sanitizer.js";
// ================================================

console.log("[SERVER] ✅ Dependencies loaded");
console.log("[SERVER] 🎯 Initializing Orchestrator...");

const orchestrator = new Orchestrator();

console.log("[SERVER] ✅ Orchestrator created");

// Initialize PostgreSQL session store
const PgSession = connectPgSimple(session);

// ===== CRITICAL RAILWAY ERROR HANDLERS =====
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
  console.error("Promise:", promise);
  // Don't exit - Railway will restart if we do
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack:", error.stack);
  // Log but continue running
});

// ===== PROCESS LIFECYCLE DIAGNOSTICS =====
process.on("exit", (code) => {
  console.log(`[SERVER] 🛑 Process exit event with code: ${code}`);
});

process.on("beforeExit", (code) => {
  console.log(`[SERVER] ⚠️ Process beforeExit event with code: ${code}`);
});

process.on("SIGTERM", () => {
  console.log("[SERVER] 🛑 SIGTERM signal received, shutting down gracefully");
  process.exit(0);
});

// NOW declare your variables:
const app = express();
// Trust proxy for Railway deployment (required for accurate rate limiting)
app.set('trust proxy', 1);
addInventoryEndpoint(app);

// 🔐 SESSION CONFIGURATION
// SECURITY: Session management with PostgreSQL-backed storage
// - Uses environment variable for secret (SESSION_SECRET should be set in production)
// - PostgreSQL store prevents memory leaks and scales horizontally
// - Sessions persist across server restarts
// - Automatic cleanup of expired sessions every 15 minutes
// - sameSite: 'lax' provides CSRF protection while allowing reasonable navigation
// - 30-day expiration for better user experience
// - httpOnly: true prevents JavaScript access to cookies
// - secure: true in production requires HTTPS
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "sitemonkeys-fallback-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: "lax", // CSRF protection
    httpOnly: true, // Prevent JavaScript access
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
  },
};

// Use PostgreSQL session store if DATABASE_URL is available
// Falls back to MemoryStore in development without DATABASE_URL
if (process.env.DATABASE_URL) {
  sessionConfig.store = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "user_sessions",
    pruneSessionInterval: 60 * 15, // Clean up expired sessions every 15 minutes
    createTableIfMissing: true, // Automatically create sessions table
  });
  console.log("[SERVER] 🔐 Session storage: PostgreSQL (production-ready)");
} else {
  console.warn(
    "[SERVER] ⚠️ Session storage: MemoryStore (development only - will leak memory in production)",
  );
  console.warn(
    "[SERVER] ⚠️ Set DATABASE_URL to use PostgreSQL session storage",
  );
}

app.use(session(sessionConfig));

// ===== APPLICATION STARTUP MEMORY INITIALIZATION =====
console.log(
  "[SERVER] ��� Initializing memory systems at application startup...",
);

// CRITICAL FIX: Move async initialization inside an async function
async function initializeMemorySystem() {
  console.log("[SERVER] 🚀 Starting memory system initialization...");

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Memory init timeout")), 30000),
    );

    // NOTE: After PR #39 reorganization, persistentMemory is a thin wrapper
    // Access coreSystem.initialize() directly since persistentMemory doesn't expose initialize()
    const initResult = await Promise.race([
      persistentMemory.coreSystem.initialize(),
      timeoutPromise,
    ]);

    console.log(
      `[SERVER] ✅ Memory system initialized successfully: ${initResult}`,
    );

    // CRITICAL FIX: Expose persistentMemory as global.memorySystem
    global.memorySystem = persistentMemory;
    console.log("[SERVER] ✅ Memory system exposed as global.memorySystem");

    // Initialize intelligence system
    await persistentMemory.intelligenceSystem.initialize();
    console.log("[SERVER] ✅ Intelligence system initialized");

    // Initialize vault loader
    console.log("[SERVER] 🍌 Initializing vault loader...");
    try {
      await vaultLoader.initialize();
      const vaultStats = vaultLoader.getStats();
      console.log(
        `[SERVER] ✅ Vault loader initialized: ${vaultStats.coreTokens} core tokens, ${vaultStats.indexedFiles} files indexed`,
      );
    } catch (vaultError) {
      console.error(
        "[SERVER] ⚠️ Vault loader initialization failed:",
        vaultError.message,
      );
      console.log("[SERVER] System will continue without vault preload");
    }

    // Verify memory system is working
    console.log("[SERVER] 📊 Memory system verification:", {
      available: !!global.memorySystem,
      ready: persistentMemory.isReady(),
      coreInitialized: persistentMemory.coreSystem?.isInitialized || false,
      intelligenceInitialized:
        persistentMemory.intelligenceSystem?.isInitialized || false,
    });
  } catch (initError) {
    console.error("[SERVER] ❌ Memory system initialization error:", {
      message: initError.message,
      stack: initError.stack?.substring(0, 500),
    });

    console.log("[SERVER] 🔄 Server will continue with fallback memory only");
  }

  console.log("[SERVER] 📊 Memory system initialization phase complete");
}

// ===== MIDDLEWARE CONFIGURATION =====
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

console.log("[SERVER] ✅ Middleware configured");

// ===== API ROUTES =====

// Health check endpoint - Railway needs simple response
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Detailed health check for monitoring
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    orchestrator: {
      initialized: orchestrator.initialized,
    },
  });
});

// System status endpoint
app.get("/api/system-status", systemStatus); // <-- ADDED

// Memory visibility endpoint - Innovation #46: Users can view what system remembers
app.get('/api/memory/list', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId || 'anonymous';
    
    // Validate userId format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid userId format' 
      });
    }
    
    // Get database pool from memory system
    const pool = global.memorySystem?.pool || persistentMemory.pool;
    
    if (!pool) {
      return res.status(500).json({ 
        success: false, 
        error: 'Memory system not available' 
      });
    }
    
    const memories = await pool.query(`
      SELECT id, content, category_name, created_at, relevance_score, mode
      FROM persistent_memories
      WHERE user_id = $1 AND (is_current = true OR is_current IS NULL)
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT 50
    `, [userId]);
    
    res.json({
      success: true,
      count: memories.rows.length,
      memories: memories.rows.map(m => ({
        id: m.id,
        content: sanitizePII(m.content), // Apply PII protection
        category: m.category_name,
        stored: m.created_at,
        importance: m.relevance_score,
        mode: m.mode
      }))
    });
  } catch (error) {
    console.error('[MEMORY-LIST] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve memories' 
    });
  }
});

// Vault loading endpoint - connects frontend to existing vault-loader.js
app.get("/api/load-vault", loadVaultHandler);

// Test suite endpoint - comprehensive feature validation
app.get("/api/run-tests", async (req, res) => {
  try {
    console.log("[TEST-ENDPOINT] Running comprehensive test suite...");
    const testResults = await runAllTests();
    res.json(testResults);
  } catch (error) {
    console.error("[TEST-ENDPOINT] Error running tests:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      tests_run: 0,
      tests_passed: 0,
      tests_failed: 0,
    });
  }
});

// Chat endpoint - main AI processing
// SECURITY: Input validation and sanitization
app.post("/api/chat", async (req, res) => {
  try {
    console.log("[CHAT] 📨 Received chat request");

    // SECURITY: Extract and validate request parameters
    // - Default values prevent undefined/null processing issues
    // - Type coercion handled by destructuring defaults
    const {
      message,
      user_id,
      mode = "truth_general",
      sessionId,
      documentContext,
      vaultEnabled = false,
      vaultContext,
      vault_content,
      conversationHistory = [],
      claude_confirmed = false, // BIBLE FIX: User confirmation for Claude escalation
    } = req.body;

    // Map user_id to userId for internal use
    // Check all possible sources for consistency (UX-044)
    console.log('[SESSION-DIAG] ════════════════════════════════════════');
    console.log('[SESSION-DIAG] Headers x-user-id:', req.headers['x-user-id']);
    console.log('[SESSION-DIAG] Body user_id:', user_id);
    console.log('[SESSION-DIAG] Query userId:', req.query?.userId);

    const userId = user_id || req.headers['x-user-id'] || req.query?.userId || "anonymous";

    // TRACE LOGGING - Step 1 & 2
    console.log("[TRACE] 1. Received user_id from request:", user_id);
    console.log("[TRACE] 2. Mapped to userId:", userId);
    console.log('[SESSION-DIAG] Final userId:', userId);

    // SECURITY: Input validation - message is required
    // Prevents processing empty/invalid requests
    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    // SECURITY: Additional validation could include:
    // - Message length limits (prevent DoS through large inputs)
    // - Rate limiting per userId/IP
    // - Content filtering for malicious patterns

    // Initialize session if needed
    if (sessionId) {
      sessionManager.initializeSession(sessionId, userId);
      sessionManager.updateActivity(sessionId);
    }

    // Get conversation history from session (Issue #391: Conversation Context Continuity)
    let effectiveConversationHistory = conversationHistory;
    if (sessionId) {
      const sessionHistory = sessionManager.getConversationHistory(sessionId);
      // Use session history if available, otherwise use provided history
      if (sessionHistory && sessionHistory.length > 0) {
        effectiveConversationHistory = sessionHistory;
        console.log(`[CHAT] Using session conversation history: ${sessionHistory.length} turns`);
      }
    }

    // FIX: Transform vault_content to vaultContext structure for orchestrator
    let finalVaultContext = vaultContext;
    if (!finalVaultContext && vault_content && vault_content.length > 500) {
      finalVaultContext = {
        content: vault_content,
        loaded: true,
      };
      console.log(
        `[CHAT] 🍌 Vault content transformed: ${vault_content.length} chars`,
      );
    }

    // Diagnostic logging for vault flow
    if (mode === "site_monkeys") {
      console.log("[CHAT] 🍌 Site Monkeys mode detected:");
      console.log(`  - vaultEnabled: ${vaultEnabled}`);
      console.log(`  - vault_content length: ${vault_content?.length || 0}`);
      console.log(
        `  - finalVaultContext: ${finalVaultContext ? "present" : "null"}`,
      );
    }

    // TRACE LOGGING - Step 3
    console.log(
      "[TRACE] 3. About to call orchestrator.processRequest with userId:",
      userId,
    );

    // HANDOFF LOGGING (Issue #392): server → orchestrator
    console.log('[HANDOFF] server → orchestrator:', {
      hasConversationHistory: Array.isArray(effectiveConversationHistory),
      historyLength: effectiveConversationHistory?.length || 0,
      sessionId: sessionId ? 'present' : 'missing',
      hasMessage: !!message,
      messageLength: message?.length || 0
    });

    // Process request through orchestrator
    const result = await orchestrator.processRequest({
      message,
      userId,
      mode,
      sessionId,
      documentContext,
      vaultEnabled,
      vaultContext: finalVaultContext,
      conversationHistory: effectiveConversationHistory,
      claudeConfirmed: claude_confirmed, // BIBLE FIX: Pass confirmation flag
    });

    // TRACE LOGGING - Step 4 & 5 & 6
    console.log(
      "[TRACE] 4. orchestrator.processRequest returned, result.success:",
      result.success,
    );
    console.log(
      "[TRACE] 5. global.memorySystem exists:",
      !!global.memorySystem,
    );
    console.log(
      "[TRACE] 6. storeMemory exists:",
      !!global.memorySystem?.storeMemory,
    );

    // Store conversation turn in session (Issue #391: Conversation Context Continuity)
    if (sessionId && result.success) {
      try {
        sessionManager.addConversationTurn(sessionId, 'user', message);
        sessionManager.addConversationTurn(sessionId, 'assistant', result.response);
        console.log(`[CHAT] Conversation turns stored in session ${sessionId}`);
      } catch (turnError) {
        console.error('[CHAT] Failed to store conversation turn:', turnError.message);
        // Non-fatal - continue processing
      }
    }

    if (
      result.success &&
      global.memorySystem &&
      global.memorySystem.storeMemory
    ) {
      // TRACE LOGGING - Step 7 & 8
      console.log("[TRACE] 7. STORAGE BLOCK ENTERED");
      console.log("[TRACE] 8. Storing for userId:", userId);
      console.log(
        "[CHAT] [STORAGE] ✓ Storage conditions met - proceeding with storage...",
      );
      console.log("[CHAT] [STORAGE] Storing for userId:", userId);
      try {
        // Intelligent memory storage with compression and deduplication
        console.log(
          "[CHAT] [STORAGE] ENABLE_INTELLIGENT_STORAGE:",
          process.env.ENABLE_INTELLIGENT_STORAGE,
        );
        if (process.env.ENABLE_INTELLIGENT_STORAGE === "true") {
          const { IntelligentMemoryStorage } =
            await import("./api/memory/intelligent-storage.js");
          const intelligentStorage = new IntelligentMemoryStorage(
            global.memorySystem.coreSystem.db,
            process.env.OPENAI_API_KEY,
          );

          // Use semantic routing to determine category (matches retrieval logic)
          // This ensures storage and retrieval use the same 11 semantic categories
          const routing =
            await global.memorySystem.intelligenceSystem.analyzeAndRoute(
              message,
              userId,
            );
          const category = routing.primaryCategory;
          console.log(`[CHAT] [STORAGE] Routed to category: ${category}`);

          const storageResult = await intelligentStorage.storeWithIntelligence(
            userId,
            message,
            result.response,
            category,
          );

          intelligentStorage.cleanup();
          console.log(
            `[CHAT] 💾 Intelligent storage complete: ${storageResult.action} (ID: ${storageResult.memoryId})`,
          );

          // TRACE LOGGING - Step 9 (Intelligent path)
          console.log(
            "[TRACE] 9. Intelligent storage complete, result:",
            JSON.stringify({
              action: storageResult.action,
              memoryId: storageResult.memoryId,
              success: storageResult.success,
            }),
          );
        } else {
          // Supersession-aware storage path
          console.log("[CHAT] [STORAGE] Using supersession-aware storage...");

          // Combine message and response for storage
          const content = `User: ${message}\nAssistant: ${result.response}`;

          // Generate fingerprint (deterministic-first, model-fallback with timeout)
          let fingerprint = null;
          let fingerprintConfidence = 0;

          try {
            const fpResult = await Promise.race([
              generateFactFingerprint(content),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]);
            fingerprint = fpResult.fingerprint;
            fingerprintConfidence = fpResult.confidence;

            if (fingerprint) {
              console.log(`[STORE] Fingerprint detected: ${fingerprint} (${fpResult.method}, confidence: ${fingerprintConfidence})`);
            }
          } catch (e) {
            console.log(`[STORE] Fingerprint generation skipped: ${e.message}`);
          }

          // Get database pool
          const pool = global.memorySystem?.pool;
          if (!pool) {
            console.error("[CHAT] [STORAGE] No database pool available, falling back to legacy storage");
            const storageResult = await global.memorySystem.storeMemory(
              userId,
              message,
              result.response,
              {
                mode: mode,
                sessionId: sessionId,
                confidence: result.metadata?.confidence,
                timestamp: new Date().toISOString(),
              },
            );
            console.log("[CHAT] 💾 Legacy fallback storage complete");
          } else {
            // Store with supersession (transaction-safe)
            const storeResult = await storeWithSupersession(pool, {
              userId,
              content,
              factFingerprint: fingerprint,
              fingerprintConfidence: fingerprintConfidence,
              mode: mode || 'truth-general',
              categoryName: 'general', // Could enhance with semantic routing
              tokenCount: Math.ceil(content.length / 4)
            });

            console.log(
              `[CHAT] 💾 Supersession storage complete (ID: ${storeResult.memoryId}, superseded: ${storeResult.supersededCount})`
            );

            // Generate embedding (non-blocking, fire-and-forget)
            embedMemoryNonBlocking(pool, storeResult.memoryId, content)
              .then(r => console.log(`[STORE] Embedding ${r.status || 'initiated'} for ID ${storeResult.memoryId}`))
              .catch(e => console.log(`[STORE] Embedding deferred for ID ${storeResult.memoryId}: ${e.message}`));

            // TRACE LOGGING - Step 9 (Supersession path)
            console.log(
              "[TRACE] 9. Supersession storage complete, result:",
              JSON.stringify({
                success: storeResult.success,
                memoryId: storeResult.memoryId,
                superseded: storeResult.supersededCount,
                fingerprint: fingerprint
              }),
            );
          }
        }
      } catch (_storageError) {
        // Sanitize error message - don't expose database details
        console.error(
          "[CHAT] ⚠️ Failed to store conversation:",
          _storageError.message,
        );
        console.error("[CHAT] ⚠️ Storage error stack:", _storageError.stack);
        // Don't fail the request if storage fails
      }
    } else {
      console.log(
        "[CHAT] [STORAGE] ✗ Storage conditions NOT met - skipping storage",
      );
      if (!result.success)
        console.log("[CHAT] [STORAGE] Reason: result.success is false");
      if (!global.memorySystem)
        console.log(
          "[CHAT] [STORAGE] Reason: global.memorySystem is not available",
        );
      if (!global.memorySystem?.storeMemory)
        console.log(
          "[CHAT] [STORAGE] Reason: storeMemory method not available",
        );
    }

    // ========== HANDLE CLAUDE CONFIRMATION REQUEST (BIBLE REQUIREMENT - Section D) ==========
    // If orchestrator returns needsConfirmation, pass it to frontend immediately
    if (result.needsConfirmation) {
      console.log('[CHAT] ⚠️ Claude escalation requires user confirmation');
      return res.json(result);
    }

    res.json(result);
  } catch (error) {
    console.error("[CHAT] ❌ Error processing chat:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      response:
        "I encountered an error processing your request. Please try again.",
    });
  }
});

// GET /api/test/memory-check - Browser-based memory test
app.get("/api/test/memory-check", async (req, res) => {
  // Security: Only allow in private/debug mode
  if (
    process.env.DEPLOYMENT_TYPE !== "private" &&
    process.env.DEBUG_MODE !== "true"
  ) {
    return res
      .status(403)
      .send("Test endpoint not available in production mode");
  }

  const runId = Date.now();
  const testUserId = `test-user-${runId}`;
  const results = [];
  const tripwire = `ZEBRA-TEST-${runId}`;

  // Helper to simulate internal chat
  async function testChat(message) {
    try {
      // Use the orchestrator directly if available
      if (global.orchestrator && global.orchestrator.processRequest) {
        const result = await global.orchestrator.processRequest({
          message,
          userId: testUserId,
          mode: "truth_general",
          conversationHistory: [],
        });

        // CRITICAL FIX: Store conversation after processing (same as /api/chat route)
        if (
          result.success &&
          global.memorySystem &&
          global.memorySystem.storeMemory
        ) {
          try {
            console.log("[TEST] [STORAGE] Storing test conversation...");
            await global.memorySystem.storeMemory(
              testUserId,
              message,
              result.response,
              {
                mode: "truth_general",
                confidence: result.metadata?.confidence,
                timestamp: new Date().toISOString(),
              },
            );
            console.log(
              "[TEST] [STORAGE] ✓ Test conversation stored successfully",
            );
          } catch (storageError) {
            console.error(
              "[TEST] [STORAGE] ✗ Failed to store:",
              storageError.message,
            );
          }
        }

        return {
          response: result.response || result.message,
          success: result.success,
        };
      }
      return { error: "Orchestrator not available" };
    } catch (err) {
      return { error: err.message };
    }
  }

  // Test 1: Store a tripwire
  const storeResult = await testChat(
    `Remember this: My test phrase is ${tripwire}`,
  );
  results.push({
    test: "1. STORE tripwire",
    passed: !storeResult.error,
    tripwire,
    response: (storeResult.response || storeResult.error || "").substring(
      0,
      200,
    ),
  });

  // Wait for storage to complete
  await new Promise((r) => setTimeout(r, 2000));

  // Test 2: Recall the tripwire
  const recallResult = await testChat("What is my test phrase?");
  const foundTripwire =
    recallResult.response && recallResult.response.includes(tripwire);
  results.push({
    test: "2. RECALL tripwire",
    passed: foundTripwire,
    expected: tripwire,
    found: foundTripwire,
    response: (recallResult.response || recallResult.error || "").substring(
      0,
      300,
    ),
  });

  // Test 3: Check for ignorance phrases
  const ignorancePhrases = [
    "don't have",
    "no memory",
    "haven't told",
    "first interaction",
    "don't recall",
  ];
  const hasIgnorance = ignorancePhrases.some((p) =>
    (recallResult.response || "").toLowerCase().includes(p.toLowerCase()),
  );
  results.push({
    test: "3. NO false ignorance claims",
    passed: !hasIgnorance,
    found_ignorance: hasIgnorance,
    note: hasIgnorance
      ? "FAIL: AI claimed no memory when it should have remembered"
      : "PASS: No false claims",
  });

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  // Return HTML
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Memory Test Results</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; max-width: 900px; margin: 0 auto; }
    h1 { color: #00d4ff; }
    .pass { color: #4ade80; font-weight: bold; }
    .fail { color: #f87171; font-weight: bold; }
    .test { background: #16213e; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #444; }
    .test.passed { border-left-color: #4ade80; }
    .test.failed { border-left-color: #f87171; }
    pre { background: #0f0f23; padding: 10px; overflow-x: auto; border-radius: 4px; }
    .summary { font-size: 1.2em; padding: 15px; background: #16213e; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>🧠 Memory System Test Results</h1>
  <div class="summary">
    <strong>Run ID:</strong> ${runId}<br>
    <strong>Test User:</strong> ${testUserId}<br>
    <strong>Results:</strong> <span class="pass">${passed} passed</span> | <span class="fail">${failed} failed</span>
  </div>
  ${results
    .map(
      (r) => `
    <div class="test ${r.passed ? "passed" : "failed"}">
      <h3>${r.passed ? "✅" : "❌"} ${r.test}</h3>
      <pre>${JSON.stringify(r, null, 2)}</pre>
    </div>
  `,
    )
    .join("")}
  <p style="color: #888; margin-top: 30px;">Test completed at ${new Date().toISOString()}</p>
</body>
</html>`;

  res.send(html);
});

// ===== SESSION MANAGEMENT ENDPOINTS =====
// Endpoint to end a session and flush cache
app.post("/api/session/end", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "Session ID is required",
      });
    }

    const ended = sessionManager.endSession(sessionId, "user_logout");

    if (ended) {
      console.log(`[SESSION] Session ${sessionId} ended and cache flushed`);
      return res.json({
        success: true,
        message: "Session ended and cache flushed",
      });
    } else {
      return res.json({
        success: false,
        message: "Session not found or already ended",
      });
    }
  } catch (error) {
    console.error("[SESSION] Error ending session:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to end session",
    });
  }
});

// Endpoint to clear user context (all sessions for a user)
app.post("/api/session/clear-context", async (req, res) => {
  try {
    const { user_id } = req.body;
    const userId = user_id; // Map for internal use

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const cleared = sessionManager.clearUserContext(userId);

    console.log(
      `[SESSION] Cleared context for user ${userId}: ${cleared} sessions`,
    );
    return res.json({
      success: true,
      sessionsCleared: cleared,
      message: `Context cleared for ${cleared} sessions`,
    });
  } catch (error) {
    console.error("[SESSION] Error clearing user context:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to clear user context",
    });
  }
});

// Endpoint to get session stats
app.get("/api/session/stats", (req, res) => {
  try {
    const { sessionId } = req.query;

    if (sessionId) {
      const stats = sessionManager.getSessionStats(sessionId);
      if (stats) {
        return res.json({ success: true, stats });
      } else {
        return res.status(404).json({
          success: false,
          error: "Session not found",
        });
      }
    } else {
      const globalStats = sessionManager.getGlobalStats();
      const activeSessions = sessionManager.getActiveSessions();
      return res.json({
        success: true,
        global: globalStats,
        sessions: activeSessions,
      });
    }
  } catch (error) {
    console.error("[SESSION] Error getting session stats:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get session stats",
    });
  }
});

// ===== RATE LIMITERS =====
// Define all rate limiters before route registration

const migrateSemanticRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 migration requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

const testSemanticRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for this route
  standardHeaders: true,
  legacyHeaders: false,
});

const migrateSemanticV2RateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for this route
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== ROUTE REGISTRATION =====
// CRITICAL: Specific routes MUST be registered BEFORE catch-all routes

// Upload endpoints
app.post("/api/upload", uploadMiddleware, handleFileUpload);
app.post("/api/upload-for-analysis", analysisMiddleware, handleAnalysisUpload);

// Debug endpoint (only in private/debug mode) - MUST come before catch-all routes
app.use("/api/debug", debugRoutes);

// Memory full check test endpoint (only in private/debug mode)
app.use("/api/test", memoryFullCheckRoutes);

// Semantic layer routes - MUST be before catch-all
app.get("/api/migrate-semantic", migrateSemanticRateLimiter, migrateSemanticHandler);
app.get('/api/migrate-semantic-v2', migrateSemanticV2RateLimiter, migrateSemanticV2Handler);
app.get('/api/test-semantic', testSemanticRateLimiter, testSemanticHandler);

// Database migration routes (one-time use - delete after migration)
dbMigrationRouter(app);

// Repo snapshot endpoint - mount at root level so routes in router are absolute
app.use(repoSnapshotRoute);

console.log("[SERVER] ✅ Routes configured");

// ===== START HTTP SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🔍 Health check available at /health`);
});

(async () => {
  console.log("🚀 Background initialization starting...");
  try {
    console.log("📊 Initializing memory system...");
    await initializeMemorySystem();
    console.log("✅ Memory system initialized");
  } catch (err) {
    console.error("⚠️ Memory system initialization failed:", err.message);
    console.log("📦 Running with in-memory fallback");
  }
  try {
    console.log("🧠 Initializing orchestrator...");
    await orchestrator.initialize();
    console.log("✅ Orchestrator initialized");

    // CRITICAL FIX: Expose orchestrator as global.orchestrator for test endpoints
    global.orchestrator = orchestrator;
    console.log("[SERVER] ✅ Orchestrator exposed as global.orchestrator");
  } catch (err) {
    console.error("⚠️ Orchestrator initialization failed:", err.message);
    console.log("🔄 System running in degraded mode");
  }
  console.log("🎉 System fully initialized and ready");

  // Add keepalive timer to prevent event loop from going idle
  console.log(
    "⏰ Starting keepalive timer (60s interval) to prevent process exit",
  );
  setInterval(() => {
    console.log("💓 Keepalive ping - process active");
  }, 60000);
  console.log("✅ Keepalive timer active - process will remain running");
})();
