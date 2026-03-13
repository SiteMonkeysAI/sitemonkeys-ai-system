// api/load-vault.js
// API endpoint that connects frontend vault loading requests to existing vault-loader.js
// This file USES existing infrastructure - does not recreate vault loading logic

import {
  loadVaultContent,
  getVaultFromKv,
  storeVaultInKv,
} from "../lib/vault-loader.js";

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
    let vaultData = null;

    // Try to get from KV cache first (unless refresh requested)
    if (!refresh) {
      console.log("[LOAD-VAULT] Checking KV cache...");
      vaultData = await getVaultFromKv();

      if (vaultData) {
        console.log(
          "[LOAD-VAULT] ✅ Vault loaded from KV cache",
        );
        
        // CRITICAL FIX: Store vault content in global for orchestrator access
        const vaultContent = vaultData.vault_content || vaultData.content || "";
        if (vaultContent.length > 1000) {
          global.vaultContent = vaultContent;
          console.log(`[LOAD-VAULT] ✅ Vault stored in global.vaultContent from cache: ${vaultContent.length} chars`);
        }
        
        return res.json({
          success: true,
          vault_content: vaultData.vault_content || vaultData.content || "",
          folders_loaded: vaultData.folders_loaded || vaultData.loadedFolders || [],
          total_files: vaultData.total_files || vaultData.totalFiles || 0,
          vault_status: "operational",
          source: "cache",
          cached: true,
        });
      }

      console.log("[LOAD-VAULT] No cache found, loading from Google Drive...");
    } else {
      console.log(
        "[LOAD-VAULT] Refresh requested, loading from Google Drive...",
      );
    }

    // Load from Google Drive using existing vault-loader.js
    console.log("[LOAD-VAULT] Calling loadVaultContent()...");
    const result = await loadVaultContent();

    console.log(
      `[LOAD-VAULT] ✅ Vault loaded: ${result.loadedFolders.length} folders, ${result.totalFiles} files`,
    );

    // Prepare response data
    vaultData = {
      vault_content: result.vaultContent,
      folders_loaded: result.loadedFolders,
      total_files: result.totalFiles,
      vault_status: "operational",
      source: "google_drive",
      cached: false,
      loaded_at: new Date().toISOString(),
    };

    // Store in KV cache for future requests
    console.log("[LOAD-VAULT] Storing in KV cache...");
    const stored = await storeVaultInKv(vaultData);

    if (stored) {
      console.log("[LOAD-VAULT] ✅ Vault cached in KV");
    } else {
      console.log("[LOAD-VAULT] ⚠️ KV caching failed (vault still loaded)");
    }

    // CRITICAL FIX: Store vault content in global for orchestrator access
    global.vaultContent = result.vaultContent;
    console.log(`[LOAD-VAULT] ✅ Vault stored in global.vaultContent: ${result.vaultContent.length} chars`);

    // Return vault data to frontend
    return res.json({
      success: true,
      ...vaultData,
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
