"""Month-by-month salary entry: annual totals, monthly HRA, TDS projection, NPS spread."""
import pytest

from backend.tax.engine import TaxInputError, compute, normalize_inputs
from backend.tax.nps import nps_scenarios
from backend.tax.rules_loader import load_rule_set

RULES = load_rule_set("2026-27")
BASIC, HRA, SPECIAL = 2702250, 1080900, 1621350
LABELS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]


def month(i, **over):
    m = {
        "label": LABELS[i],
        "status": "projected",
        "salary": {"basic": BASIC / 12, "hra": HRA / 12, "special_allowance": SPECIAL / 12},
        "payroll_deductions": {"employee_epf": 3000},
        "employer_contributions": {},
        "tds": None,
        "rent_paid": 0,
    }
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(m.get(k), dict):
            m[k] = {**m[k], **v}
        else:
            m[k] = v
    return m


def monthly_inputs(months, **extra):
    return {"monthly": {"enabled": True, "months": months}, **extra}


def regime(inputs, which):
    return compute(inputs, RULES)["regimes"][which]


def test_uniform_months_give_the_same_tax_as_annual_entry():
    annual = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL},
                     "payroll_deductions": {"employee_epf": 36000}}, "new")
    monthly = regime(monthly_inputs([month(i) for i in range(12)]), "new")
    assert monthly["total_tax"] == annual["total_tax"] == 1348600
    assert monthly["gross_salary"] == pytest.approx(5404500)


def test_annual_fields_are_derived_from_months_when_enabled():
    inp = normalize_inputs(monthly_inputs([month(i) for i in range(12)], salary={"basic": 1}))
    assert inp["salary"]["basic"] == pytest.approx(BASIC)  # the annual figure entered is ignored
    assert inp["payroll_deductions"]["employee_epf"] == pytest.approx(36000)


def test_disabled_monthly_section_is_kept_but_ignored():
    inputs = {"salary": {"basic": BASIC}, "monthly": {"enabled": False, "months": [month(i) for i in range(12)]}}
    assert regime(inputs, "new")["gross_salary"] == BASIC


def test_quarterly_bonus_is_counted_in_the_year():
    # 1L bonus in Jun, Sep, Dec, Mar -> gross 58,04,500; TI 57,29,500. Slab 3,00,000 +
    # 33,29,500 x 30% = 12,98,850; surcharge 10% 1,29,885 (no marginal relief); cess 57,149.40
    # -> 14,85,884.40 -> 14,85,880.
    months = [month(i, salary={"bonus": 100000} if LABELS[i] in ("Jun", "Sep", "Dec", "Mar") else {}) for i in range(12)]
    r = regime(monthly_inputs(months), "new")
    assert r["cash_salary"] == pytest.approx(5804500)
    assert r["total_tax"] == 1485880


def test_monthly_hra_matches_annual_for_steady_rent():
    # Every month: rent 80,000 - 10% of basic 22,518.75 = 57,481.25 (binds) -> x12 = 6,89,775,
    # the same as the annual calculation.
    months = [month(i, rent_paid=80000) for i in range(12)]
    r = regime(monthly_inputs(months, profile={"city": "Pune"}), "old")
    assert r["hra"]["exemption"] == pytest.approx(689775)
    assert r["hra"]["computed_monthly"] is True


def test_monthly_hra_handles_rent_changing_mid_year():
    # Apr-Sep rent 80,000: 57,481.25 each; Oct-Mar rent 20,000 < 10% of basic -> 0.
    # Total 3,44,887.50. (An annual average rent of 50,000 would wrongly give 3,29,775.)
    months = [month(i, rent_paid=80000 if i < 6 else 20000) for i in range(12)]
    r = regime(monthly_inputs(months, profile={"city": "Pune"}), "old")
    assert r["hra"]["exemption"] == pytest.approx(344887.5)
    assert [p["exemption"] > 0 for p in r["hra"]["per_month"]] == [True] * 6 + [False] * 6


def test_monthly_hra_uses_each_months_metro_setting():
    # Rent 1,50,000; 50% (metro) of 2,25,187.50 = 1,12,593.75, 40% = 90,075; HRA received 90,075.
    # Metro months bind on HRA received (90,075); non-metro months bind on 40% (90,075) too,
    # so use a bigger HRA to separate them: HRA 1,20,000 -> metro 1,12,593.75, non-metro 90,075.
    months = [month(i, rent_paid=150000, salary={"hra": 120000}, metro=(i >= 6)) for i in range(12)]
    r = regime(monthly_inputs(months), "old")
    assert r["hra"]["exemption"] == pytest.approx(6 * 90075 + 6 * 112593.75)


def test_tds_projection_spreads_tax_still_due_over_remaining_months():
    # 3 actual months with 1,10,000 TDS each = 3,30,000 paid. Tax 13,48,600 -> 10,18,600 still
    # due over 9 projected months = 1,13,177.78 a month.
    months = [month(i, status="actual", tds=110000) if i < 3 else month(i) for i in range(12)]
    r = regime(monthly_inputs(months), "new")
    m = r["monthly"]
    assert m["tds_paid_to_date"] == 330000
    assert m["tax_still_due"] == pytest.approx(1018600)
    assert m["suggested_tds_per_remaining_month"] == pytest.approx(113177.78, abs=0.01)
    assert [row["tds_basis"] for row in m["months"]] == ["actual"] * 3 + ["projected"] * 9
    # Month take-home = gross - deductions - TDS
    first = m["months"][0]
    assert first["in_hand"] == pytest.approx(first["gross_cash"] - 3000 - 110000)


def test_over_deducted_tds_shows_expected_refund():
    months = [month(i, status="actual", tds=200000) for i in range(12)]  # 24L deducted vs 13,48,600 due
    m = regime(monthly_inputs(months), "new")["monthly"]
    assert m["tax_still_due"] == 0
    assert m["expected_refund"] == pytest.approx(2400000 - 1348600)


def test_actual_month_without_tds_is_flagged():
    months = [month(0, status="actual")] + [month(i) for i in range(1, 12)]
    result = compute(monthly_inputs(months), RULES)
    assert "monthly_tds_missing" in {w["code"] for w in result["warnings"]}
    assert result["regimes"]["new"]["monthly"]["missing_tds_months"] == ["Apr"]


def test_nps_restructure_in_monthly_mode_matches_annual_and_follows_the_months():
    months = [month(i) for i in range(12)]
    out = nps_scenarios(monthly_inputs(months), RULES, levels_pct=[14], regime="new")
    s = out["scenarios"][0]
    assert s["employer_nps_annual"] == pytest.approx(378315)
    assert s["tax_after"] == 1107970  # same as the annual-entry reference


def test_nps_restructure_takes_more_from_bigger_months():
    # Special allowance doubled in March: March gives up twice as much as other months.
    months = [month(i, salary={"special_allowance": SPECIAL / 12 * (2 if i == 11 else 1)}) for i in range(12)]
    from backend.tax.nps import apply_employer_nps
    applied = apply_employer_nps(normalize_inputs(monthly_inputs(months)), 130000, "restructure", "special_allowance")
    moved = [m["employer_contributions"]["nps"] for m in applied["inputs"]["monthly"]["months"]]
    assert sum(moved) == pytest.approx(130000)
    assert moved[11] == pytest.approx(2 * moved[0])


@pytest.mark.parametrize("bad, message", [
    ({"monthly": {"enabled": True, "months": [month(0)]}}, "12 months"),
    ({"monthly": {"enabled": True, "months": [month(i, status="maybe") for i in range(12)]}}, "status"),
    ({"monthly": {"enabled": True, "months": [month(i, rent_paid=-1) for i in range(12)]}}, "negative"),
    ({"monthly": {"enabled": True, "months": [month(i, payroll_deductions={"bogus": 1}) for i in range(12)]}}, "Unknown input"),
])
def test_invalid_monthly_input_rejected(bad, message):
    with pytest.raises(TaxInputError, match=message):
        normalize_inputs(bad)


def test_lowering_nps_from_a_lumpy_source_never_goes_negative():
    # Existing NPS 1,000 every month; restructure source is a June-only bonus. Going to 0%
    # must hand each month's own 1,000 back (not 12,000 out of June), and still compute.
    months = [month(i, employer_contributions={"nps": 1000}, salary={"bonus": 50000 if i == 2 else 0}) for i in range(12)]
    from backend.tax.nps import apply_employer_nps
    applied = apply_employer_nps(normalize_inputs(monthly_inputs(months)), 0, "restructure", "bonus")
    after = applied["inputs"]["monthly"]["months"]
    assert all(m["employer_contributions"]["nps"] == pytest.approx(0) for m in after)
    assert all(m["salary"]["bonus"] >= 0 for m in after)
    assert sum(m["salary"]["bonus"] for m in after) == pytest.approx(50000 + 12000)
    out = nps_scenarios(monthly_inputs(months), RULES, levels_pct=[0], restructure_from="bonus", regime="new")
    assert out["scenarios"][0]["employer_nps_annual"] == pytest.approx(0)
