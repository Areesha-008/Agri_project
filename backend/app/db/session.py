"""
Database engine and session management.

Why a generator-based `get_db` dependency:
- FastAPI's `Depends(get_db)` calls this, receives the yielded session, runs
  the route, then resumes the generator to close the session in the
  `finally` block — automatically, per-request, even if the route raises.
- This means no route handler ever has to remember to open/close a session
  manually, and connections don't leak under load.

`pool_pre_ping=True` avoids a common production issue where Postgres closes
idle connections and the app then errors on a stale connection instead of
transparently reconnecting.
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    str(settings.DATABASE_URL),
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and guarantees cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()