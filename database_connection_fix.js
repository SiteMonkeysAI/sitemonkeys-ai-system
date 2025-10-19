// database_connection_fix.js - Railway database connection fix
import { Pool } from "pg";

console.log("🔍 Site Monkeys Database Connection Diagnostic...");

async function fixDatabaseConnection() {
  console.log("\n=== CHECKING RAILWAY DATABASE ENVIRONMENT ===");

  // Check all possible database environment variables
  const dbEnvVars = [
    "DATABASE_URL",
    "DATABASE_PRIVATE_URL",
    "POSTGRES_URL",
    "POSTGRESQL_URL",
  ];

  let workingUrl = null;
  for (const envVar of dbEnvVars) {
    if (process.env[envVar]) {
      console.log(`✅ Found ${envVar}`);
      workingUrl = process.env[envVar];
      break;
    }
  }

  if (!workingUrl) {
    console.log("❌ No database URL found in Railway environment variables");
    console.log(
      "💡 Railway Fix: Make sure your PostgreSQL service is connected to your app",
    );
    return false;
  }

  console.log(
    `🔗 Using database URL starting with: ${workingUrl.substring(0, 25)}...`,
  );

  // Test connection with Railway-optimized settings
  const poolConfig = {
    connectionString: workingUrl,
    ssl: { rejectUnauthorized: false }, // Railway requires this
    max: 3, // Low connection limit for Railway
    min: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000, // Increased for Railway latency
    acquireTimeoutMillis: 15000,
    statement_timeout: 30000,
  };

  const pool = new Pool(poolConfig);

  try {
    console.log("\n=== TESTING DATABASE CONNECTION ===");
    const client = await pool.connect();

    // Test basic connectivity
    const timeResult = await client.query("SELECT NOW() as current_time");
    console.log("✅ Database connection successful");
    console.log(`📅 Database time: ${timeResult.rows[0].current_time}`);

    // Test table existence
    const tableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('persistent_memories', 'memory_categories')
            ORDER BY table_name
        `);

    console.log(`📋 Found ${tableCheck.rows.length} memory system tables`);
    tableCheck.rows.forEach((row) => {
      console.log(`   - ${row.table_name}`);
    });

    // If tables don't exist, create them
    if (tableCheck.rows.length === 0) {
      console.log("🔨 Creating missing database tables...");

      await client.query(`
                CREATE TABLE IF NOT EXISTS persistent_memories (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    category_name VARCHAR(100) NOT NULL,
                    subcategory_name VARCHAR(100),
                    content TEXT NOT NULL,
                    token_count INTEGER NOT NULL DEFAULT 0,
                    relevance_score DECIMAL(3,2) DEFAULT 0.50,
                    usage_frequency INTEGER DEFAULT 0,
                    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

      await client.query(`
                CREATE TABLE IF NOT EXISTS memory_categories (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    category_name VARCHAR(100) NOT NULL,
                    subcategory_name VARCHAR(100),
                    current_tokens INTEGER DEFAULT 0,
                    max_tokens INTEGER DEFAULT 50000,
                    is_dynamic BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, category_name, subcategory_name)
                )
            `);

      await client.query(`
                CREATE INDEX IF NOT EXISTS idx_memories_user_category 
                ON persistent_memories(user_id, category_name);
                CREATE INDEX IF NOT EXISTS idx_memories_relevance 
                ON persistent_memories(relevance_score DESC);
            `);

      console.log("✅ Database tables created successfully");
    }

    // Test insertion
    await client.query(`
            INSERT INTO persistent_memories (user_id, category_name, content, token_count)
            VALUES ('test_user', 'personal_development', 'Database connection test successful', 8)
            ON CONFLICT DO NOTHING
        `);

    // Test retrieval
    const testResult = await client.query(`
            SELECT COUNT(*) as memory_count 
            FROM persistent_memories 
            WHERE user_id = 'test_user'
        `);

    console.log(
      `✅ Database operations test passed - ${testResult.rows[0].memory_count} test memories found`,
    );

    client.release();
    await pool.end();

    console.log("\n🎉 DATABASE CONNECTION FIX SUCCESSFUL!");
    console.log("💡 Your persistent memory system should now work properly");
    return true;
  } catch (error) {
    console.error("\n❌ Database connection failed:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
    });

    if (error.code === "ECONNREFUSED") {
      console.log("\n🔧 RAILWAY FIX NEEDED:");
      console.log("1. Go to your Railway dashboard");
      console.log("2. Make sure PostgreSQL service is deployed and running");
      console.log(
        "3. Verify your app service is connected to the database service",
      );
      console.log("4. Redeploy both services if necessary");
    } else if (error.code === "ENOTFOUND") {
      console.log("\n🔧 DNS/NETWORK ISSUE:");
      console.log("1. Check Railway service status");
      console.log("2. Verify database URL is correctly set");
      console.log("3. Try redeploying your Railway services");
    }

    await pool.end().catch(() => {});
    return false;
  }
}

// Run the fix
fixDatabaseConnection()
  .then((success) => {
    if (success) {
      console.log(
        "\n🚀 NEXT STEP: Deploy your app - persistent memory should now work!",
      );
      process.exit(0);
    } else {
      console.log(
        "\n⚠️ Fix the Railway database connection and run this script again",
      );
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("💥 Diagnostic failed:", error.message);
    process.exit(1);
  });
