/**
 * truthTypeDetector.js
 * Phase 4: Dual Hierarchy Truth Validation
 * 
 * Purpose: Classify claims into VOLATILE / SEMI_STABLE / PERMANENT
 * Two-stage detection: deterministic patterns first (zero cost), AI classifier only if ambiguous
 * 
 * Location: /api/core/intelligence/truthTypeDetector.js
 */

// Truth type constants
export const TRUTH_TYPES = {
  VOLATILE: 'VOLATILE',       // TTL: 5 minutes
  SEMI_STABLE: 'SEMI_STABLE', // TTL: 24 hours
  PERMANENT: 'PERMANENT',     // TTL: 30 days
  DOCUMENT_REVIEW: 'DOCUMENT_REVIEW', // Document review/analysis - no external lookup
  AMBIGUOUS: 'AMBIGUOUS'      // Requires Stage 2 AI classification
};

// TTL values in milliseconds
export const TTL_CONFIG = {
  VOLATILE: 5 * 60 * 1000,           // 5 minutes
  SEMI_STABLE: 24 * 60 * 60 * 1000,  // 24 hours
  PERMANENT: 30 * 24 * 60 * 60 * 1000, // 30 days
  DOCUMENT_REVIEW: 0                   // No caching for document reviews
};

// Stage 1: Deterministic pattern markers (zero token cost)
// PRINCIPLE-BASED: Detect VOLATILE content by time-sensitivity and event markers, NOT hardcoded entity names
const VOLATILE_PATTERNS = [
  /\b(current|latest|today|now|live|breaking|real-?time)\b/i,
  /\b(price|stock|market|trading|exchange rate)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(news|happening|update|situation)\b/i,
  /\bwhat('s| is) .* (right now|today|currently)\b/i,
  /\bhow much (is|does|are) .* (cost|worth)\b/i,
  /\bwhat (is|are|'?s) .{0,60} worth\b/i,   // "what is 50 lbs of gold worth", "what's 2 kg of silver worth"
  // Event markers (not entity names) - these indicate current/breaking events
  /\b(attack|election|war|invasion|military|conflict|strike|bombing|sanctions|diplomatic|crisis|coup|protest|riot)\b/i
];

const SEMI_STABLE_PATTERNS = [
  /\b(who is the (current )?(ceo|president|prime minister|chancellor|secretary of state|secretary|governor|mayor|chairman|director|minister|senator|representative|speaker|ambassador|chief|cfo|cto|coo|commissioner|superintendent|head))\b/i,
  /\b(regulation|policy|law|statute|requirement|compliance)\b/i,
  /\b(tax rate|interest rate|fee|tariff)\b/i,
  /\b(fda|sec|irs|government) (approval|ruling|guidance)\b/i,
  /\b(product spec|specification|version)\b/i,
  /\b(hours|schedule|availability|open|closed)\b/i,
  /\bis .* (still|currently) (available|supported|active)\b/i
];

const PERMANENT_PATTERNS = [
  /\b(what is|what are|define|definition of|meaning of)\b/i,
  /\bwhat (is|are) the (name|names) of\b/i,
  /\bwho (are|were) the (members|characters|turtles|founders)\b/i,
  /\b(history|historical|when was|when did)\b/i,
  /\b(theorem|principle|law of|theory of)\b/i,
  /\b(how does .* work|explain|describe)\b/i,
  /\b(math|mathematics|calculation|formula)\b/i,
  /\b(science|scientific|physics|chemistry|biology)\b/i,
  /\b(invented|discovered|founded|established|created)\b/i,
  /\b(capital of|located in|born in|died in)\b/i,

  // CRITICAL FIX (Issue #385, Bug 1.3): Simple arithmetic and factual questions
  // These should NEVER trigger uncertainty disclaimers
  /^what is \d+[\+\-\*\/\%]\d+/i,  // "what is 2+2", "what is 5*3"
  /^\d+[\+\-\*\/\%]\d+/,            // "2+2", "5*3"
  /^calculate \d+/i,                // "calculate 10*5"
  /\bsimple (math|arithmetic|calculation)\b/i,

  // Word definitions - language doesn't change
  /\bwhat does ['"]?\w+['"]? mean\b/i,
  /\bdefine ['"]?\w+['"]?\b/i,
  /\bdefinition of ['"]?\w+['"]?\b/i,
  /\bmeaning of ['"]?\w+['"]?\b/i,
  /\bwhat is the meaning of\b/i,
  /\bwhat does the word ['"]?\w+['"]? mean\b/i,

  // Stable procedural facts (cooking, crafts, basic skills)
  /\bhow (do|to) (i |you |we )?(boil|cook|make|bake|fry|roast|grill|steam|poach|blanch|sauté|simmer|braise)\b/i,
  /\bhow (do|to) (i |you |we )?(tie|fold|cut|slice|chop|dice|mince|grate|peel|core)\b/i,
  /\bhow (do|to) (i |you |we )?(write|spell|pronounce|say|read)\b/i,
  /\bhow (do|to) (i |you |we )?(clean|wash|dry|iron|sew|knit|crochet)\b/i,
  /\bhow (do|to) (i |you |we )?(build|fix|repair|assemble|install)\b/i,
  /\bhow (do|to) (i |you |we )?(grow|plant|prune|water|harvest)\b/i,

  // Recipe and ingredient questions
  /\bwhat is (a |an |the )?(recipe|ingredient|step|process|method|technique)\b/i,
  /\bwhat (is|are) .* (made of|composed of|consist of)\b/i,

  // Mathematical/scientific constants and facts
  /\b(pythagorean|fibonacci|newton|einstein|archimedes|euclid)\b/i,
  /\b(speed of light|gravity|pi|golden ratio|periodic table)\b/i,

  // Unit conversions - mathematical constants
  /\bhow many (feet|inches|meters|miles|kilometers|pounds|ounces|grams|kilograms|liters|gallons|cups|tablespoons|teaspoons) (in|per|are in) (a |an |one )?\w+/i,

  // Simple math calculations
  /\bwhat('s| is| are)? \d+\s*[×x\*\+\-\/÷]\s*\d+/i,
  /\b\d+\s*[×x\*\+\-\/÷]\s*\d+\s*[=\?]/i,

  // File format definitions
  /\bwhat is (a |an )?(zip|pdf|jpg|png|gif|mp3|mp4|csv|json|xml|html|css|javascript) file\b/i,

  // Yes/No factual questions about stable biology, nature, science
  // "Do bears hibernate?" "Can hippos have triplets?" "Do whales breathe air?"
  // Self-contained questions with no unresolved pronouns = PERMANENT
  /\b(do|does|can|are|is) (a |an |the )?\w+ (hibernate|migrate|fly|swim|reproduce|breathe|have|lay|eat|digest|sleep|grow|live|die|survive|evolve|exist|belong|contain|produce|require|need|use|make|build|create|form|cause|affect|help|hurt|kill|protect|defend|attack|communicate|hunt|travel|move|change|develop|function|work|operate)\b/i
];

// High-stakes domains that trigger external lookup regardless of truth type
export const HIGH_STAKES_DOMAINS = {
  MEDICAL: [
    /\b(symptom|diagnosis|treatment|medication|dosage|drug|prescription)\b/i,
    /\bsymptoms? of\b/i,
    /\bside effects?\b/i,
    /\bdrug interactions?\b/i,
    /\b(disease|condition|syndrome|disorder)\b/i,
    /\b(interaction|contraindications?)\b/i,
    /\b(aspirin|ibuprofen|tylenol|advil|acetaminophen)\b/i,
    /\b(overdose|prognosis)\b/i,
    /\bcan i take .+ with\b/i,
    /\bmixing .+ (and|with)\b/i,
    /\bcombine .+ medication\b/i,
    /\bblood pressure\b/i,
    /\bdiabetes\b/i,
    /\bheart\b/i,
    /\bcholesterol\b/i,

    // Emergency symptoms
    /\b(chest (pain|hurts?)|arm (tingling|numb)|difficulty breathing|can't breathe|heart (racing|attack)|severe headache|numbness|dizz(y|iness)|faint|unconscious|bleeding heavily|allergic reaction|throat (closing|swelling))\b/i,

    // Life-threatening emergencies - cyanosis, respiratory distress
    /\b(lips|fingers|skin|face) (turning|are|is|look|looks) (blue|purple|gray|grey)\b/i,
    /\b(blue|purple) (lips|fingers|skin|face)\b/i,
    /\bcyanosis\b/i,
    /\b(trouble|difficulty|struggling|can't|cannot|hard to) breath(e|ing)\b/i,
    /\b(short|shortness) of breath\b/i,
    /\bchok(e|ing|ed)\b/i,
    /\b(severe|intense|crushing|sharp) (chest |abdominal |stomach |head )?(pain|ache)\b/i,
    /\bcan't (breathe|breath|stop bleeding)\b/i,
    /\b(passing|passed|blacking|blacked) out\b/i,
    /\bunconscious\b/i,
    /\bseizure\b/i,
    /\bstroke symptoms?\b/i,
    /\bheart attack\b/i,
    /\bsuicid(e|al)\b/i,
    /\boverdose\b/i,
    /\bsevere (bleeding|burn|allergic reaction)\b/i,
    /\banaphyla(xis|ctic)\b/i,

    // Substance combination safety
    /\bis it safe to (mix|combine|take|drink|use)\b/i,
    /\b(alcohol|drinking).*(with|and).*(medication|antibiotics|medicine|pills|drugs)\b/i,
    /\bcan i (take|mix|combine|drink).*(with|and|while)\b/i
  ],
  LEGAL: [
    /\b(legal|law|lawsuit|court|attorney|lawyer)\b/i,
    /\b(contract|liability|sue|regulation|statute)\b/i,
    /\b(rights|illegal|criminal|civil)\b/i
  ],
  FINANCIAL: [
    /\b(invest|investment|stock|bond|portfolio)\b/i,
    /\b(tax|irs|deduction|credit|filing)\b/i,
    /\b(loan|mortgage|interest rate|credit score)\b/i
  ],
  SAFETY: [
    // ISSUE #824 FIX: "recall" removed from this pattern because "Do you recall..." is a personal
    // memory query, not a product/safety recall. "product recall" and "safety recall" are still
    // caught by the more specific pattern below.
    /\b(warning|hazard|danger|emergency)\b/i,
    /\b(product recall|safety recall|recall notice|recall alert)\b/i,
    /\b(toxic|poisonous|flammable|explosive)\b/i,
    /\b(safety|risk|accident|injury)\b/i
  ]
};

/**
 * ISSUE #881 FIX: Semantic Named-Entity + Action Pattern Detection
 * Detects queries about named entities' recent actions without hardcoding entity names.
 * Uses structural analysis: proper noun + action intent = current event query.
 * This enables semantic classification of conversational current-event queries that lack
 * explicit freshness markers ("current", "latest", "today", etc.).
 * Cannot import hasProperNouns from externalLookupEngine (circular dependency), so uses
 * an equivalent local implementation.
 * @param {string} query - The user's query
 * @returns {boolean} True if query is about a named entity's recent actions
 */
function hasNamedEntityActionPattern(query) {
  if (!query || typeof query !== 'string') return false;

  // Local proper noun detector — structural equivalent of externalLookupEngine's hasProperNouns
  // Excludes common sentence starters that are capitalized but not proper nouns
  const COMMON_SENTENCE_STARTERS = /^(What|Where|When|Who|Why|How|Is|Are|Does|Do|Can|Could|Would|Should|Tell|Please|The|A|An|I|You|We|They|He|She|It|Seems|Looks|Did|Does|Has|Have|Had|Was|Were|Will|Shall)$/;
  const words = query.split(/\s+/);
  let hasProperNoun = false;
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^\w]/g, '');
    if (!word || word.length < 2) continue;
    if (/^[A-Z][a-z]+/.test(word)) {
      if (i === 0 && COMMON_SENTENCE_STARTERS.test(word)) continue;
      hasProperNoun = true;
      break;
    }
    // All-caps acronyms (e.g., FBI, NATO, CIA, UK)
    if (/^[A-Z]{2,5}$/.test(word)) { hasProperNoun = true; break; }
  }
  if (!hasProperNoun) return false;

  // Pattern 1: "Did [entity] [action verb]" — interrogative about named entity's past action
  // Catches: "Did Saudi Arabia make a big commitment", "Did the Coast Guard have anything happen"
  if (/\bdid\b.{2,80}\b(make|have|do|sign|commit|announce|launch|attack|strike|deploy|declare|pass|release|invest|pledge|agree|demand|arrest|fire|hire|resign|cancel|approve|reject|sanction|win|lose|reach|expand|impose|lift|grant|file|enter|leave|join|break|end|start|build|buy|sell|acquire|merge|cut|raise|drop|fall|rise|hit|happen|occur|create|form|lead|push|back|support|oppose|call|force|allow|ban|extend|suspend|halt|resume|begin|complete|close|open|fund|warn|threaten|withdraw|issue|send|meet|visit|submit|accomplish|achieve|secure|confirm|deny|reveal|report|claim|say|address|announce|express|propose|order|request|sign|receive|gain|secure|boost|increase|reduce|cut|drop)\b/i.test(query)) {
    return true;
  }

  // Pattern 2: "[entity] has something/anything going on/happening"
  // Catches: "Seems like Elon Musk has something going on"
  if (/\b(has|have|had)\b.{1,60}\b(something|anything|big|major|significant|serious|important|happening)\b.{0,40}\b(going on|happening|happen|occurred|went down)\b/i.test(query)) {
    return true;
  }

  // Pattern 3: "Seems like / I heard / apparently [entity] is doing something"
  // Catches: "Seems like Elon Musk has something going on, what is it"
  if (/\b(seems? like|looks? like|i heard|apparently|i read|i saw|they say|word is|apparently)\b.{0,80}\b(is|has|have|had|was|were|did|does|doing|making|getting|facing|dealing|happening|going)\b/i.test(query)) {
    return true;
  }

  // Pattern 4: "What is/What's [entity] [action gerund]" — current-state, NOT definitional
  // Catches: "What is Schumer demanding from Trump", "What's the fed doing these days"
  // Distinguished from definitions by action gerunds (demanding, doing, proposing)
  // vs static nouns (theorem, capital, formula) which are caught by PERMANENT patterns.
  // ISSUE #899 FIX (Bug 2): Extended to handle "What's" contraction (what'?s) in addition to
  // "what is/was/are/were" so informal phrasings like "What's the fed doing" are not missed.
  if (/\bwhat(?:'?s| is| was| are| were)\b.{0,60}\b(demanding|doing|planning|saying|claiming|proposing|pushing|seeking|pursuing|blocking|calling|threatening|warning|fighting|preparing|negotiating|forcing|opposing|supporting|backing|leading|facing|dealing|managing|running|holding|trying|attempting|making|accusing|denying|defending|arguing|advocating|endorsing|announcing|declaring|building|developing|creating|launching|expanding|increasing|reducing|cutting|raising|ordering|requesting|filing)\b/i.test(query)) {
    return true;
  }

  return false;
}

/**
 * Helper: Check if query is a stable procedural fact
 * These are "how to" questions about unchanging processes, not current events
 * @param {string} query - The user's query
 * @returns {boolean}
 */
function isStableProcedural(query) {
  const proceduralPatterns = /\bhow (do|to|can|should) (i |you |we )?(make|cook|boil|bake|tie|fold|write|create|build|fix|clean|wash|open|close|start|stop|grow|plant|cut|slice|chop|spell|pronounce)\b/i;
  const notCurrentEvents = !/\b(today|now|current|latest|recent|this morning|yesterday|right now)\b/i.test(query);
  return proceduralPatterns.test(query) && notCurrentEvents;
}

/**
 * Guard for biological yes/no factual pattern:
 * Returns true if query contains unresolved pronouns (it/this/that/they/those)
 * WITHOUT a clear subject noun — these should fall to AMBIGUOUS, not PERMANENT.
 * "Can they have triplets" → unresolved pronoun (no animal subject) → not PERMANENT
 * "Can hippos have triplets" → has subject → PERMANENT
 * @param {string} query
 * @returns {boolean}
 */
function hasUnresolvedPronoun(query) {
  const pronouns = /\b(it|this|that|they|those|them|these)\b/i;
  const hasSubject = /\b(bear|bears|hippo|hippos|whale|whales|dog|dogs|cat|cats|bird|birds|fish|lion|lions|tiger|tigers|elephant|elephants|giraffe|giraffes|rhino|rhinos|horse|horses|cow|cows|pig|pigs|sheep|wolf|wolves|fox|foxes|deer|rabbit|rabbits|snake|snakes|turtle|turtles|frog|frogs|eagle|eagles|hawk|hawks|owl|owls|shark|sharks|dolphin|dolphins|octopus|octopi|penguin|penguins|crocodile|crocodiles|alligator|alligators|gorilla|gorillas|chimpanzee|chimpanzees|zebra|zebras|kangaroo|kangaroos|koala|koalas|panda|pandas|leopard|leopards|cheetah|cheetahs|jaguar|jaguars|bison|buffalo|moose|elk|reindeer|caribou|camel|camels|llama|llamas|alpaca|alpacas)\b/i;
  return pronouns.test(query) && !hasSubject.test(query);
}

/**
 * STAGE 0: Document Detection (Highest Priority - Issue #380)
 * Detect document review requests to prevent misclassification as news/volatile content
 * @param {string} query - The user's query
 * @returns {object} { isDocument: boolean, confidence: number, reason: string }
 */
function isDocumentReviewRequest(query) {
  // Length threshold - documents are long
  const isLongInput = query.length > 10000; // 10K+ chars

  // ISSUE #804 FIX (Area 6): Short queries that REFERENCE a document/file already loaded in the session.
  // These should NOT trigger external lookup — the document is already in context.
  // Example: "Can you summarize what's in that document I just loaded"
  const shortDocumentReferencePatterns = [
    /summarize (what'?s? in |the |that |this )?(document|file|pdf|upload|attachment)/i,
    // ISSUE #814 FIX (FAILURE 9): "Can you summarize the contents of that document" — the phrase
    // "contents of" sits between "summarize" and "document", so the original pattern didn't match.
    /summarize.{0,40}(document|file|pdf|upload|attachment)/i,
    /summarize (the |these |those )?contents/i,
    /contents of (the|that|this) (document|file|pdf|upload|attachment)/i,
    /what'?s? in (that|the|this) (document|file|pdf|upload|attachment)/i,
    /what (does|did) (the|that|this) (document|file|pdf) (say|contain|include)/i,
    /tell me (about|what'?s? in) (the|that|this) (document|file|pdf|upload)/i,
    /analyze (the|that|this) (document|file|pdf|upload|attachment)/i,
    /explain (the|that|this) (document|file|pdf|upload)/i,
    /(that |the |this )?document i (just |recently )?(loaded|uploaded|shared|sent)/i,
    /file i (just |recently )?(loaded|uploaded|shared|sent)/i,
    /(in |from ) the (document|file|pdf|upload) (i |we )?(uploaded|loaded|shared|provided)/i
  ];

  const isShortDocumentReference = query.length <= 10000 &&
    shortDocumentReferencePatterns.some(p => p.test(query));

  if (isShortDocumentReference) {
    return {
      isDocument: true,
      confidence: 0.9,
      reason: 'Short query references a loaded document — use document context, no external lookup'
    };
  }

  // Document review patterns
  const reviewPatterns = [
    /your thoughts/i,
    /please (be )?comprehensive/i,
    /review (this|the following)/i,
    /analyze (this|the following)/i,
    /what do you think (about|of)/i,
    /feedback on/i,
    /evaluate (this|the following)/i,
    /the following is/i,
    /here is (the|a|my)/i
  ];

  const hasReviewPattern = reviewPatterns.some(p => p.test(query.slice(0, 500)));

  // Document structure indicators
  const documentIndicators = [
    /SECTION \d+/i,
    /^#+\s/m,                    // Markdown headers
    /Table of Contents/i,
    /Version \d+\.\d+/i,
    /^[-•]\s/m,                  // Bullet points
    /file:/i,
    /implementation/i,
    /specification/i,
    /architecture/i
  ];

  const hasDocumentStructure = documentIndicators.filter(p => p.test(query)).length >= 2;

  return {
    isDocument: isLongInput && (hasReviewPattern || hasDocumentStructure),
    confidence: isLongInput ? 0.9 : 0.5,
    reason: isLongInput
      ? 'Long-form document detected'
      : 'Standard query'
  };
}

/**
 * Stage 1: Deterministic pattern matching (zero token cost)
 * @param {string} query - The user's query
 * @returns {object} { type: string, confidence: number, stage: 1, patterns_matched: array }
 */
export function detectByPattern(query) {
  if (!query || typeof query !== 'string') {
    return {
      type: TRUTH_TYPES.AMBIGUOUS,
      confidence: 0,
      stage: 1,
      patterns_matched: [],
      reason: 'Invalid or empty query'
    };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedPatterns = [];

  // STAGE 0: Document Detection (Highest Priority - Issue #380)
  const docCheck = isDocumentReviewRequest(query);
  if (docCheck.isDocument) {
    console.log('[truthTypeDetector] Document review detected, skipping news/volatile patterns');
    return {
      type: TRUTH_TYPES.DOCUMENT_REVIEW,
      confidence: docCheck.confidence,
      stage: 0,
      patterns_matched: [{ type: TRUTH_TYPES.DOCUMENT_REVIEW, pattern: 'document_review_request' }],
      conflict_detected: false,
      reason: docCheck.reason,
      skipExternalLookup: true,  // CRITICAL: Don't lookup for documents
      skipNewsPatterns: true      // CRITICAL: Don't match news patterns
    };
  }

  // Early detection: Stable procedural facts (high confidence)
  if (isStableProcedural(normalizedQuery)) {
    return {
      type: TRUTH_TYPES.PERMANENT,
      confidence: 0.9,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.PERMANENT, pattern: 'stable_procedural_fact' }],
      conflict_detected: false,
      reason: 'Stable procedural fact (unchanging process)'
    };
  }

  // FRESHNESS MARKER OVERRIDE — MUST RUN BEFORE CONVERSATIONAL CHECK
  // Explicit freshness/recency requests are deterministic SEMI_STABLE triggers.
  // These patterns mean the user explicitly wants CURRENT information — external lookup required.
  //
  // CRITICAL ORDER: This check runs BEFORE the conversational/personal pattern check so that
  // conversational phrasing ("Have we gotten any further with what's going on with Greenland")
  // does NOT suppress an external lookup that the user clearly wants. The query subject
  // (geopolitics, markets, current events) must take priority over sentence structure.
  // Previously (Issue #807 Fix 3) this ran after CONVERSATIONAL; the ordering is now corrected.
  const FRESHNESS_OVERRIDE_PATTERNS = [
    /most up[- ]to[- ]date/i,
    /recent (information|news|updates|developments|events)/i,
    /latest (information|news|updates|developments|events)/i,
    /current (situation|status|state|events|developments)/i,
    /most recent (news|information|updates|events|developments)/i,
    /what'?s happening (with|in|about)/i,
    /what'?s (going on|new) (with|in|about)/i,
    /up[- ]to[- ]date (information|news|updates|events) (on|about|regarding|related to)/i,
    // Conversational freshness — "any further with", "any update on", "any news on/about"
    /\bany (further|updates?|news|developments?|progress|changes?) (with|on|about|regarding)\b/i,
    // "have we gotten/made any progress/further" — person asks about evolving situation
    /\b(gotten|made|have) any (further|progress|update|news)\b/i,
    // Issue #861 Fix: Conversational freshness phrases that indicate the user wants current info
    /\bbring (me |us )?(up[- ]to[- ]date|up to speed)\b/i,
    /\bcatch (me |us )?up (on|with|about|to)?\b/i,
    /\bfill (me |us )?in (on|about)?\b/i,
    /\bwhat'?s (new|the latest) (with|in|on|about)\b/i,
    /\bany recent\b/i,
    /\b(made|making) (a lot of )?(announcements?|news|headlines)\b/i,
    // ISSUE #875 FIX: "recent product announcements", "latest releases" — principle-based, no hardcoded entities.
    // Catches queries like "Can you give me a breakdown of Apple's recent product announcements"
    // which describe company/product/tech events using temporal markers without explicit "news" words.
    /\brecent\b.{0,50}\b(announcements?|releases?|launches?)\b/i,
    /\b(announcements?|releases?|launches?).{0,30}\b(recent|latest|newest|new)\b/i,
  ];
  let hasFreshnessMarker = FRESHNESS_OVERRIDE_PATTERNS.some(p => p.test(query));
  if (hasFreshnessMarker && /\b(our|my)\b/i.test(query)) {
    // Possessive + freshness marker = internal context query
    // Do not treat as external lookup candidate
    // Fall through to conversational/personal detection
    hasFreshnessMarker = false;
  }
  if (hasFreshnessMarker) {
    console.log(`[TRUTH-TYPE] Freshness marker detected — forcing SEMI_STABLE classification (external lookup required)`);
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.95,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.SEMI_STABLE, pattern: 'explicit_freshness_marker' }],
      conflict_detected: false,
      reason: 'Explicit freshness/recency marker — requires current information lookup'
    };
  }

  // ISSUE #818 FIX: CONVERSATIONAL/PERSONAL Detection (before VOLATILE patterns)
  // Greetings, personal statements, memory commands, and emotional support queries
  // should NEVER trigger external lookup. They contain no "current events" intent.
  // Must run BEFORE VOLATILE patterns so "I need support today" is not caught by "today".
  // NOTE: This runs AFTER freshness markers so queries like "Have we gotten any further with
  // what's going on with Greenland" route to external lookup despite conversational phrasing.
  //
  // ISSUE #824 FIX: Added PERSONAL_RECALL patterns.
  // "Do you recall names of my monkeys?" was misclassified as SEMI_STABLE high_stakes
  // because "recall" matched the SAFETY domain pattern (product recalls). Personal memory
  // recall queries (do you recall, do you remember, what do you know about my...) should
  // be classified as PERMANENT with skipExternalLookup — memory retrieval ONLY, no RSS.
  const CONVERSATIONAL_PATTERNS = [
    // Pure greetings
    /^(hello|hi|hey|greetings|howdy|yo|sup|hiya|hola)\s*[!.,?]?\s*$/i,
    /^(how are you|how'?s? it going|what'?s? up|nice to meet you|good (morning|afternoon|evening|night))\s*[!.,?]?\s*$/i,
    /^(thanks|thank you|thank u|thx|ty|cheers|ok|okay|alright|sure|great|perfect|awesome|got it|understood)\s*[!.,?]?\s*$/i,
    // Memory storage commands ("Remember that my..." / "Please remember...")
    /\b(remember (that )?my|please remember|don'?t forget (that )?my|note that my|keep in mind that my)\b/i,
    // Personal facts the user is sharing about themselves
    /\bmy (name|email|phone|address|birthday|age|job|company|favorite|favourite|colour|color|pet|dog|cat|child|kid|son|daughter|wife|husband|partner|allergy|medication|condition|hobby|car|home|house|boss|manager|salary|income|wage|pay|earnings|compensation) (is|are|was|=)\b/i,
    // Salary/compensation updates — "my salary is now $X", "actually my salary is now $X"
    // "now" between "is" and the amount causes VOLATILE misclassification without this guard
    /\bmy\s+(salary|income|wage|pay|earnings|compensation)\s+is\s+(now\s+)?\$?[\d,]+/i,
    // First-person earnings statements — "I make $X", "I earn $X", "I now make $X"
    /\bi\s+(now\s+)?(make|earn|get paid)\s+\$?[\d,]+/i,
    /\bi have (a |an )?(dog|cat|kid|child|daughter|son|wife|husband|partner|allergy|pet|house|car)\b/i,
    /\bi (live|work|reside|grew up|was born|studied) (in|at|near|by|for)\b/i,
    // Emotional support requests (not asking for news)
    /\bi (need|want|am looking for|'?m looking for) .{0,50}(emotional |mental )?(support|help|someone to talk|a friend|comfort|encouragement)\b/i,
    /\bi'?m (feeling|struggling|upset|sad|depressed|anxious|stressed|worried|tired|overwhelmed|lonely|happy|excited|scared|frustrated|confused)\b/i,
    // PERSONAL RECALL (Issue #824): Asking the AI to recall stored personal information.
    // These queries use memory retrieval ONLY — never external lookup.
    // "Do you recall names of my monkeys?" / "Do you remember my children?"
    /\b(do you (recall|remember)|can you (recall|remember)|you (recall|remember))\b.{0,40}\bmy\b/i,
    // "What do you know about my X?" / "Tell me about my X" / "What's my X?"
    /\b(what do you (know|have|remember) about my|tell me (what you know about |about )?my|what'?s? my)\b/i,
    // "From our conversations" / "I told you" / "We discussed"
    /\b(from our (previous )?conversations?|i told you|you told me|we (discussed|talked) about|you mentioned)\b/i,
    // Explicit memory recall commands with possessive
    /\b(recall|remember).{0,30}\bmy\b/i,
  ];
  const isConversationalOrPersonal = CONVERSATIONAL_PATTERNS.some(p => p.test(query));
  if (isConversationalOrPersonal) {
    console.log('[truthTypeDetector] Conversational/personal pattern detected — classifying as PERMANENT, no external lookup');
    return {
      type: TRUTH_TYPES.PERMANENT,
      confidence: 0.95,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.PERMANENT, pattern: 'conversational_personal_statement' }],
      conflict_detected: false,
      reason: 'Conversational or personal statement — memory-first, no external lookup needed',
      skipExternalLookup: true
    };
  }

  // ISSUE #881 FIX: Named Entity + Action Pattern Detection (Semantic, Not Keyword Lists)
  // Detects queries about named entities' recent actions where surface freshness markers are absent.
  // Must run AFTER conversational/personal check (to preserve personal query handling) and
  // BEFORE PERMANENT patterns (to prevent "what is [entity] [action gerund]" misclassification).
  // Examples caught: "Did Saudi Arabia make a commitment", "What is Schumer demanding from Trump",
  //                  "Did the Coast Guard have anything really big happen"
  if (hasNamedEntityActionPattern(query)) {
    console.log('[truthTypeDetector] Named entity + action pattern detected — classifying as SEMI_STABLE (entity action current event)');
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.85,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.SEMI_STABLE, pattern: 'entity_action_current_event' }],
      conflict_detected: false,
      reason: 'Named entity + action structure — likely current event query, external lookup required'
    };
  }

  // LEADERSHIP CURRENT-HOLDER DETECTION
  // "Who is the current [role]" queries are SEMI_STABLE not VOLATILE
  // Leadership positions change occasionally but not at real-time frequency
  // This must run BEFORE generic VOLATILE detection catches "current"
  const LEADERSHIP_PATTERNS = [
    /\b(who is|who'?s) the (current )?( ?(president|prime minister|chancellor|secretary of state|secretary|governor|mayor|chairman|director|minister|senator|representative|speaker|ambassador|chief|head of|ceo|cfo|cto|coo|commissioner|superintendent))\b/i,
    /\b(who is|who'?s) (currently )?(serving as|acting as|leading|running|in charge of)\b/i,
    /\b(current|acting) (president|prime minister|chancellor|secretary|governor|mayor|chairman|director|minister|senator|representative|speaker|ambassador|chief|ceo|cfo|cto)\b/i
  ];
  const isLeadershipQuery = LEADERSHIP_PATTERNS.some(p => p.test(query));
  if (isLeadershipQuery) {
    console.log('[truthTypeDetector] Leadership current-holder query detected — classifying as SEMI_STABLE');
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.90,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.SEMI_STABLE, pattern: 'leadership_current_holder' }],
      conflict_detected: false,
      reason: 'Current leadership/officeholder query — SEMI_STABLE, not real-time volatile'
    };
  }

  // POLICY/REGULATION/RATES DETECTION
  // These change occasionally but are not real-time volatile
  // "current interest rates" "current travel restrictions"
  // "current OSHA requirements" "current tax rate"
  // Must run BEFORE generic VOLATILE detection catches "current"
  const POLICY_PATTERNS = [
    /\b(current|latest) (interest rates?|mortgage rates?|tax rates?|corporate tax)\b/i,
    /\b(current|latest) (travel restrictions?|visa requirements?|entry requirements?)\b/i,
    /\b(current|latest) (osha|fda|epa|cdc|irs)\b.{0,30}\b(requirements?|guidelines?|regulations?|rules?|standards?)\b/i,
    /\b(current|latest) (covid|vaccine|health) (requirements?|guidelines?|restrictions?|protocols?)\b/i,
    /\b(current|latest) (minimum wage|medicaid|medicare|social security) (threshold|rate|limit|eligibility)\b/i,
    /\b(what (is|are) the current (version|release)) of\b/i,
    /\b(is .* still (available|offer(?:ed|ing)|supported|active))\b/i
  ];
  const isPolicyQuery = POLICY_PATTERNS.some(p => p.test(query));
  if (isPolicyQuery) {
    console.log('[truthTypeDetector] Policy/regulation/rates query detected — classifying as SEMI_STABLE');
    return {
      type: TRUTH_TYPES.SEMI_STABLE,
      confidence: 0.85,
      stage: 1,
      patterns_matched: [{ type: TRUTH_TYPES.SEMI_STABLE, pattern: 'policy_regulation_current' }],
      conflict_detected: false,
      reason: 'Policy/regulation/rates query — SEMI_STABLE, changes occasionally but not real-time'
    };
  }

  // Check PERMANENT patterns first (stable facts should win over volatility)
  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      // Ambiguity guard for biological yes/no pattern: if unresolved pronouns present
      // without a clear subject noun, do not classify as PERMANENT
      if (hasUnresolvedPronoun(query)) {
        continue;
      }
      matchedPatterns.push({ type: TRUTH_TYPES.PERMANENT, pattern: pattern.toString() });
    }
  }

  // Check VOLATILE patterns
  for (const pattern of VOLATILE_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push({ type: TRUTH_TYPES.VOLATILE, pattern: pattern.toString() });
    }
  }

  // Check SEMI_STABLE patterns
  for (const pattern of SEMI_STABLE_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      matchedPatterns.push({ type: TRUTH_TYPES.SEMI_STABLE, pattern: pattern.toString() });
    }
  }

  // No patterns matched = ambiguous
  if (matchedPatterns.length === 0) {
    return {
      type: TRUTH_TYPES.AMBIGUOUS,
      confidence: 0,
      stage: 1,
      patterns_matched: [],
      reason: 'No deterministic patterns matched'
    };
  }

  // Count matches by type
  const typeCounts = {
    [TRUTH_TYPES.VOLATILE]: 0,
    [TRUTH_TYPES.SEMI_STABLE]: 0,
    [TRUTH_TYPES.PERMANENT]: 0
  };

  for (const match of matchedPatterns) {
    typeCounts[match.type]++;
  }

  // Determine winning type
  // NEW PRIORITY: PERMANENT wins if no VOLATILE markers present
  // Only VOLATILE beats PERMANENT (when time-sensitivity is explicit)
  let winningType = TRUTH_TYPES.AMBIGUOUS;
  let maxCount = 0;

  if (typeCounts[TRUTH_TYPES.VOLATILE] > 0) {
    // Explicit time-sensitivity markers win
    winningType = TRUTH_TYPES.VOLATILE;
    maxCount = typeCounts[TRUTH_TYPES.VOLATILE];
  } else if (typeCounts[TRUTH_TYPES.PERMANENT] > 0) {
    // Stable facts win over semi-stable when no volatility present
    winningType = TRUTH_TYPES.PERMANENT;
    maxCount = typeCounts[TRUTH_TYPES.PERMANENT];
  } else if (typeCounts[TRUTH_TYPES.SEMI_STABLE] > 0) {
    winningType = TRUTH_TYPES.SEMI_STABLE;
    maxCount = typeCounts[TRUTH_TYPES.SEMI_STABLE];
  }

  // Check for conflicting types (multiple types matched)
  const typesMatched = Object.values(typeCounts).filter(c => c > 0).length;
  if (typesMatched > 1) {
    // Multiple types matched - VOLATILE wins over all, PERMANENT wins over SEMI_STABLE
    let conflictWinner = winningType;
    let conflictReason = 'Multiple truth types detected';

    if (typeCounts[TRUTH_TYPES.VOLATILE] > 0) {
      conflictWinner = TRUTH_TYPES.VOLATILE;
      conflictReason = 'Multiple truth types detected, VOLATILE markers take precedence';
    } else if (typeCounts[TRUTH_TYPES.PERMANENT] > 0) {
      conflictWinner = TRUTH_TYPES.PERMANENT;
      conflictReason = 'Multiple truth types detected, PERMANENT wins without VOLATILE markers';
    }

    return {
      type: conflictWinner,
      confidence: 0.6, // Lower confidence due to conflict
      stage: 1,
      patterns_matched: matchedPatterns,
      conflict_detected: true,
      reason: conflictReason
    };
  }

  // Clean single-type match
  const confidence = Math.min(0.95, 0.7 + (maxCount * 0.1));
  
  return {
    type: winningType,
    confidence: confidence,
    stage: 1,
    patterns_matched: matchedPatterns,
    conflict_detected: false,
    reason: `Matched ${maxCount} ${winningType} pattern(s)`
  };
}

/**
 * Detect if query falls into a high-stakes domain
 * @param {string} query - The user's query
 * @returns {object} { isHighStakes: boolean, domains: array }
 */
export function detectHighStakesDomain(query) {
  if (!query || typeof query !== 'string') {
    return { isHighStakes: false, domains: [] };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const matchedDomains = [];

  for (const [domain, patterns] of Object.entries(HIGH_STAKES_DOMAINS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery)) {
        matchedDomains.push(domain);
        break; // One match per domain is enough
      }
    }
  }

  return {
    isHighStakes: matchedDomains.length > 0,
    domains: matchedDomains
  };
}

/**
 * Stage 2: AI Classifier (only called if Stage 1 returns AMBIGUOUS)
 * Uses gpt-4o-mini to classify query intent and truth type semantically.
 * @param {string} query - The user's query
 * @param {object} context - Additional context (analysis, memoryContext, conversationHistory, etc.)
 * @returns {Promise<object>} { type: string, confidence: number, stage: 2, intent_class: string, lookup_recommended: boolean, reasoning: string }
 */
export async function classifyAmbiguous(query, context = {}) {
  console.log('[truthTypeDetector] Stage 2 classifier invoked for ambiguous query');

  const fallback = {
    type: TRUTH_TYPES.SEMI_STABLE,
    confidence: 0.5,
    stage: 2,
    intent_class: 'GENUINE_AMBIGUOUS',
    lookup_recommended: false,
    reasoning: 'Stage 2 fallback — classifier unavailable'
  };

  try {
    // Build context signals for the classifier
    const intentSignal = context.analysis?.intent
      ? `Query intent detected by semantic analysis: ${context.analysis.intent} (confidence: ${context.analysis.intentConfidence})`
      : '';

    const domainSignal = context.analysis?.domain
      ? `Domain: ${context.analysis.domain}`
      : '';

    const complexitySignal = context.analysis?.complexity
      ? `Complexity: ${context.analysis.complexity}`
      : '';

    const memorySignal = typeof context.memoryContext?.memoryCount === 'number' && context.memoryContext.memoryCount > 0
      ? `User has ${context.memoryContext.memoryCount} stored memories — may be personal query`
      : '';

    const lastAssistant = context.conversationHistory
      ?.findLast?.(m => m.role === 'assistant')?.content?.slice(0, 200) ||
      context.conversationHistory
        ?.filter(m => m.role === 'assistant')
        ?.slice(-1)[0]?.content?.slice(0, 200) || '';

    const conversationTopic = context.conversationHistory
      ?.filter(m => m.role === 'user')
      ?.slice(-3)
      ?.map(m => m.content)
      ?.join(' | ') || '';

    const systemPrompt = `You are a query classifier. Classify the user query into exactly one intent class and determine truth type.

INTENT CLASSES:
- VERIFICATION: User is questioning or asking to verify a prior claim. Examples: "are you sure", "double check that", "is that right", "verify that"
- BIOLOGICAL_NATURAL_FACT: Question about biology, nature, animals, science that has a stable documented answer. Examples: "can hippos have triplets", "do bears hibernate"
- ANALYTICAL_FOLLOWUP: User is asking for analysis or comparison continuing a prior topic. Examples: "how does that compare", "what are the pros and cons", "which is better"
- PERSONAL_CONTEXTUAL: Query requires user's personal context to answer. Examples: "which fits my budget", "what works for my situation", "which should I choose"
- GENUINE_AMBIGUOUS: Truly unclear without more context

TRUTH TYPES:
- VOLATILE: Changes daily or faster (prices, breaking news, live events)
- SEMI_STABLE: Changes monthly or slower (leadership, policies, specs)
- PERMANENT: Does not change in human lifetime (scientific facts, history, math)

LOOKUP RECOMMENDATION:
- true: External data would materially improve the answer
- false: Query can be answered from training knowledge or conversation context

Respond with ONLY valid JSON. No other text:
{
  "intent_class": "VERIFICATION|BIOLOGICAL_NATURAL_FACT|ANALYTICAL_FOLLOWUP|PERSONAL_CONTEXTUAL|GENUINE_AMBIGUOUS",
  "truth_type": "VOLATILE|SEMI_STABLE|PERMANENT",
  "lookup_recommended": true|false,
  "confidence_band": "high|medium|low",
  "notes": "one short internal note max 15 words"
}`;

    const userPrompt = `Query: "${query}"
${intentSignal}
${domainSignal}
${complexitySignal}
${memorySignal}
${lastAssistant ? `Last assistant response (first 200 chars): "${lastAssistant}"` : ''}
${conversationTopic ? `Recent conversation topic: "${conversationTopic}"` : ''}`;

    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    // Validate required fields
    const validIntentClasses = ['VERIFICATION', 'BIOLOGICAL_NATURAL_FACT', 'ANALYTICAL_FOLLOWUP', 'PERSONAL_CONTEXTUAL', 'GENUINE_AMBIGUOUS'];
    const validTruthTypes = ['VOLATILE', 'SEMI_STABLE', 'PERMANENT'];

    if (!validIntentClasses.includes(parsed.intent_class)) return fallback;
    if (!validTruthTypes.includes(parsed.truth_type)) return fallback;

    // Map confidence band to numeric value
    const confidenceMap = { high: 0.85, medium: 0.65, low: 0.45 };
    const confidence = confidenceMap[parsed.confidence_band] || 0.5;

    console.log(`[truthTypeDetector] Stage 2 classified: intent=${parsed.intent_class} truth_type=${parsed.truth_type} lookup=${parsed.lookup_recommended} confidence=${confidence}`);

    return {
      type: TRUTH_TYPES[parsed.truth_type],
      confidence,
      stage: 2,
      intent_class: parsed.intent_class,
      lookup_recommended: parsed.lookup_recommended,
      reasoning: parsed.notes || '',
      tokens_used: completion.usage?.total_tokens || 0
    };

  } catch (error) {
    console.error('[truthTypeDetector] Stage 2 classification failed:', error.message);
    return fallback;
  }
}

/**
 * Main entry point: Detect truth type for a query
 * @param {string} query - The user's query
 * @param {object} context - Additional context (mode, conversation history)
 * @returns {Promise<object>} Complete truth type detection result
 */
export async function detectTruthType(query, context = {}) {
  const startTime = Date.now();
  
  // Stage 1: Deterministic detection (zero cost)
  const patternResult = detectByPattern(query);
  
  // Check high-stakes domains
  const highStakesResult = detectHighStakesDomain(query);
  
  // If Stage 1 found a clear type, return it
  if (patternResult.type !== TRUTH_TYPES.AMBIGUOUS) {
    return {
      success: true,
      ...patternResult,
      high_stakes: highStakesResult,
      ttl_ms: TTL_CONFIG[patternResult.type],
      detection_time_ms: Date.now() - startTime
    };
  }
  
  // Stage 2: AI classification for ambiguous queries
  const aiResult = await classifyAmbiguous(query, context);
  
  return {
    success: true,
    ...aiResult,
    high_stakes: highStakesResult,
    ttl_ms: TTL_CONFIG[aiResult.type] || TTL_CONFIG.SEMI_STABLE,
    detection_time_ms: Date.now() - startTime
  };
}

/**
 * Get TTL for a truth type
 * @param {string} truthType - The truth type
 * @returns {number} TTL in milliseconds
 */
export function getTTL(truthType) {
  return TTL_CONFIG[truthType] || TTL_CONFIG.SEMI_STABLE;
}

/**
 * Test endpoint handler for /api/test-semantic?action=truth-type
 * @param {string} query - Query to test
 * @returns {Promise<object>} Detection result with telemetry
 */
export async function testDetection(query) {
  console.log('[truthTypeDetector] Test detection for:', query);
  
  const result = await detectTruthType(query);
  
  return {
    query: query,
    result: result,
    telemetry: {
      truth_type: result.type,
      confidence: result.confidence,
      stage: result.stage,
      high_stakes: result.high_stakes,
      ttl_ms: result.ttl_ms,
      detection_time_ms: result.detection_time_ms
    }
  };
}

// Default export for convenience
export default {
  TRUTH_TYPES,
  TTL_CONFIG,
  HIGH_STAKES_DOMAINS,
  detectByPattern,
  detectHighStakesDomain,
  classifyAmbiguous,
  detectTruthType,
  getTTL,
  testDetection
};
