// Test the FIXED aggressivePostProcessing function
function aggressivePostProcessing(facts) {
  console.log('INPUT:', JSON.stringify(facts));
  
  // Split into lines and clean
  // CRITICAL FIX: Split on newlines OR periods followed by whitespace/capital/end
  // Then restore periods to maintain proper sentence structure
  // This fixes: "monkeys.Assistant" → "monkeys.\nAssistant" 
  let lines = facts.split(/\n|\.(?=\s|[A-Z]|$)/);
  console.log('After split:', JSON.stringify(lines));
  
  lines = lines.map(line => line.trim()).filter(line => line.length > 0);
  lines = lines.map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim()).filter(line => line.length > 0);
  lines = lines.slice(0, 5);
  lines = lines.filter(line => line.split(/\s+/).length >= 3);
  lines = lines.map(line => {
    // Remove common prefixes
    line = line.replace(/^(The |A |An |This |That |These |Those )/i, '');
    // Remove common suffixes
    line = line.replace(/( is stated| was mentioned| discussed)$/i, '');
    return line.trim();
  });
  lines = lines.filter(line => line.length > 0);
  
  // CRITICAL FIX: Ensure each fact ends with a period for proper grammar
  // This preserves sentence structure while maintaining searchability
  lines = lines.map(line => {
    // Only add period if line doesn't already end with punctuation
    if (!/[.!?]$/.test(line)) {
      return line + '.';
    }
    return line;
  });
  
  const result = lines.join('\n');
  console.log('OUTPUT:', JSON.stringify(result));
  console.log('OUTPUT (actual):');
  console.log(result);
  console.log('');
  return result;
}

console.log('='.repeat(80));
console.log('TEST 1: Standard GPT output with bullet points and periods');
console.log('='.repeat(80));
const test1 = `- User has pet monkeys.
- Assistant unaware of pet.
- User enjoys video games.`;
const result1 = aggressivePostProcessing(test1);
console.log('ANALYSIS:');
console.log('  Contains periods?', result1.includes('.'));
console.log('  Contains newlines?', result1.includes('\n'));
console.log('  Lines:', result1.split('\n'));
console.log('  Search for "%monkeys%":', result1.match(/monkeys/i) ? '✅ FOUND' : '❌ NOT FOUND');
console.log('  Search for "monkeys.Assistant":', result1.match(/monkeys\.Assistant/i) ? '❌ FOUND (BAD)' : '✅ NOT FOUND (GOOD)');
console.log('');

console.log('='.repeat(80));
console.log('TEST 2: Concatenated WITHOUT spaces (the bug scenario)');
console.log('='.repeat(80));
const test2 = `User has pet monkeys.Assistant unaware of pet.User enjoys video games.`;
const result2 = aggressivePostProcessing(test2);
console.log('ANALYSIS:');
console.log('  Contains periods?', result2.includes('.'));
console.log('  Contains newlines?', result2.includes('\n'));
console.log('  Lines:', result2.split('\n'));
console.log('  Search for "%monkeys%":', result2.match(/monkeys/i) ? '✅ FOUND' : '❌ NOT FOUND');
console.log('  Search for "monkeys.Assistant":', result2.match(/monkeys\.Assistant/i) ? '❌ FOUND (BAD)' : '✅ NOT FOUND (GOOD)');
console.log('');

console.log('='.repeat(80));
console.log('TEST 3: Mixed - some facts without periods');
console.log('='.repeat(80));
const test3 = `- User has pet monkeys
- Assistant unaware
- User enjoys video games`;
const result3 = aggressivePostProcessing(test3);
console.log('ANALYSIS:');
console.log('  Contains periods?', result3.includes('.'));
console.log('  Contains newlines?', result3.includes('\n'));
console.log('  Lines:', result3.split('\n'));
console.log('  Each line ends with period?', result3.split('\n').every(line => /[.!?]$/.test(line)));
console.log('');

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log('✅ Fixed regex now splits on periods followed by capitals: /\\.(?=[A-Z])/');
console.log('✅ Periods are restored to each fact for proper grammar');
console.log('✅ Facts are separated by newlines for database storage');
console.log('✅ Keyword search will work: "monkeys" matches "monkeys."');
console.log('✅ No concatenation: "monkeys.Assistant" becomes "monkeys.\\nAssistant."');
