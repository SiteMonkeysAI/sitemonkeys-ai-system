#!/usr/bin/env node

const memoryContext = "Xiaoying Zhang-Müller, Björn O'Shaughnessy, José García-López";

console.log("Testing name extraction patterns:");
console.log("Memory context:", memoryContext);
console.log("");

// Pattern from ai-processors.js (comma-separated list)
const commaListPattern = /([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ]+)*(?:[-'][A-ZÀ-ÿ][a-zà-ÿ]+)*)\s*(?:,|and)/g;

console.log("Current pattern results:");
let match;
while ((match = commaListPattern.exec(memoryContext)) !== null) {
  console.log(`  - "${match[1]}"`);
}

console.log("");
console.log("The issue: The pattern expects uppercase after apostrophe (O'Shaughnessy)");
console.log("but requires lowercase start: [-'][A-Z][a-z]+ which matches O'Shaughnessy");
console.log("but the second part [-\\s] matches space before O, so 'Björn' is matched");
console.log("but then O'Shaughnessy is matched as next iteration");
console.log("");

// Better pattern that handles names properly
console.log("Testing improved pattern:");
// Split on commas and handle each part
const names = memoryContext.split(',').map(s => s.trim()).filter(s => s.length > 0);
console.log("Split by comma:");
names.forEach(name => console.log(`  - "${name}"`));
