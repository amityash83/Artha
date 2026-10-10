"""
Break-even and sensitivity analysis. Every number here is a full engine computation on
an adjusted copy of the user's own inputs and rule set; nothing is extrapolated from
marginal rates, because surcharge thresholds, marginal relief and the rebate make tax
non-linear. Results are specific to this user's salary, income and rules, never universal.

Adjustments work in both annual and month-by-month mode: in monthly mode they change the
months themselves (the annual figures are always re-derived from the months).
"""
import copy
import math
from typing import Callable, List, Optional

from backend.tax.engine import TaxInputError, apply_monthly_totals, compute, monthly_enabled, normalize_inputs
from backend.tax.nps import REGIME_CHOICES, apply_employer_nps, salary_base

SALARY_FACTORS = (0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5)
BONUS_STEPS_PCT_OF_CASH = (0, 5, 10, 15, 20, 30, 40)
BASIC_SHARES_PCT = (30, 35, 40, 45, 50, 55, 60)
BISECTION_STEPS = 50
LAST_MONTH = 11  # March, where a year-end bonus lands in monthly mode
FIXED_PAY_KEYS = ("basic", "da", "hra", "special_allowance")


# ---------------------------------------------------------------------------
# Input adjustments (annual or monthly)
# ---------------------------------------------------------------------------

def _salary_dicts(inp: dict) -> List[dict]:
    return [m["salary"] for m in inp["monthly"]["months"]] if monthly_enabled(inp) else [inp["salary"]]


def _refresh(inp: dict) -> dict:
    if monthly_enabled(inp):
        apply_monthly_totals(inp)
    return inp


def scale_cash_salary(inp: dict, factor: float) -> dict:
    """Every cash salary component x factor (payroll deductions such as capped EPF unchanged)."""
    new = copy.deepcopy(inp)
    for salary in _salary_dicts(new):
        for key in salary:
            salary[key] = salary[key] * factor
    return _refresh(new)


def add_bonus(inp: dict, amount: float, month_index: int = LAST_MONTH) -> dict:
    new = copy.deepcopy(inp)
    target = new["monthly"]["months"][month_index]["salary"] if monthly_enabled(new) else new["salary"]
    target["bonus"] = target.get("bonus", 0.0) + amount
    return _refresh(new)


def set_basic_share(inp: dict, share_pct: float) -> Optional[dict]:
    """
    Re-splits fixed pay (basic + DA + HRA + special allowance, total unchanged) so basic is
    share_pct of it, keeping DA and the HRA:basic ratio; special allowance absorbs the rest.
    None if that would need a negative special allowance.
    """
    new = copy.deepcopy(inp)
    for salary in _salary_dicts(new):
        fixed = sum(salary.get(k, 0.0) for k in FIXED_PAY_KEYS)
        if fixed <= 0:
            continue
        basic = salary.get("basic", 0.0)
        hra_ratio = salary.get("hra", 0.0) / basic if basic else 0.0
        new_basic = fixed * share_pct / 100.0
        new_hra = new_basic * hra_ratio
        special = fixed - new_basic - new_hra - salary.get("da", 0.0)
        if special < -0.005:
            return None
        salary.update({"basic": new_basic, "hra": new_hra, "special_allowance": max(special, 0.0)})
    return _refresh(new)


def add_old_regime_deductions(inp: dict, amount: float) -> dict:
    new = copy.deepcopy(inp)
    new["deductions"]["other_old"] = new["deductions"]["other_old"] + amount
    return new


# ---------------------------------------------------------------------------
# Solvers
# ---------------------------------------------------------------------------

def _min_satisfying(lo: float, hi: float, ok: Callable[[float], bool]) -> float:
    """
    Smallest whole-rupee x in [lo, hi] with ok(x), assuming ok is monotone (False...True).
    Tax moves in steps (income and tax are rounded to the nearest 10), so a bisection point
    rounded the wrong way can sit just across a step: the answer is rounded UP to a whole
    rupee and re-checked, nudging up until it truly satisfies ok.
    """
    for _ in range(BISECTION_STEPS):
        if hi - lo <= 0.5:
            break
        mid = (lo + hi) / 2
        if ok(mid):
            hi = mid
        else:
            lo = mid
    answer = math.ceil(hi)
    for _ in range(BISECTION_STEPS):
        if ok(answer):
            break
        answer += 1
    return float(answer)


def old_regime_break_even(inp: dict, rules: dict) -> dict:
    """
    Additional old-regime deductions/exemptions (after their own caps) at which the old
    regime's tax falls to the new regime's. The new regime doesn't allow them, so its tax
    stays put.
    """
    base = compute(inp, rules)["regimes"]
    old_tax, new_tax = base["old"]["total_tax"], base["new"]["total_tax"]
    if old_tax <= new_tax:
        return {
            "status": "old_already_cheaper",
            "additional_deductions_needed": 0.0,
            "old_tax": old_tax,
            "new_tax": new_tax,
            "margin": round(new_tax - old_tax, 2),
            "explanation": "The old regime is already as cheap or cheaper with your current deductions.",
        }
    old_at = lambda extra: compute(add_old_regime_deductions(inp, extra), rules)["regimes"]["old"]["total_tax"]
    hi = base["old"]["total_income"]
    needed = _min_satisfying(0.0, hi, lambda x: old_at(x) <= new_tax)
    return {
        "status": "found",
        "additional_deductions_needed": round(needed, 2),
        "old_tax": old_tax,
        "new_tax": new_tax,
        "old_tax_at_break_even": old_at(needed),
        "explanation": "Extra old-regime deductions or exemptions (counted after their own limits, e.g. HRA, 80C, "
                       "80D, home loan) needed before the old regime costs no more than the new one, for your "
                       "salary and rules. It is not a universal figure.",
    }


def nps_for_target_saving(inp: dict, rules: dict, target_saving: float, funding: str = "restructure",
                          restructure_from: str = "special_allowance", regime: str = "best",
                          salary_base_override: Optional[float] = None) -> dict:
    """Smallest annual employer NPS that saves at least target_saving a year."""
    if regime not in REGIME_CHOICES:
        raise TaxInputError(f"regime must be one of {REGIME_CHOICES}")
    if target_saving <= 0:
        raise TaxInputError("target_saving must be positive")
    inp = normalize_inputs(inp)

    def tax_with(contribution: float) -> float:
        applied = apply_employer_nps(inp, contribution, funding, restructure_from)
        result = compute(applied["inputs"], rules)
        key = result["comparison"]["best_regime"] if regime == "best" else regime
        return result["regimes"][key]["total_tax"]

    before = tax_with(inp["employer_contributions"]["nps"])
    base = salary_base(inp, salary_base_override)
    limits = [rules["regimes"][r]["employer_nps"]["value"]["pct_of_basic_da"][inp["profile"]["employer_type"]]
              for r in (("old", "new") if regime == "best" else (regime,))]
    ceiling = base * max(limits) / 100.0  # above the deductible limit, more NPS saves nothing
    best_saving = before - tax_with(ceiling)
    if best_saving < target_saving:
        return {
            "status": "not_reachable",
            "target_saving": target_saving,
            "max_saving": round(best_saving, 2),
            "contribution_at_limit": round(ceiling, 2),
            "explanation": f"Even at the deductible limit ({max(limits):g}% of the salary base) employer NPS saves "
                           f"{best_saving:,.0f} a year.",
        }
    needed = _min_satisfying(0.0, ceiling, lambda c: before - tax_with(c) >= target_saving)
    return {
        "status": "found",
        "target_saving": target_saving,
        "contribution_annual": round(needed, 2),
        "contribution_monthly": round(needed / 12, 2),
        "pct_of_salary_base": round(needed / base * 100.0, 2) if base else None,
        "saving_at_contribution": round(before - tax_with(needed), 2),
        "explanation": "Smallest employer NPS contribution that reaches the target, from full tax computations.",
    }


# ---------------------------------------------------------------------------
# Sweeps
# ---------------------------------------------------------------------------

def _row(result: dict) -> dict:
    old, new = result["regimes"]["old"], result["regimes"]["new"]
    best = result["comparison"]["best_regime"]
    return {
        "old_tax": old["total_tax"],
        "new_tax": new["total_tax"],
        "best_regime": best,
        "best_tax": result["regimes"][best]["total_tax"],
        "effective_rate_old_pct": old["effective_rate_pct"],
        "effective_rate_new_pct": new["effective_rate_pct"],
        "monthly_in_hand_best": result["regimes"][best]["monthly_average"]["in_hand_salary"],
    }


def sensitivity(raw_inputs: dict, rules: dict, bonus_month: int = LAST_MONTH) -> dict:
    inp = normalize_inputs(raw_inputs)
    base = compute(inp, rules)
    cash = base["regimes"]["new"]["cash_salary"]

    salary_rows = []
    for factor in SALARY_FACTORS:
        r = compute(scale_cash_salary(inp, factor), rules)
        salary_rows.append({"factor": factor, "cash_salary": r["regimes"]["new"]["cash_salary"], **_row(r)})

    bonus_rows = []
    base_best = _row(base)["best_tax"]
    for pct in BONUS_STEPS_PCT_OF_CASH:
        bonus = round(cash * pct / 100.0, -4)
        r = compute(add_bonus(inp, bonus, bonus_month), rules)
        row = _row(r)
        extra_tax = row["best_tax"] - base_best
        bonus_rows.append({
            "bonus": bonus, **row,
            "extra_tax": round(extra_tax, 2),
            "bonus_kept": round(bonus - extra_tax, 2),
            "tax_rate_on_bonus_pct": round(extra_tax / bonus * 100.0, 2) if bonus else None,
        })

    share_rows = []
    for share in BASIC_SHARES_PCT:
        adjusted = set_basic_share(inp, share)
        if adjusted is None:
            share_rows.append({"basic_share_pct": share, "feasible": False})
            continue
        r = compute(adjusted, rules)
        new_pct = rules["regimes"]["new"]["employer_nps"]["value"]["pct_of_basic_da"][inp["profile"]["employer_type"]]
        share_rows.append({
            "basic_share_pct": share, "feasible": True,
            "basic": round(adjusted["salary"]["basic"], 2),
            "hra": round(adjusted["salary"]["hra"], 2),
            "special_allowance": round(adjusted["salary"]["special_allowance"], 2),
            "hra_exemption_old": r["regimes"]["old"]["hra"]["exemption"] if r["regimes"]["old"]["hra"] else 0.0,
            "employer_nps_limit_new": round((adjusted["salary"]["basic"] + adjusted["salary"]["da"]) * new_pct / 100.0, 2),
            **_row(r),
        })

    fixed = sum(inp["salary"].get(k, 0.0) for k in FIXED_PAY_KEYS)
    return {
        "rule_set": base["rule_set"],
        "base": _row(base),
        "current_basic_share_pct": round(inp["salary"]["basic"] / fixed * 100.0, 2) if fixed else None,
        "break_even": old_regime_break_even(inp, rules),
        "salary_sweep": salary_rows,
        "bonus_sweep": bonus_rows,
        "bonus_month": inp["monthly"]["months"][bonus_month]["label"] if monthly_enabled(inp) else None,
        "basic_share_sweep": share_rows,
        "notes": [
            "Each row is a full tax computation on your inputs with one thing changed.",
            "Salary sweep scales every cash component; payroll deductions such as EPF are left unchanged.",
            "Basic-share sweep keeps total fixed pay and the HRA:basic ratio; special allowance absorbs the change.",
        ],
    }
