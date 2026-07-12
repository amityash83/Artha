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
    conn = get_db_connection()
    cursor = conn.cursor()

    # Accounts Table Migration to UNIQUE(name, institution)
    try:
        cursor.execute("PRAGMA index_list('accounts')")
        indexes = cursor.fetchall()
        # If the table exists, let's check its schema structure
        cursor.execute("PRAGMA table_info('accounts')")
        columns = [row['name'] for row in cursor.fetchall()]
        
        # Check if index constraints need rebuilding (e.g. name unique constraint check)
        # If it was unique on name, recreate it with UNIQUE(name, institution)
        if len(columns) > 0:
            # Let's inspect the DDL
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'")
            ddl = cursor.fetchone()[0]
            if "UNIQUE(name, institution)" not in ddl:
                cursor.execute("ALTER TABLE accounts RENAME TO accounts_old")
                cursor.execute("""
                CREATE TABLE accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    institution TEXT NOT NULL,
                    current_balance REAL NOT NULL DEFAULT 0.0,
                    last_updated TEXT NOT NULL,
                    remarks TEXT,
                    UNIQUE(name, institution)
                )
                """)
                cursor.execute("""
                INSERT OR IGNORE INTO accounts (id, name, institution, current_balance, last_updated, remarks)
                SELECT id, name, institution, current_balance, last_updated, remarks FROM accounts_old
                """)
                cursor.execute("DROP TABLE accounts_old")
        else:
            raise sqlite3.OperationalError("Table does not exist")
    except (sqlite3.OperationalError, TypeError):
        # Create fresh table if not exists
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            institution TEXT NOT NULL,
            current_balance REAL NOT NULL DEFAULT 0.0,
            last_updated TEXT NOT NULL,
            remarks TEXT,
            UNIQUE(name, institution)
        )
        """)


    # Loans Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        lender TEXT NOT NULL,
        outstanding REAL NOT NULL,
        roi REAL NOT NULL,
        emi REAL NOT NULL,
        tenure INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        expected_closure_date TEXT,
        prepayment_allowed INTEGER NOT NULL DEFAULT 1,
        processing_fee REAL NOT NULL DEFAULT 0.0,
        loan_type TEXT NOT NULL DEFAULT 'Home'
    )
    """)

    # Investments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        current_value REAL NOT NULL DEFAULT 0.0,
        invested_amount REAL NOT NULL DEFAULT 0.0,
        goal_mapping TEXT,
        last_updated TEXT NOT NULL
    )
    """)

    # Properties Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        purchase_price REAL NOT NULL,
        current_value REAL NOT NULL,
        associated_loan_id INTEGER REFERENCES loans(id),
        rental_income REAL DEFAULT 0.0,
        expenses REAL DEFAULT 0.0,
        remarks TEXT
    )
    """)

    # Insurance Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS insurance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        policy_number TEXT NOT NULL UNIQUE,
        premium REAL NOT NULL,
        frequency TEXT NOT NULL,
        coverage REAL NOT NULL,
        nominee TEXT NOT NULL,
        maturity_date TEXT,
        last_premium_date TEXT,
        renewal_date TEXT,
        waiting_period TEXT,
        claim_history TEXT,
        insurance_type TEXT DEFAULT 'Traditional Life',
        surrender_value REAL DEFAULT 0.0
    )
    """)

    # Columns migration check for existing tables
    try:
        cursor.execute("PRAGMA table_info('insurance')")
        existing_cols = [row['name'] for row in cursor.fetchall()]
        if 'insurance_type' not in existing_cols:
            cursor.execute("ALTER TABLE insurance ADD COLUMN insurance_type TEXT DEFAULT 'Traditional Life'")
        if 'surrender_value' not in existing_cols:
            cursor.execute("ALTER TABLE insurance ADD COLUMN surrender_value REAL DEFAULT 0.0")
    except Exception as e:
        print("Insurance migration warning:", e)

    # Goals Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        target_amount REAL NOT NULL,
        current_amount REAL NOT NULL DEFAULT 0.0,
        monthly_contribution REAL NOT NULL DEFAULT 0.0,
        expected_completion TEXT,
        goal_type TEXT NOT NULL
    )
    """)

    # Snapshots Table
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

    # Monthly Cash Flows Table
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

    # Financial Rules Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS financial_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_key TEXT NOT NULL UNIQUE,
        rule_name TEXT NOT NULL,
        description TEXT,
        value REAL NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1
    )
    """)

    # EMI Calculator Profiles Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emi_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        loan_amount REAL NOT NULL,
        roi REAL NOT NULL,
        tenure_value INTEGER NOT NULL,
        tenure_unit TEXT NOT NULL,
        start_date TEXT NOT NULL,
        prepayments TEXT NOT NULL
    )
    """)

    # Credit Cards Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS credit_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        issuer TEXT NOT NULL,
        credit_limit REAL NOT NULL,
        outstanding REAL NOT NULL DEFAULT 0.0,
        statement_balance REAL NOT NULL DEFAULT 0.0,
        statement_date INTEGER NOT NULL,
        due_date INTEGER NOT NULL,
        annual_fee REAL NOT NULL DEFAULT 0.0,
        renewal_date TEXT,
        reward_points INTEGER DEFAULT 0,
        point_value REAL DEFAULT 0.25,
        lounge_access_domestic TEXT,
        lounge_access_international TEXT,
        spend_milestone_waiver REAL DEFAULT 0.0,
        remarks TEXT
    )
    """)

    # Columns migration check for credit_cards table
    try:
        cursor.execute("PRAGMA table_info('credit_cards')")
        existing_cols = [row['name'] for row in cursor.fetchall()]
        if 'statement_balance' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN statement_balance REAL DEFAULT 0.0")
        if 'annual_fee' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN annual_fee REAL DEFAULT 0.0")
        if 'renewal_date' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN renewal_date TEXT")
        if 'reward_points' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN reward_points INTEGER DEFAULT 0")
        if 'point_value' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN point_value REAL DEFAULT 0.25")
        if 'lounge_access_domestic' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN lounge_access_domestic TEXT")
        if 'lounge_access_international' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN lounge_access_international TEXT")
        if 'spend_milestone_waiver' not in existing_cols:
            cursor.execute("ALTER TABLE credit_cards ADD COLUMN spend_milestone_waiver REAL DEFAULT 0.0")
    except Exception as e:
        print("Credit cards migration warning:", e)

    # Seed Default Financial Rules
    default_rules = [
        ("min_emergency_fund", "Minimum Emergency Fund", "Never reduce Emergency Fund below this value", 1500000.0, 1),
        ("insurance_reserve_target", "Insurance Reserve Target", "Insurance Reserve should remain at this value", 300000.0, 1),
        ("debt_free_liquidity_target", "Debt-Free Liquidity Target", "Maintain this liquidity after becoming debt-free", 3000000.0, 1),
        ("no_villa_equity", "No Villa Funds in Equity", "Do not invest Villa funds into equity markets (0 = false, 1 = true)", 1.0, 1)
    ]

    for rule_key, rule_name, desc, val, enabled in default_rules:
        cursor.execute("""
        INSERT OR IGNORE INTO financial_rules (rule_key, rule_name, description, value, is_enabled)
        VALUES (?, ?, ?, ?, ?)
        """, (rule_key, rule_name, desc, val, enabled))

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
