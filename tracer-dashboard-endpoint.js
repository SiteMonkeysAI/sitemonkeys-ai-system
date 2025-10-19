// ================================================================
// REQUEST TRACER DASHBOARD ENDPOINT
// Provides web-based interface to view request tracing data
// Matches system-inventory-endpoint.js style and security
// ================================================================

// Import removed - tracer will be accessed via global

export function addTracerDashboardEndpoint(app) {
  // Cache for recent traces
  const recentTraces = [];
  const MAX_TRACES = 50;

  // Store completed traces
  global.storeCompletedTrace = (traceData) => {
    recentTraces.unshift(traceData);
    if (recentTraces.length > MAX_TRACES) {
      recentTraces.pop();
    }
  };

  // ================================================================
  // MAIN DASHBOARD ENDPOINT
  // ================================================================

  app.get("/api/tracer/dashboard", (req, res) => {
    try {
      // SECURITY CHECK - same pattern as inventory
      const secretKey = "inventory2024secure";

      if (req.query.key !== secretKey) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Missing or invalid key parameter",
        });
      }

      const format = req.query.format || "html";
      const filter = req.query.filter || "all"; // all, warnings, errors

      // Get current statistics
      const stats = global.tracer
        ? global.tracer.getStatistics()
        : getEmptyStats();

      // Filter traces
      let filteredTraces = recentTraces;
      if (filter === "warnings") {
        filteredTraces = recentTraces.filter((t) => t.warnings > 0);
      } else if (filter === "errors") {
        filteredTraces = recentTraces.filter((t) => t.errors > 0);
      }

      // Generate response
      sendResponse(
        res,
        {
          stats,
          traces: filteredTraces,
          enabled: process.env.TRACE_ENABLED === "true",
          timestamp: new Date().toISOString(),
        },
        format,
      );
    } catch (error) {
      console.error("[TRACER DASHBOARD] Error:", error);
      res.status(500).json({
        error: "Dashboard failed",
        message: error.message,
      });
    }
  });

  // ================================================================
  // TRACE DETAILS ENDPOINT
  // ================================================================

  app.get("/api/tracer/trace/:traceId", (req, res) => {
    try {
      const secretKey = "inventory2024secure";

      if (req.query.key !== secretKey) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Missing or invalid key parameter",
        });
      }

      const traceId = req.params.traceId;
      const trace = recentTraces.find((t) => t.traceId === traceId);

      if (!trace) {
        return res.status(404).json({
          error: "Trace not found",
          message: `No trace found with ID: ${traceId}`,
        });
      }

      res.json(trace);
    } catch (error) {
      res.status(500).json({
        error: "Failed to retrieve trace",
        message: error.message,
      });
    }
  });

  // ================================================================
  // HELPER FUNCTIONS
  // ================================================================

  function sendResponse(res, data, format) {
    switch (format) {
      case "json":
        res.json(data);
        break;

      case "html":
      default:
        res.type("text/html");
        res.send(generateDashboardHTML(data));
        break;
    }
  }

  function getEmptyStats() {
    return {
      totalRequests: 0,
      successfulTraces: 0,
      failedTraces: 0,
      dataLossDetected: 0,
      avgExecutionTime: 0,
      activeTraces: 0,
      moduleExecutions: {},
    };
  }

  // ================================================================
  // HTML GENERATION
  // ================================================================

  function generateDashboardHTML(data) {
    const { stats, traces, enabled, timestamp } = data;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Request Flow Tracer Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
    }
    
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    
    .status-banner {
      padding: 15px 30px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
    }
    
    .status-enabled {
      background: #10b981;
      color: white;
    }
    
    .status-disabled {
      background: #ef4444;
      color: white;
    }
    
    .controls {
      padding: 20px 30px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
    }
    
    .btn:hover {
      background: #5568d3;
      transform: translateY(-1px);
    }
    
    .btn-secondary {
      background: #6b7280;
    }
    
    .btn-secondary:hover {
      background: #4b5563;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px;
      background: #f9fafb;
    }
    
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      text-align: center;
      border-left: 4px solid #667eea;
    }
    
    .stat-card.warning {
      border-left-color: #f59e0b;
    }
    
    .stat-card.error {
      border-left-color: #ef4444;
    }
    
    .stat-card.success {
      border-left-color: #10b981;
    }
    
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #667eea;
      margin-bottom: 5px;
    }
    
    .stat-card.warning .stat-value {
      color: #f59e0b;
    }
    
    .stat-card.error .stat-value {
      color: #ef4444;
    }
    
    .stat-card.success .stat-value {
      color: #10b981;
    }
    
    .stat-label {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
    }
    
    .section {
      padding: 30px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .section:last-child {
      border-bottom: none;
    }
    
    .section h2 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .trace-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 15px;
      transition: all 0.2s;
    }
    
    .trace-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      border-color: #667eea;
    }
    
    .trace-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .trace-id {
      font-family: monospace;
      font-size: 14px;
      color: #667eea;
      font-weight: 600;
    }
    
    .trace-time {
      font-size: 12px;
      color: #6b7280;
    }
    
    .trace-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .trace-stat {
      display: flex;
      flex-direction: column;
    }
    
    .trace-stat-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 3px;
    }
    
    .trace-stat-value {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 8px;
    }
    
    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .badge-error {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }
    
    .warning-list {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin-top: 10px;
      border-radius: 4px;
    }
    
    .warning-item {
      font-size: 13px;
      color: #92400e;
      margin-bottom: 5px;
    }
    
    .warning-item:last-child {
      margin-bottom: 0;
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #6b7280;
    }
    
    .empty-state-icon {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.5;
    }
    
    .empty-state-text {
      font-size: 18px;
      margin-bottom: 10px;
    }
    
    .empty-state-hint {
      font-size: 14px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    
    th {
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-size: 13px;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }
    
    td {
      padding: 12px;
      font-size: 14px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    tr:hover {
      background: #f9fafb;
    }
    
    .module-name {
      font-family: monospace;
      font-size: 13px;
      color: #667eea;
    }
    
    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
      
      .trace-stats {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        <span>🔍</span>
        Request Flow Tracer Dashboard
      </h1>
      <p>Real-time request processing monitoring and analysis</p>
      <p style="margin-top: 10px; font-size: 12px;">Last Updated: ${new Date(timestamp).toLocaleString()}</p>
    </div>
    
    <div class="status-banner ${enabled ? "status-enabled" : "status-disabled"}">
      ${enabled ? "✅ TRACING ENABLED - Monitoring all requests" : "⚠️ TRACING DISABLED - Set TRACE_ENABLED=true to enable"}
    </div>
    
    <div class="controls">
      <a href="/api/tracer/dashboard?key=inventory2024secure" class="btn">🔄 Refresh</a>
      <a href="/api/tracer/dashboard?key=inventory2024secure&format=json" class="btn btn-secondary">📥 JSON</a>
      <a href="/api/tracer/dashboard?key=inventory2024secure&filter=warnings" class="btn btn-secondary">⚠️ Warnings Only</a>
      <a href="/api/tracer/dashboard?key=inventory2024secure&filter=errors" class="btn btn-secondary">❌ Errors Only</a>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalRequests}</div>
        <div class="stat-label">Total Requests</div>
      </div>
      
      <div class="stat-card success">
        <div class="stat-value">${stats.successfulTraces}</div>
        <div class="stat-label">Successful Traces</div>
      </div>
      
      <div class="stat-card ${stats.failedTraces > 0 ? "error" : ""}">
        <div class="stat-value">${stats.failedTraces}</div>
        <div class="stat-label">Failed Traces</div>
      </div>
      
      <div class="stat-card ${stats.dataLossDetected > 0 ? "warning" : ""}">
        <div class="stat-value">${stats.dataLossDetected}</div>
        <div class="stat-label">Data Loss Events</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">${stats.avgExecutionTime.toFixed(1)}ms</div>
        <div class="stat-label">Avg Execution Time</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-value">${stats.activeTraces}</div>
        <div class="stat-label">Active Traces</div>
      </div>
    </div>
    
    ${generateModuleExecutionsSection(stats.moduleExecutions)}
    
    ${generateRecentTracesSection(traces)}
  </div>
  
  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => {
      window.location.reload();
    }, 30000);
  </script>
</body>
</html>`;
  }

  function generateModuleExecutionsSection(moduleExecutions) {
    const modules = Object.entries(moduleExecutions || {});

    if (modules.length === 0) {
      return "";
    }

    const sortedModules = modules.sort((a, b) => b[1] - a[1]);

    return `
    <div class="section">
      <h2>🔧 Module Executions</h2>
      <table>
        <thead>
          <tr>
            <th>Module Name</th>
            <th>Execution Count</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${sortedModules
            .map(([module, count]) => {
              const total = modules.reduce((sum, [, c]) => sum + c, 0);
              const percentage = ((count / total) * 100).toFixed(1);
              return `
              <tr>
                <td><span class="module-name">${module}</span></td>
                <td>${count}</td>
                <td>${percentage}%</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  }

  function generateRecentTracesSection(traces) {
    if (traces.length === 0) {
      return `
      <div class="section">
        <h2>📊 Recent Traces</h2>
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">No traces recorded yet</div>
          <div class="empty-state-hint">
            ${
              process.env.TRACE_ENABLED === "true"
                ? "Send some chat requests to see traces appear here"
                : "Enable tracing by setting TRACE_ENABLED=true"
            }
          </div>
        </div>
      </div>`;
    }

    return `
    <div class="section">
      <h2>📊 Recent Traces (${traces.length})</h2>
      ${traces
        .slice(0, 20)
        .map((trace) => generateTraceCard(trace))
        .join("")}
    </div>`;
  }

  function generateTraceCard(trace) {
    const hasWarnings = trace.warnings > 0;
    const hasErrors = trace.errors > 0;
    const dataLost = trace.lostFields && trace.lostFields.length > 0;

    return `
    <div class="trace-card">
      <div class="trace-header">
        <div>
          <div class="trace-id">${trace.traceId}</div>
          <div class="trace-time">${new Date(trace.timestamp).toLocaleString()}</div>
        </div>
        <div>
          ${
            trace.dataIntegrity === "PASS"
              ? '<span class="badge badge-success">✓ Data Intact</span>'
              : '<span class="badge badge-error">✗ Data Loss</span>'
          }
          ${
            trace.fallbackDetected
              ? '<span class="badge badge-warning">⚠ Fallback</span>'
              : ""
          }
          ${
            hasWarnings
              ? `<span class="badge badge-warning">${trace.warnings} Warning${trace.warnings > 1 ? "s" : ""}</span>`
              : ""
          }
          ${
            hasErrors
              ? `<span class="badge badge-error">${trace.errors} Error${trace.errors > 1 ? "s" : ""}</span>`
              : ""
          }
        </div>
      </div>
      
      <div class="trace-stats">
        <div class="trace-stat">
          <div class="trace-stat-label">Duration</div>
          <div class="trace-stat-value">${trace.duration}</div>
        </div>
        
        <div class="trace-stat">
          <div class="trace-stat-label">Stages</div>
          <div class="trace-stat-value">${trace.stages}</div>
        </div>
        
        <div class="trace-stat">
          <div class="trace-stat-label">Modules</div>
          <div class="trace-stat-value">${trace.modulesExecuted}</div>
        </div>
        
        <div class="trace-stat">
          <div class="trace-stat-label">Prompt</div>
          <div class="trace-stat-value">${trace.promptInspection}</div>
        </div>
        
        <div class="trace-stat">
          <div class="trace-stat-label">Output</div>
          <div class="trace-stat-value">${trace.outputVerified ? "✓ Verified" : "✗ Not Verified"}</div>
        </div>
      </div>
      
      ${
        dataLost
          ? `
        <div class="warning-list">
          <strong>⚠️ Data Loss Detected:</strong>
          ${trace.lostFields
            .map(
              (field) => `
            <div class="warning-item">• Lost field: <code>${field}</code></div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
      
      ${
        trace.warningMessages && trace.warningMessages.length > 0
          ? `
        <div class="warning-list">
          <strong>⚠️ Warnings:</strong>
          ${trace.warningMessages
            .map(
              (msg) => `
            <div class="warning-item">• ${msg}</div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
      
      <div style="margin-top: 15px;">
        <a href="/api/tracer/trace/${trace.traceId}?key=inventory2024secure" 
           class="btn btn-secondary" 
           style="font-size: 12px; padding: 6px 12px;">
          View Full Details
        </a>
      </div>
    </div>`;
  }
}

export default addTracerDashboardEndpoint;
