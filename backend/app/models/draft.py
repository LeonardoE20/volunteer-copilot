import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.domain import MESSAGE_PURPOSES

_PURPOSES = ", ".join(repr(purpose) for purpose in MESSAGE_PURPOSES)


class MessageDraft(Base):
    """A reviewed message for one event and an explicit set of participants."""

    __tablename__ = "message_drafts"
    __table_args__ = (
        CheckConstraint(f"purpose in ({_PURPOSES})", name="purpose_known"),
        CheckConstraint("audience in ('individual', 'group')", name="audience_known"),
        CheckConstraint(
            "status in ('draft', 'scheduled', 'accepted', 'needs_review')", name="status_known"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str]
    audience: Mapped[str] = mapped_column(default="individual", server_default="individual")
    body: Mapped[str]
    participant_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)))
    resource_links: Mapped[list[str]] = mapped_column(
        ARRAY(String()), default=list, server_default="{}"
    )
    # Absolute send time. Relative drafts also store the offset they were computed from.
    send_at: Mapped[datetime | None]
    relative_offset: Mapped[str | None]
    # Minutes before the event start. Used when the offset is not one of 1w, 1d, or 1h.
    minutes_before: Mapped[int | None]
    status: Mapped[str] = mapped_column(default="draft", server_default="draft")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
