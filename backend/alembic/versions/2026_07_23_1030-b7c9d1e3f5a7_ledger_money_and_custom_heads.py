"""ledger money and custom heads

Adds per-operation money to the ledger (amount + expense/income direction),
converts category from a native enum to a free String so users can create
their own heads, and adds a ledger_categories table for those custom heads.

Revision ID: b7c9d1e3f5a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-23 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b7c9d1e3f5a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Per-user custom ledger heads (built-ins stay virtual, in code).
    op.create_table(
        'ledger_categories',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_ledger_category_user_name'),
    )
    op.create_index(op.f('ix_ledger_categories_user_id'), 'ledger_categories', ['user_id'])

    # Money on each entry.
    op.add_column('ledger_entries', sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column(
        'ledger_entries',
        sa.Column('entry_type', sa.String(length=16), nullable=False, server_default='expense'),
    )

    # category: native enum -> free String, then drop the now-unused enum type.
    op.alter_column(
        'ledger_entries',
        'category',
        existing_type=sa.Enum('Fertilizer', 'Irrigation', 'Spray', 'Operation', 'Scan', name='ledger_category'),
        type_=sa.String(length=64),
        existing_nullable=False,
        postgresql_using='category::text',
    )
    op.execute('DROP TYPE ledger_category')


def downgrade() -> None:
    # Recreate the enum and convert back (fails if any custom/Sale heads exist —
    # downgrade is best-effort, as with the enum-narrowing it reverses).
    op.execute("CREATE TYPE ledger_category AS ENUM ('Fertilizer', 'Irrigation', 'Spray', 'Operation', 'Scan')")
    op.alter_column(
        'ledger_entries',
        'category',
        existing_type=sa.String(length=64),
        type_=sa.Enum('Fertilizer', 'Irrigation', 'Spray', 'Operation', 'Scan', name='ledger_category'),
        existing_nullable=False,
        postgresql_using='category::ledger_category',
    )
    op.drop_column('ledger_entries', 'entry_type')
    op.drop_column('ledger_entries', 'amount')
    op.drop_index(op.f('ix_ledger_categories_user_id'), table_name='ledger_categories')
    op.drop_table('ledger_categories')
