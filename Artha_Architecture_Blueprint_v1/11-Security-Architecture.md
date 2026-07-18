# Security Architecture

Encryption, local storage, backups, secrets, audit logs.

---

## Current State: Minimal, By Design and By Gap

Artha's security model today is "your data never leaves your machine,"
not "your data is protected at rest." These are different guarantees —
worth being precise about which one actually holds, since this is
genuine financial data.

## Encryption

**None.** Confirmed via grep: no encryption library, no `cryptography`/
`pycryptodome` dependency, no password-protection of the SQLite file.
`finance.db` is a plain, unencrypted SQLite file readable by anyone with
filesystem access to it (or to a USB drive it's copied to, given the
portable-app design goal in `Artha.md`). If encryption-at-rest is ever
required, it does not exist today and would need to be added — this
document should not be read as implying it's handled.

## Local Storage

- The SQLite file's location follows the resolution order in
  `CLAUDE.md` (settings.json → `FINANCE_DB_DIR` → dev fallback).
- `~/.financeos/settings.json` stores the active DB path and recent
  database history in plaintext JSON — no sensitive financial data
  itself, but it does reveal filesystem paths (potentially informative
  about a user's directory structure/other projects).
- No OS keychain/credential-manager integration exists — there's nothing
  to store there today (no external API keys, no auth tokens), but if a
  future feature needs a secret (e.g. a market-data API key), it should
  not be dropped into `settings.json` in plaintext without a deliberate
  decision.

## Backups

`/api/backup/create`, `/api/backup/restore`, `/api/backup/list`, and
auto-backup on Electron window open/close (`/api/backup/auto-run`) all
work via plain `shutil.copy2()` file copies of the SQLite database — no
encryption, no compression, no integrity checksum. A backup file is
exactly as protected (or unprotected) as the live database. Old
auto-backups are pruned by count (`backup_count_limit`, default 10), not
by age.

## Secrets

None exist in the codebase to manage — no API keys, no OAuth
credentials, no third-party service integration requiring a secret. If
one is introduced (e.g. a market-data feed for Investments, per
`Domains/Investments.md`'s Future Enhancements), it should not be
committed to the repo or written to `settings.json` in plaintext.

## Audit Logs

None exist. There is no change history/audit trail for edits to
financial data — updating or deleting an `assets`/`liabilities` row (or
a transaction) leaves no record of the prior value beyond what
`adjust_double_entry_balances()`'s revert-then-reapply logic
transiently computes during the request itself. `snapshots` (monthly
net-worth logs) are the closest thing to a historical record, but they
capture aggregate totals, not per-field change history.

## Network Exposure

- **Desktop path**: the backend binds to `127.0.0.1` only — not
  reachable from outside the machine. CORS is wide open
  (`allow_origins=["*"]`) but irrelevant at this exposure level since
  nothing external can reach the port anyway.
- **Web/Docker path**: the backend binds to `0.0.0.0` inside its
  container (necessary for the frontend container to reach it) with no
  authentication layer at all. `docker-compose.yml` maps this to a host
  port; if that host is ever exposed beyond a private/trusted network,
  **anyone who can reach the port has full unauthenticated read/write
  access to the financial data** — CORS being open makes this worse, not
  better, in that scenario. This deployment path was built for personal/
  local-network use; it is not secured for exposure to an untrusted
  network, and should not be put on the public internet without adding
  authentication first.

## What Would Need to Change for a Real Security Posture

Not built, listed here as a gap inventory, not a promise: encryption at
rest (SQLite file or field-level for sensitive columns), an
authentication layer for the web/Docker deployment path, secret
management if any external API is integrated, and some form of audit
trail for financial data edits.
