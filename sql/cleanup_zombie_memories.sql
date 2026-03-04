-- ZOMBIE MEMORY ENTRIES CLEANUP SCRIPT
-- Issue: Zombie Memory Entries + Storage Pipeline Pollution
--
-- These entries contain system component names, raw user prompts, and
-- extraction failure strings instead of actual user facts. They dominate
-- retrieval results because they score 2.2–2.4 relevance on nearly every
-- query (matching system architecture terms like "truthTypeDetector").
--
-- Must be run manually against Railway PostgreSQL after deployment.
-- NOTE: The table column for memory text is 'content', not 'facts'.
--
-- Run verify queries first, then the DELETE statements.
-- ============================================================================


-- ============================================================================
-- SECTION 1: Verify zombie entries before deletion
-- ============================================================================

-- Verify the known zombie IDs (should return their content for inspection):
SELECT id, LEFT(content, 120) AS content_preview, category_name, user_id
FROM persistent_memories
WHERE id IN (2864, 2865, 2902)
ORDER BY id;

-- Find all entries containing system component names across all users:
SELECT id, LEFT(content, 120) AS content_preview, category_name, user_id
FROM persistent_memories
WHERE content ILIKE '%truthTypeDetector%'
   OR content ILIKE '%externalLookupEngine%'
   OR content ILIKE '%ttlCacheManager%'
   OR content ILIKE '%hierarchyRouter%'
   OR content ILIKE '%Railway deployment%'
ORDER BY id;


-- ============================================================================
-- SECTION 2: Delete the known zombie entries
-- ============================================================================

-- Delete specific zombie IDs confirmed in production logs
-- (IDs 2864, 2865, 2902 plus related duplicate rows in issue evidence):
DELETE FROM persistent_memories
WHERE id IN (2864, 2865, 2902);
-- Expected: up to 3 rows deleted


-- ============================================================================
-- SECTION 3: Delete pattern-matched system metadata entries
-- ============================================================================

-- Delete all entries where content contains system component names.
-- These are technical architecture terms that should never appear in
-- personal memory entries (user_id = 'chris' or any real user).
--
-- SAFE: The storage pipeline now blocks these at write time (post-extraction
-- validation in validateExtractedFacts), so new entries won't be created.
DELETE FROM persistent_memories
WHERE content ILIKE '%truthTypeDetector%'
   OR content ILIKE '%externalLookupEngine%'
   OR content ILIKE '%ttlCacheManager%'
   OR content ILIKE '%hierarchyRouter%'
   OR content ILIKE '%Railway deployment%';
-- Review row count before committing; expect small number (< 20)


-- ============================================================================
-- SECTION 4: Verify cleanup completed
-- ============================================================================

-- Confirm the known IDs are gone:
SELECT COUNT(*) AS remaining_zombie_ids
FROM persistent_memories
WHERE id IN (2864, 2865, 2902);
-- Expected: 0

-- Confirm no system-component entries remain:
SELECT COUNT(*) AS remaining_system_metadata
FROM persistent_memories
WHERE content ILIKE '%truthTypeDetector%'
   OR content ILIKE '%externalLookupEngine%'
   OR content ILIKE '%ttlCacheManager%'
   OR content ILIKE '%hierarchyRouter%';
-- Expected: 0


-- ============================================================================
-- SECTION 5: Optional — find other potential pollution patterns
-- ============================================================================

-- Check for entries that look like raw user recall-questions stored as memories:
SELECT id, LEFT(content, 120) AS content_preview, category_name
FROM persistent_memories
WHERE content ILIKE 'What do you recall%'
   OR content ILIKE 'Can you remind me%'
   OR content ILIKE 'Do you remember%'
   OR content ILIKE 'What do you know about%'
ORDER BY id DESC
LIMIT 20;

-- Check for other oversized entries (> 500 tokens ≈ > 2000 chars) that may
-- block legitimate memories by consuming too much token budget:
SELECT id, category_name, LENGTH(content) AS char_length, LEFT(content, 100) AS preview
FROM persistent_memories
WHERE LENGTH(content) > 2000
ORDER BY LENGTH(content) DESC
LIMIT 10;


-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Code-level fixes deployed with this cleanup script prevent recurrence:
--    - detectNonUserQuery: memory-retrieval and meta-system patterns now blocked
--    - validateExtractedFacts: post-extraction filter rejects system component names
--    - applyListCompletenessFallback: contact-specific gate added
--    - #enforceUnicodeNames: "names" removed from isContactQuery (too broad)
--
-- 2. After running this script, monitor logs for:
--    - "[INTELLIGENT-STORAGE] ⏭️ Skipping storage — memory_retrieval_request_not_a_fact"
--    - "[INTELLIGENT-STORAGE] ⏭️ Skipping storage — meta_system_query_not_a_user_fact"
--    - "[INTELLIGENT-STORAGE] ⏭️ Skipping storage — extracted facts contain non-user metadata"
--    - Retrieval should no longer show "truthTypeDetector" in top results
-- ============================================================================
