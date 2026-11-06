import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, status
from pydantic import AwareDatetime, BaseModel, ConfigDict, field_validator
from sqlalchemy import select

from app.api.deps import EventDep, SessionDep
from app.api.schemas import Limit, Offset, Text, UtcModel, check_ends_after_start, reject_null
from app.models import Event
from app.services.coordination import ensure_role_presets, refresh_relative_schedules

router = APIRouter(prefix="/events", tags=["events"])


def _timezone(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("unknown timezone") from exc
    return value


class EventCreate(BaseModel):
    title: Text
    description: Text | None = None
    location: Text | None = None
    timezone: Text = "America/Los_Angeles"
    status: str = "published"
    event_type: Text | None = None
    # AwareDatetime rejects times without a UTC offset, which would be ambiguous.
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    seed_role_presets: bool = False

    _timezone = field_validator("timezone")(_timezone)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str) -> str:
        if value not in {"draft", "published", "completed", "cancelled"}:
            raise ValueError("status must be draft, published, completed, or cancelled")
        return value


class EventUpdate(BaseModel):
    title: Text | None = None
    description: Text | None = None
    location: Text | None = None
    timezone: Text | None = None
    status: str | None = None
    event_type: Text | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None

    _not_null = field_validator("title", "starts_at", "ends_at", "timezone", "status")(reject_null)
    _timezone = field_validator("timezone")(_timezone)

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        if value is not None and value not in {"draft", "published", "completed", "cancelled"}:
            raise ValueError("status must be draft, published, completed, or cancelled")
        return value


class EventRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    location: str | None
    timezone: str
    status: str
    event_type: str | None
    starts_at: datetime
    ends_at: datetime
    created_at: datetime


@router.get("")
async def list_events(
    session: SessionDep, limit: Limit = 100, offset: Offset = 0
) -> list[EventRead]:
    events = await session.scalars(
        select(Event).order_by(Event.starts_at, Event.id).limit(limit).offset(offset)
    )
    return [EventRead.model_validate(event) for event in events]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(body: EventCreate, session: SessionDep) -> EventRead:
    check_ends_after_start(body.starts_at, body.ends_at)
    event = Event(**body.model_dump(exclude={"seed_role_presets"}))
    session.add(event)
    await session.flush()
    if body.seed_role_presets:
        await ensure_role_presets(session, event)
    await session.commit()
    return EventRead.model_validate(event)


@router.get("/{event_id}")
async def read_event(event: EventDep) -> EventRead:
    return EventRead.model_validate(event)


@router.patch("/{event_id}")
async def update_event(event: EventDep, body: EventUpdate, session: SessionDep) -> EventRead:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    check_ends_after_start(event.starts_at, event.ends_at)
    await refresh_relative_schedules(session, event)
    await session.commit()
    return EventRead.model_validate(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event: EventDep, session: SessionDep) -> None:
    # The database deletes the event's roles and their signups (ON DELETE CASCADE).
    await session.delete(event)
    await session.commit()
