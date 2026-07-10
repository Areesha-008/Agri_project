"""
MandiRate — reference table of commodity prices, one row per commodity.

Per GAPS.md Gap 7 / instructions section 0.3: building a real mandi-rate
scraper/integration is explicitly out of scope. This table holds the mock
values from the design (design_handoff/designs/Jadeed Kashtkar App.dc.html,
`market` array) as a stand-in, seeded via an Alembic data migration.
`base_price_pkr_per_40kg` is the Faisalabad reference price; the per-city
multiplier (Faisalabad ×1 / Lahore ×1.02 / Multan ×0.975, from the same
design file) is applied at read time in mandi_rate_service, not stored.

# TODO: real data source pending — swap the seed/service for a live district
# market committee feed when one is available; the API shape (MandiRate
# contract) stays the same so the frontend doesn't need to change.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MandiRate(Base):
    __tablename__ = "mandi_rates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    commodity: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    urdu_name: Mapped[str] = mapped_column(String(64), nullable=False)

    base_price_pkr_per_40kg: Mapped[float] = mapped_column(Float, nullable=False)
    change_pct: Mapped[float] = mapped_column(Float, nullable=False)
    history_7d: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<MandiRate commodity={self.commodity}>"
