# 13-Bucket-Engine - Cash Buckets Specifications

## Purpose
This document details salary allocation rules, cash bucket distributions, emergency buffer maintenance guidelines, and automated goal-funding logic.

## Scope
Covers all reserve balances and envelope budgeting modules.

## Definitions
*   **Cash Bucket:** A virtual or physical sub-account partitioning savings for specific priorities.
*   **Funding Rule:** Formulas specifying how incoming income gets split into savings goals.

## Design Decisions
*   **Virtual Envelope Budgeting:** FOS implements envelope budgeting virtually across accounts. Account tags or metadata properties map specific ledger balances to categories (Emergency, Holiday, Taxes) without opening new bank accounts.

---

## Bucket Management Principles

### 1. The Emergency Bucket Buffer
*   Must hold: `6 * (Household Expenses + active EMIs + insurance premiums)`.
*   Drawdown constraint: Only unlockable for job loss or medical emergencies.

### 2. Priority-Based Goal Funding
*   Incoming income allocation priority:
    1.  Fixed monthly expenses & EMIs (essential buckets).
    2.  Emergency buffer replenishment (if below target).
    3.  SIPs & investments mapped to high-priority goals (e.g. child education, retirement).
    4.  Low-priority goal buckets (travel, discretionary).

---

## Examples
*   *Salary Allocation:* For a ₹1,00,000 monthly income, the system reserves ₹50,000 for essentials, maps ₹20,000 to investment buckets, and directs the remaining ₹30,000 to wants.

## Future Enhancements
*   Adding automated triggers that flag when an emergency buffer falls below target due to increased loan EMIs.
*   Multi-goal optimization modeling utilizing linear programming to maximize yield across buckets.

## Open Questions
*   Should surplus savings at the end of a monthly cycle be swept into the emergency buffer automatically or pushed into mutual fund SIPs?
