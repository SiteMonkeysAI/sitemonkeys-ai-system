// api/lib/document-extractor.js
// Unified document text extraction pipeline with OCR fallback.
// Supports: DOCX, PDF (text layer + OCR fallback), images (OCR), plain text.

import path from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import vision from '@google-cloud/vision';

// --- Configuration (from environment) ---
// OCR_ENABLED is read at call time so the kill switch works without restart
// All other config is read at module load (standard for server config)
const OCR_PROVIDER = process.env.OCR_PROVIDER || 'google_vision';
const OCR_MAX_PAGES = parseInt(process.env.OCR_MAX_PAGES || '10', 10);
const OCR_DPI = parseInt(process.env.OCR_DPI || '200', 10);

function isOcrEnabled() {
  return process.env.OCR_ENABLED !== 'false';
}

// Minimum characters required to accept extracted text as meaningful content
const MIN_VIABLE_CHARS = 50;

// File extension lists
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'];
const TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.log',
  '.yaml',
  '.yml',
];

// Method identifiers that represent stubs (no usable content extracted)
export const STUB_METHODS = ['pdf_stub', 'image_stub', 'unsupported_stub'];

// --- Stub builders ---

function buildUnreadableStub(file) {
  return (
    `[Document: "${file.originalname}" — OCR returned insufficient content. ` +
    `This appears to be image-based or low quality. ` +
    `Try re-uploading at higher resolution or paste the text directly into chat.]`
  );
}

function buildUnsupportedStub(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  return `[Document: "${file.originalname}" — File type "${ext || file.mimetype}" is not supported for text extraction.]`;
}

// --- PDF text-layer extraction (fast path) ---

async function tryPdfParse(buffer) {
  try {
    const pdfData = await pdfParse(buffer);
    return { text: pdfData.text || '', pages: pdfData.numpages || 0 };
  } catch (err) {
    console.log(`[UPLOAD] pdf_parse_error reason="${err.message}"`);
    return { text: '', pages: 0 };
  }
}

// --- Google Cloud Vision: lazy singleton client ---
// Reads service account credentials from GOOGLE_CREDENTIALS_JSON at call time so
// the env var doesn't need to be set during module load (e.g. in test environments).
// Note: ImageAnnotatorClient constructor is synchronous, so Node.js's single-threaded
// event loop guarantees this lazy initializer is race-condition-free.

let _visionClient = null;

function getVisionClient() {
  if (_visionClient) return _visionClient;

  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credentialsJson) {
    throw new Error(
      'GOOGLE_CREDENTIALS_JSON environment variable is not set. ' +
        'Set it to the JSON content of your Google Cloud service account credentials file.',
    );
  }

  let credentials;
  try {
    credentials = JSON.parse(credentialsJson);
  } catch (err) {
    throw new Error(`GOOGLE_CREDENTIALS_JSON is not valid JSON: ${err.message}`);
  }

  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) {
    console.log(
      '[UPLOAD] Warning: GOOGLE_PROJECT_ID is not set — using project from service account credentials',
    );
  }

  _visionClient = new vision.ImageAnnotatorClient({
    credentials,
    ...(projectId ? { projectId } : {}),
  });

  return _visionClient;
}

// --- Google Cloud Vision: OCR for a single image buffer ---

async function ocrImageWithGoogleVision(imageBuffer) {
  const client = getVisionClient();
  const base64Image = imageBuffer.toString('base64');

  const [result] = await client.documentTextDetection({
    image: { content: base64Image },
  });

  const annotation = result.fullTextAnnotation;
  if (!annotation) return { text: '', confidence: 0 };

  const text = annotation.text || '';

  // Calculate average block confidence
  let totalConf = 0;
  let confCount = 0;
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      if (block.confidence != null) {
        totalConf += block.confidence;
        confCount++;
      }
    }
  }
  const confidence = confCount > 0 ? totalConf / confCount : 0;

  return { text, confidence };
}

// --- Google Cloud Vision: OCR for a PDF buffer ---
// Uses batchAnnotateFiles() which accepts inline PDFs with a pages filter.
// Each call processes up to 5 pages; batches when numPages > 5.

async function ocrPdfWithGoogleVision(pdfBuffer, numPages) {
  const client = getVisionClient();

  const pagesToProcess = Math.min(numPages, OCR_MAX_PAGES);
  const partial = numPages > OCR_MAX_PAGES;
  const base64Pdf = pdfBuffer.toString('base64');

  let allText = '';
  let totalConf = 0;
  let confCount = 0;

  // Google Vision inline PDF limit: 5 pages per request
  const BATCH_SIZE = 5;
  for (let startPage = 1; startPage <= pagesToProcess; startPage += BATCH_SIZE) {
    const endPage = Math.min(startPage + BATCH_SIZE - 1, pagesToProcess);
    const pageList = [];
    for (let p = startPage; p <= endPage; p++) pageList.push(p);

    const [batchResponse] = await client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: base64Pdf,
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: pageList,
        },
      ],
    });

    const fileResponse = (batchResponse.responses || [])[0] || {};
    const pageResponses = fileResponse.responses || [];
    for (const pageResp of pageResponses) {
      const annotation = pageResp.fullTextAnnotation;
      if (annotation) {
        allText += annotation.text + '\n';
        for (const page of annotation.pages || []) {
          for (const block of page.blocks || []) {
            if (block.confidence != null) {
              totalConf += block.confidence;
              confCount++;
            }
          }
        }
      }
    }
  }

  const confidence = confCount > 0 ? totalConf / confCount : 0;
  return {
    text: allText.trim(),
    confidence,
    pagesProcessed: pagesToProcess,
    totalPages: numPages,
    partial,
  };
}

// --- OCR dispatcher ---

async function ocrImage(imageBuffer) {
  if (OCR_PROVIDER === 'google_vision') {
    return ocrImageWithGoogleVision(imageBuffer);
  }
  throw new Error(`Unsupported OCR_PROVIDER: "${OCR_PROVIDER}". Supported: google_vision`);
}

async function ocrPdf(pdfBuffer, numPages) {
  if (OCR_PROVIDER === 'google_vision') {
    return ocrPdfWithGoogleVision(pdfBuffer, numPages);
  }
  throw new Error(`Unsupported OCR_PROVIDER: "${OCR_PROVIDER}". Supported: google_vision`);
}

// --- Main extraction function ---

/**
 * Extract text from an uploaded file.
 * Returns { text, method, pages?, confidence?, partial?, reason? }
 *
 * method values:
 *   'docx'            — mammoth DOCX extraction
 *   'pdf_text'        — pdf-parse text-layer extraction
 *   'pdf_ocr'         — OCR fallback for scanned/image PDFs
 *   'pdf_stub'        — PDF unreadable after all attempts
 *   'image_ocr'       — OCR on uploaded image
 *   'image_stub'      — image unreadable after OCR attempt
 *   'text'            — plain text / markdown / csv / json
 *   'unsupported_stub'— file type not supported
 */
export async function extractDocumentText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  console.log(
    `[UPLOAD] file_received name="${file.originalname}" mime="${mime}" size=${file.size}`,
  );

  // 1) DOCX
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = result.value || '';
    return { text, method: 'docx' };
  }

  // 2) PDF — text layer first, OCR fallback
  if (mime === 'application/pdf' || ext === '.pdf') {
    const { text: pdfText, pages } = await tryPdfParse(file.buffer);
    console.log(
      `[UPLOAD] pdf_text_attempt chars=${pdfText.trim().length} pages=${pages}` +
        (pdfText.trim().length < MIN_VIABLE_CHARS ? ' (below threshold)' : ''),
    );

    if (pdfText.trim().length >= MIN_VIABLE_CHARS) {
      return { text: pdfText, method: 'pdf_text', pages };
    }

    // OCR kill switch
    if (!isOcrEnabled()) {
      console.log(`[UPLOAD] ocr_skipped reason="OCR_ENABLED=false"`);
      return {
        text: buildUnreadableStub(file),
        method: 'pdf_stub',
        pages,
        reason: 'OCR disabled via OCR_ENABLED=false',
      };
    }

    const effectivePages = pages || 1;
    console.log(
      `[UPLOAD] pdf_ocr_attempt pages=${effectivePages} engine=${OCR_PROVIDER} dpi=${OCR_DPI}`,
    );

    try {
      const ocrResult = await ocrPdf(file.buffer, effectivePages);
      const ocrText = ocrResult.text;
      const confStr = ocrResult.confidence.toFixed(2);
      console.log(
        `[UPLOAD] ocr_result chars=${ocrText.length} confidence=${confStr}` +
          (ocrText.trim().length < MIN_VIABLE_CHARS ? ' (below threshold)' : ''),
      );

      if (ocrText.trim().length >= MIN_VIABLE_CHARS) {
        let finalText = ocrText;
        if (ocrResult.partial) {
          finalText +=
            `\n\n[Note: Partial extraction — first ${ocrResult.pagesProcessed} of ` +
            `${ocrResult.totalPages} pages processed. ` +
            `Remaining pages were not processed due to the OCR_MAX_PAGES=${OCR_MAX_PAGES} limit.]`;
        }
        return {
          text: finalText,
          method: 'pdf_ocr',
          pages: ocrResult.pagesProcessed,
          totalPages: ocrResult.totalPages,
          confidence: ocrResult.confidence,
          partial: ocrResult.partial,
        };
      }

      console.log(
        `[UPLOAD] stored_stub method=pdf_stub reason="OCR returned insufficient content"`,
      );
    } catch (ocrErr) {
      console.log(`[UPLOAD] pdf_ocr_failed reason="${ocrErr.message}"`);
    }

    return {
      text: buildUnreadableStub(file),
      method: 'pdf_stub',
      pages: effectivePages,
      reason: 'OCR returned insufficient content',
    };
  }

  // 3) Images — OCR directly
  const isImageMime = mime.startsWith('image/');
  const isImageExt = IMAGE_EXTENSIONS.includes(ext);
  if (isImageMime || isImageExt) {
    if (!isOcrEnabled()) {
      console.log(`[UPLOAD] ocr_skipped reason="OCR_ENABLED=false"`);
      return {
        text: `[Image: "${file.originalname}" — OCR is disabled. Enable OCR_ENABLED=true to extract text from image files.]`,
        method: 'image_stub',
        reason: 'OCR disabled via OCR_ENABLED=false',
      };
    }

    console.log(`[UPLOAD] image_ocr_attempt engine=${OCR_PROVIDER}`);

    try {
      const ocrResult = await ocrImage(file.buffer);
      const ocrText = ocrResult.text;
      const confStr = ocrResult.confidence.toFixed(2);
      console.log(
        `[UPLOAD] ocr_result chars=${ocrText.length} confidence=${confStr}` +
          (ocrText.trim().length < MIN_VIABLE_CHARS ? ' (below threshold)' : ''),
      );

      if (ocrText.trim().length >= MIN_VIABLE_CHARS) {
        return { text: ocrText, method: 'image_ocr', confidence: ocrResult.confidence };
      }

      console.log(
        `[UPLOAD] stored_stub method=image_stub reason="OCR returned insufficient content"`,
      );
    } catch (ocrErr) {
      console.log(`[UPLOAD] image_ocr_failed reason="${ocrErr.message}"`);
    }

    return {
      text: buildUnreadableStub(file),
      method: 'image_stub',
      reason: 'OCR returned insufficient content',
    };
  }

  // 4) Plain text files
  const isTextExt = TEXT_EXTENSIONS.includes(ext);
  const isTextMime = mime.startsWith('text/');
  if (isTextMime || isTextExt) {
    const text = file.buffer.toString('utf8');
    return { text, method: 'text' };
  }

  // 5) Unsupported
  return { text: buildUnsupportedStub(file), method: 'unsupported_stub' };
}
