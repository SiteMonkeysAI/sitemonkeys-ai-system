# UI-BACKEND API CONTRACT

**Version:** 1.0.0  
**Last Updated:** 2025-10-03  
**Status:** 🔒 LOCKED - Changes require approval

---

## OVERVIEW

This document defines the sacred contract between the Site Monkeys AI frontend and backend systems. The frontend is **LOCKED** and cannot be modified during backend development. The backend **MUST** honor this contract exactly.

---

## ENDPOINT 1: POST /api/chat

**Purpose:** Main chat interaction endpoint

### REQUEST FORMAT

```json
{
  "message": "string",
  "conversation_history": [
    {
      "role": "user | assistant",
      "content": "string",
      "timestamp": "ISO 8601 string",
      "mode_requested": "string (optional)",
      "speaker": "Eli | Roxy (optional)"
    }
  ],
  "mode": "truth_general | business_validation | site_monkeys",
  "vault_loaded": "boolean",
  "vault_content": "string | null",
  "document_context": {
    "filename": "string",
    "content": "string",
    "wordCount": "number",
    "contentType": "string",
    "keyPhrases": ["array of strings"]
  } | null
}
```
