/**
 * SCALE HARNESS RATE LIMITERS
 *
 * Rate limiting for scale testing endpoints to prevent abuse
 * and control cost during stress testing.
 *
 * @module api/middleware/scale-rate-limit
 */

import rateLimit from 'express-rate-limit';

const scaleRateLimiters = {
  generate: rateLimit({
    windowMs: 60000, // 1 minute
    max: 5,
    message: { error: 'Rate limit exceeded for scale-generate' },
  }),

  benchmark: rateLimit({
    windowMs: 60000, // 1 minute
    max: 3,
    message: { error: 'Rate limit exceeded for scale-benchmark' },
  }),

  full: rateLimit({
    windowMs: 60000, // 1 minute
    max: 1,
    message: { error: 'Rate limit exceeded for scale-full' },
  }),

  cleanup: rateLimit({
    windowMs: 60000, // 1 minute
    max: 10,
    message: { error: 'Rate limit exceeded for scale-cleanup' },
  }),

  status: rateLimit({
    windowMs: 60000, // 1 minute
    max: 10,
    message: { error: 'Rate limit exceeded for scale-status' },
  }),

  embed: rateLimit({
    windowMs: 60000, // 1 minute
    max: 3,
    message: { error: 'Rate limit exceeded for scale-embed' },
  }),
};

export default scaleRateLimiters;
