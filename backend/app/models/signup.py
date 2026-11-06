import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.role import Role
    from app.models.user import User


class Signup(Base):
    """A user signed up for a role. Each user can sign up for a given role once."""

    __tablename__ = "signups"

    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    # The primary key leads with role_id, so looking up a user's signups needs its own index.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    role: Mapped["Role"] = relationship(back_populates="signups")
    user: Mapped["User"] = relationship(back_populates="signups")
