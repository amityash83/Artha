# 12-Investment-Engine - Investment Specifications

## Purpose
This document details investment models, SIP/SWP projection engines, portfolio asset allocation formulas, and XIRR mathematical computations.

## Scope
Covers all assets categorizations, holdings valuation, and yield projections.

## Definitions
*   **SIP (Systematic Investment Plan):** Periodic investments made into mutual funds or stocks.
*   **XIRR (Extended Internal Rate of Return):** Annualized yield of cash flows occurring at non-periodic intervals.

## Design Decisions
*   **Real-time NAV Updates:** Where applicable, the engine reads asset metadata values (`nav`, `quantity`) and multiplies them to return live valuations, falling back to manual cost valuations if NAV is not configured.

---

## Calculations

### XIRR Equation (Newton-Raphson Solving)
$$\sum_{i=1}^{N} \frac{C_i}{(1 + r)^{\frac{d_i - d_1}{365}}} = 0$$
*   Where:
    *   $C_i$: Cash flow amount at index $i$.
    *   $d_i$: Date of transaction $i$.
    *   $r$: Solved XIRR rate.

---

## Examples
*   *Asset Allocation:* Categorizing ₹5,00,000 in Mutual Funds (Equity Category) and ₹2,00,000 in EPF (Debt Category) renders a 71.4% Equity vs 28.6% Debt allocation ratio.

## Future Enhancements
*   Adding API fetches for automated NAV updates of mutual funds using AMFI.
*   Automated capital gains tax modeling (STCG/LTCG) upon simulated asset redemptions.

## Open Questions
*   Should the XIRR calculation handle cash flows from linked transactions automatically, or rely on manual transaction logs?
