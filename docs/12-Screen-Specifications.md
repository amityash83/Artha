# 12-Screen-Specifications - Screen Specifications

## Purpose
This document specifies the purpose, responsibilities, data displays, filters, actions, and permissions for every screen in the Financial Operating System (FOS) / Artha.

## Scope
Covers all console views, screens, modal dialogs, and workspace pages.

## Definitions
*   **Key Performance Indicator (KPI):** High-level summary metrics displayed at the top of a screen view.
*   **View Filter:** Client-side parameter narrowing down active lists (e.g. filtering holdings by owner).

## Responsibilities
*   Document what data is visible on every screen.
*   Detail the operational actions users can trigger from each view.

## Relationships
*   Implements the Information Architecture mapped in the User Experience document.
*   Translates API payloads defined in API specs into visual indicators.

---

## Screen Specifications

### 1. Dashboard View
*   **Purpose:** Provide an immediate overview of family financial health.
*   **KPIs:** Net Worth, Liquid Capital, Liability Outstanding, Active Alerts.
*   **Data Displays:**
    *   *Balance Sheet:* Consolidated assets value vs. liabilities outstanding.
    *   *Cash Flow logs:* Year-to-date monthly income vs expenditures.
    *   *Alert Panel:* Critical notifications (e.g. card bill due dates, underfunded emergency buffers).
*   **User Actions:**
    *   Trigger manual transaction logging modal.
    *   Dismiss/reconcile active alerts.
*   **Filters:** None (global aggregate view).
*   **Permissions:** Viewable by both Primary Owner and Spouse.

### 2. Accounts Hub
*   **Purpose:** Manage savings and deposit containers.
*   **KPIs:** Combined Savings Balance, Count of Active Accounts.
*   **Data Displays:** Table list showing Account name, Institution provider, Owner tag, Currency, Status, and derived balance.
*   **User Actions:**
    *   Register new Account (triggers dynamic Form Engine).
    *   Edit Account settings.
    *   Archive/Close Account.
*   **Filters:** Group list by Owner, Status (Active/Closed), or Institution.
*   **Permissions:** Primary Owner can write; Spouse has read-only access for personal safety accounts.

### 3. Credit Card Hub
*   **Purpose:** Track credit cards, milestone goals, and reward accruals.
*   **KPIs:** Combined Credit Limit, Total Outstanding, Next Payment Due Date.
*   **Data Displays:**
    *   *Cards List:* Visual representations of registered cards alongside statement balances, payment due dates, and fee structures.
    *   *Rewards Ledger:* Detailed history of points accrued per card.
    *   *Redemption Log:* Past points transfers and cashback events.
    *   *Spend Simulator:* Inputs for Merchant Category and Amount.
*   **User Actions:**
    *   Log transaction (adds to outstanding balance and triggers rewards ledger accrual).
    *   Configure milestone goals and lounge quotas.
    *   Execute rewards simulator calculations.
*   **Filters:** Filter cards by Issuer Bank or Owner.
*   **Permissions:** Shared access.

### 4. Simulations Console
*   **Purpose:** Run 'what-if' loan prepayments and balance transfer projections.
*   **KPIs:** Current Loan Rate, Months Saved, Total Interest Savings.
*   **Data Displays:**
    *   *Loan Details:* Outstanding principal, rate, remaining EMIs.
    *   *Simulations Table:* Month-by-month projection of interest paid and tenure reductions.
*   **User Actions:**
    *   Add virtual prepayments.
    *   Compare Reduce EMI vs. Reduce Tenure strategies.
*   **Filters:** Toggle between active loans.

---

## Examples
*   *Dashboard Alert:* The alert panel displays: `[Warning] Emergency buffer is at ₹1,50,000 (Target: ₹3,00,000)`. It features a direct link to the Accounts page to allocate savings.

## Future Enhancements
*   Adding customizable widget drag-and-drop systems.

## Open Questions
*   Should the simulations console allow exporting PDF reports of loan prepayment projections?

## References
*   *FOS API Specifications*
*   *UX Layout Guidelines*
