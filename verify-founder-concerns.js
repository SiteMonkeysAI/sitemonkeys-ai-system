#!/usr/bin/env node
/**
 * FOUNDER CONCERNS VERIFICATION
 * 
 * This script verifies all 5 concerns raised in the PR comment:
 * 1. Memory Cap 15 - Check if Tesla ranks in top 3 (not #9)
 * 2. NUA1 - Verify entity-based retrieval for two Alexes
 * 3. A5 - Verify explicit memory pipeline (storage + retrieval)
 * 4. TRU1/TRU2 - Check for pushback/manipulation resistance
 * 5. Regression Check - Verify all previous fixes are intact
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  log('\n═══════════════════════════════════════════════════════════════', 'cyan');
  log(title, 'cyan');
  log('═══════════════════════════════════════════════════════════════', 'cyan');
}

function checkFile(filepath, checks) {
  log(`\nChecking: ${filepath}`, 'blue');
  
  if (!fs.existsSync(filepath)) {
    log(`  ❌ File not found!`, 'red');
    return { found: false, results: [] };
  }
  
  const content = fs.readFileSync(filepath, 'utf8');
  const results = checks.map(check => {
    const found = check.pattern.test(content);
    const symbol = found ? '✅' : '❌';
    const color = found ? 'green' : 'red';
    log(`  ${symbol} ${check.name}`, color);
    
    if (check.showCode && found) {
      // Show the matching line
      const lines = content.split('\n');
      const matchingLines = lines
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => check.pattern.test(line))
        .slice(0, 3); // Show first 3 matches
      
      matchingLines.forEach(({ line, idx }) => {
        log(`      Line ${idx + 1}: ${line.trim().substring(0, 80)}`, 'yellow');
      });
    }
    
    return { name: check.name, found };
  });
  
  return { found: true, results };
}

async function main() {
  log('╔═══════════════════════════════════════════════════════════════╗', 'magenta');
  log('║  FOUNDER CONCERNS VERIFICATION - Issue #579 PR Review        ║', 'magenta');
  log('╚═══════════════════════════════════════════════════════════════╝', 'magenta');

  const allResults = {};

  // ═══════════════════════════════════════════════════════════════
  // CONCERN 1: Memory Cap 15 - Check Ranking Logic
  // ═══════════════════════════════════════════════════════════════
  header('CONCERN 1: Memory Cap 15 & Ranking');
  log('Checking if keyword boost and entity boost still exist...', 'blue');
  
  const orchestratorPath = join(__dirname, 'api/core/orchestrator.js');
  const semanticRetrievalPath = join(__dirname, 'api/services/semantic-retrieval.js');
  
  allResults.memoryCapAndRanking = checkFile(orchestratorPath, [
    {
      name: 'MAX_MEMORIES_FINAL = 15',
      pattern: /MAX_MEMORIES_FINAL\s*=\s*15/,
      showCode: true
    },
    {
      name: 'Memory cap increased from 8 comment',
      pattern: /Increased from 8 for Issue #579/,
      showCode: false
    }
  ]);
  
  allResults.keywordBoost = checkFile(semanticRetrievalPath, [
    {
      name: 'Keyword boost logic exists (Issue #573)',
      pattern: /KEYWORD-BOOST.*Issue #573|keywordBoosted.*map/i,
      showCode: true
    },
    {
      name: 'Keyword boost +0.15 value',
      pattern: /keywordBoost.*0\.15/,
      showCode: true
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CONCERN 2: NUA1 - Entity-Based Retrieval
  // ═══════════════════════════════════════════════════════════════
  header('CONCERN 2: NUA1 - Entity-Based Retrieval (Two Alexes)');
  
  allResults.entityDetection = checkFile(semanticRetrievalPath, [
    {
      name: 'detectProperNames() function exists',
      pattern: /function detectProperNames/,
      showCode: true
    },
    {
      name: 'Entity boost 0.85 minimum (Issue #577)',
      pattern: /ENTITY-BOOST.*0\.85|baseBoost.*0\.85/,
      showCode: true
    },
    {
      name: 'Entity boost applied in pipeline',
      pattern: /entityBoosted.*detectedEntities/,
      showCode: true
    },
    {
      name: 'Entity detection called in retrieval',
      pattern: /const detectedEntities.*detectProperNames/,
      showCode: true
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CONCERN 3: A5 - Explicit Memory Pipeline
  // ═══════════════════════════════════════════════════════════════
  header('CONCERN 3: A5 - Explicit Memory Pipeline');
  
  const intelligentStoragePath = join(__dirname, 'api/memory/intelligent-storage.js');
  
  allResults.explicitStorage = checkFile(intelligentStoragePath, [
    {
      name: 'detectExplicitMemoryRequest() exists',
      pattern: /detectExplicitMemoryRequest/,
      showCode: true
    },
    {
      name: 'explicit_storage_request metadata set',
      pattern: /explicit_storage_request.*true/,
      showCode: true
    },
    {
      name: 'wait_for_embedding metadata set',
      pattern: /wait_for_embedding.*true/,
      showCode: true
    }
  ]);
  
  allResults.explicitRetrieval = checkFile(semanticRetrievalPath, [
    {
      name: 'Memory recall detection (isMemoryRecall)',
      pattern: /const isMemoryRecall.*remember|recall|tell me/i,
      showCode: true
    },
    {
      name: 'Explicit storage boost 0.70-0.99',
      pattern: /explicit_storage_request.*true.*0\.70|0\.99/,
      showCode: true
    },
    {
      name: 'EXPLICIT-RECALL logging',
      pattern: /\[EXPLICIT-RECALL\]/,
      showCode: false
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CONCERN 4: TRU1/TRU2 - Pushback & Manipulation Resistance
  // ═══════════════════════════════════════════════════════════════
  header('CONCERN 4: TRU1/TRU2 - Truth Enforcement');
  
  allResults.truthEnforcement = checkFile(orchestratorPath, [
    {
      name: 'System prompt includes pushback resistance',
      pattern: /pushback|maintain.*refusal|still cannot|still can't/i,
      showCode: false
    },
    {
      name: 'System prompt includes manipulation resistance',
      pattern: /manipulation|false certainty|cannot guarantee/i,
      showCode: false
    }
  ]);
  
  const memoryEnforcerPath = join(__dirname, 'api/lib/validators/memory-usage-enforcer.js');
  
  allResults.ignorancePhrases = checkFile(memoryEnforcerPath, [
    {
      name: 'Expanded ignorance phrases (Issue #579)',
      pattern: /no memory of|first conversation|first interaction/,
      showCode: true
    },
    {
      name: 'Memory-related evasions section exists',
      pattern: /Memory-related evasions.*Issue #579/,
      showCode: false
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  // CONCERN 5: Regression Check - Previous Fixes Intact
  // ═══════════════════════════════════════════════════════════════
  header('CONCERN 5: Regression Check - Previous Fixes');
  
  log('\nChecking previous fix implementations:', 'blue');
  
  const previousFixes = [
    {
      file: semanticRetrievalPath,
      checks: [
        { name: 'Issue #573: Keyword boost (+0.15)', pattern: /keywordBoost.*0\.15/ },
        { name: 'Issue #577: Entity detection & boost', pattern: /detectProperNames|entityBoosted/ },
        { name: 'Issue #564: Explicit storage detection', pattern: /explicit_storage_request/ },
        { name: 'Issue #564: Explicit recall boost (0.99)', pattern: /explicit.*0\.99|0\.70/ },
        { name: 'Issue #562: Ordinal boost (+0.40)', pattern: /ordinalBoosted|applyOrdinalBoost/ },
        { name: 'Issue #577: Numerical extraction', pattern: /numerical|number.*preservation/i },
      ]
    },
    {
      file: intelligentStoragePath,
      checks: [
        { name: 'Issue #575: Brand name preservation', pattern: /brand.*name|Tesla|Model\s*3/i },
      ]
    },
    {
      file: orchestratorPath,
      checks: [
        { name: 'Issue #579: Early classification fix (no simple_factual skip)', pattern: /CRITICAL FIX.*Issue #579.*INF3/ },
        { name: 'Issue #579: Sentence boundary truncation', pattern: /CRITICAL FIX.*Issue #579.*CMP2.*truncate.*sentence/i },
        { name: 'Token budget enforcement', pattern: /BUDGET\.MEMORY.*2500/ },
      ]
    }
  ];
  
  allResults.regressionCheck = {};
  
  for (const { file, checks } of previousFixes) {
    const result = checkFile(file, checks.map(c => ({ ...c, showCode: false })));
    allResults.regressionCheck[file] = result;
  }

  // ═══════════════════════════════════════════════════════════════
  // ADDITIONAL: Check for Early Classification Fix
  // ═══════════════════════════════════════════════════════════════
  header('ADDITIONAL: Early Classification Logic');
  
  allResults.earlyClassification = checkFile(orchestratorPath, [
    {
      name: 'Greeting-only skip (not simple_factual)',
      pattern: /skipMemoryForSimpleQuery.*greeting.*&&.*message\.length.*50/,
      showCode: true
    },
    {
      name: 'INF3 temporal reasoning fix comment',
      pattern: /CRITICAL FIX.*Issue #579.*INF3.*temporal reasoning/,
      showCode: false
    }
  ]);

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  header('VERIFICATION SUMMARY');
  
  const allChecks = [];
  
  for (const [category, data] of Object.entries(allResults)) {
    if (data.results) {
      allChecks.push(...data.results);
    } else if (typeof data === 'object') {
      for (const [file, fileData] of Object.entries(data)) {
        if (fileData.results) {
          allChecks.push(...fileData.results);
        }
      }
    }
  }
  
  const passed = allChecks.filter(c => c.found).length;
  const total = allChecks.length;
  const percentage = Math.round((passed / total) * 100);
  
  log(`\nTotal Checks: ${total}`, 'blue');
  log(`Passed: ${passed}`, passed === total ? 'green' : 'yellow');
  log(`Failed: ${total - passed}`, total - passed === 0 ? 'green' : 'red');
  log(`Success Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');
  
  if (percentage === 100) {
    log('\n✅ ALL CHECKS PASSED - Fixes appear to be intact', 'green');
  } else {
    log('\n⚠️  SOME CHECKS FAILED - Investigation required', 'yellow');
    log('\nFailed checks:', 'red');
    allChecks.filter(c => !c.found).forEach(c => {
      log(`  ❌ ${c.name}`, 'red');
    });
  }
  
  // Specific recommendations based on failures
  log('\n═══════════════════════════════════════════════════════════════', 'cyan');
  log('RECOMMENDATIONS FOR FOUNDER:', 'cyan');
  log('═══════════════════════════════════════════════════════════════', 'cyan');
  
  if (percentage < 100) {
    log('\n1. ⚠️  Some fixes may have been lost or renamed', 'yellow');
    log('   Action: Review failed checks above and restore missing code', 'yellow');
  }
  
  log('\n2. 🔍 RANKING DIAGNOSTIC NEEDED:', 'yellow');
  log('   Even if keyword boost exists, we need to verify Tesla ranks top 3', 'yellow');
  log('   Action: Add diagnostic endpoint to log actual candidate rankings', 'yellow');
  log('   Test: Store 10 facts, query "What car do I drive?", log ALL ranks', 'yellow');
  
  log('\n3. 📝 A5 PIPELINE LOGGING NEEDED:', 'yellow');
  log('   Code exists but we need telemetry to verify it works', 'yellow');
  log('   Action: Add [A5-DEBUG] logging throughout storage → retrieval', 'yellow');
  log('   Test: Store "Remember exactly: ZEBRA-XXX", query "What phrase?"', 'yellow');
  
  log('\n4. 🛡️  TRU1/TRU2 PROMPT VERIFICATION NEEDED:', 'yellow');
  log('   Need to check actual system prompt content, not just existence', 'yellow');
  log('   Action: Extract and review system prompt for pushback/manipulation', 'yellow');
  log('   Test: Send pushback query, verify response maintains refusal', 'yellow');
  
  log('\n═══════════════════════════════════════════════════════════════\n', 'cyan');
}

main().catch(error => {
  log(`\n❌ ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
