import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FormLink(Base):
    """One public form for one participant at one event. The id is the unguessable token."""

    __tablename__ = "form_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    participation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("participations.id", ondelete="CASCADE"), unique=True
    )
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
