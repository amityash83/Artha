"""
Bank statement import: read a statement file (CSV or Excel .xlsx, as Indian banks export
them), find its header row and columns, and turn each line into a dated amount in or out
of one account. Nothing is written here; main.py's routes preview, then post what the user
ticks (and can undo a whole import).

- Header detection is by column name, not by bank: "Narration"/"Particulars"/"Description",
  "Withdrawal Amt."/"Debit"/"DR", "Deposit Amt."/"Credit"/"CR", or one "Amount" column with
  a Dr/Cr column or a sign. Lines without a date and an amount (titles, opening balance,
  footers) are skipped.
- Dates are read day first (dd/mm/yyyy, 01-Apr-2026...), as Indian banks print them,
  unless the file can only be month first.
- Matching against what Artha already has: a line with the same direction and amount on
  the same day is "already in Artha"; within 3 days it's "probably already in Artha"
  (an EMI posted automatically on its due day, debited a day later). Each existing entry
  matches at most one line.
- Suggestions: an outgoing amount equal to a loan's EMI goes to that loan; a card bill
  payment to the card it names; otherwise the category last used for the same payee.
"""
import csv
import io
import re
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000
CLOSE_MATCH_DAYS = 3

# Candidates per column role, best first. Header cells are lower-cased, with anything in
# brackets and trailing dots removed ("Withdrawal Amount (INR )" -> "withdrawal amount").
ROLES: Dict[str, List[str]] = {
    "date": ["transaction date", "txn date", "tran date", "trans date", "date", "posting date", "value date", "value dt"],
    "description": ["narration", "description", "particulars", "transaction details", "transaction remarks", "details", "remarks"],
    "debit": ["withdrawal amt", "withdrawal amount", "withdrawals", "withdrawal", "debit amount", "debit amt", "debits", "debit", "dr amount", "dr"],
    "credit": ["deposit amt", "deposit amount", "deposits", "deposit", "credit amount", "credit amt", "credits", "credit", "cr amount", "cr"],
    "balance": ["closing balance", "running balance", "available balance", "balance", "bal"],
    "reference": ["chq/ref number", "chq/ref no", "ref no/cheque no", "cheque no", "chq no", "chqno", "ref no", "reference no", "reference", "utr"],
    "drcr": ["dr/cr", "cr/dr", "debit/credit", "transaction type", "type"],
    "amount": ["transaction amount", "amount", "amt"],
}
ROLE_ORDER = ["date", "description", "debit", "credit", "balance", "reference", "drcr", "amount"]

# Words that say nothing about who was paid ("UPI/123456/SWIGGY/..." -> "SWIGGY").
NOISE = {"UPI", "NEFT", "IMPS", "RTGS", "POS", "ACH", "ECS", "NACH", "MMT", "INB", "IB", "BIL", "BILLPAY", "TO", "FROM", "BY", "FOR",
         "THE", "TRANSFER", "TRF", "PAYMENT", "PAY", "PAID", "DR", "CR", "REF", "TXN", "ATM", "WDL", "CASH", "DEBIT", "CREDIT",
         "CARD", "VPS", "IPS", "LTD", "PVT", "LIMITED", "BANK", "OKAXIS", "OKHDFCBANK", "OKICICI", "OKSBI", "YBL", "PAYTM", "IBL", "AXL"}
CARD_PAYMENT = re.compile(r"credit\s*card|\bcc\b|card\s*(bill|payment|dues)|autopay|bill\s*desk|billdesk", re.I)


class StatementError(Exception):
    pass


# --- Reading the file -----------------------------------------------------------------

def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise StatementError("Couldn't read the file's text.")


def read_table(filename: str, data: bytes) -> List[list]:
    if len(data) > MAX_FILE_BYTES:
        raise StatementError("The file is larger than 5 MB; export a shorter period.")
    name = (filename or "").lower()
    if name.endswith(".xlsx") or data[:2] == b"PK":
        try:
            import openpyxl
            book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            sheet = book.worksheets[0]
            return [list(r) for r in sheet.iter_rows(values_only=True)]
        except Exception as e:
            raise StatementError(f"Couldn't read the Excel file: {e}")
    if name.endswith(".xls") or data[:4] == b"\xd0\xcf\x11\xe0":
        raise StatementError("Old Excel files (.xls) can't be read. Open it in Excel or Numbers and save it as .xlsx or CSV.")
    if name.endswith(".pdf") or data[:4] == b"%PDF":
        raise StatementError("PDF statements can't be read. Download the statement as CSV or Excel from your bank instead.")
    text = _decode(data)
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect)]


def _norm_header(cell) -> str:
    s = re.sub(r"\(.*?\)", " ", str(cell or "")).lower().replace("₹", " ")
    s = re.sub(r"\s+", " ", s.replace(".", " ").replace("_", " ")).strip()
    return s.replace(" / ", "/").replace("/ ", "/").replace(" /", "/")


def _role_score(header: str, candidates: List[str]) -> Optional[int]:
    for i, c in enumerate(candidates):
        if header == c:
            return i * 2
        if re.search(rf"(^|\s){re.escape(c)}($|\s)", header):
            return i * 2 + 1
    return None


def find_columns(rows: List[list]) -> Tuple[int, Dict[str, int]]:
    """(header row index, role -> column index), for the first row that has a date, a
    description and either debit+credit columns or an amount column."""
    for r, row in enumerate(rows[:60]):
        headers = [_norm_header(c) for c in row]
        if sum(1 for h in headers if h) < 3:
            continue
        cols: Dict[str, int] = {}
        for role in ROLE_ORDER:
            best = None
            for ci, h in enumerate(headers):
                if not h or ci in cols.values():
                    continue
                score = _role_score(h, ROLES[role])
                if score is not None and (best is None or score < best[0]):
                    best = (score, ci)
            if best:
                cols[role] = best[1]
        if "date" in cols and "description" in cols and (("debit" in cols and "credit" in cols) or "amount" in cols):
            if "debit" in cols and "credit" in cols:
                cols.pop("amount", None)
                cols.pop("drcr", None)
            return r, cols
    raise StatementError("Couldn't find the statement's columns (a date, a description, and withdrawal/deposit or amount).")


# --- Values -----------------------------------------------------------------------------

DATE_FORMATS = ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y", "%d.%m.%y", "%d-%b-%Y", "%d-%b-%y", "%d %b %Y",
                "%d %b %y", "%d-%B-%Y", "%d %B %Y", "%Y-%m-%d", "%b %d, %Y", "%d/%b/%Y"]
MONTH_FIRST_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y"]


def _month_first(values: List[str]) -> bool:
    """True only when the numeric dates can't be day first (some second part above 12,
    no first part above 12)."""
    firsts, seconds = [], []
    for v in values:
        m = re.match(r"^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}", v)
        if m:
            firsts.append(int(m.group(1)))
            seconds.append(int(m.group(2)))
    return bool(seconds) and max(seconds) > 12 and max(firsts) <= 12


def parse_date(value, month_first: bool = False) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value or "").strip()
    if not s:
        return None
    s = re.split(r"\s+\d{1,2}:\d{2}", s)[0].strip()  # drop a time
    for fmt in (MONTH_FIRST_FORMATS if month_first else []) + DATE_FORMATS:
        try:
            d = datetime.strptime(s, fmt).date()
        except ValueError:
            continue
        if 1990 <= d.year <= 2100:
            return d
    return None


def parse_amount(value) -> Tuple[Optional[float], Optional[str]]:
    """(amount, 'in'|'out'|None from a Cr/Dr suffix or sign). Blank or '-' -> (None, None)."""
    if isinstance(value, (int, float)):
        return (abs(float(value)), "out" if value < 0 else None) if value else (None, None)
    s = str(value or "").strip()
    if not s or s in ("-", "--"):
        return None, None
    hint = None
    m = re.search(r"(?<![a-z])(cr|dr)\.?$", s, re.I)  # "500 Dr" and "500.00Dr" alike
    if m:
        hint = "in" if m.group(1).lower() == "cr" else "out"
        s = s[:m.start()]
    negative = s.startswith("(") and s.endswith(")") or s.lstrip().startswith("-")
    s = re.sub(r"[^\d.]", "", s)
    if not re.search(r"\d", s) or s.count(".") > 1:  # "Rs." or "." alone
        return None, None
    amount = float(s)
    if amount == 0:
        return None, None
    return amount, hint or ("out" if negative else None)


def parse_balance(value) -> Optional[float]:
    """A running balance, signed: "1,000.00 Dr" (overdrawn) is -1000, and 0 is a balance, not a blank."""
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value or "").strip()
    if re.fullmatch(r"[-(]?\s*0+(\.0+)?\s*\)?\s*((cr|dr)\.?)?", s, re.I):
        return 0.0
    amount, hint = parse_amount(value)
    if amount is None:
        return None
    return -amount if hint == "out" else amount


def parse_statement(filename: str, data: bytes) -> dict:
    rows = read_table(filename, data)
    header, cols = find_columns(rows)
    body = rows[header + 1:]
    month_first = _month_first([str(r[cols["date"]]) for r in body if len(r) > cols["date"] and r[cols["date"]] is not None])

    def cell(row, role):
        i = cols.get(role)
        return row[i] if i is not None and i < len(row) else None

    lines, skipped = [], 0
    for row in body:
        d = parse_date(cell(row, "date"), month_first)
        if not d:
            skipped += 1 if any(c not in (None, "") for c in row) else 0
            continue
        if "debit" in cols:
            out_amt, _ = parse_amount(cell(row, "debit"))
            in_amt, _ = parse_amount(cell(row, "credit"))
            if out_amt and in_amt:
                skipped += 1
                continue
            amount, direction = (out_amt, "out") if out_amt else (in_amt, "in")
        else:
            amount, hint = parse_amount(cell(row, "amount"))
            flag = str(cell(row, "drcr") or "").strip().lower()
            direction = "out" if flag.startswith("d") or flag == "withdrawal" else "in" if flag.startswith("c") or flag == "deposit" else hint or "in"
        if not amount:
            skipped += 1
            continue
        balance = parse_balance(cell(row, "balance"))
        lines.append({
            "line": len(lines) + 1,
            "date": d.isoformat(),
            "description": re.sub(r"\s+", " ", str(cell(row, "description") or "")).strip(),
            "reference": str(cell(row, "reference") or "").strip() or None,
            "amount": round(amount, 2),
            "direction": direction,
            "balance": round(balance, 2) if balance is not None else None,
        })
        if len(lines) > MAX_ROWS:
            raise StatementError(f"More than {MAX_ROWS} lines; export a shorter period.")
    if not lines:
        raise StatementError("Found the columns, but no lines with a date and an amount.")
    columns = {role: str(rows[header][i]).strip() for role, i in cols.items()}
    return {"lines": lines, "columns": columns, "skipped": skipped, "month_first": month_first}


# --- Matching and suggestions -----------------------------------------------------------

def payee_key(text: str) -> str:
    """The first word that names someone ("UPI-SWIGGY-swiggy@icici-...-Dinner" -> "SWIGGY").
    Only one: in a UPI line the later words are the bank handle and the payer's own note."""
    words = [w for w in re.split(r"[^A-Z]+", (text or "").upper()) if len(w) >= 3 and w not in NOISE]
    return words[0] if words else ""


def analyse(conn, account_id: int, lines: List[dict]) -> List[dict]:
    """Adds to each line: status ('new' | 'duplicate' | 'probable_duplicate'), match note,
    and a suggested counterpart / category."""
    cur = conn.cursor()
    dates = [l["date"] for l in lines]
    start = (date.fromisoformat(min(dates)) - timedelta(days=CLOSE_MATCH_DAYS)).isoformat()
    end = (date.fromisoformat(max(dates)) + timedelta(days=CLOSE_MATCH_DAYS)).isoformat()
    existing = [dict(r) for r in cur.execute("""
        SELECT id, transaction_date, amount, type, notes,
               CASE WHEN source_ref_type = 'Account' AND source_ref_id = :a THEN 'out' ELSE 'in' END AS direction
        FROM transactions
        WHERE ((source_ref_type = 'Account' AND source_ref_id = :a) OR (dest_ref_type = 'Account' AND dest_ref_id = :a))
          AND transaction_date BETWEEN :s AND :e""", {"a": account_id, "s": start, "e": end})]
    used = set()

    def match(line, max_days):
        best = None
        for t in existing:
            if t["id"] in used or t["direction"] != line["direction"] or abs(float(t["amount"]) - line["amount"]) > 0.005:
                continue
            gap = abs((date.fromisoformat(t["transaction_date"][:10]) - date.fromisoformat(line["date"])).days)
            if gap <= max_days and (best is None or gap < best[0]):
                best = (gap, t)
        return best

    # Exact-day matches first, so a near match never takes an entry an exact one needs.
    for line in lines:
        line.update(status="new", match=None, counterpart=None, category_id=None)
        hit = match(line, 0)
        if hit:
            used.add(hit[1]["id"])
            line.update(status="duplicate", match=f"Already in Artha: {hit[1]['type']}" + (f" ({hit[1]['notes']})" if hit[1]["notes"] else ""))
    for line in lines:
        if line["status"] != "new":
            continue
        hit = match(line, CLOSE_MATCH_DAYS)
        if hit:
            used.add(hit[1]["id"])
            t = hit[1]
            line.update(status="probable_duplicate",
                        match=f"Probably already in Artha: {t['type']} on {t['transaction_date'][:10]}" + (f" ({t['notes']})" if t["notes"] else ""))

    loans = [dict(r) for r in cur.execute("""
        SELECT l.id, l.name, l.emi, c.name AS category, i.name AS lender FROM liabilities l
        LEFT JOIN categories c ON c.id = l.category_id LEFT JOIN institutions i ON i.id = l.lender_institution_id
        WHERE l.outstanding > 0 OR c.name = 'Credit Card'""")]
    cards = [l for l in loans if l["category"] == "Credit Card"]
    emis = [l for l in loans if l["category"] != "Credit Card" and (l["emi"] or 0) > 0]

    # The category last used for each payee on this account.
    history: Dict[str, Counter] = {}
    for r in cur.execute("""SELECT notes, category_id FROM transactions
                            WHERE category_id IS NOT NULL AND notes IS NOT NULL
                              AND ((source_ref_type = 'Account' AND source_ref_id = :a) OR (dest_ref_type = 'Account' AND dest_ref_id = :a))
                            ORDER BY id DESC LIMIT 3000""", {"a": account_id}):
        key = payee_key(r["notes"])
        if key:
            history.setdefault(key, Counter())[r["category_id"]] += 1

    def card_for(text):
        if len(cards) == 1:
            return cards[0]
        low = text.lower()
        for c in cards:
            words = [w for w in re.split(r"\W+", f"{c['name']} {c['lender'] or ''}".lower()) if len(w) >= 3 and w not in ("card", "credit", "bank")]
            if any(w in low for w in words):
                return c
        return None

    for line in lines:
        if line["status"] != "new":
            continue
        if line["direction"] == "out":
            loan = next((l for l in emis if abs(float(l["emi"]) - line["amount"]) <= 1), None)
            if loan:
                line["counterpart"] = {"type": "Liability", "id": loan["id"], "reason": f"Same as the {loan['name']} EMI"}
                continue
            if CARD_PAYMENT.search(line["description"]):
                card = card_for(line["description"])
                if card:
                    line["counterpart"] = {"type": "Liability", "id": card["id"], "reason": f"Looks like the {card['name']} bill"}
                    continue
        seen = history.get(payee_key(line["description"]))
        if seen:
            line["category_id"] = seen.most_common(1)[0][0]
    return lines


def entry_shape(direction: str, account_id: int, counterpart: Optional[dict], liability_category: Optional[str]) -> Tuple[str, str, Optional[int], str, Optional[int]]:
    """(type, source type, source id, dest type, dest id) for a statement line going to or
    coming from a counterpart. The ledger's balances follow the direction; the type is the label."""
    kind = (counterpart or {}).get("type") or "None"
    other = (counterpart or {}).get("id")
    if kind == "None" or not other:
        return ("Debit", "Account", account_id, "None", None) if direction == "out" else ("Credit", "None", None, "Account", account_id)
    if kind == "Account":
        if other == account_id:
            raise StatementError("A line can't be a transfer to the same account.")
        return ("Transfer", "Account", account_id, "Account", other) if direction == "out" else ("Transfer", "Account", other, "Account", account_id)
    if kind == "Liability":
        if direction == "out":
            return ("Prepayment" if liability_category == "Credit Card" else "EMI", "Account", account_id, "Liability", other)
        return ("Transfer", "Liability", other, "Account", account_id)  # a loan paid out into the account
    if kind == "Asset":
        return ("Investment", "Account", account_id, "Asset", other) if direction == "out" else ("Redemption", "Asset", other, "Account", account_id)
    raise StatementError(f"Unknown counterpart: {kind}")
