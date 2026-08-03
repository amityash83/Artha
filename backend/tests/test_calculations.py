import pytest
from datetime import date

from backend.calculations import (
    calculate_monthly_emi,
    calculate_remaining_tenure,
    calculate_xirr,
    calculate_tax_new_regime,
    calculate_tax_old_regime,
    determine_gain_type,
    calculate_capital_gains_for_lots,
    resolve_reward_rate,
    calculate_statement_cycle,
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


def test_resolve_reward_rate_applies_tighter_of_monthly_and_daily_cap():
    # 100000 at 5x with a base block of 150 would earn 3333 raw points -
    # both the legacy monthlyCapPoints (15000) and a new daily cap (2000) are
    # configured; the tighter (2000) must win, matching how a real cardholder
    # would actually be capped for an isolated transaction.
    rules = [{
        "category": "Travel", "multiplier": 5, "isExcluded": False,
        "monthlyCapPoints": 15000,
        "caps": [{"capPoints": 2000, "period": "daily", "groupLabel": "Accelerated Pool"}],
    }]
    result = resolve_reward_rate(rules, [], current_spend=0.0, hypothetical_amount=100000,
                                  base_points=5, base_spend=150, category="Travel")
    assert result["points"] == 2000
    assert result["capped"] is True


def test_resolve_reward_rate_caps_array_without_legacy_field():
    # No monthlyCapPoints at all - only the new caps[] array - must still clamp.
    rules = [{
        "category": "Dining", "multiplier": 3, "isExcluded": False,
        "caps": [{"capPoints": 500, "period": "monthly"}],
    }]
    result = resolve_reward_rate(rules, [], current_spend=0.0, hypothetical_amount=50000,
                                  base_points=1, base_spend=150, category="Dining")
    assert result["points"] == 500
    assert result["capped"] is True


def test_resolve_reward_rate_group_label_is_purely_informational():
    # Two categories sharing a groupLabel each still resolve independently -
    # the label is documentation only, never enforced as a pooled ceiling
    # across categories (Artha has no per-category spend ledger to enforce
    # it against), so neither category's own cap is affected by the other.
    rules = [
        {"category": "Travel", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    travel = resolve_reward_rate(rules, [], current_spend=0.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Travel")
    dining = resolve_reward_rate(rules, [], current_spend=0.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining")
    # Both independently hit their own 15000 cap - no cross-category reduction.
    assert travel["points"] == 15000
    assert dining["points"] == 15000


def test_resolve_reward_rate_uncapped_category_unaffected_by_new_fields():
    # A rule with no monthlyCapPoints and no caps[] must behave exactly as before.
    rules = [{"category": "Grocery", "multiplier": 2, "isExcluded": False}]
    result = resolve_reward_rate(rules, [], current_spend=0.0, hypothetical_amount=10000,
                                   base_points=1, base_spend=150, category="Grocery")
    assert result["points"] == round((10000 / 150) * 1 * 2)
    assert result["capped"] is False


def test_calculate_statement_cycle_day_already_passed_this_month():
    # Statement day 5, today is the 20th - cycle started this month on the 5th.
    result = calculate_statement_cycle(5, date(2026, 7, 20))
    assert result == {"start": "2026-07-05", "end": "2026-08-04"}


def test_calculate_statement_cycle_day_not_yet_occurred_rolls_back_a_month():
    # Statement day 25, today is the 20th - the 25th hasn't happened yet this
    # month, so we're still in the cycle that started last month.
    result = calculate_statement_cycle(25, date(2026, 7, 20))
    assert result == {"start": "2026-06-25", "end": "2026-07-24"}


def test_calculate_statement_cycle_clamps_day_31_in_a_30_day_month():
    result = calculate_statement_cycle(31, date(2026, 9, 15))
    assert result == {"start": "2026-08-31", "end": "2026-09-29"}


def test_calculate_statement_cycle_clamps_in_february_leap_year():
    result = calculate_statement_cycle(30, date(2028, 2, 15))
    assert result == {"start": "2028-01-30", "end": "2028-02-28"}


def test_calculate_statement_cycle_clamps_in_february_non_leap_year():
    result = calculate_statement_cycle(30, date(2026, 2, 15))
    assert result == {"start": "2026-01-30", "end": "2026-02-27"}


def test_calculate_statement_cycle_unset_day_falls_back_to_fifteen():
    assert calculate_statement_cycle(None, date(2026, 7, 20)) == calculate_statement_cycle(15, date(2026, 7, 20))
    assert calculate_statement_cycle(0, date(2026, 7, 20)) == calculate_statement_cycle(15, date(2026, 7, 20))


def test_calculate_statement_cycle_crosses_year_boundary():
    # Statement day 20, today is Jan 5 - hasn't occurred yet this month, rolls
    # back to December of the PREVIOUS year.
    result = calculate_statement_cycle(20, date(2026, 1, 5))
    assert result == {"start": "2025-12-20", "end": "2026-01-19"}
