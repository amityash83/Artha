# Reporting Architecture

Report engine, exports, templates, scheduled reports.

---

## No Dedicated Reporting Engine

There is no report-generation engine, no template system, and no
scheduled/automated report delivery (no email, no export-on-schedule).
What exists is a set of independent, per-feature export buttons, not a
unified reporting subsystem. See `Domains/Reports.md` for the important
naming caveat: the component called `Reports.tsx` is actually a
Settings & Data Management hub (backups, rules editing, categories/
institutions metadata, MMex import) — this document is about the
narrower, genuine reporting/export capability that exists across the
app, which is smaller than the name "Reports" implies.

## What's Actually Exportable Today

- **EMI Amortization Schedule → Excel**: `POST
  /api/calculations/advanced-emi/export/excel`, built with `openpyxl` —
  a real, fully-formatted report (title block, loan parameters, styled
  header row, per-month schedule rows, auto-sized columns, currency
  formatting). This is the most complete "report" in the product.
- **CSV exports** inside `Reports.tsx`'s Data tab (per the domain agents'
  findings): `exportInvestmentsCSV()`, `exportInsuranceCSV()`, and
  similar per-category export functions. At least one of these
  (`exportInsuranceCSV()`) has been confirmed to reference stale field
  names (`coverage`, `nominee`) that predate the `insurance_details`
  satellite-table redesign — meaning those specific columns will export
  blank for any policy created or edited after that redesign. This is a
  real, live bug, not a hypothetical — see `Domains/Insurance.md`.
- **Database backup files** (`/api/backup/*`) are a form of "export" in
  the broadest sense (a full data snapshot), but they're SQLite file
  copies, not human-readable reports — see `11-Security-Architecture.md`.

## What's Not a Report, Despite Looking Like One

`Dashboard.tsx`'s net worth trend and asset allocation charts, and
`Simulations.tsx`/`LoanOptimizer.tsx`'s projection curves, are
interactive on-screen visualizations, not exportable reports — there is
no "export this chart as PDF/image" or "email me this dashboard"
capability anywhere.

## Templates

None exist. Every export function is bespoke code (openpyxl cell-by-cell
formatting, or ad hoc CSV string building) — there's no shared
report-template abstraction that a new export would reuse. Adding a new
export means writing new formatting code, not filling in a template.

## Scheduled Reports

None exist. No cron-like mechanism, no "email me a monthly summary"
feature. The closest analogue is the monthly `snapshots` log (see
`Domains/Calendar.md` and `05-Database-Architecture.md`) and the manual
auto-backup-on-open/close behavior — neither is a report in the sense of
a formatted, deliverable document.

## If a Real Reporting Engine Were Built

Given the pattern established by the EMI Excel export (the most mature
export today), a genuine reporting engine would likely: (1) define a
shared template/format abstraction so new reports don't each hand-roll
openpyxl cell styling, (2) fix the known-stale CSV export field-name
bugs first (Insurance, and audit the others for the same issue since
they weren't all individually re-verified against the satellite-table
redesign), and (3) decide whether `Reports.tsx`/`Domains/Reports.md`
should be split into a genuine "Reports & Exports" surface separate from
the Settings/Data-Management functionality it currently also owns — see
`Domains/Reports.md`'s naming-mismatch note.
