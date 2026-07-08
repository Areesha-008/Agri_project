"""
Shared SQLAlchemy declarative base.

Kept in its own module (rather than inside session.py or a models file) so
that models can import `Base` without triggering circular imports with the
engine/session setup, and so Alembic's env.py can import `Base.metadata`
cleanly for autogenerate migrations later.
"""

from sqlalchemy.orm import declarative_base

Base = declarative_base()