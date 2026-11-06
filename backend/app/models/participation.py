import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_STATUSES = (
    "not_invited",
    "invited",
    "interested",
    "details_submitted",
    "confirmed",
    "declined",
    "cancelled",
)


class Participation(Base):
    """One volunteer's place in one event. Assignment lives here, not on the user."""

    __tablename__ = "participations"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_participations_event_user"),
        CheckConstraint("pool in ('primary', 'standby')", name="pool_known"),
        CheckConstraint(
            f"status in ({', '.join(repr(s) for s in _STATUSES)})", name="status_known"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    pool: Mapped[str] = mapped_column(default="primary")
    status: Mapped[str] = mapped_column(default="not_invited")
    # Windows of {starts_at, ends_at}. Empty until the volunteer submits the form.
    availability: Mapped[list | None] = mapped_column(JSONB)
    uniform_notes: Mapped[str | None]
    preferred_shift_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), default=list, server_default="{}"
    )
    confirmed_shift_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), default=list, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
