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
// Script blocks: the closing-tag pattern uses [^>]* to allow any characters
// between "script" and ">" (covers </script>, </script >, </script\t\n bar>).
//
// HTML tag stripping uses a bounded quantifier {0,2000} to prevent polynomial
// backtracking on adversarial inputs with many '<' characters and no '>'.
//
// Both patterns are applied in a loop until no further matches remain, which
// prevents re-assembly attacks using nested tags (e.g. "<scr<script>ipt>").
// ---------------------------------------------------------------------------
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi;
const HTML_TAG_RE     = /<[^>]{0,2000}>/g;

// Maximum input length processed for HTML stripping — prevents DoS via
// extremely long strings that combine with the loop-until-clean strategy.
const MAX_INPUT_LENGTH = 10_000;

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
 * - Input longer than MAX_INPUT_LENGTH is truncated before HTML processing.
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

  // 2. Cap length before HTML processing to bound regex work
  if (sanitized.length > MAX_INPUT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }

  // 3. Strip <script>…</script> blocks (content included) — loop until clean
  sanitized = stripUntilClean(sanitized, SCRIPT_BLOCK_RE);

  // 4. Strip remaining HTML tags — loop until clean
  sanitized = stripUntilClean(sanitized, HTML_TAG_RE);

  return sanitized;
}


