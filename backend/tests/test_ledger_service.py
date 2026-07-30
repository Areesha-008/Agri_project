"""
build_report is DB-backed (field lookup, ledger entries, crop health), so
these hit the real configured database directly — same approach as
test_ndvi_history_upsert.py, since there's no DB-test fixture in this repo
yet. Creates and tears down its own throwaway user+field(s).
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import (
    FieldNotFoundError,
    FutureEntryDateError,
    LedgerEntryNotFoundError,
)
from app.models.field import Field
from app.models.ledger_entry import LedgerEntry
from app.models.user import User
from app.schemas.ledger import LedgerEntryCreateRequest, LedgerEntryUpdateRequest
from app.services.ledger_service import (
    build_report,
    create_ledger_entry,
    delete_ledger_entry,
    list_ledger_categories,
    list_ledger_entries_for_user,
    update_ledger_entry,
)

_POLYGON = Polygon([(73.0, 31.0), (73.001, 31.0), (73.001, 31.001), (73.0, 31.001), (73.0, 31.0)])


def _make_user(db) -> User:
    user = User(email=f"report-test-{uuid.uuid4().hex}@example.invalid", hashed_password="x")
    db.add(user)
    db.flush()
    return user


def _make_field(db, user: User) -> Field:
    field = Field(
        user_id=user.id,
        name="report-test-field",
        geometry=from_shape(_POLYGON, srid=4326),
        area_hectares=12.5,
        crop="Wheat",
    )
    db.add(field)
    db.flush()
    return field


def test_build_report_orders_transactions_chronologically_and_totals_money():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        now = datetime.now(timezone.utc)
        # Inserted newest-first, on purpose, so the assertion actually proves
        # build_report sorts rather than happening to preserve insertion order.
        db.add(LedgerEntry(
            field_id=field.id, title="Wheat — sold", detail="40 maund",
            category="Sale", amount=96000, entry_type="income", timestamp=now,
        ))
        db.add(LedgerEntry(
            field_id=field.id, title="Fertilizer logged", detail="2 bags urea/acre",
            category="Fertilizer", amount=4500, entry_type="expense",
            timestamp=now - timedelta(days=10),
        ))
        db.commit()

        report = build_report(db, user.id, field.id)

        assert [t.title for t in report.transactions] == ["Fertilizer logged", "Wheat — sold"]
        assert report.total_spent == 4500.0
        assert report.total_earned == 96000.0
        assert report.net == 91500.0
        assert report.field_name == "report-test-field"
        assert report.crop == "Wheat"
        assert report.area_hectares == 12.5
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_empty_field_has_no_transactions_and_zero_totals():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        report = build_report(db, user.id, field.id)

        assert report.transactions == []
        assert report.total_spent == 0.0
        assert report.total_earned == 0.0
        assert report.net == 0.0
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_raises_for_unknown_field():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        db.commit()

        with pytest.raises(FieldNotFoundError):
            build_report(db, user.id, uuid.uuid4())
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_raises_for_field_owned_by_another_user():
    db = SessionLocal()
    owner = None
    other = None
    try:
        owner = _make_user(db)
        other = _make_user(db)
        field = _make_field(db, owner)
        db.commit()

        with pytest.raises(FieldNotFoundError):
            build_report(db, other.id, field.id)
    finally:
        if owner is not None:
            db.query(User).filter(User.id == owner.id).delete()
        if other is not None:
            db.query(User).filter(User.id == other.id).delete()
        db.commit()
        db.close()


def _entry_request(**overrides) -> LedgerEntryCreateRequest:
    defaults = dict(title="Entry", detail="detail", category="Spray", amount=100.0, entry_type="expense")
    defaults.update(overrides)
    return LedgerEntryCreateRequest(**defaults)


def test_create_ledger_entry_with_past_entry_date_stores_that_date():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        past_date = (datetime.now(timezone.utc) - timedelta(days=10)).date()
        entry = create_ledger_entry(
            db, user.id, _entry_request(field_id=field.id, entry_date=past_date)
        )

        assert entry.timestamp.date() == past_date
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_create_ledger_entry_orders_backdated_entries_chronologically_in_report():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        today = datetime.now(timezone.utc).date()
        # Created out of chronological order on purpose, matching the file's
        # existing convention of proving build_report sorts, not just echoes.
        create_ledger_entry(
            db, user.id,
            _entry_request(field_id=field.id, title="Recent spray", entry_date=today - timedelta(days=1)),
        )
        create_ledger_entry(
            db, user.id,
            _entry_request(field_id=field.id, title="Old fertilizer", entry_date=today - timedelta(days=10)),
        )

        report = build_report(db, user.id, field.id)

        assert [t.title for t in report.transactions] == ["Old fertilizer", "Recent spray"]
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_create_ledger_entry_rejects_entry_date_two_days_in_future():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        future_date = (datetime.now(timezone.utc) + timedelta(days=2)).date()

        with pytest.raises(FutureEntryDateError):
            create_ledger_entry(db, user.id, _entry_request(field_id=field.id, entry_date=future_date))
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_create_ledger_entry_accepts_entry_date_one_day_ahead_of_utc_today():
    """Boundary case: the +1-day grace exists so a user in a positive UTC
    offset can still log their own local "today" during the hours where it's
    already tomorrow locally but still today in UTC. This must not regress
    into a naive same-day-only check."""
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        grace_date = (datetime.now(timezone.utc) + timedelta(days=1)).date()

        entry = create_ledger_entry(db, user.id, _entry_request(field_id=field.id, entry_date=grace_date))

        assert entry.timestamp.date() == grace_date
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_ties_on_entry_date_break_by_created_at():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        same_moment = datetime.now(timezone.utc) - timedelta(days=5)
        # Same `timestamp` on both rows on purpose — only created_at differs,
        # proving the tie-break is actually used, not just a coincidence of
        # distinct timestamps.
        db.add(LedgerEntry(
            field_id=field.id, title="Second created", detail="", category="Spray",
            amount=100, entry_type="expense",
            timestamp=same_moment, created_at=same_moment + timedelta(seconds=10),
        ))
        db.add(LedgerEntry(
            field_id=field.id, title="First created", detail="", category="Spray",
            amount=200, entry_type="expense",
            timestamp=same_moment, created_at=same_moment,
        ))
        db.commit()

        report = build_report(db, user.id, field.id)

        assert [t.title for t in report.transactions] == ["First created", "Second created"]
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_update_ledger_entry_changes_fields_and_report_reflects_new_values():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        entry = create_ledger_entry(db, user.id, _entry_request(field_id=field.id, title="Original", amount=500))

        new_date = (datetime.now(timezone.utc) - timedelta(days=3)).date()
        updated = update_ledger_entry(
            db, user.id, entry.id,
            LedgerEntryUpdateRequest(
                title="Edited", detail="new detail", category="Fertilizer",
                amount=750, entry_type="expense", entry_date=new_date,
            ),
        )

        assert updated.title == "Edited"
        assert updated.category == "Fertilizer"
        assert updated.amount == 750
        assert updated.timestamp.date() == new_date

        report = build_report(db, user.id, field.id)
        assert report.transactions[0].title == "Edited"
        assert report.total_spent == 750.0
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_update_ledger_entry_registers_new_category():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        entry = create_ledger_entry(db, user.id, _entry_request(field_id=field.id))

        update_ledger_entry(
            db, user.id, entry.id,
            LedgerEntryUpdateRequest(
                title="Original", detail="", category="Custom Head",
                amount=100, entry_type="expense", entry_date=None,
            ),
        )

        assert "Custom Head" in list_ledger_categories(db, user.id)
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_delete_ledger_entry_removes_from_list_and_report():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        entry = create_ledger_entry(db, user.id, _entry_request(field_id=field.id, title="To delete"))

        delete_ledger_entry(db, user.id, entry.id)

        assert list_ledger_entries_for_user(db, user.id) == []
        report = build_report(db, user.id, field.id)
        assert report.transactions == []
        assert report.total_spent == 0.0
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_update_and_delete_ledger_entry_raise_for_entry_owned_by_another_user():
    db = SessionLocal()
    owner = None
    other = None
    try:
        owner = _make_user(db)
        other = _make_user(db)
        field = _make_field(db, owner)
        db.commit()

        entry = create_ledger_entry(db, owner.id, _entry_request(field_id=field.id))

        with pytest.raises(LedgerEntryNotFoundError):
            update_ledger_entry(
                db, other.id, entry.id,
                LedgerEntryUpdateRequest(title="y", detail="", category="Spray", amount=100, entry_type="expense"),
            )

        with pytest.raises(LedgerEntryNotFoundError):
            delete_ledger_entry(db, other.id, entry.id)
    finally:
        if owner is not None:
            db.query(User).filter(User.id == owner.id).delete()
        if other is not None:
            db.query(User).filter(User.id == other.id).delete()
        db.commit()
        db.close()


def test_update_and_delete_ledger_entry_raise_for_nonexistent_entry():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        db.commit()

        with pytest.raises(LedgerEntryNotFoundError):
            update_ledger_entry(
                db, user.id, uuid.uuid4(),
                LedgerEntryUpdateRequest(title="y", detail="", category="Spray", amount=100, entry_type="expense"),
            )

        with pytest.raises(LedgerEntryNotFoundError):
            delete_ledger_entry(db, user.id, uuid.uuid4())
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()
