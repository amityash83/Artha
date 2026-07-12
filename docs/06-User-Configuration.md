# 06-User-Configuration - User Configuration

## Purpose
This document specifies how user-selected choices, limits, targets, and strategies are structured and tracked within the Financial Operating System (FOS) / Artha.

## Scope
Covers the storage schemas and settings values selected by the user.

## Definitions
*   **Target Allocation:** The customized percentage split chosen by the user for asset classes or budget categories.
*   **Waiver Target:** A spending milestone set by the user or card provider to waive fees.

## Responsibilities
*   Maintain the active configuration state for all calculations.
*   Provide a schema for settings customization.

## Relationships
*   Links financial policies to active computations.
*   Guides the Recommendation Engine's threshold checks.

---

## User Configuration Parameters

### 1. Emergency Fund Target Setting
*   **Method:** `Fixed Cost + EMI Multiple`
*   **Configured Multiplier:** `6 Months` (Configurable range: 3 to 12)
*   **Essential Monthly Expense Override:** `₹30,000` (User-entered, fallback to derived averages)

### 2. Salary Allocation Ratios
*   **Strategy:** `Fixed Percentage`
*   **Ratios Configuration:**
    *   *Essentials:* `50%`
    *   *Discretionary (Wants):* `30%`
    *   *Savings / Investments:* `20%`

### 3. Investment Targets (Asset Allocation)
*   **Asset Split Configuration:**
    *   *Equity (Mutual Funds, Stocks):* `70%`
    *   *Debt (EPF, PPF, Bonds):* `30%`
*   **Drift Trigger Threshold:** `5%`

### 4. Loan Prepayment Preferences
*   **Repayment Mode:** `Reduce Tenure` (Alternatives: Reduce EMI, Hybrid)
*   **Monthly Prepayment Commit:** `₹10,000` (Direct monthly auto-transfer simulation)

### 5. Credit Card Reward Strategy
*   **Optimization Preference:** `Travel Miles` (Alternatives: Cashback, Cash-Equivalent)
*   **Primary Redemption Partner:** `KrisFlyer Singapore`

---

## Examples
*   *Asset Drift check:* A user changes their Equity allocation setting from 70% to 60%. The system instantly recalculates active drifts and marks portfolio balances according to the new 60% baseline.

## Future Enhancements
*   Saving configurations into a profile-specific JSON file to support multiple family members.

## Open Questions
*   Should the user configuration support dynamic variables (e.g. inflation adjustments) that change automatically over time?

## References
*   *Artha Settings Schema*
*   *JSON Configuration Formats*
