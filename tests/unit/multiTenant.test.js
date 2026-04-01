/**
 * Multi-Tenant Organization Layer — Foundation Tests
 * MT-001 through MT-007
 *
 * MT-001: organizations table created with correct schema
 * MT-002: default org_id=1 when no org headers present
 * MT-003: org_id resolved from x-admin-key header correctly
 * MT-004: cost summary filtered by org_id when org key provided
 * MT-005: persistent_memories has org_id column defaulting to 1
 * MT-006: query_cost_log has org_id column defaulting to 1
 * MT-007: POST /api/admin/organizations creates new org correctly
 *
 * Run with: node --test tests/unit/multiTenant.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOrgId } from '../../api/admin/organizations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  const fullPath = join(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

describe('MT. Multi-Tenant Organization Layer', () => {

  it('MT-001: organizations table created with correct schema', () => {
    const src = readRepoFile('api/admin/organizations.js');
    assert.ok(src, 'MT-001 FAIL: Could not read api/admin/organizations.js');

    assert.ok(
      src.includes('CREATE TABLE IF NOT EXISTS organizations'),
      'MT-001 FAIL: organizations table DDL not found'
    );
    assert.ok(
      src.includes('CREATE TABLE IF NOT EXISTS organization_users'),
      'MT-001 FAIL: organization_users table DDL not found'
    );
    assert.ok(
      src.includes("slug VARCHAR(100) UNIQUE NOT NULL"),
      'MT-001 FAIL: slug column not found in organizations schema'
    );
    assert.ok(
      src.includes("admin_key VARCHAR(255) UNIQUE NOT NULL"),
      'MT-001 FAIL: admin_key column not found in organizations schema'
    );
    assert.ok(
      src.includes("is_system BOOLEAN DEFAULT false"),
      'MT-001 FAIL: is_system column not found in organizations schema'
    );
    assert.ok(
      src.includes("UNIQUE(org_id, user_id)"),
      'MT-001 FAIL: unique constraint not found in organization_users schema'
    );
    assert.ok(
      src.includes("sm-admin-2026-xyz"),
      'MT-001 FAIL: default SiteMonkeys org seed INSERT not found'
    );
  });

  it('MT-002: default org_id=1 when no org headers present', async () => {
    const result = await resolveOrgId({}, null);
    assert.strictEqual(result, 1, `MT-002 FAIL: expected org_id=1 with empty headers, got ${result}`);
  });

  it('MT-002b: default org_id=1 when pool is unavailable', async () => {
    const result = await resolveOrgId({ 'x-admin-key': 'some-key' }, null);
    assert.strictEqual(result, 1, `MT-002b FAIL: expected org_id=1 when pool is null, got ${result}`);
  });

  it('MT-002c: x-org-id header is respected when provided', async () => {
    const result = await resolveOrgId({ 'x-org-id': '7' }, null);
    assert.strictEqual(result, 7, `MT-002c FAIL: expected org_id=7 from x-org-id header, got ${result}`);
  });

  it('MT-003: org_id resolved from x-admin-key header correctly', async () => {
    // Mock pool that simulates the SiteMonkeys org (id=1) being found
    const mockPool = {
      query: async (sql, params) => {
        if (sql.includes('WHERE admin_key = $1') && params[0] === 'sm-admin-2026-xyz') {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      }
    };

    const result = await resolveOrgId({ 'x-admin-key': 'sm-admin-2026-xyz' }, mockPool);
    assert.strictEqual(result, 1, `MT-003 FAIL: expected org_id=1 for sm-admin-2026-xyz, got ${result}`);
  });

  it('MT-003b: org_id resolved for a different org admin key', async () => {
    // Mock pool that simulates a custom org (id=5)
    const mockPool = {
      query: async (sql, params) => {
        if (sql.includes('WHERE admin_key = $1') && params[0] === 'org-acme-key') {
          return { rows: [{ id: 5 }] };
        }
        return { rows: [] };
      }
    };

    const result = await resolveOrgId({ 'x-admin-key': 'org-acme-key' }, mockPool);
    assert.strictEqual(result, 5, `MT-003b FAIL: expected org_id=5 for org-acme-key, got ${result}`);
  });

  it('MT-003c: unknown admin key defaults to org_id=1', async () => {
    const mockPool = {
      query: async () => ({ rows: [] }) // no match
    };

    const result = await resolveOrgId({ 'x-admin-key': 'unknown-key' }, mockPool);
    assert.strictEqual(result, 1, `MT-003c FAIL: expected org_id=1 for unknown key, got ${result}`);
  });

  it('MT-004: cost summary handler accepts org admin key and applies org filter', () => {
    const src = readRepoFile('api/admin/cost-observability.js');
    assert.ok(src, 'MT-004 FAIL: Could not read api/admin/cost-observability.js');

    assert.ok(
      src.includes('isMasterAdmin'),
      'MT-004 FAIL: isMasterAdmin check not found in cost-observability.js'
    );
    assert.ok(
      src.includes('orgId'),
      'MT-004 FAIL: orgId variable not found in handleCostSummary'
    );
    assert.ok(
      src.includes('orgPlaceholder') || src.includes('orgFilter'),
      'MT-004 FAIL: org filter variable not found — org_id filtering not implemented'
    );
    assert.ok(
      src.includes("WHERE admin_key = $1"),
      'MT-004 FAIL: org lookup by admin_key not found in handleCostSummary'
    );
  });

  it('MT-005: persistent_memories has org_id column defaulting to 1', () => {
    const src = readRepoFile('api/admin/organizations.js');
    assert.ok(src, 'MT-005 FAIL: Could not read api/admin/organizations.js');

    assert.ok(
      src.includes('ALTER TABLE persistent_memories') &&
      src.includes('ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1'),
      'MT-005 FAIL: ALTER TABLE persistent_memories org_id migration not found'
    );
  });

  it('MT-006: query_cost_log has org_id column defaulting to 1', () => {
    const costSrc = readRepoFile('api/admin/cost-observability.js');
    assert.ok(costSrc, 'MT-006 FAIL: Could not read api/admin/cost-observability.js');

    assert.ok(
      costSrc.includes('ALTER TABLE query_cost_log') &&
      costSrc.includes('ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1'),
      'MT-006 FAIL: ALTER TABLE query_cost_log org_id migration not found in cost-observability.js'
    );

    // Also verify the main cost log INSERT includes org_id
    const orchSrc = readRepoFile('api/core/orchestrator.js');
    assert.ok(orchSrc, 'MT-006 FAIL: Could not read api/core/orchestrator.js');

    assert.ok(
      orchSrc.includes('org_id = 1') || orchSrc.includes('orgId = 1') || orchSrc.includes('_orgId || 1'),
      'MT-006 FAIL: org_id default value not found in orchestrator.js cost log inserts'
    );
  });

  it('MT-007: POST /api/admin/organizations creates new org correctly', async () => {
    // Mock pool that simulates a successful INSERT
    const createdOrg = {
      id: 42,
      name: 'Acme Corp',
      slug: 'acme',
      admin_key: 'org-acme-1234567890-abc123',
      plan: 'enterprise',
      created_at: new Date().toISOString(),
    };
    const mockPool = {
      query: async (sql) => {
        if (sql.includes('INSERT INTO organizations')) {
          return { rows: [createdOrg] };
        }
        return { rows: [] };
      }
    };

    // Temporarily set global.memorySystem for the handler
    const originalMemorySystem = global.memorySystem;
    const originalAdminKey = process.env.ADMIN_KEY;
    global.memorySystem = { pool: mockPool };
    process.env.ADMIN_KEY = 'test-master-key';

    try {
      const { handleCreateOrg } = await import('../../api/admin/organizations.js');

      let statusCode = null;
      let responseBody = null;

      const mockReq = {
        headers: { 'x-admin-key': 'test-master-key' },
        body: { name: 'Acme Corp', slug: 'acme', plan: 'enterprise' },
      };
      const mockRes = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; },
      };

      await handleCreateOrg(mockReq, mockRes);

      assert.strictEqual(statusCode, 201, `MT-007 FAIL: expected status 201, got ${statusCode}`);
      assert.ok(responseBody?.success, 'MT-007 FAIL: response.success not true');
      assert.strictEqual(responseBody?.org_id, 42, `MT-007 FAIL: expected org_id=42, got ${responseBody?.org_id}`);
      assert.strictEqual(responseBody?.slug, 'acme', `MT-007 FAIL: expected slug=acme, got ${responseBody?.slug}`);
      assert.ok(responseBody?.admin_key, 'MT-007 FAIL: admin_key missing from response');
    } finally {
      global.memorySystem = originalMemorySystem;
      if (originalAdminKey === undefined) {
        delete process.env.ADMIN_KEY;
      } else {
        process.env.ADMIN_KEY = originalAdminKey;
      }
    }
  });

  it('MT-007b: POST /api/admin/organizations rejects missing required fields', async () => {
    const originalAdminKey = process.env.ADMIN_KEY;
    process.env.ADMIN_KEY = 'test-master-key';

    try {
      const { handleCreateOrg } = await import('../../api/admin/organizations.js');

      let statusCode = null;
      let responseBody = null;

      const mockReq = {
        headers: { 'x-admin-key': 'test-master-key' },
        body: { name: 'Missing Slug Only' }, // no slug
      };
      const mockRes = {
        status(code) { statusCode = code; return this; },
        json(body) { responseBody = body; return this; },
      };

      await handleCreateOrg(mockReq, mockRes);

      assert.strictEqual(statusCode, 400, `MT-007b FAIL: expected status 400, got ${statusCode}`);
      assert.ok(responseBody?.error, 'MT-007b FAIL: error message missing');
    } finally {
      if (originalAdminKey === undefined) {
        delete process.env.ADMIN_KEY;
      } else {
        process.env.ADMIN_KEY = originalAdminKey;
      }
    }
  });

  it('MT-007c: POST /api/admin/organizations rejects unauthorized requests', async () => {
    const { handleCreateOrg } = await import('../../api/admin/organizations.js');

    let statusCode = null;

    const mockReq = {
      headers: { 'x-admin-key': 'wrong-key' },
      body: { name: 'Hacker Corp', slug: 'hacker' },
    };
    const mockRes = {
      status(code) { statusCode = code; return this; },
      json() { return this; },
    };

    process.env.ADMIN_KEY = 'correct-key';
    await handleCreateOrg(mockReq, mockRes);

    assert.strictEqual(statusCode, 403, `MT-007c FAIL: expected status 403, got ${statusCode}`);
  });

  it('MT-008: server.js passes orgId to orchestrator.processRequest', () => {
    const src = readRepoFile('server.js');
    assert.ok(src, 'MT-008 FAIL: Could not read server.js');

    assert.ok(
      src.includes('resolveOrgId'),
      'MT-008 FAIL: resolveOrgId not found in server.js'
    );
    assert.ok(
      src.includes('orgId, // Multi-tenant org isolation') ||
      src.includes('orgId,'),
      'MT-008 FAIL: orgId not passed to orchestrator.processRequest in server.js'
    );
  });

});
