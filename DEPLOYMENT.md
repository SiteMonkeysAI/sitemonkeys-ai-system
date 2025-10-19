# Deployment & Server Restart Instructions

This document provides step-by-step instructions for deploying the latest code from main and restarting the Node.js server.

## Quick Reference

```bash
# After merging PR to main branch
git checkout main
git pull origin main
npm install
pm2 restart sitemonkeys-ai-system
# OR if using node directly:
pkill -f "node server.js" && node server.js &
```

## Comprehensive Deployment Process

### 1. Pre-Deployment Checks

Before deploying, verify the system health:

```bash
# Check current system status
curl http://localhost:3000/api/system-status

# Review the comprehensive 66-feature validation results
# All critical systems should be operational
```

### 2. Merge Latest Changes from Main

After PR approval and merge to main:

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Verify you're on the latest commit
git log -1 --oneline
```

### 3. Install/Update Dependencies

```bash
# Install or update any new dependencies
npm install

# Verify installation
npm list --depth=0
```

### 4. Restart Node.js Server

#### Option A: Using PM2 (Recommended for Production)

PM2 provides process management with auto-restart and monitoring:

```bash
# First time setup (if PM2 not installed)
npm install -g pm2

# Start the server with PM2
pm2 start server.js --name sitemonkeys-ai-system

# Restart after deployment
pm2 restart sitemonkeys-ai-system

# View logs
pm2 logs sitemonkeys-ai-system

# Monitor status
pm2 status

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

#### Option B: Using systemd (Linux Servers)

Create a systemd service file:

```bash
# Create service file
sudo nano /etc/systemd/system/sitemonkeys-ai.service
```

Add this content:

```ini
[Unit]
Description=SiteMonkeys AI System
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/sitemonkeys-ai-system
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Then manage the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Start the service
sudo systemctl start sitemonkeys-ai

# Restart after deployment
sudo systemctl restart sitemonkeys-ai

# Enable auto-start on boot
sudo systemctl enable sitemonkeys-ai

# Check status
sudo systemctl status sitemonkeys-ai

# View logs
sudo journalctl -u sitemonkeys-ai -f
```

#### Option C: Using nodemon (Development)

For development environments with auto-reload:

```bash
# Install nodemon globally
npm install -g nodemon

# Start with nodemon
nodemon server.js

# Nodemon will automatically restart on file changes
```

#### Option D: Manual Restart (Simple)

For simple deployments without process managers:

```bash
# Find and kill the existing Node.js process
pkill -f "node server.js"

# OR find the process ID manually
ps aux | grep "node server.js"
kill <PID>

# Start the server in background
nohup node server.js > server.log 2>&1 &

# OR keep it in foreground for debugging
node server.js
```

### 5. Railway Deployment (Auto-Deploy)

If using Railway (recommended), deployment is automatic:

```bash
# No manual steps needed!
# Railway automatically deploys when changes are merged to main

# Monitor deployment
railway logs

# Check deployment status
railway status

# Manual redeploy (if needed)
railway up
```

See [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md) for detailed Railway configuration.

### 6. Post-Deployment Verification

After restarting the server, verify everything is working:

```bash
# 1. Check server is running
curl http://localhost:3000/health

# 2. Run comprehensive system validation (66 features)
curl http://localhost:3000/api/system-status | json_pp

# 3. Verify specific endpoints
curl http://localhost:3000/api/inventory

# 4. Test chat endpoint (requires authentication)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "mode": "truth_general"}'
```

### 7. Monitoring After Deployment

Keep an eye on the system for the first few minutes:

```bash
# Monitor server logs (PM2)
pm2 logs sitemonkeys-ai-system --lines 100

# Monitor server logs (systemd)
sudo journalctl -u sitemonkeys-ai -f

# Monitor server logs (manual)
tail -f server.log

# Check memory usage
pm2 monit
# OR
top -p $(pgrep -f "node server.js")
```

## System Status Validation

The system includes a comprehensive 66-feature validation endpoint at `/api/system-status` that tests:

### Test Categories (66 Features)

1. **Core Infrastructure** (6 tests)
   - Server running, Node.js version, environment, port, memory, uptime

2. **Authentication & Authorization** (4 tests)
   - Session secret, session middleware, CORS, API auth

3. **Database Operations** (4 tests)
   - Database configuration, connection, read operations, write operations

4. **API Endpoints & Routes** (6 tests)
   - Health, system-status, chat, upload, repo-snapshot, inventory endpoints

5. **Memory Systems** (5 tests)
   - Memory structure, core memory, intelligence, persistent memory, index

6. **AI Processing** (5 tests)
   - OpenAI API, Anthropic API, orchestrator, semantic analyzer, enhanced intelligence

7. **Personality Frameworks** (3 tests)
   - Eli framework, Roxy framework, personality selector

8. **Mode Compliance** (2 tests)
   - Mode configuration, validation enabled

9. **Security & Validation** (5 tests)
   - Political neutrality, drift watcher, initiative enforcer, product validation, expert validator

10. **Site Monkeys Enforcement** (5 tests)
    - Emergency fallbacks, founder protection, quality enforcement, security protocols, service automation

11. **Document Processing** (2 tests)
    - File upload handler, analysis upload handler

12. **External Integrations** (3 tests)
    - Google APIs, OpenAI service, Anthropic service

13. **GitHub Actions** (3 tests)
    - Workflows directory, Claude code integration, issue fix workflow

14. **Cost Tracking** (2 tests)
    - Cost tracker module, token tracker

15. **Error Handling** (2 tests)
    - Process error handlers, request flow tracer

16. **Deployment** (3 tests)
    - Railway configuration, package configuration, start script

17. **Frontend Integration** (3 tests)
    - Public directory, static file serving, CORS for frontend

18. **Additional Features** (3 tests)
    - Vault system, system monitor, repo snapshot

## Troubleshooting

### Server Won't Start

```bash
# Check if port is already in use
lsof -i :3000
# OR
netstat -tulpn | grep 3000

# Kill process using the port
kill -9 <PID>

# Check for syntax errors
node --check server.js

# Run with verbose logging
NODE_ENV=development node server.js
```

### Database Connection Issues

```bash
# Run database diagnostic script
npm run fix-database

# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Memory System Not Initializing

Check server logs for memory initialization messages:

- `[SERVER] 🚀 Starting memory system initialization...`
- `[SERVER] ✅ Memory system initialized successfully`

If timeout occurs, verify:

- Database is accessible
- DATABASE_URL is correct
- PostgreSQL service is running

### PM2 Issues

```bash
# Reset PM2
pm2 kill
pm2 start server.js --name sitemonkeys-ai-system

# Update PM2
npm install -g pm2@latest

# View PM2 logs with errors
pm2 logs --err
```

## Environment Variables

Ensure these are set before restarting:

```bash
# Critical Variables
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export SESSION_SECRET="random-secret-string"

# Optional Variables
export NODE_ENV="production"
export PORT="3000"
export VALIDATION_ENABLED="true"
```

## Security Checklist

Before deploying to production:

- [ ] All environment variables are set securely (not in code)
- [ ] Session secret is a strong random string
- [ ] Database uses SSL in production
- [ ] CORS is configured properly for your domain
- [ ] Error handlers are active (check server.js)
- [ ] PM2 or systemd is configured for auto-restart
- [ ] Logs are being monitored
- [ ] System status endpoint shows all critical systems operational

## Rollback Procedure

If deployment causes issues:

```bash
# 1. Identify last working commit
git log --oneline

# 2. Checkout previous version
git checkout <previous-commit-hash>

# 3. Reinstall dependencies
npm install

# 4. Restart server
pm2 restart sitemonkeys-ai-system

# 5. Verify system is working
curl http://localhost:3000/api/system-status
```

## Support

For deployment issues:

- Review server logs for error messages
- Check [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md) for Railway-specific issues
- Verify all environment variables are set correctly
- Run system-status endpoint to identify failing components
- Check [CHANGES_SUMMARY.md](./CHANGES_SUMMARY.md) for recent changes

## Automated Deployment (CI/CD)

For automated deployments using GitHub Actions, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install dependencies
        run: npm ci

      - name: Run tests (if available)
        run: npm test || echo "No tests configured"

      - name: Deploy to Railway
        run: |
          # Railway auto-deploys on push to main
          echo "Deployment triggered automatically by Railway"

      - name: Verify Deployment
        run: |
          sleep 30
          curl -f https://your-app.railway.app/health || exit 1
          curl -f https://your-app.railway.app/api/system-status || exit 1
```

---

**Last Updated:** 2024-10-17  
**System Version:** 2.0.0  
**Comprehensive Validation:** 66 Features
