"""Break-even and sensitivity analysis: every answer is checked against fresh engine runs."""
import pytest
from fastapi.testclient import TestClient

from backend.tax.engine import TaxInputError, compute, normalize_inputs
from backend.tax.nps import apply_employer_nps
from backend.tax.rules_loader import load_rule_set
from backend.tax.sensitivity import (
    add_old_regime_deductions, nps_for_target_saving, scale_cash_salary, sensitivity,
)

RULES = load_rule_set("2026-27")
SPEC = {"salary": {"basic": 2702250, "hra": 1080900, "special_allowance": 1621350},
        "payroll_deductions": {"employee_epf": 36000}}
WITH_RENT = {**SPEC, "hra": {"rent_paid_monthly": 80000}, "profile": {"city": "Pune"}}


def tax(inputs, regime):
    return compute(inputs, RULES)["regimes"][regime]["total_tax"]


def test_break_even_is_the_smallest_extra_deduction_that_makes_old_no_dearer():
    # No rent: old 16,10,810 vs new 13,48,600, so the old regime needs more deductions.
    result = sensitivity(SPEC, RULES)["break_even"]
    assert result["status"] == "found"
    needed = result["additional_deductions_needed"]
    inp = normalize_inputs(SPEC)
    assert tax(add_old_regime_deductions(inp, needed), "old") <= result["new_tax"]
    assert tax(add_old_regime_deductions(inp, needed - 100), "old") > result["new_tax"]


def test_break_even_reports_margin_when_old_is_already_cheaper():
    result = sensitivity(WITH_RENT, RULES)["break_even"]
    assert result["status"] == "old_already_cheaper"
    assert result["margin"] == result["new_tax"] - result["old_tax"] > 0


def test_salary_sweep_factor_one_is_the_base():
    s = sensitivity(SPEC, RULES)
    one = next(r for r in s["salary_sweep"] if r["factor"] == 1.0)
    assert (one["old_tax"], one["new_tax"]) == (s["base"]["old_tax"], s["base"]["new_tax"]) == (1610810, 1348600)
    taxes = [r["best_tax"] for r in s["salary_sweep"]]
    assert taxes == sorted(taxes)  # more salary never means less tax


def test_bonus_sweep_reports_tax_on_the_bonus():
    rows = sensitivity(SPEC, RULES)["bonus_sweep"]
    assert rows[0]["bonus"] == 0 and rows[0]["extra_tax"] == 0
    for r in rows[1:]:
        assert r["bonus_kept"] == pytest.approx(r["bonus"] - r["extra_tax"])
        assert r["tax_rate_on_bonus_pct"] == pytest.approx(r["extra_tax"] / r["bonus"] * 100, abs=0.01)


def test_basic_share_sweep_at_current_share_matches_base():
    s = sensitivity(WITH_RENT, RULES)
    assert s["current_basic_share_pct"] == pytest.approx(50)
    fifty = next(r for r in s["basic_share_sweep"] if r["basic_share_pct"] == 50)
    assert fifty["old_tax"] == s["base"]["old_tax"]
    # Higher basic share raises the employer-NPS headroom (limit is a % of basic + DA).
    limits = [r["employer_nps_limit_new"] for r in s["basic_share_sweep"] if r["feasible"]]
    assert limits == sorted(limits)


def test_basic_share_that_needs_negative_special_allowance_is_marked_infeasible():
    lean = {"salary": {"basic": 500000, "hra": 400000, "special_allowance": 100000}}
    rows = sensitivity(lean, RULES)["basic_share_sweep"]
    assert any(not r["feasible"] for r in rows)


def test_nps_for_target_saving_is_minimal():
    result = nps_for_target_saving(SPEC, RULES, 200000, regime="new")
    assert result["status"] == "found"
    inp = normalize_inputs(SPEC)
    base_tax = tax(inp, "new")
    saving = lambda c: base_tax - tax(apply_employer_nps(inp, c, "restructure", "special_allowance")["inputs"], "new")
    assert saving(result["contribution_annual"]) >= 200000
    assert saving(result["contribution_annual"] - 100) < 200000


def test_nps_target_beyond_the_limit_is_not_reachable():
    result = nps_for_target_saving(SPEC, RULES, 900000, regime="new")
    assert result["status"] == "not_reachable"
    assert result["max_saving"] == 1348600 - 1107970  # the 14% reference figures


def test_nps_target_validation():
    with pytest.raises(TaxInputError):
        nps_for_target_saving(SPEC, RULES, 0)
    with pytest.raises(TaxInputError):
        nps_for_target_saving(SPEC, RULES, 1000, regime="maybe")


def test_monthly_mode_adjustments_change_the_months():
    months = [{"label": str(i), "status": "projected",
               "salary": {"basic": 2702250 / 12, "hra": 1080900 / 12, "special_allowance": 1621350 / 12},
               "payroll_deductions": {"employee_epf": 3000}, "employer_contributions": {}, "tds": None, "rent_paid": 0}
              for i in range(12)]
    monthly = {"monthly": {"enabled": True, "months": months}}
    scaled = scale_cash_salary(normalize_inputs(monthly), 1.2)
    assert scaled["salary"]["basic"] == pytest.approx(2702250 * 1.2)
    assert scaled["monthly"]["months"][0]["salary"]["basic"] == pytest.approx(2702250 / 12 * 1.2)
    # Same answers as annual entry for the same totals.
    assert sensitivity(monthly, RULES)["base"]["new_tax"] == sensitivity(SPEC, RULES)["base"]["new_tax"]


def test_sensitivity_routes(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        s = client.post("/api/tax/sensitivity", json={"financial_year": "2026-27", "inputs": SPEC})
        t = client.post("/api/tax/nps-target", json={"financial_year": "2026-27", "inputs": SPEC, "target_saving": 100000, "regime": "new"})
        bad = client.post("/api/tax/sensitivity", json={"inputs": SPEC, "bonus_month": 12})
    assert s.status_code == 200 and len(s.json()["salary_sweep"]) == 7
    assert t.status_code == 200 and t.json()["status"] == "found"
    assert bad.status_code == 422
