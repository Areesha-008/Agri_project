"""ndvi_history unique per field+satellite_image_date

Revision ID: 8a5201e2041d
Revises: 8831586d40c3
Create Date: 2026-07-28 04:38:00.000000

Repeated re-analysis of a week that already had a row (overlapping picker
windows, a retry, two concurrent requests) used to insert a brand new row
instead of updating the existing one — one field accumulated 46 rows for
15 actual distinct weeks, which is what made the season trend chart look
like it was repeating the same value across several dots. The application
layer now upserts by (field_id, satellite_image_date) (see
run_ndvi_job in app/services/ndvi_job_service.py), but that's only enforced
if every write path remembers to do it — this constraint makes it impossible
at the database level, for this or any future caller.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8a5201e2041d'
down_revision: Union[str, None] = '8831586d40c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        'uq_ndvi_history_field_id_satellite_image_date',
        'ndvi_history',
        ['field_id', 'satellite_image_date'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_ndvi_history_field_id_satellite_image_date',
        'ndvi_history',
        type_='unique',
    )
