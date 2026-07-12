# 11-Loan-Engine - Loan Engine Specifications

## Purpose
This document details interest calculations, reducing balance amortization math, prepayment impact simulations, and virtual balance transfer models.

## Scope
Covers all mortgage and personal loan calculations within FOS.

## Definitions
*   **EMI (Equated Monthly Installment):** Fixed monthly payment covering both principal and interest components.
*   **Balance Transfer:** Transferring outstanding debt to a new lender offering a lower interest rate.

## Design Decisions
*   **Virtual Prepayments:** Prepayment simulations are calculated dynamically without altering the active database records, allowing users to run complex 'what-if' calculations instantly.

---

## Amortization Calculations

### 1. Standard Reducing Balance Interest
$$\text{Interest Month } t = \text{Outstanding Principal } P_t \times \frac{R}{12}$$
$$\text{Principal Paid Month } t = \text{EMI} - \text{Interest Month } t$$
$$\text{New Principal } P_{t+1} = P_t - \text{Principal Paid} - \text{Prepayment Month } t$$

### 2. Time/Interest Savings Simulation
By tracking the cumulative prepayment list, the engine runs month-by-month loops until $P_n \le 0$ to determine the simulated loan closure month and total interest saved.

---

## Examples
*   *Prepayment simulation:* Logging a ₹1,00,000 prepayment at month 12 of a ₹50,00,000 loan reduces tenure by 14 months and saves ₹1.2 Lakhs in total interest.

## Future Enhancements
*   Adding inflation-adjusted loan cost analyses to check if investing is better than prepayment.
*   Automated notification when market interest rates drop below the user's active loan rate.

## Open Questions
*   Should prepayments be mapped to a specific linked bank account transaction automatically?
