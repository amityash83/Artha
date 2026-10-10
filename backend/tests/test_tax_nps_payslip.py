"""Corporate NPS optimiser, payslip simulator and savings waterfall."""
import pytest
from fastapi.testclient import TestClient

from backend.tax.engine import TaxInputError
from backend.tax.nps import apply_employer_nps, nps_scenarios
from backend.tax.payroll import payslip
from backend.tax.rules_loader import load_rule_set
from backend.tax.engine import normalize_inputs
from backend.tax.waterfall import tax_waterfall

RULES = load_rule_set("2026-27")
BASIC, HRA, SPECIAL = 2702250, 1080900, 1621350
SPEC = {"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL}}


def scenario(result, pct):
    return next(s for s in result["scenarios"] if s["pct_of_base"] == pct)


# ---------------------------------------------------------------------------
# NPS optimiser
# ---------------------------------------------------------------------------

def test_restructure_keeps_gross_salary_and_matches_engine_reference_figures():
    out = nps_scenarios(SPEC, RULES, regime="new")
    zero, ten, fourteen = scenario(out, 0), scenario(out, 10), scenario(out, 14)
    assert zero["tax_after"] == 1348600 and zero["tax_saved_annual"] == 0
    # Same figures as test_tax_engine's hand-computed references.
    assert ten["employer_nps_annual"] == 270225 and ten["tax_after"] == 1184850
    assert fourteen["employer_nps_annual"] == 378315 and fourteen["tax_after"] == 1107970
    assert fourteen["tax_saved_annual"] == 1348600 - 1107970
    # Restructuring: CTC unchanged, cash falls by exactly the contribution.
    assert fourteen["ctc_after"] == fourteen["ctc_before"]
    assert fourteen["cash_reduction_annual"] == 378315
    # In-hand change = tax saved - contribution; benefit = in-hand change + NPS = tax saved.
    assert fourteen["in_hand_change_annual"] == pytest.approx(240630 - 378315)
    assert fourteen["net_economic_benefit_annual"] == pytest.approx(240630)


def test_tax_saving_is_not_linear_in_contribution():
    out = nps_scenarios(SPEC, RULES, regime="new")
    per_rupee = [scenario(out, p)["tax_saved_per_rupee"] for p in (5, 10, 12, 14)]
    assert len(set(round(x, 3) for x in per_rupee)) == 4  # every level saves a different share


def test_over_ctc_adds_to_ctc_and_leaves_cash_untouched():
    b = scenario(nps_scenarios(SPEC, RULES, regime="new", funding="over_ctc", levels_pct=[14]), 14)
    # 14% of basic is within the new-regime limit: it enters salary and is fully deducted,
    # so tax and in-hand are unchanged while CTC and retirement savings rise.
    assert b["tax_after"] == 1348600
    assert b["in_hand_change_annual"] == 0
    assert b["ctc_after"] - b["ctc_before"] == 378315
    assert b["net_economic_benefit_annual"] == 378315


def test_contribution_above_regime_limit_is_flagged_and_partly_taxable():
    # Custom 20% of basic in the old regime (private-sector limit 10%).
    out = nps_scenarios(SPEC, RULES, regime="old", levels_pct=[], custom_pct=20)
    s = out["scenarios"][0]
    assert s["deductible_employer_nps"] == pytest.approx(BASIC * 0.10)
    codes = {f["code"] for f in s["flags"]}
    assert "employer_nps_above_limit" in codes and "unverified_rule" in codes


def test_aggregate_retirement_cap_flagged():
    inputs = {**SPEC, "employer_contributions": {"pf": 600000}}
    s = scenario(nps_scenarios(inputs, RULES, regime="new", levels_pct=[14]), 14)
    assert s["deductible_employer_nps"] == 150000  # 7.5L cap - 6L PF
    assert "retirement_aggregate_cap" in {f["code"] for f in s["flags"]}


def test_employer_policy_flags():
    unconfirmed = nps_scenarios(SPEC, RULES, levels_pct=[10])
    assert "employer_policy_unconfirmed" in {f["code"] for f in unconfirmed["scenarios"][0]["flags"]}
    offered = nps_scenarios(SPEC, RULES, levels_pct=[10, 14], offered_pcts=[10])
    assert not {f["code"] for f in scenario(offered, 10)["flags"]} & {"not_offered", "employer_policy_unconfirmed"}
    assert "not_offered" in {f["code"] for f in scenario(offered, 14)["flags"]}


def test_restructure_beyond_available_component_is_infeasible_and_capped():
    inputs = {"salary": {"basic": 2702250, "special_allowance": 100000}}
    applied = apply_employer_nps(normalize_inputs(inputs), 378315, "restructure", "special_allowance")
    assert applied["feasible"] is False
    assert applied["contribution"] == 100000
    assert applied["inputs"]["salary"]["special_allowance"] == 0


def test_restructure_moves_only_the_change_from_existing_nps():
    inputs = {**SPEC, "employer_contributions": {"nps": 100000}}
    applied = apply_employer_nps(normalize_inputs(inputs), 300000, "restructure", "special_allowance")
    assert applied["inputs"]["salary"]["special_allowance"] == SPECIAL - 200000


def test_custom_monthly_amount_and_bad_options():
    out = nps_scenarios(SPEC, RULES, levels_pct=[], custom_monthly_amount=20000)
    assert out["scenarios"][0]["employer_nps_annual"] == 240000
    with pytest.raises(TaxInputError):
        nps_scenarios(SPEC, RULES, funding="sideways")
    with pytest.raises(TaxInputError):
        nps_scenarios(SPEC, RULES, restructure_from="nonexistent")


# ---------------------------------------------------------------------------
# Payslip
# ---------------------------------------------------------------------------

def test_payslip_uses_average_tds_when_no_payroll_figure():
    ps = payslip({**SPEC, "payroll_deductions": {"employee_epf": 36000}}, RULES, regime_before="new", regime_after="new")
    before = ps["before"]
    assert before["tds_basis"] == "average"
    assert before["tds_monthly"] == pytest.approx(1348600 / 12, abs=0.01)
    assert before["gross_monthly_cash"] == pytest.approx(5404500 / 12, abs=0.01)
    assert before["net_in_hand_monthly"] == pytest.approx((5404500 - 36000 - 1348600) / 12, abs=0.01)


def test_payslip_uses_actual_payroll_tds_and_keeps_engine_average_for_comparison():
    ps = payslip(SPEC, RULES, regime_before="new", actual_monthly_tds_before=120000)
    assert ps["before"]["tds_basis"] == "payroll_actual"
    assert ps["before"]["tds_monthly"] == 120000
    assert ps["before"]["engine_average_tds_monthly"] == pytest.approx(1348600 / 12, abs=0.01)


def test_payslip_before_after_nps_restructure():
    ps = payslip(SPEC, RULES, {"employer_nps_pct": 14, "funding": "restructure"}, "new", "new")
    d = ps["difference"]
    assert d["annual_tax_saved"] == 240630
    assert ps["after"]["employer_nps_monthly"] == pytest.approx(378315 / 12, abs=0.01)
    # Employer NPS is never counted as cash.
    assert ps["after"]["gross_monthly_cash"] == pytest.approx((5404500 - 378315) / 12, abs=0.01)
    assert d["monthly_cash_change"] == pytest.approx((240630 - 378315) / 12, abs=0.01)
    assert d["net_monthly_impact"] == pytest.approx(240630 / 12, abs=0.01)


# ---------------------------------------------------------------------------
# Waterfall
# ---------------------------------------------------------------------------

RICH = {**SPEC, "hra": {"rent_paid_monthly": 80000}, "profile": {"city": "Pune"},
        "payroll_deductions": {"employee_epf": 36000, "professional_tax": 2500},
        "employer_contributions": {"nps": 100000},
        "deductions": {"80C": {"ppf": 150000}, "80D_self_family": 25000, "home_loan_interest_self_occupied": 250000}}


@pytest.mark.parametrize("regime", ["old", "new"])
def test_waterfall_steps_sum_exactly_to_final_tax(regime):
    w = tax_waterfall(RICH, RULES, regime)
    assert w["consistent"] is True
    assert w["baseline_tax"] + sum(s["effect"] for s in w["steps"]) == pytest.approx(w["final_tax"])
    assert all(s["effect"] <= 0 for s in w["steps"])


def test_waterfall_new_regime_only_moves_on_new_regime_items():
    steps = {s["key"]: s["effect"] for s in tax_waterfall(RICH, RULES, "new")["steps"]}
    assert steps["exemptions"] == 0 and steps["investments"] == 0 and steps["home_loan"] == 0
    assert steps["standard_deduction"] < 0 and steps["employer_nps"] < 0


def test_waterfall_baseline_definition():
    # New regime baseline: no standard deduction, NPS taxed as salary. Gross 55,04,500
    # (54,04,500 cash + 1,00,000 NPS) all taxable: slab 3,00,000 + 31,04,500 x 30% = 12,31,350;
    # surcharge 10% = 1,23,135 (ceiling 10,80,000 + 5,04,500 not binding); cess 54,179.40
    # -> 14,08,664.40 -> 14,08,660.
    assert tax_waterfall(RICH, RULES, "new")["baseline_tax"] == 1408660


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_phase3_routes(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        nps = client.post("/api/tax/nps-scenarios", json={"financial_year": "2026-27", "inputs": SPEC, "regime": "new"})
        slip = client.post("/api/tax/payslip", json={"financial_year": "2026-27", "inputs": SPEC,
                                                     "optimization": {"employer_nps_pct": 14}, "regime_after": "new"})
        fall = client.post("/api/tax/waterfall", json={"financial_year": "2026-27", "inputs": RICH, "regime": "old"})
        bad = client.post("/api/tax/nps-scenarios", json={"inputs": SPEC, "funding": "sideways"})
    assert nps.status_code == 200 and len(nps.json()["scenarios"]) == 5
    assert slip.status_code == 200 and slip.json()["difference"]["annual_tax_saved"] > 0
    assert fall.status_code == 200 and fall.json()["consistent"] is True
    assert bad.status_code == 422


def test_after_tds_is_adjusted_from_actual_payroll_figure_when_only_before_is_known():
    ps = payslip(SPEC, RULES, {"employer_nps_pct": 14, "funding": "restructure"}, "new", "new",
                 actual_monthly_tds_before=100000)
    assert ps["after"]["tds_basis"] == "payroll_adjusted"
    # Tax falls by 2,40,630 a year -> 20,052.50 a month off the actual figure.
    assert ps["after"]["tds_monthly"] == pytest.approx(100000 - 240630 / 12, abs=0.01)


def test_negative_contribution_levels_rejected():
    with pytest.raises(TaxInputError):
        nps_scenarios(SPEC, RULES, levels_pct=[-5])
    with pytest.raises(TaxInputError):
        nps_scenarios(SPEC, RULES, custom_monthly_amount=-1)
