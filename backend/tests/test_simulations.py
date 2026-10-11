"""What-if simulations (POST /api/simulations/run)."""
from fastapi.testclient import TestClient


def _setup(conn, cash=300000):
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT OR IGNORE INTO institutions (id, name) VALUES (900, 'Bank')")
    acc = conn.execute("INSERT INTO accounts (name, institution_id, owner_id) VALUES ('Savings', 900, 1)").lastrowid
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('None', 'Account', ?, 'Credit', ?, '2026-01-01')""", (acc, cash))
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    card = conn.execute("SELECT id FROM categories WHERE name = 'Credit Card'").fetchone()["id"]
    loan = conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi) VALUES ('Home', ?, 1, 700000, 7.15, 15406)", (home,)).lastrowid
    conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi) VALUES ('Card', ?, 1, 50000, 0, 0)", (card,))
    goal = conn.execute("INSERT INTO goals (name, target_amount, current_amount, monthly_contribution) VALUES ('Car', 600000, 0, 50000)").lastrowid
    conn.commit()
    return loan, goal


def _run(scenario, params):
    from backend.main import app
    with TestClient(app) as client:
        res = client.post("/api/simulations/run", json={"scenario_type": scenario, "params": params})
    assert res.status_code == 200, res.text
    return res.json()


def test_closing_a_loan_reports_real_savings_and_a_cash_shortfall(initialized_db):
    loan, _ = _setup(initialized_db)
    out = _run("close_loan", {"loan_id": loan})
    assert "₹0" not in out["recommendation"].split("frees")[0]  # interest saved is not zero
    assert "frees ₹15,406 a month" in out["recommendation"]
    assert "₹4,00,000 more cash" in out["recommendation"]  # 7,00,000 owed vs 3,00,000 in the bank
    assert out["difference"]["monthly_emi"] == -15406


def test_a_card_without_an_emi_does_not_make_debt_never_end(initialized_db):
    loan, _ = _setup(initialized_db)
    out = _run("close_loan", {"loan_id": loan})
    assert out["current"]["remaining_tenure_months"] > 0       # the home loan's schedule, not "never"
    assert out["simulated"]["remaining_tenure_months"] == 0    # nothing with an EMI left


def test_delaying_a_goal_states_the_monthly_saving(initialized_db):
    _, goal = _setup(initialized_db)
    out = _run("delay_goal", {"goal_id": goal, "delay_months": 12})
    # 6,00,000 at 50,000/month is 12 months; over 24 it needs 25,000, i.e. 25,000 less.
    assert "₹25,000, ₹25,000 less than now" in out["recommendation"]
