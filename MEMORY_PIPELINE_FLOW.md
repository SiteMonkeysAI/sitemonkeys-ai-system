# Memory Storage and Retrieval Flow Diagrams

## Current System Architecture

### Storage Flow (TWO PATHS)

```
User Message + AI Response
        |
        v
[Is ENABLE_INTELLIGENT_STORAGE=true?]
        |
    Yes |    No
        |         \
        v          v
    PATH A      PATH B
 (Intelligent) (Legacy)
        |          |
        v          v
  Mode-based   Semantic
  Category     Routing
        |          |
  'business'  analyzeAndRoute()
     or            |
  'general'       v
        |     routing.primaryCategory
        |     (11 categories)
        |          |
        v          v
   INSERT INTO persistent_memories
        category_name = ?
                |
                v
         [DATABASE]
    ┌─────────────────────┐
    │ category_name       │
    ├─────────────────────┤
    │ 'business'    ← A   │
    │ 'general'     ← A   │
    │ 'personal...' ← B   │
    │ 'relations..' ← B   │
    │ 'work_career' ← B   │
    │ etc.                │
    └─────────────────────┘
```

### Retrieval Flow

```
User Recall Query
        |
        v
  analyzeAndRoute(query)
        |
        v
  routing.primaryCategory
  (11 semantic categories)
        |
        v
SELECT * FROM persistent_memories
WHERE category_name = ?
        |
        v
   [DATABASE FILTER]
   Only searches:
   - personal_life_interests
   - relationships_social
   - work_career
   - health_wellness
   - mental_emotional
   - money_income_debt
   - money_spending_goals
   - goals_active_current
   - goals_future_dreams
   - tools_tech_workflow
   - daily_routines_habits
        |
        v
   NEVER FINDS:
   - 'business' ← From Path A
   - 'general'  ← From Path A
```

---

## The Disconnect Visualized

### Path A (Intelligent Storage) - BROKEN

```
Storage:  User says "My wife loves pizza"
          ↓
          mode = 'truth_general'
          ↓
          category = 'general'
          ↓
          INSERT category_name='general'

Retrieval: User asks "Do you recall my wife?"
           ↓
           analyzeAndRoute("Do you recall my wife?")
           ↓
           category = 'relationships_social'
           ↓
           SELECT WHERE category_name='relationships_social'
           ↓
           ❌ NO MATCH (stored in 'general')
```

### Path B (Legacy Storage) - Also Has Issues

```
Storage:  User says "Home Run Pizza is my favorite"
          ↓
          analyzeAndRoute("Home Run Pizza is my favorite")
          ↓
          Keywords: pizza, favorite
          ↓
          category = 'personal_life_interests'
          ↓
          INSERT category_name='personal_life_interests'

Retrieval: User asks "Do you recall Home Run Pizza?"
           ↓
           analyzeAndRoute("Do you recall Home Run Pizza?")
           ↓
           Keywords: recall, pizza, run
           ↓
           category = 'tools_tech_workflow' (misrouted!)
           ↓
           SELECT WHERE category_name='tools_tech_workflow'
           ↓
           ❌ NO MATCH (stored in 'personal_life_interests')
```

---

## Vault Pipeline (Working Correctly ✅)

```
Initialization:
  vault-loader.js:85
      ↓
  global.vaultContent = this.coreContent
      ↓
  [GLOBAL MEMORY]

Usage in Request:
  orchestrator.js:728
      ↓
  if (global.vaultContent)
      ↓
  return global.vaultContent
      ↓
  [SUCCESS]
```

---

## Solution Architecture

### Fix #1: Make Intelligent Storage Use Semantic Routing

```
BEFORE (server.js:356):
  const category = mode === 'site_monkeys' ? 'business' : 'general';

AFTER:
  const routing = await global.memorySystem.intelligenceSystem.analyzeAndRoute(
    message,
    userId
  );
  const category = routing.primaryCategory;
```

### Fix #2: Enable Cross-Category Search (Fallback)

```
Set environment variable:
  ENABLE_INTELLIGENT_ROUTING=true

Then retrieval becomes:
  
  User Query
      ↓
  analyzeAndRoute(query)
      ↓
  routing.confidence < 0.80?
      |
    Yes ↓
  Extract topic keywords
      ↓
  searchByTopics(topics) ← Searches ALL categories
      ↓
  ✅ FINDS memories even if category mismatched
```

### Fix #3: Unified Storage Path

```
Proposed New Architecture:

User Message + AI Response
        |
        v
   analyzeAndRoute(message)
        |
        v
   routing.primaryCategory
   + routing.topicKeywords (NEW)
        |
        v
   storeWithIntelligence()
        |
        v
   INSERT with:
   - category_name = routing.primaryCategory
   - topics = routing.topicKeywords
   - compressed content
        |
        v
   [DATABASE]
   Single, consistent storage method
```

---

## Categories Mapping

### Valid Semantic Categories (Used by Retrieval):
1. `personal_life_interests`
2. `relationships_social`
3. `work_career`
4. `health_wellness`
5. `mental_emotional`
6. `money_income_debt`
7. `money_spending_goals`
8. `goals_active_current`
9. `goals_future_dreams`
10. `tools_tech_workflow`
11. `daily_routines_habits`

### Invalid Categories (Used by Intelligent Storage):
- ❌ `business` - Not recognized by retrieval
- ❌ `general` - Not recognized by retrieval

---

## Impact Analysis

### If ENABLE_INTELLIGENT_STORAGE=true:
- **Storage**: All memories go to 'business' or 'general'
- **Retrieval**: Searches only semantic categories
- **Result**: 0% recall rate ❌

### If ENABLE_INTELLIGENT_STORAGE=false (default):
- **Storage**: Uses semantic routing
- **Retrieval**: Uses semantic routing (on different input)
- **Result**: Partial recall rate (~60-70%) ⚠️

### With Fixes Applied:
- **Storage**: Unified semantic routing
- **Retrieval**: Semantic routing + cross-category fallback
- **Result**: High recall rate (>90%) ✅

---

## Testing Scenarios

### Scenario 1: Family Information
```
Storage:   "My wife's name is Sarah"
Expected:  category = 'relationships_social'
Current:   category = 'general' (if intelligent) OR 'relationships_social' (if legacy)
Retrieval: "What's my wife's name?"
Expected:  Search 'relationships_social'
Current:   Search 'relationships_social' OR other category
Result:    FAILS if intelligent storage, PASSES if legacy storage with same routing
```

### Scenario 2: Business Decision
```
Storage:   "Should I hire a new developer?"
Expected:  category = 'work_career'
Current:   category = 'business' (if intelligent) OR 'work_career' (if legacy)
Retrieval: "Do you remember what I asked about hiring?"
Expected:  Search 'work_career'
Current:   Search 'work_career' OR other category
Result:    FAILS if intelligent storage, MAYBE FAILS if legacy (different routing)
```

### Scenario 3: Personal Interest
```
Storage:   "Home Run Pizza is my favorite restaurant"
Expected:  category = 'personal_life_interests'
Current:   category = 'general' (if intelligent) OR 'personal_life_interests' (if legacy)
Retrieval: "Do you recall Home Run Pizza?"
Expected:  Search 'personal_life_interests' OR cross-category if enabled
Current:   Search varies based on query interpretation
Result:    FAILS if intelligent storage, FAILS if misrouted, PASSES if cross-category enabled
```
