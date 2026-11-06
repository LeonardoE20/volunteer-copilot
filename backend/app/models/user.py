import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Index, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.signup import Signup


class User(Base):
    """A volunteer or coordinator. Not tied to a Supabase Auth account."""

    __tablename__ = "users"
    # Case-insensitive, so Ann@example.com and ann@example.com can't both sign up.
    __table_args__ = (Index("uq_users_email", text("lower(email)"), unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str]
    email: Mapped[str]
    phone: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Same delete behavior as Event.roles.
    signups: Mapped[list["Signup"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
