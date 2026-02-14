import { IntelligentStorage } from './api/memory/intelligent-storage.js';

const storage = new IntelligentStorage();

console.log('Testing extractUnicodeNames with actual implementation...\n');

const testCases = [
  'My contacts are: Dr. Xiaoying Zhang-Müller, Björn O\'Shaughnessy, and José García-López',
  'I met Zhang-Müller yesterday',
  'Contact Björn O\'Shaughnessy for details',
  'José García-López is our contact',
  'My three key contacts are Zhang Wei, Björn Lindqvist, and José García'
];

testCases.forEach((testCase, idx) => {
  console.log(`\n[TEST ${idx + 1}] Input: "${testCase}"`);
  const result = storage.extractUnicodeNames(testCase);
  console.log(`Result: ${JSON.stringify(result)}`);
  console.log(`Count: ${result.length}`);
});
