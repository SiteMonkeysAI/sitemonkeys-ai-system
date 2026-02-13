#!/usr/bin/env node

const testName = "Björn O'Shaughnessy";

console.log(`Testing: "${testName}"`);
console.log("");

// Original pattern
const pattern = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+)*)$/;

console.log("Full pattern test:", pattern.test(testName));
console.log("");

// Let's break it down
console.log("Breaking down the pattern:");
console.log("  ^([A-ZÀ-ÿ][a-zà-ÿ]+ ...");
console.log("    First part must start with uppercase and continue with lowercase");
console.log("");

// Test parts separately
console.log("Testing 'Björn' alone:");
console.log("  " + /^[A-ZÀ-ÿ][a-zà-ÿ]+$/.test("Björn"));

console.log("Testing 'Björn O'Shaughnessy' step by step:");
const stepPattern1 = /^[A-ZÀ-ÿ][a-zà-ÿ]+/;
const stepPattern2 = /^[A-ZÀ-ÿ][a-zà-ÿ]+[-'\s]/;
const stepPattern3 = /^[A-ZÀ-ÿ][a-zà-ÿ]+[-'\s][A-ZÀ-ÿ]/;
const stepPattern4 = /^[A-ZÀ-ÿ][a-zà-ÿ]+[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+/;
const stepPattern5 = /^[A-ZÀ-ÿ][a-zà-ÿ]+[-'\s][A-ZÀ-ÿ][a-zà-ÿ]+$/;

console.log(`  Step 1 - Initial uppercase+lowercase: ${stepPattern1.test(testName)} (match: "${testName.match(stepPattern1)?.[0]}")`);
console.log(`  Step 2 - + separator: ${stepPattern2.test(testName)} (match: "${testName.match(stepPattern2)?.[0]}")`);
console.log(`  Step 3 - + uppercase: ${stepPattern3.test(testName)} (match: "${testName.match(stepPattern3)?.[0]}")`);
console.log(`  Step 4 - + lowercase: ${stepPattern4.test(testName)} (match: "${testName.match(stepPattern4)?.[0]}")`);
console.log(`  Step 5 - exact match: ${stepPattern5.test(testName)}`);

// The issue: the pattern has a non-capturing group with *
console.log("\nThe pattern uses: (?:[-'\\s][A-ZÀ-ÿ][a-zà-ÿ]+)*");
console.log("This means it expects EVERY part after separator to start uppercase");
console.log("");

console.log("Testing 'O' (uppercase O):");
console.log("  " + /[A-ZÀ-ÿ]/.test("O"));

console.log("\nThe problem: After 'O\\'' we have 'Shaughnessy' - uppercase S, lowercase rest");
console.log("  Let's trace: Björn<space>O<apostrophe>Shaughnessy");
console.log("  Pattern expects: [A-ZÀ-ÿ][a-zà-ÿ]+  [-'\\s]  [A-ZÀ-ÿ][a-zà-ÿ]+");
console.log("  We have:         B      jörn        <space>  O       'Shaughnessy");
console.log("                                                ^");
console.log("                                                O is followed by apostrophe");
console.log("                                                not by lowercase letters!");
console.log("");

console.log("The fix: Need to allow apostrophe WITHIN a name part, not just as separator");
console.log("");

// Better pattern
const betterPattern = /^([A-ZÀ-ÿ][a-zà-ÿ']+(?:[-\s][A-ZÀ-ÿ][a-zà-ÿ']+)*)$/;
console.log("Better pattern (allows apostrophe within name):");
console.log("  " + betterPattern.test(testName));

const match = testName.match(betterPattern);
console.log("  Captured: " + (match ? match[1] : "null"));
