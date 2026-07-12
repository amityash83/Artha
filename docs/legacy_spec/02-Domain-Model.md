# 02-Domain-Model - Domain Entities

## Purpose
This document defines every domain entity in the Financial Operating System, specifying their attributes, constraints, relationships, and core validation rules.

## Scope
Covers all entities mapped to database tables or virtual computation models within FOS.

## Definitions
*   **Asset:** A resource owned by the user that holds monetary value (e.g. Mutual Funds, Real Estate, EPF).
*   **Liability:** A debt or financial obligation owed by the user (e.g. Home Loan, Credit Card Outstanding).
*   **Transaction:** A single ledger entry logging a cash movement (Credit, Debit, Transfer, Investment, Redemption).

## Design Decisions
*   **Metadata JSON Serialization:** To handle diverse attributes across product types (e.g., policy coverage for Insurance vs NAV for Mutual Funds), all custom fields are serialized into a single `metadata_json` text field on the respective entity.

---

## Domain Entities

### 1. Institution
*   **Purpose:** Represents a financial institution (Bank, Brokerage, Insurance Provider).
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `name` (Text, Unique, Non-empty)
*   **Relationships:** Has many Accounts, Assets, and Liabilities.

### 2. Category
*   **Purpose:** Classifies accounts, assets, liabilities, income, and expenses.
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `entity_type` (Text: 'Account', 'Asset', 'Liability', 'Income', 'Expense', 'Goal')
    *   `name` (Text, Unique)
    *   `fields_definition` (Text, JSON list defining custom fields)

### 3. Account
*   **Purpose:** A cash bucket or transactional account (Savings, Demat, Wallet).
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `name` (Text)
    *   `institution_id` (Integer, references Institution)
    *   `current_balance` (Real)
    *   `currency` (Text)
    *   `status` (Text: 'Active', 'Closed')
    *   `owner` (Text: 'Self', 'Spouse', 'Joint')
    *   `metadata_json` (Text: holds `interest_rate`, `category_id`)

### 4. Asset
*   **Purpose:** An investment holding (Mutual Fund, Stock, PPF, Gold).
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `name` (Text)
    *   `category_id` (Integer, references Category)
    *   `institution_id` (Integer, references Institution)
    *   `current_value` (Real)
    *   `cost_price` (Real)
    *   `linked_account_id` (Integer, references Account)
    *   `metadata_json` (Text: holds `units`, `nav`, `policy_number`, `coverage`)

### 5. Liability
*   **Purpose:** Debt product (Loans, Credit Cards).
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `name` (Text)
    *   `category_id` (Integer, references Category)
    *   `lender_institution_id` (Integer, references Institution)
    *   `outstanding` (Real)
    *   `interest_rate` (Real)
    *   `emi` (Real)
    *   `metadata_json` (Text: holds credit limits, reward engines, lounge limits)

### 6. Transaction
*   **Purpose:** Double-entry ledger record.
*   **Attributes:**
    *   `id` (Integer, Primary Key)
    *   `account_id` (Integer, references Account)
    *   `type` (Text: 'Credit', 'Debit', 'Transfer', 'Investment', 'Redemption')
    *   `amount` (Real)
    *   `transaction_date` (Text, Date ISO format)
    *   `category_id` (Integer, references Category)
    *   `notes` (Text)

---

## Examples
*   *Credit Card Liability:* Storing credit card details with category rules (dining multipliers) inside `metadata_json` under a Liability entity (category 'Credit Card').

## Future Enhancements
*   Adding `Family` entity to support multi-member tracking.
*   Adding `TaxBracket` entity to dynamically calculate capital gains.

## Open Questions
*   Should `Owner` be a separate lookup table or remain a text field?
