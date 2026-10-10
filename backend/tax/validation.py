"""
Cross-cutting checks on a computation's inputs and results. They only ever produce
warnings for the user to review; they never change a computed figure (anything the
engine caps or disallows is already recorded as an audit line by engine.py).
"""
from typing import Dict, List

MONTHS_PER_YEAR = 12
# Monthly figures typed in whole rupees can drift from an annual figure by up to
# ₹1 per month through rounding; anything beyond that is flagged.
RECONCILIATION_TOLERANCE_PER_MONTH = 1.0
# Prepaid tax within this fraction of the computed liability is treated as reconciled.
TDS_RECONCILIATION_TOLERANCE = 0.05


def _warning(code: str, message: str, severity: str = "warning") -> dict:
    return {"code": code, "severity": severity, "regime": None, "message": message}


def input_warnings(inp: dict, rules: dict, results: Dict[str, dict]) -> List[dict]:
    warnings: List[dict] = []

    monthly = inp.get("salary_monthly") or {}
    for key, monthly_amount in monthly.items():
        if key not in inp["salary"]:
            warnings.append(_warning("monthly_component_unknown",
                                     f"Monthly figure given for '{key}' but there is no annual '{key}' component."))
            continue
        annual = inp["salary"][key]
        difference = annual - monthly_amount * MONTHS_PER_YEAR
        if abs(difference) > RECONCILIATION_TOLERANCE_PER_MONTH * MONTHS_PER_YEAR:
            warnings.append(_warning(
                "monthly_annual_mismatch",
                f"{key}: monthly {monthly_amount:,.0f} x 12 = {monthly_amount * MONTHS_PER_YEAR:,.0f}, "
                f"but annual is {annual:,.0f} (difference {difference:,.0f})."))

    payroll = inp["payroll_deductions"]
    for item_key, item_value in inp["deductions"]["80C"].items():
        for payroll_key in ("employee_epf", "vpf"):
            if item_value and payroll[payroll_key] and abs(item_value - payroll[payroll_key]) < 1:
                warnings.append(_warning(
                    "possible_duplicate_deduction",
                    f"80C '{item_key}' ({item_value:,.0f}) equals payroll {payroll_key}. Payroll EPF/VPF is already "
                    f"counted towards 80C automatically; remove it from the 80C list if it is the same contribution."))

    selected = inp["profile"]["selected_regime"]
    prepaid = inp["prepaid"]["tds"] + inp["prepaid"]["advance_tax"]
    if selected and prepaid:
        liability = results[selected]["total_tax"]
        if liability and abs(prepaid - liability) > liability * TDS_RECONCILIATION_TOLERANCE:
            gap = liability - prepaid
            warnings.append(_warning(
                "tds_not_reconciled",
                f"TDS + advance tax ({prepaid:,.0f}) differs from the computed {selected}-regime liability "
                f"({liability:,.0f}) by {abs(gap):,.0f}: "
                + ("additional tax would be payable." if gap > 0 else "a refund would be due.")))

    flagged = {}
    for regime_result in results.values():
        for line in regime_result["audit"]:
            if line.get("verification") in ("unverified", "assumption", "user_entered") and line.get("rule_ref"):
                flagged.setdefault(line["rule_ref"], line["verification"])
    for level in sorted(set(flagged.values())):
        refs = sorted(ref for ref, lvl in flagged.items() if lvl == level)
        warnings.append(_warning(
            f"rule_{level}",
            f"This result uses {len(refs)} rule(s) marked '{level}' in rule set {rules['rule_set_id']}: "
            + ", ".join(refs) + ".", "info"))

    if any(line.get("verification") == "secondary_source"
           for regime_result in results.values() for line in regime_result["audit"]):
        warnings.append(_warning(
            "rules_secondary_source",
            f"Some rules in {rules['rule_set_id']} are confirmed only from secondary sources so far; "
            f"verify against the official Act/Finance Act text before filing.", "info"))

    return warnings
