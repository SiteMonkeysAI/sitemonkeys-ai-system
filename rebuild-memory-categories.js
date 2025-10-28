// rebuild-memory-categories.js - Rebuild memory_categories and user_memory_profiles tables
// Based on Memory System Diagnostic #139 findings
// Run this ONCE to populate empty memory_categories table and create user_memory_profiles

import pg from "pg";
const { Client } = pg;

// Category definitions from core.js:21-33
const CATEGORY_DEFINITIONS = [
  { name: 'mental_emotional', subcategories: 5 },
  { name: 'health_wellness', subcategories: 5 },
  { name: 'relationships_social', subcategories: 5 },
  { name: 'work_career', subcategories: 5 },
  { name: 'money_income_debt', subcategories: 5 },
  { name: 'money_spending_goals', subcategories: 5 },
  { name: 'goals_active_current', subcategories: 5 },
  { name: 'goals_future_dreams', subcategories: 5 },
  { name: 'tools_tech_workflow', subcategories: 5 },
  { name: 'daily_routines_habits', subcategories: 5 },
  { name: 'personal_life_interests', subcategories: 5 }
];

// Add 5 dynamic slots
for (let i = 1; i <= 5; i++) {
  CATEGORY_DEFINITIONS.push({ 
    name: `ai_dynamic_${i}`, 
    subcategories: 1,
    isDynamic: true 
  });
}

const MAX_TOKENS_PER_SUBCATEGORY = 50000; // From core.js:36

async function rebuildMemoryCategories() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    await client.connect();
    console.log("🔌 Connected to database");

    // Step 1: Create user_memory_profiles table if it doesn't exist
    console.log("\n📋 Step 1: Creating user_memory_profiles table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_memory_profiles (
        user_id TEXT PRIMARY KEY,
        total_memories INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        active_categories TEXT[] DEFAULT '{}',
        memory_patterns JSONB DEFAULT '{}'::jsonb,
        last_optimization TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ user_memory_profiles table ready");

    // Step 2: Check current state
    console.log("\n📊 Step 2: Checking current state...");
    
    const categoryCount = await client.query(
      "SELECT COUNT(*) FROM memory_categories WHERE user_id = 'anonymous'"
    );
    console.log(`   Current memory_categories rows: ${categoryCount.rows[0].count}`);

    const profileCount = await client.query(
      "SELECT COUNT(*) FROM user_memory_profiles WHERE user_id = 'anonymous'"
    );
    console.log(`   Current user_memory_profiles rows: ${profileCount.rows[0].count}`);

    const memoryCount = await client.query(
      "SELECT COUNT(*), SUM(token_count) FROM persistent_memories WHERE user_id = 'anonymous'"
    );
    console.log(`   Total memories: ${memoryCount.rows[0].count}`);
    console.log(`   Total tokens: ${memoryCount.rows[0].sum || 0}`);

    // Step 3: Populate memory_categories for user 'anonymous'
    console.log("\n🔧 Step 3: Populating memory_categories...");
    
    let totalInserted = 0;
    let totalUpdated = 0;

    for (const category of CATEGORY_DEFINITIONS) {
      for (let subIdx = 1; subIdx <= category.subcategories; subIdx++) {
        const subcategoryName = `subcategory_${subIdx}`;
        
        // Calculate current tokens from persistent_memories
        const tokenResult = await client.query(`
          SELECT COALESCE(SUM(token_count), 0) as current_tokens
          FROM persistent_memories 
          WHERE user_id = $1 
            AND category_name = $2 
            AND subcategory_name = $3
        `, ['anonymous', category.name, subcategoryName]);

        const currentTokens = parseInt(tokenResult.rows[0].current_tokens) || 0;
        const isDynamic = category.isDynamic || false;

        // Insert or update
        const result = await client.query(`
          INSERT INTO memory_categories (
            user_id, 
            category_name, 
            subcategory_name, 
            max_tokens, 
            current_tokens, 
            is_dynamic,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, category_name, subcategory_name) 
          DO UPDATE SET 
            current_tokens = EXCLUDED.current_tokens,
            updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted
        `, [
          'anonymous',
          category.name,
          subcategoryName,
          MAX_TOKENS_PER_SUBCATEGORY,
          currentTokens,
          isDynamic
        ]);

        if (result.rows[0].inserted) {
          totalInserted++;
        } else {
          totalUpdated++;
        }
      }
    }

    console.log(`✅ Inserted ${totalInserted} new categories`);
    console.log(`✅ Updated ${totalUpdated} existing categories`);

    // Step 4: Populate user_memory_profiles for user 'anonymous'
    console.log("\n👤 Step 4: Populating user_memory_profiles...");
    
    const profileData = await client.query(`
      SELECT 
        COUNT(*) as total_memories,
        COALESCE(SUM(token_count), 0) as total_tokens,
        ARRAY_AGG(DISTINCT category_name) as active_categories
      FROM persistent_memories
      WHERE user_id = 'anonymous'
    `);

    await client.query(`
      INSERT INTO user_memory_profiles (
        user_id, 
        total_memories, 
        total_tokens, 
        active_categories,
        last_optimization,
        created_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        total_memories = EXCLUDED.total_memories,
        total_tokens = EXCLUDED.total_tokens,
        active_categories = EXCLUDED.active_categories,
        last_optimization = CURRENT_TIMESTAMP
    `, [
      'anonymous',
      parseInt(profileData.rows[0].total_memories) || 0,
      parseInt(profileData.rows[0].total_tokens) || 0,
      profileData.rows[0].active_categories || []
    ]);

    console.log("✅ User profile created/updated");

    // Step 5: Verification
    console.log("\n✅ Step 5: Verification");
    
    const finalCategoryCount = await client.query(
      "SELECT COUNT(*) FROM memory_categories WHERE user_id = 'anonymous'"
    );
    console.log(`   Final memory_categories rows: ${finalCategoryCount.rows[0].count} (expected: 60)`);

    const finalProfileCount = await client.query(
      "SELECT * FROM user_memory_profiles WHERE user_id = 'anonymous'"
    );
    console.log(`   Final user_memory_profiles rows: ${finalProfileCount.rows.length} (expected: 1)`);
    
    if (finalProfileCount.rows.length > 0) {
      const profile = finalProfileCount.rows[0];
      console.log(`   Profile details:`);
      console.log(`     - Total memories: ${profile.total_memories}`);
      console.log(`     - Total tokens: ${profile.total_tokens}`);
      console.log(`     - Active categories: ${profile.active_categories ? profile.active_categories.length : 0}`);
    }

    // Verification query: Show token distribution
    console.log("\n📊 Token Distribution by Category:");
    const distribution = await client.query(`
      SELECT 
        category_name,
        COUNT(*) as subcategory_count,
        SUM(current_tokens) as total_tokens,
        SUM(max_tokens) as total_capacity
      FROM memory_categories
      WHERE user_id = 'anonymous'
      GROUP BY category_name
      ORDER BY category_name
    `);

    distribution.rows.forEach(row => {
      const utilization = row.total_capacity > 0 
        ? ((row.total_tokens / row.total_capacity) * 100).toFixed(1)
        : '0.0';
      console.log(`   ${row.category_name}: ${row.total_tokens}/${row.total_capacity} tokens (${utilization}% used)`);
    });

    console.log("\n✨ Migration completed successfully!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await client.end();
    console.log("🔌 Database connection closed");
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  rebuildMemoryCategories()
    .then(() => {
      console.log("\n🎉 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { rebuildMemoryCategories };
