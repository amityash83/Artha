# 10-Reward-Engine - Credit Card Reward Engine

## Purpose
This document details the credit card reward logic, points multiplier calculations, step-up monthly milestone thresholds, conversion ratios, and optimal card recommendation simulator.

## Scope
Covers all reward mechanics computed within `src/components/CreditCards.tsx` and related simulation models.

## Definitions
*   **Base Earn Rate:** Points earned per standard spending block (e.g. 5 points per ₹150 spent).
*   **Step-up Milestone:** A spending threshold at which the base earning rate gets upgraded.
*   **Redemption Partner:** Airline or hotel loyalty programs that points can be transferred to.

## Design Decisions
*   **Simulation Pre-allocation:** When ranking cards for a transaction, the engine adds the simulated transaction amount to the card's `current_statement_spend` to evaluate if a step-up milestone threshold is triggered.

---

## Earning Logic Rules

### 1. Raw Point Calculation
$$\text{Points} = \text{floor}\left(\frac{\text{Amount}}{\text{Spend Block}}\right) \times \text{Base Points} \times \text{Multiplier}$$

### 2. Category Multipliers and Exclusions
*   If the transaction category exists in `category_rules_json` with `isExcluded: true`, points earned = 0.
*   If a multiplier is set, the points are multiplied.
*   Accelerated points are capped at the category's `monthlyCapPoints`.

### 3. Step-up Milestones
*   For Magnus-style step-ups: if ` project_spend = current_statement_spend + Amount >= spendThreshold`, the point calculations for that transaction are upgraded to `bonusPointsRate`.

### 4. Yield Optimization Strategies
*   **Direct Cashback:** `Points * Point Value (in INR)`.
*   **Air Miles Transfer:** `Points * Transfer Ratio * Mile Value` (standardized at ₹1.0 per mile).

---

## Examples
*   *Infinia SmartBuy dining transaction:* Simulating ₹2,000 Dining spend on HDFC Infinia applies a 5X multiplier, returning 333 points (worth ₹333 cashback value).

## Future Enhancements
*   Adding calendar alerts indicating the remaining spend required to hit monthly milestones before statement closing days.
*   Automated coupon mapping for credit card merchant offers.

## Open Questions
*   How should we handle merchant billing category discrepancies (e.g., a restaurant bill categorized as groceries)?
