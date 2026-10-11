# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Artha is a privacy-first, offline-first personal finance desktop app (a "Financial Intelligence Layer" on top of raw account data, not an accounting tool). It's a cross-platform portable desktop app — React/Electron frontend + a Python FastAPI backend + local SQLite database, no mandatory cloud or install step — packaged as a Windows portable exe, an unsigned macOS dmg/zip, and a Linux AppImage (a secondary Docker/web deployment also exists — see `docker-compose.yml`). See [Artha.md](Artha.md) for the full product vision/spec and [hardcoded_vs_dynamic.md](hardcoded_vs_dynamic.md) for which business rules are DB-configurable vs. hardcoded (note: that file itself predates several schema changes — cross-check against `Architecture/06-Business-Rules-Engine.md` if something looks off).

For anything beyond this quick-reference — full schema inventory, per-domain data model/API/business-rule breakdowns, known bugs and dead code, and what's shipped vs. pure roadmap — see `Architecture/`, the authoritative architecture documentation set. This file stays intentionally short; that folder is where the depth lives. `Architecture/15-Roadmap.md` tracks phase-by-phase shipped/planned status; `Architecture/16-Session-Log.md` records the *why* behind notable decisions session-by-session, which isn't recoverable from git history or code alone.

`.claude/` holds repo-scoped Claude Code tooling, distinct from this always-loaded file: `.claude/agents/artha-domain-reviewer.md` (a review subagent scoped to this codebase's specific invariants — double-entry ledger, generic entity model, Credit Cards' satellite-table persistence — not generic code review) and `.claude/commands/` (`/verify-docker`, `/seed-demo-data`, `/release-checklist` — repeatable multi-step tasks, invoked on demand rather than loaded every session).

## Commands

```bash
# One-time setup
python3.12 -m venv venv              # Python 3.12, matching the packaged builds (CI) — `py -3.12 -m venv venv` on Windows
venv\Scripts\activate               # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r backend/requirements.txt
pip install pyinstaller
npm install                         # installs both npm workspaces (frontend, electron) from the root

# Local development: one CLI, identical on every OS (logic in scripts/artha.mjs)
./artha start [desktop|web]         # macOS/Linux; Windows: .\artha.ps1 / artha.cmd; anywhere: npm run artha -- <cmd>
./artha stop | restart | status [--json] | logs [backend|frontend|desktop] [-f]
./artha build [web|backend|all] | package [mac|win|linux]
./start.sh / ./stop.sh              # aliases for ./artha start / stop
npm start / npm run dev:web         # foreground alternative via concurrently (Ctrl+C stops); same ports

# Frontend only (workspace "frontend")
npm run dev:frontend                # vite, http://localhost:5183
npm run build:frontend              # tsc typecheck + vite build to frontend/dist/

# Backend only (reload server)
npm run dev:backend                 # scripts/backend.mjs: venv uvicorn backend.main:app --reload on 127.0.0.1:8010 (any OS)
venv/bin/python backend/run.py      # manual sanity-check run, prints startup tracebacks directly (venv\Scripts\python on Windows)

# Production packaging (PyInstaller backend + electron-builder), per platform:
npm run package:portable            # Windows -> dist-portable/Artha <version>.exe
npm run package:mac                 # macOS   -> dist-portable-mac/Artha-<version>{.dmg,.zip} (x64 + arm64, UNSIGNED — see caveat below)
npm run package:linux               # Linux   -> dist-portable-linux/Artha-<version>.AppImage
# each chains build:frontend + build:backend(:posix) (PyInstaller), then the electron workspace's
# package:* script, which copies frontend/dist to electron/web and runs electron-builder

# Backend tests (from repo root; pip install -r backend/requirements-test.txt first)
pytest                                                          # whole suite
pytest backend/tests/test_transaction_editing.py                # one file
pytest backend/tests/test_transaction_editing.py::test_edit_transaction_amount_reverts_and_reapplies_balance   # one test
pytest -k statement_spend                                       # by name substring
```

There is no lint script configured in `package.json` — `tsc` (via `build:frontend`) is the only automated frontend check, and it enforces `strict`, `noUnusedLocals`, `noUnusedParameters`. The backend pytest suite (`backend/tests/`, config in `pyproject.toml`) covers `calculations.py`'s pure functions, `init_db()` migration idempotency, goal-progress derivation, and `TestClient`-based API tests against an isolated temp-file DB — including the transaction ledger's revert-then-reapply edit path and the credit-card Spend / balance-exempt marker edge cases (`test_transaction_editing.py`). Tests use the `test_db_path` fixture from `conftest.py`. The suite is not comprehensive. `.github/workflows/tests.yml` runs it (Python 3.12) plus the frontend typecheck/build on every push to `main` and every PR. `test_decision_engine.py` covers every recommendation check (including the disabled-rule fallback to the built-in default), the credit-card annual-review verdicts, and a smoke test that every parameter-free GET route answers on a fresh database. Most write routes outside tax and the AI Assistant routes are still verified manually: run `npm run dev:backend` and hit endpoints directly, or via the Electron app (`npm start`). Note: `backend/db.py`'s `get_db_path()` checks `~/.financeos/settings.json` before `FINANCE_DB_DIR`, so any test needing an isolated DB must monkeypatch `get_db_path` itself (see `backend/tests/conftest.py`) — setting the env var alone is not sufficient if a real `settings.json` already exists on the machine.

CI (`.github/workflows/build-and-publish.yml`) builds a 3-OS matrix (`windows-latest`/`macos-latest`/`ubuntu-latest`) on every push to `main` and on PRs, and publishes all three artifacts as a GitHub Release when a `v*` tag is pushed. **The Windows leg is unchanged from before and known-working; the macOS/Linux legs were added in this change and have not yet been confirmed green by an actual CI run** — PyInstaller doesn't cross-compile (must run on the target OS), so this could only be written and locally partially smoke-tested (macOS `package:mac` was confirmed to produce correct `.dmg`/`.zip` artifacts locally), not verified end-to-end in Actions from this environment. Treat mac/linux CI as provisional until the first matrix run completes.

A separate workflow, `.github/workflows/docker-build.yml`, builds and pushes the `backend`/`frontend` Docker images (see below) to GHCR (`ghcr.io/<owner>/artha-backend`, `artha-frontend`) — deliberately not folded into `build-and-publish.yml` since it produces a categorically different artifact (container images vs. desktop installers). It triggers only on push to `main` and `v*` tags (not PRs, to keep Docker builds off the PR critical path), tags images via `docker/metadata-action` (`latest` on `main`, semver on release tags, short-SHA on every build), and uses GHA-backed layer caching. It does not run the pytest suite as a gate; that runs separately in `tests.yml`.

**macOS build is intentionally unsigned**: no Apple Developer ID certificate or notarization credential exists in this repo (`build.mac.identity: null` in `electron/package.json` explicitly opts out of signing so electron-builder doesn't fail looking for one). End users will see Gatekeeper's "unidentified developer" warning and must right-click → Open, or run `xattr -cr` on the `.app`, to launch it. All three platform targets point `icon` at `frontend/public/favicon.png` in `electron/package.json`'s `build` config (no dedicated `.ico`/`.icns` assets).

## Architecture

The repo is a monorepo of three parts. `frontend/` + `backend/` make up the web app; `electron/` is only the desktop shell that wraps them. npm workspaces (`frontend`, `electron`, declared in the root `package.json`) give each JS part its own dependencies with one root lockfile and hoisted `node_modules`; the Python backend sits outside npm with its own `requirements*.txt`. The root `package.json` holds only orchestration scripts (and `concurrently`); `scripts/` holds the cross-platform helpers they call (`backend.mjs`, `copy-web.mjs`, `load-env.cjs`). The web Docker image installs only the `frontend` workspace (`npm ci -w frontend`), so it never downloads Electron. Electron is pinned to an exact version in `electron/package.json`: electron-builder runs from that workspace and needs a fixed version, since the hoisted install isn't in `electron/node_modules`.

```
Electron (electron/main.js)
  ├─ spawns Python backend as a sidecar subprocess (venv python in dev, PyInstaller-built binary in prod — main.exe on Windows, extensionless main on macOS/Linux; electron/main.js branches on process.platform)
  ├─ dev: loads http://localhost:5183 (Vite)  |  prod: loads web/index.html (frontend/dist, copied in by scripts/copy-web.mjs)
  └─ IPC: native save/open dialogs for picking a SQLite db file, exposed to the page only through
     electron/preload.js (contextBridge -> window.artha). The renderer runs with nodeIntegration off,
     contextIsolation + sandbox on; frontend code reaches desktop features via frontend/src/platform.ts,
     never require('electron'), so the same UI runs unchanged in a plain browser.
     Artha's own menu bar (buildMenu in main.js, replacing Electron's default) sends 'menu-command'
     events through the preload's onMenuCommand to App.runCommand, the same handler the in-app top bar
     (+ New, Ctrl/Cmd+K Go-to search, database/backup chip) uses. Pages for the sidebar and the search
     come from one list, frontend/src/navigation.tsx.

React/TS frontend (frontend/src/)
  └─ talks to backend purely over HTTP: fetch calls to API_BASE_URL (frontend/src/config.ts, hardcoded 127.0.0.1:8000)

FastAPI backend (backend/)
  ├─ main.py           — all routes live in this one file
  ├─ db.py             — SQLite connection, schema/migrations, settings.json, db path resolution
  ├─ calculations.py   — pure financial math (EMI, XIRR, amortization, tenure/interest projections)
  ├─ decision_engine.py— reads financial_rules + entities, returns recommendation objects
  ├─ tax/              — income-tax engine (engine.py, 14-step old/new regime computation with an audit line per figure),
  │                      driven ONLY by versioned per-FY rule sets in tax/rules/*.json (no slab/limit literals in code — a test enforces it);
  │                      nps.py / payroll.py / waterfall.py build NPS scenarios, before/after payslips and the savings waterfall
  │                      by re-running the engine (never by per-rupee shortcuts). Optional month-by-month entry (inputs.monthly,
  │                      12 months Apr..Mar, actual/projected): when enabled, normalize_inputs derives every annual figure from the
  │                      months (apply_monthly_totals), HRA is computed per month, and each regime result gains a monthly TDS projection.
  │                      epf.py suggests Employee EPF from dated EPFO wage ceilings (tax/metadata/epf_rules.json; a mid-month change is split by days).
  │                      prefill.py proposes planner figures from Artha's own records (read-only; the user ticks what to apply);
  │                      the planner keeps one saved plan per person and year in tax_planner_drafts (slot p<person>-<FY>).
  │                      payslip_pdf.py reads payslip PDFs (pypdf[crypto], in memory) into month + label/amount lines for the grid's import.
  │                      advance_tax.py: instalments, safe harbours and interest from the rule set's optional advance_tax item;
  │                      /api/calendar adds each saved plan's upcoming instalments and the return due date
  │                      sensitivity.py: break-even, NPS-for-target and salary/bonus/basic-share sweeps (bisection over full engine runs);
  │                      CSV/PDF reports are built client-side (frontend/src/components/tax/reportTables.ts), PDF via the preload's savePdf
  └─ ai/               — AI Assistant: providers.py (Ollama / OpenAI-compatible / Anthropic behind get_provider()),
                         context.py (builds explain/ask prompt context from the DB); imported lazily inside the AI routes in main.py
```

**Startup sequence matters**: Electron spawns the backend, waits a fixed 1.5s, then creates the window; the React app then polls `GET /api/init` up to 15 times (1s apart) until the backend responds (`App.tsx`). If you change backend startup time or the port, this retry logic and the fixed Electron delay both need to stay compatible.

### Data model: metadata-driven entities, not per-domain tables

The schema (see `init_db()` in `backend/db.py`) intentionally collapses what used to be separate tables (investments, properties, insurance, loans, credit_cards) into generic tables: `accounts`, `assets`, `liabilities`, plus `income`/`expenses`/`goals`/`transactions`. Domain distinction comes from a `category_id` FK into `categories` (which carries a `fields_definition` JSON schema describing that category's custom fields), not from separate tables. Fields not in a table's fixed columns get folded into a `metadata_json` / `funding_sources_json` / `snapshot_data` blob — see `serialize_entity_payload()` in `main.py`, which splits any CRUD payload into "known columns" vs. "everything else goes into the JSON blob" automatically based on `PRAGMA table_info`.

Three categories' shapes diverge enough from their siblings that they get a dedicated 1:1 (or 1:many) satellite table instead of just `fields_definition`: Credit Card liabilities (`credit_card_details`), Insurance assets (`insurance_details`, carrying a `policy_type` Life/Term/Health/Vehicle sub-discriminator), and Stock/Mutual Fund assets (`holding_lots`, one row per purchase lot — `assets.quantity`/`cost_price` are derived/recomputed from lots, not independently editable once lots exist). This is the exception, not the default path — prefer a new `categories` row + `fields_definition` first; only add a satellite table when fields genuinely don't fit the shared shape.

`income`/`expenses` are the per-person **recurring plan** (Income & Expenses screen; salary `amount` is gross, take-home is the Salary category's `net_amount` custom field), distinct from `monthly_cash_flows`, the monthly **actuals** log that Cash Flow Planning analyses and auto-fills from the plan. See `Architecture/Domains/Income.md`. Every person-owned record (`accounts`, `assets`, `liabilities`, `income`, `expenses`) defaults to the Primary Owner when created without an `owner_id` (`default_owner_id()` in `main.py`).

`init_db()` also contains one-way legacy migrations (old `loans`/`investments`/`properties`/`insurance`/`credit_cards` tables → the new `assets`/`liabilities` shape) that run idempotently on every startup and rename old tables to `*_old` once migrated. When adding new entity kinds, prefer adding a new `categories` row + `fields_definition` over adding a new table. See `Architecture/05-Database-Architecture.md` for the full table inventory, including tables that exist but are unused/dead (an entire reward-points schema cluster references a `financial_products` table that's never created).

### Accounts have no stored balance — it's derived from a double-entry transactions ledger

`accounts.current_balance` **is not a column** — `owner_id`/`institution_id`/`status`/`currency` are the only accounts fields besides `name`. Every read of an account's balance is computed live: `SUM(transactions where dest_ref_type='Account' AND dest_ref_id=account.id) − SUM(transactions where source_ref_type='Account' AND source_ref_id=account.id)`. `transactions` itself is a proper double-entry ledger — `source_ref_type`/`source_ref_id` and `dest_ref_type`/`dest_ref_id` (each `'Account'`, `'Asset'`, `'Liability'`, or `'None'`), not the older `account_id` + loosely-typed `related_entity_id` shape. If you're looking at code or docs that reference `accounts.current_balance` as a stored/mutated column, or `adjust_double_entry_balances(cursor, t_type, amount, account_id, related_entity_type, related_entity_id, operation)` with that signature, it's stale — the current signature is `adjust_double_entry_balances(cursor, t_type, amount, source_type, source_id, dest_type, dest_id, operation, is_balance_exempt=False)`, and it only mutates `assets.current_value` and `liabilities.outstanding` directly (never `accounts`, since that's always derived).

Credit-card spend is tracked in the same ledger: a `'Spend'` transaction with `dest_ref_type='Liability'` increases `outstanding` (EMI/Prepayment pay it down), and `transactions.category_id` drives per-category reward/cap calculations, with billing cycles computed live from `credit_card_details.statement_date`. `transactions.is_balance_exempt` marks the statement-spend-adjustment marker row (from migrating the old manually-typed `current_statement_spend`), which counts toward spend but never moves `outstanding`. It is a structural column, deliberately **not** caller-settable: the generic entity routes `pop()` it from payloads and, on edit/delete, take it from the stored row. Don't reintroduce notes-text matching to detect that row; that approach drifted across edits and was replaced (see the commit history and `test_transaction_editing.py`).

### Generic CRUD + special-cased side effects

`/api/entities/{entity_type}` (GET/POST/PUT/DELETE) is one generic handler for `accounts`, `assets`, `liabilities`, `income`, `expenses`, `goals`, `transactions` — the allowed table list is hardcoded in each route function (kept in sync manually, not shared as a constant). `transactions` writes are special-cased to also call `adjust_double_entry_balances()` (see above). Updates/deletes of a transaction first revert the old balance impact, then (for updates) reapply the new one — so transaction edits are effectively revert-then-reapply, not a diff.

### A dedicated screen can bypass the generic entity model entirely — check before assuming uniformity

Not every category renders through the generic `EntityGrid`/`DynamicForm` path. Credit Cards has its own dedicated component (`frontend/src/components/CreditCards.tsx`) with its own reward-optimization engine (category multipliers, milestone thresholds, redemption partners, lounge tracking, bank-agnostic/pooled reward caps). It saves in two steps: base liability fields go through the generic entity route, and all card/reward config goes to `PUT /api/liabilities/{id}/credit-card-details`, which writes the `credit_card_details` satellite table. That table is the single source of truth, and `/api/init` flattens its columns directly onto each liability object, so read them off the card rather than parsing `metadata_json`. The Financial Calendar's due-date reminders read from the same table. Older docs (including parts of `Architecture/Domains/Credit-Cards.md`) describe an earlier state where `CreditCards.tsx` wrote reward config into `liabilities.metadata_json` and the two paths drifted apart. That no longer matches the code; `metadata_json` → `credit_card_details` survives only as a one-time backfill in `init_db()`.

### Database path resolution (portability)

The active DB path is not fixed — resolution order is: `~/.financeos/settings.json` (`active_db_path`) → `FINANCE_DB_DIR` env var (set by Electron; points next to the portable exe via `PORTABLE_EXECUTABLE_DIR`, or to `app.getPath('userData')` if unpacked) → dev fallback of `<repo>/data/finance.db`. The frontend can trigger a native file dialog (Electron IPC `select-db-file`) and POST the chosen path to `/api/settings/database`, which calls `switch_database()` — this updates settings and re-runs `init_db()` against the new file, so switching databases always re-applies schema/migrations.

### Financial rules: DB-configurable with hardcoded fallbacks

Thresholds like emergency fund target, high-interest loan ROI cutoff, prepayment liquidity buffer, insurance renewal alert window live in the `financial_rules` table (editable via `/api/rules`) but `decision_engine.py` and `calculations.py` fall back to hardcoded defaults if a rule is absent/disabled. See [hardcoded_vs_dynamic.md](hardcoded_vs_dynamic.md) for the authoritative list of which values are DB-driven vs. hardcoded in Python/TSX — check it before assuming a threshold is configurable.

**Income tax is the exception**: slabs, rebates, surcharge, cess and deduction limits are not in `financial_rules` but in `backend/tax/rules/<rule_set_id>.json`, one file per financial year, each item tagged with a `verification` level and its legacy/new-Act section. The old Taxation keys in `financial_rules` (`section_80c_limit`, `standard_deduction_salaried`, etc.) are still seeded but unused (their descriptions say so). Adding a year means adding a rule file, not editing code. The files are bundled into the PyInstaller binary via `--add-data` in `package.json`'s `build:backend*` scripts (`backend/tax/rules` and `backend/tax/metadata`), so a new data directory under `backend/` needs the same treatment.

To add a year, follow `Architecture/Domains/Tax-Rules-Update-Guide.md`. Shipped rule files are read-only at runtime. Users edit their own copies, stored in the DB by `backend/tax/rule_store.py`:
- **Tables:** `tax_rule_sets` holds one immutable row per version. `tax_rule_set_selection` maps each FY to the set it uses; with no row, the shipped set applies.
- **Resolution:** compute, the profile estimate and scenarios all go through `rule_store.resolve()`, never `rules_loader.load_rule_set()` directly, so a user's selection is honoured.
- **Provenance:** any value a user changes is force-tagged `verification: "user_entered"`.
- **Scenarios:** saved scenarios (`tax_scenarios`) snapshot the rule set id, version and content hash. A rule set that scenarios reference can only be archived, not deleted.

### Backend port/URL

Dev defaults are **8010 (backend) / 5183 (Vite) on every OS and entry point**, defined once in `scripts/load-env.cjs` (`DEV_DEFAULT_PORTS`), deliberately not 8000/5173 because the packaged desktop app always runs its bundled backend on 8000. `ARTHA_BACKEND_PORT`/`ARTHA_FRONTEND_PORT` override them, from the shell or from an optional git-ignored repo-root `.env` (see `.env.example`), which every dev entry point reads via `load-env.cjs`: the `artha` CLI, `scripts/backend.mjs`, `frontend/vite.config.mts` and `electron/main.js` (dev only). `frontend/src/config.ts`'s `API_BASE_URL` is baked in at build time by `frontend/vite.config.mts`'s `define`: the dev server follows the dev backend port, but **production builds always use 8000** unless `VITE_API_BASE_URL` is set explicitly, as the Docker build does. That stops a dev-only port in `.env` from being baked into a desktop package.

The `artha` CLI (`scripts/artha.mjs`) is the supported way to run the dev stack: it records one pid + log per service in `.run/`, checks identity by response content (not just "port answered"), refuses to start over a port another app holds, and on `stop` only signals its recorded pids (process groups / `taskkill /t`) plus this repo's own untracked python/node/electron processes. It never kills by port. In desktop mode it sets `ARTHA_EXTERNAL_BACKEND=1` so `electron/main.js` reuses the CLI's backend instead of spawning a second one.

### Docker/web auth & CORS (opt-in, no-op for desktop)

`backend/main.py` reads two env vars at process start, both empty/unset by default: `ARTHA_API_SECRET` (if set, every request must send a matching `X-Artha-Api-Secret` header, checked via `secrets.compare_digest`, enforced globally via a `Depends()` on the `FastAPI(...)` constructor itself — every route is covered, not opt-in per-router) and `ARTHA_ALLOWED_ORIGINS` (comma-separated CORS allowlist — no longer `allow_origins=["*"]`). If `ARTHA_ALLOWED_ORIGINS` is unset, the default is derived from `ARTHA_FRONTEND_PORT` (same var `electron/main.js`/`frontend/vite.config.mts` read, falling back to `5173`) rather than being hardcoded to one port, so overriding the frontend port (e.g. `start.sh`'s `5183` default) doesn't silently break CORS — `start.sh` also computes and exports `ARTHA_ALLOWED_ORIGINS` explicitly for the same reason, and `docker-compose.yml` derives it from `ARTHA_FRONTEND_HOST_PORT` (default `8080`). Both env vars are strictly no-ops for desktop/Electron (loopback-only, `file://` origin) — they only matter for the Docker/web deployment path and this bare-metal dev-server path. The frontend's copy of `ARTHA_API_SECRET` is baked into its static JS bundle at **build time** via `VITE_API_SECRET` (see `frontend/Dockerfile`/`docker-compose.yml`) — rotating the secret requires `docker compose up --build`, not just a restart, since a plain container restart won't re-bake a changed value into already-built frontend assets. `frontend/src/main.tsx` attaches the header to same-origin `fetch()` calls via a single global `window.fetch` override (deliberately not a per-call-site wrapper — see its code comment for the tradeoff) — this does not cover plain `<a href>` navigations, which is why the document-download link in `DocumentsEditor.tsx` fetches-as-blob instead of using a direct link. See `Architecture/11-Security-Architecture.md` for the full threat model, including what this explicitly does not protect against (no rate-limiting, no TLS termination).
