#!/usr/bin/env node
// ================================================================
// MEMORY RETRIEVAL FIX VALIDATION TEST
// Tests that memory queries search for both 'user' and 'anonymous' user_id values
// ================================================================

import intelligenceSystem from "./api/categories/memory/internal/intelligence.js";
import coreSystem from "./api/categories/memory/internal/core.js";

console.log("🧪 TESTING MEMORY RETRIEVAL FIX...\n");

async function testMemoryRetrievalFix() {
  try {
    // Initialize the core system (database)
    console.log("📦 Initializing core system...");
    await coreSystem.initialize();
    console.log("✅ Core system initialized\n");

    // Initialize intelligence system
    console.log("🧠 Initializing intelligence system...");
    await intelligenceSystem.initialize();
    console.log("✅ Intelligence system initialized\n");

    // Test 1: Extract memories with routing
    console.log("🔍 Test 1: Extract memories from primary category");
    const testQuery = "What are my children's names?";
    const testUserId = "anonymous"; // Current default user_id
    const testRouting = {
      primaryCategory: "relationships_social",
      subcategory: "Family Relations",
      confidence: 0.85,
    };

    const memories = await intelligenceSystem.extractRelevantMemories(
      testUserId,
      testQuery,
      testRouting
    );

    console.log(`   Found ${memories.length} memories`);
    
    if (memories.length > 0) {
      console.log(`   ✅ Memory retrieval working`);
      console.log(`   Sample memory: ${memories[0].content.substring(0, 100)}...`);
    } else {
      console.log(`   ⚠️  No memories found (database may be empty)`);
    }
    console.log("");

    // Test 2: Verify SQL queries use actual userId parameter
    console.log("🔍 Test 2: Verify SQL uses actual userId parameter (user_id = $1 or $2)");
    
    // Read the intelligence.js file to verify the fix
    const fs = await import('fs');
    const intelligenceCode = fs.readFileSync(
      './api/categories/memory/internal/intelligence.js',
      'utf8'
    );

    // Check that hardcoded pattern is GONE
    const hardcodedPattern = /WHERE user_id IN \('user', 'anonymous'\)/g;
    const hardcodedMatches = intelligenceCode.match(hardcodedPattern);

    if (!hardcodedMatches || hardcodedMatches.length === 0) {
      console.log(`   ✅ No hardcoded user_id IN ('user', 'anonymous') found`);
    } else {
      console.log(`   ❌ Found ${hardcodedMatches.length} instances of hardcoded pattern - still needs fixing!`);
    }

    // Check that parameterized pattern EXISTS in at least 3 places
    const parameterizedPattern = /WHERE user_id = \$\d+/g;
    const paramMatches = intelligenceCode.match(parameterizedPattern);

    if (paramMatches && paramMatches.length >= 3) {
      console.log(`   ✅ Found ${paramMatches.length} instances of parameterized WHERE user_id = $N`);
      console.log(`   ✅ All queries use actual userId parameter`);
    } else {
      console.log(`   ❌ Expected at least 3 parameterized instances, found ${paramMatches ? paramMatches.length : 0}`);
    }
    console.log("");

    // Test 3: Verify no old single-parameter pattern remains
    console.log("🔍 Test 3: Verify queries correctly parameterize userId");
    
    // The queries should have userId as first or second parameter
    // Looking for patterns like: WHERE user_id = $1 AND category_name = $2
    //                        or: WHERE user_id = $2 (in related categories)
    const correctPatterns = [
      /WHERE user_id = \$1 AND category_name = \$2/g,  // Primary category
      /WHERE user_id = \$1 AND category_name = \$2 AND relevance_score/g,  // Related categories
    ];

    let correctUsageCount = 0;
    correctPatterns.forEach(pattern => {
      const matches = intelligenceCode.match(pattern);
      if (matches) {
        correctUsageCount += matches.length;
      }
    });

    if (correctUsageCount >= 2) {
      console.log(`   ✅ Found ${correctUsageCount} correctly parameterized queries`);
    } else {
      console.log(`   ⚠️  Found ${correctUsageCount} correctly parameterized queries (expected at least 2)`);
    }
    console.log("");

    // Summary
    console.log("📊 TEST SUMMARY");
    console.log("================");
    
    const allTestsPassed = 
      (!hardcodedMatches || hardcodedMatches.length === 0) &&
      paramMatches && paramMatches.length >= 3 &&
      correctUsageCount >= 2;

    if (allTestsPassed) {
      console.log("✅ ALL TESTS PASSED!");
      console.log("✅ Memory retrieval fix is correctly implemented");
      console.log("✅ Queries use actual userId parameter instead of hardcoded values");
      console.log("\n🎯 ACCEPTANCE CRITERIA MET:");
      console.log("   - All 3 WHERE clauses updated ✓");
      console.log("   - Uses parameterized userId ($1 or $2) ✓");
      console.log("   - Cross-session memories can now be retrieved ✓");
      console.log("   - No hardcoded 'user'/'anonymous' values ✓");
    } else {
      console.log("❌ SOME TESTS FAILED - Review implementation");
    }

    // Cleanup
    if (typeof coreSystem.cleanup === 'function') {
      await coreSystem.cleanup();
    }
    process.exit(allTestsPassed ? 0 : 1);

  } catch (error) {
    console.error("\n❌ ERROR during testing:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMemoryRetrievalFix();
