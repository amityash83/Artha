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

def simulate_multi_loan_payoff(loans_list: list, extra_monthly: float, strategy: str = "baseline") -> dict:
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
    
    while any(l["outstanding"] > 0 for l in loans) and month < max_simulation_months:
        month += 1
        interest_this_month = 0.0
        principal_this_month = 0.0
        extra_available = extra_monthly if strategy != "baseline" else 0.0
        
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
                
                # Pay the extra cash to the primary target
                target = active_loans[0]
                prepayment = min(extra_available, target["outstanding"])
                target["outstanding"] = max(target["outstanding"] - prepayment, 0.0)
                principal_this_month += prepayment
                
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

