import math
import calendar
from datetime import datetime, date, timedelta
from typing import Optional
import numpy as np

def calculate_remaining_tenure(outstanding: float, roi: float, emi: float) -> float:
    """
    Calculates remaining tenure in months.
    N = -ln(1 - (P * r) / E) / ln(1 + r)
    where P = outstanding, E = emi, r = ROI / 12 / 100 (monthly rate)
    """
    if outstanding <= 0:
        return 0.0
    if emi <= 0:
        return float('inf')
    
    r = (roi / 100.0) / 12.0
    if r == 0:
        return outstanding / emi
    
    # If monthly interest is greater than or equal to EMI, the loan never closes
    if outstanding * r >= emi:
        return float('inf')
    
    try:
        n = -math.log(1.0 - (outstanding * r) / emi) / math.log(1.0 + r)
        return n
    except (ValueError, ZeroDivisionError):
        return float('inf')

def calculate_remaining_interest(outstanding: float, roi: float, emi: float) -> float:
    """
    Calculates remaining interest to be paid over the life of the loan.
    Remaining Interest = (Remaining Tenure * EMI) - Outstanding Principal
    """
    n = calculate_remaining_tenure(outstanding, roi, emi)
    if math.isinf(n) or n <= 0:
        return 0.0
    return (n * emi) - outstanding

def calculate_loan_progress(original_tenure: int, remaining_months: float) -> float:
    """
    Calculates loan progress percentage.
    """
    if original_tenure <= 0:
        return 0.0
    progress = ((original_tenure - remaining_months) / original_tenure) * 100.0
    return min(max(progress, 0.0), 100.0)

def calculate_interest_saved_after_prepayment(
    outstanding: float, roi: float, emi: float, prepayment_amount: float
) -> float:
    """
    Calculates interest saved if the user makes a prepayment.
    We compare the remaining interest of the current outstanding vs. (outstanding - prepayment).
    """
    if outstanding <= 0 or prepayment_amount <= 0:
        return 0.0
    
    prepayment_amount = min(prepayment_amount, outstanding)
    
    interest_before = calculate_remaining_interest(outstanding, roi, emi)
    interest_after = calculate_remaining_interest(outstanding - prepayment_amount, roi, emi)
    
    saved = interest_before - interest_after
    return max(saved, 0.0)

def calculate_goal_expected_completion(
    target: float, current: float, monthly_contribution: float
) -> dict:
    """
    Calculates gap, months to complete, and estimated completion date.
    """
    gap = max(target - current, 0.0)
    if gap <= 0:
        return {
            "gap": 0.0,
            "months_remaining": 0.0,
            "expected_date": date.today().strftime("%Y-%m-%d"),
            "status": "Green"
        }
    
    if monthly_contribution <= 0:
        return {
            "gap": gap,
            "months_remaining": -1.0,
            "expected_date": "Never",
            "status": "Red"
        }
    
    months = gap / monthly_contribution
    today = date.today()
    
    # Calculate expected date by adding months
    total_months = today.month - 1 + math.ceil(months)
    year_offset = total_months // 12
    month_offset = (total_months % 12) + 1
    
    try:
        expected_date = date(today.year + year_offset, month_offset, 1).strftime("%Y-%m-%d")
    except ValueError:
        expected_date = "Future"
        
    # Goal status:
    # Green if we are on track or complete
    # Yellow if progress is slow but contributing
    # Red if no contribution is being made
    status = "Green" if monthly_contribution > 0 else "Red"
    
    return {
        "gap": gap,
        "months_remaining": round(months, 1),
        "expected_date": expected_date,
        "status": status
    }

def calculate_xirr(cash_flows: list) -> float:
    """
    Calculates XIRR (Extended Internal Rate of Return) for a list of cash flows.
    cash_flows is a list of dicts: [{"date": "YYYY-MM-DD", "amount": float}]
    Investments are negative amounts, current value is a positive amount on today's date.
    Uses bisection method. Returns percentage (e.g. 12.5 for 12.5%).
    """
    if len(cash_flows) < 2:
        return 0.0
    
    # Sort cash flows by date
    parsed_flows = []
    for flow in cash_flows:
        try:
            d = datetime.strptime(flow["date"], "%Y-%m-%d").date()
            parsed_flows.append((d, flow["amount"]))
        except ValueError:
            continue
            
    parsed_flows.sort(key=lambda x: x[0])
    if not parsed_flows:
        return 0.0
        
    t0 = parsed_flows[0][0]
    
    def eq(r):
        total = 0.0
        for d, amt in parsed_flows:
            t = (d - t0).days / 365.0
            # PV = FV / (1 + r)^t
            total += amt / ((1.0 + r) ** t)
        return total

    # Bisection search for rate r
    low = -0.99
    high = 2.0
    for _ in range(100):
        mid = (low + high) / 2.0
        val = eq(mid)
        if abs(val) < 1e-6:
            return mid * 100.0
        if val > 0:
            # We want to increase r (which decreases PV for negative final val, etc.)
            # Wait, depending on sign of cash flows, slope can be positive or negative.
            # Let's check sign of derivative or check values at bounds.
            if eq(low) * eq(mid) < 0:
                high = mid
            else:
                low = mid
        else:
            if eq(high) * eq(mid) < 0:
                low = mid
            else:
                high = mid
                
    return ((low + high) / 2.0) * 100.0

def calculate_advanced_emi_schedule(
    loan_amount: float, 
    roi: float, 
    tenure_months: int, 
    start_date_str: str, 
    prepayments: list
) -> dict:
    """
    Computes EMI, monthly amortization schedule, pro-rata interest calculation 
    for mid-month prepayments, and summary stats.
    
    prepayments: list of dicts: [{"date": "YYYY-MM-DD", "amount": float}]
    """
    import datetime
    
    # 1. Parse dates and sort prepayments
    try:
        start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
    except Exception:
        start_date = date.today()
        
    sorted_prepayments = []
    for p in prepayments:
        try:
            p_date = datetime.datetime.strptime(p["date"], "%Y-%m-%d").date()
            sorted_prepayments.append({"date": p_date, "amount": float(p["amount"])})
        except Exception:
            continue
    sorted_prepayments.sort(key=lambda x: x["date"])
    
    # 2. Standard EMI calculation
    r = (roi / 100.0) / 12.0
    emi = 0.0
    if loan_amount > 0 and tenure_months > 0:
        if r == 0:
            emi = loan_amount / tenure_months
        else:
            emi = (loan_amount * r * (1 + r)**tenure_months) / ((1 + r)**tenure_months - 1)
            
    # Round emi to nearest rupee
    emi = round(emi)
    
    # 3. Step month-by-month
    schedule = []
    outstanding = loan_amount
    current_date = start_date
    total_interest = 0.0
    total_prepayments = 0.0
    month_index = 0
    
    # Track the date progression
    while outstanding > 0 and month_index < 360:
        period_start = current_date
        
        # Calculate next month date
        month = period_start.month
        year = period_start.year
        month += 1
        if month > 12:
            month = 1
            year += 1
        day = period_start.day
        while True:
            try:
                period_end = datetime.date(year, month, day)
                break
            except ValueError:
                day -= 1
                
        days_in_period = (period_end - period_start).days
        if days_in_period <= 0:
            days_in_period = 30
            
        # Find prepayments falling in [period_start, period_end)
        period_prepayments = [p for p in sorted_prepayments if period_start <= p["date"] < period_end]
        
        # Calculate interest accrued for the month
        accrued_interest = 0.0
        last_date = period_start
        temp_outstanding = outstanding
        
        # Pro-rata interest calculation based on daily outstanding
        for prepay in period_prepayments:
            days = (prepay["date"] - last_date).days
            accrued_interest += temp_outstanding * (roi / 100.0) * (days / 365.0)
            temp_outstanding = max(temp_outstanding - prepay["amount"], 0.0)
            total_prepayments += prepay["amount"]
            last_date = prepay["date"]
            
        remaining_days = (period_end - last_date).days
        accrued_interest += temp_outstanding * (roi / 100.0) * (remaining_days / 365.0)
        
        accrued_interest = round(accrued_interest, 2)
        total_interest += accrued_interest
        
        outstanding = temp_outstanding
        
        # Calculate EMI payment
        actual_payment = emi
        if outstanding + accrued_interest < emi:
            actual_payment = outstanding + accrued_interest
            
        interest_payment = min(accrued_interest, actual_payment)
        principal_payment = actual_payment - interest_payment
        outstanding = max(outstanding - principal_payment, 0.0)
        
        month_index += 1
        
        # Add to schedule
        schedule.append({
            "month": month_index,
            "date": period_end.strftime("%Y-%m-%d"),
            "beginning_balance": round(outstanding + principal_payment + sum(p["amount"] for p in period_prepayments), 2),
            "emi": round(actual_payment, 2),
            "interest": round(interest_payment, 2),
            "principal": round(principal_payment, 2),
            "prepayments": round(sum(p["amount"] for p in period_prepayments), 2),
            "ending_balance": round(outstanding, 2)
        })
        
        current_date = period_end
        
    return {
        "monthly_emi": emi,
        "total_principal": loan_amount,
        "total_interest": round(total_interest, 2),
        "total_prepayments": round(total_prepayments, 2),
        "total_payment": round(loan_amount + total_interest, 2),
        "schedule": schedule,
        "tenure_months": month_index
    }

def simulate_multi_loan_payoff(
    loans_list: list, 
    extra_monthly: float, 
    strategy: str = "baseline",
    prepayment_frequency: str = "monthly",
    prepayment_amount: float = 0.0,
    prepayment_month: int = 3,
    prepayment_day: int = 31
) -> dict:
    loans = [
        {
            "name": l["name"],
            "outstanding": float(l["outstanding"]),
            "roi": float(l["roi"]),
            "emi": float(l["emi"])
        }
        for l in loans_list if float(l["outstanding"]) > 0
    ]
    
    if not loans:
        return {"total_interest": 0.0, "months": 0, "schedule": []}
        
    total_interest = 0.0
    month = 0
    schedule = []
    
    max_simulation_months = 360 # 30 years safety limit
    
    # Track calendar date starting from today to determine the annual prepayment month
    today = date.today()
    current_year = today.year
    current_month = today.month
    
    while any(l["outstanding"] > 0 for l in loans) and month < max_simulation_months:
        month += 1
        interest_this_month = 0.0
        principal_this_month = 0.0
        
        # Determine extra_available budget for this month
        extra_available = 0.0
        if strategy != "baseline":
            if prepayment_frequency == "monthly":
                extra_available = extra_monthly
            elif prepayment_frequency == "annually":
                # Compute simulation month (1-12)
                sim_month = (current_month + month - 2) % 12 + 1
                if sim_month == prepayment_month:
                    extra_available = prepayment_amount
        
        # 1. Deduct standard monthly interest and determine minimum payments
        temp_minimums = {}
        for l in loans:
            if l["outstanding"] <= 0:
                continue
            # Calculate monthly interest
            monthly_interest = l["outstanding"] * (l["roi"] / 100.0) / 12.0
            interest_this_month += monthly_interest
            total_interest += monthly_interest
            
            # Minimum payment is min(EMI, outstanding + interest)
            min_pay = min(l["emi"], l["outstanding"] + monthly_interest)
            temp_minimums[l["name"]] = (monthly_interest, min_pay)
            
        # 2. Pay minimums
        for l in loans:
            if l["outstanding"] <= 0:
                continue
            interest, min_pay = temp_minimums[l["name"]]
            principal_paid = min_pay - interest
            l["outstanding"] = max(l["outstanding"] + interest - min_pay, 0.0)
            principal_this_month += principal_paid
            
        # 3. Distribute extra prepayment budget according to strategy
        if extra_available > 0:
            # Sort active loans
            active_loans = [l for l in loans if l["outstanding"] > 0]
            if active_loans:
                if strategy == "avalanche":
                    # Sort by highest ROI first, then highest balance
                    active_loans.sort(key=lambda x: (-x["roi"], -x["outstanding"]))
                elif strategy == "snowball":
                    # Sort by lowest balance first, then highest ROI
                    active_loans.sort(key=lambda x: (x["outstanding"], -x["roi"]))
                
                # Pay the extra cash to target loans, cascading excess funds to next target loans
                remaining_extra = extra_available
                for target in active_loans:
                    if remaining_extra <= 0:
                        break
                    prepayment = min(remaining_extra, target["outstanding"])
                    target["outstanding"] = max(target["outstanding"] - prepayment, 0.0)
                    principal_this_month += prepayment
                    remaining_extra -= prepayment
                
        # Record monthly snapshot
        schedule.append({
            "month": month,
            "interest": round(interest_this_month, 2),
            "principal": round(principal_this_month, 2),
            "outstanding": round(sum(l["outstanding"] for l in loans), 2)
        })
        
    return {
        "total_interest": round(total_interest, 2),
        "months": month,
        "schedule": schedule
    }

def calculate_monthly_emi(principal: float, annual_roi: float, tenure_months: int) -> float:
    """
    Standard EMI calculation formula:
    EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
    """
    if principal <= 0 or tenure_months <= 0:
        return 0.0
    r = (annual_roi / 100.0) / 12.0
    if r == 0:
        return principal / tenure_months
    try:
        emi = principal * r * ((1.0 + r) ** tenure_months) / (((1.0 + r) ** tenure_months) - 1.0)
        return emi
    except (ZeroDivisionError, OverflowError):
        return principal / tenure_months


# ---------------------------------------------------------------------------
# Taxation domain helpers
#
# Income-tax computation (slabs, rebate, surcharge, cess, deductions, HRA) lives in
# backend/tax/, driven by versioned rule sets in backend/tax/rules/*.json. Only
# year-independent helpers remain here: the current financial year and capital-gains
# classification/FIFO lot matching, which the tax engine and the Sell-transaction
# flow both use.
# ---------------------------------------------------------------------------

def get_current_financial_year() -> str:
    """
    Indian financial year runs Apr 1 - Mar 31. Returns e.g. "2026-27".
    """
    today = date.today()
    if today.month >= 4:
        return f"{today.year}-{str(today.year + 1)[2:]}"
    return f"{today.year - 1}-{str(today.year)[2:]}"


def determine_gain_type(purchase_date: str, sale_date: str, asset_category: str) -> str:
    """
    Equity (Stock/Mutual Fund) uses a 12-month LTCG threshold; everything else
    (Property, etc.) uses 24 months.
    """
    try:
        p = datetime.strptime(purchase_date, "%Y-%m-%d").date()
        s = datetime.strptime(sale_date, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return "STCG"

    holding_days = (s - p).days
    threshold_days = 365 if asset_category in ("Stock", "Mutual Fund") else 730
    return "LTCG" if holding_days > threshold_days else "STCG"


def calculate_capital_gains_for_lots(lots: list, sale_quantity: float, sale_price_per_unit: float,
                                      sale_date: str, asset_category: str) -> dict:
    """
    FIFO-consumes `lots` (each {"purchase_date", "quantity", "price_per_unit"}, oldest
    first) up to sale_quantity, splitting the resulting gain/loss into STCG/LTCG buckets
    per lot based on determine_gain_type. Returns the buckets plus which lots were
    consumed and by how much (for the caller to actually reduce holding_lots rows).
    """
    remaining = max(sale_quantity, 0.0)
    stcg_amount = 0.0
    ltcg_amount = 0.0
    consumed = []

    sorted_lots = sorted(lots, key=lambda l: l.get("purchase_date") or "")
    for lot in sorted_lots:
        if remaining <= 0:
            break
        lot_qty = float(lot.get("quantity", 0.0))
        if lot_qty <= 0:
            continue
        take = min(lot_qty, remaining)
        cost_basis = take * float(lot.get("price_per_unit", 0.0))
        sale_value = take * sale_price_per_unit
        gain = sale_value - cost_basis
        gain_type = determine_gain_type(lot.get("purchase_date"), sale_date, asset_category)
        if gain_type == "LTCG":
            ltcg_amount += gain
        else:
            stcg_amount += gain
        consumed.append({
            "lot_id": lot.get("id"),
            "quantity_consumed": take,
            "cost_basis": round(cost_basis, 2),
            "sale_value": round(sale_value, 2),
            "gain": round(gain, 2),
            "gain_type": gain_type,
        })
        remaining -= take

    return {
        "stcg_amount": round(stcg_amount, 2),
        "ltcg_amount": round(ltcg_amount, 2),
        "unmatched_quantity": round(max(remaining, 0.0), 2),
        "lots_consumed": consumed,
    }


# ---------------------------------------------------------------------------
# Credit Card comparison (Compare Cards / Card Library)
#
# Both a user's owned cards (liabilities + credit_card_details) and Card
# Library reference variants (card_variants) share the same category_rules_
# json/milestone_rules_json/redemption_partners_json shape by design, so both
# can be normalized into one common dict and scored identically. Card Library
# variants have no real spend data at all — reward value there is always a
# projection against a hypothetical assumed annual spend. Owned cards now have
# a real per-category 'Spend' transaction ledger (see calculate_statement_cycle
# below and get_init_data/spend-breakdown in main.py); resolve_reward_rate's
# optional category_spend_map parameter lets a caller enforce a category
# rule's groupLabel as a real pooled ceiling across categories using that real
# per-category data — compare_cards itself still doesn't pass one, since its
# projection is against a hypothetical assumed annual spend with no current-
# cycle history to pool against; the live Calculator in CreditCards.tsx is
# where this is wired to real data (its TS port of this function mirrors the
# pooling logic here).
# ---------------------------------------------------------------------------

def calculate_statement_cycle(statement_date: Optional[int], as_of: date) -> dict:
    """
    Given a credit card's statement_date (day-of-month, 1-31) and a reference
    date, returns the {start, end} (ISO date strings) of the billing cycle
    containing as_of. Clamps to each month's actual length (so day 31 in a
    30-day month, or day 29-31 in February, falls back to that month's last
    day) and correctly walks back a month when statement_date hasn't occurred
    yet this month. No stored cycle-anchor and no scheduled reset anywhere in
    Artha — this is computed fresh from statement_date on every call.
    """
    day = int(statement_date) if statement_date else 15
    day = max(1, min(31, day))

    def clamped(year: int, month: int) -> date:
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, min(day, last_day))

    def shift_month(year: int, month: int, delta: int):
        idx = (year * 12 + (month - 1)) + delta
        return idx // 12, (idx % 12) + 1

    this_month_date = clamped(as_of.year, as_of.month)

    if as_of >= this_month_date:
        start = this_month_date
        ny, nm = shift_month(as_of.year, as_of.month, 1)
        end = clamped(ny, nm) - timedelta(days=1)
    else:
        py, pm = shift_month(as_of.year, as_of.month, -1)
        start = clamped(py, pm)
        end = this_month_date - timedelta(days=1)

    return {"start": start.isoformat(), "end": end.isoformat()}

def resolve_reward_rate(category_rules: list, milestone_rules: list, current_spend: float,
                         hypothetical_amount: float, base_points: float, base_spend: float,
                         category: Optional[str] = None, category_spend_map: Optional[dict] = None) -> dict:
    """
    Ports CreditCards.tsx's calculatorRecommendations rate-resolution logic:
    category exclusion check -> category multiplier -> milestone step-up ->
    raw points -> tightest applicable cap. Returns points earned on
    hypothetical_amount plus whether a milestone/exclusion/cap applied.

    A category rule may carry a legacy single `monthlyCapPoints` and/or a
    `caps` list (each `{capPoints, period, groupLabel?}`) for banks with
    multiple simultaneous ceilings (e.g. a daily cap alongside a monthly one).
    All present cap values are treated as independent simultaneous ceilings and
    the tightest (minimum) one is applied — since hypothetical_amount is always
    one isolated transaction, not a running total, this is exact: whichever
    cap is tightest is the one that would actually bind, with no date
    arithmetic needed.

    `groupLabel` (a bank's stated shared/pooled cap name, e.g. "part of the
    overall Accelerated Rewards pool") marks a cap entry as shared across every
    category rule on the card that declares the same groupLabel — the pool's
    capPoints is a ceiling on their COMBINED points this cycle, not each
    category's own independent ceiling. Enforcing this needs real per-category
    spend-so-far-this-cycle, which callers pass as `category_spend_map` (a
    {category_name: amount} dict, e.g. from GET /api/liabilities/{id}/
    spend-breakdown's by_category) — the only reason this function now takes a
    DB-adjacent input despite otherwise being pure math. If omitted (or a card
    has no real Spend history yet), pooled caps are silently skipped and only
    each category's own individual caps apply, exactly like before this
    parameter existed. Sibling categories' already-earned points are estimated
    using THIS call's resolved card-wide rate/spend-block (milestone step-up is
    a card-level threshold, not per-category, so there is no separate
    "historical rate" to reconstruct) and clamped by each sibling's own
    non-pooled caps — an approximation Artha's design already leans on
    elsewhere (e.g. compare_cards' spend-free projections), since there is no
    per-transaction point ledger anywhere to know the exact rate that applied
    to each real historical transaction.
    """
    matching_rule = None
    if category:
        for rule in category_rules:
            if str(rule.get("category", "")).lower() == category.lower():
                matching_rule = rule
                break

    if matching_rule and matching_rule.get("isExcluded"):
        return {"points": 0.0, "excluded": True, "milestone_triggered": False, "capped": False}

    multiplier = float(matching_rule["multiplier"]) if matching_rule else 1.0

    projected_spend_total = current_spend + hypothetical_amount
    triggered = sorted(
        [r for r in milestone_rules if projected_spend_total >= float(r.get("spendThreshold", 0.0))],
        key=lambda r: float(r.get("spendThreshold", 0.0)),
        reverse=True,
    )
    milestone_triggered = len(triggered) > 0
    rate = float(triggered[0]["bonusPointsRate"]) if milestone_triggered else base_points
    spend_block = float(triggered[0]["pointsPerSpend"]) if milestone_triggered else base_spend
    spend_block = spend_block if spend_block > 0 else 1.0

    raw_points = (hypothetical_amount / spend_block) * rate * multiplier

    capped = False
    if matching_rule:
        candidate_caps = []
        if matching_rule.get("monthlyCapPoints") is not None:
            candidate_caps.append(float(matching_rule["monthlyCapPoints"]))
        pooled_caps = []
        for cap_rule in (matching_rule.get("caps") or []):
            if cap_rule.get("capPoints") is None:
                continue
            # A pooled cap still applies as its own ordinary ceiling on this
            # category (unchanged default behavior) - category_spend_map, when
            # available, adds an EXTRA, usually-tighter candidate below for the
            # pool's combined remaining headroom. It never replaces this one.
            candidate_caps.append(float(cap_rule["capPoints"]))
            if cap_rule.get("groupLabel"):
                pooled_caps.append(cap_rule)

        if category_spend_map:
            for pool_cap in pooled_caps:
                group_label = pool_cap["groupLabel"]
                pool_ceiling = float(pool_cap["capPoints"])
                consumed = 0.0
                for sibling in category_rules:
                    sibling_name = str(sibling.get("category", ""))
                    if sibling.get("isExcluded"):
                        continue
                    if not any(
                        c.get("groupLabel") == group_label and c.get("capPoints") is not None
                        for c in (sibling.get("caps") or [])
                    ):
                        continue
                    sibling_spend = float(category_spend_map.get(sibling_name, 0.0) or 0.0)
                    if sibling_spend <= 0:
                        continue
                    sibling_points = sibling_spend / spend_block * rate * float(sibling.get("multiplier", 1.0))
                    sibling_individual_caps = [
                        float(c["capPoints"]) for c in (sibling.get("caps") or [])
                        if c.get("capPoints") is not None and c.get("groupLabel") != group_label
                    ]
                    if sibling.get("monthlyCapPoints") is not None:
                        sibling_individual_caps.append(float(sibling["monthlyCapPoints"]))
                    if sibling_individual_caps:
                        sibling_points = min(sibling_points, min(sibling_individual_caps))
                    consumed += sibling_points
                candidate_caps.append(max(0.0, pool_ceiling - consumed))

        if candidate_caps:
            effective_cap = min(candidate_caps)
            if raw_points > effective_cap:
                raw_points = effective_cap
                capped = True

    return {"points": round(raw_points), "excluded": False, "milestone_triggered": milestone_triggered, "capped": capped}


def normalize_card_for_comparison(card: dict, source: str) -> dict:
    """
    Maps either an owned card (liabilities + credit_card_details, source='owned')
    or a Card Library variant (card_variants, source='library') into one common
    shape for compare_cards(). card's JSON fields must already be parsed lists
    (not raw JSON strings) by the caller.
    """
    return {
        "id": card.get("id") if source == "library" else card.get("liability_id"),
        "source": source,
        "label": card.get("name", "Unnamed Card"),
        "issuer": card.get("issuer") or card.get("lender_name") or "",
        "network": card.get("network", "Visa"),
        "annual_fee": float(card.get("annual_fee", 0.0) or 0.0),
        "joining_fee": float(card.get("joining_fee", 0.0) or 0.0) if source == "library" else 0.0,
        "point_value": float(card.get("point_value", 0.25) or 0.25),
        "base_points": float(card.get("base_points", 1.0) or 1.0),
        "base_spend": float(card.get("base_spend", 100.0) or 100.0),
        "lounge_domestic": float(card.get("lounge_visits_domestic", card.get("lounge_visits_limit", 0.0)) or 0.0),
        "lounge_international": float(card.get("lounge_visits_international", card.get("lounge_int_limit", 0.0)) or 0.0),
        "category_rules": card.get("category_rules") or [],
        "milestone_rules": card.get("milestone_rules") or [],
        "redemption_partners": card.get("redemption_partners") or [],
        "fee_waiver_spend": float(card.get("fee_waiver_spend", card.get("milestone_spend_target", 0.0)) or 0.0),
        "accrued_reward_value": (
            round(float(card.get("reward_points", 0.0) or 0.0) * float(card.get("point_value", 0.25) or 0.25), 2)
            if source == "owned" else None
        ),
        "fee_waiver_progress": (
            round(float(card.get("milestone_spend_current", 0.0) or 0.0) / float(card["milestone_spend_target"]), 4)
            if source == "owned" and float(card.get("milestone_spend_target", 0.0) or 0.0) > 0 else None
        ),
    }


def _minmax_normalize(values: list, invert: bool = False) -> list:
    """Scales a list of raw values to 0-100 relative to the set's own min/max (no external benchmark exists)."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi == lo:
        return [100.0 for _ in values]
    scaled = [(v - lo) / (hi - lo) * 100.0 for v in values]
    return [100.0 - s for s in scaled] if invert else scaled


def compare_cards(cards: list, weights: Optional[dict] = None, assumed_annual_spend: float = 600000.0) -> dict:
    """
    cards: list of normalized dicts from normalize_card_for_comparison(), 2-5 entries.
    weights: {"fee_tolerance", "reward_value", "lounge_access", "milestone_ease", "simplicity"},
    normalized to sum to 1.0 if provided; defaults to equal weighting.
    Scores are relative to the OTHER cards in this comparison set, not an absolute
    external scale — there is no independent benchmark data anywhere in Artha.
    """
    default_weights = {"fee_tolerance": 0.2, "reward_value": 0.4, "lounge_access": 0.2, "milestone_ease": 0.1, "simplicity": 0.1}
    w = {**default_weights, **(weights or {})}
    total_w = sum(w.values()) or 1.0
    w = {k: v / total_w for k, v in w.items()}

    projected_values = []
    for c in cards:
        result = resolve_reward_rate(
            c["category_rules"], c["milestone_rules"], 0.0, assumed_annual_spend,
            c["base_points"], c["base_spend"], category=None
        )
        projected_values.append(round(result["points"] * c["point_value"], 2))

    fee_scores = _minmax_normalize([c["annual_fee"] for c in cards], invert=True)
    reward_scores = _minmax_normalize(projected_values)
    lounge_scores = _minmax_normalize([c["lounge_domestic"] + c["lounge_international"] * 1.5 for c in cards])
    milestone_scores = _minmax_normalize(
        [1.0 / c["fee_waiver_spend"] if c["fee_waiver_spend"] > 0 else 1.0 for c in cards]
    )
    simplicity_scores = [
        max(0.0, 100.0 - (len(c["category_rules"]) + len(c["milestone_rules"])) * 10.0) for c in cards
    ]

    results = []
    for i, c in enumerate(cards):
        scores = {
            "fee": round(fee_scores[i], 1),
            "reward_value": round(reward_scores[i], 1),
            "lounge_access": round(lounge_scores[i], 1),
            "milestone_ease": round(milestone_scores[i], 1),
            "simplicity": round(simplicity_scores[i], 1),
        }
        weighted_total = round(
            scores["fee"] * w["fee_tolerance"] + scores["reward_value"] * w["reward_value"] +
            scores["lounge_access"] * w["lounge_access"] + scores["milestone_ease"] * w["milestone_ease"] +
            scores["simplicity"] * w["simplicity"], 1
        )
        results.append({
            "id": c["id"],
            "source": c["source"],
            "label": c["label"],
            "issuer": c["issuer"],
            "scores": scores,
            "weighted_total": weighted_total,
            "projected_annual_reward_value": projected_values[i],
            "annual_fee": c["annual_fee"],
            "net_annual_value": round(projected_values[i] - c["annual_fee"], 2),
        })

    winner = max(results, key=lambda r: r["weighted_total"]) if results else None

    return {
        "weights_used": w,
        "assumed_annual_spend": assumed_annual_spend,
        "cards": results,
        "winner_id": winner["id"] if winner else None,
        "winner_source": winner["source"] if winner else None,
        "caveats": [
            f"Reward projections assume ₹{assumed_annual_spend:,.0f}/year of even spend, not your actual category mix — no per-transaction category data exists in Artha.",
            "Card Library entries use indicative published terms and may be outdated — verify current offers with the issuer before applying.",
        ],
    }


