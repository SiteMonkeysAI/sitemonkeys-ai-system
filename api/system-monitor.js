// SYSTEM MONITOR DASHBOARD HANDLER
// Import into server.js as: app.get('/api/system-monitor', monitorHandler)

const MONITOR_KEY = process.env.MONITOR_KEY || 'changeme';

const MAX_LOG_LINES = 200;
const MAX_REQUESTS = 20;

// --- LOG BUFFER IMPLEMENTATION ---
class CircularLogBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = Array(size);
    this.idx = 0;
    this.filled = false;
  }
  push(entry) {
    this.buffer[this.idx] = entry;
    this.idx = (this.idx + 1) % this.size;
    if (this.idx === 0) this.filled = true;
  }
  get() {
    if (!this.filled) return this.buffer.slice(0, this.idx);
    return this.buffer.slice(this.idx).concat(this.buffer.slice(0, this.idx));
  }
}

const logBuffer = new CircularLogBuffer(MAX_LOG_LINES);

// --- INTERCEPT CONSOLE LOGS ---
(function interceptConsole() {
  if (console._monkeyPatched) return; // Prevent double patch

  ['log', 'error', 'warn'].forEach((type) => {
    const original = console[type];
    console[type] = function (...args) {
      const timestamp = new Date().toISOString();
      logBuffer.push({
        type,
        timestamp,
        message: args
          .map((a) => {
            try {
              return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch {
              return '[Unserializable Object]';
            }
          })
          .join(' '),
      });
      original.apply(console, args);
    };
  });
  console._monkeyPatched = true;
})();

// --- RECENT REQUEST TRACKING ---
const recentRequests = new CircularLogBuffer(MAX_REQUESTS);
function trackChatRequest({ timestamp, userMessage, status, tokensUsed }) {
  recentRequests.push({
    timestamp,
    userMessage,
    status,
    tokensUsed,
  });
}

// --- LAST ERROR TRACKING ---
let lastError = null;
function trackError(err) {
  lastError = {
    timestamp: new Date().toISOString(),
    message: err?.stack || (typeof err === 'string' ? err : JSON.stringify(err)),
  };
}

// Attach to global for integration into server.js, chat handler, and error handler:
global.__systemMonitor = {
  trackChatRequest,
  trackError,
};

// --- SESSION STATS INTEGRATION ---
// sessionStats must exist globally or be imported here.
// Expects: { totalTokens, totalCost, requests }
function getSessionStats() {
  // You may need to adjust this depending on your codebase
  return (
    global.sessionStats || {
      totalTokens: 0,
      totalCost: 0,
      requests: 0,
    }
  );
}

// --- SYSTEM STATUS ---
function getSystemStatus() {
  const mem = process.memoryUsage();
  return {
    healthy: true, // If you have more advanced health checks, add here!
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    uptime: process.uptime(),
    lastError,
    timestamp: new Date().toISOString(),
  };
}

// --- DASHBOARD HTML ---
function renderDashboard({ logs, status, sessionStats, recentRequests }) {
  // Helper for formatting
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtTime(s) {
    let m = Math.floor(s / 60),
      h = Math.floor(m / 60),
      d = Math.floor(h / 24);
    h %= 24;
    m %= 60;
    s = Math.floor(s % 60);
    return `${d ? d + 'd ' : ''}${h ? h + 'h ' : ''}${m ? m + 'm ' : ''}${s}s`;
  }
  const healthy = status.healthy && !status.lastError;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<title>SYSTEM MONITOR</title>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="10">
<style>
body {
    background: #181c20; color: #eee; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0;
}
h1 {
    text-align: center; font-size: 2.2em; margin: 1.2em 0 0.5em 0;
}
.health {
    text-align: center; font-size: 2.5em; margin: 0.5em 0;
    color: ${healthy ? '#55dd88' : '#ff4444'};
    font-weight: bold;
}
.section {
    margin: 2em auto; max-width: 900px; background: #22252a; border-radius: 10px; padding: 1.5em; box-shadow: 0 2px 12px #0005;
}
.section h2 {
    margin-top: 0; color: #7bbcfb; font-size: 1.2em; letter-spacing: 0.03em;
}
pre, code {
    background: #181c20; color: #f9f9f9; padding: 0.4em 0.6em; border-radius: 4px;
    font-size: 1em; font-family: 'Fira Mono', 'Consolas', monospace;
    overflow-x: auto;
}
table {
    width: 100%; border-collapse: collapse; margin: 0.6em 0;
}
th, td {
    border-bottom: 1px solid #333; padding: 0.3em 0.6em; text-align: left;
    font-size: 1em;
}
th { color: #95aaff; font-weight: bold; }
tr:last-child td { border-bottom: none; }
.status-ind {
    display: inline-block; width: 1.2em; text-align: center; font-size: 1.1em;
}
::-webkit-scrollbar { height: 8px; background: #25282e; }
::-webkit-scrollbar-thumb { background: #3b3f44; border-radius: 8px; }
@media (max-width: 600px) {
    .section { padding: 0.6em; }
    h1 { font-size: 1.4em; }
}
</style>
</head>
<body>
<h1>SYSTEM MONITOR DASHBOARD</h1>
<div class="health">${healthy ? 'SYSTEM HEALTHY <span class="status-ind">✅</span>' : 'SYSTEM ERROR <span class="status-ind">❌</span>'}</div>

<div class="section">
    <h2>System Status</h2>
    <table>
        <tr><th>Server Running</th><td>${healthy ? '✅' : '❌'}</td></tr>
        <tr><th>Uptime</th><td>${fmtTime(status.uptime)}</td></tr>
        <tr><th>Memory Usage</th>
            <td>
                RSS: ${fmtBytes(status.memory.rss)},
                Heap: ${fmtBytes(status.memory.heapUsed)} / ${fmtBytes(status.memory.heapTotal)},
                External: ${fmtBytes(status.memory.external)}
            </td>
        </tr>
        <tr><th>Last Error</th>
            <td>${status.lastError ? `<code>${status.lastError.timestamp}<br>${status.lastError.message.slice(0, 320)}</code>` : '<span style="color:#55dd88">None</span>'}</td>
        </tr>
        <tr><th>Timestamp</th><td>${status.timestamp}</td></tr>
    </table>
</div>

<div class="section">
    <h2>Cost &amp; Token Stats</h2>
    <table>
        <tr><th>Total Tokens Used</th><td>${sessionStats.totalTokens || 0}</td></tr>
        <tr><th>Total Cost ($)</th><td>$${Number(sessionStats.totalCost || 0).toFixed(5)}</td></tr>
        <tr><th>Requests Count</th><td>${sessionStats.requests || 0}</td></tr>
    </table>
</div>

<div class="section">
    <h2>Recent /api/chat Requests</h2>
    <table>
        <tr>
            <th>Timestamp</th>
            <th>User Message</th>
            <th>Status</th>
            <th>Tokens Used</th>
        </tr>
        ${recentRequests
          .map(
            (r) => `
        <tr>
            <td>${r.timestamp}</td>
            <td><code>${(r.userMessage || '').slice(0, 50)}</code></td>
            <td>${r.status}</td>
            <td>${r.tokensUsed != null ? r.tokensUsed : ''}</td>
        </tr>`,
          )
          .join('')}
    </table>
</div>

<div class="section">
    <h2>Recent Logs (last ${MAX_LOG_LINES})</h2>
    <table>
        <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Message</th>
        </tr>
        ${logs
          .map(
            (log) => `
        <tr>
            <td style="font-size:0.95em">${log.timestamp}</td>
            <td>${log.type === 'log' ? '🟢' : log.type === 'warn' ? '🟡' : '🔴'} <code>${log.type}</code></td>
            <td style="font-family:monospace;font-size:0.98em;">${log.message.slice(0, 1000)}</td>
        </tr>`,
          )
          .join('')}
    </table>
</div>
<footer style="text-align:center; color:#555; font-size:0.95em; margin:2em 0">Auto-refreshes every 10 seconds.</footer>
</body>
</html>
    `;
}

// --- MAIN HANDLER ---
async function monitorHandler(req, res) {
  // --- SECURITY ---
  const key = req.query.key || req.headers['x-monitor-key'];
  if (!MONITOR_KEY || key !== MONITOR_KEY) {
    res.status(403).send('Forbidden: Invalid monitor key');
    return;
  }

  // --- GATHER DATA ---
  const logs = logBuffer.get();
  const status = getSystemStatus();
  const sessionStats = getSessionStats();
  const requests = recentRequests.get();

  // --- HTML RESPONSE ---
  res
    .set('Content-Type', 'text/html; charset=utf-8')
    .status(200)
    .send(
      renderDashboard({
        logs: logs.reverse(),
        status,
        sessionStats,
        recentRequests: requests.reverse(),
      }),
    );
}

// --- EXPORT HANDLER ---
export default monitorHandler;

// --- USAGE IN server.js ---
// const monitorHandler = require('./api/system-monitor');
// app.get('/api/system-monitor', monitorHandler);
//
// --- INTEGRATION INSTRUCTIONS ---
// 1. In your /api/chat handler, after handling a request, call:
//    global.__systemMonitor.trackChatRequest({
//        timestamp: new Date().toISOString(),
//        userMessage: req.body?.message || '',
//        status: res.statusCode,
//        tokensUsed: <tokensUsed>
//    });
//
// 2. In your error handling middleware, call:
//    global.__systemMonitor.trackError(err);
//
// 3. Ensure sessionStats is globally accessible as global.sessionStats, or adjust getSessionStats().
