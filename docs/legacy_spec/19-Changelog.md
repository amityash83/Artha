# 19-Changelog - Project Changelog

## Purpose
This document logs every system modification, database migration, API change, and documentation update, tracking code adjustments and backward compatibility status.

## Scope
Tracks historical changes across all files.

## Definitions
*   **Breaking Change:** Modification that breaks compatibility with older database files or API structures.
*   **Minor Fix:** Adjustments that do not alter core schemas or rules.

## Design Decisions
*   **Version Control Correspondence:** Entries reference the corresponding git commit message where possible to maintain version trace clarity.

---

## Log Entries

### [2026-07-12] - v2.0.0 (Credit Cards Redesign & Seeding Safety)
*   **Summary:** Redesigned the Credit Card section to introduce dynamic presets, categories multipliers, step-up milestone simulations, and clean alphabetic sorting. Protected database custom values during restarts.
*   **Documents Updated:**
    *   `docs/README.md` to `docs/19-Changelog.md` [Established the specifications suite]
    *   `docs/walkthrough.md`
    *   `docs/task.md`
*   **Code Updated:**
    *   `backend/db.py` [Database migration Block E added; `init_db()` checks `is_new_db` before seeding]
    *   `backend/main.py` [API queries sort institutions; `/api/init` maps account category properties]
    *   `src/components/CreditCards.tsx` [Complete layout redesign and simulator integration]
    *   `src/components/EntityGrid.tsx` [Display category column in Accounts and update filter tabs]
    *   `src/components/Reports.tsx` [Sort settings list renders alphabetically]
    *   `src/components/DynamicForm.tsx` [Sort dropdown options alphabetically]
    *   `src/App.tsx` [Sort global fetch results]
*   **Breaking Changes:** None. Fully backward-compatible schema updates.

### [2026-07-11] - v1.0.0 (Core Personal Finance OS)
*   **Summary:** Launched core dashboard containing asset allocation, net worth tracker, cash flow loggers, and budget indicators.
*   **Code Updated:**
    *   `src/App.tsx`
    *   `backend/main.py`
    *   `backend/db.py`

---

## Examples
*   *Commit Reference:* Git commit `7290c39` maps to the `v2.0.0` entry.

## Future Enhancements
*   Automating changelog generation from git logs.

## Open Questions
*   Should we publish a public-facing version of the changelog for external users?
