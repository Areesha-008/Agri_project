"""add ndre and nbr2 columns to ndvi_history

Revision ID: 59fd0ce051d8
Revises: b7c9d1e3f5a7
Create Date: 2026-07-25 18:30:00.000000

Adds NDRE (red-edge / nitrogen) and NBR2 (residue / burn) stats + overlay
PNG columns alongside the existing NDVI/NDMI ones. All nullable — history
rows written before these indices existed simply have no value here, exactly
as the NDMI columns were added.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '59fd0ce051d8'
down_revision: Union[str, None] = 'b7c9d1e3f5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ndvi_history', sa.Column('ndre_mean', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('ndre_min', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('ndre_max', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('nbr2_mean', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('nbr2_min', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('nbr2_max', sa.Float(), nullable=True))
    op.add_column('ndvi_history', sa.Column('ndre_png_url', sa.String(), nullable=True))
    op.add_column('ndvi_history', sa.Column('nbr2_png_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('ndvi_history', 'nbr2_png_url')
    op.drop_column('ndvi_history', 'ndre_png_url')
    op.drop_column('ndvi_history', 'nbr2_max')
    op.drop_column('ndvi_history', 'nbr2_min')
    op.drop_column('ndvi_history', 'nbr2_mean')
    op.drop_column('ndvi_history', 'ndre_max')
    op.drop_column('ndvi_history', 'ndre_min')
    op.drop_column('ndvi_history', 'ndre_mean')
