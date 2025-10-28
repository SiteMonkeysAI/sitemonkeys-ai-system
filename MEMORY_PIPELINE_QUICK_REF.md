# Quick Reference: Memory Pipeline FILE:LINE Index

## Storage Paths

### Path A: Intelligent Storage (ENABLE_INTELLIGENT_STORAGE=true)
| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Trigger** | `server.js` | 345 | Checks feature flag |
| **Category Logic** | `server.js` | 356 | ❌ BROKEN: mode-based ('business' or 'general') |
| **Storage Call** | `server.js` | 353 | `storeWithIntelligence()` |
| **Storage Function** | `api/memory/intelligent-storage.js` | 49 | Main storage function |
| **INSERT Statement** | `api/memory/intelligent-storage.js` | 194-221 | Database insert |
| **Category Column** | `api/memory/intelligent-storage.js` | 197 | `category_name` |
| **Category Value** | `api/memory/intelligent-storage.js` | 210 | From server.js param |

### Path B: Legacy Storage (default)
| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Entry Point** | `api/categories/memory/internal/persistent_memory.js` | 129 | `storeMemory()` |
| **Category Routing** | `api/categories/memory/internal/persistent_memory.js` | 141 | Calls `analyzeAndRoute()` |
| **Routing Function** | `api/categories/memory/internal/intelligence.js` | 674 | Semantic analysis |
| **INSERT Statement** | `api/categories/memory/internal/persistent_memory.js` | 161-166 | Database insert |
| **Category Column** | `api/categories/memory/internal/persistent_memory.js` | 162 | `category_name` |
| **Category Value** | `api/categories/memory/internal/persistent_memory.js` | 170 | `routing.primaryCategory` |

## Retrieval Path

| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Entry Point** | `api/categories/memory/internal/persistent_memory.js` | 60 | `retrieveMemory()` |
| **Category Routing** | `api/categories/memory/internal/persistent_memory.js` | 71 | Calls `analyzeAndRoute()` |
| **Routing Function** | `api/categories/memory/internal/intelligence.js` | 674 | Semantic analysis |
| **Memory Extraction** | `api/categories/memory/internal/intelligence.js` | 1442 | `extractRelevantMemories()` |
| **Primary Extract** | `api/categories/memory/internal/intelligence.js` | 1576 | `extractFromPrimaryCategory()` |
| **SELECT Statement** | `api/categories/memory/internal/intelligence.js` | 1584-1615 | Database query |
| **Category Filter** | `api/categories/memory/internal/intelligence.js` | 1614 | `WHERE category_name = $2` |

## Cross-Category Search (Feature Flag)

| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Feature Flag Check** | `api/categories/memory/internal/intelligence.js` | 1504 | `ENABLE_INTELLIGENT_ROUTING` |
| **Confidence Check** | `api/categories/memory/internal/intelligence.js` | 1506 | `routing.confidence < 0.80` |
| **Topic Extraction** | `api/categories/memory/internal/intelligence.js` | 1512 | Extract keywords |
| **Cross-Category Search** | `api/categories/memory/internal/intelligence.js` | 1516 | `searchByTopics()` |
| **Topic Search Function** | `api/categories/memory/internal/intelligence.js` | 1755 | Searches all categories |
| **Topic Query** | `api/categories/memory/internal/intelligence.js` | 1767-1792 | SQL with topic matching |

## Vault Pipeline

| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Vault Loading** | `api/utilities/vault-loader.js` | 37 | `VaultLoader` class |
| **Initialization** | `api/utilities/vault-loader.js` | 61 | `initialize()` |
| **Core Content** | `api/utilities/vault-loader.js` | 237 | `this.coreContent` |
| **Global Storage** | `api/utilities/vault-loader.js` | 85 | `global.vaultContent = ...` |
| **Global Read** | `api/core/orchestrator.js` | 728 | Check `global.vaultContent` |
| **Vault Context** | `api/core/orchestrator.js` | 732 | Return vault content |

## Category Routing Logic

### Semantic Analysis
| Component | File | Line | Description |
|-----------|------|------|-------------|
| **Main Function** | `api/categories/memory/internal/intelligence.js` | 674 | `analyzeAndRoute()` |
| **Semantic Analysis** | `api/categories/memory/internal/intelligence.js` | 772 | `performAdvancedSemanticAnalysis()` |
| **Category Scoring** | `api/categories/memory/internal/intelligence.js` | 900 | `calculateAdvancedCategoryScores()` |
| **Best Category** | `api/categories/memory/internal/intelligence.js` | 1158 | `determineBestCategoryWithConfidence()` |
| **Overrides** | `api/categories/memory/internal/intelligence.js` | 1215 | `applySophisticatedOverrides()` |

### Valid Categories
| Category Name | Priority | Keywords |
|---------------|----------|----------|
| `mental_emotional` | High | stress, anxiety, feeling, emotion |
| `health_wellness` | High | health, doctor, fitness, diet |
| `relationships_social` | High | family, friend, spouse, partner |
| `work_career` | Medium | work, job, career, business |
| `money_income_debt` | High | debt, loan, income, payment |
| `money_spending_goals` | Medium | budget, savings, investment |
| `goals_active_current` | Medium | goal, objective, working on |
| `goals_future_dreams` | Low | dream, future, someday |
| `tools_tech_workflow` | Low | software, app, tool, workflow |
| `daily_routines_habits` | Medium | routine, habit, daily, schedule |
| `personal_life_interests` | Low | home, hobby, interest, leisure |

## Critical Bugs

### Bug #1: Intelligent Storage Category Mismatch
- **Location**: `server.js:356`
- **Current Code**: 
  ```javascript
  const category = mode === 'site_monkeys' ? 'business' : 'general';
  ```
- **Problem**: Categories 'business' and 'general' not in valid category list
- **Impact**: All intelligent storage memories unfindable
- **Severity**: CRITICAL 🚨

### Bug #2: Storage vs Retrieval Routing Mismatch
- **Storage Location**: `api/categories/memory/internal/persistent_memory.js:141`
- **Retrieval Location**: `api/categories/memory/internal/persistent_memory.js:71`
- **Problem**: Both use same function but on different inputs (original message vs recall query)
- **Impact**: Memories routed to different categories at storage vs retrieval
- **Severity**: HIGH ⚠️

### Bug #3: Cross-Category Search Disabled by Default
- **Location**: `api/categories/memory/internal/intelligence.js:1504`
- **Problem**: Feature flag `ENABLE_INTELLIGENT_ROUTING` defaults to false
- **Impact**: No fallback when routing mismatch occurs
- **Severity**: MEDIUM ⚠️

## Environment Variables

| Variable | Default | Purpose | Recommendation |
|----------|---------|---------|----------------|
| `ENABLE_INTELLIGENT_STORAGE` | `false` | Enable compressed storage | Keep `false` until bug #1 fixed |
| `ENABLE_INTELLIGENT_ROUTING` | `false` | Enable cross-category search | Set to `true` immediately |
| `DATABASE_URL` | Required | PostgreSQL connection | - |
| `OPENAI_API_KEY` | Required | For compression (if enabled) | - |

## Quick Fix Commands

### Fix #1: Disable Intelligent Storage (Immediate)
```bash
# In Railway or .env file
ENABLE_INTELLIGENT_STORAGE=false
```

### Fix #2: Enable Cross-Category Search (Immediate)
```bash
# In Railway or .env file
ENABLE_INTELLIGENT_ROUTING=true
```

### Fix #3: Check Current Storage Path
```bash
# Check server logs for:
grep "Intelligent storage complete" logs.txt  # If this appears, intelligent storage is enabled
grep "Successfully stored memory" logs.txt    # If this appears, legacy storage is active
```

### Fix #4: Verify Retrieval
```bash
# Check database for category distribution
psql $DATABASE_URL -c "SELECT category_name, COUNT(*) FROM persistent_memories GROUP BY category_name;"

# Should see semantic categories:
# - personal_life_interests
# - relationships_social
# - etc.

# Should NOT see:
# - business
# - general
```

## Testing Checklist

- [ ] Verify `ENABLE_INTELLIGENT_STORAGE` is `false`
- [ ] Verify `ENABLE_INTELLIGENT_ROUTING` is `true`
- [ ] Test storage: "My wife's name is Sarah"
- [ ] Test retrieval: "What's my wife's name?"
- [ ] Check database: Memory should be in `relationships_social` category
- [ ] Check logs: Should see cross-category search if confidence is low
- [ ] Test vault: Verify `global.vaultContent` is set and accessible

## Support Contact

For issues with this analysis:
1. Check `MEMORY_PIPELINE_ANALYSIS.md` for detailed findings
2. Check `MEMORY_PIPELINE_FLOW.md` for visual diagrams
3. Review environment variables in Railway dashboard
4. Check server logs for memory-related errors
