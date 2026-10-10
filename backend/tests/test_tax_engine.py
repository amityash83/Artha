"""
Tax engine tests. Expected figures are computed by hand from the law (the
arithmetic is shown in comments), never by running the engine, so a regression
can't silently become the new expected value.
"""
import pytest

from backend.tax.engine import TaxInputError, compute, normalize_inputs, round_to_nearest, slab_tax
from backend.tax.rules_loader import load_rule_set

RULES = load_rule_set("2026-27")
RULES_PREV = load_rule_set("2025-26")
NEW_SLABS = RULES["regimes"]["new"]["slabs"]["value"]["default"]

# Spec default salary structure (annual).
BASIC, HRA, SPECIAL = 2702250, 1080900, 1621350


def run(inputs, rules=RULES):
    return compute(inputs, rules)


def regime(inputs, which, rules=RULES):
    return run(inputs, rules)["regimes"][which]


def salary_only(amount, **profile):
    return {"salary": {"basic": amount}, "profile": profile}


def codes(result):
    return {w["code"] for w in result["warnings"]}


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("amount, expected", [
    (1234.4, 1230), (1235.0, 1240), (1234.99, 1230), (5329500, 5329500), (4951185, 4951190), (0, 0), (-5, 0),
])
def test_round_to_nearest_ten_ignores_paise_and_rounds_five_up(amount, expected):
    assert round_to_nearest(amount, 10) == expected


@pytest.mark.parametrize("income, expected", [
    (400000, 0), (400001, 0.05), (800000, 20000), (800001, 20000.10),
    (1200000, 60000), (1600000, 120000), (2000000, 200000), (2400000, 300000), (2400001, 300000.30),
])
def test_new_regime_slab_boundaries(income, expected):
    assert slab_tax(income, NEW_SLABS) == pytest.approx(expected)


# ---------------------------------------------------------------------------
# Spec reference scenarios (FY 2026-27)
# ---------------------------------------------------------------------------

def test_spec_default_salary_new_regime_includes_surcharge():
    # 54,04,500 - 75,000 SD = 53,29,500. Slabs: 3,00,000 to 24L + 29,29,500 x 30% = 11,78,850.
    # Surcharge 10% (>50L) = 1,17,885; at 50L tax is 10,80,000 so ceiling 10,80,000 + 3,29,500
    # = 14,09,500 > 12,96,735: no marginal relief. Cess 4% = 51,869.40. Total 13,48,604.40 -> 13,48,600.
    r = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL}}, "new")
    assert r["total_income"] == 5329500
    assert r["slab_tax"] == 1178850
    assert r["surcharge"] == 117885
    assert r["surcharge_marginal_relief"] == 0
    assert r["cess"] == pytest.approx(51869.40)
    assert r["total_tax"] == 1348600


def test_employer_nps_10pct_lands_in_surcharge_marginal_relief_band():
    # NPS 2,70,225 restructured out of special allowance; gross salary unchanged.
    # TI = 54,04,500 - 75,000 - 2,70,225 = 50,59,275 -> rounded 50,59,280.
    # Slab tax 3,00,000 + 26,59,280 x 30% = 10,97,784. Surcharge 10% = 1,09,778.40.
    # Ceiling = 10,80,000 + 59,280 = 11,39,280 -> surcharge limited to 41,496.
    # Cess 4% of 11,39,280 = 45,571.20 -> 11,84,851.20 -> 11,84,850.
    nps = 270225
    r = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL - nps},
                "employer_contributions": {"nps": nps}}, "new")
    assert r["gross_salary"] == BASIC + HRA + SPECIAL
    assert r["deductions"]["employer_nps"] == nps
    assert r["total_income"] == 5059280
    assert r["surcharge_before_marginal_relief"] == pytest.approx(109778.40)
    assert r["surcharge"] == pytest.approx(41496)
    assert r["total_tax"] == 1184850


def test_employer_nps_14pct_drops_below_surcharge_threshold():
    # NPS 3,78,315 (14% of basic). TI = 49,51,185 -> 49,51,190. Slab 3,00,000 + 25,51,190 x 30%
    # = 10,65,357. No surcharge. Cess 42,614.28 -> 11,07,971.28 -> 11,07,970.
    nps = 378315
    r = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL - nps},
                "employer_contributions": {"nps": nps}}, "new")
    assert r["total_income"] == 4951190
    assert r["surcharge"] == 0
    assert r["total_tax"] == 1107970


def test_spec_default_old_regime_counts_payroll_epf_in_80c():
    # 54,04,500 - 50,000 SD - 36,000 EPF (80C) = 53,18,500. Old slabs: 1,12,500 to 10L
    # + 43,18,500 x 30% = 14,08,050. Surcharge 10% = 1,40,805 (no relief: tax at 50L is
    # 13,12,500, ceiling 16,31,000). Cess 61,954.20. Total 16,10,809.20 -> 16,10,810.
    r = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL},
                "payroll_deductions": {"employee_epf": 36000}}, "old")
    assert r["deductions"]["80C"] == 36000
    assert r["total_income"] == 5318500
    assert r["slab_tax"] == 1408050
    assert r["surcharge"] == 140805
    assert r["total_tax"] == 1610810


def test_comparison_savings_is_old_minus_new():
    result = run({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL},
                  "payroll_deductions": {"employee_epf": 36000}})
    assert result["comparison"]["best_regime"] == "new"
    assert result["comparison"]["savings_old_minus_new"] == 1610810 - 1348600
    assert result["comparison"]["monthly_savings_old_minus_new"] == pytest.approx((1610810 - 1348600) / 12, abs=0.01)


# ---------------------------------------------------------------------------
# Rebate
# ---------------------------------------------------------------------------

def test_new_regime_rebate_zeroes_tax_at_12_lakh():
    r = regime(salary_only(1275000), "new")  # 12,75,000 - 75,000 = 12,00,000
    assert r["slab_tax"] == 60000 and r["rebate"] == 60000 and r["total_tax"] == 0


def test_new_regime_rebate_marginal_relief_just_above_12_lakh():
    # TI 12,10,000: slab tax 61,500, but tax may not exceed the 10,000 excess.
    # Rebate 51,500; cess 400; total 10,400.
    r = regime(salary_only(1285000), "new")
    assert r["rebate"] == 51500
    assert r["total_tax"] == 10400


def test_new_regime_rebate_marginal_relief_ends_when_excess_exceeds_tax():
    # TI 13,00,000: slab 75,000 < excess 1,00,000 -> no rebate. 75,000 x 1.04 = 78,000.
    r = regime(salary_only(1375000), "new")
    assert r["rebate"] == 0 and r["total_tax"] == 78000


def test_old_regime_rebate_full_at_5_lakh_and_none_above():
    assert regime(salary_only(550000), "old")["total_tax"] == 0  # TI 5,00,000: tax 12,500 fully rebated
    # TI 5,00,010: 12,500.50 tax, no rebate (no marginal relief in old regime) -> 13,000.52 -> 13,000
    assert regime(salary_only(550010), "old")["total_tax"] == 13000


def test_rebate_denied_to_non_residents():
    r = run(salary_only(1275000, residential_status="non_resident"))
    assert r["regimes"]["new"]["rebate"] == 0
    assert r["regimes"]["new"]["total_tax"] == 62400  # 60,000 x 1.04
    assert "rebate_not_available" in codes(r)


def test_new_regime_rebate_does_not_cover_special_rate_tax():
    # Normal income 10L (salary 10.75L) + STCG 111A 1L -> TI 11L <= 12L. Slab tax on 10L =
    # 40,000, fully rebated; the 20,000 STCG tax is not. 20,000 x 1.04 = 20,800.
    r = regime({"salary": {"basic": 1075000}, "capital_gains": {"stcg_111a": 100000}}, "new")
    assert r["rebate"] == 40000 and r["special_rate_tax"] == 20000 and r["total_tax"] == 20800


def test_unused_basic_exemption_offsets_special_rate_income_for_residents():
    # No other income, STCG 111A 5L. 4L unused exemption -> 1L taxable at 20% = 20,000 -> 20,800.
    r = regime({"capital_gains": {"stcg_111a": 500000}}, "new")
    assert r["special_rate_tax"] == 20000 and r["total_tax"] == 20800
    # Non-resident: no adjustment, full 5L at 20% = 1,00,000 -> 1,04,000.
    nr = regime({"capital_gains": {"stcg_111a": 500000}, "profile": {"residential_status": "non_resident"}}, "new")
    assert nr["total_tax"] == 104000


def test_ltcg_112a_exemption_applies_before_rate():
    # Salary 20.75L -> normal 20L (slab 2,00,000). LTCG 112A 3,25,000: 2,00,000 above the
    # 1,25,000 exemption at 12.5% = 25,000. Total (2,25,000) x 1.04 = 2,34,000.
    r = regime({"salary": {"basic": 2075000}, "capital_gains": {"ltcg_112a": 325000}}, "new")
    assert r["special_rate_tax"] == 25000 and r["total_tax"] == 234000


# ---------------------------------------------------------------------------
# Surcharge
# ---------------------------------------------------------------------------

def test_old_regime_marginal_relief_at_one_crore():
    # TI 1,00,10,000 (salary + 50,000 SD). Slab 1,12,500 + 90,10,000 x 30% = 28,15,500.
    # At 1Cr: 28,12,500 + 10% = 30,93,750; ceiling = 30,93,750 + 10,000 = 31,03,750.
    # Surcharge = 31,03,750 - 28,15,500 = 2,88,250. Cess 1,24,150. Total 32,27,900.
    r = regime(salary_only(10060000), "old")
    assert r["surcharge_rate_pct"] == 15
    assert r["surcharge"] == pytest.approx(288250)
    assert r["total_tax"] == 3227900


def test_new_regime_surcharge_capped_at_25_while_old_reaches_37():
    six_crore = 60000000
    new = regime(salary_only(six_crore + 75000), "new")
    old = regime(salary_only(six_crore + 50000), "old")
    assert new["surcharge_rate_pct"] == 25
    assert old["surcharge_rate_pct"] == 37
    # New: slab 3,00,000 + 5,76,00,000 x 30% = 1,75,80,000; 25% = 43,95,000.
    assert new["surcharge"] == pytest.approx(4395000)


def test_special_rate_income_surcharge_capped_at_15_percent():
    # Normal 2Cr (salary 2,00,75,000) + STCG 111A 1Cr: TI 3Cr -> 25%. Normal slab tax
    # 3,00,000 + 1,76,00,000 x 30% = 55,80,000 at 25% = 13,95,000; STCG tax 20,00,000 at
    # the 15% cap = 3,00,000. Surcharge 16,95,000.
    r = regime({"salary": {"basic": 20075000}, "capital_gains": {"stcg_111a": 10000000}}, "new")
    assert r["surcharge"] == pytest.approx(1695000)


@pytest.mark.parametrize("which, threshold", [
    ("new", 5000000), ("new", 10000000), ("new", 20000000),
    ("old", 5000000), ("old", 10000000), ("old", 20000000), ("old", 50000000),
])
def test_marginal_relief_property_tax_rises_no_faster_than_income(which, threshold):
    # Crossing a surcharge threshold by 10,000 must not raise tax + surcharge by more than
    # 10,000 (cess applies on top of both, so compare before cess).
    sd = RULES["regimes"][which]["standard_deduction"]["value"]
    at = regime(salary_only(threshold + sd), which)
    above = regime(salary_only(threshold + sd + 10000), which)
    before_cess = lambda r: r["tax_after_rebate"] + r["surcharge"]
    assert at["total_income"] == threshold
    assert before_cess(above) - before_cess(at) <= 10000 + 0.01
    assert above["surcharge_rate_pct"] > at["surcharge_rate_pct"]


# ---------------------------------------------------------------------------
# Age bands and residency
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("age, residency, expected", [
    (65, "resident", 31200),      # 3-5L @5% = 10,000 + 5-6L @20% = 20,000 -> 30,000 x 1.04
    (85, "resident", 20800),      # 5-6L @20% = 20,000 x 1.04
    (65, "non_resident", 33800),  # senior slabs are residents-only: 12,500 + 20,000 = 32,500 x 1.04
])
def test_old_regime_age_band_slabs(age, residency, expected):
    r = regime(salary_only(650000, age=age, residential_status=residency), "old")
    assert r["total_income"] == 600000 and r["total_tax"] == expected


# ---------------------------------------------------------------------------
# Deductions and exemptions
# ---------------------------------------------------------------------------

def test_80c_pool_includes_payroll_epf_and_is_capped():
    result = run({"salary": {"basic": 2000000}, "payroll_deductions": {"employee_epf": 36000},
                  "deductions": {"80C": {"ppf": 150000}}})
    assert result["regimes"]["old"]["deductions"]["80C"] == 150000
    assert "deduction_capped" in codes(result)


def test_employee_nps_fills_80ccd1b_first_then_80c_pool():
    r = regime({"salary": {"basic": 2000000}, "deductions": {"employee_nps": 80000}}, "old")
    assert r["deductions"]["80CCD1B"] == 50000
    assert r["deductions"]["80C"] == 30000


def test_80d_caps_depend_on_own_age_and_parents_seniority():
    inputs = {"salary": {"basic": 2000000}, "deductions": {"80D_self_family": 40000, "80D_parents": 60000,
                                                            "parents_senior": True}}
    assert regime(inputs, "old")["deductions"]["80D"] == 25000 + 50000
    inputs["profile"] = {"age": 62}  # self/family cap rises to 50,000; 40,000 premium now fully deductible
    assert regime(inputs, "old")["deductions"]["80D"] == 40000 + 50000


def test_self_occupied_home_loan_interest_capped_in_old_and_disallowed_in_new():
    inputs = {"salary": {"basic": 2000000}, "deductions": {"home_loan_interest_self_occupied": 300000}}
    result = run(inputs)
    assert result["regimes"]["old"]["house_property_income"] == -200000
    assert result["regimes"]["new"]["house_property_income"] == 0
    assert "home_loan_interest_not_allowed" in codes(result)


def test_let_out_property_gets_standard_deduction():
    # (3,60,000 rent - 10,000 municipal tax) x 70% = 2,45,000
    r = regime({"other_income": {"rental_gross": 360000, "rental_municipal_tax": 10000}}, "new")
    assert r["house_property_income"] == 245000


def test_80tta_for_non_seniors_and_80ttb_for_resident_seniors():
    base = {"salary": {"basic": 1500000}, "other_income": {"interest_savings": 15000, "interest_deposits": 60000}}
    assert regime(base, "old")["deductions"] == {"80TTA": 10000}
    senior = dict(base, profile={"age": 65})
    assert regime(senior, "old")["deductions"] == {"80TTB": 50000}


def test_new_regime_ignores_old_only_deductions_and_says_so():
    result = run({"salary": {"basic": 2000000}, "employer_contributions": {"nps": 100000},
                  "deductions": {"80C": {"ppf": 150000}, "80D_self_family": 25000, "employee_nps": 50000}})
    assert result["regimes"]["new"]["deductions"] == {"employer_nps": 100000}
    assert "old_regime_only_deductions" in codes(result)


@pytest.mark.parametrize("hra, rent_monthly, basic, city, binding, exemption", [
    # actual HRA binds: rent 6L - 1.2L = 4.8L; 50% of 12L = 6L; HRA 2L
    (200000, 50000, 1200000, "Mumbai", "actual_hra_received", 200000),
    # rent - 10% binds: 2.4L - 1.2L = 1.2L
    (600000, 20000, 1200000, "Mumbai", "rent_paid_minus_pct_of_salary", 120000),
    # % of salary binds (Pune is metro from 2026-27): 50% of 6L = 3L
    (500000, 60000, 600000, "Pune", "pct_of_salary", 300000),
    # non-metro: 40% of 6L = 2.4L
    (500000, 60000, 600000, "Indore", "pct_of_salary", 240000),
])
def test_hra_least_of_three(hra, rent_monthly, basic, city, binding, exemption):
    r = regime({"salary": {"basic": basic, "hra": hra}, "hra": {"rent_paid_monthly": rent_monthly},
                "profile": {"city": city}}, "old")
    assert r["hra"]["binding_component"] == binding
    assert r["hra"]["exemption"] == exemption


def test_hra_metro_list_follows_the_rule_set_year():
    inputs = {"salary": {"basic": 600000, "hra": 500000}, "hra": {"rent_paid_monthly": 60000},
              "profile": {"city": "Pune"}}
    assert regime(inputs, "old", RULES)["hra"]["exemption"] == 300000       # 50% in 2026-27
    assert regime(inputs, "old", RULES_PREV)["hra"]["exemption"] == 240000  # 40% in 2025-26


def test_hra_prorated_by_months_rented():
    # 6 months: HRA 1L, salary 6L, rent 3L -> rent - 10% = 2.4L; 50% = 3L; HRA 1L binds.
    r = regime({"salary": {"basic": 1200000, "hra": 200000},
                "hra": {"rent_paid_monthly": 50000, "months_rented": 6}, "profile": {"city": "Delhi"}}, "old")
    assert r["hra"]["exemption"] == 100000


def test_hra_not_exempt_in_new_regime():
    r = regime({"salary": {"basic": 1200000, "hra": 200000}, "hra": {"rent_paid_monthly": 50000}}, "new")
    assert r["salary_exemptions"] == 0


def test_children_allowance_limits_changed_between_years():
    inputs = {"salary": {"basic": 1500000, "special_allowance": 100000},
              "exempt_allowances": {"children_education_received": 100000, "children_education_children": 3}}
    # 2026-27: 3,000/month x 12 x 2 children (max) = 72,000; 2025-26: 100 x 12 x 2 = 2,400
    assert regime(inputs, "old", RULES)["salary_exemptions"] == 72000
    assert regime(inputs, "old", RULES_PREV)["salary_exemptions"] == 2400


def test_professional_tax_only_in_old_regime_and_capped():
    result = run({"salary": {"basic": 1500000}, "payroll_deductions": {"professional_tax": 3000}})
    assert result["regimes"]["old"]["professional_tax_deduction"] == 2500
    assert result["regimes"]["new"]["professional_tax_deduction"] == 0


# ---------------------------------------------------------------------------
# Employer contributions
# ---------------------------------------------------------------------------

def test_employer_nps_limited_to_regime_pct_of_basic_plus_da():
    inputs = {"salary": {"basic": 1000000, "da": 100000}, "employer_contributions": {"nps": 200000}}
    result = run(inputs)
    assert result["regimes"]["new"]["deductions"]["employer_nps"] == pytest.approx(154000)  # 14% of 11L
    assert result["regimes"]["old"]["deductions"]["employer_nps"] == pytest.approx(110000)  # 10% (private)
    assert "employer_nps_above_limit" in codes(result)
    assert "unverified_rule" in codes(result)  # old-regime limit unverified for 2026-27


def test_government_employer_gets_14pct_in_old_regime():
    r = regime({"salary": {"basic": 1000000}, "employer_contributions": {"nps": 200000},
                "profile": {"employer_type": "government"}}, "old")
    assert r["deductions"]["employer_nps"] == pytest.approx(140000)


def test_aggregate_retirement_cap_limits_nps_deduction():
    # PF 6L + NPS 3L vs 7.5L cap: only 1.5L of NPS room left.
    result = run({"salary": {"basic": 4000000}, "employer_contributions": {"pf": 600000, "nps": 300000}})
    assert result["regimes"]["new"]["deductions"]["employer_nps"] == 150000
    assert "retirement_aggregate_cap" in codes(result)


def test_pf_above_aggregate_cap_is_a_perquisite():
    r = regime({"salary": {"basic": 4000000}, "employer_contributions": {"pf": 800000}}, "new")
    assert r["gross_salary"] == 4000000 + 50000


# ---------------------------------------------------------------------------
# In-hand, validation warnings, input handling
# ---------------------------------------------------------------------------

def test_in_hand_excludes_employer_nps_and_subtracts_payroll_deductions_and_tax():
    r = regime({"salary": {"basic": 1200000}, "employer_contributions": {"nps": 100000},
                "payroll_deductions": {"employee_epf": 21600, "professional_tax": 2400}}, "new")
    assert r["in_hand_salary_annual"] == pytest.approx(1200000 - 24000 - r["total_tax"])
    assert r["monthly_average"]["in_hand_salary"] == pytest.approx(r["in_hand_salary_annual"] / 12, abs=0.01)


def test_monthly_annual_mismatch_is_flagged_beyond_rounding_tolerance():
    ok = run({"salary": {"basic": 2702250}, "salary_monthly": {"basic": 225188}})  # 225188 x 12 = 2702256
    bad = run({"salary": {"basic": 2702250}, "salary_monthly": {"basic": 225000}})
    assert "monthly_annual_mismatch" not in codes(ok)
    assert "monthly_annual_mismatch" in codes(bad)


def test_epf_entered_twice_is_flagged_as_possible_duplicate():
    result = run({"salary": {"basic": 2000000}, "payroll_deductions": {"employee_epf": 36000},
                  "deductions": {"80C": {"other": 36000}}})
    assert "possible_duplicate_deduction" in codes(result)


def test_tds_reconciliation_against_selected_regime():
    inputs = {"salary": {"basic": 1375000}, "prepaid": {"tds": 50000}, "profile": {"selected_regime": "new"}}
    result = run(inputs)
    assert result["regimes"]["new"]["balance_payable"] == 78000 - 50000
    assert "tds_not_reconciled" in codes(result)


def test_unknown_salary_components_are_taxed_as_cash():
    r = regime({"salary": {"basic": 1000000, "car_allowance": 275000}}, "new")
    assert r["cash_salary"] == 1275000 and r["total_tax"] == 0


@pytest.mark.parametrize("bad, message", [
    ({"salary": {"basic": -1}}, "negative"),
    ({"deductions": {"80Z": 5}}, "Unknown input"),
    ({"bogus": {}}, "Unknown input section"),
    ({"profile": {"residential_status": "martian"}}, "residential_status"),
    ({"hra": {"months_rented": 13}}, "months_rented"),
    ({"salary": {"basic": "lots"}}, "number"),
])
def test_invalid_inputs_are_rejected(bad, message):
    with pytest.raises(TaxInputError, match=message):
        normalize_inputs(bad)


def test_every_figure_has_an_audit_line_with_provenance():
    r = regime({"salary": {"basic": BASIC, "hra": HRA, "special_allowance": SPECIAL}}, "new")
    keys = {line["key"] for line in r["audit"]}
    assert {"gross_salary", "standard_deduction", "total_income", "slab_tax", "rebate", "surcharge",
            "cess", "total_tax", "balance"} <= keys
    for line in r["audit"]:
        assert line["source"] in ("input", "rule", "derived", "assumption", "user_asserted")
        if line["source"] == "rule":
            assert line["verification"] in ("verified", "secondary_source", "unverified", "assumption")
