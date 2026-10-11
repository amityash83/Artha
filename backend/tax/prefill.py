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
import re
import sqlite3
from datetime import date
from typing import Dict, List, Optional

from backend.tax.engine import MONTHS_PER_YEAR, TaxInputError
from backend.formatting import indian_digits as _inr
from backend.tax.epf import fy_months

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
    "capital_gains.stcg_111a": "Short-term equity gains (111A)",
    "capital_gains.ltcg_112a": "Long-term equity gains (112A)",
    "capital_gains.ltcg_112": "Long-term other gains (112)",
    "capital_gains.stcg_slab": "Short-term gains at slab rates",
}
# Targets the month-by-month grid owns when it's switched on.
MONTHLY_GRID_TARGETS = ("salary_total", "salary.bonus", "hra.rent_paid_monthly")


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


def _loan_items(cur, person_id, start, end, today) -> List[dict]:
    cur.execute("""SELECT l.id, l.name, l.interest_rate, l.emi, l.outstanding, c.name AS category FROM liabilities l
                   JOIN categories c ON c.id = l.category_id WHERE l.owner_id = ? ORDER BY l.name""", (person_id,))
    items = []
    for loan in cur.fetchall():
        home = loan["category"] == "Home Loan"
        education = "education" in (loan["category"] or "").lower()
        if not (home or education):
            continue
        split = _loan_split(cur, loan, start, end, today)
        if not split:
            continue
        source = {"type": "liability", "id": loan["id"]}
        if home:
            note = "Counts only for a self-occupied home in the old regime; check against your lender's interest certificate."
            items.append(_item("deductions.home_loan_interest_self_occupied", split["interest"], loan["name"], "estimate",
                               split["explanation"], source, note=note))
            items.append(_item("deductions.80C.home_loan_principal", split["principal"], loan["name"], "estimate",
                               split["explanation"], source, note=note))
        else:
            items.append(_item("deductions.80E", split["interest"], loan["name"], "estimate", split["explanation"], source))
    return items


def _rental_ledger_items(cur, person_id, start, end) -> List[dict]:
    first, last = start.strftime("%Y-%m"), date.fromordinal(end.toordinal() - 1).strftime("%Y-%m")
    cur.execute("""SELECT a.id, a.name, COALESCE(SUM(r.rent_amount), 0) AS rent, COUNT(*) AS n
                   FROM property_rental_ledger r JOIN assets a ON a.id = r.asset_id
                   WHERE a.owner_id = ? AND r.month >= ? AND r.month <= ? GROUP BY a.id ORDER BY a.name""",
                (person_id, first, last))
    return [_item("other_income.rental_gross", r["rent"], r["name"], "recorded", f"{r['n']} month(s) in the rental ledger",
                  {"type": "property", "id": r["id"]}) for r in cur.fetchall() if r["rent"] > 0]


def _gains_items(cur, person_id, financial_year) -> List[dict]:
    cur.execute("""SELECT asset_category, gain_type, COALESCE(SUM(gain_amount), 0) AS gain, COUNT(*) AS n
                   FROM capital_gains_realizations WHERE owner_id = ? AND financial_year = ?
                   GROUP BY asset_category, gain_type""", (person_id, financial_year))
    items = []
    for g in cur.fetchall():
        if g["gain"] <= 0:
            continue
        equity = g["asset_category"] in ("Stock", "Mutual Fund")
        target = {(True, "STCG"): "capital_gains.stcg_111a", (True, "LTCG"): "capital_gains.ltcg_112a",
                  (False, "LTCG"): "capital_gains.ltcg_112", (False, "STCG"): "capital_gains.stcg_slab"}[(equity, g["gain_type"])]
        note = ("Assumes equity-oriented funds; gains on debt funds are taxed at slab rates."
                if g["asset_category"] == "Mutual Fund" else None)
        items.append(_item(target, g["gain"], f"{g['asset_category']} {g['gain_type']}", "recorded",
                           f"{g['n']} sale(s) logged as realised gains this year",
                           {"type": "capital_gains", "category": g["asset_category"]}, note=note))
    return items


def _profile_items(cur, person_id, financial_year) -> List[dict]:
    """Itemised entries from Profile & Deductions for this person and year."""
    cur.execute("""SELECT d.id, d.section, d.label, d.amount FROM tax_deductions d
                   JOIN tax_profiles p ON p.id = d.tax_profile_id
                   WHERE p.person_id = ? AND p.financial_year = ? ORDER BY d.section, d.label""", (person_id, financial_year))
    targets = {"80C": "deductions.80C.other", "80D": "deductions.80D_self_family", "80CCD1B": "deductions.employee_nps",
               "80E": "deductions.80E", "80G": "deductions.80G_eligible", "24B": "deductions.home_loan_interest_self_occupied"}
    return [_item(targets[d["section"]], d["amount"], d["label"], "recorded", f"Entered under {d['section']} in Profile & Deductions",
                  {"type": "tax_deduction", "id": d["id"]}) for d in cur.fetchall() if d["section"] in targets and d["amount"] > 0]


def prefill(conn: sqlite3.Connection, financial_year: str, person_id: Optional[int] = None, today: Optional[date] = None) -> dict:
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
    if person_id is not None:
        items += (_income_items(cur, person_id) + _rent_paid_items(cur, person_id) + _rental_ledger_items(cur, person_id, start, end) + _asset_items(cur, person_id, start, end)
                  + _insurance_items(cur, person_id, start, end) + _loan_items(cur, person_id, start, end, today)
                  + _gains_items(cur, person_id, financial_year) + _profile_items(cur, person_id, financial_year))

    # The same money can show up twice (rent in both the ledger and an income row; a
    # deduction typed in Profile & Deductions and also derived from a policy or loan):
    # start those with one source ticked and say why.
    by_target: Dict[str, List[dict]] = {}
    for it in items:
        by_target.setdefault(it["target"], []).append(it)
    for target, group in by_target.items():
        derived = [it for it in group if it["source"]["type"] not in ("tax_deduction", "income")]
        if not derived:
            continue
        for it in group:
            if it["source"]["type"] in ("tax_deduction", "income"):
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
        ],
    }
