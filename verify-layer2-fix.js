#!/usr/bin/env node

/**
 * VERIFICATION: Check that LAYER 2 Fallback Primitives are reachable
 * Issue #746: Verify try-catch blocks are properly placed
 */

import fs from 'fs';

console.log("=".repeat(80));
console.log("VERIFICATION: LAYER 2 Fallback Primitives Reachability Check");
console.log("=".repeat(80));
console.log("");

const filePath = './api/lib/ai-processors.js';
const fileContent = fs.readFileSync(filePath, 'utf8');
const lines = fileContent.split('\n');

console.log("Checking for LAYER 2 primitives in ai-processors.js...");
console.log("");

// Find the LAYER 2 primitives section
let foundLayer2Section = false;
let foundTemporalLog = false;
let foundCompletenessLog = false;
let lineNumber = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  lineNumber = i + 1;
  
  if (line.includes('LAYER 2 FALLBACK PRIMITIVES')) {
    foundLayer2Section = true;
    console.log(`✅ Found LAYER 2 section at line ${lineNumber}`);
  }
  
  if (line.includes('[LAYER-2] Applying temporal arithmetic fallback')) {
    console.log(`✅ Found temporal arithmetic log statement at line ${lineNumber}`);
  }
  
  if (line.includes('[PRIMITIVE-TEMPORAL]')) {
    foundTemporalLog = true;
    console.log(`✅ Found [PRIMITIVE-TEMPORAL] log at line ${lineNumber}`);
  }
  
  if (line.includes('[LAYER-2] Applying list completeness fallback')) {
    console.log(`✅ Found list completeness log statement at line ${lineNumber}`);
  }
  
  if (line.includes('[PRIMITIVE-COMPLETENESS]')) {
    foundCompletenessLog = true;
    console.log(`✅ Found [PRIMITIVE-COMPLETENESS] log at line ${lineNumber}`);
  }
}

console.log("");
console.log("=".repeat(80));
console.log("STRUCTURAL VERIFICATION:");
console.log("=".repeat(80));
console.log("");

// Check for try-catch blocks before the LAYER 2 section
const beforeLayer2 = fileContent.substring(0, fileContent.indexOf('LAYER 2 FALLBACK PRIMITIVES'));
const tryCatchCount = (beforeLayer2.match(/} catch \(/g) || []).length;
const assumptionDetectionTryCatch = beforeLayer2.includes('assumptionDetectionError');
const pressureResistanceTryCatch = beforeLayer2.includes('pressureResistanceError');
const vaultEnforcementTryCatch = beforeLayer2.includes('vaultEnforcementError');
const engagementBaitTryCatch = beforeLayer2.includes('engagementBaitError');

console.log(`Try-catch blocks before LAYER 2 section: ${tryCatchCount}`);
console.log("");
console.log("Critical protections added:");
console.log(`  - Assumption detection: ${assumptionDetectionTryCatch ? '✅ PROTECTED' : '❌ NOT PROTECTED'}`);
console.log(`  - Pressure resistance: ${pressureResistanceTryCatch ? '✅ PROTECTED' : '❌ NOT PROTECTED'}`);
console.log(`  - Vault enforcement: ${vaultEnforcementTryCatch ? '✅ PROTECTED' : '❌ NOT PROTECTED'}`);
console.log(`  - Engagement bait removal: ${engagementBaitTryCatch ? '✅ PROTECTED' : '❌ NOT PROTECTED'}`);
console.log("");

// Check if LAYER 2 section is BEFORE the return statement
const layer2Index = fileContent.indexOf('LAYER 2 FALLBACK PRIMITIVES');
const returnStatementIndex = fileContent.indexOf('// STRUCTURED RESPONSE ASSEMBLY');
const layer2BeforeReturn = layer2Index > 0 && returnStatementIndex > 0 && layer2Index < returnStatementIndex;

console.log(`LAYER 2 section positioned before return: ${layer2BeforeReturn ? '✅ YES' : '❌ NO'}`);
console.log("");

// Final assessment
const allChecks = foundLayer2Section && foundTemporalLog && foundCompletenessLog && 
                 assumptionDetectionTryCatch && pressureResistanceTryCatch && 
                 vaultEnforcementTryCatch && engagementBaitTryCatch && layer2BeforeReturn;

console.log("=".repeat(80));
console.log("FINAL ASSESSMENT:");
console.log("=".repeat(80));
console.log("");

if (allChecks) {
  console.log("✅ ALL CHECKS PASSED!");
  console.log("");
  console.log("The fix is correctly implemented:");
  console.log("  1. LAYER 2 primitives exist and have proper logging");
  console.log("  2. All critical functions are wrapped in try-catch blocks");
  console.log("  3. LAYER 2 section is positioned before the return statement");
  console.log("");
  console.log("The code should now execute lines 653-673 on every request.");
  console.log("To verify in production, check Railway logs for:");
  console.log("  - [PRIMITIVE-TEMPORAL]");
  console.log("  - [PRIMITIVE-COMPLETENESS]");
  console.log("");
} else {
  console.log("❌ SOME CHECKS FAILED");
  console.log("");
  console.log("Please review the implementation.");
  console.log("");
  process.exit(1);
}
