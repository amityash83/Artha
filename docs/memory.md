# memory - Persistent Project Memory & Context

## Purpose
This document serves as the long-term context memory for AI assistants working on Artha. It tracks codebase rules, lessons learned from developer sessions, user preferences, and implementation gotchas to ensure seamless switching between AI sessions.

## Scope
Covers developer preferences, local database pathings, React-state sync patterns, database seeding constraints, and normalized enterprise architecture rules.

## Definitions
*   **Persistent Memory:** Design behaviors and learnings that must be preserved to prevent regressions across sessions.

---

## Active Session Memory & Core Lessons

### 1. Database Seeding Safety
*   **Rule:** **NEVER** seed default data (like financial institutions or categories) blindly on every server startup, even with `INSERT OR IGNORE`.
*   **Reason:** If the user renames or deletes a seeded institution (e.g. renames `HDFC` to `HDFC Bank` or deletes it), blind seeding will re-inject the raw defaults, creating duplicate entries.
*   **Solution:** Track `is_new_db = not os.path.exists(db_path)` before opening the SQLite connection and seed default tables **only once** on database creation.

### 2. Alphabetic Sorting Rule
*   **Rule:** **ALWAYS** perform sorting in-place in the React component rendering loops (e.g., using `[...list].sort(...)` right before `.map()`).
*   **Reason:** Relying strictly on backend database sorting (`ORDER BY name ASC`) is vulnerable to hot-reload lags or cached React states, which can leave dropdowns unsorted on the client. Sorting in-place on the frontend guarantees correct alphabetic order.

### 3. Metadata Serialization
*   **Rule:** Do not add custom columns directly to SQLite tables for every financial product variance.
*   **Reason:** Schema complexity is kept to a minimum. All dynamic variables (e.g. credit card rewards multipliers, statement closing dates, investment NAV units) are stored inside the `metadata_json` text column and deserialized by the client.

### 4. Dynamic Form Generation
*   **Rule:** Let the `DynamicForm.tsx` and `EntityGrid.tsx` automatically generate input forms based on the category's `fields_definition` schema list. This eliminates the need to write ad-hoc forms.

### 5. Derived Balance & Goal Progress Architecture
*   **Rule:** **NEVER** store account balances or goal completion progress in static database columns (like `current_balance` or `current_amount`).
*   **Reason:** Storing duplicate computed states risks database drifts when transaction histories are modified, updated, or imported.
*   **Solution:** Compute them dynamically inside the database/API layer. Accounts current balance is derived as the sum of deposits minus withdrawals, and goal progress is calculated by joining the `goal_holdings` weight mapping table with the `assets` table.

### 6. Double-Entry Transaction Mapping
*   **Rule:** Transactions must map through separate `source_ref_type`/`source_ref_id` and `dest_ref_type`/`dest_ref_id` columns rather than a single `account_id` column.
*   **Reason:** Supports multi-leg transfers and accurate debit/credit flow tracking across accounts, assets, and external sources.

### 7. Automatic Goal Holdings Syncing
*   **Rule:** When assets are added, modified, or deleted in the API, the backend must intercept the `goal_mapping` value and update the relational many-to-many `goal_holdings` junction table automatically in the same transaction block.
*   **Reason:** Keeps the normalized junction table perfectly synced in response to standard CRUD actions from the dynamic user interface.

### 8. Windows & PowerShell Scripting Gotchas
*   **Read-Only Constant Conflict:** `$PID` (and `$pid` case-insensitive) is a reserved, read-only constant variable in PowerShell that holds the shell's Process ID. Never use `$pId` or `$pid` as loop iterators or local variable names.
*   **NPM Command Resolution:** On Windows, `npm` is a batch script (`npm.cmd`) rather than a direct executable. When spawning processes, specify `npm.cmd` as the file path.
*   **Socket Bindings Cleanup:** Always free up ports `8000` (FastAPI) and `5173` (Vite) before starting development daemons to prevent `Errno 10048` socket bind errors.

---

## Future Enhancements
*   Adding automated lint rules to verify that new code aligns with active memory guidelines.

