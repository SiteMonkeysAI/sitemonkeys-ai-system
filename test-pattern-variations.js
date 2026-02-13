#!/usr/bin/env node

const testNames = [
  "Xiaoying Zhang-Müller",
  "Björn O'Shaughnessy",
  "José García-López"
];

console.log("Testing various pattern approaches:\n");

// Approach 1: Allow apostrophe as part of name characters
const pattern1 = /^([A-ZÀ-ÿ][a-zà-ÿ']+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ']+)*)$/;
console.log("Pattern 1: Apostrophe in character class");
console.log("  /^([A-ZÀ-ÿ][a-zà-ÿ']+(?:[-\\s][A-ZÀ-ÿ][a-zà-ÿ']+)*)$/");
testNames.forEach(name => {
  const match = name.match(pattern1);
  console.log(`  "${name}": ${match ? "✅ " + match[1] : "❌ NO MATCH"}`);
});

console.log("\n");

// Approach 2: Simplify - match word characters with Unicode support
const pattern2 = /^([\p{Lu}][\p{Ll}\p{Lm}']+(?:[-\s][\p{Lu}][\p{Ll}\p{Lm}']+)*)$/u;
console.log("Pattern 2: Unicode property escapes");
console.log("  /^([\\p{Lu}][\\p{Ll}\\p{Lm}']+(?:[-\\s][\\p{Lu}][\\p{Ll}\\p{Lm}']+)*)$/u");
testNames.forEach(name => {
  const match = name.match(pattern2);
  console.log(`  "${name}": ${match ? "✅ " + match[1] : "❌ NO MATCH"}`);
});

console.log("\n");

// Approach 3: Even simpler - just match sequences of word-like chars with separators
const pattern3 = /^([A-ZÀ-ÿ][A-Za-zÀ-ÿ']*(?:[-\s][A-ZÀ-ÿ][A-Za-zÀ-ÿ']*)*)$/;
console.log("Pattern 3: More flexible character matching");
console.log("  /^([A-ZÀ-ÿ][A-Za-zÀ-ÿ']*(?:[-\\s][A-ZÀ-ÿ][A-Za-zÀ-ÿ']*)*)$/");
testNames.forEach(name => {
  const match = name.match(pattern3);
  console.log(`  "${name}": ${match ? "✅ " + match[1] : "❌ NO MATCH"}`);
});
