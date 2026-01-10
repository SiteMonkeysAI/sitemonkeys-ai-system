# pgvector Infrastructure Migration Guide

**One-Time Migration - URL-Only Execution**

This guide provides step-by-step instructions for migrating the database from Railway's standard PostgreSQL to a pgvector-enabled PostgreSQL instance.

---

## Overview

**Total Time:** ~13 minutes of manual work  
**Risk Level:** Medium (has rollback capability)  
**Tool Used:** Browser only (no terminal/psql/pg_dump)

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Access to Railway dashboard
- [ ] Ability to add environment variables
- [ ] A browser to visit URLs

---

## PHASE 1: Railway UI Setup (5 minutes)

### Step 1.1: Create New PostgreSQL Service

1. In Railway dashboard, click **"+ New"** or **"Add Service"**
2. Select **"Database"** → **"PostgreSQL"**
3. Name it: `postgres-pgvector`
4. Click **"Deploy"**

### Step 1.2: Change Docker Image to pgvector

1. Click on the new `postgres-pgvector` service
2. Go to **Settings** tab
3. Find **"Source Image"** field
4. Enter: `ankane/pgvector:pg16`
5. Click **"Deploy"** or **"Update"**
6. Wait for deployment to complete (~1 minute)

### Step 1.3: Get New Database Connection URL

1. Click on `postgres-pgvector` service
2. Go to **Connect** tab
3. Copy the **Connection URL** (starts with `postgresql://...`)
4. **Save this URL** - you'll need it in Step 1.5

### Step 1.4: Save Old Database URL (CRITICAL FOR ROLLBACK)

⚠️ **IMPORTANT: Do not skip this step!**

1. Go to `sitemonkeys-ai-system` service
2. Go to **Variables** tab
3. Find `DATABASE_URL`
4. **Copy and save this value in a safe place:**
   ```
   OLD_DATABASE_URL = [paste the old value here]
   ```

### Step 1.5: Add Environment Variables

In `sitemonkeys-ai-system` → **Variables** tab, add these three new variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEW_DATABASE_URL` | [Connection URL from Step 1.3] | The new pgvector database |
| `MIGRATION_SECRET` | `migrate-2024-xyz-secret` | Change to a random string |
| `ALLOW_DB_MIGRATION` | `true` | Safety lock - enables migration endpoints |

**Click "Deploy"** to apply the changes and wait for the service to restart (~30 seconds).

---

## PHASE 2: Execute Migration (8 minutes)

### Step 2.1: Test Dry-Run (Recommended)

Visit this URL to preview the migration without changing anything:

```
https://[your-app].railway.app/api/admin/db-tables?secret=migrate-2024-xyz-secret
```

Replace:
- `[your-app]` with your Railway app URL
- `migrate-2024-xyz-secret` with the secret you set in Step 1.5

**Expected response:** JSON showing all tables, row counts, and primary keys.

Example response:
```json
{
  "success": true,
  "tables": [
    {
      "name": "persistent_memories",
      "rowCount": 1250,
      "primaryKey": "id",
      "pkDataType": "uuid",
      "pkIsNumeric": false,
      "existsInNewDB": false
    },
    ...
  ],
  "totalTables": 5,
  "totalRows": 2500
}
```

### Step 2.2: Replicate Schema (Dry-Run First)

**First, preview the schema replication:**

```
https://[your-app].railway.app/api/admin/db-schema?secret=migrate-2024-xyz-secret&dryRun=true
```

**Expected response:** JSON showing CREATE TABLE statements that will be executed.

**Then, execute the schema replication:**

```
https://[your-app].railway.app/api/admin/db-schema?secret=migrate-2024-xyz-secret
```

**Expected response:**
```json
{
  "success": true,
  "dryRun": false,
  "tablesProcessed": 5,
  "tablesCreated": 5,
  "message": "Schema replication complete"
}
```

### Step 2.3: Migrate Data (Table by Table)

For each table, visit this URL pattern:

```
https://[your-app].railway.app/api/admin/db-migrate-data?table=TABLE_NAME&secret=migrate-2024-xyz-secret
```

**Example for `persistent_memories` table:**

```
https://[your-app].railway.app/api/admin/db-migrate-data?table=persistent_memories&secret=migrate-2024-xyz-secret
```

**Expected response:**
```json
{
  "success": true,
  "table": "persistent_memories",
  "batchSize": 1000,
  "insertedCount": 1000,
  "skippedCount": 0,
  "nextCursor": "12345",
  "hasMore": true,
  "message": "Migrated batch: 1000 inserted, 0 skipped"
}
```

**If `hasMore: true`:** Continue with the next batch using the cursor:

```
https://[your-app].railway.app/api/admin/db-migrate-data?table=persistent_memories&cursor=12345&secret=migrate-2024-xyz-secret
```

**Repeat until `hasMore: false`.**

**Do this for all tables returned in Step 2.1.**

### Step 2.4: Enable pgvector Extension

Visit this URL to enable the pgvector extension on the new database:

```
https://[your-app].railway.app/api/migrate-semantic-v2?secret=migrate-2024-xyz-secret
```

**Expected response:** Confirmation that pgvector extension is enabled.

---

## PHASE 3: Switch to New Database (1 minute)

### Step 3.1: Update DATABASE_URL

1. Go to `sitemonkeys-ai-system` service
2. Go to **Variables** tab
3. Find `DATABASE_URL`
4. **Replace its value** with the `NEW_DATABASE_URL` value
5. **Click "Deploy"**

The app will restart and now use the new pgvector database.

### Step 3.2: Verify App Works

1. Visit your app URL
2. Test basic functionality (chat, memory, etc.)
3. Check logs for any errors

---

## ROLLBACK (If Something Goes Wrong)

If you need to rollback to the old database:

1. Go to `sitemonkeys-ai-system` → **Variables**
2. Find `DATABASE_URL`
3. Replace its value with the `OLD_DATABASE_URL` you saved in Step 1.4
4. Click "Deploy"

The app will restart using the old database.

---

## CLEANUP (After 48 Hours Stable)

Once you're confident the migration is successful:

1. **Delete migration endpoints:**
   - Create a PR to remove `api/admin/db-migration.js`
   - Merge the PR

2. **Remove environment variables:**
   - `ALLOW_DB_MIGRATION`
   - `MIGRATION_SECRET`
   - Optionally remove `NEW_DATABASE_URL`

3. **Keep old database for 1 week**, then delete if confident

---

## Troubleshooting

### Error: "Migration locked"

**Solution:** Set `ALLOW_DB_MIGRATION=true` in environment variables.

### Error: "Invalid migration secret"

**Solution:** Check that the `secret` in the URL matches the `MIGRATION_SECRET` environment variable.

### Error: "NEW_DATABASE_URL environment variable not set"

**Solution:** Add `NEW_DATABASE_URL` in the environment variables (Step 1.5).

### App not working after switch

**Solution:** Rollback using the instructions in the ROLLBACK section.

### Table migration stopped mid-way

**Solution:** Re-run the same URL. The migration is idempotent - it will skip already-migrated rows and continue from where it left off.

---

## Technical Details

### Endpoint Reference

| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `/api/admin/db-tables` | List all tables | `secret`, `dryRun` |
| `/api/admin/db-schema` | Replicate schema | `secret`, `dryRun`, `table` |
| `/api/admin/db-migrate-data` | Migrate data | `secret`, `dryRun`, `table`, `cursor`, `batchSize` |

### Security Features

- **Migration Lock:** Requires `ALLOW_DB_MIGRATION=true` environment variable
- **Secret Authentication:** Requires `MIGRATION_SECRET` to match
- **Dry-Run Mode:** Test without making changes using `?dryRun=true`
- **Header Support:** Can pass secret as `X-Migration-Secret` header instead of query param

### Technical Features

- **Cursor-Based Pagination:** Fast, resumable migration (no OFFSET)
- **Primary Key Detection:** Automatically detects and uses correct primary key
- **Idempotent Inserts:** Safe to rerun - uses `ON CONFLICT DO NOTHING`
- **Dynamic Schema:** Replicates exact schema from old DB (no hardcoded tables)
- **Postgres Catalog Truth:** Uses `pg_attribute` for precise type replication

---

## Success Criteria

✅ All tables migrated  
✅ All row counts match  
✅ App works with new database  
✅ No errors in logs  
✅ pgvector extension enabled  
✅ No data loss

---

## Support

If you encounter issues not covered in the Troubleshooting section, check:

1. Railway logs for error messages
2. Database connection status in Railway dashboard
3. Environment variables are correctly set

---

**Last Updated:** 2026-01-10  
**Issue:** #468  
**One-Time Use:** This guide is for a one-time migration. After successful migration, delete the migration endpoints.
