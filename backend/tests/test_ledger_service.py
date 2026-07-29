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
from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import LedgerEntry
from app.models.user import User
from app.services.ledger_service import build_report

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
