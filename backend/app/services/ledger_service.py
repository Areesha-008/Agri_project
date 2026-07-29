"""
Digital ledger CRUD + production report aggregation.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import (
    BUILTIN_LEDGER_CATEGORIES,
    LedgerCategoryRow,
    LedgerEntry,
)
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import FieldReportSummary, LedgerEntryCreateRequest, ReportResponse
from app.services.crop_health_service import get_crop_health


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


def build_report(db: Session, user_id: uuid.UUID) -> ReportResponse:
    fields = db.query(Field).filter(Field.user_id == user_id).order_by(Field.created_at).all()
    ledger_count = (
        db.query(LedgerEntry).join(Field).filter(Field.user_id == user_id).count()
    )

    # Money totals: sum amounts per direction across this user's fields' entries.
    money_rows = (
        db.query(LedgerEntry.entry_type, func.coalesce(func.sum(LedgerEntry.amount), 0))
        .join(Field)
        .filter(Field.user_id == user_id, LedgerEntry.amount.isnot(None))
        .group_by(LedgerEntry.entry_type)
        .all()
    )
    totals = {etype: float(total) for etype, total in money_rows}
    total_spent = round(totals.get("expense", 0.0), 2)
    total_earned = round(totals.get("income", 0.0), 2)
    net = round(total_earned - total_spent, 2)

    total_hectares = round(sum(f.area_hectares or 0.0 for f in fields), 1)

    field_summaries: list[FieldReportSummary] = []
    health_scores: list[int] = []
    for field in fields:
        health = get_crop_health(db, user_id, field.id)
        health_scores.append(health.health_score)

        latest_history = (
            db.query(NdviHistory)
            .filter(NdviHistory.field_id == field.id)
            .order_by(NdviHistory.satellite_image_date.desc())
            .first()
        )
        field_summaries.append(
            FieldReportSummary(
                name=field.name,
                crop=field.crop,
                area_hectares=field.area_hectares,
                ndvi_mean=latest_history.ndvi_mean if latest_history else None,
                health_score=health.health_score,
            )
        )

    avg_health = round(sum(health_scores) / len(health_scores)) if health_scores else 0

    return ReportResponse(
        total_hectares=total_hectares,
        field_count=len(fields),
        avg_health_score=avg_health,
        ledger_entry_count=ledger_count,
        total_spent=total_spent,
        total_earned=total_earned,
        net=net,
        field_summaries=field_summaries,
        generated_at=datetime.now(timezone.utc),
    )
