import math
from datetime import datetime, date
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
# Taxation domain
#
# Best-effort estimate for decision support only — this is NOT tax advice.
# Indian income-tax slabs, rebates, and capital-gains rates change with each
# Union Budget; verify against the current Finance Act before relying on any
# of the numbers below for real filing decisions. TAX_SLABS holds only the
# currently-applicable brackets (no multi-year history) — to add a new
# financial year's brackets without breaking old estimates, restructure this
# into TAX_SLABS["<FY>"][...] and look up by financial_year at that point.
# ---------------------------------------------------------------------------

TAX_SLABS = {
    "New": {
        # (upper_bound_exclusive_or_None, rate_percent) — cumulative brackets, same for all ages
        "default": [
            (400000, 0.0), (800000, 5.0), (1200000, 10.0), (1600000, 15.0),
            (2000000, 20.0), (2400000, 25.0), (None, 30.0),
        ],
    },
    "Old": {
        "Below60": [(250000, 0.0), (500000, 5.0), (1000000, 20.0), (None, 30.0)],
        "60to80": [(300000, 0.0), (500000, 5.0), (1000000, 20.0), (None, 30.0)],
        "Above80": [(500000, 0.0), (1000000, 20.0), (None, 30.0)],
    },
}
CESS_RATE = 4.0  # Health & Education Cess, applied on tax after rebate, both regimes


def get_current_financial_year() -> str:
    """
    Indian financial year runs Apr 1 - Mar 31. Returns e.g. "2026-27".
    """
    today = date.today()
    if today.month >= 4:
        return f"{today.year}-{str(today.year + 1)[2:]}"
    return f"{today.year - 1}-{str(today.year)[2:]}"


def apply_slabs(taxable_income: float, brackets: list) -> float:
    """
    Walks a list of (upper_bound_exclusive_or_None, rate_percent) cumulative brackets
    and returns the total tax before any rebate/cess. taxable_income must be >= 0.
    """
    if taxable_income <= 0:
        return 0.0

    tax = 0.0
    lower = 0.0
    for upper, rate in brackets:
        if upper is None:
            slab_amount = max(taxable_income - lower, 0.0)
        else:
            slab_amount = max(min(taxable_income, upper) - lower, 0.0)
        tax += slab_amount * (rate / 100.0)
        if upper is not None and taxable_income <= upper:
            break
        lower = upper if upper is not None else lower
    return tax


def calculate_tax_new_regime(taxable_income: float, rebate_threshold: float = 700000.0) -> dict:
    """
    New regime: same brackets regardless of age. Section 87A rebate zeroes out tax
    entirely (not just to the threshold) when taxable_income is within the limit.
    """
    taxable_income = max(taxable_income, 0.0)
    gross_tax = apply_slabs(taxable_income, TAX_SLABS["New"]["default"])
    rebate = gross_tax if taxable_income <= rebate_threshold else 0.0
    tax_after_rebate = max(gross_tax - rebate, 0.0)
    cess = tax_after_rebate * (CESS_RATE / 100.0)
    total_tax = tax_after_rebate + cess
    return {
        "gross_tax": round(gross_tax, 2),
        "rebate_87a": round(rebate, 2),
        "cess": round(cess, 2),
        "total_tax": round(total_tax, 2),
    }


def calculate_tax_old_regime(taxable_income: float, age_band: str = "Below60", rebate_threshold: float = 500000.0) -> dict:
    """
    Old regime: brackets vary by age_band ('Below60' / '60to80' / 'Above80').
    """
    taxable_income = max(taxable_income, 0.0)
    brackets = TAX_SLABS["Old"].get(age_band, TAX_SLABS["Old"]["Below60"])
    gross_tax = apply_slabs(taxable_income, brackets)
    rebate = gross_tax if taxable_income <= rebate_threshold else 0.0
    tax_after_rebate = max(gross_tax - rebate, 0.0)
    cess = tax_after_rebate * (CESS_RATE / 100.0)
    total_tax = tax_after_rebate + cess
    return {
        "gross_tax": round(gross_tax, 2),
        "rebate_87a": round(rebate, 2),
        "cess": round(cess, 2),
        "total_tax": round(total_tax, 2),
    }


def calculate_hra_exemption(basic_salary: float, hra_received: float, rent_paid: float, is_metro: bool,
                             metro_pct: float = 50.0, nonmetro_pct: float = 40.0) -> float:
    """
    Standard three-way minimum: HRA actually received, rent paid minus 10% of basic,
    and 50%/40% (metro/non-metro) of basic salary. Floors at 0 (no negative exemption).
    """
    if basic_salary <= 0 or hra_received <= 0 or rent_paid <= 0:
        return 0.0
    pct = metro_pct if is_metro else nonmetro_pct
    candidates = [
        hra_received,
        max(rent_paid - 0.10 * basic_salary, 0.0),
        basic_salary * (pct / 100.0),
    ]
    return round(max(min(candidates), 0.0), 2)


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


def calculate_capital_gains_tax(stcg_amount: float, ltcg_amount: float, asset_category: str,
                                 ltcg_exemption: float = 125000.0, stcg_rate: float = 20.0,
                                 ltcg_rate: float = 12.5) -> dict:
    """
    Equity (Stock/Mutual Fund): STCG flat at stcg_rate; LTCG flat at ltcg_rate above
    an annual exemption. Property/other: LTCG flat at ltcg_rate with no indexation
    (current-rules simplification); STCG is not taxed here at a flat rate — it must be
    added to the person's slab-taxed income by the caller (stcg_add_to_slab=True).
    """
    is_equity = asset_category in ("Stock", "Mutual Fund")
    if is_equity:
        taxable_ltcg = max(ltcg_amount - ltcg_exemption, 0.0)
        ltcg_tax = taxable_ltcg * (ltcg_rate / 100.0)
        stcg_tax = max(stcg_amount, 0.0) * (stcg_rate / 100.0)
        return {
            "stcg_amount": round(stcg_amount, 2),
            "ltcg_amount": round(ltcg_amount, 2),
            "taxable_ltcg": round(taxable_ltcg, 2),
            "stcg_tax": round(stcg_tax, 2),
            "ltcg_tax": round(ltcg_tax, 2),
            "total_tax": round(stcg_tax + ltcg_tax, 2),
            "stcg_add_to_slab": False,
        }
    else:
        ltcg_tax = max(ltcg_amount, 0.0) * (ltcg_rate / 100.0)
        return {
            "stcg_amount": round(stcg_amount, 2),
            "ltcg_amount": round(ltcg_amount, 2),
            "taxable_ltcg": round(max(ltcg_amount, 0.0), 2),
            "stcg_tax": 0.0,
            "ltcg_tax": round(ltcg_tax, 2),
            "total_tax": round(ltcg_tax, 2),
            "stcg_add_to_slab": True,
        }


def compare_tax_regimes(taxable_income_old: float, taxable_income_new: float, age_band: str = "Below60",
                         rebate_new: float = 700000.0, rebate_old: float = 500000.0) -> dict:
    """
    Computes both regimes' liability and recommends the lower one.
    """
    old_result = calculate_tax_old_regime(taxable_income_old, age_band, rebate_old)
    new_result = calculate_tax_new_regime(taxable_income_new, rebate_new)
    recommended = "Old" if old_result["total_tax"] <= new_result["total_tax"] else "New"
    return {
        "old_regime": old_result,
        "new_regime": new_result,
        "recommended_regime": recommended,
        "savings_with_recommended": round(abs(old_result["total_tax"] - new_result["total_tax"]), 2),
    }


