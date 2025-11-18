// Test the split regex behavior with period-newline combinations
const regex = /\n|\.(?=\s|$)/;

console.log('TEST: Understanding the split regex behavior');
console.log('='.repeat(80));

const test1 = "User has pet monkeys.\nAssistant is unaware.";
console.log('\nTest 1:', JSON.stringify(test1));
console.log('Split result:', test1.split(regex));

const test2 = "User has pet monkeys. \nAssistant is unaware.";
console.log('\nTest 2:', JSON.stringify(test2));
console.log('Split result:', test2.split(regex));

const test3 = "User has pet monkeys.Assistant is unaware.";
console.log('\nTest 3:', JSON.stringify(test3));
console.log('Split result:', test3.split(regex));

const test4 = "User has pet monkeys. Assistant is unaware.";
console.log('\nTest 4:', JSON.stringify(test4));
console.log('Split result:', test4.split(regex));

// What about at end of string?
const test5 = "User has pet monkeys.";
console.log('\nTest 5:', JSON.stringify(test5));
console.log('Split result:', test5.split(regex));

// Testing lookahead specifically
console.log('\n' + '='.repeat(80));
console.log('Understanding lookahead \.(?=\s|$)');
console.log('This matches a period when:');
console.log('  - Followed by whitespace (\\s)');
console.log('  - OR at end of string ($)');
console.log('But NOT when followed by other characters');

const examples = [
  'monkeys.',      // Period at end → MATCHES (end of string)
  'monkeys.\\n',     // Period before newline → shows how it splits
  'monkeys. ',     // Period + space → MATCHES (space)
  'monkeys.A',     // Period + letter → NO MATCH
];

console.log('\n' + '='.repeat(80));
examples.forEach(ex => {
  // Need to actually use the string, not the escaped version
  const actual = ex.replace('\\\\n', '\n');
  const result = actual.split(regex);
  console.log(`"${ex}" → split result:`, result);
});
