"""
LedgerEntry — one farm-input/operation record per the design's Digital
Ledger timeline (log-action form -> prepended entry). Always tied to a
field (matches the `LedgerEntry { ..., fieldId }` data contract) — the
design's ledger entries are all scoped to a field in the sample data.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.field import Field


class LedgerCategory(str, enum.Enum):
    Fertilizer = "Fertilizer"
    Irrigation = "Irrigation"
    Spray = "Spray"
    Operation = "Operation"
    Scan = "Scan"


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[LedgerCategory] = mapped_column(
        SAEnum(LedgerCategory, name="ledger_category", native_enum=True), nullable=False
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    field: Mapped["Field"] = relationship("Field")

    def __repr__(self) -> str:
        return f"<LedgerEntry id={self.id} field_id={self.field_id} category={self.category}>"
