// api/utilities/vault-loader.js
// INTELLIGENT VAULT LOADER - 3-Core-File Preload Strategy
// Reduces initial load from 135K to 60K chars while maintaining on-demand access

/**
 * VAULT LOADING STRATEGY:
 * 1. PRELOAD: 3 core files (~60K chars) loaded at startup
 *    - Founder's Directive (critical business rules)
 *    - Pricing Strategy (revenue protection)
 *    - Operational Framework (day-to-day guidance)
 * 
 * 2. ON-DEMAND: Remaining files indexed and loaded as needed
 *    - Technical documentation
 *    - Marketing materials
 *    - Case studies
 *    - Extended policies
 * 
 * 3. CACHE: Frequently accessed files kept in memory
 *    - LRU cache with 10-file limit
 *    - Auto-refresh every 30 minutes
 */

import { google } from 'googleapis';

// Core files to preload (always in memory)
const CORE_FILES = [
  'founders_directive.txt',
  'pricing_strategy.txt',
  'operational_framework.txt'
];

// Maximum sizes for efficiency
const MAX_CORE_SIZE = 60000; // 60K chars (~15K tokens)
const MAX_EXTENDED_SIZE = 30000; // 30K chars per extended file
const MAX_CACHE_FILES = 10;

class VaultLoader {
  constructor() {
    this.coreContent = null;
    this.fileIndex = new Map();
    this.cache = new Map(); // LRU cache for extended files
    this.cacheOrder = []; // Track access order for LRU
    this.lastRefresh = null;
    this.loadingPromise = null;
    
    this.log = (message) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [VAULT-LOADER] ${message}`);
    };
    
    this.error = (message, error) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [VAULT-LOADER ERROR] ${message}`, error || '');
    };
  }

  /**
   * Initialize vault loader - preload core files
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.loadingPromise) {
      this.log('Initialization already in progress, waiting...');
      return this.loadingPromise;
    }

    this.loadingPromise = this._performInitialization();
    return this.loadingPromise;
  }

  async _performInitialization() {
    try {
      this.log('Starting vault initialization...');
      
      // Step 1: Build file index
      await this._buildFileIndex();
      this.log(`File index built: ${this.fileIndex.size} files discovered`);
      
      // Step 2: Preload core files
      await this._preloadCoreFiles();
      this.log(`Core files preloaded: ${this.coreContent?.length || 0} chars`);
      
      // Step 3: Set global vault content for backward compatibility
      if (this.coreContent) {
        global.vaultContent = this.coreContent;
        this.log('Global vault content set for orchestrator compatibility');
      }
      
      this.lastRefresh = Date.now();
      this.log('✅ Vault loader initialized successfully');
      return true;
      
    } catch (error) {
      this.error('Initialization failed', error);
      this.loadingPromise = null;
      return false;
    }
  }

  /**
   * Build index of all available vault files
   */
  async _buildFileIndex() {
    try {
      // Check if vault content is available in environment
      if (process.env.VAULT_CONTENT) {
        this.log('Vault content available from environment variable');
        
        // Parse vault content to identify sections/files
        const vaultContent = process.env.VAULT_CONTENT;
        const sections = this._parseSections(vaultContent);
        
        sections.forEach((section, index) => {
          const fileName = section.name || `section_${index}`;
          this.fileIndex.set(fileName, {
            name: fileName,
            size: section.content.length,
            isCore: CORE_FILES.includes(fileName.toLowerCase()),
            content: section.content,
            source: 'environment'
          });
        });
        
        this.log(`Indexed ${sections.length} sections from environment`);
        return;
      }
      
      // Fallback: Try Google Drive if credentials available
      if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
        this.log('Attempting Google Drive indexing...');
        await this._indexGoogleDrive();
        return;
      }
      
      this.log('No vault source available - using empty index');
      
    } catch (error) {
      this.error('Failed to build file index', error);
    }
  }

  /**
   * Parse vault content into sections
   */
  _parseSections(vaultContent) {
    const sections = [];
    
    // Look for document markers
    const markers = [
      /\[DOCUMENT:\s*([^\]]+)\]/gi,
      /FILE:\s*([^\n]+)/gi,
      /={3,}\s*([^\n]+)\s*={3,}/gi
    ];
    
    let currentPos = 0;
    const matches = [];
    
    // Find all section boundaries
    markers.forEach(pattern => {
      const found = [...vaultContent.matchAll(pattern)];
      found.forEach(match => {
        matches.push({
          index: match.index,
          name: match[1].trim(),
          marker: match[0]
        });
      });
    });
    
    // Sort by position
    matches.sort((a, b) => a.index - b.index);
    
    // Extract sections
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i < matches.length - 1 ? matches[i + 1].index : vaultContent.length;
      const content = vaultContent.substring(start, end).trim();
      
      sections.push({
        name: matches[i].name,
        content: content,
        size: content.length
      });
    }
    
    // If no sections found, treat entire content as one section
    if (sections.length === 0) {
      sections.push({
        name: 'complete_vault',
        content: vaultContent,
        size: vaultContent.length
      });
    }
    
    return sections;
  }

  /**
   * Preload core files into memory
   */
  async _preloadCoreFiles() {
    try {
      const coreFiles = [];
      let totalSize = 0;
      
      // Collect core files from index
      for (const [fileName, fileInfo] of this.fileIndex.entries()) {
        if (fileInfo.isCore || CORE_FILES.some(core => fileName.toLowerCase().includes(core.replace(/\.txt$/, '')))) {
          coreFiles.push(fileInfo);
          totalSize += fileInfo.size;
        }
      }
      
      // If no specific core files found, use first N files up to size limit
      if (coreFiles.length === 0) {
        this.log('No specific core files found, selecting by priority...');
        const allFiles = Array.from(this.fileIndex.values());
        
        for (const file of allFiles) {
          if (totalSize + file.size <= MAX_CORE_SIZE) {
            coreFiles.push(file);
            totalSize += file.size;
          }
        }
      }
      
      // Assemble core content
      const coreParts = [];
      for (const file of coreFiles) {
        coreParts.push(`\n${'='.repeat(60)}\n`);
        coreParts.push(`CORE FILE: ${file.name}\n`);
        coreParts.push(`${'='.repeat(60)}\n`);
        coreParts.push(file.content);
        coreParts.push('\n');
      }
      
      this.coreContent = coreParts.join('');
      
      // Truncate if still too large
      if (this.coreContent.length > MAX_CORE_SIZE) {
        this.log(`Core content exceeds limit (${this.coreContent.length}), truncating to ${MAX_CORE_SIZE}`);
        this.coreContent = this.coreContent.substring(0, MAX_CORE_SIZE);
      }
      
      this.log(`Preloaded ${coreFiles.length} core files: ${this.coreContent.length} chars`);
      
    } catch (error) {
      this.error('Failed to preload core files', error);
      this.coreContent = '';
    }
  }

  /**
   * Get core vault content (always available)
   */
  getCoreContent() {
    return this.coreContent || '';
  }

  /**
   * Load extended file on demand
   */
  async loadExtendedFile(fileName) {
    try {
      // Check cache first
      if (this.cache.has(fileName)) {
        this._updateLRU(fileName);
        this.log(`Cache hit: ${fileName}`);
        return this.cache.get(fileName);
      }
      
      // Check file index
      const fileInfo = this.fileIndex.get(fileName);
      if (!fileInfo) {
        this.log(`File not found in index: ${fileName}`);
        return null;
      }
      
      // Load content
      let content = fileInfo.content;
      
      // If content not in index, load from source
      if (!content && fileInfo.source === 'google_drive') {
        content = await this._loadFromGoogleDrive(fileInfo.id);
      }
      
      // Truncate if needed
      if (content && content.length > MAX_EXTENDED_SIZE) {
        this.log(`Extended file ${fileName} truncated from ${content.length} to ${MAX_EXTENDED_SIZE} chars`);
        content = content.substring(0, MAX_EXTENDED_SIZE);
      }
      
      // Add to cache
      this._addToCache(fileName, content);
      
      return content;
      
    } catch (error) {
      this.error(`Failed to load extended file: ${fileName}`, error);
      return null;
    }
  }

  /**
   * Get complete vault content (core + all indexed files)
   * WARNING: This can be large, use sparingly
   */
  async getCompleteVault() {
    try {
      const parts = [this.coreContent];
      
      // Add all indexed files not in core
      for (const [fileName, fileInfo] of this.fileIndex.entries()) {
        if (!fileInfo.isCore) {
          const content = await this.loadExtendedFile(fileName);
          if (content) {
            parts.push(`\n${'='.repeat(60)}\n`);
            parts.push(`EXTENDED FILE: ${fileName}\n`);
            parts.push(`${'='.repeat(60)}\n`);
            parts.push(content);
          }
        }
      }
      
      return parts.join('\n');
      
    } catch (error) {
      this.error('Failed to get complete vault', error);
      return this.coreContent || '';
    }
  }

  /**
   * Search vault for specific content
   */
  async searchVault(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Search core content
    if (this.coreContent && this.coreContent.toLowerCase().includes(queryLower)) {
      results.push({
        source: 'core',
        content: this.coreContent,
        relevance: 'high'
      });
    }
    
    // Search indexed files
    for (const [fileName, fileInfo] of this.fileIndex.entries()) {
      if (fileName.toLowerCase().includes(queryLower)) {
        const content = await this.loadExtendedFile(fileName);
        if (content) {
          results.push({
            source: fileName,
            content: content,
            relevance: 'medium'
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Get vault statistics
   */
  getStats() {
    return {
      coreSize: this.coreContent?.length || 0,
      coreTokens: Math.ceil((this.coreContent?.length || 0) / 4),
      indexedFiles: this.fileIndex.size,
      cachedFiles: this.cache.size,
      lastRefresh: this.lastRefresh,
      initialized: !!this.coreContent
    };
  }

  /**
   * Refresh vault content (reload core files)
   */
  async refresh() {
    this.log('Refreshing vault content...');
    this.loadingPromise = null;
    this.coreContent = null;
    this.fileIndex.clear();
    this.cache.clear();
    this.cacheOrder = [];
    
    return this.initialize();
  }

  // ========== LRU CACHE MANAGEMENT ==========

  _addToCache(fileName, content) {
    // Remove oldest if cache is full
    if (this.cache.size >= MAX_CACHE_FILES && !this.cache.has(fileName)) {
      const oldest = this.cacheOrder.shift();
      this.cache.delete(oldest);
      this.log(`Cache evicted: ${oldest}`);
    }
    
    this.cache.set(fileName, content);
    this._updateLRU(fileName);
  }

  _updateLRU(fileName) {
    // Remove from current position
    const index = this.cacheOrder.indexOf(fileName);
    if (index > -1) {
      this.cacheOrder.splice(index, 1);
    }
    
    // Add to end (most recently used)
    this.cacheOrder.push(fileName);
  }

  // ========== GOOGLE DRIVE INTEGRATION ==========

  async _indexGoogleDrive() {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      
      const drive = google.drive({ version: 'v3', auth });
      
      // List files in vault folder
      const response = await drive.files.list({
        q: "mimeType='text/plain' and trashed=false",
        fields: 'files(id, name, size)',
        pageSize: 100,
      });
      
      response.data.files.forEach(file => {
        this.fileIndex.set(file.name, {
          name: file.name,
          id: file.id,
          size: parseInt(file.size || '0'),
          isCore: CORE_FILES.includes(file.name.toLowerCase()),
          source: 'google_drive'
        });
      });
      
      this.log(`Indexed ${response.data.files.length} files from Google Drive`);
      
    } catch (error) {
      this.error('Google Drive indexing failed', error);
    }
  }

  async _loadFromGoogleDrive(fileId) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      
      const drive = google.drive({ version: 'v3', auth });
      
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media',
      });
      
      return response.data;
      
    } catch (error) {
      this.error(`Failed to load file ${fileId} from Google Drive`, error);
      return null;
    }
  }
}

// Singleton instance
export const vaultLoader = new VaultLoader();

// Export for global access
if (typeof global !== 'undefined') {
  global.vaultLoader = vaultLoader;
}

export default vaultLoader;
