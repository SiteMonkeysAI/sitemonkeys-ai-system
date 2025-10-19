// system-inventory-endpoint.js
// Add this to your existing Express app or create as standalone

import fs from "fs";
import path from "path";
import crypto from "crypto";

// Add this to your existing Express app
export function addInventoryEndpoint(app) {
  // Cache for inventory results (5 minute TTL)
  let inventoryCache = {
    data: null,
    timestamp: 0,
    TTL: 5 * 60 * 1000, // 5 minutes
  };

  app.get("/api/system-inventory", async (req, res) => {
    try {
      // SECURITY CHECK - require secret key
      const secretKey = "inventory2024secure"; // Change this to whatever you want

      if (req.query.key !== secretKey) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Missing or invalid key parameter",
        });
      }

      const format = req.query.format || "html";
      const _noCache = req.query.nocache === "true";

      console.log("Generating new inventory scan...");

      // Run inventory scan
      const inventory = await scanSystem();

      // Update cache
      inventoryCache = {
        data: inventory,
        timestamp: Date.now(),
        TTL: inventoryCache.TTL,
      };

      // Send response in requested format
      sendResponse(res, inventory, format);
    } catch (error) {
      console.error("Inventory scan failed:", error);
      res.status(500).json({
        error: "Inventory scan failed",
        message: error.message,
      });
    }
  });

  // Helper to send response in different formats
  function sendResponse(res, inventory, format) {
    switch (format) {
      case "json":
        res.json(inventory);
        break;

      case "markdown":
      case "md":
        res.type("text/markdown");
        res.send(generateMarkdownReport(inventory));
        break;

      case "html":
      default:
        res.type("text/html");
        res.send(generateHTMLReport(inventory));
        break;
    }
  }

  // Main scan function
  async function scanSystem() {
    const startTime = Date.now();
    const rootDir = process.cwd(); // Railway app root

    const inventory = {
      scanDate: new Date().toISOString(),
      environment: {
        platform: "Railway",
        nodeVersion: process.version,
        cwd: rootDir,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
      files: [],
      patterns: {
        api_routes: [],
        database_files: [],
        ai_integration: [],
        config_files: [],
        error_handlers: [],
        large_files: [],
      },
      statistics: {
        totalFiles: 0,
        totalLines: 0,
        totalSize: 0,
        fileTypes: {},
      },
      issues: [],
      duplicates: [],
      complexity: [],
    };

    // Scan directory recursively
    await scanDirectory(rootDir, inventory);

    // Analyze patterns
    analyzePatterns(inventory);

    // Find duplicates
    findDuplicates(inventory);

    // Calculate complexity
    calculateComplexity(inventory);

    inventory.scanTime = Date.now() - startTime;

    return inventory;
  }

  // Recursive directory scanner
  async function scanDirectory(dir, inventory, depth = 0) {
    // Skip node_modules and other unnecessary directories
    const skipDirs = [
      "node_modules",
      ".git",
      "dist",
      "build",
      ".next",
      "coverage",
    ];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(process.cwd(), fullPath);

        // Skip if in skip list
        if (skipDirs.some((skip) => relativePath.includes(skip))) {
          continue;
        }

        const stats = fs.statSync(fullPath);

        if (stats.isDirectory() && depth < 10) {
          // Recurse into directory
          await scanDirectory(fullPath, inventory, depth + 1);
        } else if (stats.isFile()) {
          // Process file
          const ext = path.extname(item);

          if ([".js", ".jsx", ".json", ".env", ".md", ".css"].includes(ext)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n").length;

            const fileInfo = {
              path: relativePath,
              name: item,
              extension: ext,
              size: stats.size,
              lines: lines,
              modified: stats.mtime,
              hash: crypto
                .createHash("md5")
                .update(content)
                .digest("hex")
                .substring(0, 8),
            };

            // Quick content analysis
            if (ext === ".js" || ext === ".jsx") {
              fileInfo.analysis = analyzeJavaScriptFile(content, relativePath);
            }

            inventory.files.push(fileInfo);
            inventory.statistics.totalFiles++;
            inventory.statistics.totalLines += lines;
            inventory.statistics.totalSize += stats.size;

            // Track file types
            inventory.statistics.fileTypes[ext] =
              (inventory.statistics.fileTypes[ext] || 0) + 1;

            // Flag large files
            if (lines > 1000) {
              inventory.patterns.large_files.push({
                path: relativePath,
                lines: lines,
              });
            }
          }
        }
      }
    } catch (error) {
      inventory.issues.push({
        type: "scan_error",
        path: dir,
        error: error.message,
      });
    }
  }

  // Analyze JavaScript file content
  function analyzeJavaScriptFile(content, _filePath) {
    const analysis = {
      functions: 0,
      classes: 0,
      imports: 0,
      exports: 0,
      asyncFunctions: 0,
      apiRoutes: 0,
      components: 0,
    };

    // Count patterns (simple regex-based analysis)
    analysis.functions = (content.match(/function\s+\w+/g) || []).length;
    analysis.classes = (content.match(/class\s+\w+/g) || []).length;
    analysis.imports = (content.match(/import\s+.+from/g) || []).length;
    analysis.exports = (
      content.match(/export\s+(default|const|function|class)/g) || []
    ).length;
    analysis.asyncFunctions = (content.match(/async\s+function/g) || []).length;
    analysis.apiRoutes = (
      content.match(/app\.(get|post|put|delete|patch)/g) || []
    ).length;
    analysis.components = (
      content.match(/(useState|useEffect|return\s+\(?\s*<)/g) || []
    ).length;

    return analysis;
  }

  // Analyze patterns across all files
  function analyzePatterns(inventory) {
    for (const file of inventory.files) {
      if (!file.analysis) continue;

      // API routes
      if (file.analysis.apiRoutes > 0) {
        inventory.patterns.api_routes.push({
          file: file.path,
          count: file.analysis.apiRoutes,
        });
      }

      // Database files
      if (
        file.path.includes("mongo") ||
        file.path.includes("database") ||
        file.path.includes("db")
      ) {
        inventory.patterns.database_files.push(file.path);
      }

      // AI integration
      if (
        file.path.includes("gpt") ||
        file.path.includes("openai") ||
        file.path.includes("claude")
      ) {
        inventory.patterns.ai_integration.push(file.path);
      }

      // Config files
      if (file.path.includes("config") || file.extension === ".env") {
        inventory.patterns.config_files.push(file.path);
      }
    }
  }

  // Find duplicate files by hash
  function findDuplicates(inventory) {
    const hashMap = {};

    for (const file of inventory.files) {
      if (!hashMap[file.hash]) {
        hashMap[file.hash] = [];
      }
      hashMap[file.hash].push(file.path);
    }

    for (const [hash, files] of Object.entries(hashMap)) {
      if (files.length > 1) {
        inventory.duplicates.push({
          hash,
          files,
        });
      }
    }
  }

  // Calculate complexity for large files
  function calculateComplexity(inventory) {
    for (const file of inventory.files) {
      if (file.lines > 500 && file.analysis) {
        const complexity =
          file.lines +
          file.analysis.functions * 10 +
          file.analysis.classes * 20 +
          file.analysis.asyncFunctions * 15;

        if (complexity > 1000) {
          inventory.complexity.push({
            file: file.path,
            score: complexity,
            lines: file.lines,
            functions: file.analysis.functions,
          });
        }
      }
    }

    // Sort by complexity
    inventory.complexity.sort((a, b) => b.score - a.score);
  }

  // Generate HTML report for browser viewing
  function generateHTMLReport(inventory) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>System Inventory Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { margin: 0; }
    h2 { 
      color: #333;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      color: #666;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th {
      background: #667eea;
      color: white;
      padding: 10px;
      text-align: left;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .success {
      background: #d4edda;
      border-left: 4px solid #28a745;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .file-path {
      font-family: 'Courier New', monospace;
      background: #f8f9fa;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }
    .controls {
      margin: 20px 0;
      display: flex;
      gap: 10px;
    }
    .btn {
      background: #667eea;
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      text-decoration: none;
      display: inline-block;
    }
    .btn:hover {
      background: #5a67d8;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 System Inventory Report</h1>
    <p>Generated: ${inventory.scanDate}</p>
    <p>Scan time: ${inventory.scanTime}ms</p>
  </div>

  <div class="controls">
    <a href="/api/system-inventory?format=json" class="btn">📥 Download JSON</a>
    <a href="/api/system-inventory?format=markdown" class="btn">📄 View Markdown</a>
    <a href="/api/system-inventory?nocache=true" class="btn">🔄 Refresh Scan</a>
  </div>

  <div class="section">
    <h2>📊 System Statistics</h2>
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${inventory.statistics.totalFiles}</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${inventory.statistics.totalLines.toLocaleString()}</div>
        <div class="stat-label">Total Lines</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${(inventory.statistics.totalSize / 1024 / 1024).toFixed(2)} MB</div>
        <div class="stat-label">Total Size</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${inventory.duplicates.length}</div>
        <div class="stat-label">Duplicate Files</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>📁 File Type Distribution</h2>
    <table>
      <tr>
        <th>Type</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
      ${Object.entries(inventory.statistics.fileTypes)
        .map(
          ([type, count]) => `
          <tr>
            <td>${type}</td>
            <td>${count}</td>
            <td>${((count / inventory.statistics.totalFiles) * 100).toFixed(1)}%</td>
          </tr>
        `,
        )
        .join("")}
    </table>
  </div>

  ${
    inventory.patterns.large_files.length > 0
      ? `
    <div class="section">
      <h2>⚠️ Large Files (>1000 lines)</h2>
      <div class="warning">
        Found ${inventory.patterns.large_files.length} files that should be refactored
      </div>
      <table>
        <tr>
          <th>File</th>
          <th>Lines</th>
        </tr>
        ${inventory.patterns.large_files
          .slice(0, 10)
          .map(
            (file) => `
          <tr>
            <td><span class="file-path">${file.path}</span></td>
            <td>${file.lines.toLocaleString()}</td>
          </tr>
        `,
          )
          .join("")}
      </table>
    </div>
  `
      : ""
  }

  ${
    inventory.complexity.length > 0
      ? `
    <div class="section">
      <h2>🔴 High Complexity Files</h2>
      <table>
        <tr>
          <th>File</th>
          <th>Complexity Score</th>
          <th>Lines</th>
          <th>Functions</th>
        </tr>
        ${inventory.complexity
          .slice(0, 10)
          .map(
            (item) => `
          <tr>
            <td><span class="file-path">${item.file}</span></td>
            <td>${item.score}</td>
            <td>${item.lines}</td>
            <td>${item.functions}</td>
          </tr>
        `,
          )
          .join("")}
      </table>
    </div>
  `
      : ""
  }

  ${
    inventory.patterns.api_routes.length > 0
      ? `
    <div class="section">
      <h2>🌐 API Routes</h2>
      <table>
        <tr>
          <th>File</th>
          <th>Route Count</th>
        </tr>
        ${inventory.patterns.api_routes
          .map(
            (route) => `
          <tr>
            <td><span class="file-path">${route.file}</span></td>
            <td>${route.count}</td>
          </tr>
        `,
          )
          .join("")}
      </table>
    </div>
  `
      : ""
  }

  ${
    inventory.duplicates.length > 0
      ? `
    <div class="section">
      <h2>📑 Duplicate Files</h2>
      <div class="warning">
        Found ${inventory.duplicates.length} sets of duplicate files
      </div>
      ${inventory.duplicates
        .slice(0, 5)
        .map(
          (dup) => `
        <div style="margin: 15px 0;">
          <strong>Hash: ${dup.hash}</strong>
          <ul>
            ${dup.files.map((file) => `<li><span class="file-path">${file}</span></li>`).join("")}
          </ul>
        </div>
      `,
        )
        .join("")}
    </div>
  `
      : ""
  }

  <div class="section">
    <h2>💡 Recommendations</h2>
    ${
      inventory.patterns.large_files.length > 5
        ? '<div class="warning">🔸 Multiple large files detected - consider breaking them into smaller modules</div>'
        : ""
    }
    ${
      inventory.duplicates.length > 0
        ? '<div class="warning">🔸 Duplicate files found - remove redundant code</div>'
        : ""
    }
    ${
      inventory.complexity.length > 3
        ? '<div class="warning">🔸 High complexity detected - refactor complex functions</div>'
        : ""
    }
    ${
      inventory.statistics.totalLines > 50000
        ? '<div class="warning">🔸 Large codebase (>50k lines) - consider architectural improvements</div>'
        : ""
    }
    <div class="success">✅ Inventory scan completed successfully</div>
  </div>

</body>
</html>
    `;

    return html;
  }

  // Generate Markdown report
  function generateMarkdownReport(inventory) {
    const report = [];

    report.push("# System Inventory Report");
    report.push(`Generated: ${inventory.scanDate}\n`);

    report.push("## Statistics\n");
    report.push(`- **Total Files**: ${inventory.statistics.totalFiles}`);
    report.push(
      `- **Total Lines**: ${inventory.statistics.totalLines.toLocaleString()}`,
    );
    report.push(
      `- **Total Size**: ${(inventory.statistics.totalSize / 1024 / 1024).toFixed(2)} MB`,
    );
    report.push(`- **Duplicate Files**: ${inventory.duplicates.length}\n`);

    report.push("## File Types\n");
    for (const [type, count] of Object.entries(
      inventory.statistics.fileTypes,
    )) {
      const pct = ((count / inventory.statistics.totalFiles) * 100).toFixed(1);
      report.push(`- ${type}: ${count} files (${pct}%)`);
    }

    if (inventory.patterns.large_files.length > 0) {
      report.push("\n## Large Files\n");
      inventory.patterns.large_files.slice(0, 10).forEach((file) => {
        report.push(`- ${file.path}: ${file.lines} lines`);
      });
    }

    if (inventory.complexity.length > 0) {
      report.push("\n## Complex Files\n");
      inventory.complexity.slice(0, 10).forEach((item) => {
        report.push(`- ${item.file}: complexity ${item.score}`);
      });
    }

    if (inventory.duplicates.length > 0) {
      report.push("\n## Duplicates\n");
      inventory.duplicates.slice(0, 5).forEach((dup) => {
        report.push(`\nHash: ${dup.hash}`);
        dup.files.forEach((file) => report.push(`  - ${file}`));
      });
    }

    return report.join("\n");
  }
}

// If running as standalone, create Express app
if (import.meta.url === `file://${process.argv[1]}`) {
  import("express").then(({ default: express }) => {
    const app = express();
    const PORT = process.env.PORT || 3000;

    addInventoryEndpoint(app);

    app.listen(PORT, () => {
      console.log(
        `Inventory endpoint available at http://localhost:${PORT}/api/system-inventory`,
      );
    });
  });
}
