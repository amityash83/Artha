"""
Tax savings waterfall: how much each group of exemptions/deductions reduces tax.

Each item's effect is measured incrementally against a clearly defined baseline,
never by summing per-item marginal estimates (deductions interact with surcharge
thresholds, marginal relief and the rebate). The baseline is the same engine run on
a copy of the rule set with every exemption and deduction switched off (including
the standard deduction, professional tax and self-occupied home-loan interest);
groups are then switched back on one at a time in a fixed order, recomputing the
full tax after each. The steps therefore always sum exactly to final - baseline.

Employer NPS stays in salary at the baseline (it is salary under the Act) but isn't
deducted, i.e. it is taxed as if paid in cash.
"""
import copy
from typing import Callable, List, Tuple

from backend.tax.engine import TaxInputError, compute, normalize_inputs

INVESTMENT_DEDUCTIONS = ("80C", "80CCD1", "80CCD1B")


def _switch_off(rules: dict, regime: str) -> dict:
    off = copy.deepcopy(rules)
    reg = off["regimes"][regime]
    reg["standard_deduction"]["value"] = 0
    reg["professional_tax"]["value"]["allowed"] = False
    reg["hra"]["value"]["allowed"] = False
    reg["allowance_exemptions"]["value"]["allowed"] = False
    reg["house_property_loss_setoff_cap"]["value"] = 0
    reg["deductions"]["value"]["allowed"] = []
    return off


def tax_waterfall(raw_inputs: dict, rules: dict, regime: str) -> dict:
    if regime not in ("old", "new"):
        raise TaxInputError("regime must be 'old' or 'new'")
    inp = normalize_inputs(raw_inputs)
    original = rules["regimes"][regime]
    allowed = list(original["deductions"]["value"]["allowed"])
    other = [d for d in allowed if d not in INVESTMENT_DEDUCTIONS and d != "employer_nps"]

    def restore(key: str) -> Callable[[dict, dict], None]:
        def apply(r: dict, _inp: dict) -> None:
            r["regimes"][regime][key] = copy.deepcopy(original[key])
        return apply

    def allow(keys) -> Callable[[dict, dict], None]:
        def apply(r: dict, _inp: dict) -> None:
            current = r["regimes"][regime]["deductions"]["value"]["allowed"]
            current.extend(k for k in keys if k in allowed and k not in current)
        return apply

    def restore_exempt_inputs(_r: dict, i: dict) -> None:
        i["exempt_allowances"]["other_old"] = inp["exempt_allowances"]["other_old"]
        i["exempt_allowances"]["other_new"] = inp["exempt_allowances"]["other_new"]

    steps: List[Tuple[str, str, List[Callable[[dict, dict], None]]]] = [
        ("exemptions", "HRA and allowance exemptions",
         [restore("hra"), restore("allowance_exemptions"), restore_exempt_inputs]),
        ("standard_deduction", "Standard deduction and professional tax",
         [restore("standard_deduction"), restore("professional_tax")]),
        ("investments", "Eligible investments (80C, 80CCD(1), 80CCD(1B))", [allow(INVESTMENT_DEDUCTIONS)]),
        ("home_loan", "Home loan interest", [restore("house_property_loss_setoff_cap")]),
        ("employer_nps", "Employer NPS", [allow(["employer_nps"])]),
        ("other_deductions", "Other deductions (80D, 80E, 80G, 80TTA/80TTB, other)", [allow(other)]),
    ]

    state_rules = _switch_off(rules, regime)
    state_inputs = copy.deepcopy(inp)
    state_inputs["exempt_allowances"]["other_old"] = 0.0
    state_inputs["exempt_allowances"]["other_new"] = 0.0

    baseline = compute(state_inputs, state_rules)["regimes"][regime]
    running = baseline["total_tax"]
    out = []
    for key, label, patches in steps:
        for patch in patches:
            patch(state_rules, state_inputs)
        after = compute(state_inputs, state_rules)["regimes"][regime]
        out.append({
            "key": key,
            "label": label,
            "effect": round(after["total_tax"] - running, 2),
            "tax_after_step": after["total_tax"],
        })
        running = after["total_tax"]

    final = compute(inp, rules)["regimes"][regime]
    return {
        "regime": regime,
        "rule_set": {"rule_set_id": rules["rule_set_id"], "version": rules["version"]},
        "baseline_tax": baseline["total_tax"],
        "baseline_taxable_income": baseline["total_income"],
        "steps": out,
        "final_tax": final["total_tax"],
        "consistent": abs(running - final["total_tax"]) < 0.01,
        "baseline_definition": "Tax with every exemption and deduction switched off, including the standard deduction; "
                               "employer NPS is taxed as salary without its deduction.",
    }
