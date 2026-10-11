"""Bank statement import: reading bank layouts, matching what Artha already has,
suggestions, posting and undo."""
import io
import json
from datetime import datetime

import openpyxl
import pytest
from fastapi.testclient import TestClient

from backend import statements

HDFC_CSV = """HDFC BANK Ltd.,,,,,,
Statement of account,,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,UPI-SWIGGY-swiggy@icici-ICIC0000123-627412345678-Dinner,0000627412345678,01/10/26,"1,250.00",,"98,750.00"
03/10/26,NEFT CR-ACME CORP-SALARY OCT,N276260123,03/10/26,,"1,50,000.00","2,48,750.00"
05/10/26,ACH D- HDFC LTD-HOMELOAN,000000000001,05/10/26,"30,000.00",,"2,18,750.00"
07/10/26,CC 4321XXXX1234 AUTOPAY SI-TAD,000000000002,07/10/26,"12,000.00",,"2,06,750.00"
,,,,,,
Opening Balance,,,,,,
"""


def _xlsx(rows):
    book = openpyxl.Workbook()
    for r in rows:
        book.active.append(r)
    buf = io.BytesIO()
    book.save(buf)
    return buf.getvalue()


def test_reads_an_hdfc_style_csv():
    out = statements.parse_statement("hdfc.csv", HDFC_CSV.encode())
    assert out["columns"]["description"] == "Narration" and out["columns"]["debit"] == "Withdrawal Amt."
    assert [(l["date"], l["amount"], l["direction"]) for l in out["lines"]] == [
        ("2026-10-01", 1250.0, "out"), ("2026-10-03", 150000.0, "in"), ("2026-10-05", 30000.0, "out"), ("2026-10-07", 12000.0, "out")]
    assert out["lines"][1]["balance"] == 248750.0 and out["lines"][0]["reference"] == "0000627412345678"


def test_reads_an_sbi_style_xlsx_with_real_dates():
    data = _xlsx([["Account Name", "Asha"], [], ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"],
                  [datetime(2026, 10, 2), datetime(2026, 10, 2), "TO TRANSFER-UPI/DR/1234/ELECTRICITY", "1234", 2400, None, 50000],
                  ["4 Oct 2026", "4 Oct 2026", "BY TRANSFER-INTEREST", "", "", "120.50", "50120.50"]])
    out = statements.parse_statement("sbi.xlsx", data)
    assert [(l["date"], l["amount"], l["direction"]) for l in out["lines"]] == [("2026-10-02", 2400.0, "out"), ("2026-10-04", 120.5, "in")]


@pytest.mark.parametrize("text,expected", [
    ("Date;Particulars;Amount;Dr/Cr\n12-10-2026;ATM WDL;5000;DR\n13-10-2026;REFUND;199;CR\n", [("2026-10-12", 5000.0, "out"), ("2026-10-13", 199.0, "in")]),
    ("Transaction Date,Description,Amount (INR)\n2026-10-12,Coffee,-250\n2026-10-13,Cashback,25\n", [("2026-10-12", 250.0, "out"), ("2026-10-13", 25.0, "in")]),
    ("Date\tNarration\tAmount\n14/10/2026\tRENT\t25,000.00 Dr\n", [("2026-10-14", 25000.0, "out")]),
    ("Date,Description,Debit,Credit\n10/13/2026,Card,100,\n", [("2026-10-13", 100.0, "out")]),  # can only be month first
])
def test_other_layouts(text, expected):
    lines = statements.parse_statement("s.csv", text.encode())["lines"]
    assert [(l["date"], l["amount"], l["direction"]) for l in lines] == expected


@pytest.mark.parametrize("name,data,message", [
    ("s.pdf", b"%PDF-1.4", "PDF"), ("s.xls", b"\xd0\xcf\x11\xe0rest", ".xls"),
    ("s.csv", b"just,some,words\nno,dates,here\n", "columns"),
    ("s.csv", b"Date,Narration,Withdrawal,Deposit\nfoo,bar,,\n", "no lines"),
])
def test_unreadable_files_say_why(name, data, message):
    with pytest.raises(statements.StatementError) as e:
        statements.parse_statement(name, data)
    assert message in str(e.value)


def test_payee_key_ignores_payment_rails():
    assert statements.payee_key("UPI-SWIGGY-swiggy@icici-ICIC0000123-627412345678-Dinner") == "SWIGGY"
    assert statements.payee_key("NEFT CR-ACME CORP-SALARY OCT") == "ACME"


# --- Against a database -------------------------------------------------------------------

def _setup(conn):
    conn.execute("INSERT OR IGNORE INTO institutions (name) VALUES ('HDFC Bank')")
    bank = conn.execute("SELECT id FROM institutions WHERE name = 'HDFC Bank'").fetchone()["id"]
    acc = conn.execute("INSERT INTO accounts (name, owner_id, institution_id) VALUES ('HDFC Savings', 1, ?)", (bank,)).lastrowid
    other = conn.execute("INSERT INTO accounts (name, owner_id, institution_id) VALUES ('SBI Savings', 1, ?)", (bank,)).lastrowid
    cat = lambda name: conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]
    loan = conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, lender_institution_id) VALUES ('HDFC Home Loan', ?, 1, 900000, 8.5, 30000, ?)",
                        (cat("Home Loan"), bank)).lastrowid
    card = conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, lender_institution_id) VALUES ('Regalia card', ?, 1, 40000, 0, 0, ?)",
                        (cat("Credit Card"), bank)).lastrowid
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                    VALUES ('None', 'Account', ?, 'Credit', 100000, '2026-09-01', 'Initial balance registration')""", (acc,))
    # Already in Artha: the salary on the day, and the EMI posted automatically a day early.
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                    VALUES ('None', 'Account', ?, 'Credit', 150000, '2026-10-03', 'Salary')""", (acc,))
    conn.execute("""INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                    VALUES ('Account', ?, 'Liability', ?, 'EMI', 30000, '2026-10-04', 'EMI for Oct 2026 (posted automatically)')""", (acc, loan))
    food = conn.execute("SELECT id FROM categories WHERE entity_type IN ('Expense', 'Transaction') LIMIT 1").fetchone()
    conn.commit()
    return {"acc": acc, "other": other, "loan": loan, "card": card, "food": food["id"] if food else None}


def test_analyse_marks_what_artha_has_and_suggests_the_rest(initialized_db):
    ids = _setup(initialized_db)
    if ids["food"]:
        initialized_db.execute("""INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, type, amount, transaction_date, notes, category_id)
                                  VALUES ('Account', ?, 'None', 'Debit', 300, '2026-08-01', 'UPI-SWIGGY-swiggy@icici-ICIC0000999-1-Lunch', ?)""", (ids["acc"], ids["food"]))
        initialized_db.commit()
    lines = statements.analyse(initialized_db, ids["acc"], statements.parse_statement("h.csv", HDFC_CSV.encode())["lines"])
    swiggy, salary, emi, card = lines
    assert salary["status"] == "duplicate" and "Salary" in salary["match"]
    assert emi["status"] == "probable_duplicate" and "2026-10-04" in emi["match"]
    assert card["status"] == "new" and card["counterpart"]["id"] == ids["card"]
    assert swiggy["status"] == "new" and swiggy["category_id"] == ids["food"]


def test_an_emi_amount_suggests_the_loan_when_not_yet_recorded(initialized_db):
    ids = _setup(initialized_db)
    initialized_db.execute("DELETE FROM transactions WHERE type = 'EMI'")
    initialized_db.commit()
    lines = statements.analyse(initialized_db, ids["acc"], statements.parse_statement("h.csv", HDFC_CSV.encode())["lines"])
    assert lines[2]["counterpart"] == {"type": "Liability", "id": ids["loan"], "reason": "Same as the HDFC Home Loan EMI"}


def test_preview_import_and_undo_through_the_api(initialized_db):
    from backend.main import app
    ids = _setup(initialized_db)
    with TestClient(app) as client:
        prev = client.post("/api/statements/preview", data={"account_id": str(ids["acc"])}, files={"file": ("hdfc.csv", HDFC_CSV.encode(), "text/csv")})
        assert prev.status_code == 200, prev.text
        body = prev.json()
        assert body["counts"] == {"new": 2, "duplicate": 1, "probable_duplicate": 1}
        assert body["statement_closing"] == {"date": "2026-10-07", "balance": 206750.0, "artha_balance_then": 220000.0}
        new = [l for l in body["lines"] if l["status"] == "new"]
        lines = [{**l, "counterpart": l["counterpart"] and {"type": l["counterpart"]["type"], "id": l["counterpart"]["id"]}} for l in new]
        lines.append({"date": "2026-10-08", "amount": 5000, "direction": "out", "description": "to SBI", "counterpart": {"type": "Account", "id": ids["other"]}})
        r = client.post("/api/statements/import", json={"account_id": ids["acc"], "file_name": "hdfc.csv", "lines": lines})
        assert r.status_code == 200, r.text
        # 100000 + 150000 - 30000 (EMI already there) - 1250 - 12000 - 5000
        assert r.json()["balance"] == 201750.0
        card = initialized_db.execute("SELECT outstanding FROM liabilities WHERE id = ?", (ids["card"],)).fetchone()[0]
        assert card == 28000  # the card bill paid it down
        kinds = {t["type"] for t in initialized_db.execute("SELECT type FROM transactions WHERE notes LIKE '%AUTOPAY%' OR notes = 'to SBI'")}
        assert kinds == {"Prepayment", "Transfer"}
        imports = client.get(f"/api/statements/imports?account_id={ids['acc']}").json()
        assert imports[0]["line_count"] == 3 and imports[0]["entries_left"] == 3
        assert client.delete(f"/api/statements/imports/{imports[0]['id']}").json()["removed"] == 3
        assert initialized_db.execute("SELECT outstanding FROM liabilities WHERE id = ?", (ids["card"],)).fetchone()[0] == 40000
        assert client.get("/api/statements/imports").json() == []
        bad = client.post("/api/statements/preview", data={"account_id": str(ids["acc"])}, files={"file": ("s.pdf", b"%PDF-1", "application/pdf")})
        assert bad.status_code == 422 and "PDF" in bad.json()["detail"]
        assert client.post("/api/statements/preview", data={"account_id": "9999"}, files={"file": ("h.csv", HDFC_CSV.encode(), "text/csv")}).status_code == 404
        same = client.post("/api/statements/import", json={"account_id": ids["acc"], "lines": [
            {"date": "2026-10-08", "amount": 1, "direction": "out", "counterpart": {"type": "Account", "id": ids["acc"]}}]})
        assert same.status_code == 400
        assert initialized_db.execute("SELECT COUNT(*) FROM statement_imports").fetchone()[0] == 0  # rolled back


@pytest.mark.parametrize("cell,expected", [
    ("500.00Dr", (500.0, "out")), ("1,250.00 Cr", (1250.0, "in")), ("Rs.", (None, None)), (".", (None, None)),
    ("(300)", (300.0, "out")), ("-", (None, None)), (0, (None, None)), (-75.5, (75.5, "out")),
])
def test_amount_cells(cell, expected):
    assert statements.parse_amount(cell) == expected


@pytest.mark.parametrize("cell,expected", [("1,000.00 Dr", -1000.0), ("2,500.00 Cr", 2500.0), ("0.00", 0.0), (0, 0.0), ("", None)])
def test_balance_cells_keep_their_sign(cell, expected):
    assert statements.parse_balance(cell) == expected


def test_a_glued_dr_suffix_in_an_amount_column_is_money_out():
    lines = statements.parse_statement("s.csv", b"Date,Description,Amount\n12/10/2026,RENT,25000.00Dr\n12/10/2026,Junk,Rs.\n")["lines"]
    assert [(l["amount"], l["direction"]) for l in lines] == [(25000.0, "out")]


def test_deleting_the_account_forgets_its_imports(initialized_db):
    from backend.main import app
    ids = _setup(initialized_db)
    with TestClient(app) as client:
        client.post("/api/statements/import", json={"account_id": ids["acc"], "lines": [{"date": "2026-10-08", "amount": 10, "direction": "out"}]})
        assert len(client.get("/api/statements/imports").json()) == 1
        assert client.delete(f"/api/entities/accounts/{ids['acc']}?with_entries=true").status_code == 200
        assert client.get("/api/statements/imports").json() == []
    assert initialized_db.execute("SELECT COUNT(*) FROM statement_import_entries").fetchone()[0] == 0
