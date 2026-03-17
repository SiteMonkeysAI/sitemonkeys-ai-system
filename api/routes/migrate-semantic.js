/**
 * ONE-TIME MIGRATION ENDPOINT
 * Run the semantic intelligence layer database migration
 * 
 * Usage: GET /api/migrate-semantic
 * 
 * DELETE THIS FILE AFTER SUCCESSFUL MIGRATION
 */

export default async function handler(req, res) {
  // Only allow GET for easy browser access
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { Pool } = await import('pg');
  
  // Use existing DATABASE_URL from environment
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const results = {
    success: false,
    steps: [],
    errors: []
  };

  try {
    const client = await pool.connect();
    
    // Step 1: Check if pgvector extension exists
    results.steps.push('Checking pgvector extension...');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      results.steps.push('✅ pgvector extension enabled');
    } catch (err) {
      results.steps.push('⚠️ pgvector may not be available: ' + err.message);
      results.errors.push('pgvector: ' + err.message);
    }

    // Step 2: Add embedding column
    results.steps.push('Adding embedding column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `);
      results.steps.push('✅ embedding column added');
    } catch (err) {
      // If vector type doesn't exist, try without it
      results.steps.push('⚠️ Could not add vector column: ' + err.message);
      results.errors.push('embedding: ' + err.message);
    }

    // Step 3: Add fact_fingerprint column
    results.steps.push('Adding fact_fingerprint column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS fact_fingerprint TEXT
      `);
      results.steps.push('✅ fact_fingerprint column added');
    } catch (err) {
      results.errors.push('fact_fingerprint: ' + err.message);
    }

    // Step 4: Add fingerprint_confidence column
    results.steps.push('Adding fingerprint_confidence column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS fingerprint_confidence FLOAT DEFAULT 0.5
      `);
      results.steps.push('✅ fingerprint_confidence column added');
    } catch (err) {
      results.errors.push('fingerprint_confidence: ' + err.message);
    }

    // Step 5: Add is_current column
    results.steps.push('Adding is_current column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true
      `);
      results.steps.push('✅ is_current column added');
    } catch (err) {
      results.errors.push('is_current: ' + err.message);
    }

    // Step 6: Add superseded_by column
    results.steps.push('Adding superseded_by column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS superseded_by UUID
      `);
      results.steps.push('✅ superseded_by column added');
    } catch (err) {
      results.errors.push('superseded_by: ' + err.message);
    }

    // Step 7: Add superseded_at column
    results.steps.push('Adding superseded_at column...');
    try {
      await client.query(`
        ALTER TABLE persistent_memories 
        ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ
      `);
      results.steps.push('✅ superseded_at column added');
    } catch (err) {
      results.errors.push('superseded_at: ' + err.message);
    }

    // Step 8: Create index on fact_fingerprint
    results.steps.push('Creating fact_fingerprint index...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_fingerprint 
        ON persistent_memories (user_id, fact_fingerprint) 
        WHERE is_current = true
      `);
      results.steps.push('✅ fact_fingerprint index created');
    } catch (err) {
      results.errors.push('fingerprint_index: ' + err.message);
    }

    // Step 9: Create index on is_current
    results.steps.push('Creating is_current index...');
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_is_current 
        ON persistent_memories (user_id, is_current) 
        WHERE is_current = true
      `);
      results.steps.push('✅ is_current index created');
    } catch (err) {
      results.errors.push('is_current_index: ' + err.message);
    }

    // Step 10: Verify columns exist
    results.steps.push('Verifying migration...');
    const verification = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'persistent_memories' 
      AND column_name IN ('embedding', 'fact_fingerprint', 'is_current', 'superseded_by')
    `);
    
    results.verification = verification.rows;
    results.columnsAdded = verification.rows.length;
    
    if (verification.rows.length >= 3) {
      results.steps.push(`✅ Migration verified: ${verification.rows.length} columns confirmed`);
      results.success = true;
    } else {
      results.steps.push(`⚠️ Only ${verification.rows.length} columns verified`);
    }

    client.release();

  } catch (error) {
    results.errors.push('Connection error: ' + error.message);
    results.steps.push('❌ Migration failed: ' + error.message);
  } finally {
    await pool.end();
  }

  // Return results
  res.status(results.success ? 200 : 500).json({
    ...results,
    message: results.success 
      ? '🎉 Migration completed! You can now delete this file.' 
      : '⚠️ Migration had issues. Check errors.',
    nextSteps: results.success 
      ? ['1. Run the semantic verification test', '2. Delete api/migrate-semantic.js from your repo']
      : ['1. Check the errors above', '2. You may need to enable pgvector in Railway PostgreSQL']
  });
}
