// lib/vault-loader.js
// Vault loading functionality with dynamic googleapis import
// This file is ONLY loaded when vault operations are requested

import axios from "axios";
import JSZip from "jszip";
import xml2js from "xml2js";
import { promisify } from "util";
import zlib from "zlib";

const gunzip = promisify(zlib.gunzip);
const VAULT_FOLDER_ID = "1LAkbqjN7g-HJV9BRWV-AsmMpY1JzJiIM";

// Global variable - googleapis loads here via dynamic import
let google = null;

/**
 * Extract text content from DOCX file data
 */
async function extractTextFromDocx(docxBuffer) {
  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(docxBuffer);

    const documentXml = await zipContent
      .file("word/document.xml")
      .async("string");

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(documentXml);

    const textElements = [];

    function extractText(node) {
      if (node && typeof node === "object") {
        if (node["w:t"] && Array.isArray(node["w:t"])) {
          node["w:t"].forEach((textNode) => {
            if (textNode && textNode._) {
              textElements.push(textNode._);
            } else if (typeof textNode === "string") {
              textElements.push(textNode);
            }
          });
        }

        Object.keys(node).forEach((key) => {
          if (Array.isArray(node[key])) {
            node[key].forEach((child) => extractText(child));
          } else if (typeof node[key] === "object") {
            extractText(node[key]);
          }
        });
      }
    }

    extractText(result);

    const extractedText = textElements.join(" ");
    const lines = extractedText.split("\n");
    const cleanedLines = lines
      .filter((line) => line.trim())
      .map((line) => line.trim());

    return cleanedLines.join("\n");
  } catch (error) {
    return `[DOCX text extraction failed: ${error.message}]`;
  }
}

/**
 * Initialize Google Drive service with credentials
 * Uses dynamic import to avoid loading googleapis at server startup
 */
async function getGoogleDriveService() {
  // Lazy load googleapis only when needed
  if (!google) {
    console.log("📦 Loading googleapis library...");
    const googleapis = await import("googleapis");
    google = googleapis.google;
    console.log("✅ googleapis loaded");
  }

  try {
    const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const projectNumber = process.env.GOOGLE_PROJECT_NUMBER;

    if (!credsJson) {
      throw new Error("GOOGLE_CREDENTIALS_JSON environment variable not found");
    }
    if (!projectId) {
      throw new Error("GOOGLE_PROJECT_ID environment variable not found");
    }

    console.log(`Using Project ID: ${projectId}`);
    console.log(`Using Project Number: ${projectNumber}`);

    const credsInfo = JSON.parse(credsJson);
    credsInfo.project_id = projectId;
    if (projectNumber) {
      credsInfo.project_number = projectNumber;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: credsInfo,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    return google.drive({ version: "v3", auth });
  } catch (error) {
    throw new Error(`Google Drive authentication failed: ${error.message}`);
  }
}

/**
 * Store vault data in Railway KV
 */
async function storeVaultInKv(vaultData) {
  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      console.log("⚠️ KV environment variables not found");
      return false;
    }

    const headers = {
      Authorization: `Bearer ${kvToken}`,
      "Content-Type": "application/json",
    };

    const kvKey = "sitemonkeys_vault_v2";
    const response = await axios.post(
      `${kvUrl}/set/${kvKey}`,
      JSON.stringify(vaultData),
      { headers, timeout: 30000 },
    );

    if (response.status === 200) {
      console.log(`✅ Vault stored in KV`);
      return true;
    } else {
      console.log(`❌ KV storage failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ KV storage error: ${error.message}`);
    return false;
  }
}

/**
 * Get vault data from Railway KV
 */
async function getVaultFromKv() {
  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      console.log("⚠️ KV environment variables not found");
      return null;
    }

    const headers = {
      Authorization: `Bearer ${kvToken}`,
    };

    const kvKey = "sitemonkeys_vault_v2";
    const response = await axios.get(`${kvUrl}/get/${kvKey}`, {
      headers,
      timeout: 10000,
    });

    console.log(`KV GET response status: ${response.status}`);
    console.log(
      `KV GET response data length: ${response.data ? JSON.stringify(response.data).length : 0}`,
    );

    if (response.status === 200) {
      try {
        const data = response.data;

        if (data === null || data === undefined) {
          console.log("⚠️ No vault data found in KV (null response)");
          return null;
        }

        // Check if it's compressed
        if (typeof data === "object" && data.compressed) {
          console.log("🗜️ Decompressing vault data...");
          const compressedBuffer = Buffer.from(data.data, "base64");
          const decompressed = await gunzip(compressedBuffer);
          const result = JSON.parse(decompressed.toString("utf8"));
          console.log(
            `📦 Decompressed: ${data.compressed_size || 0} → ${data.original_size || 0} bytes`,
          );
          return result;
        } else {
          console.log(
            `✅ Retrieved vault data from KV: ${JSON.stringify(data).length} characters`,
          );
          return data;
        }
      } catch (parseError) {
        console.log(`❌ Failed to parse KV response: ${parseError.message}`);
        console.log(
          `Raw response: ${JSON.stringify(response.data).substring(0, 500)}...`,
        );
        return null;
      }
    } else {
      console.log(`❌ KV retrieval failed: ${response.status}`);
      console.log(`Error response: ${response.data}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ KV retrieval error: ${error.message}`);
    console.log(`Full error: ${error.stack}`);
    return null;
  }
}

/**
 * Load all content from Google Drive vault folders
 */
async function loadVaultContent() {
  let vaultContent = "=== SITEMONKEYS BUSINESS VALIDATION VAULT ===\n\n";
  let loadedFolders = [];
  let totalFiles = 0;

  try {
    const drive = await getGoogleDriveService();

    // Get subfolders in vault
    const query = `'${VAULT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder'`;
    const foldersResult = await drive.files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 50,
    });

    const folders = foldersResult.data.files || [];

    // Load ALL folders from the vault (no filtering)
    for (const folder of folders) {
      const folderName = folder.name;

      console.log(`📁 Loading folder: ${folderName}`);
      
      loadedFolders.push(folderName);
      vaultContent += `\n--- FOLDER: ${folderName} ---\n`;

      // Get files in each folder
      const fileQuery = `'${folder.id}' in parents`;
      const filesResult = await drive.files.list({
        q: fileQuery,
        fields: "files(id, name, mimeType, size)",
        pageSize: 100,
      });

      const files = filesResult.data.files || [];
      totalFiles += files.length;

      for (const file of files) {
        try {
          let fileContent = "";
          const fileMime = file.mimeType || "";
          const fileName = file.name;

          console.log(`Processing file: ${fileName} (type: ${fileMime})`);

          // Handle text files
          if (fileMime.includes("text/plain") || fileName.endsWith(".txt")) {
            try {
              const response = await drive.files.get(
                {
                  fileId: file.id,
                  alt: "media",
                },
                { responseType: "arraybuffer" },
              );

              fileContent = Buffer.from(response.data).toString("utf-8");
              console.log(
                `✅ Text file loaded: ${fileContent.length} characters`,
              );
            } catch (error) {
              fileContent = `[ERROR reading text file: ${error.message}]`;
              console.log(`❌ Text file error: ${error.message}`);
            }
          }
          // Handle Google Docs
          else if (fileMime === "application/vnd.google-apps.document") {
            try {
              const response = await drive.files.export(
                {
                  fileId: file.id,
                  mimeType: "text/plain",
                },
                { responseType: "arraybuffer" },
              );

              fileContent = Buffer.from(response.data).toString("utf-8");
              console.log(
                `✅ Google Doc exported: ${fileContent.length} characters`,
              );
            } catch (error) {
              fileContent = `[ERROR exporting Google Doc: ${error.message}]`;
              console.log(`❌ Google Doc export error: ${error.message}`);
            }
          }
          // Handle DOCX files
          else if (
            fileMime.includes(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ) ||
            fileName.endsWith(".docx")
          ) {
            try {
              console.log(`🔄 Downloading DOCX file: ${fileName}`);
              const response = await drive.files.get(
                {
                  fileId: file.id,
                  alt: "media",
                },
                { responseType: "arraybuffer" },
              );

              const fileData = Buffer.from(response.data);
              console.log(`📥 Downloaded ${fileData.length} bytes`);

              fileContent = await extractTextFromDocx(fileData);

              if (fileContent.startsWith("[DOCX text extraction failed")) {
                console.log(`❌ DOCX extraction failed: ${fileName}`);
              } else {
                console.log(
                  `✅ DOCX text extracted: ${fileContent.length} characters`,
                );
              }
            } catch (error) {
              fileContent = `[DOCX file - Access failed: ${error.message}]`;
              console.log(`❌ DOCX access error: ${error.message}`);
            }
          }
          // Skip folders
          else if (fileMime === "application/vnd.google-apps.folder") {
            continue;
          }
          // Skip other file types
          else {
            const fileSize = file.size || "Unknown";
            fileContent = `[File type: ${fileMime} - Size: ${fileSize} bytes - Skipped unsupported format]`;
            console.log(`⏭️ Skipped unsupported file: ${fileName}`);
          }

          vaultContent += `\n=== ${fileName} ===\n${fileContent}\n`;
        } catch (fileError) {
          vaultContent += `\n=== ${file.name} ===\n[ERROR loading file: ${fileError.message}]\n`;
          console.log(
            `❌ File processing error: ${file.name} - ${fileError.message}`,
          );
        }
      }
    }

    vaultContent =
      `\n=== LIVE VAULT FOLDERS LOADED (${loadedFolders.length} folders) ===\n` +
      vaultContent;
    vaultContent += `\n=== VAULT SUMMARY ===\nFolders: ${loadedFolders.length}\nFiles processed: ${totalFiles}\n`;

    console.log(
      `✅ Vault loaded successfully: ${folders.length} folders, ${totalFiles} files`,
    );
    console.log(`📊 Total vault content: ${vaultContent.length} characters`);
  } catch (driveError) {
    console.log(`❌ Google Drive error: ${driveError.message}`);
    vaultContent += `\n[Google Drive connection error: ${driveError.message}]\n`;
    loadedFolders = ["Error - Could not connect to Google Drive"];
    totalFiles = 0;
  }

  return { vaultContent, loadedFolders, totalFiles };
}

// Export all functions
export { loadVaultContent, getVaultFromKv, storeVaultInKv };
