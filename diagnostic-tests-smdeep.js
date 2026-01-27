/**
 * SMDEEP Diagnostic Tests
 * ======================
 * Tests the 5 failing SMDEEP intelligence tests with diagnostic logging
 * 
 * Based on Issue #592 Verification Requirements from @XtremePossibility
 * 
 * Run: node diagnostic-tests-smdeep.js
 */

const RUN_ID = Date.now();
const TEST_USER_ID = `smdeep-diagnostic-${RUN_ID}`;
const API_BASE = process.env.API_URL || 'http://localhost:3000';

let testsPassed = 0;
let testsFailed = 0;
let diagnostics = [];

// Helper function to send chat message
async function chat(message, userId = TEST_USER_ID) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId: userId,
      mode: 'truth_general'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Chat failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.response || data.text || '';
}

// Helper function to get memory debug info
async function getMemoryDebug(userId = TEST_USER_ID) {
  try {
    const response = await fetch(`${API_BASE}/api/debug/memory?userId=${userId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
}

// Helper function for diagnostic logging
function logDiagnostic(testName, finding, details) {
  const entry = { testName, finding, details, timestamp: new Date().toISOString() };
  diagnostics.push(entry);
  console.log(`\n[DIAGNOSTIC] ${testName}`);
  console.log(`  Finding: ${finding}`);
  if (details) {
    console.log(`  Details: ${JSON.stringify(details, null, 2)}`);
  }
}

// Test helper
async function runTest(name, testFn) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Running: ${name}`);
  console.log('='.repeat(70));
  
  try {
    await testFn();
    testsPassed++;
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// ============================================================================
// DIAGNOSTIC TEST 1: NUA1 - Two Alexes (Ambiguity Detection)
// ============================================================================
async function testNUA1_TwoAlexes() {
  const userId = `nua1-${RUN_ID}`;
  
  console.log('\n[TEST SETUP] Storing two different Alexes...');
  
  // Store first Alex
  await chat("Alex is my colleague in marketing at Amazon", userId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Store second Alex
  await chat("Alex is my brother who lives in Seattle", userId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get memory state
  const memoryDebug = await getMemoryDebug(userId);
  
  console.log('\n[DIAGNOSTIC CHECK] Memory retrieval...');
  if (memoryDebug && memoryDebug.memories) {
    const alexMemories = memoryDebug.memories.filter(m => 
      m.content && m.content.toLowerCase().includes('alex')
    );
    
    logDiagnostic('NUA1', 'Memory Storage', {
      totalMemories: memoryDebug.memories.length,
      alexMemories: alexMemories.length,
      memoryContents: alexMemories.map(m => m.content)
    });
    
    if (alexMemories.length < 2) {
      throw new Error(`Only ${alexMemories.length} Alex memory stored, expected 2`);
    }
  }
  
  // Ask ambiguous question
  console.log('\n[QUERY] Asking: "Tell me about Alex"');
  const response = await chat("Tell me about Alex", userId);
  
  console.log('\n[RESPONSE]:', response);
  
  // Check if AI recognizes ambiguity
  const recognizesAmbiguity = 
    response.toLowerCase().includes('which alex') ||
    response.toLowerCase().includes('colleague') && response.toLowerCase().includes('brother') ||
    response.toLowerCase().includes('clarif') ||
    response.toLowerCase().includes('two alex') ||
    response.toLowerCase().includes('both');
  
  logDiagnostic('NUA1', 'Ambiguity Detection', {
    responseIncludesWhichAlex: response.toLowerCase().includes('which alex'),
    responseIncludesBothAlexes: response.toLowerCase().includes('colleague') && response.toLowerCase().includes('brother'),
    recognizesAmbiguity
  });
  
  if (!recognizesAmbiguity) {
    throw new Error('AI did not recognize ambiguity between two Alexes');
  }
}

// ============================================================================
// DIAGNOSTIC TEST 2: STR1 - Volume Stress (10 facts, find specific one)
// ============================================================================
async function testSTR1_VolumeStress() {
  const userId = `str1-${RUN_ID}`;
  
  console.log('\n[TEST SETUP] Storing 10 different facts...');
  
  const facts = [
    "I drive a Tesla Model 3",
    "My dog's name is Max",
    "My favorite color is blue",
    "I work as a software engineer",
    "I live in Austin, Texas",
    "My wife's name is Sarah",
    "I graduated from MIT",
    "My favorite food is sushi",
    "I was born in 1985",
    "My hobby is photography"
  ];
  
  for (const fact of facts) {
    await chat(fact, userId);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Get memory state
  const memoryDebug = await getMemoryDebug(userId);
  
  console.log('\n[DIAGNOSTIC CHECK] Memory storage...');
  if (memoryDebug && memoryDebug.memories) {
    logDiagnostic('STR1', 'Memory Storage', {
      totalMemoriesStored: memoryDebug.memories.length,
      expectedMinimum: 10
    });
  }
  
  // Test 1: Ask about car
  console.log('\n[QUERY 1] Asking: "What car do I drive?"');
  const carResponse = await chat("What car do I drive?", userId);
  console.log('[RESPONSE]:', carResponse);
  
  const hasTesla = carResponse.toLowerCase().includes('tesla') || 
                   carResponse.toLowerCase().includes('model 3');
  
  logDiagnostic('STR1', 'Car Query', {
    query: 'What car do I drive?',
    responseIncludesTesla: hasTesla,
    response: carResponse
  });
  
  if (!hasTesla) {
    throw new Error('AI failed to find Tesla in volume of 10 facts');
  }
  
  // Test 2: Ask about color
  console.log('\n[QUERY 2] Asking: "What is my favorite color?"');
  const colorResponse = await chat("What is my favorite color?", userId);
  console.log('[RESPONSE]:', colorResponse);
  
  const hasBlue = colorResponse.toLowerCase().includes('blue');
  
  logDiagnostic('STR1', 'Color Query', {
    query: 'What is my favorite color?',
    responseIncludesBlue: hasBlue,
    response: colorResponse
  });
  
  if (!hasBlue) {
    throw new Error('AI failed to find color in volume of 10 facts');
  }
}

// ============================================================================
// DIAGNOSTIC TEST 3: CMP2 - International Names
// ============================================================================
async function testCMP2_InternationalNames() {
  const userId = `cmp2-${RUN_ID}`;
  
  console.log('\n[TEST SETUP] Storing international names...');
  
  await chat("My three key contacts are Zhang Wei, Björn Lindqvist, and José García", userId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get memory state
  const memoryDebug = await getMemoryDebug(userId);
  
  console.log('\n[DIAGNOSTIC CHECK] Memory storage...');
  if (memoryDebug && memoryDebug.memories) {
    const contactMemory = memoryDebug.memories.find(m => 
      m.content && (m.content.includes('Zhang') || m.content.includes('Björn') || m.content.includes('José'))
    );
    
    logDiagnostic('CMP2', 'Memory Storage', {
      memoryExists: !!contactMemory,
      storedContent: contactMemory ? contactMemory.content : 'NOT FOUND',
      hasZhangWei: contactMemory && contactMemory.content.includes('Zhang Wei'),
      hasBjornLindqvist: contactMemory && contactMemory.content.includes('Björn Lindqvist'),
      hasJoseGarcia: contactMemory && (contactMemory.content.includes('José García') || contactMemory.content.includes('Jose Garcia'))
    });
  }
  
  // Ask for contacts
  console.log('\n[QUERY] Asking: "Who are my key contacts?"');
  const response = await chat("Who are my key contacts?", userId);
  console.log('[RESPONSE]:', response);
  
  // Check preservation
  const hasZhangWei = response.includes('Zhang Wei');
  const hasBjorn = response.includes('Björn') || response.includes('Bjorn');
  const hasJose = response.includes('José') || response.includes('Jose');
  const hasAllThree = hasZhangWei && hasBjorn && hasJose;
  
  logDiagnostic('CMP2', 'Name Preservation', {
    hasZhangWei,
    hasBjorn,
    hasBjornWithUmlaut: response.includes('Björn'),
    hasJose,
    hasJoseWithAccent: response.includes('José'),
    hasAllThree,
    response
  });
  
  if (!hasAllThree) {
    throw new Error('AI failed to preserve international names');
  }
}

// ============================================================================
// DIAGNOSTIC TEST 4: INF3 - Temporal Reasoning (Arithmetic)
// ============================================================================
async function testINF3_TemporalReasoning() {
  const userId = `inf3-${RUN_ID}`;
  
  console.log('\n[TEST SETUP] Storing temporal facts...');
  
  await chat("I worked at Amazon for 5 years", userId);
  await new Promise(resolve => setTimeout(resolve, 300));
  
  await chat("I left Amazon in 2020", userId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get memory state
  const memoryDebug = await getMemoryDebug(userId);
  
  console.log('\n[DIAGNOSTIC CHECK] Memory storage...');
  if (memoryDebug && memoryDebug.memories) {
    const amazonMemories = memoryDebug.memories.filter(m => 
      m.content && m.content.toLowerCase().includes('amazon')
    );
    
    logDiagnostic('INF3', 'Memory Storage', {
      totalMemories: memoryDebug.memories.length,
      amazonMemories: amazonMemories.length,
      memoryContents: amazonMemories.map(m => m.content),
      hasBothFacts: amazonMemories.length >= 2 || 
                    (amazonMemories.length === 1 && amazonMemories[0].content.includes('5 years') && amazonMemories[0].content.includes('2020'))
    });
  }
  
  // Ask calculation question
  console.log('\n[QUERY] Asking: "When did I start working at Amazon?"');
  const response = await chat("When did I start working at Amazon?", userId);
  console.log('[RESPONSE]:', response);
  
  // Check if AI calculated 2020 - 5 = 2015
  const mentions2015 = response.includes('2015');
  const showsCalculation = response.includes('2020') && response.includes('5');
  
  logDiagnostic('INF3', 'Temporal Reasoning', {
    query: 'When did I start working at Amazon?',
    mentions2015,
    showsCalculation,
    calculationResult: mentions2015 ? '2020 - 5 = 2015 ✓' : 'Did not calculate',
    response
  });
  
  if (!mentions2015) {
    throw new Error('AI failed to perform temporal calculation (2020 - 5 = 2015)');
  }
}

// ============================================================================
// DIAGNOSTIC TEST 5: EDG3 - Numerical Preservation
// ============================================================================
async function testEDG3_NumericalPreservation() {
  const userId = `edg3-${RUN_ID}`;
  
  console.log('\n[TEST SETUP] Storing pricing info...');
  
  await chat("The basic plan costs $99 per month and the premium plan costs $299 per month", userId);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get memory state
  const memoryDebug = await getMemoryDebug(userId);
  
  console.log('\n[DIAGNOSTIC CHECK] Memory storage...');
  if (memoryDebug && memoryDebug.memories) {
    const pricingMemory = memoryDebug.memories.find(m => 
      m.content && (m.content.includes('99') || m.content.includes('299'))
    );
    
    logDiagnostic('EDG3', 'Memory Storage', {
      memoryExists: !!pricingMemory,
      storedContent: pricingMemory ? pricingMemory.content : 'NOT FOUND',
      has99: pricingMemory && pricingMemory.content.includes('99'),
      has299: pricingMemory && pricingMemory.content.includes('299')
    });
  }
  
  // Ask about pricing
  console.log('\n[QUERY] Asking: "What are the plan prices?"');
  const response = await chat("What are the plan prices?", userId);
  console.log('[RESPONSE]:', response);
  
  // Check exact preservation
  const has99 = response.includes('$99') || response.includes('99');
  const has299 = response.includes('$299') || response.includes('299');
  const noApproximation = !response.toLowerCase().includes('around') && 
                          !response.toLowerCase().includes('approximately') &&
                          !response.includes('$100') &&
                          !response.includes('$300');
  
  logDiagnostic('EDG3', 'Numerical Preservation', {
    has99,
    has299,
    noApproximation,
    response
  });
  
  if (!has99 || !has299) {
    throw new Error('AI failed to preserve exact numerical values');
  }
  
  if (!noApproximation) {
    throw new Error('AI approximated values instead of using exact numbers');
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         SMDEEP DIAGNOSTIC TESTS - Issue #592 Verification         ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTest User ID Prefix: smdeep-diagnostic-${RUN_ID}`);
  console.log(`API Base: ${API_BASE}`);
  console.log('\nThese tests verify the 5 failing SMDEEP intelligence requirements:');
  console.log('  - INF3: Temporal Reasoning (arithmetic from facts)');
  console.log('  - NUA1: Ambiguity Detection (multiple entities with same name)');
  console.log('  - STR1: Volume Handling (find fact among 10+)');
  console.log('  - CMP2: Name Preservation (international characters)');
  console.log('  - EDG3: Numerical Preservation (exact values, no approximation)');
  console.log('\n');
  
  // Check if server is running
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('Health check failed');
  } catch (e) {
    console.error('❌ ERROR: Server not running or not accessible');
    console.error('   Please start the server with: npm start');
    console.error(`   API Base: ${API_BASE}`);
    process.exit(1);
  }
  
  // Run tests
  await runTest('NUA1: Two Alexes (Ambiguity Detection)', testNUA1_TwoAlexes);
  await runTest('STR1: Volume Stress (10 facts)', testSTR1_VolumeStress);
  await runTest('CMP2: International Names', testCMP2_InternationalNames);
  await runTest('INF3: Temporal Reasoning (Arithmetic)', testINF3_TemporalReasoning);
  await runTest('EDG3: Numerical Preservation', testEDG3_NumericalPreservation);
  
  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                         TEST SUMMARY                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal Tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed} ✅`);
  console.log(`Failed: ${testsFailed} ❌`);
  console.log(`\nSuccess Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  // Print diagnostic summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                      DIAGNOSTIC FINDINGS                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  
  for (const diag of diagnostics) {
    console.log(`\n[${diag.testName}] ${diag.finding}`);
    if (diag.details) {
      console.log(JSON.stringify(diag.details, null, 2));
    }
  }
  
  console.log('\n');
  
  // Exit with appropriate code
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
