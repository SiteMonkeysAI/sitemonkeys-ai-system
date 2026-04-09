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
// HTML tag pattern
//
// Bounded quantifier {0,2000} prevents polynomial backtracking on adversarial
// inputs that contain many '<' characters with no matching '>'.
// ---------------------------------------------------------------------------
const HTML_TAG_RE = /<[^>]{0,2000}>/g;

// Maximum input length processed — bounds worst-case regex work.
const MAX_INPUT_LENGTH = 10_000;

// ---------------------------------------------------------------------------
// Script block removal (O(n), no backtracking regex)
//
// Uses split on closing tags + map to trim from the last opening tag.
// This avoids the polynomial ReDoS risk of `[\s\S]*?` across long inputs.
// The loop repeats until the string is stable to handle obfuscated nesting
// such as "<scr<script>ipt>".
// ---------------------------------------------------------------------------

// Closing-tag pattern: allows arbitrary non-">" chars (covers "</script\t bar>").
const SCRIPT_CLOSE_RE = /<\/script[^>]{0,2000}>/gi;
// Opening-tag pattern: used inside map to locate start of each block.
const SCRIPT_OPEN_RE  = /<script\b[^>]{0,2000}>/i;

function stripScriptBlocks(input) {
  let str = input;
  let prev;
  do {
    prev = str;
    // Split on every </script...> closing tag, then for each segment remove
    // anything from the last <script...> opening tag to the end of the segment.
    const parts = str.split(SCRIPT_CLOSE_RE);
    str = parts.map(part => {
      const m = SCRIPT_OPEN_RE.exec(part);
      return m ? part.slice(0, m.index) : part;
    }).join('');
  } while (str !== prev);
  return str;
}

// Strip a regex pattern repeatedly until no more matches remain.
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

  // 3. Remove <script>…</script> blocks (content included) using O(n) splitter
  sanitized = stripScriptBlocks(sanitized);

  // 4. Strip remaining HTML tags — loop until clean
  sanitized = stripUntilClean(sanitized, HTML_TAG_RE);

  return sanitized;
}



