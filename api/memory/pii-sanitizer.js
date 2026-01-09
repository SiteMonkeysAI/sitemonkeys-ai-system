/**
 * PII Sanitization Layer
 * Bible: Innovation #34, Section 4.3 Data Privacy
 * "A caring family member would NEVER repeat your SSN back to you"
 */

const PII_PATTERNS = {
  ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  bankAccount: /\b\d{8,17}\b/g
};

export function sanitizePII(content) {
  if (!content) return content;
  let sanitized = content;
  sanitized = sanitized.replace(PII_PATTERNS.ssn, '[SSN PROTECTED]');
  sanitized = sanitized.replace(PII_PATTERNS.creditCard, '[CARD PROTECTED]');
  sanitized = sanitized.replace(PII_PATTERNS.bankAccount, '[ACCOUNT PROTECTED]');
  return sanitized;
}
