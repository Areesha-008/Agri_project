"""
_amount_str/_amount_class are the money-formatting branches inside the PDF
template (sign, color class, or an em dash for no-amount entries) — pure
functions, no DB or WeasyPrint rendering needed to check them.
"""

import uuid
from datetime import datetime, timezone

from app.schemas.ledger import TransactionItem
from app.services.report_pdf import _amount_class, _amount_str


def _tx(amount, entry_type):
    return TransactionItem(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 6, 15, tzinfo=timezone.utc),
        category="Fertilizer",
        title="t",
        detail="d",
        amount=amount,
        entry_type=entry_type,
    )


def test_amount_str_expense_shows_minus_sign_and_thousands_separator():
    assert _amount_str(_tx(4500, "expense")) == "− PKR 4,500"


def test_amount_str_income_shows_plus_sign():
    assert _amount_str(_tx(96000, "income")) == "+ PKR 96,000"


def test_amount_str_none_shows_em_dash():
    assert _amount_str(_tx(None, "expense")) == "—"


def test_amount_class_expense_is_amt_out():
    assert _amount_class(_tx(4500, "expense")) == "amt-out"


def test_amount_class_income_is_amt_in():
    assert _amount_class(_tx(96000, "income")) == "amt-in"


def test_amount_class_none_is_amt_none():
    assert _amount_class(_tx(None, "expense")) == "amt-none"
