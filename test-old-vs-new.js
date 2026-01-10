/**
 * Test to demonstrate the OLD problematic behavior
 */

import express from 'express';

// Simulate OLD repo-snapshot handler (plain function)
const oldHandler = async function handler(req, res) {
  res.json({ 
    message: 'OLD HANDLER - Catches everything!',
    path: req.path 
  });
};

// Simulate NEW repo-snapshot handler (Router)
import { Router } from 'express';
const newRouter = Router();
newRouter.get('/api/repo-snapshot', async (req, res) => {
  res.json({ 
    message: 'NEW HANDLER - Specific route only',
    path: req.path 
  });
});

console.log('=== Testing OLD Behavior (Plain Function Handler) ===\n');

const oldApp = express();
oldApp.post('/api/admin/db-tables', (req, res) => {
  res.json({ endpoint: 'migration' });
});
oldApp.use('/api', oldHandler); // OLD STYLE - function handler

import http from 'http';

const oldServer = oldApp.listen(0, () => {
  const port = oldServer.address().port;
  
  // Test POST to migration endpoint
  const req1 = http.request({
    hostname: 'localhost',
    port: port,
    path: '/api/admin/db-tables',
    method: 'POST'
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const json = JSON.parse(data);
      if (json.endpoint === 'migration') {
        console.log('✅ OLD: Migration endpoint reached correctly');
      } else {
        console.log('❌ OLD: Migration endpoint BLOCKED by repo-snapshot handler!');
        console.log('   Response:', json);
      }
      oldServer.close();
      
      // Now test NEW behavior
      testNewBehavior();
    });
  });
  
  req1.end();
});

function testNewBehavior() {
  console.log('\n=== Testing NEW Behavior (Router with Specific Route) ===\n');
  
  const newApp = express();
  newApp.post('/api/admin/db-tables', (req, res) => {
    res.json({ endpoint: 'migration' });
  });
  newApp.use(newRouter); // NEW STYLE - router with specific route
  
  const newServer = newApp.listen(0, () => {
    const port = newServer.address().port;
    
    // Test POST to migration endpoint
    const req2 = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/admin/db-tables',
      method: 'POST'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.endpoint === 'migration') {
          console.log('✅ NEW: Migration endpoint reached correctly');
        } else {
          console.log('❌ NEW: Migration endpoint blocked (this should not happen)');
          console.log('   Response:', json);
        }
        newServer.close();
        
        console.log('\n✅ Verification complete!');
        console.log('   OLD style would catch all /api/* requests');
        console.log('   NEW style only handles /api/repo-snapshot');
      });
    });
    
    req2.end();
  });
}
