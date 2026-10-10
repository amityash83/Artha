# System Architecture

Overall system layers, module interaction, bounded contexts, services,
architecture diagrams, deployment model.

---

## Layers (as shipped)

```
Electron Shell (electron/main.js)
    │ spawns backend subprocess, native file dialogs, auto-backup on open/close
    ▼
React/TS Frontend (frontend/src/)
    │ fetch() calls to API_BASE_URL — no client-side domain/service layer
    ▼
FastAPI Backend (backend/main.py)
    │ generic CRUD for accounts/assets/liabilities/income/expenses/goals/transactions
    │ + dedicated satellite routes where a category's shape diverges
    │ + calculation/simulation endpoints (calculations.py)
    │ + rule-based recommendations (decision_engine.py)
    ▼
SQLite (finance.db)
```

There is no service/domain/repository layering (see
`03-Domain-Driven-Design.md` for why not) and no client-side state
management library — React component state + `fetch()` is the entire
data layer on the frontend.

## Module Interaction

- The frontend loads its entire working state in one call:
  `GET /api/init` returns `accounts`, `assets`, `liabilities`, `income`,
  `expenses`, `goals`, `rules`, `categories`, `institutions`,
  `recommendations`, and `cash_flows` in a single payload. Every screen
  (`Dashboard`, `Reports`, `Simulations`, category grids) reads from this
  one object; there is no per-screen fetch of a narrower slice except for
  screens with their own dedicated data (e.g. `CreditCards.tsx`'s own
  reward-calculator inputs, which are client-only state, not fetched).
- Writes go through either the generic `/api/entities/{type}` router
  (POST/PUT/DELETE) or a satellite-specific route
  (`/api/assets/{id}/insurance-details`,
  `/api/liabilities/{id}/credit-card-details`,
  `/api/assets/{id}/holdings`), then the frontend calls `onRefresh()`
  which re-fetches `/api/init` from scratch — there is no partial/optimistic
  client-side cache update anywhere.
- `decision_engine.generate_recommendations()` is called once, inline,
  inside `/api/init` — recommendations are computed fresh on every load,
  not cached or pre-computed on write.

## Bounded Contexts (informal, not enforced in code)

The `Domains/` folder documents 13 conceptual domains (Banking, Loans,
Credit Cards, Investments, Properties, Insurance, Goals, Income,
Reports, Calendar, Taxation, Knowledge, Documents/Financial-Profile).
These are **documentation boundaries**, not code boundaries — there is
no package/module split enforcing them in `backend/` or `frontend/src/`. Most
domains share the same generic `assets`/`liabilities` tables and the
same `EntityGrid`/`DynamicForm` components, differentiated only by a
`category_id` value. Treat "bounded context" here as "a section of this
documentation," not "an isolated subsystem."

## Deployment Model

Two independent deployment paths exist, sharing the same
`backend/`/`frontend/src/` source:

1. **Desktop (primary, cross-platform: Windows/macOS/Linux)**: PyInstaller
   bundles the FastAPI backend into a native binary (`main.exe` on
   Windows, extensionless `main` on macOS/Linux — PyInstaller doesn't
   cross-compile, so each platform's binary must actually be built on
   that OS); `electron-builder` packages the Electron shell + built
   React app + that binary into a portable Windows `.exe`, an unsigned
   macOS `.dmg`/`.zip`, or a Linux `.AppImage`. No installation step on
   any platform; the database directory resolution differs slightly by
   OS (Windows portable mode can keep the DB next to the `.exe` via
   `PORTABLE_EXECUTABLE_DIR`; macOS/Linux always use the OS-standard
   per-user app-data directory, since there's no equivalent "portable
   executable" concept for `.app`/`.AppImage` bundles). See
   `08-Technology-Architecture.md`. The macOS build ships unsigned (no
   Developer ID/notarization credential available) — end users see a
   Gatekeeper warning on first launch.
2. **Web/Docker (secondary, added later)**: `backend/Dockerfile` runs
   the FastAPI backend standalone (bound to `0.0.0.0`, not `127.0.0.1`);
   `frontend/Dockerfile` builds the React app and serves it via Nginx.
   `docker-compose.yml` wires both together with a named volume for the
   SQLite file. This path drops the Electron shell entirely — the app
   runs in a browser instead. `VITE_API_BASE_URL` (build-time env var,
   `frontend/src/config.ts`) is what makes the same frontend code target either
   `127.0.0.1:8000` (desktop) or a container-network hostname (Docker)
   without a code fork.

Both paths run the exact same `backend/main.py`/`db.py` — there is no
backend code that's Docker-only or Electron-only. The divergence is
entirely in how the process is started and where the SQLite file is
resolved (`FINANCE_DB_DIR` env var vs. `~/.financeos/settings.json`).

## Startup Sequence (desktop path — timing-sensitive)

1. Electron spawns the backend subprocess and waits a **fixed 1.5s**
   before creating the window.
2. The React app polls `GET /api/init` up to **15 times, 1s apart**,
   until the backend responds.

If backend startup time or the port ever changes, both the fixed delay
in `electron/main.js` and the retry loop in `App.tsx` must be kept
compatible — this is a real, easy-to-break coupling, not a theoretical
concern.
