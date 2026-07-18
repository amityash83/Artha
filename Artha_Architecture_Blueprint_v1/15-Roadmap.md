# Product Roadmap

Phase-wise implementation plan.

---

> This consolidates the "Future Enhancements"/gap items surfaced across
> every `Domains/*.md` and top-level doc into one place. It is a
> synthesis of documented gaps, not a commitment or a prioritization
> decision — treat it as a menu, not a plan someone has signed off on.

## Phase 0 — Fix Before Building New Things

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

## Phase 2 — Natural Extensions of Existing Domains

- Reconcile Credit Cards' two persistence paths (pick one, migrate the
  other) — see Phase 0, but framed as a feature-completion task rather
  than a pure bug fix once reward-engine data model is decided.
- Per-holding XIRR display in Investments UI (`calculate_xirr()` already
  exists in `calculations.py`, currently dead code — just needs a caller
  and a UI surface).
- Live NAV/stock price feed integration for Investments (would change
  `current_value` from user-entered to fetched — a real design decision
  about data trust, not just a wiring task).
- Rental income cash-flow ledger for Properties (today it's a single
  flat `rental_income` field, not a transaction history).
- Insurance claims tracking / premium payment history log (today only a
  single `renewal_date`, no history).
- A genuine Reports/Analytics surface distinct from the Settings/Data-
  Management hub currently named "Reports" — see
  `13-Reporting-Architecture.md`.

## Phase 3 — Larger New Domains (genuinely unbuilt, per `Domains/`)

- **Taxation**: no schema, no code. See `Domains/Taxation.md`.
- **Knowledge Base**: no schema, no code. See `Domains/Knowledge.md`.
- **Documents**: no schema, no code — Artha.md suggests external file
  storage with SQLite references. See `Domains/Documents.md`.
- **Financial Profile** (Person/Family/Risk Profile as a first-class
  concept beyond the existing `people` table's owner/role fields): see
  `Domains/Financial-Profile.md`.
- **Credit Card product library / Compare Cards / Annual Review**: named
  screens in the legacy `architecture/` doc, never implemented. Would
  need real reference data (`card_variants` or similar), not the
  currently-dead `reward_programs` schema cluster (see
  `05-Database-Architecture.md`).

## Phase 4 — Platform-Level

- AI Assistant (explain/compare/summarize over existing calculated data
  — see `07-AI-Architecture.md` for the guardrails any implementation
  must respect).
- Security hardening if the web/Docker deployment path is ever exposed
  beyond a trusted private network: authentication, encryption at rest.
  See `11-Security-Architecture.md`.
- Accessibility pass (zero `aria-*`/`role=` attributes today) and
  responsive layout, if a non-desktop-class use case is ever prioritized.
  See `09-UI-UX-Architecture.md`.
- Cross-platform desktop packaging (Linux, macOS native binary) — see
  `Artha.md`'s long-term vision; today only Windows portable exe +
  Docker/web exist, with a set of Mac-only dev convenience scripts
  (`start.sh`/`stop.sh`) that bypass `npm start`'s Windows-only backend
  spawn path for local development only, not packaging.

## Explicitly Not Planned

Per `00-Project-Constitution.md`'s Non-Scope: transaction-level
accounting/bookkeeping, reward-points optimization as a product
(distinct from the existing calculator UI), multi-tenant/advisor mode,
payroll processing.
