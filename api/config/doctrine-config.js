/**
 * Doctrine Configuration - Truth-First Response Standards
 *
 * Configuration for doctrine gate enforcement levels and thresholds
 */

export const DOCTRINE_CONFIG = {
  enabled: true,

  // Enforcement levels
  enforcement: {
    standard: 'warn',      // Log warning, return response
    strict: 'enhance',     // Auto-enhance failing responses
    maximum: 'block'       // Block responses that can't be fixed
  },

  // Current enforcement level
  currentLevel: 'enhance',

  // Minimum scores by context
  minimumScores: {
    casual: 0.5,
    standard: 0.6,
    professional: 0.7,
    highStakes: 0.8        // Financial, medical, legal
  },

  // High-stakes topic detection
  highStakesPatterns: [
    /invest|stock|crypto|financial/i,
    /medical|diagnosis|symptom|treatment/i,
    /legal|lawsuit|contract|liability/i,
    /suicide|self-harm|emergency/i
  ]
};
