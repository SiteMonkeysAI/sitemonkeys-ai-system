/**
 * SQL Migration Runner
 * ====================
 * Executes a SQL file from the sql/ directory against the DATABASE_URL.
 * Requires no psql installation — uses the same pg driver the app already uses.
 *
 * Usage:
 *   DATABASE_URL="<url>" node scripts/run-sql-migration.js <filename>
 *
 * Or via npm scripts defined in package.json:
 *   DATABASE_URL="<url>" npm run migrate:cap-scores
 *
 * The DATABASE_URL is available in your Railway project under:
 *   Variables → DATABASE_URL
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const filename = process.argv[2];

if (!filename) {
  console.error('Usage: node scripts/run-sql-migration.js <sql-filename>');
  console.error('Example: node scripts/run-sql-migration.js cap_non_health_relevance_scores.sql');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL environment variable is not set.');
  console.error('');
  console.error('Set it to your Railway PostgreSQL connection string:');
  console.error('  DATABASE_URL="postgresql://user:pass@host/db" npm run migrate:cap-scores');
  process.exit(1);
}

const sqlPath = join(REPO_ROOT, 'sql', filename);
let sql;
try {
  sql = readFileSync(sqlPath, 'utf8');
} catch (err) {
  console.error(`❌ Could not read sql/${filename}: ${err.message}`);
  process.exit(1);
}

// Strip comment-only lines for the preview so the user sees the actual SQL
const sqlPreview = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
  .join('\n')
  .substring(0, 300);

console.log(`[MIGRATION] Running sql/${filename} against DATABASE_URL...`);
console.log('[MIGRATION] SQL preview:');
console.log(sqlPreview);
console.log('...');
console.log('');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

let client;
try {
  client = await pool.connect();

  // Run inside a transaction so the file is all-or-nothing
  await client.query('BEGIN');
  const result = await client.query(sql);
  await client.query('COMMIT');

  const rowsAffected = Array.isArray(result)
    ? result.reduce((sum, r) => sum + (r.rowCount || 0), 0)
    : (result.rowCount || 0);

  console.log(`[MIGRATION] ✅ Done. Rows affected: ${rowsAffected}`);
  console.log('[MIGRATION] Migration completed successfully.');
} catch (err) {
  if (client) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
  }
  console.error(`[MIGRATION] ❌ Migration failed: ${err.message}`);
  process.exit(1);
} finally {
  if (client) client.release();
  await pool.end();
}
