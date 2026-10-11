"""Payslip PDF reading: month detection, label/amount pairs, passwords, scanned files, the route."""
import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from backend.tax.payslip_pdf import PayslipPdfError, find_amounts, find_pay_month, read_payslip


def make_pdf(lines, text=True) -> bytes:
    """A one-page PDF with the given text lines (Helvetica), built by hand."""
    def esc(t):
        return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = ("BT /F1 9 Tf 13 TL 30 800 Td " + " ".join(f"({esc(l)}) Tj T*" for l in lines) + " ET") if text else "0 0 m 100 100 l S"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def encrypt(data: bytes, password: str) -> bytes:
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(data)))
    writer.encrypt(password, algorithm="AES-256")
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


PAYSLIP = [
    "Acme Technologies Pvt Ltd",
    "Pay Slip for the month of April 2026",
    "Employee Code 10234     Date of Joining 01/06/2020     UAN 100200300400",
    "Days Worked 30     LOP Days 0     Bank A/c No 1234567890",
    "Earnings      Amount        YTD             Deductions        Amount",
    "Basic Salary   1,12,500.00   1,12,500.00     Provident Fund    1,800.00",
    "HRA   45,000.00   45,000.00     Professional Tax    200.00",
    "Special Allowance   67,563.00   67,563.00     Income Tax    95,340.00",
    "Gross Earnings   2,25,063.00     Total Deductions   97,340.00",
    "Net Pay   1,27,723.00",
]


def as_dict(items):
    return {i["label"]: i["amount"] for i in items}


def test_reads_month_and_two_column_amounts():
    out = read_payslip(make_pdf(PAYSLIP))
    assert out["month"] == {"year": 2026, "month": 4}
    got = as_dict(out["items"])
    assert got["Basic Salary"] == 112500 and got["HRA"] == 45000 and got["Special Allowance"] == 67563
    assert got["Provident Fund"] == 1800 and got["Professional Tax"] == 200 and got["Income Tax"] == 95340
    assert got["Net Pay"] == 127723  # totals are kept here; the import mapping ignores them by default
    assert out["warnings"] == []


def test_identifiers_counts_and_dates_are_not_money():
    labels = " | ".join(i["label"] for i in read_payslip(make_pdf(PAYSLIP))["items"])
    for word in ("Code", "UAN", "Days", "LOP", "A/c", "Joining", "April"):
        assert word not in labels


def test_year_to_date_column_is_not_a_second_item():
    got = as_dict(find_amounts("Basic Salary 1,12,500.00 13,50,000.00"))
    assert got == {"Basic Salary": 112500}


def test_amount_formats():
    got = as_dict(find_amounts("Conveyance: Rs. 1,600   LTA ₹ 12,000.50   Bonus INR 100,000"))
    assert got == {"Conveyance": 1600, "LTA": 12000.5, "Bonus": 100000}


@pytest.mark.parametrize("text,expected", [
    ("Salary slip for Sept '26", {"year": 2026, "month": 9}),
    ("Payslip for the period 03/2027", {"year": 2027, "month": 3}),
    ("Joined January 2019\nPay slip for the month of June 2026", {"year": 2026, "month": 6}),  # the hinted line wins
    ("Nothing useful here", None),
])
def test_pay_month(text, expected):
    assert find_pay_month(text) == expected


def test_password_protected():
    locked = encrypt(make_pdf(PAYSLIP), "ABCDE1234F")
    with pytest.raises(PayslipPdfError) as e:
        read_payslip(locked)
    assert e.value.code == "password_required"
    with pytest.raises(PayslipPdfError) as e:
        read_payslip(locked, "wrong")
    assert e.value.code == "wrong_password"
    assert as_dict(read_payslip(locked, "ABCDE1234F")["items"])["HRA"] == 45000


def test_scanned_and_non_pdf_files():
    with pytest.raises(PayslipPdfError) as e:
        read_payslip(make_pdf([], text=False))
    assert e.value.code == "no_text"
    with pytest.raises(PayslipPdfError) as e:
        read_payslip(b"this is not a pdf")
    assert e.value.code == "unreadable"


def test_no_month_is_a_warning_not_an_error():
    out = read_payslip(make_pdf(["Basic 50,000", "HRA 20,000"]))
    assert out["month"] is None and "pick the month" in out["warnings"][0]


def test_route_reads_several_files_with_per_file_errors(test_db_path):
    from backend.main import app
    may = make_pdf([l.replace("April 2026", "May 2026") for l in PAYSLIP])
    files = [("files", ("apr.pdf", make_pdf(PAYSLIP), "application/pdf")),
             ("files", ("may.pdf", may, "application/pdf")),
             ("files", ("locked.pdf", encrypt(may, "pw"), "application/pdf"))]
    with TestClient(app) as client:
        r = client.post("/api/tax/payslip-pdf", files=files)
        unlocked = client.post("/api/tax/payslip-pdf", files=[files[2]], data={"password": "pw"})
    res = r.json()["results"]
    assert [x["file"] for x in res] == ["apr.pdf", "may.pdf", "locked.pdf"]
    assert res[0]["month"]["month"] == 4 and res[1]["month"]["month"] == 5
    assert res[2]["error"] == "password_required"
    assert unlocked.json()["results"][0]["month"]["month"] == 5
