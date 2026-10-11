"""'Fill from my Artha data': planner proposals from Artha's own records, and DB-backed planner drafts."""
from datetime import date

import json

import pytest
from fastapi.testclient import TestClient

from backend.tax.engine import TaxInputError
from backend.tax.prefill import fy_bounds, prefill

FY = "2026-27"
TODAY = date(2026, 10, 11)


def cat(conn, name):
    return conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]


def asset(conn, name, category, owner=1):
    cur = conn.execute("INSERT INTO assets (name, category_id, owner_id) VALUES (?, ?, ?)", (name, cat(conn, category), owner))
    return cur.lastrowid


def txn(conn, asset_id, amount, when, ttype="Investment", dest_type="Asset"):
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('None', ?, ?, ?, ?, ?)""", (dest_type, asset_id, ttype, amount, when))


@pytest.fixture
def data(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner'), (2, 'Ravi', 'Spouse')")
    conn.execute("INSERT INTO income (name, category_id, amount, frequency) VALUES ('Acme salary', ?, 450000, 'Monthly')", (cat(conn, "Salary"),))
    conn.execute("INSERT INTO income (name, category_id, amount, frequency) VALUES ('FD interest', ?, 60000, 'Yearly')", (cat(conn, "Interest"),))
    conn.execute("INSERT INTO income (name, category_id, amount, frequency, taxable) VALUES ('Gift', ?, 1000, 'Monthly', 0)", (cat(conn, "Salary"),))
    conn.execute("INSERT INTO expenses (name, category_id, amount, frequency) VALUES ('Flat rent', ?, 40000, 'Monthly')", (cat(conn, "Rent"),))

    ppf = asset(conn, "PPF SBI", "PPF")
    txn(conn, ppf, 50000, "2026-04-15")
    txn(conn, ppf, 25000, "2026-09-01")
    txn(conn, ppf, 99999, "2026-03-31")  # previous year: excluded
    elss = asset(conn, "Axis ELSS Tax Saver", "Mutual Fund")
    conn.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit) VALUES (?, '2026-06-10', 100, 300)", (elss,))
    other_mf = asset(conn, "Nifty Index Fund", "Mutual Fund")
    txn(conn, other_mf, 70000, "2026-05-01")  # not ELSS: ignored
    spouse_ppf = asset(conn, "Ravi PPF", "PPF", owner=2)
    txn(conn, spouse_ppf, 150000, "2026-05-01")  # another person's: ignored

    term = asset(conn, "HDFC Term", "Insurance")
    conn.execute("INSERT INTO insurance_details (asset_id, policy_type, premium, frequency) VALUES (?, 'Term', 2000, 'Monthly')", (term,))
    health = asset(conn, "Star Health", "Insurance")
    conn.execute("INSERT INTO insurance_details (asset_id, policy_type, premium, frequency) VALUES (?, 'Health', 30000, 'Yearly')", (health,))

    loan = conn.execute("""INSERT INTO liabilities (name, category_id, owner_id, interest_rate, emi, outstanding)
                           VALUES ('SBI Home Loan', ?, 1, 8.5, 43391, 4900000)""", (cat(conn, "Home Loan"),)).lastrowid
    for month in range(4, 10):  # Apr..Sep EMIs
        txn(conn, loan, 43391, f"2026-{month:02d}-05", ttype="EMI", dest_type="Liability")

    conn.execute("""INSERT INTO capital_gains_realizations (asset_id, owner_id, asset_category, sale_date, financial_year, gain_amount, gain_type)
                    VALUES (?, 1, 'Stock', '2026-07-01', ?, 40000, 'LTCG')""", (other_mf, FY))
    profile = conn.execute("INSERT INTO tax_profiles (person_id, financial_year) VALUES (1, ?)", (FY,)).lastrowid
    conn.execute("INSERT INTO tax_deductions (tax_profile_id, section, label, amount) VALUES (?, '80D', 'Mediclaim', 25000)", (profile,))
    conn.execute("INSERT INTO tax_deductions (tax_profile_id, section, label, amount) VALUES (?, '80G', 'PM CARES', 5000)", (profile,))
    conn.commit()
    return conn


def by_target(out, target):
    return [i for i in out["items"] if i["target"] == target]


def test_fy_bounds():
    assert fy_bounds(FY) == (date(2026, 4, 1), date(2027, 4, 1))


def test_income_and_expense_rows_are_annualised(data):
    out = prefill(data, FY, today=TODAY)
    (salary,) = by_target(out, "salary_total")
    assert salary["amount"] == 450000 * 12 and salary["basis"] == "recorded" and "take-home" in salary["note"]
    assert by_target(out, "other_income.interest_deposits")[0]["amount"] == 60000
    assert by_target(out, "hra.rent_paid_monthly")[0]["amount"] == 40000
    assert all(i["label"] != "Gift" for i in out["items"])  # non-taxable


def test_investments_this_year_for_this_person_only(data):
    out = prefill(data, FY, today=TODAY)
    (ppf,) = by_target(out, "deductions.80C.ppf")
    assert ppf["amount"] == 75000 and "2 transaction" in ppf["explanation"]
    (elss,) = by_target(out, "deductions.80C.elss")
    assert elss["amount"] == 30000 and elss["basis"] == "guess" and "purchase lot" in elss["explanation"]
    assert prefill(data, FY, person_id=2, today=TODAY)["items"][-1]["label"] != "PPF SBI"
    assert by_target(prefill(data, FY, person_id=2, today=TODAY), "deductions.80C.ppf")[0]["amount"] == 150000


def test_insurance_premiums(data):
    out = prefill(data, FY, today=TODAY)
    life = by_target(out, "deductions.80C.life_insurance")[0]
    assert life["amount"] == 24000 and life["basis"] == "estimate" and "no payments recorded" in life["explanation"]
    health = [i for i in by_target(out, "deductions.80D_self_family") if i["source"]["type"] == "insurance"]
    assert health[0]["amount"] == 30000


def test_home_loan_split_by_amortisation(data):
    out = prefill(data, FY, today=TODAY)
    (interest,) = by_target(out, "deductions.home_loan_interest_self_occupied")
    (principal,) = by_target(out, "deductions.80C.home_loan_principal")
    assert interest["basis"] == principal["basis"] == "estimate"
    assert "after 6 EMI" in interest["explanation"]
    # Twelve full EMIs over the year: interest + principal = 12 x EMI.
    assert interest["amount"] + principal["amount"] == pytest.approx(12 * 43391, abs=1)
    # Rebuilding the opening balance and stepping 6 EMIs forward lands on today's outstanding.
    r = 8.5 / 100 / 12
    g = (1 + r) ** 6
    b = (4900000 + 43391 * (g - 1) / r) / g
    for _ in range(6):
        b -= 43391 - b * r
    assert b == pytest.approx(4900000, abs=1)
    assert 400000 < interest["amount"] < 420000


def test_realised_gains_and_profile_entries(data):
    out = prefill(data, FY, today=TODAY)
    assert by_target(out, "capital_gains.ltcg_112a")[0]["amount"] == 40000
    assert by_target(out, "deductions.80G_eligible")[0]["amount"] == 5000


def test_overlapping_sources_start_unticked(data):
    out = prefill(data, FY, today=TODAY)
    d80 = {i["source"]["type"]: i for i in by_target(out, "deductions.80D_self_family")}
    assert d80["insurance"]["selected"] is True
    assert d80["tax_deduction"]["selected"] is False and "same money" in d80["tax_deduction"]["overlap"]
    # 80G has only the profile entry: stays ticked.
    assert by_target(out, "deductions.80G_eligible")[0]["selected"] is True


def test_defaults_to_primary_owner_and_rejects_unknown_person(data):
    out = prefill(data, FY, today=TODAY)
    assert out["person_id"] == 1 and [p["name"] for p in out["people"]] == ["Asha", "Ravi"]
    with pytest.raises(TaxInputError):
        prefill(data, FY, person_id=99, today=TODAY)


def test_empty_database(initialized_db):
    out = prefill(initialized_db, FY, today=TODAY)
    assert out["items"] == [] and out["person_id"] is None


def test_prefill_and_draft_routes(data):
    from backend.main import app

    with TestClient(app) as client:
        pre = client.get("/api/tax/prefill", params={"financial_year": FY, "person_id": 1})
        missing = client.get("/api/tax/planner-draft/default")
        saved = client.put("/api/tax/planner-draft/default", json={"inputs": {"salary": {"basic": 1}}, "financialYear": FY})
        again = client.put("/api/tax/planner-draft/default", json={"inputs": {"salary": {"basic": 2}}, "financialYear": FY})
        loaded = client.get("/api/tax/planner-draft/default")
        bad = client.get("/api/tax/planner-draft/Bad Slot!")
        deleted = client.delete("/api/tax/planner-draft/default")
        after = client.get("/api/tax/planner-draft/default")
    assert pre.status_code == 200 and pre.json()["items"]
    assert missing.json()["content"] is None
    assert saved.status_code == again.status_code == 200
    assert loaded.json()["content"]["inputs"]["salary"]["basic"] == 2
    assert bad.status_code in (404, 422)
    assert deleted.status_code == 200 and after.json()["content"] is None


def test_explanations_use_indian_digit_grouping():
    from backend.tax.prefill import _inr
    assert [_inr(x) for x in (999, 1000, 100000, 4900000, 54045000)] == ["999", "1,000", "1,00,000", "49,00,000", "5,40,45,000"]


def _split(conn, today):
    from backend.tax.prefill import _loan_items
    start, end = fy_bounds(FY)
    items, _ = _loan_items(conn.cursor(), 1, start, end, today)
    return {i["target"]: i for i in items}


def test_prepayments_are_added_back_to_the_opening_balance(data):
    before = _split(data, TODAY)["deductions.home_loan_interest_self_occupied"]
    loan = data.execute("SELECT id FROM liabilities WHERE name = 'SBI Home Loan'").fetchone()["id"]
    # A 2L prepayment this year: it already lowered outstanding, so the opening balance (and interest) is higher.
    txn(data, loan, 200000, "2026-07-20", ttype="Prepayment", dest_type="Liability")
    data.commit()
    after = _split(data, TODAY)["deductions.home_loan_interest_self_occupied"]
    assert after["amount"] > before["amount"] and "prepayments" in after["explanation"]
    r = 8.5 / 100 / 12
    g = (1 + r) ** 6
    opening = (4900000 + 200000 + 43391 * (g - 1) / r) / g
    assert after["amount"] == pytest.approx(sum_interest(opening, r, 43391), abs=1)


def sum_interest(b, r, emi):
    total = 0.0
    for _ in range(12):
        i = b * r
        total, b = total + i, b - (emi - i)
    return total


def test_past_year_rolls_back_emis_paid_after_it_ended(data):
    # Today is 20 Jun 2027 (FY 2027-28), planning FY 2026-27. Outstanding is today's balance, after
    # Apr-Sep 2026 (6) + Oct 2026-Jun 2027 (9) EMIs; all 15 are unwound to reach 1 Apr 2026.
    loan = data.execute("SELECT id FROM liabilities WHERE name = 'SBI Home Loan'").fetchone()["id"]
    for y, m in [(2026, 10), (2026, 11), (2026, 12), (2027, 1), (2027, 2), (2027, 3), (2027, 4), (2027, 5), (2027, 6)]:
        txn(data, loan, 43391, f"{y}-{m:02d}-05", ttype="EMI", dest_type="Liability")
    data.commit()
    past = _split(data, date(2027, 6, 20))["deductions.home_loan_interest_self_occupied"]
    assert "15 EMI(s)" in past["explanation"] and "since the start of that year" in past["explanation"]
    r = 8.5 / 100 / 12
    g = (1 + r) ** 15
    assert past["amount"] == pytest.approx(sum_interest((4900000 + 43391 * (g - 1) / r) / g, r, 43391), abs=1)


def test_future_year_says_it_uses_todays_balance(data):
    from backend.tax.prefill import _loan_items
    start, end = fy_bounds("2027-28")
    (interest,) = [i for i in _loan_items(data.cursor(), 1, start, end, TODAY)[0] if "interest" in i["target"]]
    assert "future year" in interest["explanation"]
    assert interest["amount"] == pytest.approx(sum_interest(4900000, 8.5 / 100 / 12, 43391), abs=1)


def test_asset_to_asset_switches_are_not_new_80c_money(data):
    ppf = data.execute("SELECT id FROM assets WHERE name = 'PPF SBI'").fetchone()["id"]
    data.execute("""INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('Asset', 1, 'Asset', ?, 'Transfer', 10000, '2026-08-01')""", (ppf,))
    data.commit()
    assert by_target(prefill(data, FY, today=TODAY), "deductions.80C.ppf")[0]["amount"] == 75000


def test_recorded_premium_payments_this_year_win(data):
    term = data.execute("SELECT id FROM assets WHERE name = 'HDFC Term'").fetchone()["id"]
    for when, amt in (("2026-04-10", 2000), ("2026-05-10", 2000), ("2026-03-10", 9999)):  # March 2026: last year
        data.execute("INSERT INTO insurance_premium_payments (asset_id, payment_date, amount) VALUES (?, ?, ?)", (term, when, amt))
    data.commit()
    life = by_target(prefill(data, FY, today=TODAY), "deductions.80C.life_insurance")[0]
    assert life["amount"] == 4000 and life["basis"] == "recorded" and "2 premium payment" in life["explanation"]


# --- What a home loan was used for (the loan form's "Used for" / share) -------------

def _use(conn, loan_use=None, share=None):
    meta = {k: v for k, v in (("loan_use", loan_use), ("house_share_pct", share)) if v is not None}
    conn.execute("UPDATE liabilities SET metadata_json = ? WHERE name = 'SBI Home Loan'", (json.dumps(meta),))
    conn.commit()


def _with_rules(conn):
    from backend.tax.prefill import _loan_items
    from backend.tax.rules_loader import load_rule_set
    start, end = fy_bounds(FY)
    items, notes = _loan_items(conn.cursor(), 1, start, end, TODAY, load_rule_set(FY))
    return {i["target"]: i for i in items}, notes


def test_bought_or_built_counts_interest_and_principal_as_before(data):
    base, _ = _with_rules(data)
    _use(data, "purchase")
    items, notes = _with_rules(data)
    assert set(items) == set(base) and not notes
    assert items["deductions.80C.home_loan_principal"]["amount"] == base["deductions.80C.home_loan_principal"]["amount"]


def test_a_share_used_for_the_house_scales_both_figures(data):
    base, _ = _with_rules(data)
    _use(data, "purchase", 40)
    items, _ = _with_rules(data)
    for target in ("deductions.home_loan_interest_self_occupied", "deductions.80C.home_loan_principal"):
        assert items[target]["amount"] == pytest.approx(base[target]["amount"] * 0.4, abs=0.02)
    assert "40% of the loan went into the house" in items["deductions.home_loan_interest_self_occupied"]["explanation"]


def test_repairs_count_capped_interest_and_no_principal(data):
    from backend.tax.rules_loader import load_rule_set
    cap = load_rule_set(FY)["home_loan_interest_use"]["value"]["repair_interest_cap_self_occupied"]
    _use(data, "repair")
    items, _ = _with_rules(data)
    assert "deductions.80C.home_loan_principal" not in items
    interest = items["deductions.home_loan_interest_self_occupied"]
    assert interest["amount"] == cap  # the fixture's loan pays far more interest than the cap
    assert "repairs or renovation" in interest["explanation"]


def test_money_used_elsewhere_is_left_out_with_a_note(data):
    _use(data, "other")
    items, notes = _with_rules(data)
    assert not any(t.startswith("deductions.home_loan") or "home_loan_principal" in t for t in items)
    assert any("SBI Home Loan is left out" in n for n in notes)
