"""
NdviHistory model — one row per NDVI computation for a given Field.

Kept separate from Field (rather than storing "latest NDVI" columns on
Field itself) because a field will be re-analyzed repeatedly over time.
This table is what the future "Historical Vegetation Analysis" module
queries directly — no schema change needed when that module is built.

Note: in Module 1, NDVI is computed synchronously and returned directly to
the (possibly anonymous) user without touching this table. A row is only
written here when an authenticated user clicks "Save" on an already-viewed
NDVI result — see services/earth_engine/ndvi_processor.py and the
fields/save route for how the two connect.
"""

import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# See app/models/user.py for why this is TYPE_CHECKING-guarded.
if TYPE_CHECKING:
    from app.models.field import Field


class NdviHistory(Base):
    __tablename__ = "ndvi_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )

    ndvi_mean: Mapped[float] = mapped_column(Float, nullable=False)
    ndvi_min: Mapped[float] = mapped_column(Float, nullable=False)
    ndvi_max: Mapped[float] = mapped_column(Float, nullable=False)

    # NDMI (moisture index) computed from the same scene/date window as the
    # NDVI stats above. Nullable because rows written before NDMI support
    # was added won't have these.
    ndmi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndmi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndmi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # NDRE (red-edge / nitrogen) and NBR2 (residue / burn), same scene as the
    # stats above. Nullable for the same reason as NDMI — rows written before
    # these indices existed have no value to backfill.
    ndre_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndre_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndre_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    nbr2_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # NDWI (open water), CCI (chlorophyll/carotenoid), EVI, SAVI — same scene,
    # same nullable-for-back-compat treatment.
    ndwi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndwi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ndwi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cci_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    savi_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Absolute URLs to the rendered overlay PNGs (see
    # services/satellite/visualization.py), so history rows are
    # self-sufficient for the trend chart's map thumbnails without
    # recomputing anything.
    ndvi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndmi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndre_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    nbr2_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ndwi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cci_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    evi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    savi_png_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Start of the requested search window (end is satellite_image_date
    # below). Nullable because rows written before this column existed have
    # no recoverable value — leave those NULL rather than guessing.
    date_range_start: Mapped[Optional[date]] = mapped_column(nullable=True)

    # Date of the Sentinel-2 image used for this computation (not when we
    # computed it — that's computed_at below). Distinguishing these matters:
    # a user might re-run analysis on the same underlying satellite image.
    satellite_image_date: Mapped[date] = mapped_column(nullable=False)
    cloud_cover_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Which Sentinel-2 collection/product this came from, e.g.
    # "COPERNICUS/S2_SR_HARMONIZED". Useful once multiple satellite sources
    # exist (Sentinel-2, drone imagery, etc. in later modules).
    source_collection: Mapped[str] = mapped_column(String(255), nullable=False)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    field: Mapped["Field"] = relationship("Field", back_populates="ndvi_history")

    def __repr__(self) -> str:
        return f"<NdviHistory id={self.id} field_id={self.field_id} mean={self.ndvi_mean}>"