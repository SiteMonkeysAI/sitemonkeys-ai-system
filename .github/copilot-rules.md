# Copilot Repository Automation Rules
- Always merge feature and fix branches into the staging branch `copilot/consolidate-fixes-from-open-prs`.
- Run all workflows (Quality-Chain, CodeQL, Security) after each merge.
- If all required checks are green, mark PRs “Ready for review” and auto-merge into `main`.
- When lint or format errors occur, run `eslint --fix` and `prettier --write` automatically.
- For “no-unused-vars” errors, prefix unused parameters with `_` or remove them.
- If CodeQL flags “insecure randomness,” replace `Math.random()` with `crypto.randomUUID()` or a secure fallback.
- When `main` is updated, trigger Railway deployment automatically.