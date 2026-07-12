# 04-System-Business-Rules - System Business Rules

## Purpose
This document defines how the Financial Operating System (FOS) / Artha application behaves. It specifies core system rules and validation constraints that are independent of personal user configurations, financial policies, or bank-specific reward programs.

## Scope
Covers application-level constraints, balance derivation rules, immutability thresholds, and math aggregation logic.

## Definitions
*   **Reconciled State:** A transaction state indicating that the entry has been verified against external statement uploads.
*   **Derived Value:** A runtime value calculated dynamically from the ledger history, rather than stored as a static field.

## Responsibilities
*   Enforce ledger integrity.
*   Ensure consistent state changes.

## Relationships
*   Governs how Transactions update Accounts and Holdings.
*   Directs how Goal progress and Portfolio values are computed.

---

## Core System Business Rules

### 1. Ledger Integrity and Immutability
*   Once a Transaction is marked as Reconciled, its amount, timestamp, source, and destination references cannot be edited or deleted.
*   To adjust a reconciled ledger entry, a corrective Transaction must be created.

### 2. Derived Balances and Valuations
*   Savings account current balances are dynamically derived as:
    $$\text{Balance} = \sum(\text{Credits}) - \sum(\text{Debits})$$
*   Portfolio valuations are computed dynamically by summing the current valuations of all referenced holdings:
    $$\text{Portfolio Value} = \sum(\text{Holding Quantity} \times \text{Asset Price})$$

### 3. Goal Funding Independence
*   Goals do not own cash. Goal progress is derived dynamically as the sum of all linked holdings:
    $$\text{Goal Current Amount} = \sum(\text{Linked Holding Quantity} \times \text{Current Asset Price})$$
*   A single Asset Holding may be split and referenced across multiple Goals (e.g., 40% of a mutual fund holding linked to Education Goal, and 60% linked to Retirement Goal).

### 4. Ownership Constraints
*   The sum of ownership percentages across all owners tagged on a single Account, Asset, or Liability must equal exactly 100%.

### 5. Loan Interest Computations
*   Amortization schedules and monthly interest splits are generated dynamically based on the configured interest method (e.g., reducing balance) and outstanding principal.

### 6. Reward Engine Delegation
*   The core ledger logs transactional amounts and categories, and delegates points accrual logic to the linked Reward Program Rules.

---

## Examples
*   *Ledger Adjustments:* If an HDFC account transaction is reconciled, editing the amount on the interface is blocked. The user must create an offset debit/credit transaction to reconcile discrepancies.

## Future Enhancements
*   Adding automated verification checks on boot to guarantee that all derived account balances match the transaction ledger history.

## Open Questions
*   Should FOS support locking historical transaction years to prevent accidental corrective entries?

## References
*   *Double-Entry Accounting Principles*
*   *Enterprise Ledger Immutability Guidelines*
