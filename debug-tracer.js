// debug-tracer.js - Railway SIGTERM Detective
import fs from "fs";

const startTime = Date.now();
const logs = [];

function log(message) {
  const timestamp = Date.now() - startTime;
  const entry = `[+${timestamp}ms] ${message}`;
  logs.push(entry);
  console.log(entry);

  // Also write to file immediately (survives SIGTERM)
  try {
    fs.appendFileSync("railway-debug.log", entry + "\n");
  } catch (fileError) {
    console.error("❌ [TRACER] Failed to write log entry:", fileError.message);
  }
}

// Track every stage
log("🚀 TRACER: Process started");

process.on("SIGTERM", () => {
  log("💥 SIGTERM received");
  log(`📊 Process uptime: ${process.uptime()}s`);
  log(`📊 Memory: ${JSON.stringify(process.memoryUsage())}`);
  log(`📊 CPU: ${JSON.stringify(process.cpuUsage())}`);

  // Delay exit to capture more info
  setTimeout(() => {
    log("🔄 Exiting after SIGTERM analysis");
    process.exit(0);
  }, 2000);
});

process.on("unhandledRejection", (reason) => {
  log(`❌ Unhandled rejection: ${reason}`);
});

process.on("uncaughtException", (error) => {
  log(`❌ Uncaught exception: ${error.message}`);
});

// Track HTTP requests
let requestCount = 0;
export function trackRequest(req) {
  requestCount++;
  log(`📡 HTTP ${requestCount}: ${req.method} ${req.url}`);
}

export { log };
