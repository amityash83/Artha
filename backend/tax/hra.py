"""
HRA exemption (old regime only): the least of three amounts, all computed over the
months for which rent was actually paid. Rates and the metro-city list come from the
rule set's regimes.old.hra item, never from this module.
"""
from typing import Optional


def is_metro_city(city: Optional[str], hra_rules: dict) -> bool:
    if not city:
        return False
    wanted = city.strip().lower()
    return any(wanted == c.lower() for c in hra_rules["metro_cities"])


def calculate_hra_exemption(hra_received_annual: float, salary_for_hra_annual: float,
                            rent_paid_monthly: float, months_rented: int, metro: bool,
                            hra_rules: dict) -> dict:
    """
    salary_for_hra_annual is basic + DA forming part of retirement benefits. Salary
    components are assumed to be paid evenly across the year, so the rented-period
    share of HRA received and of salary is (months_rented / 12) of the annual figure.

    Returns the three components, which one binds, and the exemption (floored at 0).
    """
    months = max(0, min(int(months_rented or 0), 12))
    period_fraction = months / 12.0
    hra_received = max(hra_received_annual, 0.0) * period_fraction
    salary = max(salary_for_hra_annual, 0.0) * period_fraction
    rent_paid = max(rent_paid_monthly, 0.0) * months

    pct_of_salary = hra_rules["metro_pct"] if metro else hra_rules["non_metro_pct"]
    excess_pct = hra_rules["rent_excess_over_salary_pct"]

    components = {
        "actual_hra_received": round(hra_received, 2),
        "rent_paid_minus_pct_of_salary": round(max(rent_paid - salary * excess_pct / 100.0, 0.0), 2),
        "pct_of_salary": round(salary * pct_of_salary / 100.0, 2),
    }
    if months == 0 or rent_paid <= 0 or hra_received <= 0:
        exemption = 0.0
        binding = None
    else:
        binding = min(components, key=components.get)
        exemption = max(components[binding], 0.0)

    return {
        "exemption": round(exemption, 2),
        "components": components,
        "binding_component": binding,
        "metro": metro,
        "metro_or_non_metro_pct": pct_of_salary,
        "rent_excess_over_salary_pct": excess_pct,
        "months_rented": months,
        "rent_paid_in_period": round(rent_paid, 2),
        "salary_in_period": round(salary, 2),
    }
