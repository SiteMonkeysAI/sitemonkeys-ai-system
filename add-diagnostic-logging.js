#!/usr/bin/env node

/**
 * DIAGNOSTIC LOGGING ENHANCEMENTS
 * 
 * This script adds targeted diagnostic logging to trace each failing test
 * and capture the exact data flow and failure points.
 * 
 * Logging additions are designed to be:
 * - Non-invasive (console.log only, no logic changes)
 * - Searchable (prefixed with [DIAG-TEST])
 * - Targeted (only where investigation needs evidence)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`
${'='.repeat(80)}
ADDING DIAGNOSTIC LOGGING FOR INVESTIGATION VALIDATION
${'='.repeat(80)}
`);

// ============================================================================
// DIAGNOSTIC 1: NUA1 - Log similarity scores for all memories containing "Alex"
// ============================================================================

console.log(`\n${BLUE}DIAGNOSTIC 1: NUA1 - Ambiguity Detection (Two Alexes)${RESET}\n`);

const orchestratorPath = path.join(__dirname, 'api/core/orchestrator.js');
let orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');

// Find the location where memories are capped
const capLocation = orchestratorContent.indexOf('memoriesToFormat = result.memories.slice(0, MAX_MEMORIES_FINAL);');

if (capLocation > 0) {
  // Find the line before the cap to insert logging
  const linesBeforeCap = orchestratorContent.substring(0, capLocation).split('\n');
  const lineNumber = linesBeforeCap.length;
  
  console.log(`${YELLOW}Adding NUA1 diagnostic logging at line ${lineNumber}${RESET}`);
  console.log(`Purpose: Log similarity scores for ALL memories, identify which Alex gets cut`);
  
  // Insert diagnostic logging before the cap
  const diagnosticLog = `
        // DIAGNOSTIC: NUA1 - Log all memory scores before cap (especially for ambiguity testing)
        if (result.memories && result.memories.length > 0) {
          console.log('[DIAG-NUA1] ═══════════════════════════════════════════════════════');
          console.log(\`[DIAG-NUA1] Retrieved \${result.memories.length} memories before MAX_MEMORIES_FINAL cap\`);
          result.memories.forEach((mem, idx) => {
            const preview = (mem.content || '').substring(0, 80).replace(/\\n/g, ' ');
            const score = (mem.hybrid_score || mem.similarity || 0).toFixed(3);
            const will_inject = idx < MAX_MEMORIES_FINAL ? 'INJECT' : 'CUT';
            console.log(\`[DIAG-NUA1]   #\${idx + 1} [\${will_inject}] ID:\${mem.id} Score:\${score} "\${preview}"\`);
          });
          console.log('[DIAG-NUA1] ═══════════════════════════════════════════════════════');
        }
`;
  
  orchestratorContent = orchestratorContent.substring(0, capLocation) + 
                       diagnosticLog + 
                       orchestratorContent.substring(capLocation);
  
  console.log(`${GREEN}✓ Added NUA1 diagnostic logging${RESET}`);
}

// ============================================================================
// DIAGNOSTIC 2: INF3 - Log temporal calculator pattern matching
// ============================================================================

console.log(`\n${BLUE}DIAGNOSTIC 2: INF3 - Temporal Reasoning${RESET}\n`);

// Find the temporal calculator function
const temporalFuncStart = orchestratorContent.indexOf('async #calculateTemporalInference({');

if (temporalFuncStart > 0) {
  // Find where it extracts duration and end year from memories
  const durationExtractLocation = orchestratorContent.indexOf('const durationMatch = content.match(/(?:worked|for|spent)\\s+(\\d+)\\s+years?/i);', temporalFuncStart);
  
  if (durationExtractLocation > 0) {
    console.log(`${YELLOW}Adding INF3 diagnostic logging for pattern extraction${RESET}`);
    console.log(`Purpose: Show what patterns match/miss during temporal extraction`);
    
    // Find the memory loop start
    const memoryLoopStart = orchestratorContent.lastIndexOf('for (const memory of memories)', durationExtractLocation);
    const insertPoint = orchestratorContent.indexOf('{', memoryLoopStart) + 1;
    
    const diagnosticLog = `
        // DIAGNOSTIC: INF3 - Log pattern matching for temporal extraction
        const contentPreview = (memory.content || '').substring(0, 120);
        console.log(\`[DIAG-INF3] Testing memory: "\${contentPreview}"\`);
`;
    
    orchestratorContent = orchestratorContent.substring(0, insertPoint) +
                         diagnosticLog +
                         orchestratorContent.substring(insertPoint);
    
    // Also log when patterns match
    const durationMatchEnd = orchestratorContent.indexOf('}', durationExtractLocation);
    const durationInsertPoint = orchestratorContent.lastIndexOf('duration = parseInt(durationMatch[1]);', durationMatchEnd) + 'duration = parseInt(durationMatch[1]);'.length;
    
    const durationLog = `
          console.log(\`[DIAG-INF3] ✓ Found duration: \${duration} years\`);
`;
    
    orchestratorContent = orchestratorContent.substring(0, durationInsertPoint) +
                         durationLog +
                         orchestratorContent.substring(durationInsertPoint);
    
    console.log(`${GREEN}✓ Added INF3 diagnostic logging${RESET}`);
  }
}

// ============================================================================
// DIAGNOSTIC 3: CMP2 - Log retrieval for name queries
// ============================================================================

console.log(`\n${BLUE}DIAGNOSTIC 3: CMP2 - International Names${RESET}\n`);

// Find semantic retrieval service
const semanticRetrievalPath = path.join(__dirname, 'api/services/semantic-retrieval.js');
if (fs.existsSync(semanticRetrievalPath)) {
  let semanticContent = fs.readFileSync(semanticRetrievalPath, 'utf8');
  
  // Find retrieveSemanticMemories function
  const retrieveFuncStart = semanticContent.indexOf('export async function retrieveSemanticMemories');
  
  if (retrieveFuncStart > 0) {
    console.log(`${YELLOW}Adding CMP2 diagnostic logging for semantic retrieval${RESET}`);
    console.log(`Purpose: Log query embedding and similarity scores for name queries`);
    
    // Find where results are returned
    const returnLocation = semanticContent.indexOf('return {', retrieveFuncStart);
    
    if (returnLocation > 0) {
      const insertPoint = returnLocation;
      
      const diagnosticLog = `
  // DIAGNOSTIC: CMP2 - Log retrieval details for name preservation tests
  if (message && /who are my|my contacts|my key contacts/i.test(message)) {
    console.log('[DIAG-CMP2] ═══════════════════════════════════════════════════════');
    console.log(\`[DIAG-CMP2] Query: "\${message}"\`);
    console.log(\`[DIAG-CMP2] Retrieved \${rankedMemories.length} memories\`);
    rankedMemories.slice(0, 10).forEach((mem, idx) => {
      const preview = (mem.content || '').substring(0, 100).replace(/\\n/g, ' ');
      console.log(\`[DIAG-CMP2]   #\${idx + 1} Sim:\${(mem.similarity || 0).toFixed(3)} "\${preview}"\`);
    });
    console.log('[DIAG-CMP2] ═══════════════════════════════════════════════════════');
  }

`;
      
      semanticContent = semanticContent.substring(0, insertPoint) +
                       diagnosticLog +
                       semanticContent.substring(insertPoint);
      
      fs.writeFileSync(semanticRetrievalPath, semanticContent);
      console.log(`${GREEN}✓ Added CMP2 diagnostic logging to semantic-retrieval.js${RESET}`);
    }
  }
}

// ============================================================================
// DIAGNOSTIC 4: INF1 - Log extraction output for relationship keywords
// ============================================================================

console.log(`\n${BLUE}DIAGNOSTIC 4: INF1 - Role Inference (Daughter)${RESET}\n`);

const storagePath = path.join(__dirname, 'api/memory/intelligent-storage.js');
if (fs.existsSync(storagePath)) {
  let storageContent = fs.readFileSync(storagePath, 'utf8');
  
  // Find extractKeyFacts function
  const extractFuncStart = storageContent.indexOf('async extractKeyFacts(');
  
  if (extractFuncStart > 0) {
    console.log(`${YELLOW}Adding INF1 diagnostic logging for fact extraction${RESET}`);
    console.log(`Purpose: Log input vs output for relationship keyword preservation`);
    
    // Find where facts are returned
    const returnLocation = storageContent.indexOf('return facts;', extractFuncStart);
    
    if (returnLocation > 0) {
      const insertPoint = returnLocation - 10; // Just before return
      
      const diagnosticLog = `
      // DIAGNOSTIC: INF1 - Log relationship keyword preservation
      if (userMessage && /daughter|son|mother|father|brother|sister|wife|husband/i.test(userMessage)) {
        console.log('[DIAG-INF1] ═══════════════════════════════════════════════════════');
        console.log(\`[DIAG-INF1] Input: "\${userMessage.substring(0, 150)}"\`);
        console.log(\`[DIAG-INF1] Output: "\${facts.substring(0, 150)}"\`);
        
        // Check if relationship keyword was preserved
        const relationshipKeywords = ['daughter', 'son', 'mother', 'father', 'brother', 'sister', 'wife', 'husband'];
        const inputKeywords = relationshipKeywords.filter(kw => new RegExp(kw, 'i').test(userMessage));
        const outputKeywords = relationshipKeywords.filter(kw => new RegExp(kw, 'i').test(facts));
        
        console.log(\`[DIAG-INF1] Relationship keywords in input: [\${inputKeywords.join(', ')}]\`);
        console.log(\`[DIAG-INF1] Relationship keywords in output: [\${outputKeywords.join(', ')}]\`);
        
        const preserved = inputKeywords.every(kw => outputKeywords.includes(kw));
        console.log(\`[DIAG-INF1] Preservation status: \${preserved ? '✓ PRESERVED' : '✗ LOST'}\`);
        console.log('[DIAG-INF1] ═══════════════════════════════════════════════════════');
      }

`;
      
      storageContent = storageContent.substring(0, insertPoint) +
                      diagnosticLog +
                      storageContent.substring(insertPoint);
      
      fs.writeFileSync(storagePath, storageContent);
      console.log(`${GREEN}✓ Added INF1 diagnostic logging to intelligent-storage.js${RESET}`);
    }
  }
}

// ============================================================================
// DIAGNOSTIC 5: NUA2 - Log conflict validator detection
// ============================================================================

console.log(`\n${BLUE}DIAGNOSTIC 5: NUA2 - Contextual Tension${RESET}\n`);

const conflictValidatorPath = path.join(__dirname, 'api/lib/validators/conflict-detection.js');
if (fs.existsSync(conflictValidatorPath)) {
  let conflictContent = fs.readFileSync(conflictValidatorPath, 'utf8');
  
  // Find the detectConflicts method
  const detectStart = conflictContent.indexOf('#detectConflicts(memoryContext)');
  
  if (detectStart > 0) {
    console.log(`${YELLOW}Adding NUA2 diagnostic logging for conflict detection${RESET}`);
    console.log(`Purpose: Log what conflicts are detected and if acknowledgment is injected`);
    
    // Find where conflicts are returned
    const returnLocation = conflictContent.indexOf('return conflicts;', detectStart);
    
    if (returnLocation > 0) {
      const insertPoint = returnLocation - 10;
      
      const diagnosticLog = `
    // DIAGNOSTIC: NUA2 - Log conflict detection results
    console.log('[DIAG-NUA2] ═══════════════════════════════════════════════════════');
    console.log(\`[DIAG-NUA2] Checked \${memories.length} memories for conflicts\`);
    console.log(\`[DIAG-NUA2] Allergy memories found: \${allergyMemories.length}\`);
    console.log(\`[DIAG-NUA2] Spouse preference memories found: \${spousePreferenceMemories.length}\`);
    console.log(\`[DIAG-NUA2] Total conflicts detected: \${conflicts.length}\`);
    if (conflicts.length > 0) {
      conflicts.forEach((c, idx) => {
        console.log(\`[DIAG-NUA2]   Conflict #\${idx + 1}: \${c.type} - \${c.description}\`);
      });
    }
    console.log('[DIAG-NUA2] ═══════════════════════════════════════════════════════');

`;
      
      conflictContent = conflictContent.substring(0, insertPoint) +
                       diagnosticLog +
                       conflictContent.substring(insertPoint);
      
      fs.writeFileSync(conflictValidatorPath, conflictContent);
      console.log(`${GREEN}✓ Added NUA2 diagnostic logging to conflict-detection.js${RESET}`);
    }
  }
}

// ============================================================================
// Save updated orchestrator.js
// ============================================================================

fs.writeFileSync(orchestratorPath, orchestratorContent);
console.log(`\n${GREEN}✓ Saved updated orchestrator.js${RESET}`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log(`\n${'='.repeat(80)}`);
console.log(`${BLUE}DIAGNOSTIC LOGGING COMPLETE${RESET}`);
console.log(`${'='.repeat(80)}\n`);

console.log(`${GREEN}Added diagnostics for:${RESET}`);
console.log(`  1. ${YELLOW}[DIAG-NUA1]${RESET} - Ambiguity: Log all memory scores before cap`);
console.log(`  2. ${YELLOW}[DIAG-INF3]${RESET} - Temporal: Log pattern matching during extraction`);
console.log(`  3. ${YELLOW}[DIAG-CMP2]${RESET} - Names: Log retrieval similarity for name queries`);
console.log(`  4. ${YELLOW}[DIAG-INF1]${RESET} - Inference: Log relationship keyword preservation`);
console.log(`  5. ${YELLOW}[DIAG-NUA2]${RESET} - Tension: Log conflict detection results\n`);

console.log(`${BLUE}To collect evidence:${RESET}`);
console.log(`  1. Run SMDEEP tests with these diagnostics`);
console.log(`  2. Search logs for [DIAG-*] prefixes`);
console.log(`  3. Analyze actual data flow for each failing test`);
console.log(`  4. Update investigation report with evidence\n`);

console.log(`${YELLOW}Next command:${RESET}`);
console.log(`  npm test -- --grep "SMDEEP"\n`);

console.log(`${'='.repeat(80)}\n`);
