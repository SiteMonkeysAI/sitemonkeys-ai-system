/**
 * Test script to verify the repo-snapshot route fix - Version 2
 * More detailed debugging of the route matching
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

// Add the repo-snapshot router
app.use(repoSnapshotRoute);

console.log('\n=== Analyzing Route Configuration ===\n');

// Examine all layers in the router stack
app._router.stack.forEach((layer, index) => {
  if (layer.route) {
    // This is a route
    const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
    console.log(`${index}. ROUTE: ${methods} ${layer.route.path}`);
  } else if (layer.name === 'router') {
    // This is a mounted router
    console.log(`${index}. ROUTER: ${layer.regexp}`);
    
    // Check what this router contains
    if (layer.handle && layer.handle.stack) {
      layer.handle.stack.forEach((subLayer, subIndex) => {
        if (subLayer.route) {
          const methods = Object.keys(subLayer.route.methods).join(',').toUpperCase();
          console.log(`   ${index}.${subIndex}. SUBROUTE: ${methods} ${subLayer.route.path}`);
          
          // Check if this is the repo-snapshot route
          if (subLayer.route.path === '/api/repo-snapshot') {
            console.log('      ✅ Found /api/repo-snapshot route');
          }
        }
      });
    }
    
    // Test what paths this router matches
    const testPaths = [
      '/api/repo-snapshot',
      '/api/admin/db-tables',
      '/api/test',
      '/health'
    ];
    
    console.log('   Testing regex match:');
    testPaths.forEach(path => {
      const matches = layer.regexp.test(path);
      console.log(`      ${path}: ${matches ? '✅ MATCHES' : '❌ No match'}`);
    });
  }
});

// Now test the actual behavior
console.log('\n=== Testing Actual Routing Behavior ===\n');

// Create test server
const testApp = express();
testApp.post('/api/admin/db-tables', (req, res) => {
  res.json({ endpoint: 'migration' });
});
testApp.use(repoSnapshotRoute);

// Simulate requests
import http from 'http';

const server = testApp.listen(0, () => {
  const port = server.address().port;
  console.log(`Test server started on port ${port}\n`);
  
  // Test 1: POST to migration endpoint
  const req1 = http.request({
    hostname: 'localhost',
    port: port,
    path: '/api/admin/db-tables',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        const json = JSON.parse(data);
        if (json.endpoint === 'migration') {
          console.log('✅ Test 1 PASSED: POST /api/admin/db-tables reached migration handler');
        } else {
          console.log('❌ Test 1 FAILED: Wrong handler reached');
          console.log('   Response:', json);
        }
      } else {
        console.log(`❌ Test 1 FAILED: Status ${res.statusCode}`);
      }
      
      // Test 2: GET to repo-snapshot
      const req2 = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/repo-snapshot',
        method: 'GET'
      }, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', () => {
          if (res2.statusCode === 200) {
            const json2 = JSON.parse(data2);
            if (json2.status === 'success') {
              console.log('✅ Test 2 PASSED: GET /api/repo-snapshot works');
              console.log(`   File count: ${json2.fileCount}`);
            } else {
              console.log('❌ Test 2 FAILED: Wrong response');
            }
          } else {
            console.log(`❌ Test 2 FAILED: Status ${res2.statusCode}`);
          }
          
          server.close();
          console.log('\n✅ All tests completed');
        });
      });
      
      req2.on('error', err => {
        console.error('❌ Test 2 request error:', err.message);
        server.close();
      });
      
      req2.end();
    });
  });
  
  req1.on('error', err => {
    console.error('❌ Test 1 request error:', err.message);
    server.close();
  });
  
  req1.end();
});
