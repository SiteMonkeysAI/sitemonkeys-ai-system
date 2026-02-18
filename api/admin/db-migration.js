/**
 * pgvector Infrastructure Migration Endpoints
 * ONE-TIME USE - DELETE AFTER SUCCESSFUL MIGRATION
 *
 * Requirements:
 * - ES Modules (import/export)
 * - Dynamic schema replication (no hardcoded tables)
 * - Cursor-based pagination (not OFFSET)
 * - Primary key awareness (don't assume 'id')
 * - Idempotent operations (safe to rerun)
 * - Dry-run support
 * - Secret authentication
 * - Migration lock (ALLOW_DB_MIGRATION env var)
 *
 * Endpoints:
 * - POST /api/admin/db-tables - List all tables with metadata
 * - POST /api/admin/db-schema - Replicate schema to new DB
 * - POST /api/admin/db-migrate-data - Migrate data with cursor pagination
 * - POST /api/admin/db-setup-vector - Enable pgvector extension and convert embedding columns
 */

import { Pool } from 'pg';
import rateLimit from 'express-rate-limit';

// Rate limiter for migration endpoints to prevent abuse/DoS
const migrationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 migration requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Validates migration is allowed and authenticates request
 */
function validateMigrationRequest(req, res) {
  // Check migration lock
  if (process.env.ALLOW_DB_MIGRATION !== 'true') {
    return {
      allowed: false,
      error: 'Migration locked. Set ALLOW_DB_MIGRATION=true to enable.',
    };
  }

  // Check required env vars
  if (!process.env.NEW_DATABASE_URL) {
    return {
      allowed: false,
      error: 'NEW_DATABASE_URL environment variable not set',
    };
  }

  if (!process.env.MIGRATION_SECRET) {
    return {
      allowed: false,
      error: 'MIGRATION_SECRET environment variable not set',
    };
  }

  // Validate secret from header (and optionally request body)
  const secret =
    req.headers['x-migration-secret'] ||
    (req.body && (req.body.secret || req.body.migrationSecret));
  if (!secret) {
    return {
      allowed: false,
      error: 'Missing authentication. Provide X-Migration-Secret header',
    };
  }

  if (secret !== process.env.MIGRATION_SECRET) {
    return {
      allowed: false,
      error: 'Invalid migration secret',
    };
  }

  return { allowed: true };
}

/**
 * Get database pools for old and new databases
 */
function getDatabasePools() {
  const oldPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  const newPool = new Pool({
    connectionString: process.env.NEW_DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  return { oldPool, newPool };
}

/**
 * Detect primary key for a table
 */
async function detectPrimaryKey(client, tableName) {
  const result = await client.query(
    `
    SELECT kcu.column_name, c.data_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.columns c
      ON c.table_name = kcu.table_name
      AND c.column_name = kcu.column_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = $1
      AND tc.table_schema = 'public'
    ORDER BY kcu.ordinal_position
  `,
    [tableName],
  );

  if (result.rows.length === 0) {
    return { column: null, dataType: null, isNumeric: false };
  }

  // For composite keys, we'll use the first column
  const pk = result.rows[0];
  const isNumeric = ['integer', 'bigint', 'smallint', 'numeric'].includes(pk.data_type);

  return {
    column: pk.column_name,
    dataType: pk.data_type,
    isNumeric,
    isComposite: result.rows.length > 1,
    allColumns: result.rows.map((r) => r.column_name),
  };
}

/**
 * Get table schema using Postgres catalog for precise type information
 */
async function getTableSchema(client, tableName) {
  const query = `
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS default_value,
      a.attnum AS ordinal_position
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE a.attrelid = $1::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `;

  const result = await client.query(query, [tableName]);
  return result.rows;
}

/**
 * Converts nextval() defaults to SERIAL/BIGSERIAL types
 * @param {string} dataType - The column's data type (e.g., 'integer', 'bigint')
 * @param {string|null} defaultValue - The DEFAULT expression
 * @param {string} columnName - The column name
 * @returns {Object} { newDataType, newDefault } - Adjusted type and default
 */
function handleAutoIncrement(dataType, defaultValue, columnName) {
  // Check if this is an auto-increment column (has nextval default)
  const isAutoIncrement =
    defaultValue &&
    defaultValue.toLowerCase().includes('nextval(') &&
    defaultValue.toLowerCase().includes('_seq');

  if (!isAutoIncrement) {
    return { newDataType: dataType, newDefault: defaultValue };
  }

  // Log the conversion for transparency
  console.log(
    `[DB-MIGRATION] Converting ${columnName} from ${dataType} with nextval() to SERIAL type`,
  );

  // Convert to SERIAL or BIGSERIAL based on original type
  if (dataType === 'integer') {
    return { newDataType: 'SERIAL', newDefault: null };
  } else if (dataType === 'bigint') {
    return { newDataType: 'BIGSERIAL', newDefault: null };
  } else if (dataType === 'smallint') {
    return { newDataType: 'SMALLSERIAL', newDefault: null };
  }

  // For other types with nextval, strip the default (will fail gracefully)
  console.log(
    `[DB-MIGRATION] Warning: Unexpected auto-increment type ${dataType} for column ${columnName}`,
  );
  return { newDataType: dataType, newDefault: null };
}

/**
 * Endpoint: List all tables with metadata
 * GET /api/admin/db-tables?dryRun=true
 */
export async function listTables(req, res) {
  const validation = validateMigrationRequest(req, res);
  if (!validation.allowed) {
    return res.status(403).json({ success: false, error: validation.error });
  }

  const { oldPool, newPool } = getDatabasePools();

  try {
    const oldClient = await oldPool.connect();
    const newClient = await newPool.connect();

    // Get all user tables from old database
    const tablesResult = await oldClient.query(`
      SELECT 
        tablename,
        schemaname
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables = [];

    for (const table of tablesResult.rows) {
      const tableName = table.tablename;

      // Get row count
      const countResult = await oldClient.query(`SELECT COUNT(*) FROM ${tableName}`);
      const rowCount = parseInt(countResult.rows[0].count);

      // Detect primary key
      const pkInfo = await detectPrimaryKey(oldClient, tableName);

      // Check if table exists in new database
      const newTableCheck = await newClient.query(
        `
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' AND tablename = $1
        )
      `,
        [tableName],
      );
      const existsInNew = newTableCheck.rows[0].exists;

      tables.push({
        name: tableName,
        rowCount,
        primaryKey: pkInfo.column,
        pkDataType: pkInfo.dataType,
        pkIsNumeric: pkInfo.isNumeric,
        pkIsComposite: pkInfo.isComposite || false,
        existsInNewDB: existsInNew,
      });
    }

    oldClient.release();
    newClient.release();

    res.json({
      success: true,
      tables,
      totalTables: tables.length,
      totalRows: tables.reduce((sum, t) => sum + t.rowCount, 0),
      message: 'Table discovery complete',
    });
  } catch (error) {
    console.error('[DB-MIGRATION] Error listing tables:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

/**
 * Endpoint: Replicate schema from old to new database
 * GET /api/admin/db-schema?dryRun=true&table=tablename
 */
export async function replicateSchema(req, res) {
  const validation = validateMigrationRequest(req, res);
  if (!validation.allowed) {
    return res.status(403).json({ success: false, error: validation.error });
  }

  const dryRun = req.query.dryRun === 'true';
  const specificTable = req.query.table;
  const { oldPool, newPool } = getDatabasePools();

  try {
    const oldClient = await oldPool.connect();
    const newClient = await newPool.connect();

    // Get all tables or specific table
    let tablesQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;
    const queryParams = [];

    if (specificTable) {
      tablesQuery += ` AND tablename = $1`;
      queryParams.push(specificTable);
    }

    tablesQuery += ` ORDER BY tablename`;

    const tablesResult = await oldClient.query(tablesQuery, queryParams);
    const results = [];

    for (const table of tablesResult.rows) {
      const tableName = table.tablename;

      try {
        // Get schema using Postgres catalog
        const schema = await getTableSchema(oldClient, tableName);

        // Get primary key info
        const pkInfo = await detectPrimaryKey(oldClient, tableName);

        // Build CREATE TABLE statement
        const columns = schema
          .map((col) => {
            // Handle auto-increment columns (convert nextval to SERIAL)
            const { newDataType, newDefault } = handleAutoIncrement(
              col.data_type,
              col.default_value,
              col.column_name,
            );

            let def = `"${col.column_name}" ${newDataType}`;

            // SERIAL types implicitly include NOT NULL, so skip for auto-increment
            const isSerial = ['SERIAL', 'BIGSERIAL', 'SMALLSERIAL'].includes(newDataType);

            if (col.not_null && !isSerial) {
              def += ' NOT NULL';
            }

            if (newDefault) {
              def += ` DEFAULT ${newDefault}`;
            }

            return def;
          })
          .join(',\n  ');

        let createStatement = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columns}`;

        // Add primary key constraint if exists
        if (pkInfo.column) {
          if (pkInfo.isComposite) {
            createStatement += `,\n  PRIMARY KEY (${pkInfo.allColumns.map((c) => `"${c}"`).join(', ')})`;
          } else {
            createStatement += `,\n  PRIMARY KEY ("${pkInfo.column}")`;
          }
        }

        createStatement += '\n)';

        // Execute or preview
        if (!dryRun) {
          await newClient.query(createStatement);
        }

        results.push({
          table: tableName,
          success: true,
          columns: schema.length,
          primaryKey: pkInfo.column,
          created: !dryRun,
          sql: createStatement,
        });
      } catch (error) {
        results.push({
          table: tableName,
          success: false,
          error: error.message,
        });
      }
    }

    oldClient.release();
    newClient.release();

    res.json({
      success: true,
      dryRun,
      results,
      tablesProcessed: results.length,
      tablesCreated: results.filter((r) => r.success && !dryRun).length,
      message: dryRun ? 'Schema preview complete (dry run)' : 'Schema replication complete',
    });
  } catch (error) {
    console.error('[DB-MIGRATION] Error replicating schema:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

/**
 * Endpoint: Migrate data with cursor-based pagination
 * GET /api/admin/db-migrate-data?table=tablename&cursor=value&batchSize=1000&dryRun=true
 */
export async function migrateData(req, res) {
  const validation = validateMigrationRequest(req, res);
  if (!validation.allowed) {
    return res.status(403).json({ success: false, error: validation.error });
  }

  const tableName = req.query.table;
  const cursor = req.query.cursor || null;
  const batchSize = parseInt(req.query.batchSize) || 1000;
  const dryRun = req.query.dryRun === 'true';

  if (!tableName) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: table',
    });
  }

  // Validate table name to prevent SQL injection via identifier interpolation
  if (typeof tableName !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid parameter: table must be a string',
    });
  }

  // Allow only standard SQL identifier characters and a reasonable length
  const TABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const MAX_TABLE_NAME_LENGTH = 63; // default PostgreSQL identifier length
  if (
    tableName.length === 0 ||
    tableName.length > MAX_TABLE_NAME_LENGTH ||
    !TABLE_NAME_REGEX.test(tableName)
  ) {
    return res.status(400).json({
      success: false,
      error: 'Invalid parameter: table name is not allowed',
    });
  }

  const { oldPool, newPool } = getDatabasePools();

  try {
    const oldClient = await oldPool.connect();
    const newClient = await newPool.connect();

    // Detect primary key
    const pkInfo = await detectPrimaryKey(oldClient, tableName);

    let query;
    let queryParams = [batchSize];

    if (pkInfo.column && pkInfo.isNumeric && cursor) {
      // Cursor-based pagination for numeric PKs
      query = `
        SELECT * FROM "${tableName}"
        WHERE "${pkInfo.column}" > $2
        ORDER BY "${pkInfo.column}"
        LIMIT $1
      `;
      queryParams.push(cursor);
    } else if (pkInfo.column && cursor) {
      // For non-numeric PKs, use comparison
      query = `
        SELECT * FROM "${tableName}"
        WHERE "${pkInfo.column}" > $2
        ORDER BY "${pkInfo.column}"
        LIMIT $1
      `;
      queryParams.push(cursor);
    } else {
      // First batch or no PK - use LIMIT only
      query = `SELECT * FROM "${tableName}" LIMIT $1`;
    }

    const result = await oldClient.query(query, queryParams);
    const rows = result.rows;

    let insertedCount = 0;
    let skippedCount = 0;
    const errors = [];

    if (!dryRun && rows.length > 0) {
      // Get column names from first row
      const columns = Object.keys(rows[0]);
      const columnsList = columns.map((c) => `"${c}"`).join(', ');

      // Build conflict clause
      let conflictClause = 'DO NOTHING';
      if (pkInfo.column) {
        if (pkInfo.isComposite) {
          const pkColumns = pkInfo.allColumns.map((c) => `"${c}"`).join(', ');
          conflictClause = `(${pkColumns}) DO NOTHING`;
        } else {
          conflictClause = `("${pkInfo.column}") DO NOTHING`;
        }
      }

      for (const row of rows) {
        try {
          const values = columns.map((c) => row[c]);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          const insertQuery = `
            INSERT INTO "${tableName}" (${columnsList})
            VALUES (${placeholders})
            ON CONFLICT ${conflictClause}
          `;

          const insertResult = await newClient.query(insertQuery, values);

          if (insertResult.rowCount > 0) {
            insertedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          errors.push({
            row: pkInfo.column ? row[pkInfo.column] : 'unknown',
            error: error.message,
          });
        }
      }
    }

    // Determine next cursor
    let nextCursor = null;
    if (rows.length > 0 && pkInfo.column) {
      const lastRow = rows[rows.length - 1];
      nextCursor = lastRow[pkInfo.column];
    }

    const hasMore = rows.length === batchSize;

    oldClient.release();
    newClient.release();

    res.json({
      success: true,
      dryRun,
      table: tableName,
      batchSize: rows.length,
      insertedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
      primaryKey: pkInfo.column,
      cursor: cursor || 'start',
      nextCursor,
      hasMore,
      message: dryRun
        ? `Preview: Would migrate ${rows.length} rows`
        : `Migrated batch: ${insertedCount} inserted, ${skippedCount} skipped`,
    });
  } catch (error) {
    console.error('[DB-MIGRATION] Error migrating data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

/**
 * Endpoint: Enable pgvector extension and convert embedding columns
 * POST /api/admin/db-setup-vector?dryRun=true
 *
 * One-time use - delete after successful execution
 */
export async function setupVector(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate migration is allowed
  if (process.env.ALLOW_DB_MIGRATION !== 'true') {
    return res.status(403).json({
      success: false,
      error: 'Migration locked. Set ALLOW_DB_MIGRATION=true to enable',
    });
  }

  // Validate secret
  const secret = req.headers['x-migration-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATION_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid migration secret' });
  }

  const newDbUrl = process.env.NEW_DATABASE_URL;
  if (!newDbUrl) {
    return res.status(403).json({ success: false, error: 'NEW_DATABASE_URL not set' });
  }

  const dryRun = req.query.dryRun === 'true';
  const results = [];

  let client;
  try {
    const { Client } = await import('pg');
    client = new Client({
      connectionString: newDbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    await client.connect();

    // Step 1: Enable pgvector extension
    const enableExtensionSQL = 'CREATE EXTENSION IF NOT EXISTS vector';
    results.push({ step: 'enable_extension', sql: enableExtensionSQL });

    if (!dryRun) {
      await client.query(enableExtensionSQL);
      console.log('[DB-MIGRATION] ✅ pgvector extension enabled');
    }

    // Step 2: Convert persistent_memories.embedding to vector(1536)
    const convertMemoriesSQL = `
      ALTER TABLE persistent_memories
      ALTER COLUMN embedding TYPE vector(1536)
      USING embedding::vector(1536)
    `;
    results.push({ step: 'convert_persistent_memories', sql: convertMemoriesSQL.trim() });

    if (!dryRun) {
      await client.query(convertMemoriesSQL);
      console.log('[DB-MIGRATION] ✅ persistent_memories.embedding converted to vector(1536)');
    }

    // Step 3: Convert document_chunks.embedding to vector(1536)
    const convertChunksSQL = `
      ALTER TABLE document_chunks
      ALTER COLUMN embedding TYPE vector(1536)
      USING embedding::vector(1536)
    `;
    results.push({ step: 'convert_document_chunks', sql: convertChunksSQL.trim() });

    if (!dryRun) {
      await client.query(convertChunksSQL);
      console.log('[DB-MIGRATION] ✅ document_chunks.embedding converted to vector(1536)');
    }

    // Step 4: Verify extension is enabled
    if (!dryRun) {
      const verifyResult = await client.query(`
        SELECT extname, extversion
        FROM pg_extension
        WHERE extname = 'vector'
      `);

      if (verifyResult.rows.length > 0) {
        results.push({
          step: 'verify',
          success: true,
          extension: verifyResult.rows[0],
        });
      }
    }

    await client.end();

    return res.status(200).json({
      success: true,
      dryRun,
      message: dryRun ? 'Dry run complete - no changes made' : 'pgvector setup complete',
      results,
    });
  } catch (error) {
    console.error('[DB-MIGRATION] pgvector setup error:', error);
    if (client) await client.end().catch(() => {});

    return res.status(500).json({
      success: false,
      error: error.message,
      results,
    });
  }
}

/**
 * Main router function
 */
export default function dbMigrationRouter(app) {
  // List all tables with metadata
  app.post('/api/admin/db-tables', migrationRateLimiter, listTables);

  // Replicate schema
  app.post('/api/admin/db-schema', migrationRateLimiter, replicateSchema);

  // Migrate data with cursor pagination
  app.post('/api/admin/db-migrate-data', migrationRateLimiter, migrateData);

  // Enable pgvector extension and convert embedding columns
  app.post('/api/admin/db-setup-vector', migrationRateLimiter, setupVector);

  console.log('[DB-MIGRATION] Migration endpoints registered');
}
