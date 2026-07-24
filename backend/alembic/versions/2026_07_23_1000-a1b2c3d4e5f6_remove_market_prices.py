"""remove market prices

Drops the mandi_rates table and the two market-price columns on user_settings
(default_mandi, alert_price) now that the Market Prices module is removed. The
alert_category enum keeps its inert 'price' value on purpose — dropping a
Postgres enum value is disproportionately painful and nothing emits it anymore.

Revision ID: a1b2c3d4e5f6
Revises: e2ff0391b90e
Create Date: 2026-07-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e2ff0391b90e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('user_settings', 'alert_price')
    op.drop_column('user_settings', 'default_mandi')
    op.drop_table('mandi_rates')


def downgrade() -> None:
    # Recreates the table structure only — the seed data from the original
    # add_and_seed_mandi_rates migration is not restored (re-seed manually if
    # you ever need it back).
    op.create_table(
        'mandi_rates',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('commodity', sa.String(length=64), nullable=False),
        sa.Column('urdu_name', sa.String(length=64), nullable=False),
        sa.Column('base_price_pkr_per_40kg', sa.Float(), nullable=False),
        sa.Column('change_pct', sa.Float(), nullable=False),
        sa.Column('history_7d', sa.ARRAY(sa.Integer()), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('commodity'),
    )
    op.add_column(
        'user_settings',
        sa.Column('default_mandi', sa.String(length=64), nullable=False, server_default='faisalabad'),
    )
    op.add_column(
        'user_settings',
        sa.Column('alert_price', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
