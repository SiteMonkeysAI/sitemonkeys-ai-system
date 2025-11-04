// FORCE VAULT LOADING ON PAGE LOAD
// VAULT LOADING ONLY ON DEMAND - NO AUTO-LOADING
let _vaultLoaded = false;

// USER ID PERSISTENCE - Generate or retrieve persistent user ID
function getUserId() {
  const storageKey = 'sitemonkeys_user_id';
  let userId = localStorage.getItem(storageKey);
  
  if (!userId) {
    // Generate a unique user ID: timestamp + random string
    // Use crypto.randomUUID() if available, otherwise fallback to timestamp + crypto random
    try {
      // Modern browsers support crypto.randomUUID()
      const uuid = crypto.randomUUID();
      userId = 'user_' + uuid.replace(/-/g, '').substring(0, 16);
    } catch {
      // Fallback for older browsers: timestamp + secure random
      const timestamp = Date.now();
      const randomBytes = new Uint8Array(8);
      crypto.getRandomValues(randomBytes);
      const randomStr = Array.from(randomBytes, byte => byte.toString(36)).join('').substring(0, 9);
      userId = 'user_' + timestamp + '_' + randomStr;
    }
    localStorage.setItem(storageKey, userId);
    console.log('[USER-ID] Generated new user ID:', userId);
  } else {
    console.log('[USER-ID] Retrieved existing user ID:', userId);
  }
  
  return userId;
}

async function loadVaultOnDemand() {
  // Step 1: Check if vault already loaded in window
  if (window.currentVaultContent && window.currentVaultContent.length > 500) {
    console.log(
      "✅ [VAULT] Using cached vault:",
      window.currentVaultContent.length,
      "chars",
    );
    return window.currentVaultContent;
  }

  // Step 2: Check current mode
  const currentMode = getCurrentMode();
  if (currentMode !== "site_monkeys") {
    console.log("🚫 [VAULT] Not in Site Monkeys mode - vault disabled");
    window.currentVaultContent = "";
    return "";
  }

  console.log("🔄 [VAULT] Attempting to load vault from backend...");

  try {
    // Step 3: Fetch vault from backend
    const vaultResponse = await fetch(
      "/api/load-vault?refresh=true&manual=true",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!vaultResponse.ok) {
      throw new Error(`Vault fetch failed: ${vaultResponse.status}`);
    }

    let vaultData;
    try {
      vaultData = await vaultResponse.json();
    } catch (error) {
      console.error("❌ [VAULT] Invalid JSON response:", error.message);
      throw new Error("Vault response was not valid JSON");
    }
    console.log("📦 [VAULT] Response received:", {
      has_vault_content: !!vaultData.vault_content,
      vault_length: vaultData.vault_content?.length || 0,
      vault_status: vaultData.vault_status,
      tokens: vaultData.tokens,
    });

    const vaultContent = vaultData.vault_content || "";

    // Step 4: Store in window for reuse
    if (vaultContent.length > 500) {
      window.currentVaultContent = vaultContent;
      window.vaultStatus = {
        loaded: true,
        healthy: vaultContent.length > 1000,
        tokens: vaultData.tokens || 0,
        status: vaultData.vault_status || "loaded",
      };

      console.log(
        "✅ [VAULT] Successfully loaded and cached:",
        vaultContent.length,
        "chars",
      );
      return vaultContent;
    } else {
      console.warn("⚠️ [VAULT] Vault content too small or empty");
      window.currentVaultContent = "";
      return "";
    }
  } catch (error) {
    console.error("❌ [VAULT] Load failed:", error.message);
    window.currentVaultContent = "";
    return "";
  }
}

// Initialize empty vault state ONLY if not already set
if (typeof window.currentVaultContent === "undefined") {
  window.currentVaultContent = "";
  window.vaultStatus = { loaded: false, healthy: false, tokens: 0 };
}
// REFRESH VAULT BUTTON HANDLER
async function improvedRefreshVault() {
  console.log("🔄 Refresh vault button clicked...");
  try {
    const response = await fetch("/api/load-vault?refresh=true&manual=true");
    const data = await response.json();

    // CACHE THE VAULT CONTENT FOR CHAT
    window.currentVaultContent = data.vault_content || "";
    window.vaultStatus = {
      loaded: true,
      healthy: data.vault_status === "operational",
      tokens: data.tokens || 0,
    };

    console.log(
      "✅ Vault refreshed and cached:",
      window.currentVaultContent.length,
    );
  } catch (error) {
    console.error("❌ Vault refresh failed:", error);
  }
}

// Override the global function
window.refreshVault = improvedRefreshVault;

// ==================== FIXED SENDMESSAGE FUNCTION ====================
async function _sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text || !systemActive) return;

  const box = document.getElementById("chat-box");

  // Add user message
  const userBubble = document.createElement("div");
  userBubble.className = "bubble user";
  userBubble.innerHTML = `<div class="bubble-content"><strong>You:</strong> ${text}</div>`;
  box.appendChild(userBubble);
  box.scrollTop = box.scrollHeight;
  input.value = "";

  // Add thinking indicator
  const thinkingBubble = document.createElement("div");
  thinkingBubble.className = "bubble ai thinking-bubble";
  thinkingBubble.innerHTML = `<img src="boy-mascot.png" class="avatar" alt="Thinking"><div class="bubble-content thinking-content"><span class="thinking-brain">🧠</span> Thinking...</div>`;
  box.appendChild(thinkingBubble);
  box.scrollTop = box.scrollHeight;

  try {
    // LOAD VAULT ONLY IF IN SITE MONKEYS MODE
    let vaultContent = "";
    const currentMode = getCurrentMode();
    if (currentMode === "site_monkeys") {
      vaultContent = await loadVaultOnDemand();
      console.log(
        "🔍 Site Monkeys mode - loaded vault with length:",
        vaultContent.length,
      );
    } else {
      console.log("🔍 Truth/Business mode - vault disabled");
      vaultContent = "";
    }

    console.log("🔍 Using vault with length:", vaultContent.length);

    // === BUILD DOCUMENT CONTEXT FROM UPLOAD ===
    const lastDoc =
      Array.isArray(extractedDocuments) && extractedDocuments.length > 0
        ? extractedDocuments[extractedDocuments.length - 1]
        : null;

    const requestPayload = {
      message: text, // user’s question
      user_id: getUserId(), // persistent user ID for cross-session memory
      conversation_history: conversationHistory, // keep chat context
      mode: getCurrentMode(),
      vault_loaded: isVaultMode(),
      vault_content: vaultContent || null,
      document_context: lastDoc
        ? {
            filename: lastDoc.filename || "",
            content: lastDoc.fullContent || lastDoc.content || "",
            fullContent: lastDoc.fullText || "",
            wordCount: lastDoc.wordCount || 0,
            contentType: lastDoc.contentType || "",
            keyPhrases: Array.isArray(lastDoc.keyPhrases)
              ? lastDoc.keyPhrases
              : [],
          }
        : null,
    };

    // Debug log for verification
    console.log("🚀 Sending request:", {
      mode: requestPayload.mode,
      vault_content_length: vaultContent.length,
      message_preview: text.substring(0, 50) + "...",
    });
    console.log(
      "[REQUEST] document_context:",
      requestPayload.document_context
        ? {
            filename: requestPayload.document_context.filename,
            len:
              requestPayload.document_context.fullContent?.length ||
              requestPayload.document_context.content?.length ||
              0,
          }
        : null,
    );

    // SEND TO BACKEND
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    // EXTRACT AND DISPLAY TOKEN/COST DATA IN EXISTING UI ELEMENTS
    if (data.metadata && data.metadata.token_usage) {
      updateTokenDisplay(data.metadata.token_usage);
    } else {
      console.log("❌ Token data missing or invalid");
    }

    let reply = data.response || "No response received";

    // SYSTEM VERIFICATION OBJECT
    const systemVerification = {
      mode_used: data.mode_active || "UNKNOWN",
      vault_status: data.vault_status?.loaded ? "LOADED" : "NOT_LOADED",
      triggered_frameworks: data.enforcement_applied || [],
      assumption_warnings: data.assumption_analysis?.detected || [],
      security_pass: data.security_pass || false,
      fallback_used: data.performance?.api_error?.fallback_used || false,
    };

    console.log("🔍 SYSTEM VERIFICATION:", systemVerification);

    if (systemVerification.fallback_used) {
      console.warn("⚠️ Fallback response used - system may be under stress");
    }

    // Show debug info in dev mode
    const showDebugInfo = localStorage.getItem("sitemonkeys_debug") === "true";
    if (showDebugInfo) {
      reply += `\n\n🔍 [DEBUG] Mode: ${systemVerification.mode_used} | Vault: ${systemVerification.vault_status} | Security: ${systemVerification.security_pass ? "PASS" : "FAIL"}`;
      if (systemVerification.triggered_frameworks.length > 0) {
        reply += ` | Triggered: ${systemVerification.triggered_frameworks.join(", ")}`;
      }
    }

    // Clean response for display
    let cleanReply = reply
      .replace(/^\*?\*?(Eli|Roxy):\*?\*?\s*/i, "")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*\[MODE:.*?\]/g, "")
      .replace(/\[MODE:.*?\]/g, "")
      .replace(/\[VAULT:.*?\]/g, "")
      .replace(/\[TRIGGERED:.*?\]/g, "")
      .replace(/\[FLOW:.*?\]/g, "")
      .replace(/\[ASSUMPTIONS:.*?\]/g, "")
      .trim();

    // Remove thinking indicator
    const thinkingElement = document.querySelector(".thinking-bubble");
    if (thinkingElement) {
      thinkingElement.remove();
    }

    // Alternate between Eli & Roxy
    const isEli = aiToggle;
    const who = isEli ? "Eli" : "Roxy";
    const avatar = isEli ? "boy-mascot.png" : "girl-mascot.png";

    const modeIndicator =
      getCurrentMode() === "truth_general"
        ? "🔍"
        : getCurrentMode() === "business_validation"
          ? "📊"
          : getCurrentMode() === "site_monkeys"
            ? "🍌"
            : "🤖";

    const responseBubble = document.createElement("div");
    responseBubble.className = "bubble ai";
    responseBubble.innerHTML = `<img src="${avatar}" class="avatar" alt="${who}"><div class="bubble-content"><strong>${who} ${modeIndicator}:</strong> ${cleanReply}</div>`;
    box.appendChild(responseBubble);
    box.scrollTop = box.scrollHeight;

    // Store conversation history
    conversationHistory.push({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      mode_requested: getCurrentMode(),
    });
    conversationHistory.push({
      role: "assistant",
      content: reply,
      clean_content: cleanReply,
      system_verification: systemVerification,
      timestamp: new Date().toISOString(),
      speaker: who,
    });

    if (conversationHistory.length > 12) {
      conversationHistory = conversationHistory.slice(-12);
    }

    aiToggle = !aiToggle;

    if (systemVerification.assumption_warnings.length > 0) {
      setTimeout(() => {
        const warningBubble = document.createElement("div");
        warningBubble.className = "bubble ai";
        warningBubble.innerHTML = `<img src="boy-mascot.png" class="avatar" alt="System"><div class="bubble-content"><strong>System:</strong> ⚠️ Assumption health alert: ${systemVerification.assumption_warnings.length} item(s) need attention. Enable debug mode to see details.</div>`;
        box.appendChild(warningBubble);
        box.scrollTop = box.scrollHeight;
      }, 1000);
    }
  } catch (error) {
    console.error("❌ Chat system error:", error);

    const thinkingElement = document.querySelector(".thinking-bubble");
    if (thinkingElement) {
      thinkingElement.remove();
    }

    const errorBubble = document.createElement("div");
    errorBubble.className = "bubble ai";
    errorBubble.innerHTML = `<img src="boy-mascot.png" class="avatar" alt="System"><div class="bubble-content"><strong>System:</strong> I encountered a technical error and I won't pretend it didn't happen. Error: ${error.message}. I'd rather be honest about system issues than give you unreliable information. Please try again.</div>`;
    box.appendChild(errorBubble);
    box.scrollTop = box.scrollHeight;
  }
}

// TOKEN AND COST DISPLAY FUNCTIONS
// Updates the existing UI elements with per-request token and cost data
function updateTokenDisplay(tokenData) {
  try {
    // Target the existing elements by their IDs from the HTML
    const tokenCountElement = document.getElementById("token-count");
    const costEstimateElement = document.getElementById("cost-estimate");

    if (tokenCountElement && tokenData.total_tokens !== undefined) {
      tokenCountElement.textContent = tokenData.total_tokens;
      tokenCountElement.style.color = "#00ff41";
      console.log("[TOKEN] Updated token count:", tokenData.total_tokens);
    }

    if (costEstimateElement && tokenData.cost_display) {
      costEstimateElement.textContent = tokenData.cost_display;
      costEstimateElement.style.color = "#00ff41";
      console.log("[COST] Updated cost estimate:", tokenData.cost_display);
    }
  } catch (error) {
    console.warn("Token display update failed:", error);
  }
}
