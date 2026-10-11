"""
"Fill from my Artha data": proposes Tax Planner figures from what Artha already records.

Nothing here writes to the planner. Each proposal is an item with the planner field it
would fill (target), the amount, where it came from (source rows) and how firm it is:

    recorded  - straight from transactions, policies, gains or entries for this year
    estimate  - worked out (home-loan interest/principal by amortisation)
    guess     - inferred from a name (a mutual fund called "ELSS ..." or "... Tax Saver")

The UI shows the items, the user ticks the ones that apply, and ticked items for the same
target are summed and replace that field. Everything is filtered to the chosen person.
"""
import json
import re
import sqlite3
from datetime import date
from typing import Dict, List, Optional

from backend.tax.engine import MONTHS_PER_YEAR, TaxInputError
from backend.formatting import indian_digits as _inr
from backend.tax.epf import fy_months
from backend.risk import EQUITY_ORIENTED_FUND_TYPES, fund_type, metadata as risk_metadata

# income/expense frequency is free text in the generic entity form; these are the values
# the rest of the app uses (main.py's INCOME_FREQUENCY_PER_YEAR, Dashboard.tsx).
PER_YEAR = {"monthly": 12, "quarterly": 4, "half-yearly": 2, "yearly": 1, "annually": 1, "annual": 1}
ELSS_NAME = re.compile(r"\belss\b|tax\s*saver", re.IGNORECASE)
INVESTMENT_TYPES = ("Investment", "Buy", "Transfer")

TARGET_LABELS = {
    "salary_total": "Salary (total of fixed components)",
    "salary.bonus": "Performance bonus",
    "hra.rent_paid_monthly": "Rent paid per month",
    "other_income.rental_gross": "Rent received (gross)",
    "other_income.dividends": "Dividends",
    "other_income.interest_deposits": "Interest (deposits)",
    "deductions.80C.ppf": "80C: PPF",
    "deductions.80C.elss": "80C: ELSS",
    "deductions.80C.life_insurance": "80C: life insurance premium",
    "deductions.80C.home_loan_principal": "80C: home loan principal",
    "deductions.80C.other": "80C: other",
    "deductions.employee_nps": "80CCD(1B): your own NPS",
    "deductions.80D_self_family": "80D: health insurance (self & family)",
    "deductions.home_loan_interest_self_occupied": "Home loan interest (self-occupied)",
    "deductions.80E": "80E: education loan interest",
    "deductions.80G_eligible": "80G: eligible donations",
    "deductions.80D_parents": "80D: parents' health insurance",
    "deductions.other_old": "Other old-regime deductions",
    "other_income.other": "Other income",
    "prepaid.tds": "TDS deducted this year",
    "prepaid.advance_tax": "Advance tax paid",
    "capital_gains.stcg_111a": "Short-term equity gains (111A)",
    "capital_gains.ltcg_112a": "Long-term equity gains (112A)",
    "capital_gains.ltcg_112": "Long-term other gains (112)",
    "capital_gains.stcg_slab": "Short-term gains at slab rates",
}
# Targets the month-by-month grid owns when it's switched on.
MONTHLY_GRID_TARGETS = ("salary_total", "salary.bonus", "hra.rent_paid_monthly", "prepaid.tds")


def fy_bounds(financial_year: str):
    """[start, end): 1 April of the year to 1 April of the next."""
    start = fy_months(financial_year)[0]
    return start, start.replace(year=start.year + 1)


def _per_year(frequency: Optional[str]):
    return PER_YEAR.get((frequency or "Monthly").strip().lower())


def _item(target, amount, label, basis, explanation, source, selected=True, **extra):
    return {"target": target, "target_label": TARGET_LABELS[target], "amount": round(float(amount), 2),
            "label": label, "basis": basis, "explanation": explanation, "source": source,
            "selected": selected, **extra}


def _income_items(cur, person_id) -> List[dict]:
    cur.execute("""SELECT i.id, i.name, i.amount, i.frequency, i.taxable, c.name AS category
                   FROM income i LEFT JOIN categories c ON c.id = i.category_id
                   WHERE i.owner_id = ? OR i.owner_id IS NULL ORDER BY c.name, i.name""", (person_id,))
    targets = {"Salary": "salary_total", "Bonus": "salary.bonus", "Rental": "other_income.rental_gross",
               "Dividend": "other_income.dividends", "Interest": "other_income.interest_deposits"}
    items = []
    for r in cur.fetchall():
        target = targets.get(r["category"])
        if not target or not r["taxable"]:
            continue
        per_year = _per_year(r["frequency"])
        how = (f"{_inr(r['amount'])} {r['frequency'] or 'Monthly'} x {per_year}" if per_year
               else f"{_inr(r['amount'])}; frequency '{r['frequency']}' not recognised, taken as yearly")
        annual = float(r["amount"] or 0) * (per_year or 1)
        note = None
        if target == "salary_total":
            note = "Use only if this is gross salary, not take-home pay. Your salary structure keeps its proportions; only the total changes."
        items.append(_item(target, annual, r["name"], "recorded", how,
                           {"type": "income", "id": r["id"], "category": r["category"]}, note=note))
    return items


def _rent_paid_items(cur, person_id) -> List[dict]:
    cur.execute("""SELECT e.id, e.name, e.amount, e.frequency FROM expenses e JOIN categories c ON c.id = e.category_id
                   WHERE c.name = 'Rent' AND (e.owner_id = ? OR e.owner_id IS NULL) ORDER BY e.name""", (person_id,))
    items = []
    for r in cur.fetchall():
        per_year = _per_year(r["frequency"]) or 1
        monthly = float(r["amount"] or 0) * per_year / MONTHS_PER_YEAR
        items.append(_item("hra.rent_paid_monthly", monthly, r["name"], "recorded",
                           f"{_inr(r['amount'])} {r['frequency'] or 'Monthly'}, as a monthly figure",
                           {"type": "expense", "id": r["id"]}))
    return items


def _invested_this_year(cur, asset, start, end) -> tuple:
    """Money put into an asset during the year: ledger transactions, else purchase lots."""
    cur.execute(f"""SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM transactions
                    WHERE dest_ref_type = 'Asset' AND dest_ref_id = ? AND COALESCE(source_ref_type, 'None') != 'Asset'
                      AND type IN ({','.join('?' * len(INVESTMENT_TYPES))})
                      AND transaction_date >= ? AND transaction_date < ?""",
                (asset["id"], *INVESTMENT_TYPES, start.isoformat(), end.isoformat()))
    row = cur.fetchone()
    if row["n"]:
        return float(row["total"]), f"{row['n']} transaction(s) into it this year"
    cur.execute("""SELECT COALESCE(SUM(quantity * price_per_unit), 0) AS total, COUNT(*) AS n FROM holding_lots
                   WHERE asset_id = ? AND purchase_date >= ? AND purchase_date < ?""",
                (asset["id"], start.isoformat(), end.isoformat()))
    row = cur.fetchone()
    if row["n"]:
        return float(row["total"]), f"{row['n']} purchase lot(s) this year"
    return 0.0, ""


def _asset_items(cur, person_id, start, end) -> List[dict]:
    cur.execute("""SELECT a.id, a.name, c.name AS category FROM assets a JOIN categories c ON c.id = a.category_id
                   WHERE a.owner_id = ? AND c.name IN ('PPF', 'Mutual Fund', 'NPS') ORDER BY c.name, a.name""", (person_id,))
    items = []
    for a in cur.fetchall():
        if a["category"] == "Mutual Fund" and not ELSS_NAME.search(a["name"] or ""):
            continue
        amount, how = _invested_this_year(cur, a, start, end)
        if amount <= 0:
            continue
        source = {"type": "asset", "id": a["id"], "category": a["category"]}
        if a["category"] == "PPF":
            items.append(_item("deductions.80C.ppf", amount, a["name"], "recorded", how, source))
        elif a["category"] == "Mutual Fund":
            items.append(_item("deductions.80C.elss", amount, a["name"], "guess", how, source,
                               note="Counted as ELSS because of its name; untick if it isn't a tax-saving fund."))
        else:
            items.append(_item("deductions.employee_nps", amount, a["name"], "recorded", how, source,
                               note="Only your own voluntary contributions count here; leave out employer contributions."))
    return items


def _insurance_items(cur, person_id, start, end) -> List[dict]:
    """Premiums paid during the year (the policy's payment log) when any are recorded;
    otherwise the current premium for a full year, as an estimate."""
    cur.execute("""SELECT a.id, a.name, d.policy_type, d.premium, d.frequency FROM assets a
                   JOIN insurance_details d ON d.asset_id = a.id
                   WHERE a.owner_id = ? AND d.policy_type IN ('Life', 'Term', 'Health') ORDER BY d.policy_type, a.name""",
                (person_id,))
    items = []
    for p in cur.fetchall():
        paid = cur.execute("""SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM insurance_premium_payments
                              WHERE asset_id = ? AND payment_date >= ? AND payment_date < ?""",
                           (p["id"], start.isoformat(), end.isoformat())).fetchone()
        if paid["n"]:
            amount, basis = float(paid["total"]), "recorded"
            how = f"{p['policy_type']} policy: {paid['n']} premium payment(s) recorded this year"
        else:
            amount, basis = float(p["premium"] or 0) * (_per_year(p["frequency"]) or 1), "estimate"
            how = (f"{p['policy_type']} policy: current premium {_inr(p['premium'])} {p['frequency'] or 'Yearly'} for a full year "
                   "(no payments recorded this year)")
        if amount <= 0:
            continue
        target = "deductions.80D_self_family" if p["policy_type"] == "Health" else "deductions.80C.life_insurance"
        note = ("If this policy covers your parents, move it to the parents' 80D line." if p["policy_type"] == "Health" else None)
        items.append(_item(target, amount, p["name"], basis, how, {"type": "insurance", "id": p["id"]}, note=note))
    return items


def _loan_split(cur, loan, start, end, today) -> Optional[dict]:
    """Interest and principal for the year by amortisation. liabilities.outstanding is
    today's balance, so roll it back to 1 April of the year: add back every EMI and
    prepayment recorded from then until today (for a past year that includes the ones
    after it ended), then amortise forward over the year's 12 months."""
    r = float(loan["interest_rate"] or 0) / 100.0 / MONTHS_PER_YEAR
    emi = float(loan["emi"] or 0)
    balance = float(loan["outstanding"] or 0)
    if r <= 0 or emi <= 0 or balance <= 0:
        return None
    paid, prepaid = 0, 0.0
    if today >= start:
        cur.execute("""SELECT type, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM transactions
                       WHERE dest_ref_type = 'Liability' AND dest_ref_id = ? AND type IN ('EMI', 'Prepayment')
                         AND transaction_date >= ? AND transaction_date <= ? GROUP BY type""",
                    (loan["id"], start.isoformat(), today.isoformat()))
        for row in cur.fetchall():
            if row["type"] == "EMI":
                paid = row["n"]
            else:
                prepaid = float(row["total"])
    # Prepayments are added back in one step (they reduce principal directly); the EMIs are
    # unwound with the amortisation formula.
    growth = (1 + r) ** paid
    opening = (balance + prepaid + emi * (growth - 1) / r) / growth
    interest = principal = 0.0
    b = opening
    for _ in range(MONTHS_PER_YEAR):
        if b <= 0:
            break
        i = b * r
        p = min(emi - i, b)
        if p <= 0:
            return None  # EMI doesn't cover interest: not a normal amortising loan
        interest, principal, b = interest + i, principal + p, b - p
    since = "since 1 April of this year" if today < end else "since the start of that year"
    if today < start:
        how = (f"{loan['interest_rate']}% a year, EMI {_inr(emi)}; today's outstanding {_inr(balance)} taken as the balance "
               f"at the start of this future year, amortised over 12 months")
    else:
        how = (f"{loan['interest_rate']}% a year, EMI {_inr(emi)}; outstanding {_inr(balance)} after {paid} EMI(s)"
               + (f" and {_inr(prepaid)} of prepayments" if prepaid else "")
               + f" recorded {since}, so about {_inr(opening)} at the start of the year, amortised over 12 months"
               + (" (later prepayments in the year are not projected)" if prepaid else ""))
    return {"interest": interest, "principal": principal, "explanation": how}


# What a home loan's money was used for (the loan form's "Used for"), which decides what
# counts for tax. Loans without it are treated as bought-or-built, as before.
LOAN_USES = ("purchase", "repair", "other")


def _loan_use(loan) -> tuple:
    try:
        meta = json.loads(loan["metadata_json"] or "{}")
    except (TypeError, ValueError):
        meta = {}
    use = meta.get("loan_use") if meta.get("loan_use") in LOAN_USES else "purchase"
    try:
        share_pct = min(max(float(meta.get("house_share_pct") if meta.get("house_share_pct") not in (None, "") else 100), 0.0), 100.0)
    except (TypeError, ValueError):
        share_pct = 100.0
    return use, share_pct


def _recorded_split(cur, loan, start, end, today) -> Optional[dict]:
    """Interest and principal from the loan's own ledger entries (MMEX-style: a "Loan
    interest" entry each month, EMIs and prepayments paying it down), when interest entries
    cover every month of the year so far. Months still to come are projected from today's
    balance, rate and EMI. None when there's a gap (e.g. automatic EMIs switched on mid-year),
    so the caller falls back to the amortisation estimate."""
    last_day = date.fromordinal(min(end, date.fromordinal(today.toordinal() + 1)).toordinal() - 1)
    if last_day < start:
        return None  # a future year: nothing recorded yet
    rows = cur.execute("""SELECT type, amount, transaction_date FROM transactions
                          WHERE dest_ref_type = 'Liability' AND dest_ref_id = ? AND type IN ('Interest', 'EMI', 'Prepayment')
                            AND transaction_date >= ? AND transaction_date <= ?""",
                       (loan["id"], start.isoformat(), last_day.isoformat())).fetchall()
    interest_months = {r["transaction_date"][:7] for r in rows if r["type"] == "Interest"}
    if not interest_months:
        return None
    # Every month from April to the last month with an EMI date passed must have its interest.
    due_months, y, m = [], start.year, start.month
    while date(y, m, 1) <= last_day:
        due_months.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == MONTHS_PER_YEAR else (y, m + 1)
    if today.day < 28 and due_months and due_months[-1] == today.strftime("%Y-%m") and due_months[-1] not in interest_months:
        due_months.pop()  # this month's EMI may simply not be due yet
    if any(mo not in interest_months for mo in due_months):
        return {"gap": True}
    interest = sum(float(r["amount"]) for r in rows if r["type"] == "Interest")
    paid = sum(float(r["amount"]) for r in rows if r["type"] in ("EMI", "Prepayment"))
    principal = max(paid - interest, 0.0)
    # Project the rest of the year from today's balance.
    rate = float(loan["interest_rate"] or 0) / 100.0 / MONTHS_PER_YEAR
    emi, b = float(loan["emi"] or 0), float(loan["outstanding"] or 0)
    projected_months = MONTHS_PER_YEAR - len(due_months)
    p_interest = p_principal = 0.0
    for _ in range(projected_months):
        if b <= 0 or emi <= 0:
            break
        i = b * rate
        p = min(max(emi - i, 0.0), b)
        p_interest, p_principal, b = p_interest + i, p_principal + p, b - p
    how = (f"from {len(due_months)} month(s) of interest and payments recorded on the loan this year "
           f"({_inr(interest)} interest, {_inr(principal)} principal)")
    if projected_months:
        how += f", plus {projected_months} month(s) to come at {loan['interest_rate']}% on today's balance"
    return {"interest": interest + p_interest, "principal": principal + p_principal, "explanation": how,
            "basis": "recorded" if not projected_months else "estimate"}


def _loan_items(cur, person_id, start, end, today, rules: Optional[dict] = None) -> tuple:
    cur.execute("""SELECT l.id, l.name, l.interest_rate, l.emi, l.outstanding, l.metadata_json, c.name AS category FROM liabilities l
                   JOIN categories c ON c.id = l.category_id WHERE l.owner_id = ? ORDER BY l.name""", (person_id,))
    items, notes = [], []
    repair_cap = ((rules or {}).get("home_loan_interest_use") or {}).get("value", {}).get("repair_interest_cap_self_occupied")
    for loan in cur.fetchall():
        home = loan["category"] == "Home Loan"
        education = "education" in (loan["category"] or "").lower()
        if not (home or education):
            continue
        if home:
            use, share_pct = _loan_use(loan)
            if use == "other" or share_pct <= 0:
                notes.append(f"{loan['name']} is left out: its money wasn't used for the house, so its interest and principal don't count as home-loan deductions.")
                continue
        recorded = _recorded_split(cur, loan, start, end, today)
        split = recorded if recorded and not recorded.get("gap") else _loan_split(cur, loan, start, end, today)
        if split and recorded and recorded.get("gap"):
            split["explanation"] += "; interest entries this year don't cover every month yet, so this is the estimate"
        if not split:
            continue
        source = {"type": "liability", "id": loan["id"]}
        if home:
            share = share_pct / 100.0
            how = split["explanation"] + ("" if share_pct >= 100 else f"; {share_pct:g}% of the loan went into the house, so that share counts")
            note = "Counts only for a self-occupied home in the old regime; check against your lender's interest certificate."
            interest = split["interest"] * share
            if use == "repair":
                if repair_cap is not None and interest > repair_cap:
                    how += f"; capped at ₹{_inr(repair_cap)} because the money went on repairs or renovation"
                    interest = repair_cap
                elif repair_cap is None:
                    note += " This rule set has no cap for repair loans, so the full interest is shown."
                items.append(_item("deductions.home_loan_interest_self_occupied", interest, loan["name"], split.get("basis", "estimate"), how, source,
                                   note=note + " Used for repairs or renovation: the principal doesn't count under 80C."))
            else:
                items.append(_item("deductions.home_loan_interest_self_occupied", interest, loan["name"], split.get("basis", "estimate"), how, source, note=note))
                items.append(_item("deductions.80C.home_loan_principal", split["principal"] * share, loan["name"], split.get("basis", "estimate"), how, source, note=note))
        else:
            items.append(_item("deductions.80E", split["interest"], loan["name"], "estimate", split["explanation"], source))
    return items, notes


def _rental_ledger_items(cur, person_id, start, end) -> List[dict]:
    first, last = start.strftime("%Y-%m"), date.fromordinal(end.toordinal() - 1).strftime("%Y-%m")
    cur.execute("""SELECT a.id, a.name, COALESCE(SUM(r.rent_amount), 0) AS rent, COUNT(*) AS n
                   FROM property_rental_ledger r JOIN assets a ON a.id = r.asset_id
                   WHERE a.owner_id = ? AND r.month >= ? AND r.month <= ? GROUP BY a.id ORDER BY a.name""",
                (person_id, first, last))
    return [_item("other_income.rental_gross", r["rent"], r["name"], "recorded", f"{r['n']} month(s) in the rental ledger",
                  {"type": "property", "id": r["id"]}) for r in cur.fetchall() if r["rent"] > 0]


def _gains_items(cur, person_id, financial_year) -> List[dict]:
    """Realised gains this year, by the section they're taxed under. A mutual fund's fund
    type decides: debt, liquid and other funds are taxed at slab rates however long they
    were held (bought after 1 April 2023); funds without a type count as equity, with a note."""
    cur.execute("""SELECT cgr.asset_category, cgr.gain_type, cgr.gain_amount, a.metadata_json
                   FROM capital_gains_realizations cgr LEFT JOIN assets a ON a.id = cgr.asset_id
                   WHERE cgr.owner_id = ? AND cgr.financial_year = ?""", (person_id, financial_year))
    groups: Dict[tuple, dict] = {}
    for r in cur.fetchall():
        kind = fund_type(risk_metadata(r["metadata_json"])) if r["asset_category"] == "Mutual Fund" else None
        if r["asset_category"] == "Mutual Fund" and kind and kind not in EQUITY_ORIENTED_FUND_TYPES:
            key = ("slab_fund", "STCG", "Debt/liquid fund gains")
        else:
            equity = r["asset_category"] in ("Stock", "Mutual Fund")
            key = ("equity" if equity else "other", r["gain_type"], f"{r['asset_category']} {r['gain_type']}")
        g = groups.setdefault(key, {"gain": 0.0, "n": 0, "untyped_fund": False, "category": r["asset_category"]})
        g["gain"] += float(r["gain_amount"] or 0.0)
        g["n"] += 1
        g["untyped_fund"] |= r["asset_category"] == "Mutual Fund" and not kind
    targets = {("equity", "STCG"): "capital_gains.stcg_111a", ("equity", "LTCG"): "capital_gains.ltcg_112a",
               ("other", "LTCG"): "capital_gains.ltcg_112", ("other", "STCG"): "capital_gains.stcg_slab",
               ("slab_fund", "STCG"): "capital_gains.stcg_slab"}
    items = []
    for (kind, gain_type, label), g in groups.items():
        if g["gain"] <= 0:
            continue
        note = ("Taxed at your slab rate, whatever the holding period (debt-type funds bought after 1 April 2023)."
                if kind == "slab_fund" else
                "Funds without a fund type are treated as equity; set it under Assets if any are debt or liquid funds."
                if g["untyped_fund"] else None)
        items.append(_item(targets[(kind, gain_type)], g["gain"], label, "recorded",
                           f"{g['n']} sale(s) logged as realised gains this year",
                           {"type": "capital_gains", "category": g["category"]}, note=note))
    return items


# The earlier Quick estimate's yearly figures (tax_profiles), for the plan's matching fields.
# Its basic salary and HRA aren't offered here: the salary's total comes from Income &
# Expenses, and the Planner sets the structure when it first opens that year's figures.
PROFILE_FIELDS = [
    ("home_loan_interest_self_occupied", "deductions.home_loan_interest_self_occupied", "Home loan interest"),
    ("other_income_reported", "other_income.other", "Other taxable income"),
    ("tds_deducted", "prepaid.tds", "TDS deducted"),
    ("advance_tax_paid", "prepaid.advance_tax", "Advance tax paid"),
]


def _profile_items(cur, person_id, financial_year, rules: Optional[dict] = None) -> List[dict]:
    """Figures entered in the earlier Quick estimate (tax_profiles / tax_deductions) for this
    person and year: its yearly figures and its itemised deductions."""
    items = []
    profile = cur.execute("SELECT * FROM tax_profiles WHERE person_id = ? AND financial_year = ?", (person_id, financial_year)).fetchone()
    if profile:
        for column, target, label in PROFILE_FIELDS:
            if (profile[column] or 0) > 0:
                items.append(_item(target, profile[column], label, "recorded", "Entered in the Quick estimate",
                                   {"type": "tax_profile", "id": profile["id"]}))
        if (profile["hra_rent_paid"] or 0) > 0:
            items.append(_item("hra.rent_paid_monthly", round(profile["hra_rent_paid"] / 12, 2), "Rent paid (a year's rent ÷ 12)", "recorded",
                               "Entered in the Quick estimate", {"type": "tax_profile", "id": profile["id"]}))
    cur.execute("""SELECT d.id, d.section, d.label, d.amount FROM tax_deductions d
                   JOIN tax_profiles p ON p.id = d.tax_profile_id
                   WHERE p.person_id = ? AND p.financial_year = ? ORDER BY d.section, d.label""", (person_id, financial_year))
    targets = {"80C": "deductions.80C.other", "80D": "deductions.80D_self_family", "80CCD1B": "deductions.employee_nps",
               "80E": "deductions.80E", "80G": "deductions.80G_eligible", "24B": "deductions.home_loan_interest_self_occupied",
               "Other": "deductions.other_old"}
    # 80TTA isn't carried: the planner works it out from savings-account interest itself.
    rows = [d for d in cur.fetchall() if d["section"] in targets and d["amount"] > 0]
    # The Quick estimate didn't split 80D by who was insured; like its estimate, the amount
    # above the self/family limit counts as parents' (non-senior) premium.
    self_cap = None
    if rules and profile:
        try:
            limits = rules["regimes"]["old"]["deductions"]["value"]["80D"]
            senior = (profile["age_band"] or "Below60") != "Below60"
            self_cap = float(limits["self_family_senior"] if senior else limits["self_family"])
        except (KeyError, TypeError, ValueError):
            self_cap = None
    used_80d = 0.0
    for d in rows:
        explanation = f"Entered under {d['section']} in the Quick estimate"
        source = {"type": "tax_deduction", "id": d["id"]}
        if d["section"] == "80D" and self_cap is not None:
            own = max(min(d["amount"], self_cap - used_80d), 0.0)
            used_80d += own
            if own > 0:
                items.append(_item(targets["80D"], own, d["label"], "recorded", explanation, source))
            if d["amount"] - own > 0:
                items.append(_item("deductions.80D_parents", d["amount"] - own, f"{d['label']} (above the self/family limit)", "recorded",
                                   explanation + "; the part above the self/family limit is taken as parents' premium", source))
            continue
        items.append(_item(targets[d["section"]], d["amount"], d["label"], "recorded", explanation, source))
    return items


def prefill(conn: sqlite3.Connection, financial_year: str, person_id: Optional[int] = None, today: Optional[date] = None,
            rules: Optional[dict] = None) -> dict:
    today = today or date.today()
    start, end = fy_bounds(financial_year)
    cur = conn.cursor()
    cur.execute("SELECT id, name, role FROM people ORDER BY CASE role WHEN 'Primary Owner' THEN 0 WHEN 'Spouse' THEN 1 ELSE 2 END, id")
    people = [dict(p) for p in cur.fetchall()]
    if person_id is None:
        person_id = people[0]["id"] if people else None
    elif not any(p["id"] == person_id for p in people):
        raise TaxInputError(f"Person {person_id} not found")

    items: List[dict] = []
    loan_notes: List[str] = []
    if person_id is not None:
        loan_items, loan_notes = _loan_items(cur, person_id, start, end, today, rules)
        items += (_income_items(cur, person_id) + _rent_paid_items(cur, person_id) + _rental_ledger_items(cur, person_id, start, end) + _asset_items(cur, person_id, start, end)
                  + _insurance_items(cur, person_id, start, end) + loan_items
                  + _gains_items(cur, person_id, financial_year) + _profile_items(cur, person_id, financial_year, rules))

    # The same money can show up twice (rent in both the ledger and an income row; a
    # figure typed in the Quick estimate and also derived from a policy, loan or salary):
    # start those with one source ticked and say why.
    by_target: Dict[str, List[dict]] = {}
    for it in items:
        by_target.setdefault(it["target"], []).append(it)
    for target, group in by_target.items():
        typed = ("tax_deduction", "tax_profile", "income")
        derived = [it for it in group if it["source"]["type"] not in typed]
        if not derived:
            continue
        for it in group:
            if it["source"]["type"] in typed:
                it["selected"] = False
                it["overlap"] = "May be the same money as the other source(s) for this field; tick only one."
    for i, it in enumerate(items):
        it["id"] = f"{it['source']['type']}-{it['source'].get('id', it['source'].get('category'))}-{it['target']}-{i}"

    return {
        "financial_year": financial_year,
        "person_id": person_id,
        "people": people,
        "items": items,
        "monthly_grid_targets": list(MONTHLY_GRID_TARGETS),
        "notes": [
            "Income and expenses are this person's entries in Income & Expenses.",
            "Policy premiums use the payments recorded in each policy's premium log this year, else the current premium (an estimate).",
            *loan_notes,
        ],
    }
