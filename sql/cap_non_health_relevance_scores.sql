-- Migration: Cap non-health memory relevance scores at 0.85
-- ============================================================================
--
-- !! DOES NOT RUN AUTOMATICALLY ON RAILWAY DEPLOYMENT !!
--
-- Railway only runs "node server.js". This SQL file must be executed manually
-- against the production PostgreSQL database after the code fix has been
-- deployed. Skipping this step means already-inflated Apple/Amazon memories
-- will continue to bypass the similarity threshold until they are next
-- accessed (at which point the new 0.85 ceiling kicks in). Running this
-- script clears the problem immediately.
--
-- ============================================================================
-- HOW TO RUN
-- ============================================================================
--
-- Option A — npm script (recommended, no psql required):
--
--   DATABASE_URL="<your Railway postgres URL>" npm run migrate:cap-scores
--
--   The DATABASE_URL is shown in your Railway project under:
--   Variables → DATABASE_URL  (looks like postgresql://user:pass@host/db)
--
-- Option B — psql directly (requires psql installed locally):
--
--   psql "$DATABASE_URL" -f sql/cap_non_health_relevance_scores.sql
--
-- Option C — Railway shell (if Railway CLI is installed):
--
--   railway run psql "$DATABASE_URL" -f sql/cap_non_health_relevance_scores.sql
--
-- ============================================================================
-- WHAT IT DOES
-- ============================================================================
--
-- Background:
--   boostExistingMemory() previously applied a flat ceiling of 1.0 for ALL
--   categories. After 4-6 accesses, non-health memories (e.g. Apple, Amazon,
--   Tesla business facts) could accumulate relevance_score >= 0.90, bypassing
--   the similarity threshold and injecting into completely unrelated queries
--   (e.g. "What is the capital of Zimbabwe?").
--
-- This one-time migration resets any non-health memories that already exceed
-- 0.85 back to 0.85, immediately preventing them from triggering the safety
-- bypass. Health/safety categories retain scores up to 1.0 and are excluded.
--
-- Safe to re-run — the WHERE clause is idempotent.
--
-- ============================================================================

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
