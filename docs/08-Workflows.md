# 08-Workflows - Workflow Design

## Purpose
This document specifies the operational execution workflows and sequence transitions in the Financial Operating System (FOS) / Artha. It details the steps, triggers, and state changes for capital movements and debt amortization.

## Scope
Covers the core transactional and calculation workflows (Salary Allocation, Loan Repayments, and Insurance Payments).

## Definitions
*   **Sequential Transition:** The step-by-step progression of data and actions through components.
*   **Balance Sweep:** Automatically transferring excess cash from one bucket to an investment holding.

## Responsibilities
*   Define the exact order of transactional execution.
*   Prevent balance or calculation desynchronization during data sweeps.

## Relationships
*   Specifies how Transactions interact with Accounts, Holdings, and Goals during active operations.

---

## Core Operational Workflows

### 1. Salary Credit & Allocation Workflow
*   **Triggers:** Monthly salary transaction logs into a Savings Account.
*   **Flowchart:**
```mermaid
graph TD
    A[Salary Credit Event] --> B[Deposit to Savings Account]
    B --> C{Split via Allocation Config}
    C -->|50%| D[Essentials Envelope Bucket]
    C -->|30%| E[Wants Envelope Bucket]
    C -->|20%| F[Savings Envelope Bucket]
    F --> G[Systematic Investment SIP Buy]
    G --> H[Update Mutual Fund/Stock Holding Quantity]
    H --> I[Recalculate Net Worth Dashboard]
```

### 2. Loan EMI Repayment Workflow
*   **Triggers:** Monthly scheduled EMI debit date.
*   **Flowchart:**
```mermaid
graph TD
    A[EMI Debit Date Trigger] --> B[Deduct Amount from Savings Account]
    B --> C[Fetch Active Loan Interest Rate & Outstanding]
    C --> D[Calculate Accrued Interest Component]
    D --> E[Subtract Interest from total EMI to get Principal Component]
    E --> F[Apply Principal to outstanding Loan Liability balance]
    F --> G[Generate Transaction Ledger entry]
    G --> H[Update Net Worth Liability offset]
```

### 3. Insurance Premium Payment & Reserve Refill Workflow
*   **Triggers:** Insurance policy premium due alert.
*   **Flowchart:**
```mermaid
graph TD
    A[Premium Due Alert] --> B[Swipe Premium on Configured Credit Card]
    B --> C[Log Reward Program Points Accrual]
    C --> D[Mark Premium Transaction as Paid]
    D --> E[Trigger Savings Account envelope transfer to Card payment reserve]
    E --> F[Refill Card payment envelope bucket]
```

---

## Examples
*   *Salary Allocation Sweep:* Logging a salary credit of ₹1,00,000 immediately locks ₹50,000 for essentials, splits ₹20,000 into investment transactions, and flags the remaining ₹30,000 as discretionary wants balance.

## Business Rules (Operational)
*   **Atomic Transactions:** All steps within a workflow must succeed or roll back together. For example, if a loan payment transaction fails, the savings account balance must not be decremented.

## Future Enhancements
*   Adding automated cash sweeping rules to move cash from checking to high-yield savings when savings exceed a set target.

## Open Questions
*   How should the system behave if the savings account balance is insufficient to cover a scheduled EMI repayment workflow?

## References
*   *Financial Ledger Execution Flows*
*   *Enterprise ERP Workflow Standards*
