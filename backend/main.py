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

def get_table_columns(cursor, table_name: str) -> list:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row["name"] for row in cursor.fetchall()]

def serialize_entity_payload(cursor, table_name: str, payload: dict) -> dict:
    cols = get_table_columns(cursor, table_name)
    standard_params = {}
    extra_params = {}
    
    for k, v in payload.items():
        if k in cols:
            standard_params[k] = v
        else:
            extra_params[k] = v
            
    if "metadata_json" in cols:
        standard_params["metadata_json"] = json.dumps(extra_params)
    elif "funding_sources_json" in cols:
        standard_params["funding_sources_json"] = json.dumps(extra_params)
    elif "snapshot_data" in cols:
        standard_params["snapshot_data"] = json.dumps(extra_params)
        
    return standard_params

# --- Pydantic Models for Requests ---
class AccountSchema(BaseModel):
    name: str
    institution: str
    current_balance: Optional[float] = 0.0
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

class CashFlowSchema(BaseModel):
    id: Optional[int] = None
    month: str
    net_salary: float
    other_income: float
    household_expenses: float
    emi: float
    insurance_premium: float
    investments: float
    one_time_expenses: float
    notes: Optional[str] = ""

class CashFlowSimulationRequest(BaseModel):
    net_salary: float
    other_income: float
    household_expenses: float
    emi: float
    insurance_premium: float
    investments: float
    one_time_expenses: float
    
    # Adjustments
    salary_change_pct: Optional[float] = 0.0
    salary_change_abs: Optional[float] = 0.0
    one_time_bonus: Optional[float] = 0.0
    new_emi: Optional[float] = 0.0
    emi_reduction: Optional[float] = 0.0
    additional_investment: Optional[float] = 0.0
    expense_reduction_pct: Optional[float] = 0.0
    expense_reduction_abs: Optional[float] = 0.0

class SimulationRequestSchema(BaseModel):
    scenario_type: str # close_loan, delay_goal, increase_sip, salary_change, receive_bonus, roi_reduction, brother_property
    params: dict # parameters specific to the scenario

class DebtPayoffRequest(BaseModel):
    extra_monthly: float = 0.0
    strategy: str = "avalanche"
    prepayment_frequency: str = "monthly"
    prepayment_amount: float = 0.0
    prepayment_month: int = 3

class NetWorthForecastRequest(BaseModel):
    horizon_years: int = 10
    expected_return: float = 12.0
    monthly_savings: float = 20000.0
    inflation_rate: float = 6.0

# --- Core Dynamic Aggregate / Dashboard Data ---
@app.get("/api/init")
def get_init_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Accounts (derived balances computed on the fly)
        cursor.execute("""
            SELECT 
                a.*, 
                i.name as institution_name,
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
            LEFT JOIN institutions i ON a.institution_id = i.id
        """)
        accounts = []
        for row in cursor.fetchall():
            d = dict(row)
            if d.get("metadata_json"):
                try:
                    meta = json.loads(d["metadata_json"])
                    d.update(meta)
                    if "category_id" in meta:
                        cursor.execute("SELECT name FROM categories WHERE id = ?", (meta["category_id"],))
                        cat_row = cursor.fetchone()
                        if cat_row:
                            d["category_name"] = cat_row["name"]
                except:
                    pass
            accounts.append(d)
        
        # Assets (Mutual funds, stocks, gold, EPFO, property, insurance etc.)
        cursor.execute("""
            SELECT a.*, c.name as category_name, i.name as institution_name
            FROM assets a
            LEFT JOIN categories c ON a.category_id = c.id
            LEFT JOIN institutions i ON a.institution_id = i.id
        """)
        assets = []
        for r in cursor.fetchall():
            d = dict(r)
            if d.get("metadata_json"):
                try:
                    d.update(json.loads(d["metadata_json"]))
                except:
                    pass
            assets.append(d)

        # Liabilities (Home loans, car loans, credit cards)
        cursor.execute("""
            SELECT l.*, c.name as category_name, i.name as lender_name
            FROM liabilities l
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN institutions i ON l.lender_institution_id = i.id
        """)
        liabilities_raw = cursor.fetchall()
        liabilities = []
        for r in liabilities_raw:
            d = dict(r)
            if d.get("metadata_json"):
                try:
                    d.update(json.loads(d["metadata_json"]))
                except:
                    pass
            # Add dynamic tenure and progress math if it is a reducing balance loan
            if d.get("outstanding", 0.0) > 0 and d.get("interest_rate", 0.0) > 0 and d.get("emi", 0.0) > 0:
                rem_n = calc.calculate_remaining_tenure(d["outstanding"], d["interest_rate"], d["emi"])
                d["remaining_tenure"] = round(rem_n, 1) if rem_n != float('inf') else -1
                d["remaining_interest"] = round(calc.calculate_remaining_interest(d["outstanding"], d["interest_rate"], d["emi"]), 2)
                d["progress"] = round(calc.calculate_loan_progress(d.get("tenure_months", 120), rem_n), 1)
            else:
                d["remaining_tenure"] = -1
                d["remaining_interest"] = 0.0
                d["progress"] = 100.0
            liabilities.append(d)

        # Income
        cursor.execute("""
            SELECT inc.*, c.name as category_name
            FROM income inc
            LEFT JOIN categories c ON inc.category_id = c.id
        """)
        income = [dict(row) for row in cursor.fetchall()]

        # Expenses
        cursor.execute("""
            SELECT e.*, c.name as category_name
            FROM expenses e
            LEFT JOIN categories c ON e.category_id = c.id
        """)
        expenses = [dict(row) for row in cursor.fetchall()]

        # Goals (derived current_amount from holdings weight mapping)
        cursor.execute("""
            SELECT 
                g.*,
                COALESCE(
                    (
                        SELECT SUM(a.current_value * gh.allocation_weight)
                        FROM assets a
                        JOIN goal_holdings gh ON a.id = gh.asset_id
                        WHERE gh.goal_id = g.id
                    ), 0.0
                ) AS current_amount
            FROM goals g
        """)
        goals_raw = cursor.fetchall()
        goals = []
        for r in goals_raw:
            d = dict(r)
            if d.get("funding_sources_json"):
                try:
                    d["funding_sources"] = json.loads(d["funding_sources_json"])
                except:
                    d["funding_sources"] = []
            comp_details = calc.calculate_goal_expected_completion(d["target_amount"], d["current_amount"], d.get("monthly_contribution", 0.0))
            d.update(comp_details)
            goals.append(d)

        # Rules
        cursor.execute("SELECT * FROM financial_rules")
        rules = [dict(row) for row in cursor.fetchall()]

        # Categories & Institutions metadata
        cursor.execute("SELECT * FROM categories")
        categories = [dict(row) for row in cursor.fetchall()]
        for c in categories:
            if c.get("fields_definition"):
                try:
                    c["fields_definition"] = json.loads(c["fields_definition"])
                except:
                    pass

        cursor.execute("SELECT * FROM institutions ORDER BY name ASC")
        institutions = [dict(row) for row in cursor.fetchall()]

        # Monthly Cash Flows logs
        cursor.execute("SELECT * FROM monthly_cash_flows ORDER BY month DESC")
        cash_flows = [dict(row) for row in cursor.fetchall()]

        # Dynamic Recommendations mapping
        recommendations = generate_recommendations(conn)

        # Summary aggregates
        total_liquid = sum(float(a.get("current_balance") if a.get("current_balance") is not None else 0.0) for a in accounts)
        total_assets_val = sum(float(a.get("current_value") if a.get("current_value") is not None else 0.0) for a in assets)
        total_debt = sum(float(l.get("outstanding") if l.get("outstanding") is not None else 0.0) for l in liabilities)
        
        total_assets = total_liquid + total_assets_val
        net_worth = total_assets - total_debt

        # Check historic change (compare with last month snapshot)
        cursor.execute("SELECT net_worth FROM snapshots ORDER BY month DESC LIMIT 2")
        historic_snapshots = cursor.fetchall()
        
        monthly_change = 0.0
        yearly_change = 0.0
        
        if len(historic_snapshots) >= 1:
            monthly_change = net_worth - historic_snapshots[0]["net_worth"]
        
        cursor.execute("SELECT net_worth FROM snapshots WHERE month <= ? ORDER BY month DESC LIMIT 1", 
                       (str(datetime.now().year - 1),))
        last_year_snap = cursor.fetchone()
        if last_year_snap:
            yearly_change = net_worth - last_year_snap["net_worth"]

        summary = {
            "net_worth": net_worth,
            "total_assets": total_assets,
            "total_debt": total_debt,
            "total_liquid": total_liquid,
            "total_investments": sum(a["current_value"] for a in assets if a["category_name"] not in ["Property", "Insurance"]),
            "total_properties": sum(a["current_value"] for a in assets if a["category_name"] == "Property"),
            "monthly_change": monthly_change,
            "yearly_change": yearly_change
        }

        return {
            "summary": summary,
            "accounts": accounts,
            "assets": assets,
            "liabilities": liabilities,
            "income": income,
            "expenses": expenses,
            "goals": goals,
            "rules": rules,
            "categories": categories,
            "institutions": institutions,
            "recommendations": recommendations,
            "cash_flows": cash_flows
        }
    finally:
        conn.close()

def adjust_double_entry_balances(cursor, t_type: str, amount: float, source_type: str, source_id: int, dest_type: str, dest_id: int, operation: str = "add"):
    """
    Adjust balances of assets and liabilities based on double-entry transaction specs.
    (Account balances are derived dynamically from transaction history, so they are not stored/updated).
    operation: 'add' (apply transaction impact), 'revert' (undo transaction impact)
    """
    if not source_type and not dest_type:
        return
        
    factor = 1.0 if operation == "add" else -1.0
    t_type_lower = t_type.lower()
    
    # 1. Update Asset values
    if source_type == 'Asset' and source_id:
        cursor.execute("UPDATE assets SET current_value = current_value - ? WHERE id = ?", (amount * factor, source_id))
    if dest_type == 'Asset' and dest_id:
        cursor.execute("UPDATE assets SET current_value = current_value + ? WHERE id = ?", (amount * factor, dest_id))
        
    # 2. Update Liability outstanding
    if t_type_lower in ['emi', 'prepayment'] and dest_id:
        cursor.execute("SELECT id FROM liabilities WHERE id = ?", (dest_id,))
        if cursor.fetchone():
            cursor.execute("UPDATE liabilities SET outstanding = outstanding - ? WHERE id = ?", (amount * factor, dest_id))

# --- Generic CRUD REST API ---
@app.get("/api/entities/{entity_type}")
def get_entities(entity_type: str):
    allowed_tables = ["accounts", "assets", "liabilities", "income", "expenses", "goals", "transactions"]
    if entity_type not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if entity_type == "accounts":
            cursor.execute("""
                SELECT 
                    a.*,
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
        elif entity_type == "goals":
            cursor.execute("""
                SELECT 
                    g.*,
                    COALESCE(
                        (
                            SELECT SUM(a.current_value * gh.allocation_weight)
                            FROM assets a
                            JOIN goal_holdings gh ON a.id = gh.asset_id
                            WHERE gh.goal_id = g.id
                        ), 0.0
                    ) AS current_amount
                FROM goals g
            """)
        else:
            cursor.execute(f"SELECT * FROM {entity_type}")
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            d = dict(row)
            for k in ["metadata_json", "funding_sources_json", "snapshot_data"]:
                if k in d and d[k]:
                    try:
                        d[k] = json.loads(d[k])
                    except:
                        pass
            result.append(d)
        return result
    finally:
        conn.close()

@app.post("/api/entities/{entity_type}")
def create_entity(entity_type: str, payload: dict):
    allowed_tables = ["accounts", "assets", "liabilities", "income", "expenses", "goals", "transactions"]
    if entity_type not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        initial_balance = 0.0
        if entity_type == "accounts":
            payload["owner_id"] = payload.get("owner_id", 1)
            initial_balance = float(payload.pop("current_balance", 0.0))
            
        if entity_type == "transactions":
            if "source_ref_type" not in payload:
                acc_id = payload.get("account_id")
                ttype = payload.get("type")
                rel_type = payload.get("related_entity_type")
                rel_id = payload.get("related_entity_id")
                
                source_type = 'None'
                source_id = None
                dest_type = 'None'
                dest_id = None
                new_type = 'Credit'
                
                if ttype == 'Credit':
                    source_type = 'None'
                    dest_type = 'Account'
                    dest_id = acc_id
                    new_type = 'Credit'
                elif ttype == 'Debit':
                    source_type = 'Account'
                    source_id = acc_id
                    dest_type = 'None'
                    new_type = 'Debit'
                elif ttype == 'Transfer':
                    source_type = 'Account'
                    source_id = acc_id
                    dest_type = 'Account'
                    dest_id = rel_id
                    new_type = 'Transfer'
                elif ttype in ('Investment', 'Buy'):
                    source_type = 'Account'
                    source_id = acc_id
                    dest_type = 'Asset'
                    dest_id = rel_id
                    new_type = 'Buy'
                elif ttype in ('Redemption', 'Sell'):
                    source_type = 'Asset'
                    source_id = rel_id
                    dest_type = 'Account'
                    dest_id = acc_id
                    new_type = 'Sell'
                elif ttype in ('EMI', 'Prepayment'):
                    source_type = 'Account'
                    source_id = acc_id
                    dest_type = 'None'
                    dest_id = rel_id
                    new_type = ttype
                    
                payload["source_ref_type"] = source_type
                payload["source_ref_id"] = source_id
                payload["dest_ref_type"] = dest_type
                payload["dest_ref_id"] = dest_id
                payload["type"] = new_type

        # Preprocess custom fields and map expected dates for Goals
        if entity_type == "goals" and "target_amount" in payload and "current_amount" in payload and "monthly_contribution" in payload:
            comp = calc.calculate_goal_expected_completion(
                float(payload.get("target_amount", 0.0)),
                float(payload.get("current_amount", 0.0)),
                float(payload.get("monthly_contribution", 0.0))
            )
            payload["expected_completion"] = comp["expected_date"]
            
        standard_params = serialize_entity_payload(cursor, entity_type, payload)
        
        columns = list(standard_params.keys())
        placeholders = [f":{c}" for c in columns]
        query = f"INSERT INTO {entity_type} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
        
        cursor.execute(query, standard_params)
        
        entity_id = cursor.lastrowid
        
        if entity_type == "accounts" and initial_balance > 0.0:
            cursor.execute("""
            INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
            VALUES ('None', NULL, 'Account', ?, 'Credit', ?, ?, 'Initial balance registration')
            """, (entity_id, initial_balance, date.today().isoformat(), 'Initial Balance'))
            
        if entity_type == "transactions":
            adjust_double_entry_balances(
                cursor,
                standard_params.get("type"),
                float(standard_params.get("amount", 0.0)),
                standard_params.get("source_ref_type"),
                int(standard_params.get("source_ref_id")) if standard_params.get("source_ref_id") is not None else None,
                standard_params.get("dest_ref_type"),
                int(standard_params.get("dest_ref_id")) if standard_params.get("dest_ref_id") is not None else None,
                "add"
            )
            
        if entity_type == "assets":
            goal_mapping = payload.get("goal_mapping")
            if goal_mapping:
                cursor.execute("SELECT id FROM goals WHERE name = ?", (goal_mapping,))
                g_row = cursor.fetchone()
                if g_row:
                    cursor.execute("""
                    INSERT OR REPLACE INTO goal_holdings (goal_id, asset_id, allocation_weight)
                    VALUES (?, ?, 1.0)
                    """, (g_row["id"], entity_id))

        conn.commit()
        return {"status": "success", "id": entity_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/entities/{entity_type}/{id}")
def update_entity(entity_type: str, id: int, payload: dict):
    allowed_tables = ["accounts", "assets", "liabilities", "income", "expenses", "goals", "transactions"]
    if entity_type not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Preprocess custom fields and map expected dates for Goals
        if entity_type == "goals" and "target_amount" in payload and "current_amount" in payload and "monthly_contribution" in payload:
            comp = calc.calculate_goal_expected_completion(
                float(payload.get("target_amount", 0.0)),
                float(payload.get("current_amount", 0.0)),
                float(payload.get("monthly_contribution", 0.0))
            )
            payload["expected_completion"] = comp["expected_date"]
            
        if entity_type == "transactions":
            # Revert old balances first
            cursor.execute("SELECT * FROM transactions WHERE id = ?", (id,))
            old_row = cursor.fetchone()
            if old_row:
                old = dict(old_row)
                adjust_double_entry_balances(
                    cursor,
                    old.get("type"),
                    float(old.get("amount", 0.0)),
                    old.get("source_ref_type"),
                    int(old.get("source_ref_id")) if old.get("source_ref_id") is not None else None,
                    old.get("dest_ref_type"),
                    int(old.get("dest_ref_id")) if old.get("dest_ref_id") is not None else None,
                    "revert"
                )
                
        standard_params = serialize_entity_payload(cursor, entity_type, payload)
        
        set_clauses = [f"{c} = :{c}" for c in standard_params.keys()]
        standard_params["id"] = id
        query = f"UPDATE {entity_type} SET {', '.join(set_clauses)} WHERE id = :id"
        
        cursor.execute(query, standard_params)
        
        if entity_type == "transactions":
            adjust_double_entry_balances(
                cursor,
                standard_params.get("type"),
                float(standard_params.get("amount", 0.0)),
                standard_params.get("source_ref_type"),
                int(standard_params.get("source_ref_id")) if standard_params.get("source_ref_id") is not None else None,
                standard_params.get("dest_ref_type"),
                int(standard_params.get("dest_ref_id")) if standard_params.get("dest_ref_id") is not None else None,
                "add"
            )

        if entity_type == "assets":
            cursor.execute("DELETE FROM goal_holdings WHERE asset_id = ?", (id,))
            goal_mapping = payload.get("goal_mapping")
            if goal_mapping:
                cursor.execute("SELECT id FROM goals WHERE name = ?", (goal_mapping,))
                g_row = cursor.fetchone()
                if g_row:
                    cursor.execute("""
                    INSERT OR REPLACE INTO goal_holdings (goal_id, asset_id, allocation_weight)
                    VALUES (?, ?, 1.0)
                    """, (g_row["id"], id))

        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/entities/{entity_type}/{id}")
def delete_entity(entity_type: str, id: int):
    allowed_tables = ["accounts", "assets", "liabilities", "income", "expenses", "goals", "transactions"]
    if entity_type not in allowed_tables:
        raise HTTPException(status_code=400, detail=f"Invalid entity type: {entity_type}")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if entity_type == "transactions":
            # Revert old balances first
            cursor.execute("SELECT * FROM transactions WHERE id = ?", (id,))
            old_row = cursor.fetchone()
            if old_row:
                old = dict(old_row)
                adjust_double_entry_balances(
                    cursor,
                    old.get("type"),
                    float(old.get("amount", 0.0)),
                    old.get("source_ref_type"),
                    int(old.get("source_ref_id")) if old.get("source_ref_id") is not None else None,
                    old.get("dest_ref_type"),
                    int(old.get("dest_ref_id")) if old.get("dest_ref_id") is not None else None,
                    "revert"
                )
                
        if entity_type == "assets":
            cursor.execute("DELETE FROM goal_holdings WHERE asset_id = ?", (id,))

        cursor.execute(f"DELETE FROM {entity_type} WHERE id = ?", (id,))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/metadata/{meta_type}/{id}")
def delete_metadata(meta_type: str, id: int):
    if meta_type not in ["categories", "institutions", "financial_rules"]:
        raise HTTPException(status_code=400, detail="Invalid metadata type")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(f"DELETE FROM {meta_type} WHERE id = ?", (id,))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- Metadata Configuration REST API ---
@app.get("/api/metadata/{meta_type}")
def get_metadata(meta_type: str):
    if meta_type not in ["categories", "institutions", "financial_rules"]:
        raise HTTPException(status_code=400, detail="Invalid metadata type")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if meta_type == "institutions":
            cursor.execute("SELECT * FROM institutions ORDER BY name ASC")
        else:
            cursor.execute(f"SELECT * FROM {meta_type}")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("fields_definition"):
                try:
                    d["fields_definition"] = json.loads(d["fields_definition"])
                except:
                    pass
            result.append(d)
        return result
    finally:
        conn.close()

@app.post("/api/metadata/{meta_type}")
def create_metadata(meta_type: str, payload: dict):
    if meta_type not in ["categories", "institutions", "financial_rules"]:
        raise HTTPException(status_code=400, detail="Invalid metadata type")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if payload.get("fields_definition") and not isinstance(payload["fields_definition"], str):
            payload["fields_definition"] = json.dumps(payload["fields_definition"])
        
        columns = list(payload.keys())
        placeholders = [f":{c}" for c in columns]
        cursor.execute(f"INSERT OR IGNORE INTO {meta_type} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})", payload)
        conn.commit()
        return {"status": "success", "id": cursor.lastrowid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/metadata/{meta_type}/{id}")
def update_metadata(meta_type: str, id: int, payload: dict):
    if meta_type not in ["categories", "institutions"]:
        raise HTTPException(status_code=400, detail="Invalid metadata type for update")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if payload.get("fields_definition") and not isinstance(payload["fields_definition"], str):
            payload["fields_definition"] = json.dumps(payload["fields_definition"])
            
        set_clauses = [f"{c} = :{c}" for c in payload.keys()]
        payload["id"] = id
        cursor.execute(f"UPDATE {meta_type} SET {', '.join(set_clauses)} WHERE id = :id", payload)
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
        total_liquid = sum(float(a.get("current_balance") if a.get("current_balance") is not None else 0.0) for a in data.get("accounts", []))
        total_assets_val = sum(float(a.get("current_value") if a.get("current_value") is not None else 0.0) for a in data.get("assets", []))
        total_debt = sum(float(l.get("outstanding") if l.get("outstanding") is not None else 0.0) for l in data.get("liabilities", []))
        
        total_assets = total_liquid + total_assets_val
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
        cursor.execute("""
            SELECT COALESCE(SUM(
                (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t WHERE t.dest_ref_type = 'Account' AND t.dest_ref_id = a.id) -
                (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t WHERE t.source_ref_type = 'Account' AND t.source_ref_id = a.id)
            ), 0.0) AS total_liquid
            FROM accounts a
        """)
        total_liquid = cursor.fetchone()["total_liquid"]
        
        cursor.execute("SELECT id, name, interest_rate as roi, emi, outstanding FROM liabilities")
        loans = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute("""
            SELECT current_value FROM assets 
            WHERE category_id != (SELECT id FROM categories WHERE name = 'Property')
        """)
        total_investments = sum(row["current_value"] for row in cursor.fetchall())
        
        cursor.execute("""
            SELECT current_value FROM assets 
            WHERE category_id = (SELECT id FROM categories WHERE name = 'Property')
        """)
        total_properties = sum(row["current_value"] for row in cursor.fetchall())
        
        cursor.execute("""
            SELECT 
                g.*,
                COALESCE(
                    (
                        SELECT SUM(a.current_value * gh.allocation_weight)
                        FROM assets a
                        JOIN goal_holdings gh ON a.id = gh.asset_id
                        WHERE gh.goal_id = g.id
                    ), 0.0
                ) AS current_amount
            FROM goals g
        """)
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

        elif s_type in ["brother_property", "large_purchase"]:
            purchase_name = params.get("purchase_name", "Family Property")
            cost = float(params.get("property_cost") or params.get("cost") or 1500000.0)
            funding_source = params.get("funding_source", "liquid") # liquid, loan
            
            if funding_source == "liquid":
                sim_liquid -= cost
                recommendation = f"Funding your '{purchase_name}' of ₹{cost:,.0f} directly reduces liquidity, lowering net worth by the same amount."
            else:
                roi = float(params.get("roi") or 8.5)
                tenure_months = int(params.get("tenure_months") or 120)
                calculated_emi = calc.calculate_monthly_emi(cost, roi, tenure_months)
                
                # Add a simulated loan
                sim_loans.append({
                    "id": -99,
                    "name": f"Simulated {purchase_name} Loan",
                    "lender": "Bank",
                    "outstanding": cost,
                    "roi": roi,
                    "emi": calculated_emi,
                    "tenure": tenure_months
                })
                recommendation = f"Taking a loan of ₹{cost:,.0f} at {roi}% ROI to fund '{purchase_name}' increases debt by ₹{cost:,.0f} and adds a monthly EMI commitment of ₹{calculated_emi:,.0f} for {tenure_months} months."

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

@app.post("/api/simulations/debt_payoff")
def run_debt_payoff_simulation(req: DebtPayoffRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name, outstanding, interest_rate as roi, emi FROM liabilities WHERE outstanding > 0")
        rows = cursor.fetchall()
        
        loans_list = [
            {
                "name": row["name"],
                "outstanding": float(row["outstanding"]),
                "roi": float(row["roi"]),
                "emi": float(row["emi"])
            }
            for row in rows
        ]
        
        if not loans_list:
            return {
                "baseline": {"total_interest": 0.0, "months": 0, "schedule": []},
                "optimized": {"total_interest": 0.0, "months": 0, "schedule": []}
            }
            
        baseline = calc.simulate_multi_loan_payoff(
            loans_list=json.loads(json.dumps(loans_list)),
            extra_monthly=0.0,
            strategy="baseline",
            prepayment_frequency="none",
            prepayment_amount=0.0
        )
        
        optimized = calc.simulate_multi_loan_payoff(
            loans_list=json.loads(json.dumps(loans_list)),
            extra_monthly=req.extra_monthly,
            strategy=req.strategy,
            prepayment_frequency=req.prepayment_frequency,
            prepayment_amount=req.prepayment_amount,
            prepayment_month=req.prepayment_month
        )
        
        return {
            "baseline": baseline,
            "optimized": optimized
        }
    finally:
        conn.close()

@app.post("/api/simulations/net_worth_forecast")
def run_net_worth_forecast(req: NetWorthForecastRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT COALESCE(SUM(
                (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t WHERE t.dest_ref_type = 'Account' AND t.dest_ref_id = a.id) -
                (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t WHERE t.source_ref_type = 'Account' AND t.source_ref_id = a.id)
            ), 0.0) AS total_liquid
            FROM accounts a
        """)
        liquid = cursor.fetchone()["total_liquid"]
        cursor.execute("SELECT current_value FROM assets")
        assets_val = sum(row["current_value"] for row in cursor.fetchall())
        initial_assets = liquid + assets_val
        
        cursor.execute("SELECT name, outstanding, interest_rate, emi FROM liabilities WHERE outstanding > 0")
        liabs_raw = cursor.fetchall()
        liabilities = [dict(row) for row in liabs_raw]
        initial_debt = sum(l["outstanding"] for l in liabilities)
        
        sim_loans = [
            {
                "outstanding": float(l["outstanding"]),
                "roi": float(l["interest_rate"]),
                "emi": float(l["emi"])
            }
            for l in liabilities
        ]
        
        schedule = []
        current_assets = initial_assets
        annual_savings = req.monthly_savings * 12.0
        
        schedule.append({
            "year": 0,
            "assets": round(current_assets, 2),
            "debt": round(initial_debt, 2),
            "net_worth_nominal": round(current_assets - initial_debt, 2),
            "net_worth_real": round(current_assets - initial_debt, 2)
        })
        
        for y in range(1, req.horizon_years + 1):
            current_assets = current_assets * (1.0 + req.expected_return / 100.0) + annual_savings * ((1.0 + req.inflation_rate / 100.0) ** (y - 1))
            
            for _ in range(12):
                for loan in sim_loans:
                    if loan["outstanding"] > 0:
                        interest = loan["outstanding"] * (loan["roi"] / 100.0) / 12.0
                        payment = min(loan["emi"], loan["outstanding"] + interest)
                        principal = payment - interest
                        loan["outstanding"] = max(loan["outstanding"] - principal, 0.0)
                        
            current_debt = sum(l["outstanding"] for l in sim_loans)
            nominal_nw = current_assets - current_debt
            inflation_factor = (1.0 + req.inflation_rate / 100.0) ** y
            real_nw = nominal_nw / inflation_factor
            
            schedule.append({
                "year": y,
                "assets": round(current_assets, 2),
                "debt": round(current_debt, 2),
                "net_worth_nominal": round(nominal_nw, 2),
                "net_worth_real": round(real_nw, 2)
            })
            
        return {
            "schedule": schedule,
            "final_net_worth_nominal": round(schedule[-1]["net_worth_nominal"], 2),
            "final_net_worth_real": round(schedule[-1]["net_worth_real"], 2),
            "initial_net_worth": round(initial_assets - initial_debt, 2)
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
            
            # Resolve institution_id
            cursor.execute("SELECT id FROM institutions WHERE name = ?", (institution,))
            inst_row = cursor.fetchone()
            if inst_row:
                inst_id = inst_row["id"]
            else:
                cursor.execute("INSERT INTO institutions (name) VALUES (?)", (institution,))
                inst_id = cursor.lastrowid
                
            cursor.execute(
                """INSERT INTO accounts (name, institution_id, current_balance, status)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(name, institution_id) DO UPDATE SET
                   current_balance=excluded.current_balance""",
                (name, inst_id, val, "Active")
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
 # --- Financial Calendar Endpoint ---
@app.get("/api/calendar")
def get_financial_calendar():
    from datetime import datetime, date
    import calendar
    from backend.db import get_db_connection
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch loans (liabilities where interest_rate > 0 and emi > 0 and outstanding > 0)
    cursor.execute("""
        SELECT name, emi, outstanding, metadata_json 
        FROM liabilities 
        WHERE outstanding > 0 AND emi > 0 AND interest_rate > 0
    """)
    loans_raw = cursor.fetchall()
    loans = []
    for r in loans_raw:
        d = dict(r)
        meta = json.loads(d["metadata_json"]) if d.get("metadata_json") else {}
        d["start_date"] = meta.get("start_date", date.today().strftime("%Y-%m-%d"))
        loans.append(d)
        
    # Fetch insurance policies (assets where category is 'Insurance')
    cursor.execute("""
        SELECT inst.name as company, a.metadata_json 
        FROM assets a
        LEFT JOIN institutions inst ON a.institution_id = inst.id
        WHERE a.category_id = (SELECT id FROM categories WHERE name = 'Insurance')
    """)
    insurance_raw = cursor.fetchall()
    insurance = []
    for r in insurance_raw:
        d = dict(r)
        meta = json.loads(d["metadata_json"]) if d.get("metadata_json") else {}
        insurance.append({
            "company": d["company"] or "Insurance",
            "policy_number": meta.get("policy_number", "N/A"),
            "premium": float(meta.get("premium", 0.0)),
            "frequency": meta.get("frequency", "Yearly"),
            "renewal_date": meta.get("renewal_date")
        })
        
    # Fetch goals
    cursor.execute("SELECT name, monthly_contribution, target_amount, current_amount FROM goals WHERE (target_amount - current_amount) > 0 AND monthly_contribution > 0")
    goals = cursor.fetchall()

    # Fetch credit cards (liabilities where category is 'Credit Card')
    cursor.execute("""
        SELECT name, outstanding, metadata_json 
        FROM liabilities
        WHERE category_id = (SELECT id FROM categories WHERE name = 'Credit Card') AND outstanding > 0
    """)
    cc_raw = cursor.fetchall()
    credit_cards = []
    for r in cc_raw:
        d = dict(r)
        meta = json.loads(d["metadata_json"]) if d.get("metadata_json") else {}
        credit_cards.append({
            "name": d["name"],
            "outstanding": d["outstanding"],
            "statement_balance": float(meta.get("statement_balance", 0.0)),
            "due_date": int(meta.get("due_date", 15)),
            "issuer": meta.get("issuer", "Issuer")
        })
        
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
                due_day = 5
                
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
            if not ins.get("renewal_date"):
                continue
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

        # D. Credit Cards
        for cc in credit_cards:
            cc_due_dates = []
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
                
            if len(cc_due_dates) >= 1 and unbilled > 0:
                events.append({
                    "title": f"{cc['name']} Payment Due (Unbilled)",
                    "amount": unbilled,
                    "type": "Credit Card",
                    "date": cc_due_dates[0].isoformat(),
                    "details": f"Issuer: {cc['issuer']} | Unbilled Current Balance"
                })
                
    events.sort(key=lambda x: x["date"])
    return events

# --- Multi-Loan Payoff Optimizer Endpoint ---
class LoanOptimizerRequest(BaseModel):
    loans: list
    extra_monthly_budget: float
    prepayment_frequency: Optional[str] = "monthly"
    prepayment_amount: Optional[float] = 0.0
    prepayment_month: Optional[int] = 3
    prepayment_day: Optional[int] = 31

@app.post("/api/calculations/loan-optimizer")
def optimize_loans(req: LoanOptimizerRequest):
    try:
        baseline = calc.simulate_multi_loan_payoff(
            req.loans, 
            req.extra_monthly_budget, 
            "baseline",
            prepayment_frequency=req.prepayment_frequency,
            prepayment_amount=req.prepayment_amount,
            prepayment_month=req.prepayment_month,
            prepayment_day=req.prepayment_day
        )
        avalanche = calc.simulate_multi_loan_payoff(
            req.loans, 
            req.extra_monthly_budget, 
            "avalanche",
            prepayment_frequency=req.prepayment_frequency,
            prepayment_amount=req.prepayment_amount,
            prepayment_month=req.prepayment_month,
            prepayment_day=req.prepayment_day
        )
        snowball = calc.simulate_multi_loan_payoff(
            req.loans, 
            req.extra_monthly_budget, 
            "snowball",
            prepayment_frequency=req.prepayment_frequency,
            prepayment_amount=req.prepayment_amount,
            prepayment_month=req.prepayment_month,
            prepayment_day=req.prepayment_day
        )
        
        return {
            "baseline": baseline,
            "avalanche": avalanche,
            "snowball": snowball
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Monthly Cash Flows Router ---
@app.get("/api/cash-flows")
def get_cash_flows():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM monthly_cash_flows ORDER BY month DESC")
        return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/cash-flows")
def save_cash_flow(cf: CashFlowSchema):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM monthly_cash_flows WHERE month = ?", (cf.month,))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("""
                UPDATE monthly_cash_flows
                SET net_salary = ?, other_income = ?, household_expenses = ?, emi = ?, 
                    insurance_premium = ?, investments = ?, one_time_expenses = ?, notes = ?
                WHERE id = ?
            """, (cf.net_salary, cf.other_income, cf.household_expenses, cf.emi, 
                  cf.insurance_premium, cf.investments, cf.one_time_expenses, cf.notes, existing["id"]))
        else:
            cursor.execute("""
                INSERT INTO monthly_cash_flows (month, net_salary, other_income, household_expenses, emi, 
                                                insurance_premium, investments, one_time_expenses, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (cf.month, cf.net_salary, cf.other_income, cf.household_expenses, cf.emi, 
                  cf.insurance_premium, cf.investments, cf.one_time_expenses, cf.notes))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/cash-flows/{cf_id}")
def delete_cash_flow(cf_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM monthly_cash_flows WHERE id = ?", (cf_id,))
        conn.commit()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/calculations/cash-flow/simulate")
def simulate_cash_flow(req: CashFlowSimulationRequest):
    try:
        # 1. Current State Calculations
        curr_income = req.net_salary + req.other_income
        curr_expenses = req.household_expenses + req.one_time_expenses
        curr_surplus = curr_income - curr_expenses - req.emi - req.insurance_premium - req.investments
        curr_savings_rate = (curr_surplus / curr_income * 100.0) if curr_income > 0 else 0.0
        curr_debt_ratio = (req.emi / curr_income * 100.0) if curr_income > 0 else 0.0
        curr_investment_rate = (req.investments / curr_income * 100.0) if curr_income > 0 else 0.0
        curr_expense_ratio = (req.household_expenses / curr_income * 100.0) if curr_income > 0 else 0.0
        
        # 2. Simulated State Calculations
        sim_salary = req.net_salary * (1 + req.salary_change_pct / 100.0) + req.salary_change_abs
        sim_income = sim_salary + req.other_income
        
        sim_expenses = (req.household_expenses * (1 - req.expense_reduction_pct / 100.0) - req.expense_reduction_abs) + req.one_time_expenses
        sim_emi = max(req.emi + req.new_emi - req.emi_reduction, 0.0)
        sim_investments = req.investments + req.additional_investment
        
        sim_surplus = sim_income - sim_expenses - sim_emi - req.insurance_premium - sim_investments
        
        sim_savings_rate = (sim_surplus / sim_income * 100.0) if sim_income > 0 else 0.0
        sim_debt_ratio = (sim_emi / sim_income * 100.0) if sim_income > 0 else 0.0
        sim_investment_rate = (sim_investments / sim_income * 100.0) if sim_income > 0 else 0.0
        sim_expense_ratio = (sim_expenses / sim_income * 100.0) if sim_income > 0 else 0.0
        
        # 3. Financial Impact Statement
        impact_parts = []
        surplus_diff = sim_surplus - curr_surplus
        if surplus_diff != 0:
            direction = "increases" if surplus_diff > 0 else "decreases"
            impact_parts.append(f"Monthly surplus {direction} by ₹{abs(surplus_diff):,.0f} (from ₹{curr_surplus:,.0f} to ₹{sim_surplus:,.0f}).")
            
        sr_diff = sim_savings_rate - curr_savings_rate
        if sr_diff != 0:
            direction = "grows" if sr_diff > 0 else "drops"
            impact_parts.append(f"Savings rate {direction} by {abs(sr_diff):.1f}% (from {curr_savings_rate:.1f}% to {sim_savings_rate:.1f}%).")
            
        dr_diff = sim_debt_ratio - curr_debt_ratio
        if dr_diff != 0:
            direction = "increases" if dr_diff > 0 else "decreases"
            impact_parts.append(f"Debt burden ratio {direction} by {abs(dr_diff):.1f}% (from {curr_debt_ratio:.1f}% to {sim_debt_ratio:.1f}%).")
            
        if req.one_time_bonus > 0:
            impact_parts.append(f"One-time windfall bonus of ₹{req.one_time_bonus:,.0f} received, raising investable capital.")
            
        impact_summary = " ".join(impact_parts) if impact_parts else "No cash flow impact observed."
        
        # 4. Recommended Actions
        recommendations = []
        if sim_surplus > curr_surplus:
            extra = sim_surplus - curr_surplus
            recommendations.append(f"Allocate the extra surplus of ₹{extra:,.0f}/month toward increasing your Mutual Fund SIP or prepaying high-interest loans.")
        if sim_debt_ratio > 40:
            recommendations.append("Warning: Debt burden ratio exceeds 40%. Consider deferring new loans and focusing on debt prepayment.")
        elif sim_savings_rate < 20:
            recommendations.append("Notice: Savings rate is below 20%. Look for areas to reduce discretionary household spending.")
        else:
            recommendations.append("Your cash flow parameters are healthy. Consider mapping extra savings to long-term goals.")
            
        if req.one_time_bonus > 0:
            recommendations.append(f"We recommend allocating 70% of the ₹{req.one_time_bonus:,.0f} bonus toward loan prepayments or long-term investments, keeping 30% for emergency liquidity or lifestyle expenses.")
            
        return {
            "current": {
                "income": curr_income,
                "expenses": curr_expenses,
                "emi": req.emi,
                "insurance": req.insurance_premium,
                "investments": req.investments,
                "surplus": curr_surplus,
                "savings_rate": round(curr_savings_rate, 2),
                "debt_ratio": round(curr_debt_ratio, 2),
                "investment_rate": round(curr_investment_rate, 2),
                "expense_ratio": round(curr_expense_ratio, 2)
            },
            "simulated": {
                "income": sim_income,
                "expenses": sim_expenses,
                "emi": sim_emi,
                "insurance": req.insurance_premium,
                "investments": sim_investments,
                "surplus": sim_surplus,
                "savings_rate": round(sim_savings_rate, 2),
                "debt_ratio": round(sim_debt_ratio, 2),
                "investment_rate": round(sim_investment_rate, 2),
                "expense_ratio": round(sim_expense_ratio, 2)
            },
            "impact_summary": impact_summary,
            "recommendations": recommendations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run(app, host="127.0.0.1", port=8000)

