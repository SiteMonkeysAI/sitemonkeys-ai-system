-- Migration: Cap non-health memory relevance scores at 0.85
--
-- Background:
--   boostExistingMemory() previously applied a flat ceiling of 1.0 for ALL categories.
--   After 4-6 accesses, non-health memories (e.g. Apple, Amazon, Tesla business facts)
--   could accumulate relevance_score >= 0.90, bypassing the similarity threshold and
--   injecting into completely unrelated queries (e.g. "What is the capital of Zimbabwe?").
--
-- This one-time migration resets any non-health memories that already exceed 0.85 back
-- to 0.85, immediately preventing them from triggering the safety bypass.
--
-- Health/safety categories retain scores up to 1.0 and are intentionally excluded.
--
-- Run once after deploying the boostExistingMemory ceiling fix.

UPDATE persistent_memories
SET relevance_score = 0.85
WHERE relevance_score > 0.85
  AND category_name NOT IN (
    'health_wellness',
    'health',
    'medical',
    'allergies',
    'medications'
  );
