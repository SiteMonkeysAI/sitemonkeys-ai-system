/**
 * Admin Key Injection — Server-side injection of admin key into index.html
 * AK-001 through AK-004
 *
 * AK-001: Valid master admin key in header → master key injected
 * AK-002: Valid org admin key in header    → org key injected
 * AK-003: No key in header                → data-admin-key="" unchanged
 * AK-004: Invalid key                     → data-admin-key="" unchanged
 *
 * Run with: node --test tests/unit/adminKeyInjection.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdminKeyForInjection } from '../../api/admin/organizations.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MASTER_KEY = 'test-master-admin-key-2026';
const ORG_KEY    = 'org-acme-abcdef1234567890';

/**
 * Mock pool that recognises ORG_KEY as belonging to org id=5.
 * Does NOT recognise MASTER_KEY (it is verified via env var, not DB).
 */
const mockPool = {
  query: async (sql, params) => {
    if (sql.includes('WHERE admin_key = $1')) {
      if (params[0] === ORG_KEY) {
        return { rows: [{ id: 5, admin_key: ORG_KEY }] };
      }
      return { rows: [] };
    }
    if (sql.includes('WHERE id = $1')) {
      if (params[0] === 5) {
        return { rows: [{ admin_key: ORG_KEY }] };
      }
      return { rows: [] };
    }
    return { rows: [] };
  },
};

// ---------------------------------------------------------------------------
// Helper: simulate the HTML replacement performed in server.js
// ---------------------------------------------------------------------------
function injectKey(html, key) {
  return html.replace('data-admin-key=""', `data-admin-key="${key}"`);
}

// Minimal HTML snippet that mirrors the relevant part of index.html
const PLACEHOLDER_HTML = '<div id="savings-modal" data-admin-key="" style="display:none">';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AK. Admin Key Injection — server-side HTML injection', () => {

  it('AK-001: Valid master admin key in header → master key injected', async () => {
    const resolvedKey = await resolveAdminKeyForInjection(
      { 'x-admin-key': MASTER_KEY },
      mockPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      MASTER_KEY,
      `AK-001 FAIL: expected master key "${MASTER_KEY}", got "${resolvedKey}"`
    );

    // Verify HTML replacement produces correct output
    assert.ok(resolvedKey, 'AK-001 FAIL: resolvedKey is null — injection would not occur');
    const injected = injectKey(PLACEHOLDER_HTML, resolvedKey);
    assert.ok(
      injected.includes(`data-admin-key="${MASTER_KEY}"`),
      `AK-001 FAIL: injected HTML does not contain master key. Got: ${injected}`
    );
    assert.ok(
      !injected.includes('data-admin-key=""'),
      'AK-001 FAIL: placeholder still present after injection'
    );
  });

  it('AK-002: Valid org admin key in header → org key injected', async () => {
    const resolvedKey = await resolveAdminKeyForInjection(
      { 'x-admin-key': ORG_KEY },
      mockPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      ORG_KEY,
      `AK-002 FAIL: expected org key "${ORG_KEY}", got "${resolvedKey}"`
    );

    assert.ok(resolvedKey, 'AK-002 FAIL: resolvedKey is null — injection would not occur');
    const injected = injectKey(PLACEHOLDER_HTML, resolvedKey);
    assert.ok(
      injected.includes(`data-admin-key="${ORG_KEY}"`),
      `AK-002 FAIL: injected HTML does not contain org key. Got: ${injected}`
    );
    assert.ok(
      !injected.includes('data-admin-key=""'),
      'AK-002 FAIL: placeholder still present after injection'
    );
    // Confirm master key is NOT injected for org user
    assert.ok(
      !injected.includes(`data-admin-key="${MASTER_KEY}"`),
      'AK-002 FAIL: master key must never be injected for org users'
    );
  });

  it('AK-003: No key in header → data-admin-key="" unchanged', async () => {
    const resolvedKey = await resolveAdminKeyForInjection(
      {},        // no headers
      mockPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      null,
      `AK-003 FAIL: expected null (no injection), got "${resolvedKey}"`
    );

    // HTML must remain unchanged
    const html = PLACEHOLDER_HTML;
    assert.ok(
      html.includes('data-admin-key=""'),
      'AK-003 FAIL: placeholder should remain when no key provided'
    );
  });

  it('AK-004: Invalid key → data-admin-key="" unchanged', async () => {
    const resolvedKey = await resolveAdminKeyForInjection(
      { 'x-admin-key': 'totally-wrong-key-xyz' },
      mockPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      null,
      `AK-004 FAIL: expected null for invalid key, got "${resolvedKey}"`
    );

    // HTML must remain unchanged
    const html = PLACEHOLDER_HTML;
    assert.ok(
      html.includes('data-admin-key=""'),
      'AK-004 FAIL: placeholder should remain when key is invalid'
    );
  });

  it('AK-005: Org user cannot receive master key via x-org-id lookup', async () => {
    // Edge-case: if an org row somehow stored the master key value,
    // the injection logic must refuse to inject it.
    const trickPool = {
      query: async (sql, params) => {
        if (sql.includes('WHERE id = $1') && params[0] === 99) {
          // Simulate a misconfigured org whose admin_key equals the master key
          return { rows: [{ admin_key: MASTER_KEY }] };
        }
        return { rows: [] };
      },
    };

    const resolvedKey = await resolveAdminKeyForInjection(
      { 'x-org-id': '99' },
      trickPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      null,
      'AK-005 FAIL: master key must never be returned via x-org-id lookup'
    );
  });

  it('AK-006: x-org-id with valid org → org key injected', async () => {
    // Pool returns org key for org id=5
    const resolvedKey = await resolveAdminKeyForInjection(
      { 'x-org-id': '5' },
      mockPool,
      MASTER_KEY
    );

    assert.strictEqual(
      resolvedKey,
      ORG_KEY,
      `AK-006 FAIL: expected org key "${ORG_KEY}" via x-org-id, got "${resolvedKey}"`
    );
  });

  it('AK-007: server.js imports resolveAdminKeyForInjection', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('resolveAdminKeyForInjection'),
      'AK-007 FAIL: resolveAdminKeyForInjection not imported/used in server.js'
    );
    assert.ok(
      src.includes("data-admin-key=\"\""),
      'AK-007 FAIL: HTML placeholder replacement string not found in server.js'
    );
  });

});
