# 07-Recommendation-Engine - AI Recommendation Specifications

## Purpose
This document specifies the rules, checks, triggers, and thresholds driving the FOS / Artha Recommendation Engine. It defines how the system evaluates active positions, budgets, and card programs to generate financial optimization recommendations.

## Scope
Covers advice triggers, card selection optimization algorithms, and rebalancing alerts.

## Definitions
*   **Recommendation Trigger:** A logical rule evaluating to true that generates a card suggestion or allocation warning.
*   **Yield Comparison:** The mathematical comparison of return on prepaying a loan (guaranteed interest savings) vs. investing (variable market yield).

## Responsibilities
*   Flag asset drifts and underfunded buffers.
*   Suggest card merchant options to maximize point yield.
*   Draft optimization alerts. *Recommendations are advisory and do not automatically mutate configuration.*

## Relationships
*   Evaluates active Holdings and Transactions.
*   Compares current positions against User Configurations.

---

## Recommendation Rules & Triggers

### 1. Emergency Reserve Warning
*   **Trigger Rule:**
    $$\text{IF } \text{Savings Account Cash} < \text{Emergency Fund Target}$$
*   **Recommendation Output:** "Action Required: Emergency buffer is underfunded by ₹X. Divert discretionary Wants budget to Savings."

### 2. Loan Prepayment vs. Investment Yield
*   **Trigger Rule:**
    $$\text{IF } \text{Loan Interest Rate} > \text{Expected Investment Return Rate}$$
*   **Recommendation Output:** "Debt Reduction Opportunity: Prepaying ₹10,000 on Loan A yields a guaranteed return of X%, which is higher than the expected investment return of Y%. Shift surplus cash to prepayment."

### 3. Asset Allocation Drift Warning
*   **Trigger Rule:**
    $$\text{IF } \text{Active Asset Split} - \text{Target Allocation} > \text{Drift Trigger Threshold}$$
*   **Recommendation Output:** "Portfolio Drift Alert: Equity is over-allocated by X%. Redeem ₹Y from Equity holdings and transfer to Debt holdings to align with the target split."

### 4. Credit Card Spending Optimizer
*   **Trigger Rule:** For any merchant payment amount and category, simulate points yield across all active cards.
*   **Recommendation Output:** "Spend Optimization: Use Card A for this ₹Z Dining payment to earn 5X points (₹W equivalent value). Card B yields only base rate points."

### 5. Idle Cash Warning
*   **Trigger Rule:** If savings account balance exceeds the emergency fund target plus double the monthly expense rate, flag the surplus cash as idle.
*   **Recommendation Output:** "Idle Capital Warning: Savings account holds ₹X in surplus idle cash. Transfer to a Liquid Fund or Debt holding to earn yield."

---

## Examples
*   *Card Recommendation:* When checking where to buy an airline ticket of ₹30,000, the simulator compares HDFC Infinia (returns 5X SmartBuy = 5,000 points) vs Axis Magnus (returns base = 1,800 points), highlighting HDFC Infinia as the optimal choice.

## Future Enhancements
*   Integrating local machine learning scoring models to cluster spending patterns and suggest custom budget rules.

## Open Questions
*   Should the engine flag credit card bill payments as opportunities to shift balances to zero-interest EMIs?

## References
*   *Modern Portfolio Theory Optimization Rules*
*   *Personal Debt Reductions Methodologies*
