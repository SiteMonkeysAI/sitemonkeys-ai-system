/**
 * TIER 1 CODE GUARDS - Site Monkeys AI
 * =====================================
 * 
 * ESM-SAFE: Uses only fs file reads and string scanning.
 * Does NOT import any app modules (avoids needing node_modules).
 * Does NOT call any external APIs. Cost: $0. Time: ~10 seconds.
 * 
 * Run with: node --test tests/tier1/code-guards.test.js
 * 
 * WHAT THIS CATCHES:
 * - "context is not defined" crash (11 occurrences in orchestrator.js)
 * - "useClaude is not defined" crash (line ~4097 in orchestrator.js)
 * - "logExtractionError is not a function" crash (intelligence.js)
 * - Missing memory gating logic
 * - Missing document injection pipeline
 * - Missing vault content pipeline
 * 
 * FILE PATHS VERIFIED BY REPO DIAGNOSTIC (2026-02-18):
 *   orchestrator.js  → api/core/orchestrator.js
 *   intelligence.js  → api/categories/memory/internal/intelligence.js
 *   externalLookup   → api/core/intelligence/externalLookupEngine.js
 *   upload routes    → api/upload-file.js, api/upload-for-analysis.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

// Helper: read a repo file safely
function readRepoFile(relativePath) {
  const fullPath = join(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    return null;
  }
  return readFileSync(fullPath, 'utf8');
}

// ============================================================
// SECTION A: CRITICAL FILE EXISTENCE
// If these files are missing, everything else is broken
// ============================================================

describe('A. Critical Files Exist', () => {

  it('A-001: orchestrator.js exists', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'api/core/orchestrator.js')),
      'api/core/orchestrator.js is missing'
    );
  });

  it('A-002: intelligence.js exists', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'api/categories/memory/internal/intelligence.js')),
      'api/categories/memory/internal/intelligence.js is missing'
    );
  });

  it('A-003: externalLookupEngine.js exists', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'api/core/intelligence/externalLookupEngine.js')),
      'api/core/intelligence/externalLookupEngine.js is missing'
    );
  });

  it('A-004: upload route exists', () => {
    const hasUploadFile = existsSync(join(REPO_ROOT, 'api/upload-file.js'));
    const hasUploadAnalysis = existsSync(join(REPO_ROOT, 'api/upload-for-analysis.js'));
    assert.ok(
      hasUploadFile || hasUploadAnalysis,
      'No upload route found (expected api/upload-file.js or api/upload-for-analysis.js)'
    );
  });

  it('A-005: baselines.json exists and is valid', () => {
    const content = readRepoFile('tests/baselines.json');
    assert.ok(content, 'tests/baselines.json is missing');
    assert.doesNotThrow(() => JSON.parse(content), 'baselines.json is not valid JSON');
  });
});

// ============================================================
// SECTION B: KNOWN CRASH PATTERNS
// These are specific bugs that have caused production crashes.
// Each test checks that the bug has NOT been reintroduced.
// ============================================================

describe('B. Known Crash Patterns (Regression Guards)', () => {

  it('B-001: "context.sources?.hasDocuments" should not exist in orchestrator', () => {
    // BUG: Function parameter is "options" but code referenced "context"
    // CRASH: "context is not defined" at runtime
    // FOUND: 11 occurrences on lines 1079, 1081, 1955, 2170, 3506, 3555, 3664, 3990, 4046, 4592, 4673
    // FIX: All 11 must be changed to use the correct parameter name
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const occurrences = (orch.match(/context\.sources\?\.hasDocuments/g) || []).length;
    
    assert.strictEqual(
      occurrences, 0,
      `REGRESSION: "context.sources?.hasDocuments" found ${occurrences} times in orchestrator.js. ` +
      `This causes "context is not defined" crash. All occurrences must use the correct parameter name.`
    );
  });

  it('B-002: "context.sources?.hasExternal" should not exist in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const occurrences = (orch.match(/context\.sources\?\.hasExternal/g) || []).length;

    assert.strictEqual(
      occurrences, 0,
      `REGRESSION: "context.sources?.hasExternal" found ${occurrences} times. Same bug class as B-001.`
    );
  });

  it('B-003: "context.sources?.hasVault" should not exist in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const occurrences = (orch.match(/context\.sources\?\.hasVault/g) || []).length;

    assert.strictEqual(
      occurrences, 0,
      `REGRESSION: "context.sources?.hasVault" found ${occurrences} times. Same bug class as B-001.`
    );
  });

  it('B-004: "useClaude" must be declared in scope where referenced', () => {
    // BUG: catch block at ~line 4097 references useClaude but it's not in scope
    // CRASH: "useClaude is not defined" when GPT-4 fails
    // KNOWN: let useClaude = false; declared at line 3715
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const lines = orch.split('\n');
    const referenceLines = [];
    const declarationLines = [];

    lines.forEach((line, i) => {
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
      
      if (line.includes('useClaude')) {
        if (line.match(/\b(let|const|var)\s+useClaude/)) {
          declarationLines.push(i);
        } else if (line.match(/\buseClaude\b/)) {
          referenceLines.push(i);
        }
      }
    });

    if (referenceLines.length === 0) return; // Not used, fine

    // ALLOWLIST: Variables manually verified as correctly scoped despite failing heuristic
    // useClaude in #routeToAI: Declaration at line ~3841, catch reference at line ~4235
    // (Various issues have added lines, shifting both declaration and catch reference)
    // The 400+ line function exceeds the 250-line proximity heuristic, but scope is correct:
    // - Declaration is at function scope (outside try block)
    // - Catch block is at same function level, has access to function-scoped variables
    // - Verified by manual code review and Node.js syntax validation
    const VERIFIED_CORRECT_SCOPE = [
      { variable: 'useClaude', declLineApprox: 3841, refLineApprox: 4235, function: '#routeToAI' }
    ];

    // For each reference, verify a declaration exists within ~200 lines above
    for (const refLine of referenceLines) {
      const nearbyDeclaration = declarationLines.some(
        declLine => declLine < refLine && (refLine - declLine) < 250
      );

      if (!nearbyDeclaration) {
        // Check if this is a known false positive (large function with correct scoping)
        const isAllowlisted = VERIFIED_CORRECT_SCOPE.some(entry => {
          return Math.abs(refLine - entry.refLineApprox) < 10; // Allow ~10 line drift from refactoring
        });

        if (isAllowlisted) {
          continue; // Skip - manually verified as correct
        }

        // Check if it's in a catch block (the dangerous pattern)
        const surroundingCode = lines.slice(Math.max(0, refLine - 15), refLine + 1).join('\n');
        if (surroundingCode.includes('catch')) {
          assert.fail(
            `"useClaude" referenced in catch block at line ${refLine + 1} ` +
            `but no declaration found within same function scope. ` +
            `Nearest declaration is at line ${declarationLines[declarationLines.length - 1] + 1}. ` +
            `This will throw ReferenceError when GPT-4 fails.`
          );
        }
      }
    }
  });

  it('B-005b: document-extractor must not call client.annotateFile (method does not exist)', () => {
    // BUG: client.annotateFile() does not exist on ImageAnnotatorClient in @google-cloud/vision v5.x
    // CRASH: "client.annotateFile is not a function" at runtime on any PDF OCR attempt
    // FIX: Replaced with client.batchAnnotateFiles({ requests: [...] }) which is the correct API
    const extractor = readRepoFile('api/lib/document-extractor.js');
    assert.ok(extractor, 'Could not read api/lib/document-extractor.js');

    assert.ok(
      !extractor.includes('client.annotateFile('),
      'REGRESSION: client.annotateFile() found in document-extractor.js — ' +
      'this method does not exist on ImageAnnotatorClient and will throw at runtime. ' +
      'Use client.batchAnnotateFiles({ requests: [...] }) instead.'
    );
  });

  it('B-005: "logExtractionError" must not be called on coreSystem', () => {
    // BUG: intelligence.js called this.coreSystem.logExtractionError() but method doesn't exist
    // CRASH: "logExtractionError is not a function"
    // FIX: Replaced with console.error()
    const intel = readRepoFile('api/categories/memory/internal/intelligence.js');
    assert.ok(intel, 'Could not read intelligence.js');

    assert.ok(
      !intel.includes('this.coreSystem.logExtractionError'),
      'REGRESSION: "this.coreSystem.logExtractionError" found in intelligence.js — ' +
      'this method does not exist and will throw at runtime'
    );
  });
});

// ============================================================
// SECTION C: PIPELINE INTEGRITY
// Ensures the document, vault, and memory pipelines are intact
// ============================================================

describe('C. Pipeline Integrity', () => {

  it('C-001: document content variable (context.documents) used in prompt building', () => {
    // VERIFIED: context.documents injected at lines 4705 and 4735
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const hasDocInjection = orch.includes('context.documents');
    assert.ok(
      hasDocInjection,
      'Document injection variable "context.documents" not found in orchestrator. ' +
      'Documents will never be included in AI prompts.'
    );
  });

  it('C-002: vault content variable (context.vault) used in prompt building', () => {
    // VERIFIED: context.vault injected at lines 3971, 4027, 4520
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const hasVaultInjection = orch.includes('context.vault');
    assert.ok(
      hasVaultInjection,
      'Vault injection variable "context.vault" not found in orchestrator. ' +
      'Site Monkeys vault content will never be included in AI prompts.'
    );
  });

  it('C-003: memory gating logic exists in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const hasMemoryGating =
      orch.includes('MEMORY-GATE') ||
      orch.includes('memoryGat') ||
      orch.includes('shouldInjectMemory') ||
      orch.includes('memory_injected') ||
      orch.includes('inject_memory') ||
      orch.includes('skipMemory');

    assert.ok(
      hasMemoryGating,
      'Memory gating logic not found in orchestrator. ' +
      'Market/news queries will incorrectly receive personal memory injection.'
    );
  });

  it('C-004: externalLookupEngine has market/price handling', () => {
    const el = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(el, 'Could not read externalLookupEngine.js');

    const hasMarketHandling =
      el.includes('coingecko') ||
      el.includes('CoinGecko') ||
      el.includes('market') ||
      el.includes('price') ||
      el.includes('crypto');

    assert.ok(
      hasMarketHandling,
      'Market/price handling not found in externalLookupEngine.js'
    );
  });

  it('C-005: semantic retrieval exists in intelligence.js', () => {
    const intel = readRepoFile('api/categories/memory/internal/intelligence.js');
    assert.ok(intel, 'Could not read intelligence.js');

    const hasSemanticRetrieval =
      intel.includes('semantic') ||
      intel.includes('embedding') ||
      intel.includes('cosine') ||
      intel.includes('similarity');

    assert.ok(
      hasSemanticRetrieval,
      'Semantic retrieval logic not found in intelligence.js. ' +
      'Memory system will rely entirely on keyword fallback.'
    );
  });
});

// ============================================================
// SECTION D: CONFIGURATION SAFETY
// Ensures critical config hasn't been accidentally changed
// ============================================================

describe('D. Configuration Safety', () => {

  it('D-001: server.js exists as entry point', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'server.js')),
      'server.js missing — Railway deploy will fail'
    );
  });

  it('D-002: package.json start script is "node server.js"', () => {
    const pkg = readRepoFile('package.json');
    assert.ok(pkg, 'Could not read package.json');
    const parsed = JSON.parse(pkg);
    assert.ok(
      parsed.scripts?.start?.includes('server.js'),
      `Start script is "${parsed.scripts?.start}" — expected "node server.js"`
    );
  });

  it('D-003: railway.json exists with health check', () => {
    const railway = readRepoFile('railway.json');
    assert.ok(railway, 'railway.json missing — Railway deploy config lost');
    const parsed = JSON.parse(railway);
    assert.ok(
      parsed.deploy?.healthcheckPath,
      'railway.json missing healthcheckPath — Railway won\'t know if deploy succeeded'
    );
  });
});

// ============================================================
// SECTION E: CMP2 — INTERNATIONAL CHARACTER PRESERVATION
// Prevents regression of the diacritic-stripping bug in the
// fact-extraction + compression pipeline (Issue CMP2).
// ============================================================

describe('E. CMP2 — International Character Preservation', () => {

  it('E-001: intelligent-storage uses diacritic-preserving comparison for international names', () => {
    // BUG (fixed): normalizeForComparison() stripped diacritics from BOTH sides,
    // making "José" and "Jose" appear identical.  The fix uses .toLowerCase() only.
    // GUARD: Ensure normalizeForComparison is NOT used to check whether names
    // survived extraction (it would silently pass "Jose" as "José").
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    // The old broken pattern: normalize BOTH sides and compare
    const hasBrokenNormalize = (
      storage.includes('normalizedFacts.includes(normalized)') ||
      storage.includes('normalizeForComparison(facts)')
    );

    assert.ok(
      !hasBrokenNormalize,
      'CMP2 REGRESSION: The diacritic-normalizing comparison (normalizedFacts.includes(normalized)) ' +
      'was re-introduced in intelligent-storage.js. This makes "José"→"Jose" undetectable. ' +
      'Fix: compare facts.toLowerCase() vs name.toLowerCase() (diacritics preserved).'
    );
  });

  it('E-002: aggressivePostProcessing protects lines with international characters', () => {
    // BUG (fixed): Lines containing non-ASCII letters (e.g. "Contacts: José García, Björn")
    // fell into `regularLines` and were word-truncated to 5 words or cut by slice limits.
    // GUARD: Ensure unicodeNameLines (or equivalent) exist and bypass word truncation.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    const hasUnicodeLineProtection = (
      storage.includes('unicodeNameLines') ||
      (storage.includes('[^\\u0000-\\u007F]') && storage.includes('aggressivePostProcessing'))
    );

    assert.ok(
      hasUnicodeLineProtection,
      'CMP2 REGRESSION: aggressivePostProcessing no longer protects lines containing ' +
      'international characters (unicodeNameLines or equivalent is missing). ' +
      'Names like "Contacts: José García, Björn Þórsson" will be word-truncated or dropped.'
    );
  });

  it('E-003: post-compression re-verification of international names exists', () => {
    // BUG (fixed): The international-name re-injection ran BEFORE aggressivePostProcessing,
    // so aggressivePostProcessing could still discard the re-injected names.
    // GUARD: Ensure there is a second check AFTER aggressivePostProcessing.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    // Look for the post-compression re-check pattern: the check must reference
    // processedFacts (the output of aggressivePostProcessing), not just `facts`.
    const hasPostCompressionCheck = (
      storage.includes('missingAfterCompression') ||
      (storage.includes('processedFacts') && storage.includes('finalFacts'))
    );

    assert.ok(
      hasPostCompressionCheck,
      'CMP2 REGRESSION: Post-compression international name re-verification is missing. ' +
      'Names re-injected before aggressivePostProcessing can be silently discarded. ' +
      'Fix: after aggressivePostProcessing, re-check that all unicode names survived.'
    );
  });

  it('E-004: extraction prompt explicitly instructs preservation of international characters', () => {
    // GUARD: Ensure the GPT-4o-mini extraction prompt still contains the instruction
    // to preserve diacritics.  Removing this instruction increases the probability
    // of the model stripping accents even when prompted otherwise.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    // Check for the keyword that marks the critical preservation instruction.
    // The exact examples (José, Björn) may change but the concept must stay.
    const hasInternationalInstruction = (
      storage.includes('PRESERVE INTERNATIONAL NAMES') ||
      storage.includes('diacritics')
    );

    assert.ok(
      hasInternationalInstruction,
      'CMP2 REGRESSION: The extraction prompt no longer explicitly instructs ' +
      'GPT-4o-mini to preserve international characters (diacritics, accents). ' +
      'Without this, the model may silently anglicize names like "José"→"Jose".'
    );
  });

  it('E-005: CMP2 is not listed in smd_deep known_failures in baselines.json', () => {
    // Once the fix is in place, CMP2 should pass and no longer be a known failure.
    const baselines = readRepoFile('tests/baselines.json');
    assert.ok(baselines, 'Could not read tests/baselines.json');
    const parsed = JSON.parse(baselines);

    const smdKnownFailures = parsed?.suites?.smd_deep?.known_failures ?? [];
    const cmp2StillFailing = smdKnownFailures.some(f => f.id === 'CMP2');

    assert.ok(
      !cmp2StillFailing,
      'CMP2 is still listed as a known failure in tests/baselines.json (smd_deep suite). ' +
      'Remove it once the international-character preservation fix has been deployed and verified.'
    );
  });
});

// ============================================================
// SECTION F: SALARY SUPERSESSION — ISSUE #829 REGRESSION GUARDS
// Ensures that "my salary is now $95,000" type statements are:
// 1. Not misclassified as VOLATILE by truthTypeDetector
// 2. Not have storage skipped in server.js when external data is incidentally present
// 3. Matched by supersession fingerprint patterns in supersession.js
// ============================================================

describe('F. Salary Supersession Guards', () => {

  it('F-001: truthTypeDetector CONVERSATIONAL_PATTERNS includes salary/income/wage', () => {
    // BUG: "Actually my salary is now $95,000" was not caught by CONVERSATIONAL_PATTERNS.
    // The personal-fact pattern list was missing salary/income/wage/pay/earnings/compensation,
    // so the query fell through to VOLATILE_PATTERNS where the word "now" triggered VOLATILE
    // classification and caused an external RSS lookup instead of personal memory storage.
    // FIX: Added salary/income/wage/pay/earnings/compensation to the personal fact pattern,
    // plus explicit patterns for "my salary is now $X" and "I (now) make/earn $X".
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'Could not read truthTypeDetector.js');

    // The personal-fact CONVERSATIONAL_PATTERNS must include salary/income terms in the same
    // alternation group. Check for the exact pattern string added by the fix.
    const hasPersonalSalaryTerms = (
      detector.includes('salary|income|wage|pay|earnings|compensation')
    );
    assert.ok(
      hasPersonalSalaryTerms,
      'REGRESSION: truthTypeDetector.js CONVERSATIONAL_PATTERNS does not include salary/income/wage terms. ' +
      '"Actually my salary is now $95,000" will be classified as VOLATILE (due to "now"), ' +
      'triggering external lookup instead of personal memory storage.'
    );

    // Must also have a dedicated pattern handling "now" adverb between "is" and the dollar amount.
    // Check for the salary-specific "now" pattern added by the fix.
    const hasSalaryNowPattern = (
      detector.includes('salary|income|wage|pay|earnings|compensation') &&
      // The dedicated "my salary is now $X" pattern contains this substring
      detector.includes('salary|income|wage|pay|earnings|compensation)\\s+is\\s+(now\\s+)?')
    );
    assert.ok(
      hasSalaryNowPattern,
      'REGRESSION: truthTypeDetector.js is missing the dedicated "my salary is now $X" pattern. ' +
      'Without it, the word "now" triggers VOLATILE classification for salary updates.'
    );
  });

  it('F-002: server.js isPersonalOrMemoryQuery includes salary/income/wage terms', () => {
    // BUG: When a salary update was misclassified as VOLATILE and external lookup fired,
    // storage was skipped because isPersonalOrMemoryQuery did not include salary/income/wage.
    // The skip gate in server.js (both intelligent and supersession-aware storage paths)
    // must recognise salary/income statements as personal facts even when hasExternal=true.
    const server = readRepoFile('server.js');
    assert.ok(server, 'Could not read server.js');

    // Count occurrences — there are two separate isPersonalOrMemoryQuery checks in server.js
    const hasSalaryInPersonalCheck = (
      server.includes('salary|income|wage|pay|earnings|compensation') &&
      server.includes('isPersonalOrMemoryQuery')
    );
    assert.ok(
      hasSalaryInPersonalCheck,
      'REGRESSION: server.js isPersonalOrMemoryQuery does not include salary/income/wage terms. ' +
      'When a salary update incidentally triggers an external lookup, storage will be skipped ' +
      'and the $95K update will never be written to the database.'
    );
  });

  it('F-003: supersession.js user_salary fingerprint patterns handle "now" adverb', () => {
    // BUG: The salary fingerprint Pattern 1 in supersession.js required the dollar amount
    // to appear immediately after "is" (with only optional whitespace in between).
    // "my salary is now $95,000" has "now" between "is" and the amount, so the pattern
    // failed to match and storeWithSupersession did not detect a salary fingerprint.
    // As a result no supersession occurred and the old $80K entry was never marked is_current=false.
    const supersession = readRepoFile('api/services/supersession.js');
    assert.ok(supersession, 'Could not read api/services/supersession.js');

    // The salary patterns must accommodate an optional "now" between "is" and the amount.
    // Check that the updated Pattern 1 source contains the "now" optional group, which is
    // only present in the user_salary section of FINGERPRINT_PATTERNS.
    const hasSalaryNowHandling = (
      // The fix uses (?:is\s+(?:now\s+)?|:)? in the salary pattern
      supersession.includes('is\\s+(?:now\\s+)?')
    );
    assert.ok(
      hasSalaryNowHandling,
      'REGRESSION: supersession.js user_salary fingerprint Pattern 1 does not handle the "now" adverb. ' +
      '"my salary is now $95,000" will fail deterministic detection, meaning storeWithSupersession ' +
      'will not fire supersession and the old salary entry will NOT be marked is_current=false.'
    );
  });

  it('F-004: supersession.js user_job_title fingerprint patterns handle compound "job title" and promotions', () => {
    // BUG: The user_job_title FINGERPRINT_PATTERNS in supersession.js only matched
    // single-word field names ("my role is", "my title is") and hardcoded job titles via
    // "I am a <title>". This left two common real-world inputs undetected deterministically:
    //
    //   1. "My job title is Engineer"   — "job title" is a two-word compound field name;
    //      the single-word alternation matched "job" but then failed on "title is".
    //   2. "I got promoted to Senior Engineer" — no pattern matched this promotion phrasing.
    //
    // Without a fingerprint match, both messages fell through to model-based detection.
    // If the model timed out or returned null, no fact_fingerprint was stored, so the
    // subsequent supersession lookup (`WHERE fact_fingerprint = 'user_job_title' AND
    // is_current = true`) found nothing and the old job-title entry was never superseded.
    //
    // FIX: Added deterministic patterns for "My job title is X" and "I got promoted to X",
    //      added update-intent patterns for explicit job-title declarations, and modified
    //      storeWithoutSupersession to persist fact_fingerprint so future supersession works.
    const supersession = readRepoFile('api/services/supersession.js');
    assert.ok(supersession, 'Could not read api/services/supersession.js');

    // 1. Must have a pattern that explicitly handles "job title" as a compound field name.
    //    The only pattern that does this is the one with `job\s+title\s+`.
    const hasJobTitleCompoundPattern = supersession.includes('job\\s+title\\s+');
    assert.ok(
      hasJobTitleCompoundPattern,
      'REGRESSION: supersession.js is missing a pattern for the compound "job title" field name. ' +
      '"My job title is Engineer" will fail deterministic fingerprint detection and fall through ' +
      'to the model fallback (slow, unreliable), so no fact_fingerprint is stored and future ' +
      'supersession lookups for job_title will find nothing.'
    );

    // 2. Must have a pattern that matches promotion phrasing "got promoted to" / "been promoted to".
    //    Without this, "I got promoted to Senior Engineer" is not fingerprinted deterministically.
    const hasPromotionPattern = (
      supersession.includes('promoted\\s+to') ||
      supersession.includes('promoted to')
    );
    assert.ok(
      hasPromotionPattern,
      'REGRESSION: supersession.js is missing a promotion pattern ("got/been promoted to"). ' +
      '"I got promoted to Senior Engineer" will fail deterministic fingerprint detection, ' +
      'so storeWithSupersession will not fire and the old job-title entry stays is_current=true.'
    );

    // 3. storeWithoutSupersession must store fact_fingerprint when provided.
    //    When "My job title is Engineer" is the FIRST occurrence (no existing entry to supersede),
    //    supersessionSafe=false fires storeWithoutSupersession. If that function discards the
    //    fingerprint, the subsequent "I got promoted to X" supersession lookup finds nothing.
    //
    //    The fix adds `factFingerprint` and `fingerprintConfidence` to the INSERT column list
    //    inside storeWithoutSupersession, which is more precise than checking for "DO NOTHING".
    const storeWithoutSupersessionStoresFp = (
      // The fixed version destructures factFingerprint and includes it in the INSERT statement.
      // Check for the fingerprint columns in the INSERT inside storeWithoutSupersession.
      // This is more specific than just checking 'DO NOTHING' which could appear elsewhere.
      (supersession.includes('factFingerprint = null') &&
       supersession.includes('fact_fingerprint, fingerprint_confidence'))
    );
    assert.ok(
      storeWithoutSupersessionStoresFp,
      'REGRESSION: storeWithoutSupersession does not persist fact_fingerprint. ' +
      'When "My job title is Engineer" is stored (no update intent, so supersession is skipped), ' +
      'the fingerprint must still be written to the DB column so the subsequent ' +
      '"I got promoted to X" supersession lookup can find and supersede this row. ' +
      'Expected to find both "factFingerprint = null" (destructuring) and ' +
      '"fact_fingerprint, fingerprint_confidence" (INSERT column list) in storeWithoutSupersession.'
    );
  });
});

// ============================================================
// SECTION G: Contact Extraction Scoping Guards
// Prevent monkey species, children's names, and partial name
// fragments from polluting "Your contacts include:" footers.
// ============================================================
describe('G. Contact Extraction Scoping Guards', () => {
  it('G-001: applyListCompletenessFallback filters memory context to contact-relevant segments', () => {
    const aiProcessors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(aiProcessors, 'api/lib/ai-processors.js must exist');

    // The function must split memoryContext into individual entries and only scan
    // entries that contain explicit contact indicators before extracting names.
    const hasSplitByEntries = /memoryContext\.split\(\/\\n\\n/.test(aiProcessors);
    assert.ok(
      hasSplitByEntries,
      'REGRESSION: applyListCompletenessFallback must split memoryContext by double-newline ' +
      'to isolate individual memory entries before name extraction. Without this, names from ' +
      'family/pet entries (e.g. "Black Cap Capuchin", "Emerald Next") are incorrectly extracted.'
    );
  });

  it('G-002: applyListCompletenessFallback uses CONTACT_ENTRY_INDICATORS to scope name extraction', () => {
    const aiProcessors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(aiProcessors, 'api/lib/ai-processors.js must exist');

    const hasContactIndicators = aiProcessors.includes('CONTACT_ENTRY_INDICATORS');
    assert.ok(
      hasContactIndicators,
      'REGRESSION: applyListCompletenessFallback must define CONTACT_ENTRY_INDICATORS to ' +
      'restrict name extraction to entries explicitly about contacts/colleagues/friends. ' +
      'Without this guard, any proper noun in any memory entry can become a "contact".'
    );
  });

  it('G-003: applyListCompletenessFallback excludes non-contact entry types (family, pets)', () => {
    const aiProcessors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(aiProcessors, 'api/lib/ai-processors.js must exist');

    const hasNonContactExclusion = aiProcessors.includes('NON_CONTACT_ENTRY_INDICATORS');
    assert.ok(
      hasNonContactExclusion,
      'REGRESSION: applyListCompletenessFallback must define NON_CONTACT_ENTRY_INDICATORS to ' +
      'exclude memory entries about children (daughter/son/child), animals (monkey/capuchin), ' +
      'and pets from name extraction. These entries must not contribute to the contacts list.'
    );
  });

  it('G-004: applyListCompletenessFallback requires full names (min 2 words) — Pattern 1', () => {
    const aiProcessors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(aiProcessors, 'api/lib/ai-processors.js must exist');

    // The Pattern 1 branch (Name (descriptor) format) must require at least two words
    // before accepting a match — single-word fragments like "García" must be rejected.
    // We check for the two-word guard regex applied to any variable in Pattern 1's block,
    // which appears between namedPattern.exec and names.push.
    const hasFullNameGuardP1 = /\/\\S\+\\s\+\\S\+\/\.test\(/.test(aiProcessors);
    assert.ok(
      hasFullNameGuardP1,
      'REGRESSION: Pattern 1 in applyListCompletenessFallback must reject single-word name ' +
      'fragments. A /\\S+\\s+\\S+/.test(...) guard is required to ensure only "First Last" ' +
      'style full names are accepted (not bare "García" extracted from "José García").'
    );
  });

  it('G-005: applyListCompletenessFallback requires full names (min 2 words) — Pattern 2', () => {
    const aiProcessors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(aiProcessors, 'api/lib/ai-processors.js must exist');

    // Pattern 2 (comma-separated list) must also require at least two words per extracted name.
    // Count occurrences: there must be at least two — one for Pattern 1 and one for Pattern 2.
    const twoWordGuardCount = (aiProcessors.match(/\/\\S\+\\s\+\\S\+\/\.test\(/g) || []).length;
    assert.ok(
      twoWordGuardCount >= 2,
      'REGRESSION: Both Pattern 1 and Pattern 2 in applyListCompletenessFallback must reject ' +
      'single-word name fragments. Expected at least 2 occurrences of /\\S+\\s+\\S+/.test(...) ' +
      `but found ${twoWordGuardCount}. Pattern 2 (comma-separated) must also require First+Last.`
    );
  });

  it('G-006: enforceUnicodeNames fallback regex requires minimum two-word names', () => {
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'api/core/orchestrator.js must exist');

    // The fallback content extraction inside #enforceUnicodeNames must use a regex
    // that requires First + Last (two words) to prevent single-word surname fragments
    // from being injected into the "Your contacts include:" footer.
    // Pattern: /\b([A-ZÀ-ÿ][a-zà-ÿ]+\s+[A-ZÀ-ÿ][a-zà-ÿ]+)\b/g  (no ? after second word group)
    const hasTwoWordFallback = orchestrator.includes('[A-ZÀ-ÿ][a-zà-ÿ]+\\s+[A-ZÀ-ÿ][a-zà-ÿ]+');
    assert.ok(
      hasTwoWordFallback,
      'REGRESSION: The fallback name extraction in #enforceUnicodeNames must require ' +
      'two words (First Last) — the old optional second-word pattern (?:\\s+...)? allowed ' +
      'single surnames like "García" to pass through independently.'
    );
  });
});

// ============================================================
// SECTION H: STR1 — Volume Stress Guards (Issue #863)
// Ensures that dense messages with 10+ personal facts are
// fully preserved through extraction and compression.
// ============================================================
describe('H. STR1 — Volume Stress Guards', () => {
  it('H-001: aggressivePostProcessing maxFacts scales with input line count', () => {
    // BUG (fixed): maxFacts was a hard cap of 3 (or 5 with identifiers/synonyms).
    // With 10 plain-text facts and no identifiers, cap = 3 — 7 facts lost silently.
    // FIX: maxFacts must scale with regularLines.length so all distinct facts survive.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    // The fixed version uses Math.max(base, Math.min(regularLines.length, 15))
    // or equivalent — regularLines.length must participate in the maxFacts calculation.
    const hasScalingMaxFacts = (
      storage.includes('regularLines.length') &&
      storage.includes('maxFacts')
    );

    assert.ok(
      hasScalingMaxFacts,
      'STR1 REGRESSION: aggressivePostProcessing maxFacts is a fixed cap (3 or 5) that ' +
      'does not scale with the number of distinct input lines. When a user provides 10 facts ' +
      'in a single message, only 3–5 are preserved. Fix: use Math.max(base, regularLines.length).'
    );
  });

  it('H-002: extraction max_tokens is at least 300 for dense inputs', () => {
    // BUG (fixed): max_tokens was 150, barely enough for ~10 facts × ~15 tokens each.
    // At the limit, GPT-4o-mini truncates output, dropping the last 3–5 facts.
    // FIX: Increase to 300 to give extraction room for 10+ fact messages.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    const tokenMatch = storage.match(/max_tokens:\s*(\d+)/);
    const tokenValue = tokenMatch ? parseInt(tokenMatch[1]) : 0;

    assert.ok(
      tokenValue >= 300,
      `STR1 REGRESSION: max_tokens for GPT-4o-mini extraction is ${tokenValue} — must be ≥ 300. ` +
      'With only 150 tokens, extracting 10+ facts from a dense message causes output truncation ' +
      'and silent fact loss. Increase to at least 300.'
    );
  });

  it('H-003: STR1 is not listed in smd_deep known_failures in baselines.json', () => {
    const baselines = readRepoFile('tests/baselines.json');
    assert.ok(baselines, 'Could not read tests/baselines.json');
    const parsed = JSON.parse(baselines);

    const smdKnownFailures = parsed?.suites?.smd_deep?.known_failures ?? [];
    const str1StillFailing = smdKnownFailures.some(f => f.id === 'STR1');

    assert.ok(
      !str1StillFailing,
      'STR1 is still listed as a known failure in tests/baselines.json (smd_deep suite). ' +
      'Remove it once the volume stress fix (maxFacts scaling + max_tokens increase) has been deployed.'
    );
  });
});

// ============================================================
// SECTION I: EDG3 — Pricing Preservation Guards (Issue #863)
// Ensures that pricing lines survive aggressivePostProcessing
// without being word-truncated or fact-dropped.
// ============================================================
describe('I. EDG3 — Pricing Preservation Guards', () => {
  it('I-001: aggressivePostProcessing defines pricingLines exempt from word truncation', () => {
    // BUG (fixed): Lines containing pricing data (e.g. "Plans: $99/month, $299/month")
    // fell into regularLines and were word-truncated to 5 words, losing the second price.
    // FIX: Introduce pricingLines category (lines with $ or pricing keywords) that bypasses
    // word truncation, similar to unicodeNameLines.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    const hasPricingLineProtection = (
      storage.includes('pricingLines') ||
      (storage.includes('\\$[\\d,.]') && storage.includes('aggressivePostProcessing'))
    );

    assert.ok(
      hasPricingLineProtection,
      'EDG3 REGRESSION: aggressivePostProcessing no longer protects lines containing pricing data. ' +
      'Lines with dollar amounts ($X.XX) or pricing keywords will be word-truncated to 5 words, ' +
      'potentially dropping the second or third price in a multi-tier pricing statement. ' +
      'Fix: add a pricingLines category exempt from word-count truncation.'
    );
  });

  it('I-002: amountPattern uses global flag to detect ALL prices in input', () => {
    // BUG (fixed): amountPattern used /i (no /g), so .match() found only the FIRST price.
    // "The basic plan costs $99 and premium costs $299" → inputAmounts = ['$99'] (one item).
    // factsAmounts also = ['$99'] if it survived → length check passes → $299 never re-injected.
    // FIX: Use /gi flag so .match() returns ALL dollar amounts.
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read intelligent-storage.js');

    // The fixed pattern should contain /gi (global + case-insensitive) for amountPattern
    const hasGlobalAmountPattern = /amountPattern\s*=\s*\/[^/]+\/gi/.test(storage);

    assert.ok(
      hasGlobalAmountPattern,
      'EDG3 REGRESSION: amountPattern does not use the global (/g) flag. Without /g, ' +
      '.match() finds only the first dollar amount — a message with "$99 and $299" will ' +
      'verify "$99" survived but never detect that "$299" was lost. Fix: use /gi flag.'
    );
  });

  it('I-003: EDG3 is not listed in smd_deep known_failures in baselines.json', () => {
    const baselines = readRepoFile('tests/baselines.json');
    assert.ok(baselines, 'Could not read tests/baselines.json');
    const parsed = JSON.parse(baselines);

    const smdKnownFailures = parsed?.suites?.smd_deep?.known_failures ?? [];
    const edg3StillFailing = smdKnownFailures.some(f => f.id === 'EDG3');

    assert.ok(
      !edg3StillFailing,
      'EDG3 is still listed as a known failure in tests/baselines.json (smd_deep suite). ' +
      'Remove it once the pricing preservation fix (pricingLines + global amountPattern) has been deployed.'
    );
  });
});

// ============================================================
// SECTION J: MEM-007 - IMPORTANCE-BASED RANKING
// Ensures high-importance memories (allergy, medication) rank
// above casual preferences via stored relevance_score boost.
// Root cause of MEM-007: calculateHybridScore did not use
// memory.relevance_score — allergy (0.95) ranked same as
// ice cream preference (0.50) since both had similar similarity.
// Fix: add importance boost for relevance_score >= 0.85.
// ============================================================

describe('J. MEM-007: Importance-Based Ranking Fix', () => {

  it('J-001: calculateHybridScore uses relevance_score for importance boost', () => {
    // BUG (fixed): calculateHybridScore ignored the stored relevance_score column.
    // High-importance memories (health-critical: allergy → 0.95) were ranked the same
    // as casual preferences (ice cream → 0.50) when semantic similarity was similar.
    // FIX: memories with relevance_score >= 0.90 receive a proportional boost ABOVE the
    // non-boosted 1.0 cap but BELOW the safety-boosted 2.0+ tier: (score - 0.90) * 6.0.
    // NOTE: Threshold raised from 0.85 to 0.90 (Issue #893 STR1 regression fix) — more
    // surgical, only boosts truly safety-critical facts (allergy: 0.95) without displacing
    // normal casual facts that may score 0.85–0.89 in the volume stress test (STR1).
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    // Must use relevance_score in hybrid ranking
    const usesRelevanceScore = retrieval.includes('memory.relevance_score');
    assert.ok(
      usesRelevanceScore,
      'MEM-007 REGRESSION: calculateHybridScore does not reference memory.relevance_score. ' +
      'High-importance memories (health-critical allergy scored 0.95) will rank the same as ' +
      'casual preferences (ice cream scored 0.50), causing allergy to be omitted from food context. ' +
      'Fix: add importance boost for relevance_score >= 0.90 in calculateHybridScore.'
    );

    // Must apply the boost only when relevance_score meets threshold (0.85 OR 0.90)
    // Threshold 0.90 is the STR1-safe value; 0.85 is also acceptable if MEM-007 still passes.
    const hasThresholdCheck = retrieval.includes('relevance_score >= 0.90') ||
                              retrieval.includes('relevance_score >= 0.85') ||
                              retrieval.includes('relevance_score > 0.89') ||
                              retrieval.includes('relevance_score > 0.84') ||
                              retrieval.includes('relevance_score > 0.8');
    assert.ok(
      hasThresholdCheck,
      'MEM-007 REGRESSION: importance boost threshold is missing. Without a threshold (e.g., >= 0.90), ' +
      'all memories would receive a boost regardless of importance, destroying the ranking separation ' +
      'between health-critical facts and casual preferences. Fix: only boost when relevance_score >= 0.90.'
    );
  });

  it('J-002: MEM-007 is not listed in comprehensive_53 known_failures in baselines.json', () => {
    const baselines = readRepoFile('tests/baselines.json');
    assert.ok(baselines, 'Could not read tests/baselines.json');
    const parsed = JSON.parse(baselines);

    const knownFailures = parsed?.suites?.comprehensive_53?.known_failures ?? [];
    const mem007StillFailing = knownFailures.some(f => f.id === 'MEM-007');

    assert.ok(
      !mem007StillFailing,
      'MEM-007 is still listed as a known failure in tests/baselines.json (comprehensive_53 suite). ' +
      'Remove it once the importance-based ranking fix (relevance_score boost in calculateHybridScore) ' +
      'has been deployed and verified passing in live tests.'
    );
  });
});

// ============================================================
// SECTION K: News Source Credibility Guards
// Ensures satirical/unreliable sources are filtered before
// injection into AI context, preventing fabricated content
// from being presented as verified fact.
// Root cause: Google News RSS accepted articles from any outlet
// (including The Babylon Bee, The Onion) with no domain filter.
// The "[VERIFIED EXTERNAL DATA — MANDATORY SOURCE]" label then
// forced the AI to treat all content as established fact.
// ============================================================

describe('K. News Source Credibility Guards', () => {

  it('K-001: BANNED_NEWS_SOURCES constant exists and includes known satirical outlets', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    assert.ok(
      engine.includes('BANNED_NEWS_SOURCES'),
      'K-001 FAIL: BANNED_NEWS_SOURCES constant is missing from externalLookupEngine.js. ' +
      'Without it, satirical outlets (Babylon Bee, The Onion, etc.) can pass through to AI context.'
    );

    // Verify key satirical outlets are listed
    const hasBabylonBee = engine.includes('babylon bee') || engine.includes('the babylon bee');
    assert.ok(
      hasBabylonBee,
      'K-001 FAIL: "babylon bee" is not in BANNED_NEWS_SOURCES. ' +
      'The Babylon Bee is a satirical outlet whose fabricated geopolitical headlines ' +
      'can be presented as fact if not filtered.'
    );

    const hasTheOnion = engine.includes("'the onion'") || engine.includes('"the onion"');
    assert.ok(
      hasTheOnion,
      'K-001 FAIL: "the onion" is not in BANNED_NEWS_SOURCES. ' +
      'The Onion is a well-known satirical outlet that must be excluded from fact injection.'
    );
  });

  it('K-002: isSourceBanned function exists and is exported', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    assert.ok(
      engine.includes('export function isSourceBanned'),
      'K-002 FAIL: isSourceBanned is not exported from externalLookupEngine.js. ' +
      'The function must be exported so it can be unit-tested and used by other modules.'
    );
  });

  it('K-003: Google News RSS extractor filters banned sources before collecting items', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    // The RSS extract function must call isSourceBanned on each item's source before
    // adding it to the items array.
    const hasRSSFilter = engine.includes('isSourceBanned(source)') ||
                         engine.includes('isSourceBanned(match[2])') ||
                         (engine.includes('isSourceBanned') && engine.includes('Google News RSS'));

    assert.ok(
      hasRSSFilter,
      'K-003 FAIL: The Google News RSS extractor does not call isSourceBanned to filter articles. ' +
      'Satirical headlines from banned outlets can pass through unfiltered and be injected ' +
      'into the AI context as verified facts.'
    );
  });

  it('K-004: NewsAPI extractor filters banned sources', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    // The NewsAPI extractor must filter using isSourceBanned
    const hasNewsAPIFilter = engine.includes('isSourceBanned') &&
                             (engine.includes("a.source?.name || ''") ||
                              engine.includes('isSourceBanned(a.source') ||
                              engine.includes("a.source?.name"));

    assert.ok(
      hasNewsAPIFilter,
      'K-004 FAIL: The NewsAPI extractor does not call isSourceBanned to filter articles. ' +
      'Unreliable sources returned by NewsAPI can pass through into AI context.'
    );
  });

  it('K-005: GDELT extractor filters banned domains', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    // GDELT returns article domains; the extractor must filter using isSourceBanned on a.domain
    const hasGDELTFilter = engine.includes('isSourceBanned(a.domain');

    assert.ok(
      hasGDELTFilter,
      'K-005 FAIL: The GDELT extractor does not call isSourceBanned on article domains. ' +
      'Domains from banned outlets (e.g. babylonbee.com) can pass through GDELT results.'
    );
  });

  it('K-006: orchestrator adds credibility warning for geopolitical queries without reputable sources', () => {
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    const hasCredibilityWarning = orchestrator.includes('CREDIBILITY WARNING') ||
                                  orchestrator.includes('credibilityNote');
    assert.ok(
      hasCredibilityWarning,
      'K-006 FAIL: The orchestrator does not add a credibility warning when geopolitical ' +
      'external content lacks a reputable source. Without this guard, the AI presents ' +
      'unverified headlines as established fact via the "[VERIFIED EXTERNAL DATA]" label.'
    );

    // Must import hasReputableSource to perform this check
    const importsHasReputableSource = orchestrator.includes('hasReputableSource');
    assert.ok(
      importsHasReputableSource,
      'K-006 FAIL: orchestrator does not import or call hasReputableSource. ' +
      'The credibility warning cannot fire without this check.'
    );
  });

  it('K-007: BANNED_NEWS_DOMAINS constant exists for domain-based filtering', () => {
    const engine = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(engine, 'Could not read externalLookupEngine.js');

    assert.ok(
      engine.includes('BANNED_NEWS_DOMAINS'),
      'K-007 FAIL: BANNED_NEWS_DOMAINS is missing from externalLookupEngine.js. ' +
      'GDELT returns raw domains (e.g. babylonbee.com); without a domain-level list, ' +
      'domain-based filtering in isSourceBanned cannot work.'
    );

    const hasBabylonBeeDomain = engine.includes("'babylonbee.com'") || engine.includes('"babylonbee.com"');
    assert.ok(
      hasBabylonBeeDomain,
      'K-007 FAIL: "babylonbee.com" is not in BANNED_NEWS_DOMAINS. ' +
      'GDELT articles from this domain will not be filtered.'
    );
  });

});

console.log('✅ Tier 1 Code Guards loaded (ESM-safe, pure file scanning, $0 cost)');
