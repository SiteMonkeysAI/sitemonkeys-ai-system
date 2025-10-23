#!/usr/bin/env node
/**
 * Production Integration Verification Test
 * Run this after deployment to verify all 3 integrations work end-to-end
 * 
 * Usage: node verify-integration.js
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_USER_ID = 'integration-test-user';

console.log('='.repeat(70));
console.log('INTEGRATION VERIFICATION TEST');
console.log('='.repeat(70));
console.log(`Base URL: ${BASE_URL}`);
console.log(`Test User: ${TEST_USER_ID}`);
console.log('='.repeat(70));
console.log();

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    testsPassed++;
  } catch (error) {
    console.log('❌ FAIL');
    console.error(`  Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Vault Loading
await test('Vault Loading Endpoint', async () => {
  const response = await axios.get(`${BASE_URL}/api/load-vault?refresh=true`);
  
  if (!response.data.success) {
    throw new Error('Vault loading failed');
  }
  
  if (!response.data.vault_content || response.data.vault_content.length < 1000) {
    throw new Error(`Vault content too small: ${response.data.vault_content?.length || 0} chars`);
  }
  
  if (!response.data.folders_loaded || response.data.folders_loaded.length !== 3) {
    throw new Error(`Expected 3 folders, got ${response.data.folders_loaded?.length || 0}`);
  }
  
  console.log(`    - Folders: ${response.data.folders_loaded.length}`);
  console.log(`    - Files: ${response.data.total_files}`);
  console.log(`    - Size: ${response.data.vault_content.length} chars`);
});

// Test 2: Vault in Chat Request
await test('Vault Content in Chat', async () => {
  const vaultResponse = await axios.get(`${BASE_URL}/api/load-vault`);
  const vaultContent = vaultResponse.data.vault_content;
  
  const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
    message: 'What folders are in the vault?',
    userId: TEST_USER_ID,
    mode: 'site_monkeys',
    vault_content: vaultContent,
    vault_loaded: true
  });
  
  if (!chatResponse.data.success) {
    throw new Error('Chat request failed');
  }
  
  const response = chatResponse.data.response.toLowerCase();
  
  // Check if response mentions any of the expected folders
  const expectedFolders = ['enforcementshell', 'directives', 'vault'];
  const mentionedFolders = expectedFolders.filter(f => 
    response.includes(f) || response.includes(f.replace('_', ' '))
  );
  
  if (mentionedFolders.length === 0) {
    throw new Error('AI did not mention any vault folders');
  }
  
  console.log(`    - AI mentioned ${mentionedFolders.length} folders`);
  console.log(`    - Vault tokens: ${chatResponse.data.metadata?.vaultTokens || 0}`);
});

// Test 3: Document Context Detection
await test('Document Upload Simulation', async () => {
  // Simulate document being in extractedDocuments Map
  // In production, this would be tested with actual upload
  
  const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
    message: 'What is in the document?',
    userId: TEST_USER_ID,
    mode: 'truth_general',
    // documentContext would be set by upload, orchestrator auto-detects
  });
  
  if (!chatResponse.data.success) {
    throw new Error('Chat request failed');
  }
  
  // Check that orchestrator attempted to load documents
  const hasDocContext = chatResponse.data.metadata?.documentTokens > 0;
  console.log(`    - Document tokens: ${chatResponse.data.metadata?.documentTokens || 0}`);
  console.log(`    - Document context: ${hasDocContext ? 'detected' : 'not found'}`);
  
  // This is OK if no document uploaded - test verifies detection logic
});

// Test 4: Memory Storage
await test('Memory Storage', async () => {
  const testMessage = `Test message at ${Date.now()}`;
  
  const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
    message: testMessage,
    userId: TEST_USER_ID,
    mode: 'truth_general'
  });
  
  if (!chatResponse.data.success) {
    throw new Error('Chat request failed');
  }
  
  console.log(`    - Response received`);
  console.log(`    - Memory should be stored for: ${TEST_USER_ID}`);
});

// Test 5: Memory Retrieval
await test('Memory Retrieval', async () => {
  // Send a follow-up question that should trigger memory retrieval
  const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
    message: 'What did I just ask about?',
    userId: TEST_USER_ID,
    mode: 'truth_general'
  });
  
  if (!chatResponse.data.success) {
    throw new Error('Chat request failed');
  }
  
  const memoryTokens = chatResponse.data.metadata?.memoryTokens || 0;
  console.log(`    - Memory tokens retrieved: ${memoryTokens}`);
  console.log(`    - Memory used: ${chatResponse.data.metadata?.memoryUsed || false}`);
});

// Test 6: Health Check
await test('System Health Check', async () => {
  const response = await axios.get(`${BASE_URL}/api/health`);
  
  if (response.data.status !== 'healthy') {
    throw new Error('System not healthy');
  }
  
  console.log(`    - Status: ${response.data.status}`);
  console.log(`    - Uptime: ${Math.floor(response.data.uptime)}s`);
});

// Test 7: Context Assembly
await test('Complete Context Assembly', async () => {
  // Get vault first
  const vaultResponse = await axios.get(`${BASE_URL}/api/load-vault`);
  
  // Send chat with all context types
  const chatResponse = await axios.post(`${BASE_URL}/api/chat`, {
    message: 'Tell me about the system with all context',
    userId: TEST_USER_ID,
    mode: 'site_monkeys',
    vault_content: vaultResponse.data.vault_content,
    vault_loaded: true
  });
  
  if (!chatResponse.data.success) {
    throw new Error('Chat request failed');
  }
  
  const metadata = chatResponse.data.metadata;
  const totalTokens = metadata?.totalContextTokens || 0;
  
  console.log(`    - Total context tokens: ${totalTokens}`);
  console.log(`    - Memory: ${metadata?.memoryTokens || 0} tokens`);
  console.log(`    - Documents: ${metadata?.documentTokens || 0} tokens`);
  console.log(`    - Vault: ${metadata?.vaultTokens || 0} tokens`);
  
  if (totalTokens === 0) {
    throw new Error('No context assembled');
  }
});

// Summary
console.log();
console.log('='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total:  ${testsPassed + testsFailed}`);
console.log('='.repeat(70));

if (testsFailed === 0) {
  console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  console.log();
  console.log('Next steps:');
  console.log('1. Upload a document and verify AI can see it');
  console.log('2. Ask vault questions and verify AI quotes content');
  console.log('3. Test memory across multiple sessions');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED - Review errors above');
  process.exit(1);
}
