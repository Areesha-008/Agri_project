"""
Digital ledger CRUD + production report aggregation.

Report formula (from design_handoff/designs/Jadeed Kashtkar App.dc.html,
~line 935-946 — the report-builder's live calculation):
    acres = total_hectares * 2.47
    urea_bags = round(acres * 1.6)
    dap_bags  = round(acres * 1.0)
    sop_bags  = round(acres * 0.5)
Flagged in GAPS.md alongside the health/yield formula: these are the
design's placeholder rates ("per PARC guidance, verify with local
extension officer" per the report footnote), not a validated agronomy
model.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import LedgerEntry
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import FieldReportSummary, LedgerEntryCreateRequest, ReportResponse
from app.services.crop_health_service import get_crop_health

HECTARES_TO_ACRES = 2.47
UREA_BAGS_PER_ACRE = 1.6
DAP_BAGS_PER_ACRE = 1.0
SOP_BAGS_PER_ACRE = 0.5


def calculate_fertilizer_bags(total_hectares: float) -> tuple[int, int, int]:
    """Pure formula, split out from build_report so it's unit-testable without a DB session."""
    acres = total_hectares * HECTARES_TO_ACRES
    return (
        round(acres * UREA_BAGS_PER_ACRE),
        round(acres * DAP_BAGS_PER_ACRE),
        round(acres * SOP_BAGS_PER_ACRE),
    )


def create_ledger_entry(
    db: Session, user_id: uuid.UUID, entry_in: LedgerEntryCreateRequest
) -> LedgerEntry:
    field = db.query(Field).filter(Field.id == entry_in.field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    entry = LedgerEntry(
        field_id=entry_in.field_id,
        title=entry_in.title,
        detail=entry_in.detail,
        category=entry_in.category,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


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

    total_hectares = round(sum(f.area_hectares or 0.0 for f in fields), 1)
    urea_bags, dap_bags, sop_bags = calculate_fertilizer_bags(total_hectares)

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
        urea_bags=urea_bags,
        dap_bags=dap_bags,
        sop_bags=sop_bags,
        ledger_entry_count=ledger_count,
        field_summaries=field_summaries,
        generated_at=datetime.now(timezone.utc),
    )
