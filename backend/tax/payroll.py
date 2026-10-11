"""
Before/after monthly payslip simulation.

    Monthly in-hand = monthly cash earnings - employee payroll deductions - monthly TDS

Employer NPS is shown but never counted as cash. TDS uses the payroll's actual
monthly figure when the caller provides one ("payroll_actual"); otherwise it is the
annual liability / 12, labelled "average" because real payroll TDS is usually uneven
(it is often trued-up in later months).

With month-by-month salary entry, a payslip can instead show one specific month
(month_index, 0 = April): that month's own earnings and deductions, and its TDS
(the payslip's actual figure, or the engine's projection for a projected month).
An average month hides changes during the year, such as a raise or an EPF wage
ceiling revision.
"""
from typing import Optional

from backend.tax.engine import MONTHS_PER_YEAR, TaxInputError, compute, monthly_enabled, normalize_inputs
from backend.tax.nps import REGIME_CHOICES, apply_employer_nps, salary_base
from backend.tax.epf import fy_months, month_segments, rupees
from backend.tax.rules_loader import load_epf_rules


def employer_pf_split(inp: dict, financial_year: str, month_index: Optional[int] = None) -> Optional[dict]:
    """The employer's PF as it usually lands: a pension (EPS) part, at the EPF rules'
    employer_eps_pct of EPF wages (basic + DA) up to the wage ceiling in force, and the
    rest to EPF. For information only: tax treats the employer's PF as one figure. Uses the
    month's own ceiling (split by days when it changes mid-month); the average month is the
    mean of the year's twelve. None when the rules don't carry the EPS rate."""
    epf_rules = load_epf_rules()
    if "employer_eps_pct" not in epf_rules:
        return None
    rate = float(epf_rules["employer_eps_pct"]["value"])
    periods = epf_rules["wage_ceiling_monthly"]["value"]
    starts = fy_months(financial_year)
    monthly = monthly_enabled(inp)

    def figures(i: int) -> tuple:
        if monthly:
            m = inp["monthly"]["months"][i]
            wages = m["salary"].get("basic", 0.0) + m["salary"].get("da", 0.0)
            pf = m["employer_contributions"]["pf"]
        else:
            wages = (inp["salary"].get("basic", 0.0) + inp["salary"].get("da", 0.0)) / MONTHS_PER_YEAR
            pf = inp["employer_contributions"]["pf"] / MONTHS_PER_YEAR
        capped = sum(min(wages, s["period"]["amount"]) * s["days"] / s["days_in_month"] for s in month_segments(starts[i], periods))
        return pf, min(rupees(capped * rate / 100.0), pf)

    rows = [figures(i) for i in ([month_index] if month_index is not None else range(len(starts)))]
    pf = sum(r[0] for r in rows) / len(rows)
    eps = sum(r[1] for r in rows) / len(rows)
    return {"employer_pf_monthly": round(pf, 2), "eps_monthly": round(eps, 2), "epf_monthly": round(pf - eps, 2),
            "eps_pct": rate, "verification": epf_rules["employer_eps_pct"]["verification"], "note": epf_rules["employer_eps_pct"]["note"]}


def _side(inp: dict, result: dict, regime: str, actual_monthly_tds: Optional[float],
          adjusted_tds: Optional[float] = None, month_index: Optional[int] = None) -> dict:
    r = result["regimes"][regime]
    average_tds = r["total_tax"] / MONTHS_PER_YEAR
    if month_index is None:
        earnings = {k: round(v / MONTHS_PER_YEAR, 2) for k, v in inp["salary"].items()}
        deductions = {k: round(v / MONTHS_PER_YEAR, 2) for k, v in inp["payroll_deductions"].items()}
        employer_nps = inp["employer_contributions"]["nps"] / MONTHS_PER_YEAR
        default_tds, default_basis = average_tds, "average"
    else:
        month = inp["monthly"]["months"][month_index]
        earnings = {k: round(v, 2) for k, v in month["salary"].items()}
        deductions = {k: round(v, 2) for k, v in month["payroll_deductions"].items()}
        employer_nps = month["employer_contributions"]["nps"]
        row = r["monthly"]["months"][month_index]
        default_tds = row["tds"]
        default_basis = {"actual": "month_actual", "projected": "month_projected"}.get(row["tds_basis"], "month_missing")
    gross = sum(earnings.values())
    if actual_monthly_tds is not None:
        tds, basis = actual_monthly_tds, "payroll_actual"
    elif adjusted_tds is not None:
        tds, basis = adjusted_tds, "payroll_adjusted"
    else:
        tds, basis = default_tds, default_basis
    deductions_total = sum(deductions.values())
    return {
        "regime": regime,
        "earnings": earnings,
        "gross_monthly_cash": round(gross, 2),
        "payroll_deductions": deductions,
        "payroll_deductions_total": round(deductions_total, 2),
        "tds_monthly": round(tds, 2),
        "tds_basis": basis,
        "engine_average_tds_monthly": round(average_tds, 2),
        "net_in_hand_monthly": round(gross - deductions_total - tds, 2),
        "employer_nps_monthly": round(employer_nps, 2),
        "employer_nps_annual": round(inp["employer_contributions"]["nps"], 2),
        "taxable_salary_annual": r["taxable_salary"],
        "taxable_income_annual": r["total_income"],
        "annual_tax": r["total_tax"],
    }


def payslip(raw_inputs: dict, rules: dict, optimization: Optional[dict] = None,
            regime_before: str = "best", regime_after: str = "best",
            actual_monthly_tds_before: Optional[float] = None, actual_monthly_tds_after: Optional[float] = None,
            computed_at: Optional[str] = None, month_index: Optional[int] = None) -> dict:
    for choice in (regime_before, regime_after):
        if choice not in REGIME_CHOICES:
            raise TaxInputError(f"regime must be one of {REGIME_CHOICES}")
    for value in (actual_monthly_tds_before, actual_monthly_tds_after):
        if value is not None and value < 0:
            raise TaxInputError("actual monthly TDS cannot be negative")

    if month_index is not None and not (isinstance(month_index, int) and 0 <= month_index < MONTHS_PER_YEAR):
        raise TaxInputError("month_index must be 0 (April) to 11 (March)")

    before_inp = normalize_inputs(raw_inputs)
    # A specific month only exists with month-by-month entry; otherwise show the average month.
    month = month_index if monthly_enabled(before_inp) else None
    before_result = compute(before_inp, rules, computed_at)
    notes = []
    feasible = True
    after_inp = before_inp
    if optimization:
        base = salary_base(before_inp, optimization.get("salary_base_override"))
        if optimization.get("employer_nps_monthly") is not None:
            target = float(optimization["employer_nps_monthly"]) * MONTHS_PER_YEAR
        else:
            target = round(base * float(optimization.get("employer_nps_pct") or 0.0) / 100.0, 2)
        applied = apply_employer_nps(before_inp, target, optimization.get("funding", "restructure"),
                                     optimization.get("restructure_from", "special_allowance"))
        after_inp, feasible, notes = applied["inputs"], applied["feasible"], applied["notes"]
    after_result = compute(after_inp, rules, computed_at)

    kb = before_result["comparison"]["best_regime"] if regime_before == "best" else regime_before
    ka = after_result["comparison"]["best_regime"] if regime_after == "best" else regime_after
    before = _side(before_inp, before_result, kb, actual_monthly_tds_before, month_index=month)
    # With only today's payroll TDS known, estimate tomorrow's as today's actual moved by
    # the engine's change in tax, rather than mixing an actual with a plain average.
    adjusted = None
    if actual_monthly_tds_before is not None and actual_monthly_tds_after is None:
        change = (after_result["regimes"][ka]["total_tax"] - before_result["regimes"][kb]["total_tax"]) / MONTHS_PER_YEAR
        adjusted = max(actual_monthly_tds_before + change, 0.0)
    after = _side(after_inp, after_result, ka, actual_monthly_tds_after, adjusted, month)

    cash_change = after["net_in_hand_monthly"] - before["net_in_hand_monthly"]
    nps_change = after["employer_nps_monthly"] - before["employer_nps_monthly"]
    tax_saved = before["annual_tax"] - after["annual_tax"]
    return {
        "rule_set": before_result["rule_set"],
        "computed_at": computed_at,
        "before": before,
        "after": after,
        "optimization": optimization,
        "feasible": feasible,
        "notes": notes,
        "month": None if month is None else {"index": month, "label": before_inp["monthly"]["months"][month]["label"],
                                             "status": before_inp["monthly"]["months"][month]["status"]},
        # The employer's PF doesn't change with an NPS restructure, so one split serves both sides.
        "employer_pf": employer_pf_split(before_inp, rules["financial_year"], month),
        "difference": {
            "monthly_cash_change": round(cash_change, 2),
            "monthly_nps_change": round(nps_change, 2),
            "annual_tax_saved": round(tax_saved, 2),
            "monthly_tax_saved": round(tax_saved / MONTHS_PER_YEAR, 2),
            "net_monthly_impact": round(cash_change + nps_change, 2),
            "net_annual_impact": round((cash_change + nps_change) * MONTHS_PER_YEAR, 2),
        },
        "tds_note": ("Monthly TDS uses the payroll figures you entered; where only the current figure was given, "
                     "the after figure is that actual moved by the computed change in annual tax / 12."
                     if actual_monthly_tds_before is not None or actual_monthly_tds_after is not None
                     else ("TDS is this month's payslip figure for an actual month, or, for a projected month, the tax still "
                           "due spread over the remaining months." if month is not None
                           else "Monthly TDS is the annual liability / 12 (average); actual payroll TDS is usually uneven.")),
    }
