# memory - Persistent Project Memory & Context

## Purpose
This document serves as the long-term context memory for AI assistants working on Artha. It tracks codebase rules, lessons learned from developer sessions, user preferences, and implementation gotchas to ensure seamless switching between AI sessions.

## Scope
Covers developer preferences, local database pathings, React-state sync patterns, and database seeding constraints.

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
*   **Reason:** relying strictly on backend database sorting (`ORDER BY name ASC`) is vulnerable to hot-reload lags or cached React states, which can leave dropdowns unsorted on the client. Sorting in-place on the frontend guarantees correct alphabetic order.

### 3. Metadata Serialization
*   **Rule:** Do not add custom columns directly to SQLite tables for every financial product variance.
*   **Reason:** Schema complexity is kept to a minimum. All dynamic variables (e.g. credit card rewards multipliers, statement closing dates, investment NAV units) are stored inside the `metadata_json` text column and deserialized by the client.

### 4. Dynamic Form Generation
*   **Rule:** Let the `DynamicForm.tsx` and `EntityGrid.tsx` automatically generate input forms based on the category's `fields_definition` schema list. This eliminates the need to write ad-hoc forms.

---

## Examples
*   *Seeding Guard:* `if is_new_db: seed_defaults()` prevents re-adding bank defaults when restarting the FastAPI uvicorn daemon.

## Future Enhancements
*   Adding automated lint rules to verify that new code aligns with active memory guidelines.

## Open Questions
*   Should the AI memory file be updated automatically after every git commit, or updated manually at major milestone gates?
