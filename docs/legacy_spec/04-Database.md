# 04-Database - Database Design

## Purpose
This document details the SQLite database design, table schemas, columns, constraints, indexing strategies, and migrations for FOS.

## Scope
Covers all physical SQLite tables and relationships stored in `finance.db`.

## Definitions
*   **Foreign Key Constraint:** Enforces referential integrity between tables (e.g. referencing Institution ID).
*   **Migration Block:** Code blocks executed on startup to dynamically alter database schema.

## Design Decisions
*   **PRAGMA foreign_keys = ON:** Enforced on every connection opening to maintain table references.
*   **UNIQUE Constraints:** Placed on transaction keys, account names, and institution names to prevent duplicates.

---

## Database Schemas

### 1. categories
```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    fields_definition TEXT
);
```

### 2. institutions
```sql
CREATE TABLE institutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
```

### 3. accounts
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution_id INTEGER REFERENCES institutions(id),
    current_balance REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'Active',
    owner TEXT,
    tags TEXT,
    metadata_json TEXT,
    UNIQUE(name, institution_id)
);
```

### 4. assets
```sql
CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    institution_id INTEGER REFERENCES institutions(id),
    purchase_date TEXT,
    current_value REAL DEFAULT 0.0,
    quantity REAL DEFAULT 1.0,
    cost_price REAL DEFAULT 0.0,
    market_value REAL DEFAULT 0.0,
    expected_return REAL DEFAULT 0.0,
    compounding TEXT DEFAULT 'Monthly',
    liquidity TEXT DEFAULT 'High',
    tax_category TEXT,
    risk_level TEXT DEFAULT 'Medium',
    linked_account_id INTEGER REFERENCES accounts(id),
    metadata_json TEXT
);
```

### 5. liabilities
```sql
CREATE TABLE liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    lender_institution_id INTEGER REFERENCES institutions(id),
    outstanding REAL DEFAULT 0.0,
    interest_rate REAL DEFAULT 0.0,
    emi REAL DEFAULT 0.0,
    tenure_months INTEGER DEFAULT 120,
    compounding TEXT DEFAULT 'Monthly',
    tax_benefit TEXT DEFAULT 'None',
    metadata_json TEXT
);
```

### 6. transactions
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER REFERENCES accounts(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    notes TEXT,
    related_entity_type TEXT,
    related_entity_id INTEGER
);
```

---

## Examples
*   *Adding a Column Migration:* Altering the `liabilities` table to expand field definitions dynamically is processed under migration Block E.

## Future Enhancements
*   Encrypted SQLite databases using SQLCipher.
*   Automatic archiving tables for transaction records older than 5 years.

## Open Questions
*   Should we index `transactions(transaction_date)` to optimize timeline search performance?
