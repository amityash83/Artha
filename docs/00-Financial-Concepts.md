# 00-Financial-Concepts - Understanding the Problem Domain

## Purpose
This document defines the core business concepts, vocabulary, financial language, and terminology of wealth management, banking, loans, investments, and reward structures. It serves as the business baseline before any tables or entity fields are designed.

## Scope
Covers the conceptual understanding of assets, liabilities, cash flow mechanics, amortization, investment yields, risk profiling, and rewards structures.

## Definitions
*   **Net Worth:** The total financial value owned by an entity after subtracting all liabilities from all assets.
*   **Asset Liquidity:** The ease and speed with which an asset can be converted into standard currency without losing value.
*   **Reducing Balance:** An interest calculation methodology where the interest charge is applied strictly to the outstanding balance at that specific moment.
*   **Accrued Interest:** Interest that has been accumulated on an investment or debt but has not yet been paid or billed.
*   **Category Multiplier:** An accelerated rewards rate applied to specific merchant categories (e.g. 5x points on Dining).

## Responsibilities
*   **To Define Domain Boundaries:** Establish clear terminology so developers and AI agents use identical vocabulary.
*   **To Clarify Mathematical Models:** Outline the conceptual flow of money (e.g. cash flow loggers, debt amortization, compound yields) before database schema selection.

## Relationships (Conceptual)
*   **Person & Wealth:** A Person is the beneficiary or holder of financial interests.
*   **Institution & Product:** An Institution issues or provides a financial product to the Person.
*   **Holding & Value:** A Holding represents the current position of the Person within a specific Product, which grows/shrinks via Transactions.

## Examples
*   *Emergency Reserve Buffer:* Retaining 6 months of fixed operational expenses in high-liquidity assets (Savings accounts) to offset income shocks.
*   *Reducing Amortization:* A monthly EMI payment pays off the accrued interest first, and the remaining amount reduces the outstanding principal balance.

## Business Rules (Conceptual)
*   **Double-Entry Principle:** Every transaction must have a corresponding source and target destination (e.g. salary logs out from Employer Institution and logs into Bank Savings Account).
*   **Asset vs Liability Allocation:** Assets represent positive capital positions; Liabilities represent obligations to return capital.

## Future Enhancements
*   Adding corporate treasury concepts (e.g. working capital, corporate tax structures).

## Open Questions
*   Should the domain rules support multi-currency conversion calculations globally, or assume a single base currency with manual conversion tags?

## References
*   *Standard Accounting Principles (GAAP)*
*   *Reducing Balance Loan Amortization Standards*
