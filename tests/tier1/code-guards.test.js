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

// ============================================================
// SECTION L: GREETING SHORTCUT GUARDS (Issue: BV-mode fallthrough)
// ============================================================

describe('L. Greeting Shortcut Guards', () => {

  it('L-001: isPureGreeting bypasses userHasMemories check so shortcut fires in all modes', () => {
    // ROOT CAUSE (Issue): In Business Validation mode, a user with stored memories caused
    // userHasMemories=true which set memoryContext.hasMemory=true which blocked the
    // STEP 6.9 greeting shortcut, routing "Hello" to GPT-4 at $0.04+ cost.
    // FIX: A pure greeting (no personal intent) must skip memory regardless of userHasMemories.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // The isPureGreeting flag must exist and reference both the classification and hasPersonalIntent
    const hasIsPureGreeting =
      orchestrator.includes('isPureGreeting') &&
      orchestrator.includes("classification === 'greeting'") &&
      orchestrator.includes('!hasPersonalIntent');

    assert.ok(
      hasIsPureGreeting,
      'L-001 FAIL: isPureGreeting guard is missing from orchestrator.js. ' +
      'Without it, "Hello" in Business Validation mode (user with memories) bypasses ' +
      'the greeting shortcut and hits GPT-4, costing ~$0.04 per greeting.'
    );
  });

  it('L-002: isPureGreeting gates the userHasMemories database call', () => {
    // The DB query this.#hasUserMemories() must NOT be called for pure greetings —
    // it is both unnecessary (result unused) and a latency source.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // The check `skipMemoryForSimpleQuery && !isPureGreeting` (or equivalent) must guard
    // the hasUserMemories call so pure greetings skip it entirely.
    const gatesMemoryCall =
      orchestrator.includes('skipMemoryForSimpleQuery && !isPureGreeting') ||
      (orchestrator.includes('!isPureGreeting') && orchestrator.includes('#hasUserMemories'));

    assert.ok(
      gatesMemoryCall,
      'L-002 FAIL: The isPureGreeting guard does not gate the #hasUserMemories DB call. ' +
      'Pure greetings will still trigger an unnecessary database query before the shortcut check.'
    );
  });

  it('L-003: greeting shortcut memory skip condition includes isPureGreeting', () => {
    // The condition that skips memory retrieval must allow pure greetings to bypass
    // even when userHasMemories is true.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // Expected pattern: (!userHasMemories || isPureGreeting)
    const hasCorrectCondition =
      orchestrator.includes('!userHasMemories || isPureGreeting') ||
      orchestrator.includes('isPureGreeting || !userHasMemories');

    assert.ok(
      hasCorrectCondition,
      'L-003 FAIL: The memory-skip condition does not include isPureGreeting. ' +
      'A user with stored memories sending "Hello" will still retrieve memory context, ' +
      'setting memoryContext.hasMemory=true and blocking the STEP 6.9 shortcut.'
    );
  });

  it('L-004: greeting hard-cut uses word boundary to prevent mid-word truncation', () => {
    // ROOT CAUSE (Issue): When GPT-4 was mistakenly called for "Hello" (Issue L-001),
    // the 150-char greeting truncation hard-cut the response mid-word:
    // "...perhaps related to your work as a Senior Arc..."
    // FIX: The hard-cut fallback must trim at the last space (word boundary).
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // The else-branch of the sentence-boundary check must now call lastIndexOf(' ')
    // on the truncated string before appending '...'
    const hasWordBoundaryFallback =
      orchestrator.includes("lastSpace = truncated.lastIndexOf(' ')") ||
      orchestrator.includes('truncated.lastIndexOf(" ")');

    assert.ok(
      hasWordBoundaryFallback,
      'L-004 FAIL: The greeting truncation hard-cut does not find the last word boundary. ' +
      'Responses will be cut mid-word (e.g. "Senior Arc..." instead of "Senior Architect.").'
    );
  });

});

// ============================================================
// SECTION M: GREETING CLASSIFIER DETERMINISTIC SHORT-CIRCUIT
// Guards the fix for "Hello" scoring only 0.587 cosine similarity
// (below the HIGH_CONFIDENCE 0.70 threshold), which caused it to
// fall through to `simple_short` instead of `greeting`, blocking
// the STEP 6.9 shortcut and routing the request to GPT-4.
// ============================================================

describe('M. Greeting Classifier Deterministic Short-Circuit', () => {

  it('M-001: classifyQueryComplexity imports and uses PURE_GREETINGS Set before embedding call', () => {
    // ROOT CAUSE: "Hello" embedding similarity (~0.587) < HIGH_CONFIDENCE (0.70), so
    // determineClassification() returned `simple_short` instead of `greeting`.
    // FIX: A PURE_GREETINGS Set (in greetingUtils.js) must short-circuit
    // before the embedding API call for trivially obvious greetings (no regex on input).
    const classifier = readRepoFile('api/core/intelligence/queryComplexityClassifier.js');
    assert.ok(classifier, 'Could not read api/core/intelligence/queryComplexityClassifier.js');

    const importsSet =
      classifier.includes("PURE_GREETINGS") &&
      classifier.includes("greetingUtils");
    const usesSet = classifier.includes('PURE_GREETINGS.has(');

    assert.ok(
      importsSet && usesSet,
      'M-001 FAIL: PURE_GREETINGS Set is not imported/used in queryComplexityClassifier.js. ' +
      '"Hello" will score ~0.587 cosine similarity, fall below the 0.70 threshold, and ' +
      'be misclassified as simple_short — blocking the greeting shortcut and hitting GPT-4.'
    );
  });

  it('M-002: deterministic greeting short-circuit returns confidence >= 0.85', () => {
    // The orchestrator STEP 6.9 shortcut requires confidence >= 0.85.
    // The deterministic path must return a confidence value that satisfies this gate.
    // We check that the return block following the PURE_GREETINGS.has(...) check contains a
    // `confidence:` property with a numeric value >= 0.85.
    const classifier = readRepoFile('api/core/intelligence/queryComplexityClassifier.js');
    assert.ok(classifier, 'Could not read api/core/intelligence/queryComplexityClassifier.js');

    // Find the deterministic return block (between PURE_GREETINGS.has() check and the next
    // getCachedEmbedding call) and verify it contains a qualifying confidence value.
    const patternIdx = classifier.indexOf('PURE_GREETINGS.has(');
    const embeddingIdx = classifier.indexOf('getCachedEmbedding(classificationText)');
    assert.ok(patternIdx !== -1, 'M-002 FAIL: PURE_GREETINGS.has() check not found');
    assert.ok(embeddingIdx !== -1, 'M-002 FAIL: getCachedEmbedding call not found');

    const shortCircuitBlock = classifier.substring(patternIdx, embeddingIdx);
    // Match `confidence: 0.85` through `confidence: 0.99` or `confidence: 1` / `confidence: 1.0`
    const confidenceMatch = shortCircuitBlock.match(/confidence:\s*(0\.(?:8[5-9]|9\d)|1(?:\.0)?)\b/);

    assert.ok(
      confidenceMatch !== null,
      'M-002 FAIL: The deterministic greeting short-circuit does not return confidence >= 0.85. ' +
      'The STEP 6.9 orchestrator check (>= 0.85) will still block the shortcut.'
    );
  });

  it('M-003: deterministic greeting short-circuit fires before embedding API call', () => {
    // Cost guard: the pattern check must appear BEFORE getCachedEmbedding() is called.
    // If embedding is called first and THEN the set check is performed, cost saving is lost.
    const classifier = readRepoFile('api/core/intelligence/queryComplexityClassifier.js');
    assert.ok(classifier, 'Could not read api/core/intelligence/queryComplexityClassifier.js');

    const patternIdx = classifier.indexOf('PURE_GREETINGS');
    const embeddingIdx = classifier.indexOf('getCachedEmbedding(classificationText)');

    assert.ok(patternIdx !== -1, 'M-003 FAIL: PURE_GREETINGS not found');
    assert.ok(embeddingIdx !== -1, 'M-003 FAIL: getCachedEmbedding call not found');

    assert.ok(
      patternIdx < embeddingIdx,
      'M-003 FAIL: PURE_GREETING_PATTERN check appears AFTER the getCachedEmbedding() call. ' +
      'The deterministic short-circuit must come first to avoid unnecessary embedding API costs.'
    );
  });

});

// ============================================================
// SECTION N: THREE-ISSUE FIX GUARDS (Memory Bloat + Personal Lookup + Biz Validation)
// Guards for three bugs diagnosed in the read-only investigation:
//   Issue 1 — Memory record 2903 (1,322 tokens) consuming 66% of 2,000-token budget
//   Issue 2 — "what are my pets names" triggering isFactualEntityLookupQuery=true
//   Issue 3 — Business validation checker firing on personal pet-name queries
// ============================================================

describe('N. Issue 1 — Per-Record Memory Token Cap', () => {

  it('N-001: RETRIEVAL_CONFIG defines maxTokensPerRecord as a numeric property', () => {
    const src = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(src, 'Could not read api/services/semantic-retrieval.js');

    // Verify it's an actual config property assignment, not just a comment
    const hasConfigProperty = /maxTokensPerRecord\s*:\s*\d+/.test(src);
    assert.ok(
      hasConfigProperty,
      'N-001 FAIL: RETRIEVAL_CONFIG.maxTokensPerRecord is missing or not set to a numeric value. ' +
      'Without a per-record cap, a single bloated record (e.g. id=2903 at 1,322 tokens) ' +
      'can consume >50% of the 2,000-token memory budget on every query.'
    );
  });

  it('N-002: capRecordTokens helper is defined and called before results.push()', () => {
    const src = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(src, 'Could not read api/services/semantic-retrieval.js');

    // Helper must be defined (function or arrow function)
    const hasHelper = /const capRecordTokens\s*=/.test(src);
    // capRecordTokens() call must appear before the first results.push() that follows it
    const capCallIdx  = src.indexOf('capRecordTokens(memory)');
    const pushIdx     = src.indexOf('results.push(', capCallIdx);
    const appliedBeforePush = capCallIdx !== -1 && pushIdx !== -1 && capCallIdx < pushIdx;

    assert.ok(
      hasHelper && appliedBeforePush,
      'N-002 FAIL: capRecordTokens helper is not defined or not called before results.push(). ' +
      'Bloated records will not be truncated at retrieval time.'
    );
  });

  it('N-003: per-record cap uses sentence-boundary truncation and marks truncated content', () => {
    const src = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(src, 'Could not read api/services/semantic-retrieval.js');

    // Locate the capRecordTokens function body
    const fnStart = src.indexOf('const capRecordTokens');
    const fnEnd   = src.indexOf('\n    };', fnStart) + 7;
    assert.ok(fnStart !== -1, 'N-003 FAIL: capRecordTokens function not found');

    const fnBody = src.substring(fnStart, fnEnd);
    const hasSentenceBoundary = fnBody.includes('lastSentence') && fnBody.includes('lastIndexOf');
    const marksContent = fnBody.includes('[truncated]');

    assert.ok(
      hasSentenceBoundary && marksContent,
      'N-003 FAIL: capRecordTokens must find a sentence boundary (lastSentence/lastIndexOf) and ' +
      'append "[truncated]" so the memory content remains coherent after truncation.'
    );
  });

});

describe('N. Issue 2 — Personal Possessive Queries Must Not Trigger External Lookup', () => {

  it('N-004: isFactualEntityQuery has early return false for possessive "my" queries', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    // Find the function body
    const fnStart = src.indexOf('export function isFactualEntityQuery(');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    assert.ok(fnStart !== -1, 'N-004 FAIL: isFactualEntityQuery function not found');

    const fnBody = src.substring(fnStart, fnEnd);

    // The guard must: (a) match /\bmy\b/ and (b) return false
    const hasMyPattern = fnBody.includes('\\bmy\\b');
    const hasReturnFalse = /if\s*\(.*\\bmy\\b.*\)\s*return\s*false/.test(fnBody) ||
      // Also accept multi-line form: if (/\bmy\b/...) { ... return false }
      (hasMyPattern && fnBody.includes('return false'));

    assert.ok(
      hasMyPattern && hasReturnFalse,
      'N-004 FAIL: isFactualEntityQuery must check for possessive /\\bmy\\b/ and return false. ' +
      '"what are my pets names Bella and Max" will match /what are/ + hasProperNouns("Bella") ' +
      'and incorrectly set isFactualEntityLookupQuery=true, triggering Wikipedia/NewsAPI.'
    );
  });

  it('N-005: isPersonalMemoryRecall catches "what are/is my" pattern', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    // The isPersonalMemoryRecall block must now include a pattern matching
    // "what are my", "what is my", "what were my", "what was my", "who are my"
    const blockStart = src.indexOf('const isPersonalMemoryRecall');
    const blockEnd   = src.indexOf(');', blockStart) + 2;
    assert.ok(blockStart !== -1, 'N-005 FAIL: isPersonalMemoryRecall block not found');

    const block = src.substring(blockStart, blockEnd);
    const hasBroadPattern =
      block.includes('what (are|is|were|was)') ||
      block.includes('what are') ||
      block.includes('what is') ||
      block.includes('who (are|is|were|was)');

    assert.ok(
      hasBroadPattern,
      'N-005 FAIL: isPersonalMemoryRecall does not catch "what are/is my" patterns. ' +
      '"what are my pets names" will bypass the early-exit and fall through to confidence-based ' +
      'lookup triggers, hitting Wikipedia/NewsAPI on every personal memory question.'
    );
  });

});

describe('N. Issue 4 — Organizational Possessive Queries Must Not Trigger External Lookup', () => {

  it('N-009: isFactualEntityQuery blocks "our" possessive queries before proper noun detection', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    const fnStart = src.indexOf('export function isFactualEntityQuery(');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    assert.ok(fnStart !== -1, 'N-009 FAIL: isFactualEntityQuery function not found');

    const fnBody = src.substring(fnStart, fnEnd);

    // Must have a guard for /\bour\b/ that returns false and appears before hasProperNouns()
    const hasOurPattern = fnBody.includes('\\bour\\b');
    const ourGuardIdx   = fnBody.indexOf('\\bour\\b');
    const properNounIdx = fnBody.indexOf('hasProperNouns(');
    const guardReturnsFalse =
      /if\s*\(\s*\/\\bour\\b\/i\.test\(query\)\s*\)\s*return\s*false/.test(fnBody) ||
      /if\s*\(\s*\/\\bour\\b\/i\.test\(query\)\s*\)\s*\{[\s\S]{0,200}?return\s*false/.test(fnBody); // multi-line guard block (bounded to ~200 chars to avoid catastrophic backtracking)

    assert.ok(hasOurPattern, 'N-009 FAIL: /\\bour\\b/ guard missing from isFactualEntityQuery.');
    assert.ok(guardReturnsFalse, 'N-009 FAIL: /\\bour\\b/ guard must return false.');
    assert.ok(properNounIdx !== -1, 'N-009 FAIL: hasProperNouns() call not found in isFactualEntityQuery.');
    assert.ok(ourGuardIdx !== -1 && ourGuardIdx < properNounIdx,
      'N-009 FAIL: /\\bour\\b/ guard must appear before hasProperNouns() so it short-circuits external lookup.');
  });

  it('N-010: isFactualEntityQuery "our" guard fires before entity-pattern checks', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    const fnStart = src.indexOf('export function isFactualEntityQuery(');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnBody  = src.substring(fnStart, fnEnd);

    // "our" guard must appear before the return statement with entity patterns
    const ourGuardIdx    = fnBody.indexOf('\\bour\\b');
    const entityReturnIdx = fnBody.indexOf('/\\b(who is|who was)\\b/i.test(query)');

    assert.ok(
      ourGuardIdx !== -1 && entityReturnIdx !== -1 && ourGuardIdx < entityReturnIdx,
      'N-010 FAIL: The /\\bour\\b/ guard must be declared before the entity-pattern return block ' +
      'so it short-circuits before hasProperNouns() is evaluated.'
    );
  });

  it('N-011: isPersonalMemoryRecall contains organizational context patterns', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    const blockStart = src.indexOf('const isPersonalMemoryRecall');
    const blockEnd   = src.indexOf(');', blockStart) + 2;
    assert.ok(blockStart !== -1, 'N-011 FAIL: isPersonalMemoryRecall block not found');

    const block = src.substring(blockStart, blockEnd);

    // Must reference "our" to catch organizational queries — the regex uses \bour\b or literal "our"
    const hasOurPattern = block.includes('\\bour\\b') || block.includes('of our') || block.includes('status of our');

    assert.ok(
      hasOurPattern,
      'N-011 FAIL: isPersonalMemoryRecall must include organizational "our" patterns. ' +
      '"What is the current status of our network monitoring system" bypasses the personal block ' +
      'and falls through to confidence-based lookup triggers.'
    );
  });

  it('N-012: isFactualEntityQuery returns true for non-possessive entity queries', async () => {
    const moduleUrl = new URL('../../api/core/intelligence/externalLookupEngine.js', import.meta.url);
    const { isFactualEntityQuery } = await import(moduleUrl.href);
    assert.ok(isFactualEntityQuery, 'N-012 FAIL: isFactualEntityQuery not exported');

    const result = isFactualEntityQuery('who is the CEO of Microsoft');

    assert.strictEqual(
      result,
      true,
      'N-012 FAIL: "who is the CEO of Microsoft" must return true so external lookup triggers for real entities.'
    );
  });

  it('N-013: isPersonalMemoryRecall org patterns cover "what is the current status of our" phrasing', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    const blockStart = src.indexOf('const isPersonalMemoryRecall');
    const blockEnd   = src.indexOf(');', blockStart) + 2;
    const block      = src.substring(blockStart, blockEnd);

    // The exact production failure pattern must be covered
    const coversStatusQuery =
      block.includes('current status of our') ||
      block.includes('status of our') ||
      (block.includes('\\bour\\b') && block.includes('system'));

    assert.ok(
      coversStatusQuery,
      'N-013 FAIL: isPersonalMemoryRecall must cover "what is the current status of our [system]" — ' +
      'this is the exact query pattern observed triggering NewsAPI in production.'
    );
  });

  it('N-014: isFactualEntityQuery has "we" possessive guard for organizational first-person queries', () => {
    const src = readRepoFile('api/core/intelligence/externalLookupEngine.js');
    assert.ok(src, 'Could not read api/core/intelligence/externalLookupEngine.js');

    const fnStart = src.indexOf('export function isFactualEntityQuery(');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnBody  = src.substring(fnStart, fnEnd);

    // Should have a guard for possessive "we" (organizational first-person)
    const hasWePattern = fnBody.includes('\\bwe\\b');

    assert.ok(
      hasWePattern,
      'N-014 FAIL: isFactualEntityQuery should include a guard for possessive "we" (organizational ' +
      'first-person) to block queries like "what do we use for monitoring" from triggering external lookup.'
    );
  });

});

describe('N. Issue 3 — Business Validation Must Not Fire on Personal Queries', () => {

  it('N-006: #validateCompliance accepts a query parameter', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // The private method signature must include a 5th parameter (query/message)
    const sigMatch = src.match(/#validateCompliance\s*\([^)]*\)/);
    assert.ok(sigMatch, 'N-006 FAIL: #validateCompliance signature not found');

    const signature = sigMatch[0];
    // Accept any 5th parameter name: query, message, userQuery, rawQuery, etc.
    const paramCount = (signature.match(/,/g) || []).length + 1; // commas + 1
    assert.ok(
      paramCount >= 5,
      `N-006 FAIL: #validateCompliance has only ${paramCount} parameter(s) but needs at least 5 ` +
      'so the personal-query guard can inspect the original user query.'
    );
  });

  it('N-007: #validateCompliance call site passes message as 5th argument', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the call site and verify it passes a 5th argument (message)
    const callIdx = src.indexOf('#validateCompliance(');
    assert.ok(callIdx !== -1, 'N-007 FAIL: #validateCompliance call not found');

    const callEnd = src.indexOf(');', callIdx) + 2;
    const callBlock = src.substring(callIdx, callEnd);
    const argCount = (callBlock.match(/,/g) || []).length + 1;

    assert.ok(
      argCount >= 5,
      `N-007 FAIL: #validateCompliance is called with only ${argCount} argument(s). ` +
      'The 5th argument (message) is required for the personal-query guard.'
    );
  });

  it('N-008: business_validation check is gated by personal query detection', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the #validateCompliance method body
    const methodStart = src.indexOf('async #validateCompliance(');
    const methodEnd   = src.indexOf('\n  }', methodStart + 10) + 4;
    assert.ok(methodStart !== -1, 'N-008 FAIL: #validateCompliance method not found');

    const methodBody = src.substring(methodStart, methodEnd);

    // The personal-query guard must exist AND come before the business_validation block
    const guardIdx      = methodBody.indexOf('isPersonalQuery');
    const bizValidIdx   = methodBody.indexOf("mode === \"business_validation\"");

    assert.ok(
      guardIdx !== -1,
      'N-008 FAIL: isPersonalQuery variable not found inside #validateCompliance. ' +
      'Personal queries (e.g. "what are my pets names") in business_validation mode ' +
      'will be incorrectly flagged for missing risk/business-impact language.'
    );

    assert.ok(
      guardIdx < bizValidIdx,
      'N-008 FAIL: isPersonalQuery guard must be declared BEFORE the business_validation check ' +
      'so it can be used to skip that check for personal queries.'
    );
  });

});

// ============================================================
// SECTION P: INTELLIGENT MODEL ROUTING — GPT-4o GUARDS
// Ensures medium_complexity queries route to GPT-4o and that
// high_stakes / vault / Claude escalation remain unchanged.
// ============================================================

describe('P. Intelligent Model Routing — GPT-4o', () => {

  it('P-001: gpt-4o exists in MODEL_COSTS configuration in cost-tracker.js', () => {
    const costTracker = readRepoFile('api/utils/cost-tracker.js');
    assert.ok(costTracker, 'Could not read api/utils/cost-tracker.js');

    assert.ok(
      costTracker.includes('"gpt-4o"') || costTracker.includes("'gpt-4o'"),
      'P-001 FAIL: "gpt-4o" is not present in api/utils/cost-tracker.js MODEL_COSTS. ' +
      'GPT-4o cost tracking will fall back to incorrect pricing.'
    );
  });

  it('P-002: medium_complexity routing logic references gpt-4o in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The routing must check for medium_complexity classification AND associate it with gpt-4o
    const hasMediumComplexityGpt4o = (
      orch.includes('medium_complexity') &&
      (orch.includes('"gpt-4o"') || orch.includes("'gpt-4o'") || orch.includes('useGpt4o'))
    );

    assert.ok(
      hasMediumComplexityGpt4o,
      'P-002 FAIL: orchestrator.js does not contain medium_complexity routing to gpt-4o. ' +
      'medium_complexity queries will continue routing to gpt-4 instead of the faster, cheaper gpt-4o.'
    );
  });

  it('P-003: high_stakes queries still route to Claude (GPT-4 minimum)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The high_stakes check (PRIORITY 0) must set useClaude = true AND appear
    // before the medium_complexity GPT-4o routing (PRIORITY 4) in the source file.
    // We use the actual conditional expression as the index marker (not a log string).
    const highStakesIdx = orch.indexOf('phase4Metadata?.high_stakes?.isHighStakes');
    const mediumComplexityIdx = orch.indexOf("queryTier === 'medium_complexity'");

    assert.ok(
      highStakesIdx !== -1,
      'P-003 FAIL: high_stakes escalation block (phase4Metadata?.high_stakes?.isHighStakes) ' +
      'is missing from orchestrator.js. High-stakes medical/legal/financial queries may not escalate to Claude.'
    );

    assert.ok(
      mediumComplexityIdx !== -1,
      'P-003 FAIL: medium_complexity GPT-4o routing block is missing from orchestrator.js.'
    );

    assert.ok(
      highStakesIdx < mediumComplexityIdx,
      'P-003 FAIL: high_stakes escalation must appear BEFORE medium_complexity GPT-4o routing. ' +
      'High-stakes queries may incorrectly route to GPT-4o instead of Claude.'
    );
  });

  it('P-004: Claude escalation on payload overflow still present', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The escalation must set useClaude = true when payload exceeds model limit
    const hasPayloadOverflowEscalation = (
      orch.includes('escalatedDueToPayloadSize') &&
      orch.includes('payload_exceeds_') &&
      orch.includes('useClaude = true')
    );

    assert.ok(
      hasPayloadOverflowEscalation,
      'P-004 FAIL: Payload overflow escalation to Claude is missing in orchestrator.js. ' +
      'Large payloads may crash GPT-4o/GPT-4 instead of safely escalating to Claude.'
    );
  });

  it('P-005: vault query routing unchanged — vault presence still routes to Claude', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The vault routing check must set useClaude = true when vault is present in site_monkeys mode.
    // Check for the key components: vault_access reason and context.vault condition with site_monkeys mode.
    const hasVaultReason = orch.includes('vault_access');
    const hasVaultCondition = orch.includes('context.vault') && orch.includes('site_monkeys');

    assert.ok(
      hasVaultReason && hasVaultCondition,
      'P-005 FAIL: Vault query routing to Claude is missing or changed in orchestrator.js. ' +
      'Vault/Site Monkeys queries must always route to Claude to maintain content isolation.'
    );
  });

});

console.log('✅ Tier 1 Code Guards loaded (ESM-safe, pure file scanning, $0 cost)');

// ============================================================
// SECTION Q: MEMORY RELEVANCE THRESHOLD (Issue #4)
// Ensures only genuinely relevant memories are injected.
// Raising the minimum similarity threshold eliminates 1,200–1,750
// tokens of irrelevant context per prompt while preserving
// safety-critical memories via the importance-based bypass.
// ============================================================

describe('Q. Memory Relevance Threshold Guards', () => {

  it('Q-001: RETRIEVAL_CONFIG defines minSimilarity as a numeric value', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    const hasNumericThreshold = /minSimilarity:\s*0\.\d+/.test(retrieval);
    assert.ok(
      hasNumericThreshold,
      'Q-001 FAIL: RETRIEVAL_CONFIG.minSimilarity is not defined as a numeric value in ' +
      'api/services/semantic-retrieval.js. The field must exist as a decimal number (e.g. 0.35) ' +
      'to gate which memories are injected into each prompt.'
    );
  });

  it('Q-002: minSimilarity threshold is higher than the previous baseline of 0.20', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    const match = retrieval.match(/minSimilarity:\s*(0\.\d+)/);
    assert.ok(
      match,
      'Q-002 FAIL: Could not parse minSimilarity value from RETRIEVAL_CONFIG in ' +
      'api/services/semantic-retrieval.js.'
    );

    const threshold = parseFloat(match[1]);
    assert.ok(
      threshold > 0.20,
      `Q-002 FAIL: minSimilarity is ${threshold} — must be greater than the previous baseline of 0.20. ` +
      'A threshold of 0.20 allowed up to 230 rows of low-relevance memories to be injected on ' +
      'every query, adding 1,200–1,750 tokens of noise. Raise to at least 0.35.'
    );
  });

  it('Q-003: filtering logic applies effectiveMinSimilarity before memory injection', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    const hasFilterWithThreshold = retrieval.includes('m.similarity >= effectiveMinSimilarity');
    assert.ok(
      hasFilterWithThreshold,
      'Q-003 FAIL: The filter expression "m.similarity >= effectiveMinSimilarity" is missing from ' +
      'api/services/semantic-retrieval.js. Without this gate, all candidates regardless of similarity ' +
      'score are injected into every prompt.'
    );
  });

  it('Q-004: safety-critical memories (relevance_score >= 0.90) bypass the threshold', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    // The filter that applies effectiveMinSimilarity must also allow memories with a high
    // relevance_score (>= 0.90) to pass through regardless of cosine similarity.
    // Verify: the filter line that references effectiveMinSimilarity also references
    // relevance_score and the 0.90 threshold so safety-critical memories (allergy, medication)
    // are never silently blocked after the threshold was raised.
    const filterIdx = retrieval.indexOf('m.similarity >= effectiveMinSimilarity');
    assert.ok(
      filterIdx !== -1,
      'Q-004 FAIL: Could not locate the effectiveMinSimilarity filter expression.'
    );

    // Inspect the 200 characters surrounding the filter for the bypass markers
    const filterContext = retrieval.substring(filterIdx, filterIdx + 200);
    const hasBypass =
      filterContext.includes('relevance_score') &&
      filterContext.includes('0.90');

    assert.ok(
      hasBypass,
      'Q-004 FAIL: The similarity filter does not include a bypass for safety-critical memories ' +
      '(relevance_score >= 0.90). After raising the similarity threshold, allergy and medication ' +
      'memories with low cosine similarity (e.g. 0.15) would be incorrectly blocked from injection. ' +
      'Fix: add "|| parseFloat(m.relevance_score || 0) >= 0.90" (or equivalent) to the filter expression.'
    );
  });

});

// ============================================================
// SECTION R: SYSTEM PIPELINE AUDIT
// Six-area investigation verifying that each critical pipeline
// is structurally intact.  Tests are static file scans ($0 cost).
//
// Area 1: Document injection pipeline
// Area 2: Vault content pipeline
// Area 3: Claude escalation on large payload
// Area 4: High-stakes domain detection (medical / legal)
// Area 5: Session context (multi-turn conversation history)
// Area 6: Context source prioritisation (document > memory)
// ============================================================

describe('R. System Pipeline Audit — Area 1: Document Injection', () => {

  it('R-001: #loadDocumentContext method exists in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('#loadDocumentContext'),
      'R-001 FAIL: "#loadDocumentContext" method is missing from orchestrator.js. ' +
      'Uploaded document content will never be loaded for injection into AI prompts.'
    );
  });

  it('R-002: document gating checks refersToDocument, hasDocVerb, and uploadedRecently', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    const hasRefersCheck = orch.includes('refersToDocument');
    const hasDocVerbCheck = orch.includes('hasDocVerb');
    const hasUploadedRecentlyCheck = orch.includes('uploadedRecently');

    assert.ok(
      hasRefersCheck && hasDocVerbCheck && hasUploadedRecentlyCheck,
      'R-002 FAIL: Document injection gating is incomplete. ' +
      `Missing: ${[
        !hasRefersCheck && 'refersToDocument',
        !hasDocVerbCheck && 'hasDocVerb',
        !hasUploadedRecentlyCheck && 'uploadedRecently'
      ].filter(Boolean).join(', ')}. ` +
      'Without these checks, documents may be injected on unrelated queries wasting tokens.'
    );
  });

  it('R-003: document enforcement instruction present in #buildContextString', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('YOU MUST USE THIS DOCUMENT CONTENT'),
      'R-003 FAIL: Document enforcement instruction "YOU MUST USE THIS DOCUMENT CONTENT" is missing ' +
      'from #buildContextString in orchestrator.js. The AI may ignore uploaded document content.'
    );
  });

  it('R-004: contextString containing document is included in AI messages', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // Both Claude and GPT paths must include contextString in the message payload
    const hasClaudeContextStr = orch.includes('contextString') &&
      orch.includes('"claude-sonnet-4-20250514"');
    const hasGptContextStr = orch.includes('externalContext}${contextString}');
    assert.ok(
      hasClaudeContextStr && hasGptContextStr,
      'R-004 FAIL: contextString (which carries document content) is not correctly included in ' +
      'AI message payloads. Check #routeToAI in orchestrator.js for both Claude and GPT paths.'
    );
  });

});

describe('R. System Pipeline Audit — Area 2: Vault Content Pipeline', () => {

  it('R-005: #loadVaultContext method exists in orchestrator', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('#loadVaultContext'),
      'R-005 FAIL: "#loadVaultContext" method is missing from orchestrator.js. ' +
      'Site Monkeys vault content will never be loaded.'
    );
  });

  it('R-006: #selectRelevantVaultSections method exists for intelligent vault selection', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('#selectRelevantVaultSections'),
      'R-006 FAIL: "#selectRelevantVaultSections" method is missing from orchestrator.js. ' +
      'The full vault will be injected without intelligent selection, wasting tokens.'
    );
  });

  it('R-007: vault injected as PRIMARY context with SITE MONKEYS VAULT header', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('SITE MONKEYS VAULT'),
      'R-007 FAIL: Vault primary context header "SITE MONKEYS VAULT" is missing from ' +
      '#buildContextString in orchestrator.js. Vault content may not be clearly labelled for the AI.'
    );
  });

  it('R-008: vault presence routes to Claude in site_monkeys mode (vault_access reason)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    const hasVaultAccess = orch.includes("vault_access");
    const hasVaultClaudeRoute = orch.includes('context.vault') && orch.includes('site_monkeys');
    assert.ok(
      hasVaultAccess && hasVaultClaudeRoute,
      'R-008 FAIL: Vault-to-Claude routing is broken. ' +
      'Vault queries in site_monkeys mode must always route to Claude (200K context window).'
    );
  });

  it('R-009: memory injection in no-vault section is guarded when vault and documents coexist', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    // The vault path (if context.vault) falls through when documents are also present.
    // The no-vault section that follows must guard its memory injection with !context.vault
    // to prevent duplicate memory injection when vault + documents are both active.
    const vaultFallthroughIdx = orch.indexOf('// Otherwise, fall through to add document content alongside vault');
    assert.ok(
      vaultFallthroughIdx !== -1,
      'R-009 FAIL: Could not locate vault fall-through comment in #buildContextString. ' +
      'The vault + document code path may have been restructured.'
    );

    // Find where memory is injected in the no-vault section (after the vault block closes)
    const noVaultSectionStart = orch.indexOf('// ========== FALLBACK: NO VAULT', vaultFallthroughIdx);
    assert.ok(
      noVaultSectionStart !== -1,
      'R-009 FAIL: Could not locate "FALLBACK: NO VAULT" section after vault fall-through.'
    );

    // The memory injection in the no-vault section must be guarded against vault being present
    // Find the memory injection line ("PERSISTENT MEMORY CONTEXT") in the no-vault section
    const noVaultMemoryIdx = orch.indexOf('PERSISTENT MEMORY CONTEXT', noVaultSectionStart);
    assert.ok(
      noVaultMemoryIdx !== -1,
      'R-009 FAIL: Could not find "PERSISTENT MEMORY CONTEXT" injection in the no-vault section.'
    );

    // The guard must appear between the no-vault section start and the no-vault memory injection
    const sectionSlice = orch.substring(noVaultSectionStart, noVaultMemoryIdx);
    const hasVaultGuard = sectionSlice.includes('!context.vault');
    assert.ok(
      hasVaultGuard,
      'R-009 FAIL: Memory injection in the no-vault section of #buildContextString is NOT guarded ' +
      'with "!context.vault". When vault + documents are both present, memory is injected twice: ' +
      'once in the vault path and again in the no-vault fallthrough. This doubles the memory token ' +
      'budget and produces misleading "No vault available" log output. ' +
      'Fix: wrap the no-vault memory injection with `if (!context.vault) { ... }`.'
    );
  });

});

describe('R. System Pipeline Audit — Area 3: Claude Escalation on Large Payload', () => {

  it('R-010: full payload token estimate includes system prompt, context, external, message, history', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    const hasSystemEst = orch.includes('estimatedSystemPromptTokens');
    const hasContextEst = orch.includes('estimatedContextTokens');
    const hasExternalEst = orch.includes('estimatedExternalTokens');
    const hasMessageEst = orch.includes('estimatedMessageTokens');
    const hasHistoryEst = orch.includes('estimatedHistoryTokens');

    assert.ok(
      hasSystemEst && hasContextEst && hasExternalEst && hasMessageEst && hasHistoryEst,
      'R-010 FAIL: Full payload token estimate is incomplete. ' +
      `Missing: ${[
        !hasSystemEst && 'estimatedSystemPromptTokens',
        !hasContextEst && 'estimatedContextTokens',
        !hasExternalEst && 'estimatedExternalTokens',
        !hasMessageEst && 'estimatedMessageTokens',
        !hasHistoryEst && 'estimatedHistoryTokens'
      ].filter(Boolean).join(', ')}. ` +
      'Without a complete token estimate, payload-overflow escalation to Claude may fail.'
    );
  });

  it('R-011: payload overflow sets useClaude = true and escalatedDueToPayloadSize = true', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    const hasEscalatedFlag = orch.includes('escalatedDueToPayloadSize = true');
    const hasUseClaude = orch.includes('useClaude = true');

    assert.ok(
      hasEscalatedFlag && hasUseClaude,
      'R-011 FAIL: Payload overflow escalation is missing. ' +
      'Large payloads will overflow the GPT context window instead of safely routing to Claude.'
    );
  });

  it('R-012: payload overflow escalation overrides user_declined_claude', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    // The payload overflow section must filter out 'user_declined_claude' from routing reasons
    const hasOverrideDecline = orch.includes("routingReason.filter(r => r !== 'user_declined_claude')");
    assert.ok(
      hasOverrideDecline,
      'R-012 FAIL: Payload overflow escalation does not override user_declined_claude. ' +
      'Users who declined Claude will still have their GPT request fail when the payload is too large.'
    );
  });

});

describe('R. System Pipeline Audit — Area 4: High-Stakes Domain Detection', () => {

  it('R-013: HIGH_STAKES_DOMAINS constant exists with medical and legal patterns', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'Could not read api/core/intelligence/truthTypeDetector.js');

    const hasMedical = detector.includes('MEDICAL');
    const hasLegal = detector.includes('LEGAL');
    const hasHighStakes = detector.includes('HIGH_STAKES_DOMAINS');

    assert.ok(
      hasMedical && hasLegal && hasHighStakes,
      'R-013 FAIL: HIGH_STAKES_DOMAINS is missing or does not include MEDICAL/LEGAL domains in ' +
      'truthTypeDetector.js. Medical and legal queries will not escalate to Claude.'
    );
  });

  it('R-014: detectHighStakesDomain function is exported from truthTypeDetector', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'Could not read api/core/intelligence/truthTypeDetector.js');
    assert.ok(
      detector.includes('export function detectHighStakesDomain'),
      'R-014 FAIL: "detectHighStakesDomain" is not exported from truthTypeDetector.js. ' +
      'High-stakes detection results cannot be consumed by the orchestrator.'
    );
  });

  it('R-015: PRIORITY 0 routing escalates high_stakes queries to Claude before all other checks', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    const highStakesIdx = orch.indexOf('phase4Metadata?.high_stakes?.isHighStakes');
    const vaultPriority1Idx = orch.indexOf('PRIORITY 1: Vault presence');
    const mediumComplexityIdx = orch.indexOf("queryTier === 'medium_complexity'");

    assert.ok(highStakesIdx !== -1, 'R-015 FAIL: PRIORITY 0 high_stakes check missing from orchestrator.');
    assert.ok(vaultPriority1Idx !== -1, 'R-015 FAIL: PRIORITY 1 vault check missing from orchestrator.');
    assert.ok(
      highStakesIdx < vaultPriority1Idx && highStakesIdx < mediumComplexityIdx,
      'R-015 FAIL: high_stakes escalation (PRIORITY 0) must appear BEFORE vault (PRIORITY 1) ' +
      'and medium_complexity routing in orchestrator.js. High-stakes queries may route to GPT instead of Claude.'
    );
  });

  it('R-016: high_stakes routing sets isSafetyCritical = true (bypasses user confirmation)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('isSafetyCritical = true'),
      'R-016 FAIL: "isSafetyCritical = true" is missing from orchestrator.js. ' +
      'High-stakes medical/legal queries will prompt the user for Claude confirmation ' +
      'instead of escalating automatically.'
    );
  });

});

describe('R. System Pipeline Audit — Area 5: Session Context (Multi-Turn History)', () => {

  it('R-017: addConversationTurn method exists in session-manager.js', () => {
    const sm = readRepoFile('api/lib/session-manager.js');
    assert.ok(sm, 'Could not read api/lib/session-manager.js');
    assert.ok(
      sm.includes('addConversationTurn'),
      'R-017 FAIL: "addConversationTurn" method is missing from session-manager.js. ' +
      'Conversation turns will not be persisted and multi-turn context will break.'
    );
  });

  it('R-018: getConversationHistory method exists in session-manager.js', () => {
    const sm = readRepoFile('api/lib/session-manager.js');
    assert.ok(sm, 'Could not read api/lib/session-manager.js');
    assert.ok(
      sm.includes('getConversationHistory'),
      'R-018 FAIL: "getConversationHistory" method is missing from session-manager.js. ' +
      'The server cannot retrieve stored conversation history for multi-turn context.'
    );
  });

  it('R-019: server.js uses session history as effectiveConversationHistory', () => {
    const server = readRepoFile('server.js');
    assert.ok(server, 'Could not read server.js');

    const hasSessionHistory = server.includes('getConversationHistory');
    const hasEffective = server.includes('effectiveConversationHistory');
    const storesUserTurn = server.includes("addConversationTurn(sessionId, 'user'");
    const storesAssistantTurn = server.includes("addConversationTurn(sessionId, 'assistant'");

    assert.ok(
      hasSessionHistory && hasEffective && storesUserTurn && storesAssistantTurn,
      'R-019 FAIL: Session conversation context pipeline is broken in server.js. ' +
      `Missing: ${[
        !hasSessionHistory && 'getConversationHistory call',
        !hasEffective && 'effectiveConversationHistory',
        !storesUserTurn && "addConversationTurn for 'user'",
        !storesAssistantTurn && "addConversationTurn for 'assistant'"
      ].filter(Boolean).join(', ')}.`
    );
  });

  it('R-020: conversation history is sliced to last 5 exchanges before AI calls', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('conversationHistory.slice(-5)'),
      'R-020 FAIL: "conversationHistory.slice(-5)" is missing from orchestrator.js. ' +
      'The full conversation history (unbounded) will be passed to AI models, ' +
      'causing context window overflow on long conversations.'
    );
  });

});

describe('R. System Pipeline Audit — Area 6: Context Source Prioritisation', () => {

  it('R-021: vault takes absolute priority over documents and memory in context string', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    // In #buildContextString, vault section must appear BEFORE document section
    const vaultHeaderIdx = orch.indexOf('SITE MONKEYS VAULT - COMPLETE BUSINESS KNOWLEDGE BASE');
    const docHeaderIdx = orch.indexOf('CURRENT DOCUMENT (uploaded just now)');

    assert.ok(vaultHeaderIdx !== -1, 'R-021 FAIL: Vault header not found in #buildContextString.');
    assert.ok(docHeaderIdx !== -1, 'R-021 FAIL: Document header not found in #buildContextString.');
    assert.ok(
      vaultHeaderIdx < docHeaderIdx,
      'R-021 FAIL: Vault header appears AFTER document header in #buildContextString. ' +
      'Vault must always take priority as PRIMARY context in site_monkeys mode.'
    );
  });

  it('R-022: document enforcement instruction exists to prioritise document over stale memory', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('Do NOT reference previous documents from memory unless explicitly asked'),
      'R-022 FAIL: Document priority instruction is missing from #buildContextString. ' +
      'The AI may incorrectly draw from stale memory instead of the uploaded document.'
    );
  });

  it('R-023: document gating prevents injection when query does not reference the document', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');

    // The gating must set effectiveDocumentData = null when no document reference is found
    const hasNullGate = orch.includes('effectiveDocumentData = null');
    assert.ok(
      hasNullGate,
      'R-023 FAIL: Document gating "effectiveDocumentData = null" is missing from orchestrator.js. ' +
      'Documents will be injected on every query regardless of relevance, wasting tokens.'
    );
  });

  it('R-024: recently-uploaded documents bypass the gating check (90-second window)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('90000'),
      'R-024 FAIL: The 90-second (90000 ms) upload recency window is missing from orchestrator.js. ' +
      'Documents uploaded just moments before a query will be silently dropped even when the ' +
      'user clearly intends to discuss them.'
    );
  });

});

// ============================================================
// SECTION S: CONFIDENCE SCORING TOGGLE
// S-001 through S-006 — validates the showConfidence flag wiring
// and genuine confidence metadata calculation.
// ============================================================

describe('S. Confidence Scoring Toggle', () => {

  it('S-001: showConfidence flag is set on context in orchestrator.js', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('context.showConfidence'),
      'S-001 FAIL: context.showConfidence is not assigned in orchestrator.js. ' +
      'The flag must be copied from requestData onto the context object so personality frameworks can read it.'
    );
  });

  it('S-002: eli_framework confidence block is gated on context.showConfidence', () => {
    const eli = readRepoFile('api/core/personalities/eli_framework.js');
    assert.ok(eli, 'Could not read api/core/personalities/eli_framework.js');
    assert.ok(
      eli.includes('context?.showConfidence === true') || eli.includes("context.showConfidence === true"),
      'S-002 FAIL: eli_framework.js does not gate the confidence block on context.showConfidence === true. ' +
      'Confidence metadata must only be calculated and returned when the user has opted in.'
    );
  });

  it('S-003: roxy_framework confidence block is gated on context.showConfidence', () => {
    const roxy = readRepoFile('api/core/personalities/roxy_framework.js');
    assert.ok(roxy, 'Could not read api/core/personalities/roxy_framework.js');
    assert.ok(
      roxy.includes('context?.showConfidence === true') || roxy.includes("context.showConfidence === true"),
      'S-003 FAIL: roxy_framework.js does not gate the confidence block on context.showConfidence === true. ' +
      'Confidence metadata must only be calculated and returned when the user has opted in.'
    );
  });

  it('S-004: calculateConfidence function exists in confidence_calculator.js and uses truthType as input', () => {
    const calc = readRepoFile('api/core/personalities/confidence_calculator.js');
    assert.ok(calc, 'S-004 FAIL: api/core/personalities/confidence_calculator.js is missing.');
    assert.ok(
      calc.includes('export function calculateConfidence'),
      'S-004 FAIL: calculateConfidence is not exported from confidence_calculator.js.'
    );
    assert.ok(
      calc.includes("truthType === 'PERMANENT'") || calc.includes('truthType === "PERMANENT"'),
      'S-004 FAIL: calculateConfidence does not branch on truthType. ' +
      'The function must use truthType (PERMANENT/SEMI_STABLE/VOLATILE) as the primary input.'
    );
  });

  it('S-005: confidence metadata returned by orchestrator contains score and reason', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('confidenceMetadata'),
      'S-005 FAIL: orchestrator.js does not reference confidenceMetadata. ' +
      'The confidence object (score + reason) must be surfaced in the API response when the toggle is on.'
    );
    // Verify the top-level confidence field is present in the return object
    assert.ok(
      orch.includes("confidence: personalityResponse.confidenceMetadata"),
      'S-005 FAIL: The top-level "confidence" field is not set from personalityResponse.confidenceMetadata ' +
      'in the orchestrator return object. Frontend cannot read confidence metadata.'
    );
  });

  it('S-006: confidence metadata only calculated when showConfidence is true', () => {
    const roxy = readRepoFile('api/core/personalities/roxy_framework.js');
    assert.ok(roxy, 'Could not read roxy_framework.js');
    assert.ok(
      roxy.includes('context?.showConfidence === true'),
      'S-006 FAIL: roxy_framework.js must gate confidence on context.showConfidence === true'
    );
  });

});

// ============================================================
// SECTION U: MEMORY SAFETY BYPASS — HEALTH CATEGORY SCOPING
// Ensures the relevance_score >= 0.90 bypass in the similarity
// filter is restricted to health/safety categories only.
// Non-health memories (e.g. Apple, Amazon) must never bypass
// regardless of how high their relevance_score grows through
// repeated access boosts.
// ============================================================

describe('U. Memory Safety Bypass — Health Category Scoping', () => {

  it('U-001: safety bypass filter is scoped to SAFETY_BYPASS_CATEGORIES (health memories still bypass)', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    // The bypass must check the memory's category so only health/safety memories
    // with relevance_score >= 0.90 are allowed through.
    const filterIdx = retrieval.indexOf('m.similarity >= effectiveMinSimilarity');
    assert.ok(filterIdx !== -1, 'U-001 FAIL: effectiveMinSimilarity filter not found');

    const filterContext = retrieval.substring(filterIdx, filterIdx + 300);
    assert.ok(
      filterContext.includes('SAFETY_BYPASS_CATEGORIES'),
      'U-001 FAIL: Safety bypass filter does not check SAFETY_BYPASS_CATEGORIES. ' +
      'Health memories (allergy, medication) must still bypass the threshold, ' +
      'but the bypass must be gated on the memory\'s category.'
    );
  });

  it('U-002: non-health memories are blocked from bypassing similarity threshold', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    // The bypass must NOT be a plain relevance_score >= 0.90 check without a category guard.
    // Verify the filter includes SAFETY_BYPASS_CATEGORIES (the category guard) alongside the threshold.
    const filterIdx = retrieval.indexOf('m.similarity >= effectiveMinSimilarity');
    assert.ok(filterIdx !== -1, 'U-002 FAIL: effectiveMinSimilarity filter not found');

    const filterContext = retrieval.substring(filterIdx, filterIdx + 300);
    const hasCategoryGuard = filterContext.includes('SAFETY_BYPASS_CATEGORIES');
    const hasThreshold = filterContext.includes('0.90');

    assert.ok(
      hasCategoryGuard && hasThreshold,
      'U-002 FAIL: Filter does not combine a 0.90 threshold with SAFETY_BYPASS_CATEGORIES. ' +
      'Non-health memories (Apple, Amazon) will bypass the threshold after accumulating access boosts.'
    );

    // Extra guard: the bypass expression must not be a plain OR without the category check.
    // A plain "|| parseFloat(m.relevance_score || 0) >= 0.90)" (without SAFETY_BYPASS_CATEGORIES)
    // in the filter context would indicate the fix was reverted.
    const bypassWithoutCategory =
      filterContext.includes('relevance_score || 0) >= 0.90)') &&
      !filterContext.includes('SAFETY_BYPASS_CATEGORIES');
    assert.ok(
      !bypassWithoutCategory,
      'U-002 FAIL: Filter still uses "|| relevance_score >= 0.90" without a category check. ' +
      'Non-health memories (Apple, Amazon) will bypass the threshold after accumulating access boosts.'
    );
  });

  it('U-003: boostExistingMemory caps non-health memories at 0.85', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read api/memory/intelligent-storage.js');

    assert.ok(
      storage.includes('0.85'),
      'U-003 FAIL: boostExistingMemory does not contain a 0.85 ceiling. ' +
      'Non-health memories must be capped at 0.85 to prevent them from reaching ' +
      'the 0.90 safety bypass threshold through repeated access.'
    );

    assert.ok(
      storage.includes('SAFETY_BYPASS_CATEGORIES'),
      'U-003 FAIL: SAFETY_BYPASS_CATEGORIES is not referenced in intelligent-storage.js. ' +
      'boostExistingMemory must use this set to determine the correct boost ceiling.'
    );
  });

  it('U-004: boostExistingMemory still allows health memories to reach 1.0', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'Could not read api/memory/intelligent-storage.js');

    // The boost function must still use 1.0 as the ceiling for health categories.
    const boostFnIdx = storage.indexOf('async boostExistingMemory(');
    assert.ok(boostFnIdx !== -1, 'U-004 FAIL: boostExistingMemory function not found');

    const fnContext = storage.substring(boostFnIdx, boostFnIdx + 1200);
    assert.ok(
      fnContext.includes('1.0'),
      'U-004 FAIL: boostExistingMemory does not reference 1.0 ceiling. ' +
      'Health memories (allergy, medication) must still be boostable to 1.0.'
    );
  });

  it('U-005: SAFETY_BYPASS_CATEGORIES in semantic-retrieval.js does not include generic business categories', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    // Business/general categories must NOT be in SAFETY_BYPASS_CATEGORIES.
    const bypassIdx = retrieval.indexOf('SAFETY_BYPASS_CATEGORIES = new Set(');
    assert.ok(bypassIdx !== -1, 'U-005 FAIL: SAFETY_BYPASS_CATEGORIES set not found in semantic-retrieval.js');

    const setContext = retrieval.substring(bypassIdx, bypassIdx + 400);
    const forbiddenCategories = ['business', 'companies', 'finance', 'technology', 'general'];
    for (const cat of forbiddenCategories) {
      assert.ok(
        !setContext.includes(`'${cat}'`) && !setContext.includes(`"${cat}"`),
        `U-005 FAIL: SAFETY_BYPASS_CATEGORIES includes "${cat}" — only health/safety ` +
        'categories should appear in this set.'
      );
    }
  });

  it('U-006: SAFETY_BYPASS_CATEGORIES includes health_wellness so allergy/medication memories surface correctly', () => {
    const retrieval = readRepoFile('api/services/semantic-retrieval.js');
    assert.ok(retrieval, 'Could not read api/services/semantic-retrieval.js');

    const bypassIdx = retrieval.indexOf('SAFETY_BYPASS_CATEGORIES = new Set(');
    assert.ok(bypassIdx !== -1, 'U-006 FAIL: SAFETY_BYPASS_CATEGORIES set not found in semantic-retrieval.js');

    const setContext = retrieval.substring(bypassIdx, bypassIdx + 300);
    assert.ok(
      setContext.includes('health_wellness'),
      'U-006 FAIL: SAFETY_BYPASS_CATEGORIES does not include "health_wellness". ' +
      'Allergy and medication memories stored under health_wellness would no longer ' +
      'bypass the similarity threshold on health-related queries.'
    );
  });

});

describe('V. Confidence Scoring — Memory Source Detection and PERMANENT Pattern Coverage', () => {
  // V-001: "what are" queries classified PERMANENT
  it('V-001: PERMANENT_PATTERNS includes "what are" alongside "what is"', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      detector.includes('what are'),
      'V-001 FAIL: PERMANENT_PATTERNS does not include "what are". ' +
      'Queries like "what are the Ninja Turtles names" fall through to AMBIGUOUS → SEMI_STABLE → 62%.'
    );
  });

  // V-002: "what are the Ninja Turtles names" scores 90%+ not 62%
  it('V-002: calculateConfidence returns >= 0.90 for PERMANENT truth type (no lookup)', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, null, null);
    assert.ok(
      score >= 0.90,
      `V-002 FAIL: calculateConfidence for PERMANENT returned ${score} — expected >= 0.90. ` +
      '"What are the Ninja Turtles names" must not score 62%.'
    );
  });

  // V-003: Memory-sourced flag is only set for personal queries with retrieved memories
  it('V-003: orchestrator gates memory_sourced on personal "my" queries plus hasMemory', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('const isPersonalMemoryQuery') &&
      orch.includes('\\bmy\\b') &&
      orch.includes('memoryContext') &&
      orch.includes('hasMemory'),
      'V-003 FAIL: orchestrator must gate memory_sourced on personal "my" queries AND memoryContext.hasMemory.'
    );
  });

  // V-004: phase4Metadata.memory_sourced set only inside isPersonalMemoryQuery branch
  it('V-004: orchestrator sets memory_sourced only when isPersonalMemoryQuery is true', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('if (isPersonalMemoryQuery)') &&
      orch.includes('phase4Metadata.memory_sourced = true'),
      'V-004 FAIL: phase4Metadata.memory_sourced must be set inside isPersonalMemoryQuery guard.'
    );
  });

  // V-005: Non-memory training knowledge reason unchanged
  it('V-005: buildConfidenceReason returns original reason when memory_sourced is not set', async () => {
    const { buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');
    const reason = buildConfidenceReason('SEMI_STABLE', 0, false, 0.65, null);
    assert.strictEqual(
      reason,
      'based on training knowledge — may not reflect latest',
      `V-005 FAIL: buildConfidenceReason changed non-memory reason — expected ` +
      '"based on training knowledge — may not reflect latest", got "${reason}".'
    );
  });

  // V-006: PERMANENT facts still score 97%
  it('V-006: calculateConfidence still returns 0.97 for PERMANENT without memory flag', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, null, null);
    assert.strictEqual(
      score,
      0.97,
      `V-006 FAIL: calculateConfidence returned ${score} for PERMANENT — expected 0.97.`
    );
  });

  // V-007: buildConfidenceMetadata passes phase4Metadata to score and reason functions
  it('V-007: buildConfidenceMetadata produces score=95 and memory reason for memory_sourced=true', async () => {
    const { buildConfidenceMetadata } = await import('../../api/core/personalities/confidence_calculator.js');
    const result = buildConfidenceMetadata({ memory_sourced: true, sources_used: 0 });
    assert.strictEqual(
      result.score,
      95,
      `V-007 FAIL: buildConfidenceMetadata score=${result.score} — expected 95 for memory_sourced=true.`
    );
    assert.strictEqual(
      result.reason,
      'confirmed from your personal records',
      `V-007 FAIL: buildConfidenceMetadata reason="${result.reason}" — ` +
      'expected "confirmed from your personal records" for memory_sourced=true.'
    );
  });
});

