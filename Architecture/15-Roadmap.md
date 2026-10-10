# Product Roadmap

Phase-wise implementation plan.

---

> This consolidates the "Future Enhancements"/gap items surfaced across
> every `Domains/*.md` and top-level doc into one place. It is a
> synthesis of documented gaps, not a commitment or a prioritization
> decision — treat it as a menu, not a plan someone has signed off on.
>
> **Status as of 2026-07-18: Phases 0 through 4 are all shipped** (see
> git history from `ece7b63` through `5476ef3`, plus the Docker CI
> pipeline added after this doc's last content edit). What follows is
> kept as historical record of what was planned and delivered, not a
> forward-looking plan — see `16-Session-Log.md` for a narrative of
> what was built each session and why. Only genuinely open items are
> the Backlog entry below (live NAV/price feeds) and whatever a future
> `Domains/*.md` gap-sweep surfaces next.

## Phase 0 — Fix Before Building New Things (SHIPPED)

Bugs and inconsistencies found while writing this documentation that
arguably deserve attention before new features, since they affect
correctness of what's already shipped:

- **Credit Card dual-persistence-path bug**: `CreditCards.tsx` writes
  reward-engine config into `liabilities.metadata_json`; the generic
  `EntityGrid`/`DynamicForm` path writes basic fields into
  `credit_card_details`. The Financial Calendar only reads the latter —
  a card only ever edited via the dedicated screen may show no
  reminders. See `Domains/Credit-Cards.md`.
- **Stale CSV export field names**: `exportInsuranceCSV()` references
  pre-redesign metadata keys (`coverage`, `nominee`) that don't exist in
  the current `insurance_details` schema. See `Domains/Insurance.md`,
  `13-Reporting-Architecture.md`.
- **Broken Property↔Home Loan link write**: `EntityGrid.tsx`'s
  `dispatchSatelliteData()` writes to a non-existent
  `assets.linked_liability_id` column on one side of the relationship.
  See `Domains/Properties.md`.
- **`Snapshot.tsx` writes `current_balance` to accounts**, a column that
  no longer exists (balance is now derived from `transactions`) — this
  write silently lands nowhere. See `Domains/Banking.md`.
- **`EntityGrid.tsx` renders an `owner` column for accounts** that has
  no backing column in the current normalized `accounts` schema
  (`owner_id` exists, but there's no direct `owner` text field it maps
  to without a join). See `Domains/Banking.md`.
- **`no_villa_equity` rule has zero enforcement code** — stored,
  editable, documented, never checked. See `06-Business-Rules-Engine.md`.
- **`income` table and `monthly_cash_flows` table are non-synced
  duplicates** of the same concept — `CashFlowPlanning.tsx` only ever
  touches the latter. Decide whether to unify or explicitly scope them
  as separate concerns. See `Domains/Income.md`.

## Phase 1 — Shipped Foundation (context, not a plan)

Already built: Banking (double-entry accounts), Loans, Credit Cards
(with the caveat above), Investments (with lot tracking), Properties,
Insurance (with sub-types), Goals, Income/Expenses, Budget Planning,
Financial Calendar, Simulations, Dashboard, Reports/Settings hub,
backup/restore, MMex import, Docker web-mode deployment.

## Phase 2 — Natural Extensions of Existing Domains (SHIPPED)

- Reconcile Credit Cards' two persistence paths (pick one, migrate the
  other) — see Phase 0, but framed as a feature-completion task rather
  than a pure bug fix once reward-engine data model is decided.
  **Done in Phase 0.**
- Per-holding XIRR display in Investments UI (`calculate_xirr()` already
  exists in `calculations.py`, currently dead code — just needs a caller
  and a UI surface). **Done** — wired into `/api/init`, `HoldingLotsEditor`,
  and a new `EntityGrid` column.
- Live NAV/stock price feed integration for Investments (would change
  `current_value` from user-entered to fetched — a real design decision
  about data trust, not just a wiring task). **Still deferred** — see
  Backlog below; needs a vendor/API-key decision the user hasn't made.
- Rental income cash-flow ledger for Properties (today it's a single
  flat `rental_income` field, not a transaction history). **Done** —
  `property_rental_ledger` table + `PropertyRentalLedgerEditor`, with an
  idempotent backfill from the old flat metadata and a derived-field
  shim so `CashFlowPlanning.tsx`/`EntityGrid.tsx` kept working unmodified.
- Insurance claims tracking / premium payment history log (today only a
  single `renewal_date`, no history). **Done** — `insurance_claims` +
  `insurance_premium_payments` tables (no backfill; no reconstructable
  per-event history existed behind the old lifetime counters), matching
  editor components.
- A genuine Reports/Analytics surface distinct from the Settings/Data-
  Management hub currently named "Reports" — see
  `13-Reporting-Architecture.md`. **Done** — `Reports.tsx` now holds only
  the ~150 lines of genuine export functionality; the rest moved to a new
  `Settings.tsx`, with the sidebar labeling each correctly.

All five items above shipped in one commit, `5476ef3`
("Implement Phase 2: per-holding XIRR, rental/claims history, Reports
split"). See `16-Session-Log.md` for narrative detail.

## Phase 3 — Larger New Domains (SHIPPED)

- **Taxation**: regime comparison, deductions, capital gains estimate.
  See `Domains/Taxation.md`.
- **Knowledge Base**: seeded read-only concept explainers with
  contextual hints. See `Domains/Knowledge.md`.
- **Documents**: attach files to any financial entity. See
  `Domains/Documents.md`.
- **Financial Profile** (Person/Family/Risk Profile as a first-class
  concept beyond the existing `people` table's owner/role fields): see
  `Domains/Financial-Profile.md`.
- **Credit Card product library / Compare Cards / Annual Review**: added
  to the Credit Cards domain, backed by a new `card_variants` reference
  table (not the dead `reward_programs` cluster — see
  `05-Database-Architecture.md`).

## Phase 4 — Platform-Level (SHIPPED)

- AI Assistant (explain/compare/summarize over existing calculated data
  — see `07-AI-Architecture.md` for the guardrails any implementation
  must respect). **Done** — opt-in, off by default with no
  `ARTHA_API_SECRET`/provider configured.
- Security hardening if the web/Docker deployment path is ever exposed
  beyond a trusted private network: authentication, encryption at rest.
  See `11-Security-Architecture.md`. **Done** — opt-in CORS allowlist +
  shared-secret auth (`ARTHA_API_SECRET`/`ARTHA_ALLOWED_ORIGINS`), no-op
  for desktop/Electron.
- Accessibility pass (zero `aria-*`/`role=` attributes today) and
  responsive layout, if a non-desktop-class use case is ever prioritized.
  See `09-UI-UX-Architecture.md`. **Done** — modals, nav, labels,
  focus/motion hardening pass.
- Cross-platform desktop packaging (Linux, macOS native binary) — see
  `Artha.md`'s long-term vision; today only Windows portable exe +
  Docker/web exist, with a set of Mac-only dev convenience scripts
  (`start.sh`/`stop.sh`) that bypass `npm start`'s Windows-only backend
  spawn path for local development only, not packaging. **Done** —
  macOS (dmg/zip, unsigned) and Linux (AppImage) added via
  electron-builder, plus a 3-OS CI matrix
  (`.github/workflows/build-and-publish.yml`). Mac/Linux CI legs are
  provisional until the first Actions run confirms them green (see
  `CLAUDE.md`).

## Phase 5 — Post-Roadmap Additions (not in the original menu above)

Work completed after Phases 0–4 closed out, driven by direct user
request rather than a pre-existing documented gap:

- **Configurable branding**: 3 selectable logo mark variants + accent
  color picker (`src/components/branding/`), plus a static build-time
  app icon/favicon derived from the Vault Mark concept.
- **Backend pytest suite**: first slice covering `calculations.py`'s
  pure functions, `init_db()` migration idempotency, and two
  `TestClient` API smoke tests (`backend/tests/`) — not yet
  comprehensive, not yet wired into CI.
- **Docker image CI pipeline** (`.github/workflows/docker-build.yml`):
  builds and pushes `backend`/`frontend` images to GHCR on push to
  `main` and `v*` tags. Separate from the desktop-packaging pipeline
  since it's a different artifact type; the Docker Compose deployment
  path itself (`backend/Dockerfile`, `frontend.Dockerfile`,
  `docker-compose.yml`) was already built and verified working in an
  earlier session — this pipeline just automates building/publishing
  those images.

- **Tax Planner** (2026-10, `backend/tax/`, `frontend/src/components/tax/`):
  versioned per-year rule sets with verification levels (Income-tax Act,
  2025 from FY 2026-27), a 14-step audited engine for both regimes, user-
  editable rule sets, saved scenarios, a Corporate NPS optimiser, payslip
  simulator, charts, month-by-month salary entry with TDS projection,
  break-even/sensitivity analysis, and CSV/PDF reports. See
  `Domains/Taxation.md`.
- **Repo restructure and tooling** (2026-10): npm workspaces
  (`frontend/`, `electron/`, `backend/`), dependency upgrade (React 19,
  Vite 8, TypeScript 7, Electron 44), a locked-down Electron renderer
  (preload bridge), and one cross-platform `artha` CLI for
  start/stop/restart/status/logs/build/package.

## Explicitly Not Planned

Per `00-Project-Constitution.md`'s Non-Scope: transaction-level
accounting/bookkeeping, reward-points optimization as a product
(distinct from the existing calculator UI), multi-tenant/advisor mode,
payroll processing.
