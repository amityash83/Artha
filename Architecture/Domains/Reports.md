# Reports Domain

## Purpose

**Naming note up front**: despite the name, the `Reports.tsx` component and its backing routes are primarily a **Settings & Data Management hub**, not a reporting/analytics feature. Its four sub-tabs are Database (switch/backup/restore), Rules (financial_rules editing), Categories (categories/institutions metadata CRUD), and Data (MMex import + a handful of CSV export buttons). Only the last sub-tab's export buttons, plus the separate EMI Excel export endpoint, are "reports" in the ordinary sense. This document describes what the code actually does under the `Reports` domain name rather than forcing a narrower "reporting" framing that doesn't match the implementation — see Future Enhancements for a naming-fix suggestion.

## Scope

- Database lifecycle management: view active DB path, switch to a different SQLite file (native file dialog via Electron IPC), create/restore/list backups, configure auto-backup-on-open/close and backup retention count.
- `financial_rules` editing — view/edit the value and enabled/disabled state of every rule row (the same rules consumed by `decision_engine.py` and referenced throughout hardcoded_vs_dynamic.md).
- `categories` and `institutions` metadata CRUD — add/edit/delete entity categories (with custom `fields_definition` JSON schema editing) and institutions.
- MMex CSV import (delegates to the same `/api/import/mmex` endpoint documented under Banking).
- A small CSV export center: Accounts, Loans, Investments, Insurance (client-side CSV generation from already-loaded data) plus a "Markdown Planning Report" download.
- The one genuine backend-generated report/export in the whole system: `/api/calculations/advanced-emi/export/excel`, a formatted `.xlsx` amortization schedule built with `openpyxl`, reachable from the EMI Calculator, not from Reports.tsx itself.

## Out of Scope

- No PDF export/generation anywhere in the app.
- No scheduled or emailed reports (no cron-like job, no SMTP integration).
- No cross-domain analytics/BI report builder (no custom report designer, no drill-down report views) — the "reports" that exist are fixed-format CSV dumps or the one Excel EMI schedule.
- No audit log / data-change history report (who changed what, when) beyond the raw backup files themselves.
- No consolidated "net worth statement" or "financial summary" PDF/print view for sharing with a third party (e.g. a bank loan officer or financial advisor).

## Business Objectives

- Give the user full control over their own data file — consistent with Artha's "privacy-first, local SQLite, no mandatory cloud" principle: the database is a portable file the user can back up, switch, and restore without any vendor involvement.
- Let the user tune the recommendation engine's thresholds (financial_rules) without a code change, matching the "DB-configurable with hardcoded fallbacks" philosophy in CLAUDE.md/hardcoded_vs_dynamic.md.
- Provide an escape hatch to get data out of Artha in portable formats (CSV/Excel) rather than locking it inside the SQLite file, honoring the "Zero Vendor Lock-in" design principle from Artha.md.
- Ease onboarding from MMex (the "system of record" Artha sits on top of, per Artha.md's philosophy diagram) via CSV import.

## Data Model

This domain has no single dedicated table of its own — it's a UI/operations layer over tables and files owned by other domains:
- `financial_rules` (owned conceptually by the recommendation engine, edited here).
- `categories`, `institutions` (shared metadata tables referenced by assets/liabilities/income/expenses/accounts).
- The SQLite database file itself, plus a `backups/` directory of timestamped copies, plus `~/.financeos/settings.json` (active_db_path, recent_databases, backup preferences) — these are files/settings, not schema.
- No table stores "generated reports" — every export in this domain is generated on demand (client-side CSV from in-memory data, or server-side Excel/streaming response) and not persisted anywhere.

## Database Schema

No dedicated schema for "Reports" as a concept. The routes in this domain read/write:
- `financial_rules` (id, rule_key, rule_name, description, value, category, is_enabled) — see Goals/Income/Banking docs for specific rule_key values this table holds.
- `categories` (id, entity_type, name, fields_definition, monthly_budget) and `institutions` (id, name, type) — full CRUD from this domain's Categories tab.
- Settings persisted outside SQLite entirely, in `~/.financeos/settings.json` (active_db_path, recent_databases list, backup-on-open/close flags, backup count limit, custom backup directory).

## Business Rules

- Auto-backup triggers: `auto_run_backup(trigger="open"|"close")` — whether it actually runs is gated by the user-configurable `backupOnOpen`/`backupOnClose` settings (stored in settings.json, not `financial_rules`), and old backups beyond `backupCountLimit` (default 10 in the UI) are pruned.
- Database switching (`switch_database()` in db.py) always re-runs `init_db()` against the newly selected file — meaning every schema migration and default-category/default-rule seeding logic re-applies to whatever file the user points at, per CLAUDE.md's "Database path resolution" section.
- Rules editing has no validation beyond type coercion (`RuleSchema`: rule_key, value: float, is_enabled: bool) — there's no guard against setting a nonsensical value (e.g. a negative emergency fund target) from this UI.
- Category deletion (`DELETE /api/metadata/categories/{id}`) has no referential-integrity guard against orphaning `assets`/`liabilities`/etc. rows that still reference the deleted `category_id` — this is a real gap, not a documented business rule, worth flagging.

## Configuration

- Everything on the Rules tab is, by definition, the DB-configurable half of the hardcoded-vs-dynamic split described in `hardcoded_vs_dynamic.md` — every rule editable here has a corresponding hardcoded fallback in `decision_engine.py`/`calculations.py` used if the rule is absent or disabled.
- Backup behavior (on-open/on-close/count-limit/custom directory) is configurable via `/api/settings/backup`, persisted to `~/.financeos/settings.json`, not to SQLite.
- Database path itself is configurable via `/api/settings/database` (GET current, POST to switch) — see CLAUDE.md's database path resolution order (settings.json → `FINANCE_DB_DIR` env var → dev fallback).
- Hardcoded: the backend port (127.0.0.1:8000) that every fetch call in Reports.tsx targets; the CSV column layout/order for each export button; the MMex CSV column-matching heuristics (`'name' in c.lower()`, `'balance' in c.lower()`, etc.) in `/api/import/mmex`.

## UI Structure

- `frontend/src/components/Reports.tsx` (1355 lines) — four sub-tabs via `activeSubTab` state:
  - **Database**: shows current DB path/recent databases, "Switch Database" (Electron file dialog), backup-on-open/close toggles, backup count limit, custom backup directory, manual "Create Backup Now", and a list of existing backups with per-backup restore.
  - **Rules**: lists all `financial_rules` grouped by `category`, with inline value/enabled editing posting to `/api/rules`.
  - **Categories**: full CRUD over `categories` (including a custom-fields-definition builder UI) and `institutions`.
  - **Data**: MMex CSV import control, plus the CSV/Markdown export buttons (Accounts, Loans, Investments, Insurance, and a Markdown planning report).
- `frontend/src/components/Dashboard.tsx` — separate from Reports.tsx entirely; this is the actual analytics/reporting-flavored view in the app: net worth trend line chart and asset-allocation doughnut chart, both rendered with `react-chartjs-2`/Chart.js, fed by `GET /api/snapshots` (the historical `snapshots` table) and the live `/api/init` summary. If a genuine "Reports/Analytics" surface exists in this codebase today, it is Dashboard.tsx, not Reports.tsx.
- `frontend/src/components/EmiCalculator.tsx` (inferred from the export route's usage) is the origin of the Excel EMI export button, not Reports.tsx.

## API Contracts

- `GET/POST /api/rules` — list not exposed separately from `/api/metadata/financial_rules`; `PUT /api/rules` (body: `RuleSchema` — rule_key, value, is_enabled) updates one rule row by key.
- `GET/POST/PUT/DELETE /api/metadata/{meta_type}` and `/{meta_type}/{id}` — `meta_type` restricted to `categories`, `institutions`, `financial_rules` (GET/POST/DELETE); PUT restricted to `categories`, `institutions` only (rules are updated exclusively via the dedicated `/api/rules` route, not `/api/metadata/financial_rules/{id}`).
- `GET /api/settings/database`, `POST /api/settings/database` (body: `DatabaseSwitchRequest`) — read/switch active DB path.
- `POST /api/settings/backup` (body: `BackupSettingsRequest`) — persist backup preferences.
- `POST /api/backup/create`, `POST /api/backup/restore` (form: `backup_name`), `GET /api/backup/list` — manual backup lifecycle.
- `POST /api/import/mmex` (multipart file) — shared with Banking domain; documented fully there.
- `POST /api/calculations/advanced-emi/export/excel` (body: `AdvancedEmiRequest` — loan_amount, roi, tenure_months, start_date, prepayments) — the one genuine server-generated report: builds a styled `.xlsx` (openpyxl Workbook, custom fonts/fills/borders, ₹ number formatting) with a parameters header block and a full month-by-month amortization schedule (beginning balance, EMI, interest, principal, prepayments, ending balance), streamed back as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## AI Responsibilities

None exist yet. There is no AI/LLM integration in database management, rules editing, category management, or any export/import flow in this domain today.

## Reports

To avoid the obvious self-reference: this section describes what Reports.tsx and its backend routes actually let a user export or back up, not a recursive pointer back to this document.
- **Genuinely exportable/reportable today**: the EMI amortization Excel export (`/api/calculations/advanced-emi/export/excel`, full month-by-month schedule with formatting); client-side CSV downloads for Accounts, Loans, Investments, and Insurance (generated in the browser from already-fetched `/api/init` data, not a backend report endpoint); a "Markdown Planning Report" download (also client-generated); full database backup files (`.db` copies via `/api/backup/create`), which are a data-portability mechanism more than a "report" but serve a similar purpose (getting a complete, inspectable copy of your data out of the app).
- **Not exportable today**: Goals, Income, monthly_cash_flows, transactions ledger, and the Financial Calendar have no dedicated export button anywhere in this domain (see their respective domain docs' own Reports sections).

## Future Enhancements

NOT YET BUILT — reasonable next steps:
- Rename this domain/component to something like "Settings & Data Management" (or split it: a genuine "Reports/Export Center" separate from "Database & Rules Settings") so the name matches what it does — today "Reports" undersells the settings/backup/rules functionality and oversells the export functionality.
- A consolidated, printable/PDF "net worth statement" report suitable for sharing with a lender or advisor.
- Extend the CSV/Excel export center to cover Goals, Income, monthly_cash_flows, and the Transactions Ledger — today those domains have no export path at all.
- Scheduled/automatic report generation (e.g. a monthly PDF snapshot emailed or saved automatically alongside the existing auto-backup mechanism).
- Add referential-integrity checks (or at least a warning) when deleting a `category` that's still referenced by existing `assets`/`liabilities`/`income`/`expenses` rows.
