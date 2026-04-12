import { randomBytes } from 'node:crypto';

/**
 * Multi-tenant organization layer — Phase 1 database and API foundation
 *
 * Provides:
 * - createOrganizationTables(pool) — idempotent DDL for organizations + organization_users
 * - ensureOrganizationTables(pool) — startup hook (never throws)
 * - resolveOrgId(headers, pool)    — resolves org_id from request headers
 * - resolveAdminKeyForInjection(headers, pool) — resolves the key to inject into HTML (never exposes master key to org users)
 * - handleCreateOrg(req, res)      — POST /api/admin/organizations
 * - handleListOrgs(req, res)       — GET  /api/admin/organizations
 * - handleGetOrg(req, res)         — GET  /api/admin/organizations/:slug
 */

/**
 * Idempotently create the organizations and organization_users tables,
 * insert the default SiteMonkeys org (org_id = 1), and add org_id
 * columns to existing tables.
 * Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS
 * and ADD COLUMN IF NOT EXISTS.
 * @param {import('pg').Pool} pool
 */
export async function createOrganizationTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      admin_key VARCHAR(255) UNIQUE NOT NULL,
      api_key_hash VARCHAR(255),
      plan VARCHAR(50) DEFAULT 'enterprise',
      is_active BOOLEAN DEFAULT true,
      is_system BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_users (
      id SERIAL PRIMARY KEY,
      org_id INTEGER REFERENCES organizations(id),
      user_id VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, user_id)
    )
  `);

  // Default SiteMonkeys org must be id = 1; use sequence reset to guarantee it
  // when the table is brand-new.
  await pool.query(`
    INSERT INTO organizations (name, slug, admin_key, is_system)
    VALUES ('SiteMonkeys', 'sitemonkeys', 'sm-admin-2026-xyz', true)
    ON CONFLICT DO NOTHING
  `);

  // Add org_id to persistent_memories (default to SiteMonkeys org)
  await pool.query(`
    ALTER TABLE persistent_memories
    ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1
  `);

  // Add org_id to query_cost_log (default to SiteMonkeys org)
  await pool.query(`
    ALTER TABLE query_cost_log
    ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1
  `);

  // Add org_id to session_memories if that table exists
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'session_memories'
      ) THEN
        EXECUTE 'ALTER TABLE session_memories ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1';
      END IF;
    END $$
  `);
}

/**
 * Ensure organization tables exist. Runs once at startup; logs but never throws.
 * @param {import('pg').Pool} pool
 */
export async function ensureOrganizationTables(pool) {
  try {
    await createOrganizationTables(pool);
    console.log('[ORG] Organization tables ready');
  } catch (err) {
    console.error('[ORG] Failed to create organization tables:', err.message);
  }
}

/**
 * Resolve org_id from request headers.
 * Priority:
 *   1. x-org-id header (parsed as integer)
 *   2. x-admin-key header → look up org in organizations table
 *   3. Default: 1 (SiteMonkeys)
 *
 * @param {Object} headers - Request headers object
 * @param {import('pg').Pool|null} pool - Database pool
 * @returns {Promise<number>} Resolved org_id
 */
export async function resolveOrgId(headers, pool) {
  // 1. x-org-id header
  const orgIdHeader = headers['x-org-id'];
  if (orgIdHeader) {
    const parsed = parseInt(orgIdHeader, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 2. x-admin-key header → look up org in database
  const adminKey = headers['x-admin-key'];
  if (adminKey && pool) {
    try {
      const result = await pool.query(
        'SELECT id FROM organizations WHERE admin_key = $1 AND is_active = true',
        [adminKey],
      );
      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    } catch (err) {
      console.error('[ORG] Failed to resolve org by admin_key:', err.message);
    }
  }

  // 3. Default to SiteMonkeys
  return 1;
}

/**
 * Resolve the admin key that should be injected into index.html for the
 * savings dashboard monthly history chart.
 *
 * Security rules:
 *   - Master admin key (ADMIN_KEY env var) → inject it as-is (master user)
 *   - Org-level admin key (x-admin-key matching an org row) → inject that org's key
 *   - x-org-id header (no admin key) → look up and inject that org's admin_key
 *   - No valid key in headers → return null (serve HTML unchanged)
 *   - NEVER inject the master admin key for an org-level user
 *
 * @param {Object} headers - Request headers object
 * @param {import('pg').Pool|null} pool - Database pool
 * @param {string|undefined} masterAdminKey - Value of ADMIN_KEY env var
 * @returns {Promise<string|null>} Key to inject, or null if none
 */
export async function resolveAdminKeyForInjection(headers, pool, masterAdminKey) {
  const headerKey = headers['x-admin-key'];
  const orgIdHeader = headers['x-org-id'];

  // 1. x-admin-key provided
  if (headerKey) {
    // Master admin key → inject directly
    if (masterAdminKey && headerKey === masterAdminKey) {
      return headerKey;
    }

    // Org-level key → verify it exists and return it
    if (pool) {
      try {
        const result = await pool.query(
          'SELECT admin_key FROM organizations WHERE admin_key = $1 AND is_active = true',
          [headerKey],
        );
        if (result.rows.length > 0) {
          return result.rows[0].admin_key;
        }
      } catch (err) {
        console.error('[ORG] resolveAdminKeyForInjection: lookup failed:', err.message);
      }
    }

    // Key not recognised — do not inject
    return null;
  }

  // 2. x-org-id header → look up that org's admin_key
  if (orgIdHeader && pool) {
    const parsed = parseInt(orgIdHeader, 10);
    if (!isNaN(parsed) && parsed > 0) {
      try {
        const result = await pool.query(
          'SELECT admin_key FROM organizations WHERE id = $1 AND is_active = true',
          [parsed],
        );
        if (result.rows.length > 0) {
          const orgKey = result.rows[0].admin_key;
          // Never inject the master key via org-id lookup
          if (masterAdminKey && orgKey === masterAdminKey) {
            return null;
          }
          return orgKey;
        }
      } catch (err) {
        console.error('[ORG] resolveAdminKeyForInjection: org-id lookup failed:', err.message);
      }
    }
  }

  // 3. No valid key
  return null;
}

/**
 * POST /api/admin/organizations
 * Create a new organization. Requires master admin key (ADMIN_KEY env var).
 * Returns org_id and admin_key for the new organization.
 */
export async function handleCreateOrg(req, res) {
  const adminKey =
    req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { name, slug, plan = 'enterprise' } = req.body || {};
  if (!name || !slug) {
    return res.status(400).json({ error: 'name and slug are required' });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: 'slug must be lowercase alphanumeric with hyphens only',
    });
  }

  try {
    const pool = global.memorySystem?.pool;
    if (!pool) {
      return res.status(503).json({ error: 'Database pool not available' });
    }

    const orgAdminKey = `org-${slug}-${randomBytes(16).toString('hex')}`;

    const result = await pool.query(
      `INSERT INTO organizations (name, slug, admin_key, plan)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, admin_key, plan, created_at`,
      [name, slug, orgAdminKey, plan],
    );

    const org = result.rows[0];
    console.log(`[ORG] Created organization: ${org.name} (id=${org.id})`);

    return res.status(201).json({
      success: true,
      org_id: org.id,
      name: org.name,
      slug: org.slug,
      admin_key: org.admin_key,
      plan: org.plan,
      created_at: org.created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Organization slug already exists' });
    }
    console.error('[ORG] Failed to create organization:', err.message);
    return res.status(500).json({ error: 'Failed to create organization', message: err.message });
  }
}

/**
 * GET /api/admin/organizations
 * List all organizations with user count and cost totals.
 * Requires master admin key.
 */
export async function handleListOrgs(req, res) {
  const adminKey =
    req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const pool = global.memorySystem?.pool;
    if (!pool) {
      return res.status(503).json({ error: 'Database pool not available' });
    }

    const result = await pool.query(`
      SELECT
        o.id,
        o.name,
        o.slug,
        o.plan,
        o.is_active,
        o.is_system,
        o.created_at,
        COUNT(DISTINCT ou.user_id) AS user_count,
        COALESCE(SUM(qcl.cost_usd), 0)::DECIMAL(10,4) AS total_cost_usd
      FROM organizations o
      LEFT JOIN organization_users ou ON ou.org_id = o.id
      LEFT JOIN query_cost_log qcl ON qcl.org_id = o.id
      GROUP BY o.id, o.name, o.slug, o.plan, o.is_active, o.is_system, o.created_at
      ORDER BY o.id ASC
    `);

    return res.json({
      success: true,
      organizations: result.rows,
    });
  } catch (err) {
    console.error('[ORG] Failed to list organizations:', err.message);
    return res.status(500).json({ error: 'Query failed', message: err.message });
  }
}

/**
 * GET /api/admin/organizations/:slug
 * Get single org details.
 * Requires master admin key OR that org's own admin_key.
 */
export async function handleGetOrg(req, res) {
  const adminKey =
    req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!adminKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const pool = global.memorySystem?.pool;
    if (!pool) {
      return res.status(503).json({ error: 'Database pool not available' });
    }

    const { slug } = req.params;
    const isMasterAdmin = adminKey === process.env.ADMIN_KEY;

    const orgResult = await pool.query('SELECT * FROM organizations WHERE slug = $1', [slug]);

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgResult.rows[0];

    if (!isMasterAdmin && adminKey !== org.admin_key) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const statsResult = await pool.query(
      `
      SELECT
        COUNT(DISTINCT ou.user_id) AS user_count,
        COALESCE(SUM(qcl.cost_usd), 0)::DECIMAL(10,4) AS total_cost_usd
      FROM organizations o
      LEFT JOIN organization_users ou ON ou.org_id = o.id
      LEFT JOIN query_cost_log qcl ON qcl.org_id = o.id
      WHERE o.id = $1
      GROUP BY o.id
    `,
      [org.id],
    );

    const stats = statsResult.rows[0] || { user_count: 0, total_cost_usd: 0 };

    return res.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        is_active: org.is_active,
        is_system: org.is_system,
        created_at: org.created_at,
        user_count: parseInt(stats.user_count, 10),
        total_cost_usd: stats.total_cost_usd,
      },
    });
  } catch (err) {
    console.error('[ORG] Failed to get organization:', err.message);
    return res.status(500).json({ error: 'Query failed', message: err.message });
  }
}
