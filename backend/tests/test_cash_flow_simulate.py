"""The Cash Flow what-if simulator (POST /api/calculations/cash-flow/simulate)."""
from fastapi.testclient import TestClient

BASE = {
    "net_salary": 200000, "other_income": 0, "household_expenses": 80000, "emi": 30000,
    "insurance_premium": 5000, "investments": 40000, "one_time_expenses": 0,
}


def simulate(**changes):
    from backend.main import app
    with TestClient(app) as client:
        res = client.post("/api/calculations/cash-flow/simulate", json={**BASE, **changes})
    assert res.status_code == 200, res.text
    return res.json()


def test_savings_rate_counts_money_invested(test_db_path):
    # Not spent: 200k - 80k spending - 30k EMI - 5k premiums = 85k, of which 40k is invested.
    out = simulate()
    assert out["current"]["surplus"] == 45000
    assert out["current"]["savings_rate"] == 42.5


def test_investing_more_does_not_lower_the_savings_rate(test_db_path):
    out = simulate(additional_investment=20000)
    assert out["simulated"]["surplus"] == 25000
    assert out["simulated"]["savings_rate"] == out["current"]["savings_rate"]


def test_amounts_use_indian_digit_grouping(test_db_path):
    out = simulate(salary_change_abs=150000, one_time_bonus=1250000)
    text = out["impact_summary"] + " " + " ".join(out["recommendations"])
    assert "₹1,50,000" in text and "₹12,50,000" in text
    assert "₹150,000" not in text and "₹1,250,000" not in text
