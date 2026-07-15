# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Artha is a privacy-first, offline-first personal finance desktop app (a "Financial Intelligence Layer" on top of raw account data, not an accounting tool). It's a single portable Windows executable: React/Electron frontend + a Python FastAPI backend + local SQLite database, no mandatory cloud or install step. See [Artha.md](Artha.md) for the full product vision/spec and [hardcoded_vs_dynamic.md](hardcoded_vs_dynamic.md) for which business rules are DB-configurable vs. hardcoded.

## Commands

```bash
# One-time setup
python -m venv venv
venv\Scripts\activate               # Windows; this project targets Windows for packaging
pip install -r backend/requirements.txt
pip install pyinstaller
npm install

# Local development (Vite + FastAPI reload + Electron shell, concurrently)
npm start

# Frontend only
npm run dev:frontend                # vite, http://localhost:5173
tsc && vite build                   # npm run build:frontend — typecheck + build to dist/

# Backend only (reload server)
npm run dev:backend                 # uvicorn backend.main:app --reload on 127.0.0.1:8000
venv\Scripts\python run.py          # manual sanity-check run, prints startup tracebacks directly

# Production packaging (PyInstaller backend + electron-builder portable NSIS exe)
npm run package:portable            # -> dist-portable/Artha <version>.exe
# equivalent to running build:frontend, build:backend, then:
npx electron-builder --win portable
```

There is no test suite or lint script configured in `package.json` — `tsc` (via `build:frontend`) is the only automated check, and it enforces `strict`, `noUnusedLocals`, `noUnusedParameters`. Verify backend changes by running `npm run dev:backend` and hitting endpoints directly, or via the Electron app (`npm start`).

CI (`.github/workflows/build-and-publish.yml`) runs on `windows-latest` only: builds the portable exe on every push to `main` and on PRs, and publishes it as a GitHub Release when a `v*` tag is pushed.

## Architecture

```
Electron (electron/main.js)
  ├─ spawns Python backend as a sidecar subprocess (venv python in dev, PyInstaller-built main.exe in prod)
  ├─ dev: loads http://localhost:5173 (Vite)  |  prod: loads dist/index.html
  └─ IPC: native save/open dialogs for picking a SQLite db file

React/TS frontend (src/)
  └─ talks to backend purely over HTTP: fetch calls to API_BASE_URL (src/config.ts, hardcoded 127.0.0.1:8000)

FastAPI backend (backend/)
  ├─ main.py           — all routes live in this one file
  ├─ db.py             — SQLite connection, schema/migrations, settings.json, db path resolution
  ├─ calculations.py   — pure financial math (EMI, XIRR, amortization, tenure/interest projections)
  └─ decision_engine.py— reads financial_rules + entities, returns recommendation objects
```

**Startup sequence matters**: Electron spawns the backend, waits a fixed 1.5s, then creates the window; the React app then polls `GET /api/init` up to 15 times (1s apart) until the backend responds (`App.tsx`). If you change backend startup time or the port, this retry logic and the fixed Electron delay both need to stay compatible.

### Data model: metadata-driven entities, not per-domain tables

The schema (see `init_db()` in `backend/db.py`) intentionally collapses what used to be separate tables (investments, properties, insurance, loans, credit_cards) into four generic tables: `accounts`, `assets`, `liabilities`, plus `income`/`expenses`/`goals`/`transactions`. Domain distinction comes from a `category_id` FK into `categories` (which carries a `fields_definition` JSON schema describing that category's custom fields), not from separate tables. Fields not in a table's fixed columns get folded into a `metadata_json` / `funding_sources_json` / `snapshot_data` blob — see `serialize_entity_payload()` in `main.py`, which splits any CRUD payload into "known columns" vs. "everything else goes into the JSON blob" automatically based on `PRAGMA table_info`.

`init_db()` also contains one-way legacy migrations (old `loans`/`investments`/`properties`/`insurance`/`credit_cards` tables → the new `assets`/`liabilities` shape) that run idempotently on every startup and rename old tables to `*_old` once migrated. When adding new entity kinds, prefer adding a new `categories` row + `fields_definition` over adding a new table.

### Generic CRUD + special-cased side effects

`/api/entities/{entity_type}` (GET/POST/PUT/DELETE) is one generic handler for `accounts`, `assets`, `liabilities`, `income`, `expenses`, `goals`, `transactions` — the allowed table list is hardcoded in each route function (kept in sync manually, not shared as a constant). `transactions` writes are special-cased to also call `adjust_double_entry_balances()`, which mutates `accounts`/`assets`/`liabilities` balances depending on transaction `type` (investment, redemption, emi, prepayment, transfer, debit/expense, credit/income). Updates/deletes of a transaction first revert the old balance impact, then (for updates) reapply the new one — so transaction edits are effectively revert-then-reapply, not a diff.

### Database path resolution (portability)

The active DB path is not fixed — resolution order is: `~/.financeos/settings.json` (`active_db_path`) → `FINANCE_DB_DIR` env var (set by Electron; points next to the portable exe via `PORTABLE_EXECUTABLE_DIR`, or to `app.getPath('userData')` if unpacked) → dev fallback of `<repo>/data/finance.db`. The frontend can trigger a native file dialog (Electron IPC `select-db-file`) and POST the chosen path to `/api/settings/database`, which calls `switch_database()` — this updates settings and re-runs `init_db()` against the new file, so switching databases always re-applies schema/migrations.

### Financial rules: DB-configurable with hardcoded fallbacks

Thresholds like emergency fund target, high-interest loan ROI cutoff, prepayment liquidity buffer, insurance renewal alert window live in the `financial_rules` table (editable via `/api/rules`) but `decision_engine.py` and `calculations.py` fall back to hardcoded defaults if a rule is absent/disabled. See [hardcoded_vs_dynamic.md](hardcoded_vs_dynamic.md) for the authoritative list of which values are DB-driven vs. hardcoded in Python/TSX — check it before assuming a threshold is configurable.

### Backend port/URL are hardcoded, not env-driven

`127.0.0.1:8000` is duplicated in `electron/main.js`, `package.json` scripts, and `src/config.ts`'s `API_BASE_URL`. There's no single source of truth for the port — changing it means updating all three.
