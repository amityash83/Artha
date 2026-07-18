from datetime import datetime, date

def get_rules(cursor):
    cursor.execute("SELECT rule_key, value, is_enabled FROM financial_rules")
    return {row["rule_key"]: {"value": row["value"], "enabled": bool(row["is_enabled"])} for row in cursor.fetchall()}

def generate_recommendations(conn) -> list:
    cursor = conn.cursor()
    
    # 1. Fetch rules
    rules = get_rules(cursor)
    min_emergency_target = rules.get("min_emergency_fund", {}).get("value", 1500000.0) if rules.get("min_emergency_fund", {}).get("enabled", True) else 1500000.0
    ins_reserve_target = rules.get("insurance_reserve_target", {}).get("value", 300000.0) if rules.get("insurance_reserve_target", {}).get("enabled", True) else 300000.0
    debt_free_liquidity_target = rules.get("debt_free_liquidity_target", {}).get("value", 3000000.0) if rules.get("debt_free_liquidity_target", {}).get("enabled", True) else 3000000.0
    
    high_roi_threshold = rules.get("high_interest_roi_threshold", {}).get("value", 7.5) if rules.get("high_interest_roi_threshold", {}).get("enabled", True) else 7.5
    prepay_min_buffer = rules.get("prepayment_min_liquid_buffer", {}).get("value", 50000.0) if rules.get("prepayment_min_liquid_buffer", {}).get("enabled", True) else 50000.0
    ins_renewal_alert_days = rules.get("insurance_renewal_alert_days", {}).get("value", 30.0) if rules.get("insurance_renewal_alert_days", {}).get("enabled", True) else 30.0
    
    # 2. Fetch Accounts (liquid funds)
    cursor.execute("""
        SELECT 
            name,
            (
                SELECT COALESCE(SUM(t.amount), 0.0) 
                FROM transactions t 
                WHERE t.dest_ref_type = 'Account' AND t.dest_ref_id = a.id
            ) - (
                SELECT COALESCE(SUM(t.amount), 0.0) 
                FROM transactions t 
                WHERE t.source_ref_type = 'Account' AND t.source_ref_id = a.id
            ) AS current_balance
        FROM accounts a
    """)
    accounts = cursor.fetchall()
    total_liquid = sum(row["current_balance"] for row in accounts)
    
    # 3. Fetch Liabilities (Loans)
    cursor.execute("""
        SELECT l.id, l.name, inst.name as lender, l.outstanding, l.interest_rate as roi, l.emi 
        FROM liabilities l 
        LEFT JOIN institutions inst ON l.lender_institution_id = inst.id
    """)
    loans = cursor.fetchall()
    total_loans_outstanding = sum(row["outstanding"] for row in loans)
    
    # 4. Fetch Goals
    cursor.execute("SELECT name, target_amount, current_amount, monthly_contribution, target_date as expected_completion, priority FROM goals")
    goals = cursor.fetchall()
    
    recs = []
    
    # Check 1: General Liquidity / Emergency Fund Rule
    emergency_goal = next((g for g in goals if "emergency" in g["name"].lower()), None)
    if emergency_goal:
        curr_emergency = emergency_goal["current_amount"]
        targ_emergency = emergency_goal["target_amount"]
    else:
        curr_emergency = total_liquid  # fallback if goal not set
        targ_emergency = min_emergency_target
        
    if curr_emergency < min_emergency_target:
        gap = min_emergency_target - curr_emergency
        recs.append({
            "category": "Emergency Fund",
            "title": "Emergency Fund Deficit",
            "message": f"Emergency Fund is below rule limit of ₹{min_emergency_target:,.0f} by ₹{gap:,.0f}. Stop equity investing and redirect savings here.",
            "status": "danger",
            "action_type": "save",
            "suggested_amount": gap
        })
    elif curr_emergency < targ_emergency:
        gap = targ_emergency - curr_emergency
        recs.append({
            "category": "Emergency Fund",
            "title": "Emergency Fund Building",
            "message": f"Emergency Fund is currently ₹{curr_emergency:,.0f}. You are ₹{gap:,.0f} away from your target of ₹{targ_emergency:,.0f}.",
            "status": "warning",
            "action_type": "save",
            "suggested_amount": gap
        })
    else:
        recs.append({
            "category": "Emergency Fund",
            "title": "Emergency Fund Healthy",
            "message": f"Emergency Fund is fully funded at ₹{curr_emergency:,.0f}.",
            "status": "success",
            "action_type": "info",
            "suggested_amount": 0.0
        })

    # Check 2: Insurance Reserve Rule
    ins_goal = next((g for g in goals if "insurance" in g["name"].lower()), None)
    if ins_goal:
        curr_ins = ins_goal["current_amount"]
        targ_ins = ins_goal["target_amount"]
    else:
        curr_ins = 0.0
        targ_ins = ins_reserve_target
        
    if curr_ins < ins_reserve_target:
        gap = ins_reserve_target - curr_ins
        recs.append({
            "category": "Insurance",
            "title": "Insurance Reserve Low",
            "message": f"Insurance reserve is at ₹{curr_ins:,.0f}, below your rule target of ₹{ins_reserve_target:,.0f}. Top up by ₹{gap:,.0f}.",
            "status": "danger",
            "action_type": "save",
            "suggested_amount": gap
        })
    else:
        recs.append({
            "category": "Insurance",
            "title": "Insurance Reserve Safe",
            "message": "Insurance reserve matches or exceeds target rules.",
            "status": "success",
            "action_type": "info",
            "suggested_amount": 0.0
        })

    # Check 3: Loan Prepayment Recommendations
    high_interest_loans = [l for l in loans if l["roi"] >= high_roi_threshold and l["outstanding"] > 0]
    if high_interest_loans:
        for loan in high_interest_loans:
            free_liquid = total_liquid - min_emergency_target
            if free_liquid > prepay_min_buffer:
                prepay_val = min(free_liquid * 0.5, loan["outstanding"])
                recs.append({
                    "category": "Loans",
                    "title": f"Prepayment Recommended: {loan['name']}",
                    "message": f"Your {loan['name']} loan (Lender: {loan['lender'] or 'N/A'}) has an ROI of {loan['roi']}%. Since you have surplus liquidity of ₹{free_liquid:,.0f}, prepaying ₹{prepay_val:,.0f} is highly recommended.",
                    "status": "warning",
                    "action_type": "prepay",
                    "suggested_amount": prepay_val
                })
            else:
                recs.append({
                    "category": "Loans",
                    "title": f"Debt Reduction Opportunity: {loan['name']}",
                    "message": f"You have an active loan {loan['name']} at {loan['roi']}% ROI. Once your emergency fund is stable, focus your monthly cash surplus on prepaying this.",
                    "status": "info",
                    "action_type": "info",
                    "suggested_amount": 0.0
                })

    # Check 4: Debt-Free Liquidity Target (if no active loans)
    if total_loans_outstanding == 0:
        if total_liquid < debt_free_liquidity_target:
            gap = debt_free_liquidity_target - total_liquid
            recs.append({
                "category": "Liquidity",
                "title": "Build Post-Debt Liquidity",
                "message": f"You are debt-free! The rule recommends maintaining ₹{debt_free_liquidity_target:,.0f} liquidity. You need ₹{gap:,.0f} more.",
                "status": "warning",
                "action_type": "save",
                "suggested_amount": gap
            })
        else:
            recs.append({
                "category": "Liquidity",
                "title": "Optimal Liquidity Achieved",
                "message": f"Debt-free and holding ₹{total_liquid:,.0f} in liquid funds. You are in a premium financial position.",
                "status": "success",
                "action_type": "info",
                "suggested_amount": 0.0
            })

    # Check 5: Goal specific warnings (e.g. Villa Fund)
    villa_goal = next((g for g in goals if "villa" in g["name"].lower()), None)
    if villa_goal:
        gap = villa_goal["target_amount"] - villa_goal["current_amount"]
        if gap > 0:
            recs.append({
                "category": "Villa Fund",
                "title": "Villa Fund Shortfall",
                "message": f"Villa fund is short by ₹{gap:,.0f}. Expected completion: {villa_goal['expected_completion'] or 'N/A'}.",
                "status": "warning",
                "action_type": "save",
                "suggested_amount": gap
            })
            
    # Check 5b: Goal funding constraints — flag any goal funded (via goal_holdings)
    # from an asset category the goal explicitly excludes (goal_funding_constraints).
    # This replaces the old hardcoded, unenforced "no_villa_equity" rule with a
    # generic, per-goal, DB-configurable constraint.
    cursor.execute("""
        SELECT g.name as goal_name, cat.name as category_name, a.name as asset_name
        FROM goal_funding_constraints gfc
        JOIN goals g ON g.id = gfc.goal_id
        JOIN goal_holdings gh ON gh.goal_id = gfc.goal_id
        JOIN assets a ON a.id = gh.asset_id AND a.category_id = gfc.excluded_category_id
        JOIN categories cat ON cat.id = gfc.excluded_category_id
    """)
    violations = cursor.fetchall()
    for v in violations:
        recs.append({
            "category": "Goal Funding",
            "title": f"Funding Rule Violated: {v['goal_name']}",
            "message": f"'{v['goal_name']}' excludes funding from {v['category_name']}, but is currently linked to '{v['asset_name']}' ({v['category_name']}). Reassign this holding or remove the funding constraint.",
            "status": "warning",
            "action_type": "info",
            "suggested_amount": 0.0
        })

    # Check 6: Insurance premium reminders (within 30 days) from insurance_details
    cursor.execute("""
        SELECT inst.name as company, ins.renewal_date, ins.premium
        FROM assets a
        LEFT JOIN institutions inst ON a.institution_id = inst.id
        LEFT JOIN insurance_details ins ON ins.asset_id = a.id
        WHERE a.category_id = (SELECT id FROM categories WHERE name = 'Insurance')
    """)
    policies = cursor.fetchall()
    today_dt = date.today()
    for policy in policies:
        ren_date_str = policy["renewal_date"]
        premium = float(policy["premium"] or 0.0)
        if ren_date_str:
            try:
                ren_date = datetime.strptime(ren_date_str, "%Y-%m-%d").date()
                days_left = (ren_date - today_dt).days
                if 0 <= days_left <= ins_renewal_alert_days:
                    recs.append({
                        "category": "Insurance Renewal",
                        "title": f"Premium Due: {policy['company'] or 'Insurance'}",
                        "message": f"Premium of ₹{premium:,.0f} is due in {days_left} days ({ren_date_str}).",
                        "status": "danger",
                        "action_type": "info",
                        "suggested_amount": premium
                    })
            except Exception:
                continue

    return recs
