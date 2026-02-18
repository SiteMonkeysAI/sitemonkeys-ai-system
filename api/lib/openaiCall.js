// OpenAI API Call Module with Retry Logic
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_WAIT_TIME = 30000; // 30 seconds

/**
 * Calculate exponential backoff wait time with cap
 * @param {number} attempt - Current attempt number
 * @returns {number} - Wait time in milliseconds
 */
function calculateBackoffWaitTime(attempt) {
  return Math.min(Math.pow(2, attempt) * 1000, MAX_WAIT_TIME);
}

/**
 * Call OpenAI API with exponential backoff retry logic
 * @param {Object} params - OpenAI API parameters
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Object>} - OpenAI API response
 */
export async function callOpenAI(params, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create(params);
      return response;
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (error.status && error.status !== 429 && error.status < 500) {
        throw error;
      }

      // Check if we should retry
      if (attempt < maxRetries - 1) {
        // Check if this is a rate limit error
        const isRateLimited =
          error.status === 429 || (error.message && error.message.includes('rate limit'));

        if (isRateLimited) {
          // Extract retry-after header if present
          let waitMs;
          const retryAfter =
            error.response?.headers?.['retry-after'] || error.headers?.['retry-after'];
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            waitMs = isNaN(parsed) ? calculateBackoffWaitTime(attempt) : parsed * 1000;
          } else {
            // Exponential backoff with cap
            waitMs = calculateBackoffWaitTime(attempt);
          }

          console.log(
            `⏳ Rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else {
          // For other errors, use standard exponential backoff
          const waitMs = calculateBackoffWaitTime(attempt);
          console.log(
            `⚠️ Request failed. Retrying in ${waitMs}ms (${attempt + 1}/${maxRetries})...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }
  }

  throw lastError;
}

export default callOpenAI;
