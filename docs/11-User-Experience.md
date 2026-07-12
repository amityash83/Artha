# 11-User-Experience - User Experience Specifications

## Purpose
This document defines how users interact with the Financial Operating System (FOS) / Artha. It details user personas, financial goals, daily and monthly task journeys, navigation models, and interaction patterns.

## Scope
Covers the logical user experience (UX) layer of the interface before screen mockups or visual styling are applied.

## Definitions
*   **Persona:** A representative archetype of a target user used to guide design decisions.
*   **Information Architecture (IA):** The structural organization and grouping of features and data.

## Responsibilities
*   Ensure the interface is task-oriented and workflow-driven.
*   Protect user workflows from screen fragmentation.

## Relationships
*   Guides the layout of individual screens specified in screen specifications.
*   Directs how forms are grouped in the Form Engine.

---

## 1. User Personas

### Persona A: The Active Wealth Manager (Amit, 35)
*   **Role:** Primary owner of family accounts.
*   **Goals:** Maximize credit card reward miles, reduce home loan interest via prepayments, monitor equity asset drifts, track consolidated family net worth.
*   **Daily Tasks:** Check optimal credit card to use for dynamic merchant payments; reconcile transactions.
*   **Monthly Tasks:** Allocate incoming salary into envelope buckets; trigger investment buy orders; simulate prepayment impact on loans.

### Persona B: The Family Co-Owner (Spouse, 33)
*   **Role:** Joint account holder.
*   **Goals:** View joint savings balances, verify emergency fund levels, log discretionary expenses.
*   **Daily Tasks:** Log daily expense debits.
*   **Monthly Tasks:** Review family budget limits progress.

---

## 2. Information Architecture (IA)

```
Workspace (FOS console)
├── Operations Module
│   ├── Dashboard (Net worth overview, Alerts, Actions console)
│   ├── Accounts (Savings, Wallets, Demat containers)
│   └── Transactions Log (Ledger audits)
├── Optimization Module
│   ├── Credit Cards (Inventory, Lounge trackers, Rewards simulator)
│   └── Simulations Console (Prepayments, balance transfers)
└── Administration Module
    └── Settings (Allocation ratios, user profiles, configurations)
```

---

## 3. Navigation & Interaction Principles
*   **Search & Command Palette First:** Users can press `Ctrl + P` to summon a search console allowing them to execute tasks (e.g. "Add Transaction HDFC") instantly from any screen.
*   **Flat Screen Hierarchy:** Major screens are accessible within 1-click from the primary navigation bar.
*   **Optimistic UI Updates:** State updates (such as logging a transaction) render immediately on the interface while the SQLite database write completes in the background.

---

## Examples
*   *Salary Day Journey:*
    1.  Amit receives a salary notification.
    2.  He opens the Dashboard and logs the credit transaction.
    3.  The system displays the suggested bucket allocation splits.
    4.  He confirms the splits, which dynamically update savings and investment holding views.

## Future Enhancements
*   Adding voice-command interaction models for quick expense logging.

## Open Questions
*   Should joint spouse views support restricting visibility of specific personal accounts?

## References
*   *Human Interface Guidelines (HIG)*
*   *Information Architecture Best Practices*
