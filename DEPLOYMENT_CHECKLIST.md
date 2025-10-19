# Post-Merge Deployment Checklist

Use this checklist after merging a PR to the main branch.

## ✅ Quick Deployment Steps

### Step 1: Pull Latest Code

```bash
git checkout main
git pull origin main
```

**Verify:** Run `git log -1 --oneline` to confirm you have the latest commit

### Step 2: Update Dependencies

```bash
npm install
```

**Verify:** No errors during installation

### Step 3: Restart Node.js Server

#### Option A: Using PM2 (Production - Recommended)

```bash
pm2 restart sitemonkeys-ai-system
```

#### Option B: Using systemd (Linux Server)

```bash
sudo systemctl restart sitemonkeys-ai
```

#### Option C: Manual Restart (Development)

```bash
pkill -f "node server.js"
node server.js
```

#### Option D: Railway (Auto-Deploy)

```bash
# No action needed - Railway automatically deploys on push to main
railway logs  # Monitor deployment
```

### Step 4: Verify Deployment

#### Quick Health Check

```bash
# Check server is responding
curl http://localhost:3000/health

# Expected output: {"status":"ok","timestamp":"..."}
```

#### Comprehensive System Validation (66 Features)

```bash
# Run full system status check
curl http://localhost:3000/api/system-status

# Look for:
# - "total": 66
# - "overall": "HEALTHY" or "HEALTHY_WITH_WARNINGS"
# - "criticalSystemsOperational": true
```

#### Check Specific Features

```bash
# Test chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "mode": "truth_general"}'

# Test inventory
curl http://localhost:3000/api/inventory
```

### Step 5: Monitor Logs

#### PM2 Logs

```bash
pm2 logs sitemonkeys-ai-system --lines 50
```

#### systemd Logs

```bash
sudo journalctl -u sitemonkeys-ai -f
```

#### Railway Logs

```bash
railway logs
```

## 🔍 Validation Checklist

After restart, verify these items:

- [ ] Server is running on correct port (default: 3000)
- [ ] Health endpoint responds: `/health`
- [ ] System status shows 66 tests: `/api/system-status`
- [ ] No critical errors in logs
- [ ] Memory system initialized (check logs for "Memory system initialized")
- [ ] All required environment variables are set
- [ ] Database connection is active (if configured)
- [ ] AI services are accessible (OpenAI, Anthropic)

## ⚠️ Troubleshooting

### Server Won't Start

```bash
# Check if port is already in use
lsof -i :3000

# Check for syntax errors
node --check server.js

# View detailed logs
NODE_ENV=development node server.js
```

### Database Connection Issues

```bash
# Run database diagnostic
npm run fix-database

# Verify DATABASE_URL
echo $DATABASE_URL
```

### Memory System Not Initializing

Check logs for:

- `[SERVER] 🚀 Starting memory system initialization...`
- `[SERVER] ✅ Memory system initialized successfully`

If timeout occurs, verify DATABASE_URL is set correctly

### PM2 Process Issues

```bash
# Kill all PM2 processes and restart
pm2 kill
pm2 start server.js --name sitemonkeys-ai-system

# Check PM2 status
pm2 status
```

## 📊 System Status Categories

The `/api/system-status` endpoint tests these 17 categories (66 features total):

1. **Core Infrastructure** (6 tests) - Server, Node.js, environment, port, memory, uptime
2. **Authentication & Authorization** (4 tests) - Session, CORS, API auth
3. **Database Operations** (4 tests) - Config, connection, read, write
4. **API Endpoints** (6 tests) - Health, status, chat, upload, snapshot, inventory
5. **Memory Systems** (5 tests) - File structure, core, intelligence, persistent, index
6. **AI Processing** (5 tests) - OpenAI, Anthropic, orchestrator, semantic, enhanced
7. **Personality Frameworks** (3 tests) - Eli, Roxy, selector
8. **Mode Compliance** (2 tests) - Configuration, validation
9. **Security & Validation** (5 tests) - Political neutrality, drift, initiative, product, expert
10. **Site Monkeys Enforcement** (5 tests) - Emergency, founder, quality, security, automation
11. **Document Processing** (2 tests) - Upload handler, analysis handler
12. **External Integrations** (3 tests) - Google, OpenAI, Anthropic
13. **GitHub Actions** (3 tests) - Workflows, Claude code, issue fix
14. **Cost Tracking** (2 tests) - Cost tracker, token tracker
15. **Error Handling** (2 tests) - Process handlers, flow tracer
16. **Deployment** (3 tests) - Railway config, package config, start script
17. **Frontend Integration** (3 tests) - Public directory, static serving, CORS

**Additional Categories:** 18. **Business Logic** (1 test) - Vault system 19. **Monitoring** (1 test) - System monitor 20. **Developer Tools** (1 test) - Repo snapshot

## 📚 Additional Resources

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide with all options
- [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md) - Railway-specific configuration
- [CHANGES_SUMMARY.md](./CHANGES_SUMMARY.md) - Recent changes and fixes

## 🎯 Success Criteria

Deployment is successful when:

- ✅ Server responds to health checks
- ✅ System status shows 0 failed tests
- ✅ Critical systems operational = true
- ✅ No errors in logs (warnings are acceptable)
- ✅ Chat endpoint processes requests
- ✅ Memory system initialized (if database configured)

---

**Last Updated:** 2025-10-17  
**System Version:** 2.0.0  
**Validation Features:** 66
