// api/core/intelligence/session-state-extractor.js
// SESSION STATE EXTRACTOR — Intelligent session continuity management
//
// PURPOSE: Extracts and compresses conversational state so long sessions
// maintain continuity without unbounded token growth.
//
// DISTINCT FROM intelligent-storage.js:
//   - intelligent-storage asks: "What should persist across sessions forever?"
//   - This module asks: "What must stay active so THIS session continues correctly?"

// NOTE: OpenAI is imported lazily inside extractSessionState() so that all
// pure-logic exports (shouldExtract, mergeSessionState, buildSessionContext, etc.)
// remain importable in test environments that don't have node_modules present.

// ─── Size limits (spec §STATE_LIMITS) ────────────────────────────────────────

const STATE_LIMITS = {
  active_objectives: 5,
  decisions_made: 10,
  constraints: 10,
  unresolved_threads: 8,
  user_preferences: 10,
  facts_established: 15,
  risk_flags: 8,
  active_entities_per_category: 10,
  recent_references: 10,
  open_dependencies: 8,
};

// ─── Empty state template ─────────────────────────────────────────────────────

export function createEmptySessionState() {
  return {
    active_entities: [],
    current_focus: { entity: null, objective: null },
    recent_references: [],
    decisions_made: [],
    unresolved_threads: [],
    open_dependencies: [],
    facts_established: [],
    constraints: [],
    risk_flags: [],
    active_objectives: [],
    user_preferences: [],
    exchange_count: 0, // incremented by server.js after each successful exchange
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateStateSchema(state) {
  if (!state || typeof state !== 'object') throw new Error('State must be an object');
  const required = [
    'active_entities',
    'current_focus',
    'recent_references',
    'decisions_made',
    'unresolved_threads',
    'open_dependencies',
    'facts_established',
    'constraints',
    'risk_flags',
    'active_objectives',
  ];
  for (const key of required) {
    if (!(key in state)) throw new Error(`Missing key: ${key}`);
  }
}

// ─── shouldExtract (spec §Extraction runs ONLY when) ─────────────────────────

function countPronouns(exchanges) {
  const pronounPattern = /\b(it|they|this|that|he|she|him|her|them|its|their)\b/gi;
  const text = exchanges.map((e) => e.content || '').join(' ');
  return (text.match(pronounPattern) || []).length;
}

function calculateReferenceDensity(exchanges) {
  if (!exchanges || exchanges.length === 0) return 0;
  const totalWords = exchanges.reduce((sum, e) => sum + (e.content || '').split(/\s+/).length, 0);
  if (totalWords === 0) return 0;
  return countPronouns(exchanges) / Math.max(totalWords / 10, 1);
}

function isKnownEntity(message, sessionState) {
  if (!sessionState || !sessionState.active_entities) return false;
  return sessionState.active_entities.some((entity) => {
    const name = (entity.name || entity.description || '').toLowerCase();
    return name.length > 2 && message.toLowerCase().includes(name);
  });
}

const CORRECTION_SIGNALS = [
  /\b(actually|no I meant|instead|forget that)\b/i,
  /\b(correction|wait|scratch that)\b/i,
  /\b(not .{1,20} but|I said .{1,20} not)\b/i,
  /\b(change .{1,20} to)\b/i,
];

const MEANINGFUL_SIGNALS = [
  /\b(decided|decision|we will|we won't|agreed)\b/i,
  /\b(must|cannot|required|constraint|limit)\b/i,
  /\b(waiting for|depends on|blocked by)\b/i,
  /\b(risk|warning|danger|critical)\b/i,
  /\b(goal|objective|trying to|need to)\b/i,
];

export function shouldExtract(
  message,
  sessionState,
  rawExchanges = [],
  estimatedHistoryTokens = 0,
) {
  const rawWindowSize = calculateRawWindowSize(rawExchanges, sessionState);

  // 1. Token budget threshold
  if (estimatedHistoryTokens > 2000) return true;

  // 2. Raw window overflow
  if (rawExchanges.length > rawWindowSize) return true;

  // 3. Semantic compression ready (all three conditions required)
  //    Guard: requires at least one exchange — trivially empty sessions should not trigger compression
  const hasNoUnresolvedThreads = !sessionState?.unresolved_threads?.length;
  const hasNoOpenDependencies = !sessionState?.open_dependencies?.length;
  const recentDensityLow = calculateReferenceDensity(rawExchanges) < 2;
  if (
    rawExchanges.length > 0 &&
    hasNoUnresolvedThreads &&
    hasNoOpenDependencies &&
    recentDensityLow
  )
    return true;

  // 4. Periodic maintenance — every 4 exchanges regardless of semantic conditions
  //    exchangeCount of 0 is excluded so a brand-new session with no history doesn't fire
  const exchangeCount = sessionState?.exchange_count || 0;
  if (rawExchanges.length >= 4 && exchangeCount > 0 && exchangeCount % 4 === 0) return true;

  // 5. Correction language
  if (CORRECTION_SIGNALS.some((p) => p.test(message))) return true;

  // 6. Meaningful state change
  if (MEANINGFUL_SIGNALS.some((p) => p.test(message))) return true;

  // 7. Named entity detection
  const newEntityDetected =
    /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/.test(message) && !isKnownEntity(message, sessionState);
  if (newEntityDetected) return true;

  return false;
}

// ─── Raw window size (spec §Dynamic raw window) ───────────────────────────────

export function calculateRawWindowSize(recentExchanges, lastStableState) {
  const referenceDensity = countPronouns(recentExchanges || []);
  const knownDependencies = lastStableState?.open_dependencies?.length || 0;

  if (referenceDensity > 5 || knownDependencies > 3) return 5;
  if (referenceDensity > 2 || knownDependencies > 1) return 3;
  return 2;
}

// ─── State size enforcement (spec §Pruning order) ────────────────────────────

export function enforceStateSizeLimits(state) {
  // Helper: prune array to limit, using priority order
  function pruneArray(arr, limit, alwaysKeepFn) {
    if (!Array.isArray(arr) || arr.length <= limit) return arr;

    // Never prune entries matching the "always keep" predicate
    const keep = arr.filter((item) => alwaysKeepFn && alwaysKeepFn(item));
    const candidates = arr.filter((item) => !(alwaysKeepFn && alwaysKeepFn(item)));

    // Pruning order: superseded → resolved/completed → oldest provisional
    const superseded = candidates.filter((i) => i.status === 'superseded');
    const resolved = candidates.filter((i) => i.status === 'completed' || i.status === 'resolved');
    const rest = candidates.filter(
      (i) => i.status !== 'superseded' && i.status !== 'completed' && i.status !== 'resolved',
    );

    const combined = [...keep, ...rest, ...resolved, ...superseded];
    return combined.slice(0, limit);
  }

  // active_objectives — never prune
  if (
    Array.isArray(state.active_objectives) &&
    state.active_objectives.length > STATE_LIMITS.active_objectives
  ) {
    state.active_objectives = pruneArray(
      state.active_objectives,
      STATE_LIMITS.active_objectives,
      () => true,
    );
  }

  // decisions_made — never prune active/relevant
  if (
    Array.isArray(state.decisions_made) &&
    state.decisions_made.length > STATE_LIMITS.decisions_made
  ) {
    state.decisions_made = pruneArray(
      state.decisions_made,
      STATE_LIMITS.decisions_made,
      (i) => i.status === 'active',
    );
  }

  // constraints
  if (Array.isArray(state.constraints) && state.constraints.length > STATE_LIMITS.constraints) {
    state.constraints = pruneArray(state.constraints, STATE_LIMITS.constraints, null);
  }

  // unresolved_threads — never prune (spec: NEVER PRUNE)

  // facts_established — never prune confirmed
  if (
    Array.isArray(state.facts_established) &&
    state.facts_established.length > STATE_LIMITS.facts_established
  ) {
    state.facts_established = pruneArray(
      state.facts_established,
      STATE_LIMITS.facts_established,
      (i) => i.status === 'confirmed',
    );
  }

  // risk_flags
  if (Array.isArray(state.risk_flags) && state.risk_flags.length > STATE_LIMITS.risk_flags) {
    state.risk_flags = pruneArray(state.risk_flags, STATE_LIMITS.risk_flags, null);
  }

  // recent_references
  if (
    Array.isArray(state.recent_references) &&
    state.recent_references.length > STATE_LIMITS.recent_references
  ) {
    state.recent_references = state.recent_references.slice(-STATE_LIMITS.recent_references);
  }

  // open_dependencies — never prune (spec: NEVER PRUNE)

  // active_entities — never prune primary
  if (
    Array.isArray(state.active_entities) &&
    state.active_entities.length > STATE_LIMITS.active_entities_per_category
  ) {
    state.active_entities = pruneArray(
      state.active_entities,
      STATE_LIMITS.active_entities_per_category,
      (i) => i.is_primary === true,
    );
  }

  // user_preferences
  if (
    Array.isArray(state.user_preferences) &&
    state.user_preferences.length > STATE_LIMITS.user_preferences
  ) {
    state.user_preferences = state.user_preferences.slice(-STATE_LIMITS.user_preferences);
  }

  return state;
}

// ─── State merge (spec §State merge rules) ───────────────────────────────────

export function mergeSessionState(existing, extracted) {
  // Never full replacement — always merge
  const merged = {
    active_entities: [...(existing?.active_entities || [])],
    current_focus: existing?.current_focus || { entity: null, objective: null },
    recent_references: [...(existing?.recent_references || [])],
    decisions_made: [...(existing?.decisions_made || [])],
    unresolved_threads: [...(existing?.unresolved_threads || [])],
    open_dependencies: [...(existing?.open_dependencies || [])],
    facts_established: [...(existing?.facts_established || [])],
    constraints: [...(existing?.constraints || [])],
    risk_flags: [...(existing?.risk_flags || [])],
    active_objectives: [...(existing?.active_objectives || [])],
    user_preferences: [...(existing?.user_preferences || [])],
    exchange_count: existing?.exchange_count || 0,
  };

  if (!extracted) return enforceStateSizeLimits(merged);

  // current_focus — raw exchange wins; always update from extracted
  if (extracted.current_focus) {
    merged.current_focus = extracted.current_focus;
  }

  // active_entities — deduplicate by name/description
  for (const entity of extracted.active_entities || []) {
    const key = (entity.name || entity.description || '').toLowerCase().trim();
    const existingIdx = merged.active_entities.findIndex(
      (e) => (e.name || e.description || '').toLowerCase().trim() === key,
    );
    if (existingIdx === -1) {
      merged.active_entities.push(entity);
    } else {
      // Update last_mentioned if newer
      const existing_entity = merged.active_entities[existingIdx];
      if ((entity.last_mentioned || 0) > (existing_entity.last_mentioned || 0)) {
        merged.active_entities[existingIdx] = { ...existing_entity, ...entity };
      }
    }
  }

  // Merge arrays with deduplication + status upgrade logic
  function mergeArray(existingArr, newItems, getKey) {
    const result = [...existingArr];
    for (const item of newItems || []) {
      const key = getKey(item);
      const existingIdx = result.findIndex((e) => getKey(e) === key);
      if (existingIdx === -1) {
        result.push(item);
      } else {
        const prev = result[existingIdx];
        if (prev.status === 'superseded') {
          // Re-add as new active — superseded entry stays (for tracking)
          result.push({ ...item, status: item.status || 'active' });
        } else if (prev.status === 'provisional' && item.status === 'confirmed') {
          // Upgrade provisional → confirmed
          result[existingIdx] = { ...prev, ...item, status: 'confirmed' };
        }
        // If exists and confirmed — skip (no duplicate)
      }
    }
    return result;
  }

  // Key function: prefer stable text fields; fall back to description/content; last resort uses a
  // concatenation of sorted values rather than full JSON to avoid property-order sensitivity.
  const textKey = (i) => {
    const primary = i.text || i.description || i.content;
    if (primary) return primary.toLowerCase().slice(0, 80);
    // Predictable fallback: sorted key-value pairs (avoids JSON property-order variance)
    return Object.keys(i)
      .sort()
      .map((k) => `${k}:${i[k]}`)
      .join('|')
      .toLowerCase()
      .slice(0, 80);
  };

  merged.decisions_made = mergeArray(merged.decisions_made, extracted.decisions_made, textKey);
  merged.facts_established = mergeArray(
    merged.facts_established,
    extracted.facts_established,
    textKey,
  );
  merged.constraints = mergeArray(merged.constraints, extracted.constraints, textKey);
  merged.risk_flags = mergeArray(merged.risk_flags, extracted.risk_flags, textKey);
  merged.active_objectives = mergeArray(
    merged.active_objectives,
    extracted.active_objectives,
    textKey,
  );

  // Unresolved threads — append new, remove ones that appear resolved
  const resolvedKeys = new Set(
    (extracted.unresolved_threads || []).filter((t) => t.resolved === true).map((t) => textKey(t)),
  );
  merged.unresolved_threads = merged.unresolved_threads.filter(
    (t) => !resolvedKeys.has(textKey(t)),
  );
  for (const thread of extracted.unresolved_threads || []) {
    if (!thread.resolved) {
      const key = textKey(thread);
      if (!merged.unresolved_threads.find((t) => textKey(t) === key)) {
        merged.unresolved_threads.push(thread);
      }
    }
  }

  // Open dependencies — same pattern
  const resolvedDeps = new Set(
    (extracted.open_dependencies || []).filter((d) => d.resolved === true).map((d) => textKey(d)),
  );
  merged.open_dependencies = merged.open_dependencies.filter((d) => !resolvedDeps.has(textKey(d)));
  for (const dep of extracted.open_dependencies || []) {
    if (!dep.resolved) {
      const key = textKey(dep);
      if (!merged.open_dependencies.find((d) => textKey(d) === key)) {
        merged.open_dependencies.push(dep);
      }
    }
  }

  // Recent references — append (bounded by limits)
  merged.recent_references = [...merged.recent_references, ...(extracted.recent_references || [])];

  // User preferences — merge
  merged.user_preferences = mergeArray(
    merged.user_preferences,
    extracted.user_preferences || [],
    textKey,
  );

  return enforceStateSizeLimits(merged);
}

// ─── AI extraction (spec §Extraction prompt) ─────────────────────────────────
// OpenAI is imported lazily so pure-logic exports remain testable without node_modules.

export async function extractSessionState(userMsg, assistantMsg, _currentState) {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Cap input lengths to limit prompt size and mitigate oversized injection risk.
  // The extraction model (gpt-4o-mini) is the target of these inputs; they are
  // already user-generated content handled in a non-privileged extraction context.
  const MAX_MSG_CHARS = 4000;
  const safeUserMsg = String(userMsg || '').slice(0, MAX_MSG_CHARS);
  const safeAssistantMsg = String(assistantMsg || '').slice(0, MAX_MSG_CHARS);

  const prompt = `Given this conversation exchange:
User: ${safeUserMsg}
Assistant: ${safeAssistantMsg}

Extract session continuity information only.
Return structured JSON.

Extract:
1. active_entities: people, systems, products, organizations introduced or referenced.
   For each note: description, is_primary (bool), last_mentioned exchange number.

2. current_focus: what entity and objective is currently active. What does "it/they/this/that" resolve to right now.

3. recent_references: pronoun resolutions. Rate confidence: high/medium/low.

4. decisions_made: explicit decisions stated. Status: active only. Skip tentative.

5. unresolved_threads: questions posed that were not answered.

6. open_dependencies: "waiting for X before Y"

7. facts_established: facts stated as true. Status: confirmed or provisional.

8. constraints: requirements or limits stated.

9. risk_flags: risks or warnings raised.

10. active_objectives: goals stated.

DO NOT preserve:
- Rhetorical filler or pleasantries
- Assistant phrasing style
- Resolved sub-questions unless they affect current state
- Duplicate facts already represented
- Abandoned threads
- Superseded information

CONFLICT RULE:
If anything conflicts with the most recent raw exchange — raw exchange wins.

Return JSON only. No explanation.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.choices[0].message.content.trim();

  // Strip markdown code fences if present
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`[SESSION-STATE] Extraction returned non-JSON: ${raw.slice(0, 200)}`);
  }

  validateStateSchema(parsed);
  return parsed;
}

// ─── Focus resolver (spec §current_focus fallback) ───────────────────────────

function getMostRecentPrimaryEntity(sessionState) {
  if (!sessionState?.active_entities) return null;
  const primaries = sessionState.active_entities.filter((e) => e.is_primary === true);
  if (primaries.length === 0) return null;
  return primaries.reduce((best, e) =>
    (e.last_mentioned || 0) > (best.last_mentioned || 0) ? e : best,
  );
}

function resolveFocus(sessionState) {
  if (sessionState?.current_focus?.entity) {
    return sessionState.current_focus;
  }
  const primaryEntity = getMostRecentPrimaryEntity(sessionState);
  if (primaryEntity) {
    return {
      ...(sessionState?.current_focus || {}),
      entity: primaryEntity.name || primaryEntity.description,
    };
  }
  return { entity: null, objective: null };
}

// ─── Context builders (spec §buildSessionContext) ────────────────────────────

function getRawWindow(rawHistory, sessionState) {
  const windowSize = calculateRawWindowSize(rawHistory, sessionState);
  return rawHistory.slice(-Math.max(windowSize, 2));
}

function getPrimaryEntities(sessionState) {
  return (sessionState?.active_entities || []).filter((e) => e.is_primary === true);
}

function getActiveDecisions(sessionState) {
  return (sessionState?.decisions_made || []).filter((d) => d.status !== 'superseded');
}

function getConfirmedFacts(sessionState) {
  return (sessionState?.facts_established || []).filter((f) => f.status === 'confirmed');
}

/**
 * Builds the context array for injection into AI messages when SESSION_STATE_ENABLED=true.
 * Returns an array of {role, content} messages shaped for the AI messages array.
 *
 * Assembly order (spec §Context assembly order — priority-based):
 *   1. Raw window — always included
 *   2. High-priority state — always included
 *   3. Retrieved memory — handled by orchestrator budget logic
 *   4. Low-priority state — only if budget remains
 */
export function buildSessionContext(sessionState, rawHistory) {
  const BUDGET_HISTORY = 2000; // tokens
  const CHARS_PER_TOKEN = 4;

  // 1. Raw window — always preserved
  const rawWindow = getRawWindow(rawHistory || [], sessionState);

  // 2. High-priority state
  const focus = resolveFocus(sessionState);
  const highPriority = {
    current_focus: focus,
    unresolved_threads: sessionState?.unresolved_threads || [],
    open_dependencies: sessionState?.open_dependencies || [],
    primary_entities: getPrimaryEntities(sessionState),
  };

  // 3. Low-priority state
  const lowPriority = {
    decisions_made: getActiveDecisions(sessionState),
    constraints: sessionState?.constraints || [],
    user_preferences: sessionState?.user_preferences || [],
    facts_established: getConfirmedFacts(sessionState),
    risk_flags: sessionState?.risk_flags || [],
  };

  // Estimate token usage
  const highPriorityText = JSON.stringify(highPriority);
  const lowPriorityText = JSON.stringify(lowPriority);
  const rawWindowText = rawWindow.map((m) => m.content || '').join(' ');

  const rawTokens = Math.ceil(rawWindowText.length / CHARS_PER_TOKEN);
  const highTokens = Math.ceil(highPriorityText.length / CHARS_PER_TOKEN);
  const lowTokens = Math.ceil(lowPriorityText.length / CHARS_PER_TOKEN);

  // Determine what fits in budget
  const includeLowPriority = rawTokens + highTokens + lowTokens <= BUDGET_HISTORY;

  // Build messages array
  const messages = [];

  // Always include raw window
  for (const msg of rawWindow) {
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Inject high-priority session state as a context prefix
  const hasHighPriorityContent =
    focus.entity ||
    highPriority.unresolved_threads.length > 0 ||
    highPriority.open_dependencies.length > 0 ||
    highPriority.primary_entities.length > 0;

  if (hasHighPriorityContent) {
    // NOTE: _sessionContext and _priority are INTERNAL metadata fields.
    // Callers (orchestrator) reconstruct messages as { role, content } only,
    // so these fields are never forwarded to the AI API.
    messages.unshift({
      role: 'user',
      content: `[SESSION CONTEXT — HIGH PRIORITY]\n${JSON.stringify(highPriority, null, 0)}`,
      _sessionContext: true,
      _priority: 'high',
    });
  }

  // Append low-priority state if budget allows
  if (includeLowPriority) {
    const hasLowPriorityContent =
      lowPriority.decisions_made.length > 0 ||
      lowPriority.constraints.length > 0 ||
      lowPriority.facts_established.length > 0 ||
      lowPriority.risk_flags.length > 0;

    if (hasLowPriorityContent) {
      messages.push({
        role: 'user',
        content: `[SESSION CONTEXT — LOW PRIORITY]\n${JSON.stringify(lowPriority, null, 0)}`,
        _sessionContext: true,
        _priority: 'low',
      });
    }
  } else {
    console.log('[SESSION-STATE] Budget exceeded — low-priority state dropped');
  }

  return messages;
}
