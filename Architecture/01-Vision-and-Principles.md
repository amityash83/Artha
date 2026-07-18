# Vision & Principles

Purpose, design philosophy, offline-first approach, MMEx as system of
record, modularity, configuration over hardcoding.

---

## Purpose

Artha exists to turn raw financial records — balances, loans, policies,
holdings — into decisions. It is the "Financial Intelligence Layer"
sitting on top of a user's data, not the ledger itself. See `Artha.md`
for the full product narrative; this document distills what actually
drives day-to-day engineering decisions.

## Design Philosophy

- **MMEx (or equivalent) is the system of record. Artha is the system of
  intelligence.** Artha never claims to be a transaction-level
  accounting tool. It consumes snapshots/CSV imports and current
  balances, and answers "what does this mean" and "what should I do,"
  not "log every rupee spent."
- **Offline-first.** A single portable SQLite file (`finance.db`) is the
  entire application state. No mandatory network call exists anywhere in
  `backend/main.py` for core functionality.
- **Modularity via categories, not code duplication.** New financial
  instrument types are added by inserting a `categories` row + a
  `fields_definition` JSON schema, not by writing a new table, a new
  React component, or a new set of CRUD routes. The generic
  `EntityGrid`/`DynamicForm` components and the `/api/entities/{type}`
  router are what make this possible — see `05-Database-Architecture.md`
  and `09-UI-UX-Architecture.md`.
- **Configuration over hardcoding — deliberately partial.** Thresholds a
  user plausibly wants to tune (emergency fund target, high-interest ROI
  cutoff, insurance renewal window, target savings rate) live in the
  `financial_rules` table. Thresholds that are structural/mathematical
  (monthly compounding convention, prepayment simulation's 360-month cap)
  stay hardcoded in `calculations.py`. `hardcoded_vs_dynamic.md` is the
  single authoritative list — don't assume either way without checking
  it.
- **Low maintenance.** The product target is under ~15 minutes of manual
  data entry a month (updating balances, logging a monthly snapshot).
  Every new feature should be evaluated against whether it adds to that
  burden.

## Offline-First Approach

The FastAPI backend, SQLite database, and Electron shell all run
entirely on the user's machine. `electron/main.js` spawns the backend as
a local subprocess; there is no cloud API, no external auth, no sync
service. The only network-adjacent code is:
- CORS wide open (`allow_origins=["*"]`) because everything is
  loopback/localhost traffic anyway (Electron dev mode, or a Docker
  web-mode deployment on a private/local network).
- MMex CSV import (`/api/import/mmex`), which is a local file upload, not
  a network call to MMex itself.

## Modularity

Modularity in Artha means: a new asset/liability/income/expense kind
should be addable without touching the schema, without a new frontend
component, and ideally without touching `backend/main.py` at all — just
a new `categories` seed row. This has a real limit: when a category's
fields genuinely don't fit the shared table shape (Credit Cards,
Insurance sub-types, Stock/Mutual Fund lots), a small dedicated satellite
table is the escape hatch — but that's the exception, not the default
path for "add a new financial thing."

## Configuration Over Hardcoding

See `10-Configuration-Architecture.md` for the full picture. In short:
`financial_rules` is a flat key/value table (`rule_key`, `value`,
`is_enabled`, `category`) read by `decision_engine.py` and some
`calculations.py` call sites, with a hardcoded Python fallback if a rule
row is missing or disabled — so the app never breaks from an empty or
corrupted `financial_rules` table.
