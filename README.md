# SiteMonkeys AI System

Site Monkeys memory and enforcement shell with comprehensive 66-feature system validation.

## Documentation

- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Quick post-merge deployment checklist
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment and server restart instructions
- **[RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)** - Railway auto-deployment configuration
- **[CHANGES_SUMMARY.md](./CHANGES_SUMMARY.md)** - System health restoration summary

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start
```

## System Status

Access comprehensive 66-feature system validation:

- Endpoint: `http://localhost:3000/api/system-status`
- Tests: Core infrastructure, AI processing, memory systems, security, and more

## Environment Variables

Required:

- `OPENAI_API_KEY` - OpenAI API key for GPT-4
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret key

Optional:

- `INTERNAL_TEST_TOKEN` - Security token for `/api/test-semantic` endpoints (required in production)
- `VALIDATION_ENABLED` - Enable validation layer (default: true)
- `ENABLE_INTELLIGENT_STORAGE` - Enable intelligent memory storage (default: false)
- `ENABLE_INTELLIGENT_ROUTING` - Enable intelligent category routing (default: false)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup instructions.
