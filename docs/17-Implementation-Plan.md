# 17-Implementation-Plan - Codebase Transition Plan

## Purpose
This document specifies the technical implementation phases required to migrate the current FOS / Artha codebase (FastAPI, React, and SQLite) to the normalized, technology-independent architecture defined in the specification suite.

## Scope
Covers database migration queries, backend API changes, frontend state calculations, and dynamic form engine implementation.

## Definitions
*   **Schema Migration:** SQL statements executed to alter database structures without data loss.
*   **State Refactoring:** Rearranging client-side state hooks to calculate values on the fly rather than reading static properties.

---

## Migration Phases

### Phase 1: Database Restructuring
1.  **Add New Tables:** Create schemas in `backend/db.py` for `people`, `relationships`, `portfolio_holdings`, `goal_holdings`, `reward_programs`, `reward_rules`, `reward_partners`, `reward_ledger`, and `reward_redemptions`.
2.  **Migrate Accounts Table:**
    *   Execute schema updates to remove the static `current_balance` column.
    *   Add foreign keys referencing `people(id)`.
3.  **Migrate Transactions Table:** Refactor columns to track `source_ref_id`, `source_ref_type`, `dest_ref_id`, and `dest_ref_type`.
4.  **Preserve Data Integrity:** Write migration scripts mapping old account balances to initial credit transactions to ensure zero data loss.

### Phase 2: Backend API Refactoring
1.  **Update Models:** Adjust Pydantic validation models in `backend/main.py` to match the new fields constraints.
2.  **Refactor `/api/init`:** Rewrite the aggregate loader to run derived calculations (calculating account balances by summing transactions history).
3.  **Implement Double-Entry validations:** Update the transactions creation handler to verify that both source and destination references are active before logging entries.

### Phase 3: Frontend State & Calculation Refactoring
1.  **Replace Balance Fields:** Remove all references to static account balances in React panels and replace them with helper functions calculating aggregates from the transactions ledger.
2.  **Integrate Portfolios & Goals Junctions:** Update reports pages to run queries mapping holdings to portfolios and goals via the junction endpoints.

### Phase 4: UI Design System & Form Engine Integration
1.  **Mount Form Engine:** Create a React renderer mapping Category definition schemas to dynamic text, numeric, and conditional controls.
2.  **Integrate Credit Card Hub:** Replace card tabs with functional workspace panels (Inventory, Milestones, and Rewards Simulator).

---

## Examples
*   *Derived balance code shift:*
    ```typescript
    // Old:
    const balance = account.current_balance;
    // New:
    const balance = transactions
      .filter(t => t.account_id === account.id)
      .reduce((sum, t) => sum + (t.type === 'Credit' ? t.amount : -t.amount), 0);
    ```

## Verification & Testing
*   Verify migrations using a test database.
*   Run unit tests validating interest amortization and rewards multiplier calculations.

## Open Questions
*   Should the migration run automatically on application startup, or prompt the user for confirmation before altering tables?

## References
*   *SQLite Migration Guides*
*   *Pydantic Schema Definitions*
