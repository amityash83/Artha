# 14-Reporting-Engine - Reporting Specification

## Purpose
This document details net worth analytics, cash flow reporting, asset allocation tables, portfolio yield summaries, and future wealth trajectory projection algorithms.

## Scope
Covers all chart generation, metrics aggregating, and projection modeling.

## Definitions
*   **Net Worth Trajectory:** The projected path of assets minus liabilities over a future timeline (typically 10 to 30 years).
*   **Locked-in Assets:** Investments that cannot be liquidated immediately without heavy tax penalties or lock-in durations (e.g. EPF, property, PPF).

## Design Decisions
*   **Projected Inflation Adjustments:** All long-term net worth forecast models calculate returns using inflation-adjusted real rates to show purchasing power accurately.

---

## Calculations

### 1. Liquid vs. Locked Ratio
$$\text{Liquid Assets Ratio} = \frac{\text{Liquid Assets}}{\text{Total Assets}} \times 100$$

### 2. Compound Net Worth Forecast
$$\text{Net Worth } t = (\text{Net Worth } t-1) \times (1 + R_{\text{real}}) + 12 \times \text{Monthly Savings}$$
*   Where:
    *   $R_{\text{real}} = \frac{1 + \text{Nominal Return}}{1 + \text{Inflation}} - 1$

---

## Examples
*   *Liquid Assets Ratio:* Liquid funds of ₹5,00,000 vs locked-in wealth of ₹20,00,000 indicates a 20.0% liquid ratio.

## Future Enhancements
*   Adding PDF export utilities to generate premium quarterly financial reports.
*   Integrating Monte Carlo simulation models for net worth predictions under market volatility.

## Open Questions
*   Should the forecast model assume static inflation rates over the 30-year horizon, or allow variable annual inputs?
