import sqlite3
import os
import json
from datetime import datetime

# AppData path for storing database settings
SETTINGS_DIR = os.path.join(os.path.expanduser("~"), ".financeos")
os.makedirs(SETTINGS_DIR, exist_ok=True)
SETTINGS_PATH = os.path.join(SETTINGS_DIR, "settings.json")

def load_settings():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_settings(settings):
    try:
        with open(SETTINGS_PATH, 'w') as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        print("Failed to save settings:", e)

def get_default_db_dir():
    env_dir = os.environ.get("FINANCE_DB_DIR")
    if env_dir:
        return env_dir
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def get_db_path():
    settings = load_settings()
    active_path = settings.get("active_db_path")
    if not active_path:
        default_dir = get_default_db_dir()
        os.makedirs(default_dir, exist_ok=True)
        active_path = os.path.join(default_dir, "finance.db")
        settings["active_db_path"] = active_path
        if "recent_databases" not in settings:
            settings["recent_databases"] = [active_path]
        save_settings(settings)
    return active_path

def get_db_dir():
    return os.path.dirname(get_db_path())

def get_db_connection():
    db_path = get_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db_path = get_db_path()
    is_new_db = not os.path.exists(db_path)
    conn = get_db_connection()
    cursor = conn.cursor()

    # Disable foreign keys during migration to prevent schema rename errors
    cursor.execute("PRAGMA foreign_keys = OFF")

    # 1. METADATA TABLES
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- Asset, Liability, Income, Expense, Goal, Account
        name TEXT NOT NULL UNIQUE,
        fields_definition TEXT -- JSON schema defining custom fields
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS institutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_key TEXT NOT NULL UNIQUE,
        rule_name TEXT NOT NULL,
        description TEXT,
        value REAL NOT NULL,
        category TEXT NOT NULL DEFAULT 'General',
        is_enabled INTEGER NOT NULL DEFAULT 1
    )
    """)

    try:
        cursor.execute("PRAGMA table_info('financial_rules')")
        existing_cols = [row['name'] for row in cursor.fetchall()]
        if 'category' not in existing_cols:
            cursor.execute("ALTER TABLE financial_rules ADD COLUMN category TEXT NOT NULL DEFAULT 'General'")
    except Exception as e:
        print("financial_rules migration warning:", e)

    try:
        cursor.execute("PRAGMA table_info('categories')")
        existing_cols = [row['name'] for row in cursor.fetchall()]
        if 'monthly_budget' not in existing_cols:
            cursor.execute("ALTER TABLE categories ADD COLUMN monthly_budget REAL DEFAULT 0.0")
    except Exception as e:
        print("categories migration warning:", e)

    # 2. CORE ENTITY TABLES

    # 1.5. NEW ENTERPRISE METADATA TABLES
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('Primary Owner', 'Spouse', 'Dependent'))
    )
    """)

    # Check and add type column to institutions
    try:
        cursor.execute("PRAGMA table_info('institutions')")
        existing_cols = [row['name'] for row in cursor.fetchall()]
        if 'type' not in existing_cols:
            cursor.execute("ALTER TABLE institutions ADD COLUMN type TEXT NOT NULL DEFAULT 'Bank'")
    except Exception as e:
        print("institutions migration warning:", e)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES people(id),
        institution_id INTEGER NOT NULL REFERENCES institutions(id),
        customer_identifier TEXT NOT NULL,
        UNIQUE(person_id, institution_id, customer_identifier)
    )
    """)

    # 2. CORE ENTITY TABLES

    # Accounts (Normalized schema)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        institution_id INTEGER NOT NULL REFERENCES institutions(id),
        owner_id INTEGER NOT NULL REFERENCES people(id),
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Closed')),
        currency TEXT NOT NULL DEFAULT 'INR',
        UNIQUE(name, institution_id, owner_id)
    )
    """)

    # Assets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        institution_id INTEGER REFERENCES institutions(id),
        purchase_date TEXT,
        current_value REAL DEFAULT 0.0,
        quantity REAL DEFAULT 1.0,
        cost_price REAL DEFAULT 0.0,
        market_value REAL DEFAULT 0.0,
        expected_return REAL DEFAULT 0.0,
        compounding TEXT DEFAULT 'Monthly',
        liquidity TEXT DEFAULT 'High',
        tax_category TEXT,
        risk_level TEXT DEFAULT 'Medium',
        linked_account_id INTEGER REFERENCES accounts(id),
        metadata_json TEXT
    )
    """)

    # Liabilities
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS liabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        lender_institution_id INTEGER REFERENCES institutions(id),
        interest_rate REAL DEFAULT 0.0,
        emi REAL DEFAULT 0.0,
        outstanding REAL DEFAULT 0.0,
        tenure_months INTEGER DEFAULT 0,
        compounding TEXT DEFAULT 'Monthly',
        linked_asset_id INTEGER REFERENCES assets(id),
        tax_benefit TEXT DEFAULT 'None',
        metadata_json TEXT
    )
    """)

    # Income
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        amount REAL NOT NULL,
        frequency TEXT DEFAULT 'Monthly',
        growth_rate REAL DEFAULT 0.0,
        taxable INTEGER DEFAULT 1,
        source TEXT,
        metadata_json TEXT
    )
    """)

    # Expenses (supports nested categories via parent_category_id)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        amount REAL NOT NULL,
        frequency TEXT DEFAULT 'Monthly',
        linked_liability_id INTEGER REFERENCES liabilities(id),
        parent_category_id INTEGER REFERENCES expenses(id),
        metadata_json TEXT
    )
    """)

    # Goals
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0.0,
        monthly_contribution REAL DEFAULT 0.0,
        target_date TEXT,
        priority TEXT DEFAULT 'Medium',
        expected_return REAL DEFAULT 0.0,
        inflation REAL DEFAULT 6.0,
        funding_sources_json TEXT
    )
    """)

    # Portfolios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS portfolios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_id INTEGER NOT NULL REFERENCES people(id),
        UNIQUE(name, owner_id)
    )
    """)

    # portfolio_holdings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS portfolio_holdings (
        portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
        asset_id INTEGER NOT NULL REFERENCES assets(id),
        PRIMARY KEY(portfolio_id, asset_id)
    )
    """)

    # goal_holdings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goal_holdings (
        goal_id INTEGER NOT NULL REFERENCES goals(id),
        asset_id INTEGER NOT NULL REFERENCES assets(id),
        allocation_weight REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY(goal_id, asset_id)
    )
    """)

    # Transactions (Normalized schema)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
        source_ref_id INTEGER,
        dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
        dest_ref_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption')),
        amount REAL NOT NULL CHECK(amount > 0.0),
        transaction_date TEXT NOT NULL,
        notes TEXT,
        linked_goal_id INTEGER REFERENCES goals(id)
    )
    """)

    # Rewards Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reward_programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES financial_products(id),
        name TEXT NOT NULL,
        point_value_inr REAL NOT NULL DEFAULT 0.25
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reward_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL REFERENCES reward_programs(id),
        merchant_category TEXT NOT NULL,
        multiplier REAL NOT NULL DEFAULT 1.0,
        monthly_cap INTEGER,
        is_exclusion INTEGER NOT NULL DEFAULT 0,
        UNIQUE(program_id, merchant_category)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reward_partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL REFERENCES reward_programs(id),
        partner_name TEXT NOT NULL,
        conversion_ratio REAL NOT NULL DEFAULT 1.0
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reward_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL REFERENCES reward_programs(id),
        transaction_id INTEGER NOT NULL REFERENCES transactions(id),
        points_accrued INTEGER NOT NULL,
        is_reconciled INTEGER NOT NULL DEFAULT 0
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reward_redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        program_id INTEGER NOT NULL REFERENCES reward_programs(id),
        points_redeemed INTEGER NOT NULL,
        redemption_type TEXT NOT NULL CHECK(redemption_type IN ('Cashback', 'MilesTransfer')),
        partner_id INTEGER REFERENCES reward_partners(id),
        cash_value REAL NOT NULL
    )
    """)

    # Run Database Migrations for Accounts and Transactions
    try:
        cursor.execute("PRAGMA table_info('accounts')")
        acc_cols = [row['name'] for row in cursor.fetchall()]
        if 'current_balance' in acc_cols or 'owner_id' not in acc_cols:
            print("[Migration] Migrating accounts table...")
            cursor.execute("INSERT OR IGNORE INTO people (id, name, role) VALUES (1, 'Amit', 'Primary Owner')")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS accounts_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                institution_id INTEGER NOT NULL REFERENCES institutions(id),
                owner_id INTEGER NOT NULL REFERENCES people(id),
                status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Closed')),
                currency TEXT NOT NULL DEFAULT 'INR',
                UNIQUE(name, institution_id, owner_id)
            )
            """)
            cursor.execute("SELECT * FROM accounts")
            for acc in cursor.fetchall():
                cursor.execute("""
                INSERT OR IGNORE INTO accounts_temp (id, name, institution_id, owner_id, status, currency)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (acc['id'], acc['name'], acc['institution_id'], 1, acc['status'] or 'Active', acc['currency'] or 'INR'))
            cursor.execute("DROP TABLE accounts")
            cursor.execute("ALTER TABLE accounts_temp RENAME TO accounts")
            print("[Migration] accounts table restructured successfully.")
    except Exception as e:
        print("[Migration Error] accounts restructuring failed:", e)

    try:
        cursor.execute("PRAGMA table_info('transactions')")
        tx_cols = [row['name'] for row in cursor.fetchall()]
        if 'account_id' in tx_cols or 'source_ref_type' not in tx_cols:
            print("[Migration] Migrating transactions table...")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
                source_ref_id INTEGER,
                dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
                dest_ref_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption')),
                amount REAL NOT NULL CHECK(amount > 0.0),
                transaction_date TEXT NOT NULL,
                notes TEXT,
                linked_goal_id INTEGER REFERENCES goals(id)
            )
            """)
            cursor.execute("SELECT * FROM transactions")
            for t in cursor.fetchall():
                acc_id = t['account_id']
                ttype = t['type']
                amount = t['amount']
                tdate = t['transaction_date']
                notes = t['notes']
                
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
                    dest_id = t['related_entity_id'] if t['related_entity_type'] == 'Account' else None
                    new_type = 'Transfer'
                elif ttype in ('Investment', 'Buy'):
                    source_type = 'Account'
                    source_id = acc_id
                    dest_type = 'Asset'
                    dest_id = t['related_entity_id'] if t['related_entity_type'] == 'Asset' else None
                    new_type = 'Buy'
                elif ttype in ('Redemption', 'Sell'):
                    source_type = 'Asset'
                    source_id = t['related_entity_id'] if t['related_entity_type'] == 'Asset' else None
                    dest_type = 'Account'
                    dest_id = acc_id
                    new_type = 'Sell'
                else:
                    source_type = 'None'
                    dest_type = 'Account'
                    dest_id = acc_id
                    new_type = 'Credit'
                    
                cursor.execute("""
                INSERT INTO transactions_temp (id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (t['id'], source_type, source_id, dest_type, dest_id, new_type, amount, tdate, notes))
            cursor.execute("DROP TABLE transactions")
            cursor.execute("ALTER TABLE transactions_temp RENAME TO transactions")
            print("[Migration] transactions table restructured successfully.")
    except Exception as e:
        print("[Migration Error] transactions restructuring failed:", e)

    cursor.execute("PRAGMA foreign_keys = ON")


    # Keep snapshots & monthly_cash_flows for backward compatibility / historical logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL UNIQUE,
        net_worth REAL NOT NULL,
        liquid_funds REAL NOT NULL,
        total_assets REAL NOT NULL,
        total_liabilities REAL NOT NULL,
        snapshot_data TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS monthly_cash_flows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL UNIQUE,
        net_salary REAL NOT NULL DEFAULT 0.0,
        other_income REAL NOT NULL DEFAULT 0.0,
        household_expenses REAL NOT NULL DEFAULT 0.0,
        emi REAL NOT NULL DEFAULT 0.0,
        insurance_premium REAL NOT NULL DEFAULT 0.0,
        investments REAL NOT NULL DEFAULT 0.0,
        one_time_expenses REAL NOT NULL DEFAULT 0.0,
        notes TEXT
    )
    """)

    # 3. SEED DEFAULT DATA
    if is_new_db:
        default_institutions = ['HDFC Bank', 'ICICI Bank', 'SBI', 'EPFO', 'Groww', 'Zerodha', 'LIC', 'NPS Trust']
        for inst in default_institutions:
            cursor.execute("INSERT OR IGNORE INTO institutions (name) VALUES (?)", (inst,))

    default_categories = [
        # Accounts
        ('Account', 'Savings Account', json.dumps([{"name": "interest_rate", "type": "number", "label": "Interest Rate (%)"}])),
        ('Account', 'Demat Account', None),
        ('Account', 'Retirement Account', None),
        # Assets
        ('Asset', 'Mutual Fund', json.dumps([{"name": "units", "type": "number", "label": "Units"}, {"name": "nav", "type": "number", "label": "NAV"}])),
        ('Asset', 'Stock', json.dumps([{"name": "ticker", "type": "text", "label": "Ticker Symbol"}])),
        ('Asset', 'Gold', None),
        ('Asset', 'EPF', None),
        ('Asset', 'PPF', None),
        ('Asset', 'NPS', None),
        ('Asset', 'Fixed Deposit', json.dumps([{"name": "duration_months", "type": "number", "label": "Duration (Months)"}])),
        ('Asset', 'Bond', json.dumps([{"name": "coupon_rate", "type": "number", "label": "Coupon Rate (%)"}])),
        ('Asset', 'Property', json.dumps([{"name": "rental_income", "type": "number", "label": "Rental Income"}, {"name": "maintenance_expenses", "type": "number", "label": "Maintenance Expenses"}])),
        ('Asset', 'Insurance', json.dumps([{"name": "policy_number", "type": "text", "label": "Policy Number"}, {"name": "coverage", "type": "number", "label": "Coverage Amount"}, {"name": "surrender_value", "type": "number", "label": "Surrender Value"}])),
        # Liabilities
        ('Liability', 'Home Loan', None),
        ('Liability', 'Personal Loan', None),
        ('Liability', 'Credit Card', json.dumps([
            {"name": "credit_limit", "type": "number", "label": "Credit Limit"},
            {"name": "statement_date", "type": "number", "label": "Statement Day of Month"},
            {"name": "due_date", "type": "number", "label": "Due Day of Month"},
            {"name": "annual_fee", "type": "number", "label": "Annual Fee (INR)"},
            {"name": "renewal_date", "type": "date", "label": "Renewal Date"},
            {"name": "reward_points", "type": "number", "label": "Reward Points Balance"},
            {"name": "point_value", "type": "number", "label": "Point Value (INR)"},
            {"name": "network", "type": "text", "label": "Card Network (Visa/MC/Rupay/Amex)"},
            {"name": "lounge_visits_limit", "type": "number", "label": "Annual Lounge Access Limit"},
            {"name": "lounge_visits_used", "type": "number", "label": "Lounge Access Used"},
            {"name": "lounge_int_limit", "type": "number", "label": "Intl Lounge Access Limit"},
            {"name": "lounge_int_used", "type": "number", "label": "Intl Lounge Access Used"},
            {"name": "milestone_spend_target", "type": "number", "label": "Next Milestone Spend Target"},
            {"name": "milestone_spend_current", "type": "number", "label": "Current Annual Spend"},
            {"name": "milestone_reward_desc", "type": "text", "label": "Milestone Reward Details"},
            {"name": "base_points", "type": "number", "label": "Base Points Rate"},
            {"name": "base_spend", "type": "number", "label": "Base Spend Threshold"},
            {"name": "current_statement_spend", "type": "number", "label": "Current Statement Spend"},
            {"name": "category_rules_json", "type": "text", "label": "Category Rules (JSON)"},
            {"name": "milestone_rules_json", "type": "text", "label": "Milestone Rules (JSON)"},
            {"name": "redemption_partners_json", "type": "text", "label": "Redemption Partners (JSON)"},
            {"name": "remarks", "type": "text", "label": "Remarks"}
        ])),
        ('Liability', 'Car Loan', None),
        # Income
        ('Income', 'Salary', None),
        ('Income', 'Bonus', None),
        ('Income', 'Rental', None),
        ('Income', 'Dividend', None),
        ('Income', 'Interest', None),
        # Expenses
        ('Expense', 'Grocery', None),
        ('Expense', 'Fuel', None),
        ('Expense', 'Education', None),
        ('Expense', 'Travel', None),
        ('Expense', 'Utility', None),
        ('Expense', 'EMI', None),
    ]

    for entity_type, name, fields in default_categories:
        cursor.execute("""
        INSERT OR IGNORE INTO categories (entity_type, name, fields_definition)
        VALUES (?, ?, ?)
        """, (entity_type, name, fields))

    default_rules = [
        ("min_emergency_fund", "Minimum Emergency Fund", "Never reduce Emergency Fund below this value", 1500000.0, "Emergency Fund", 1),
        ("insurance_reserve_target", "Insurance Reserve Target", "Insurance Reserve should remain at this value", 300000.0, "Insurance", 1),
        ("debt_free_liquidity_target", "Debt-Free Liquidity Target", "Maintain this liquidity after becoming debt-free", 3000000.0, "Liquidity", 1),
        ("no_villa_equity", "No Villa Funds in Equity", "Do not invest Villa funds into equity markets (0 = false, 1 = true)", 1.0, "Goals", 1),
        ("high_interest_roi_threshold", "High Interest ROI Threshold (%)", "Loan ROI above this value will be flagged for prepayments", 7.5, "Loans", 1),
        ("prepayment_min_liquid_buffer", "Prepayment Min Liquid Buffer", "Minimum liquid buffer above emergency fund required to recommend prepayments", 50000.0, "Loans", 1),
        ("insurance_renewal_alert_days", "Insurance Renewal Alert Days", "Trigger premium warnings this many days before the policy renewal date", 30.0, "Insurance", 1),
        ("target_savings_rate", "Target Savings Rate (%)", "Target savings rate percentage threshold checked on the dashboard indicator", 35.0, "Cash Flow", 1)
    ]

    for rule_key, rule_name, desc, val, cat, enabled in default_rules:
        cursor.execute("""
        INSERT OR IGNORE INTO financial_rules (rule_key, rule_name, description, value, category, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (rule_key, rule_name, desc, val, cat, enabled))

    conn.commit()

    # 4. RUN AUTOMATED LEGACY DATA MIGRATION
    # Check if legacy tables exist. If they do, migrate them to new metadata structure.
    try:
        # A. Migrate Accounts
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts_old'")
        if not cursor.fetchone():
            cursor.execute("PRAGMA table_info('accounts')")
            columns = [col['name'] for col in cursor.fetchall()]
            if columns and 'metadata_json' not in columns:
                cursor.execute("ALTER TABLE accounts RENAME TO accounts_old")
                cursor.execute("""
                CREATE TABLE accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    institution_id INTEGER REFERENCES institutions(id),
                    current_balance REAL DEFAULT 0.0,
                    currency TEXT DEFAULT 'INR',
                    status TEXT DEFAULT 'Active',
                    owner TEXT,
                    tags TEXT,
                    metadata_json TEXT,
                    UNIQUE(name, institution_id)
                )
                """)
                cursor.execute("SELECT * FROM accounts_old")
                old_accounts = cursor.fetchall()
                for old_acc in old_accounts:
                    cursor.execute("SELECT id FROM institutions WHERE name = ?", (old_acc['institution'],))
                    inst_row = cursor.fetchone()
                    if inst_row:
                        inst_id = inst_row['id']
                    else:
                        cursor.execute("INSERT INTO institutions (name) VALUES (?)", (old_acc['institution'],))
                        inst_id = cursor.lastrowid
                    
                    cursor.execute("""
                    INSERT OR IGNORE INTO accounts (id, name, institution_id, current_balance, status, owner, tags, metadata_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        old_acc['id'], 
                        old_acc['name'], 
                        inst_id, 
                        old_acc['current_balance'] if 'current_balance' in old_acc.keys() else 0.0,
                        'Active', 
                        'Self', 
                        None, 
                        None
                    ))
                print("[Migration] Accounts migrated successfully.")
                cursor.execute("DROP TABLE accounts_old")
    except Exception as e:
        print("[Migration Warning] Accounts migration error:", e)

    # B. Migrate Investments, Properties, and Insurance to Assets
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='investments'")
        if cursor.fetchone():
            cursor.execute("SELECT * FROM investments")
            old_investments = cursor.fetchall()
            for old_inv in old_investments:
                cat_name = old_inv['type']
                cursor.execute("SELECT id FROM categories WHERE name = ?", (cat_name,))
                cat_row = cursor.fetchone()
                if cat_row:
                    cat_id = cat_row['id']
                else:
                    cursor.execute("INSERT INTO categories (entity_type, name) VALUES ('Asset', ?)", (cat_name,))
                    cat_id = cursor.lastrowid

                cursor.execute("""
                INSERT OR IGNORE INTO assets (name, category_id, institution_id, purchase_date, current_value, cost_price, expected_return, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_inv['name'],
                    cat_id,
                    None,
                    None,
                    old_inv['current_value'],
                    old_inv['invested_amount'],
                    12.0,
                    json.dumps({"goal_mapping": old_inv['goal_mapping']})
                ))
            cursor.execute("ALTER TABLE investments RENAME TO investments_old")
            print("[Migration] Investments migrated to Assets.")
    except Exception as e:
        print("[Migration Warning] Investments migration error:", e)

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='properties'")
        if cursor.fetchone():
            cursor.execute("SELECT * FROM properties")
            old_props = cursor.fetchall()
            cursor.execute("SELECT id FROM categories WHERE name = 'Property'")
            prop_cat_id = cursor.fetchone()['id']
            for old_prop in old_props:
                cursor.execute("""
                INSERT OR IGNORE INTO assets (name, category_id, purchase_date, current_value, cost_price, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    old_prop['name'],
                    prop_cat_id,
                    None,
                    old_prop['current_value'],
                    old_prop['purchase_price'],
                    json.dumps({
                        "rental_income": old_prop['rental_income'],
                        "expenses": old_prop['expenses'],
                        "remarks": old_prop['remarks']
                    })
                ))
            cursor.execute("ALTER TABLE properties RENAME TO properties_old")
            print("[Migration] Properties migrated to Assets.")
    except Exception as e:
        print("[Migration Warning] Properties migration error:", e)

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='insurance'")
        if cursor.fetchone():
            cursor.execute("SELECT * FROM insurance")
            old_insurances = cursor.fetchall()
            cursor.execute("SELECT id FROM categories WHERE name = 'Insurance'")
            ins_cat_id = cursor.fetchone()['id']
            for old_ins in old_insurances:
                cursor.execute("SELECT id FROM institutions WHERE name = ?", (old_ins['company'],))
                inst_row = cursor.fetchone()
                if inst_row:
                    inst_id = inst_row['id']
                else:
                    cursor.execute("INSERT INTO institutions (name) VALUES (?)", (old_ins['company'],))
                    inst_id = cursor.lastrowid
                
                cursor.execute("""
                INSERT OR IGNORE INTO assets (name, category_id, institution_id, current_value, cost_price, expected_return, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"{old_ins['insurance_type']} ({old_ins['policy_number']})",
                    ins_cat_id,
                    inst_id,
                    old_ins['surrender_value'] if 'surrender_value' in old_ins.keys() else 0.0,
                    old_ins['premium'],
                    0.0,
                    json.dumps({
                        "policy_number": old_ins['policy_number'],
                        "premium": old_ins['premium'],
                        "frequency": old_ins['frequency'],
                        "coverage": old_ins['coverage'],
                        "nominee": old_ins['nominee'],
                        "renewal_date": old_ins['renewal_date'],
                        "insurance_type": old_ins['insurance_type']
                    })
                ))
            cursor.execute("ALTER TABLE insurance RENAME TO insurance_old")
            print("[Migration] Insurance policies migrated to Assets.")
    except Exception as e:
        print("[Migration Warning] Insurance migration error:", e)

    # C. Migrate Loans and Credit Cards to Liabilities
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='loans'")
        if cursor.fetchone():
            cursor.execute("SELECT * FROM loans")
            old_loans = cursor.fetchall()
            for old_loan in old_loans:
                cat_name = f"{old_loan['loan_type']} Loan" if "loan_type" in old_loan.keys() else "Personal Loan"
                cursor.execute("SELECT id FROM categories WHERE name = ?", (cat_name,))
                cat_row = cursor.fetchone()
                if cat_row:
                    cat_id = cat_row['id']
                else:
                    cursor.execute("SELECT id FROM categories WHERE name = 'Personal Loan'")
                    cat_id = cursor.fetchone()['id']
                
                cursor.execute("SELECT id FROM institutions WHERE name = ?", (old_loan['lender'],))
                inst_row = cursor.fetchone()
                if inst_row:
                    inst_id = inst_row['id']
                else:
                    cursor.execute("INSERT INTO institutions (name) VALUES (?)", (old_loan['lender'],))
                    inst_id = cursor.lastrowid

                cursor.execute("""
                INSERT OR IGNORE INTO liabilities (name, category_id, lender_institution_id, interest_rate, emi, outstanding, tenure_months, compounding, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_loan['name'],
                    cat_id,
                    inst_id,
                    old_loan['roi'],
                    old_loan['emi'],
                    old_loan['outstanding'],
                    old_loan['tenure'],
                    'Monthly',
                    json.dumps({
                        "start_date": old_loan['start_date'],
                        "prepayment_allowed": old_loan['prepayment_allowed'] if 'prepayment_allowed' in old_loan.keys() else 1,
                        "processing_fee": old_loan['processing_fee'] if 'processing_fee' in old_loan.keys() else 0.0
                    })
                ))
            cursor.execute("ALTER TABLE loans RENAME TO loans_old")
            print("[Migration] Loans migrated to Liabilities.")
    except Exception as e:
        print("[Migration Warning] Loans migration error:", e)

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_cards'")
        if cursor.fetchone():
            cursor.execute("SELECT * FROM credit_cards")
            old_cards = cursor.fetchall()
            cursor.execute("SELECT id FROM categories WHERE name = 'Credit Card'")
            cc_cat_id = cursor.fetchone()['id']
            for old_cc in old_cards:
                cursor.execute("SELECT id FROM institutions WHERE name = ?", (old_cc['issuer'],))
                inst_row = cursor.fetchone()
                if inst_row:
                    inst_id = inst_row['id']
                else:
                    cursor.execute("INSERT INTO institutions (name) VALUES (?)", (old_cc['issuer'],))
                    inst_id = cursor.lastrowid

                cursor.execute("""
                INSERT OR IGNORE INTO liabilities (name, category_id, lender_institution_id, interest_rate, emi, outstanding, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_cc['name'],
                    cc_cat_id,
                    inst_id,
                    0.0,
                    0.0,
                    old_cc['outstanding'],
                    json.dumps({
                        "credit_limit": old_cc['credit_limit'],
                        "statement_balance": old_cc['statement_balance'] if 'statement_balance' in old_cc.keys() else 0.0,
                        "statement_date": old_cc['statement_date'],
                        "due_date": old_cc['due_date'],
                        "annual_fee": old_cc['annual_fee'] if 'annual_fee' in old_cc.keys() else 0.0,
                        "reward_points": old_cc['reward_points'] if 'reward_points' in old_cc.keys() else 0,
                        "point_value": old_cc['point_value'] if 'point_value' in old_cc.keys() else 0.25,
                        "remarks": old_cc['remarks']
                    })
                ))
            cursor.execute("ALTER TABLE credit_cards RENAME TO credit_cards_old")
            print("[Migration] Credit cards migrated to Liabilities.")
    except Exception as e:
        print("[Migration Warning] Credit cards migration error:", e)

    # D. Migrate Goals to include target_date
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info('goals')")
            cols = [col['name'] for col in cursor.fetchall()]
            if cols and 'target_date' not in cols:
                cursor.execute("ALTER TABLE goals RENAME TO goals_old")
                cursor.execute("""
                CREATE TABLE goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    target_amount REAL NOT NULL,
                    current_amount REAL DEFAULT 0.0,
                    monthly_contribution REAL DEFAULT 0.0,
                    target_date TEXT,
                    priority TEXT DEFAULT 'Medium',
                    expected_return REAL DEFAULT 0.0,
                    inflation REAL DEFAULT 6.0,
                    funding_sources_json TEXT
                )
                """)
                cursor.execute("SELECT * FROM goals_old")
                old_goals = cursor.fetchall()
                for old_goal in old_goals:
                    cursor.execute("""
                    INSERT OR IGNORE INTO goals (id, name, target_amount, current_amount, monthly_contribution, target_date, priority)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        old_goal['id'],
                        old_goal['name'],
                        old_goal['target_amount'],
                        old_goal['current_amount'] if 'current_amount' in old_goal.keys() else 0.0,
                        old_goal['monthly_contribution'] if 'monthly_contribution' in old_goal.keys() else 0.0,
                        old_goal['expected_completion'] if 'expected_completion' in old_goal.keys() else None,
                        'Medium'
                    ))
                cursor.execute("DROP TABLE goals_old")
                print("[Migration] Goals migrated to new schema successfully.")
    except Exception as e:
        print("[Migration Warning] Goals migration error:", e)

    # E. Update Credit Card category fields definition
    try:
        cursor.execute("SELECT id FROM categories WHERE name = 'Credit Card'")
        row = cursor.fetchone()
        if row:
            cat_id = row['id']
            new_fields = [
                {"name": "credit_limit", "type": "number", "label": "Credit Limit"},
                {"name": "statement_date", "type": "number", "label": "Statement Day of Month"},
                {"name": "due_date", "type": "number", "label": "Due Day of Month"},
                {"name": "annual_fee", "type": "number", "label": "Annual Fee (INR)"},
                {"name": "renewal_date", "type": "date", "label": "Renewal Date"},
                {"name": "reward_points", "type": "number", "label": "Reward Points Balance"},
                {"name": "point_value", "type": "number", "label": "Point Value (INR)"},
                {"name": "network", "type": "text", "label": "Card Network (Visa/MC/Rupay/Amex)"},
                {"name": "lounge_visits_limit", "type": "number", "label": "Annual Lounge Access Limit"},
                {"name": "lounge_visits_used", "type": "number", "label": "Lounge Access Used"},
                {"name": "lounge_int_limit", "type": "number", "label": "Intl Lounge Access Limit"},
                {"name": "lounge_int_used", "type": "number", "label": "Intl Lounge Access Used"},
                {"name": "milestone_spend_target", "type": "number", "label": "Next Milestone Spend Target"},
                {"name": "milestone_spend_current", "type": "number", "label": "Current Annual Spend"},
                {"name": "milestone_reward_desc", "type": "text", "label": "Milestone Reward Details"},
                {"name": "base_points", "type": "number", "label": "Base Points Rate"},
                {"name": "base_spend", "type": "number", "label": "Base Spend Threshold"},
                {"name": "current_statement_spend", "type": "number", "label": "Current Statement Spend"},
                {"name": "category_rules_json", "type": "text", "label": "Category Rules (JSON)"},
                {"name": "milestone_rules_json", "type": "text", "label": "Milestone Rules (JSON)"},
                {"name": "redemption_partners_json", "type": "text", "label": "Redemption Partners (JSON)"},
                {"name": "remarks", "type": "text", "label": "Remarks"}
            ]
            cursor.execute("UPDATE categories SET fields_definition = ? WHERE id = ?", (json.dumps(new_fields), cat_id))
            print("[Migration] Credit card category fields_definition expanded successfully.")
    except Exception as e:
        print("[Migration Warning] Credit card category update error:", e)

    # F. Sync goal_mapping from assets metadata to goal_holdings
    try:
        cursor.execute("SELECT * FROM goal_holdings LIMIT 1")
        if not cursor.fetchone():
            print("[Migration] Syncing legacy assets goal_mapping to goal_holdings...")
            cursor.execute("SELECT id, metadata_json FROM assets")
            assets_rows = cursor.fetchall()
            for asset in assets_rows:
                meta_str = asset['metadata_json']
                if meta_str:
                    try:
                        meta = json.loads(meta_str)
                        goal_name = meta.get("goal_mapping")
                        if goal_name:
                            cursor.execute("SELECT id FROM goals WHERE name = ?", (goal_name,))
                            goal_row = cursor.fetchone()
                            if goal_row:
                                goal_id = goal_row['id']
                                cursor.execute("""
                                INSERT OR IGNORE INTO goal_holdings (goal_id, asset_id, allocation_weight)
                                VALUES (?, ?, 1.0)
                                """, (goal_id, asset['id']))
                    except Exception as e:
                        print("Error parsing asset metadata during goal sync:", e)
            print("[Migration] Legacy assets goal_mapping synced successfully.")
    except Exception as e:
        print("[Migration Warning] goal_holdings sync failed:", e)

    conn.commit()
    conn.close()

def switch_database(new_path: str):
    new_path = os.path.abspath(new_path)
    settings = load_settings()
    settings["active_db_path"] = new_path
    
    recent_databases = settings.get("recent_databases", [])
    if new_path in recent_databases:
        recent_databases.remove(new_path)
    recent_databases.insert(0, new_path)
    settings["recent_databases"] = recent_databases[:5]
    
    save_settings(settings)
    
    # Initialize the new database file immediately
    init_db()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", get_db_path())
