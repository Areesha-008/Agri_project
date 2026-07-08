"""
User model.

Deliberately minimal for Module 1: just enough to support signup/login and
to own saved Fields. Additional profile attributes (name, role, org, etc.)
can be added later via an Alembic migration without touching this file's
shape or breaking existing relationships.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# TYPE_CHECKING guard: this import only runs for type checkers/IDEs
# (mypy, Pylance, PyCharm), never at actual runtime. It lets your editor
# resolve the "Field" forward reference below without creating a real
# circular import between user.py and field.py at import time.
if TYPE_CHECKING:
    from app.models.field import Field


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # One user can save many fields (polygons).
    fields: Mapped[List["Field"]] = relationship(
        "Field", back_populates="owner", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"