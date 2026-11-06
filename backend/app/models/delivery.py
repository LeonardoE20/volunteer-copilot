import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Delivery(Base):
    """One attempt to deliver one message to one participant. The id stays stable across retries."""

    __tablename__ = "deliveries"
    __table_args__ = (
        CheckConstraint(
            "state in ('queued', 'sent', 'delivered', 'failed', 'unknown')", name="state_known"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    participation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("participations.id", ondelete="CASCADE"), index=True
    )
    draft_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("message_drafts.id", ondelete="CASCADE"), index=True
    )
    provider_message_id: Mapped[str | None] = mapped_column(index=True)
    provider_chat_id: Mapped[str | None]
    state: Mapped[str] = mapped_column(default="queued")
    error: Mapped[str | None]
    retryable: Mapped[bool] = mapped_column(default=False, server_default="false")
    idempotency_key: Mapped[str] = mapped_column(unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
