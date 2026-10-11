"""The payslip's employer PF split into pension (EPS) and EPF."""
from backend.tax.payroll import employer_pf_split
from backend.tax.engine import normalize_inputs

FY = "2026-27"  # the wage ceiling goes from 15,000 to 25,000 on 17 September 2026


def _inputs(basic_monthly, employer_pf_monthly):
    return normalize_inputs({"salary": {"basic": basic_monthly * 12},
                             "employer_contributions": {"pf": employer_pf_monthly * 12}})


def test_a_month_on_the_old_ceiling():
    split = employer_pf_split(_inputs(100000, 12000), FY, month_index=0)  # April 2026: 15,000 ceiling
    assert split["eps_monthly"] == 1250  # 8.33% of 15,000, rounded
    assert split["epf_monthly"] == 12000 - 1250


def test_a_month_on_the_new_ceiling():
    split = employer_pf_split(_inputs(100000, 12000), FY, month_index=7)  # November 2026: 25,000 ceiling
    assert split["eps_monthly"] == 2083  # 8.33% of 25,000 = 2,082.50, rounded half up as EPFO does
    assert split["epf_monthly"] == 12000 - 2083


def test_pension_never_exceeds_the_employer_share_and_the_average_spans_the_year():
    small = employer_pf_split(_inputs(10000, 1200), FY)  # wages under any ceiling
    assert small["eps_monthly"] == 833 and small["epf_monthly"] == 367
    avg = employer_pf_split(_inputs(100000, 12000), FY)
    assert 1250 < avg["eps_monthly"] < 2083  # part of the year on each ceiling
