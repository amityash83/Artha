# 01-Business-Object-Model - Business Object Model

## Purpose
This document defines every business object in the Financial Operating System, detailing their responsibilities, ownership scopes, boundaries, and connections.

## Scope
Covers the logical business objects of the system before software classes or database schemas are designed.

## Definitions
*   **Business Object (BO):** A representation of a real-world concept or entity in the financial domain.
*   **Encapsulation Boundary:** The strict limit of what an object manages and is responsible for.

## Responsibilities
*   To define the conceptual ownership of each entity.
*   To prevent mixed responsibilities (e.g. ensuring Accounts do not own Transactions directly).

---

## Business Objects

### 1. Person
*   **Why it exists:** Represents the human actor or legal entity owning financial interests.
*   **Responsibility:** To hold wealth, set goals, execute transactions, and associate with institutions.
*   **What it owns:** Personal data, associations, goals.
*   **What it does NOT own:** The physical bank account, the financial institution.
*   **Connections:** Links to Institutions, Accounts, Portfolios, Goals.

### 2. Institution
*   **Why it exists:** Represents the provider of financial products and services.
*   **Responsibility:** Custody of assets, processing transaction orders, issuing terms.
*   **What it owns:** Product details, institution names.
*   **What it does NOT own:** The user's account balances, personal goals.
*   **Connections:** Links to Accounts, Products, Relationships.

### 3. Relationship
*   **Why it exists:** Defines the legal or operational association between a Person and an Institution.
*   **Responsibility:** To capture credentials, customer IDs, and access permissions.
*   **What it owns:** Customer IDs, connection preferences.
*   **What it does NOT own:** Account balances.
*   **Connections:** Links a Person to an Institution.

### 4. Account
*   **Why it exists:** Represents the container where value is maintained.
*   **Responsibility:** Holds cash, tracks balances, links products to institutional custody.
*   **What it owns:** Current balance, currency type, status.
*   **What it does NOT own:** Individual transaction ledger entries.
*   **Connections:** Links to Institution, Products, Transactions.

### 5. Financial Product
*   **Why it exists:** Represents a standard financial template or offering.
*   **Responsibility:** Defines rates, terms, category rules, and fees.
*   **What it owns:** Product names, rules definition.
*   **What it does NOT own:** Active user positions or actual balances.
*   **Connections:** Links to Institutions, Holdings.

### 6. Holding
*   **Why it exists:** Represents the user's active position or balance in a specific product.
*   **Responsibility:** Tracks quantities, NAV values, policy details, purchase dates.
*   **What it owns:** Quantity, purchase costs, market value.
*   **What it does NOT own:** The cash transaction history.
*   **Connections:** Links to Account, Product, Portfolio, Goals.

### 7. Transaction
*   **Why it exists:** Logs every individual change of financial state.
*   **Responsibility:** Records cash movements, dates, and category tags.
*   **What it owns:** Date, amount, notes.
*   **What it does NOT own:** The account balance itself (which is aggregate).
*   **Connections:** Links to Account, Category.

### 8. Goal
*   **Why it exists:** Captures the target objective for saving or investing.
*   **Responsibility:** Holds target amounts, timelines, priorities.
*   **What it owns:** Target dates, contributions requirements.
*   **What it does NOT own:** Holdings (it only references them).
*   **Connections:** References Holdings.

### 9. Reward Program
*   **Why it exists:** Tracks loyalty points, miles, and cashback.
*   **Responsibility:** Calculates multipliers, holds redemption conversion rates.
*   **What it owns:** Conversion tables, point balances.
*   **What it does NOT own:** Actual cash currency.
*   **Connections:** Links to Products, Transactions.

### 10. Portfolio
*   **Why it exists:** Groups holdings together for unified allocation analysis.
*   **Responsibility:** Aggregates valuation, asset allocation ratios.
*   **What it owns:** Allocation targets.
*   **What it does NOT own:** Individual transaction records.
*   **Connections:** References Holdings.

---

## Examples
*   *Credit Card Setup:* The Person owns a Credit Card Product issued by an Institution, which is tracked as a Liability Account holding an outstanding balance.

## Business Rules (Conceptual)
*   **Responsibility Segregation:** No account balance can be modified without generating a corresponding Transaction log.

## Future Enhancements
*   Adding corporate entity objects for business account support.

## Open Questions
*   Should `Insurance` be modeled as a Product with a unique coverage Holding, or as a separate business object?

## References
*   *Financial ERP Object Specifications*
*   *Domain Driven Design (DDD) Patterns*
