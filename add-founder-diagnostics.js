#!/usr/bin/env node
/**
 * ADD FOUNDER-REQUESTED DIAGNOSTICS
 * 
 * This script adds the diagnostic logging requested by the founder:
 * 1. STR1: Log actual Tesla rank when querying "What car do I drive?"
 * 2. A5: Add [A5-DEBUG] logging throughout explicit memory pipeline
 * 3. TRU1/TRU2: Verify system prompt includes pushback/manipulation resistance
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function log(message) {
  console.log(message);
}

function applyPatch(filepath, patches) {
  log(`\n📝 Patching: ${filepath}`);
  
  if (!fs.existsSync(filepath)) {
    log(`  ❌ File not found!`);
    return false;
  }
  
  let content = fs.readFileSync(filepath, 'utf8');
  let patchCount = 0;
  
  for (const patch of patches) {
    if (content.includes(patch.search)) {
      log(`  ✅ Found: ${patch.description}`);
      
      // Check if patch already applied
      if (content.includes(patch.marker || patch.insert)) {
        log(`    ⚠️  Already patched, skipping`);
        continue;
      }
      
      content = content.replace(patch.search, patch.replace);
      patchCount++;
      log(`    ✅ Applied patch`);
    } else {
      log(`  ❌ Pattern not found: ${patch.description}`);
    }
  }
  
  if (patchCount > 0) {
    fs.writeFileSync(filepath, content, 'utf8');
    log(`  ✅ Saved ${patchCount} patches to file`);
    return true;
  }
  
  return false;
}

async function main() {
  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║  ADDING FOUNDER-REQUESTED DIAGNOSTICS                        ║');
  log('╚═══════════════════════════════════════════════════════════════╝');

  const semanticRetrievalPath = join(__dirname, 'api/services/semantic-retrieval.js');
  const intelligentStoragePath = join(__dirname, 'api/memory/intelligent-storage.js');
  const orchestratorPath = join(__dirname, 'api/core/orchestrator.js');

  // ═══════════════════════════════════════════════════════════════
  // DIAGNOSTIC 1: STR1 Ranking Verification
  // ═══════════════════════════════════════════════════════════════
  log('\n═══════════════════════════════════════════════════════════════');
  log('DIAGNOSTIC 1: STR1 - Tesla Ranking Verification');
  log('═══════════════════════════════════════════════════════════════');
  
  const str1Patches = [
    {
      description: 'Add detailed ranking log after final filtering',
      search: `    // CRITICAL TRACE #560-T3: Log final ranking after all boosts
    console.log('[TRACE-T3] Final ranked memories (top 5) after hybrid scoring:');
    filtered.slice(0, 5).forEach((m, idx) => {
      console.log(\`[TRACE-T3]   \${idx+1}. Memory \${m.id}: hybrid_score=\${m.hybrid_score?.toFixed(3)}, similarity=\${m.similarity?.toFixed(3)}\`);
      console.log(\`[TRACE-T3]      ordinal_boosted=\${m.ordinal_boosted || false}, ordinal_penalized=\${m.ordinal_penalized || false}\`);
      console.log(\`[TRACE-T3]      keyword_boosted=\${m.keyword_boosted || false}, keyword_match_ratio=\${m.keyword_match_ratio?.toFixed(2) || 'N/A'}\`);
      console.log(\`[TRACE-T3]      explicit_recall_boosted=\${m.explicit_recall_boosted || false}, explicit_storage=\${m.explicit_storage_request || false}\`);
      console.log(\`[TRACE-T3]      Content: "\${(m.content || '').substring(0, 80)}"\`);
    });`,
      replace: `    // CRITICAL TRACE #560-T3: Log final ranking after all boosts
    console.log('[TRACE-T3] Final ranked memories (top 5) after hybrid scoring:');
    filtered.slice(0, 5).forEach((m, idx) => {
      console.log(\`[TRACE-T3]   \${idx+1}. Memory \${m.id}: hybrid_score=\${m.hybrid_score?.toFixed(3)}, similarity=\${m.similarity?.toFixed(3)}\`);
      console.log(\`[TRACE-T3]      ordinal_boosted=\${m.ordinal_boosted || false}, ordinal_penalized=\${m.ordinal_penalized || false}\`);
      console.log(\`[TRACE-T3]      keyword_boosted=\${m.keyword_boosted || false}, keyword_match_ratio=\${m.keyword_match_ratio?.toFixed(2) || 'N/A'}\`);
      console.log(\`[TRACE-T3]      explicit_recall_boosted=\${m.explicit_recall_boosted || false}, explicit_storage=\${m.explicit_storage_request || false}\`);
      console.log(\`[TRACE-T3]      Content: "\${(m.content || '').substring(0, 80)}"\`);
    });
    
    // FOUNDER DIAGNOSTIC #579-STR1: Log ALL ranks for car-related queries
    if (isCarQuery && filtered.length > 0) {
      console.log('[FOUNDER-STR1] ═══════════════════════════════════════════════════════');
      console.log('[FOUNDER-STR1] COMPLETE RANKING for car query:');
      filtered.forEach((m, idx) => {
        const isTesla = /tesla|model\\s*3/i.test(m.content || '');
        const marker = isTesla ? '🚗 TESLA' : '   ';
        console.log(\`[FOUNDER-STR1]   \${marker} Rank #\${idx+1}: Memory \${m.id}\`);
        console.log(\`[FOUNDER-STR1]      Score: \${m.hybrid_score?.toFixed(3)}, Similarity: \${m.similarity?.toFixed(3)}\`);
        console.log(\`[FOUNDER-STR1]      Keyword boost: \${m.keyword_boosted || false}\`);
        console.log(\`[FOUNDER-STR1]      Entity boost: \${m.entity_boosted || false}\`);
        console.log(\`[FOUNDER-STR1]      Content: "\${(m.content || '').substring(0, 100)}"\`);
      });
      const teslaRanks = filtered
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => /tesla|model\\s*3/i.test(m.content || ''))
        .map(({ idx }) => idx + 1);
      if (teslaRanks.length > 0) {
        console.log(\`[FOUNDER-STR1] 🎯 TESLA FOUND AT RANKS: \${teslaRanks.join(', ')}\`);
        if (teslaRanks[0] <= 3) {
          console.log('[FOUNDER-STR1] ✅ Tesla ranks in TOP 3 - ranking is working correctly');
        } else {
          console.log(\`[FOUNDER-STR1] ⚠️  Tesla ranks at #\${teslaRanks[0]} - RANKING MAY NEED FIX\`);
        }
      } else {
        console.log('[FOUNDER-STR1] ❌ Tesla NOT FOUND in ranked results - investigate why');
      }
      console.log('[FOUNDER-STR1] ═══════════════════════════════════════════════════════');
    }`,
      marker: 'FOUNDER-STR1'
    }
  ];
  
  applyPatch(semanticRetrievalPath, str1Patches);

  // ═══════════════════════════════════════════════════════════════
  // DIAGNOSTIC 2: A5 Explicit Memory Pipeline
  // ═══════════════════════════════════════════════════════════════
  log('\n═══════════════════════════════════════════════════════════════');
  log('DIAGNOSTIC 2: A5 - Explicit Memory Pipeline Logging');
  log('═══════════════════════════════════════════════════════════════');
  
  const a5StoragePatches = [
    {
      description: 'Add A5-DEBUG to explicit storage detection',
      search: `    console.log('[TRACE-T2] Calling detectExplicitMemoryRequest...');
    const explicitRequest = this.detectExplicitMemoryRequest(userMessage);`,
      replace: `    console.log('[TRACE-T2] Calling detectExplicitMemoryRequest...');
    const explicitRequest = this.detectExplicitMemoryRequest(userMessage);
    console.log(\`[A5-DEBUG] Storage: detectExplicitMemoryRequest returned: \${JSON.stringify(explicitRequest)}\`);`,
      marker: 'A5-DEBUG'
    },
    {
      description: 'Add A5-DEBUG when metadata is set',
      search: `        // Set explicit memory metadata (FIX #562-T2)
        metadata.explicit_storage_request = true;  // Mark as explicit for retrieval optimization
        metadata.wait_for_embedding = true`,
      replace: `        // Set explicit memory metadata (FIX #562-T2)
        metadata.explicit_storage_request = true;  // Mark as explicit for retrieval optimization
        metadata.wait_for_embedding = true;
        console.log(\`[A5-DEBUG] Storage: Set explicit_storage_request=true in metadata\`);
        console.log(\`[A5-DEBUG] Storage: Set wait_for_embedding=true in metadata\`);`,
      marker: 'A5-DEBUG'
    }
  ];
  
  const a5RetrievalPatches = [
    {
      description: 'Add A5-DEBUG to memory recall detection',
      search: `  // STEP 0.5: Expand query with synonyms for better matching (Issue #504)
    const { expanded: expandedQuery, isPersonal, isMemoryRecall } = expandQuery(normalizedQuery);`,
      replace: `  // STEP 0.5: Expand query with synonyms for better matching (Issue #504)
    const { expanded: expandedQuery, isPersonal, isMemoryRecall } = expandQuery(normalizedQuery);
    if (isMemoryRecall) {
      console.log(\`[A5-DEBUG] Retrieval: Memory recall query detected\`);
      console.log(\`[A5-DEBUG] Retrieval: Original query: "\${normalizedQuery}"\`);
    }`,
      marker: 'A5-DEBUG'
    },
    {
      description: 'Add A5-DEBUG when explicit boost is applied',
      search: `          if (metadata?.explicit_storage_request === true) {
            const originalScore = memory.similarity;
            const boostedScore = Math.min(originalScore + 0.70, 1.0); // Massive boost for explicit storage
            console.log(\`[EXPLICIT-RECALL] Memory \${memory.id}: explicit_storage_request=true - boosting \${originalScore.toFixed(3)} → \${boostedScore.toFixed(3)} (+0.70)\`);`,
      replace: `          if (metadata?.explicit_storage_request === true) {
            const originalScore = memory.similarity;
            const boostedScore = Math.min(originalScore + 0.70, 1.0); // Massive boost for explicit storage
            console.log(\`[A5-DEBUG] Retrieval: explicit_boost_applied=true for memory \${memory.id}\`);
            console.log(\`[EXPLICIT-RECALL] Memory \${memory.id}: explicit_storage_request=true - boosting \${originalScore.toFixed(3)} → \${boostedScore.toFixed(3)} (+0.70)\`);`,
      marker: 'A5-DEBUG'
    }
  ];
  
  applyPatch(intelligentStoragePath, a5StoragePatches);
  applyPatch(semanticRetrievalPath, a5RetrievalPatches);

  // ═══════════════════════════════════════════════════════════════
  // DIAGNOSTIC 3: Check Orchestrator for Memory Injection
  // ═══════════════════════════════════════════════════════════════
  log('\n═══════════════════════════════════════════════════════════════');
  log('DIAGNOSTIC 3: A5 - Memory Context Injection Logging');
  log('═══════════════════════════════════════════════════════════════');
  
  const a5OrchestratorPatches = [
    {
      description: 'Add A5-DEBUG when memories are injected into context',
      search: `        const formattedMemories = memoriesToFormat`,
      replace: `        // FOUNDER DIAGNOSTIC #579-A5: Log memory injection details
        const zebraMemoryPresent = memoriesToFormat.some(m => 
          /zebra|anchor/i.test(m.content || '') || 
          m.metadata?.explicit_storage_request === true
        );
        if (zebraMemoryPresent) {
          console.log(\`[A5-DEBUG] Orchestrator: zebra_memory_in_context=true\`);
          console.log(\`[A5-DEBUG] Orchestrator: Injecting \${memoriesToFormat.length} memories into AI context\`);
          memoriesToFormat.filter(m => 
            /zebra|anchor/i.test(m.content || '') || 
            m.metadata?.explicit_storage_request === true
          ).forEach(m => {
            console.log(\`[A5-DEBUG] Orchestrator:   Memory \${m.id}: explicit=\${m.metadata?.explicit_storage_request || false}\`);
            console.log(\`[A5-DEBUG] Orchestrator:   Content: "\${(m.content || '').substring(0, 100)}"\`);
          });
        }
        
        const formattedMemories = memoriesToFormat`,
      marker: 'A5-DEBUG'
    }
  ];
  
  applyPatch(orchestratorPath, a5OrchestratorPatches);

  log('\n═══════════════════════════════════════════════════════════════');
  log('✅ DIAGNOSTIC LOGGING ADDED');
  log('═══════════════════════════════════════════════════════════════');
  log('\nNext steps:');
  log('1. Run tests to verify Tesla ranks in top 3');
  log('2. Run A5 test to verify explicit memory pipeline');
  log('3. Review system prompt for TRU1/TRU2 compliance');
}

main().catch(error => {
  console.error(`\n❌ ERROR: ${error.message}`);
  console.error(error);
  process.exit(1);
});
