import sqlite3
import os
import json
from datetime import datetime

# AppData path for storing database settings
SETTINGS_DIR = os.path.join(os.path.expanduser("~"), ".financeos")
os.makedirs(SETTINGS_DIR, exist_ok=True)
SETTINGS_PATH = os.path.join(SETTINGS_DIR, "settings.json")

# Prefixed onto the legacy Taxation financial_rules rows' descriptions by init_db().
SALARY_FIELDS_DEFINITION = [{"name": "net_amount", "type": "number", "label": "Take-home per period (after tax and deductions)"}]

# One EPF asset per PF member account (each employer gets its own member ID under the one
# UAN). The asset's value is the employee + employer shares (the form sets current_value
# from them); the pension (EPS) share is recorded but not counted in net worth, since it's
# a pension entitlement rather than a withdrawable balance. Figures come from the EPFO
# passbook; Artha keeps balances, not a copy of the monthly ledger.
EPF_FIELDS_DEFINITION = [
    {"name": "employer_name", "type": "text", "label": "Employer"},
    {"name": "uan", "type": "text", "label": "UAN"},
    {"name": "member_id", "type": "text", "label": "Member ID"},
    {"name": "transfer_status", "type": "select_epf_status", "label": "Account"},
    {"name": "employee_share", "type": "number", "label": "Your share"},
    {"name": "employer_share", "type": "number", "label": "Employer's share"},
    {"name": "pension_share", "type": "number", "label": "Pension (EPS)"},
    {"name": "balance_as_of", "type": "date", "label": "Passbook checked on"},
]

TAX_RULE_SUPERSEDED_PREFIX = "[Not used: tax figures now come from the versioned tax rule set for each financial year] "

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

def _ensure_transaction_columns(cursor):
    """Adds transactions.category_id / is_balance_exempt where missing (see init_db()).
    Called twice: early, and again just before the Spend/Liability rebuild, because the
    older legacy rebuilds in between recreate the table without these columns."""
    try:
        cursor.execute("PRAGMA table_info('transactions')")
        tx_cols_precheck = [col['name'] for col in cursor.fetchall()]
        if tx_cols_precheck and 'category_id' not in tx_cols_precheck:
            cursor.execute("ALTER TABLE transactions ADD COLUMN category_id INTEGER REFERENCES categories(id)")
            print("[Migration] Added category_id column to transactions.")
        if tx_cols_precheck and 'is_balance_exempt' not in tx_cols_precheck:
            cursor.execute("ALTER TABLE transactions ADD COLUMN is_balance_exempt INTEGER NOT NULL DEFAULT 0")
            print("[Migration] Added is_balance_exempt column to transactions.")
    except Exception as e:
        print("[Migration Warning] transactions category_id/is_balance_exempt column migration error:", e)

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
        role TEXT NOT NULL CHECK(role IN ('Primary Owner', 'Spouse', 'Dependent')),
        risk_tolerance TEXT NOT NULL DEFAULT 'Moderate' CHECK(risk_tolerance IN ('Conservative', 'Moderate', 'Aggressive'))
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
        category_id INTEGER REFERENCES categories(id),
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Closed')),
        currency TEXT NOT NULL DEFAULT 'INR',
        UNIQUE(name, institution_id, owner_id)
    )
    """)

    # Accounts gained a category FK (Savings/Demat/Retirement/...) after the normalized
    # schema shipped — add it in place for databases created before the column existed.
    try:
        cursor.execute("PRAGMA table_info('accounts')")
        account_cols = [col['name'] for col in cursor.fetchall()]
        if account_cols and 'category_id' not in account_cols:
            cursor.execute("ALTER TABLE accounts ADD COLUMN category_id INTEGER REFERENCES categories(id)")
            print("[Migration] Added category_id column to accounts.")
    except Exception as e:
        print("[Migration Warning] accounts category_id column migration error:", e)

    # Assets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        institution_id INTEGER REFERENCES institutions(id),
        owner_id INTEGER NOT NULL REFERENCES people(id),
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
        owner_id INTEGER NOT NULL REFERENCES people(id),
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

    # Credit Card details (satellite table: 1:1 with liabilities, for revolving credit).
    # Also the single source of truth for the CreditCards.tsx reward-optimization engine
    # (category multipliers, milestones, redemption partners, lounge tracking) — these
    # used to live only in liabilities.metadata_json; see migration block "J" below.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS credit_card_details (
        liability_id INTEGER PRIMARY KEY REFERENCES liabilities(id) ON DELETE CASCADE,
        credit_limit REAL DEFAULT 0.0,
        statement_balance REAL DEFAULT 0.0,
        statement_date INTEGER,
        due_date INTEGER,
        annual_fee REAL DEFAULT 0.0,
        reward_points REAL DEFAULT 0.0,
        point_value REAL DEFAULT 0.25,
        renewal_date TEXT,
        network TEXT DEFAULT 'Visa',
        lounge_visits_limit REAL DEFAULT 0.0,
        lounge_visits_used REAL DEFAULT 0.0,
        lounge_int_limit REAL DEFAULT 0.0,
        lounge_int_used REAL DEFAULT 0.0,
        milestone_spend_target REAL DEFAULT 0.0,
        milestone_spend_current REAL DEFAULT 0.0,
        milestone_reward_desc TEXT,
        remarks TEXT,
        base_points REAL DEFAULT 1.0,
        base_spend REAL DEFAULT 100.0,
        current_statement_spend REAL DEFAULT 0.0,
        category_rules_json TEXT DEFAULT '[]',
        milestone_rules_json TEXT DEFAULT '[]',
        redemption_partners_json TEXT DEFAULT '[]'
    )
    """)

    # Card Library: a reference catalogue of card PRODUCTS a user might consider
    # applying for, distinct from their own registered cards (liabilities +
    # credit_card_details above). Deliberately reuses the exact same JSON field
    # shapes (category_rules_json/milestone_rules_json/redemption_partners_json)
    # as credit_card_details so both can share one normalization/scoring path in
    # Compare Cards, and so a chosen variant can prefill a new card's details with
    # zero transformation. Static reference data only — Artha never fetches live
    # card data — is_seeded distinguishes shipped starter rows from user entries.
    # Existence is checked BEFORE the CREATE so the starter catalogue (seeded further
    # below) runs exactly once, on the run that first creates the table — reseeding on
    # every startup would resurrect starter cards the user deliberately deleted or renamed.
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='card_variants'")
    card_variants_table_existed = cursor.fetchone() is not None
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS card_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        issuer TEXT NOT NULL,
        network TEXT NOT NULL DEFAULT 'Visa',
        card_tier TEXT DEFAULT 'Premium',
        joining_fee REAL DEFAULT 0.0,
        annual_fee REAL DEFAULT 0.0,
        fee_waiver_spend REAL DEFAULT 0.0,
        base_points REAL DEFAULT 1.0,
        base_spend REAL DEFAULT 100.0,
        point_value REAL DEFAULT 0.25,
        lounge_visits_domestic INTEGER DEFAULT 0,
        lounge_visits_international INTEGER DEFAULT 0,
        eligibility_notes TEXT,
        category_rules_json TEXT DEFAULT '[]',
        milestone_rules_json TEXT DEFAULT '[]',
        redemption_partners_json TEXT DEFAULT '[]',
        pros_json TEXT DEFAULT '[]',
        cons_json TEXT DEFAULT '[]',
        is_seeded INTEGER NOT NULL DEFAULT 0,
        source_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(name, issuer)
    )
    """)

    # Knowledge Base: read-only reference content (plain-language explainers of
    # financial concepts and financial_rules entries), seeded once and never
    # user-editable — no CRUD routes exist for this table, unlike card_variants
    # above. related_rule_key is a soft-reference to financial_rules.rule_key
    # (which IS a real UNIQUE column) with no declared FK, matching this
    # codebase's general no-FK-on-reference-tables convention.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT 'General',
        summary TEXT NOT NULL,
        body TEXT NOT NULL,
        related_rule_key TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        see_also_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """)

    # AI Assistant configuration: single-row singleton (enforced by CHECK(id=1)),
    # per-database (not Electron-level settings.json) since the provider/key
    # travels with the financial data it's used to discuss. Off by default
    # (provider='none') — no network call happens anywhere in the app until a
    # user explicitly configures a provider here. api_key is stored in plain
    # text, matching this DB's existing no-encryption-at-rest posture for every
    # other field; the frontend must disclose this explicitly, not silently.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'none',
        endpoint TEXT,
        api_key TEXT,
        model TEXT,
        max_tokens INTEGER NOT NULL DEFAULT 500,
        updated_at TEXT
    )
    """)
    cursor.execute("INSERT OR IGNORE INTO ai_settings (id, provider) VALUES (1, 'none')")

    # Insurance details (satellite table: 1:1 with assets, carries the policy_type sub-type)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS insurance_details (
        asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        policy_type TEXT NOT NULL DEFAULT 'Life',
        policy_number TEXT,
        premium REAL DEFAULT 0.0,
        frequency TEXT DEFAULT 'Yearly',
        renewal_date TEXT,
        sum_assured REAL DEFAULT 0.0,
        surrender_value REAL DEFAULT 0.0,
        sum_insured REAL DEFAULT 0.0,
        claims_made INTEGER DEFAULT 0,
        claims_amount REAL DEFAULT 0.0,
        idv REAL DEFAULT 0.0,
        vehicle_registration TEXT
    )
    """)

    # Holding lots (satellite table: 1:many with assets, for Stock/Mutual Fund purchase lots)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS holding_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        purchase_date TEXT NOT NULL,
        quantity REAL NOT NULL,
        price_per_unit REAL NOT NULL,
        notes TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_holding_lots_asset ON holding_lots(asset_id)")

    # Property rental ledger (satellite table: 1:many with assets, for Property monthly rent/expenses)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS property_rental_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        rent_amount REAL NOT NULL DEFAULT 0.0,
        expenses_amount REAL NOT NULL DEFAULT 0.0,
        notes TEXT,
        UNIQUE(asset_id, month)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_property_rental_ledger_asset ON property_rental_ledger(asset_id)")

    # Floating-rate loans: dated rate changes (and the EMI, when the bank changed it rather
    # than the tenure). previous_rate/previous_emi on the earliest row are the terms before
    # any recorded change. Interest is charged at the rate in force on each date; past
    # ledger entries are never rewritten (main.py loan_terms_on / apply_rate_changes).
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS loan_rate_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        liability_id INTEGER NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
        effective_date TEXT NOT NULL,
        rate REAL NOT NULL,
        emi REAL,
        previous_rate REAL,
        previous_emi REAL,
        note TEXT,
        UNIQUE(liability_id, effective_date)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_loan_rate_changes_liability ON loan_rate_changes(liability_id)")

    # Insurance claims (satellite table: 1:many with assets, individual claim events)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS insurance_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        claim_date TEXT NOT NULL,
        claim_amount REAL NOT NULL DEFAULT 0.0,
        status TEXT DEFAULT 'Filed',
        description TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_insurance_claims_asset ON insurance_claims(asset_id)")

    # Insurance premium payments (satellite table: 1:many with assets, individual payment history)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS insurance_premium_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0.0,
        notes TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_insurance_premium_payments_asset ON insurance_premium_payments(asset_id)")

    # Documents (generic satellite table: attaches uploaded files to any financial
    # entity via a polymorphic reference, same pattern as transactions.source_ref_type/
    # source_ref_id. Files themselves live on disk under <data_dir>/documents/, named
    # by stored_name to avoid collisions/traversal; only the reference lives here.)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_type TEXT NOT NULL CHECK(ref_type IN ('Account', 'Asset', 'Liability', 'Goal')),
        ref_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        mime_type TEXT,
        size_bytes INTEGER,
        description TEXT,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_ref ON documents(ref_type, ref_id)")

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

    # goal_funding_constraints: generalizes the old hardcoded "no_villa_equity" rule
    # into a real, per-goal, DB-configurable "this goal must never be funded from
    # assets in this category" constraint, enforced in decision_engine.py.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS goal_funding_constraints (
        goal_id INTEGER NOT NULL REFERENCES goals(id),
        excluded_category_id INTEGER NOT NULL REFERENCES categories(id),
        PRIMARY KEY(goal_id, excluded_category_id)
    )
    """)

    # Taxation domain (per-person, per-financial-year tax profile + itemized deductions +
    # realized capital-gains log). Regime/HRA inputs live on tax_profiles; itemized 80C/80D/etc
    # entries are a satellite table since each section bundles multiple concurrent instruments.
    # Tax slabs, limits and rates are NOT stored in the database at all — they live in
    # versioned per-financial-year rule sets (backend/tax/rules/*.json) read by
    # backend/tax/engine.py.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        financial_year TEXT NOT NULL,
        regime TEXT NOT NULL DEFAULT 'New' CHECK(regime IN ('Old', 'New')),
        age_band TEXT NOT NULL DEFAULT 'Below60' CHECK(age_band IN ('Below60', '60to80', 'Above80')),
        hra_rent_paid REAL DEFAULT 0.0,
        hra_basic_salary REAL DEFAULT 0.0,
        hra_received REAL DEFAULT 0.0,
        is_metro_city INTEGER NOT NULL DEFAULT 0,
        home_loan_interest_self_occupied REAL DEFAULT 0.0,
        other_income_reported REAL DEFAULT 0.0,
        tds_deducted REAL DEFAULT 0.0,
        advance_tax_paid REAL DEFAULT 0.0,
        notes TEXT,
        UNIQUE(person_id, financial_year)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tax_profiles_person ON tax_profiles(person_id)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_deductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tax_profile_id INTEGER NOT NULL REFERENCES tax_profiles(id) ON DELETE CASCADE,
        section TEXT NOT NULL CHECK(section IN ('80C', '80D', '80CCD1B', '80E', '80G', '80TTA', '24B', 'Other')),
        label TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0.0,
        notes TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tax_deductions_profile ON tax_deductions(tax_profile_id)")

    # Realized capital gains log — one row per Sell event, populated when a Sell transaction
    # is recorded against a Stock/Mutual Fund/Property asset (see main.py's transactions
    # handling). Kept distinct from the on-the-fly estimate computed from holding_lots, since
    # lots are consumed on sale and history would otherwise be unrecoverable for FY reporting.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS capital_gains_realizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
        owner_id INTEGER NOT NULL REFERENCES people(id),
        asset_category TEXT NOT NULL,
        sale_date TEXT NOT NULL,
        financial_year TEXT NOT NULL,
        quantity_sold REAL NOT NULL DEFAULT 0.0,
        sale_value REAL NOT NULL DEFAULT 0.0,
        cost_basis REAL NOT NULL DEFAULT 0.0,
        gain_amount REAL NOT NULL DEFAULT 0.0,
        gain_type TEXT NOT NULL CHECK(gain_type IN ('LTCG', 'STCG')),
        tax_rate_applied REAL DEFAULT 0.0,
        notes TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cgr_asset ON capital_gains_realizations(asset_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cgr_owner_fy ON capital_gains_realizations(owner_id, financial_year)")

    # User-editable tax rule sets (see backend/tax/rule_store.py). Shipped rule sets are
    # read-only JSON files bundled with the app; a user's own sets live here so they
    # travel with the portable database. Each save is a new immutable version row, so a
    # saved scenario's (rule_set_id, version) always resolves to exactly what it used.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_rule_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_set_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        financial_year TEXT NOT NULL,
        name TEXT NOT NULL,
        based_on_rule_set_id TEXT,
        based_on_version INTEGER,
        content_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(rule_set_id, version)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tax_rule_sets_fy ON tax_rule_sets(financial_year)")

    # Which rule set applies to a financial year when a computation doesn't name one.
    # No row = the shipped rule set for that year.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_rule_set_selection (
        financial_year TEXT PRIMARY KEY,
        rule_set_id TEXT NOT NULL
    )
    """)

    # Saved Tax Planner scenarios: immutable snapshots of inputs + the full computed
    # result (with audit trail) + the exact rule set version and content hash used.
    # "Recalculate under current rules" writes a new row pointing back via
    # recalculated_from rather than overwriting history.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        profile_id INTEGER REFERENCES tax_profiles(id) ON DELETE SET NULL,
        financial_year TEXT NOT NULL,
        rule_set_id TEXT NOT NULL,
        rule_set_version INTEGER NOT NULL,
        rule_set_hash TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        recalculated_from INTEGER REFERENCES tax_scenarios(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tax_scenarios_rule_set ON tax_scenarios(rule_set_id)")

    # Tax Planner working state (inputs, year, optimisation), kept in the DB so it travels
    # with the portable .db file. One row per slot; the planner uses 'default'.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_planner_drafts (
        slot TEXT PRIMARY KEY,
        content_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """)

    # Transactions (Normalized schema)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
        source_ref_id INTEGER,
        dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
        dest_ref_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption', 'EMI', 'Prepayment', 'Spend', 'Interest', 'Fee')),
        amount REAL NOT NULL CHECK(amount > 0.0),
        transaction_date TEXT NOT NULL,
        notes TEXT,
        linked_goal_id INTEGER REFERENCES goals(id),
        category_id INTEGER REFERENCES categories(id),
        is_balance_exempt INTEGER NOT NULL DEFAULT 0
    )
    """)

    # transactions gained a category FK (spend categorization for Debit/Credit/Spend
    # rows) and an is_balance_exempt flag after the normalized schema shipped — add
    # them in place for databases created before the columns existed. No CHECK
    # involved, so plain ALTERs suffice (unlike the type/ref-type CHECK expansion
    # further below, which requires a full table rebuild since SQLite can't alter
    # a CHECK in place).
    #
    # is_balance_exempt marks the one synthetic 'Spend' row per credit card used
    # by the "Statement Spend Adjustment" mechanism (see put_credit_card_details
    # and adjust_double_entry_balances) — it must NEVER affect liabilities.
    # outstanding. This is deliberately a real column instead of matching on the
    # free-text `notes` field: the generic entity CRUD route (create_entity/
    # update_entity/serialize_entity_payload) only ever writes columns present in
    # the caller's payload, and the Transactions Ledger UI never sends this field
    # for any transaction type — so a normal user edit structurally cannot change
    # it, unlike `notes`, which the Ledger freely exposes as an editable field. An
    # earlier version of this exemption keyed off exact-match against `notes`
    # text, which turned out to be unsafe in two ways: (1) editing the marker
    # row's own Notes text could silently un-exempt it mid-edit, and (2) once a
    # row's stored notes happened to equal the marker string (however that
    # happened), every future edit/delete of that row would incorrectly skip
    # reverting its real balance impact, permanently. A column the UI never
    # writes closes both failure modes at the source rather than requiring every
    # call site to carefully reason about which of "old" vs "new" notes to trust.
    _ensure_transaction_columns(cursor)

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
                category_id INTEGER REFERENCES categories(id),
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

    # Add owner_id to assets/liabilities (Financial Profile domain) — same NOT NULL +
    # temp-table-rebuild idiom as the accounts migration above, since SQLite can't
    # ALTER TABLE ADD a NOT NULL column with a REFERENCES constraint onto a table that
    # already has rows. Every existing row backfills to owner_id=1 ('Amit', seeded above).
    try:
        cursor.execute("PRAGMA table_info('assets')")
        asset_cols = [row['name'] for row in cursor.fetchall()]
        if 'owner_id' not in asset_cols:
            print("[Migration] Adding owner_id to assets table...")
            cursor.execute("INSERT OR IGNORE INTO people (id, name, role) VALUES (1, 'Amit', 'Primary Owner')")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS assets_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                institution_id INTEGER REFERENCES institutions(id),
                owner_id INTEGER NOT NULL REFERENCES people(id),
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
            cursor.execute("SELECT * FROM assets")
            for a in cursor.fetchall():
                a = dict(a)
                cursor.execute("""
                INSERT OR IGNORE INTO assets_temp
                (id, name, category_id, institution_id, owner_id, purchase_date, current_value, quantity,
                 cost_price, market_value, expected_return, compounding, liquidity, tax_category, risk_level,
                 linked_account_id, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    a['id'], a['name'], a['category_id'], a['institution_id'], 1, a['purchase_date'],
                    a['current_value'], a['quantity'], a['cost_price'], a['market_value'], a['expected_return'],
                    a['compounding'], a['liquidity'], a['tax_category'], a['risk_level'],
                    a['linked_account_id'], a['metadata_json']
                ))
            cursor.execute("DROP TABLE assets")
            cursor.execute("ALTER TABLE assets_temp RENAME TO assets")
            print("[Migration] assets table restructured successfully.")
    except Exception as e:
        print("[Migration Error] assets owner_id migration failed:", e)

    try:
        cursor.execute("PRAGMA table_info('liabilities')")
        liability_owner_cols = [row['name'] for row in cursor.fetchall()]
        if 'owner_id' not in liability_owner_cols:
            print("[Migration] Adding owner_id to liabilities table...")
            cursor.execute("INSERT OR IGNORE INTO people (id, name, role) VALUES (1, 'Amit', 'Primary Owner')")
            # liability_kind (added by a later migration block, "E.") may already exist on
            # this table if init_db() has run before on this database — preserve it if so,
            # rather than silently dropping it during this rebuild.
            has_liability_kind = 'liability_kind' in liability_owner_cols
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS liabilities_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                lender_institution_id INTEGER REFERENCES institutions(id),
                owner_id INTEGER NOT NULL REFERENCES people(id),
                interest_rate REAL DEFAULT 0.0,
                emi REAL DEFAULT 0.0,
                outstanding REAL DEFAULT 0.0,
                tenure_months INTEGER DEFAULT 0,
                compounding TEXT DEFAULT 'Monthly',
                linked_asset_id INTEGER REFERENCES assets(id),
                tax_benefit TEXT DEFAULT 'None',
                metadata_json TEXT,
                liability_kind TEXT DEFAULT 'loan'
            )
            """)
            cursor.execute("SELECT * FROM liabilities")
            for l in cursor.fetchall():
                l = dict(l)
                cursor.execute("""
                INSERT OR IGNORE INTO liabilities_temp
                (id, name, category_id, lender_institution_id, owner_id, interest_rate, emi, outstanding,
                 tenure_months, compounding, linked_asset_id, tax_benefit, metadata_json, liability_kind)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    l['id'], l['name'], l['category_id'], l['lender_institution_id'], 1, l['interest_rate'],
                    l['emi'], l['outstanding'], l['tenure_months'], l['compounding'], l['linked_asset_id'],
                    l['tax_benefit'], l['metadata_json'],
                    l['liability_kind'] if has_liability_kind else 'loan'
                ))
            cursor.execute("DROP TABLE liabilities")
            cursor.execute("ALTER TABLE liabilities_temp RENAME TO liabilities")
            print("[Migration] liabilities table restructured successfully.")
    except Exception as e:
        print("[Migration Error] liabilities owner_id migration failed:", e)

    # Add risk_tolerance to people (simple additive column, nullable-with-default, no rebuild needed)
    try:
        cursor.execute("PRAGMA table_info('people')")
        people_cols = [row['name'] for row in cursor.fetchall()]
        if 'risk_tolerance' not in people_cols:
            cursor.execute("ALTER TABLE people ADD COLUMN risk_tolerance TEXT NOT NULL DEFAULT 'Moderate'")
            print("[Migration] Added risk_tolerance column to people.")
    except Exception as e:
        print("[Migration Warning] people.risk_tolerance column migration error:", e)

    try:
        cursor.execute("PRAGMA table_info('transactions')")
        tx_cols = [row['name'] for row in cursor.fetchall()]
        if 'account_id' in tx_cols or 'source_ref_type' not in tx_cols:
            print("[Migration] Migrating transactions table...")
            # A leftover from an earlier failed attempt is an incomplete copy (the real
            # table is only dropped once the copy succeeds): start again from scratch.
            cursor.execute("DROP TABLE IF EXISTS transactions_temp")
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
                source_ref_id INTEGER,
                dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
                dest_ref_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption', 'EMI', 'Prepayment')),
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

    # Expand transactions.type CHECK to accept 'EMI' and 'Prepayment'. The ledger UI,
    # create_entity's type mapping, and adjust_double_entry_balances all support these,
    # but the original CHECK list omitted them, so every EMI/Prepayment insert failed
    # with a constraint error. SQLite cannot alter a CHECK in place — rebuild the table
    # when the old constraint (identified by the missing 'Prepayment' literal) is found.
    try:
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
        tx_sql_row = cursor.fetchone()
        if tx_sql_row and "'Prepayment'" not in tx_sql_row['sql']:
            print("[Migration] Expanding transactions.type CHECK to include EMI/Prepayment...")
            cursor.execute("DROP TABLE IF EXISTS transactions_checkfix")  # incomplete copy from a failed run
            cursor.execute("""
            CREATE TABLE transactions_checkfix (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
                source_ref_id INTEGER,
                dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
                dest_ref_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption', 'EMI', 'Prepayment')),
                amount REAL NOT NULL CHECK(amount > 0.0),
                transaction_date TEXT NOT NULL,
                notes TEXT,
                linked_goal_id INTEGER REFERENCES goals(id)
            )
            """)
            cursor.execute("""
            INSERT INTO transactions_checkfix (id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, linked_goal_id)
            SELECT id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, linked_goal_id FROM transactions
            """)
            cursor.execute("DROP TABLE transactions")
            cursor.execute("ALTER TABLE transactions_checkfix RENAME TO transactions")
            print("[Migration] transactions.type CHECK expanded successfully.")
    except Exception as e:
        print("[Migration Warning] transactions CHECK expansion failed:", e)

    # Expand transactions CHECKs again to accept a 'Spend' type (a credit card charge
    # that INCREASES liabilities.outstanding — the only transaction type that does;
    # EMI/Prepayment are the only other ledger entries touching outstanding, and they
    # decrease it) and a first-class 'Liability' ref-type. EMI/Prepayment previously
    # targeted a liability only via an untyped bypass (dest_ref_type='None' with a bare
    # dest_ref_id) since 'Liability' was never a legal ref-type value — backfill their
    # dest_ref_type to 'Liability' in this same rebuild (the only way to touch a CHECK
    # in SQLite is a full rebuild, so doing this alongside the 'Spend' addition is
    # nearly free and avoids two different untyped/typed conventions for the same
    # physical mutation existing side by side). category_id/is_balance_exempt
    # already exist on the table by this point (added earlier, unconditionally,
    # above) so they're carried through unchanged here — this rebuild only
    # touches the CHECK-constrained columns.
    # The legacy rebuilds above recreate the table without category_id/is_balance_exempt,
    # which this rebuild copies: make sure they exist (on an old database they were just dropped).
    _ensure_transaction_columns(cursor)
    try:
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
        tx_sql_row = cursor.fetchone()
        if tx_sql_row and "'Spend'" not in tx_sql_row['sql']:
            print("[Migration] Expanding transactions CHECKs for Spend/Liability, backfilling EMI/Prepayment dest_ref_type...")
            cursor.execute("DROP TABLE IF EXISTS transactions_checkfix2")  # incomplete copy from a failed run
            cursor.execute("""
            CREATE TABLE transactions_checkfix2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
                source_ref_id INTEGER,
                dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
                dest_ref_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption', 'EMI', 'Prepayment', 'Spend')),
                amount REAL NOT NULL CHECK(amount > 0.0),
                transaction_date TEXT NOT NULL,
                notes TEXT,
                linked_goal_id INTEGER REFERENCES goals(id),
                category_id INTEGER REFERENCES categories(id),
                is_balance_exempt INTEGER NOT NULL DEFAULT 0
            )
            """)
            cursor.execute("""
            INSERT INTO transactions_checkfix2
                (id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, linked_goal_id, category_id, is_balance_exempt)
            SELECT id, source_ref_type, source_ref_id,
                   CASE WHEN type IN ('EMI', 'Prepayment') AND dest_ref_type = 'None' THEN 'Liability' ELSE dest_ref_type END,
                   dest_ref_id, type, amount, transaction_date, notes, linked_goal_id, category_id, is_balance_exempt
            FROM transactions
            """)
            cursor.execute("DROP TABLE transactions")
            cursor.execute("ALTER TABLE transactions_checkfix2 RENAME TO transactions")
            print("[Migration] transactions Spend/Liability CHECK expansion complete.")
    except Exception as e:
        print("[Migration Warning] transactions Spend/Liability CHECK expansion failed:", e)

    # Expand transactions.type for the loan charge labels 'Interest' and 'Fee' (MMEX-style
    # loan accounts: interest is charged to the loan each month, the EMI is a transfer that
    # pays it down). Behaviour comes from direction, not type (adjust_double_entry_balances),
    # so this only widens the allowed labels. Same rebuild pattern as above.
    try:
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
        tx_sql_row = cursor.fetchone()
        if tx_sql_row and "'Interest'" not in tx_sql_row['sql']:
            print("[Migration] Expanding transactions.type CHECK for Interest/Fee...")
            cursor.execute("DROP TABLE IF EXISTS transactions_checkfix3")  # incomplete copy from a failed run
            cursor.execute("""
            CREATE TABLE transactions_checkfix3 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
                source_ref_id INTEGER,
                dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'Liability', 'None')),
                dest_ref_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption', 'EMI', 'Prepayment', 'Spend', 'Interest', 'Fee')),
                amount REAL NOT NULL CHECK(amount > 0.0),
                transaction_date TEXT NOT NULL,
                notes TEXT,
                linked_goal_id INTEGER REFERENCES goals(id),
                category_id INTEGER REFERENCES categories(id),
                is_balance_exempt INTEGER NOT NULL DEFAULT 0
            )
            """)
            cursor.execute("""
            INSERT INTO transactions_checkfix3
                (id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, linked_goal_id, category_id, is_balance_exempt)
            SELECT id, source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, linked_goal_id, category_id, is_balance_exempt
            FROM transactions
            """)
            cursor.execute("DROP TABLE transactions")
            cursor.execute("ALTER TABLE transactions_checkfix3 RENAME TO transactions")
            print("[Migration] transactions Interest/Fee CHECK expansion complete.")
    except Exception as e:
        print("[Migration Warning] transactions Interest/Fee CHECK expansion failed:", e)

    cursor.execute("PRAGMA foreign_keys = ON")


    # EMI Tool saved profiles (/api/settings/emi-profiles). Dropped from init_db() by the
    # metadata-driven refactor while the routes still used it, so saving a profile failed
    # on every database; restored with its original columns.
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
        ('Asset', 'Mutual Fund', json.dumps([{"name": "ticker", "type": "text", "label": "Scheme Code"}])),
        ('Asset', 'Stock', json.dumps([{"name": "ticker", "type": "text", "label": "Ticker Symbol"}])),
        ('Asset', 'Gold', None),
        ('Asset', 'EPF', json.dumps(EPF_FIELDS_DEFINITION)),
        ('Asset', 'PPF', None),
        ('Asset', 'NPS', None),
        ('Asset', 'Fixed Deposit', json.dumps([{"name": "duration_months", "type": "number", "label": "Duration (Months)"}])),
        ('Asset', 'Bond', json.dumps([{"name": "coupon_rate", "type": "number", "label": "Coupon Rate (%)"}])),
        ('Asset', 'Property', json.dumps([{"name": "rental_income", "type": "number", "label": "Rental Income"}, {"name": "maintenance_expenses", "type": "number", "label": "Maintenance Expenses"}])),
        # Insurance sub-type (Life/Term/Health/Vehicle) and type-specific fields live in insurance_details, not here.
        ('Asset', 'Insurance', None),
        # Liabilities
        ('Liability', 'Home Loan', None),
        ('Liability', 'Personal Loan', None),
        # Credit card fields (credit_limit, statement_date, due_date, etc.) live in credit_card_details, not here.
        ('Liability', 'Credit Card', None),
        ('Liability', 'Car Loan', None),
        # Income
        # Gross is the entry's amount (what the Tax Planner needs); take-home is what
        # Cash Flow Planning's monthly log records as "net salary".
        ('Income', 'Salary', json.dumps(SALARY_FIELDS_DEFINITION)),
        ('Income', 'Bonus', None),
        ('Income', 'Rental', None),
        ('Income', 'Dividend', None),
        ('Income', 'Interest', None),
        # Expenses. Grocery/Fuel/Travel/Utility double as the credit card reward
        # engine's spend categories (category_rules_json matches by this same name)
        # — General/Dining/Rent/Online Shopping are seeded here for that reason,
        # not because they're typical monthly-budget categories on their own.
        ('Expense', 'Grocery', None),
        ('Expense', 'Fuel', None),
        ('Expense', 'Education', None),
        ('Expense', 'Travel', None),
        ('Expense', 'Utility', None),
        ('Expense', 'EMI', None),
        ('Expense', 'General', None),
        ('Expense', 'Dining', None),
        ('Expense', 'Rent', None),
        ('Expense', 'Online Shopping', None),
    ]

    for entity_type, name, fields in default_categories:
        cursor.execute("""
        INSERT OR IGNORE INTO categories (entity_type, name, fields_definition)
        VALUES (?, ?, ?)
        """, (entity_type, name, fields))

    # Rewrite fields_definition for existing installs still holding the pre-satellite-table inline
    # field defs, now that Insurance/Credit Card/Mutual Fund type-specific fields live in
    # insurance_details/credit_card_details. Guarded so custom fields_definition edits aren't clobbered.
    try:
        cursor.execute("SELECT id, fields_definition FROM categories WHERE name = 'Insurance' AND entity_type = 'Asset'")
        row = cursor.fetchone()
        if row and row['fields_definition'] and '"policy_number"' in row['fields_definition']:
            cursor.execute("UPDATE categories SET fields_definition = NULL WHERE id = ?", (row['id'],))

        cursor.execute("SELECT id, fields_definition FROM categories WHERE name = 'Credit Card' AND entity_type = 'Liability'")
        row = cursor.fetchone()
        if row and row['fields_definition'] and '"credit_limit"' in row['fields_definition']:
            cursor.execute("UPDATE categories SET fields_definition = NULL WHERE id = ?", (row['id'],))

        cursor.execute("SELECT id, fields_definition FROM categories WHERE name = 'Mutual Fund' AND entity_type = 'Asset'")
        row = cursor.fetchone()
        if row and row['fields_definition'] and '"units"' in row['fields_definition']:
            cursor.execute(
                "UPDATE categories SET fields_definition = ? WHERE id = ?",
                (json.dumps([{"name": "ticker", "type": "text", "label": "Scheme Code"}]), row['id'])
            )
    except Exception as e:
        print("[Migration Warning] categories.fields_definition rewrite error:", e)

    default_rules = [
        ("min_emergency_fund", "Minimum Emergency Fund", "Never reduce Emergency Fund below this value", 1500000.0, "Emergency Fund", 1),
        ("insurance_reserve_target", "Insurance Reserve Target", "Insurance Reserve should remain at this value", 300000.0, "Insurance", 1),
        ("debt_free_liquidity_target", "Debt-Free Liquidity Target", "Maintain this liquidity after becoming debt-free", 3000000.0, "Liquidity", 1),
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

    # Legacy Taxation-domain scalar limits. Superseded by the versioned tax rule sets in
    # backend/tax/rules/*.json: the tax engine no longer reads any of these keys. The rows
    # are still seeded and kept (not deleted) because knowledge_articles soft-reference
    # some of them via related_rule_key, and existing installs may have user edits.
    default_tax_rules = [
        ("section_80c_limit", "Section 80C Deduction Limit", "Combined annual cap for 80C investments (PPF/ELSS/life insurance/etc.)", 150000.0, "Taxation", 1),
        ("section_80d_self_limit", "Section 80D Limit (Self/Family, Non-Senior)", "Health insurance premium deduction cap, self/family under 60", 25000.0, "Taxation", 1),
        ("section_80d_parents_limit", "Section 80D Limit (Parents, Non-Senior)", "Health insurance premium deduction cap for non-senior parents", 25000.0, "Taxation", 1),
        ("section_80d_senior_limit", "Section 80D Limit (Senior Citizen)", "Health insurance premium deduction cap when insured is 60+", 50000.0, "Taxation", 1),
        ("standard_deduction_salaried", "Standard Deduction (Salaried)", "Flat deduction against salary income, both regimes", 75000.0, "Taxation", 1),
        ("section_87a_rebate_limit_new", "Section 87A Rebate Threshold (New Regime)", "Taxable income up to which tax is fully rebated under the new regime", 700000.0, "Taxation", 1),
        ("section_87a_rebate_limit_old", "Section 87A Rebate Threshold (Old Regime)", "Taxable income up to which tax is fully rebated under the old regime", 500000.0, "Taxation", 1),
        ("equity_ltcg_exemption", "Equity LTCG Annual Exemption", "Annual exempt amount of LTCG on listed equity/equity MFs before tax applies", 125000.0, "Taxation", 1),
        ("equity_stcg_rate", "Equity STCG Tax Rate (%)", "Flat tax rate on short-term capital gains from listed equity/equity MFs", 20.0, "Taxation", 1),
        ("equity_ltcg_rate", "Equity LTCG Tax Rate (%)", "Flat tax rate on long-term capital gains from listed equity/equity MFs above exemption", 12.5, "Taxation", 1),
        ("property_ltcg_rate", "Property LTCG Tax Rate (%)", "Flat tax rate on long-term capital gains from property (without indexation, current rules)", 12.5, "Taxation", 1),
        ("hra_metro_percentage", "HRA Metro Exemption Percentage", "Percentage of basic salary used in HRA exemption calc for metro cities", 50.0, "Taxation", 1),
        ("hra_nonmetro_percentage", "HRA Non-Metro Exemption Percentage", "Percentage of basic salary used in HRA exemption calc for non-metro cities", 40.0, "Taxation", 1),
    ]
    for rule_key, rule_name, desc, val, cat, enabled in default_tax_rules:
        cursor.execute("""
        INSERT OR IGNORE INTO financial_rules (rule_key, rule_name, description, value, category, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (rule_key, rule_name, desc, val, cat, enabled))
    # Say so on every row, new or existing, so editing one in Settings > Financial Rules
    # isn't mistaken for changing a tax calculation. Guarded on the prefix so it's a
    # no-op once applied (and never clobbers a description twice).
    cursor.execute(f"""
        UPDATE financial_rules
        SET description = ? || description
        WHERE rule_key IN ({", ".join("?" for _ in default_tax_rules)})
          AND description NOT LIKE ?
    """, [TAX_RULE_SUPERSEDED_PREFIX] + [r[0] for r in default_tax_rules] + [TAX_RULE_SUPERSEDED_PREFIX + "%"])

    # Remove the old hardcoded no_villa_equity rule for existing installs — superseded
    # by the generic goal_funding_constraints table (see below). Naturally idempotent:
    # a second run deletes zero rows.
    try:
        cursor.execute("DELETE FROM financial_rules WHERE rule_key = 'no_villa_equity'")
    except Exception as e:
        print("[Migration Warning] no_villa_equity rule removal error:", e)

    # Card Library starter catalogue. Indicative terms only, not fetched from any live
    # source — verify current offers with the issuer before applying. Seeded ONLY when
    # the card_variants table was just created (see card_variants_table_existed above):
    # blind INSERT OR IGNORE on every startup would re-inject starter cards the user
    # has since deleted or renamed (docs/memory.md, "Database Seeding Safety").
    source_note = "Indicative terms, verify current offer with issuer before applying — Artha does not fetch live card data."
    default_card_variants = [
        {
            "name": "HDFC Infinia (Metal)", "issuer": "HDFC Bank", "network": "Visa", "card_tier": "Super-Premium",
            "joining_fee": 12500.0, "annual_fee": 12500.0, "fee_waiver_spend": 1000000.0,
            "base_points": 5.0, "base_spend": 150.0, "point_value": 1.0,
            "lounge_visits_domestic": 99, "lounge_visits_international": 99,
            "eligibility_notes": "By-invitation or high income/relationship value.",
            # Travel demonstrates a real-world simultaneous daily + monthly cap (both
            # 15,000 pts, matching HDFC Infinia's actual SmartBuy accelerated-rewards
            # terms) — resolve_reward_rate applies the tighter of monthlyCapPoints and
            # every caps[] entry. groupLabel documents that this ceiling is part of a
            # bank-stated shared pool; it's not enforced across categories (see
            # resolve_reward_rate's docstring for why).
            "category_rules_json": json.dumps([
                {"category": "Travel", "multiplier": 5, "isExcluded": False, "monthlyCapPoints": 15000,
                 "caps": [{"capPoints": 15000, "period": "daily", "groupLabel": "SmartBuy Accelerated Rewards"}]},
                {"category": "Dining", "multiplier": 5, "isExcluded": False, "monthlyCapPoints": 5000},
                {"category": "Fuel", "multiplier": 0, "isExcluded": True},
                {"category": "Rent", "multiplier": 0, "isExcluded": True},
                {"category": "Utilities", "multiplier": 1, "isExcluded": False},
            ]),
            "milestone_rules_json": "[]",
            # pointValue demonstrates redemption-channel-specific valuation: airline/hotel
            # transfer partners are worth the full ₹1/point base rate, while redeeming
            # for cashback/statement credit is worth less — the same point, different
            # value depending on how it's redeemed.
            "redemption_partners_json": json.dumps([
                {"partnerName": "Club Vistara (1:1)", "transferRatio": 1.0, "pointValue": 1.0},
                {"partnerName": "KrisFlyer Singapore (1:1)", "transferRatio": 1.0, "pointValue": 1.0},
                {"partnerName": "Cashback / Statement Credit", "transferRatio": 1.0, "pointValue": 0.5},
            ]),
            "pros_json": json.dumps(["Uncapped lounge access", "Strong travel transfer partners", "High base reward rate"]),
            "cons_json": json.dumps(["High joining/annual fee", "Invite-only for most applicants"]),
        },
        {
            "name": "Axis Magnus", "issuer": "Axis Bank", "network": "Visa", "card_tier": "Super-Premium",
            "joining_fee": 12500.0, "annual_fee": 12500.0, "fee_waiver_spend": 2500000.0,
            "base_points": 12.0, "base_spend": 200.0, "point_value": 0.40,
            "lounge_visits_domestic": 8, "lounge_visits_international": 8,
            "eligibility_notes": "High income bracket typically required.",
            "category_rules_json": json.dumps([
                {"category": "Travel", "multiplier": 5, "isExcluded": False, "monthlyCapPoints": 20000},
                {"category": "Fuel", "multiplier": 0, "isExcluded": True},
                {"category": "Rent", "multiplier": 0, "isExcluded": True},
                {"category": "Insurance", "multiplier": 0, "isExcluded": True},
                {"category": "Utilities", "multiplier": 0, "isExcluded": True},
            ]),
            "milestone_rules_json": json.dumps([{"spendThreshold": 150000, "bonusPointsRate": 35, "pointsPerSpend": 200}]),
            "redemption_partners_json": json.dumps([
                {"partnerName": "Singapore Airlines (5:2)", "transferRatio": 0.4},
                {"partnerName": "ITC Club (5:2)", "transferRatio": 0.4},
            ]),
            "pros_json": json.dumps(["Step-up milestone rewards", "Good lounge access", "Strong travel partners"]),
            "cons_json": json.dumps(["High annual fee", "Several category exclusions"]),
        },
        {
            "name": "SBI Card ELITE", "issuer": "SBI", "network": "Mastercard", "card_tier": "Premium",
            "joining_fee": 4999.0, "annual_fee": 4999.0, "fee_waiver_spend": 1000000.0,
            "base_points": 2.0, "base_spend": 100.0, "point_value": 0.25,
            "lounge_visits_domestic": 8, "lounge_visits_international": 6,
            "eligibility_notes": "Mid-to-high income bracket.",
            "category_rules_json": json.dumps([
                {"category": "Dining", "multiplier": 5, "isExcluded": False},
                {"category": "Fuel", "multiplier": 0, "isExcluded": True},
            ]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Movie voucher milestones", "Reasonable fee for the tier"]),
            "cons_json": json.dumps(["Lower base reward rate than Super-Premium peers"]),
        },
        {
            "name": "HDFC Regalia Gold", "issuer": "HDFC Bank", "network": "Visa", "card_tier": "Mid",
            "joining_fee": 2500.0, "annual_fee": 2500.0, "fee_waiver_spend": 400000.0,
            "base_points": 4.0, "base_spend": 150.0, "point_value": 0.50,
            "lounge_visits_domestic": 8, "lounge_visits_international": 6,
            "eligibility_notes": "Salaried/self-employed, moderate income.",
            "category_rules_json": json.dumps([
                {"category": "Dining", "multiplier": 4, "isExcluded": False},
                {"category": "Groceries", "multiplier": 4, "isExcluded": False},
            ]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Accessible fee waiver threshold", "Solid dining/groceries rate"]),
            "cons_json": json.dumps(["Lounge access lower than Super-Premium tier"]),
        },
        {
            "name": "ICICI Amazon Pay", "issuer": "ICICI Bank", "network": "Visa", "card_tier": "Entry",
            "joining_fee": 0.0, "annual_fee": 0.0, "fee_waiver_spend": 0.0,
            "base_points": 1.0, "base_spend": 100.0, "point_value": 1.0,
            "lounge_visits_domestic": 0, "lounge_visits_international": 0,
            "eligibility_notes": "Amazon Prime membership required for the top-tier cashback rate.",
            "category_rules_json": json.dumps([
                {"category": "Amazon", "multiplier": 5, "isExcluded": False},
                {"category": "Bill Payments", "multiplier": 2, "isExcluded": False},
                {"category": "Others", "multiplier": 1, "isExcluded": False},
            ]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Lifetime free", "Direct cashback, no point conversion"]),
            "cons_json": json.dumps(["No lounge access", "Best rate tied to Amazon spend"]),
        },
        {
            "name": "Amex Membership Rewards (Gold Card)", "issuer": "American Express", "network": "Amex", "card_tier": "Mid",
            "joining_fee": 1000.0, "annual_fee": 4500.0, "fee_waiver_spend": 190000.0,
            "base_points": 1.0, "base_spend": 50.0, "point_value": 0.50,
            "lounge_visits_domestic": 0, "lounge_visits_international": 0,
            "eligibility_notes": "Amex acceptance is narrower than Visa/Mastercard in India.",
            "category_rules_json": "[]",
            "milestone_rules_json": json.dumps([{"spendThreshold": 190000, "bonusPointsRate": 1, "pointsPerSpend": 50}]),
            "redemption_partners_json": json.dumps([{"partnerName": "British Airways (1:1)", "transferRatio": 1.0}]),
            "pros_json": json.dumps(["Strong airline transfer partners", "Milestone bonus points"]),
            "cons_json": json.dumps(["Limited merchant acceptance", "No lounge access"]),
        },
        {
            "name": "SBI Cashback Card", "issuer": "SBI", "network": "Visa", "card_tier": "Entry",
            "joining_fee": 999.0, "annual_fee": 999.0, "fee_waiver_spend": 200000.0,
            "base_points": 1.0, "base_spend": 100.0, "point_value": 1.0,
            "lounge_visits_domestic": 0, "lounge_visits_international": 0,
            "eligibility_notes": "Broad eligibility, entry-level income accepted.",
            "category_rules_json": json.dumps([
                {"category": "Online Spends", "multiplier": 5, "isExcluded": False},
                {"category": "Offline Spends", "multiplier": 1, "isExcluded": False},
            ]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Flat cashback, no redemption complexity", "Accessible fee waiver"]),
            "cons_json": json.dumps(["No lounge access", "Lower rate on offline spends"]),
        },
        {
            "name": "Axis Ace", "issuer": "Axis Bank", "network": "Visa", "card_tier": "Entry",
            "joining_fee": 499.0, "annual_fee": 499.0, "fee_waiver_spend": 200000.0,
            "base_points": 1.5, "base_spend": 100.0, "point_value": 1.0,
            "lounge_visits_domestic": 0, "lounge_visits_international": 0,
            "eligibility_notes": "Entry-level income accepted.",
            "category_rules_json": json.dumps([
                {"category": "Bill Payments (Google Pay)", "multiplier": 5, "isExcluded": False},
                {"category": "Others", "multiplier": 1.5, "isExcluded": False},
            ]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Low fee", "Strong bill-payment cashback"]),
            "cons_json": json.dumps(["No lounge access", "Best rate requires a specific payment app"]),
        },
        {
            "name": "HSBC Premier Metal", "issuer": "HSBC", "network": "Mastercard", "card_tier": "Premium",
            "joining_fee": 0.0, "annual_fee": 20000.0, "fee_waiver_spend": 0.0,
            "base_points": 3.0, "base_spend": 100.0, "point_value": 0.25,
            "lounge_visits_domestic": 12, "lounge_visits_international": 12,
            "eligibility_notes": "Requires HSBC Premier relationship (minimum relationship balance) — fee waiver is relationship-based, not spend-based.",
            "category_rules_json": "[]",
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Strong lounge access", "Premium banking relationship perks"]),
            "cons_json": json.dumps(["High annual fee if relationship balance not maintained", "Fewer category multipliers"]),
        },
        {
            "name": "IDFC FIRST Wealth", "issuer": "IDFC FIRST Bank", "network": "Visa", "card_tier": "Mid",
            "joining_fee": 0.0, "annual_fee": 0.0, "fee_waiver_spend": 0.0,
            "base_points": 3.0, "base_spend": 100.0, "point_value": 0.25,
            "lounge_visits_domestic": 8, "lounge_visits_international": 8,
            "eligibility_notes": "Lifetime free, moderate income bracket.",
            "category_rules_json": json.dumps([{"category": "Select Categories", "multiplier": 10, "isExcluded": False}]),
            "milestone_rules_json": "[]",
            "redemption_partners_json": "[]",
            "pros_json": json.dumps(["Lifetime free card", "Good lounge access for a no-fee card"]),
            "cons_json": json.dumps(["Higher category multiplier limited to select spends"]),
        },
    ]
    if not card_variants_table_existed:
        for v in default_card_variants:
            cursor.execute("""
            INSERT OR IGNORE INTO card_variants
            (name, issuer, network, card_tier, joining_fee, annual_fee, fee_waiver_spend,
             base_points, base_spend, point_value, lounge_visits_domestic, lounge_visits_international,
             eligibility_notes, category_rules_json, milestone_rules_json, redemption_partners_json,
             pros_json, cons_json, is_seeded, source_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (
                v["name"], v["issuer"], v["network"], v["card_tier"], v["joining_fee"], v["annual_fee"], v["fee_waiver_spend"],
                v["base_points"], v["base_spend"], v["point_value"], v["lounge_visits_domestic"], v["lounge_visits_international"],
                v["eligibility_notes"], v["category_rules_json"], v["milestone_rules_json"], v["redemption_partners_json"],
                v["pros_json"], v["cons_json"], source_note
            ))
        print(f"[Seed] Card Library starter catalogue seeded ({len(default_card_variants)} variants).")

    # Knowledge Base starter content. Plain-language explainers, not tax/legal advice —
    # numeric thresholds live in financial_rules/calculations.py; these articles explain
    # the underlying concept. related_rule_key softly links an article to a financial_rules
    # row for Settings' info-icon hints; articles without a natural single rule (general
    # literacy concepts) leave it null.
    default_knowledge_articles = [
        {
            "slug": "emergency-fund-sizing", "title": "Why an Emergency Fund Target", "topic": "Financial Rules",
            "related_rule_key": "min_emergency_fund",
            "summary": "An emergency fund is a cash buffer sized to cover months of expenses so a job loss or crisis never forces you to sell investments or take on debt.",
            "body": (
                "An emergency fund is money set aside specifically to cover unavoidable expenses during a period of "
                "lost or disrupted income — a job loss, medical event, or urgent repair — without needing to sell "
                "investments, break a fixed deposit early, or take on high-interest debt at the worst possible moment.\n\n"
                "The size of the fund matters more than where it sits. Too small, and a genuine emergency still forces "
                "you into debt or a forced sale at a bad time. Too large, and you are holding cash that could be earning "
                "inflation-beating returns elsewhere — emergency funds are typically kept in low-return, highly liquid "
                "instruments (savings accounts, liquid mutual funds) by design, so oversizing it has a real opportunity cost.\n\n"
                "Artha's rule treats this as a hard floor: recommendations will flag any plan that dips below it, and "
                "treat further investing as lower-priority than rebuilding this buffer first. The target itself is a "
                "judgment call based on your expense stability and job security — adjust it in Settings if your "
                "circumstances differ from the shipped default."
            ),
            "tags": ["emergency-fund", "liquidity"], "see_also": ["debt-free-liquidity-target", "prepayment-liquidity-buffer"],
        },
        {
            "slug": "insurance-reserve-target", "title": "What an Insurance Reserve Covers", "topic": "Financial Rules",
            "related_rule_key": "insurance_reserve_target",
            "summary": "A dedicated insurance reserve keeps premium payments and claim gaps from competing with your other savings goals.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["insurance"], "see_also": ["insurance-renewal-alerts"],
        },
        {
            "slug": "debt-free-liquidity-target", "title": "Liquidity Targets After Becoming Debt-Free", "topic": "Financial Rules",
            "related_rule_key": "debt_free_liquidity_target",
            "summary": "Once loans are paid off, holding a higher liquidity buffer protects the freed-up cash flow from being over-committed too quickly.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["liquidity", "debt"], "see_also": ["emergency-fund-sizing"],
        },
        {
            "slug": "loan-prepayment-roi-threshold", "title": "The ROI Threshold for Prepaying a Loan", "topic": "Financial Rules",
            "related_rule_key": "high_interest_roi_threshold",
            "summary": "Prepaying a loan is a guaranteed return equal to its interest rate — so it usually beats investing when the loan's ROI is above what you could safely earn elsewhere.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["loans", "prepayment"], "see_also": ["prepayment-liquidity-buffer", "emi-amortization-basics"],
        },
        {
            "slug": "prepayment-liquidity-buffer", "title": "Why Prepayments Need a Liquidity Buffer", "topic": "Financial Rules",
            "related_rule_key": "prepayment_min_liquid_buffer",
            "summary": "Prepaying a loan is irreversible, so a minimum liquid buffer above your emergency fund prevents a prepayment from leaving you cash-poor.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["loans", "prepayment", "liquidity"], "see_also": ["loan-prepayment-roi-threshold"],
        },
        {
            "slug": "insurance-renewal-alerts", "title": "Insurance Renewal Alert Windows", "topic": "Financial Rules",
            "related_rule_key": "insurance_renewal_alert_days",
            "summary": "A renewal alert window gives you enough lead time to arrange premium payment before a policy lapses and coverage gaps open up.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["insurance"], "see_also": ["insurance-reserve-target"],
        },
        {
            "slug": "target-savings-rate", "title": "What Savings Rate Should You Target", "topic": "Financial Rules",
            "related_rule_key": "target_savings_rate",
            "summary": "Savings rate — the share of income you save rather than spend — is a single number that predicts long-term financial security better than income alone.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["cash-flow", "savings"], "see_also": [],
        },
        {
            "slug": "section-80c-explained", "title": "Section 80C Deductions Explained", "topic": "Tax Concepts",
            "related_rule_key": "section_80c_limit",
            "summary": "Section 80C lets you deduct combined investments like PPF, ELSS, and life insurance premiums up to an annual cap, lowering taxable income under the old regime.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "deductions"], "see_also": ["section-80d-explained", "old-vs-new-tax-regime"],
        },
        {
            "slug": "section-80d-explained", "title": "Section 80D: Health Insurance Deductions", "topic": "Tax Concepts",
            "related_rule_key": "section_80d_self_limit",
            "summary": "Section 80D gives separate deduction caps for health insurance premiums on yourself/family and on parents, with higher limits for senior citizens.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "deductions", "insurance"], "see_also": ["section-80c-explained"],
        },
        {
            "slug": "standard-deduction-explained", "title": "The Standard Deduction for Salaried Income", "topic": "Tax Concepts",
            "related_rule_key": "standard_deduction_salaried",
            "summary": "The standard deduction is a flat, no-proof-required deduction against salary income available in both the old and new tax regimes.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "deductions"], "see_also": ["old-vs-new-tax-regime"],
        },
        {
            "slug": "section-87a-rebate-explained", "title": "Section 87A Rebate: Zero Tax Up To a Threshold", "topic": "Tax Concepts",
            "related_rule_key": "section_87a_rebate_limit_new",
            "summary": "Section 87A fully rebates tax if your taxable income falls under a threshold that differs between the old and new regimes.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "rebate"], "see_also": ["old-vs-new-tax-regime"],
        },
        {
            "slug": "old-vs-new-tax-regime", "title": "Old vs New Tax Regime, Conceptually", "topic": "Tax Concepts",
            "related_rule_key": None,
            "summary": "The old regime trades a lower deduction set for higher effective rates below certain incomes; the new regime offers lower slab rates but forfeits most exemptions — which one wins depends on how much you actually claim, not just income level.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "regime"], "see_also": ["section-80c-explained", "standard-deduction-explained", "section-87a-rebate-explained"],
        },
        {
            "slug": "ltcg-vs-stcg", "title": "LTCG vs STCG: Why Holding Period Changes Your Tax", "topic": "Tax Concepts",
            "related_rule_key": "equity_ltcg_exemption",
            "summary": "Capital gains are taxed differently depending on how long you held the asset before selling — long-term gains get a lower rate and an annual exemption, short-term gains don't.",
            "body": (
                "Capital gains tax in India depends heavily on how long you held an asset before selling it, not just "
                "how much profit you made. Sell an equity share or equity mutual fund within 12 months and the gain is "
                "Short-Term Capital Gains (STCG), taxed at a flat rate. Hold it longer and the gain becomes Long-Term "
                "Capital Gains (LTCG), taxed at a lower flat rate — and only above an annual exempt amount, meaning a "
                "modest amount of long-term gains every year is tax-free entirely.\n\n"
                "This asymmetry is deliberate policy: it rewards patient, long-horizon investing over frequent trading. "
                "It also means the same rupee amount of gain can have a meaningfully different tax bill purely based on "
                "timing — selling one day before versus one day after the 12-month mark can change which rate and which "
                "exemption apply.\n\n"
                "Artha's Taxation screen calculates your actual STCG/LTCG split and tax from your realized sales; this "
                "article only explains the concept. The exact current thresholds and rates are configurable under "
                "Settings > Financial Rules, since tax law changes with each Finance Act."
            ),
            "tags": ["tax", "capital-gains", "investments"], "see_also": ["xirr-explained"],
        },
        {
            "slug": "hra-exemption-explained", "title": "How HRA Exemption Is Calculated", "topic": "Tax Concepts",
            "related_rule_key": "hra_metro_percentage",
            "summary": "HRA exemption is the smallest of three amounts — actual HRA received, rent paid minus 10% of salary, and a metro/non-metro percentage of salary.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["tax", "hra"], "see_also": ["old-vs-new-tax-regime"],
        },
        {
            "slug": "xirr-explained", "title": "XIRR: Measuring Returns on Irregular Investments", "topic": "Investment Basics",
            "related_rule_key": None,
            "summary": "XIRR (Extended Internal Rate of Return) is the annualized return of an investment that had multiple cash flows at different dates and amounts, unlike CAGR which assumes one lump sum.",
            "body": (
                "Most return metrics assume a single lump sum invested once and withdrawn once — CAGR, for instance. "
                "But real portfolios rarely work that way: you add a SIP installment every month, top up a mutual fund "
                "occasionally, or withdraw partial amounts. XIRR (Extended Internal Rate of Return) handles exactly "
                "this — it finds the single annualized rate of return that would make all of your actual cash flows, "
                "in and out, on their actual dates, net to zero.\n\n"
                "This is why two investments with the same \"current value\" can have very different XIRRs: an "
                "investment that grew steadily from a large initial lump sum shows a lower XIRR than one that grew the "
                "same amount from small, more recent contributions, because the second one had less time for its money "
                "to compound.\n\n"
                "A common misreading is comparing XIRR directly to a fixed deposit rate as if they were the same kind "
                "of number — they're both annualized percentages, but XIRR is backward-looking and portfolio-specific, "
                "not a guaranteed forward rate. Use it to judge how a specific holding has performed given your actual "
                "contribution pattern, not as a promise of future returns."
            ),
            "tags": ["investments", "returns"], "see_also": ["ltcg-vs-stcg"],
        },
        {
            "slug": "emi-amortization-basics", "title": "EMI and Amortization Basics", "topic": "Credit & Loans",
            "related_rule_key": None,
            "summary": "Every EMI is split into an interest portion and a principal portion, and that split shifts toward principal over the loan's life — which is why early prepayments save more interest than later ones.",
            "body": "[2-4 paragraph plain-language explainer: what it means, why it matters, one common misconception or tradeoff. No numeric formulas duplicating calculations.py — this is conceptual, not computational.]",
            "tags": ["loans", "emi"], "see_also": ["loan-prepayment-roi-threshold"],
        },
    ]
    for a in default_knowledge_articles:
        cursor.execute("""
        INSERT OR IGNORE INTO knowledge_articles
        (slug, title, topic, summary, body, related_rule_key, tags_json, see_also_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            a["slug"], a["title"], a["topic"], a["summary"], a["body"], a["related_rule_key"],
            json.dumps(a["tags"]), json.dumps(a["see_also"])
        ))

    conn.commit()

    # 4. RUN AUTOMATED LEGACY DATA MIGRATION
    # Check if legacy tables exist. If they do, migrate them to new metadata structure.

    # A0. Self-heal: restore accounts stranded in accounts_old. A previous version of
    # migration A matched the normalized schema too (it also lacks metadata_json), renamed
    # the healthy accounts table to accounts_old, then crashed reading the legacy
    # 'institution' column — leaving all rows stranded there.
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts_old'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info('accounts_old')")
            old_cols = [col['name'] for col in cursor.fetchall()]
            if 'owner_id' in old_cols:  # accounts_old holds already-normalized rows, not legacy ones
                cursor.execute("SELECT COUNT(*) AS c FROM accounts")
                if cursor.fetchone()['c'] == 0:
                    cursor.execute("""
                    INSERT OR IGNORE INTO accounts (id, name, institution_id, owner_id, status, currency)
                    SELECT id, name, institution_id, owner_id, status, currency FROM accounts_old
                    """)
                    print("[Migration] Restored stranded accounts from accounts_old.")
                    cursor.execute("DROP TABLE accounts_old")
    except Exception as e:
        print("[Migration Warning] accounts_old self-heal error:", e)

    try:
        # A. Migrate Accounts (only the truly ancient free-text-`institution` shape —
        # guarded on 'institution' specifically, not just 'metadata_json' missing, since
        # the current normalized accounts shape (institution_id/owner_id/status/currency)
        # also has no metadata_json column and would otherwise be wrongly re-matched and
        # destructively reverted to this migration's old intermediate shape on every
        # startup — this was happening until this guard was tightened.)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts_old'")
        if not cursor.fetchone():
            cursor.execute("PRAGMA table_info('accounts')")
            columns = [col['name'] for col in cursor.fetchall()]
            if columns and 'institution' in columns and 'metadata_json' not in columns:
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
                INSERT OR IGNORE INTO assets (name, category_id, institution_id, owner_id, purchase_date, current_value, cost_price, expected_return, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_inv['name'],
                    cat_id,
                    None,
                    1,
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
                INSERT OR IGNORE INTO assets (name, category_id, owner_id, purchase_date, current_value, cost_price, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_prop['name'],
                    prop_cat_id,
                    1,
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
                INSERT OR IGNORE INTO assets (name, category_id, institution_id, owner_id, current_value, cost_price, expected_return, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"{old_ins['insurance_type']} ({old_ins['policy_number']})",
                    ins_cat_id,
                    inst_id,
                    1,
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
                INSERT OR IGNORE INTO liabilities (name, category_id, lender_institution_id, owner_id, interest_rate, emi, outstanding, tenure_months, compounding, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_loan['name'],
                    cat_id,
                    inst_id,
                    1,
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
                INSERT OR IGNORE INTO liabilities (name, category_id, lender_institution_id, owner_id, interest_rate, emi, outstanding, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    old_cc['name'],
                    cc_cat_id,
                    inst_id,
                    1,
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

    # E. Add liability_kind discriminator column (loan vs revolving_credit)
    try:
        cursor.execute("PRAGMA table_info('liabilities')")
        liability_cols = [col['name'] for col in cursor.fetchall()]
        if 'liability_kind' not in liability_cols:
            cursor.execute("ALTER TABLE liabilities ADD COLUMN liability_kind TEXT DEFAULT 'loan'")
            print("[Migration] Added liability_kind column to liabilities.")
    except Exception as e:
        print("[Migration Warning] liability_kind column migration error:", e)

    # F. Backfill credit_card_details from existing Credit Card liabilities' metadata_json
    try:
        cursor.execute("""
            SELECT l.id, l.metadata_json FROM liabilities l
            JOIN categories c ON l.category_id = c.id
            WHERE c.name = 'Credit Card'
            AND l.id NOT IN (SELECT liability_id FROM credit_card_details)
        """)
        cc_rows = cursor.fetchall()
        for row in cc_rows:
            meta = json.loads(row['metadata_json']) if row['metadata_json'] else {}
            cursor.execute("""
                INSERT INTO credit_card_details
                (liability_id, credit_limit, statement_balance, statement_date, due_date, annual_fee, reward_points, point_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row['id'],
                meta.get('credit_limit', 0.0),
                meta.get('statement_balance', 0.0),
                meta.get('statement_date'),
                meta.get('due_date'),
                meta.get('annual_fee', 0.0),
                meta.get('reward_points', 0.0),
                meta.get('point_value', 0.25)
            ))
            cursor.execute("""
                UPDATE liabilities SET liability_kind = 'revolving_credit', interest_rate = 0, emi = 0, tenure_months = 0
                WHERE id = ?
            """, (row['id'],))
        if cc_rows:
            print(f"[Migration] Backfilled credit_card_details for {len(cc_rows)} credit card(s).")
    except Exception as e:
        print("[Migration Warning] credit_card_details backfill error:", e)

    # J. Add credit_card_details columns for the reward-optimization engine (previously
    # only in liabilities.metadata_json via CreditCards.tsx — see Credit-Cards.md), then
    # backfill from metadata_json. Guarded on 'network IS NULL' so it only runs once per
    # card even though the columns themselves get a non-NULL default going forward.
    try:
        cursor.execute("PRAGMA table_info('credit_card_details')")
        ccd_cols = [col['name'] for col in cursor.fetchall()]
        new_ccd_columns = [
            ("renewal_date", "TEXT"),
            ("network", "TEXT DEFAULT 'Visa'"),
            ("lounge_visits_limit", "REAL DEFAULT 0.0"),
            ("lounge_visits_used", "REAL DEFAULT 0.0"),
            ("lounge_int_limit", "REAL DEFAULT 0.0"),
            ("lounge_int_used", "REAL DEFAULT 0.0"),
            ("milestone_spend_target", "REAL DEFAULT 0.0"),
            ("milestone_spend_current", "REAL DEFAULT 0.0"),
            ("milestone_reward_desc", "TEXT"),
            ("remarks", "TEXT"),
            ("base_points", "REAL DEFAULT 1.0"),
            ("base_spend", "REAL DEFAULT 100.0"),
            ("current_statement_spend", "REAL DEFAULT 0.0"),
            ("category_rules_json", "TEXT DEFAULT '[]'"),
            ("milestone_rules_json", "TEXT DEFAULT '[]'"),
            ("redemption_partners_json", "TEXT DEFAULT '[]'"),
        ]
        for col_name, col_type in new_ccd_columns:
            if col_name not in ccd_cols:
                cursor.execute(f"ALTER TABLE credit_card_details ADD COLUMN {col_name} {col_type}")
        print("[Migration] Ensured credit_card_details reward-engine columns exist.")
    except Exception as e:
        print("[Migration Warning] credit_card_details reward-engine column migration error:", e)

    try:
        cursor.execute("""
            SELECT l.id, l.metadata_json FROM liabilities l
            JOIN categories c ON l.category_id = c.id
            JOIN credit_card_details ccd ON ccd.liability_id = l.id
            WHERE c.name = 'Credit Card'
            AND ccd.category_rules_json = '[]' AND ccd.milestone_rules_json = '[]'
            AND ccd.redemption_partners_json = '[]'
        """)
        cc_reward_rows = cursor.fetchall()
        for row in cc_reward_rows:
            meta = json.loads(row['metadata_json']) if row['metadata_json'] else {}
            # Nothing to migrate for this card — skip so re-running init_db() doesn't
            # keep matching already-migrated (still-all-empty) cards on every startup.
            if not any(k in meta for k in ('category_rules_json', 'milestone_rules_json', 'redemption_partners_json', 'network', 'renewal_date')):
                continue
            cursor.execute("""
                UPDATE credit_card_details SET
                    renewal_date = ?, network = ?, lounge_visits_limit = ?, lounge_visits_used = ?,
                    lounge_int_limit = ?, lounge_int_used = ?, milestone_spend_target = ?,
                    milestone_spend_current = ?, milestone_reward_desc = ?, remarks = ?,
                    base_points = ?, base_spend = ?, current_statement_spend = ?,
                    category_rules_json = ?, milestone_rules_json = ?, redemption_partners_json = ?
                WHERE liability_id = ?
            """, (
                meta.get('renewal_date'),
                meta.get('network', 'Visa'),
                meta.get('lounge_visits_limit', 0.0),
                meta.get('lounge_visits_used', 0.0),
                meta.get('lounge_int_limit', 0.0),
                meta.get('lounge_int_used', 0.0),
                meta.get('milestone_spend_target', 0.0),
                meta.get('milestone_spend_current', 0.0),
                meta.get('milestone_reward_desc'),
                meta.get('remarks'),
                meta.get('base_points', 1.0),
                meta.get('base_spend', 100.0),
                meta.get('current_statement_spend', 0.0),
                meta.get('category_rules_json', '[]'),
                meta.get('milestone_rules_json', '[]'),
                meta.get('redemption_partners_json', '[]'),
                row['id'],
            ))
        if cc_reward_rows:
            print(f"[Migration] Backfilled credit_card_details reward-engine fields for {len(cc_reward_rows)} credit card(s).")
    except Exception as e:
        print("[Migration Warning] credit_card_details reward-engine backfill error:", e)

    # G. Backfill insurance_details from existing Insurance assets' metadata_json
    try:
        cursor.execute("""
            SELECT a.id, a.metadata_json FROM assets a
            JOIN categories c ON a.category_id = c.id
            WHERE c.name = 'Insurance'
            AND a.id NOT IN (SELECT asset_id FROM insurance_details)
        """)
        ins_rows = cursor.fetchall()

        def normalize_policy_type(legacy_type):
            t = (legacy_type or '').strip().lower()
            if 'health' in t:
                return 'Health'
            if 'term' in t:
                return 'Term'
            if 'vehicle' in t or 'motor' in t or 'car' in t:
                return 'Vehicle'
            return 'Life'

        for row in ins_rows:
            meta = json.loads(row['metadata_json']) if row['metadata_json'] else {}
            policy_type = normalize_policy_type(meta.get('insurance_type'))
            cursor.execute("""
                INSERT INTO insurance_details
                (asset_id, policy_type, policy_number, premium, frequency, renewal_date, sum_assured, surrender_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row['id'],
                policy_type,
                meta.get('policy_number'),
                meta.get('premium', 0.0),
                meta.get('frequency', 'Yearly'),
                meta.get('renewal_date'),
                meta.get('coverage', 0.0),
                meta.get('surrender_value', 0.0)
            ))
        if ins_rows:
            print(f"[Migration] Backfilled insurance_details for {len(ins_rows)} insurance polic(y/ies).")
    except Exception as e:
        print("[Migration Warning] insurance_details backfill error:", e)

    # H. Backfill holding_lots from existing Stock/Mutual Fund assets (one opening lot each),
    # only where there is a real cost to carry over. This runs on every startup, and used to
    # give every lot-less holding a "1 unit at ₹0" lot dated that day: a cost of nil reads as
    # the whole value being profit (a 200% return, the full value as a taxable gain). A
    # holding with no lots is handled everywhere; the Assets list asks for its purchase lots.
    try:
        cursor.execute("""
            SELECT a.id, a.purchase_date, a.quantity, a.cost_price FROM assets a
            JOIN categories c ON a.category_id = c.id
            WHERE c.name IN ('Stock', 'Mutual Fund')
            AND a.id NOT IN (SELECT DISTINCT asset_id FROM holding_lots)
            AND COALESCE(a.cost_price, 0) > 0 AND COALESCE(a.quantity, 0) > 0
        """)
        holding_rows = cursor.fetchall()
        for row in holding_rows:
            cursor.execute("""
                INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit, notes)
                VALUES (?, ?, ?, ?, ?)
            """, (
                row['id'],
                row['purchase_date'] or datetime.now().strftime('%Y-%m-%d'),
                row['quantity'],
                row['cost_price'] / row['quantity'],
                'Auto-migrated opening lot'
            ))
        if holding_rows:
            print(f"[Migration] Backfilled holding_lots for {len(holding_rows)} stock/mutual fund asset(s).")
        # Remove the ₹0 placeholders earlier versions created (only those: tagged by this
        # migration and carrying no cost). Real lots, including ones the user entered, stay.
        cursor.execute("DELETE FROM holding_lots WHERE notes = 'Auto-migrated opening lot' AND COALESCE(price_per_unit, 0) <= 0")
        if cursor.rowcount:
            print(f"[Migration] Removed {cursor.rowcount} placeholder ₹0 opening lot(s).")
    except Exception as e:
        print("[Migration Warning] holding_lots backfill error:", e)

    # I. Sync goal_mapping from assets metadata to goal_holdings
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

    # K. Backfill property_rental_ledger from existing Property assets' metadata_json
    # (one synthetic current-month entry each). insurance_claims/insurance_premium_payments
    # get no backfill — there's no reconstructable per-event history behind the existing
    # claims_made/claims_amount lifetime counters, so fabricating placeholder rows would
    # create false history; those tables simply start empty.
    try:
        cursor.execute("""
            SELECT a.id, a.metadata_json FROM assets a
            JOIN categories c ON a.category_id = c.id
            WHERE c.name = 'Property'
            AND a.id NOT IN (SELECT DISTINCT asset_id FROM property_rental_ledger)
        """)
        prop_rows = cursor.fetchall()
        for row in prop_rows:
            meta = json.loads(row['metadata_json']) if row['metadata_json'] else {}
            cursor.execute("""
                INSERT OR IGNORE INTO property_rental_ledger (asset_id, month, rent_amount, expenses_amount, notes)
                VALUES (?, ?, ?, ?, ?)
            """, (
                row['id'],
                datetime.now().strftime('%Y-%m'),
                meta.get('rental_income', 0.0) or 0.0,
                meta.get('maintenance_expenses', 0.0) or 0.0,
                'Auto-migrated from legacy rental_income/maintenance_expenses'
            ))
        if prop_rows:
            print(f"[Migration] Backfilled property_rental_ledger for {len(prop_rows)} propert(y/ies).")
    except Exception as e:
        print("[Migration Warning] property_rental_ledger backfill error:", e)

    # L. Convert existing manually-typed current_statement_spend values into a dated
    # 'Spend' ledger transaction, one per card, so the newly-derived cycle-spend
    # total (see get_init_data/put_credit_card_details in main.py) starts from the
    # same number the user already had instead of silently resetting to 0. This must
    # be a DATED transaction, not a permanent always-summed baseline (unlike
    # accounts.opening_balance, which correctly sums from inception): current_statement_
    # spend was a rolling PER-CYCLE figure, so a baseline that counted every cycle
    # forever would double-count on every subsequent statement. Dating it "today"
    # means it naturally falls out of the derived cycle window once the cycle rolls
    # over, exactly like any real Spend row would. Guarded on the notes marker so
    # this never re-fires; requires 'Spend'/'Liability' to already be legal (runs
    # after the CHECK-expansion migration above), and is_balance_exempt to already
    # exist (added unconditionally near the top of this function).
    try:
        cursor.execute("SELECT liability_id, current_statement_spend FROM credit_card_details WHERE current_statement_spend > 0")
        baseline_rows = cursor.fetchall()
        converted = 0
        for row in baseline_rows:
            cursor.execute("""
                SELECT 1 FROM transactions WHERE dest_ref_type = 'Liability' AND dest_ref_id = ?
                  AND is_balance_exempt = 1
            """, (row['liability_id'],))
            if not cursor.fetchone():
                # A raw INSERT — is_balance_exempt=1 permanently exempts this row
                # from the normal 'Spend' contract of increasing liabilities.
                # outstanding, enforced centrally in adjust_double_entry_balances
                # (backend/main.py). It exists purely to feed the derived
                # spend-total/breakdown; outstanding is, and remains, whatever
                # the user already maintains it as. notes is set for human
                # readability only — the exemption itself never depends on it.
                cursor.execute("""
                    INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes, is_balance_exempt)
                    VALUES ('None', NULL, 'Liability', ?, 'Spend', ?, ?, 'Manual statement spend adjustment', 1)
                """, (row['liability_id'], row['current_statement_spend'], datetime.now().strftime('%Y-%m-%d')))
                converted += 1
            # Zero the legacy column once its value has been converted (or was
            # already converted in an earlier run) — it must never again be a
            # candidate for this WHERE current_statement_spend > 0 guard, whether
            # or not the marker transaction it produced is later edited/deleted
            # via the dedicated endpoint or the generic Ledger. Without this, a
            # marker deleted directly via the generic Ledger route (which has no
            # reason to know about this column) would be silently resurrected by
            # this exact migration on the next restart.
            cursor.execute(
                "UPDATE credit_card_details SET current_statement_spend = 0 WHERE liability_id = ?",
                (row['liability_id'],)
            )
        if converted:
            print(f"[Migration] Converted manual current_statement_spend into dated Spend transactions for {converted} card(s).")
    except Exception as e:
        print("[Migration Warning] current_statement_spend baseline conversion error:", e)

    # Income and expense entries (the recurring plan) belong to a person, like assets and
    # liabilities. Added later, so existing rows (and any written without an owner) are
    # assigned to the Primary Owner. Idempotent.
    for table in ('income', 'expenses'):
        # Its own step: the tax queries filter on this column, so a failure here must be
        # loud and must not take the steps below down with it.
        try:
            cols = [r['name'] for r in cursor.execute(f"PRAGMA table_info('{table}')").fetchall()]
            if 'owner_id' not in cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN owner_id INTEGER REFERENCES people(id)")
                print(f"[Migration] Added owner_id to {table}.")
        except Exception as e:
            print(f"[Migration ERROR] Could not add owner_id to {table}; per-person income/expense features will fail:", e)
    try:
        primary = cursor.execute(
            "SELECT id FROM people ORDER BY CASE role WHEN 'Primary Owner' THEN 0 ELSE 1 END, id LIMIT 1").fetchone()
        if primary:
            for table in ('income', 'expenses'):
                cursor.execute(f"UPDATE {table} SET owner_id = ? WHERE owner_id IS NULL", (primary['id'],))
        # Salary's take-home field, for databases seeded before it existed.
        cursor.execute("UPDATE categories SET fields_definition = ? WHERE entity_type = 'Income' AND name = 'Salary' "
                       "AND (fields_definition IS NULL OR fields_definition = '')", (json.dumps(SALARY_FIELDS_DEFINITION),))
        # EPF account fields, likewise.
        cursor.execute("UPDATE categories SET fields_definition = ? WHERE entity_type = 'Asset' AND name = 'EPF' "
                       "AND (fields_definition IS NULL OR fields_definition = '')", (json.dumps(EPF_FIELDS_DEFINITION),))
    except Exception as e:
        print("[Migration Warning] income/expenses owner migration error:", e)

    # Liability owners: the loan forms used to send a free-text "owner" (stored in
    # metadata_json) while liabilities.owner_id silently defaulted to 1. Where that text
    # names a person, move it onto owner_id and drop the key; unmatched text is left as it
    # was. Idempotent: rows without an "owner" key are skipped.
    try:
        people = {}
        for r in cursor.execute("SELECT id, name FROM people ORDER BY id").fetchall():
            people.setdefault(r['name'].strip().lower(), r['id'])  # same name twice: the earliest person
        moved = 0
        for row in cursor.execute("SELECT id, metadata_json FROM liabilities WHERE metadata_json LIKE ?", ('%"owner"%',)).fetchall():
            try:
                meta = json.loads(row['metadata_json'] or '{}')
            except ValueError:
                continue
            text = meta.get('owner')
            person = people.get(text.strip().lower()) if isinstance(text, str) else None
            if person is None:
                continue
            del meta['owner']
            cursor.execute("UPDATE liabilities SET owner_id = ?, metadata_json = ? WHERE id = ?", (person, json.dumps(meta), row['id']))
            moved += 1
        if moved:
            print(f"[Migration] Set the owner of {moved} liabilit{'y' if moved == 1 else 'ies'} from the old free-text owner field.")
    except Exception as e:
        print("[Migration Warning] liability owner migration error:", e)

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
