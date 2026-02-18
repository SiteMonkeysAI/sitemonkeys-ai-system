/**
 * REPO DIAGNOSTIC FOR REGRESSION PREVENTION SETUP
 * =================================================
 * 
 * PURPOSE: This script scans the repo and outputs everything needed
 * to correctly configure the CI regression prevention system.
 * 
 * HOW TO RUN:
 *   node repo-diagnostic.js
 * 
 * THEN: Copy/paste the entire output and share it with Claude.
 * 
 * This script does NOT modify anything. It only reads and reports.
 */

const fs = require('fs');
const path = require('path');

const output = [];
const divider = '═'.repeat(70);

function log(text) {
  output.push(text);
  console.log(text);
}

function section(title) {
  log('');
  log(divider);
  log(`  ${title}`);
  log(divider);
}

// ============================================================
// 1. ROOT LEVEL FILES
// ============================================================
section('1. ROOT LEVEL FILES');

const rootFiles = [
  'package.json',
  'package-lock.json',
  'server.js',
  'app.js',
  'index.js',
  '.gitignore',
  'railway.json',
  'railway.toml',
  'Procfile',
  'Dockerfile',
  '.github/workflows'
];

rootFiles.forEach(f => {
  const fullPath = path.join(process.cwd(), f);
  const exists = fs.existsSync(fullPath);
  const isDir = exists && fs.statSync(fullPath).isDirectory();
  log(`  ${exists ? '✅' : '❌'} ${f}${isDir ? ' (directory)' : ''}`);
});

// ============================================================
// 2. PACKAGE.JSON CONTENTS
// ============================================================
section('2. PACKAGE.JSON');

const pkgPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    log(`  name: ${pkg.name || '(not set)'}`);
    log(`  main: ${pkg.main || '(not set)'}`);
    log(`  type: ${pkg.type || '(not set — defaults to CommonJS)'}`);
    log(`  scripts.start: ${pkg.scripts?.start || '(not set)'}`);
    log(`  scripts.test: ${pkg.scripts?.test || '(not set)'}`);
    log(`  node engine: ${pkg.engines?.node || '(not specified)'}`);
    log('');
    log('  Dependencies (top 20):');
    const deps = Object.keys(pkg.dependencies || {}).slice(0, 20);
    deps.forEach(d => log(`    - ${d}: ${pkg.dependencies[d]}`));
    if (Object.keys(pkg.dependencies || {}).length > 20) {
      log(`    ... and ${Object.keys(pkg.dependencies).length - 20} more`);
    }
    log('');
    log('  DevDependencies:');
    const devDeps = Object.keys(pkg.devDependencies || {});
    if (devDeps.length === 0) log('    (none)');
    devDeps.forEach(d => log(`    - ${d}: ${pkg.devDependencies[d]}`));
  } catch (e) {
    log(`  ERROR reading package.json: ${e.message}`);
  }
} else {
  log('  package.json NOT FOUND');
}

// ============================================================
// 3. MODULE SYSTEM (ESM vs CommonJS)
// ============================================================
section('3. MODULE SYSTEM CHECK');

const pkgType = (() => {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type;
  } catch { return undefined; }
})();

log(`  package.json "type": ${pkgType || '(not set)'}`);
log(`  Module system: ${pkgType === 'module' ? 'ESM (import/export)' : 'CommonJS (require/module.exports)'}`);

// Check actual files for import/export vs require
const checkFiles = ['server.js', 'app.js', 'index.js'];
for (const f of checkFiles) {
  const fp = path.join(process.cwd(), f);
  if (fs.existsSync(fp)) {
    const content = fs.readFileSync(fp, 'utf8').slice(0, 2000);
    const hasImport = content.includes('import ') && content.includes(' from ');
    const hasRequire = content.includes('require(');
    log(`  ${f}: ${hasImport ? 'uses import (ESM)' : hasRequire ? 'uses require (CJS)' : 'unclear'}`);
  }
}

// ============================================================
// 4. CRITICAL FILE PATHS (what the tests need to reference)
// ============================================================
section('4. CRITICAL FILE PATHS');

const criticalPaths = [
  'api/core/orchestrator.js',
  'api/categories/memory/internal/intelligence.js',
  'api/core/intelligence/externalLookupEngine.js',
  'api/routes/upload.js',
  'api/routes/chat.js',
  'api/routes/index.js',
];

criticalPaths.forEach(f => {
  const fullPath = path.join(process.cwd(), f);
  const exists = fs.existsSync(fullPath);
  log(`  ${exists ? '✅' : '❌'} ${f}`);
  
  if (!exists) {
    // Try to find it elsewhere
    const filename = path.basename(f);
    const alternatives = findFile(process.cwd(), filename, 3);
    if (alternatives.length > 0) {
      alternatives.forEach(alt => {
        log(`     → Found at: ${path.relative(process.cwd(), alt)}`);
      });
    }
  }
});

// ============================================================
// 5. DIRECTORY STRUCTURE (top 3 levels)
// ============================================================
section('5. DIRECTORY STRUCTURE (top 3 levels)');

function listDir(dir, prefix = '', depth = 0, maxDepth = 3) {
  if (depth >= maxDepth) return;
  try {
    const items = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== '.git')
      .sort((a, b) => {
        const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
    
    items.forEach((item, i) => {
      const fullPath = path.join(dir, item);
      const isDir = fs.statSync(fullPath).isDirectory();
      const isLast = i === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';
      
      log(`  ${prefix}${connector}${item}${isDir ? '/' : ''}`);
      
      if (isDir) {
        listDir(fullPath, prefix + extension, depth + 1, maxDepth);
      }
    });
  } catch (e) {
    log(`  ${prefix}(error reading directory: ${e.message})`);
  }
}

listDir(process.cwd());

// ============================================================
// 6. EXISTING TESTS
// ============================================================
section('6. EXISTING TESTS');

const testDirs = ['tests', 'test', '__tests__', 'spec'];
testDirs.forEach(d => {
  const fullPath = path.join(process.cwd(), d);
  if (fs.existsSync(fullPath)) {
    log(`  ✅ ${d}/ directory exists`);
    try {
      const files = fs.readdirSync(fullPath, { recursive: true });
      files.forEach(f => log(`     - ${f}`));
    } catch (e) {
      const files = fs.readdirSync(fullPath);
      files.forEach(f => log(`     - ${f}`));
    }
  } else {
    log(`  ❌ ${d}/ directory does not exist`);
  }
});

// ============================================================
// 7. GITHUB ACTIONS (existing workflows)
// ============================================================
section('7. EXISTING GITHUB ACTIONS');

const workflowDir = path.join(process.cwd(), '.github', 'workflows');
if (fs.existsSync(workflowDir)) {
  const workflows = fs.readdirSync(workflowDir);
  if (workflows.length === 0) {
    log('  .github/workflows/ exists but is empty');
  }
  workflows.forEach(f => {
    log(`  📄 ${f}`);
    try {
      const content = fs.readFileSync(path.join(workflowDir, f), 'utf8');
      const nameMatch = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (nameMatch) log(`     Name: ${nameMatch[1]}`);
      const onMatch = content.match(/^on:\s*$/m) || content.match(/^on:\s*\[(.+)\]/m);
      const triggers = content.match(/^\s+(push|pull_request|workflow_run|schedule):/gm);
      if (triggers) log(`     Triggers: ${triggers.map(t => t.trim().replace(':', '')).join(', ')}`);
    } catch (e) {
      log(`     (could not read)`);
    }
  });
} else {
  log('  ❌ .github/workflows/ does not exist');
}

// ============================================================
// 8. RAILWAY CONFIGURATION
// ============================================================
section('8. RAILWAY / DEPLOYMENT CONFIG');

['railway.json', 'railway.toml', 'Procfile', 'Dockerfile', 'nixpacks.toml'].forEach(f => {
  const fp = path.join(process.cwd(), f);
  if (fs.existsSync(fp)) {
    log(`  ✅ ${f}:`);
    const content = fs.readFileSync(fp, 'utf8');
    content.split('\n').slice(0, 10).forEach(line => log(`     ${line}`));
    if (content.split('\n').length > 10) log(`     ... (${content.split('\n').length} lines total)`);
  }
});

// ============================================================
// 9. ORCHESTRATOR QUICK SCAN
// ============================================================
section('9. ORCHESTRATOR QUICK SCAN');

const orchPath = findFile(process.cwd(), 'orchestrator.js', 4);
if (orchPath.length > 0) {
  const orchFile = fs.readFileSync(orchPath[0], 'utf8');
  const lineCount = orchFile.split('\n').length;
  log(`  Location: ${path.relative(process.cwd(), orchPath[0])}`);
  log(`  Lines: ${lineCount}`);
  log(`  Module style: ${orchFile.includes('module.exports') ? 'CommonJS' : orchFile.includes('export ') ? 'ESM' : 'unclear'}`);
  log(`  Has "context.sources?.hasDocuments": ${orchFile.includes('context.sources?.hasDocuments') ? '⚠️ YES (BUG)' : '✅ NO (fixed)'}`);
  log(`  Has "options.sources?.hasDocuments": ${orchFile.includes('options.sources?.hasDocuments') ? '✅ YES' : '❓ NO'}`);
  log(`  Has "useClaude" reference: ${orchFile.includes('useClaude') ? 'YES' : 'NO'}`);
  log(`  Has "useClaude" declaration: ${orchFile.match(/\b(let|const|var)\s+useClaude/) ? '✅ YES' : '⚠️ NO'}`);
  log(`  Has memory gating logic: ${orchFile.includes('MEMORY-GATE') || orchFile.includes('memoryGat') || orchFile.includes('shouldInjectMemory') ? '✅ YES' : '❓ NOT FOUND'}`);
  log(`  Has document_context: ${orchFile.includes('document_context') || orchFile.includes('documentContext') ? '✅ YES' : '❓ NOT FOUND'}`);
  log(`  Has vault_content: ${orchFile.includes('vault_content') || orchFile.includes('vaultContent') ? '✅ YES' : '❓ NOT FOUND'}`);
} else {
  log('  ❌ orchestrator.js NOT FOUND anywhere in first 4 directory levels');
}

// ============================================================
// 10. INTELLIGENCE.JS QUICK SCAN
// ============================================================
section('10. INTELLIGENCE.JS QUICK SCAN');

const intelPath = findFile(process.cwd(), 'intelligence.js', 5);
if (intelPath.length > 0) {
  // Use the one in the deepest path (most likely the right one)
  const targetPath = intelPath.sort((a, b) => b.length - a.length)[0];
  const intelFile = fs.readFileSync(targetPath, 'utf8');
  const lineCount = intelFile.split('\n').length;
  log(`  Location: ${path.relative(process.cwd(), targetPath)}`);
  log(`  Lines: ${lineCount}`);
  log(`  Has "logExtractionError" call: ${intelFile.includes('this.coreSystem.logExtractionError') ? '⚠️ YES (BUG)' : '✅ NO (fixed)'}`);
  log(`  Has semantic retrieval: ${intelFile.includes('semanticRetrieval') || intelFile.includes('semantic_retrieval') || intelFile.includes('embedding') ? '✅ YES' : '❓ NOT FOUND'}`);
} else {
  log('  ❌ intelligence.js NOT FOUND in first 5 levels');
  log('  Checking alternative names...');
  ['ai-intelligence.js', 'memoryIntelligence.js', 'memory-intelligence.js'].forEach(name => {
    const found = findFile(process.cwd(), name, 5);
    if (found.length > 0) log(`  → Found: ${path.relative(process.cwd(), found[0])}`);
  });
}

// ============================================================
// 11. DEPLOY URL CHECK
// ============================================================
section('11. DEPLOYMENT INFO');

log('  Check your Railway dashboard for:');
log('    - Your deployed URL (e.g., https://your-app.up.railway.app)');
log('    - Whether auto-deploy from GitHub main branch is enabled');
log('  ');
log('  If you have environment variables set, list the NAMES (not values) of:');
log('    - OPENAI_API_KEY (exists? yes/no)');
log('    - ANTHROPIC_API_KEY (exists? yes/no)');
log('    - DATABASE_URL (exists? yes/no)');
log('    - Any others relevant to the app');

// ============================================================
// SUMMARY
// ============================================================
section('SUMMARY — COPY EVERYTHING ABOVE AND SHARE WITH CLAUDE');

log('');
log('  This diagnostic found:');
const orchFound = orchPath.length > 0;
const intelFound = intelPath.length > 0;
log(`  - Orchestrator: ${orchFound ? '✅ Found' : '❌ Not found'}`);
log(`  - Intelligence: ${intelFound ? '✅ Found' : '❌ Not found'}`);
log(`  - Module system: ${pkgType === 'module' ? 'ESM' : 'CommonJS'}`);
log(`  - Package lock: ${fs.existsSync(path.join(process.cwd(), 'package-lock.json')) ? 'Yes' : 'No'}`);
log('');
log('  Share the FULL output of this script with Claude to get');
log('  correctly configured regression prevention files.');
log('');

// ============================================================
// HELPER: Find file by name in directory tree
// ============================================================
function findFile(startDir, filename, maxDepth, currentDepth = 0) {
  const results = [];
  if (currentDepth >= maxDepth) return results;
  
  try {
    const items = fs.readdirSync(startDir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item.startsWith('.')) continue;
      const fullPath = path.join(startDir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && item === filename) {
          results.push(fullPath);
        } else if (stat.isDirectory()) {
          results.push(...findFile(fullPath, filename, maxDepth, currentDepth + 1));
        }
      } catch (e) { /* skip inaccessible */ }
    }
  } catch (e) { /* skip inaccessible */ }
  
  return results;
}
