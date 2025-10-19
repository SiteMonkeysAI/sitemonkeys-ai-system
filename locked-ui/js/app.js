// VAULT LOADING ONLY ON DEMAND - NO AUTO-LOADING
let vaultLoaded = false;

async function loadVaultOnDemand() {
  if (vaultLoaded) return window.currentVaultContent || "";

  // Only load vault in Site Monkeys mode
  const currentMode = getCurrentMode();
  if (currentMode !== "site_monkeys") {
    console.log("🚫 Vault loading blocked - not in Site Monkeys mode");
    window.currentVaultContent = "";
    return "";
  }

  console.log("🔄 Loading vault on demand for Site Monkeys mode...");

  try {
    const vaultResponse = await fetch(
      "/api/load-vault?refresh=true&manual=true",
    );
    const vaultData = await vaultResponse.json();
    const vaultContent = vaultData.vault_content || "";

    window.currentVaultContent = vaultContent;
    window.vaultStatus = {
      loaded: vaultContent.length > 1000,
      healthy: vaultData.vault_status === "operational",
      tokens: vaultData.tokens || 0,
    };

    vaultLoaded = true;
    console.log("✅ Vault loaded on demand with length:", vaultContent.length);
    return vaultContent;
  } catch (error) {
    console.error("❌ Failed to load vault on demand:", error);
    return "";
  }
}

// Initialize empty vault state
window.currentVaultContent = "";
window.vaultStatus = { loaded: false, healthy: false, tokens: 0 };

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

// Make debouncedRefreshVault available globally
window.debouncedRefreshVault = function () {
  clearTimeout(window.refreshTimeout);
  window.refreshTimeout = setTimeout(() => {
    improvedRefreshVault();
  }, 300);
};

// SEND MESSAGE FUNCTION
async function sendMessage() {
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
  thinkingBubble.innerHTML = `<div class="bubble-content thinking-content"><span class="thinking-brain">🧠</span> Thinking...</div>`;
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

    // BUILD DOCUMENT CONTEXT FROM UPLOAD
    const lastDoc =
      Array.isArray(extractedDocuments) && extractedDocuments.length > 0
        ? extractedDocuments[extractedDocuments.length - 1]
        : null;

    const requestPayload = {
      message: text,
      conversation_history: conversationHistory,
      mode: getCurrentMode(),
      vault_loaded: isVaultMode(),
      vault_content: vaultContent || null,
      document_context: lastDoc
        ? {
            filename: lastDoc.filename || "",
            content: lastDoc.fullContent || lastDoc.content || "",
            fullContent: lastDoc.fullText || "", // ← Also add this for backend compatibility
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

    // TOKEN DEBUG
    console.log("🔍 TOKEN DEBUG:", data.token_usage);

    // EXTRACT AND DISPLAY TOKEN/COST DATA
    console.log(
      "🔍 Checking token_usage:",
      !!data.token_usage,
      typeof data.token_usage,
    );
    if (data.token_usage && typeof data.token_usage === "object") {
      updateTokenDisplay(data.token_usage);
    } else {
      console.log("❌ Token data missing or invalid:", data.token_usage);
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
    responseBubble.innerHTML = `<div class="bubble-content"><strong>${who} ${modeIndicator}:</strong> ${cleanReply}</div>`;
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
        warningBubble.innerHTML = `<div class="bubble-content"><strong>System:</strong> ⚠️ Assumption health alert: ${systemVerification.assumption_warnings.length} item(s) need attention. Enable debug mode to see details.</div>`;
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
    errorBubble.innerHTML = `<div class="bubble-content"><strong>System:</strong> I encountered a technical error and I won't pretend it didn't happen. Error: ${error.message}. I'd rather be honest about system issues than give you unreliable information. Please try again.</div>`;
    box.appendChild(errorBubble);
    box.scrollTop = box.scrollHeight;
  }
}

// TOKEN AND COST DISPLAY FUNCTIONS
function updateTokenDisplay(tokenData) {
  console.log("💰 DISPLAY DEBUG:", tokenData);
  try {
    const tokenCountElement = document.getElementById("token-count");
    const costEstimateElement = document.getElementById("cost-estimate");

    if (tokenCountElement) {
      tokenCountElement.textContent = tokenData.session_total_tokens || 0;
      tokenCountElement.style.color = "#00ff41";
      console.log("[COST] Updated token count");
    }

    if (costEstimateElement) {
      const sessionCost = (tokenData.session_total_cost || 0).toFixed(4);
      costEstimateElement.textContent = `$${sessionCost}`;
      costEstimateElement.style.color = "#00ff41";
      console.log("[COST] Updated cost estimate");
    }
  } catch (error) {
    console.warn("Token display update failed:", error);
  }
}

// STATUS ANIMATION
function loadStatus() {
  const items = document.querySelectorAll("#status-list li");
  items.forEach((item, i) => {
    setTimeout(
      () => {
        item.classList.add("loaded");
      },
      300 * (i + 1),
    );
  });

  setTimeout(
    () => {
      const readyElement = document.getElementById("system-ready");
      if (readyElement) {
        readyElement.classList.add("active");
      }
      systemActive = true;
    },
    items.length * 300 + 300,
  );
}
