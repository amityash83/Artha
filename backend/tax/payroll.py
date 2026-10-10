"""
Before/after monthly payslip simulation.

    Monthly in-hand = monthly cash earnings - employee payroll deductions - monthly TDS

Employer NPS is shown but never counted as cash. TDS uses the payroll's actual
monthly figure when the caller provides one ("payroll_actual"); otherwise it is the
annual liability / 12, labelled "average" because real payroll TDS is usually uneven
(it is often trued-up in later months).
"""
from typing import Optional

from backend.tax.engine import MONTHS_PER_YEAR, TaxInputError, compute, normalize_inputs
from backend.tax.nps import REGIME_CHOICES, apply_employer_nps, salary_base


def _side(inp: dict, result: dict, regime: str, actual_monthly_tds: Optional[float],
          adjusted_tds: Optional[float] = None) -> dict:
    r = result["regimes"][regime]
    earnings = {k: round(v / MONTHS_PER_YEAR, 2) for k, v in inp["salary"].items()}
    deductions = {k: round(v / MONTHS_PER_YEAR, 2) for k, v in inp["payroll_deductions"].items()}
    gross = sum(earnings.values())
    average_tds = r["total_tax"] / MONTHS_PER_YEAR
    if actual_monthly_tds is not None:
        tds, basis = actual_monthly_tds, "payroll_actual"
    elif adjusted_tds is not None:
        tds, basis = adjusted_tds, "payroll_adjusted"
    else:
        tds, basis = average_tds, "average"
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
        "employer_nps_monthly": round(inp["employer_contributions"]["nps"] / MONTHS_PER_YEAR, 2),
        "taxable_salary_annual": r["taxable_salary"],
        "taxable_income_annual": r["total_income"],
        "annual_tax": r["total_tax"],
    }


def payslip(raw_inputs: dict, rules: dict, optimization: Optional[dict] = None,
            regime_before: str = "best", regime_after: str = "best",
            actual_monthly_tds_before: Optional[float] = None, actual_monthly_tds_after: Optional[float] = None,
            computed_at: Optional[str] = None) -> dict:
    for choice in (regime_before, regime_after):
        if choice not in REGIME_CHOICES:
            raise TaxInputError(f"regime must be one of {REGIME_CHOICES}")
    for value in (actual_monthly_tds_before, actual_monthly_tds_after):
        if value is not None and value < 0:
            raise TaxInputError("actual monthly TDS cannot be negative")

    before_inp = normalize_inputs(raw_inputs)
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
    before = _side(before_inp, before_result, kb, actual_monthly_tds_before)
    # With only today's payroll TDS known, estimate tomorrow's as today's actual moved by
    # the engine's change in tax, rather than mixing an actual with a plain average.
    adjusted = None
    if actual_monthly_tds_before is not None and actual_monthly_tds_after is None:
        change = (after_result["regimes"][ka]["total_tax"] - before_result["regimes"][kb]["total_tax"]) / MONTHS_PER_YEAR
        adjusted = max(actual_monthly_tds_before + change, 0.0)
    after = _side(after_inp, after_result, ka, actual_monthly_tds_after, adjusted)

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
                     else "Monthly TDS is the annual liability / 12 (average); actual payroll TDS is usually uneven."),
    }
