#!/usr/bin/env node

/**
 * Test script to verify Layer 2 Fallback Primitives are working
 * Tests applyTemporalArithmeticFallback and applyListCompletenessFallback
 */

import { processWithEliAndRoxy } from './api/lib/ai-processors.js';

console.log('🧪 TESTING LAYER 2 FALLBACK PRIMITIVES\n');
console.log('=' .repeat(80));

// Mock OpenAI for testing
const mockOpenAI = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{
          message: {
            content: "I don't know when you started working there."
          }
        }],
        usage: { total_tokens: 100 }
      })
    }
  }
};

// Mock drift tracker
const mockDriftTracker = {
  track: () => {},
  getStats: () => ({})
};

// Test Case 1: Temporal Arithmetic Fallback
async function testTemporalArithmetic() {
  console.log('\n\n📅 TEST 1: Temporal Arithmetic Fallback');
  console.log('-'.repeat(80));
  
  const memoryContext = "I worked for 5 years at Google and left in 2020.";
  const message = "When did I start working at Google?";
  
  console.log('Memory Context:', memoryContext);
  console.log('User Query:', message);
  console.log('\nProcessing...\n');
  
  try {
    const result = await processWithEliAndRoxy({
      message,
      mode: 'truth',
      vaultVerification: { allowed: false },
      conversationHistory: [],
      userPreference: null,
      openai: mockOpenAI,
      driftTracker: mockDriftTracker,
      memoryContext,
      sessionId: 'test-session-1'
    });
    
    console.log('\n✅ TEST 1 COMPLETED');
    console.log('Response:', result.response.substring(0, 200) + '...');
    console.log('Layer 2 Primitives:', JSON.stringify(result.layer2_primitives, null, 2));
  } catch (error) {
    console.error('❌ TEST 1 FAILED:', error.message);
  }
}

// Test Case 2: List Completeness Fallback
async function testListCompleteness() {
  console.log('\n\n📋 TEST 2: List Completeness Fallback');
  console.log('-'.repeat(80));
  
  const memoryContext = "Your contacts: Zhang Wei (developer), Björn Lindqvist (designer), José García (manager)";
  const message = "Who are my contacts?";
  
  console.log('Memory Context:', memoryContext);
  console.log('User Query:', message);
  console.log('\nProcessing...\n');
  
  try {
    const result = await processWithEliAndRoxy({
      message,
      mode: 'truth',
      vaultVerification: { allowed: false },
      conversationHistory: [],
      userPreference: null,
      openai: mockOpenAI,
      driftTracker: mockDriftTracker,
      memoryContext,
      sessionId: 'test-session-2'
    });
    
    console.log('\n✅ TEST 2 COMPLETED');
    console.log('Response:', result.response.substring(0, 200) + '...');
    console.log('Layer 2 Primitives:', JSON.stringify(result.layer2_primitives, null, 2));
  } catch (error) {
    console.error('❌ TEST 2 FAILED:', error.message);
  }
}

// Test Case 3: Normal case (primitives should NOT fire)
async function testNormalCase() {
  console.log('\n\n✨ TEST 3: Normal Case (Primitives Should Not Fire)');
  console.log('-'.repeat(80));
  
  const memoryContext = "You like coffee and tea.";
  const message = "What do I like?";
  
  console.log('Memory Context:', memoryContext);
  console.log('User Query:', message);
  console.log('\nProcessing...\n');
  
  try {
    const result = await processWithEliAndRoxy({
      message,
      mode: 'truth',
      vaultVerification: { allowed: false },
      conversationHistory: [],
      userPreference: null,
      openai: mockOpenAI,
      driftTracker: mockDriftTracker,
      memoryContext,
      sessionId: 'test-session-3'
    });
    
    console.log('\n✅ TEST 3 COMPLETED');
    console.log('Response:', result.response.substring(0, 200) + '...');
    console.log('Layer 2 Primitives:', JSON.stringify(result.layer2_primitives, null, 2));
    
    // Verify primitives did NOT fire
    if (!result.layer2_primitives.temporal_arithmetic.fired && 
        !result.layer2_primitives.list_completeness.fired) {
      console.log('\n✅ CORRECT: Primitives did not fire (as expected)');
    } else {
      console.log('\n⚠️ WARNING: Primitives fired when they should not have');
    }
  } catch (error) {
    console.error('❌ TEST 3 FAILED:', error.message);
  }
}

// Run all tests
async function runTests() {
  console.log('\n🎯 OBJECTIVE: Verify [PRIMITIVE-TEMPORAL] and [PRIMITIVE-COMPLETENESS]');
  console.log('              logs appear on every query\n');
  
  await testTemporalArithmetic();
  await testListCompleteness();
  await testNormalCase();
  
  console.log('\n\n' + '='.repeat(80));
  console.log('🏁 ALL TESTS COMPLETED');
  console.log('=' .repeat(80));
  console.log('\n✅ If you see [PRIMITIVE-TEMPORAL] and [PRIMITIVE-COMPLETENESS] logs above,');
  console.log('   the integration is working correctly!\n');
}

runTests().catch(error => {
  console.error('💥 CRITICAL ERROR:', error);
  process.exit(1);
});
