// Test: What if GPT returns facts WITHOUT spaces after periods?
function aggressivePostProcessing(facts) {
  console.log('INPUT:', JSON.stringify(facts));
  let lines = facts.split(/\n|\.(?=\s|$)/);  // Only splits on period if followed by space or end
  console.log('After split(/\\n|\\.(?=\\s|$)/):', JSON.stringify(lines));
  
  lines = lines.map(line => line.trim()).filter(line => line.length > 0);
  lines = lines.map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim()).filter(line => line.length > 0);
  lines = lines.slice(0, 5);
  lines = lines.filter(line => line.split(/\s+/).length >= 3);
  
  const result = lines.join('\n');
  console.log('OUTPUT:', JSON.stringify(result));
  console.log('');
  return result;
}

console.log('TEST 1: GPT returns with periods but NO spaces after periods');
console.log('='.repeat(80));
const test1 = `User has pet monkeys.Assistant is unaware of this.User asked about favorites.`;
aggressivePostProcessing(test1);

console.log('TEST 2: GPT returns each fact on new line, WITH periods');
console.log('='.repeat(80));
const test2 = `User has pet monkeys.
Assistant is unaware of this.
User asked about favorites.`;
aggressivePostProcessing(test2);

console.log('TEST 3: What if we rejoin incorrectly somewhere?');
console.log('='.repeat(80));
// Simulating if lines are joined with period instead of newline
const facts = ['User has pet monkeys', 'Assistant is unaware of this', 'User asked about favorites'];
const wrong1 = facts.join('.');
const wrong2 = facts.join('. ');
const correct = facts.join('\n');

console.log('Joined with ".":', JSON.stringify(wrong1));
console.log('Joined with ". ":', JSON.stringify(wrong2));
console.log('Joined with "\\n":', JSON.stringify(correct));
