// Document Service - Handles document storage, chunking, embedding, and search
// Supports PDF, DOCX, and TXT files with semantic search capabilities

import { encoding_for_model } from 'tiktoken';
import { generateEmbedding, cosineSimilarity } from './embedding-service.js';
import mammoth from 'mammoth';

// Initialize tiktoken encoder for token counting
const encoder = encoding_for_model('gpt-4');

// Track table initialization state
let tablesInitialized = false;

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initializeDocumentTables(pool) {
  console.log('[DOCUMENT-SERVICE] Initializing database tables...');

  try {
    // Create documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        mode VARCHAR(50) DEFAULT 'truth-general',
        filename TEXT NOT NULL,
        original_size INTEGER,
        content_type TEXT,
        full_content TEXT,
        store_full_content BOOLEAN DEFAULT false,
        chunk_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create document_chunks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        mode VARCHAR(50) DEFAULT 'truth-general',
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        embedding FLOAT4[],
        embedding_status TEXT DEFAULT 'pending',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient queries
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_user_mode ON documents(user_id, mode)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_user_mode ON document_chunks(user_id, mode)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id, chunk_index)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_status ON document_chunks(embedding_status)`);

    console.log('[DOCUMENT-SERVICE] Database tables initialized successfully');
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Error initializing tables:', error.message);
    throw error;
  }
}

export async function ensureTablesExist(dbPool) {
  if (!tablesInitialized) {
    await initializeDocumentTables(dbPool);
    tablesInitialized = true;
  }
}

// ============================================
// TEXT EXTRACTION
// ============================================

export async function extractText(buffer, mimetype, filename) {
  try {
    let text = '';
    let metadata = {};

    // Handle PDF files
    if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      // Lazy import pdf-parse to avoid test file bug on module load
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
      metadata.pageCount = pdfData.numpages;
      metadata.info = pdfData.info;
    }
    // Handle DOCX files
    else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || filename.endsWith('.docx')) {
      const docxData = await mammoth.extractRawText({ buffer });
      text = docxData.value;
      metadata.messages = docxData.messages;
    }
    // Handle plain text files
    else if (mimetype === 'text/plain' || filename.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    }
    // Unsupported file type
    else {
      return {
        success: false,
        error: `Unsupported file type: ${mimetype}`
      };
    }

    return {
      success: true,
      text,
      metadata
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Text extraction error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// TEXT CHUNKING
// ============================================

export function chunkText(text, config = {}) {
  const {
    chunkSize = 800,      // Target tokens per chunk
    minChunkSize = 512,   // Minimum chunk size
    maxChunkSize = 1024,  // Maximum chunk size
    overlap = 50          // Overlap between chunks in tokens
  } = config;

  // Split text into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = encoder.encode(paragraph).length;

    // If adding this paragraph would exceed max chunk size, start a new chunk
    if (currentTokens > 0 && currentTokens + paragraphTokens > maxChunkSize) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens
      });

      // Start new chunk with overlap
      const overlapText = getLastNTokens(currentChunk, overlap);
      currentChunk = overlapText + '\n\n' + paragraph;
      currentTokens = encoder.encode(currentChunk).length;
    }
    // If current chunk is large enough and adding would exceed target, start new
    else if (currentTokens >= minChunkSize && currentTokens + paragraphTokens > chunkSize) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens
      });

      const overlapText = getLastNTokens(currentChunk, overlap);
      currentChunk = overlapText + '\n\n' + paragraph;
      currentTokens = encoder.encode(currentChunk).length;
    }
    // Otherwise, add to current chunk
    else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens = encoder.encode(currentChunk).length;
    }
  }

  // Add final chunk if it exists
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: currentTokens
    });
  }

  return chunks;
}

function getLastNTokens(text, n) {
  const tokens = encoder.encode(text);
  if (tokens.length <= n) return text;

  const lastTokens = tokens.slice(-n);
  return encoder.decode(lastTokens);
}

// ============================================
// DOCUMENT STORAGE
// ============================================

export async function storeDocument(userId, mode, filename, buffer, mimetype, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }

  try {
    // Extract text from document
    const extractResult = await extractText(buffer, mimetype, filename);
    if (!extractResult.success) {
      return extractResult;
    }

    const { text, metadata: extractMetadata } = extractResult;

    // Chunk the text
    const chunks = chunkText(text);
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    // Store document record
    const docResult = await dbPool.query(
      `INSERT INTO documents (user_id, mode, filename, original_size, content_type, chunk_count, total_tokens, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [userId, mode, filename, buffer.length, mimetype, chunks.length, totalTokens, extractMetadata]
    );

    const documentId = docResult.rows[0].id;

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      await dbPool.query(
        `INSERT INTO document_chunks (document_id, user_id, mode, chunk_index, content, token_count, embedding_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [documentId, userId, mode, i, chunks[i].content, chunks[i].tokenCount]
      );
    }

    console.log(`[DOCUMENT-SERVICE] Stored document ${documentId} with ${chunks.length} chunks (${totalTokens} tokens)`);

    return {
      success: true,
      documentId,
      chunkCount: chunks.length,
      totalTokens
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Storage error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// EMBEDDING GENERATION
// ============================================

export async function embedDocumentChunks(documentId, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }
  const timeout = options.timeout || 30000;

  try {
    // Get all pending chunks for this document
    const chunksResult = await dbPool.query(
      `SELECT id, content FROM document_chunks
       WHERE document_id = $1 AND embedding_status = 'pending'
       ORDER BY chunk_index`,
      [documentId]
    );

    const chunks = chunksResult.rows;
    let embedded = 0;
    let failed = 0;

    for (const chunk of chunks) {
      try {
        // Generate embedding
        const embeddingResult = await generateEmbedding(chunk.content, { timeout });

        if (embeddingResult.success) {
          // Store embedding
          // Convert embedding array to JSON string for vector(1536) type
          const embeddingStr = JSON.stringify(embeddingResult.embedding);
          await dbPool.query(
            `UPDATE document_chunks
             SET embedding = $1::vector(1536), embedding_status = 'ready'
             WHERE id = $2`,
            [embeddingStr, chunk.id]
          );
          embedded++;
        } else {
          // Mark as failed
          await dbPool.query(
            `UPDATE document_chunks
             SET embedding_status = 'failed'
             WHERE id = $1`,
            [chunk.id]
          );
          failed++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[DOCUMENT-SERVICE] Embedding error for chunk ${chunk.id}:`, error.message);
        await dbPool.query(
          `UPDATE document_chunks
           SET embedding_status = 'failed'
           WHERE id = $1`,
          [chunk.id]
        );
        failed++;
      }
    }

    console.log(`[DOCUMENT-SERVICE] Embedded ${embedded}/${chunks.length} chunks for document ${documentId}`);

    return {
      success: true,
      embedded,
      failed,
      total: chunks.length
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Embedding process error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function backfillDocumentEmbeddings(options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }
  const batchSize = options.batchSize || 50;
  const maxBatches = options.maxBatches || 10;

  try {
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let batch = 0; batch < maxBatches; batch++) {
      // Get pending chunks
      const chunksResult = await dbPool.query(
        `SELECT id, content FROM document_chunks
         WHERE embedding_status IN ('pending', 'failed')
         ORDER BY id
         LIMIT $1`,
        [batchSize]
      );

      const chunks = chunksResult.rows;
      if (chunks.length === 0) break;

      for (const chunk of chunks) {
        try {
          const embeddingResult = await generateEmbedding(chunk.content);

          if (embeddingResult.success) {
            // Convert embedding array to JSON string for vector(1536) type
            const embeddingStr = JSON.stringify(embeddingResult.embedding);
            await dbPool.query(
              `UPDATE document_chunks
               SET embedding = $1::vector(1536), embedding_status = 'ready'
               WHERE id = $2`,
              [embeddingStr, chunk.id]
            );
            totalSucceeded++;
          } else {
            await dbPool.query(
              `UPDATE document_chunks
               SET embedding_status = 'failed'
               WHERE id = $1`,
              [chunk.id]
            );
            totalFailed++;
          }

          totalProcessed++;

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[DOCUMENT-SERVICE] Backfill error for chunk ${chunk.id}:`, error.message);
          totalFailed++;
          totalProcessed++;
        }
      }
    }

    // Get remaining count
    const remainingResult = await dbPool.query(
      `SELECT COUNT(*) FROM document_chunks WHERE embedding_status IN ('pending', 'failed')`
    );
    const remaining = parseInt(remainingResult.rows[0].count);

    console.log(`[DOCUMENT-SERVICE] Backfill complete: ${totalSucceeded} succeeded, ${totalFailed} failed, ${remaining} remaining`);

    return {
      success: true,
      processed: totalProcessed,
      succeeded: totalSucceeded,
      failed: totalFailed,
      remaining
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Backfill error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// SEMANTIC SEARCH
// ============================================

export async function searchDocuments(userId, mode, queryEmbedding, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }
  const topK = options.topK || 5;
  const tokenBudget = options.tokenBudget || 3000;

  try {
    // Get all chunks for this user and mode with embeddings
    // Cast vector type to text for JSON parsing in Node.js
    const chunksResult = await dbPool.query(
      `SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.token_count,
              dc.embedding::text as embedding, d.filename
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE dc.user_id = $1 AND dc.mode = $2 AND dc.embedding_status = 'ready'`,
      [userId, mode]
    );

    const chunks = chunksResult.rows;

    // Parse embeddings (handle both FLOAT4[] and vector(1536) types)
    const chunksWithParsedEmbeddings = chunks.map(chunk => {
      let embedding = chunk.embedding;

      // If embedding is a string (from pgvector vector type), parse it
      if (typeof embedding === 'string') {
        try {
          embedding = JSON.parse(embedding);
        } catch (error) {
          console.warn(`[DOCUMENT-SERVICE] Failed to parse embedding for chunk ${chunk.id}: ${error.message}`);
          embedding = null;
        }
      }

      return { ...chunk, embedding };
    });

    // Calculate similarity scores
    const scoredChunks = chunksWithParsedEmbeddings
      .filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
      .map(chunk => ({
        ...chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }));

    // Sort by similarity
    scoredChunks.sort((a, b) => b.similarity - a.similarity);

    // Apply topK and token budget
    const selectedChunks = [];
    let totalTokens = 0;

    for (const chunk of scoredChunks) {
      if (selectedChunks.length >= topK) break;
      if (totalTokens + chunk.token_count > tokenBudget) break;

      selectedChunks.push({
        documentId: chunk.document_id,
        chunkIndex: chunk.chunk_index,
        filename: chunk.filename,
        content: chunk.content,
        tokenCount: chunk.token_count,
        similarity: chunk.similarity
      });

      totalTokens += chunk.token_count;
    }

    return {
      chunks: selectedChunks,
      totalTokens,
      totalAvailable: chunks.length
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Search error:', error.message);
    return {
      chunks: [],
      error: error.message
    };
  }
}

// ============================================
// DOCUMENT MANAGEMENT
// ============================================

export async function getUserDocuments(userId, mode, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }

  try {
    const result = await dbPool.query(
      `SELECT id, filename, original_size, content_type, chunk_count, total_tokens,
              metadata, created_at
       FROM documents
       WHERE user_id = $1 AND mode = $2
       ORDER BY created_at DESC`,
      [userId, mode]
    );

    return {
      success: true,
      documents: result.rows
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Get documents error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function deleteDocument(documentId, userId, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }

  try {
    // Delete with ownership verification
    const result = await dbPool.query(
      `DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [documentId, userId]
    );

    if (result.rowCount === 0) {
      return {
        success: false,
        error: 'Document not found or access denied'
      };
    }

    console.log(`[DOCUMENT-SERVICE] Deleted document ${documentId}`);

    return {
      success: true,
      documentId
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Delete error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getDocumentStatus(documentId, options = {}) {
  const dbPool = options.pool;
  if (!dbPool) {
    throw new Error('Database pool is required in options.pool');
  }

  try {
    // Get document info
    const docResult = await dbPool.query(
      `SELECT id, filename, chunk_count, total_tokens FROM documents WHERE id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    // Get embedding status
    const statusResult = await dbPool.query(
      `SELECT embedding_status, COUNT(*) as count
       FROM document_chunks
       WHERE document_id = $1
       GROUP BY embedding_status`,
      [documentId]
    );

    const status = {
      pending: 0,
      ready: 0,
      failed: 0
    };

    for (const row of statusResult.rows) {
      status[row.embedding_status] = parseInt(row.count);
    }

    return {
      success: true,
      document: docResult.rows[0],
      embeddingStatus: status
    };
  } catch (error) {
    console.error('[DOCUMENT-SERVICE] Status check error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
