"""
Digital ledger CRUD + field-scoped production report.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import (
    BUILTIN_LEDGER_CATEGORIES,
    LedgerCategoryRow,
    LedgerEntry,
)
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import LedgerEntryCreateRequest, ReportResponse, TransactionItem
from app.services.crop_health_service import get_crop_health
from app.services.field_service import get_field_or_404


def create_ledger_entry(
    db: Session, user_id: uuid.UUID, entry_in: LedgerEntryCreateRequest
) -> LedgerEntry:
    field = db.query(Field).filter(Field.id == entry_in.field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    # Any head used is remembered so it stays in the dropdown next time, even
    # if it wasn't created explicitly via POST /ledger/categories first.
    _register_category(db, user_id, entry_in.category)

    entry = LedgerEntry(
        field_id=entry_in.field_id,
        title=entry_in.title,
        detail=entry_in.detail,
        category=entry_in.category,
        amount=entry_in.amount,
        entry_type=entry_in.entry_type,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _register_category(db: Session, user_id: uuid.UUID, name: str) -> None:
    """Persist a custom head so it's reusable. No-op for built-ins or dupes.
    Adds to the session without committing — the caller's commit covers it."""
    if name in BUILTIN_LEDGER_CATEGORIES:
        return
    exists = (
        db.query(LedgerCategoryRow)
        .filter(LedgerCategoryRow.user_id == user_id, LedgerCategoryRow.name == name)
        .first()
    )
    if exists is None:
        db.add(LedgerCategoryRow(user_id=user_id, name=name))


def list_ledger_categories(db: Session, user_id: uuid.UUID) -> list[str]:
    """Built-in heads first, then the user's custom heads (alphabetical)."""
    custom = (
        db.query(LedgerCategoryRow.name)
        .filter(LedgerCategoryRow.user_id == user_id)
        .order_by(LedgerCategoryRow.name)
        .all()
    )
    return BUILTIN_LEDGER_CATEGORIES + [name for (name,) in custom]


def create_ledger_category(db: Session, user_id: uuid.UUID, name: str) -> list[str]:
    _register_category(db, user_id, name)
    db.commit()
    return list_ledger_categories(db, user_id)


def list_ledger_entries_for_user(db: Session, user_id: uuid.UUID) -> list[LedgerEntry]:
    return (
        db.query(LedgerEntry)
        .join(Field)
        .filter(Field.user_id == user_id)
        .order_by(LedgerEntry.timestamp.desc())
        .all()
    )


def build_report(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> ReportResponse:
    field = get_field_or_404(db, user_id, field_id)

    entries = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.field_id == field_id)
        .order_by(LedgerEntry.timestamp.asc())
        .all()
    )

    total_spent = round(
        sum(float(e.amount) for e in entries if e.amount is not None and e.entry_type == "expense"), 2
    )
    total_earned = round(
        sum(float(e.amount) for e in entries if e.amount is not None and e.entry_type == "income"), 2
    )
    net = round(total_earned - total_spent, 2)

    health = get_crop_health(db, user_id, field_id)
    latest_history = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc())
        .first()
    )

    transactions = [
        TransactionItem(
            id=e.id,
            timestamp=e.timestamp,
            category=e.category,
            title=e.title,
            detail=e.detail,
            amount=float(e.amount) if e.amount is not None else None,
            entry_type=e.entry_type,
        )
        for e in entries
    ]

    return ReportResponse(
        field_name=field.name,
        crop=field.crop,
        area_hectares=field.area_hectares,
        ndvi_mean=latest_history.ndvi_mean if latest_history else None,
        health_score=health.health_score,
        transactions=transactions,
        total_spent=total_spent,
        total_earned=total_earned,
        net=net,
        generated_at=datetime.now(timezone.utc),
    )
