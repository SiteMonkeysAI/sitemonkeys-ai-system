-- ISSUE #814 DATABASE CLEANUP SCRIPT
-- This script removes corrupted memory entries identified in the production audit.
-- Must be run manually against Railway PostgreSQL after PR #814 merge.
--
-- Run these commands individually to verify before deleting:

-- ============================================================================
-- FAILURE 7: "Contacts: What's Apple." — corrupted contact entry from stored query
-- ============================================================================
-- This memory pollutes every query mentioning "Apple" due to entity boost.
-- Verify before deletion:
-- SELECT id, facts, category FROM persistent_memories WHERE id = 8614;

DELETE FROM persistent_memories WHERE id = 8614;
-- Expected: 1 row deleted


-- ============================================================================
-- ROOT CAUSE A: Stored user questions (not facts) — pollute retrieval
-- ============================================================================
-- These memories contain the user's previous questions stored word-for-word
-- instead of extracted facts. They cause "question matches question" with
-- similarity ~1.0, consuming token budget while providing zero value.
--
-- Memory 8611: "What's the most up to date information from the news Greenland"
-- Memory 8612: "What's the most up-to-date information on Columbia since we went in and took their leader"
-- Memory 8617: (Likely a stored previous crypto question)
--
-- Verify before deletion:
-- SELECT id, facts, category FROM persistent_memories WHERE id IN (8611, 8612, 8617);

DELETE FROM persistent_memories WHERE id IN (8611, 8612, 8617);
-- Expected: 3 rows deleted


-- ============================================================================
-- ROOT CAUSE F: 1,322-token single memory entry consuming entire budget
-- ============================================================================
-- Memory 2903 contains an entire document summary (Site Monkeys .docx content)
-- as a single 1,322-token entry. When retrieved, it blocks all other memories.
--
-- Verify this is the Site Monkeys .docx summary before deletion:
-- SELECT id, LEFT(facts, 100) AS preview, LENGTH(facts) AS char_length 
-- FROM persistent_memories WHERE id = 2903;

DELETE FROM persistent_memories WHERE id = 2903;
-- Expected: 1 row deleted


-- ============================================================================
-- VERIFICATION QUERIES (Run after cleanup)
-- ============================================================================

-- Confirm deletions completed successfully:
SELECT 
  COUNT(*) AS remaining_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ All corrupted memories removed'
    ELSE '⚠️ Some memories still present - review logs'
  END AS status
FROM persistent_memories 
WHERE id IN (8614, 8611, 8612, 8617, 2903);


-- Check for other potentially corrupted entries (query-like text in facts):
SELECT id, facts, category 
FROM persistent_memories 
WHERE facts LIKE 'What%' 
   OR facts LIKE 'How%' 
   OR facts LIKE 'When%'
   OR facts LIKE 'Where%'
   OR facts LIKE 'Why%'
ORDER BY id DESC 
LIMIT 20;


-- Find other oversized entries (>1000 tokens ≈ >4000 chars):
SELECT id, category, LENGTH(facts) AS char_length, LEFT(facts, 100) AS preview
FROM persistent_memories 
WHERE LENGTH(facts) > 4000
ORDER BY LENGTH(facts) DESC
LIMIT 10;


-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. The code-level fixes in PR #814 prevent these issues from recurring:
--    - Root Cause A: Question filter added to intelligent-storage
--    - Root Cause F: 400-token cap added to storage chunking
--
-- 2. This cleanup only addresses the existing corrupted entries.
--    New entries will follow the fixed patterns.
--
-- 3. After running this script, monitor logs for:
--    - "Contacts: What's Apple" should no longer appear in any query
--    - Memory retrieval should show more diverse results (not dominated by one entry)
--    - Query-like text should not appear in new memory entries
-- ============================================================================
