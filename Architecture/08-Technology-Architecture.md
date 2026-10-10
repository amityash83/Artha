# Technology Architecture

Desktop stack, persistence, sync, APIs, packaging.

---

## Stack

- **Frontend**: React + TypeScript, Vite build (`vite.config.ts` — base
  `'./'` for relative asset paths inside a packaged app; dev server on
  port 5173). No client-side state management library — React component
  state + `fetch()`.
- **Desktop shell**: Electron (`electron/main.js`) — spawns the FastAPI
  backend as a local subprocess, loads either `http://localhost:5173`
  (dev) or the built `dist/index.html` (prod), provides native file
  dialogs (`select-db-file` IPC channel) and auto-backup on window
  open/close.
- **Backend**: Python + FastAPI (`backend/main.py`), Uvicorn ASGI server.
  CORS wide open (`allow_origins=["*"]`) since all traffic is
  loopback/local-network.
- **Persistence**: SQLite, single file (`finance.db`), accessed via raw
  `sqlite3` (no ORM), `conn.row_factory = sqlite3.Row` for dict-like row
  access.

## Persistence & Sync

- No sync layer exists — no cloud backend, no multi-device sync, no
  conflict resolution. The SQLite file is the entire state, and moving
  it between machines is a manual file-copy (or the built-in "switch
  database" file picker) operation.
- Database path resolution and settings persistence: see `CLAUDE.md`
  (`~/.financeos/settings.json` → `FINANCE_DB_DIR` env var → dev
  fallback) — authoritative there, not duplicated here.
- Backup: `/api/backup/create`, `/api/backup/restore`, `/api/backup/list`,
  and an `/api/backup/auto-run` endpoint triggered by Electron on window
  open/close (best-effort — a 1.5s timeout fallback in `electron/main.js`
  means a slow backup can be silently skipped without blocking the UI).
  Backup files are plain file copies of the SQLite database, not
  encrypted or compressed.

## APIs

All backend endpoints are documented per-domain in `Domains/*.md`. At a
system level:

- Generic entity CRUD: `GET/POST/PUT/DELETE /api/entities/{entity_type}`
  for `accounts`, `assets`, `liabilities`, `income`, `expenses`, `goals`,
  `transactions` — one route function per HTTP verb, hardcoded allowed-
  table list (kept in sync manually across the four route functions, not
  shared as a constant).
- Satellite entity routes (not generic — relational semantics the
  generic router can't express): `/api/liabilities/{id}/credit-card-details`,
  `/api/assets/{id}/insurance-details`, `/api/assets/{id}/holdings` +
  `/api/holdings/{lot_id}`.
- Metadata routes: `/api/metadata/{categories|institutions|financial_rules}`.
- Calculation/simulation routes: `/api/calculations/*`,
  `/api/simulations/*`.
- Aggregate/derived routes: `/api/init` (the single full-state payload),
  `/api/calendar` (computed live, no dedicated table).
- Settings/data-management routes: `/api/settings/*`, `/api/backup/*`,
  `/api/import/mmex`.

There is no API versioning (`/api/v1/...`) and no authentication —
appropriate for a single-user local app, but a real constraint if the
web/Docker deployment path (below) is ever exposed beyond a private
network.

## Packaging — Two Deployment Paths

**1. Desktop (primary, cross-platform: Windows/macOS/Linux):**
- `npm run build:frontend` (`tsc && vite build`) → static assets in `dist/`.
- `npm run build:backend` (Windows) / `build:backend:posix` (macOS/Linux)
  → PyInstaller bundles `backend/` + `backend/run.py` into
  `backend/dist/main/main.exe` (Windows) or `backend/dist/main/main`
  (macOS/Linux, no extension), onedir/console mode. PyInstaller does not
  cross-compile — each OS's binary must be built by running PyInstaller
  on that OS, which is why this needs three separate CI legs (below),
  not just three electron-builder config blocks.
- `electron-builder --win portable` / `--mac` / `--linux AppImage` →
  bundles the Electron shell + `dist/` + the PyInstaller output into:
  Windows `dist-portable/Artha <version>.exe` (no installer); macOS
  `dist-portable-mac/Artha-<version>{-arch}.{dmg,zip}` (x64 + arm64,
  **unsigned** — `build.mac.identity: null` in `package.json` explicitly
  disables code signing since no Developer ID certificate exists in
  this repo; end users see a Gatekeeper "unidentified developer"
  warning and must right-click → Open or `xattr -cr` the `.app`); Linux
  `dist-portable-linux/Artha-<version>.AppImage` (single portable
  binary, no `deb`/`rpm` in this pass).
- `npm run package:portable` / `package:mac` / `package:linux` each run
  the frontend build + the platform-appropriate backend build + the
  matching electron-builder invocation in sequence.
- CI (`.github/workflows/build-and-publish.yml`) builds a 3-OS matrix
  (`windows-latest`/`macos-latest`/`ubuntu-latest`) on every push to
  `main` and on PRs, and publishes all three artifacts as a GitHub
  Release on a `v*` tag push. The Windows leg's commands are unchanged
  from before this matrix existed (byte-for-byte, to avoid regression
  risk on the one platform that already worked). **The macOS/Linux legs
  are new and have not yet been confirmed to produce a green CI run** —
  local verification on this project's dev machine confirmed
  `package:mac` produces correct, correctly-bundled `.dmg`/`.zip`
  artifacts (both architectures), but GitHub's hosted `macos-latest`/
  `ubuntu-latest` runner images have not actually been exercised.
  Treat as provisional until the first real matrix run completes.
- No custom app icon is configured on any of the three platforms
  (pre-existing gap on Windows, not newly introduced) — all three ship
  with electron-builder's default Electron icon.

**2. Web/Docker (secondary):**
- `backend/Dockerfile`: Python slim image, installs
  `backend/requirements.txt`, runs Uvicorn bound to `0.0.0.0:8000`
  (not `127.0.0.1` — must be reachable from the frontend container),
  `FINANCE_DB_DIR=/data` with a mountable volume.
- `frontend.Dockerfile`: multi-stage — Node builds the Vite bundle with
  `VITE_API_BASE_URL` baked in via `--build-arg`, then `nginx:alpine`
  serves the static output.
- `docker-compose.yml`: wires both together, named volume `artha_data`
  for the SQLite file so it survives container restarts/rebuilds.
- This path drops the Electron shell entirely — same backend/frontend
  source, no code fork, just a different `API_BASE_URL` resolution
  (`frontend/src/config.ts` reads `import.meta.env.VITE_API_BASE_URL`, falling
  back to the desktop's hardcoded `127.0.0.1:8000`) and a different
  process supervisor (Docker vs. Electron).

Both paths run identical `backend/main.py`/`db.py` code — there is no
backend logic that's Docker-only or Electron-only.

## Backend Port/URL — a Real Multi-File Coupling

`127.0.0.1:8000` is duplicated across `electron/main.js`,
`package.json` scripts, and `frontend/src/config.ts`'s fallback value. There is
no single source of truth for the port; changing it means updating all
three by hand. See `CLAUDE.md` for the authoritative note on this.
