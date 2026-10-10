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

This includes the AI Assistant's `ai_settings.api_key` column (a
third-party AI provider credential, stored in plain text) — field-level
encryption for just this one column was considered and deliberately
deferred: every other column in the same database (balances, loan
details, tax profile PII) is equally unencrypted and far more sensitive,
so encrypting only this one field wouldn't meaningfully change the
app's actual guarantee against a filesystem-access attacker, while
introducing a real new problem (where does the derivation key/passphrase
live, given the portable single-file design goal). A coherent,
whole-database encryption-at-rest pass is the right unit of work here,
not a one-column special case — see the gap inventory below.

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

Logic lives in `backend/backups.py`; `/api/backup/create`, `/restore`, `/list`,
`/details` and `/auto-run` are thin routes over it.

- **When:** the backend backs up at startup, before `init_db()` runs migrations, on
  every platform (desktop, web, Docker). Electron additionally triggers one on window
  close. An automatic backup is skipped when the database hasn't changed since the
  newest backup, so frequent restarts (dev reload) don't evict older copies.
- **How:** SQLite's online backup API (consistent even while the app has the database
  open), written to a `.partial` name and renamed when complete.
- **Where:** settings' `custom_backup_dir` when it exists, else `<db dir>/backups`; create,
  list, restore and pruning all use that same folder.
- **Restore:** the name must be a bare `.db` file in that folder (no paths); the file must
  pass `PRAGMA integrity_check`; the current database is saved as `pre_restore_*` first;
  then `init_db()` re-applies migrations to the restored data.
- **Retention:** `auto_*` and `pre_restore_*` copies are pruned by count
  (`backup_count_limit`, default 10), not by age. Manual `backup_*` copies are never pruned.
- **Protection:** none beyond the live database's: no encryption or compression. A backup
  file is exactly as protected (or unprotected) as the database itself.

## Secrets

Two exist today, both plaintext, both opt-in/off-by-default:

- **AI provider API key** (`ai_settings.api_key`, set via Settings > AI
  Assistant): stored in the SQLite DB, not `settings.json`. See
  Encryption above for why field-level encryption was deliberately
  deferred rather than added piecemeal.
- **`ARTHA_API_SECRET`** (see Network Exposure below): an operator-set
  shared secret for the Docker/web deployment path, read from an
  environment variable at process start, never written to disk by the
  app itself. Not committed to the repo (it's supplied at deploy time via
  `docker-compose.yml`/shell env/`.env` file, which should itself stay
  out of version control if it contains a real secret).

Neither is encrypted at rest. If a further secret is introduced (e.g. a
market-data feed for Investments, per `Domains/Investments.md`'s Future
Enhancements), it should not be committed to the repo or written to
`settings.json` in plaintext.

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
  reachable from outside the machine. Both `ARTHA_API_SECRET` and
  `ARTHA_ALLOWED_ORIGINS` (below) are unset by default and are complete
  no-ops in this mode — zero-config desktop startup is unaffected by any
  of this section.
- **Web/Docker path**: the backend binds to `0.0.0.0` inside its
  container (necessary for the frontend container to reach it).
  `docker-compose.yml` maps this to a host port; this deployment path
  was built for personal/local-network use, not for unrestricted public
  exposure. Two opt-in controls exist for it:
  - **CORS**: `backend/main.py` now reads `ARTHA_ALLOWED_ORIGINS`
    (comma-separated) and defaults to `http://localhost:5173` /
    `http://127.0.0.1:5173` (the Vite dev server) if unset — it no
    longer defaults to `allow_origins=["*"]`. A Docker deployment must
    set this explicitly to the frontend's actual browser-facing URL.
    Note this only constrains browser-mediated cross-origin `fetch`/XHR
    — it has no bearing on the packaged Electron app, which loads via
    `file://` and does not send a real `Origin` header.
  - **Shared-secret auth**: setting `ARTHA_API_SECRET` (an operator-
    chosen random string) requires every request to include a matching
    `X-Artha-Api-Secret` header, checked via constant-time comparison
    (`secrets.compare_digest`), applied as a global FastAPI dependency
    so every route is covered by construction, not by each route
    remembering to opt in. The frontend's copy of the secret is baked
    into its static JS bundle at **build time** (`VITE_API_SECRET`, via
    Vite's `define`) — changing the secret requires a rebuild
    (`docker compose up --build`), not just a restart.

  **What this does and does not protect against**: this is a single
  shared secret, not a multi-user login system — no accounts, no
  sessions, no password reset flow (rotate it by changing the env var
  and rebuilding). There is no rate-limiting/brute-force lockout on the
  secret check; the threat model is "keep an exposed port from being a
  free-for-all to casual/automated scanners," not "withstand a patient,
  targeted attacker with unlimited guesses" — mitigate the latter by
  using a long random secret and not exposing the port more broadly than
  intended, not by expecting this check alone to hold under sustained
  attack. The secret also travels in plaintext over HTTP unless the
  deployment sits behind a TLS-terminating reverse proxy, which is a
  deployment-level concern this codebase does not implement. And because
  the frontend's copy is compiled into JS served to any browser loading
  the page, it is not a secret from anyone who already has legitimate
  access to open the app and inspect devtools/view-source — it only
  keeps out automated/opportunistic access that never loads a real page.

## What Would Need to Change for a Real Security Posture

Still open, listed here as a gap inventory, not a promise: encryption at
rest (SQLite file or field-level for sensitive columns — see Encryption
above for why this wasn't bundled into the auth work), rate-limiting/
brute-force protection on the shared-secret check, and some form of
audit trail for financial data edits. An authentication layer for the
web/Docker path now exists (see Network Exposure) but is intentionally
minimal — a real multi-user system with accounts/sessions is a distinct,
larger undertaking this pass did not attempt.
