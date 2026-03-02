-- ISSUE #814/#824 DATABASE CLEANUP SCRIPT
-- This script removes corrupted memory entries identified in the production audit.
-- Must be run manually against Railway PostgreSQL.
-- ISSUE #824: Memory 2903 is STILL being retrieved in production as of 2026-03-02.
--   This script MUST be run to kill it. It consumes 1,322 tokens on every retrieval
--   and blocks all useful memories from being injected.
--
-- NOTE: The table column for memory text is 'content', not 'facts'.
--
-- Run these commands individually to verify before deleting:

-- ============================================================================
-- FAILURE 7: "Contacts: What's Apple." — corrupted contact entry from stored query
-- ============================================================================
-- This memory pollutes every query mentioning "Apple" due to entity boost.
-- Verify before deletion:
-- SELECT id, content, category_name FROM persistent_memories WHERE id = 8614;

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
-- SELECT id, content, category_name FROM persistent_memories WHERE id IN (8611, 8612, 8617);

DELETE FROM persistent_memories WHERE id IN (8611, 8612, 8617);
-- Expected: 3 rows deleted


-- ============================================================================
-- ROOT CAUSE F: 1,322-token single memory entry consuming entire budget
-- ============================================================================
-- Memory 2903 contains an entire document summary (Site Monkeys .docx content)
-- as a single 1,322-token entry. When retrieved, it blocks all other memories.
--
-- Verify this is the Site Monkeys .docx summary before deletion:
-- SELECT id, LEFT(content, 100) AS preview, LENGTH(content) AS char_length, token_count
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
SELECT id, content, category_name
FROM persistent_memories
WHERE content LIKE 'What%'
   OR content LIKE 'How%'
   OR content LIKE 'When%'
   OR content LIKE 'Where%'
   OR content LIKE 'Why%'
ORDER BY id DESC
LIMIT 20;


-- Find other oversized entries (>1000 tokens ≈ >4000 chars):
SELECT id, category_name, LENGTH(content) AS char_length, LEFT(content, 100) AS preview
FROM persistent_memories
WHERE LENGTH(content) > 4000
ORDER BY LENGTH(content) DESC
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
