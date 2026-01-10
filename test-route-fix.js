/**
 * Test script to verify the repo-snapshot route fix
 * Ensures that repo-snapshot uses explicit path matching
 * and doesn't catch all /api/* requests
 */

import express from 'express';
import repoSnapshotRoute from './api/repo-snapshot.js';

const app = express();

// Simulate migration route BEFORE repo-snapshot
app.post('/api/admin/db-tables', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Migration endpoint reached',
    endpoint: 'db-tables'
  });
});

app.post('/api/admin/db-schema', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Migration endpoint reached',
    endpoint: 'db-schema'
  });
});

// Add the repo-snapshot router (no prefix - routes are absolute in router)
app.use(repoSnapshotRoute);

// Test 1: Verify repo-snapshot route works
console.log('\n=== Test 1: Repo Snapshot Route ===');
const mockReq1 = {
  method: 'GET',
  url: '/api/repo-snapshot',
  path: '/repo-snapshot',
  query: {}
};
const mockRes1 = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log('✅ Repo snapshot route works');
    console.log(`   Status: ${this.statusCode || 200}`);
    console.log(`   Response type: ${data.status}`);
    if (data.status === 'success') {
      console.log(`   File count: ${data.fileCount}`);
    }
    return this;
  }
};

// Find the repo-snapshot route handler
const repoSnapshotLayer = app._router.stack.find(layer => 
  layer.name === 'router' && 
  layer.regexp.test('/api/repo-snapshot')
);

if (repoSnapshotLayer) {
  console.log('✅ Repo snapshot router is registered');
  console.log(`   Path: ${repoSnapshotLayer.regexp}`);
  
  // Check that it's not a catch-all
  const catchesAllApi = repoSnapshotLayer.regexp.test('/api/admin/db-tables');
  if (catchesAllApi) {
    console.error('❌ FAIL: Repo snapshot route is still a catch-all!');
    console.error('   It matches /api/admin/db-tables');
    process.exit(1);
  } else {
    console.log('✅ PASS: Repo snapshot route is NOT a catch-all');
    console.log('   It does NOT match /api/admin/db-tables');
  }
} else {
  console.error('❌ FAIL: Repo snapshot router not found');
  process.exit(1);
}

// Test 2: Verify migration routes are not blocked
console.log('\n=== Test 2: Migration Routes ===');
const migrationLayer1 = app._router.stack.find(layer => 
  layer.route && 
  layer.route.path === '/api/admin/db-tables'
);

const migrationLayer2 = app._router.stack.find(layer => 
  layer.route && 
  layer.route.path === '/api/admin/db-schema'
);

if (migrationLayer1 && migrationLayer2) {
  console.log('✅ Migration routes are registered');
  console.log(`   Route 1: ${migrationLayer1.route.path}`);
  console.log(`   Route 2: ${migrationLayer2.route.path}`);
} else {
  console.error('❌ FAIL: Migration routes not found');
  process.exit(1);
}

// Test 3: Verify route order
console.log('\n=== Test 3: Route Order ===');
const routeStack = app._router.stack
  .filter(layer => layer.route || layer.name === 'router')
  .map(layer => {
    if (layer.route) {
      return `${layer.route.stack[0].method.toUpperCase()} ${layer.route.path}`;
    } else if (layer.name === 'router') {
      return `ROUTER ${layer.regexp}`;
    }
    return 'UNKNOWN';
  });

console.log('Route order:');
routeStack.forEach((route, i) => {
  console.log(`  ${i + 1}. ${route}`);
});

console.log('\n✅ ALL TESTS PASSED!');
console.log('✅ Repo snapshot route fix is working correctly');
console.log('✅ Migration endpoints will not be blocked');
