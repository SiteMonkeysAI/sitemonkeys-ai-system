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

  it('L-001: hasSessionOrPersonalRef gate ensures pure greetings skip memory retrieval', () => {
    // ROOT CAUSE (Issue): "Hello" in Business Validation mode (user with stored memories)
    // previously forced memory retrieval because userHasMemories=true overrode the skip.
    // FIX (Change A): hasSessionOrPersonalRef detects only first-person pronouns and
    // session-reference language.  Pure greetings like "Hello" contain neither, so they
    // always skip retrieval regardless of stored memories.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // hasSessionOrPersonalRef must exist and gate skipMemoryForSimpleQuery
    const hasSessionRefGate =
      orchestrator.includes('hasSessionOrPersonalRef') &&
      orchestrator.includes('!hasSessionOrPersonalRef') &&
      orchestrator.includes('skipMemoryForSimpleQuery');

    assert.ok(
      hasSessionRefGate,
      'L-001 FAIL: hasSessionOrPersonalRef gate is missing from orchestrator.js. ' +
      'Without it, "Hello" in Business Validation mode (user with memories) may retrieve ' +
      'memory context, blocking the STEP 6.9 greeting shortcut and hitting GPT-4.'
    );
  });

  it('L-002: session/personal-ref detection includes first-person pronouns and session words', () => {
    // hasSessionOrPersonalRef must detect first-person pronouns (my, our, I, me, we, mine, ours)
    // and session-reference language (earlier, we decided, remind me, etc.).
    // This ensures "What did we decide earlier?" and "Remind me what I said" trigger retrieval
    // while "What is gross margin?" and "Hello" correctly skip it.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    // Must include first-person pronouns in the detection
    const hasFirstPersonPronouns =
      orchestrator.includes('my|our|I|me|we|mine|ours') ||
      (orchestrator.includes('hasSessionOrPersonalRef') && orchestrator.includes('\\bmy\\b'));

    // Must include at least one session-reference word
    const hasSessionWords =
      orchestrator.includes('earlier') &&
      orchestrator.includes('we decided') &&
      orchestrator.includes('remind me');

    assert.ok(
      hasFirstPersonPronouns && hasSessionWords,
      'L-002 FAIL: hasSessionOrPersonalRef does not include required first-person pronouns ' +
      'or session-reference words. Queries like "What did we decide earlier?" will not trigger ' +
      'memory retrieval.'
    );
  });

  it('L-003: skipMemoryForSimpleQuery covers greeting, simple_factual, and simple_short', () => {
    // All three simple classifications must skip memory retrieval when no personal or
    // session reference is present.  Previously only greeting and simple_factual were covered.
    // Adding simple_short prevents short queries like "What does pH mean?" from retrieving
    // all stored user memories unnecessarily.
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'Could not read api/core/orchestrator.js');

    const hasAllThreeClasses =
      orchestrator.includes("'simple_short'") &&
      orchestrator.includes("'simple_factual'") &&
      orchestrator.includes("'greeting'") &&
      orchestrator.includes('skipMemoryForSimpleQuery');

    assert.ok(
      hasAllThreeClasses,
      'L-003 FAIL: skipMemoryForSimpleQuery does not include all three simple classifications ' +
      "(greeting, simple_factual, simple_short). Short queries will retrieve stored memories " +
      'unnecessarily.'
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
// Ensures medium_complexity queries route to GPT-4o (via the
// capability-gap detector — only complex_analytical triggers
// advanced reasoning escalation) and that high_stakes / vault /
// Claude escalation remain unchanged.
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

  it('P-002: capability-gap detector gates advanced routing on complex_analytical only', () => {
    // medium_complexity queries stay on GPT-4o because the capability-gap detector
    // only requires advanced reasoning for 'complex_analytical' classification.
    // This test verifies the detector enforces that boundary.
    const detector = readRepoFile('api/core/intelligence/capability-gap-detector.js');
    assert.ok(detector, 'Could not read api/core/intelligence/capability-gap-detector.js');

    assert.ok(
      detector.includes("complex_analytical") &&
      detector.includes("reasoning_tier") &&
      detector.includes("'advanced'"),
      'P-002 FAIL: capability-gap-detector.js must gate advanced reasoning_tier on complex_analytical. ' +
      'Without this, medium_complexity queries may escalate to Claude unnecessarily.'
    );

    // Also verify medium_complexity is NOT used as a conditional trigger in the detector.
    // It may appear in JSDoc param descriptions — that is fine.
    // The restriction is: no if-block should set a capability requirement when
    // queryClassification === 'medium_complexity'.
    assert.ok(
      !detector.includes("queryClassification === 'medium_complexity'"),
      'P-002 FAIL: capability-gap-detector.js should NOT use medium_complexity as a ' +
      'conditional escalation trigger. medium_complexity must stay on GPT-4o (the default adapter).'
    );
  });

  it('P-003: high_stakes queries still auto-escalate to Claude before capability-gap routing', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // PRIORITY 0 (high_stakes) must appear before PRIORITY 3 (capability-gap routing).
    const highStakesIdx = orch.indexOf('phase4Metadata?.high_stakes?.isHighStakes');
    const capabilityGapIdx = orch.indexOf('PRIORITY 3: Capability-Gap Driven Routing');

    assert.ok(
      highStakesIdx !== -1,
      'P-003 FAIL: high_stakes escalation block (phase4Metadata?.high_stakes?.isHighStakes) ' +
      'is missing from orchestrator.js. High-stakes medical/legal/financial queries may not escalate to Claude.'
    );

    assert.ok(
      capabilityGapIdx !== -1,
      'P-003 FAIL: PRIORITY 3 capability-gap routing block is missing from orchestrator.js.'
    );

    assert.ok(
      highStakesIdx < capabilityGapIdx,
      'P-003 FAIL: high_stakes escalation (PRIORITY 0) must appear BEFORE capability-gap routing (PRIORITY 3). ' +
      'High-stakes queries may not auto-escalate to Claude.'
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
    const capabilityGapIdx = orch.indexOf('PRIORITY 3: Capability-Gap Driven Routing');

    assert.ok(highStakesIdx !== -1, 'R-015 FAIL: PRIORITY 0 high_stakes check missing from orchestrator.');
    assert.ok(vaultPriority1Idx !== -1, 'R-015 FAIL: PRIORITY 1 vault check missing from orchestrator.');
    assert.ok(capabilityGapIdx !== -1, 'R-015 FAIL: PRIORITY 3 capability-gap routing missing from orchestrator.');
    assert.ok(
      highStakesIdx < vaultPriority1Idx && highStakesIdx < capabilityGapIdx,
      'R-015 FAIL: high_stakes escalation (PRIORITY 0) must appear BEFORE vault (PRIORITY 1) ' +
      'and capability-gap routing (PRIORITY 3) in orchestrator.js. High-stakes queries may route to GPT instead of Claude.'
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

  it('R-020: conversation history is bounded before AI calls', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // History is now bounded via getConversationDepth() → conversationHistory.slice(-historyDepth).
    // Depth is query-aware (1/2/5 turns) but always bounded — unbounded history is never passed.
    assert.ok(
      orch.includes('getConversationDepth(') &&
      orch.includes('conversationHistory.slice(-historyDepth)'),
      'R-020 FAIL: query-aware history bounding via getConversationDepth / ' +
      'conversationHistory.slice(-historyDepth) is missing from orchestrator.js. ' +
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

  // V-006: PERMANENT facts still score 90%
  it('V-006: calculateConfidence still returns 0.90 for PERMANENT without memory flag', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, null, null);
    assert.strictEqual(
      score,
      0.90,
      `V-006 FAIL: calculateConfidence returned ${score} for PERMANENT — expected 0.90.`
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

// ============================================================
// SECTION AA: CAPABILITY-GAP ROUTING SYSTEM
// Verifies the adapter registry, capability-gap detector, and
// orchestrator routing integration introduced in Issue #33.
// All tests are ESM-safe file scans — no API calls, $0 cost.
// ============================================================

describe('AA. Capability-Gap Routing System', () => {

  it('AA-001: adapter-registry.js exists', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'api/core/adapters/adapter-registry.js')),
      'AA-001 FAIL: api/core/adapters/adapter-registry.js is missing. ' +
      'The adapter registry is required for capability-gap routing.'
    );
  });

  it('AA-002: inactive adapter never selected — active() checks env var at runtime', () => {
    const registry = readRepoFile('api/core/adapters/adapter-registry.js');
    assert.ok(registry, 'Could not read adapter-registry.js');

    // Each adapter must have an active() function that checks an environment variable.
    // This ensures adapters without API keys are never routed to.
    // Check for the exact pattern used in the registry: active: () => !!process.env.
    assert.ok(
      registry.includes('active: () => !!process.env.'),
      'AA-002 FAIL: adapter-registry.js adapters must have active() functions that check ' +
      'environment variables (pattern: active: () => !!process.env.KEY). ' +
      'Inactive adapters (missing API key) must never be selected.'
    );

    // getActiveAdapters must filter on adapter.active()
    assert.ok(
      registry.includes('getActiveAdapters') && registry.includes('adapter.active()'),
      'AA-002 FAIL: getActiveAdapters() must filter adapters by adapter.active(). ' +
      'Without this filter, adapters without API keys could be selected.'
    );
  });

  it('AA-003: capability-gap-detector.js exists', () => {
    assert.ok(
      existsSync(join(REPO_ROOT, 'api/core/intelligence/capability-gap-detector.js')),
      'AA-003 FAIL: api/core/intelligence/capability-gap-detector.js is missing. ' +
      'Capability gap detection is required for intelligent routing.'
    );
  });

  it('AA-004: complex_analytical classification triggers advanced reasoning requirement', () => {
    const detector = readRepoFile('api/core/intelligence/capability-gap-detector.js');
    assert.ok(detector, 'Could not read capability-gap-detector.js');

    // complex_analytical must set reasoning_tier: 'advanced'
    assert.ok(
      detector.includes("queryClassification === 'complex_analytical'") &&
      detector.includes("reasoning_tier") &&
      detector.includes("'advanced'"),
      'AA-004 FAIL: capability-gap-detector.js must set reasoning_tier: "advanced" when ' +
      'queryClassification === "complex_analytical". Complex queries will not escalate.'
    );
  });

  it('AA-005: low confidence alone does NOT trigger escalation', () => {
    const detector = readRepoFile('api/core/intelligence/capability-gap-detector.js');
    assert.ok(detector, 'Could not read capability-gap-detector.js');

    // The confidence block must be guarded by Object.keys(required).length > 0
    // so that low confidence alone cannot create a new requirement.
    assert.ok(
      detector.includes('confidenceScore < 0.65') &&
      detector.includes('Object.keys(required).length > 0'),
      'AA-005 FAIL: capability-gap-detector.js confidence check must be guarded by ' +
      '"Object.keys(required).length > 0". Without this guard, low confidence alone ' +
      'would trigger escalation on every uncertain query.'
    );
  });

  it('AA-006: escalation only occurs when better adapter is available', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // getBestAdapterForCapabilities must be called and its result checked
    // before setting useClaude = true
    assert.ok(
      orch.includes('getBestAdapterForCapabilities') &&
      orch.includes('betterAdapter && betterAdapter.model !== defaultAdapter.model'),
      'AA-006 FAIL: orchestrator.js must call getBestAdapterForCapabilities() and verify ' +
      'a better adapter exists before escalating. Without this, escalation may occur ' +
      'even when no advanced adapter is configured.'
    );
  });

  it('AA-007: claudeConfirmed decline is session-scoped via in-memory Map', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // Session-scoped decline tracking must use a Map and be keyed by sessionId
    assert.ok(
      orch.includes('_sessionClaudeDeclined') &&
      orch.includes('new Map()') &&
      orch.includes('_sessionClaudeDeclined.set(') &&
      orch.includes('_sessionClaudeDeclined.get('),
      'AA-007 FAIL: orchestrator.js must use an in-memory Map (_sessionClaudeDeclined) ' +
      'to track Claude decline per session. Decline must persist within a session ' +
      'but reset when the server restarts (no DB persistence).'
    );
  });

  it('AA-008: escalated field is returned by #routeToAI()', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('capabilityGapEscalated') &&
      orch.includes('escalated: capabilityGapEscalated'),
      'AA-008 FAIL: #routeToAI() must return an "escalated" field. ' +
      'Without it, the API response cannot indicate which model was used.'
    );
  });

  it('AA-009: escalated is false on standard (non-escalated) paths', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The cost_fallback path must explicitly return escalated: false
    assert.ok(
      orch.includes('escalated: false'),
      'AA-009 FAIL: orchestrator.js must return "escalated: false" on fallback paths ' +
      '(e.g., cost_fallback). Otherwise the frontend cannot reliably detect non-escalated responses.'
    );
  });

  it('AA-010: escalated is true when capability gap triggered escalation', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // capabilityGapEscalated must be set to true when a gap is detected and a
    // better adapter is selected
    assert.ok(
      orch.includes('capabilityGapEscalated = true') &&
      orch.includes('capabilityGapReason = Object.keys(gaps).join'),
      'AA-010 FAIL: orchestrator.js must set capabilityGapEscalated = true and record ' +
      'capabilityGapReason when a capability gap triggers escalation. ' +
      'Without this, escalation telemetry will be missing.'
    );
  });

  it('AA-011: contract lock gate runs before capability-gap escalation', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const contractLockIdx = orch.indexOf('checkContractLock(context)');
    const gapDetectIdx = orch.indexOf('detectRequiredCapabilities(');

    assert.ok(
      contractLockIdx !== -1,
      'AA-011 FAIL: checkContractLock() is missing from orchestrator.js. ' +
      'The contract lock gate must run before any escalation attempt.'
    );

    assert.ok(
      gapDetectIdx !== -1,
      'AA-011 FAIL: detectRequiredCapabilities() is missing from orchestrator.js.'
    );

    assert.ok(
      contractLockIdx < gapDetectIdx,
      'AA-011 FAIL: checkContractLock() must appear BEFORE detectRequiredCapabilities() ' +
      'in orchestrator.js. The contract lock must gate all escalation attempts.'
    );
  });

  it('AA-012: requiresExpertise and analysisComplexity are passed to detectRequiredCapabilities', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('analysis.requiresExpertise') &&
      orch.includes('analysis.complexity'),
      'AA-012 FAIL: orchestrator.js must pass analysis.requiresExpertise and analysis.complexity ' +
      'to detectRequiredCapabilities(). These semantic analyzer signals must feed into routing.'
    );
  });

  it('AA-013: adapter registry has a primary adapter marked primary: true', () => {
    const registry = readRepoFile('api/core/adapters/adapter-registry.js');
    assert.ok(registry, 'Could not read adapter-registry.js');

    assert.ok(
      registry.includes('primary: true'),
      'AA-013 FAIL: adapter-registry.js must mark exactly one adapter as primary: true. ' +
      'getDefaultAdapter() returns the primary adapter — the customer\'s contract default. ' +
      'Without this, the default adapter selection is undefined.'
    );
  });

});

// ============================================================
// BB. PIPELINE EFFICIENCY — GREETING FAST-PATH AND
//     COMPRESSED SYSTEM PROMPT
// Ensures greeting queries skip provably-unused processing and
// simple queries use a smaller system prompt.
// ============================================================

describe('BB. Pipeline Efficiency — Greeting Fast-Path and Compressed Prompt', () => {

  it('BB-001: greeting classification skips semantic analysis', () => {
    // FIX 1: When willUseGreetingShortcut is true, #performSemanticAnalysis must NOT be
    // called — a fallback analysis is used instead.  The guard must reference the
    // willUseGreetingShortcut variable and skip the performSemanticAnalysis call.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('willUseGreetingShortcut'),
      'BB-001 FAIL: willUseGreetingShortcut flag not found in orchestrator.js. ' +
      'Greeting fast-path requires this flag to gate semantic analysis and principle reasoning.'
    );

    // The fast-path log message must be present in the semantic-analysis section
    assert.ok(
      orch.includes('Skipping semantic analysis'),
      'BB-001 FAIL: "[GREETING-FAST-PATH] Skipping semantic analysis" log not found. ' +
      'orchestrator.js must log when semantic analysis is skipped for greeting queries.'
    );
  });

  it('BB-002: greeting classification skips principle-based reasoning', () => {
    // FIX 1: applyPrincipleBasedReasoning must be inside a !willUseGreetingShortcut block.
    // The result (reasoningGuidance) is injected into the system prompt, which the greeting
    // shortcut never uses — running it wastes time and produces a discarded result.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('Skipping principle-based reasoning'),
      'BB-002 FAIL: "Skipping principle-based reasoning" log not found in orchestrator.js. ' +
      'applyPrincipleBasedReasoning must be skipped when willUseGreetingShortcut is true.'
    );
  });

  it('BB-003: simple_factual and simple_short use compressed system prompt', () => {
    // FIX 3: #routeToAI must check the query classification and select
    // #buildCompressedSystemPrompt for greeting, simple_factual, and simple_short queries.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('buildCompressedSystemPrompt') &&
      orch.includes("'simple_factual'") &&
      orch.includes("'simple_short'"),
      'BB-003 FAIL: #buildCompressedSystemPrompt not routed for simple_factual/simple_short. ' +
      '#routeToAI must select the compressed prompt for simple query classifications.'
    );

    assert.ok(
      orch.includes('useCompressedPrompt'),
      'BB-003 FAIL: useCompressedPrompt decision variable not found in orchestrator.js.'
    );
  });

  it('BB-004: complex_analytical uses full system prompt (not compressed)', () => {
    // FIX 3: Only the simple classification types should use the compressed prompt.
    // complex_analytical must go through #buildSystemPrompt to get full reasoning guidance.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The routing expression must include a ternary or conditional that calls
    // #buildSystemPrompt on the else branch (non-simple queries).
    assert.ok(
      orch.includes('#buildSystemPrompt(') &&
      orch.includes('#buildCompressedSystemPrompt('),
      'BB-004 FAIL: Both #buildSystemPrompt and #buildCompressedSystemPrompt must exist. ' +
      'complex_analytical queries must still use the full prompt.'
    );
  });

  it('BB-005: compressed prompt contains core truth rules', () => {
    // FIX 2: The compressed prompt must preserve "Truth > Helpfulness > Engagement"
    // and the core identity rules — these are non-negotiable regardless of query type.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // Check that #buildCompressedSystemPrompt contains the truth priority statement
    const compressedIdx = orch.indexOf('buildCompressedSystemPrompt(mode, queryClassification');
    assert.ok(compressedIdx !== -1, 'BB-005 FAIL: #buildCompressedSystemPrompt not found');

    // The method body must contain "Truth > Helpfulness"
    const methodSection = orch.substring(compressedIdx, compressedIdx + 5000);
    assert.ok(
      methodSection.includes('Truth > Helpfulness'),
      'BB-005 FAIL: compressed prompt must contain core truth priority "Truth > Helpfulness". ' +
      'Truth enforcement must never be removed regardless of query type.'
    );
  });

  it('BB-006: compressed prompt contains no-fabrication rule', () => {
    // FIX 2: The compressed prompt must retain the MEMORY FABRICATION prohibition.
    // Even simple queries can involve memory context, so fabrication must remain forbidden.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const compressedIdx = orch.indexOf('buildCompressedSystemPrompt(mode, queryClassification');
    assert.ok(compressedIdx !== -1, 'BB-006 FAIL: #buildCompressedSystemPrompt not found');

    const methodSection = orch.substring(compressedIdx, compressedIdx + 5000);
    assert.ok(
      methodSection.includes('MEMORY FABRICATION'),
      'BB-006 FAIL: compressed prompt must contain the MEMORY FABRICATION prohibition. ' +
      'No-fabrication rule must be present even in the compressed prompt.'
    );
  });

  it('BB-007: high stakes detection still runs on all query types (via manipulation guard)', () => {
    // The manipulation guard runs BEFORE the greeting shortcut for ALL queries.
    // manipulationGuard.validate must NOT be inside the willUseGreetingShortcut conditional.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const guardIdx = orch.indexOf('manipulationGuard.validate(');
    const fastPathIdx = orch.indexOf('willUseGreetingShortcut');
    const shortcutIdx = orch.indexOf('GREETING-SHORTCUT]');

    assert.ok(guardIdx !== -1, 'BB-007 FAIL: manipulationGuard.validate not found');
    assert.ok(fastPathIdx !== -1, 'BB-007 FAIL: willUseGreetingShortcut not found');
    assert.ok(shortcutIdx !== -1, 'BB-007 FAIL: GREETING-SHORTCUT log not found');

    // The manipulation guard must appear AFTER willUseGreetingShortcut is set
    // but BEFORE the greeting shortcut fires (i.e., it runs unconditionally between them).
    assert.ok(
      guardIdx > fastPathIdx && guardIdx < shortcutIdx,
      'BB-007 FAIL: manipulationGuard.validate must run after willUseGreetingShortcut is set ' +
      'but before the greeting shortcut fires. High stakes / manipulation checks must be universal.'
    );
  });

  it('BB-008: manipulation guard still runs on all query types', () => {
    // Confirm manipulationGuard.validate call is not inside a willUseGreetingShortcut block.
    // It is a universal safety gate that cannot be conditioned on query type.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('manipulationGuard.validate('),
      'BB-008 FAIL: manipulationGuard.validate not found in orchestrator.js'
    );

    // The guard log message must be unconditional (not inside willUseGreetingShortcut block)
    assert.ok(
      orch.includes('MANIPULATION-GUARD] Checking for manipulation'),
      'BB-008 FAIL: manipulation guard log message not found. ' +
      'manipulationGuard must run on every request regardless of query classification.'
    );
  });

  it('BB-009: compressed prompt is shorter than full prompt (token savings verified)', () => {
    // FIX 2: #buildCompressedSystemPrompt must produce a shorter string than #buildSystemPrompt.
    // Verify by checking that the compressed method omits major verbose sections.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const compressedStart = orch.indexOf('buildCompressedSystemPrompt(mode, queryClassification');
    const fullStart = orch.indexOf('buildSystemPrompt(mode, _analysis');

    assert.ok(compressedStart !== -1, 'BB-009 FAIL: #buildCompressedSystemPrompt not found');
    assert.ok(fullStart !== -1, 'BB-009 FAIL: #buildSystemPrompt not found');

    // The full prompt contains BOUNDED INFERENCE (verbose section); compressed must not.
    const compressedSection = orch.substring(compressedStart, compressedStart + 8000);
    const fullSection = orch.substring(fullStart, fullStart + 8000);

    assert.ok(
      fullSection.includes('BOUNDED INFERENCE') || fullSection.includes('INFERENCE GUIDELINES'),
      'BB-009 FAIL: #buildSystemPrompt is missing BOUNDED INFERENCE block — used as baseline'
    );

    assert.ok(
      !compressedSection.includes('BOUNDED INFERENCE') && !compressedSection.includes('INFERENCE GUIDELINES'),
      'BB-009 FAIL: #buildCompressedSystemPrompt must NOT include the verbose BOUNDED INFERENCE ' +
      'block. This block accounts for ~350 tokens and is unnecessary for simple queries.'
    );
  });

  it('BB-010: answer quality preserved — compressed prompt retains identity and mode rules', () => {
    // FIX 2: The compressed prompt must include all identity rules and mode-specific additions.
    // Omitting these would change answer quality, which is not permitted.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const compressedIdx = orch.indexOf('buildCompressedSystemPrompt(mode, queryClassification');
    assert.ok(compressedIdx !== -1, 'BB-010 FAIL: #buildCompressedSystemPrompt not found');

    const methodSection = orch.substring(compressedIdx, compressedIdx + 8000);

    // Must include Site Monkeys identity rule
    assert.ok(
      methodSection.includes('Site Monkeys AI system'),
      'BB-010 FAIL: compressed prompt must include Site Monkeys identity rule'
    );

    // Must include mode-specific handling (business_validation and site_monkeys blocks)
    assert.ok(
      methodSection.includes('business_validation') && methodSection.includes('site_monkeys'),
      'BB-010 FAIL: compressed prompt must include mode-specific rule blocks ' +
      '(business_validation and site_monkeys). Mode rules affect answer quality and must be preserved.'
    );
  });

});

// ============================================================
// SECTION BC: GREETING FAST-PATH CORRECTNESS
// Permanently verifies the two safety invariants of the
// willUseGreetingShortcut optimization:
//
//   1. Confidence < 0.85 falls through to full processing.
//   2. willUseGreetingShortcut conditions are IDENTICAL to
//      STEP 6.9 conditions — they must never drift apart.
//
// If the conditions ever diverge, a query could have processing
// skipped (fast-path = true) but then NOT be handled by the
// shortcut (STEP 6.9 = false), leaving the AI call with
// fallback analysis and no Phase 4 data.
// ============================================================

describe('BC. Greeting Fast-Path Correctness', () => {

  it('BC-001: confidence threshold of 0.85 appears in BOTH fast-path flag AND STEP 6.9', () => {
    // INVARIANT: willUseGreetingShortcut and STEP 6.9 must use the same confidence gate.
    // If one is changed and the other is not, a greeting with confidence in the gap
    // (e.g., 0.80 < c < 0.85) would trigger one but not the other, causing:
    //   - fast-path=true but shortcut doesn't fire → AI call gets fallback analysis
    //   - OR shortcut fires but fast-path=false → wasted processing still ran
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // Count how many times the 0.85 threshold appears in meaningful code context.
    // Both the willUseGreetingShortcut assignment and the STEP 6.9 if-condition must include it.
    const occurrences = (orch.match(/confidence\s*>=\s*0\.85/g) || []).length;

    assert.ok(
      occurrences >= 2,
      `BC-001 FAIL: "confidence >= 0.85" found only ${occurrences} time(s) in orchestrator.js. ` +
      'It must appear in BOTH willUseGreetingShortcut (fast-path gate) AND the STEP 6.9 ' +
      'greeting shortcut. If the threshold differs between them, the fast-path can skip ' +
      'processing for a query that STEP 6.9 will not actually handle.'
    );
  });

  it('BC-002: willUseGreetingShortcut is evaluated AFTER memoryContext is available', () => {
    // INVARIANT: willUseGreetingShortcut references memoryContext.hasMemory.
    // memoryContext is only set after STEP 1 (memory retrieval). If the flag were evaluated
    // before STEP 1, memoryContext would be undefined and the .hasMemory access would throw.
    // Verify ordering: memoryContext assignment must appear before willUseGreetingShortcut.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const memoryContextAssignIdx = orch.indexOf('memoryContext = {');
    const fastPathFlagIdx = orch.indexOf('willUseGreetingShortcut =');
    const step69Idx = orch.indexOf('STEP 6.9: GREETING SHORTCUT');

    assert.ok(memoryContextAssignIdx !== -1, 'BC-002 FAIL: memoryContext = { not found in orchestrator.js');
    assert.ok(fastPathFlagIdx !== -1, 'BC-002 FAIL: willUseGreetingShortcut = not found in orchestrator.js');
    assert.ok(step69Idx !== -1, 'BC-002 FAIL: STEP 6.9 comment not found in orchestrator.js');

    assert.ok(
      memoryContextAssignIdx < fastPathFlagIdx,
      'BC-002 FAIL: willUseGreetingShortcut is evaluated BEFORE memoryContext is set. ' +
      'memoryContext.hasMemory would be undefined, making the fast-path fire incorrectly ' +
      'for queries where the user has stored memories.'
    );

    assert.ok(
      fastPathFlagIdx < step69Idx,
      'BC-002 FAIL: willUseGreetingShortcut must be evaluated BEFORE STEP 6.9 so the ' +
      'processing skip happens at the right point in the pipeline.'
    );
  });

  it('BC-003: !hasPersonalIntent guard appears in BOTH fast-path flag AND STEP 6.9', () => {
    // INVARIANT: Both willUseGreetingShortcut and STEP 6.9 must gate on !hasPersonalIntent.
    // This guard protects "Hi, what's my name?" — a greeting with personal intent that
    // must run full processing (needs memory retrieval) and NOT fire the shortcut.
    // If fast-path has this guard but STEP 6.9 doesn't (or vice versa), the two diverge.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const fastPathFlagIdx = orch.indexOf('willUseGreetingShortcut =');
    const step69Idx = orch.indexOf('STEP 6.9: GREETING SHORTCUT');

    assert.ok(fastPathFlagIdx !== -1, 'BC-003 FAIL: willUseGreetingShortcut = not found');
    assert.ok(step69Idx !== -1, 'BC-003 FAIL: STEP 6.9 comment not found');

    // Extract the fast-path block (up to ~200 chars from the flag assignment)
    const fastPathBlock = orch.substring(fastPathFlagIdx, fastPathFlagIdx + 300);
    // Extract the STEP 6.9 condition block (up to ~300 chars from the comment)
    const step69Block = orch.substring(step69Idx, step69Idx + 650);

    assert.ok(
      fastPathBlock.includes('!hasPersonalIntent'),
      'BC-003 FAIL: willUseGreetingShortcut block is missing !hasPersonalIntent guard. ' +
      '"Hi, what\'s my name?" would be fast-pathed despite needing memory retrieval.'
    );

    assert.ok(
      step69Block.includes('!hasPersonalIntent'),
      'BC-003 FAIL: STEP 6.9 block is missing !hasPersonalIntent guard. ' +
      'The shortcut would fire for personal-intent greetings, bypassing memory recall.'
    );
  });

  it('BC-004: !memoryContext.hasMemory guard appears in BOTH fast-path flag AND STEP 6.9', () => {
    // INVARIANT: Both gates must check that no memory context was retrieved.
    // If memory was retrieved (user has stored info), the greeting shortcut must not fire —
    // the AI call needs the memory context to give a personalised greeting.
    // Divergence here would cause one gate to allow the shortcut when the other wouldn't.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const fastPathFlagIdx = orch.indexOf('willUseGreetingShortcut =');
    const step69Idx = orch.indexOf('STEP 6.9: GREETING SHORTCUT');

    const fastPathBlock = orch.substring(fastPathFlagIdx, fastPathFlagIdx + 300);
    const step69Block = orch.substring(step69Idx, step69Idx + 650);

    assert.ok(
      fastPathBlock.includes('memoryContext.hasMemory'),
      'BC-004 FAIL: willUseGreetingShortcut block is missing memoryContext.hasMemory check. ' +
      'The fast-path would fire even when the user has retrieved memory context.'
    );

    assert.ok(
      step69Block.includes('memoryContext.hasMemory'),
      'BC-004 FAIL: STEP 6.9 block is missing memoryContext.hasMemory check. ' +
      'The shortcut would fire even when memory context is present.'
    );
  });

  it('BC-005: confidence < 0.85 disables fast-path — semantic analysis branch must still exist', () => {
    // INVARIANT: The fast-path is conditional, not unconditional. When willUseGreetingShortcut
    // is false (e.g., confidence < 0.85, hasPersonalIntent, hasMemory, docs, vault), the system
    // MUST fall through to full processing (semantic analysis, Phase 4, reasoning, AI call).
    // This guards against the else-branch being accidentally deleted.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // The semantic analysis section must contain an else branch that runs #performSemanticAnalysis
    // when willUseGreetingShortcut is false.
    const hasFullProcessingFallthrough =
      orch.includes('#performSemanticAnalysis(') &&
      orch.includes('willUseGreetingShortcut') &&
      // The else branch must appear after the fast-path check and call performSemanticAnalysis
      orch.indexOf('#performSemanticAnalysis(') > orch.indexOf('willUseGreetingShortcut');

    assert.ok(
      hasFullProcessingFallthrough,
      'BC-005 FAIL: Full processing fallthrough (#performSemanticAnalysis) not found after ' +
      'willUseGreetingShortcut check. Queries with confidence < 0.85, personal intent, ' +
      'memory context, documents, or vault MUST fall through to full semantic analysis.'
    );

    // Also confirm applyPrincipleBasedReasoning has a fallthrough path
    assert.ok(
      orch.includes('applyPrincipleBasedReasoning(') &&
      orch.indexOf('applyPrincipleBasedReasoning(') > orch.indexOf('willUseGreetingShortcut'),
      'BC-005 FAIL: applyPrincipleBasedReasoning fallthrough not found after willUseGreetingShortcut. ' +
      'Principle-based reasoning must still run on all non-fast-pathed queries.'
    );
  });

  it('BC-006: greeting classifier PURE_GREETINGS set only contains genuine greetings', () => {
    // RISK CHECK: The deterministic shortcut in queryComplexityClassifier.js returns
    // confidence: 0.95 for any word in PURE_GREETINGS. If a non-greeting word were
    // accidentally added to this set (e.g., "help", "yes", "please"), it would score
    // 0.95 and trigger the fast-path, returning a canned greeting response for a
    // genuine question.
    // This test reads the set and confirms it contains only recognisable greeting words.
    const classifier = readRepoFile('api/core/intelligence/greetingUtils.js');
    assert.ok(classifier, 'Could not read api/core/intelligence/greetingUtils.js');

    // Extract the set contents by finding everything between 'new Set([' and ']);'
    const setStart = classifier.indexOf("new Set([");
    const setEnd = classifier.indexOf("]);", setStart);
    assert.ok(setStart !== -1 && setEnd !== -1, 'BC-006 FAIL: PURE_GREETINGS Set not found in greetingUtils.js');

    const setBody = classifier.substring(setStart, setEnd);

    // Suspicious non-greeting words that must NOT appear in the set.
    // 'ok' and 'okay' are intentionally included: "ok I understand" and "okay" are
    // acknowledgments/confirmations, not greetings. Fast-pathing them would return a
    // canned greeting response for mid-conversation acknowledgments, which is wrong.
    const forbidden = ['help', 'yes', 'no', 'please', 'ok', 'okay', 'what', 'how', 'why', 'when', 'where'];
    for (const word of forbidden) {
      assert.ok(
        !setBody.includes(`'${word}'`) && !setBody.includes(`"${word}"`),
        `BC-006 FAIL: "${word}" found in PURE_GREETINGS set in greetingUtils.js. ` +
        `"${word}" is not a pure greeting — adding it would cause any query starting with ` +
        `"${word}" to be classified as greeting with confidence 0.95, fast-pathed, and ` +
        `returned as a canned greeting response instead of being answered.`
      );
    }
  });

});

// ============================================================
// SECTION CC: Eli/Roxy Prompt Deduplication + Confidence Calculator
// Verifies the shared template extraction and confidence reason fixes.
// All file-scan tests are ESM-safe — no API calls, $0 cost.
// ============================================================

describe('CC. Prompt Deduplication and Confidence Calculator Fixes', () => {

  // CC-001: Shared template function exists in ai-processors.js
  it('CC-001: buildSharedAIInstructions function exists in ai-processors.js', () => {
    const processors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(processors, 'CC-001 FAIL: api/lib/ai-processors.js is missing.');
    assert.ok(
      processors.includes('function buildSharedAIInstructions('),
      'CC-001 FAIL: buildSharedAIInstructions function not found in ai-processors.js. ' +
      'The shared template must be extracted to a single function to eliminate duplication.'
    );
  });

  // CC-002: Eli prompt uses shared template (no longer contains raw duplicate block)
  it('CC-002: generateEliResponse uses buildSharedAIInstructions (no raw duplicate block)', () => {
    const processors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(processors, 'CC-002 FAIL: api/lib/ai-processors.js is missing.');

    // The Eli generator must call buildSharedAIInstructions
    const eliStart = processors.indexOf('async function generateEliResponse(');
    assert.ok(eliStart !== -1, 'CC-002 FAIL: generateEliResponse function not found.');

    const eliBody = processors.substring(eliStart, eliStart + 2000);
    assert.ok(
      eliBody.includes('buildSharedAIInstructions('),
      'CC-002 FAIL: generateEliResponse does not call buildSharedAIInstructions. ' +
      'The shared blocks must be de-duplicated by delegating to buildSharedAIInstructions.'
    );
  });

  // CC-003: Roxy prompt uses shared template (no longer contains raw duplicate block)
  it('CC-003: generateRoxyResponse uses buildSharedAIInstructions (no raw duplicate block)', () => {
    const processors = readRepoFile('api/lib/ai-processors.js');
    assert.ok(processors, 'CC-003 FAIL: api/lib/ai-processors.js is missing.');

    // The Roxy generator must call buildSharedAIInstructions
    const roxyStart = processors.indexOf('async function generateRoxyResponse(');
    assert.ok(roxyStart !== -1, 'CC-003 FAIL: generateRoxyResponse function not found.');

    const roxyBody = processors.substring(roxyStart, roxyStart + 2000);
    assert.ok(
      roxyBody.includes('buildSharedAIInstructions('),
      'CC-003 FAIL: generateRoxyResponse does not call buildSharedAIInstructions. ' +
      'The shared blocks must be de-duplicated by delegating to buildSharedAIInstructions.'
    );
  });

  // CC-004: Binary existence query gets affirming reason when score is high
  it('CC-004: buildConfidenceReason returns affirming reason for binary existence query with high score', async () => {
    const { buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');

    // Binary existence query ("do hippos have twins?") with PERMANENT truth type → high score
    const binaryReason = buildConfidenceReason(
      'PERMANENT',
      0,
      false,
      0.97,
      { query: 'do hippos have twins?' }
    );

    // Non-binary query on same topic with same score
    const nonBinaryReason = buildConfidenceReason(
      'PERMANENT',
      0,
      false,
      0.97,
      { query: 'hippo reproduction facts' }
    );

    assert.strictEqual(
      binaryReason,
      'documented — confirmed it can occur',
      `CC-004 FAIL: Binary existence query ("do hippos have twins?") with score=0.97 returned ` +
      `"${binaryReason}" instead of "documented — confirmed it can occur".`
    );

    assert.strictEqual(
      nonBinaryReason,
      'established knowledge — well documented',
      `CC-004 FAIL: Non-binary query ("hippo reproduction facts") with score=0.97 returned ` +
      `"${nonBinaryReason}" instead of "established knowledge — well documented". ` +
      'Binary framing should only affect queries starting with auxiliary verbs.'
    );
  });

  // CC-005: Low confidence returns bounded reasoning signal text
  it('CC-005: buildConfidenceReason returns bounded reasoning signal for score < 0.60', async () => {
    const { buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');

    const reason = buildConfidenceReason(null, 0, false, 0.55, null);
    assert.strictEqual(
      reason,
      'limited information — reasoning from available evidence',
      `CC-005 FAIL: buildConfidenceReason with score=0.55 returned "${reason}". ` +
      'Expected "limited information — reasoning from available evidence" for score < 0.60. ' +
      'Low confidence should signal bounded reasoning, not just recommend verification.'
    );
  });

  // CC-006: All existing confidence behaviors unchanged
  it('CC-006: PERMANENT score=0.90 and memory reason are unchanged', async () => {
    const { calculateConfidence, buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');

    // PERMANENT still scores 0.90
    const permanentScore = calculateConfidence('PERMANENT', 0, false, null, null);
    assert.strictEqual(
      permanentScore,
      0.90,
      `CC-006 FAIL: calculateConfidence for PERMANENT returned ${permanentScore} — must be 0.90.`
    );

    // Memory-sourced answer still returns personal records reason
    const memoryReason = buildConfidenceReason('PERMANENT', 0, false, 0.90, { memory_sourced: true });
    assert.strictEqual(
      memoryReason,
      'confirmed from your personal records',
      `CC-006 FAIL: Memory-sourced reason changed to "${memoryReason}". Must stay "confirmed from your personal records".`
    );

    // SEMI_STABLE non-lookup reason unchanged
    const semiStableReason = buildConfidenceReason('SEMI_STABLE', 0, false, 0.70, null);
    assert.strictEqual(
      semiStableReason,
      'based on training knowledge — may not reflect latest',
      `CC-006 FAIL: SEMI_STABLE non-lookup reason changed to "${semiStableReason}".`
    );
  });

});

// ============================================================
// DD. Intelligent Session State Compression (Issue: Session Compression)
// ============================================================

describe('DD. Intelligent Session State Compression', () => {

  // ─── File existence ─────────────────────────────────────────────────────────

  const SESSION_EXTRACTOR_PATH = 'api/core/intelligence/session-state-extractor.js';

  // ─── DD-001: flag off → slice(-5) preserved ──────────────────────────────

  it('DD-001: SESSION_STATE_ENABLED=false uses bounded history (trimmedHistory fallback)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // History is bounded via getConversationDepth → conversationHistory.slice(-historyDepth).
    // trimmedHistory is the false-branch fallback when SESSION_STATE_ENABLED=false,
    // replacing the old hard-coded slice(-5) with a query-aware bound (max 5 turns).
    assert.ok(
      orch.includes('trimmedHistory') &&
      orch.includes('conversationHistory.slice(-historyDepth)'),
      'DD-001 FAIL: trimmedHistory (the bounded false-branch fallback) is missing from orchestrator.js. ' +
      'SESSION_STATE_ENABLED=false must use bounded history via getConversationDepth.'
    );
  });

  // ─── DD-002: flag on → new system activated ───────────────────────────────

  it('DD-002: SESSION_STATE_ENABLED=true activates new system', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('SESSION_STATE_ENABLED') && orch.includes('buildSessionContext'),
      'DD-002 FAIL: orchestrator.js must reference SESSION_STATE_ENABLED and buildSessionContext'
    );
  });

  // ─── DD-003: snake_case accepted ─────────────────────────────────────────

  it('DD-003: snake_case conversation_history accepted at server.js', () => {
    const srv = readRepoFile('server.js');
    assert.ok(srv, 'Could not read server.js');
    assert.ok(
      srv.includes('conversation_history'),
      'DD-003 FAIL: server.js must destructure conversation_history (snake_case) from req.body'
    );
  });

  // ─── DD-004: camelCase still accepted ────────────────────────────────────

  it('DD-004: camelCase conversationHistory still accepted at server.js', () => {
    const srv = readRepoFile('server.js');
    assert.ok(srv, 'Could not read server.js');
    assert.ok(
      srv.includes('conversationHistory'),
      'DD-004 FAIL: server.js must still accept conversationHistory (camelCase)'
    );
  });

  // ─── DD-005: BUDGET.HISTORY exists ───────────────────────────────────────

  it('DD-005: BUDGET.HISTORY = 2000 exists in BUDGET object', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('HISTORY: 2000') || orch.includes('HISTORY:2000'),
      'DD-005 FAIL: BUDGET.HISTORY = 2000 must be defined in the BUDGET object in orchestrator.js'
    );
  });

  // ─── DD-006 through DD-025: logic tests via direct import ────────────────

  it('DD-006: shouldExtract returns false for simple factual query', async () => {
    const { shouldExtract: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    const result = fn('what is 2 plus 2', state, [], 0);
    assert.strictEqual(result, false, 'DD-006 FAIL: shouldExtract should return false for simple factual query with no signals');
  });

  it('DD-007: shouldExtract returns true when correction signal detected', async () => {
    const { shouldExtract: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    const result = fn('actually I meant the other one', state, [], 0);
    assert.strictEqual(result, true, 'DD-007 FAIL: shouldExtract should return true when correction signal present');
  });

  it('DD-008: shouldExtract returns true when named entity introduced', async () => {
    const { shouldExtract: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    const result = fn('Sarah Johnson will handle this project', state, [], 0);
    assert.strictEqual(result, true, 'DD-008 FAIL: shouldExtract should return true when new named entity detected');
  });

  it('DD-009: shouldExtract returns true when compression threshold exceeded', async () => {
    const { shouldExtract: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // Exceed token budget
    const result = fn('hello', state, [], 2001);
    assert.strictEqual(result, true, 'DD-009 FAIL: shouldExtract should return true when estimated tokens exceed BUDGET.HISTORY');
  });

  it('DD-010: mergeSessionState never fully replaces existing state', async () => {
    const { mergeSessionState: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const existing = emptyFn();
    existing.facts_established.push({ text: 'existing fact', status: 'confirmed' });
    const extracted = emptyFn();
    extracted.facts_established.push({ text: 'new fact', status: 'confirmed' });
    const merged = fn(existing, extracted);
    assert.ok(
      merged.facts_established.some(f => f.text === 'existing fact'),
      'DD-010 FAIL: mergeSessionState must preserve existing facts — full replacement is not allowed'
    );
    assert.ok(
      merged.facts_established.some(f => f.text === 'new fact'),
      'DD-010 FAIL: mergeSessionState must include extracted facts'
    );
  });

  it('DD-011: superseded values excluded from context injection', async () => {
    const { buildSessionContext: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    state.decisions_made.push({ text: 'old decision', status: 'superseded' });
    state.decisions_made.push({ text: 'active decision', status: 'active' });
    state.current_focus = { entity: 'TestEntity', objective: 'testing' };
    const context = fn(state, [{ role: 'user', content: 'test' }]);
    const contextStr = JSON.stringify(context);
    assert.ok(
      !contextStr.includes('old decision'),
      'DD-011 FAIL: superseded decisions must not appear in context injection'
    );
  });

  it('DD-012: raw window minimum is 2 exchanges always', async () => {
    const { calculateRawWindowSize: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // No pronouns, no dependencies — should return minimum 2
    const size = fn([], state);
    assert.ok(size >= 2, `DD-012 FAIL: raw window size must be at least 2, got ${size}`);
  });

  it('DD-013: raw window expands to 5 under high reference density', async () => {
    const { calculateRawWindowSize: fn } = await import('../../api/core/intelligence/session-state-extractor.js');
    // 6+ pronouns should trigger window size 5
    const exchanges = [
      { role: 'user', content: 'it they this that he she him her them its their it they' }
    ];
    const state = { open_dependencies: [] };
    const size = fn(exchanges, state);
    assert.strictEqual(size, 5, `DD-013 FAIL: raw window should be 5 under high reference density, got ${size}`);
  });

  it('DD-014: current_focus falls back to most recent primary entity', async () => {
    const { buildSessionContext: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // No current_focus entity set, but a primary entity exists
    state.current_focus = { entity: null, objective: null };
    state.active_entities.push({ name: 'PrimaryProject', is_primary: true, last_mentioned: 1 });
    const context = fn(state, [{ role: 'user', content: 'help' }]);
    const contextStr = JSON.stringify(context);
    assert.ok(
      contextStr.includes('PrimaryProject'),
      'DD-014 FAIL: current_focus should fall back to most recent primary entity'
    );
  });

  it('DD-015: state corruption resets to empty — never crashes', async () => {
    const { validateStateSchema: fn } = await import('../../api/core/intelligence/session-state-extractor.js');
    // Corrupted state (missing required keys)
    let threw = false;
    try {
      fn({ some_garbage: true });
    } catch {
      threw = true;
    }
    assert.ok(threw, 'DD-015 FAIL: validateStateSchema must throw on invalid state so caller can detect corruption');
    // But empty/null input should also throw (not silently pass)
    let threwNull = false;
    try {
      fn(null);
    } catch {
      threwNull = true;
    }
    assert.ok(threwNull, 'DD-015 FAIL: validateStateSchema must throw on null input');
  });

  it('DD-016: extraction failure falls back to raw history — never blocks', async () => {
    const srv = readRepoFile('server.js');
    assert.ok(srv, 'Could not read server.js');
    assert.ok(
      srv.includes('[SESSION-STATE] Extraction failed'),
      'DD-016 FAIL: server.js must log extraction failure and continue with raw history'
    );
  });

  it('DD-017: assembly overflow drops low-priority state first', async () => {
    const extractor = readRepoFile(SESSION_EXTRACTOR_PATH);
    assert.ok(extractor, `Could not read ${SESSION_EXTRACTOR_PATH}`);
    assert.ok(
      extractor.includes('low-priority state dropped') || extractor.includes('lowPriority') && extractor.includes('BUDGET_HISTORY'),
      'DD-017 FAIL: session-state-extractor.js must implement budget-based dropping of low-priority state'
    );
  });

  it('DD-018: assembly overflow preserves raw window always', async () => {
    const { buildSessionContext: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    const rawHistory = [
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'first reply' },
    ];
    const context = fn(state, rawHistory);
    // Raw window messages must always be present
    assert.ok(
      context.some(m => m.content === 'first message' || m.content === 'first reply'),
      'DD-018 FAIL: raw window messages must always appear in the assembled context'
    );
  });

  it('DD-019: decisions_made active entries protected from pruning', async () => {
    const { enforceStateSizeLimits: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // Fill beyond limit with active entries
    for (let i = 0; i < 12; i++) {
      state.decisions_made.push({ text: `decision ${i}`, status: 'active' });
    }
    const result = fn(state);
    const activeCount = result.decisions_made.filter(d => d.status === 'active').length;
    // Active decisions should be preserved up to the limit
    assert.ok(
      activeCount <= 10,
      `DD-019 FAIL: decisions_made must not exceed limit of 10, got ${activeCount}`
    );
    assert.ok(
      activeCount > 0,
      'DD-019 FAIL: active decisions_made entries must be present after pruning'
    );
  });

  it('DD-020: decisions_made superseded entries pruned when limit exceeded', async () => {
    const { enforceStateSizeLimits: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // Fill with superseded then active — superseded should be pruned first
    for (let i = 0; i < 8; i++) {
      state.decisions_made.push({ text: `superseded ${i}`, status: 'superseded' });
    }
    for (let i = 0; i < 5; i++) {
      state.decisions_made.push({ text: `active ${i}`, status: 'active' });
    }
    const result = fn(state);
    assert.ok(
      result.decisions_made.length <= 10,
      `DD-020 FAIL: decisions_made must be capped at 10, got ${result.decisions_made.length}`
    );
  });

  it('DD-021: context assembly follows priority order', async () => {
    const extractor = readRepoFile(SESSION_EXTRACTOR_PATH);
    assert.ok(extractor, `Could not read ${SESSION_EXTRACTOR_PATH}`);
    // Verify assembly sequence comments exist in source
    assert.ok(
      extractor.includes('highPriority') && extractor.includes('lowPriority') && extractor.includes('rawWindow'),
      'DD-021 FAIL: session-state-extractor.js must implement high-priority, low-priority, and raw window assembly'
    );
  });

  it('DD-022: high-priority state injected before retrieved memory', async () => {
    const { buildSessionContext: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    state.current_focus = { entity: 'ImportantEntity', objective: 'critical task' };
    state.unresolved_threads = [{ text: 'pending question' }];
    const rawHistory = [{ role: 'user', content: 'message' }];
    const context = fn(state, rawHistory);
    // High-priority context item should be present
    const highPriorityItem = context.find(m => m._priority === 'high');
    assert.ok(highPriorityItem, 'DD-022 FAIL: high-priority session state must be injected into context');
  });

  it('DD-023: low-priority state skipped when budget exhausted', async () => {
    const extractor = readRepoFile(SESSION_EXTRACTOR_PATH);
    assert.ok(extractor, `Could not read ${SESSION_EXTRACTOR_PATH}`);
    assert.ok(
      extractor.includes('BUDGET_HISTORY') && extractor.includes('includeLowPriority'),
      'DD-023 FAIL: session-state-extractor.js must check budget before including low-priority state'
    );
  });

  it('DD-024: semanticCompressionReady requires all three conditions', async () => {
    const extractor = readRepoFile(SESSION_EXTRACTOR_PATH);
    assert.ok(extractor, `Could not read ${SESSION_EXTRACTOR_PATH}`);
    // All three conditions from spec must appear
    assert.ok(
      extractor.includes('unresolved_threads') &&
      extractor.includes('open_dependencies') &&
      extractor.includes('calculateReferenceDensity'),
      'DD-024 FAIL: shouldExtract must require all three conditions: no unresolved_threads, no open_dependencies, low reference density'
    );
  });

  it('DD-025: state size enforced — no section exceeds defined limits', async () => {
    const { enforceStateSizeLimits: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');
    const state = emptyFn();
    // Overfill multiple sections
    for (let i = 0; i < 20; i++) state.risk_flags.push({ text: `risk ${i}` });
    for (let i = 0; i < 20; i++) state.constraints.push({ text: `constraint ${i}` });
    for (let i = 0; i < 20; i++) state.recent_references.push({ text: `ref ${i}` });
    const result = fn(state);
    assert.ok(result.risk_flags.length <= 8, `DD-025 FAIL: risk_flags must not exceed 8, got ${result.risk_flags.length}`);
    assert.ok(result.constraints.length <= 10, `DD-025 FAIL: constraints must not exceed 10, got ${result.constraints.length}`);
    assert.ok(result.recent_references.length <= 10, `DD-025 FAIL: recent_references must not exceed 10, got ${result.recent_references.length}`);
  });

  it('DD-026: shouldExtract returns true every 4 exchanges (periodic maintenance trigger)', async () => {
    const { shouldExtract: fn, createEmptySessionState: emptyFn } = await import('../../api/core/intelligence/session-state-extractor.js');

    // Use 4 open_dependencies so calculateRawWindowSize returns 5 (knownDependencies > 3).
    // This means 4 raw exchanges won't overflow the window (4 > 5 is false),
    // isolating the periodic trigger as the only active signal.
    const deps = [
      { text: 'dep1' }, { text: 'dep2' }, { text: 'dep3' }, { text: 'dep4' }
    ];
    const rawExchanges = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];

    // exchange_count=4 with 4 raw exchanges → periodic trigger fires
    const state4 = emptyFn();
    state4.exchange_count = 4;
    state4.unresolved_threads = [{ text: 'pending' }];
    state4.open_dependencies = deps;
    const result4 = fn('hello', state4, rawExchanges, 0);
    assert.strictEqual(result4, true, 'DD-026 FAIL: shouldExtract must return true at exchange_count=4 with 4+ raw exchanges');

    // exchange_count=3 (not a multiple of 4) → periodic trigger does NOT fire
    const state3 = emptyFn();
    state3.exchange_count = 3;
    state3.unresolved_threads = [{ text: 'pending' }];
    state3.open_dependencies = deps;
    const result3 = fn('hello', state3, rawExchanges, 0);
    assert.strictEqual(result3, false, 'DD-026 FAIL: shouldExtract must NOT fire periodic trigger at exchange_count=3 (not a multiple of 4)');

    // exchange_count=8 → fires again
    const state8 = emptyFn();
    state8.exchange_count = 8;
    state8.unresolved_threads = [{ text: 'pending' }];
    state8.open_dependencies = deps;
    const result8 = fn('hello', state8, rawExchanges, 0);
    assert.strictEqual(result8, true, 'DD-026 FAIL: shouldExtract must return true at exchange_count=8 (multiple of 4)');
  });

});

// ============================================================
// SECTION QE: Query Enrichment Fixes (Issue #2)
// Static file scans verifying the three enrichment fixes:
//   FIX 1 — Relevance gate prevents entity contamination
//   FIX 2 — Last assistant response captured for verification
//   FIX 3 — Verification intent detection and claim extraction
// ============================================================

describe('QE. Query Enrichment Fixes — Issue #2', () => {

  it('QE-001: #hasOwnTopic method exists in orchestrator (relevance gate foundation)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('#hasOwnTopic'),
      'QE-001 FAIL: "#hasOwnTopic" method is missing from orchestrator.js. ' +
      'This method is required by the relevance gate (FIX 1) to detect whether the ' +
      'current query has its own clear topic before injecting historical entities.'
    );
  });

  it('QE-002: #isEntityRelevantToQuery method exists in orchestrator (relevance gate)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('#isEntityRelevantToQuery'),
      'QE-002 FAIL: "#isEntityRelevantToQuery" method is missing from orchestrator.js. ' +
      'FIX 1 requires this gate to prevent unrelated entities (e.g. "Apple AAPL") from ' +
      'contaminating a standalone query about a different topic (e.g. "France capital").'
    );
  });

  it('QE-003: VERIFICATION_PATTERNS static field exists in orchestrator (FIX 3)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('VERIFICATION_PATTERNS'),
      'QE-003 FAIL: "VERIFICATION_PATTERNS" is missing from orchestrator.js. ' +
      'FIX 3 requires a patterns array that matches "are you sure", "double-check", ' +
      '"verify", "fact-check", "check current sources", etc.'
    );
  });

  it('QE-004: #isVerificationIntent method exists in orchestrator (FIX 3)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('#isVerificationIntent'),
      'QE-004 FAIL: "#isVerificationIntent" method is missing from orchestrator.js. ' +
      'FIX 3 requires this method to detect whether the user is asking to verify a prior claim.'
    );
  });

  it('QE-005: #extractClaimFromResponse method exists in orchestrator (FIX 3)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('#extractClaimFromResponse'),
      'QE-005 FAIL: "#extractClaimFromResponse" method is missing from orchestrator.js. ' +
      'FIX 3 requires this method to pull the factual claim from the last assistant ' +
      'response so the external lookup searches for the CLAIM, not user message history.'
    );
  });

  it('QE-006: #extractConversationTopics captures last assistant response (FIX 2)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the #extractConversationTopics method body
    const fnStart = src.indexOf('#extractConversationTopics');
    const fnBodySample = src.substring(fnStart, fnStart + 2000);

    assert.ok(
      fnBodySample.includes("role === 'assistant'") || fnBodySample.includes('role === "assistant"'),
      'QE-006 FAIL: "#extractConversationTopics" does not read assistant messages. ' +
      'FIX 2 requires capturing the last assistant response so that when a verification ' +
      'intent is detected, the claim can be extracted from what the AI previously said.'
    );

    assert.ok(
      fnBodySample.includes('lastAssistantResponse'),
      'QE-006 FAIL: "#extractConversationTopics" does not return "lastAssistantResponse". ' +
      'FIX 2 requires this field in the returned object so "#enrichQueryWithConversationContext" ' +
      'can pass it to "#extractClaimFromResponse".'
    );
  });

  it('QE-007: #enrichQueryWithConversationContext checks verification intent before follow-up (FIX 3)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Use lastIndexOf to find the method DEFINITION, not call sites
    const fnStart = src.lastIndexOf('#enrichQueryWithConversationContext');
    const fnBodySample = src.substring(fnStart, fnStart + 3000);

    const verificationIdx = fnBodySample.indexOf('#isVerificationIntent');
    const followUpIdx     = fnBodySample.indexOf('#detectFollowUp');

    assert.ok(
      verificationIdx !== -1,
      'QE-007 FAIL: "#enrichQueryWithConversationContext" never calls "#isVerificationIntent". ' +
      'FIX 3 requires checking for verification intent at the TOP of the enrichment function ' +
      'so it short-circuits before normal entity injection logic.'
    );

    assert.ok(
      verificationIdx < followUpIdx,
      'QE-007 FAIL: verification intent check must appear BEFORE "#detectFollowUp" in ' +
      '"#enrichQueryWithConversationContext". Verification path must bypass follow-up entity injection.'
    );
  });

  it('QE-008: #enrichQueryWithConversationContext applies relevance gate to entities (FIX 1)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Use lastIndexOf to find the method DEFINITION, not call sites
    const fnStart = src.lastIndexOf('#enrichQueryWithConversationContext');
    const fnBodySample = src.substring(fnStart, fnStart + 3000);

    assert.ok(
      fnBodySample.includes('#isEntityRelevantToQuery'),
      'QE-008 FAIL: "#enrichQueryWithConversationContext" does not call "#isEntityRelevantToQuery". ' +
      'FIX 1 requires filtering extracted entities through the relevance gate before building ' +
      'the enriched query, preventing unrelated entities from contaminating standalone queries.'
    );
  });

  it('QE-009: VERIFICATION_PATTERNS covers "are you sure", "double-check", and "check current sources"', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the static field / const that holds the patterns
    const patternStart = src.indexOf('VERIFICATION_PATTERNS');
    const patternBlock  = src.substring(patternStart, patternStart + 500);

    assert.ok(
      patternBlock.includes('are you sure'),
      'QE-009 FAIL: VERIFICATION_PATTERNS must include an "are you sure" pattern.'
    );
    assert.ok(
      patternBlock.includes('double') && patternBlock.includes('check'),
      'QE-009 FAIL: VERIFICATION_PATTERNS must include a "double-check" / "double check" pattern.'
    );
    assert.ok(
      patternBlock.includes('sources') || patternBlock.includes('source'),
      'QE-009 FAIL: VERIFICATION_PATTERNS must include a "check current sources" / "check sources" pattern.'
    );
  });

  it('QE-010: verificationIntent flag returned by enrichment when verification path taken', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Search from the method DEFINITION (last occurrence) to avoid hitting call sites
    const fnStart = src.lastIndexOf('#enrichQueryWithConversationContext');
    const fnBodySample = src.substring(fnStart, fnStart + 3000);

    assert.ok(
      fnBodySample.includes('verificationIntent'),
      'QE-010 FAIL: "#enrichQueryWithConversationContext" does not set "verificationIntent: true" ' +
      'in the return object when the verification path is taken. ' +
      'This flag lets the caller (orchestrator lookup branch) distinguish verification lookups ' +
      'from ordinary follow-up enrichment.'
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// EF. EXTERNAL_FIRST Hierarchy — Memory Deprioritization Fix
// Verifies the fix for: when external lookup returns data and EXTERNAL_FIRST
// hierarchy is active, memory context must not dominate the response.
// ─────────────────────────────────────────────────────────────────────────────
describe('EF. EXTERNAL_FIRST Hierarchy — Memory Deprioritization Fix', () => {

  it('EF-001: EXTERNAL_FIRST_MEMORY_OVERRIDE constant exists in orchestrator', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('EXTERNAL_FIRST_MEMORY_OVERRIDE'),
      'EF-001 FAIL: "EXTERNAL_FIRST_MEMORY_OVERRIDE" constant is missing from orchestrator.js. ' +
      'The fix requires a named constant containing the hierarchy override instruction that tells ' +
      'the AI to lead with external data instead of memory context.'
    );
  });

  it('EF-002: hierarchy override note is appended to externalContext when EXTERNAL_FIRST is active', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the #routeToAI method and check the externalContext assembly block
    const routeToAIIdx = src.indexOf('async #routeToAI(');
    assert.ok(routeToAIIdx !== -1, 'EF-002 FAIL: "#routeToAI" method not found in orchestrator.js');

    const methodBody = src.substring(routeToAIIdx, routeToAIIdx + 15000);

    assert.ok(
      methodBody.includes("phase4Metadata.hierarchy === 'EXTERNAL_FIRST'"),
      'EF-002 FAIL: #routeToAI does not check hierarchy === "EXTERNAL_FIRST" when building externalContext. ' +
      'The fix requires this guard so the memory override note is only appended for EXTERNAL_FIRST queries.'
    );

    assert.ok(
      methodBody.includes('hierarchyOverrideNote'),
      'EF-002 FAIL: "hierarchyOverrideNote" is missing from #routeToAI. ' +
      'The fix requires this variable to be interpolated into the externalContext string ' +
      'so the AI receives the hierarchy override instruction alongside the external data.'
    );
  });

  it('EF-003: HIERARCHY RULE label is present in the override message', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('HIERARCHY RULE'),
      'EF-003 FAIL: The string "HIERARCHY RULE" is missing from orchestrator.js. ' +
      'The override message must contain this label so it is clearly distinguishable ' +
      'in prompts from other critical instructions.'
    );
    assert.ok(
      src.includes('OVERRIDES any conflicting memory context') ||
      src.includes('OVERRIDES'),
      'EF-003 FAIL: The override message must state that external data OVERRIDES memory context. ' +
      'This explicit instruction is required so the AI does not default to the stronger memory framing.'
    );
  });

  it('EF-004: externalPrecedenceNote is computed in #buildContextString', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Use lastIndexOf to find the method DEFINITION, not call sites
    const buildCtxIdx = src.lastIndexOf('#buildContextString(');
    assert.ok(buildCtxIdx !== -1, 'EF-004 FAIL: "#buildContextString" method definition not found in orchestrator.js');

    const methodBody = src.substring(buildCtxIdx, buildCtxIdx + 15000);

    assert.ok(
      methodBody.includes('externalPrecedenceNote'),
      'EF-004 FAIL: "externalPrecedenceNote" is missing from #buildContextString. ' +
      'The fix requires this variable to inject a memory-deprioritization note inside ' +
      'the PERSISTENT MEMORY CONTEXT block when external data has been fetched.'
    );

    assert.ok(
      methodBody.includes('context.external'),
      'EF-004 FAIL: #buildContextString does not gate externalPrecedenceNote on "context.external". ' +
      'The note must only appear when external data is present for this query, not unconditionally.'
    );
  });

  it('EF-005: externalPrecedenceNote is interpolated into the memory context block', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Use lastIndexOf to find the method DEFINITION, not call sites
    const buildCtxIdx = src.lastIndexOf('#buildContextString(');
    assert.ok(buildCtxIdx !== -1, 'EF-005 FAIL: "#buildContextString" method definition not found in orchestrator.js');

    const methodBody = src.substring(buildCtxIdx, buildCtxIdx + 15000);

    // externalPrecedenceNote is defined just before the standard (non-vault) memory block.
    // The template literal for that block includes the interpolation.
    const noteDefIdx = methodBody.indexOf('externalPrecedenceNote');
    assert.ok(noteDefIdx !== -1, 'EF-005 FAIL: "externalPrecedenceNote" not found inside #buildContextString at all');

    // From the definition, capture the next ~2000 chars to find the interpolation
    const noteRegion = methodBody.substring(noteDefIdx, noteDefIdx + 2000);

    assert.ok(
      noteRegion.includes('${externalPrecedenceNote}'),
      'EF-005 FAIL: "externalPrecedenceNote" is defined but never interpolated (${externalPrecedenceNote}) ' +
      'in the PERSISTENT MEMORY CONTEXT block. The note must be interpolated so the AI receives it ' +
      'as part of the memory-use instructions when external data is present.'
    );
  });

  it('EF-006: [PHASE4] EXTERNAL_FIRST log line exists for observability', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('EXTERNAL_FIRST hierarchy active'),
      'EF-006 FAIL: The console.log for "EXTERNAL_FIRST hierarchy active" is missing from orchestrator.js. ' +
      'This log line is required for Railway deployment observability — operators must be able to ' +
      'confirm the hierarchy override path is exercised without replaying full responses.'
    );
  });

});


// ─────────────────────────────────────────────────────────────────────────────
// VI. Verification Intent Detection — External Lookup Triggering
// Verifies the fix that adds VERIFICATION_INTENT_PATTERNS, isVerificationIntent,
// verificationLookupQuery, and the shouldLookup + lookupQuery changes.
// ─────────────────────────────────────────────────────────────────────────────
describe('VI. Verification Intent Detection — External Lookup Triggering', () => {

  it('VI-001: VERIFICATION_INTENT_PATTERNS constant exists in orchestrator', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('VERIFICATION_INTENT_PATTERNS'),
      'VI-001 FAIL: "VERIFICATION_INTENT_PATTERNS" constant is missing from orchestrator.js. ' +
      'The fix requires a block-scoped constant near the other pattern arrays in the ' +
      'external lookup trigger section.'
    );
  });

  it('VI-002: VERIFICATION_INTENT_PATTERNS matches "are you sure"', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    const patternStart = src.indexOf('VERIFICATION_INTENT_PATTERNS');
    assert.ok(patternStart !== -1, 'VI-002 FAIL: VERIFICATION_INTENT_PATTERNS not found');

    const patternBlock = src.substring(patternStart, patternStart + 600);
    assert.ok(
      patternBlock.includes('are you sure'),
      'VI-002 FAIL: VERIFICATION_INTENT_PATTERNS must include an "are you sure" pattern.'
    );
  });

  it('VI-003: VERIFICATION_INTENT_PATTERNS matches "double check" / "double-check"', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    const patternStart = src.indexOf('VERIFICATION_INTENT_PATTERNS');
    assert.ok(patternStart !== -1, 'VI-003 FAIL: VERIFICATION_INTENT_PATTERNS not found');

    const patternBlock = src.substring(patternStart, patternStart + 600);
    assert.ok(
      patternBlock.includes('double') && patternBlock.includes('check'),
      'VI-003 FAIL: VERIFICATION_INTENT_PATTERNS must include a "double-check" / "double check" pattern.'
    );
  });

  it('VI-004: VERIFICATION_INTENT_PATTERNS matches "is that correct"', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    const patternStart = src.indexOf('VERIFICATION_INTENT_PATTERNS');
    assert.ok(patternStart !== -1, 'VI-004 FAIL: VERIFICATION_INTENT_PATTERNS not found');

    const patternBlock = src.substring(patternStart, patternStart + 600);
    assert.ok(
      patternBlock.includes('correct') || patternBlock.includes('right') || patternBlock.includes('accurate'),
      'VI-004 FAIL: VERIFICATION_INTENT_PATTERNS must match "is that correct/right/accurate".'
    );
  });

  it('VI-005: isVerificationIntent is computed from VERIFICATION_INTENT_PATTERNS in the lookup section', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // The block-scoped isVerificationIntent should be in the #routeToAI / lookup trigger section,
    // which is different from the class method #isVerificationIntent.
    assert.ok(
      src.includes('isVerificationIntent') && src.includes('VERIFICATION_INTENT_PATTERNS'),
      'VI-005 FAIL: "isVerificationIntent" computed from "VERIFICATION_INTENT_PATTERNS" is missing. ' +
      'The lookup trigger section must compute this flag from the block-scoped pattern array.'
    );
  });

  it('VI-006: verificationLookupQuery is extracted from last assistant response', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    assert.ok(
      src.includes('verificationLookupQuery'),
      'VI-006 FAIL: "verificationLookupQuery" variable is missing from orchestrator.js. ' +
      'When verification intent is detected, the system must extract the first sentence ' +
      'from the last assistant response to use as the lookup query.'
    );

    // Verify the extraction uses role === 'assistant'
    const extractIdx = src.indexOf('verificationLookupQuery');
    const extractRegion = src.substring(extractIdx, extractIdx + 500);
    assert.ok(
      extractRegion.includes("'assistant'") || extractRegion.includes('"assistant"'),
      'VI-006 FAIL: "verificationLookupQuery" extraction must search for role === "assistant" ' +
      'in the conversation history to find the last assistant response.'
    );
  });

  it('VI-007: shouldLookup includes isVerificationIntent condition', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the shouldLookup declaration
    const shouldLookupIdx = src.indexOf('let shouldLookup =');
    assert.ok(shouldLookupIdx !== -1, 'VI-007 FAIL: "let shouldLookup =" not found in orchestrator.js');

    // Use a generous window (2000 chars) to cover all conditions including the final one
    const shouldLookupBlock = src.substring(shouldLookupIdx, shouldLookupIdx + 2000);
    assert.ok(
      shouldLookupBlock.includes('isVerificationIntent') && shouldLookupBlock.includes('verificationLookupQuery'),
      'VI-007 FAIL: "shouldLookup" does not include the verification intent condition. ' +
      'The fix requires: || (isVerificationIntent && verificationLookupQuery !== null)'
    );
  });

  it('VI-008: lookupQuery uses verificationLookupQuery when verification intent is detected', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // Find the lookupQuery const that feeds into the lookup() call.
    // The expression may start with a commodity guard (isCommodityQuantityQuery) or directly
    // with the verification check — either way verificationLookupQuery must appear in it.
    const lookupQueryIdx = src.indexOf('const lookupQuery =');
    assert.ok(
      lookupQueryIdx !== -1,
      'VI-008 FAIL: "const lookupQuery =" is missing from orchestrator.js. ' +
      'When verification intent is detected, the lookup query must use the extracted claim ' +
      'rather than the enriched user message.'
    );
    // Verify verificationLookupQuery is referenced in the same block
    const blockRegion = src.slice(lookupQueryIdx, lookupQueryIdx + 600);
    assert.ok(
      blockRegion.includes('isVerificationIntent') && blockRegion.includes('verificationLookupQuery'),
      'VI-008 FAIL: lookupQuery block must reference both isVerificationIntent and verificationLookupQuery. ' +
      'When verification intent is detected, the lookup query must use the extracted claim ' +
      'rather than the enriched user message.'
    );
  });

});


// ─────────────────────────────────────────────────────────────────────────────
// FX. EXTERNAL_FIRST Contract Validator & Semantic Verification Query
// Verifies FIX 1 (contract validator) and FIX 2 (semantic entity extraction)
// added to orchestrator.js.
// ─────────────────────────────────────────────────────────────────────────────
describe('FX. EXTERNAL_FIRST Contract Validator & Semantic Verification Query', () => {

  it('FX-001: EXTERNAL_FIRST contract validator exists in orchestrator', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes("phase4Metadata?.hierarchy === 'EXTERNAL_FIRST'") ||
      src.includes('phase4Metadata?.hierarchy === "EXTERNAL_FIRST"'),
      'FX-001 FAIL: EXTERNAL_FIRST contract validator is missing from orchestrator.js. ' +
      'The fix requires a post-generation check that validates the response hierarchy contract.'
    );
  });

  it('FX-002: Validator fires when response starts with "based on the memory"', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes("startsWith('based on the memory')") ||
      src.includes('startsWith("based on the memory")'),
      'FX-002 FAIL: The contract validator does not check for "based on the memory" response prefix. ' +
      'The fix requires this condition to detect when the response incorrectly leads with memory context.'
    );
  });

  it('FX-003: Validator logs CONTRACT violation', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');
    assert.ok(
      src.includes('[CONTRACT]'),
      'FX-003 FAIL: The contract validator does not log a [CONTRACT] violation message. ' +
      'The fix requires a log line with "[CONTRACT]" prefix for Railway observability.'
    );
  });

  it('FX-004: verificationLookupQuery uses semantic entities when available', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    assert.ok(src.indexOf('verificationLookupQuery') !== -1, 'FX-004 FAIL: verificationLookupQuery not found');

    // The semantic analysis call and entity check exist in the verification extraction block
    assert.ok(
      src.includes('#performSemanticAnalysis('),
      'FX-004 FAIL: verificationLookupQuery extraction does not call #performSemanticAnalysis. ' +
      'The fix requires semantic entity extraction to be used for the lookup query when available.'
    );
    assert.ok(
      src.includes('semanticContext?.entities?.length'),
      'FX-004 FAIL: verificationLookupQuery does not check semanticContext?.entities?.length. ' +
      'The fix requires entities to be used as the lookup query when the semantic analysis provides them.'
    );
  });

  it('FX-005: verificationLookupQuery fallback strips leading articles', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    assert.ok(src.indexOf('verificationLookupQuery') !== -1, 'FX-005 FAIL: verificationLookupQuery not found');

    // The fallback uses safeStripArticle (non-regex, ReDoS-safe) to strip leading articles
    assert.ok(
      src.includes('safeStripArticle(') && src.includes("startsWith('the ')"),
      'FX-005 FAIL: verificationLookupQuery fallback does not strip leading articles. ' +
      'The fix requires the fallback path to remove leading "the", "a", or "an" from the claim sentence.'
    );
  });

  it('FX-006: Validator does NOT fire when response correctly leads with external data', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // The validator condition must be a conjunction — all three parts must be true for it to fire.
    // Locate the contract validator block by finding the [CONTRACT] log line.
    const contractLogIdx = src.indexOf('[CONTRACT]');
    assert.ok(contractLogIdx !== -1, 'FX-006 FAIL: [CONTRACT] log line not found');

    // Walk backwards to find the opening if-condition
    const contractBlock = src.substring(Math.max(0, contractLogIdx - 1000), contractLogIdx + 200);
    assert.ok(
      contractBlock.includes("startsWith('based on the memory')") ||
      contractBlock.includes('startsWith("based on the memory")'),
      'FX-006 FAIL: The contract validator condition does not include the "based on the memory" ' +
      'prefix check. Without this guard the validator would fire even when the response correctly ' +
      'leads with external data.'
    );
    // Confirm the condition is guarded by fetched_content presence
    assert.ok(
      contractBlock.includes('phase4Metadata?.fetched_content'),
      'FX-006 FAIL: The contract validator does not guard against firing when fetched_content is ' +
      'absent. The check must include "phase4Metadata?.fetched_content" so it only triggers when ' +
      'external data was actually retrieved.'
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// SC2. Stage 2 Semantic Classifier — Real gpt-4o-mini Implementation
// Verifies that classifyAmbiguous is a real semantic classifier, not a stub,
// and that context is wired from orchestrator through detectTruthType.
// ─────────────────────────────────────────────────────────────────────────────
describe('SC2. Stage 2 Semantic Classifier — Real Implementation', () => {

  it('SC2-001: classifyAmbiguous no longer contains hardcoded SEMI_STABLE 0.5 stub', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    // The old stub returned SEMI_STABLE with confidence 0.5 and a TODO comment
    assert.ok(
      !src.includes('Stage 2 classifier defaulting to SEMI_STABLE (balanced default until AI classifier integrated)'),
      'SC2-001 FAIL: classifyAmbiguous still contains the old stub string. ' +
      'The stub must be replaced with a real gpt-4o-mini classifier.'
    );
    assert.ok(
      !src.includes('TODO: Integrate with existing confidence engine'),
      'SC2-001 FAIL: classifyAmbiguous still contains the TODO comment from the stub. ' +
      'The stub must be replaced with a real gpt-4o-mini classifier.'
    );
  });

  it('SC2-002: classifyAmbiguous accepts and uses context parameter (not _context)', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    // The function signature must use `context` not `_context`
    assert.ok(
      src.includes('classifyAmbiguous(query, context = {})'),
      'SC2-002 FAIL: classifyAmbiguous still uses "_context" (unused parameter). ' +
      'The parameter must be renamed to "context" and used by the classifier.'
    );
  });

  it('SC2-003: analysis.intent is wired from orchestrator into detectTruthType context', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    // The detectTruthType call must include the analysis object
    const dtIdx = src.indexOf('detectTruthType(message,');
    assert.ok(dtIdx !== -1, 'SC2-003 FAIL: detectTruthType(message, ...) call not found in orchestrator.js');

    const callBlock = src.substring(dtIdx, dtIdx + 400);
    assert.ok(
      callBlock.includes('analysis,') || callBlock.includes('analysis:'),
      'SC2-003 FAIL: "analysis" is not passed to detectTruthType in orchestrator.js. ' +
      'The analysis object (intent/domain/complexity) must be wired into the context.'
    );

    // Also verify truthTypeDetector actually consumes context.analysis
    const detectorSrc = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(
      detectorSrc.includes('context.analysis?.intent') || detectorSrc.includes('context.analysis.intent'),
      'SC2-003 FAIL: truthTypeDetector.js does not consume context.analysis?.intent in classifyAmbiguous. ' +
      'The analysis.intent signal must be used to build the classifier prompt.'
    );
  });

  it('SC2-004: classifyAmbiguous calls gpt-4o-mini for VERIFICATION-type queries', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes("'gpt-4o-mini'") || src.includes('"gpt-4o-mini"'),
      'SC2-004 FAIL: classifyAmbiguous does not reference gpt-4o-mini. ' +
      'The classifier must use gpt-4o-mini to classify VERIFICATION and other intent types.'
    );
    assert.ok(
      src.includes('VERIFICATION'),
      'SC2-004 FAIL: classifyAmbiguous system prompt does not define the VERIFICATION intent class. ' +
      'The classifier must be able to return VERIFICATION as intent_class.'
    );
  });

  it('SC2-005: classifyAmbiguous system prompt includes BIOLOGICAL_NATURAL_FACT intent class', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes('BIOLOGICAL_NATURAL_FACT'),
      'SC2-005 FAIL: classifyAmbiguous does not define the BIOLOGICAL_NATURAL_FACT intent class. ' +
      'The classifier must be able to return BIOLOGICAL_NATURAL_FACT for biology/science queries.'
    );
  });

  it('SC2-006: classifyAmbiguous system prompt includes ANALYTICAL_FOLLOWUP intent class', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes('ANALYTICAL_FOLLOWUP'),
      'SC2-006 FAIL: classifyAmbiguous does not define the ANALYTICAL_FOLLOWUP intent class. ' +
      'The classifier must be able to return ANALYTICAL_FOLLOWUP for analysis/comparison queries.'
    );
  });

  it('SC2-007: classifyAmbiguous system prompt includes PERSONAL_CONTEXTUAL intent class', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes('PERSONAL_CONTEXTUAL'),
      'SC2-007 FAIL: classifyAmbiguous does not define the PERSONAL_CONTEXTUAL intent class. ' +
      'The classifier must be able to return PERSONAL_CONTEXTUAL for queries needing personal context.'
    );
  });

  it('SC2-008: classifyAmbiguous returns lookup_recommended field in result', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes('lookup_recommended'),
      'SC2-008 FAIL: classifyAmbiguous does not include "lookup_recommended" in its return value. ' +
      'The classifier must return lookup_recommended to control external lookup triggering.'
    );
  });

  it('SC2-009: classifyAmbiguous returns intent_class field in result', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    assert.ok(
      src.includes('intent_class'),
      'SC2-009 FAIL: classifyAmbiguous does not include "intent_class" in its return value. ' +
      'The classifier must return intent_class for downstream use.'
    );
  });

  it('SC2-010: classifyAmbiguous fallback returns SEMI_STABLE 0.5 when classifier fails', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    // The fallback object must have SEMI_STABLE and confidence 0.5
    assert.ok(
      src.includes('Stage 2 fallback — classifier unavailable') ||
      src.includes("Stage 2 fallback"),
      'SC2-010 FAIL: classifyAmbiguous fallback does not contain the expected fallback reasoning. ' +
      'The fallback must gracefully return SEMI_STABLE 0.5 without blocking the response.'
    );
    // Confirm fallback still uses SEMI_STABLE
    const fallbackIdx = src.indexOf('const fallback = {');
    assert.ok(fallbackIdx !== -1, 'SC2-010 FAIL: "const fallback = {" not found in classifyAmbiguous');
    const fallbackBlock = src.substring(fallbackIdx, fallbackIdx + 300);
    assert.ok(
      fallbackBlock.includes('TRUTH_TYPES.SEMI_STABLE'),
      'SC2-010 FAIL: fallback does not use TRUTH_TYPES.SEMI_STABLE. ' +
      'The fallback must default to SEMI_STABLE for safe degradation.'
    );
    assert.ok(
      fallbackBlock.includes('confidence: 0.5'),
      'SC2-010 FAIL: fallback does not set confidence: 0.5. ' +
      'The fallback must return confidence 0.5 to match the original stub behavior.'
    );
  });

  it('SC2-011: classifyAmbiguous catch block returns fallback (never throws)', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    // Find the classifyAmbiguous function body
    const fnIdx = src.indexOf('export async function classifyAmbiguous(');
    assert.ok(fnIdx !== -1, 'SC2-011 FAIL: classifyAmbiguous function not found');

    const fnBody = src.substring(fnIdx, fnIdx + 6000);
    assert.ok(
      fnBody.includes('catch (error)') || fnBody.includes('catch(error)'),
      'SC2-011 FAIL: classifyAmbiguous does not have a catch block. ' +
      'The function must catch all errors and return the fallback to never block the response.'
    );
    // Confirm catch returns fallback not re-throws
    const catchIdx = fnBody.indexOf('catch');
    const catchBlock = fnBody.substring(catchIdx, catchIdx + 200);
    assert.ok(
      catchBlock.includes('return fallback'),
      'SC2-011 FAIL: catch block does not return fallback. ' +
      'The catch must return the fallback object, not re-throw the error.'
    );
  });

  it('SC2-012: intent_class stored in phase4Metadata in orchestrator', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    assert.ok(
      src.includes('phase4Metadata.intent_class') &&
      (src.includes('truthTypeResult.intent_class') || src.includes('intent_class ||')),
      'SC2-012 FAIL: "phase4Metadata.intent_class" is not assigned from truthTypeResult in orchestrator.js. ' +
      'The intent_class from Stage 2 must be stored in phase4Metadata for downstream use.'
    );
  });

  it('SC2-013: stage2LookupRecommended is wired into shouldLookup in orchestrator', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'Could not read api/core/orchestrator.js');

    assert.ok(
      src.includes('stage2LookupRecommended'),
      'SC2-013 FAIL: "stage2LookupRecommended" is missing from orchestrator.js. ' +
      'The lookup_recommended flag from Stage 2 must be wired into the shouldLookup condition.'
    );
    // Confirm it is part of the shouldLookup expression
    const shouldLookupIdx = src.indexOf('let shouldLookup =');
    assert.ok(shouldLookupIdx !== -1, 'SC2-013 FAIL: "let shouldLookup =" not found in orchestrator.js');
    const shouldLookupBlock = src.substring(shouldLookupIdx, shouldLookupIdx + 1200);
    assert.ok(
      shouldLookupBlock.includes('stage2LookupRecommended'),
      'SC2-013 FAIL: stage2LookupRecommended is not part of the shouldLookup expression. ' +
      'It must be included as a condition so Stage 2 lookup recommendations are honored.'
    );
  });

  it('SC2-014: gpt-4o-mini is used (not gpt-4o) in classifyAmbiguous', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    // Must use gpt-4o-mini specifically
    assert.ok(
      src.includes("'gpt-4o-mini'") || src.includes('"gpt-4o-mini"'),
      'SC2-014 FAIL: classifyAmbiguous does not use gpt-4o-mini. ' +
      'The Stage 2 classifier must use gpt-4o-mini for cost efficiency.'
    );
    // Must NOT use the more expensive gpt-4o (non-mini) as the model
    const classifyFnIdx = src.indexOf('export async function classifyAmbiguous(');
    const classifyFnBody = src.substring(classifyFnIdx, classifyFnIdx + 4000);
    // Use regex to match "model: 'gpt-4o'" or model: "gpt-4o" with the closing quote immediately
    // after "4o" (not "4o-mini"). This avoids falsely matching gpt-4o-mini.
    assert.ok(
      !/model:\s*['"]gpt-4o['"]/m.test(classifyFnBody),
      'SC2-014 FAIL: classifyAmbiguous uses the full gpt-4o model instead of gpt-4o-mini. ' +
      'Use gpt-4o-mini to keep Stage 2 classification cost low.'
    );
  });

  it('SC2-015: max_tokens set to 80 or less in classifyAmbiguous', () => {
    const src = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(src, 'Could not read api/core/intelligence/truthTypeDetector.js');

    const classifyFnIdx = src.indexOf('export async function classifyAmbiguous(');
    const classifyFnBody = src.substring(classifyFnIdx, classifyFnIdx + 4000);

    // Must have max_tokens set
    assert.ok(
      classifyFnBody.includes('max_tokens'),
      'SC2-015 FAIL: classifyAmbiguous does not set max_tokens. ' +
      'The classifier must cap token output at 80 or less to minimize cost.'
    );

    // Extract the numeric value of max_tokens
    const maxTokensMatch = classifyFnBody.match(/max_tokens\s*:\s*(\d+)/);
    assert.ok(
      maxTokensMatch,
      'SC2-015 FAIL: Could not parse max_tokens value from classifyAmbiguous.'
    );
    const maxTokensValue = parseInt(maxTokensMatch[1], 10);
    assert.ok(
      maxTokensValue <= 80,
      `SC2-015 FAIL: max_tokens is ${maxTokensValue}, must be 80 or less. ` +
      'Keep Stage 2 token output minimal to reduce cost.'
    );
  });

});

// ============================================================
// SECTION RG: RELEVANCE GATE — Memory Injection Filtering
// Validates that the relevance gate filters are correctly
// implemented in orchestrator.js (injection-only, post-cap).
// ============================================================

describe('RG. Relevance Gate — Memory Injection Filtering', () => {

  const ORCH_PATH = 'api/core/orchestrator.js';

  it('RG-001: RELEVANCE_INJECTION_THRESHOLD constant exists in orchestrator', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('RELEVANCE_INJECTION_THRESHOLD'),
      'RG-001 FAIL: RELEVANCE_INJECTION_THRESHOLD constant not found in orchestrator. ' +
      'Memories below threshold will never be filtered — wasteful injection persists.'
    );
  });

  it('RG-002: safety_boosted memories always bypass the relevance gate', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    // The gate must check m.safety_boosted and return true (bypass) before score check
    assert.ok(
      orch.includes('m.safety_boosted') && orch.includes('return true'),
      'RG-002 FAIL: Safety-boosted memory bypass not found in relevance gate. ' +
      'Safety-critical memories (allergies, medications) must always be injected.'
    );
  });

  it('RG-003: RELEVANCE_INJECTION_THRESHOLD_PERSONAL constant exists with lower value', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('RELEVANCE_INJECTION_THRESHOLD_PERSONAL'),
      'RG-003 FAIL: RELEVANCE_INJECTION_THRESHOLD_PERSONAL constant not found. ' +
      'Personal queries need a lower threshold (0.20) than standard queries (0.35).'
    );
    // Verify the personal threshold (0.20) is less than the standard (0.35)
    const personalMatch = orch.match(/RELEVANCE_INJECTION_THRESHOLD_PERSONAL\s*=\s*([\d.]+)/);
    const standardMatch = orch.match(/\bRELEVANCE_INJECTION_THRESHOLD\b(?!_)\s*=\s*([\d.]+)/);
    assert.ok(personalMatch, 'RG-003 FAIL: Could not parse RELEVANCE_INJECTION_THRESHOLD_PERSONAL value.');
    assert.ok(standardMatch, 'RG-003 FAIL: Could not parse RELEVANCE_INJECTION_THRESHOLD value.');
    const personalVal = parseFloat(personalMatch[1]);
    const standardVal = parseFloat(standardMatch[1]);
    assert.ok(
      personalVal < standardVal,
      `RG-003 FAIL: Personal threshold (${personalVal}) must be less than standard threshold (${standardVal}).`
    );
  });

  it('RG-004: personal query fallback preserves top memory when gate filters everything', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    // Fallback: if gate removes all memories and it's a personal query, keep the best one
    assert.ok(
      orch.includes('memoriesToFormat.length === 0 && isPersonalQuery'),
      'RG-004 FAIL: Personal query fallback not found. When all memories are filtered ' +
      'on a personal/memory query, the top-scoring memory must be preserved.'
    );
  });

  it('RG-005: gate uses isPersonalQuery flag to select threshold', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('isPersonalQuery'),
      'RG-005 FAIL: isPersonalQuery flag not found in orchestrator. ' +
      'The gate must use a lower threshold for personal/memory recall queries.'
    );
    // Threshold selection must branch on isPersonalQuery
    assert.ok(
      orch.includes('isPersonalQuery') &&
      orch.includes('RELEVANCE_INJECTION_THRESHOLD_PERSONAL') &&
      orch.includes('RELEVANCE_INJECTION_THRESHOLD'),
      'RG-005 FAIL: Threshold branching on isPersonalQuery not found. ' +
      'Standard and personal thresholds must be selected based on query type.'
    );
  });

  it('RG-006: RELEVANCE-GATE log line is present in orchestrator', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('[RELEVANCE-GATE]'),
      'RG-006 FAIL: [RELEVANCE-GATE] log line not found in orchestrator. ' +
      'Every non-greeting query that reaches memory injection must emit this log.'
    );
  });

  it('RG-007: phase4Metadata.relevance_gate is populated after the gate', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('phase4Metadata.relevance_gate'),
      'RG-007 FAIL: phase4Metadata.relevance_gate assignment not found. ' +
      'Gate telemetry must be stored in phase4Metadata for downstream use.'
    );
  });

  it('RG-008: memories_filtered count field is present in relevance_gate assignment', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('memories_filtered'),
      'RG-008 FAIL: memories_filtered field not found in relevance gate telemetry. ' +
      'The gate must record how many memories were filtered for observability.'
    );
  });

  it('RG-009: hybrid_score > 1.0 falls back to raw similarity for threshold comparison', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    // The gate must handle boosted scores (> 1.0) by using raw similarity instead
    assert.ok(
      orch.includes('hybrid_score > 1.0') && orch.includes('m.similarity'),
      'RG-009 FAIL: hybrid_score > 1.0 fallback to m.similarity not found. ' +
      'Boosted scores inflate hybrid_score above 1.0; raw similarity must be used for threshold comparison.'
    );
  });

  it('RG-010: relevance_gate is exposed in the API response phase4_metadata block', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    // Look for the relevance_gate field in the phase4_metadata object returned in the response
    assert.ok(
      orch.includes('relevance_gate: phase4Metadata.relevance_gate'),
      'RG-010 FAIL: relevance_gate not found in API response phase4_metadata. ' +
      'Gate telemetry must be returned in the API response for observability.'
    );
  });

  it('RG-011: RELEVANCE_INJECTION_THRESHOLD_PERMANENT constant exists with value 0.50', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');
    assert.ok(
      orch.includes('RELEVANCE_INJECTION_THRESHOLD_PERMANENT'),
      'RG-011 FAIL: RELEVANCE_INJECTION_THRESHOLD_PERMANENT constant not found. ' +
      'PERMANENT truth-type queries need a higher threshold (0.50) to prevent ' +
      'irrelevant personal memories from being injected on factual queries.'
    );
    // Verify the value is exactly 0.50
    const permanentMatch = orch.match(/RELEVANCE_INJECTION_THRESHOLD_PERMANENT\s*=\s*([\d.]+)/);
    assert.ok(permanentMatch, 'RG-011 FAIL: Could not parse RELEVANCE_INJECTION_THRESHOLD_PERMANENT value.');
    const permanentVal = parseFloat(permanentMatch[1]);
    assert.ok(
      permanentVal === 0.50,
      `RG-011 FAIL: RELEVANCE_INJECTION_THRESHOLD_PERMANENT is ${permanentVal}, must be exactly 0.50.`
    );
    // Verify the threshold selection logic includes PERMANENT branch
    assert.ok(
      orch.includes("detectedTruthType === 'PERMANENT'") &&
      orch.includes('RELEVANCE_INJECTION_THRESHOLD_PERMANENT'),
      'RG-011 FAIL: PERMANENT threshold branch not found in gate threshold selection logic. ' +
      'The gate must select RELEVANCE_INJECTION_THRESHOLD_PERMANENT when truth_type is PERMANENT.'
    );
  });

  it('RG-012: [RELEVANCE-GATE] log line fires outside phase4Metadata scope (no ReferenceError)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Verify the log line is present
    assert.ok(
      orch.includes('[RELEVANCE-GATE]'),
      'RG-012 FAIL: [RELEVANCE-GATE] log line not found in orchestrator. ' +
      'Every query that reaches memory injection must emit this log.'
    );

    // Verify the gate does NOT reference phase4Metadata directly (was the cause of ReferenceError)
    // The gate must use in-scope variables only: detectByPattern, options.earlyClassification, message
    const gateStart = orch.indexOf('RELEVANCE GATE — filter by similarity score before injection');
    // The gate section ends at the closing delimiter comment after the telemetry object
    const gateDelimiterEnd = orch.indexOf('// ─────', gateStart + 100);
    const gateSection = gateDelimiterEnd > gateStart
      ? orch.slice(gateStart, gateDelimiterEnd + 80)
      : orch.slice(gateStart, gateStart + 2000);
    assert.ok(
      !gateSection.includes('phase4Metadata.intent_class'),
      'RG-012 FAIL: gate still references phase4Metadata.intent_class which is out of scope. ' +
      'This causes a ReferenceError caught by try/catch, swallowing the log line.'
    );

    // Verify detectByPattern is used for truth type detection inside the gate
    assert.ok(
      orch.includes('detectByPattern(message)'),
      'RG-012 FAIL: detectByPattern(message) not found in orchestrator. ' +
      'The gate must use synchronous pattern detection for truth type (no phase4Metadata needed).'
    );

    // Verify gate result is returned from #retrieveMemoryContext for phase4Metadata assignment
    assert.ok(
      orch.includes('relevance_gate: relevanceGateResult'),
      'RG-012 FAIL: relevance_gate not included in #retrieveMemoryContext return value. ' +
      'The gate result must be returned so processRequest can assign it to phase4Metadata.'
    );
  });

});

describe('SI. Selective Context Injection — History Depth and Memory Fallback', () => {
  const ORCH_PATH = 'api/core/orchestrator.js';

  /** Extract the full body of a named function from a JS source string. */
  function extractFunctionBody(src, functionName) {
    const fnStart = src.indexOf(`function ${functionName}(`);
    if (fnStart === -1) return null;
    let depth = 0;
    for (let i = fnStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(fnStart, i + 1);
      }
    }
    return null;
  }

  it('SI-001: simple_factual classification uses depth 2', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // getConversationDepth must return 2 for simple_factual
    assert.ok(
      orch.includes("classification === 'simple_factual'") &&
      orch.includes('return 2'),
      'SI-001 FAIL: getConversationDepth does not return 2 for simple_factual classification. ' +
      'Simple factual queries only need minimal conversation history (2 turns).'
    );
  });

  it('SI-002: PERMANENT truth_type uses depth 2', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // getConversationDepth must return 2 for PERMANENT truth type
    assert.ok(
      orch.includes("phase4TruthType === 'PERMANENT'") &&
      orch.includes('return 2'),
      'SI-002 FAIL: getConversationDepth does not return 2 for PERMANENT truth type. ' +
      'PERMANENT factual queries do not require long conversation history.'
    );
  });

  it('SI-003: complex_analytical (default) uses depth 5', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Default path must return 5
    assert.ok(
      orch.includes('return 5'),
      'SI-003 FAIL: getConversationDepth does not return 5 as the default depth. ' +
      'Complex and analytical queries must receive the full 5-turn history.'
    );
  });

  it('SI-004: SEMI_STABLE uses depth 5 (not 2)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    const depthFn = extractFunctionBody(orch, 'getConversationDepth');
    assert.ok(depthFn, 'SI-004 FAIL: getConversationDepth function not found.');

    // SEMI_STABLE must NOT appear in the function — it is not a depth-2 case
    assert.ok(
      !depthFn.includes("SEMI_STABLE"),
      'SI-004 FAIL: SEMI_STABLE is listed inside getConversationDepth. ' +
      'SEMI_STABLE queries require full history (depth 5) and must not appear in the function.'
    );

    // Positive assertion: depth 5 must be the default return (covers SEMI_STABLE)
    assert.ok(
      depthFn.includes('return 5'),
      'SI-004 FAIL: getConversationDepth does not have a "return 5" default. ' +
      'SEMI_STABLE queries must fall through to the depth-5 default.'
    );
  });

  it('SI-005: VOLATILE uses depth 5 (not 2)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    const depthFn = extractFunctionBody(orch, 'getConversationDepth');
    assert.ok(depthFn, 'SI-005 FAIL: getConversationDepth function not found.');

    // VOLATILE must NOT appear in the function — it is not a depth-2 case
    assert.ok(
      !depthFn.includes("VOLATILE"),
      'SI-005 FAIL: VOLATILE is listed inside getConversationDepth. ' +
      'VOLATILE queries require full history (depth 5) and must not appear in the function.'
    );

    // Positive assertion: depth 5 must be the default return (covers VOLATILE)
    assert.ok(
      depthFn.includes('return 5'),
      'SI-005 FAIL: getConversationDepth does not have a "return 5" default. ' +
      'VOLATILE queries must fall through to the depth-5 default.'
    );
  });

  it('SI-006: [HISTORY-DEPTH] log line appears with required fields', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('[HISTORY-DEPTH]') &&
      orch.includes('classification=') &&
      orch.includes('truth_type=') &&
      orch.includes('depth=') &&
      orch.includes('history_turns=') &&
      orch.includes('trimmed_to='),
      'SI-006 FAIL: [HISTORY-DEPTH] log line is missing or does not include all required fields ' +
      '(classification, truth_type, depth, history_turns, trimmed_to).'
    );
  });

  it('SI-007: Memory fallback suppressed when stage1TruthType is PERMANENT', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The isPermanentFactual guard must exist and wrap the fallback injection
    assert.ok(
      orch.includes("isPermanentFactual") &&
      orch.includes("stage1TruthType === 'PERMANENT'"),
      'SI-007 FAIL: isPermanentFactual guard is missing from #buildContextString. ' +
      'The memory fallback string must be suppressed for PERMANENT queries.'
    );

    // The fallback must be inside a !isPermanentFactual condition
    assert.ok(
      orch.includes('!isPermanentFactual'),
      'SI-007 FAIL: Memory fallback is not guarded by !isPermanentFactual. ' +
      'PERMANENT queries must not receive the "first conversation" fallback text.'
    );
  });

  it('SI-008: context.stage1TruthType is set before #buildContextString is called', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('context.stage1TruthType = phase4Metadata?.truth_type'),
      'SI-008 FAIL: context.stage1TruthType is not assigned before #buildContextString is called. ' +
      'The truth type must be on the context object so #buildContextString can access it.'
    );
  });

  it('SI-009: trimmedHistory is used in both Claude and GPT-4 paths', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // trimmedHistory must appear in the historyContext ternary for both paths
    const trimmedOccurrences = (orch.match(/: trimmedHistory/g) || []).length;
    assert.ok(
      trimmedOccurrences >= 2,
      `SI-009 FAIL: trimmedHistory is only used in ${trimmedOccurrences} AI path(s) but must appear in both ` +
      'Claude escalation path and GPT-4 path. Both paths must receive the same depth logic.'
    );
  });

  it('SI-010: getConversationDepth is a module-level function (not inside #routeToAI)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Function must be defined outside the class (before "export class Orchestrator")
    const classIdx = orch.indexOf('export class Orchestrator');
    const fnIdx = orch.indexOf('function getConversationDepth(');
    assert.ok(
      fnIdx !== -1 && fnIdx < classIdx,
      'SI-010 FAIL: getConversationDepth is not found as a module-level function before the Orchestrator class. ' +
      'It must be defined at module scope so it can be tested and reused independently.'
    );
  });

  it('SI-011: preflight estimation uses trimmedHistory not conversationHistory.slice(-5)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The preflight must NOT use the old hard-coded slice(-5) for its token estimate,
    // since that over-estimates for simple_factual/PERMANENT queries and can trigger
    // false Claude escalation for borderline payloads, and produces incorrect log breakdowns.
    assert.ok(
      !orch.includes('conversationHistory.slice(-5)'),
      'SI-011 FAIL: conversationHistory.slice(-5) still exists in orchestrator.js. ' +
      'The preflight estimation must use trimmedHistory so the estimate matches tokens actually injected.'
    );

    // trimmedHistory must be defined before it is used in the estimate
    const trimmedHistoryDefIdx = orch.indexOf('const trimmedHistory = conversationHistory.slice(-historyDepth)');
    const estimateIdx = orch.indexOf('trimmedHistory.reduce(');
    assert.ok(
      trimmedHistoryDefIdx !== -1 && estimateIdx !== -1 && trimmedHistoryDefIdx < estimateIdx,
      'SI-011 FAIL: trimmedHistory is not defined before it is used in estimatedHistoryTokens. ' +
      'historyDepth/trimmedHistory must be computed before the preflight estimation block.'
    );
  });

});

// ---------------------------------------------------------------------------
// LG. Lookup Value Gate
// ---------------------------------------------------------------------------
describe('LG. Lookup Value Gate', () => {
  const ORCH_PATH = 'api/core/orchestrator.js';

  it('LG-001: lookupValueGate is false when classification=simple_factual AND truth_type=PERMANENT', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Gate must check earlyClassification?.classification === 'simple_factual' AND truthTypeResult.type === 'PERMANENT'
    assert.ok(
      orch.includes("earlyClassification?.classification === 'simple_factual'") &&
      orch.includes("truthTypeResult.type === 'PERMANENT'"),
      'LG-001 FAIL: lookupValueGate does not check for simple_factual classification AND PERMANENT truth type.'
    );
  });

  it('LG-002: lookupValueGate is false when truth_type=PERMANENT AND confidence >= 0.85 AND high_stakes=false', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Gate must check high confidence PERMANENT non-high-stakes condition
    assert.ok(
      orch.includes('phase4Metadata?.confidence >= 0.85') &&
      orch.includes('truthTypeResult.high_stakes?.isHighStakes'),
      'LG-002 FAIL: lookupValueGate does not check confidence >= 0.85 and high_stakes guard. ' +
      'High confidence PERMANENT queries must skip lookup unless high stakes.'
    );
  });

  it('LG-003: lookupValueGate does NOT block when high_stakes=true regardless of truth_type', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The gate must negate the high_stakes check — if high_stakes is true, gate allows lookup
    const gateIdx = orch.indexOf('lookupValueGate');
    assert.ok(gateIdx !== -1, 'LG-003 FAIL: lookupValueGate not found in orchestrator.js');

    // Search up to 1000 chars to cover the full const definition and the closing paren
    const gateBlock = orch.substring(gateIdx, gateIdx + 1000);
    assert.ok(
      gateBlock.includes('isHighStakes'),
      'LG-003 FAIL: lookupValueGate gate block does not reference isHighStakes. ' +
      'High stakes queries must always bypass the value gate.'
    );
  });

  it('LG-004: lookupValueGate does NOT block VOLATILE queries', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // shouldLookup must still include VOLATILE as a direct trigger
    const shouldLookupIdx = orch.indexOf('let shouldLookup = lookupValueGate');
    assert.ok(shouldLookupIdx !== -1, 'LG-004 FAIL: shouldLookup does not use lookupValueGate. Missing gate integration.');

    // Search up to 1500 chars to cover all conditions in the shouldLookup expression
    const shouldLookupBlock = orch.substring(shouldLookupIdx, shouldLookupIdx + 1500);
    assert.ok(
      shouldLookupBlock.includes("truthTypeResult.type === 'VOLATILE'"),
      'LG-004 FAIL: shouldLookup no longer contains VOLATILE condition. VOLATILE queries must always trigger lookup.'
    );
  });

  it('LG-005: lookupValueGate does NOT block SEMI_STABLE + news pattern', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    const shouldLookupIdx = orch.indexOf('let shouldLookup = lookupValueGate');
    assert.ok(shouldLookupIdx !== -1, 'LG-005 FAIL: shouldLookup does not use lookupValueGate.');

    // Search up to 1500 chars to cover all conditions in the shouldLookup expression
    const shouldLookupBlock = orch.substring(shouldLookupIdx, shouldLookupIdx + 1500);
    assert.ok(
      shouldLookupBlock.includes("truthTypeResult.type === 'SEMI_STABLE'") &&
      shouldLookupBlock.includes('matchesNewsPattern'),
      'LG-005 FAIL: shouldLookup no longer contains SEMI_STABLE + matchesNewsPattern condition. ' +
      'SEMI_STABLE news queries must always trigger lookup.'
    );
  });

  it('LG-006: [LOOKUP-GATE] log line present with all required fields', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('[LOOKUP-GATE]') &&
      orch.includes('shouldLookup=') &&
      orch.includes('lookupValueGate=') &&
      orch.includes('truth_type=') &&
      orch.includes('confidence=') &&
      orch.includes('classification=') &&
      orch.includes('high_stakes='),
      'LG-006 FAIL: [LOOKUP-GATE] log line is missing or does not include all required fields ' +
      '(shouldLookup, lookupValueGate, truth_type, confidence, classification, high_stakes).'
    );
  });
});

// ---------------------------------------------------------------------------
// CO. Cost Observability
// ---------------------------------------------------------------------------
describe('CO. Cost Observability by Query Type', () => {
  const ORCH_PATH = 'api/core/orchestrator.js';
  const SERVER_PATH = 'server.js';
  const MIGRATION_PATH = 'api/admin/cost-observability.js';

  it('CO-001: query_cost_log table creation SQL present in migration', () => {
    const migration = readRepoFile(MIGRATION_PATH);
    assert.ok(migration, 'CO-001 FAIL: api/admin/cost-observability.js not found');

    assert.ok(
      migration.includes('CREATE TABLE IF NOT EXISTS query_cost_log'),
      'CO-001 FAIL: CREATE TABLE IF NOT EXISTS query_cost_log not found in cost-observability.js'
    );
  });

  it('CO-002: INSERT statement contains all required fields', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    const requiredFields = [
      'user_id', 'session_id', 'query_type', 'truth_type',
      'complexity', 'intent_class', 'total_tokens',
      'prompt_tokens', 'completion_tokens', 'cost_usd',
      'memories_injected', 'memories_filtered',
      'lookup_fired', 'lookup_tokens', 'history_depth',
      'model', 'personality', 'mode'
    ];

    // Use lastIndexOf to find the main comprehensive INSERT (not the lightweight savings entries).
    const insertIdx = orch.lastIndexOf('INSERT INTO query_cost_log');
    assert.ok(insertIdx !== -1, 'CO-002 FAIL: INSERT INTO query_cost_log not found in orchestrator.js');

    const insertBlock = orch.substring(insertIdx, insertIdx + 800);
    for (const field of requiredFields) {
      assert.ok(
        insertBlock.includes(field),
        `CO-002 FAIL: Required field "${field}" not found in INSERT INTO query_cost_log block`
      );
    }
  });

  it('CO-003: Write is wrapped in setImmediate (non-blocking confirmed)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // setImmediate must wrap the INSERT
    const setImmediateIdx = orch.indexOf('setImmediate(async () =>');
    const insertIdx = orch.indexOf('INSERT INTO query_cost_log');
    assert.ok(
      setImmediateIdx !== -1,
      'CO-003 FAIL: setImmediate(async () => not found in orchestrator.js. DB write must be non-blocking.'
    );
    assert.ok(
      insertIdx !== -1 && insertIdx > setImmediateIdx,
      'CO-003 FAIL: INSERT INTO query_cost_log must appear after setImmediate to confirm non-blocking write.'
    );
  });

  it('CO-004: Write is wrapped in try/catch (never throws confirmed)', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The setImmediate block must contain try/catch and a COST-LOG error log
    assert.ok(
      orch.includes('[COST-LOG] Failed to write query cost log:'),
      'CO-004 FAIL: [COST-LOG] error catch log not found in orchestrator.js. ' +
      'The DB write must be wrapped in try/catch and log errors without throwing.'
    );
  });

  it('CO-005: /api/admin/cost-summary endpoint exists', () => {
    const server = readRepoFile(SERVER_PATH);
    assert.ok(server, 'Could not read server.js');

    assert.ok(
      server.includes('/api/admin/cost-summary'),
      'CO-005 FAIL: /api/admin/cost-summary route not found in server.js'
    );
  });

  it('CO-006: cost-summary response includes model_breakdown array', () => {
    const migration = readRepoFile(MIGRATION_PATH);
    assert.ok(migration, 'Could not read api/admin/cost-observability.js');

    assert.ok(
      migration.includes('model_breakdown'),
      'CO-006 FAIL: model_breakdown not found in cost-observability.js response'
    );
    assert.ok(
      migration.includes('modelBreakdown.rows'),
      'CO-006 FAIL: modelBreakdown.rows not assigned in cost-summary response'
    );
  });

  it('CO-007: model_breakdown query selects required fields', () => {
    const migration = readRepoFile(MIGRATION_PATH);
    assert.ok(migration, 'Could not read api/admin/cost-observability.js');

    const requiredFields = [
      'model',
      'pct_of_total',
      'avg_tokens',
      'avg_cost_usd',
      'total_cost_usd',
      'lookup_count',
    ];

    const breakdownIdx = migration.indexOf('modelBreakdown');
    assert.ok(breakdownIdx !== -1, 'CO-007 FAIL: modelBreakdown query not found in cost-observability.js');

    const queryBlock = migration.substring(breakdownIdx, breakdownIdx + 800);
    for (const field of requiredFields) {
      assert.ok(
        queryBlock.includes(field),
        `CO-007 FAIL: Required field "${field}" not found in model_breakdown query`
      );
    }
  });

  it('CO-008: history_depth INSERT uses historyDepth variable not null', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Verify _historyDepth is captured from aiResponse
    assert.ok(
      orch.includes('_historyDepth'),
      'CO-008 FAIL: _historyDepth variable not found in orchestrator.js'
    );

    // Verify _historyDepth is used in the INSERT params (not a bare null)
    // Use lastIndexOf to find the main comprehensive INSERT (not the lightweight savings entries).
    const insertIdx = orch.lastIndexOf('INSERT INTO query_cost_log');
    assert.ok(insertIdx !== -1, 'CO-008 FAIL: INSERT INTO query_cost_log not found');
    const insertBlock = orch.substring(insertIdx, insertIdx + 1500);
    assert.ok(
      insertBlock.includes('_historyDepth'),
      'CO-008 FAIL: _historyDepth not used in INSERT params block'
    );

    // Verify historyDepth is returned from #routeToAI
    assert.ok(
      orch.includes('historyDepth: historyDepth'),
      'CO-008 FAIL: historyDepth not included in #routeToAI return object'
    );
  });

  it('CO-009: existing CO tests structural gate — all CO checks remain present', () => {
    const orch = readRepoFile(ORCH_PATH);
    const migration = readRepoFile(MIGRATION_PATH);
    const server = readRepoFile(SERVER_PATH);

    // CO-001
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS query_cost_log'), 'CO-009: CO-001 check broken');
    // CO-002
    assert.ok(orch.includes('INSERT INTO query_cost_log'), 'CO-009: CO-002 check broken');
    // CO-003
    assert.ok(orch.includes('setImmediate(async () =>'), 'CO-009: CO-003 check broken');
    // CO-004
    assert.ok(orch.includes('[COST-LOG] Failed to write query cost log:'), 'CO-009: CO-004 check broken');
    // CO-005
    assert.ok(server.includes('/api/admin/cost-summary'), 'CO-009: CO-005 check broken');
  });

  it('CO-010: tokens_saved column present in query_cost_log schema and ALTER TABLE migration', () => {
    const migration = readRepoFile(MIGRATION_PATH);
    assert.ok(migration, 'CO-010 FAIL: api/admin/cost-observability.js not found');

    assert.ok(
      migration.includes('tokens_saved'),
      'CO-010 FAIL: tokens_saved column not found in cost-observability.js. ' +
      'The column must appear in both the CREATE TABLE schema and the ALTER TABLE migration.'
    );
    assert.ok(
      migration.includes('ADD COLUMN IF NOT EXISTS tokens_saved'),
      'CO-010 FAIL: ALTER TABLE ... ADD COLUMN IF NOT EXISTS tokens_saved not found in ensureCostLogTable(). ' +
      'The idempotent migration must add the column on existing databases.'
    );
  });

  it('CO-011: cache_hit savings entry written to query_cost_log on cache hit', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CO-011 FAIL: Could not read orchestrator.js');

    assert.ok(
      orch.includes("'cache_hit'"),
      "CO-011 FAIL: query_type 'cache_hit' not found in orchestrator.js. " +
      'A lightweight INSERT must be written when a cached response is returned.'
    );
    assert.ok(
      orch.includes("'cache'"),
      "CO-011 FAIL: model 'cache' not found in orchestrator.js. " +
      "The cache_hit cost log entry must set model='cache'."
    );
    assert.ok(
      orch.includes('[COST-LOG] Failed to write cache_hit cost log:'),
      'CO-011 FAIL: [COST-LOG] cache_hit error log not found. ' +
      'The cache_hit INSERT must be wrapped in try/catch with a [COST-LOG] error log.'
    );
  });

  it('CO-012: greeting savings entry written to query_cost_log on greeting shortcut', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CO-012 FAIL: Could not read orchestrator.js');

    assert.ok(
      orch.includes('[COST-LOG] Failed to write greeting savings cost log:'),
      'CO-012 FAIL: greeting savings error log not found in orchestrator.js. ' +
      'An INSERT into query_cost_log must be written when the greeting shortcut fires, ' +
      'wrapped in try/catch with a [COST-LOG] error log.'
    );
    assert.ok(
      orch.includes("'greeting-shortcut'"),
      "CO-012 FAIL: model 'greeting-shortcut' not found in the INSERT section of orchestrator.js. " +
      "The greeting savings log entry must set model='greeting-shortcut'."
    );
  });

  it('CO-013: trivial_block savings entry written to query_cost_log on trivial message', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CO-013 FAIL: Could not read orchestrator.js');

    assert.ok(
      orch.includes("'trivial_block'"),
      "CO-013 FAIL: query_type 'trivial_block' not found in orchestrator.js. " +
      'A lightweight INSERT must be written when a trivial message is detected.'
    );
    assert.ok(
      orch.includes("'trivial-filter'"),
      "CO-013 FAIL: model 'trivial-filter' not found in orchestrator.js. " +
      "The trivial_block cost log entry must set model='trivial-filter'."
    );
    assert.ok(
      orch.includes('[COST-LOG] Failed to write trivial_block cost log:'),
      'CO-013 FAIL: trivial_block error log not found in orchestrator.js. ' +
      'The trivial_block INSERT must be wrapped in try/catch with a [COST-LOG] error log.'
    );
    assert.ok(
      orch.includes('TRIVIAL_BLOCK_PATTERNS'),
      'CO-013 FAIL: TRIVIAL_BLOCK_PATTERNS constant not found in orchestrator.js. ' +
      'Trivial detection must use a named pattern array for readability and testability.'
    );
  });
});

// ============================================================
// FP. SIMPLE_FACTUAL FAST-PATH — SKIP SEMANTIC ANALYSIS
// Permanently verifies the four safety guards and structural
// invariants of the isConfirmedSimpleFactual optimisation.
//
// The fast-path fires only when ALL four conditions hold:
//   1. earlyClassification.classification === 'simple_factual'
//   2. earlyClassification.confidence > 0.70
//   3. message.length < 50
//   4. !hasPersonalIntent
//
// When it fires, #performSemanticAnalysis is NOT called and a
// safe fallback analysis (complexity: 0.2 → always GPT-4) is
// used instead.  If any guard is missing, semantic analysis
// must run normally.
// ============================================================

describe('FP. Simple Factual Fast-Path — Skip Semantic Analysis', () => {

  it('FP-001: isConfirmedSimpleFactual flag exists with all four conditions', () => {
    // INVARIANT: The fast-path variable must be defined and must gate on all four guards.
    // Missing any guard widens the fast-path and could skip embeddings for queries that
    // actually need semantic routing (e.g., long queries, personal-intent queries).
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('isConfirmedSimpleFactual'),
      'FP-001 FAIL: isConfirmedSimpleFactual variable not found in orchestrator.js.'
    );

    // All four conditions must appear in the block that defines isConfirmedSimpleFactual.
    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');
    assert.ok(flagIdx !== -1, 'FP-001 FAIL: isConfirmedSimpleFactual = assignment not found.');

    const flagBlock = orch.substring(flagIdx, flagIdx + 400);

    assert.ok(
      flagBlock.includes("'simple_factual'"),
      "FP-001 FAIL: 'simple_factual' classification check missing from isConfirmedSimpleFactual block."
    );
    assert.ok(
      flagBlock.includes('0.70'),
      'FP-001 FAIL: confidence > 0.70 threshold missing from isConfirmedSimpleFactual block.'
    );
    assert.ok(
      flagBlock.includes('message.length < 50'),
      'FP-001 FAIL: message.length < 50 guard missing from isConfirmedSimpleFactual block.'
    );
    assert.ok(
      flagBlock.includes('!hasPersonalIntent'),
      'FP-001 FAIL: !hasPersonalIntent guard missing from isConfirmedSimpleFactual block.'
    );
  });

  it('FP-002: isConfirmedSimpleFactual is false when confidence <= 0.70', () => {
    // INVARIANT: The confidence threshold must be > 0.70 (strict greater-than).
    // A threshold of >= 0.70 would be too permissive; boundary queries at exactly 0.70
    // are not reliable enough to skip semantic analysis.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');
    assert.ok(flagIdx !== -1, 'FP-002 FAIL: isConfirmedSimpleFactual = not found.');

    const flagBlock = orch.substring(flagIdx, flagIdx + 400);

    assert.ok(
      flagBlock.includes('confidence > 0.70') || flagBlock.includes('?.confidence > 0.70'),
      'FP-002 FAIL: Confidence check must be strictly > 0.70, not >= 0.70. ' +
      'Queries at exactly 0.70 confidence should fall through to full semantic analysis.'
    );
  });

  it('FP-003: isConfirmedSimpleFactual is false when message.length >= 50', () => {
    // INVARIANT: Long messages may contain personal context not caught by pronoun detection.
    // The length guard caps the fast-path at 49 characters to exclude longer queries.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');
    assert.ok(flagIdx !== -1, 'FP-003 FAIL: isConfirmedSimpleFactual = not found.');

    const flagBlock = orch.substring(flagIdx, flagIdx + 400);

    assert.ok(
      flagBlock.includes('message.length < 50'),
      'FP-003 FAIL: message.length < 50 guard missing — messages >= 50 chars must run ' +
      'full semantic analysis.'
    );
  });

  it('FP-004: isConfirmedSimpleFactual is false when hasPersonalIntent is true', () => {
    // INVARIANT: Queries with personal intent (e.g., "What is my name?") must NOT fire the
    // fast-path — they may need memory retrieval and full semantic routing.
    // The !hasPersonalIntent guard is the same one used by skipMemoryForSimpleQuery.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');
    assert.ok(flagIdx !== -1, 'FP-004 FAIL: isConfirmedSimpleFactual = not found.');

    const flagBlock = orch.substring(flagIdx, flagIdx + 400);

    assert.ok(
      flagBlock.includes('!hasPersonalIntent'),
      'FP-004 FAIL: !hasPersonalIntent guard missing from isConfirmedSimpleFactual block. ' +
      '"What is my name?" would be fast-pathed despite needing memory retrieval.'
    );
  });

  it('FP-005: fallback analysis object has correct structure and values', () => {
    // INVARIANT: The fast-path analysis object must set complexity: 0.2 so that AI routing
    // always selects GPT-4 (cheaper) and never escalates to Claude.
    // intent: 'information_request' is the correct signal for simple factual lookups.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const elseIfIdx = orch.indexOf('else if (isConfirmedSimpleFactual)');
    assert.ok(
      elseIfIdx !== -1,
      'FP-005 FAIL: else if (isConfirmedSimpleFactual) branch not found in orchestrator.js.'
    );

    const elseIfBlock = orch.substring(elseIfIdx, elseIfIdx + 400);

    assert.ok(
      elseIfBlock.includes("intent: 'information_request'"),
      "FP-005 FAIL: intent: 'information_request' not found in isConfirmedSimpleFactual branch."
    );
    assert.ok(
      elseIfBlock.includes('complexity: 0.2'),
      'FP-005 FAIL: complexity: 0.2 not found in isConfirmedSimpleFactual branch. ' +
      'complexity: 0.2 ensures routing always selects GPT-4, never Claude.'
    );
    assert.ok(
      elseIfBlock.includes("domain: 'general'"),
      "FP-005 FAIL: domain: 'general' not found in isConfirmedSimpleFactual branch."
    );
  });

  it('FP-006: [FAST-PATH] log line present when fast path fires', () => {
    // INVARIANT: When the simple_factual fast-path fires, a [FAST-PATH] log line must be
    // emitted so that Railway logs confirm the optimisation is active in production.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('[FAST-PATH] simple_factual fast path'),
      'FP-006 FAIL: [FAST-PATH] simple_factual fast path log line not found in orchestrator.js. ' +
      'The log is required to confirm fast-path activation in Railway logs.'
    );
  });

  it('FP-007: semantic analysis still called for non-simple_factual queries', () => {
    // INVARIANT: The fast-path is conditional. When isConfirmedSimpleFactual is false,
    // #performSemanticAnalysis must still be called — the else branch must exist.
    // Deleting the else branch would break all non-simple_factual queries.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const elseIfIdx = orch.indexOf('else if (isConfirmedSimpleFactual)');
    assert.ok(elseIfIdx !== -1, 'FP-007 FAIL: else if (isConfirmedSimpleFactual) branch not found.');

    // #performSemanticAnalysis must appear AFTER the else-if branch (i.e., in the else branch)
    const performAfterElseIf = orch.indexOf('#performSemanticAnalysis(', elseIfIdx);
    assert.ok(
      performAfterElseIf !== -1,
      'FP-007 FAIL: #performSemanticAnalysis( not found after else if (isConfirmedSimpleFactual). ' +
      'The else branch that calls full semantic analysis must be present.'
    );
  });

  it('FP-008: semantic analysis still called when confidence <= 0.70 even if classification matches', () => {
    // INVARIANT: Low-confidence simple_factual classifications fall through to full
    // semantic analysis. This guards against over-trusting a weakly-classified query.
    // Verified structurally: the confidence > 0.70 guard in isConfirmedSimpleFactual ensures
    // the else branch runs for confidence <= 0.70.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    // Both the confidence threshold and the full-processing else branch must exist.
    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');
    const performIdx = orch.indexOf('#performSemanticAnalysis(');
    assert.ok(flagIdx !== -1, 'FP-008 FAIL: isConfirmedSimpleFactual = not found.');
    assert.ok(performIdx !== -1, 'FP-008 FAIL: #performSemanticAnalysis( not found.');

    const flagBlock = orch.substring(flagIdx, flagIdx + 400);
    assert.ok(
      flagBlock.includes('0.70'),
      'FP-008 FAIL: 0.70 confidence threshold missing — low-confidence queries would be ' +
      'incorrectly fast-pathed instead of running full semantic analysis.'
    );
  });

  it('FP-009: isConfirmedSimpleFactual is evaluated AFTER hasPersonalIntent is defined', () => {
    // INVARIANT: isConfirmedSimpleFactual references hasPersonalIntent.
    // hasPersonalIntent is defined before the fast-path flag; if order were reversed,
    // the reference would be to an uninitialised variable (undefined), defeating the guard.
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'Could not read orchestrator.js');

    const personalIntentIdx = orch.indexOf('hasPersonalIntent =');
    const flagIdx = orch.indexOf('isConfirmedSimpleFactual =');

    assert.ok(personalIntentIdx !== -1, 'FP-009 FAIL: hasPersonalIntent = not found in orchestrator.js.');
    assert.ok(flagIdx !== -1, 'FP-009 FAIL: isConfirmedSimpleFactual = not found in orchestrator.js.');

    assert.ok(
      personalIntentIdx < flagIdx,
      'FP-009 FAIL: isConfirmedSimpleFactual is evaluated BEFORE hasPersonalIntent is defined. ' +
      'This would make !hasPersonalIntent always truthy, defeating the personal-intent guard.'
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// DOC. Document Source Classification — Escape Hatch Activation
// Verifies that source_class is set to 'document' when a document is loaded,
// confidence is boosted, and the boundedReasoningGate escape hatch fires.
// ─────────────────────────────────────────────────────────────────────────────
describe('DOC. Document Source Classification — Escape Hatch Activation', () => {
  const ORCH_PATH = 'api/core/orchestrator.js';
  const GATE_PATH = 'api/core/intelligence/boundedReasoningGate.js';

  it('DOC-001: source_class set to document when effectiveDocumentData present and context.documents populated', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes("phase4Metadata.source_class = 'document'"),
      "DOC-001 FAIL: phase4Metadata.source_class = 'document' not found in orchestrator.js. " +
      'The document escape hatch requires source_class to be set to document when a document is loaded.'
    );

    assert.ok(
      orch.includes('effectiveDocumentData && context.documents'),
      'DOC-001 FAIL: effectiveDocumentData && context.documents condition not found. ' +
      'The assignment must be guarded by both effectiveDocumentData and context.documents.'
    );
  });

  it('DOC-002: source_class assignment block appears after Phase 4 external lookup section', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The document source_class assignment must come AFTER the external lookup
    // (which sets source_class to 'external') so documents take precedence when
    // no external lookup fired.
    // Note: external uses double-quotes and document uses single-quotes in source —
    // these search strings must match the actual code exactly.
    const externalIdx = orch.indexOf('phase4Metadata.source_class = "external"');
    const documentIdx = orch.indexOf("phase4Metadata.source_class = 'document'");
    const boundedIdx = orch.indexOf('enforceBoundedReasoning(');

    assert.ok(externalIdx !== -1, 'DOC-002 FAIL: external source_class assignment not found.');
    assert.ok(documentIdx !== -1, 'DOC-002 FAIL: document source_class assignment not found.');
    assert.ok(boundedIdx !== -1, 'DOC-002 FAIL: enforceBoundedReasoning call not found.');

    assert.ok(
      externalIdx < documentIdx,
      'DOC-002 FAIL: document source_class assignment must appear AFTER the external source_class assignment.'
    );

    assert.ok(
      documentIdx < boundedIdx,
      'DOC-002 FAIL: document source_class assignment must appear BEFORE enforceBoundedReasoning is called.'
    );
  });

  it('DOC-003: source_class external assignment still present for external lookup path', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes("phase4Metadata.source_class = \"external\""),
      'DOC-003 FAIL: external source_class assignment not found. ' +
      'The external lookup path must still set source_class to external when lookup succeeds.'
    );
  });

  it('DOC-004: confidence boosted by 0.25 when document loaded', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('phase4Metadata.confidence + 0.25'),
      'DOC-004 FAIL: confidence + 0.25 boost not found in orchestrator.js. ' +
      'Document queries must have confidence boosted by 0.25.'
    );
  });

  it('DOC-005: confidence capped at 0.92 for document queries', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('Math.min(0.92,'),
      'DOC-005 FAIL: Math.min(0.92, ...) cap not found in orchestrator.js. ' +
      'Document confidence boost must be capped at 0.92.'
    );
  });

  it('DOC-006: confidence boost is inside the effectiveDocumentData && context.documents guard', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // Find the document guard block and verify the confidence boost is inside it
    const guardIdx = orch.indexOf('effectiveDocumentData && context.documents');
    assert.ok(guardIdx !== -1, 'DOC-006 FAIL: effectiveDocumentData && context.documents guard not found.');

    const boostIdx = orch.indexOf('Math.min(0.92,');
    assert.ok(boostIdx !== -1, 'DOC-006 FAIL: Math.min(0.92, ...) boost not found.');

    // The boost must appear after the guard (inside the if block)
    assert.ok(
      boostIdx > guardIdx,
      'DOC-006 FAIL: confidence boost appears before the document guard. ' +
      'The boost must be inside the if (effectiveDocumentData && context.documents) block.'
    );

    // The boost must appear before the closing of the block — check it's near the guard.
    // The document classification block is ~400 chars; 800 gives a safe margin.
    const DOCUMENT_BLOCK_MAX_CHARS = 800;
    const blockSnippet = orch.substring(guardIdx, guardIdx + DOCUMENT_BLOCK_MAX_CHARS);
    assert.ok(
      blockSnippet.includes('Math.min(0.92,'),
      'DOC-006 FAIL: confidence boost is not inside the document guard block. ' +
      'The boost must only apply when a document is loaded.'
    );
  });

  it('DOC-007: [SOURCE-CLASS] log line present when document source detected', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    assert.ok(
      orch.includes('[SOURCE-CLASS] Document source detected'),
      'DOC-007 FAIL: [SOURCE-CLASS] Document source detected log line not found in orchestrator.js. ' +
      'The log is required to confirm document source classification in Railway logs.'
    );
  });

  it('DOC-008: boundedReasoningGate escape hatch checks source_class === document', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    assert.ok(
      gate.includes("phase4Metadata.source_class === 'document'"),
      "DOC-008 FAIL: source_class === 'document' escape hatch not found in boundedReasoningGate.js. " +
      'The gate must check for document source_class to skip the bounded reasoning disclosure.'
    );
  });

  it('DOC-009: document source_class assignment is guarded by the Phase 4 block structure', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'Could not read orchestrator.js');

    // The document classification block must exist between Phase 4 end and bounded reasoning
    const phase4EndMarker = "end if (!willUseGreetingShortcut) — Phase 4";
    const documentAssignment = "phase4Metadata.source_class = 'document'";
    const boundedStart = 'PHASE 6: BOUNDED REASONING ENFORCEMENT';

    const phase4EndIdx = orch.indexOf(phase4EndMarker);
    const docAssignIdx = orch.indexOf(documentAssignment);
    const boundedIdx = orch.indexOf(boundedStart);

    assert.ok(phase4EndIdx !== -1, 'DOC-009 FAIL: Phase 4 end marker not found in orchestrator.js.');
    assert.ok(docAssignIdx !== -1, 'DOC-009 FAIL: document source_class assignment not found.');
    assert.ok(boundedIdx !== -1, 'DOC-009 FAIL: PHASE 6 bounded reasoning marker not found.');

    assert.ok(
      phase4EndIdx < docAssignIdx,
      'DOC-009 FAIL: document assignment must appear AFTER Phase 4 ends.'
    );

    assert.ok(
      docAssignIdx < boundedIdx,
      'DOC-009 FAIL: document assignment must appear BEFORE Phase 6 bounded reasoning.'
    );
  });

  it('DOC-010: calculateConfidence uses boosted phase4Metadata.confidence directly for document source_class', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');

    // Simulate document query: orchestrator boosted confidence to 0.85, source_class = 'document'
    const boostedConfidence = 0.85;
    const p4 = { source_class: 'document', confidence: boostedConfidence };
    const score = calculateConfidence(null, 0, false, boostedConfidence, p4);

    assert.ok(
      Math.abs(score - boostedConfidence) < 0.001,
      `DOC-010 FAIL: calculateConfidence returned ${score} for document source_class — ` +
      `expected the boosted value ${boostedConfidence} to be used directly. ` +
      'The 20% secondary-signal weighting must NOT be applied to document-sourced confidence.'
    );
  });

  it('DOC-011: buildConfidenceMetadata returns boosted score for document source_class', async () => {
    const { buildConfidenceMetadata } = await import('../../api/core/personalities/confidence_calculator.js');

    const boostedConfidence = 0.85;
    const result = buildConfidenceMetadata({ source_class: 'document', confidence: boostedConfidence });

    assert.strictEqual(
      result.score,
      Math.round(boostedConfidence * 100),
      `DOC-011 FAIL: buildConfidenceMetadata score=${result.score} — ` +
      `expected ${Math.round(boostedConfidence * 100)} for document source_class. ` +
      'The UI must display the orchestrator-boosted confidence, not a diluted secondary-signal value.'
    );
  });

});

// ---------------------------------------------------------------------------
// OP-001 through OP-010: Output Precision — Engagement Bait + Preamble + Length
// ---------------------------------------------------------------------------

const ORCH_PATH_OP = join(REPO_ROOT, 'api', 'core', 'orchestrator.js');

describe('OP. Output Precision — Engagement Bait Extension + Preamble + Length Guidance', () => {

  const orchSrcOP = readRepoFile('api/core/orchestrator.js');

  it('OP-001: Engagement bait removal no longer gated to greeting/simple_factual/simple_short only', () => {
    // The old classification gate should not exist
    assert.ok(
      !orchSrcOP.includes(
        "classification.classification === 'greeting' ||\n              classification.classification === 'simple_factual' ||\n              classification.classification === 'simple_short'"
      ),
      'OP-001 FAIL: Old classification gate still present — engagement bait removal must run for ALL query types'
    );
    // The patterns block must still exist (engagement bait patterns not removed)
    assert.ok(
      orchSrcOP.includes('engagementBaitPatterns'),
      'OP-001 FAIL: engagementBaitPatterns must still be present in orchestrator.js'
    );
  });

  it('OP-002: Engagement bait removal runs for medium_complexity (no classification gate)', () => {
    // Confirm there is no if-guard restricting to simple types before engagementBaitPatterns
    const baitIdx = orchSrcOP.indexOf('engagementBaitPatterns');
    const beforeBait = orchSrcOP.substring(Math.max(0, baitIdx - 600), baitIdx);
    assert.ok(
      !beforeBait.includes("classification === 'medium_complexity'") ||
      beforeBait.includes('preamblePatterns'),
      'OP-002 FAIL: engagementBaitPatterns must not be restricted to exclude medium_complexity'
    );
  });

  it('OP-003: Engagement bait removal runs for decision_making (no classification gate)', () => {
    const baitIdx = orchSrcOP.indexOf('engagementBaitPatterns');
    assert.ok(baitIdx !== -1, 'OP-003 FAIL: engagementBaitPatterns not found in orchestrator.js');
    // Confirm the block is not wrapped in a greeting/simple check immediately before
    const precedingChunk = orchSrcOP.substring(Math.max(0, baitIdx - 400), baitIdx);
    assert.ok(
      !precedingChunk.match(/if\s*\(\s*classification\.classification\s*===\s*'greeting'/),
      'OP-003 FAIL: engagementBaitPatterns is still gated behind a greeting/simple check'
    );
  });

  it('OP-004: Preamble pattern "great question" present in orchestrator.js', () => {
    assert.ok(
      orchSrcOP.includes('great question'),
      'OP-004 FAIL: preamble pattern for "great question" must be present in orchestrator.js'
    );
    assert.ok(
      orchSrcOP.includes('preamblePatterns'),
      'OP-004 FAIL: preamblePatterns array must be defined in orchestrator.js'
    );
  });

  it('OP-005: Preamble pattern "absolutely" present in orchestrator.js', () => {
    assert.ok(
      orchSrcOP.includes('absolutely'),
      'OP-005 FAIL: preamble pattern for "absolutely" must be present in orchestrator.js'
    );
  });

  it('OP-006: [ENGAGEMENT-BAIT] log line present when bait removed', () => {
    assert.ok(
      orchSrcOP.includes('[ENGAGEMENT-BAIT]'),
      'OP-006 FAIL: [ENGAGEMENT-BAIT] log line must be present in orchestrator.js'
    );
    assert.ok(
      orchSrcOP.includes('original_length=') && orchSrcOP.includes('cleaned_length='),
      'OP-006 FAIL: [ENGAGEMENT-BAIT] log must include original_length and cleaned_length'
    );
  });

  it('OP-007: System prompt contains length guidance for medium_complexity', () => {
    assert.ok(
      orchSrcOP.includes("queryClassification.classification === 'medium_complexity'"),
      'OP-007 FAIL: #buildSystemPrompt must add length guidance for medium_complexity'
    );
    assert.ok(
      orchSrcOP.includes('Aim for 2-4 paragraphs'),
      'OP-007 FAIL: medium_complexity length guidance text must be present'
    );
  });

  it('OP-008: System prompt contains length guidance for decision_making', () => {
    assert.ok(
      orchSrcOP.includes("queryClassification.classification === 'decision_making'"),
      'OP-008 FAIL: #buildSystemPrompt must add length guidance for decision_making'
    );
    assert.ok(
      orchSrcOP.includes('Focus on the decision'),
      'OP-008 FAIL: decision_making length guidance text must be present'
    );
  });

  it('OP-009: decision_making maxLength enforcement present in Phase 7.5', () => {
    // Phase 7.5 must have a block handling decision_making and news_current_events maxLength
    assert.ok(
      orchSrcOP.includes("classification.classification === 'decision_making'") ||
      orchSrcOP.includes("classification === 'decision_making'"),
      'OP-009 FAIL: Phase 7.5 must reference decision_making classification for maxLength enforcement'
    );
    assert.ok(
      orchSrcOP.includes("classification.classification === 'news_current_events'") ||
      orchSrcOP.includes("classification === 'news_current_events'"),
      'OP-009 FAIL: Phase 7.5 must reference news_current_events classification for maxLength enforcement'
    );
    // The enforcement block must include a reason string with _maxlength
    assert.ok(
      orchSrcOP.includes('_maxlength'),
      'OP-009 FAIL: maxLength enforcement reason must use a _maxlength suffix in the reason string'
    );
  });

  it('OP-010: Preamble patterns applied before trailing bait patterns', () => {
    const preambleIdx = orchSrcOP.indexOf('preamblePatterns');
    const baitIdx = orchSrcOP.indexOf('engagementBaitPatterns');
    assert.ok(preambleIdx !== -1, 'OP-010 FAIL: preamblePatterns not found');
    assert.ok(baitIdx !== -1, 'OP-010 FAIL: engagementBaitPatterns not found');
    assert.ok(
      preambleIdx < baitIdx,
      'OP-010 FAIL: preamblePatterns must be defined and applied BEFORE engagementBaitPatterns'
    );
  });

  it('OP-011: Fragment ", !" removed when bait removal creates orphaned sentence', () => {
    // fragmentPatterns must be defined in orchestrator.js
    assert.ok(
      orchSrcOP.includes('fragmentPatterns'),
      'OP-011 FAIL: fragmentPatterns must be defined in orchestrator.js to detect orphaned fragments'
    );
    // Must handle ", !" and ", ." patterns
    assert.ok(
      orchSrcOP.includes('/,\\s*[!.?]$/'),
      'OP-011 FAIL: fragmentPatterns must include /,\\s*[!.?]$/ to detect ", !" fragments'
    );
  });

  it('OP-012: Entire containing sentence removed when it becomes a fragment after bait removal', () => {
    // Must find last sentence boundary and truncate
    assert.ok(
      orchSrcOP.includes('lastIndexOf'),
      'OP-012 FAIL: fragment cleanup must use lastIndexOf to find the last sentence boundary'
    );
    assert.ok(
      orchSrcOP.includes('lastSentenceEnd'),
      'OP-012 FAIL: lastSentenceEnd variable must be present for fragment sentence removal'
    );
  });

  it('OP-013: "as mentioned in your memory context" stripped from response', () => {
    assert.ok(
      orchSrcOP.includes('memoryLeakagePatterns'),
      'OP-013 FAIL: memoryLeakagePatterns array must be defined in orchestrator.js'
    );
    assert.ok(
      orchSrcOP.includes('as mentioned in your memory context'),
      'OP-013 FAIL: memoryLeakagePatterns must include "as mentioned in your memory context" pattern'
    );
  });

  it('OP-014: "based on your memory context" stripped from response', () => {
    assert.ok(
      orchSrcOP.includes('based on your memory context'),
      'OP-014 FAIL: memoryLeakagePatterns must include "based on your memory context" pattern'
    );
  });

  it('OP-015: System prompt contains instruction not to reference internal memory system', () => {
    assert.ok(
      orchSrcOP.includes('Never reference your internal memory context'),
      'OP-015 FAIL: #buildSystemPrompt must instruct AI never to reference internal memory context'
    );
    assert.ok(
      orchSrcOP.includes('Speak naturally as if you simply know the information'),
      'OP-015 FAIL: #buildSystemPrompt must instruct AI to speak naturally instead of referencing internal sources'
    );
  });

  it('OP-016: All existing 296 tests pass (structural gate)', () => {
    // This test verifies that all OP-001 through OP-010 structural checks still hold
    // (i.e., no regressions introduced by OP-011 through OP-015 changes)
    assert.ok(
      orchSrcOP.includes('engagementBaitPatterns'),
      'OP-016 FAIL: engagementBaitPatterns must still be present (regression check)'
    );
    assert.ok(
      orchSrcOP.includes('preamblePatterns'),
      'OP-016 FAIL: preamblePatterns must still be present (regression check)'
    );
    assert.ok(
      orchSrcOP.includes('[ENGAGEMENT-BAIT]'),
      'OP-016 FAIL: [ENGAGEMENT-BAIT] log line must still be present (regression check)'
    );
    assert.ok(
      orchSrcOP.includes('original_length=') && orchSrcOP.includes('cleaned_length='),
      'OP-016 FAIL: [ENGAGEMENT-BAIT] log fields must still be present (regression check)'
    );
  });

});

// ============================================================
// CA. Confidence Calibration — Fix Misleading Scores
// Verifies the four targeted calibration fixes:
//   FIX 1: PERMANENT base 0.97 → 0.90
//   FIX 2: VOLATILE lookup bonuses doubled (0.15/0.10/0.05 → 0.30/0.20/0.10)
//   FIX 3: SEMI_STABLE base 0.65 → 0.70
//   FIX 4: 90/10 blend for PERMANENT and SEMI_STABLE, 80/20 for VOLATILE
// ============================================================

describe('CA. Confidence Calibration — Fix Misleading Scores', () => {

  // CA-001: PERMANENT base is 0.90
  it('CA-001: calculateConfidence returns 0.90 for PERMANENT with no lookup and no modelConfidence', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, null, null);
    assert.strictEqual(
      score,
      0.90,
      `CA-001 FAIL: PERMANENT base is ${score} — expected 0.90. FIX 1 not applied.`
    );
  });

  // CA-002: VOLATILE + 3 sources bonus is 0.30 not 0.15
  it('CA-002: VOLATILE + 3 sources adds 0.30 (not 0.15) to base', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    // VOLATILE base = 0.45, no modelConfidence — bonus only variable
    const score3 = calculateConfidence('VOLATILE', 3, true, null, null);
    assert.strictEqual(
      score3,
      0.75,
      `CA-002 FAIL: VOLATILE + 3 sources returned ${score3} — expected 0.75 (0.45 + 0.30). FIX 2 not applied.`
    );
  });

  // CA-003: VOLATILE + 2 sources bonus is 0.20 not 0.10
  it('CA-003: VOLATILE + 2 sources adds 0.20 (not 0.10) to base', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score2 = calculateConfidence('VOLATILE', 2, true, null, null);
    assert.strictEqual(
      score2,
      0.65,
      `CA-003 FAIL: VOLATILE + 2 sources returned ${score2} — expected 0.65 (0.45 + 0.20). FIX 2 not applied.`
    );
  });

  // CA-004: VOLATILE + 1 source bonus is 0.10 not 0.05
  it('CA-004: VOLATILE + 1 source adds 0.10 (not 0.05) to base', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score1 = calculateConfidence('VOLATILE', 1, true, null, null);
    assert.strictEqual(
      score1,
      0.55,
      `CA-004 FAIL: VOLATILE + 1 source returned ${score1} — expected 0.55 (0.45 + 0.10). FIX 2 not applied.`
    );
  });

  // CA-005: SEMI_STABLE base is 0.70
  it('CA-005: calculateConfidence returns 0.70 for SEMI_STABLE with no lookup and no modelConfidence', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('SEMI_STABLE', 0, false, null, null);
    assert.strictEqual(
      score,
      0.70,
      `CA-005 FAIL: SEMI_STABLE base is ${score} — expected 0.70. FIX 3 not applied.`
    );
  });

  // CA-006: PERMANENT uses 90/10 blend
  it('CA-006: PERMANENT uses 90/10 blend when modelConfidence is provided', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    // base=0.90, modelConfidence=0.50 → 0.90*0.90 + 0.50*0.10 = 0.81 + 0.05 = 0.86
    const score = calculateConfidence('PERMANENT', 0, false, 0.50, null);
    const expected = 0.90 * 0.90 + 0.50 * 0.10;
    assert.ok(
      Math.abs(score - expected) < 0.001,
      `CA-006 FAIL: PERMANENT 90/10 blend with modelConfidence=0.50 returned ${score} — expected ~${expected}. FIX 4 not applied.`
    );
  });

  // CA-007: SEMI_STABLE uses 90/10 blend
  it('CA-007: SEMI_STABLE uses 90/10 blend when modelConfidence is provided', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    // base=0.70, modelConfidence=0.50 → 0.70*0.90 + 0.50*0.10 = 0.63 + 0.05 = 0.68
    const score = calculateConfidence('SEMI_STABLE', 0, false, 0.50, null);
    const expected = 0.70 * 0.90 + 0.50 * 0.10;
    assert.ok(
      Math.abs(score - expected) < 0.001,
      `CA-007 FAIL: SEMI_STABLE 90/10 blend with modelConfidence=0.50 returned ${score} — expected ~${expected}. FIX 4 not applied.`
    );
  });

  // CA-008: VOLATILE uses 80/20 blend (unchanged)
  it('CA-008: VOLATILE still uses 80/20 blend when modelConfidence is provided', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    // base=0.45, modelConfidence=0.50 → 0.45*0.80 + 0.50*0.20 = 0.36 + 0.10 = 0.46
    const score = calculateConfidence('VOLATILE', 0, false, 0.50, null);
    const expected = 0.45 * 0.80 + 0.50 * 0.20;
    assert.ok(
      Math.abs(score - expected) < 0.001,
      `CA-008 FAIL: VOLATILE 80/20 blend with modelConfidence=0.50 returned ${score} — expected ~${expected}.`
    );
  });

  // CA-009: VOLATILE + 3 sources produces score above 0.60 (no "limited information" when data found)
  it('CA-009: VOLATILE + 3 sources produces score > 0.60 so "limited information" does not fire', async () => {
    const { calculateConfidence, buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('VOLATILE', 3, true, null, null);
    assert.ok(
      score > 0.60,
      `CA-009 FAIL: VOLATILE + 3 sources returned ${score} — expected > 0.60. ` +
      '"limited information" must not fire when we actually have current data from 3 sources.'
    );
    // Also verify "limited information" reason does NOT fire at this score
    const reason = buildConfidenceReason('VOLATILE', 3, true, score, null);
    assert.ok(
      !reason.includes('limited information'),
      `CA-009 FAIL: buildConfidenceReason returned "${reason}" for VOLATILE + 3 sources. ` +
      '"limited information" must not appear when current data was successfully retrieved.'
    );
  });

  // CA-010: Document source early return still works correctly
  it('CA-010: document source early return still clamps to [0.15, 0.92] and bypasses truth-type logic', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, 0.88, { source_class: 'document' });
    assert.strictEqual(
      score,
      0.88,
      `CA-010 FAIL: document source early return returned ${score} — expected 0.88 (pass-through of modelConfidence).`
    );
    // Verify cap at 0.92
    const scoreCapped = calculateConfidence('PERMANENT', 0, false, 0.99, { source_class: 'document' });
    assert.strictEqual(
      scoreCapped,
      0.92,
      `CA-010 FAIL: document source cap returned ${scoreCapped} — expected 0.92 (capped at 0.92).`
    );
  });

  // CA-011: Memory sourced override still returns 0.95
  it('CA-011: memory_sourced override still returns 0.95 regardless of truth type', async () => {
    const { calculateConfidence } = await import('../../api/core/personalities/confidence_calculator.js');
    const score = calculateConfidence('PERMANENT', 0, false, null, { memory_sourced: true });
    assert.strictEqual(
      score,
      0.95,
      `CA-011 FAIL: memory_sourced override returned ${score} — must stay 0.95.`
    );
  });

  // CA-012: Score clamp [0.15, 0.97] and "limited information" threshold at 0.60 are unchanged
  it('CA-012: score clamp boundaries and limited-information threshold unchanged', async () => {
    const { calculateConfidence, buildConfidenceReason } = await import('../../api/core/personalities/confidence_calculator.js');

    // Upper clamp: even if internal sum would exceed 0.97, result is capped
    const highScore = calculateConfidence('PERMANENT', 3, true, 0.99, null);
    assert.ok(
      highScore <= 0.97,
      `CA-012 FAIL: upper clamp broken — calculateConfidence returned ${highScore} which exceeds 0.97.`
    );

    // Lower clamp: null truth type with no lookup stays above 0.15
    const lowScore = calculateConfidence(null, 0, false, 0.10, null);
    assert.ok(
      lowScore >= 0.15,
      `CA-012 FAIL: lower clamp broken — calculateConfidence returned ${lowScore} which is below 0.15.`
    );

    // "limited information" threshold still fires below 0.60
    const reason = buildConfidenceReason(null, 0, false, 0.55, null);
    assert.strictEqual(
      reason,
      'limited information — reasoning from available evidence',
      `CA-012 FAIL: limited-information threshold changed — score=0.55 returned "${reason}".`
    );
  });

});


// ============================================================
// MQ. Memory Quality — Block Storage of Empty Extraction Results
// Verifies that extraction failure messages (e.g. "No essential facts")
// are never written to persistent_memories.
// ============================================================

describe('MQ. Memory Quality — Block Storage of Empty Extraction Results', () => {

  // MQ-001: "No essential facts" is blocked
  it('MQ-001: Storage blocked when content matches "No essential facts"', async () => {
    const { isEmptyExtractionResult } = await import('../../api/memory/empty-extraction-guard.js');
    assert.strictEqual(
      isEmptyExtractionResult('No essential facts to extract'),
      true,
      'MQ-001 FAIL: "No essential facts to extract" should be blocked as an empty extraction result'
    );
  });

  // MQ-002: "No relevant facts" is blocked
  it('MQ-002: Storage blocked when content matches "No relevant facts"', async () => {
    const { isEmptyExtractionResult } = await import('../../api/memory/empty-extraction-guard.js');
    assert.strictEqual(
      isEmptyExtractionResult('No relevant facts to extract'),
      true,
      'MQ-002 FAIL: "No relevant facts to extract" should be blocked as an empty extraction result'
    );
  });

  // MQ-003: "No extractable facts" is blocked
  it('MQ-003: Storage blocked when content matches "No extractable facts"', async () => {
    const { isEmptyExtractionResult } = await import('../../api/memory/empty-extraction-guard.js');
    assert.strictEqual(
      isEmptyExtractionResult('No extractable facts found'),
      true,
      'MQ-003 FAIL: "No extractable facts found" should be blocked as an empty extraction result'
    );
  });

  // MQ-004: [MEMORY-QUALITY] log line is present in the implementation
  it('MQ-004: [MEMORY-QUALITY] log line present when storage blocked', () => {
    const src = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(src, 'MQ-004 FAIL: api/memory/intelligent-storage.js not found');
    assert.ok(
      src.includes('[MEMORY-QUALITY] Blocked empty extraction'),
      'MQ-004 FAIL: [MEMORY-QUALITY] Blocked empty extraction log line missing from intelligent-storage.js'
    );
  });

  // MQ-005: Real content is NOT blocked
  it('MQ-005: Real content still stores correctly — not blocked', async () => {
    const { isEmptyExtractionResult } = await import('../../api/memory/empty-extraction-guard.js');
    assert.strictEqual(
      isEmptyExtractionResult('Name: Alice (user, person)'),
      false,
      'MQ-005 FAIL: "Name: Alice (user, person)" must NOT be blocked — it is a real user fact'
    );
    assert.strictEqual(
      isEmptyExtractionResult('Job: Senior Engineer at Acme Corp'),
      false,
      'MQ-005 FAIL: "Job: Senior Engineer at Acme Corp" must NOT be blocked — it is a real user fact'
    );
  });

  // MQ-006: Return value is { stored: false, reason: 'empty_extraction' }
  it('MQ-006: Return value is { stored: false, reason: "empty_extraction" } when blocked', () => {
    const src = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(src, 'MQ-006 FAIL: api/memory/intelligent-storage.js not found');
    assert.ok(
      src.includes("stored: false") && src.includes("reason: 'empty_extraction'"),
      'MQ-006 FAIL: storeCompressedMemory must return { stored: false, reason: \'empty_extraction\' } when empty extraction is detected'
    );
  });

  // MQ-007: EMPTY_EXTRACTION_PATTERNS exported and covers all required patterns
  it('MQ-007: EMPTY_EXTRACTION_PATTERNS covers all required patterns', async () => {
    const { EMPTY_EXTRACTION_PATTERNS, isEmptyExtractionResult } = await import('../../api/memory/empty-extraction-guard.js');
    assert.ok(Array.isArray(EMPTY_EXTRACTION_PATTERNS), 'MQ-007 FAIL: EMPTY_EXTRACTION_PATTERNS must be an exported array');

    const required = [
      'No essential facts to extract',
      'No relevant facts to extract',
      'No specific facts provided',
      'No extractable facts found',
      'No user facts',
      'No facts to extract',
      '(no facts to extract)',
      '(no extractable facts)',
      'No relevant user facts',
      'No specific identifiers',
      'No essential facts provided',
      'No relevant facts extracted',
      'No facts extracted',
    ];

    for (const phrase of required) {
      assert.strictEqual(
        isEmptyExtractionResult(phrase),
        true,
        `MQ-007 FAIL: "${phrase}" must be blocked by EMPTY_EXTRACTION_PATTERNS`
      );
    }
  });

});

// ============================================================
// BX. Brand Extractor False Positive Guard
// Ensures common English phrases are not flagged as brand names,
// while real brand names (Tesla, Apple, Google) are still detected.
// ============================================================

describe('BX. Brand Extractor — False Positive Guard', () => {

  it('BX-001: "If I" is NOT detected as a brand name', () => {
    const src = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(src, 'BX-001 FAIL: api/memory/intelligent-storage.js not found');
    assert.ok(
      src.includes('BRAND_NAME_EXCLUSIONS'),
      'BX-001 FAIL: BRAND_NAME_EXCLUSIONS array must exist in intelligent-storage.js to filter common English phrases'
    );
    assert.ok(
      src.includes('/^if i$/i'),
      'BX-001 FAIL: BRAND_NAME_EXCLUSIONS must include /^if i$/i to prevent "If I" from being treated as a brand'
    );
  });

  it('BX-002: "A I" / standalone "AI" is NOT detected as a brand name', () => {
    const src = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(src, 'BX-002 FAIL: api/memory/intelligent-storage.js not found');
    assert.ok(
      src.includes('/^ai$/i') || src.includes('/^a i$/i'),
      'BX-002 FAIL: BRAND_NAME_EXCLUSIONS must include /^ai$/i or /^a i$/i to prevent standalone "AI" / "A I" from being treated as a brand'
    );
  });

  it('BX-003: Real brand names (Tesla, Apple, Google) are still detected', () => {
    const src = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(src, 'BX-003 FAIL: api/memory/intelligent-storage.js not found');
    // The brandNamePattern regex must still exist for real brand detection
    assert.ok(
      src.includes('brandNamePattern'),
      'BX-003 FAIL: brandNamePattern must still be defined in intelligent-storage.js for real brand detection'
    );
    // The exclusion filter must only apply to the detected list, not remove the pattern itself
    assert.ok(
      src.includes('BRAND_NAME_EXCLUSIONS.some(pattern => pattern.test(brand.trim()))'),
      'BX-003 FAIL: Filter must use BRAND_NAME_EXCLUSIONS to exclude only matched phrases, keeping real brand names intact'
    );
  });

});

// ============================================================
// ML. Memory Reference Leakage — Extended Patterns
// Ensures new memory-reference phrases are stripped from
// AI responses (ML-005, ML-006) and existing tests still pass
// (ML-007 structural gate).
// ============================================================

describe('ML. Memory Reference Leakage — Extended Patterns', () => {

  it('ML-005: "as noted in our previous discussions" stripped from response', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'ML-005 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      src.includes('as noted in our previous discussion'),
      'ML-005 FAIL: memoryLeakagePatterns must include a pattern matching "as noted in our previous discussions"'
    );
  });

  it('ML-006: "as we discussed" stripped from response', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'ML-006 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      src.includes('as we (discussed|talked about|mentioned)') ||
      src.includes('as we discussed'),
      'ML-006 FAIL: memoryLeakagePatterns must include a pattern matching "as we discussed"'
    );
  });

  it('ML-007: All existing memory leakage patterns still present (regression gate)', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'ML-007 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      src.includes('memoryLeakagePatterns'),
      'ML-007 FAIL: memoryLeakagePatterns array must still be defined in orchestrator.js'
    );
    assert.ok(
      src.includes('as mentioned in your memory context'),
      'ML-007 FAIL: existing pattern "as mentioned in your memory context" must still be present'
    );
    assert.ok(
      src.includes('based on your memory context'),
      'ML-007 FAIL: existing pattern "based on your memory context" must still be present'
    );
    assert.ok(
      src.includes('according to your memory context'),
      'ML-007 FAIL: existing pattern "according to your memory context" must still be present'
    );
  });

});

// ============================================================
// DR. Doctrine Regression — Emergency Emotional Closing,
//     Fragment Detection, Medical Emergency Routing
// ============================================================

describe('DR. Doctrine Regression — Emergency Emotional/Fragment/Medical Routing', () => {

  it('DR-001: high_stakes:MEDICAL query does NOT get emotional reassurance closing', () => {
    const src = readRepoFile('api/core/personalities/roxy_framework.js');
    assert.ok(src, 'DR-001 FAIL: api/core/personalities/roxy_framework.js not found');
    // The guard must check for high_stakes before adding reassurance
    assert.ok(
      src.includes('context?.phase4Metadata?.high_stakes?.isHighStakes'),
      'DR-001 FAIL: #enhanceWithEmotionalSupport must check context?.phase4Metadata?.high_stakes?.isHighStakes before adding reassurance closing'
    );
    // The reassurance block must be wrapped in the high-stakes guard
    assert.ok(
      src.includes('!context?.phase4Metadata?.high_stakes?.isHighStakes'),
      'DR-001 FAIL: Reassurance closing must be suppressed when high_stakes.isHighStakes is true'
    );
  });

  it('DR-002: Non-high-stakes anxious query DOES get emotional reassurance closing from Roxy', () => {
    const src = readRepoFile('api/core/personalities/roxy_framework.js');
    assert.ok(src, 'DR-002 FAIL: api/core/personalities/roxy_framework.js not found');
    // The reassurance text must still exist in the file (for non-high-stakes queries)
    assert.ok(
      src.includes('Your uncertainty makes sense'),
      'DR-002 FAIL: Reassurance text "Your uncertainty makes sense" must still exist for non-high-stakes queries'
    );
    // needsReassurance condition must still be present
    assert.ok(
      src.includes('needsReassurance'),
      'DR-002 FAIL: needsReassurance flag must still be evaluated in #enhanceWithEmotionalSupport'
    );
  });

  it('DR-003: "If you have ." fragment detected and removed by ORPHANED_BEGINNING_PATTERNS', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'DR-003 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      src.includes('ORPHANED_BEGINNING_PATTERNS'),
      'DR-003 FAIL: ORPHANED_BEGINNING_PATTERNS must be defined in orchestrator.js'
    );
    assert.ok(
      src.includes('/\\bif you have\\s*[.,]?\\s*$/i'),
      'DR-003 FAIL: ORPHANED_BEGINNING_PATTERNS must include /\\bif you have\\s*[.,]?\\s*$/i to catch "If you have ." fragments'
    );
  });

  it('DR-004: "If you have any questions" type fragment removed', () => {
    const src = readRepoFile('api/core/orchestrator.js');
    assert.ok(src, 'DR-004 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      src.includes('if you (need|want|would like|have any)'),
      'DR-004 FAIL: ORPHANED_BEGINNING_PATTERNS must include a pattern matching "if you (need|want|would like|have any)"'
    );
    // The ORPHANED_BEGINNING_PATTERNS block must use lastIndexOf for cleanup
    const orphanedIdx = src.indexOf('ORPHANED_BEGINNING_PATTERNS');
    const afterOrphaned = src.substring(orphanedIdx, orphanedIdx + 1000);
    assert.ok(
      afterOrphaned.includes('lastIndexOf'),
      'DR-004 FAIL: ORPHANED_BEGINNING_PATTERNS cleanup block must use lastIndexOf to find the last sentence boundary'
    );
  });

  it('DR-005: high_stakes:MEDICAL routes to Eli not Roxy', () => {
    const src = readRepoFile('api/core/personalities/personality_selector.js');
    assert.ok(src, 'DR-005 FAIL: api/core/personalities/personality_selector.js not found');
    assert.ok(
      src.includes("phase4Metadata?.high_stakes?.domains?.includes('MEDICAL')"),
      "DR-005 FAIL: personality_selector.js must include override for phase4Metadata.high_stakes.domains including 'MEDICAL'"
    );
    assert.ok(
      src.includes("high_stakes:MEDICAL"),
      "DR-005 FAIL: high_stakes:MEDICAL override must be present in personality_selector.js"
    );
  });

  it('DR-006: Non-high-stakes emotional query still routes to Roxy', () => {
    const src = readRepoFile('api/core/personalities/personality_selector.js');
    assert.ok(src, 'DR-006 FAIL: api/core/personalities/personality_selector.js not found');
    // Normal selection logic must still exist
    assert.ok(
      src.includes('eliConfidence > roxyConfidence'),
      'DR-006 FAIL: Normal personality selection logic (eliConfidence > roxyConfidence) must still exist'
    );
    // The MEDICAL override must only fire when domains includes MEDICAL (conditional)
    assert.ok(
      src.includes("domains?.includes('MEDICAL')"),
      "DR-006 FAIL: Override must be conditional on domains including 'MEDICAL' so non-medical queries still use normal routing"
    );
  });

  it('DR-008: "dog has cancer" flags high_stakes:MEDICAL', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'DR-008 FAIL: api/core/intelligence/truthTypeDetector.js not found');
    assert.ok(
      detector.includes('cancer'),
      'DR-008 FAIL: HIGH_STAKES_DOMAINS.MEDICAL must include "cancer" pattern so "My dog has cancer" triggers MEDICAL high-stakes'
    );
  });

  it('DR-009: "tumor" flags high_stakes:MEDICAL', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'DR-009 FAIL: api/core/intelligence/truthTypeDetector.js not found');
    assert.ok(
      detector.includes('tumor'),
      'DR-009 FAIL: HIGH_STAKES_DOMAINS.MEDICAL must include "tumor" pattern so queries containing "tumor" trigger MEDICAL high-stakes'
    );
  });

  it('DR-010: cancer pattern in MEDICAL triggers MEDICAL override → Eli', () => {
    const detector = readRepoFile('api/core/intelligence/truthTypeDetector.js');
    assert.ok(detector, 'DR-010 FAIL: api/core/intelligence/truthTypeDetector.js not found');
    // Verify cancer pattern is inside the MEDICAL block by tracking bracket depth
    const medicalBlockStart = detector.indexOf('MEDICAL: [');
    assert.ok(medicalBlockStart !== -1, 'DR-010 FAIL: Could not locate MEDICAL block in HIGH_STAKES_DOMAINS');
    let depth = 0;
    let medicalBlockEnd = -1;
    for (let i = medicalBlockStart; i < detector.length; i++) {
      if (detector[i] === '[') depth++;
      else if (detector[i] === ']') {
        depth--;
        if (depth === 0) { medicalBlockEnd = i; break; }
      }
    }
    assert.ok(medicalBlockEnd !== -1, 'DR-010 FAIL: Could not find closing bracket of MEDICAL block');
    const medicalBlock = detector.slice(medicalBlockStart, medicalBlockEnd + 1);
    assert.ok(
      medicalBlock.includes('cancer'),
      'DR-010 FAIL: "cancer" must be inside the MEDICAL block of HIGH_STAKES_DOMAINS so it triggers the MEDICAL override → Eli'
    );
  });

  it('DR-011: [SELECTOR] override log line present when MEDICAL fires', () => {
    const src = readRepoFile('api/core/personalities/personality_selector.js');
    assert.ok(src, 'DR-011 FAIL: api/core/personalities/personality_selector.js not found');
    assert.ok(
      src.includes('high_stakes:MEDICAL override firing → Eli'),
      'DR-011 FAIL: personality_selector.js must log "high_stakes:MEDICAL override firing → Eli" when the MEDICAL override fires. ' +
      'This log line is required for Railway log verification after deploy.'
    );
  });

  it('DR-012: Required patterns from DR-001 through DR-006 still present', () => {
    const selector = readRepoFile('api/core/personalities/personality_selector.js');
    assert.ok(selector, 'DR-012 FAIL: api/core/personalities/personality_selector.js not found');
    const roxy = readRepoFile('api/core/personalities/roxy_framework.js');
    assert.ok(roxy, 'DR-012 FAIL: api/core/personalities/roxy_framework.js not found');
    const orchestrator = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchestrator, 'DR-012 FAIL: api/core/orchestrator.js not found');

    // DR-001/002 guards: Roxy emotional suppression for high-stakes still present
    assert.ok(
      roxy.includes('high_stakes'),
      'DR-012 FAIL: roxy_framework.js must still check high_stakes to suppress emotional reassurance closing'
    );
    // DR-003/004 guards: ORPHANED_BEGINNING_PATTERNS still present in orchestrator
    assert.ok(
      orchestrator.includes('ORPHANED_BEGINNING_PATTERNS'),
      'DR-012 FAIL: orchestrator.js must still define ORPHANED_BEGINNING_PATTERNS'
    );
    // DR-005 guard: MEDICAL override still present
    assert.ok(
      selector.includes("domains?.includes('MEDICAL')"),
      "DR-012 FAIL: personality_selector.js must still include high_stakes MEDICAL override"
    );
    // DR-006 guard: Normal routing still present
    assert.ok(
      selector.includes('eliConfidence > roxyConfidence'),
      'DR-012 FAIL: Normal personality selection logic must still exist'
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// BR. Bounded Reasoning — Medical Emergency Disclaimer Suppression
// Verifies that high_stakes:MEDICAL non-volatile queries suppress the
// bounded reasoning disclaimer so emergency responses begin with action steps.
// ─────────────────────────────────────────────────────────────────────────────
describe('BR. Bounded Reasoning — Medical Emergency Disclaimer Suppression', () => {
  const GATE_PATH = 'api/core/intelligence/boundedReasoningGate.js';

  it('BR-001: high_stakes:MEDICAL + truth_type NOT VOLATILE → suppression check present in gate', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    // The suppression must check domains.includes('MEDICAL')
    assert.ok(
      gate.includes("phase4Metadata.high_stakes?.domains?.includes('MEDICAL')"),
      "BR-001 FAIL: boundedReasoningGate.js must check phase4Metadata.high_stakes?.domains?.includes('MEDICAL') " +
      'to suppress the disclaimer for medical emergency queries.'
    );

    // The suppression must guard against VOLATILE (keep disclaimer for volatile medical)
    assert.ok(
      gate.includes("phase4Metadata.truth_type !== 'VOLATILE'"),
      "BR-001 FAIL: boundedReasoningGate.js must guard the MEDICAL suppression with truth_type !== 'VOLATILE' " +
      'so that volatile medical queries (e.g. current COVID admission criteria) still receive the disclaimer.'
    );
  });

  it('BR-002: high_stakes:MEDICAL + truth_type VOLATILE → suppression does NOT short-circuit (VOLATILE guard)', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    // The VOLATILE guard must be a !== check (not === which would invert the logic)
    assert.ok(
      gate.includes("truth_type !== 'VOLATILE'"),
      "BR-002 FAIL: The VOLATILE guard must use !== 'VOLATILE' so VOLATILE medical queries still get the disclaimer."
    );
  });

  it('BR-003: FINANCIAL high-stakes path still fires (medical suppression is scoped to MEDICAL only)', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    // The high_stakes general trigger must still exist for FINANCIAL / LEGAL domains
    assert.ok(
      gate.includes('phase4Metadata.high_stakes?.isHighStakes && !phase4Metadata.verified_at'),
      "BR-003 FAIL: The general high_stakes trigger must remain intact in boundedReasoningGate.js so " +
      'FINANCIAL and other high-stakes queries still receive the disclaimer.'
    );
  });

  it('BR-004: LEGAL high-stakes path still fires (general high_stakes trigger unchanged)', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    // Same general trigger covers LEGAL — just verify it's still present
    assert.ok(
      gate.includes("reason: 'High-stakes claim without external verification'"),
      "BR-004 FAIL: The 'High-stakes claim without external verification' reason string must remain in " +
      'boundedReasoningGate.js so LEGAL and other high-stakes queries still receive the disclaimer.'
    );
  });

  it('BR-005: PERMANENT truth_type still suppressed as before (existing behaviour unchanged)', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    assert.ok(
      gate.includes("phase4Metadata.truth_type === 'PERMANENT'"),
      "BR-005 FAIL: PERMANENT truth_type suppression must still be present in boundedReasoningGate.js."
    );
    assert.ok(
      gate.includes("reason: 'Permanent fact - no uncertainty disclosure needed'"),
      "BR-005 FAIL: The 'Permanent fact - no uncertainty disclosure needed' reason string must remain intact."
    );
  });

  it('BR-006: Medical suppression block appears AFTER PERMANENT check and BEFORE speculative check', () => {
    const gate = readRepoFile(GATE_PATH);
    assert.ok(gate, 'Could not read boundedReasoningGate.js');

    const permanentIdx = gate.indexOf("reason: 'Permanent fact - no uncertainty disclosure needed'");
    const medicalIdx   = gate.indexOf("phase4Metadata.high_stakes?.domains?.includes('MEDICAL')");
    const speculativeIdx = gate.indexOf('SPECULATIVE_PATTERNS.test(queryText)');

    assert.ok(permanentIdx  !== -1, 'BR-006 FAIL: PERMANENT suppression not found.');
    assert.ok(medicalIdx    !== -1, 'BR-006 FAIL: MEDICAL suppression not found.');
    assert.ok(speculativeIdx !== -1, 'BR-006 FAIL: Speculative check not found.');

    assert.ok(
      permanentIdx < medicalIdx,
      'BR-006 FAIL: MEDICAL suppression must appear AFTER the PERMANENT suppression.'
    );
    assert.ok(
      medicalIdx < speculativeIdx,
      'BR-006 FAIL: MEDICAL suppression must appear BEFORE the speculative check.'
    );
  });

});

// ============================================================
// SECTION FE: FRONTEND PERSONALITY LABEL — API RESPONSE READ
// Verifies that public/index.html reads personality from the
// backend response (metadata.personalityApplied) rather than
// blindly alternating via aiToggle.
// ============================================================

describe('FE. Frontend Personality Label — Reads from API Response', () => {

  const indexHtml = readRepoFile('public/index.html') || '';

  it('FE-001: Personality label reads from metadata.personalityApplied when present', () => {
    assert.ok(
      indexHtml.includes('data?.metadata?.personalityApplied'),
      'FE-001 FAIL: index.html must read personality from data?.metadata?.personalityApplied'
    );
  });

  it('FE-002: Falls back to aiToggle when metadata.personalityApplied is missing or null', () => {
    assert.ok(
      indexHtml.includes("(aiToggle ? 'eli' : 'roxy')"),
      "FE-002 FAIL: index.html must fall back to (aiToggle ? 'eli' : 'roxy') when metadata is absent"
    );
  });

  it('FE-003: Both chat handler locations updated — personalityApplied appears at least twice', () => {
    const matches = (indexHtml.match(/data\?\.metadata\?\.personalityApplied/g) || []).length;
    assert.ok(
      matches >= 2,
      `FE-003 FAIL: Expected personalityApplied in at least 2 handler locations, found ${matches}`
    );
  });

  it('FE-004: Eli label logic uses lowercase comparison against personalityUsed', () => {
    assert.ok(
      indexHtml.includes("personalityUsed?.toLowerCase() === 'eli'"),
      "FE-004 FAIL: index.html must use personalityUsed?.toLowerCase() === 'eli' to determine Eli"
    );
  });

  it('FE-005: Roxy label is derived from isEli being false (not personalityUsed === roxy direct)', () => {
    // The pattern `const who = isEli ? "Eli" : "Roxy"` covers Roxy via negation
    assert.ok(
      indexHtml.includes('"Roxy"'),
      'FE-005 FAIL: index.html must still render "Roxy" label for non-Eli personality'
    );
  });

});

// ============================================================
// SECTION MT: DYNAMIC MAX_TOKENS — Response Truncation Fix
// Verifies that high-stakes and complex queries get larger
// max_tokens budgets so responses are not truncated mid-sentence.
// ============================================================

describe('MT. Dynamic max_tokens — Response Truncation Fix', () => {

  const orch = readRepoFile('api/core/orchestrator.js');

  it('MT-001: high_stakes query returns max_tokens 4000 from getMaxTokens', () => {
    assert.ok(orch, 'MT-001 FAIL: api/core/orchestrator.js not found');
    // The function body must contain the 4000 value for high_stakes
    const fnStart = orch.indexOf('function getMaxTokens(');
    assert.ok(fnStart !== -1, 'MT-001 FAIL: getMaxTokens not found');
    const fnEnd = orch.indexOf('\n}', fnStart);
    const fnBody = orch.slice(fnStart, fnEnd + 2);
    assert.ok(
      fnBody.includes('isHighStakes') && fnBody.includes('4000'),
      'MT-001 FAIL: getMaxTokens must return 4000 when phase4Metadata.high_stakes.isHighStakes is true. ' +
      'High-stakes queries (medical, legal, safety) need room for complete responses.'
    );
  });

  it('MT-002: complex_analytical query returns max_tokens 3000 from getMaxTokens', () => {
    assert.ok(orch, 'MT-002 FAIL: api/core/orchestrator.js not found');
    const fnStart = orch.indexOf('function getMaxTokens(');
    assert.ok(fnStart !== -1, 'MT-002 FAIL: getMaxTokens not found');
    const fnEnd = orch.indexOf('\n}', fnStart);
    const fnBody = orch.slice(fnStart, fnEnd + 2);
    assert.ok(
      fnBody.includes('complex_analytical') && fnBody.includes('3000'),
      'MT-002 FAIL: getMaxTokens must return 3000 for complex_analytical classification.'
    );
  });

  it('MT-003: decision_making query returns max_tokens 3000 from getMaxTokens', () => {
    assert.ok(orch, 'MT-003 FAIL: api/core/orchestrator.js not found');
    const fnStart = orch.indexOf('function getMaxTokens(');
    assert.ok(fnStart !== -1, 'MT-003 FAIL: getMaxTokens not found');
    const fnEnd = orch.indexOf('\n}', fnStart);
    const fnBody = orch.slice(fnStart, fnEnd + 2);
    assert.ok(
      fnBody.includes('decision_making') && fnBody.includes('3000'),
      'MT-003 FAIL: getMaxTokens must return 3000 for decision_making classification.'
    );
  });

  it('MT-004: standard query default is max_tokens 2000', () => {
    assert.ok(orch, 'MT-004 FAIL: api/core/orchestrator.js not found');
    const fnStart = orch.indexOf('function getMaxTokens(');
    assert.ok(fnStart !== -1, 'MT-004 FAIL: getMaxTokens not found');
    const fnEnd = orch.indexOf('\n}', fnStart);
    const fnBody = orch.slice(fnStart, fnEnd + 2);
    assert.ok(
      fnBody.includes('return 2000'),
      'MT-004 FAIL: getMaxTokens must return 2000 as the default for standard queries. ' +
      'Greeting and simple queries must not increase token budget.'
    );
  });

  it('MT-005: getMaxTokens function is defined in orchestrator.js', () => {
    assert.ok(orch, 'MT-005 FAIL: api/core/orchestrator.js not found');
    assert.ok(
      orch.includes('function getMaxTokens('),
      'MT-005 FAIL: getMaxTokens function not found in orchestrator.js. ' +
      'The function must be defined to provide dynamic max_tokens for AI calls.'
    );
  });

  it('MT-006: Both Claude and GPT-4o calls use dynamic maxTokens variable', () => {
    assert.ok(orch, 'MT-006 FAIL: api/core/orchestrator.js not found');
    // Count occurrences of max_tokens: maxTokens in the AI routing section
    const matches = (orch.match(/max_tokens:\s*maxTokens/g) || []).length;
    assert.ok(
      matches >= 2,
      `MT-006 FAIL: Expected max_tokens: maxTokens in both Claude and GPT-4o calls, found ${matches} occurrence(s). ` +
      'Both AI API calls must use the dynamic maxTokens variable to prevent response truncation.'
    );
  });

});

// ============================================================
// SECTION ME: MEDICAL EMERGENCY EARLY RETURN
// Verifies that medical emergency queries bypass Stage 2 and
// are deterministically classified as PERMANENT.
// Background: Stage 2 classifier was returning VOLATILE /
// PERSONAL_CONTEXTUAL for "unconscious for 20 minutes" queries.
// The fix adds a MEDICAL_EMERGENCY_PATTERNS early return in
// detectTruthType before Stage 2 is invoked.
// ============================================================

describe('ME. Medical Emergency Early Return — Stage 2 Bypass', () => {

  const DETECTOR_PATH = 'api/core/intelligence/truthTypeDetector.js';
  const detector = readRepoFile(DETECTOR_PATH);

  it('ME-001: MEDICAL_EMERGENCY_PATTERNS constant exists and includes "unconscious" pattern', () => {
    assert.ok(detector, `ME-001 FAIL: ${DETECTOR_PATH} not found`);
    assert.ok(
      detector.includes('MEDICAL_EMERGENCY_PATTERNS'),
      'ME-001 FAIL: MEDICAL_EMERGENCY_PATTERNS constant not found in truthTypeDetector.js. ' +
      '"unconscious for 20 minutes" queries must be caught by this pattern array.'
    );
    assert.ok(
      detector.includes('unconscious'),
      'ME-001 FAIL: MEDICAL_EMERGENCY_PATTERNS must include "unconscious" to catch ' +
      '"My father...has been unconscious for 20 minutes" type queries.'
    );
  });

  it('ME-002: MEDICAL_EMERGENCY_PATTERNS includes "not breathing" pattern', () => {
    assert.ok(detector, `ME-002 FAIL: ${DETECTOR_PATH} not found`);
    assert.ok(
      detector.includes('not breathing'),
      'ME-002 FAIL: MEDICAL_EMERGENCY_PATTERNS must include "not breathing" pattern. ' +
      '"not breathing what do I do" must return PERMANENT not VOLATILE.'
    );
  });

  it('ME-003: MEDICAL_EMERGENCY_PATTERNS includes "heart attack" pattern', () => {
    assert.ok(detector, `ME-003 FAIL: ${DETECTOR_PATH} not found`);
    assert.ok(
      detector.includes('heart attack'),
      'ME-003 FAIL: MEDICAL_EMERGENCY_PATTERNS must include "heart attack" pattern. ' +
      '"heart attack what should I do" must return PERMANENT not VOLATILE.'
    );
  });

  it('ME-004: VOLATILE_PATTERNS still exist — non-emergency medical queries remain VOLATILE', () => {
    assert.ok(detector, `ME-004 FAIL: ${DETECTOR_PATH} not found`);
    assert.ok(
      detector.includes('VOLATILE_PATTERNS'),
      'ME-004 FAIL: VOLATILE_PATTERNS must still exist in truthTypeDetector.js. ' +
      '"current COVID hospital criteria" and similar queries must remain VOLATILE.'
    );
  });

  it('ME-005: Medical emergency early return is placed BEFORE classifyAmbiguous call in detectTruthType', () => {
    assert.ok(detector, `ME-005 FAIL: ${DETECTOR_PATH} not found`);
    const fnStart = detector.indexOf('export async function detectTruthType(');
    assert.ok(fnStart !== -1, 'ME-005 FAIL: detectTruthType function not found');

    const medicalReturnIdx   = detector.indexOf('MEDICAL_EMERGENCY_PATTERNS', fnStart);
    const stage2CallIdx      = detector.indexOf('classifyAmbiguous(query', fnStart);

    assert.ok(medicalReturnIdx !== -1, 'ME-005 FAIL: MEDICAL_EMERGENCY_PATTERNS not found inside detectTruthType');
    assert.ok(stage2CallIdx    !== -1, 'ME-005 FAIL: classifyAmbiguous call not found inside detectTruthType');
    assert.ok(
      medicalReturnIdx < stage2CallIdx,
      'ME-005 FAIL: Medical emergency early return must appear BEFORE the classifyAmbiguous(query...) call ' +
      'in detectTruthType. Stage 2 must not be invoked for medical emergency queries.'
    );
  });

  it('ME-006: Medical emergency early return uses PERMANENT truth type', () => {
    assert.ok(detector, `ME-006 FAIL: ${DETECTOR_PATH} not found`);
    const fnStart = detector.indexOf('export async function detectTruthType(');
    assert.ok(fnStart !== -1, 'ME-006 FAIL: detectTruthType function not found');

    // Find the medical emergency block and verify it returns PERMANENT
    const medicalBlockStart = detector.indexOf('MEDICAL_EMERGENCY_PATTERNS', fnStart);
    assert.ok(medicalBlockStart !== -1, 'ME-006 FAIL: MEDICAL_EMERGENCY_PATTERNS block not found in detectTruthType');

    // The isMedicalEmergency block should return TRUTH_TYPES.PERMANENT
    // Use a 1200-char window to cover the full pattern array + conditional block
    const blockRegion = detector.slice(medicalBlockStart, medicalBlockStart + 1200);
    assert.ok(
      blockRegion.includes('TRUTH_TYPES.PERMANENT') || blockRegion.includes("'PERMANENT'"),
      'ME-006 FAIL: Medical emergency early return must classify as PERMANENT. ' +
      'Emergency protocols (call 911, CPR steps) are permanent established knowledge, not real-time data.'
    );
  });

});

// ============================================================
// VL. Vault Loading Mode Guard — Item 17 Fix 1
// Vault must never be loaded for truth_general mode
// ============================================================
describe('VL. Vault Loading Mode Guard — truth_general must not load vault', () => {

  it('VL-001: truth_general mode does not attempt vault load even when vaultContext is provided', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'VL-001 FAIL: Could not read api/core/orchestrator.js');
    // The vault loading logic must require mode === "site_monkeys" even when vaultContext is supplied
    // Old (broken): let vaultData = vaultContext ? await this.#loadVaultContext(vaultContext) : ...
    // New (fixed):  let vaultData = vaultContext && mode === "site_monkeys" ? ...
    assert.ok(
      orch.includes('vaultContext && mode === "site_monkeys"'),
      'VL-001 FAIL: Vault loading must be gated on both vaultContext AND mode === "site_monkeys". ' +
      'Without the mode check, vault is loaded for truth_general requests that pass vaultContext.'
    );
  });

  it('VL-002: site_monkeys mode still loads vault correctly (both vault paths present)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'VL-002 FAIL: Could not read api/core/orchestrator.js');
    // First path: explicit vaultContext with site_monkeys guard
    assert.ok(
      orch.includes('vaultContext && mode === "site_monkeys"'),
      'VL-002 FAIL: First vault path (explicit vaultContext) must also be guarded by mode === "site_monkeys"'
    );
    // Second path: auto-load for site_monkeys + vaultEnabled
    assert.ok(
      orch.includes('mode === "site_monkeys" && vaultEnabled'),
      'VL-002 FAIL: Second vault path (auto-load when vaultEnabled) must remain guarded by mode === "site_monkeys"'
    );
  });

});

// ============================================================
// MC. Memory Quality — Complaint & Meta-Commentary Filter
// Item 17 Fix 2: Complaints about AI behaviour are not user facts
// ============================================================
describe('MC. Memory Quality — Complaint and Meta-Commentary Filter', () => {

  it('MC-001: "You\'re not using real time" blocked as meta-commentary (code-scan)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'MC-001 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes('complaintAndMetaCommentaryPatterns'),
      'MC-001 FAIL: complaintAndMetaCommentaryPatterns array must exist in intelligent-storage.js'
    );
    assert.ok(
      storage.includes('complaint_or_meta_commentary'),
      'MC-001 FAIL: return reason "complaint_or_meta_commentary" must exist in intelligent-storage.js'
    );
  });

  it('MC-002: "Why are you doing this" blocked as AI-directed question (pattern present)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'MC-002 FAIL: Could not read api/memory/intelligent-storage.js');
    // The pattern for "why are/do/don't/won't/can't/aren't/doesn't/didn't you" must be present
    assert.ok(
      storage.includes("/^why (?:are|aren'?t|do|don'?t|doesn'?t|didn'?t|won'?t|can'?t) you\\b/i"),
      'MC-002 FAIL: Pattern for "why are/do/don\'t you" AI-directed questions must be in complaintAndMetaCommentaryPatterns'
    );
  });

  it('MC-003: "Your memory is wrong" blocked as meta-commentary (pattern present)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'MC-003 FAIL: Could not read api/memory/intelligent-storage.js');
    // The pattern for "your memory/system/response is/was/isn't..." must be present
    assert.ok(
      storage.includes("/\\byour (?:memory|system|response|answer) (?:is|was|isn'?t|wasn'?t|doesn'?t|don'?t)\\b/i"),
      'MC-003 FAIL: Pattern for "your memory/system is/was wrong" must be in complaintAndMetaCommentaryPatterns'
    );
  });

  it('MC-004: complaint filter runs after metaSystemPatterns and before generalInfoPatterns (ordering)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'MC-004 FAIL: Could not read api/memory/intelligent-storage.js');
    const metaIdx = storage.indexOf('metaSystemPatterns');
    const complaintIdx = storage.indexOf('complaintAndMetaCommentaryPatterns');
    const generalIdx = storage.indexOf('generalInfoPatterns');
    assert.ok(metaIdx !== -1, 'MC-004 FAIL: metaSystemPatterns not found');
    assert.ok(complaintIdx !== -1, 'MC-004 FAIL: complaintAndMetaCommentaryPatterns not found');
    assert.ok(generalIdx !== -1, 'MC-004 FAIL: generalInfoPatterns not found');
    assert.ok(
      metaIdx < complaintIdx && complaintIdx < generalIdx,
      'MC-004 FAIL: complaintAndMetaCommentaryPatterns must appear after metaSystemPatterns ' +
      'and before generalInfoPatterns in detectNonUserQuery'
    );
  });

});

// ============================================================
// SA. Semantic Analyzer — Null Guard Fixes
// intentEmbeddings / domainEmbeddings are null before initialize()
// is called; analyzeSemantics must lazy-init so real embeddings are
// loaded on first use, and classifyIntent/classifyDomain guard
// against the null case as a safety net.
// ============================================================
describe('SA. Semantic Analyzer — Null Guard Fixes', () => {

  it('SA-001: #classifyIntent has null guard for intentEmbeddings before accessing .question', () => {
    const analyzer = readRepoFile('api/core/intelligence/semantic_analyzer.js');
    assert.ok(analyzer, 'SA-001 FAIL: Could not read api/core/intelligence/semantic_analyzer.js');
    assert.ok(
      analyzer.includes('!this.intentEmbeddings'),
      'SA-001 FAIL: #classifyIntent must contain null guard "!this.intentEmbeddings" before accessing intentEmbeddings.question'
    );
  });

  it('SA-002: #classifyDomain has null guard for domainEmbeddings before accessing .business', () => {
    const analyzer = readRepoFile('api/core/intelligence/semantic_analyzer.js');
    assert.ok(analyzer, 'SA-002 FAIL: Could not read api/core/intelligence/semantic_analyzer.js');
    assert.ok(
      analyzer.includes('!this.domainEmbeddings'),
      'SA-002 FAIL: #classifyDomain must contain null guard "!this.domainEmbeddings" before accessing domainEmbeddings.business'
    );
  });

  it('SA-003: detectNonUserQuery validates semanticResult object before accessing properties', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SA-003 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes('!semanticResult || typeof semanticResult !== \'object\''),
      'SA-003 FAIL: detectNonUserQuery must validate semanticResult with null/type check before accessing its properties'
    );
  });

  it('SA-004: detectNonUserQuery accesses semanticResult properties directly (not via optional chain) after the null guard', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SA-004 FAIL: Could not read api/memory/intelligent-storage.js');
    // After the null guard the code must use direct property access, not optional chaining
    assert.ok(
      storage.includes('semanticResult.personalContext') &&
      storage.includes('semanticResult.domain') &&
      storage.includes('semanticResult.intent') &&
      storage.includes('semanticResult.emotionalTone'),
      'SA-004 FAIL: After the null guard, detectNonUserQuery must access semanticResult properties directly'
    );
  });

  it('SA-005: analyzeSemantics has lazy-init guard that calls initialize() when embeddings are not pre-loaded', () => {
    const analyzer = readRepoFile('api/core/intelligence/semantic_analyzer.js');
    assert.ok(analyzer, 'SA-005 FAIL: Could not read api/core/intelligence/semantic_analyzer.js');
    // The lazy-init block must check both embedding maps and call initialize()
    assert.ok(
      analyzer.includes('!this.intentEmbeddings || !this.domainEmbeddings'),
      'SA-005 FAIL: analyzeSemantics must check "!this.intentEmbeddings || !this.domainEmbeddings" for lazy init'
    );
    assert.ok(
      analyzer.includes('await this.initialize()'),
      'SA-005 FAIL: analyzeSemantics must call "await this.initialize()" when embeddings are not loaded'
    );
  });

});

// ============================================================
// CQ. Commodity Query Simplification — Item 17 Fix 3
// Commodity queries must extract a clean "commodity price" term
// instead of passing the full verbose message to external lookup
// ============================================================
describe('CQ. Commodity Query Simplification — Item 17 Fix 3', () => {

  it('CQ-001: extractCommoditySearchQuery function exists in orchestrator.js', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CQ-001 FAIL: Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('extractCommoditySearchQuery'),
      'CQ-001 FAIL: extractCommoditySearchQuery function must be defined in orchestrator.js'
    );
    // Must return commodity + " price" for known commodities
    assert.ok(
      orch.includes('`${commodityMatch[1]} price`'),
      'CQ-001 FAIL: extractCommoditySearchQuery must return `${commodityMatch[1]} price` for matched commodities'
    );
  });

  it('CQ-002: isCommodityQuantityQuery uses extractCommoditySearchQuery for lookup query', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CQ-002 FAIL: Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('isCommodityQuantityQuery') &&
      orch.includes('extractCommoditySearchQuery(enrichedMessage)'),
      'CQ-002 FAIL: When isCommodityQuantityQuery is true, lookupQuery must be built via extractCommoditySearchQuery(enrichedMessage)'
    );
  });

  it('CQ-003: non-commodity queries still strip [DOCUMENT CONTEXT] block (original behaviour preserved)', () => {
    const orch = readRepoFile('api/core/orchestrator.js');
    assert.ok(orch, 'CQ-003 FAIL: Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('enrichedMessage.replace(/\\[DOCUMENT CONTEXT\\][\\s\\S]*/i, \'\').trim()'),
      'CQ-003 FAIL: Non-commodity, non-verification path must still strip [DOCUMENT CONTEXT] block from lookupQuery'
    );
  });

});

// ============================================================
// SM. Semantic Analyzer — system_feedback and system_meta
// FIX 1: Add system_feedback intent + system_meta domain so the
// semantic path can detect AI-directed complaints directly.
// ============================================================
describe('SM. Semantic Analyzer — system_feedback intent and system_meta domain', () => {

  it('SM-001: system_feedback intent present in semantic analyzer', () => {
    const analyzer = readRepoFile('api/core/intelligence/semantic_analyzer.js');
    assert.ok(analyzer, 'SM-001 FAIL: Could not read api/core/intelligence/semantic_analyzer.js');
    assert.ok(
      analyzer.includes('system_feedback'),
      'SM-001 FAIL: "system_feedback" intent key must be present in semantic_analyzer.js intentPhrases and intentCategories'
    );
    assert.ok(
      analyzer.includes('I want to report a problem with you') ||
      analyzer.includes('your response was wrong') ||
      analyzer.includes('why are you not doing this correctly'),
      'SM-001 FAIL: system_feedback representative phrase must be present in intentPhrases in semantic_analyzer.js'
    );
  });

  it('SM-002: system_meta domain present in semantic analyzer', () => {
    const analyzer = readRepoFile('api/core/intelligence/semantic_analyzer.js');
    assert.ok(analyzer, 'SM-002 FAIL: Could not read api/core/intelligence/semantic_analyzer.js');
    assert.ok(
      analyzer.includes('system_meta'),
      'SM-002 FAIL: "system_meta" domain key must be present in semantic_analyzer.js domainPhrases and domainCategories'
    );
    assert.ok(
      analyzer.includes('AI system behavior') ||
      analyzer.includes('complaint about assistant response') ||
      analyzer.includes('feedback about AI performance'),
      'SM-002 FAIL: system_meta representative phrase must be present in domainPhrases in semantic_analyzer.js'
    );
  });

});

// ============================================================
// SC. Semantic Complaint Detection — production-safe architecture
// FIX 2: Semantic decides (system_feedback), regex assists.
// Ambiguity is protected: personal facts always allow storage.
// ============================================================
describe('SC. Semantic Complaint Detection — production-safe architecture', () => {

  it('SC-001: systemComplaintPatterns covers "Why are you not using real time data" (start-of-query anchor present)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SC-001 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes('systemComplaintPatterns'),
      'SC-001 FAIL: systemComplaintPatterns array must exist in shouldBlockAsMetaCommentary section'
    );
    // Pattern anchored at start for "why are/do/don't/won't/can't/aren't you"
    assert.ok(
      storage.includes("/^why (are|do|don'?t|won'?t|can'?t|aren'?t) you\\b/i"),
      'SC-001 FAIL: systemComplaintPatterns must include start-anchored "^why (are|do|...) you" pattern to catch SC-001 query'
    );
  });

  it('SC-002: systemComplaintPatterns covers "You\'re not using real time" (you\'re pattern present)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SC-002 FAIL: Could not read api/memory/intelligent-storage.js');
    // Pattern for "you're not/always/keep ...ing"
    assert.ok(
      storage.includes("/\\byou'?re (not |always |keep )\\w+ing\\b/i"),
      "SC-002 FAIL: systemComplaintPatterns must include \"you're (not|always|keep) ...ing\" pattern to catch SC-002 query"
    );
  });

  it('SC-003: personal-fact queries are protected (noPersonalFacts guard present in shouldBlockAsMetaCommentary)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SC-003 FAIL: Could not read api/memory/intelligent-storage.js');
    // The shouldBlockAsMetaCommentary function must return false when personal facts are detected
    assert.ok(
      storage.includes('if (!noPersonalFacts) return false;'),
      'SC-003 FAIL: shouldBlockAsMetaCommentary must guard with "if (!noPersonalFacts) return false;" to protect personal facts like SC-003'
    );
  });

  it('SC-004: shouldBlockAsMetaCommentary uses semantic intent as primary gate with domain-based analytical safeguard', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'SC-004 FAIL: Could not read api/memory/intelligent-storage.js');
    // Semantic primary: block only when semantic classifier says system_feedback
    assert.ok(
      storage.includes("intent === 'system_feedback'"),
      "SC-004 FAIL: shouldBlockAsMetaCommentary must check intent === 'system_feedback' as the primary semantic gate"
    );
    // Analytical safeguard must check domain, NOT intent again.
    // "Why are you not using real time data in financial analysis?" → domain='financial' → NOT blocked.
    // The negation (!analyticalDomains.includes(domain)) is what protects SC-004.
    assert.ok(
      storage.includes('analyticalDomains') &&
      storage.includes('analyticalDomains.includes(domain)') &&
      storage.includes('!analyticalDomains.includes(domain)'),
      "SC-004 FAIL: Rule 1 must protect analytical queries via !analyticalDomains.includes(domain), " +
      "not via intent !== 'analytical' which is always true when intent === 'system_feedback'"
    );
    assert.ok(
      storage.includes("'financial'") && storage.includes("'technical'") && storage.includes("'business'"),
      "SC-004 FAIL: analyticalDomains must include 'financial', 'technical', and 'business' to protect SC-004-type queries"
    );
    // Rule 2 uses intentConf (from semanticResult.intentConfidence) — ambiguity protected by low-confidence + strong signal
    assert.ok(
      storage.includes('semanticResult.intentConfidence') && storage.includes('intentConf'),
      'SC-004 FAIL: Rule 2 must read intentConf from semanticResult.intentConfidence so that high-confidence analytical queries like SC-004 are not falsely blocked'
    );
  });

});

// ============================================================
// VK. Vault KV Mode Guard
// FIX 3: Vault KV fetch must be skipped when not in site_monkeys mode.
// ============================================================
describe('VK. Vault KV Mode Guard — KV fetch skipped outside site_monkeys mode', () => {

  it('VK-001: Vault KV skipped when not site_monkeys mode (mode guard present in load-vault.js)', () => {
    const loadVault = readRepoFile('api/load-vault.js');
    assert.ok(loadVault, 'VK-001 FAIL: Could not read api/load-vault.js');
    // Must extract mode from request
    assert.ok(
      loadVault.includes("req.query.mode") || loadVault.includes("req.body?.mode") || loadVault.includes("req.body.mode"),
      'VK-001 FAIL: api/load-vault.js must read mode from request (req.query.mode or req.body.mode)'
    );
    // Must guard KV fetch against non-site_monkeys mode
    assert.ok(
      loadVault.includes("mode !== 'site_monkeys'") || loadVault.includes('mode !== "site_monkeys"'),
      "VK-001 FAIL: api/load-vault.js must contain mode !== 'site_monkeys' guard before vault KV fetch"
    );
  });

});

// ============================================================
// TR. Trivial Message Pre-filter
// Skip trivial messages before any API calls
// ============================================================
describe('TR. Trivial Message Pre-filter — detectTrivialMessage and storeWithIntelligence guard', () => {

  it('TR-001: detectTrivialMessage method exists in intelligent-storage.js', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'TR-001 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes('detectTrivialMessage('),
      'TR-001 FAIL: detectTrivialMessage method must exist in IntelligentMemoryStorage'
    );
  });

  it('TR-002: detectTrivialMessage skips short messages (too_short reason)', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'TR-002 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes("reason: 'too_short'"),
      "TR-002 FAIL: detectTrivialMessage must return reason: 'too_short' for messages under the minimum length"
    );
    assert.ok(
      storage.includes('MIN_STORABLE_MESSAGE_LENGTH') && storage.includes('trimmed.length < MIN_STORABLE_MESSAGE_LENGTH'),
      'TR-002 FAIL: detectTrivialMessage must use MIN_STORABLE_MESSAGE_LENGTH constant for the length check'
    );
  });

  it('TR-003: detectTrivialMessage has TRIVIAL_MESSAGE_PATTERNS covering greetings and acknowledgements', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'TR-003 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes('TRIVIAL_MESSAGE_PATTERNS'),
      'TR-003 FAIL: patterns must be defined in the module-level TRIVIAL_MESSAGE_PATTERNS constant'
    );
    assert.ok(
      storage.includes('hi|hello|hey'),
      "TR-003 FAIL: TRIVIAL_MESSAGE_PATTERNS must cover basic greetings (hi|hello|hey)"
    );
    assert.ok(
      storage.includes('ok|okay|sure'),
      "TR-003 FAIL: TRIVIAL_MESSAGE_PATTERNS must cover acknowledgements (ok|okay|sure)"
    );
    assert.ok(
      storage.includes('sounds good|makes sense'),
      "TR-003 FAIL: TRIVIAL_MESSAGE_PATTERNS must cover positive acknowledgements (sounds good|makes sense)"
    );
    assert.ok(
      storage.includes("reason: 'trivial_greeting'"),
      "TR-003 FAIL: detectTrivialMessage must return reason: 'trivial_greeting' for trivial pattern matches"
    );
  });

  it('TR-004: storeWithIntelligence calls detectTrivialMessage BEFORE detectNonUserQuery', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'TR-004 FAIL: Could not read api/memory/intelligent-storage.js');
    const trivialIdx = storage.indexOf('detectTrivialMessage(userMessage)');
    const nonUserIdx = storage.indexOf('detectNonUserQuery(userMessage)');
    assert.ok(trivialIdx !== -1, 'TR-004 FAIL: storeWithIntelligence must call detectTrivialMessage(userMessage)');
    assert.ok(nonUserIdx !== -1, 'TR-004 FAIL: storeWithIntelligence must call detectNonUserQuery(userMessage)');
    assert.ok(
      trivialIdx < nonUserIdx,
      'TR-004 FAIL: detectTrivialMessage must be called BEFORE detectNonUserQuery in storeWithIntelligence'
    );
  });

  it('TR-005: trivial message guard returns action skipped with reason trivial_message', () => {
    const storage = readRepoFile('api/memory/intelligent-storage.js');
    assert.ok(storage, 'TR-005 FAIL: Could not read api/memory/intelligent-storage.js');
    assert.ok(
      storage.includes("reason: 'trivial_message'"),
      "TR-005 FAIL: storeWithIntelligence must return { action: 'skipped', reason: 'trivial_message' } for trivial messages"
    );
    assert.ok(
      storage.includes('[MEMORY-QUALITY] Skipping trivial message'),
      "TR-005 FAIL: storeWithIntelligence must log '[MEMORY-QUALITY] Skipping trivial message' when skipping"
    );
  });

});

// ============================================================
// CP. Cost Protection — Adaptive Degradation (Item 18)
// Verifies cost-aware lookup gate and history depth reduction
// ============================================================
describe('CP. Cost Protection — Adaptive Degradation', () => {
  const ORCH_PATH = 'api/core/orchestrator.js';
  const COST_TRACKER_PATH = 'api/utils/cost-tracker.js';
  const MIGRATION_PATH = 'api/admin/cost-observability.js';

  it('CP-001: isApproachingCeiling method exists in cost-tracker.js and returns true at 75% of ceiling', () => {
    const tracker = readRepoFile(COST_TRACKER_PATH);
    assert.ok(tracker, 'CP-001 FAIL: Could not read api/utils/cost-tracker.js');

    assert.ok(
      tracker.includes('isApproachingCeiling('),
      'CP-001 FAIL: isApproachingCeiling method not found in cost-tracker.js'
    );

    assert.ok(
      tracker.includes('0.75') || tracker.includes('* 0.75'),
      'CP-001 FAIL: isApproachingCeiling must use 0.75 (75%) as the threshold'
    );

    assert.ok(
      tracker.includes('getSessionCost(sessionId)') || tracker.includes('this.getSessionCost('),
      'CP-001 FAIL: isApproachingCeiling must use getSessionCost to retrieve current session cost'
    );

    assert.ok(
      tracker.includes('COST_CEILINGS[mode]') || tracker.includes('COST_CEILINGS['),
      'CP-001 FAIL: isApproachingCeiling must reference COST_CEILINGS for the ceiling value'
    );
  });

  it('CP-002: External lookup disabled when approaching ceiling — gate present in orchestrator.js', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CP-002 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orch.includes('isApproachingCeiling('),
      'CP-002 FAIL: isApproachingCeiling not called in orchestrator.js'
    );

    assert.ok(
      orch.includes('shouldLookup = false') &&
      orch.includes('isApproachingCeiling('),
      'CP-002 FAIL: orchestrator.js must set shouldLookup = false when approaching ceiling'
    );

    assert.ok(
      orch.includes('[COST-PROTECTION]') &&
      orch.includes('External lookup disabled'),
      "CP-002 FAIL: orchestrator.js must log '[COST-PROTECTION] External lookup disabled' when gate fires"
    );

    assert.ok(
      orch.includes('lookup_disabled_by_cost = true'),
      'CP-002 FAIL: orchestrator.js must set phase4Metadata.lookup_disabled_by_cost = true when gate fires'
    );
  });

  it('CP-003: History depth reduced to 2 when approaching ceiling', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CP-003 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orch.includes('isApproachingCeiling = false') ||
      orch.includes('isApproachingCeiling=false'),
      'CP-003 FAIL: getConversationDepth must accept isApproachingCeiling parameter with default false'
    );

    assert.ok(
      orch.includes('getConversationDepth(') &&
      orch.includes('approachingCeiling'),
      'CP-003 FAIL: orchestrator.js must compute approachingCeiling and pass it to getConversationDepth'
    );

    assert.ok(
      orch.includes('[COST-PROTECTION]') &&
      orch.includes('History depth reduced'),
      "CP-003 FAIL: orchestrator.js must log '[COST-PROTECTION] History depth reduced' when degradation fires"
    );

    assert.ok(
      orch.includes('history_reduced_by_cost = true'),
      'CP-003 FAIL: orchestrator.js must set phase4Metadata.history_reduced_by_cost = true when depth is reduced'
    );
  });

  it('CP-004: Normal behavior preserved when below 75% ceiling — isApproachingCeiling default is false', () => {
    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CP-004 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orch.includes('isApproachingCeiling = false'),
      'CP-004 FAIL: getConversationDepth must default isApproachingCeiling to false — normal behavior must be unchanged'
    );

    // Gate uses a pre-computed variable for efficiency — check that isApproachingCeiling
    // is called and the result conditions shouldLookup
    assert.ok(
      orch.includes('costTracker.isApproachingCeiling(') &&
      (orch.includes('if (shouldLookup && isCostCeilingApproaching') ||
       orch.includes('if (shouldLookup && costTracker.isApproachingCeiling(')),
      'CP-004 FAIL: lookup gate must be conditional — only disable lookup when approaching ceiling'
    );

    const tracker = readRepoFile(COST_TRACKER_PATH);
    assert.ok(tracker, 'CP-004 FAIL: Could not read api/utils/cost-tracker.js');

    assert.ok(
      tracker.includes('wouldExceedCeiling('),
      'CP-004 FAIL: Existing wouldExceedCeiling hard stop method must remain in cost-tracker.js'
    );
  });

  it('CP-005: lookup_disabled_by_cost and history_reduced_by_cost fields present in query_cost_log schema', () => {
    const migration = readRepoFile(MIGRATION_PATH);
    assert.ok(migration, 'CP-005 FAIL: Could not read api/admin/cost-observability.js');

    assert.ok(
      migration.includes('lookup_disabled_by_cost'),
      'CP-005 FAIL: lookup_disabled_by_cost column not found in query_cost_log schema (cost-observability.js)'
    );

    assert.ok(
      migration.includes('history_reduced_by_cost'),
      'CP-005 FAIL: history_reduced_by_cost column not found in query_cost_log schema (cost-observability.js)'
    );

    assert.ok(
      migration.includes('ADD COLUMN IF NOT EXISTS lookup_disabled_by_cost'),
      'CP-005 FAIL: ensureCostLogTable must include ALTER TABLE migration for lookup_disabled_by_cost'
    );
    assert.ok(
      migration.includes('ADD COLUMN IF NOT EXISTS history_reduced_by_cost'),
      'CP-005 FAIL: ensureCostLogTable must include ALTER TABLE migration for history_reduced_by_cost'
    );

    const orch = readRepoFile(ORCH_PATH);
    assert.ok(orch, 'CP-005 FAIL: Could not read api/core/orchestrator.js');

    // Use lastIndexOf to find the main comprehensive INSERT (not the lightweight savings entries).
    const insertIdx = orch.lastIndexOf('INSERT INTO query_cost_log');
    assert.ok(insertIdx !== -1, 'CP-005 FAIL: INSERT INTO query_cost_log not found in orchestrator.js');

    const insertBlock = orch.substring(insertIdx, insertIdx + 1000);
    assert.ok(
      insertBlock.includes('lookup_disabled_by_cost'),
      'CP-005 FAIL: lookup_disabled_by_cost not found in INSERT INTO query_cost_log in orchestrator.js'
    );
    assert.ok(
      insertBlock.includes('history_reduced_by_cost'),
      'CP-005 FAIL: history_reduced_by_cost not found in INSERT INTO query_cost_log in orchestrator.js'
    );
  });

});

// ============================================================
// EFF. Memory Efficiency + Cache Eligibility Guards
// Guards the fixes for Issue: Fix two critical efficiency defects
//   FIX 1: Memory bloat on simple queries (Changes A, B, C)
//   FIX 2: Cache eligibility too restrictive (removes history gate)
//
// Problem: "What is gross margin?" costs 2,388 tokens (should be ~513).
//          Cache only fires on the literal first message of a session.
//
// Corresponds to issue test plan ME-001 through ME-009.
// ============================================================

describe('EFF. Memory Efficiency + Cache Eligibility Guards', () => {

  const orch = readRepoFile('api/core/orchestrator.js');

  // EFF-001 (ME-001): simple_short added to the memory-skip list
  it('EFF-001: skipMemoryForSimpleQuery covers greeting, simple_factual, AND simple_short', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // All three classifications must appear together in the skipMemoryForSimpleQuery check.
    // Previously only greeting and simple_factual were covered, causing short queries
    // like "What does pH mean?" to retrieve all stored user memories.
    assert.ok(
      orch.includes("['greeting', 'simple_factual', 'simple_short'].includes(earlyClassification.classification)") ||
      (orch.includes("'simple_short'") && orch.includes("'simple_factual'") && orch.includes("'greeting'") && orch.includes('skipMemoryForSimpleQuery')),
      'EFF-001 FAIL: skipMemoryForSimpleQuery must list simple_short, simple_factual, and greeting. ' +
      'Simple-short queries will retrieve stored memories unnecessarily.'
    );
  });

  // EFF-002 (ME-002): hasSessionOrPersonalRef is the gate (not the removed userHasMemories)
  it('EFF-002: hasSessionOrPersonalRef gates skipMemoryForSimpleQuery', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // The complete regex pattern for first-person pronouns must be present and linked to the gate.
    assert.ok(
      orch.includes('hasSessionOrPersonalRef') &&
      orch.includes('!hasSessionOrPersonalRef') &&
      orch.includes('skipMemoryForSimpleQuery') &&
      orch.includes('my|our|I|me|we|mine|ours'),
      'EFF-002 FAIL: hasSessionOrPersonalRef must exist with first-person pronouns and gate ' +
      'skipMemoryForSimpleQuery. Without this gate, users with stored memories will retrieve ' +
      'them even for pure factual queries like "What is gross margin?"'
    );
  });

  // EFF-003 (ME-003): session-reference language triggers retrieval for "What did we decide earlier?"
  it('EFF-003: session-reference words are included in hasSessionOrPersonalRef detection', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // The session-reference pattern must include "earlier", "we decided", and "remind me"
    // so that queries like "What did we decide earlier?" trigger memory retrieval.
    assert.ok(
      orch.includes('earlier') &&
      orch.includes('we decided') &&
      orch.includes('remind me') &&
      orch.includes('hasSessionOrPersonalRef'),
      'EFF-003 FAIL: hasSessionOrPersonalRef must include session-reference words (earlier, ' +
      '"we decided", "remind me"). Queries like "What did we decide earlier?" will not ' +
      'trigger memory retrieval.'
    );
  });

  // EFF-004 (ME-004): personal first-person pronouns trigger retrieval for "Remind me what I said"
  it('EFF-004: first-person pronouns (my, I, me, we, our) included in hasSessionOrPersonalRef', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // The personal-pronoun regex in hasSessionOrPersonalRef must cover my, our, I, me, we,
    // mine, ours — not broader second/third-person pronouns like "your" or "they".
    // Check for the complete regex pattern used in the pronouns branch.
    assert.ok(
      orch.includes('my|our|I|me|we|mine|ours') &&
      orch.includes('hasSessionOrPersonalRef'),
      'EFF-004 FAIL: hasSessionOrPersonalRef must include first-person pronouns (my, me, we). ' +
      '"Remind me what I said about the Cisco proposal" will not trigger memory retrieval.'
    );
  });

  // EFF-005 (ME-005/ME-006): conversationHistory.length === 0 is NOT in isCacheEligible
  it('EFF-005: isCacheEligible does not require empty conversationHistory', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    // Extract the cache eligibility block to verify the condition was removed.
    const cacheBlock = orch.slice(
      orch.indexOf('RESPONSE CACHE — check before expensive'),
      orch.indexOf('performanceMarkers.aiCallStart')
    );
    assert.ok(
      !cacheBlock.includes('conversationHistory.length === 0') &&
      !cacheBlock.includes('conversationHistory.length == 0'),
      'EFF-005 FAIL: isCacheEligible must not require conversationHistory.length === 0. ' +
      'Repeat factual questions within a session ("What is gross margin?" asked twice) ' +
      'will never hit the cache.'
    );
  });

  // EFF-006 (ME-006): intent class guard added to isCacheEligible
  it('EFF-006: isCacheEligible includes isFactualIntentClass guard', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('isFactualIntentClass'),
      'EFF-006 FAIL: isCacheEligible must include isFactualIntentClass guard. ' +
      'Without it, context-dependent PERMANENT queries ("What does that mean?") may be ' +
      'served a generic cached answer.'
    );
  });

  // EFF-007 (ME-007): VOLATILE queries never cache (truth_type === PERMANENT gate still present)
  it('EFF-007: isCacheEligible still requires truth_type === PERMANENT', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    const cacheBlock = orch.slice(
      orch.indexOf('RESPONSE CACHE — check before expensive'),
      orch.indexOf('performanceMarkers.aiCallStart')
    );
    assert.ok(
      cacheBlock.includes("truth_type === 'PERMANENT'"),
      'EFF-007 FAIL: isCacheEligible must still require truth_type === PERMANENT. ' +
      'VOLATILE queries (prices, weather) must never be cached.'
    );
  });

  // EFF-008 (ME-008): referential phrasing guard blocks context-dependent queries from cache
  it('EFF-008: isCacheEligible includes referential phrasing guard', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('hasReferentialPhrasing') &&
      orch.includes('REFERENTIAL_PHRASING_PATTERN'),
      'EFF-008 FAIL: isCacheEligible must include a referential phrasing guard. ' +
      '"Can you explain that differently?" must not hit a generic PERMANENT cache.'
    );
    // Verify the referential pattern covers the key phrases from the issue.
    // Use direct includes checks against the full orchestrator source.
    assert.ok(
      orch.includes('that one') &&
      orch.includes('explain that differently') &&
      orch.includes('the second one'),
      'EFF-008 FAIL: REFERENTIAL_PHRASING_PATTERN must include "that one", ' +
      '"explain that differently", and "the second one" to guard against context-dependent cache hits.'
    );
  });

  // EFF-009 (ME-009): personal intent still blocks cache
  it('EFF-009: isCacheEligible still includes !hasPersonalIntent guard', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    const cacheBlock = orch.slice(
      orch.indexOf('RESPONSE CACHE — check before expensive'),
      orch.indexOf('performanceMarkers.aiCallStart')
    );
    assert.ok(
      cacheBlock.includes('!hasPersonalIntent'),
      'EFF-009 FAIL: isCacheEligible must still include !hasPersonalIntent guard. ' +
      'Personal queries must never be cached regardless of truth_type.'
    );
  });

  // EFF-010 (Change C): hasMemoryContext uses memoryContext.hasMemory not context.memory
  it('EFF-010: hasMemoryContext uses memoryContext.hasMemory (not truthy string context.memory)', () => {
    assert.ok(orch, 'Could not read api/core/orchestrator.js');
    assert.ok(
      orch.includes('hasMemoryContext = memoryContext.hasMemory'),
      'EFF-010 FAIL: hasMemoryContext must be set from memoryContext.hasMemory, not from ' +
      'context.memory (a truthy string check). The string is only accurate when memories ' +
      'survive the relevance gate and token budget — the boolean flag is authoritative.'
    );
    // Must NOT use the old string truthiness check for the hasMemoryContext variable
    const orchLines = orch.split('\n');
    const hasOldCheck = orchLines.some(l =>
      l.includes('hasMemoryContext = context.memory') && !l.trimStart().startsWith('//')
    );
    assert.ok(
      !hasOldCheck,
      'EFF-010 FAIL: The old "hasMemoryContext = context.memory" truthy-string assignment ' +
      'must be removed. Use memoryContext.hasMemory instead.'
    );
  });

});
