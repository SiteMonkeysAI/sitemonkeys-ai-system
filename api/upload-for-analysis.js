// api/upload-for-analysis.js
// EXACT COPY of working upload-file.js with minimal changes for analysis

import multer from "multer";
import path from "path";
import mammoth from "mammoth";

// Session storage for extracted documents with automatic cleanup
export const extractedDocuments = new Map();
const MAX_DOCUMENTS = 100;
let cleanupInterval = null;

// Automatic cleanup function - runs every minute
function autoCleanupDocuments() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  let cleanedCount = 0;

  for (const [docId, doc] of extractedDocuments.entries()) {
    if (doc.timestamp < tenMinutesAgo) {
      extractedDocuments.delete(docId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(
      `[DOCUMENT-CLEANUP] Removed ${cleanedCount} expired documents from memory`,
    );
  }

  const currentSize = extractedDocuments.size;
  if (currentSize > 0) {
    console.log(
      `[DOCUMENT-CLEANUP] Current documents in memory: ${currentSize}/${MAX_DOCUMENTS}`,
    );
  }
}

// Start automatic cleanup interval (runs every 60 seconds)
cleanupInterval = setInterval(autoCleanupDocuments, 60000);

// Export function to stop cleanup on graceful shutdown
export function stopDocumentCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("[DOCUMENT-CLEANUP] Cleanup interval stopped");
  }
}

// Configure multer for file uploads (in-memory storage) - EXACT COPY

// Helper function to clean old documents (prevent memory bloat)
function cleanOldDocuments() {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, doc] of extractedDocuments.entries()) {
    if (doc.timestamp < tenMinutesAgo) {
      extractedDocuments.delete(key);
    }
  }
}

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10, // Max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types
    cb(null, true);
  },
});

// File type detection - EXACT COPY
function detectFileType(filename, mimetype) {
  const _ext = path.extname(filename).toLowerCase();

  // Images
  if (
    /\.(jpg|jpeg|png|gif|bmp|svg|tiff|webp)$/i.test(filename) ||
    mimetype.startsWith("image/")
  ) {
    return "image";
  }

  // Documents
  if (
    /\.(pdf|doc|docx|txt|md|rtf|odt)$/i.test(filename) ||
    mimetype.includes("document") ||
    mimetype.includes("pdf") ||
    mimetype.includes("text")
  ) {
    return "document";
  }

  // Spreadsheets
  if (
    /\.(xls|xlsx|csv|ods)$/i.test(filename) ||
    mimetype.includes("spreadsheet")
  ) {
    return "spreadsheet";
  }

  // Presentations
  if (
    /\.(ppt|pptx|odp)$/i.test(filename) ||
    mimetype.includes("presentation")
  ) {
    return "presentation";
  }

  // Audio
  if (
    /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(filename) ||
    mimetype.startsWith("audio/")
  ) {
    return "audio";
  }

  // Video
  if (
    /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(filename) ||
    mimetype.startsWith("video/")
  ) {
    return "video";
  }

  // Archives
  if (
    /\.(zip|rar|7z|tar|gz)$/i.test(filename) ||
    mimetype.includes("archive") ||
    mimetype.includes("compressed")
  ) {
    return "archive";
  }

  // Code files
  if (/\.(js|html|css|json|xml|py|java|cpp|c|php|rb|go|rs)$/i.test(filename)) {
    return "code";
  }

  return "other";
}

// Function 1: Extract content from DOCX (memory-efficient)
async function extractDocxContent(fileBuffer) {
  try {
    console.log("📄 Extracting content from .docx file...");
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const extractedText = result.value;

    // Immediately check if extraction worked
    if (extractedText && extractedText.trim().length > 0) {
      const wordCount = extractedText.split(/\s+/).length;
      console.log(`✅ Successfully extracted ${wordCount} words from .docx`);

      console.log(
        "📄 Full text length:",
        extractedText.length,
        "Preview length:",
        extractedText.substring(0, 200).length,
      );

      // Return BOTH preview and full text
      return {
        success: true,
        wordCount: wordCount,
        characterCount: extractedText.length,
        preview:
          extractedText.substring(0, 200) +
          (extractedText.length > 200 ? "..." : ""),
        fullText: extractedText,
        hasContent: true,
      };
    } else {
      console.log("⚠️ .docx file appears to be empty");
      return {
        success: false,
        error: "Document appears to be empty or unreadable",
      };
    }
  } catch (error) {
    console.error("❌ Error extracting .docx content:", error);
    return {
      success: false,
      error: `Failed to extract content: ${error.message}`,
    };
  }
}

// Function 2: Simple content analysis (no AI needed)
function analyzeContent(wordCount, characterCount, preview) {
  // Simple rule-based analysis - no external API calls
  let contentType = "General Document";
  const lowerPreview = preview.toLowerCase();

  if (
    lowerPreview.includes("business plan") ||
    lowerPreview.includes("executive summary")
  ) {
    contentType = "Business Document";
  } else if (
    lowerPreview.includes("resume") ||
    lowerPreview.includes("curriculum vitae")
  ) {
    contentType = "Resume/CV";
  } else if (
    lowerPreview.includes("contract") ||
    lowerPreview.includes("agreement")
  ) {
    contentType = "Legal Document";
  }

  const readingTime = Math.ceil(wordCount / 200); // ~200 words per minute

  return {
    contentType: contentType,
    readingTime: readingTime,
    summary: `${contentType} with ${wordCount} words (${readingTime} minute read)`,
  };
}

// Function 3: Extract key phrases (simple, memory-efficient)
function extractKeyPhrases(preview) {
  // Find sentences with key indicator words
  const sentences = preview.split(/[.!?]+/);
  const keyIndicators = [
    "objective",
    "goal",
    "action",
    "next step",
    "deadline",
    "important",
  ];

  const keyPhrases = sentences
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      return keyIndicators.some((indicator) => lower.includes(indicator));
    })
    .slice(0, 3)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  return keyPhrases;
}

// Function 4: Check if file is DOCX
function isDocxFile(file) {
  return (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.originalname.toLowerCase().endsWith(".docx")
  );
}

// Process uploaded file - EXACT COPY
async function processFile(file) {
  const fileType = detectFileType(file.originalname, file.mimetype);

  let processingResult = {
    success: true,
    message: "",
    type: fileType,
    size: file.size,
    preview: "",
    contentExtracted: false,
    docxAnalysis: null,
  };

  try {
    // SPECIAL HANDLING FOR DOCX FILES
    if (fileType === "document" && isDocxFile(file)) {
      console.log(`📄 Processing .docx file: ${file.originalname}`);

      // Extract content (memory-efficient)
      const extractionResult = await extractDocxContent(file.buffer);

      if (extractionResult.success) {
        // Mark as extracted
        processingResult.contentExtracted = true;

        // Do simple analysis
        const analysis = analyzeContent(
          extractionResult.wordCount,
          extractionResult.characterCount,
          extractionResult.preview,
        );

        // Extract key phrases
        const keyPhrases = extractKeyPhrases(extractionResult.preview);

        // Store analysis results
        processingResult.docxAnalysis = {
          wordCount: extractionResult.wordCount,
          characterCount: extractionResult.characterCount,
          contentType: analysis.contentType,
          readingTime: analysis.readingTime,
          keyPhrases: keyPhrases,
          preview: extractionResult.preview,
          fullText: extractionResult.fullText,
        };

        processingResult.message = `DOCX analyzed: ${file.originalname} (${extractionResult.wordCount} words)`;
        processingResult.preview = `📄 ${analysis.summary}`;
      } else {
        // Content extraction failed
        processingResult.message = `DOCX processing failed: ${extractionResult.error}`;
        processingResult.preview = `❌ Could not extract content from ${file.originalname}`;
        processingResult.success = false;
      }
    } else {
      // Handle all other file types (your existing logic)
      switch (fileType) {
        case "image":
          processingResult.message = `Image uploaded for analysis: ${file.originalname}`;
          processingResult.preview = `Image ready for analysis and processing`;
          break;

        case "document":
          processingResult.message = `Document uploaded for analysis: ${file.originalname}`;
          processingResult.preview = `Document ready for text analysis and processing`;
          break;

        case "spreadsheet":
          processingResult.message = `Spreadsheet uploaded for analysis: ${file.originalname}`;
          processingResult.preview = `Data tables ready for analysis`;
          break;

        case "code":
          processingResult.message = `Code file uploaded for analysis: ${file.originalname}`;
          processingResult.preview = `Source code ready for review and analysis`;
          break;

        default:
          processingResult.message = `File uploaded for analysis: ${file.originalname}`;
          processingResult.preview = `File stored and ready for processing`;
      }
    }

    // Store metadata (same as before, but with docx info)
    processingResult.metadata = {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadTime: new Date().toISOString(),
      fileType: fileType,
      contentExtracted: processingResult.contentExtracted,
      hasDocxAnalysis: !!processingResult.docxAnalysis,
    };
  } catch (error) {
    processingResult.success = false;
    processingResult.message = `Failed to process ${file.originalname}: ${error.message}`;
    console.error("❌ Error in processFile:", error);
  }

  return processingResult;
}

// Multer error handler wrapper - returns JSON errors instead of HTML
function handleMulterError(err, req, res, next) {
  if (err) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ANALYSIS] Multer error:`, err.message);

    // Log field name for debugging
    if (err.field) {
      console.error(`[${timestamp}] [ANALYSIS] Unexpected field: "${err.field}"`);
    }

    return res.status(400).json({
      success: false,
      status: "error",
      message: `Upload error: ${err.message}`,
      error: err.message,
      field: err.field || null,
      successful_uploads: 0,
      failed_uploads: 0,
      files: [],
    });
  }
  next();
}

// Main upload handler - EXACT COPY with analysis-specific logging
async function handleAnalysisUpload(req, res) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ANALYSIS] File upload request received`);

  try {
    // Check if files were uploaded - ensure req.files is an array
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      console.log(`[${timestamp}] [ANALYSIS] No files in request`);
      return res.status(400).json({
        status: "error",
        message: "No files uploaded",
        successful_uploads: 0,
        failed_uploads: 0,
        files: [],
      });
    }

    // Enforce document limit before processing new upload
    if (extractedDocuments.size >= MAX_DOCUMENTS) {
      console.warn(
        `[${timestamp}] [ANALYSIS] Document limit reached (${MAX_DOCUMENTS}), forcing immediate cleanup`,
      );
      autoCleanupDocuments();

      // If still at limit after cleanup, reject new upload
      if (extractedDocuments.size >= MAX_DOCUMENTS) {
        console.error(`[${timestamp}] [ANALYSIS] Still at limit after cleanup - rejecting upload`);
        return res.status(429).json({
          status: "error",
          message:
            "Document storage limit reached. Please try again in a few minutes.",
          error: "Too many documents in memory",
          successful_uploads: 0,
          failed_uploads: req.files.length,
          files: [],
          currentDocuments: extractedDocuments.size,
          maxDocuments: MAX_DOCUMENTS,
        });
      }
    }

    // Ensure req.files is a valid array to prevent type confusion
    if (!Array.isArray(req.files)) {
      console.log(`[${timestamp}] [ANALYSIS] Unexpected type for req.files: ${typeof req.files}`);
      return res.status(400).json({
        status: "error",
        message: "Malformed upload: files must be an array",
        successful_uploads: 0,
        failed_uploads: 0,
        files: [],
      });
    }

    console.log(`[${timestamp}] [ANALYSIS] Processing ${req.files.length} file(s)`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each uploaded file
    for (const file of req.files) {
      console.log(
        `🔄 [Analysis] Processing: ${file.originalname} (${file.size} bytes)`,
      );

      try {
        const result = await processFile(file);

        if (result.success) {
          successCount++;
          results.push({
            success: true,
            filename: file.originalname,
            message: result.message,
            type: result.type,
            size: result.size,
            folder: "analysis",
            preview: result.preview,
            metadata: result.metadata,
            contentExtracted: result.contentExtracted,
            docxAnalysis: result.docxAnalysis, // This contains the word count, analysis, etc.
          });
          console.log(
            `✅ [Analysis] Successfully processed: ${file.originalname}`,
          );
        } else {
          failureCount++;
          results.push({
            success: false,
            filename: file.originalname,
            message: result.message,
            error: "Processing failed",
          });
          console.log(`❌ [Analysis] Failed to process: ${file.originalname}`);
        }
      } catch (error) {
        failureCount++;
        results.push({
          success: false,
          filename: file.originalname,
          message: `Upload failed: ${error.message}`,
          error: error.message,
        });
        console.log(
          `❌ [Analysis] Error processing ${file.originalname}:`,
          error,
        );
      }
    }

    // Return results - FRONTEND COMPATIBLE
    const response = {
      success: successCount > 0,
      status: successCount > 0 ? "success" : "error",
      message: `Analysis upload complete: ${successCount} successful, ${failureCount} failed`,
      files_processed: successCount,
      successful_uploads: successCount,
      failed_uploads: failureCount,
      files: results,
      analysis_results: results.map((file) => ({
        filename: file.filename,
        success: file.success,
        analysis: file.docxAnalysis
          ? `DOCX Content: ${file.docxAnalysis.wordCount} words, Type: ${file.docxAnalysis.contentType}`
          : file.success
            ? `File "${file.filename}" uploaded and ready for analysis.`
            : `Failed to process ${file.filename}`,
        type: file.type,
        wordCount: file.docxAnalysis?.wordCount,
        contentType: file.docxAnalysis?.contentType,
        contentExtracted: file.contentExtracted,
        docxAnalysis: file.docxAnalysis,
      })),
      enhanced_query: null,
      system_status: {
        docx_extraction_enabled: true,
        memory_efficient: true,
      },
    };

    // Store extracted content for chat system access
    // ISSUE #776 FIX 2: Use unique key instead of "latest" to prevent overwrites
    results.forEach((file) => {
      if (file.contentExtracted) {
        const documentId = `${Date.now()}_${file.filename}`;
        const timestamp = new Date().toISOString();

        // Create unique key for each document instead of overwriting "latest"
        const documentKey = `doc_${Date.now()}_${file.filename.replace(/[^a-zA-Z0-9]/g, '_')}`;

        extractedDocuments.set(documentKey, {
          id: documentId,
          filename: file.filename,
          content: file.docxAnalysis.preview,
          fullContent: file.docxAnalysis.fullText,
          wordCount: file.docxAnalysis.wordCount,
          contentType: file.docxAnalysis.contentType,
          keyPhrases: file.docxAnalysis.keyPhrases,
          timestamp: Date.now(),
        });

        console.log(
          `[${timestamp}] [STORAGE] Stored document with key "${documentKey}" for chat: ${file.filename} (${file.docxAnalysis.wordCount} words, ${file.docxAnalysis.fullText.length} chars)`,
        );
      }
    });

    // Clean old documents
    cleanOldDocuments();

    console.log(
      `📊 [Analysis] Upload complete: ${successCount}/${req.files.length} successful`,
    );
    res.json(response);
  } catch (error) {
    console.error("❌ [Analysis] Upload endpoint error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error during file upload",
      error: error.message,
      successful_uploads: 0,
      failed_uploads: req.files ? req.files.length : 0,
      files: [],
    });
  }
}

// Export with different names to avoid conflicts - EXACT PATTERN
// Accept field name "files" to match frontend FormData
export const analysisMiddleware = upload.array("files", 10);
export { handleAnalysisUpload, handleMulterError };
