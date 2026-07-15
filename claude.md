# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Artha** (formerly "FinanceOS") is a privacy-first, offline-first personal financial intelligence desktop app — a decision sandbox for retirement, loans, goals, and cash-flow simulations, *not* a transactional accounting tool (it complements Money Manager Ex rather than replacing it). It ships as a single portable Windows `.exe` with no installer.

## Commands

```bash
# Local development — starts Vite, FastAPI (--reload), and the Electron shell concurrently
npm start

# Type-check + build the React frontend only (outputs to dist/)
npm run build:frontend

# Compile the Python backend into a standalone binary via PyInstaller (outputs to backend/dist/main/)
npm run build:backend

# Full portable build: frontend + backend + electron-builder NSIS portable exe (outputs to dist-portable/)
npm run package:portable

# Same as above, invoked through the release script
npm run build:exe

# Run the backend directly for debugging startup tracebacks (bypasses Electron/uvicorn reload)
venv\Scripts\python run.py

# Run backend with hot reload only (no Electron/Vite)
npm run dev:backend
```

There is no automated test suite or linter configured — `tsc` (via `build:frontend`) is the only static check. Verify backend changes by hitting `http://127.0.0.1:8000/api/init` after `npm run dev:backend`, and verify frontend changes by running `npm start` and exercising the affected screen.

`artha.ps1` (`.\artha.ps1 start|stop|status`) is a convenience wrapper that frees ports 8000/5173, launches backend+frontend+Electron as background processes, and tracks their PIDs in `.artha.pid` — useful for starting/stopping the whole stack from outside an interactive `npm start` session.

## Architecture

Electron shell → spawns a Python FastAPI sidecar process (`backend.main:app`, port 8000) and loads the React/Vite frontend (`localhost:5173` in dev, `dist/index.html` when packaged). The frontend talks to the backend exclusively over HTTP (`src/config.ts` hardcodes `API_BASE_URL`). See `Artha.md` for the full product vision/module list and `docs/` for the enterprise-methodology spec suite (business object model → domain model → business rules → database → API → UX, numbered `00-`–`17-`).

### Backend (`backend/`)

- `main.py` — the entire FastAPI app: Pydantic request schemas, a generic entity CRUD router (`/api/entities/{entity_type}`) shared across accounts/assets/liabilities/income/expenses/goals/transactions, plus dedicated routers for simulations, snapshots, MMex CSV import, and DB backup/restore/switching.
- `db.py` — schema creation, **in-place migrations that run on every startup** (checked via `PRAGMA table_info` and applied idempotently — see the pattern for `accounts`/`transactions` restructuring and the legacy-table migrations near the bottom of `init_db()`), settings persistence (`~/.financeos/settings.json`), and DB path resolution.
- `calculations.py` — pure financial math: EMI/tenure/remaining-interest formulas, XIRR, multi-loan payoff simulation (snowball/avalanche/baseline with monthly/annual cascading prepayments), daily pro-rata amortization.
- `decision_engine.py` — reads `financial_rules` table thresholds and produces the dashboard's recommendation/alert list.

**Data model conventions (see `docs/memory.md` for the full rationale — read it before touching schema or balance logic):**
- **No stored balances.** Account `current_balance` and goal `current_amount` are never columns — they're computed on every read: account balance = sum of `transactions` where `dest_ref_id` matches minus where `source_ref_id` matches; goal progress = `SUM(assets.current_value * goal_holdings.allocation_weight)` joined through the `goal_holdings` junction table. Never add a stored balance column back.
- **Double-entry transactions.** `transactions` rows have `source_ref_type`/`source_ref_id` and `dest_ref_type`/`dest_ref_id` (each `Account`, `Asset`, or `None`) instead of a single `account_id`, so transfers, buys/sells, and EMI/prepayments all flow through the same table. `adjust_double_entry_balances()` in `main.py` applies/reverts the asset-value and liability-outstanding side effects whenever a transaction is created/updated/deleted.
- **Metadata-driven schema.** Product-specific fields (credit card reward rules, FD tenure, policy numbers, etc.) are never added as new columns — they're merged into a `metadata_json` (or `funding_sources_json` / `snapshot_data`) text column and deserialized on read (`serialize_entity_payload()` splits payload keys into known-column vs. JSON-blob automatically based on the target table's actual columns). `categories.fields_definition` (JSON) drives which extra fields `DynamicForm.tsx`/`EntityGrid.tsx` render per category — extend behavior by editing the seeded category definitions in `db.py`, not by writing new form components.
- **Seed data is one-shot.** Default institutions/categories/rules are only inserted when `is_new_db` (DB file didn't exist before `init_db()` opened it) — never reseed unconditionally, or user renames/deletes of seeded rows will silently reappear.
- **`goal_holdings` sync.** Whenever an asset's `goal_mapping` metadata field changes via the entity CRUD routes, the backend must keep the `goal_holdings` junction table in sync in the same request (see the create/update handlers for `assets` in `main.py`).

### Frontend (`src/`)

- `App.tsx` is the single-page router: it fetches `/api/init` once on load (polls up to 15× until the backend sidecar responds), holds all app data in one `InitData` object, and switches between view components by a local `activeTab` string state — there is no client-side routing library.
- `components/EntityGrid.tsx` + `components/DynamicForm.tsx` render generic CRUD screens (Accounts/Assets/Liabilities/Goals) driven entirely by each category's `fields_definition` JSON — prefer extending the schema/category definitions over adding bespoke form components.
- Feature-specific screens (`LoanOptimizer.tsx`, `EmiCalculator.tsx`, `CashFlowPlanning.tsx`, `Simulations.tsx`, etc.) call dedicated backend simulation endpoints rather than doing projections client-side.
- Sort dropdown/list data client-side (`[...list].sort(...)` immediately before `.map()`) even though the backend also orders by name — this guards against stale/hot-reload state (see `docs/memory.md`).

### Portability / DB path resolution

Electron resolves the active SQLite file at launch (dev: `d:\AI\Antigravity\data\finance.db`; packaged portable: `<exe-dir>/data/finance.db` via `PORTABLE_EXECUTABLE_DIR`; unpacked: `%APPDATA%/FinanceOS/data/finance.db`), creates the directory, and passes it to Python via the `FINANCE_DB_DIR` env var. The frontend can switch databases at runtime through Electron's native file dialog IPC (`select-db-file`) → `POST /api/settings/database`, which persists the choice to `~/.financeos/settings.json` and re-runs `init_db()` migrations against the new file. Preferences (`active_db_path`, `recent_databases`, backup settings) live outside the portable directory in `~/.financeos/settings.json`, not in the SQLite DB itself.

### Windows/PowerShell gotchas (see `docs/memory.md`)

- `$PID`/`$pid` is a read-only PowerShell built-in — never use it as a loop variable name (use e.g. `$activePid`).
- `npm` on Windows resolves to `npm.cmd`; pass that explicitly when spawning it as a child process.
- Always free ports 8000 (FastAPI) and 5173 (Vite) before starting dev services to avoid `Errno 10048` bind errors — `artha.ps1`'s `Free-Port` does this automatically.

## Key Files Reference

- `run.py` — PyInstaller entry point; exists solely to put the `backend` package on `sys.path` correctly for the frozen build.
- `electron/main.js` — spawns the backend sidecar (dev: venv python + uvicorn; packaged: compiled `main.exe`), resolves DB paths, handles the native save/open dialog IPC, and runs auto-backup on window open/close.
- `main.spec` / `build_release.ps1` — PyInstaller spec and the scripted release build.
- `docs/09-Database.md`, `docs/10-API.md` — authoritative schema and endpoint specs when `docs/memory.md`'s summary isn't enough detail.
