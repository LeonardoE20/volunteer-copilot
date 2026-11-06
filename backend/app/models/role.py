import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.signup import Signup


class Role(Base):
    """A volunteer position at one event, such as "Setup crew, 4 needed, 8-10am"."""

    __tablename__ = "roles"
    __table_args__ = (
        CheckConstraint("slots_needed > 0", name="slots_needed_positive"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str]
    slots_needed: Mapped[int]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    event: Mapped["Event"] = relationship(back_populates="roles")
    # Same delete behavior as Event.roles.
    signups: Mapped[list["Signup"]] = relationship(
        back_populates="role", cascade="all, delete-orphan", passive_deletes=True
    )
