// ================================================================
// empty-extraction-guard.js
// Pure guard logic — no external dependencies.
// Exported so tests can import this without pulling in openai/tiktoken.
// ================================================================

/**
 * Patterns that indicate the extraction step produced a failure message rather than
 * real user facts.  When extracted content matches any of these patterns, the entry
 * must NOT be written to the database — it is not a user fact.
 *
 * Background: 29+ memories were stored with content like "No essential facts to
 * extract", consuming the entire 2,000-token memory budget on every query and
 * crowding out real memories.
 */
export const EMPTY_EXTRACTION_PATTERNS = [
  /^no essential facts/i,
  /^no relevant facts/i,
  /^no specific facts/i,
  /^no extractable facts/i,
  /^no user facts/i,
  /^no facts to extract/i,
  /^\(no facts to extract/i,
  /^\(no extractable facts/i,
  /^no relevant user facts/i,
  /^no specific identifiers/i,
  /^no essential facts provided/i,
  /^no relevant facts extracted/i,
  /^no facts extracted/i,
];

/**
 * Returns true when the supplied string is an extraction failure message rather than
 * a real user fact.  Pure function — safe to call without a database connection.
 *
 * @param {string|null|undefined} content - The extracted content to evaluate.
 * @returns {boolean}
 */
export function isEmptyExtractionResult(content) {
  if (!content) return false;
  return EMPTY_EXTRACTION_PATTERNS.some((p) => p.test(content.trim()));
}
