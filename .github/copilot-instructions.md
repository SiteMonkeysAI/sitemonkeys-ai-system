# Copilot Instructions for sitemonkeys-ai-system

## Project Structure
- `/api/core/orchestrator.js` - Main request coordinator that handles all chat requests
- `/memory_system/core.js` - Memory storage and retrieval system
- `/memory_system/persistent_memory.js` - Database operations for memory
- `/api/core/personalities/` - Eli and Roxy personality frameworks
- `/api/lib/` - Utility functions and modules
- `/server.js` - Main server entry point and initialization
- Railway deployment platform (auto-deploys from main branch)
- PostgreSQL database for persistent memory storage

## Key Architecture Patterns
- **ESM imports only** - Use `import/export`, never `require()`
- **Memory system imports** - Always import from `/memory_system/core.js` or `/memory_system/persistent_memory.js`
- **Orchestrator pattern** - All modules communicate through orchestrator, never directly
- **Async/await** - All database operations must be async
- **Error handling** - Always handle errors gracefully, log but don't crash
- **Initialization order** - Memory system must initialize before orchestrator

## Common Issues to Avoid
- **Import paths** - Must use exact file locations, check if file exists first
- **Memory availability** - Memory system must return `available: true` after initialization
- **Database connection** - Ensure PostgreSQL connection works before memory operations
- **Circular dependencies** - Modules should not import each other directly
- **Silent errors** - Never swallow errors without logging

## Coding Standards
- Log all major operations with descriptive messages: `console.log('[MODULE] Operation description')`
- Use try-catch blocks for all database operations
- Return structured objects: `{ success: boolean, data?: any, error?: string }`
- Store conversations after each response (user message + AI response)
- Retrieve memories at start of each request

## Testing Requirements
- Test memory storage: Send message, verify it's stored in database
- Test memory retrieval: Send message with name, ask for name, should remember
- Test error handling: Ensure graceful degradation when modules fail
- Check Railway logs for errors after deployment

## Deployment Notes
- Railway auto-deploys on merge to main
- Deployment takes ~2 minutes
- Check Railway logs after deploy: `[ORCHESTRATOR] [MEMORY]` for memory operations
- Database connection string in `DATABASE_URL` environment variable
