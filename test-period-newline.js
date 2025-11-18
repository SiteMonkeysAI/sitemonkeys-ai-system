// Test what happens when GPT returns facts with BOTH newlines AND periods
function aggressivePostProcessing(facts) {
  console.log('INPUT:', JSON.stringify(facts));
  let lines = facts.split(/\n|\.(?=\s|$)/);
  console.log('After split:', JSON.stringify(lines));
  
  lines = lines.map(line => line.trim()).filter(line => line.length > 0);
  console.log('After trim/filter:', JSON.stringify(lines));
  
  lines = lines.map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim()).filter(line => line.length > 0);
  console.log('After removing bullets:', JSON.stringify(lines));
  
  lines = lines.slice(0, 5);
  lines = lines.filter(line => line.split(/\s+/).length >= 3);
  console.log('Final lines:', JSON.stringify(lines));
  
  const result = lines.join('\n');
  console.log('Joined result:', JSON.stringify(result));
  return result;
}

console.log('TEST: GPT returns facts with bullet points, periods AND newlines');
console.log('='.repeat(80));

const gptOutput = `- User has pet monkeys.
- Assistant is unaware of this.
- User asked about favorites.`;

console.log('GPT Output:');
console.log(gptOutput);
console.log('');

const result = aggressivePostProcessing(gptOutput);
console.log('');
console.log('FINAL RESULT:');
console.log(result);
console.log('');
console.log('Contains periods?', result.includes('.'));
console.log('Contains newlines?', result.includes('\n'));
console.log('Lines:', result.split('\n'));
