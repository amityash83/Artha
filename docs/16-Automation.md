# 16-Automation - Automation Specifications

## Purpose
This document specifies the background automation routines, triggers, schedulers, and notification thresholds in the Financial Operating System (FOS) / Artha.

## Scope
Covers automated salary allocations, bucket refilling, reward milestone tracking, insurance reminders, loan optimization scans, CIBIL credit utilization alerts, and portfolio audits.

## Definitions
*   **Cron Trigger:** A scheduled background job executing at specific calendar intervals (e.g. daily, monthly).
*   **Utilization Threshold:** The percentage of credit card limit outstanding at statement closing that impacts credit scores.

## Responsibilities
*   Evaluate financial state transitions in the background.
*   Raise alerts and recommendations to the user console without initiating automatic capital transfers.

## Relationships
*   Analyzes Account balances and Transactions.
*   Updates alert indicators mapped in Screen Specifications.

---

## Automation Rules & Triggers

### 1. Salary Allocation Automation
*   **Trigger:** Transaction matches type = `Credit` and tag = `Salary`.
*   **Execution:**
    1.  Parse income amount.
    2.  Query User Configuration settings for budgeting strategy.
    3.  Calculate split balances.
    4.  Generate suggestion alerts in the user dashboard panel.

### 2. Envelope Bucket Refill Automation
*   **Trigger:** Weekly background cron check.
*   **Execution:**
    1.  Compute target balances for essential expenses and emergency buffers.
    2.  If active savings balances are below the target threshold, queue a warning alert to divert wants budgets.

### 3. Credit Card Rewards Tracking Automation
*   **Trigger:** Billing cycle statement date.
*   **Execution:**
    1.  Compare statement transactions against the logged `reward_ledger` points balance.
    2.  Flag point posting discrepancies for user review.
    3.  Calculate proximity to next milestone thresholds (e.g., fee-waiver spend targets) and notify if within 10% of target.

### 4. Insurance Renewal Reminders
*   **Trigger:** Current date is $N$ days prior to premium due date (where $N = 30, 15, 7, 1$).
*   **Execution:** Raise dashboard critical warnings and suggest the optimal card for the premium category payment.

### 5. Loan Optimization Scans
*   **Trigger:** Monthly background audit.
*   **Execution:**
    1.  Query active loan interest rates.
    2.  Compare against current market lending rates.
    3.  If a rate variance greater than 0.5% exists, suggest running a virtual balance transfer simulation.

### 6. CIBIL Score Spikes Prevention (Credit Utilization Alert)
*   **Trigger:** Daily transactions review.
*   **Execution:**
    1.  Compute current credit card balance divided by limit.
    2.  If utilization ratio exceeds 30% close to statement generation date, trigger an alert: "CIBIL Impact Alert: Card utilization is at X%. Prepay outstanding balance to optimize credit score before statement generation."

### 7. Portfolio Review Automation
*   **Trigger:** Quarterly cron date (Jan 1, Apr 1, Jul 1, Oct 1).
*   **Execution:** Run drift reviews comparing active holding weights against targets and flag alignment suggestions.

---

## Examples
*   *CIBIL Alert Trigger:* A user spends ₹1,80,000 on a card with a ₹5,00,000 credit limit (36% utilization). The system triggers an alert 3 days prior to the statement date suggesting a ₹30,000 prepayment to bring utilization down to a safe 30%.

## Future Enhancements
*   Adding OAuth email links to scrape online statements securely for reward discrepancies.

## Open Questions
*   Should the automation system support push notifications (e.g., local system drawer alerts) or remain strictly within the web viewport alert console?

## References
*   *FOS Scheduling Rules*
*   *Credit Score Optimization Guidelines (CIBIL guidelines)*
