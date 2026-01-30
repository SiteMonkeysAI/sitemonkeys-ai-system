// api/lib/validators/index.js

/**
 * Validators Index - Central export for all deterministic validators
 * 
 * Validators are organized by execution phase:
 * - PRE-RESPONSE: Run before AI generation
 * - POST-RESPONSE: Run after AI generation, before user sees response
 */

// Existing validators
export { driftWatcher } from './drift-watcher.js';
export { initiativeEnforcer } from './initiative-enforcer.js';
export { memoryUsageEnforcer } from './memory-usage-enforcer.js';

// NEW: Phase 1 Deterministic Validators (Issue #606)

// PRE-RESPONSE validators
export { manipulationGuard } from './manipulation-guard.js';

// POST-RESPONSE validators
export { characterPreservationValidator } from './character-preservation.js';
export { anchorPreservationValidator } from './anchor-preservation.js';
export { refusalMaintenanceValidator } from './refusal-maintenance.js';
export { conflictDetectionValidator } from './conflict-detection.js';

/**
 * Get stats from all validators
 */
export function getAllValidatorStats() {
  return {
    driftWatcher: driftWatcher.getEnforcementStats?.() || {},
    initiativeEnforcer: initiativeEnforcer.getEnforcementStats?.() || {},
    memoryUsageEnforcer: memoryUsageEnforcer.getEnforcementStats?.() || {},
    manipulationGuard: manipulationGuard.getStats?.() || {},
    characterPreservation: characterPreservationValidator.getStats?.() || {},
    anchorPreservation: anchorPreservationValidator.getStats?.() || {},
    refusalMaintenance: refusalMaintenanceValidator.getStats?.() || {},
    conflictDetection: conflictDetectionValidator.getStats?.() || {}
  };
}
