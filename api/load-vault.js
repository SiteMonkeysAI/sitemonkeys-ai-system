// api/load-vault.js
// API endpoint that connects frontend vault loading requests to existing vault-loader.js
// This file USES existing infrastructure - does not recreate vault loading logic

import { vaultLoader } from "./utilities/vault-loader.js";

/**
 * Load vault endpoint handler
 * Connects frontend "Refresh Vault" button to existing vault-loader.js functionality
 *
 * Query parameters:
 * - refresh: boolean - Force reload from Google Drive (bypasses cache)
 * - manual: boolean - User-initiated refresh (for logging purposes)
 */
export default async function loadVaultHandler(req, res) {
  const refresh = req.query.refresh === "true" || req.body.refresh === true;
  const manual = req.query.manual === "true" || req.body.manual === true;

  console.log(
    `[LOAD-VAULT] Request received - refresh: ${refresh}, manual: ${manual}`,
  );

  try {
    const stats = vaultLoader.getStats();

    // Use in-memory cache unless refresh is explicitly requested
    if (!refresh && stats.initialized) {
      console.log("[LOAD-VAULT] ✅ Vault loaded from in-memory cache");
      const vaultContent = vaultLoader.getCoreContent();

      // Store vault content in global for orchestrator access
      if (vaultContent.length > 1000) {
        global.vaultContent = vaultContent;
        console.log(`[LOAD-VAULT] ✅ Vault stored in global.vaultContent from cache: ${vaultContent.length} chars`);
      }

      return res.json({
        success: true,
        vault_content: vaultContent,
        folders_loaded: Array.from(vaultLoader.fileIndex.keys()),
        total_files: stats.indexedFiles,
        vault_status: "operational",
        source: "cache",
        cached: true,
      });
    }

    if (refresh) {
      console.log("[LOAD-VAULT] Refresh requested, reloading vault...");
      await vaultLoader.refresh();
    } else {
      console.log("[LOAD-VAULT] Vault not yet initialized, loading now...");
      await vaultLoader.initialize();
    }

    const updatedStats = vaultLoader.getStats();
    const vaultContent = vaultLoader.getCoreContent();

    console.log(
      `[LOAD-VAULT] ✅ Vault loaded: ${updatedStats.indexedFiles} files, ${vaultContent.length} chars`,
    );

    // Store vault content in global for orchestrator access
    global.vaultContent = vaultContent;
    console.log(`[LOAD-VAULT] ✅ Vault stored in global.vaultContent: ${vaultContent.length} chars`);

    return res.json({
      success: true,
      vault_content: vaultContent,
      folders_loaded: Array.from(vaultLoader.fileIndex.keys()),
      total_files: updatedStats.indexedFiles,
      vault_status: "operational",
      source: refresh ? "refresh" : "google_drive",
      cached: false,
      loaded_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[LOAD-VAULT] ❌ Error loading vault:", error.message);
    console.error("[LOAD-VAULT] Stack:", error.stack);

    return res.status(500).json({
      success: false,
      error: error.message,
      vault_status: "error",
      vault_content: "",
      folders_loaded: [],
      total_files: 0,
    });
  }
}
