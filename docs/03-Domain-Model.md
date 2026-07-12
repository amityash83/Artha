# 03-Domain-Model - Domain Specifications

## Purpose
This document defines the pure, technology-independent software entities of the Financial Operating System (FOS). It maps financial business concepts into domain attributes, lifecycles, and validation rules without reference to database types, SQL schemas, or programming language syntax.

## Scope
Covers the core domain specifications of FOS, including master data, operational data, validation constraints, and the object relationship matrix.

## Definitions
*   **Identifier:** A unique domain symbol referencing a specific instance of an entity.
*   **Money:** An abstract domain type representing currency value.
*   **Quantity:** An abstract numeric type representing holdings amounts (shares, grams, units).

---

## 1. Master Data Entities

### Person
*   **Purpose:** The human actor or legal entity owning wealth.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (Full name)
    *   `Role` (e.g. Primary Owner, Spouse, Dependent)
*   **Relationships:** Holds relationships with institutions; sets goals; references portfolios.
*   **Lifecycle:** Registered $\rightarrow$ Updated $\rightarrow$ Retained for audit.
*   **Validation Rules:** Name must contain at least 2 non-whitespace characters.

### Institution
*   **Purpose:** The custodian or provider of financial products (Banks, AMCs, Brokerages, Insurance companies).
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "HDFC Bank", "PPFAS AMC")
    *   `Type` (Custodial Bank, Asset Management Company, Depository Broker, Insurer)
*   **Relationships:** Governs products; maintains accounts.
*   **Lifecycle:** Created on register $\rightarrow$ In-use $\rightarrow$ Retained.
*   **Validation Rules:** Name must be unique.

### Relationship
*   **Purpose:** The legal connection between a Person and an Institution.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `PersonReference` (Links to Person)
    *   `InstitutionReference` (Links to Institution)
    *   `CustomerIdentifier` (e.g. CIF, Customer ID)
*   **Relationships:** Connects Person directly to Institution.
*   **Lifecycle:** Initialized on connection $\rightarrow$ Updated on credentials reset $\rightarrow$ Revoked.
*   **Validation Rules:** Person and Institution references must exist.

### Account
*   **Purpose:** The container where a Person's funds are held at an Institution.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "Monthly Operations Savings")
    *   `InstitutionReference` (Where it is maintained)
    *   `OwnerReference` (Person who holds it)
    *   `Status` (Active, Closed)
    *   `Currency` (e.g. INR, USD)
*   **Relationships:** Owned by Person; held at Institution; contains Holdings; generates Transactions.
*   **Lifecycle:** Opened $\rightarrow$ Active $\rightarrow$ Closed.
*   **Validation Rules:** Account cannot be closed if it holds any active Asset or Liability holdings.

### Financial Product
*   **Purpose:** The structural definition of a product (e.g. a specific Mutual Fund or Credit Card).
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "Flexi Cap Fund", "Infinia Credit Card")
    *   `ProviderReference` (AMC or bank issuing the product)
    *   `Category` (Mutual Fund, Stock, Credit Card, Home Loan, Fixed Deposit)
*   **Relationships:** Issued by Institution; governs Holdings.
*   **Lifecycle:** Seeded by system $\rightarrow$ Terms updated $\rightarrow$ Archived.
*   **Validation Rules:** Category must align with system-supported products.

### Goal
*   **Purpose:** A financial planning target.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "Child Education", "Retirement")
    *   `TargetAmount` (Money)
    *   `TargetDate` (Date)
    *   `Priority` (High, Medium, Low)
*   **Relationships:** References linked Holdings to aggregate current funding levels. *Does not own money.*
*   **Lifecycle:** Defined $\rightarrow$ Funded $\rightarrow$ Achieved $\rightarrow$ Closed.
*   **Validation Rules:** TargetAmount must be positive.

### Portfolio
*   **Purpose:** A customizable grouping view of holdings.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "Long Term Wealth")
    *   `OwnerReference` (Links to Person)
*   **Relationships:** References multiple Holdings. *Does not own financial data.*
*   **Lifecycle:** Created $\rightarrow$ Grouping modified $\rightarrow$ Deleted.
*   **Validation Rules:** Name must be unique for the owner.

### Reward Program
*   **Purpose:** Reward points and loyalty mapping definition.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `Name` (e.g. "HDFC Edge Rewards")
    *   `PointValue` (Money value per point)
*   **Relationships:** Linked to Products. Governs Reward Rules, Ledgers, and Partners.
*   **Lifecycle:** Initialized $\rightarrow$ Active $\rightarrow$ Suspended.

### Reward Rule
*   **Purpose:** Categorized accelerated earn rates.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `ProgramReference` (Links to Reward Program)
    *   `MerchantCategory` (Dining, Travel, Fuel, Rent, Utility)
    *   `Multiplier` (Numeric rate)
    *   `MonthlyCap` (Quantity of points, Optional)
    *   `IsExclusion` (Boolean)
*   **Relationships:** Child of Reward Program.

### Reward Transfer Partner
*   **Purpose:** Ratios for miles transfer conversion.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `PartnerName` (e.g. "KrisFlyer Singapore")
    *   `ConversionRatio` (Numeric ratio)
*   **Relationships:** Mapped to Reward Program.

---

## 2. Operational Data Entities

### Asset (Holding)
*   **Purpose:** The position or balance held in a Product.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `AccountReference` (Account where the holding is maintained)
    *   `ProductReference` (Product defining this holding)
    *   `PurchaseDate` (Date)
    *   `Quantity` (Quantity)
    *   `AcquisitionCost` (Money)
    *   `AverageCost` (Money)
*   **Asset Class Hierarchy:**
    *   **Financial Asset:**
        *   `Cash Position` (Savings balance)
        *   `Stock Position` (Listed equity)
        *   `Mutual Fund Position` (Invested mutual fund units)
        *   `Retirement Position` (EPF/PPF balances)
    *   **Physical Asset:**
        *   `Real Estate Property` (Linked property details)
        *   `Vehicle` (Linked vehicle details)
        *   `Gold & Jewellery` (Precious metal holdings)
*   **Relationships:** Belongs to Account; governed by Product. Mapped to Goals and Portfolios.
*   **Lifecycle:** Opened (Quantity > 0) $\rightarrow$ Position sizes adjusted $\rightarrow$ Liquidated (Quantity = 0).
*   **Validation Rules:** AcquisitionCost and Quantity must be non-negative.

### Liability
*   **Purpose:** An outstanding repayment obligation.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `AccountReference` (Account mapping this liability)
    *   `LenderReference` (Institution issuing the credit)
    *   `PrincipalOutstanding` (Money)
*   **Liability Hierarchy:**
    *   **Credit Card:**
        *   `BillingCycleDay` (Integer)
        *   `PaymentDueDay` (Integer)
        *   `AnnualFee` (Money)
    *   **Loan:**
        *   `LoanType` (Mortgage, Personal, Education)
        *   `EmiAmount` (Money)
        *   `InterestRate` (Numeric %)
        *   `TermDuration` (Integer, months)
*   **Relationships:** Belongs to Account; issued by Institution.
*   **Lifecycle:** Borrowed $\rightarrow$ Amortized $\rightarrow$ Closed.

### Transaction
*   **Purpose:** Double-entry log tracking all movements of capital.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `SourceReference` (Account or Holding transferring value out)
    *   `DestinationReference` (Account or Holding receiving value in)
    *   `Type` (Credit, Debit, Transfer, Buy, Sell)
    *   `Amount` (Money)
    *   `Timestamp` (DateTime)
    *   `Notes` (Text)
    *   `LinkedGoal` (GoalReference, Optional)
    *   `LinkedRewardLedger` (RewardLedgerReference, Optional)
*   **Relationships:** Updates Account balances and Holding quantities.
*   **Lifecycle:** Logged $\rightarrow$ Reconciled $\rightarrow$ Immutable.
*   **Validation Rules:** Amount must be greater than zero.

### Reward Ledger
*   **Purpose:** Records accrual of reward points.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `ProgramReference` (Links to Reward Program)
    *   `LinkedTransaction` (TransactionReference)
    *   `PointsAccrued` (Quantity)
    *   `IsReconciled` (Boolean)

### Reward Redemption
*   **Purpose:** Tracks points redemptions.
*   **Attributes:**
    *   `Identifier` (Unique ID)
    *   `ProgramReference` (RewardProgram)
    *   `PointsRedeemed` (Quantity)
    *   `RedemptionType` (Cashback, MilesTransfer)
    *   `PartnerReference` (TransferPartner, Optional)
    *   `CashValue` (Money)

---

## 3. Relationship Matrix

The following matrix details the permissions and communication boundaries between entities:

| Entity | Can Own | Can Contain | Can Generate | Can Reference | Can Link To | Can Never Link To |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Person** | Goals, Portfolios | — | — | Institutions | Relationships | Transactions |
| **Institution**| Products | — | — | — | Relationships | Goals |
| **Account** | Holdings | Transactions | — | Portfolios | Institution | Goals |
| **Product** | — | — | Interest, Rewards | — | Institution | Accounts |
| **Holding** | — | — | — | Goals, Portfolios| Product, Account| Customer ID |
| **Transaction**| — | — | — | Goals, Rewards | Accounts, Holdings| Institution |
| **Goal** | — | — | — | Holdings | Person | Accounts |

---

## Examples
*   *Loan Payment Execution:* A Transaction is generated with `SourceReference` = Bank Savings Account and `DestinationReference` = Home Loan Account. The Transaction records an EMI amount, updates the Liability outstanding balance, and splits the payment into principal and interest rules.

## Business Rules (Conceptual)
*   **Derived Balances:** Savings account current balances, asset holdings valuation, and goal completion progress levels are **strictly derived** from historical Transaction logs, ensuring database consistency.

## Future Enhancements
*   Adding corporate joint venture ownership matrices to support split partnership goals.

## Open Questions
*   How should we model tax-exempt retirement account holdings that compound internally without taxable transactional triggers?

## References
*   *Financial ERP Design Principles*
*   *Domain Driven Design Patterns*
