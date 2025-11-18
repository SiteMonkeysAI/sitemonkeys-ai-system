// ================================================================
// test-newline-trace.js - Complete trace from fact extraction to database storage
// Tests whether newlines (\n) are preserved through the entire pipeline
// ================================================================

import pg from 'pg';
const { Pool } = pg;

// Simple test to verify newline handling
async function testNewlinePreservation() {
  console.log('='.repeat(80));
  console.log('NEWLINE PRESERVATION TEST - Tracing from array to database');
  console.log('='.repeat(80));
  
  // Test 1: Array join with newlines
  console.log('\n[TEST 1] Array join with \\n');
  const facts = ['User has pet monkeys.', 'Assistant unaware of monkeys.'];
  const joined = facts.join('\n');
  console.log('Input array:', facts);
  console.log('Joined string:', JSON.stringify(joined));
  console.log('Joined string (actual):', joined);
  console.log('Contains \\n?', joined.includes('\n'));
  console.log('Character codes:', Array.from(joined).map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' '));
  
  // Test 2: Verify the literal newline character
  console.log('\n[TEST 2] Newline character verification');
  const testString = 'Line 1\nLine 2';
  console.log('Test string:', testString);
  console.log('JSON.stringify:', JSON.stringify(testString));
  console.log('Split by \\n:', testString.split('\n'));
  
  // Test 3: Database parameterized query
  console.log('\n[TEST 3] Database parameterized query test');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    return;
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Create a test table
    console.log('Creating test table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS newline_test (
        id SERIAL PRIMARY KEY,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Clear existing test data
    await pool.query('DELETE FROM newline_test');
    
    // Test inserting with newlines
    const testContent = 'User has pet monkeys.\nAssistant unaware of monkeys.';
    console.log('\nInserting test content:');
    console.log('  Input string:', JSON.stringify(testContent));
    console.log('  Contains \\n?', testContent.includes('\n'));
    
    const insertResult = await pool.query(
      'INSERT INTO newline_test (content) VALUES ($1) RETURNING id, content',
      [testContent]
    );
    
    console.log('\nInsert result:');
    console.log('  ID:', insertResult.rows[0].id);
    console.log('  Returned content:', JSON.stringify(insertResult.rows[0].content));
    console.log('  Contains \\n?', insertResult.rows[0].content.includes('\n'));
    
    // Test retrieving the data
    const selectResult = await pool.query(
      'SELECT id, content FROM newline_test WHERE id = $1',
      [insertResult.rows[0].id]
    );
    
    console.log('\nSelect result:');
    console.log('  Retrieved content:', JSON.stringify(selectResult.rows[0].content));
    console.log('  Contains \\n?', selectResult.rows[0].content.includes('\n'));
    console.log('  Actual output:', selectResult.rows[0].content);
    
    // Test keyword search on the data
    console.log('\n[TEST 4] Keyword search test');
    const searchResults = await pool.query(
      "SELECT id, content FROM newline_test WHERE content ILIKE '%monkeys%'",
      []
    );
    
    console.log('Search results for "%monkeys%":');
    console.log('  Found:', searchResults.rows.length, 'rows');
    searchResults.rows.forEach(row => {
      console.log('  Row', row.id, ':', JSON.stringify(row.content));
    });
    
    // Test search for "monkeys.Assistant" (the concatenated version)
    const badSearchResults = await pool.query(
      "SELECT id, content FROM newline_test WHERE content ILIKE '%monkeys.Assistant%'",
      []
    );
    
    console.log('\nSearch results for "%monkeys.Assistant%":');
    console.log('  Found:', badSearchResults.rows.length, 'rows');
    
    // Test with actual facts array join
    console.log('\n[TEST 5] Simulating aggressivePostProcessing output');
    const factsArray = [
      'User has pet monkeys.',
      'Assistant unaware of monkeys.',
      'User asked about preferences.'
    ];
    const factsJoined = factsArray.join('\n');
    
    console.log('Facts array:', factsArray);
    console.log('Facts joined:', JSON.stringify(factsJoined));
    console.log('Contains \\n?', factsJoined.includes('\n'));
    
    await pool.query('DELETE FROM newline_test');
    const insertResult2 = await pool.query(
      'INSERT INTO newline_test (content) VALUES ($1) RETURNING id, content',
      [factsJoined]
    );
    
    console.log('\nInsert result 2:');
    console.log('  Returned content:', JSON.stringify(insertResult2.rows[0].content));
    console.log('  Contains \\n?', insertResult2.rows[0].content.includes('\n'));
    console.log('  Actual output:', insertResult2.rows[0].content);
    
    // Cleanup
    await pool.query('DROP TABLE IF EXISTS newline_test');
    console.log('\n✅ Test table cleaned up');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));
}

// Run the test
testNewlinePreservation().catch(console.error);
