# 17-Decision-Log - Architectural Decisions

## Purpose
This document logs every key architectural design decision, listing contexts, alternatives considered, reasons for choice, and system impacts.

## Scope
Covers all system design choices.

## Definitions
*   **Decision Status:** Active, Superseded, Proposed.
*   **Metadata-Driven Schema:** Dynamically adding attributes without executing SQL `ALTER TABLE`.

## Design Decisions
*   **Never Delete Entries:** Once recorded, decisions are preserved indefinitely to maintain design history. If a decision is changed, it is marked as `Superseded` with a link to the new decision entry.

---

## Architectural Decision Entries

### 1. SQLite Database metadata_json Schema Strategy (2026-07-11)
*   **Decision:** Active.
*   **Context:** Financial products (e.g. Credit Cards, Real Estate, Term Insurance) have highly distinct properties. Creating separate tables or columns for all banks leads to database schema bloating.
*   **Alternatives:** EAV (Entity-Attribute-Value) pattern, separate tables for each product type.
*   **Reason:** SQLite text columns containing JSON strings are incredibly flexible, fast, and fully backward compatible.
*   **Impact:** Simplifies the database schema to core categories, accounts, assets, liabilities, and transactions, delegating custom fields parsing to the frontend.

### 2. In-place Frontend Sorting of Dropdown Options (2026-07-12)
*   **Decision:** Active.
*   **Context:** Sorting lists on the backend SQLite layer sometimes returns unaligned indices or fails to load properly on hot reload.
*   **Alternatives:** Relying strictly on backend SQL sorting.
*   **Reason:** Performing `.sort()` inside the render map loops in React guarantees alphabetical sorting instantly under all circumstances.
*   **Impact:** Increases UI reliability and robustness.

### 3. Safe Database Seeding Constraint (2026-07-12)
*   **Decision:** Active.
*   **Context:** Seeding default institutions on every restart duplicates entries if users have renamed or customized those institutions.
*   **Alternatives:** Checking table counts before seeding.
*   **Reason:** Checking `is_new_db` on startup ensures default seeding executes **only once** on database creation.
*   **Impact:** Completely protects user modifications and deletions.

---

## Examples
*   *Referencing Log:* Linking a card preset feature to the Metadata JSON Decision Entry.

## Future Enhancements
*   Adding automated script checks validating that database schemas align with active decisions.

## Open Questions
*   Should we document minor UI class changes in the decision log, or restrict it to database/API architectural decisions?
