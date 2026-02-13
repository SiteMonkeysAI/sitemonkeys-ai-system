#!/usr/bin/env node

const memoryContext = "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López";

console.log("Testing name extraction:");
console.log("Memory:", memoryContext);
console.log("");

// Split by comma or "and"
const parts = memoryContext.split(/[,;]|(?:\s+and\s+)/).map(s => s.trim());

console.log("Parts after split:");
parts.forEach((p, i) => console.log(`  ${i}: "${p}"`));
console.log("");

// Pattern for proper names
const properNamePattern = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+)*)$/;

console.log("Testing each part against pattern:");
parts.forEach((part, i) => {
  const trimmed = part.trim();
  const match = trimmed.match(properNamePattern);
  console.log(`  ${i}: "${trimmed}"`);
  console.log(`      Match: ${match ? "YES - " + match[1] : "NO"}`);
  
  // Debug the pattern breakdown
  if (!match) {
    console.log("      Checking character by character:");
    for (let j = 0; j < trimmed.length; j++) {
      const char = trimmed[j];
      const code = char.charCodeAt(0);
      console.log(`        ${j}: '${char}' (code: ${code})`);
    }
  }
});
