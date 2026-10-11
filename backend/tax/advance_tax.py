"""
Advance tax: how much is due by each instalment date, what has been paid, and the
deferment / shortfall interest that follows (Income-tax Act 2025 ss. 403-408, 424, 425;
1961 Act ss. 207-211, 234B, 234C). Every figure and date comes from the rule set's
`advance_tax` item; none is in this file.

    tax to pay by advance tax = total tax (the planner's regime) - TDS expected for the year

By default the expected TDS is the tax on salary alone (the engine re-run with other income
and capital gains removed): an employer deducts tax on the salary it pays, so what remains
is the tax on interest, rent, dividends and gains. The caller can pass its own TDS figure
instead (e.g. when banks also deduct TDS on deposits).
"""
import copy
import math
from datetime import date
from typing import Optional

from backend.tax.engine import TaxInputError, compute, normalize_inputs

APRIL = 4


def _fy_start(rules: dict) -> int:
    return int(str(rules["financial_year"])[:4])


def _on(fy_start: int, month_day: str, of_next_year: bool = False) -> date:
    month, day = (int(x) for x in month_day.split("-"))
    year = fy_start + (1 if month < APRIL else 0) + (1 if of_next_year else 0)
    return date(year, month, day)


def return_due_date(rules: dict) -> Optional[date]:
    item = rules.get("return_due_date")
    if not item:
        return None
    v = item["value"]
    # "of assessment_year": the date falls in the year after the financial year ends.
    return _on(_fy_start(rules), v["due"], of_next_year=v.get("of") == "assessment_year" and int(v["due"][:2]) >= APRIL)


def _interest(amount: float, pct_per_month: float, months: int, unit: float) -> float:
    rounded = math.floor(max(amount, 0.0) / unit) * unit if unit else max(amount, 0.0)
    return round(rounded * pct_per_month / 100.0 * months, 2)


def _salary_only_tax(inp: dict, rules: dict, regime: str) -> float:
    salary_only = copy.deepcopy(inp)
    for section in ("other_income", "capital_gains"):
        salary_only[section] = {k: 0.0 for k in salary_only[section]}
    salary_only["advance_tax_payments"] = []
    return compute(salary_only, rules)["regimes"][regime]["total_tax"]


def advance_tax_schedule(raw_inputs: dict, rules: dict, today: Optional[date] = None,
                         expected_tds: Optional[float] = None, regime: Optional[str] = None) -> dict:
    today = today or date.today()
    if regime not in (None, "old", "new"):
        raise TaxInputError("regime must be 'old', 'new' or omitted")
    if expected_tds is not None and expected_tds < 0:
        raise TaxInputError("expected_tds cannot be negative")
    inp = normalize_inputs(raw_inputs)
    result = compute(inp, rules)
    key = regime or inp["profile"]["selected_regime"] or result["comparison"]["best_regime"]
    total_tax = result["regimes"][key]["total_tax"]
    rule = rules.get("advance_tax")
    filing = return_due_date(rules)
    base = {"financial_year": rules["financial_year"], "regime": key, "total_tax": total_tax,
            "return_due_date": filing.isoformat() if filing else None}
    if not rule:
        return {**base, "available": False, "required": False,
                "reason": "This year's rule set has no advance-tax rules. Copy the official set for this year, or add them in Tax Rules."}

    v = rule["value"]
    if expected_tds is None:
        tds, tds_basis = _salary_only_tax(inp, rules, key), "salary_only"
    else:
        tds, tds_basis = float(expected_tds), "entered"
    liability = max(total_tax - tds, 0.0)
    payments = inp["advance_tax_payments"]
    fy_start = _fy_start(rules)
    year_end = _on(fy_start, "03-31")

    profile = inp["profile"]
    senior = (v.get("senior_resident_without_business_income_exempt")
              and profile["residential_status"] != "non_resident"
              and profile["age"] >= rules["age_bands"]["value"]["senior_from_age"])
    if senior:
        required, reason = False, ("Resident senior citizens without business income don't pay advance tax; "
                                   "the balance is paid as self-assessment tax before filing.")
    elif liability < v["liability_threshold"]:
        required, reason = False, (f"Tax not covered by TDS ({liability:,.0f}) is below the advance-tax threshold "
                                   f"({v['liability_threshold']:,.0f}); pay it as self-assessment tax before filing.")
    else:
        required, reason = True, "Tax not covered by TDS is above the advance-tax threshold."

    unit = v.get("interest_rounding_unit") or 0
    instalments, deferment_total = [], 0.0
    for inst in v["instalments"]:
        due = _on(fy_start, inst["due"])
        cumulative_due = round(liability * inst["cumulative_pct"] / 100.0)
        paid_by = sum(p["amount"] for p in payments if p["date"] <= due.isoformat())
        shortfall = max(cumulative_due - paid_by, 0.0)
        safe = paid_by >= liability * inst["safe_harbour_pct"] / 100.0
        interest = 0.0 if (safe or not required) else _interest(shortfall, v["deferment_interest_pct_per_month"], inst["interest_months"], unit)
        past = today > due
        if past:
            status = "met" if shortfall <= 0 else "safe_harbour" if safe else "short"
            deferment_total += interest
        else:
            status = "upcoming"
        instalments.append({
            "due_date": due.isoformat(),
            "cumulative_pct": inst["cumulative_pct"],
            "cumulative_due": cumulative_due,
            "paid_by_due_date": round(paid_by, 2),
            "still_to_pay": round(shortfall, 2) if required else 0.0,
            "status": status if required else "not_required",
            "deferment_interest": interest if past else 0.0,
            "interest_if_unpaid": interest if not past else 0.0,
        })

    paid_in_year = sum(p["amount"] for p in payments if p["date"] <= year_end.isoformat())
    year_end_shortfall = None
    if required and paid_in_year < liability * v["shortfall_if_paid_below_pct"] / 100.0:
        short = liability - paid_in_year
        final = today > year_end
        year_end_shortfall = {
            "unpaid": round(short, 2),
            "interest_per_month": _interest(short, v["shortfall_interest_pct_per_month"], 1, unit),
            "from": _on(fy_start, "04-01", of_next_year=True).isoformat(),
            "final": final,
            "explanation": (f"Less than {v['shortfall_if_paid_below_pct']}% was paid by 31 March, so interest of "
                            f"{v['shortfall_interest_pct_per_month']}% a month runs on the unpaid tax from 1 April until it's paid."
                            if final else
                            f"If less than {v['shortfall_if_paid_below_pct']}% has been paid by 31 March, interest of "
                            f"{v['shortfall_interest_pct_per_month']}% a month runs on the unpaid tax from 1 April until it's paid. "
                            "With what's paid so far:"),
        }
    upcoming = [i for i in instalments if i["status"] == "upcoming" and i["still_to_pay"] > 0]
    return {
        **base,
        "available": True,
        "required": required,
        "reason": reason,
        "expected_tds": round(tds, 2),
        "tds_basis": tds_basis,
        "advance_tax_liability": round(liability, 2),
        "threshold": v["liability_threshold"],
        "payments": payments,
        "paid_total": round(sum(p["amount"] for p in payments), 2),
        "instalments": instalments,
        "deferment_interest_total": round(deferment_total, 2),
        "year_end_shortfall": year_end_shortfall,
        "next_due": upcoming[0] if upcoming else None,
        "rule": {"verification": rule["verification"], "legacy_section": rule.get("legacy_section"),
                 "act_2025_section": rule.get("act_2025_section"), "note": rule.get("note")},
        "notes": [
            ("TDS assumed to cover the tax on your salary (what your employer deducts); the rest is due as advance tax. "
             "Enter your own TDS figure if banks or others also deduct TDS.") if tds_basis == "salary_only"
            else "Using the TDS figure you entered.",
            "Tax on capital gains or dividends that arise after an instalment date can be paid in the remaining instalments "
            "without deferment interest; this schedule doesn't model that relief.",
        ],
    }
