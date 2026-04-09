// /api/utils/input-sanitizer.js
// INPUT SANITIZER — Prompt injection defense for stored memory content
//
// Sanitizes user-supplied text before it is persisted in persistent_memories.
// Prompt-injection attempts are neutralised by replacing the offending portion
// with the literal token [removed].  HTML/script content is stripped entirely.
// The rest of the message is preserved so legitimate context is not lost.

// ---------------------------------------------------------------------------
// Prompt-injection patterns
// Each entry is a RegExp — flags: case-insensitive, global so all occurrences
// are replaced.
// ---------------------------------------------------------------------------
const INJECTION_PATTERNS = [
  /ignore\s+(all|previous|above|prior)\s+instructions?/gi,
  /disregard\s+(all|previous|your)\s+(instructions?|rules?|guidelines?)/gi,
  /you\s+are\s+now\s+(a|an)\b/gi,
  /act\s+as\s+(a|an)\b/gi,
  /pretend\s+(you\s+are|to\s+be)\b/gi,
  /forget\s+(everything|all|your)\b/gi,
  /new\s+(instructions?|rules?|guidelines?|persona|role)\b/gi,
  /system\s+prompt/gi,
  /jailbreak/gi,
];

// ---------------------------------------------------------------------------
// HTML / script patterns
//
// Script blocks are stripped in a loop until none remain (prevents re-assembly
// via nested tags, e.g. "<scr<script>ipt>").  The closing-tag pattern allows
// optional whitespace before ">" to cover "</script >" variants.
// After script blocks are gone, remaining HTML tags are stripped the same way.
// ---------------------------------------------------------------------------
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const HTML_TAG_RE     = /<[^>]*>/g;

// Strip a pattern repeatedly until no more matches remain.
function stripUntilClean(str, pattern) {
  let prev;
  do {
    prev = str;
    str = str.replace(pattern, '');
  } while (str !== prev);
  return str;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitize a user-provided string before it is written to persistent_memories.
 *
 * - Prompt-injection patterns are replaced with the literal token [removed].
 * - <script> blocks (with their content) are removed entirely.
 * - Remaining HTML tags are stripped.
 * - The return value is always a string (never null/undefined).
 *
 * @param {string} text - Raw user input to sanitize.
 * @returns {string}    - Sanitized text safe for memory storage.
 */
export function sanitizeForMemoryStorage(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;
  let injectionDetected = false;

  // 1. Replace prompt-injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '[removed]');
    if (sanitized !== before) {
      injectionDetected = true;
    }
  }

  if (injectionDetected) {
    console.log('[SECURITY] Prompt injection attempt detected in memory storage input');
  }

  // 2. Strip <script>…</script> blocks (content included) — loop until clean
  sanitized = stripUntilClean(sanitized, SCRIPT_BLOCK_RE);

  // 3. Strip remaining HTML tags — loop until clean
  sanitized = stripUntilClean(sanitized, HTML_TAG_RE);

  return sanitized;
}

