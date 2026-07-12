# 03-Business-Rules - Business Rules specification

## Purpose
This document specifies the core math equations, business thresholds, logic rules, and computational flows governing FOS / Artha, independent of database tables or UI structures.

## Scope
Includes all rules regarding salary allocation, loan amortization, reward points simulations, bucket management, and goal planning.

## Definitions
*   **Emergency Buffer Rule:** Maintaining 6 months of fixed household expenses plus EMIs in high-liquidity buckets.
*   **Reducing Balance Amortization:** The method where interest is computed on the outstanding principal at the end of each billing cycle.

## Core Business Rules

### 1. Salary Allocation
*   **Default Budget Rule (50/30/20):**
    *   **50% Essentials:** Assigned to household rent, utilities, loan EMIs, insurance premiums.
    *   **30% Wants:** Discretionary shopping, travel, dining.
    *   **20% Savings:** Mutual funds, stocks, prepayments.

### 2. Loan Calculations (Reducing Balance)
*   **Monthly Interest Calculation:**
    $$\text{Interest} = \text{Outstanding Principal} \times \frac{\text{Annual Interest Rate}}{12 \times 100}$$
*   **Remaining Tenure (N months):**
    $$N = -\frac{\ln\left(1 - \frac{\text{Interest Rate} \times \text{Outstanding}}{\text{EMI}}\right)}{\ln(1 + \text{Interest Rate})}$$

### 3. Credit Card Rewards Yield Computation
*   **Raw Points Earning:**
    $$\text{Raw Points} = \text{floor}\left(\frac{\text{Amount}}{\text{Spend Block}}\right) \times \text{Earning Rate} \times \text{Category Multiplier}$$
*   **Milestone Step-up Activation:**
    If cumulative monthly spend crosses the threshold limit, the Base Earning Rate is upgraded to the milestone rate for the incremental transaction amount.
*   **Effective Yield Rate (%):**
    $$\text{Yield (\%)} = \frac{\text{Points Earned} \times \text{Point Value (or Partner Conversion Ratio)}}{\text{Transaction Amount}} \times 100$$

### 4. Goal Milestone Planner
*   **Goal Completion Date Estimate:**
    $$\text{Months to Goal} = \frac{\text{Target Amount} - \text{Current Amount}}{\text{Monthly Contribution}}$$

---

## Design Decisions
*   **Strict Decoupling of Rules:** Calculations are performed in modular python functions (`backend/calc.py`) to keep them easily testable and separate from endpoints.

## Examples
*   *Loan EMI Progress:* An outstanding loan of ₹10,00,000 at 8% interest with ₹15,000 EMI will compute remaining tenure of approximately 88.3 months.

## Future Enhancements
*   Adding CIBIL credit score projection rules based on credit utilization levels.
*   Automated rebalancing triggers when asset allocation moves 5% away from target ratios.

## Open Questions
*   Should the 50/30/20 allocation rule be customizable by the user on the UI dashboard?
