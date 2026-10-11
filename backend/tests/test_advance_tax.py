"""Advance tax: liability after TDS, instalments, safe harbours, interest, exemptions, calendar events."""
import copy
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.tax.advance_tax import advance_tax_schedule, return_due_date
from backend.tax.engine import TaxInputError, compute
from backend.tax.rules_loader import load_rule_set, validate_rule_set

RULES = load_rule_set("2026-27")
TODAY = date(2026, 10, 11)
SALARY = {"basic": 2702250, "hra": 1080900, "special_allowance": 1621350}
# Spec salary (new regime tax 13,48,600 on salary alone) plus 3L FD interest and 4L equity LTCG.
INPUTS = {"salary": SALARY, "payroll_deductions": {"employee_epf": 36000},
          "other_income": {"interest_deposits": 300000}, "capital_gains": {"ltcg_112a": 400000}}


def with_payments(*payments):
    return {**INPUTS, "advance_tax_payments": [{"date": d, "amount": a} for d, a in payments]}


def test_liability_is_tax_not_covered_by_salary_tds():
    s = advance_tax_schedule(INPUTS, RULES, today=TODAY)
    assert s["regime"] == "new" and s["total_tax"] == 1490890 and s["expected_tds"] == 1348600
    assert s["advance_tax_liability"] == 142290 and s["required"] is True
    assert [i["due_date"] for i in s["instalments"]] == ["2026-06-15", "2026-09-15", "2026-12-15", "2027-03-15"]
    assert [i["cumulative_due"] for i in s["instalments"]] == [21344, 64030, 106718, 142290]


def test_safe_harbour_and_deferment_interest():
    # 20,000 by 15 Jun is >= 12% of 1,42,290 (17,075): no June interest despite missing 15%.
    # By 15 Sep: 64,030 due, 20,000 paid -> 44,030 short, rounded down to 44,000 x 1% x 3 = 1,320.
    s = advance_tax_schedule(with_payments(("2026-06-10", 20000)), RULES, today=TODAY)
    june, sept, dec, march = s["instalments"]
    assert june["status"] == "safe_harbour" and june["deferment_interest"] == 0
    assert sept["status"] == "short" and sept["deferment_interest"] == 1320
    assert dec["status"] == "upcoming" and dec["still_to_pay"] == 86718 and dec["interest_if_unpaid"] == 2601
    assert march["interest_if_unpaid"] == 1222  # 1,22,290 -> 1,22,200 x 1% x 1 month
    assert s["deferment_interest_total"] == 1320 and s["next_due"]["due_date"] == "2026-12-15"


def test_paid_on_time_has_no_interest():
    s = advance_tax_schedule(with_payments(("2026-06-14", 21344), ("2026-09-14", 42686), ("2026-12-14", 42688), ("2027-03-14", 35572)),
                             RULES, today=date(2027, 3, 20))
    assert [i["status"] for i in s["instalments"]] == ["met"] * 4
    assert s["deferment_interest_total"] == 0 and s["year_end_shortfall"] is None and s["next_due"] is None


def test_year_end_shortfall_below_90_percent():
    s = advance_tax_schedule(with_payments(("2026-06-14", 21344)), RULES, today=date(2027, 4, 5))
    short = s["year_end_shortfall"]
    assert short["unpaid"] == 142290 - 21344 and short["from"] == "2027-04-01"
    assert short["interest_per_month"] == 1209  # 1,20,946 -> 1,20,900 x 1%
    assert short["final"] is True and short["explanation"].startswith("Less than")
    during = advance_tax_schedule(with_payments(("2026-06-14", 21344)), RULES, today=TODAY)["year_end_shortfall"]
    assert during["final"] is False and during["explanation"].startswith("If less than")


def test_payments_set_prepaid_advance_tax():
    inp = with_payments(("2026-06-10", 20000), ("2026-09-10", 30000))
    assert compute(inp, RULES)["regimes"]["new"]["prepaid_taxes"] == 50000
    with pytest.raises(TaxInputError):
        advance_tax_schedule({**INPUTS, "advance_tax_payments": [{"date": "15/06/2026", "amount": 1}]}, RULES)


def test_below_threshold_is_not_required():
    s = advance_tax_schedule({**INPUTS, "other_income": {"interest_deposits": 20000}, "capital_gains": {}}, RULES, today=TODAY)
    assert s["required"] is False and "below the advance-tax threshold" in s["reason"]
    assert all(i["status"] == "not_required" and i["still_to_pay"] == 0 for i in s["instalments"])


def test_resident_senior_is_exempt_but_non_resident_senior_is_not():
    senior = advance_tax_schedule({**INPUTS, "profile": {"age": 65}}, RULES, today=TODAY)
    assert senior["required"] is False and "senior" in senior["reason"].lower()
    nri = advance_tax_schedule({**INPUTS, "profile": {"age": 65, "residential_status": "non_resident"}}, RULES, today=TODAY)
    assert nri["required"] is True


def test_entered_tds_overrides_the_salary_assumption():
    s = advance_tax_schedule(INPUTS, RULES, today=TODAY, expected_tds=1400000)
    assert s["tds_basis"] == "entered" and s["advance_tax_liability"] == 90890


def test_rule_set_without_advance_tax_rules():
    old = copy.deepcopy(RULES)
    del old["advance_tax"], old["return_due_date"]
    validate_rule_set(old)  # still a valid rule set (users' older copies)
    s = advance_tax_schedule(INPUTS, old, today=TODAY)
    assert s["available"] is False and s["return_due_date"] is None


def test_return_due_date_is_in_the_assessment_year():
    assert return_due_date(RULES) == date(2027, 7, 31)
    assert return_due_date(load_rule_set("2025-26")) == date(2026, 7, 31)


def test_calendar_shows_instalments_from_saved_plans(initialized_db):
    from backend.main import _tax_calendar_events
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT INTO tax_planner_drafts (slot, content_json) VALUES (?, ?)",
                 ("p1-2026-27", json.dumps({"inputs": with_payments(("2026-06-10", 20000)), "financialYear": "2026-27"})))
    conn.execute("INSERT INTO tax_planner_drafts (slot, content_json) VALUES ('default', '{}')")  # not a person plan: ignored
    conn.commit()
    events = _tax_calendar_events(TODAY, date(2027, 10, 1))
    titles = [(e["date"], e["amount"]) for e in events]
    assert ("2026-12-15", 86718) in titles and ("2027-03-15", 122290) in titles
    filing = [e for e in events if e["title"].startswith("Income tax return due")]
    assert filing[0]["date"] == "2027-07-31" and filing[0]["amount"] == 0  # already counted in the instalments
    assert all(e["type"] == "Tax" and "Asha" in e["details"] for e in events)


def test_route(test_db_path):
    from backend.main import app
    with TestClient(app) as client:
        r = client.post("/api/tax/advance-tax", json={"financial_year": "2026-27", "inputs": INPUTS})
        bad = client.post("/api/tax/advance-tax", json={"financial_year": "2026-27", "inputs": INPUTS, "regime": "both"})
    assert r.status_code == 200 and r.json()["advance_tax_liability"] == 142290
    assert bad.status_code == 422


def test_calendar_below_threshold_puts_the_tax_on_the_filing_date(initialized_db):
    from backend.main import _tax_calendar_events
    conn = initialized_db
    small = {**INPUTS, "other_income": {"interest_deposits": 20000}, "capital_gains": {}}
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT INTO tax_planner_drafts (slot, content_json) VALUES (?, ?)", ("p1-2026-27", json.dumps({"inputs": small})))
    conn.commit()
    events = _tax_calendar_events(TODAY, date(2027, 10, 1))
    assert [e["title"] for e in events] == ["Income tax return due (Asha, FY 2026-27)"]
    assert events[0]["amount"] > 0 and "self-assessment" in events[0]["details"]
