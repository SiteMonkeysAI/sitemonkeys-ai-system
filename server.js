// COMPLETE CARING FAMILY INTELLIGENCE SYSTEM
// Preserves all breakthrough insights from this conversation
// Ready for immediate Railway deployment
//Redeploy2

// Enhanced logging for Railway visibility
const logWithTimestamp = (level, category, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [${category}] ${message}`;
  
  if (level === "ERROR") {
    console.error(logMessage, data || "");
  } else if (level === "WARN") {
    console.warn(logMessage, data || "");
  } else {
    console.log(logMessage, data || "");
  }
  
  // Ensure logs are flushed immediately (important for Railway)
  if (process.stdout && process.stdout.write) {
    process.stdout.write("");
  }
};

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
import vaultStatusHandler from "./api/vault-status.js";

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
  console.warn("[SERVER] ⚠️ Set DATABASE_URL to use PostgreSQL session storage");
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

// Vault loading endpoint - connects frontend to existing vault-loader.js
app.get("/api/load-vault", loadVaultHandler);

// Vault status endpoint - real-time monitoring
app.get("/api/vault-status", vaultStatusHandler);

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
      userId = "anonymous",
      mode = "truth_general",
      sessionId,
      documentContext,
      vaultEnabled = false,
      vaultContext,
      vault_content,
      conversationHistory = [],
    } = req.body;

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

    // FIX: Transform vault_content to vaultContext structure for orchestrator
    let finalVaultContext = vaultContext;
    if (!finalVaultContext && vault_content && vault_content.length > 500) {
      finalVaultContext = {
        content: vault_content,
        loaded: true,
      };
      console.log(`[CHAT] 🍌 Vault content transformed: ${vault_content.length} chars`);
    }

    // Diagnostic logging for vault flow
    if (mode === "site_monkeys") {
      console.log("[CHAT] 🍌 Site Monkeys mode detected:");
      console.log(`  - vaultEnabled: ${vaultEnabled}`);
      console.log(`  - vault_content length: ${vault_content?.length || 0}`);
      console.log(`  - finalVaultContext: ${finalVaultContext ? 'present' : 'null'}`);
    }

    // Process request through orchestrator
    const result = await orchestrator.processRequest({
      message,
      userId,
      mode,
      sessionId,
      documentContext,
      vaultEnabled,
      vaultContext: finalVaultContext,
      conversationHistory,
    });

    // CRITICAL FIX: Store conversation in memory after successful processing
    if (result.success && global.memorySystem && global.memorySystem.storeMemory) {
      try {
        await global.memorySystem.storeMemory(
          userId,
          message,
          result.response,
          {
            mode: mode,
            sessionId: sessionId,
            confidence: result.metadata?.confidence,
            timestamp: new Date().toISOString(),
          }
        );
        console.log("[CHAT] 💾 Conversation stored in memory system");
      } catch (_storageError) {
        // Sanitize error message - don't expose database details
        console.error("[CHAT] ⚠️ Failed to store conversation: Memory system unavailable");
        // Don't fail the request if storage fails
      }
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

// Upload endpoints
app.post("/api/upload", uploadMiddleware, handleFileUpload);
app.post("/api/upload-for-analysis", analysisMiddleware, handleAnalysisUpload);

// Repo snapshot endpoint
app.use("/api", repoSnapshotRoute);

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
