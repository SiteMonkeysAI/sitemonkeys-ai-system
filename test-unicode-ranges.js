#!/usr/bin/env node

// Test Unicode ranges
console.log("Testing Unicode character ranges:");
console.log("");

const testChars = [
  { char: 'a', desc: 'lowercase a' },
  { char: 'z', desc: 'lowercase z' },
  { char: 'à', desc: 'lowercase a with grave' },
  { char: 'ÿ', desc: 'lowercase y with diaeresis' },
  { char: 'ö', desc: 'lowercase o with diaeresis' },
  { char: 'ü', desc: 'lowercase u with diaeresis' },
  { char: 'é', desc: 'lowercase e with acute' },
  { char: 'í', desc: 'lowercase i with acute' },
];

testChars.forEach(({ char, desc }) => {
  const code = char.charCodeAt(0);
  const inRange_a_z = char >= 'a' && char <= 'z';
  const inRange_a_grave_y_diaeresis = char >= 'à' && char <= 'ÿ';
  
  console.log(`${char} (${desc}, code ${code}):`);
  console.log(`  In [a-z]: ${inRange_a_z}`);
  console.log(`  In [à-ÿ]: ${inRange_a_grave_y_diaeresis}`);
  console.log(`  Matches [a-zà-ÿ]: ${/[a-zà-ÿ]/.test(char)}`);
});

console.log("\nTesting the pattern on 'Björn':");
const pattern1 = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+)*)$/;
const pattern2 = /^([A-ZÀ-Ÿ][a-zà-ÿ]+(?:[-'\s][A-ZÀ-Ÿ][a-zà-ÿ]+)*)$/;
const pattern3 = /^([A-ZÀ-Ÿ\u00C0-\u00FF][a-zà-ÿ\u00E0-\u00FF]+(?:[-'\s][A-ZÀ-Ÿ\u00C0-\u00FF][a-zà-ÿ\u00E0-\u00FF]+)*)$/;

console.log(`  Pattern 1 [A-ZÀ-ÿ][a-zà-ÿ]+: ${pattern1.test('Björn')}`);
console.log(`  Pattern 2 [A-ZÀ-Ÿ][a-zà-ÿ]+: ${pattern2.test('Björn')}`);
console.log(`  Pattern 3 with explicit Unicode: ${pattern3.test('Björn')}`);

// Check specifically 'ö'
console.log("\nChecking 'ö' specifically:");
console.log(`  Matches [a-z]: ${/[a-z]/.test('ö')}`);
console.log(`  Matches [à-ÿ]: ${/[à-ÿ]/.test('ö')}`);
console.log(`  Matches [a-zà-ÿ]: ${/[a-zà-ÿ]/.test('ö')}`);
console.log(`  Matches [\\u00E0-\\u00FF]: ${/[\u00E0-\u00FF]/.test('ö')}`);
