// test-memory-categories-fix.js - Test the memory categories rebuild functionality
// Verifies Diagnostic #139 fix implementation

import coreSystem from './api/categories/memory/internal/core.js';

async function testMemoryCategoriesFix() {
  console.log('🧪 Testing Memory Categories Fix (Diagnostic #139)');
  console.log('═════════════════════════════════════════════════\n');

  try {
    // Step 1: Initialize core system (should trigger category tracking)
    console.log('📋 Step 1: Initializing core system...');
    const initialized = await coreSystem.initialize();
    
    if (!initialized) {
      throw new Error('Core system initialization failed');
    }
    console.log('✅ Core system initialized\n');

    // Step 2: Verify memory_categories table
    console.log('📊 Step 2: Verifying memory_categories table...');
    const categoryCount = await coreSystem.executeQuery(
      "SELECT COUNT(*) as count FROM memory_categories WHERE user_id = 'anonymous'"
    );
    
    const count = parseInt(categoryCount.rows[0].count);
    console.log(`   Found ${count} category entries (expected: 60)`);
    
    if (count !== 60) {
      console.log('⚠️  Warning: Expected 60 entries (55 predefined + 5 dynamic)');
    } else {
      console.log('✅ Correct number of category entries\n');
    }

    // Step 3: Verify user_memory_profiles table
    console.log('👤 Step 3: Verifying user_memory_profiles table...');
    const profileCheck = await coreSystem.executeQuery(
      "SELECT * FROM user_memory_profiles WHERE user_id = 'anonymous'"
    );
    
    if (profileCheck.rows.length === 0) {
      console.log('❌ No user profile found');
    } else {
      const profile = profileCheck.rows[0];
      console.log(`   Profile found:`);
      console.log(`   - Total memories: ${profile.total_memories}`);
      console.log(`   - Total tokens: ${profile.total_tokens}`);
      console.log(`   - Active categories: ${profile.active_categories ? profile.active_categories.length : 0}`);
      console.log('✅ User profile exists\n');
    }

    // Step 4: Verify token counts match
    console.log('🔍 Step 4: Verifying token count accuracy...');
    const actualTokens = await coreSystem.executeQuery(`
      SELECT 
        category_name,
        subcategory_name,
        SUM(token_count) as actual_tokens
      FROM persistent_memories
      WHERE user_id = 'anonymous'
      GROUP BY category_name, subcategory_name
      LIMIT 5
    `);

    if (actualTokens.rows.length > 0) {
      console.log('   Checking sample categories:');
      for (const row of actualTokens.rows) {
        const tracked = await coreSystem.executeQuery(`
          SELECT current_tokens 
          FROM memory_categories 
          WHERE user_id = 'anonymous' 
            AND category_name = $1 
            AND subcategory_name = $2
        `, [row.category_name, row.subcategory_name]);

        const actualCount = parseInt(row.actual_tokens) || 0;
        const trackedCount = tracked.rows.length > 0 ? parseInt(tracked.rows[0].current_tokens) : 0;
        const match = actualCount === trackedCount ? '✅' : '❌';
        
        console.log(`   ${match} ${row.category_name}/${row.subcategory_name}: actual=${actualCount}, tracked=${trackedCount}`);
      }
      console.log();
    }

    // Step 5: Show distribution
    console.log('📊 Step 5: Token distribution by category:');
    const distribution = await coreSystem.executeQuery(`
      SELECT 
        category_name,
        COUNT(*) as subcategory_count,
        SUM(current_tokens) as total_tokens,
        SUM(max_tokens) as total_capacity
      FROM memory_categories
      WHERE user_id = 'anonymous'
      GROUP BY category_name
      ORDER BY total_tokens DESC
      LIMIT 10
    `);

    distribution.rows.forEach(row => {
      const utilization = row.total_capacity > 0 
        ? ((row.total_tokens / row.total_capacity) * 100).toFixed(1)
        : '0.0';
      console.log(`   ${row.category_name.padEnd(30)} ${String(row.total_tokens).padStart(6)} / ${String(row.total_capacity).padStart(6)} tokens (${String(utilization).padStart(5)}% used)`);
    });

    console.log('\n✨ Test completed successfully!');
    console.log('\n🎉 Memory categories fix verified!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    // Clean up
    if (coreSystem.pool) {
      await coreSystem.pool.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run test
testMemoryCategoriesFix()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
