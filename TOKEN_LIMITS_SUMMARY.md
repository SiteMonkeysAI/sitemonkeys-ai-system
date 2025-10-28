# MEMORY SYSTEM TOKEN LIMITS - QUICK REFERENCE

**All token limit constants found in the codebase.**

---

## PRIMARY TOKEN LIMITS (5 Values Requested)

| # | Constant | Value | Source File | Line |
|---|----------|-------|-------------|------|
| 1 | **Subcategory Token Limit** | **50,000** tokens | `api/categories/memory/internal/core.js` | 36 |
| 2 | **Response Token Budget** | **2,400** tokens | `api/categories/memory/internal/intelligence.js` | 2325 |
| 3 | **Cross-Category Fallback Cap** | **2,400** tokens | (same as response budget) | 1507 |
| 4 | **Compression Ratio Target** | **10-20:1** | `api/memory/intelligent-storage.js` | 3, 95 |
| 5 | **Deduplication Similarity** | **0.3** | `api/memory/intelligent-storage.js` | 144 |

---

## ADDITIONAL TOKEN BUDGETS

### Master Intelligence Orchestrator

| Budget Type | Value | Line |
|-------------|-------|------|
| Memory Injection | 2,400 | 27 |
| Document (per doc) | 1,200 | 25 |
| Total Documents | 2,500 | 26 |
| Conversation History | 3,000 | 28 |
| Vault Content | 6,000 | 29 |
| Total Prompt | 10,000 | 30 |

**File:** `api/lib/master-intelligence-orchestrator.js`

### Core Orchestrator

| Budget Type | Value | Line |
|-------------|-------|------|
| Memory | 2,500 | 1144 |
| Documents | 3,000 | 1145 |
| Vault | 9,000 | 1146 |
| Total Context | 15,000 | 1147 |

**File:** `api/core/orchestrator.js`

---

## ROUTING THRESHOLDS

| Confidence | Behavior |
|-----------|----------|
| > 0.8 | High confidence - primary category only |
| < 0.8 | Triggers cross-category topic search |
| < 0.5 | Low confidence - fallback to mental_emotional |

---

## COMPRESSION DETAILS

- **Model:** gpt-4o-mini
- **Temperature:** 0
- **Max Tokens:** 150 (for facts)
- **Target Ratio:** 10-20:1

---

**For complete analysis, see:**
- `DIAGNOSTIC_DELIVERABLE.md`
- `MEMORY_SYSTEM_DIAGNOSTIC_REPORT.md`
