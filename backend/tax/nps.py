"""
Corporate NPS optimiser: how much tax and cash change at different employer NPS
contribution levels, under two funding methods.

  restructure  Scenario A. The employer redirects part of the existing cash salary
               into NPS: a chosen cash component shrinks by the change in contribution,
               so gross salary (and CTC) stay the same and nothing is double-counted.
  over_ctc     Scenario B. NPS is added on top: cash salary is unchanged and CTC rises.

Every scenario is a full engine computation; no "a rupee of NPS saves x of tax"
shortcut is used anywhere, because surcharge thresholds, marginal relief and the
rebate make the saving non-linear. Contribution levels are employer-policy options
(what a payroll may offer), not tax limits: the regime's deductible limit and the
aggregate retirement cap come from the rule set via the engine and are flagged.
"""
import copy
from typing import List, Optional

from backend.tax.engine import (
    MONTHS_PER_YEAR, TaxInputError, apply_monthly_totals, compute, monthly_enabled, normalize_inputs,
)

DEFAULT_LEVELS_PCT = (0, 5, 10, 12, 14)
FUNDING_METHODS = ("restructure", "over_ctc")
REGIME_CHOICES = ("best", "old", "new")
# Components whose change also moves other figures (HRA exemption, NPS/PF base).
BASE_LINKED_COMPONENTS = ("basic", "da", "hra")


def salary_base(inp: dict, override: Optional[float] = None) -> float:
    if override is not None:
        return max(float(override), 0.0)
    return inp["salary"]["basic"] + inp["salary"]["da"]


def apply_employer_nps(inp: dict, target_annual: float, funding: str, restructure_from: str) -> dict:
    """
    Returns {"inputs", "contribution", "feasible", "notes"} with the employer NPS set to
    target_annual under the funding method. Restructuring takes the CHANGE from the
    current contribution out of one cash component (or adds it back if lowering NPS).
    """
    if funding not in FUNDING_METHODS:
        raise TaxInputError(f"funding must be one of {FUNDING_METHODS}")
    if monthly_enabled(inp):
        return _apply_employer_nps_monthly(inp, target_annual, funding, restructure_from)
    new = copy.deepcopy(inp)
    current = inp["employer_contributions"]["nps"]
    notes: List[str] = []
    feasible = True
    contribution = target_annual

    if funding == "restructure":
        if restructure_from not in new["salary"]:
            raise TaxInputError(f"Unknown salary component '{restructure_from}' to restructure from")
        available = new["salary"][restructure_from]
        delta = target_annual - current
        if delta > available:
            feasible = False
            notes.append(
                f"Restructuring needs {delta:,.0f} a year from '{restructure_from}', which only has {available:,.0f}; "
                f"capped at what is available.")
            delta = available
            contribution = current + delta
        new["salary"][restructure_from] = available - delta
        if new.get("salary_monthly") and restructure_from in new["salary_monthly"]:
            new["salary_monthly"][restructure_from] = round(new["salary"][restructure_from] / MONTHS_PER_YEAR)
        if restructure_from in BASE_LINKED_COMPONENTS and delta:
            notes.append(
                f"Restructuring from '{restructure_from}' also changes the HRA and NPS salary base; "
                f"employer PF, if linked to basic, is not recalculated.")
    new["employer_contributions"]["nps"] = contribution
    return {"inputs": new, "contribution": contribution, "feasible": feasible, "notes": notes}


def _apply_employer_nps_monthly(inp: dict, target_annual: float, funding: str, restructure_from: str) -> dict:
    """
    Month-by-month input: the annual figures are re-derived from the months on every
    computation, so the change is made to the months themselves. Restructuring moves the
    change out of each month in proportion to that month's share of the source component
    (a bonus month gives up more); over-CTC spreads the contribution evenly.
    """
    new = copy.deepcopy(inp)
    months = new["monthly"]["months"]
    current = sum(m["employer_contributions"]["nps"] for m in months)
    notes: List[str] = []
    feasible = True
    contribution = target_annual
    if funding == "restructure":
        if restructure_from not in new["salary"]:
            raise TaxInputError(f"Unknown salary component '{restructure_from}' to restructure from")
        available = sum(m["salary"].get(restructure_from, 0.0) for m in months)
        delta = target_annual - current
        if delta > available:
            feasible = False
            notes.append(
                f"Restructuring needs {delta:,.0f} a year from '{restructure_from}', which only has {available:,.0f} "
                f"across the year; capped at what is available.")
            delta = available
            contribution = current + delta
        for m in months:
            if delta >= 0:
                # Raising NPS: take it from each month in proportion to its source amount
                # (a bonus month gives up more), so no month's source can go negative.
                share = m["salary"].get(restructure_from, 0.0) / available if available else 1.0 / MONTHS_PER_YEAR
            else:
                # Lowering NPS: give it back in proportion to each month's existing NPS,
                # so no month's NPS can go negative.
                share = m["employer_contributions"]["nps"] / current if current else 1.0 / MONTHS_PER_YEAR
            moved = delta * share
            # max(): float rounding must not leave a tiny negative, which validation rejects
            m["salary"][restructure_from] = max(m["salary"].get(restructure_from, 0.0) - moved, 0.0)
            m["employer_contributions"]["nps"] = max(m["employer_contributions"]["nps"] + moved, 0.0)
        if restructure_from in BASE_LINKED_COMPONENTS and delta:
            notes.append(
                f"Restructuring from '{restructure_from}' also changes the HRA and NPS salary base; "
                f"employer PF, if linked to basic, is not recalculated.")
    else:
        for m in months:
            m["employer_contributions"]["nps"] = target_annual / MONTHS_PER_YEAR
    apply_monthly_totals(new)
    return {"inputs": new, "contribution": contribution, "feasible": feasible, "notes": notes}


def _pick(result: dict, regime: str) -> str:
    return result["comparison"]["best_regime"] if regime == "best" else regime


def _ctc(inp: dict) -> float:
    ec = inp["employer_contributions"]
    return sum(inp["salary"].values()) + ec["pf"] + ec["nps"] + ec["superannuation"]


def nps_scenarios(raw_inputs: dict, rules: dict, levels_pct: Optional[List[float]] = None,
                  custom_pct: Optional[float] = None, custom_monthly_amount: Optional[float] = None,
                  funding: str = "restructure", restructure_from: str = "special_allowance",
                  salary_base_override: Optional[float] = None, offered_pcts: Optional[List[float]] = None,
                  regime: str = "best", computed_at: Optional[str] = None) -> dict:
    if regime not in REGIME_CHOICES:
        raise TaxInputError(f"regime must be one of {REGIME_CHOICES}")
    for value, name in [(p, "levels_pct") for p in (levels_pct or [])] + [(custom_pct, "custom_pct"),
                                                                         (custom_monthly_amount, "custom_monthly_amount")]:
        if value is not None and value < 0:
            raise TaxInputError(f"{name} cannot be negative")
    inp = normalize_inputs(raw_inputs)
    baseline = compute(inp, rules, computed_at)
    before_key = _pick(baseline, regime)
    before = baseline["regimes"][before_key]
    base = salary_base(inp, salary_base_override)

    plans = [(f"{p:g}% of salary base", float(p), None) for p in (levels_pct if levels_pct is not None else DEFAULT_LEVELS_PCT)]
    if custom_pct is not None:
        plans.append((f"Custom: {custom_pct:g}%", float(custom_pct), None))
    if custom_monthly_amount is not None:
        plans.append((f"Custom: {custom_monthly_amount:,.0f} / month", None, float(custom_monthly_amount)))

    scenarios = []
    for label, pct, monthly in plans:
        target = round(base * pct / 100.0, 2) if pct is not None else monthly * MONTHS_PER_YEAR
        applied = apply_employer_nps(inp, target, funding, restructure_from)
        result = compute(applied["inputs"], rules, computed_at)
        key = _pick(result, regime)
        after = result["regimes"][key]
        nps_before = inp["employer_contributions"]["nps"]
        nps_after = applied["contribution"]
        tax_saved = before["total_tax"] - after["total_tax"]
        in_hand_change = after["in_hand_salary_annual"] - before["in_hand_salary_annual"]
        additional_nps = nps_after - nps_before

        flags = [{"code": "infeasible", "message": n} for n in applied["notes"] if not applied["feasible"]]
        flags += [{"code": "note", "message": n} for n in applied["notes"] if applied["feasible"]]
        flags += [{"code": w["code"], "message": w["message"]} for w in after_warnings(result, key)]
        if pct is not None and pct > 0:
            if offered_pcts is None:
                flags.append({"code": "employer_policy_unconfirmed",
                              "message": "Not confirmed that your employer offers this contribution level."})
            elif not any(abs(pct - o) < 1e-9 for o in offered_pcts):
                flags.append({"code": "not_offered", "message": f"Your employer does not offer {pct:g}%."})

        scenarios.append({
            "label": label,
            "pct_of_base": pct,
            "regime": key,
            "feasible": applied["feasible"],
            "employer_nps_annual": round(nps_after, 2),
            "employer_nps_monthly": round(nps_after / MONTHS_PER_YEAR, 2),
            "deductible_employer_nps": after["deductions"].get("employer_nps", 0.0),
            "taxable_income_before": before["total_income"],
            "taxable_income_after": after["total_income"],
            "tax_before": before["total_tax"],
            "tax_after": after["total_tax"],
            "tax_saved_annual": round(tax_saved, 2),
            "tax_saved_monthly": round(tax_saved / MONTHS_PER_YEAR, 2),
            "tax_saved_per_rupee": round(tax_saved / additional_nps, 4) if additional_nps > 0 else None,
            "cash_salary_annual": after["cash_salary"],
            "cash_reduction_annual": round(before["cash_salary"] - after["cash_salary"], 2),
            "cash_reduction_monthly": round((before["cash_salary"] - after["cash_salary"]) / MONTHS_PER_YEAR, 2),
            "in_hand_annual": after["in_hand_salary_annual"],
            "in_hand_monthly": after["monthly_average"]["in_hand_salary"],
            "in_hand_change_annual": round(in_hand_change, 2),
            "in_hand_change_monthly": round(in_hand_change / MONTHS_PER_YEAR, 2),
            "effective_rate_before_pct": before["effective_rate_pct"],
            "effective_rate_after_pct": after["effective_rate_pct"],
            "additional_retirement_investment_annual": round(additional_nps, 2),
            "net_economic_benefit_annual": round(in_hand_change + additional_nps, 2),
            "ctc_before": round(_ctc(inp), 2),
            "ctc_after": round(_ctc(applied["inputs"]), 2),
            "tax_by_regime": {k: v["total_tax"] for k, v in result["regimes"].items()},
            "flags": flags,
        })

    return {
        "rule_set": baseline["rule_set"],
        "computed_at": computed_at,
        "funding": funding,
        "restructure_from": restructure_from if funding == "restructure" else None,
        "regime_mode": regime,
        "salary_base_annual": round(base, 2),
        "salary_base_source": "override" if salary_base_override is not None else "basic + DA",
        "current_employer_nps_annual": inp["employer_contributions"]["nps"],
        "before": {
            "regime": before_key,
            "tax": before["total_tax"],
            "in_hand_annual": before["in_hand_salary_annual"],
            "in_hand_monthly": before["monthly_average"]["in_hand_salary"],
            "taxable_income": before["total_income"],
        },
        "scenarios": scenarios,
        "definitions": {
            "net_economic_benefit": "Change in annual in-hand cash plus change in annual employer NPS. NPS money is "
                                    "locked until retirement; this treats a rupee in NPS as a rupee, before any "
                                    "returns or tax on withdrawal.",
            "tax_saved": "Tax in the chosen regime before minus after, each from a full computation.",
        },
    }


def after_warnings(result: dict, regime: str) -> List[dict]:
    relevant = ("employer_nps_above_limit", "retirement_aggregate_cap", "unverified_rule")
    return [w for w in result["warnings"] if w["code"] in relevant and w.get("regime") in (regime, None)]
