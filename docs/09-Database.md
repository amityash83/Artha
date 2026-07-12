# 09-Database - Database Design

## Purpose
This document details the SQLite database design, schema tables, column definitions, constraints, reference indices, and junction mappings for the Financial Operating System (FOS) / Artha.

## Scope
Covers all physical database tables stored in `finance.db`.

## Definitions
*   **Junction Table:** A table linking multiple records from two distinct tables (enabling many-to-many relationships).
*   **Normalized Form:** A database structure designed to minimize redundancy and prevent mixed responsibilities.

## Design Decisions
1.  **Strict Normalization:** Every table maps directly to one business domain entity.
2.  **No Derived State Storage:** Table schemas exclude current balances, asset market valuations, and goal progress fields. These are computed from transactional ledgers.
3.  **Junctions for Flexible Groupings:** Goals and Portfolios do not own assets. They map to Holdings using junction tables (`goal_holdings`, `portfolio_holdings`).

---

## Database Schema Specs

### 1. Master Data Tables

#### `people`
*   *Purpose:* Tracks individuals.
```sql
CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Primary Owner', 'Spouse', 'Dependent'))
);
```

#### `institutions`
*   *Purpose:* Financial institutions.
```sql
CREATE TABLE institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('Bank', 'AMC', 'Brokerage', 'Insurer'))
);
```

#### `relationships`
*   *Purpose:* Connects people to institutions.
```sql
CREATE TABLE relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL REFERENCES people(id),
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    customer_identifier TEXT NOT NULL,
    UNIQUE(person_id, institution_id, customer_identifier)
);
```

#### `accounts`
*   *Purpose:* Account repositories.
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution_id INTEGER NOT NULL REFERENCES institutions(id),
    owner_id INTEGER NOT NULL REFERENCES people(id),
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Closed')),
    currency TEXT NOT NULL DEFAULT 'INR',
    UNIQUE(name, institution_id, owner_id)
);
```

#### `financial_products`
*   *Purpose:* Product definitions templates.
```sql
CREATE TABLE financial_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider_id INTEGER NOT NULL REFERENCES institutions(id),
    category TEXT NOT NULL CHECK(category IN ('Mutual Fund', 'Stock', 'Credit Card', 'Loan', 'Fixed Deposit')),
    attributes_definition_json TEXT,
    UNIQUE(name, provider_id)
);
```

#### `goals`
*   *Purpose:* Planning targets.
```sql
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    target_date TEXT,
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High', 'Medium', 'Low'))
);
```

#### `portfolios`
*   *Purpose:* Grouping index.
```sql
CREATE TABLE portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES people(id),
    UNIQUE(name, owner_id)
);
```

---

### 2. Operational Data Tables

#### `assets`
*   *Purpose:* Individual holdings.
```sql
CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    product_id INTEGER NOT NULL REFERENCES financial_products(id),
    purchase_date TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1.0,
    acquisition_cost REAL NOT NULL,
    average_cost REAL NOT NULL,
    metadata_json TEXT
);
```

#### `liabilities`
*   *Purpose:* Debt balances.
```sql
CREATE TABLE liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    lender_id INTEGER NOT NULL REFERENCES institutions(id),
    principal_outstanding REAL NOT NULL,
    metadata_json TEXT
);
```

#### `transactions`
*   *Purpose:* Double-entry ledger logs.
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
    source_ref_id INTEGER,
    dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
    dest_ref_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell')),
    amount REAL NOT NULL CHECK(amount > 0.0),
    transaction_date TEXT NOT NULL,
    notes TEXT,
    linked_goal_id INTEGER REFERENCES goals(id)
);
```

#### `portfolio_holdings`
*   *Purpose:* Many-to-many junction mapping portfolios to assets.
```sql
CREATE TABLE portfolio_holdings (
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    PRIMARY KEY(portfolio_id, asset_id)
);
```

#### `goal_holdings`
*   *Purpose:* Many-to-many junction mapping goals to assets.
```sql
CREATE TABLE goal_holdings (
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    asset_id INTEGER NOT NULL REFERENCES assets(id),
    allocation_weight REAL NOT NULL DEFAULT 1.0, -- split ratio
    PRIMARY KEY(goal_id, asset_id)
);
```

---

### 3. Credit Card Rewards Tables

#### `reward_programs`
```sql
CREATE TABLE reward_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES financial_products(id),
    name TEXT NOT NULL,
    point_value_inr REAL NOT NULL DEFAULT 0.25
);
```

#### `reward_rules`
```sql
CREATE TABLE reward_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES reward_programs(id),
    merchant_category TEXT NOT NULL,
    multiplier REAL NOT NULL DEFAULT 1.0,
    monthly_cap INTEGER,
    is_exclusion INTEGER NOT NULL DEFAULT 0,
    UNIQUE(program_id, merchant_category)
);
```

#### `reward_partners`
```sql
CREATE TABLE reward_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES reward_programs(id),
    partner_name TEXT NOT NULL,
    conversion_ratio REAL NOT NULL DEFAULT 1.0
);
```

#### `reward_ledger`
```sql
CREATE TABLE reward_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES reward_programs(id),
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    points_accrued INTEGER NOT NULL,
    is_reconciled INTEGER NOT NULL DEFAULT 0
);
```

#### `reward_redemptions`
```sql
CREATE TABLE reward_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES reward_programs(id),
    points_redeemed INTEGER NOT NULL,
    redemption_type TEXT NOT NULL CHECK(redemption_type IN ('Cashback', 'MilesTransfer')),
    partner_id INTEGER REFERENCES reward_partners(id),
    cash_value REAL NOT NULL
);
```

---

## Examples
*   *Goal Funding Audit:* Selecting current assets allocated to Goal ID 2 runs:
    ```sql
    SELECT SUM(a.quantity * a.average_cost * gh.allocation_weight)
    FROM assets a
    JOIN goal_holdings gh ON a.id = gh.asset_id
    WHERE gh.goal_id = 2;
    ```

## Future Enhancements
*   Adding indexes on transaction dates and asset IDs to speed up ledger scans.

## Open Questions
*   Should `source_ref_id` and `dest_ref_id` have foreign key constraint assertions, or is application-level validation sufficient due to multi-table reference fields?

## References
*   *SQLite Constraint Rules Documentation*
*   *Database Normalization Best Practices*
