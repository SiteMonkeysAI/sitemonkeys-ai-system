// api/lib/validators/index.js

/**
 * Validators Index - Central export for all deterministic validators
 * 
 * Validators are organized by execution phase:
 * - PRE-RESPONSE: Run before AI generation
 * - POST-RESPONSE: Run after AI generation, before user sees response
 */

// Import validators for use in getAllValidatorStats()
import { driftWatcher } from './drift-watcher.js';
import { initiativeEnforcer } from './initiative-enforcer.js';
import { memoryUsageEnforcer } from './memory-usage-enforcer.js';
import { manipulationGuard } from './manipulation-guard.js';
import { characterPreservationValidator } from './character-preservation.js';
import { anchorPreservationValidator } from './anchor-preservation.js';
import { refusalMaintenanceValidator } from './refusal-maintenance.js';
import { conflictDetectionValidator } from './conflict-detection.js';

// Re-export validators for external use
export { driftWatcher };
export { initiativeEnforcer };
export { memoryUsageEnforcer };
export { manipulationGuard };
export { characterPreservationValidator };
export { anchorPreservationValidator };
export { refusalMaintenanceValidator };
export { conflictDetectionValidator };

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
