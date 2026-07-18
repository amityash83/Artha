import json

from backend.decision_engine import generate_recommendations

SYSTEM_PROMPT_BASE = (
    "You are a financial explanation assistant inside Artha, a personal finance app. "
    "All numbers given to you below are already computed by the app's deterministic engine — "
    "never recompute, correct, or second-guess them; only explain them in plain language. "
    "Never invent numbers not given to you. Be concise (2-4 short paragraphs max). "
    "This is educational explanation only, not financial or tax advice."
)


def build_explain_context(conn, rule_key=None, recommendation_index=None, context_note=""):
    """
    Builds a prompt that explains an already-computed recommendation or rule in
    plain language. Never asks the model to compute anything — only to explain
    numbers/messages generate_recommendations() (or financial_rules) already produced.
    """
    cursor = conn.cursor()
    recs = generate_recommendations(conn)
    target = None
    if rule_key:
        target = next((r for r in recs if r.get("rule_key") == rule_key), None)
    elif recommendation_index is not None and 0 <= recommendation_index < len(recs):
        target = recs[recommendation_index]

    if not target and rule_key:
        cursor.execute("SELECT * FROM financial_rules WHERE rule_key = ?", (rule_key,))
        rule_row = cursor.fetchone()
        target = dict(rule_row) if rule_row else None

    if not target:
        target = {"message": "No specific figure was provided for this explanation."}

    user_prompt = (
        "Explain this financial recommendation or rule to the user in plain language:\n\n"
        f"{json.dumps(target, default=str)}\n\n"
        + (f"Additional context: {context_note}\n\n" if context_note else "")
        + "Explain what it means and why it matters. Do not suggest a different number than given."
    )
    return SYSTEM_PROMPT_BASE, user_prompt


# Cheap keyword -> data-section heuristic. No embeddings/vector DB — proportionate
# for a personal SQLite app with a handful of entities per user, not a multi-tenant
# RAG system. Falls back to a small default set if nothing matches.
KEYWORD_MAP = {
    "goal": ["goals"], "afford": ["goals", "summary"], "loan": ["liabilities"],
    "emi": ["liabilities"], "debt": ["liabilities"], "card": ["liabilities", "card_variants"],
    "credit card": ["liabilities", "card_variants"], "tax": ["tax_profiles"],
    "invest": ["assets"], "mutual fund": ["assets"], "stock": ["assets"],
    "insurance": ["assets"], "property": ["assets"], "rent": ["assets"],
    "emergency fund": ["accounts", "goals"], "net worth": ["summary"],
    "income": ["income"], "expense": ["expenses"], "budget": ["expenses", "categories"],
}


def _relevant_sections(question: str) -> set:
    q = question.lower()
    matched = set()
    for kw, sections in KEYWORD_MAP.items():
        if kw in q:
            matched.update(sections)
    if not matched:
        matched = {"summary", "goals"}
    return matched


def build_ask_context(conn, question: str):
    """
    Builds a prompt for a free-form question. Pulls only the field-projected,
    length-capped slices of data a simple keyword match suggests are relevant,
    plus a small always-included baseline — never dumps the full /api/init payload.
    """
    cursor = conn.cursor()
    sections = _relevant_sections(question)
    ctx = {}

    cursor.execute("SELECT month, net_worth FROM snapshots ORDER BY month DESC LIMIT 1")
    row = cursor.fetchone()
    ctx["latest_net_worth_snapshot"] = dict(row) if row else {}
    ctx["active_recommendations"] = [
        {k: v for k, v in r.items() if k in ("category", "title", "message")}
        for r in generate_recommendations(conn)[:5]
    ]

    if "goals" in sections:
        cursor.execute("SELECT name, target_amount, current_amount, monthly_contribution, target_date FROM goals")
        ctx["goals"] = [dict(r) for r in cursor.fetchall()]
    if "liabilities" in sections:
        cursor.execute("SELECT name, outstanding, interest_rate, emi FROM liabilities LIMIT 20")
        ctx["liabilities"] = [dict(r) for r in cursor.fetchall()]
    if "accounts" in sections:
        cursor.execute("""
            SELECT a.name, (
                SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t
                WHERE t.dest_ref_type = 'Account' AND t.dest_ref_id = a.id
            ) - (
                SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t
                WHERE t.source_ref_type = 'Account' AND t.source_ref_id = a.id
            ) AS current_balance
            FROM accounts a LIMIT 20
        """)
        ctx["accounts"] = [dict(r) for r in cursor.fetchall()]
    if "assets" in sections:
        cursor.execute("""
            SELECT a.name, c.name as category_name, a.current_value
            FROM assets a LEFT JOIN categories c ON a.category_id = c.id LIMIT 30
        """)
        ctx["assets"] = [dict(r) for r in cursor.fetchall()]
    if "tax_profiles" in sections:
        cursor.execute("SELECT * FROM tax_profiles ORDER BY financial_year DESC LIMIT 1")
        row = cursor.fetchone()
        ctx["latest_tax_profile"] = dict(row) if row else {}
    if "card_variants" in sections:
        cursor.execute("SELECT name, issuer, annual_fee, point_value FROM card_variants LIMIT 10")
        ctx["card_library_sample"] = [dict(r) for r in cursor.fetchall()]
    if "expenses" in sections:
        cursor.execute("""
            SELECT c.name as category_name, SUM(e.amount) as total
            FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
            GROUP BY e.category_id LIMIT 20
        """)
        ctx["expenses_by_category"] = [dict(r) for r in cursor.fetchall()]
    if "income" in sections:
        cursor.execute("SELECT source, amount, frequency FROM income LIMIT 20")
        ctx["income"] = [dict(r) for r in cursor.fetchall()]

    user_prompt = (
        f"User question: {question}\n\n"
        f"Relevant financial data (already computed by the app, do not recompute):\n"
        f"{json.dumps(ctx, default=str)}\n\n"
        "Answer using only this data. If something needed to answer isn't in the data provided, say so rather than guessing."
    )
    return SYSTEM_PROMPT_BASE, user_prompt
