import os
import shutil
import json
import math
from datetime import datetime, date
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.db import get_db_connection, init_db, get_db_path, get_db_dir
import backend.calculations as calc
from backend.decision_engine import generate_recommendations

app = FastAPI(title="Artha API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    init_db()

# --- Pydantic Models for Requests ---
class AccountSchema(BaseModel):
    name: str
    institution: str
    current_balance: float
    remarks: Optional[str] = ""

class LoanSchema(BaseModel):
    name: str
    lender: str
    outstanding: float
    roi: float
    emi: float
    tenure: int # original tenure in months
    start_date: str # YYYY-MM-DD
    prepayment_allowed: bool
    processing_fee: float
    loan_type: str

class InvestmentSchema(BaseModel):
    name: str
    type: str # Mutual Fund, Stock, PPF, EPF, Gold, NPS, etc.
    current_value: float
    invested_amount: float
    goal_mapping: Optional[str] = ""

class PropertySchema(BaseModel):
    name: str
    purchase_price: float
    current_value: float
    associated_loan_id: Optional[int] = None
    rental_income: float = 0.0
    expenses: float = 0.0
    remarks: Optional[str] = ""

class InsuranceSchema(BaseModel):
    company: str
    policy_number: str
    premium: float
    frequency: str # Monthly, Quarterly, Half-Yearly, Yearly
    coverage: float
    nominee: str
    maturity_date: Optional[str] = ""
    last_premium_date: Optional[str] = ""
    renewal_date: Optional[str] = ""
    waiting_period: Optional[str] = ""
    claim_history: Optional[str] = ""
    insurance_type: Optional[str] = "Traditional Life"
    surrender_value: Optional[float] = 0.0

class GoalSchema(BaseModel):
    name: str
    target_amount: float
    current_amount: float
    monthly_contribution: float
    goal_type: str

class RuleSchema(BaseModel):
    rule_key: str
    value: float
    is_enabled: bool

class SimulationRequestSchema(BaseModel):
    scenario_type: str # close_loan, delay_goal, increase_sip, salary_change, receive_bonus, roi_reduction, brother_property
    params: dict # parameters specific to the scenario

# --- Core Aggregate / Dashboard Data ---
@app.get("/api/init")
def get_init_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Accounts
        cursor.execute("SELECT * FROM accounts")
        accounts = [dict(row) for row in cursor.fetchall()]
        
        # Loans
        cursor.execute("SELECT * FROM loans")
        loans_raw = cursor.fetchall()
        loans = []
        for r in loans_raw:
            d = dict(r)
            rem_n = calc.calculate_remaining_tenure(d["outstanding"], d["roi"], d["emi"])
            d["remaining_tenure"] = round(rem_n, 1) if rem_n != float('inf') else -1
            d["remaining_interest"] = round(calc.calculate_remaining_interest(d["outstanding"], d["roi"], d["emi"]), 2)
            d["progress"] = round(calc.calculate_loan_progress(d["tenure"], rem_n), 1)
            loans.append(d)
            
        # Investments
        cursor.execute("SELECT * FROM investments")
        investments = [dict(row) for row in cursor.fetchall()]
        
        # Properties
        cursor.execute("SELECT * FROM properties")
        properties = [dict(row) for row in cursor.fetchall()]
        
        # Insurance
        cursor.execute("SELECT * FROM insurance")
        insurance = [dict(row) for row in cursor.fetchall()]
        
        # Goals
        cursor.execute("SELECT * FROM goals")
        goals_raw = cursor.fetchall()
        goals = []
        for r in goals_raw:
            d = dict(r)
            comp_details = calc.calculate_goal_expected_completion(d["target_amount"], d["current_amount"], d["monthly_contribution"])
            d.update(comp_details)
            goals.append(d)

        # Credit Cards
        cursor.execute("SELECT * FROM credit_cards")
        credit_cards = [dict(row) for row in cursor.fetchall()]
            
        # Rules
        cursor.execute("SELECT * FROM financial_rules")
        rules = [dict(row) for row in cursor.fetchall()]
        
        # Recommendations
        recommendations = generate_recommendations(conn)
        
        # Net Worth Summary
        total_liquid = sum(a["current_balance"] for a in accounts)
        total_investments = sum(i["current_value"] for i in investments)
        total_properties = sum(p["current_value"] for p in properties)
        total_insurance_assets = sum(ins.get("surrender_value", 0.0) for ins in insurance)
        total_loans_debt = sum(l["outstanding"] for l in loans)
        total_cc_debt = sum(c["outstanding"] for c in credit_cards)
        total_debt = total_loans_debt + total_cc_debt
        
        total_assets = total_liquid + total_investments + total_properties + total_insurance_assets
        net_worth = total_assets - total_debt
        
        # Check historic change (compare with last month snapshot)
        cursor.execute("SELECT net_worth FROM snapshots ORDER BY month DESC LIMIT 2")
        historic_snapshots = cursor.fetchall()
        
        monthly_change = 0.0
        yearly_change = 0.0
        
        if len(historic_snapshots) >= 1:
            monthly_change = net_worth - historic_snapshots[0]["net_worth"]
        
        cursor.execute("SELECT net_worth FROM snapshots WHERE month <= ? ORDER BY month DESC LIMIT 1", 
                       ((datetime.now().year - 1),))
        last_year_snap = cursor.fetchone()
        if last_year_snap:
            yearly_change = net_worth - last_year_snap["net_worth"]
            
        summary = {
            "net_worth": net_worth,
            "total_assets": total_assets,
            "total_debt": total_debt,
            "total_liquid": total_liquid,
            "total_investments": total_investments,
            "total_properties": total_properties,
            "monthly_change": monthly_change,
            "yearly_change": yearly_change
        }
        
        return {
            "summary": summary,
            "accounts": accounts,
            "loans": loans,
            "investments": investments,
            "properties": properties,
            "insurance": insurance,
            "goals": goals,
            "rules": rules,
            "recommendations": recommendations,
            "credit_cards": credit_cards
        }
    finally:
        conn.close()

# --- Accounts Router ---
@app.post("/api/accounts")
def add_account(account: AccountSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO accounts (name, institution, current_balance, last_updated, remarks) VALUES (?, ?, ?, ?, ?)",
            (account.name, account.institution, account.current_balance, date.today().strftime("%Y-%m-%d"), account.remarks)
        )
        conn.commit()
        return {"status": "success", "message": "Account added successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/accounts/{id}")
def update_account(id: int, account: AccountSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE accounts SET name=?, institution=?, current_balance=?, last_updated=?, remarks=? WHERE id=?",
            (account.name, account.institution, account.current_balance, date.today().strftime("%Y-%m-%d"), account.remarks, id)
        )
        conn.commit()
        return {"status": "success", "message": "Account updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/accounts/{id}")
def delete_account(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM accounts WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Loans Router ---
@app.post("/api/loans")
def add_loan(loan: LoanSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO loans (name, lender, outstanding, roi, emi, tenure, start_date, prepayment_allowed, processing_fee, loan_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (loan.name, loan.lender, loan.outstanding, loan.roi, loan.emi, loan.tenure, loan.start_date, int(loan.prepayment_allowed), loan.processing_fee, loan.loan_type)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/loans/{id}")
def update_loan(id: int, loan: LoanSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """UPDATE loans SET name=?, lender=?, outstanding=?, roi=?, emi=?, tenure=?, start_date=?, prepayment_allowed=?, processing_fee=?, loan_type=?
               WHERE id=?""",
            (loan.name, loan.lender, loan.outstanding, loan.roi, loan.emi, loan.tenure, loan.start_date, int(loan.prepayment_allowed), loan.processing_fee, loan.loan_type, id)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/loans/{id}")
def delete_loan(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM loans WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Investments Router ---
@app.post("/api/investments")
def add_investment(inv: InvestmentSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO investments (name, type, current_value, invested_amount, goal_mapping, last_updated) VALUES (?, ?, ?, ?, ?, ?)",
            (inv.name, inv.type, inv.current_value, inv.invested_amount, inv.goal_mapping, date.today().strftime("%Y-%m-%d"))
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/investments/{id}")
def update_investment(id: int, inv: InvestmentSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE investments SET name=?, type=?, current_value=?, invested_amount=?, goal_mapping=?, last_updated=? WHERE id=?",
            (inv.name, inv.type, inv.current_value, inv.invested_amount, inv.goal_mapping, date.today().strftime("%Y-%m-%d"), id)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/investments/{id}")
def delete_investment(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM investments WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Properties Router ---
@app.post("/api/properties")
def add_property(prop: PropertySchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO properties (name, purchase_price, current_value, associated_loan_id, rental_income, expenses, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (prop.name, prop.purchase_price, prop.current_value, prop.associated_loan_id, prop.rental_income, prop.expenses, prop.remarks)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/properties/{id}")
def update_property(id: int, prop: PropertySchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE properties SET name=?, purchase_price=?, current_value=?, associated_loan_id=?, rental_income=?, expenses=?, remarks=? WHERE id=?",
            (prop.name, prop.purchase_price, prop.current_value, prop.associated_loan_id, prop.rental_income, prop.expenses, prop.remarks, id)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/properties/{id}")
def delete_property(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM properties WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Insurance Router ---
@app.post("/api/insurance")
def add_insurance(ins: InsuranceSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO insurance (company, policy_number, premium, frequency, coverage, nominee, maturity_date, last_premium_date, renewal_date, waiting_period, claim_history, insurance_type, surrender_value)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ins.company, ins.policy_number, ins.premium, ins.frequency, ins.coverage, ins.nominee, ins.maturity_date, ins.last_premium_date, ins.renewal_date, ins.waiting_period, ins.claim_history, ins.insurance_type, ins.surrender_value)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/insurance/{id}")
def update_insurance(id: int, ins: InsuranceSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """UPDATE insurance SET company=?, policy_number=?, premium=?, frequency=?, coverage=?, nominee=?, maturity_date=?, last_premium_date=?, renewal_date=?, waiting_period=?, claim_history=?, insurance_type=?, surrender_value=?
               WHERE id=?""",
            (ins.company, ins.policy_number, ins.premium, ins.frequency, ins.coverage, ins.nominee, ins.maturity_date, ins.last_premium_date, ins.renewal_date, ins.waiting_period, ins.claim_history, ins.insurance_type, ins.surrender_value, id)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/insurance/{id}")
def delete_insurance(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM insurance WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Goals Router ---
@app.post("/api/goals")
def add_goal(goal: GoalSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Calculate expected completion
        comp = calc.calculate_goal_expected_completion(goal.target_amount, goal.current_amount, goal.monthly_contribution)
        cursor.execute(
            "INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, expected_completion, goal_type) VALUES (?, ?, ?, ?, ?, ?)",
            (goal.name, goal.target_amount, goal.current_amount, goal.monthly_contribution, comp["expected_date"], goal.goal_type)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/goals/{id}")
def update_goal(id: int, goal: GoalSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        comp = calc.calculate_goal_expected_completion(goal.target_amount, goal.current_amount, goal.monthly_contribution)
        cursor.execute(
            "UPDATE goals SET name=?, target_amount=?, current_amount=?, monthly_contribution=?, expected_completion=?, goal_type=? WHERE id=?",
            (goal.name, goal.target_amount, goal.current_amount, goal.monthly_contribution, comp["expected_date"], goal.goal_type, id)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/goals/{id}")
def delete_goal(id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM goals WHERE id=?", (id,))
        conn.commit()
        return {"status": "success"}
    finally:
        conn.close()

# --- Rules Router ---
@app.put("/api/rules")
def update_rule(rule: RuleSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE financial_rules SET value=?, is_enabled=? WHERE rule_key=?",
            (rule.value, int(rule.is_enabled), rule.rule_key)
        )
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- Snapshots Router ---
@app.get("/api/snapshots")
def get_snapshots():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM snapshots ORDER BY month ASC")
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

@app.post("/api/snapshots")
def create_snapshot(month: str = Form(...), snapshot_data_str: str = Form(...)):
    """
    Saves a monthly snapshot. The frontend submits a snapshot month YYYY-MM
    and a JSON representation of all current financial objects.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        data = json.loads(snapshot_data_str)
        
        # Calculate summary metrics for snapshot
        total_liquid = sum(a["current_balance"] for a in data.get("accounts", []))
        total_investments = sum(i["current_value"] for i in data.get("investments", []))
        total_properties = sum(p["current_value"] for p in data.get("properties", []))
        total_debt = sum(l["outstanding"] for l in data.get("loans", []))
        
        total_assets = total_liquid + total_investments + total_properties
        net_worth = total_assets - total_debt
        
        cursor.execute(
            """INSERT INTO snapshots (month, net_worth, liquid_funds, total_assets, total_liabilities, snapshot_data)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(month) DO UPDATE SET
               net_worth=excluded.net_worth,
               liquid_funds=excluded.liquid_funds,
               total_assets=excluded.total_assets,
               total_liabilities=excluded.total_liabilities,
               snapshot_data=excluded.snapshot_data""",
            (month, net_worth, total_liquid, total_assets, total_debt, snapshot_data_str)
        )
        conn.commit()
        return {"status": "success", "net_worth": net_worth}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- Simulations Engine ---
@app.post("/api/simulations/run")
def run_simulation(req: SimulationRequestSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Load current state
        cursor.execute("SELECT current_balance FROM accounts")
        total_liquid = sum(row["current_balance"] for row in cursor.fetchall())
        
        cursor.execute("SELECT * FROM loans")
        loans = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("SELECT current_value FROM investments")
        total_investments = sum(row["current_value"] for row in cursor.fetchall())
        
        cursor.execute("SELECT current_value FROM properties")
        total_properties = sum(row["current_value"] for row in cursor.fetchall())
        
        cursor.execute("SELECT * FROM goals")
        goals = [dict(row) for row in cursor.fetchall()]
        
        total_assets = total_liquid + total_investments + total_properties
        total_debt = sum(l["outstanding"] for l in loans)
        current_net_worth = total_assets - total_debt
        current_monthly_emi = sum(l["emi"] for l in loans)
        
        # Calculate current debt free date (max tenure of active loans)
        current_tenures = [calc.calculate_remaining_tenure(l["outstanding"], l["roi"], l["emi"]) for l in loans if l["outstanding"] > 0]
        max_tenure_current = max(current_tenures) if current_tenures else 0.0
        
        # Cloned simulated variables
        sim_liquid = total_liquid
        sim_investments = total_investments
        sim_properties = total_properties
        sim_loans = [dict(l) for l in loans]
        sim_goals = [dict(g) for g in goals]
        sim_salary_surplus = 0.0
        
        recommendation = ""
        
        # Apply Scenario
        s_type = req.scenario_type
        params = req.params
        
        if s_type == "close_loan":
            loan_id = params.get("loan_id")
            # Find the loan
            loan = next((l for l in sim_loans if l["id"] == loan_id), None)
            if loan and loan["outstanding"] > 0:
                outstanding_cost = loan["outstanding"]
                sim_liquid -= outstanding_cost
                loan["outstanding"] = 0.0
                loan["emi"] = 0.0
                interest_saved = calc.calculate_remaining_interest(outstanding_cost, loan["roi"], loan["emi"])
                recommendation = (f"Prepaying {loan['name']} loan saves ₹{interest_saved:,.0f} in future interest. "
                                  f"Your monthly commitments drop by ₹{loan['emi']:,.0f}. Recommended if liquid funds permit.")
                
        elif s_type == "delay_goal":
            goal_id = params.get("goal_id")
            delay_months = params.get("delay_months", 12)
            goal = next((g for g in sim_goals if g["id"] == goal_id), None)
            if goal:
                # Simulating delay reduces required monthly contribution to reach target
                gap = max(goal["target_amount"] - goal["current_amount"], 0.0)
                current_rem_months = gap / goal["monthly_contribution"] if goal["monthly_contribution"] > 0 else 12.0
                new_rem_months = current_rem_months + delay_months
                new_contribution = gap / new_rem_months if new_rem_months > 0 else 0.0
                goal["monthly_contribution"] = new_contribution
                recommendation = (f"Delaying the goal '{goal['name']}' by {delay_months} months reduces its "
                                  f"required monthly contribution to ₹{new_contribution:,.0f} (Saving ₹{goal['monthly_contribution'] - new_contribution:,.0f}/mo).")
                
        elif s_type == "increase_sip":
            increment = params.get("increment_amount", 5000.0)
            sim_investments += (increment * 12.0) # simulation over 1 year
            recommendation = f"Increasing your SIP by ₹{increment:,.0f}/month yields a portfolio size increase of ₹{increment*12:,.0f} in 1 year (excluding compounding returns)."
            
        elif s_type == "salary_change":
            change = params.get("change_amount", 10000.0)
            sim_liquid += (change * 12.0)
            surplus_msg = "surplus" if change >= 0 else "deficit"
            recommendation = f"A salary change of ₹{change:,.0f}/month creates a yearly {surplus_msg} of ₹{change*12:,.0f} that can be used for prepayments."
            
        elif s_type == "receive_bonus":
            bonus = params.get("bonus_amount", 100000.0)
            allocation_target = params.get("allocation_target", "liquid") # liquid, prepay, invest
            
            if allocation_target == "liquid":
                sim_liquid += bonus
                recommendation = f"Receiving ₹{bonus:,.0f} as bonus increases your cash liquidity instantly."
            elif allocation_target == "prepay":
                # Prepay highest interest loan
                active_loans = [l for l in sim_loans if l["outstanding"] > 0]
                if active_loans:
                    active_loans.sort(key=lambda x: x["roi"], reverse=True)
                    target_loan = active_loans[0]
                    prepay_amt = min(bonus, target_loan["outstanding"])
                    interest_saved = calc.calculate_interest_saved_after_prepayment(target_loan["outstanding"], target_loan["roi"], target_loan["emi"], prepay_amt)
                    target_loan["outstanding"] -= prepay_amt
                    recommendation = f"Allocating your bonus of ₹{bonus:,.0f} to prepay {target_loan['name']} saves ₹{interest_saved:,.0f} in remaining interest."
                else:
                    sim_liquid += bonus
                    recommendation = "No active loans to prepay. Bonus added to liquidity."
            elif allocation_target == "invest":
                sim_investments += bonus
                recommendation = f"Investing your bonus of ₹{bonus:,.0f} increases compound growth capital."
                
        elif s_type == "roi_reduction":
            loan_id = params.get("loan_id")
            new_roi = params.get("new_roi", 7.0)
            loan = next((l for l in sim_loans if l["id"] == loan_id), None)
            if loan and loan["outstanding"] > 0:
                old_interest = calc.calculate_remaining_interest(loan["outstanding"], loan["roi"], loan["emi"])
                new_interest = calc.calculate_remaining_interest(loan["outstanding"], new_roi, loan["emi"])
                saved = old_interest - new_interest
                loan["roi"] = new_roi
                recommendation = f"Refinancing {loan['name']} to {new_roi}% ROI saves ₹{saved:,.0f} in interest."

        elif s_type == "brother_property":
            cost = params.get("property_cost", 1000000.0)
            funding_source = params.get("funding_source", "liquid") # liquid, loan
            if funding_source == "liquid":
                sim_liquid -= cost
                recommendation = f"Funding your brother's property of ₹{cost:,.0f} directly reduces liquidity, lowering net worth by the same amount."
            else:
                # Add a simulated loan
                sim_loans.append({
                    "id": -99,
                    "name": "Simulated Brother Loan",
                    "lender": "Bank",
                    "outstanding": cost,
                    "roi": 8.5,
                    "emi": cost * 0.01, # approximate emi
                    "tenure": 120
                })
                recommendation = f"Taking a loan of ₹{cost:,.0f} at 8.5% ROI to fund property increases debt by ₹{cost:,.0f} and adds a monthly commitment."

        # Recalculate simulated outcomes
        sim_assets = sim_liquid + sim_investments + sim_properties
        sim_debt = sum(l["outstanding"] for l in sim_loans)
        sim_net_worth = sim_assets - sim_debt
        sim_monthly_emi = sum(l["emi"] for l in sim_loans)
        
        sim_tenures = [calc.calculate_remaining_tenure(l["outstanding"], l["roi"], l["emi"]) for l in sim_loans if l["outstanding"] > 0]
        max_tenure_sim = max(sim_tenures) if sim_tenures else 0.0
        
        # Handle JSON compliance for infinite tenures
        current_tenure_val = -1.0 if math.isinf(max_tenure_current) else round(max_tenure_current, 1)
        simulated_tenure_val = -1.0 if math.isinf(max_tenure_sim) else round(max_tenure_sim, 1)
        
        if math.isinf(max_tenure_sim) or math.isinf(max_tenure_current):
            diff_tenure_val = -1.0
        else:
            diff_tenure_val = round(max_tenure_sim - max_tenure_current, 1)
        
        return {
            "current": {
                "net_worth": current_net_worth,
                "total_debt": total_debt,
                "liquid_funds": total_liquid,
                "monthly_emi": current_monthly_emi,
                "remaining_tenure_months": current_tenure_val
            },
            "simulated": {
                "net_worth": sim_net_worth,
                "total_debt": sim_debt,
                "liquid_funds": sim_liquid,
                "monthly_emi": sim_monthly_emi,
                "remaining_tenure_months": simulated_tenure_val
            },
            "difference": {
                "net_worth": sim_net_worth - current_net_worth,
                "total_debt": sim_debt - total_debt,
                "liquid_funds": sim_liquid - total_liquid,
                "monthly_emi": sim_monthly_emi - current_monthly_emi,
                "tenure_months": diff_tenure_val
            },
            "recommendation": recommendation
        }
    finally:
        conn.close()

# --- MMex Data Import ---
@app.post("/api/import/mmex")
async def import_mmex_csv(file: UploadFile = File(...)):
    """
    Parses a Money Manager Ex (MMex) Accounts CSV file to import / sync account balances.
    Assumed CSV Columns: AccountName, AccountType, CurrentBalance, Notes, etc.
    """
    contents = await file.read()
    import pandas as pd
    import io
    
    try:
        df = pd.read_csv(io.BytesIO(contents))
        
        # Verify columns or attempt flexible lookup
        name_col = next((c for c in df.columns if 'name' in c.lower() or 'account' in c.lower()), None)
        bal_col = next((c for c in df.columns if 'balance' in c.lower() or 'current' in c.lower() or 'bal' in c.lower()), None)
        inst_col = next((c for c in df.columns if 'inst' in c.lower() or 'bank' in c.lower() or 'type' in c.lower()), "MMex Imported")
        
        if not name_col or not bal_col:
            raise HTTPException(status_code=400, detail="Could not identify Account Name or Balance columns in CSV. Columns: " + ", ".join(df.columns))
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        imported_count = 0
        for _, row in df.iterrows():
            name = str(row[name_col]).strip()
            val = float(row[bal_col])
            institution = str(row[inst_col]).strip() if isinstance(inst_col, str) and inst_col in df.columns else "MMex"
            
            cursor.execute(
                """INSERT INTO accounts (name, institution, current_balance, last_updated, remarks)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(name, institution) DO UPDATE SET
                   current_balance=excluded.current_balance,
                   last_updated=excluded.last_updated""",
                (name, institution, val, date.today().strftime("%Y-%m-%d"), "Imported from MMex")
            )
            imported_count += 1
            
        conn.commit()
        conn.close()
        return {"status": "success", "imported": imported_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Parsing error: " + str(e))

# --- Database Backup & Restore ---
@app.post("/api/backup/create")
def create_backup():
    try:
        backup_dir = os.path.join(get_db_dir(), "backups")
        os.makedirs(backup_dir, exist_ok=True)
        backup_file = os.path.join(backup_dir, f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(get_db_path(), backup_file)
        return {"status": "success", "backup_file": backup_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backup/restore")
def restore_backup(backup_name: str = Form(...)):
    try:
        backup_file = os.path.join(get_db_dir(), "backups", backup_name)
        if not os.path.exists(backup_file):
            raise HTTPException(status_code=404, detail="Backup file not found")
        shutil.copy2(backup_file, get_db_path())
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backup/list")
def list_backups():
    backup_dir = os.path.join(get_db_dir(), "backups")
    if not os.path.exists(backup_dir):
        return []
    files = [f for f in os.listdir(backup_dir) if f.endswith(".db")]
    files.sort(reverse=True)
    return files

@app.api_route("/api/backup/auto-run", methods=["GET", "POST"])
def auto_run_backup(trigger: str = "open"):
    from backend.db import load_settings, save_settings
    settings = load_settings()
    
    # Read settings config with defaults matching MMEx style
    backup_on_open = settings.get("backup_on_open", True)
    backup_on_close = settings.get("backup_on_close", True)
    backup_count_limit = settings.get("backup_count_limit", 10)
    custom_backup_dir = settings.get("custom_backup_dir", "")
    
    if trigger == "open" and not backup_on_open:
        return {"status": "skipped", "reason": "backup_on_open disabled"}
    if trigger == "close" and not backup_on_close:
        return {"status": "skipped", "reason": "backup_on_close disabled"}
        
    try:
        if custom_backup_dir and os.path.exists(custom_backup_dir):
            backup_dir = custom_backup_dir
        else:
            backup_dir = os.path.join(get_db_dir(), "backups")
            
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"auto_{trigger}_{timestamp}.db"
        backup_file = os.path.join(backup_dir, filename)
        
        shutil.copy2(get_db_path(), backup_file)
        
        # Purge oldest automatic backups if they exceed the count limit
        auto_backups = []
        for f in os.listdir(backup_dir):
            if f.startswith("auto_") and f.endswith(".db"):
                f_path = os.path.join(backup_dir, f)
                auto_backups.append((f_path, os.path.getmtime(f_path)))
                
        auto_backups.sort(key=lambda x: x[1])
        
        deleted_count = 0
        while len(auto_backups) > backup_count_limit:
            oldest_file, _ = auto_backups.pop(0)
            try:
                os.remove(oldest_file)
                deleted_count += 1
            except Exception as e:
                print("Failed to delete old backup:", e)
                
        return {
            "status": "success", 
            "backup_file": backup_file, 
            "purged": deleted_count
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- Database Management Settings ---
@app.get("/api/settings/database")
def get_database_settings():
    from backend.db import load_settings, get_default_db_dir
    settings = load_settings()
    return {
        "active_path": get_db_path(),
        "default_path": os.path.join(get_default_db_dir(), "finance.db"),
        "recent_databases": settings.get("recent_databases", [get_db_path()]),
        "backup_on_open": settings.get("backup_on_open", True),
        "backup_on_close": settings.get("backup_on_close", True),
        "backup_count_limit": settings.get("backup_count_limit", 10),
        "custom_backup_dir": settings.get("custom_backup_dir", "")
    }

class BackupSettingsRequest(BaseModel):
    backup_on_open: bool
    backup_on_close: bool
    backup_count_limit: int
    custom_backup_dir: str

@app.post("/api/settings/backup")
def post_backup_settings(req: BackupSettingsRequest):
    from backend.db import load_settings, save_settings
    try:
        settings = load_settings()
        settings["backup_on_open"] = req.backup_on_open
        settings["backup_on_close"] = req.backup_on_close
        settings["backup_count_limit"] = req.backup_count_limit
        settings["custom_backup_dir"] = req.custom_backup_dir
        save_settings(settings)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DatabaseSwitchRequest(BaseModel):
    path: str

@app.post("/api/settings/database")
def post_switch_database(req: DatabaseSwitchRequest):
    from backend.db import switch_database
    try:
        switch_database(req.path)
        return {"status": "success", "active_path": req.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Advanced EMI & Prepayment Calculator ---
class AdvancedEmiRequest(BaseModel):
    loan_amount: float
    roi: float
    tenure_months: int
    start_date: str
    prepayments: list = []

@app.post("/api/calculations/advanced-emi")
def get_advanced_emi_calculation(req: AdvancedEmiRequest):
    try:
        result = calc.calculate_advanced_emi_schedule(
            req.loan_amount,
            req.roi,
            req.tenure_months,
            req.start_date,
            req.prepayments
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calculations/advanced-emi/export/excel")
def export_emi_excel(req: AdvancedEmiRequest):
    try:
        import io
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        
        result = calc.calculate_advanced_emi_schedule(
            req.loan_amount,
            req.roi,
            req.tenure_months,
            req.start_date,
            req.prepayments
        )
        
        wb = Workbook()
        ws = wb.active
        ws.title = "EMI Amortization Schedule"
        
        header_font = Font(name='Segoe UI', size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="8B5CF6", end_color="8B5CF6", fill_type="solid")
        title_font = Font(name='Segoe UI', size=16, bold=True)
        bold_font = Font(name='Segoe UI', size=11, bold=True)
        regular_font = Font(name='Segoe UI', size=11)
        align_right = Alignment(horizontal='right')
        align_left = Alignment(horizontal='left')
        align_center = Alignment(horizontal='center')
        
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )
        
        # Merge cells for title block
        ws.merge_cells("A1:H1")
        ws["A1"] = "FinanceOS - Advanced EMI Amortization Schedule"
        ws["A1"].font = title_font
        ws.row_dimensions[1].height = 25
        
        # Add basic parameters metadata
        ws["A3"] = "Loan Amount:"
        ws["B3"] = req.loan_amount
        ws["A4"] = "Interest Rate (ROI):"
        ws["B4"] = f"{req.roi}%"
        ws["A5"] = "Original Tenure (Months):"
        ws["B5"] = req.tenure_months
        ws["A6"] = "Start Date:"
        ws["B6"] = req.start_date
        
        for r in range(3, 7):
            ws[f"A{r}"].font = bold_font
            ws[f"B{r}"].font = regular_font
            
        ws["D3"] = "Monthly EMI:"
        ws["E3"] = result["monthly_emi"]
        ws["D4"] = "Total Prepayments:"
        ws["E4"] = result["total_prepayments"]
        ws["D5"] = "Total Interest:"
        ws["E5"] = result["total_interest"]
        ws["D6"] = "Actual Closure Tenure:"
        ws["E6"] = f"{result['tenure_months']} Months"
        
        for r in range(3, 7):
            ws[f"D{r}"].font = bold_font
            ws[f"E{r}"].font = regular_font
            
        # Add table headers
        headers = ["Month", "Payment Date", "Beginning Balance", "EMI", "Interest Paid", "Principal Paid", "Prepayment", "Ending Balance"]
        ws.append([]) # Row 7 empty
        ws.append(headers) # Row 8
        
        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=8, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = align_center if col_idx <= 2 else align_right
            
        ws.row_dimensions[8].height = 24
        
        # Append monthly rows
        for idx, row in enumerate(result["schedule"], 9):
            ws.append([
                row["month"],
                row["date"],
                row["beginning_balance"],
                row["emi"],
                row["interest"],
                row["principal"],
                row["prepayments"],
                row["ending_balance"]
            ])
            ws.cell(row=idx, column=1).alignment = align_center
            ws.cell(row=idx, column=2).alignment = align_center
            for c in range(1, 9):
                cell = ws.cell(row=idx, column=c)
                cell.font = regular_font
                cell.border = thin_border
                if c >= 3:
                    cell.number_format = '₹#,##0.00'
                    cell.alignment = align_right
                    
        for col in ws.columns:
            max_len = 0
            for cell in col:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)
            
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        headers = {
            'Content-Disposition': 'attachment; filename="emi_amortization_schedule.xlsx"'
        }
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- EMI Saved Profiles CRUD Routers ---
@app.get("/api/settings/emi-profiles")
def get_emi_profiles():
    from backend.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, loan_amount, roi, tenure_value, tenure_unit, start_date, prepayments FROM emi_profiles")
    rows = cursor.fetchall()
    conn.close()
    
    profiles = []
    for r in rows:
        profiles.append({
            "id": r["id"],
            "name": r["name"],
            "loan_amount": r["loan_amount"],
            "roi": r["roi"],
            "tenure_value": r["tenure_value"],
            "tenure_unit": r["tenure_unit"],
            "start_date": r["start_date"],
            "prepayments": json.loads(r["prepayments"])
        })
    return profiles

class EmiProfileRequest(BaseModel):
    name: str
    loan_amount: float
    roi: float
    tenure_value: int
    tenure_unit: str
    start_date: str
    prepayments: list = []

@app.post("/api/settings/emi-profiles")
def save_emi_profile(req: EmiProfileRequest):
    from backend.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM emi_profiles WHERE name = ?", (req.name,))
        row = cursor.fetchone()
        prepay_json = json.dumps(req.prepayments)
        if row:
            cursor.execute("""
                UPDATE emi_profiles 
                SET loan_amount = ?, roi = ?, tenure_value = ?, tenure_unit = ?, start_date = ?, prepayments = ?
                WHERE name = ?
            """, (req.loan_amount, req.roi, req.tenure_value, req.tenure_unit, req.start_date, prepay_json, req.name))
        else:
            cursor.execute("""
                INSERT INTO emi_profiles (name, loan_amount, roi, tenure_value, tenure_unit, start_date, prepayments)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (req.loan_amount, req.roi, req.tenure_value, req.tenure_unit, req.start_date, prepay_json, req.name) if row else (req.name, req.loan_amount, req.roi, req.tenure_value, req.tenure_unit, req.start_date, prepay_json))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/settings/emi-profiles/{profile_id}")
def delete_emi_profile(profile_id: int):
    from backend.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM emi_profiles WHERE id = ?", (profile_id,))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# --- Financial Calendar Endpoint ---
@app.get("/api/calendar")
def get_financial_calendar():
    from datetime import datetime, date
    import calendar
    from backend.db import get_db_connection
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch loans
    cursor.execute("SELECT name, emi, start_date FROM loans WHERE outstanding > 0")
    loans = cursor.fetchall()
    
    # Fetch insurance policies
    cursor.execute("SELECT company, policy_number, premium, frequency, renewal_date FROM insurance")
    insurance = cursor.fetchall()
    
    # Fetch goals
    cursor.execute("SELECT name, monthly_contribution FROM goals WHERE (target_amount - current_amount) > 0 AND monthly_contribution > 0")
    goals = cursor.fetchall()

    # Fetch credit cards from dedicated table
    cursor.execute("SELECT name, issuer, outstanding, statement_balance, due_date FROM credit_cards WHERE outstanding > 0")
    credit_cards = cursor.fetchall()
    
    conn.close()
    
    events = []
    today = date.today()
    
    # Generate calendar events for the next 12 months
    for m_offset in range(12):
        target_month_val = today.month + m_offset
        target_year = today.year + (target_month_val - 1) // 12
        target_month = (target_month_val - 1) % 12 + 1
        
        # A. Loan EMIs
        for l in loans:
            try:
                start_d = datetime.strptime(l["start_date"], "%Y-%m-%d").date()
                due_day = min(start_d.day, calendar.monthrange(target_year, target_month)[1])
            except:
                due_day = 5 # Default to 5th
                
            due_date = date(target_year, target_month, due_day)
            if due_date >= today:
                events.append({
                    "title": f"{l['name']} EMI",
                    "amount": l["emi"],
                    "type": "EMI",
                    "date": due_date.isoformat(),
                    "details": "Monthly Loan Instalment"
                })
                
        # B. Goals Savings contributions (1st of month)
        for g in goals:
            due_date = date(target_year, target_month, 1)
            if due_date >= today:
                events.append({
                    "title": f"{g['name']} Allocation",
                    "amount": g["monthly_contribution"],
                    "type": "SIP",
                    "date": due_date.isoformat(),
                    "details": "Monthly Goal Contribution"
                })
                
        # C. Insurance Premiums
        for ins in insurance:
            try:
                ren_d = datetime.strptime(ins["renewal_date"], "%Y-%m-%d").date()
                freq = ins["frequency"].lower()
                is_due = False
                
                months_diff = (target_year - ren_d.year) * 12 + (target_month - ren_d.month)
                
                if freq == "monthly":
                    is_due = True
                elif freq == "quarterly" and months_diff >= 0 and months_diff % 3 == 0:
                    is_due = True
                elif freq == "semi-annually" and months_diff >= 0 and months_diff % 6 == 0:
                    is_due = True
                elif freq in ("annually", "yearly", "annual") and months_diff >= 0 and months_diff % 12 == 0:
                    is_due = True
                    
                if is_due:
                    due_day = min(ren_d.day, calendar.monthrange(target_year, target_month)[1])
                    due_date = date(target_year, target_month, due_day)
                    if due_date >= today:
                        events.append({
                            "title": f"{ins['company']} Premium",
                            "amount": ins["premium"],
                            "type": "Insurance",
                            "date": due_date.isoformat(),
                            "details": f"Policy: {ins['policy_number']}"
                        })
            except Exception as e:
                print("Error computing insurance calendar date:", e)

    # D. Credit Card Bill Payments (due on the card's specific due_dates over the next 12 months)
    for cc in credit_cards:
        cc_due_dates = []
        for m_offset in range(12):
            target_month_val = today.month + m_offset
            target_year = today.year + (target_month_val - 1) // 12
            target_month = (target_month_val - 1) % 12 + 1
            try:
                due_day = min(cc["due_date"], calendar.monthrange(target_year, target_month)[1])
                due_date = date(target_year, target_month, due_day)
                if due_date >= today:
                    cc_due_dates.append(due_date)
            except Exception as e:
                print("Error calculating CC date:", e)
        
        cc_due_dates.sort()
        
        stmt_bal = cc["statement_balance"]
        unbilled = max(cc["outstanding"] - stmt_bal, 0.0)
        
        if len(cc_due_dates) >= 1 and stmt_bal > 0:
            events.append({
                "title": f"{cc['name']} Payment Due (Billed)",
                "amount": stmt_bal,
                "type": "Credit Card",
                "date": cc_due_dates[0].isoformat(),
                "details": f"Issuer: {cc['issuer']} | Billed Statement Balance"
            })
            
        if len(cc_due_dates) >= 2 and unbilled > 0:
            events.append({
                "title": f"{cc['name']} Payment Due (Unbilled)",
                "amount": unbilled,
                "type": "Credit Card",
                "date": cc_due_dates[1].isoformat(),
                "details": f"Issuer: {cc['issuer']} | Unbilled Current Balance"
            })
                
    events.sort(key=lambda x: x["date"])
    return events

# --- Multi-Loan Payoff Optimizer Endpoint ---
class LoanOptimizerRequest(BaseModel):
    loans: list
    extra_monthly_budget: float

@app.post("/api/calculations/loan-optimizer")
def optimize_loans(req: LoanOptimizerRequest):
    try:
        baseline = calc.simulate_multi_loan_payoff(req.loans, req.extra_monthly_budget, "baseline")
        avalanche = calc.simulate_multi_loan_payoff(req.loans, req.extra_monthly_budget, "avalanche")
        snowball = calc.simulate_multi_loan_payoff(req.loans, req.extra_monthly_budget, "snowball")
        
        return {
            "baseline": baseline,
            "avalanche": avalanche,
            "snowball": snowball
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Credit Cards Router ---
class CreditCardSchema(BaseModel):
    id: Optional[int] = None
    name: str
    issuer: str
    credit_limit: float
    outstanding: float
    statement_balance: Optional[float] = 0.0
    statement_date: int
    due_date: int
    annual_fee: Optional[float] = 0.0
    renewal_date: Optional[str] = ""
    reward_points: Optional[int] = 0
    point_value: Optional[float] = 0.25
    lounge_access_domestic: Optional[str] = ""
    lounge_access_international: Optional[str] = ""
    spend_milestone_waiver: Optional[float] = 0.0
    remarks: Optional[str] = ""

@app.post("/api/credit-cards")
def save_credit_card(cc: CreditCardSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if cc.id:
            cursor.execute("""
                UPDATE credit_cards 
                SET name = ?, issuer = ?, credit_limit = ?, outstanding = ?, statement_balance = ?, statement_date = ?, due_date = ?, 
                    annual_fee = ?, renewal_date = ?, reward_points = ?, point_value = ?, lounge_access_domestic = ?, lounge_access_international = ?, 
                    spend_milestone_waiver = ?, remarks = ?
                WHERE id = ?
            """, (cc.name, cc.issuer, cc.credit_limit, cc.outstanding, cc.statement_balance, cc.statement_date, cc.due_date, 
                  cc.annual_fee, cc.renewal_date, cc.reward_points, cc.point_value, cc.lounge_access_domestic, cc.lounge_access_international, 
                  cc.spend_milestone_waiver, cc.remarks, cc.id))
        else:
            cursor.execute("""
                INSERT INTO credit_cards (name, issuer, credit_limit, outstanding, statement_balance, statement_date, due_date, 
                                          annual_fee, renewal_date, reward_points, point_value, lounge_access_domestic, lounge_access_international, 
                                          spend_milestone_waiver, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cc.name, cc.issuer, cc.credit_limit, cc.outstanding, cc.statement_balance, cc.statement_date, cc.due_date, 
                  cc.annual_fee, cc.renewal_date, cc.reward_points, cc.point_value, cc.lounge_access_domestic, cc.lounge_access_international, 
                  cc.spend_milestone_waiver, cc.remarks))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/credit-cards/{card_id}")
def delete_credit_card(card_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM credit_cards WHERE id = ?", (card_id,))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run(app, host="127.0.0.1", port=8000)

