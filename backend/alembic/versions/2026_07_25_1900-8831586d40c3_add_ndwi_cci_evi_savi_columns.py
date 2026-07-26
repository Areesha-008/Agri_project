"""add ndwi, cci, evi, savi columns to ndvi_history

Revision ID: 8831586d40c3
Revises: 59fd0ce051d8
Create Date: 2026-07-25 19:00:00.000000

Adds NDWI (open water), CCI (chlorophyll/carotenoid), EVI and SAVI stats +
overlay PNG columns, alongside the existing NDVI/NDMI/NDRE/NBR2 ones. All
nullable — pre-existing history rows simply have no value here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8831586d40c3'
down_revision: Union[str, None] = '59fd0ce051d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDICES = ("ndwi", "cci", "evi", "savi")


def upgrade() -> None:
    for key in _INDICES:
        op.add_column('ndvi_history', sa.Column(f'{key}_mean', sa.Float(), nullable=True))
        op.add_column('ndvi_history', sa.Column(f'{key}_min', sa.Float(), nullable=True))
        op.add_column('ndvi_history', sa.Column(f'{key}_max', sa.Float(), nullable=True))
        op.add_column('ndvi_history', sa.Column(f'{key}_png_url', sa.String(), nullable=True))


def downgrade() -> None:
    for key in reversed(_INDICES):
        op.drop_column('ndvi_history', f'{key}_png_url')
        op.drop_column('ndvi_history', f'{key}_max')
        op.drop_column('ndvi_history', f'{key}_min')
        op.drop_column('ndvi_history', f'{key}_mean')
