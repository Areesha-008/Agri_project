"""alerts unique active per field+category

Revision ID: 3e6488b19ccb
Revises: 8a5201e2041d
Create Date: 2026-07-28 04:44:00.000000

Same class of guarantee as 8a5201e2041d, for the alerts table: the sweep's
_has_active_alert app-level check (alert_engine.py) had no DB backstop, so
two overlapping sweep runs (or any future caller) could still insert two
active alerts for the same field+category. Partial (WHERE dismissed = false)
rather than a plain unique constraint, since a dismissed alert re-triggering
later is intentional re-notification, not a duplicate.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '3e6488b19ccb'
down_revision: Union[str, None] = '8a5201e2041d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'uq_alerts_active_field_category',
        'alerts',
        ['field_id', 'category'],
        unique=True,
        postgresql_where='dismissed = false',
    )


def downgrade() -> None:
    op.drop_index('uq_alerts_active_field_category', table_name='alerts')
