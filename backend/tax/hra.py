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


def calculate_hra_exemption_monthly(months: list, default_metro: bool, hra_rules: dict) -> dict:
    """
    Month-by-month HRA exemption: the least-of-three test applied to each month with that
    month's HRA received, salary (basic + DA) and rent, then summed. This is how the
    exemption works when rent, salary or city change during the year. Each month may
    override metro (e.g. after a move); otherwise default_metro applies.

    Returns the same keys as calculate_hra_exemption (components are summed across months;
    binding_component is the one that bound most often) plus a per_month breakdown.
    """
    excess_pct = hra_rules["rent_excess_over_salary_pct"]
    totals = {"actual_hra_received": 0.0, "rent_paid_minus_pct_of_salary": 0.0, "pct_of_salary": 0.0}
    binding_counts = {}
    per_month = []
    exemption = 0.0
    rented = 0
    rent_total = 0.0
    salary_total = 0.0
    for m in months:
        metro = m["metro"] if m.get("metro") is not None else default_metro
        pct = hra_rules["metro_pct"] if metro else hra_rules["non_metro_pct"]
        received = m["salary"].get("hra", 0.0)
        salary = m["salary"].get("basic", 0.0) + m["salary"].get("da", 0.0)
        rent = m["rent_paid"]
        components = {
            "actual_hra_received": received,
            "rent_paid_minus_pct_of_salary": max(rent - salary * excess_pct / 100.0, 0.0),
            "pct_of_salary": salary * pct / 100.0,
        }
        if rent > 0 and received > 0:
            binding = min(components, key=components.get)
            month_exemption = max(components[binding], 0.0)
            binding_counts[binding] = binding_counts.get(binding, 0) + 1
            rented += 1
        else:
            binding, month_exemption = None, 0.0
        for k in totals:
            totals[k] += components[k]
        exemption += month_exemption
        rent_total += rent
        salary_total += salary
        per_month.append({"label": m["label"], "exemption": round(month_exemption, 2), "binding_component": binding,
                          "metro": metro, "rent_paid": round(rent, 2)})

    return {
        "exemption": round(exemption, 2),
        "components": {k: round(v, 2) for k, v in totals.items()},
        "binding_component": max(binding_counts, key=binding_counts.get) if binding_counts else None,
        "metro": default_metro,
        "metro_or_non_metro_pct": hra_rules["metro_pct"] if default_metro else hra_rules["non_metro_pct"],
        "rent_excess_over_salary_pct": excess_pct,
        "months_rented": rented,
        "rent_paid_in_period": round(rent_total, 2),
        "salary_in_period": round(salary_total, 2),
        "computed_monthly": True,
        "per_month": per_month,
    }
