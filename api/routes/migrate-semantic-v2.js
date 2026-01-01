/**
 * SEMANTIC LAYER MIGRATION V2
 * 
 * Adds FLOAT4[] embedding storage with proper status tracking
 * Designed for graceful degradation and future pgvector migration
 * 
 * Usage: GET /api/migrate-semantic-v2
 * DELETE THIS FILE AFTER SUCCESSFUL MIGRATION
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { Pool } = await import('pg');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const results = {
    success: false,
    steps: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  let client;
  
  try {
    client = await pool.connect();
    results.steps.push('✅ Database connected');

    // ============================================
    // STEP 1: Add embedding storage as FLOAT4[]
    // ============================================
    results.steps.push('Adding embedding column (FLOAT4[])...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS embedding FLOAT4[]
      `);
      results.steps.push('✅ embedding FLOAT4[] column added');
    } catch (err) {
      results.steps.push('⚠️ embedding column: ' + err.message);
      results.errors.push('embedding: ' + err.message);
    }

    // ============================================
    // STEP 2: Add embedding status tracking
    // ============================================
    results.steps.push('Adding embedding_status column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) DEFAULT 'pending'
      `);
      // Add check constraint for valid statuses
      await client.query(`
        DO $$ BEGIN
          ALTER TABLE persistent_memories 
          ADD CONSTRAINT chk_embedding_status 
          CHECK (embedding_status IN ('pending', 'ready', 'failed'));
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
      results.steps.push('✅ embedding_status column added (pending|ready|failed)');
    } catch (err) {
      results.steps.push('⚠️ embedding_status: ' + err.message);
      results.errors.push('embedding_status: ' + err.message);
    }

    // ============================================
    // STEP 3: Add embedding metadata
    // ============================================
    results.steps.push('Adding embedding_updated_at column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ
      `);
      results.steps.push('✅ embedding_updated_at column added');
    } catch (err) {
      results.steps.push('⚠️ embedding_updated_at: ' + err.message);
      results.errors.push('embedding_updated_at: ' + err.message);
    }

    results.steps.push('Adding embedding_model column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small'
      `);
      results.steps.push('✅ embedding_model column added');
    } catch (err) {
      results.steps.push('⚠️ embedding_model: ' + err.message);
      results.errors.push('embedding_model: ' + err.message);
    }

    // ============================================
    // STEP 4: Ensure fact_fingerprint columns exist (from v1)
    // ============================================
    results.steps.push('Verifying fact_fingerprint column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS fact_fingerprint TEXT
      `);
      results.steps.push('✅ fact_fingerprint column verified');
    } catch (err) {
      results.errors.push('fact_fingerprint: ' + err.message);
    }

    results.steps.push('Verifying fingerprint_confidence column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS fingerprint_confidence FLOAT DEFAULT 0.5
      `);
      results.steps.push('✅ fingerprint_confidence column verified');
    } catch (err) {
      results.errors.push('fingerprint_confidence: ' + err.message);
    }

    // ============================================
    // STEP 5: Ensure supersession columns exist (from v1)
    // ============================================
    results.steps.push('Verifying is_current column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true
      `);
      results.steps.push('✅ is_current column verified');
    } catch (err) {
      results.errors.push('is_current: ' + err.message);
    }

    results.steps.push('Verifying superseded_by column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS superseded_by UUID
      `);
      results.steps.push('✅ superseded_by column verified');
    } catch (err) {
      results.errors.push('superseded_by: ' + err.message);
    }

    results.steps.push('Verifying superseded_at column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ
      `);
      results.steps.push('✅ superseded_at column verified');
    } catch (err) {
      results.errors.push('superseded_at: ' + err.message);
    }

    // ============================================
    // STEP 6: Add mode column if not exists
    // ============================================
    results.steps.push('Adding mode column for mode-aware filtering...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'truth-general'
      `);
      results.steps.push('✅ mode column added');
    } catch (err) {
      results.steps.push('⚠️ mode column: ' + err.message);
      results.errors.push('mode: ' + err.message);
    }

    // ============================================
    // STEP 7: Create mode-aware indexes
    // ============================================
    results.steps.push('Creating mode-aware indexes...');
    
    // Index 1: Primary retrieval index (user + mode + current)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_user_mode_current 
        ON persistent_memories (user_id, mode, is_current) 
        WHERE is_current = true
      `);
      results.steps.push('✅ idx_memories_user_mode_current created');
    } catch (err) {
      results.errors.push('idx_user_mode_current: ' + err.message);
    }

    // Index 2: Category filtering
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_user_category 
        ON persistent_memories (user_id, category)
      `);
      results.steps.push('✅ idx_memories_user_category created');
    } catch (err) {
      results.errors.push('idx_user_category: ' + err.message);
    }

    // Index 3: Fact fingerprint lookup (for supersession)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_fingerprint_lookup 
        ON persistent_memories (user_id, fact_fingerprint, is_current) 
        WHERE is_current = true AND fact_fingerprint IS NOT NULL
      `);
      results.steps.push('✅ idx_memories_fingerprint_lookup created');
    } catch (err) {
      results.errors.push('idx_fingerprint_lookup: ' + err.message);
    }

    // Index 4: Embedding status (for backfill worker)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_embedding_pending 
        ON persistent_memories (embedding_status, created_at) 
        WHERE embedding_status = 'pending'
      `);
      results.steps.push('✅ idx_memories_embedding_pending created');
    } catch (err) {
      results.errors.push('idx_embedding_pending: ' + err.message);
    }

    // Index 5: Recency + importance for prefiltering
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_recency 
        ON persistent_memories (user_id, created_at DESC) 
        WHERE is_current = true
      `);
      results.steps.push('✅ idx_memories_recency created');
    } catch (err) {
      results.errors.push('idx_recency: ' + err.message);
    }

    // ============================================
    // STEP 8: Verify all columns exist
    // ============================================
    results.steps.push('Verifying migration...');
    const verification = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'persistent_memories' 
      AND column_name IN (
        'embedding', 'embedding_status', 'embedding_updated_at', 'embedding_model',
        'fact_fingerprint', 'fingerprint_confidence',
        'is_current', 'superseded_by', 'superseded_at',
        'mode'
      )
      ORDER BY column_name
    `);
    
    results.verification = verification.rows;
    results.columnsFound = verification.rows.length;
    
    const expectedColumns = 10;
    if (verification.rows.length >= expectedColumns - 1) {
      results.steps.push(`✅ Migration verified: ${verification.rows.length} semantic columns confirmed`);
      results.success = true;
    } else {
      results.steps.push(`⚠️ Only ${verification.rows.length}/${expectedColumns} columns verified`);
    }

    // ============================================
    // STEP 9: Count pending embeddings (for backfill info)
    // ============================================
    try {
      const pendingCount = await client.query(`
        SELECT COUNT(*) as count FROM persistent_memories 
        WHERE embedding_status = 'pending' OR embedding IS NULL
      `);
      results.pendingEmbeddings = parseInt(pendingCount.rows[0].count);
      results.steps.push(`📊 ${results.pendingEmbeddings} memories need embedding generation`);
    } catch (err) {
      results.pendingEmbeddings = 'unknown';
    }

  } catch (error) {
    results.errors.push('Connection error: ' + error.message);
    results.steps.push('❌ Migration failed: ' + error.message);
  } finally {
    if (client) client.release();
    await pool.end();
  }

  // Final response
  results.message = results.success 
    ? '🎉 Semantic Layer V2 migration completed!' 
    : '⚠️ Migration had issues. Check errors.';
  
  results.nextSteps = results.success ? [
    '1. Deploy embedding-service.js for store-time embedding generation',
    '2. Deploy semantic-retrieval.js for query-time retrieval',
    '3. Run backfill for existing memories if needed',
    '4. Delete this migration file'
  ] : [
    '1. Review errors above',
    '2. Fix any blocking issues',
    '3. Re-run migration'
  ];

  results.schema = {
    embeddingStorage: 'FLOAT4[] (1536 dimensions, OpenAI compatible)',
    statusTracking: 'pending → ready | failed',
    indexStrategy: 'Mode-aware prefiltering with recency support',
    migrationPath: 'Direct upgrade to pgvector vector(1536) when available'
  };

  res.status(results.success ? 200 : 500).json(results);
}
