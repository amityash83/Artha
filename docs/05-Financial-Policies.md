# 05-Financial-Policies - Financial Policies

## Purpose
This document specifies the supported financial management strategies, methodologies, and policies within the Financial Operating System (FOS) / Artha. It lists how money can be organized, allocated, and optimized without specifying user-selected parameters.

## Scope
Covers budgeting styles, emergency fund paradigms, loan prepayment options, investment rebalancing metrics, and reward yielding categories.

## Definitions
*   **Emergency Buffer Strategy:** The methodology used to calculate and evaluate household safety reserves.
*   **Asset Allocation Target:** The policy defining how wealth should be split among asset classes to manage risk.

## Responsibilities
*   Define the templates and rules for financial planning calculations.
*   Detail the options available in the user configuration panel.

## Relationships
*   Provides calculation guidelines used by the AI Recommendation Engine.
*   Specifies settings options mapped into User Configurations.

---

## Supported Financial Policies

### 1. Income Allocation Strategies
FOS support three primary budgeting methodologies:
*   **Fixed Percentage (e.g., 50/30/20):** Ratios are configured to split income automatically into Needs, Wants, and Investments.
*   **Priority-Based Allocation:** Funds are mapped to active Goals sequentially based on priority rankings (High $\rightarrow$ Medium $\rightarrow$ Low) until target contributions are satisfied.
*   **Zero-Based Budgeting:** Allocates every single rupee of monthly income to expense, investment, or emergency buckets until the remaining balance is zero.

### 2. Emergency Fund Policies
*   **Static Expense Multiple:** Target buffer set to a fixed multiple (e.g., 3, 6, or 12) of average monthly essential expenditures.
*   **Fixed Cost + EMI Multiple:** Target buffer set to a multiple of essential expenditures plus all active loan monthly EMI obligations.

### 3. Loan Prepayment Strategies
*   **Reduce Tenure:** Prepayments are applied directly to principal to reduce the loan duration, saving the maximum amount of long-term interest.
*   **Reduce EMI:** Prepayments are applied to reduce the monthly EMI obligation, maximizing monthly cash flow liquidity.
*   **Hybrid / Step-Up:** Prepayment amounts increase annually by a fixed percentage (e.g., 5% extra every year) to align with salary growth.

### 4. Investment Allocation & Rebalancing
*   **Passive Allocation:** Sets target percentage splits between Equity (mutual funds, stocks) and Debt (fixed deposits, retirement funds).
*   **Dynamic Rebalancing Policy:** A rebalancing trigger is initialized if the market values of the active holdings drift beyond a configurable threshold percentage.

### 5. Reward Optimization Policies
*   **Direct Cashback Maximization:** Optimization filters select the card that yields the highest cash-equivalent value per rupee spent.
*   **Miles & Travel Optimization:** Optimization filters prioritize transfer partners (Airlines, Hotels) to maximize the redemption yield of miles.

---

## Examples
*   *Investment Rebalancing policy check:* If the user configuration sets a 70/30 Equity/Debt split with a 5% drift policy, a rebalance trigger is logged if Equity assets rise to 76% of net worth.

## Future Enhancements
*   Adding corporate treasury taxation policies (e.g. GST and Capital Gains modeling).

## Open Questions
*   Should FOS support automated tax-saving (Section 80C style) policy warnings?

## References
*   *Asset Allocation & Portfolio Theory (Markowitz)*
*   *Personal Finance Best Practices Guides*
