/**
 * Test to verify the actual issue: GET requests to migration endpoints
 */

import express from 'express';
import http from 'http';

// Simulate OLD repo-snapshot handler (plain function that responds to all methods)
const oldHandler = async function handler(req, res) {
  res.json({ 
    status: 'success',
    message: 'Repo snapshot response (OLD HANDLER)',
    path: req.path,
    method: req.method
  });
};

// Simulate NEW repo-snapshot handler (Router with GET specific)
import { Router } from 'express';
const newRouter = Router();
newRouter.get('/api/repo-snapshot', async (req, res) => {
  res.json({ 
    status: 'success',
    message: 'Repo snapshot response (NEW HANDLER)',
    path: req.path 
  });
});

console.log('=== Testing GET request to /api/admin/db-tables ===\n');

// Test OLD behavior
const oldApp = express();
oldApp.post('/api/admin/db-tables', (req, res) => {
  res.json({ success: true, endpoint: 'migration-POST' });
});
oldApp.get('/api/admin/db-tables', (req, res) => {
  res.json({ success: true, endpoint: 'migration-GET' });
});
oldApp.use('/api', oldHandler); // OLD STYLE mounted AFTER specific routes

const oldServer = oldApp.listen(0, () => {
  const port = oldServer.address().port;
  
  // Test GET request
  const req1 = http.request({
    hostname: 'localhost',
    port: port,
    path: '/api/admin/db-tables',
    method: 'GET'
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      console.log('OLD behavior - GET /api/admin/db-tables:');
      if (json.endpoint === 'migration-GET') {
        console.log('✅ Reached migration GET handler');
      } else if (json.status === 'success' && json.message.includes('Repo snapshot')) {
        console.log('❌ BLOCKED by repo snapshot handler!');
      }
      console.log(`   Response: ${JSON.stringify(json)}\n`);
      oldServer.close();
      
      // Test NEW behavior
      testNewBehavior();
    });
  });
  
  req1.end();
});

function testNewBehavior() {
  const newApp = express();
  newApp.post('/api/admin/db-tables', (req, res) => {
    res.json({ success: true, endpoint: 'migration-POST' });
  });
  newApp.get('/api/admin/db-tables', (req, res) => {
    res.json({ success: true, endpoint: 'migration-GET' });
  });
  newApp.use(newRouter); // NEW STYLE
  
  const newServer = newApp.listen(0, () => {
    const port = newServer.address().port;
    
    // Test GET request
    const req2 = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/admin/db-tables',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        console.log('NEW behavior - GET /api/admin/db-tables:');
        if (json.endpoint === 'migration-GET') {
          console.log('✅ Reached migration GET handler');
        } else if (json.status === 'success' && json.message.includes('Repo snapshot')) {
          console.log('❌ BLOCKED by repo snapshot handler!');
        }
        console.log(`   Response: ${JSON.stringify(json)}\n`);
        newServer.close();
        
        console.log('✅ Test complete!');
      });
    });
    
    req2.end();
  });
}
