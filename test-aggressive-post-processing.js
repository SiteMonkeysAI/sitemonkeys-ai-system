// ================================================================
// test-aggressive-post-processing.js
// Test the aggressivePostProcessing function to see how it transforms facts
// ================================================================

// Simulate the function
function aggressivePostProcessing(facts) {
  console.log('INPUT:', JSON.stringify(facts));
  console.log('');
  
  // Split into lines and clean
  // BUGFIX: Also split by periods (followed by space/end) to handle concatenated facts without newlines
  let lines = facts.split(/\n|\.(?=\s|$)/);
  console.log('After split(/\\n|\\.(?=\\s|$)/):', JSON.stringify(lines));
  
  lines = lines.map(line => line.trim());
  console.log('After .map(trim):', JSON.stringify(lines));
  
  lines = lines.filter(line => line.length > 0);
  console.log('After .filter(length > 0):', JSON.stringify(lines));
  
  // Remove bullet points, numbers, and other formatting
  lines = lines.map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim());
  console.log('After removing bullet points:', JSON.stringify(lines));
  
  lines = lines.filter(line => line.length > 0);
  console.log('After .filter(length > 0) again:', JSON.stringify(lines));
  
  // Limit to 5 facts maximum
  lines = lines.slice(0, 5);
  
  // Enforce 8-word maximum per fact
  lines = lines.map(line => {
    const words = line.split(/\s+/);
    if (words.length > 8) {
      return words.slice(0, 8).join(' ');
    }
    return line;
  });
  
  // Remove duplicates (case-insensitive)
  const seen = new Set();
  lines = lines.filter(line => {
    const normalized = line.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
  
  // Remove very short or low-value facts (< 3 words)
  lines = lines.filter(line => line.split(/\s+/).length >= 3);
  console.log('After filtering < 3 words:', JSON.stringify(lines));
  
  // Additional aggressive compression: remove common filler words at start/end
  lines = lines.map(line => {
    // Remove common prefixes
    line = line.replace(/^(The |A |An |This |That |These |Those )/i, '');
    // Remove common suffixes
    line = line.replace(/( is stated| was mentioned| discussed)$/i, '');
    return line.trim();
  });
  
  // Final cleanup: ensure no empty lines
  lines = lines.filter(line => line.length > 0);
  console.log('Final lines array:', JSON.stringify(lines));
  
  // Join with newlines for clean formatting
  const result = lines.join('\n');
  console.log('OUTPUT:', JSON.stringify(result));
  console.log('OUTPUT (actual):', result);
  
  return result;
}

// Test Case 1: Standard GPT output with bullet points and periods
console.log('=' .repeat(80));
console.log('TEST CASE 1: Standard GPT output with bullet points');
console.log('=' .repeat(80));
const test1 = `- User has pet monkeys.
- Assistant unaware of pet.
- User enjoys video games.`;
const result1 = aggressivePostProcessing(test1);
console.log('\nRESULT ANALYSIS:');
console.log('  Contains periods?', result1.includes('.'));
console.log('  Contains newlines?', result1.includes('\n'));
console.log('  Split by newline:', result1.split('\n'));
console.log('');

// Test Case 2: GPT output without periods (less formal)
console.log('=' .repeat(80));
console.log('TEST CASE 2: GPT output without trailing periods');
console.log('=' .repeat(80));
const test2 = `- User has pet monkeys
- Assistant unaware of pet
- User enjoys video games`;
const result2 = aggressivePostProcessing(test2);
console.log('\nRESULT ANALYSIS:');
console.log('  Contains periods?', result2.includes('.'));
console.log('  Contains newlines?', result2.includes('\n'));
console.log('  Split by newline:', result2.split('\n'));
console.log('');

// Test Case 3: Concatenated without newlines (what the bugfix was trying to handle)
console.log('=' .repeat(80));
console.log('TEST CASE 3: Concatenated facts without newlines');
console.log('=' .repeat(80));
const test3 = `User has pet monkeys. Assistant unaware of pet. User enjoys video games.`;
const result3 = aggressivePostProcessing(test3);
console.log('\nRESULT ANALYSIS:');
console.log('  Contains periods?', result3.includes('.'));
console.log('  Contains newlines?', result3.includes('\n'));
console.log('  Split by newline:', result3.split('\n'));
console.log('');

// Test Case 4: Mixed - some with periods, some without
console.log('=' .repeat(80));
console.log('TEST CASE 4: Mixed format');
console.log('=' .repeat(80));
const test4 = `1. User has pet monkeys.
2. Assistant unaware of pet
3. User enjoys video games.`;
const result4 = aggressivePostProcessing(test4);
console.log('\nRESULT ANALYSIS:');
console.log('  Contains periods?', result4.includes('.'));
console.log('  Contains newlines?', result4.includes('\n'));
console.log('  Split by newline:', result4.split('\n'));
console.log('');
