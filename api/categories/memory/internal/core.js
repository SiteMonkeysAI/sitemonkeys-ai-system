// ================================================================
// core.js - Database & Infrastructure Management Hub
// Consolidates database logic from 4+ sources into unified system
// ================================================================

import { Pool } from "pg";

class CoreSystem {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
    this.fallbackMemory = new Map();
    this.healthStatus = {
      overall: false,
      database: { healthy: false },
      initialized: false,
      lastCheck: null,
    };

    // Valid category names (underscore format)
    this.validCategories = [
      "mental_emotional",
      "health_wellness",
      "relationships_social",
      "work_career",
      "money_income_debt",
      "money_spending_goals",
      "goals_active_current",
      "goals_future_dreams",
      "tools_tech_workflow",
      "daily_routines_habits",
      "personal_life_interests",
    ];

    this.categoryLimits = {
      tokenLimit: 50000,
      memoryLimit: 1000,
    };

    this.logger = {
      log: (message) =>
        console.log(`[CORE] ${new Date().toISOString()} ${message}`),
      error: (message, error) =>
        console.error(
          `[CORE ERROR] ${new Date().toISOString()} ${message}`,
          error,
        ),
      warn: (message) =>
        console.warn(`[CORE WARN] ${new Date().toISOString()} ${message}`),
    };
  }

  async initialize() {
    this.logger.log("Initializing Core System...");

    try {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable not found");
      }

      // Connection Pool Management with specified configuration
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
        max: 30, // Increased from 20
        idleTimeoutMillis: 60000, // Doubled to 60s
        connectionTimeoutMillis: 15000, // Increased from 2s
        allowExitOnIdle: true, // Clean up idle connections
      });
      // Alias for external modules expecting `db` instead of `pool`
      // Added for intelligent-storage compatibility
      this.db = this.pool;

      // --- Keep pool healthy between requests ---
      this.pool.on("remove", () => {
        this.logger.warn("[DB] Client removed from pool — reconnecting soon");
      });

      this.pool.on("error", (err) => {
        this.logger.error("[DB] Pool error:", err);
      });

      // Lightweight keep-alive every 30 s to prevent idle shutdown
      setInterval(async () => {
        try {
          await this.pool.query("SELECT 1");
        } catch (e) {
          this.logger.error("[DB] Keep-alive failed:", e);
          this.logger.warn("[DB] Attempting to reconnect...");
          await this.pool.end();
          this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
          this.db = this.pool; // Re-assign alias after reconnect
        }
      }, 30000);

      // Pool event handling with detailed logging
      this.pool.on("connect", (_client) => {
        this.logger.log("Database client connected");
      });

      this.pool.on("error", (err, _client) => {
        this.logger.error("Database pool error:", err);
      });

      this.pool.on("remove", (_client) => {
        this.logger.log("Database client removed from pool");
      });

      // Test connection - Level 1 Health Check
      await this.executeQuery("SELECT NOW() as current_time");
      this.logger.log("Database connection established");

      // Schema Management & Migration
      await this.createDatabaseSchema();

      // Ensure category tracking is initialized (Diagnostic #139 fix)
      await this.ensureCategoryTracking('anonymous');

      // Initialize health monitoring
      await this.updateHealthStatus();

      this.isInitialized = true;
      this.logger.log("Core System initialized successfully");
      return true;
    } catch (error) {
      this.logger.error("Core System initialization failed:", error);
      this.isInitialized = false;
      return false;
    }
  }

  async executeQuery(query, params = []) {
    try {
      if (!this.pool) {
        throw new Error("Database pool not initialized");
      }
      const result = await this.pool.query(query, params);
      return result;
    } catch (error) {
      this.logger.error("Query execution failed:", error);
      throw error;
    }
  }

  async createDatabaseSchema() {
    this.logger.log("Creating database schema...");

    try {
      // Create persistent_memories table
      await this.executeQuery(`
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

      // Create memory_categories table
      await this.executeQuery(`
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

      // Create indexes
      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_memories_user_category 
        ON persistent_memories(user_id, category_name)
      `);

      await this.executeQuery(`
        CREATE INDEX IF NOT EXISTS idx_memories_relevance 
        ON persistent_memories(relevance_score DESC)
      `);

      this.logger.log("Database schema created successfully");
    } catch (error) {
      this.logger.error("Schema creation failed:", error);
      throw error;
    }
  }

  async updateHealthStatus() {
    try {
      if (!this.pool) {
        this.healthStatus.overall = false;
        this.healthStatus.database.healthy = false;
        return;
      }

      // Test database connectivity
      await this.executeQuery("SELECT 1");

      this.healthStatus.database.healthy = true;
      this.healthStatus.overall = true;
      this.healthStatus.initialized = this.isInitialized;
      this.healthStatus.lastCheck = new Date().toISOString();

      this.logger.log("Health status updated: System healthy");
    } catch (error) {
      this.healthStatus.database.healthy = false;
      this.healthStatus.overall = false;
      this.logger.error("Health check failed:", error);
    }
  }

  async updateMemoryAccess(memoryId) {
    try {
      await this.executeQuery(
        `
        UPDATE persistent_memories 
        SET last_accessed = CURRENT_TIMESTAMP,
            usage_frequency = usage_frequency + 1
        WHERE id = $1
      `,
        [memoryId],
      );
    } catch (error) {
      this.logger.error("Failed to update memory access:", error);
    }
  }

  async withDbClient(callback) {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async ensureCategoryTracking(userId) {
    try {
      // Check if memory_categories is populated for this user
      const result = await this.executeQuery(
        'SELECT COUNT(*) FROM memory_categories WHERE user_id = $1',
        [userId]
      );
      
      const count = parseInt(result.rows[0].count) || 0;
      
      if (count === 0) {
        this.logger.log(`[MEMORY] Initializing category tracking for user: ${userId}`);
        await this.rebuildMemoryCategories(userId);
        await this.rebuildUserProfile(userId);
        this.logger.log(`[MEMORY] Category tracking initialized successfully`);
      } else {
        this.logger.log(`[MEMORY] Category tracking already initialized (${count} categories)`);
      }
      
      return true;
    } catch (error) {
      this.logger.error('Failed to ensure category tracking:', error);
      return false;
    }
  }

  async rebuildMemoryCategories(userId) {
    try {
      // Category definitions from validCategories
      const categories = this.validCategories.map(name => ({
        name,
        subcategories: 5
      }));

      // Add 5 dynamic slots
      for (let i = 1; i <= 5; i++) {
        categories.push({ 
          name: `ai_dynamic_${i}`, 
          subcategories: 1,
          isDynamic: true 
        });
      }

      let totalInserted = 0;

      for (const category of categories) {
        for (let subIdx = 1; subIdx <= category.subcategories; subIdx++) {
          const subcategoryName = `subcategory_${subIdx}`;
          
          // Calculate current tokens from persistent_memories
          const tokenResult = await this.executeQuery(`
            SELECT COALESCE(SUM(token_count), 0) as current_tokens
            FROM persistent_memories 
            WHERE user_id = $1 
              AND category_name = $2 
              AND subcategory_name = $3
          `, [userId, category.name, subcategoryName]);

          const currentTokens = parseInt(tokenResult.rows[0].current_tokens) || 0;
          const isDynamic = category.isDynamic || false;

          // Insert or update
          await this.executeQuery(`
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
          `, [
            userId,
            category.name,
            subcategoryName,
            this.categoryLimits.tokenLimit,
            currentTokens,
            isDynamic
          ]);

          totalInserted++;
        }
      }

      this.logger.log(`[MEMORY] Populated ${totalInserted} category slots for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to rebuild memory categories:', error);
      throw error;
    }
  }

  async rebuildUserProfile(userId) {
    try {
      // Create user_memory_profiles table if it doesn't exist
      await this.executeQuery(`
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

      // Populate profile data from persistent_memories
      const profileData = await this.executeQuery(`
        SELECT 
          COUNT(*) as total_memories,
          COALESCE(SUM(token_count), 0) as total_tokens,
          ARRAY_AGG(DISTINCT category_name) as active_categories
        FROM persistent_memories
        WHERE user_id = $1
      `, [userId]);

      await this.executeQuery(`
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
        userId,
        parseInt(profileData.rows[0].total_memories) || 0,
        parseInt(profileData.rows[0].total_tokens) || 0,
        profileData.rows[0].active_categories || []
      ]);

      this.logger.log(`[MEMORY] User profile created/updated for ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to rebuild user profile:', error);
      throw error;
    }
  }

  async getRelatedCategories(primaryCategory) {
    // Define category relationships
    const relationships = {
      personal_life_interests: ["relationships_social"],
      relationships_social: ["personal_life_interests", "mental_emotional"],
      work_career: ["goals_active_current"],
      mental_emotional: ["relationships_social", "health_wellness"],
      health_wellness: ["mental_emotional"],
    };

    return relationships[primaryCategory] || [];
  }
}

const coreSystem = new CoreSystem();
export default coreSystem;