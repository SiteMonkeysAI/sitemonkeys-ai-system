// /api/vault-status.js
// Real-time vault status monitoring endpoint
// Provides live visibility into vault state without parsing logs

/**
 * Vault Status Endpoint Handler
 * Returns current vault state, size, token count, and routing information
 * 
 * This is a READ-ONLY monitoring endpoint - does not modify vault state
 */
export default async function vaultStatusHandler(req, res) {
  try {
    // Check global vault content
    const vaultContent = global.vaultContent || "";
    const vaultSize = vaultContent.length;
    const vaultTokens = Math.ceil(vaultSize / 4); // Rough token estimate
    
    // Check if vault is functional
    const vaultEnabled = vaultSize > 1000; // Vault needs substantial content to be useful
    
    // Determine routing model based on token count
    let routedModel = null;
    if (vaultEnabled) {
      routedModel = vaultTokens > 9000 ? "claude-sonnet-4.5" : "gpt-4";
    }
    
    // Build status response
    const status = {
      vaultEnabled: vaultEnabled,
      vaultSize: vaultSize,
      vaultTokens: vaultTokens,
      vaultCharacters: vaultSize,
      routedModel: routedModel,
      kvCached: false, // Will be set if KV cache is implemented
      timestamp: new Date().toISOString(),
      status: vaultEnabled ? "operational" : "not_loaded",
      recommendation: vaultTokens > 9000 
        ? "Large vault - will route to Claude for all queries"
        : vaultEnabled 
        ? "Standard vault - will route based on confidence"
        : "Vault not loaded - use /api/load-vault to load vault content"
    };
    
    // Log status check (for Railway visibility)
    console.log(`[VAULT-STATUS] Check performed - Enabled: ${vaultEnabled}, Size: ${vaultSize} chars, Tokens: ${vaultTokens}, Model: ${routedModel || 'N/A'}`);
    
    res.json(status);
  } catch (error) {
    console.error("[VAULT-STATUS] Error checking vault status:", error);
    
    res.status(500).json({
      vaultEnabled: false,
      vaultSize: 0,
      vaultTokens: 0,
      vaultCharacters: 0,
      routedModel: null,
      kvCached: false,
      timestamp: new Date().toISOString(),
      status: "error",
      error: error.message,
      recommendation: "Error checking vault status - check server logs"
    });
  }
}
