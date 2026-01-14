// ================================================================
// intelligent-storage.js - Intelligent Memory Storage with Compression & Deduplication
// Provides 10-20:1 compression ratio and duplicate detection
// ================================================================

import { OpenAI } from 'openai';
import { encoding_for_model } from 'tiktoken';
import { logMemoryOperation } from '../routes/debug.js';
import { embedMemoryNonBlocking } from '../services/embedding-service.js';
import { generateFactFingerprint, storeWithSupersession } from '../services/supersession.js';
import { SemanticAnalyzer } from '../core/intelligence/semantic_analyzer.js';

// Initialize semantic analyzer for importance scoring
const semanticAnalyzer = new SemanticAnalyzer();

/**
 * Boilerplate patterns that should NEVER be stored in memory
 */
const BOILERPLATE_PATTERNS = [
  /I don't retain memory/i,
  /session-based memory/i,
  /this appears to be our first interaction/i,
  /I'm an AI assistant/i,
  /confidence is lower than ideal/i,
  /I should clarify/i,
  /founder protection/i,
  /I cannot access previous conversations/i,
  /I don't have access to/i
];

/**
 * Intelligent Memory Storage System
 * Compresses verbose conversations and prevents duplicate storage
 */
export class IntelligentMemoryStorage {
  constructor(db, openaiKey) {
    // VALIDATION ADDED: ensure a usable database handle is provided
    if (!db || typeof db.query !== 'function') {
      throw new Error('Invalid database handle passed to IntelligentMemoryStorage');
    }

    this.db = db;
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.encoder = null;

    // Initialize encoder lazily to avoid blocking constructor
    this.initEncoder();
  }

  /**
   * Initialize tiktoken encoder
   */
  initEncoder() {
    try {
      this.encoder = encoding_for_model('gpt-4');
      console.log('[INTELLIGENT-STORAGE] ✅ Tiktoken encoder initialized');
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoder initialization failed:', error.message);
      console.log('[INTELLIGENT-STORAGE] Will use fallback token counting');
    }
  }

  /**
   * Sanitize content before storage - remove AI boilerplate
   * @param {string} content - Content to sanitize
   * @returns {string|null} - Sanitized content or null if should not be stored
   */
  sanitizeForStorage(content) {
    if (!content || typeof content !== 'string') return null;

    let sanitized = content;

    // Remove boilerplate patterns
    for (const pattern of BOILERPLATE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }

    // Trim and check if anything meaningful remains
    sanitized = sanitized.trim();

    // Reject if too short or looks like pure boilerplate
    if (sanitized.length < 10) return null;
    if (sanitized.toLowerCase().includes("i'm an ai")) return null;

    return sanitized;
  }

  /**
   * Detect fingerprint from EXTRACTED FACTS using semantic pattern matching
   * This is the CRITICAL FIX for Issue #498
   *
   * Instead of running brittle regex on raw user input, we detect fingerprints
   * on the CLEANED/COMPRESSED facts that the system already extracts.
   *
   * DOCTRINE ALIGNMENT:
   * - Genuine Intelligence (Doctrine 3): Uses semantic understanding on compressed facts
   * - Innovation #2: Enables semantic deduplication by detecting canonical fact types
   * - Innovation #3: Enables supersession by identifying updatable facts
   *
   * @param {string} facts - Extracted facts (compressed, cleaned content)
   * @returns {Promise<{ fingerprint: string|null, confidence: number, method: string }>}
   */
  async detectFingerprintFromFacts(facts) {
    if (!facts || typeof facts !== 'string') {
      return { fingerprint: null, confidence: 0, method: 'invalid_input' };
    }

    const factsLower = facts.toLowerCase();
    console.log('[SEMANTIC-FINGERPRINT] Analyzing facts:', facts.substring(0, 100));

    // CANONICAL FACT PATTERNS - Semantic, comprehensive detection
    // These patterns work on CLEANED facts, not raw user input
    // They detect semantic indicators (what the fact is about) + value patterns (specific values)
    const canonicalPatterns = [
      {
        id: 'user_salary',
        semanticIndicators: ['salary', 'income', 'pay', 'compensation', 'earning', 'wage', 'make', 'paid', 'raise', 'paying'],
        valuePatterns: [/\$[\d,]+/, /\d+k/i, /\d+,\d{3}/, /\d{5,}/],
        confidence: 0.90
      },
      {
        id: 'user_job_title',
        semanticIndicators: ['job', 'position', 'role', 'title', 'work as', 'employed as', 'engineer', 'manager', 'developer', 'analyst', 'director'],
        confidence: 0.85
      },
      {
        id: 'user_employer',
        semanticIndicators: ['company', 'employer', 'work at', 'employed by', 'organization', 'firm', 'working for'],
        confidence: 0.85
      },
      {
        id: 'user_phone_number',
        semanticIndicators: ['phone', 'number', 'call', 'mobile', 'cell', 'telephone', 'reach'],
        valuePatterns: [/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/, /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/],
        confidence: 0.95
      },
      {
        id: 'user_email',
        semanticIndicators: ['email', 'e-mail', 'mail', 'contact'],
        valuePatterns: [/[\w.-]+@[\w.-]+\.\w+/],
        confidence: 0.95
      },
      {
        id: 'user_location_residence',
        semanticIndicators: ['address', 'live', 'reside', 'location', 'home', 'house', 'moved', 'moving', 'based', 'from'],
        confidence: 0.85
      },
      {
        id: 'user_name',
        semanticIndicators: ['name', 'called', 'i\'m', 'i am'],
        confidence: 0.85
      },
      {
        id: 'user_allergy',
        semanticIndicators: ['allergy', 'allergic', 'intolerant', 'cannot eat', 'reaction to', 'peanut', 'shellfish', 'lactose'],
        confidence: 0.95  // HIGH - Safety critical
      },
      {
        id: 'user_medical',
        semanticIndicators: ['medical', 'condition', 'diagnosis', 'disease', 'illness', 'health', 'doctor'],
        confidence: 0.90  // HIGH - Health critical
      },
      {
        id: 'user_age',
        semanticIndicators: ['age', 'years old', 'born', 'birthday'],
        valuePatterns: [/\d{1,3}\s*years/, /\d{1,3}\s*old/, /age\s*\d+/],
        confidence: 0.90
      },
      {
        id: 'user_marital_status',
        semanticIndicators: ['married', 'single', 'divorced', 'engaged', 'spouse', 'wife', 'husband', 'partner'],
        confidence: 0.90
      },
      {
        id: 'user_spouse_name',
        semanticIndicators: ['wife', 'husband', 'spouse', 'partner', 'married to'],
        confidence: 0.85
      },
      {
        id: 'user_children_count',
        semanticIndicators: ['child', 'children', 'kid', 'son', 'daughter'],
        confidence: 0.85
      },
      {
        id: 'user_pet',
        semanticIndicators: ['pet', 'dog', 'cat', 'bird', 'fish', 'animal'],
        confidence: 0.80
      },
      {
        id: 'user_meeting_time',
        semanticIndicators: ['meeting', 'appointment', 'call', 'scheduled', 'rescheduled', 'moved', 'changed'],
        valuePatterns: [/\d{1,2}:\d{2}/, /\d{1,2}\s?(am|pm)/i, /\d{1,2}pm/i],
        confidence: 0.90
      },
      {
        id: 'user_favorite_color',
        semanticIndicators: ['favorite color', 'favourite color', 'color', 'like', 'prefer'],
        confidence: 0.80
      },
      {
        id: 'user_timezone',
        semanticIndicators: ['timezone', 'time zone', 'est', 'pst', 'cst', 'mst', 'utc', 'gmt'],
        confidence: 0.85
      }
    ];

    // Semantic matching: Check for indicator presence + value patterns (if required)
    for (const pattern of canonicalPatterns) {
      const hasIndicator = pattern.semanticIndicators.some(ind => factsLower.includes(ind.toLowerCase()));

      if (hasIndicator) {
        // If value patterns exist, verify at least one matches
        if (pattern.valuePatterns) {
          const hasValue = pattern.valuePatterns.some(vp => vp.test(facts));
          if (hasValue) {
            console.log(`[SEMANTIC-FINGERPRINT] ✅ Detected ${pattern.id} from facts (indicator + value, confidence: ${pattern.confidence})`);
            return {
              fingerprint: pattern.id,
              confidence: pattern.confidence,
              method: 'semantic_facts_with_value'
            };
          } else {
            // Has indicator but no value pattern - lower confidence
            console.log(`[SEMANTIC-FINGERPRINT] ⚠️ Found ${pattern.id} indicator but no value pattern`);
            continue;
          }
        } else {
          // No value pattern required, indicator is sufficient
          console.log(`[SEMANTIC-FINGERPRINT] ✅ Detected ${pattern.id} from facts (semantic indicator, confidence: ${pattern.confidence})`);
          return {
            fingerprint: pattern.id,
            confidence: pattern.confidence,
            method: 'semantic_facts'
          };
        }
      }
    }

    console.log('[SEMANTIC-FINGERPRINT] ❌ No fingerprint detected in facts');
    return { fingerprint: null, confidence: 0, method: 'no_match' };
  }

  /**
   * Detect if user is expressing priorities (UX-049)
   * @param {string} content - Content to check
   * @returns {boolean} - True if priority language detected
   */
  detectUserPriority(content) {
    if (!content || typeof content !== 'string') return false;

    const PRIORITY_PATTERNS = [
      /(?:i |my )(?:priority|priorities|most important|care most about)/i,
      /(?:always|never) (?:want|need|prefer)/i,
      /(?:this is|that's) (?:important|critical|essential)/i,
      /(?:don't|do not) ever/i,
      /(?:make sure|ensure|remember that)/i
    ];

    for (const pattern of PRIORITY_PATTERNS) {
      if (pattern.test(content)) {
        console.log(`[PRIORITY-DETECT] Pattern matched: ${pattern.toString()}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Main entry point - stores memory with compression and deduplication
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result with action taken
   */
  async storeWithIntelligence(userId, userMessage, aiResponse, category, mode = 'truth-general') {
    try {
      // TRACE LOGGING - Intelligent storage entry
      console.log('[TRACE-INTELLIGENT] I1. storeWithIntelligence called');
      console.log('[TRACE-INTELLIGENT] I2. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I3. category:', category);
      console.log('[TRACE-INTELLIGENT] I4. userMessage length:', userMessage?.length || 0);
      console.log('[TRACE-INTELLIGENT] I5. aiResponse length:', aiResponse?.length || 0);

      console.log('[INTELLIGENT-STORAGE] 🧠 Processing conversation for intelligent storage');

      // Step 0: Sanitize content before processing
      console.log('[TRACE-INTELLIGENT] I6. About to sanitize content...');
      const sanitizedResponse = this.sanitizeForStorage(aiResponse);
      if (!sanitizedResponse) {
        console.log('[TRACE-INTELLIGENT] I7. Content rejected as boilerplate');
        console.log('[INTELLIGENT-STORAGE] Rejected boilerplate content, not storing');
        return { action: 'rejected', reason: 'boilerplate_rejected' };
      }
      console.log('[TRACE-INTELLIGENT] I8. Content sanitized, length:', sanitizedResponse.length);

      // CRITICAL FIX: Detect fingerprint and importance BEFORE extraction
      // This preserves original content for analysis instead of analyzing compressed garbage

      // Step 0.5: Detect user priorities (UX-049) - on ORIGINAL message
      const userPriorityDetected = this.detectUserPriority(userMessage);
      if (userPriorityDetected) {
        console.log('[INTELLIGENT-STORAGE] 🎯 User priority detected - will boost importance');
      }

      // Step 0.7: Calculate importance score on ORIGINAL user message (before extraction)
      console.log('[INTELLIGENT-STORAGE] 🧠 Using semantic analyzer for importance scoring on original message...');
      const importanceResult = await semanticAnalyzer.analyzeContentImportance(userMessage, category);
      let importanceScore = importanceResult.importanceScore;
      console.log(`[SEMANTIC-IMPORTANCE] Score: ${importanceScore.toFixed(2)}, Reason: ${importanceResult.reasoning}`);

      // Boost importance if user priority detected (UX-049)
      if (userPriorityDetected) {
        console.log('[INTELLIGENT-STORAGE] 🎯 Boosting importance due to user priority (0.85 minimum)');
        importanceScore = Math.max(importanceScore, 0.85);
      }

      console.log(`[INTELLIGENT-STORAGE] 📊 Final importance score: ${importanceScore.toFixed(2)} (category: ${category})`);

      // Step 1: Extract facts (compression)
      console.log('[INTELLIGENT-STORAGE] 📝 Extracting key facts...');
      let facts = await this.extractKeyFacts(userMessage, sanitizedResponse);

      // GUARD: Never store empty or meaningless content - fallback to user message
      const isMeaningless = !facts ||
                           facts.trim().length === 0 ||
                           facts.toLowerCase().includes('no essential facts') ||
                           facts.toLowerCase().includes('no key facts') ||
                           facts.toLowerCase().includes('nothing to extract');

      if (isMeaningless) {
        console.log('[INTELLIGENT-STORAGE] ⚠️ No meaningful facts extracted, using fallback to original message');
        // Fallback: Use original user message directly (already has fingerprint and importance calculated)
        facts = userMessage.substring(0, 200).trim();

        // If user message also empty, skip storage entirely
        if (!facts || facts.trim().length === 0) {
          console.log('[INTELLIGENT-STORAGE] ⏭️ Skipping storage - no content');
          return { action: 'skipped', reason: 'no_content' };
        }

        console.log('[INTELLIGENT-STORAGE] ✅ Using original user message as facts:', facts.substring(0, 80));
      }

      const originalTokens = this.countTokens(userMessage + aiResponse);
      const compressedTokens = this.countTokens(facts);
      const ratio = originalTokens > 0 ? (originalTokens / compressedTokens).toFixed(1) : 1;

      console.log(`[INTELLIGENT-STORAGE] 📊 Compression: ${originalTokens} → ${compressedTokens} tokens (${ratio}:1)`);

      // Step 1.5: Detect fingerprint on EXTRACTED FACTS (not raw input)
      // This is the CRITICAL FIX for Issue #496 - semantic fingerprint detection
      console.log('[INTELLIGENT-STORAGE] 🔍 Detecting fact fingerprint on extracted facts...');
      const fingerprintResult = await this.detectFingerprintFromFacts(facts);
      console.log(`[INTELLIGENT-STORAGE] Fingerprint result: ${fingerprintResult.fingerprint || 'none'} (confidence: ${fingerprintResult.confidence}, method: ${fingerprintResult.method})`);

      // Step 2: Check for duplicates (now also checks for supersession)
      console.log('[INTELLIGENT-STORAGE] 🔍 Checking for similar memories...');
      const existing = await this.findSimilarMemories(userId, category, facts);

      // Step 3: Update existing OR create new
      if (existing) {
        // findSimilarMemories returns non-null only for TRUE DUPLICATES (not supersessions)
        console.log(`[DEDUP] ♻️ Found similar memory (id=${existing.id}), boosting instead of duplicating`);
        const boostResult = await this.boostExistingMemory(existing.id);

        // Debug logging hook for dedup case
        logMemoryOperation(userId, 'store', {
          memory_id: existing.id,
          content_preview: facts.substring(0, 120),
          category: category,
          dedup_triggered: true,
          dedup_merged_with: existing.id,
          stored: false
        });

        return boostResult;
      } else {
        // No duplicate found - either new fact or supersession
        // If supersession, storeCompressedMemory will detect and mark old memory as superseded
        console.log('[INTELLIGENT-STORAGE] ✨ Storing new compressed memory');
        return await this.storeCompressedMemory(userId, category, facts, {
          original_tokens: originalTokens,
          compressed_tokens: compressedTokens,
          compression_ratio: parseFloat(ratio),
          user_priority: userPriorityDetected,
          fingerprint: fingerprintResult.fingerprint,
          fingerprintConfidence: fingerprintResult.confidence,
          importance_score: importanceScore
        }, mode);
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Error:', error.message);
      console.error('[INTELLIGENT-STORAGE] Stack:', error.stack?.substring(0, 200));

      // Fallback: store uncompressed to prevent data loss
      console.warn('[INTELLIGENT-STORAGE] ⚠️ Falling back to uncompressed storage');
      return await this.storeUncompressed(userId, userMessage, aiResponse, category, mode);
    }
  }

  /**
   * Extract key facts from conversation using GPT-4o-mini
   * Target: 10-20:1 compression ratio
   * CRITICAL: Preserves unique identifiers and high-entropy tokens
   * @param {string} userMsg - User's message
   * @param {string} aiResponse - AI's response
   * @returns {Promise<string>} - Extracted facts as bullet points
   */
  async extractKeyFacts(userMsg, aiResponse) {
    // IDENTIFIER-PRESERVING PROMPT: Compress while retaining unique tokens
    // CRITICAL: Must preserve financial amounts, salaries, and numeric values for supersession
    const prompt = `Extract ONLY the essential facts from this conversation. Be extremely brief but PRESERVE all identifiers and numeric values.

CRITICAL RULES:
1. ALWAYS preserve exact alphanumeric identifiers (e.g., ECHO-123-ABC, ALPHA-456)
2. ALWAYS preserve names exactly as written (e.g., Dr. Smith, Dr. FOXTROT-123)
3. ALWAYS preserve numbers, codes, IDs, license plates, serial numbers VERBATIM
4. ALWAYS preserve salary amounts, prices, financial figures EXACTLY (e.g., $250,000, $95,000, $80K)
5. ALWAYS preserve times, dates, and numeric values EXACTLY (e.g., 3pm, 4pm, Tuesday)
6. Never generalize unique identifiers into descriptions like "identifier" or "code"
7. If user says "My X is Y", output MUST contain Y exactly

Examples:
Input: "My license plate is ABC-123-XYZ"
Output: "License plate: ABC-123-XYZ"
NOT: "Has a license plate" or "Vehicle identifier stored"

Input: "My doctor is Dr. FOXTROT-789"
Output: "Doctor: Dr. FOXTROT-789"
NOT: "Has a doctor" or "Medical contact stored"

Input: "I got a raise! They're now paying me $250,000"
Output: "Salary: $250,000"
NOT: "Got a raise" or "Higher salary"

Input: "Meeting moved to 4pm"
Output: "Meeting: 4pm"
NOT: "Meeting rescheduled"

Rules for compression:
- Maximum 3-5 facts total
- Each fact: 3-8 words (more if needed for identifiers or amounts)
- Include ONLY: Names, numbers, specific entities, user statements, amounts, times
- EXCLUDE: Questions, greetings, explanations, AI responses

User: ${userMsg}
Assistant: ${aiResponse}

Facts (preserve all identifiers and amounts):`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 100  // Increased to allow room for identifiers
      });

      let facts = response.choices[0].message.content.trim();

      // CRITICAL: Post-processing protection - verify identifiers survived
      facts = this.protectHighEntropyTokens(userMsg, facts);

      // AGGRESSIVE POST-PROCESSING: Guarantee 10-20:1 compression
      const processedFacts = this.aggressivePostProcessing(facts);

      console.log(`[INTELLIGENT-STORAGE] ✅ Extracted ${processedFacts.split('\n').filter(l => l.trim()).length} facts`);
      return processedFacts;
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fact extraction failed:', error.message);
      // Fallback: ultra-compressed version WITH identifier protection
      const userKeywords = userMsg.split(/\s+/).slice(0, 5).join(' ');
      return this.protectHighEntropyTokens(userMsg, userKeywords);
    }
  }

  /**
   * Protect high-entropy tokens from being lost during compression
   * Scans original message for unique identifiers and ensures they appear in facts
   * @param {string} originalMessage - Original user message
   * @param {string} facts - Extracted facts from GPT
   * @returns {string} - Facts with identifiers preserved
   */
  protectHighEntropyTokens(originalMessage, facts) {
    // Patterns to detect high-entropy unique identifiers:
    // - ALPHA-123456789 (test identifiers)
    // - ECHO-123-9K7X (license plates)
    // - Dr. FOXTROT-123 (names with identifiers)
    // - Any long alphanumeric strings
    const tokenPattern = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/gi;
    const originalTokens = originalMessage.match(tokenPattern) || [];

    if (originalTokens.length === 0) {
      return facts; // No special tokens to protect
    }

    // Check which tokens are missing from facts
    const missingTokens = originalTokens.filter(token => {
      // Case-insensitive check if token appears in facts
      return !facts.toLowerCase().includes(token.toLowerCase());
    });

    if (missingTokens.length > 0) {
      console.log(`[INTELLIGENT-STORAGE] 🛡️ Protecting ${missingTokens.length} high-entropy tokens:`, missingTokens);

      // Append missing tokens to facts
      for (const token of missingTokens) {
        // Try to preserve context by finding surrounding words
        // Allow 1-3 words before the token (handles "My doctor's name is Dr. X" or "license plate number is Y")
        const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const contextMatch = originalMessage.match(new RegExp(`([\\w.']+\\s+){0,3}${escapedToken}`, 'i'));
        if (contextMatch) {
          facts += `\n${contextMatch[0]}.`;
        } else {
          facts += `\nIdentifier: ${token}.`;
        }
      }
    }

    return facts;
  }

  /**
   * Aggressive post-processing to guarantee 10-20:1 compression
   * Enforces ULTRA-strict limits: max 3-5 facts, max 5-8 words each
   * CRITICAL: Preserves lines containing high-entropy identifiers
   * @param {string} facts - Raw facts from AI
   * @returns {string} - Aggressively compressed facts
   */
  aggressivePostProcessing(facts) {
    // Split into lines and clean
    let lines = facts.split(/\n|\.(?=\s|[A-Z]|$)/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      // Remove bullet points, numbers, and other formatting
      .map(line => line.replace(/^[-•*\d.)\]]+\s*/, '').trim())
      .filter(line => line.length > 0);

    // Pattern to detect high-entropy identifiers
    const HIGH_ENTROPY_PATTERN = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/i;

    // Separate lines with identifiers from regular lines
    const identifierLines = lines.filter(line => HIGH_ENTROPY_PATTERN.test(line));
    const regularLines = lines.filter(line => !HIGH_ENTROPY_PATTERN.test(line));

    // ADAPTIVE LIMIT: Allow more facts if they contain identifiers
    const maxFacts = identifierLines.length > 0 ? 5 : 3;

    // Process regular lines with strict limits
    let processedRegularLines = regularLines.slice(0, maxFacts - identifierLines.length);

    // ADAPTIVE WORD LIMIT: Don't truncate lines with identifiers
    processedRegularLines = processedRegularLines.map(line => {
      const words = line.split(/\s+/);
      if (words.length > 5) {
        return words.slice(0, 5).join(' ');
      }
      return line;
    });

    // Identifier lines: Allow up to 8 words to preserve context
    const processedIdentifierLines = identifierLines.map(line => {
      const words = line.split(/\s+/);
      if (words.length > 8) {
        // Keep identifier intact, trim other words
        const identifierMatch = line.match(HIGH_ENTROPY_PATTERN);
        if (identifierMatch) {
          // Preserve the identifier and a few context words
          const identifier = identifierMatch[0];
          const contextWords = line.split(/\s+/).filter(w => w.includes(identifier.split('-')[0]) || w === identifier || w.toLowerCase() === 'dr.' || ['license', 'plate', 'doctor', 'name'].includes(w.toLowerCase())).slice(0, 8);
          return contextWords.join(' ');
        }
      }
      return line;
    });

    // Combine: Identifier lines first (most important), then regular lines
    lines = [...processedIdentifierLines, ...processedRegularLines];

    // Remove duplicates (case-insensitive)
    const seen = new Set();
    lines = lines.filter(line => {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    // Remove very short facts (< 3 words), UNLESS they contain identifiers
    lines = lines.filter(line => {
      if (HIGH_ENTROPY_PATTERN.test(line)) {
        return true; // Always keep lines with identifiers
      }
      return line.split(/\s+/).length >= 3;
    });

    // Ultra-aggressive compression: remove ALL filler words (but not from identifier lines)
    const fillerWords = ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'has', 'have', 'had'];
    lines = lines.map(line => {
      // Don't remove filler words from identifier lines - preserve full context
      if (HIGH_ENTROPY_PATTERN.test(line)) {
        return line;
      }

      let words = line.split(/\s+/);
      // Remove filler words except first word (to preserve meaning)
      words = [words[0], ...words.slice(1).filter(w => !fillerWords.includes(w.toLowerCase()))];
      return words.join(' ');
    });

    // Final cleanup: ensure no empty lines
    lines = lines.filter(line => line.length > 0);

    // Ensure each fact ends with a period
    lines = lines.map(line => {
      if (!/[.!?]$/.test(line)) {
        return line + '.';
      }
      return line;
    });

    // Join with newlines for clean formatting
    // Result: "License plate ECHO-1767204140342-9K7X.\nDoctor Dr. FOXTROT-1767204140342.\nUser owns pet monkeys."
    return lines.join('\n');
  }

  /**
   * Check if dedup merge should be prevented due to different high-entropy tokens
   * CRITICAL FIX (Issue #218): Properly compares NEW content tokens against EXISTING memory tokens
   * Logic: If NEW content has unique identifiers that DON'T appear in EXISTING memory, block the merge
   * @param {string} existingContent - Content from existing memory in database
   * @param {string} newContent - Content from new facts to be stored
   * @returns {boolean} - True if merge should be PREVENTED (block), False if merge is allowed
   */
  shouldPreventMerge(existingContent, newContent) {
    // Issue #214 Fix 2: Enhanced pattern to catch format like ALPHA-1767213514286
    // Pattern breakdown:
    // - \b[A-Z]+-\d+-[A-Z0-9]+\b : Matches ABC-123-XYZ format
    // - \b[A-Z]+-\d{10,}\b : Matches ABC-1234567890 format (10+ digits)
    // - \bDr\.\s*[A-Z]+-\d+\b : Matches Dr. ABC-123 format
    // - \b[A-Z0-9]{12,}\b : Matches long alphanumeric codes
    const HIGH_ENTROPY_PATTERN = /\b[A-Z]+-\d+-[A-Z0-9]+\b|\b[A-Z]+-\d{10,}\b|\bDr\.\s*[A-Z]+-\d+\b|\b[A-Z0-9]{12,}\b/gi;

    // Extract tokens from BOTH existing and new content
    const existingTokens = existingContent.match(HIGH_ENTROPY_PATTERN) || [];
    const newTokens = newContent.match(HIGH_ENTROPY_PATTERN) || [];

    // Normalize tokens to uppercase for case-insensitive comparison
    const normalizedExisting = existingTokens.map(t => t.toUpperCase());
    const normalizedNew = newTokens.map(t => t.toUpperCase());

    // Validation: Ensure we got the parameters in the right order
    console.log(`[DEDUP-VALIDATE] shouldPreventMerge called with:`);
    console.log(`[DEDUP-VALIDATE]   existingContent (first param): "${existingContent.substring(0, 100)}..."`);
    console.log(`[DEDUP-VALIDATE]   newContent (second param): "${newContent.substring(0, 100)}..."`);
    console.log(`[DEDUP-VALIDATE]   Extracted EXISTING tokens: [${normalizedExisting.join(', ')}]`);
    console.log(`[DEDUP-VALIDATE]   Extracted NEW tokens: [${normalizedNew.join(', ')}]`);

    // If new content has no high-entropy tokens, allow normal dedup
    if (normalizedNew.length === 0) {
      return false; // Allow merge
    }

    // If existing memory has no high-entropy tokens, allow merge
    if (normalizedExisting.length === 0) {
      return false; // Allow merge
    }

    // CRITICAL FIX (#220): Check if ANY new token is unique (not in existing memory)
    // If NEW content has ANY unique identifier not present in EXISTING memory, block the merge
    // Example: NEW=[DELTA,ALPHA,CHARLIE] vs EXISTING=[CHARLIE,ALPHA] → hasUniqueNewToken=TRUE (DELTA is unique) → block merge
    // Example: NEW=[ALPHA] vs EXISTING=[ALPHA,BRAVO] → hasUniqueNewToken=FALSE → allow merge
    // Example: NEW=[ALPHA,CHARLIE] vs EXISTING=[ALPHA,BRAVO,CHARLIE] → hasUniqueNewToken=FALSE → allow merge
    const hasUniqueNewToken = normalizedNew.some(newToken =>
      !normalizedExisting.includes(newToken)
    );

    // DEBUG: Log what we're comparing to catch any logic errors
    console.log(`[DEDUP-DEBUG] Comparing tokens:`);
    console.log(`[DEDUP-DEBUG]   NEW tokens: [${normalizedNew.join(', ')}]`);
    console.log(`[DEDUP-DEBUG]   EXISTING tokens: [${normalizedExisting.join(', ')}]`);
    console.log(`[DEDUP-DEBUG]   hasUniqueNewToken: ${hasUniqueNewToken}`);

    if (hasUniqueNewToken) {
      // New content has a unique identifier - store separately
      const uniqueTokens = normalizedNew.filter(t => !normalizedExisting.includes(t));
      console.log(`[DEDUP] 🛡️ Unique new token detected: new=[${normalizedNew.join(',')}] vs existing=[${normalizedExisting.join(',')}] - BLOCKING merge (unique: ${uniqueTokens.join(',')})`);
      return true; // PREVENT merge - new identifier must be stored separately
    } else {
      // All new tokens already exist in memory - safe to merge
      console.log(`[DEDUP] ✓ All tokens exist in memory: [${normalizedNew.join(',')}] - merge allowed`);
      return false; // Allow merge - no new unique identifiers
    }
  }

  /**
   * Find similar memories using semantic embeddings with pgvector
   * CRITICAL: Distinguishes DUPLICATES (boost) from SUPERSESSIONS (replace)
   * Threshold: distance < 0.15 = high similarity (may be duplicate OR update)
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Extracted facts to compare
   * @returns {Promise<object|null>} - Similar memory to boost, or null if supersession/no match
   */
  async findSimilarMemories(userId, category, facts) {
    try {
      // Generate embedding for new content
      const { generateEmbedding } = await import('../services/embedding-service.js');
      const embeddingResult = await generateEmbedding(facts);

      if (!embeddingResult.success || !embeddingResult.embedding) {
        console.log('[DEDUP] ⚠️ Could not generate embedding, falling back to text search');
        // Fallback to text-based search
        const result = await this.db.query(`
          SELECT id, content, 0.5 as distance
          FROM persistent_memories
          WHERE user_id = $1
            AND category_name = $2
            AND is_current = true
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 5
        `, [userId, category]);

        if (result.rows.length > 0) {
          return result.rows[0];
        }
        return null;
      }

      // Query for similar memories using pgvector cosine distance
      // CRITICAL: Also retrieve embedding for supersession analysis
      const result = await this.db.query(`
        SELECT
          id,
          content,
          embedding,
          embedding <=> $1::vector as distance
        FROM persistent_memories
        WHERE user_id = $2
          AND category_name = $3
          AND is_current = true
          AND embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT 5
      `, [JSON.stringify(embeddingResult.embedding), userId, category]);

      // Check for semantic duplicates (distance < 0.15)
      for (const row of result.rows) {
        if (row.distance < 0.15) {
          // CRITICAL FIX: Check if this is an UPDATE (supersession) or DUPLICATE (same fact)
          // High similarity could mean either:
          // 1. DUPLICATE: "My wife is Sarah" + "My wife Sarah" = SAME FACT → Boost
          // 2. SUPERSESSION: "My salary is $80K" + "My salary is $95K" = UPDATED FACT → Don't boost, supersede instead

          console.log(`[DEDUP] High similarity detected (distance: ${row.distance.toFixed(3)}), checking if update or duplicate...`);

          // Use semantic analyzer to determine if this is an update
          // Pass the OLD memory's embedding from the database
          const isUpdate = await semanticAnalyzer.analyzeSupersession(facts, [{
            id: row.id,
            content: row.content,
            embedding: row.embedding  // Use the embedding from the database row
          }]);

          if (isUpdate.supersedes && isUpdate.supersedes.length > 0) {
            // This is a SUPERSESSION (update), not a duplicate
            console.log(`[DEDUP] 🔄 SUPERSESSION detected - new content updates old memory (id=${row.id})`);
            console.log(`[DEDUP]    Old: "${row.content.substring(0, 60)}..."`);
            console.log(`[DEDUP]    New: "${facts.substring(0, 60)}..."`);
            console.log(`[DEDUP]    Reason: ${isUpdate.supersedes[0].reason}`);
            // Return null to signal this should be stored as new (supersession will handle marking old as superseded)
            return null;
          }

          // Apply high-entropy guard before merging
          if (this.shouldPreventMerge(row.content, facts)) {
            console.log(`[DEDUP] ⏭️ Skipping similar memory (id=${row.id}) due to high-entropy mismatch`);
            continue; // Skip this match, check next one
          }

          console.log(`[SEMANTIC-DEDUP] ✅ True DUPLICATE detected (same fact repeated), will boost existing memory`);
          return row;
        }
      }

      console.log('[DEDUP] ✅ No similar memories found');
      return null;
    } catch (error) {
      console.error('[DEDUP] ⚠️ Similarity search failed:', error.message);
      return null; // Continue with new storage if dedup fails
    }
  }

  /**
   * Boost existing memory instead of creating duplicate
   * Makes it more likely to be retrieved
   * Innovation #7: Importance increases when memory is semantically retrieved
   * @param {number} memoryId - ID of existing memory
   * @returns {Promise<object>} - Boost result
   */
  async boostExistingMemory(memoryId) {
    try {
      // SEMANTIC BOOST: Increase importance score based on semantic access
      // This implements Innovation #7 - semantic access patterns determine importance
      await this.db.query(`
        UPDATE persistent_memories
        SET
          usage_frequency = usage_frequency + 1,
          relevance_score = LEAST(relevance_score + 0.05, 1.0),
          last_accessed = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [memoryId]);

      console.log(`[SEMANTIC-IMPORTANCE] ✅ Boosted memory ${memoryId} (semantic access tracked)`);
      return { action: 'boosted', memoryId };
    } catch (error) {
      console.error('[DEDUP] ❌ Boost failed:', error.message);
      throw error;
    }
  }

  /**
   * Store compressed memory with metadata
   * @param {string} userId - User identifier
   * @param {string} category - Memory category
   * @param {string} facts - Compressed facts
   * @param {object} metadata - Compression metadata
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result
   */
  async storeCompressedMemory(userId, category, facts, metadata, mode = 'truth-general') {
    try {
      // Normalize mode: convert underscore to hyphen for consistency
      const normalizedMode = mode.replace(/_/g, '-');

      // TRACE LOGGING - Store compressed memory
      console.log('[TRACE-INTELLIGENT] I9. storeCompressedMemory called');
      console.log('[TRACE-INTELLIGENT] I10. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I11. category:', category);
      console.log('[TRACE-INTELLIGENT] I12. facts length:', facts?.length || 0);
      console.log('[TRACE-INTELLIGENT] I12a. mode (normalized):', normalizedMode);
      console.log('[SESSION-DIAG] Storing for userId:', userId);

      // GUARD: Refuse to store empty or meaningless content at database layer
      const isMeaningless = !facts ||
                           facts.trim().length === 0 ||
                           facts.toLowerCase().includes('no essential facts') ||
                           facts.toLowerCase().includes('no key facts') ||
                           facts.toLowerCase().includes('nothing to extract');

      if (isMeaningless) {
        console.log('[INTELLIGENT-STORAGE] ❌ Refusing to store empty/meaningless content:', facts?.substring(0, 100));
        return { action: 'skipped', reason: 'meaningless_content' };
      }

      const tokenCount = this.countTokens(facts);
      console.log('[TRACE-INTELLIGENT] I13. tokenCount:', tokenCount);

      // CRITICAL FIX: Use PRE-CALCULATED fingerprint and importance from metadata
      // These were already calculated on the ORIGINAL user message before extraction
      const fingerprintResult = {
        fingerprint: metadata.fingerprint || null,
        confidence: metadata.fingerprintConfidence || 0,
        method: 'pre-calculated'
      };
      console.log(`[INTELLIGENT-STORAGE] Using pre-calculated fingerprint: ${fingerprintResult.fingerprint || 'none'} (confidence: ${fingerprintResult.confidence})`);

      // SEMANTIC SUPERSESSION CHECK - Check existing memories for semantic similarity
      // This catches updates that don't match regex patterns (e.g., "My salary is now $100K" after "I earn $80K")
      try {
        console.log('[INTELLIGENT-STORAGE] 🔍 Checking for semantic supersession...');
        
        // Query existing memories in same category
        // Cast vector type to text for JSON parsing in Node.js
        const existingMemories = await this.db.query(`
          SELECT id, content, embedding::text as embedding
          FROM persistent_memories
          WHERE user_id = $1
            AND category_name = $2
            AND is_current = true
            AND embedding IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 10
        `, [userId, category]);

        if (existingMemories.rows.length > 0) {
          // Use semantic analyzer to detect supersession
          const supersessionResult = await semanticAnalyzer.analyzeSupersession(
            facts,
            existingMemories.rows.map(row => ({
              id: row.id,
              content: row.content,
              embedding: row.embedding
            }))
          );

          if (supersessionResult.supersedes && supersessionResult.supersedes.length > 0) {
            // Semantic supersession detected - mark old memories as superseded
            for (const superseded of supersessionResult.supersedes) {
              console.log(`[SEMANTIC-SUPERSESSION] Memory ${superseded.memoryId} superseded (similarity: ${superseded.similarity.toFixed(3)}, reason: ${superseded.reason})`);
              
              // Also check for temporal reconciliation
              const existingMem = existingMemories.rows.find(m => m.id === superseded.memoryId);
              if (existingMem) {
                const temporalResult = await semanticAnalyzer.analyzeTemporalReconciliation(
                  facts,
                  existingMem.content,
                  superseded.similarity
                );

                if (temporalResult.shouldSupersede) {
                  console.log(`[SEMANTIC-TEMPORAL] ${temporalResult.explanation}`);
                }
              }
              
              await this.db.query(`
                UPDATE persistent_memories
                SET is_current = false,
                    superseded_at = NOW()
                WHERE id = $1
              `, [superseded.memoryId]);
            }
          }
        }
      } catch (semanticError) {
        console.error('[INTELLIGENT-STORAGE] ⚠️ Semantic supersession check failed:', semanticError.message);
        // Continue with normal storage
      }

      // If fingerprint detected, route through supersession
      if (fingerprintResult.fingerprint && fingerprintResult.confidence >= 0.7) {
        console.log(`[INTELLIGENT-STORAGE] ✨ Routing through supersession for fingerprint: ${fingerprintResult.fingerprint}`);

        const supersessionResult = await storeWithSupersession(this.db, {
          userId,
          content: facts,
          factFingerprint: fingerprintResult.fingerprint,
          fingerprintConfidence: fingerprintResult.confidence,
          mode,
          categoryName: category,
          tokenCount
        });

        if (supersessionResult.success) {
          const memoryId = supersessionResult.memoryId;

          // Generate embedding for the newly stored memory
          if (memoryId && this.db) {
            console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
            embedMemoryNonBlocking(this.db, memoryId, facts, { timeout: 3000 })
              .then(embedResult => {
                if (embedResult.success) {
                  console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
                } else {
                  console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
                }
              })
              .catch(error => {
                console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
              });
          }

          // Debug logging hook
          logMemoryOperation(userId, 'store', {
            memory_id: memoryId,
            content_preview: facts.substring(0, 120),
            category: category,
            dedup_triggered: false,
            dedup_merged_with: null,
            stored: true,
            fingerprint: fingerprintResult.fingerprint,
            superseded_count: supersessionResult.supersededCount
          });

          return {
            action: 'created',
            memoryId,
            superseded: supersessionResult.supersededCount,
            fingerprint: fingerprintResult.fingerprint
          };
        }
      }

      // No fingerprint or confidence too low - use normal storage

      // CRITICAL FIX: Use PRE-CALCULATED importance score from metadata
      // This was already calculated on the ORIGINAL user message before extraction
      let importanceScore = metadata.importance_score || 0.5;
      console.log(`[INTELLIGENT-STORAGE] 📊 Using pre-calculated importance score: ${importanceScore.toFixed(2)} (category: ${category})`);

      console.log('[TRACE-INTELLIGENT] I14. About to execute INSERT query...');
      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          mode,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        normalizedMode,
        category,
        'general', // Default subcategory
        facts,
        tokenCount,
        importanceScore, // Use pre-calculated importance score
        JSON.stringify({
          ...metadata,
          compressed: true,
          dedup_checked: true,
          storage_version: 'intelligent_v1'
        })
      ]);

      console.log('[TRACE-INTELLIGENT] I15. INSERT query completed');

      const memoryId = result.rows[0].id;
      console.log('[TRACE-INTELLIGENT] I16. Stored memory ID:', memoryId);
      console.log(`[INTELLIGENT-STORAGE] ✅ Stored compressed memory: ID=${memoryId}, tokens=${tokenCount}`);

      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored:', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: facts.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });

      // CRITICAL: Generate embedding for the newly stored memory
      // This enables semantic retrieval for this memory
      if (memoryId && this.db) {
        console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
        // Use non-blocking embedding to avoid delaying the response
        embedMemoryNonBlocking(this.db, memoryId, facts, { timeout: 3000 })
          .then(embedResult => {
            if (embedResult.success) {
              console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
            } else {
              console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
            }
          })
          .catch(error => {
            console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
          });
      }

      // Debug logging hook for test harness
      logMemoryOperation(userId, 'store', {
        memory_id: memoryId,
        content_preview: facts.substring(0, 120),
        category: category,
        dedup_triggered: false,
        dedup_merged_with: null,
        stored: true
      });

      return { action: 'created', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Compressed storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Fallback: store uncompressed if compression fails
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @param {string} category - Memory category
   * @param {string} mode - Mode (truth-general, business-validation, site-monkeys)
   * @returns {Promise<object>} - Storage result
   */
  async storeUncompressed(userId, userMessage, aiResponse, category, mode = 'truth-general') {
    try {
      // Normalize mode: convert underscore to hyphen for consistency
      const normalizedMode = mode.replace(/_/g, '-');

      // TRACE LOGGING - Fallback storage
      console.log('[TRACE-INTELLIGENT] I17. storeUncompressed (fallback) called');
      console.log('[TRACE-INTELLIGENT] I18. userId:', userId);
      console.log('[TRACE-INTELLIGENT] I19. category:', category);
      console.log('[TRACE-INTELLIGENT] I19a. mode (normalized):', normalizedMode);

      const content = `User: ${userMessage}\nAssistant: ${aiResponse}`;
      const tokenCount = this.countTokens(content);
      console.log('[TRACE-INTELLIGENT] I20. Uncompressed content length:', content.length);
      console.log('[TRACE-INTELLIGENT] I21. About to execute INSERT query (fallback)...');

      const result = await this.db.query(`
        INSERT INTO persistent_memories (
          user_id,
          mode,
          category_name,
          subcategory_name,
          content,
          token_count,
          relevance_score,
          metadata,
          created_at,
          usage_frequency,
          last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        normalizedMode,
        category,
        'general',
        content,
        tokenCount,
        0.50,
        JSON.stringify({
          compressed: false,
          fallback: true,
          storage_version: 'uncompressed_fallback'
        })
      ]);
      
      const memoryId = result.rows[0].id;
      console.log(`[INTELLIGENT-STORAGE] ⚠️ Stored uncompressed fallback: ID=${memoryId}, tokens=${tokenCount}`);

      // DIAGNOSTIC LOGGING: Track exact storage details
      console.log('[STORAGE-DEBUG] Memory stored (fallback):', {
        id: memoryId,
        user_id: userId,
        category: category,
        content: content.substring(0, 100),
        table: 'persistent_memories',
        timestamp: new Date().toISOString()
      });

      // CRITICAL: Generate embedding for the newly stored memory
      // This enables semantic retrieval for this memory
      if (memoryId && this.db) {
        console.log(`[EMBEDDING] Generating embedding for memory ${memoryId}...`);
        // Use non-blocking embedding to avoid delaying the response
        embedMemoryNonBlocking(this.db, memoryId, content, { timeout: 3000 })
          .then(embedResult => {
            if (embedResult.success) {
              console.log(`[EMBEDDING] ✅ Embedding generated for memory ${memoryId} (${embedResult.status})`);
            } else {
              console.log(`[EMBEDDING] ⚠️ Embedding marked as ${embedResult.status} for memory ${memoryId}: ${embedResult.error}`);
            }
          })
          .catch(error => {
            console.error(`[EMBEDDING] ❌ Embedding failed for memory ${memoryId}: ${error.message}`);
          });
      }

      return { action: 'fallback', memoryId };
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ❌ Fallback storage failed:', error.message);
      throw error;
    }
  }

  /**
   * Accurate token counting using tiktoken
   * Falls back to character-based estimation if tiktoken unavailable
   * @param {string} text - Text to count tokens for
   * @returns {number} - Token count
   */
  countTokens(text) {
    if (!text) return 0;
    
    try {
      if (this.encoder) {
        return this.encoder.encode(text).length;
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Tiktoken encoding failed:', error.message);
    }
    
    // Fallback to character-based estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  /**
   * Cleanup: free encoder resources
   * Call this when done with the storage instance
   */
  cleanup() {
    try {
      if (this.encoder) {
        this.encoder.free();
        console.log('[INTELLIGENT-STORAGE] ✅ Encoder resources freed');
      }
    } catch (error) {
      console.error('[INTELLIGENT-STORAGE] ⚠️ Cleanup error:', error.message);
    }
  }
}