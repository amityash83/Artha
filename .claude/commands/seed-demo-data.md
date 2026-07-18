---
description: Seed a running Artha backend with realistic, non-sensitive demo data (accounts, transactions, loans, credit card, investments with lots, insurance, goals) for screenshots or manual UI testing
allowed-tools: Bash(curl:*), Bash(lsof:*)
---

## Context

- This command writes real rows into whatever database the target backend is currently pointed at. **Never run this against a backend serving the user's real `~/.financeos/settings.json`-resolved database** — only against a disposable/scratch DB the user has explicitly confirmed is safe to write into (check `active_db_path` in `~/.financeos/settings.json` and ask first if unsure).
- Target backend URL defaults to `http://127.0.0.1:8010` (this repo's `start.sh` default) — ask the user if a different port is in use.

## Your task

1. Confirm with the user (or from context already established this session) that the target backend's active database is disposable/scratch, not their real data.
2. Confirm the backend is reachable: `curl -s -o /dev/null -w "%{http_code}" <base_url>/api/init` should return `200`.
3. Seed data via the API (not direct SQLite writes — this keeps you honest about the real request shapes and catches route regressions as a side effect), covering:
   - 2-3 institutions (e.g. HDFC Bank, ICICI Bank, State Bank of India) — **look up the created institution's id by name afterward via `GET /api/metadata/institutions`, never trust `POST`'s returned `lastrowid` directly** — that route uses `INSERT OR IGNORE`, whose `lastrowid` is wrong/`0` if a same-named row already exists from a prior partial run.
   - 1-2 accounts (Savings Account, Demat Account) with a handful of realistic transactions (opening balance, a few months of salary credits, a few EMI/expense debits) via `POST /api/entities/transactions` — remember the required fields are `type` (`Credit`/`Debit`/...), `amount`, `transaction_date`, `source_ref_type`/`source_ref_id`, `dest_ref_type`/`dest_ref_id` (NOT `date`/`description`).
   - A home loan and/or car loan liability.
   - A credit card liability + its `credit_card_details` satellite via `PUT /api/liabilities/{id}/credit-card-details` (note `statement_date`/`due_date` are day-of-month integers, not full dates).
   - A Mutual Fund and/or Stock asset with 2-3 holding lots via `POST /api/assets/{id}/holdings` (not `/holding-lots`).
   - An EPF and/or Property asset.
   - An Insurance asset + `PUT /api/assets/{id}/insurance-details` (Term policies legitimately get `current_value: 0`).
   - 1-2 goals.
4. After seeding, fetch `GET /api/init` and spot-check that institution names resolved correctly on the accounts/liabilities you created (i.e. not blank/"Unknown") before declaring success — this is the single most common failure mode of this seeding process.
5. Report what was created in a short summary; do not leave stray processes running as a side effect of this command (it only calls an already-running backend, it doesn't start one).
