import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InboundReply(Base):
    """A reply Chert delivered, including texts that were not a simple YES or NO."""

    __tablename__ = "inbound_replies"

    provider_event_id: Mapped[str] = mapped_column(primary_key=True)
    sender: Mapped[str]
    body: Mapped[str]
    resolution: Mapped[str]
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    participation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("participations.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ProviderEvent(Base):
    """A Chert event id we have already applied. Webhooks are delivered more than once."""

    __tablename__ = "provider_events"

    event_id: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
