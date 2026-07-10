"""seed district yield baselines

Revision ID: a857828af3db
Revises: 3da7f6c17f4f
Create Date: 2026-07-10 09:00:46.737275

Seeds DistrictYieldBaseline with a mandatory DEFAULT/DEFAULT fallback row
(so crop_health_service never crashes on a field with no district/crop set)
plus a handful of real Punjab district+crop combinations. Values are derived
from the design's sample field data (design_handoff/designs/Jadeed Kashtkar
App.dc.html, `fields` array) by solving baseline = sample / (health/100) —
i.e. the baseline NDVI/yield that would make the design's sample health
scores and yields fall out of the formula in crop_health_service.py.
Marked as reference data pending agronomy team review, same as GAPS.md's
note on the health/yield formula itself.
"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a857828af3db'
down_revision: Union[str, None] = '3da7f6c17f4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


baseline_table = sa.table(
    "district_yield_baseline",
    sa.column("id", sa.UUID()),
    sa.column("district", sa.String),
    sa.column("crop", sa.String),
    sa.column("baseline_ndvi", sa.Float),
    sa.column("baseline_yield_maund_per_acre", sa.Float),
    sa.column("baseline_yield_t_per_ha", sa.Float),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

# (district, crop, baseline_ndvi, baseline_yield_maund_per_acre, baseline_yield_t_per_ha)
SEED_ROWS = [
    ("DEFAULT", "DEFAULT", 0.84, 77.0, 6.2),
    ("Faisalabad", "Wheat", 0.84, 77.0, 6.2),
    ("Rahim Yar Khan", "Cotton", 0.83, 38.0, 1.55),
    ("Lahore", "Rice", 0.87, 50.0, 4.02),
    ("Muzaffargarh", "Sugarcane", 0.90, 1000.0, 100.0),
]


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    op.bulk_insert(
        baseline_table,
        [
            {
                "id": uuid.uuid4(),
                "district": district,
                "crop": crop,
                "baseline_ndvi": ndvi,
                "baseline_yield_maund_per_acre": maund,
                "baseline_yield_t_per_ha": t_ha,
                "updated_at": now,
            }
            for district, crop, ndvi, maund, t_ha in SEED_ROWS
        ],
    )


def downgrade() -> None:
    conn = op.get_bind()
    for district, crop, *_ in SEED_ROWS:
        conn.execute(
            baseline_table.delete().where(
                baseline_table.c.district == district, baseline_table.c.crop == crop
            )
        )
