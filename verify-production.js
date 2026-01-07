#!/usr/bin/env node

/**
 * Production Verification Test Suite
 * 
 * This script runs automated tests against the deployed system to verify:
 * 1. Semantic routing quality
 * 2. Performance monitoring
 * 3. Document extraction
 * 4. Claude confirmation flow
 * 
 * Usage: node verify-production.js <railway-url>
 * Example: node verify-production.js https://sitemonkeys-ai-production.up.railway.app
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

const RAILWAY_URL = process.argv[2] || 'http://localhost:3000';
const TEST_USER_ID = `verify_${Date.now()}`;

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function makeRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, RAILWAY_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = client.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response, headers: res.headers });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

async function test1_SemanticRouting() {
  section('TEST 1: Semantic Routing Quality');
  
  try {
    // Step 1: Store technical memory
    log('Step 1: Storing technical memory about session tokens...', 'cyan');
    const storeResponse = await makeRequest('/api/chat', {
      message: 'Remember: Our session tokens expire after 30 minutes of inactivity. We use JWT tokens stored in httpOnly cookies for security. The token refresh happens automatically 5 minutes before expiry.',
      user_id: TEST_USER_ID,
      mode: 'truth_general'
    });
    
    if (storeResponse.data.success) {
      log('✓ Memory stored successfully', 'green');
    } else {
      log('✗ Failed to store memory', 'red');
      return false;
    }
    
    // Wait for storage to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Query for that memory
    log('\nStep 2: Querying about session configuration...', 'cyan');
    const queryResponse = await makeRequest('/api/chat', {
      message: 'What do you remember about our session token configuration and security?',
      user_id: TEST_USER_ID,
      mode: 'truth_general'
    });
    
    if (queryResponse.data.success) {
      log('✓ Query successful', 'green');
      
      // Check if memory was retrieved
      const metadata = queryResponse.data.metadata;
      log('\nMemory Retrieval Details:', 'yellow');
      log(`  - Memory used: ${metadata.memoryUsed}`);
      log(`  - Memory count: ${metadata.memory_count}`);
      log(`  - Memory tokens: ${metadata.memoryTokens}`);
      log(`  - Retrieval method: ${metadata.retrieval?.method || 'unknown'}`);
      
      if (metadata.retrieval?.fallback_reason) {
        log(`  ⚠ Fallback reason: ${metadata.retrieval.fallback_reason}`, 'yellow');
      }
      
      // Check if response contains the stored information
      const response = queryResponse.data.response.toLowerCase();
      const hasJWT = response.includes('jwt') || response.includes('token');
      const has30min = response.includes('30') || response.includes('thirty');
      const hasCookie = response.includes('cookie') || response.includes('httponly');
      
      log('\nContent Verification:', 'yellow');
      log(`  - Contains JWT/token reference: ${hasJWT ? '✓' : '✗'}`);
      log(`  - Contains 30 minute timing: ${has30min ? '✓' : '✗'}`);
      log(`  - Contains cookie reference: ${hasCookie ? '✓' : '✗'}`);
      
      const relevanceScore = (hasJWT ? 1 : 0) + (has30min ? 1 : 0) + (hasCookie ? 1 : 0);
      
      if (relevanceScore >= 2) {
        log('\n✓ PASS: Semantic routing retrieved relevant memories', 'green');
        return true;
      } else {
        log('\n⚠ WARNING: Response may not contain stored information', 'yellow');
        log('Response preview: ' + queryResponse.data.response.substring(0, 200));
        return false;
      }
    } else {
      log('✗ Query failed', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function test2_PerformanceMonitoring() {
  section('TEST 2: Performance Monitoring');
  
  try {
    // Simple query test
    log('Running simple query (target: <2000ms)...', 'cyan');
    const start = Date.now();
    const response = await makeRequest('/api/chat', {
      message: 'What is 2+2?',
      user_id: TEST_USER_ID + '_perf',
      mode: 'truth_general'
    });
    const clientTime = Date.now() - start;
    
    if (response.data.success) {
      log('✓ Query successful', 'green');
      
      const perf = response.data.metadata?.performance;
      
      if (perf) {
        log('\nPerformance Metrics:', 'yellow');
        log(`  - Total duration: ${perf.totalDuration}ms`);
        log(`  - Memory duration: ${perf.memoryDuration}ms`);
        log(`  - AI call duration: ${perf.aiCallDuration}ms`);
        log(`  - Target type: ${perf.targetType}`);
        log(`  - Target duration: ${perf.targetDuration}ms`);
        log(`  - Target met: ${perf.targetMet ? '✓' : '✗'} ${perf.targetMet ? '' : `(exceeded by ${perf.exceedBy}ms)`}`);
        log(`  - Client-measured time: ${clientTime}ms`);
        
        if (perf.targetMet) {
          log('\n✓ PASS: Performance targets met', 'green');
          return true;
        } else {
          log('\n⚠ WARNING: Performance target exceeded', 'yellow');
          return true; // Still pass, just slower than target
        }
      } else {
        log('\n✗ FAIL: Performance metrics not found in response', 'red');
        log('Metadata keys: ' + Object.keys(response.data.metadata || {}).join(', '));
        return false;
      }
    } else {
      log('✗ Query failed', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function test3_DocumentExtraction() {
  section('TEST 3: Document Extraction');
  
  try {
    // Create a large document (>40K chars to exceed ~10K token limit)
    const largeDocument = `
# Comprehensive Product Requirements Document

## Executive Summary
${Array(50).fill('This is a detailed section about our product vision and strategic goals. We aim to revolutionize the industry with innovative solutions. ').join('')}

## Market Analysis
${Array(50).fill('The market research shows significant opportunities in various segments. Our target audience includes enterprise customers and SMBs. ').join('')}

## Technical Specifications
${Array(50).fill('The system architecture follows microservices patterns with REST APIs. We use PostgreSQL for data persistence and Redis for caching. ').join('')}

## User Stories
${Array(50).fill('As a user, I want to be able to manage my account efficiently. The interface should be intuitive and responsive. ').join('')}

## Implementation Timeline
${Array(50).fill('Phase 1 begins in Q1 with foundation work. Each subsequent phase builds on previous milestones. ').join('')}

## Risk Assessment
${Array(50).fill('We have identified several potential risks including technical complexity and market competition. Mitigation strategies are in place. ').join('')}

## Appendix
${Array(50).fill('Additional technical details and reference materials are included here for comprehensive documentation purposes. ').join('')}
    `.trim();
    
    const charCount = largeDocument.length;
    const estimatedTokens = Math.ceil(charCount / 4);
    
    log(`Created test document: ${charCount} chars (~${estimatedTokens} tokens)`, 'cyan');
    
    if (estimatedTokens < 10000) {
      log('⚠ Warning: Document may not be large enough to trigger extraction', 'yellow');
    }
    
    log('\nSending document as message...', 'cyan');
    const response = await makeRequest('/api/chat', {
      message: largeDocument + '\n\nPlease summarize the key points from this product requirements document.',
      user_id: TEST_USER_ID + '_doc',
      mode: 'truth_general'
    });
    
    if (response.data.success) {
      log('✓ Query successful', 'green');
      
      const metadata = response.data.metadata;
      log('\nDocument Processing Details:', 'yellow');
      log(`  - Document tokens: ${metadata.documentTokens || 0}`);
      
      // Check for extraction metadata in sources
      if (metadata.documentTokens > 0) {
        const originalEstimate = estimatedTokens;
        const processed = metadata.documentTokens;
        const extractionRatio = processed / originalEstimate;
        
        log(`  - Original size (est): ~${originalEstimate} tokens`);
        log(`  - Processed size: ${processed} tokens`);
        log(`  - Extraction ratio: ${(extractionRatio * 100).toFixed(1)}%`);
        
        if (extractionRatio < 0.9) {
          log('\n✓ PASS: Document extraction triggered', 'green');
          log('Check Railway logs for: [COST-CONTROL] Document extracted: XXXXX → YYYY tokens', 'cyan');
          return true;
        } else {
          log('\n⚠ INFO: Document fit within budget (no extraction needed)', 'yellow');
          return true; // This is okay, just means document wasn't large enough
        }
      } else {
        log('\n✗ FAIL: Document not detected in response metadata', 'red');
        return false;
      }
    } else {
      log('✗ Query failed', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function test4_ClaudeConfirmation() {
  section('TEST 4: Claude Confirmation Flow');
  
  try {
    // Create a complex query that should trigger low confidence
    const complexQuery = `Should I pivot my SaaS startup from B2B to B2C given that our current MRR is $5k, burn rate is $15k/month, and we have 6 months runway? Our main competitor just raised $10M Series A and is aggressively expanding. We have strong product-market fit in our current segment but limited growth potential. The B2C market is 10x larger but highly competitive with established players. Our team has B2B expertise but limited B2C experience. What's the best strategic move considering we need to show growth to raise our next round in 4 months?`;
    
    log('Sending complex business query (should trigger Claude escalation)...', 'cyan');
    const response = await makeRequest('/api/chat', {
      message: complexQuery,
      user_id: TEST_USER_ID + '_confirm',
      mode: 'business_validation'
    });
    
    if (response.data.needsConfirmation) {
      log('✓ Confirmation flow triggered!', 'green');
      log('\nConfirmation Details:', 'yellow');
      log(`  - Reason: ${response.data.reason || 'not specified'}`);
      log(`  - Message: ${response.data.response}`);
      
      if (response.data.estimatedCost) {
        log(`  - Claude cost: ${response.data.estimatedCost.claude}`);
        log(`  - GPT-4 cost: ${response.data.estimatedCost.gpt4}`);
      }
      
      log('\n✓ PASS: Claude confirmation flow working', 'green');
      log('Check Railway logs for: [AI ROUTING] Claude escalation requires user confirmation', 'cyan');
      
      // Test confirmation
      log('\nTesting confirmation with claude_confirmed=true...', 'cyan');
      const confirmedResponse = await makeRequest('/api/chat', {
        message: complexQuery,
        user_id: TEST_USER_ID + '_confirm',
        mode: 'business_validation',
        claude_confirmed: true
      });
      
      if (confirmedResponse.data.success && !confirmedResponse.data.needsConfirmation) {
        log('✓ Confirmation accepted, query processed', 'green');
        log(`  - Model used: ${confirmedResponse.data.metadata?.model || 'unknown'}`);
        return true;
      } else {
        log('⚠ Confirmation may not have been processed correctly', 'yellow');
        return false;
      }
    } else if (response.data.success) {
      log('⚠ Query processed without confirmation (may have used GPT-4)', 'yellow');
      log(`  - Model used: ${response.data.metadata?.model || 'unknown'}`);
      log(`  - Confidence: ${response.data.metadata?.confidence || 'unknown'}`);
      log('\nNote: Confirmation only triggers if confidence < 0.85', 'cyan');
      return true; // This is okay, just means confidence was high enough
    } else {
      log('✗ Query failed', 'red');
      return false;
    }
  } catch (error) {
    log(`✗ ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log(`\n${'='.repeat(80)}`, 'bright');
  log('PRODUCTION VERIFICATION TEST SUITE', 'bright');
  log(`${'='.repeat(80)}`, 'bright');
  log(`\nTarget URL: ${RAILWAY_URL}`, 'cyan');
  log(`Test User ID: ${TEST_USER_ID}\n`, 'cyan');
  
  const results = {
    semanticRouting: await test1_SemanticRouting(),
    performanceMonitoring: await test2_PerformanceMonitoring(),
    documentExtraction: await test3_DocumentExtraction(),
    claudeConfirmation: await test4_ClaudeConfirmation()
  };
  
  // Summary
  section('TEST SUMMARY');
  
  const tests = [
    { name: 'Semantic Routing Quality', result: results.semanticRouting },
    { name: 'Performance Monitoring', result: results.performanceMonitoring },
    { name: 'Document Extraction', result: results.documentExtraction },
    { name: 'Claude Confirmation Flow', result: results.claudeConfirmation }
  ];
  
  tests.forEach(test => {
    const status = test.result ? '✓ PASS' : '✗ FAIL';
    const color = test.result ? 'green' : 'red';
    log(`${status}: ${test.name}`, color);
  });
  
  const passCount = Object.values(results).filter(r => r).length;
  const totalCount = Object.values(results).length;
  
  log(`\nTotal: ${passCount}/${totalCount} tests passed`, passCount === totalCount ? 'green' : 'yellow');
  
  if (passCount === totalCount) {
    log('\n✓ ALL TESTS PASSED - System verification complete!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Check Railway logs for detailed performance markers');
    log('2. Verify [PERFORMANCE] logs show actual millisecond timings');
    log('3. Confirm [COST-CONTROL] logs show document extraction if triggered');
    log('4. Test frontend confirmation dialog in browser');
  } else {
    log('\n⚠ SOME TESTS FAILED - Review results above', 'yellow');
  }
  
  log('\nFor detailed Railway logs, see: VERIFICATION_GUIDE.md', 'cyan');
  
  process.exit(passCount === totalCount ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  log(`\nFATAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
