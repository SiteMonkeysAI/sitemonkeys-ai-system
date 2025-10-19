// /api/repo-snapshot.js
// Exposes a safe, lightweight snapshot of your repo
// One endpoint: /api/repo-snapshot
// Designed for AI review without runaway payloads

import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const repoRoot = process.cwd(); // Root of your Railway project
    const includedExts = [
      ".js",
      ".json",
      ".py",
      ".yml",
      ".yaml",
      ".html",
      ".css",
      ".md",
    ];
    const excludedExts = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".mp4",
      ".pdf",
      ".zip",
      ".rar",
      ".7z",
    ];
    const maxCharsPerFile = 5000; // Adjustable cap per file

    function readFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);

      list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
          results = results.concat(readFiles(filePath));
        } else {
          const ext = path.extname(file);
          if (includedExts.includes(ext) && !excludedExts.includes(ext)) {
            let content = fs.readFileSync(filePath, "utf8");
            let truncated = false;

            if (content.length > maxCharsPerFile) {
              content =
                content.substring(0, maxCharsPerFile) + "\n\n[TRUNCATED]";
              truncated = true;
            }

            results.push({
              file: path.relative(repoRoot, filePath),
              truncated,
              length: content.length,
              content,
            });
          }
        }
      });

      return results;
    }

    const snapshot = readFiles(repoRoot);

    res.status(200).json({
      status: "success",
      timestamp: new Date().toISOString(),
      fileCount: snapshot.length,
      totalChars: snapshot.reduce((acc, f) => acc + f.length, 0),
      files: snapshot,
    });
  } catch (err) {
    console.error("Snapshot error:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
}
