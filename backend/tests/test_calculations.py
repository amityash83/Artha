import pytest

from backend.calculations import (
    calculate_monthly_emi,
    calculate_remaining_tenure,
    calculate_xirr,
    calculate_tax_new_regime,
    calculate_tax_old_regime,
    determine_gain_type,
    calculate_capital_gains_for_lots,
)


def test_calculate_monthly_emi_standard_case():
    # 10 lakh principal, 10% annual rate, 12 month tenure
    emi = calculate_monthly_emi(1000000, 10.0, 12)
    assert emi == pytest.approx(87915.89, abs=0.01)


def test_calculate_monthly_emi_zero_interest():
    # r == 0 branch: straight-line principal / tenure
    assert calculate_monthly_emi(120000, 0.0, 12) == pytest.approx(10000.0)


def test_calculate_remaining_tenure_matches_original_for_fresh_loan():
    # A freshly-computed EMI for a given (principal, roi, tenure) should imply
    # ~the same remaining tenure when outstanding == principal
    emi = calculate_monthly_emi(1000000, 10.0, 12)
    assert calculate_remaining_tenure(1000000, 10.0, emi) == pytest.approx(12.0, abs=0.01)


def test_calculate_xirr_clean_one_year_return():
    # 2023-01-01 -> 2024-01-01 is a genuine 365-day span (2024 is a leap year,
    # but Feb 29 2024 falls after Jan 1 2024, so this specific span is still
    # 365 days). 100000 invested, worth 121000 exactly one 365-day year later
    # is analytically a 21% XIRR.
    cash_flows = [
        {"date": "2023-01-01", "amount": -100000},
        {"date": "2024-01-01", "amount": 121000},
    ]
    assert calculate_xirr(cash_flows) == pytest.approx(21.0, abs=0.01)


def test_calculate_xirr_insufficient_cash_flows_returns_zero():
    assert calculate_xirr([{"date": "2023-01-01", "amount": -100000}]) == 0.0


def test_calculate_tax_new_regime_at_rebate_threshold():
    # Exactly at the 7L threshold: Section 87A rebate zeroes tax entirely
    result = calculate_tax_new_regime(700000)
    assert result == {
        "gross_tax": 15000.0,
        "rebate_87a": 15000.0,
        "cess": 0.0,
        "total_tax": 0.0,
    }


def test_calculate_tax_new_regime_above_rebate_threshold():
    result = calculate_tax_new_regime(1000000)
    assert result == {
        "gross_tax": 40000.0,
        "rebate_87a": 0.0,
        "cess": 1600.0,
        "total_tax": 41600.0,
    }


def test_calculate_tax_old_regime_below60():
    result = calculate_tax_old_regime(600000, age_band="Below60")
    assert result == {
        "gross_tax": 32500.0,
        "rebate_87a": 0.0,
        "cess": 1300.0,
        "total_tax": 33800.0,
    }


def test_determine_gain_type_equity_boundary():
    # Equity threshold is 365 days, and the comparison is strictly ">"
    assert determine_gain_type("2023-01-01", "2024-01-01", "Stock") == "STCG"
    assert determine_gain_type("2023-01-01", "2024-01-02", "Stock") == "LTCG"


def test_determine_gain_type_property_boundary():
    # Non-equity threshold is 730 days
    assert determine_gain_type("2022-01-01", "2024-01-01", "Property") == "STCG"
    assert determine_gain_type("2022-01-01", "2024-01-02", "Property") == "LTCG"


def test_calculate_capital_gains_for_lots_fifo_consumption():
    lots = [
        {"id": 1, "purchase_date": "2023-01-01", "quantity": 10, "price_per_unit": 100},
        {"id": 2, "purchase_date": "2023-06-01", "quantity": 10, "price_per_unit": 150},
    ]
    result = calculate_capital_gains_for_lots(
        lots, sale_quantity=15, sale_price_per_unit=200,
        sale_date="2024-07-01", asset_category="Stock",
    )
    assert result["stcg_amount"] == 0.0
    assert result["ltcg_amount"] == 1250.0
    assert result["unmatched_quantity"] == 0.0
    assert len(result["lots_consumed"]) == 2
    assert result["lots_consumed"][0]["lot_id"] == 1
    assert result["lots_consumed"][0]["quantity_consumed"] == 10.0
    assert result["lots_consumed"][1]["lot_id"] == 2
    assert result["lots_consumed"][1]["quantity_consumed"] == 5.0
