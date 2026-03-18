// Greeting utilities — regex-free, ReDoS-safe

export const PURE_GREETINGS = new Set([
  'hi',
  'hello',
  'hey',
  'greetings',
  'howdy',
  'yo',
  'sup',
  'hiya',
  'hola',
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'good day',
  'thanks',
  'thank you',
  'bye',
  'goodbye'
]);

// Internal helper — not exported; used only by normalizeGreeting
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', '\f', '\v']);

// Whitespace collapse and trailing punctuation strip without regex.
// NOTE: Greetings are capped at MAX_GREETING_LENGTH (classifier) so this loop stays bounded.
// We intentionally avoid regex here to eliminate ReDoS surface flagged by CodeQL.
export const normalizeGreeting = (text) => {
  const lower = text.toLowerCase();
  const tokens = [];
  let current = '';
  for (const ch of lower) {
    if (WHITESPACE_CHARS.has(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  const joined = tokens.join(' ');

  // Single-pass trailing punctuation trim
  let end = joined.length - 1;
  for (; end >= 0; end--) {
    const ch = joined[end];
    if (ch !== '!' && ch !== '.' && ch !== ',' && ch !== '?') {
      break;
    }
  }
  return joined.slice(0, end + 1);
};
