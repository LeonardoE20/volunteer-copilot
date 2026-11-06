import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.role import Role


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        CheckConstraint(
            "status in ('draft', 'published', 'completed', 'cancelled')", name="status_known"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    title: Mapped[str]
    description: Mapped[str | None]
    location: Mapped[str | None]
    # IANA name. Display formatting belongs to the frontend; scheduling uses this.
    timezone: Mapped[str] = mapped_column(
        default="America/Los_Angeles", server_default="America/Los_Angeles"
    )
    # published: the event is on. cancelled: do not send queued messages.
    status: Mapped[str] = mapped_column(default="published", server_default="published")
    event_type: Mapped[str | None] = mapped_column(default=None)
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Deleting an event deletes its roles: loaded ones through the session, the rest through the
    # database's ON DELETE CASCADE (passive_deletes skips loading them first).
    roles: Mapped[list["Role"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", passive_deletes=True
    )
