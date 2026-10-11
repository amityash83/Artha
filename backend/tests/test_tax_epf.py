"""EPF helper (dated wage ceiling, split month) and the payslip's single-month view."""
import copy

import pytest
from fastapi.testclient import TestClient

from backend.tax.engine import TaxInputError, compute
from backend.tax.epf import fy_months, suggest_epf
from backend.tax.payroll import payslip
from backend.tax.rules_loader import RuleSetError, load_epf_rules, load_rule_set, validate_epf_rules

RULES = load_rule_set("2026-27")
BASIC, HRA, SPECIAL = 2702250, 1080900, 1621350
HIGH = [BASIC / 12] * 12


def test_fy_months_run_april_to_march():
    months = fy_months("2026-27")
    assert (months[0].year, months[0].month) == (2026, 4)
    assert (months[-1].year, months[-1].month) == (2027, 3)


def test_ceiling_basis_switches_mid_september_2026():
    # 12% x 15,000 = 1,800 until 16 Sep; 12% x 25,000 = 3,000 from 17 Sep.
    # September: 1,800 x 16/30 + 3,000 x 14/30 = 960 + 1,400 = 2,360.
    r = suggest_epf("2026-27", HIGH, "ceiling")
    assert [m["epf"] for m in r["months"]] == [1800] * 5 + [2360] + [3000] * 6
    assert r["annual"] == 29360
    assert [c["amount"] for c in r["ceiling_changes"]] == [25000]
    sep = r["months"][5]
    assert [(c["amount"], c["days"]) for c in sep["ceilings"]] == [(15000, 16), (25000, 14)]
    assert "split by days" in sep["explanation"]


def test_wages_below_a_ceiling_are_not_capped():
    # 20,000 wages: under the old ceiling capped at 15,000; under the new one fully counted.
    # September: 1,800 x 16/30 + 2,400 x 14/30 = 960 + 1,120 = 2,080.
    r = suggest_epf("2026-27", [20000.0] * 12, "ceiling")
    assert [m["epf"] for m in r["months"]] == [1800] * 5 + [2080] + [2400] * 6
    low = suggest_epf("2026-27", [10000.0] * 12, "ceiling")
    assert {m["epf"] for m in low["months"]} == {1200}


def test_full_basis_ignores_the_ceiling():
    r = suggest_epf("2026-27", HIGH, "full")
    assert r["months"][0]["epf"] == 27023  # 12% of 2,25,187.50 = 27,022.50, rounded half up as EPFO does
    assert r["ceiling_changes"] == []


def test_a_year_without_a_change_uses_one_ceiling():
    r = suggest_epf("2027-28", HIGH, "ceiling")
    assert r["annual"] == 36000 and r["ceiling_changes"] == []


@pytest.mark.parametrize("wages,basis", [([1.0] * 11, "ceiling"), ([-1.0] * 12, "ceiling"), (HIGH, "statutory")])
def test_bad_requests_are_rejected(wages, basis):
    with pytest.raises(TaxInputError):
        suggest_epf("2026-27", wages, basis)


def test_epf_rules_validation():
    good = copy.deepcopy(load_epf_rules())
    validate_epf_rules(good)
    for breaking in (
        lambda r: r["wage_ceiling_monthly"]["value"].reverse(),
        lambda r: r["wage_ceiling_monthly"]["value"][0].update(amount=0),
        lambda r: r["wage_ceiling_monthly"]["value"][0].update(verification="user_entered"),
        lambda r: r["wage_ceiling_monthly"]["value"][0].update(source="nope"),
    ):
        bad = copy.deepcopy(good)
        breaking(bad)
        with pytest.raises(RuleSetError):
            validate_epf_rules(bad)


# --- payslip for one month -------------------------------------------------------

def _months():
    epf = [1800] * 5 + [2360] + [3000] * 6
    labels = [m.strftime("%b %Y") for m in fy_months("2026-27")]
    return [{
        "label": labels[i], "status": "actual" if i < 3 else "projected",
        "salary": {"basic": BASIC / 12, "hra": HRA / 12, "special_allowance": SPECIAL / 12},
        "payroll_deductions": {"employee_epf": epf[i]}, "employer_contributions": {},
        "tds": 100000 if i < 3 else None, "rent_paid": 0,
    } for i in range(12)]


MONTHLY = {"monthly": {"enabled": True, "months": _months()}}


def test_payslip_shows_the_chosen_months_own_figures():
    april = payslip(MONTHLY, RULES, regime_before="new", regime_after="new", month_index=0)
    october = payslip(MONTHLY, RULES, regime_before="new", regime_after="new", month_index=6)
    assert april["month"]["label"] == "Apr 2026" and april["month"]["status"] == "actual"
    assert april["before"]["payroll_deductions"]["employee_epf"] == 1800
    assert april["before"]["tds_monthly"] == 100000 and april["before"]["tds_basis"] == "month_actual"
    assert october["before"]["payroll_deductions"]["employee_epf"] == 3000
    projected = compute(MONTHLY, RULES)["regimes"]["new"]["monthly"]["months"][6]["tds"]
    assert october["before"]["tds_monthly"] == pytest.approx(projected)
    assert october["before"]["tds_basis"] == "month_projected"
    assert october["before"]["net_in_hand_monthly"] == pytest.approx(
        october["before"]["gross_monthly_cash"] - 3000 - projected, abs=0.02)


def test_payslip_without_a_month_is_the_average_month():
    avg = payslip(MONTHLY, RULES, regime_before="new", regime_after="new")
    assert avg["month"] is None
    assert avg["before"]["payroll_deductions"]["employee_epf"] == pytest.approx(29360 / 12, abs=0.01)
    assert avg["before"]["tds_basis"] == "average"


def test_month_is_ignored_with_annual_entry():
    annual = {"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL}, "payroll_deductions": {"employee_epf": 36000}}
    out = payslip(annual, RULES, month_index=6)
    assert out["month"] is None and out["before"]["payroll_deductions"]["employee_epf"] == 3000


def test_payslip_month_with_nps_restructure_moves_that_months_cash():
    out = payslip(MONTHLY, RULES, {"employer_nps_pct": 10, "funding": "restructure"}, "new", "new", month_index=6)
    assert out["after"]["employer_nps_monthly"] == pytest.approx(BASIC * 0.10 / 12, abs=0.05)
    assert out["after"]["employer_nps_annual"] == pytest.approx(BASIC * 0.10, abs=0.5)
    assert out["after"]["earnings"]["special_allowance"] == pytest.approx(SPECIAL / 12 - BASIC * 0.10 / 12, abs=0.05)


def test_epf_and_payslip_routes(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        epf = client.post("/api/tax/epf-suggestion", json={"financial_year": "2026-27", "wages": HIGH})
        bad = client.post("/api/tax/epf-suggestion", json={"financial_year": "2026-27", "wages": [1.0]})
        slip = client.post("/api/tax/payslip", json={"financial_year": "2026-27", "inputs": MONTHLY, "month_index": 5})
        bad_month = client.post("/api/tax/payslip", json={"financial_year": "2026-27", "inputs": MONTHLY, "month_index": 12})
    assert epf.status_code == 200 and epf.json()["annual"] == 29360
    assert bad.status_code == 422
    assert slip.status_code == 200 and slip.json()["before"]["payroll_deductions"]["employee_epf"] == 2360
    assert bad_month.status_code == 422
