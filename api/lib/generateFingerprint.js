// generateFingerprint.js - Structured Fingerprint Generation and Injection

export function generateFingerprint(
  mode,
  vaultLoaded,
  confidence,
  structureCompliance,
  tokenCost,
  additionalData = {},
) {
  const modeFingerprints = {
    truth_general: "TG-PROD-001",
    business_validation: "BV-PROD-001",
    site_monkeys: "SM-VAULT-LOADED",
  };

  let vaultStatus = "NONE";
  if (vaultLoaded) {
    vaultStatus = "LOADED";
    if (mode !== "site_monkeys") {
      modeFingerprints[mode] += " + SM-VAULT-LOADED";
    }
  }

  const complianceDisplay = {
    COMPLIANT: "PASS",
    PARTIAL: "WARN",
    NON_COMPLIANT: "FAIL",
    UNKNOWN: "UNKNOWN",
  };

  const confidenceDisplay =
    typeof confidence === "string"
      ? confidence.toUpperCase()
      : confidence >= 80
        ? "HIGH"
        : confidence >= 60
          ? "MEDIUM"
          : confidence >= 40
            ? "LOW"
            : "UNKNOWN";

  const fingerprintData = {
    mode: modeFingerprints[mode] || "UNKNOWN-MODE",
    vault_loaded: vaultLoaded,
    vault_status: vaultStatus,
    confidence: confidenceDisplay,
    confidence_score: typeof confidence === "number" ? confidence : null,
    structure_compliance: structureCompliance,
    structure_display: complianceDisplay[structureCompliance] || "UNKNOWN",
    token_cost: tokenCost,
    cost_display: `$${typeof tokenCost === "number" ? tokenCost.toFixed(4) : "0.0000"}`,
    timestamp: new Date().toISOString(),
    session_id: additionalData.session_id || null,
    enforcement_layers: additionalData.enforcement_layers || 12,
    security_pass: additionalData.security_pass || false,
  };

  const displayLine = `[Mode: ${fingerprintData.mode} | Confidence: ${fingerprintData.confidence} | Structure: ${fingerprintData.structure_display} | Vault: ${fingerprintData.vault_status} | Cost: ${fingerprintData.cost_display}]`;

  return {
    structured_data: fingerprintData,
    display_line: displayLine,
    injection_ready: true,
  };
}

export function injectFingerprintIntoResponse(response, fingerprintData) {
  const injectedResponse = `${response}

🔍 ${fingerprintData.display_line}`;

  return {
    response_with_fingerprint: injectedResponse,
    fingerprint_injected: true,
    original_response: response,
    fingerprint_data: fingerprintData.structured_data,
  };
}

export function validateFingerprintStructure(fingerprintData) {
  const requiredFields = [
    "mode",
    "vault_loaded",
    "confidence",
    "structure_compliance",
    "token_cost",
    "timestamp",
    "enforcement_layers",
  ];

  const validation = {
    valid: true,
    missing_fields: [],
    data_integrity: "PASS",
  };

  requiredFields.forEach((field) => {
    if (!(field in fingerprintData.structured_data)) {
      validation.valid = false;
      validation.missing_fields.push(field);
    }
  });

  if (!validation.valid) {
    validation.data_integrity = "FAIL";
  }

  return validation;
}

export function createAndInjectFingerprint(
  response,
  mode,
  vaultLoaded,
  confidence,
  structureCompliance,
  tokenCost,
  additionalData = {},
) {
  const fingerprint = generateFingerprint(
    mode,
    vaultLoaded,
    confidence,
    structureCompliance,
    tokenCost,
    additionalData,
  );
  const injection = injectFingerprintIntoResponse(response, fingerprint);

  return {
    final_response: injection.response_with_fingerprint,
    fingerprint_data: fingerprint.structured_data,
    display_line: fingerprint.display_line,
    injection_successful: injection.fingerprint_injected,
  };
}
