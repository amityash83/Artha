import pytest
from datetime import date

from backend.calculations import (
    calculate_monthly_emi,
    calculate_remaining_tenure,
    calculate_xirr,
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


def test_resolve_reward_rate_group_label_is_informational_without_a_spend_map():
    # Without category_spend_map (the default, and the only mode Compare Cards'
    # spend-free projection ever uses), a shared groupLabel has no effect - each
    # category resolves independently against its own cap. This is the
    # backward-compatible default every pre-existing caller keeps getting.
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


def test_resolve_reward_rate_group_label_pools_across_categories_when_spend_map_given():
    # Same shared-15000-point-pool rules as above, but now backed by a real
    # category_spend_map: Travel has already earned 10000 points this cycle
    # from its own real spend (2000 at 5x/₹150 block = 66.67 pts/₹ * ... let's
    # just pick a spend figure that resolves to exactly 10000 points: spend/150
    # * 1 * 5 = 10000 -> spend = 300000), leaving only 5000 of headroom in the
    # shared pool for Dining's new hypothetical transaction.
    rules = [
        {"category": "Travel", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    spend_map = {"Travel": 300000.0}  # -> 300000/150 * 1 * 5 = 10000 points already earned
    dining = resolve_reward_rate(rules, [], current_spend=300000.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining",
                                   category_spend_map=spend_map)
    assert dining["points"] == 5000
    assert dining["capped"] is True


def test_resolve_reward_rate_group_label_pool_fully_consumed_by_sibling_yields_zero():
    rules = [
        {"category": "Travel", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    spend_map = {"Travel": 450000.0}  # -> 450000/150 * 1 * 5 = 15000, the whole pool
    dining = resolve_reward_rate(rules, [], current_spend=450000.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining",
                                   category_spend_map=spend_map)
    assert dining["points"] == 0
    assert dining["capped"] is True


def test_resolve_reward_rate_group_label_pool_respects_siblings_own_individual_cap():
    # Travel has its OWN individual (non-pooled) cap of 3000 in addition to
    # sharing the 15000 pool - even though its real spend would raw-earn far
    # more than 3000, only 3000 of it should count as "already consumed" from
    # the pool (a category can't consume more of a shared pool than its own
    # individual ceiling would ever have let it earn in the first place).
    rules = [
        {"category": "Travel", "multiplier": 5, "isExcluded": False, "monthlyCapPoints": 3000,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    spend_map = {"Travel": 450000.0}  # raw would be 15000, but Travel's own cap limits it to 3000
    dining = resolve_reward_rate(rules, [], current_spend=450000.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining",
                                   category_spend_map=spend_map)
    assert dining["points"] == 12000  # 15000 pool - 3000 actually consumed by Travel
    assert dining["capped"] is True


def test_resolve_reward_rate_group_label_pool_includes_own_prior_spend_in_same_category():
    # The category being calculated right now also contributes its OWN prior
    # real spend this cycle to the pool consumption total - a card shouldn't
    # let repeated small Dining swipes bypass the shared pool just because
    # they're all "the current category."
    rules = [
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    spend_map = {"Dining": 300000.0}  # already earned 10000 points from prior Dining spend
    dining = resolve_reward_rate(rules, [], current_spend=300000.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining",
                                   category_spend_map=spend_map)
    assert dining["points"] == 5000
    assert dining["capped"] is True


def test_resolve_reward_rate_excluded_sibling_never_contributes_to_pool():
    rules = [
        {"category": "Travel", "multiplier": 5, "isExcluded": True,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
        {"category": "Dining", "multiplier": 5, "isExcluded": False,
         "caps": [{"capPoints": 15000, "period": "monthly", "groupLabel": "Pool"}]},
    ]
    spend_map = {"Travel": 450000.0}
    dining = resolve_reward_rate(rules, [], current_spend=450000.0, hypothetical_amount=1000000,
                                   base_points=1, base_spend=150, category="Dining",
                                   category_spend_map=spend_map)
    assert dining["points"] == 15000  # excluded Travel never earns, so nothing to consume
    assert dining["capped"] is True


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
