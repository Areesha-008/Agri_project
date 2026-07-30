"""add ledger entry audit columns

Adds created_at/updated_at to ledger_entries so `timestamp` can become a
user-editable "entry date" (for backdating) while created_at stays the
immutable system insert time — used as a tie-breaker when two entries share
the same entry date. Existing rows are backfilled from `timestamp`, the
closest available approximation of their true creation time.

Revision ID: af8d07f3754e
Revises: 0961769700e5
Create Date: 2026-07-30 03:05:02.253454

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af8d07f3754e'
down_revision: Union[str, None] = '0961769700e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'ledger_entries',
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.add_column(
        'ledger_entries',
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.execute('UPDATE ledger_entries SET created_at = "timestamp", updated_at = "timestamp"')


def downgrade() -> None:
    op.drop_column('ledger_entries', 'updated_at')
    op.drop_column('ledger_entries', 'created_at')
