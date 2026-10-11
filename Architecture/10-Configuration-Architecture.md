# Configuration Architecture

Config model, metadata-driven forms, feature flags, versioning.

---

## Config Model

Two distinct configuration surfaces exist, and they're easy to conflate:

1. **`financial_rules` table** — user-editable financial policy
   thresholds (see `06-Business-Rules-Engine.md` for the full list).
   Read/write via `GET /api/metadata/financial_rules` and
   `PUT /api/rules`. Each row: `rule_key`, `rule_name`, `description`,
   `value`, `category`, `is_enabled`. Disabling a rule (`is_enabled = 0`)
   makes `decision_engine.py` fall back to its hardcoded default, not
   skip the check entirely.
2. **`~/.financeos/settings.json`** — application/environment
   configuration, not financial policy: `active_db_path`,
   `recent_databases` (capped at 5, most-recent-first),
   `backup_on_open`/`backup_on_close`/`backup_count_limit`/
   `custom_backup_dir`, `mirror_backup_dir` (second backup folder) and its
   `mirror_last_copied_at`/`mirror_last_error` status. Read/written by `backend/db.py`'s
   `load_settings()`/`save_settings()`, exposed via
   `/api/settings/database` and `/api/settings/backup`.

Don't confuse the two: a financial threshold belongs in
`financial_rules` (DB-backed, versioned with the user's data, portable
with the `.db` file); an environment/app-behavior setting belongs in
`settings.json` (machine-local, not portable, not part of the user's
financial data).

## Metadata-Driven Forms

`categories.fields_definition` (JSON array of `{name, type, label}`) is
what lets the frontend render category-specific form fields without a
frontend code change for every new category. `DynamicForm.tsx` resolves
a field set per category:
- **Base fields per `entityType`** (assets vs. liabilities vs. goals
  etc.) are still hardcoded per-type in `DynamicForm.tsx` — this part is
  not itself metadata-driven, only the *extra* fields on top are.
- Three categories (Credit Card, Insurance, Stock/Mutual Fund) opted out
  of `fields_definition` entirely in favor of a dedicated satellite
  table with reactive, category-specific field rendering (Insurance's
  `policy_type` selector swaps visible fields; see
  `Domains/Insurance.md`).
- Credit Cards additionally has an entirely separate, non-generic screen
  (`CreditCards.tsx`) that doesn't go through `DynamicForm` at all. It
  still persists through the same `credit_card_details` satellite route
  as the generic tab — see `Domains/Credit-Cards.md`.

`EntityGrid.tsx`'s column rendering follows the same pattern: common
columns per `entityType`, plus category-specific columns appended when
a single category tab is active (not shown in the "All Categories" mixed
view).

## Feature Flags

None exist. There is no feature-flag system, no environment-based
feature toggling beyond the two deployment paths themselves (desktop vs.
web/Docker), which differ only in process supervision and
`API_BASE_URL` resolution, not in enabled/disabled features.

## Versioning

- `package.json`'s `version` field (currently `1.0.4`) drives the
  portable exe's filename (`Artha 1.0.4.exe`) and is the only version
  identifier in the system.
- No API versioning (`/api/v1/...`) — see `08-Technology-Architecture.md`.
- No schema version table — schema evolution is tracked implicitly by
  `init_db()`'s migration guards (column-existence checks, table-rename
  patterns), not an explicit `schema_version` row. This means there's no
  single query to answer "what schema version is this database on" —
  you'd have to inspect which columns/tables exist to infer it, the same
  way the migrations themselves do.
