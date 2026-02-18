# Site Monkeys AI — Test & Regression Prevention System

## Overview

Two-tier system that prevents regressions:

- **Tier 1 (Code Guards):** Free, fast, runs on every PR. Catches code bugs before deploy.
- **Tier 2 (Live Validation):** Real API tests post-deploy. Verifies behavior against locked baselines. *(To be implemented)*

## Quick Start

```bash
# Run Tier 1 locally (no API keys needed, no npm install needed, $0 cost)
node --test tests/tier1/code-guards.test.js
```

## How the Score Ratchet Works

`baselines.json` tracks the minimum acceptable score for each test suite.

- Score drops below minimum → deployment flagged, next PR blocked
- Locked test starts failing → immediate alert (P0)
- Score improves → baseline automatically ratchets UP
- Tests lock after 3 consecutive passes (flicker protection)

Once a test is locked, it can NEVER regress without failing the pipeline.

## Current Baselines (February 18, 2026)

| Suite | Score | Locked | Observed | Known Failures |
|-------|-------|--------|----------|----------------|
| SMD Deep Intelligence | 12/15 (80%) | 10 tests | NUA1, STR1 | INF1, NUA2, CMP2 |
| 53-Test Comprehensive | 58/61 (95%) | 58 tests | — | MEM-007, INJ-008, UX-049 |
| SMN Site Monkeys | TBD | — | — | — |

## File Structure

```
tests/
├── baselines.json                # Locked scores & test lists
├── README.md                     # This file
└── tier1/
    └── code-guards.test.js       # Pre-merge code checks ($0, ~10 sec)
.github/
└── workflows/
    └── tier1-code-guards.yml     # Runs on every PR to main
```

## Technical Notes

- **Module system:** Repo uses ESM (`"type": "module"` in package.json)
- **Tier 1 tests:** Pure Node builtins only (fs, path, node:test) — no npm install needed
- **No app modules imported:** Tests read files as text and scan strings to avoid dependency issues
- **Existing workflows:** Does not conflict with claude-code, copilot-agent, quality-chain, quality-gates, or readable-branch workflows
