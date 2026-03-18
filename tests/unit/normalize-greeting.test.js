/**
 * Normalization guards for greeting detection (regex-free)
 * Executes only the exported normalizeGreeting helper — no network calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeGreeting } from '../../api/core/intelligence/greetingUtils.js';

describe('normalizeGreeting()', () => {
  it('collapses repeated whitespace and tabs', () => {
    const input = '  Hello\t there   friend  ';
    const result = normalizeGreeting(input);
    assert.strictEqual(result, 'hello there friend');
  });

  it('strips trailing punctuation (single and multiple)', () => {
    const input = 'Hello!!!';
    const result = normalizeGreeting(input);
    assert.strictEqual(result, 'hello');

    const input2 = 'Good morning, friend??';
    const result2 = normalizeGreeting(input2);
    assert.strictEqual(result2, 'good morning, friend');
  });

  it('handles empty and punctuation-only strings safely', () => {
    assert.strictEqual(normalizeGreeting(''), '');
    assert.strictEqual(normalizeGreeting('!!!'), '');
  });
});
