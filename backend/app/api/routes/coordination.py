import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.api.deps import ChertDep, SessionDep
from app.api.errors import fail
from app.api.schemas import Text, UtcModel
from app.domain import MESSAGE_PURPOSES
from app.models import Delivery, Event, InboundReply, MessageDraft, Participation, User
from app.services.coordination import (
    add_participations,
    build_workspace,
    cancel_assignment,
    cancel_participation,
    confirm_shift,
    dispatch_due,
    draft_skips,
    ensure_role_presets,
    load_form,
    planned_send_at,
    reconcile_delivery,
    retry_delivery,
    send_draft,
    submit_form,
)
from app.services.phones import normalize_phone

router = APIRouter(tags=["coordination"])


class ParticipationRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    user_id: uuid.UUID
    pool: str
    status: str
    availability: list[dict] | None
    uniform_notes: str | None
    preferred_shift_ids: list[uuid.UUID]
    confirmed_shift_ids: list[uuid.UUID]


class CoverageRead(BaseModel):
    confirmed: int
    unfilled: int
    awaiting_reply: int
    standby: int


class ShiftRead(UtcModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    capacity: int
    starts_at: datetime
    ends_at: datetime
    coverage: CoverageRead


class VolunteerRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    text_opt_in: bool
    role_preferences: list[str]


class WorkspaceRead(BaseModel):
    event: dict
    shifts: list[ShiftRead]
    volunteers: list[VolunteerRead]
    participations: list[ParticipationRead]


class ParticipationCreate(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)
    pool: Literal["primary", "standby"] = "primary"


class DraftCreate(BaseModel):
    purpose: Literal[
        "interest", "form_link", "policies", "uniform", "parking", "reminder", "standby"
    ]
    text: Text
    participant_ids: list[uuid.UUID] = Field(min_length=1)
    audience: Literal["individual", "group"] = "individual"
    resource_links: list[Text] = Field(default_factory=list)
    send_at: AwareDatetime | None = None
    relative_offset: Literal["1w", "1d", "1h"] | None = None
    minutes_before: int | None = Field(default=None, ge=1)


class SkipRead(BaseModel):
    participant_id: uuid.UUID
    reason: str


class DeliveryRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID | None
    participation_id: uuid.UUID | None
    draft_id: uuid.UUID | None
    provider_message_id: str | None
    state: str
    error: str | None
    retryable: bool


class DraftRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    purpose: str
    audience: str
    text: str
    participant_ids: list[uuid.UUID]
    resource_links: list[str]
    send_at: datetime | None
    relative_offset: str | None
    minutes_before: int | None
    status: str
    skipped: list[SkipRead]


class DispatchRead(UtcModel):
    draft_id: uuid.UUID
    accepted: bool
    status: str
    scheduled_for: datetime | None
    deliveries: list[DeliveryRead]
    skipped: list[SkipRead]


class ConfirmBody(BaseModel):
    shift_id: uuid.UUID


class RegisterBody(BaseModel):
    name: Text
    phone: Text
    role_preferences: list[Text] = Field(default_factory=list)


class RegisterRead(BaseModel):
    receipt: uuid.UUID


class AvailabilityIn(BaseModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class FormSubmit(BaseModel):
    availability: list[AvailabilityIn] = Field(min_length=1)
    preferred_shift_ids: list[uuid.UUID] = Field(min_length=1)
    uniform_notes: Text | None = None


class ReplyRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    provider_event_id: str
    sender: str
    body: str
    resolution: str
    user_id: uuid.UUID | None
    participation_id: uuid.UUID | None
    created_at: datetime


def _draft_read(draft: MessageDraft, skipped: list[dict]) -> DraftRead:
    return DraftRead(
        id=draft.id,
        event_id=draft.event_id,
        purpose=draft.purpose,
        audience=draft.audience,
        text=draft.body,
        participant_ids=list(draft.participant_ids),
        resource_links=list(draft.resource_links or []),
        send_at=draft.send_at,
        relative_offset=draft.relative_offset,
        minutes_before=draft.minutes_before,
        status=draft.status,
        skipped=[SkipRead.model_validate(item) for item in skipped],
    )


@router.post("/volunteers/register", response_model=RegisterRead)
async def register_volunteer(
    body: RegisterBody, session: SessionDep, response: Response
) -> RegisterRead:
    phone = normalize_phone(body.phone)
    existing = await session.scalar(select(User).where(User.phone == phone))
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return RegisterRead(receipt=existing.id)
    response.status_code = status.HTTP_201_CREATED
    user = User(
        name=body.name,
        email=None,
        phone=phone,
        role_preferences=body.role_preferences,
        text_opt_in=True,
    )
    session.add(user)
    await session.commit()
    return RegisterRead(receipt=user.id)


@router.post("/events/{event_id}/role-presets", status_code=status.HTTP_201_CREATED)
async def seed_roles(event_id: uuid.UUID, session: SessionDep) -> list[dict]:
    event = await _event(session, event_id)
    roles = await ensure_role_presets(session, event)
    await session.commit()
    return [
        {
            "id": role.id,
            "event_id": role.event_id,
            "name": role.name,
            "slots_needed": role.slots_needed,
            "starts_at": role.starts_at,
            "ends_at": role.ends_at,
        }
        for role in roles
    ]


@router.get("/events/{event_id}/workspace")
async def workspace(event_id: uuid.UUID, session: SessionDep) -> dict:
    event = await _event(session, event_id)
    data = await build_workspace(session, event)
    from app.api.routes.events import EventRead

    return {
        "event": EventRead.model_validate(data["event"]).model_dump(mode="json"),
        "shifts": [
            ShiftRead.model_validate(shift).model_dump(mode="json") for shift in data["shifts"]
        ],
        "volunteers": [
            VolunteerRead.model_validate(user).model_dump(mode="json")
            for user in data["volunteers"]
        ],
        "participations": [
            ParticipationRead.model_validate(row).model_dump(mode="json")
            for row in data["participations"]
        ],
    }


@router.post("/events/{event_id}/participations", status_code=status.HTTP_201_CREATED)
async def join_event(
    event_id: uuid.UUID, body: ParticipationCreate, session: SessionDep
) -> list[ParticipationRead]:
    event = await _event(session, event_id)
    rows = await add_participations(session, event, body.user_ids, body.pool)
    await session.commit()
    return [ParticipationRead.model_validate(row) for row in rows]


@router.post("/events/{event_id}/drafts", status_code=status.HTTP_201_CREATED)
async def create_draft(event_id: uuid.UUID, body: DraftCreate, session: SessionDep) -> DraftRead:
    event = await _event(session, event_id)
    if body.purpose not in MESSAGE_PURPOSES:
        fail(422, "validation", "Unknown message purpose")
    known = set(
        await session.scalars(
            select(Participation.id).where(
                Participation.event_id == event.id, Participation.id.in_(body.participant_ids)
            )
        )
    )
    if set(body.participant_ids) != known:
        fail(422, "validation", "Every recipient has to be on this event.")
    send_at = planned_send_at(
        event,
        send_at=body.send_at,
        relative_offset=body.relative_offset,
        minutes_before=body.minutes_before,
        now=datetime.now(UTC),
    )
    draft = MessageDraft(
        event_id=event.id,
        purpose=body.purpose,
        audience=body.audience,
        body=body.text,
        participant_ids=body.participant_ids,
        resource_links=body.resource_links,
        send_at=send_at,
        relative_offset=body.relative_offset,
        minutes_before=body.minutes_before,
    )
    session.add(draft)
    await session.flush()
    skipped = await draft_skips(session, draft)
    await session.commit()
    return _draft_read(draft, skipped)


@router.get("/events/{event_id}/drafts")
async def list_drafts(event_id: uuid.UUID, session: SessionDep) -> list[DraftRead]:
    await _event(session, event_id)
    drafts = list(
        await session.scalars(
            select(MessageDraft)
            .where(MessageDraft.event_id == event_id)
            .order_by(MessageDraft.created_at, MessageDraft.id)
        )
    )
    return [_draft_read(draft, await draft_skips(session, draft)) for draft in drafts]


@router.get("/drafts/{draft_id}")
async def read_draft(draft_id: uuid.UUID, session: SessionDep) -> DraftRead:
    draft = await _draft(session, draft_id)
    return _draft_read(draft, await draft_skips(session, draft))


@router.post("/drafts/{draft_id}/dispatch")
async def dispatch_draft(draft_id: uuid.UUID, session: SessionDep, chert: ChertDep) -> DispatchRead:
    draft = await _draft(session, draft_id)
    receipt = await send_draft(session, chert, draft)
    await session.commit()
    return DispatchRead.model_validate(receipt)


@router.post("/jobs/dispatch-due")
async def run_due_drafts(session: SessionDep, chert: ChertDep) -> list[DispatchRead]:
    receipts = await dispatch_due(session, chert)
    await session.commit()
    return [DispatchRead.model_validate(receipt) for receipt in receipts]


@router.get("/forms/{token}")
async def read_form(token: uuid.UUID, session: SessionDep) -> dict:
    return await load_form(session, token)


@router.post("/forms/{token}")
async def post_form(token: uuid.UUID, body: FormSubmit, session: SessionDep) -> dict:
    participation = await submit_form(
        session,
        token,
        availability=[
            {"starts_at": item.starts_at.isoformat(), "ends_at": item.ends_at.isoformat()}
            for item in body.availability
        ],
        preferred_shift_ids=body.preferred_shift_ids,
        uniform_notes=body.uniform_notes,
    )
    await session.commit()
    return {
        "receipt": str(participation.id),
        "status": participation.status,
        "availability": participation.availability,
        "preferred_shift_ids": [str(shift_id) for shift_id in participation.preferred_shift_ids],
    }


@router.post("/participations/{participation_id}/confirm")
async def confirm(
    participation_id: uuid.UUID, body: ConfirmBody, session: SessionDep
) -> ParticipationRead:
    row = await confirm_shift(session, participation_id, body.shift_id)
    await session.commit()
    return ParticipationRead.model_validate(row)


@router.post("/participations/{participation_id}/cancel-assignment")
async def drop_shift(
    participation_id: uuid.UUID, body: ConfirmBody, session: SessionDep
) -> ParticipationRead:
    row = await cancel_assignment(session, participation_id, body.shift_id)
    await session.commit()
    return ParticipationRead.model_validate(row)


@router.post("/participations/{participation_id}/cancel")
async def withdraw(participation_id: uuid.UUID, session: SessionDep) -> ParticipationRead:
    row = await cancel_participation(session, participation_id)
    await session.commit()
    return ParticipationRead.model_validate(row)


@router.get("/drafts/{draft_id}/deliveries")
async def list_draft_deliveries(draft_id: uuid.UUID, session: SessionDep) -> list[DeliveryRead]:
    await _draft(session, draft_id)
    rows = await session.scalars(
        select(Delivery)
        .where(Delivery.draft_id == draft_id)
        .order_by(Delivery.created_at, Delivery.id)
    )
    return [DeliveryRead.model_validate(row) for row in rows]


@router.get("/events/{event_id}/deliveries")
async def list_deliveries(event_id: uuid.UUID, session: SessionDep) -> list[DeliveryRead]:
    await _event(session, event_id)
    rows = await session.scalars(
        select(Delivery)
        .where(Delivery.event_id == event_id)
        .order_by(Delivery.created_at, Delivery.id)
    )
    return [DeliveryRead.model_validate(row) for row in rows]


@router.post("/deliveries/{delivery_id}/reconcile")
async def reconcile(delivery_id: uuid.UUID, session: SessionDep, chert: ChertDep) -> DeliveryRead:
    delivery = await _delivery(session, delivery_id)
    await reconcile_delivery(session, chert, delivery)
    await session.commit()
    return DeliveryRead.model_validate(delivery)


@router.post("/deliveries/{delivery_id}/retry")
async def retry(delivery_id: uuid.UUID, session: SessionDep, chert: ChertDep) -> DeliveryRead:
    delivery = await _delivery(session, delivery_id)
    await retry_delivery(session, chert, delivery)
    await session.commit()
    return DeliveryRead.model_validate(delivery)


@router.get("/replies")
async def list_replies(session: SessionDep) -> list[ReplyRead]:
    rows = await session.scalars(
        select(InboundReply).order_by(InboundReply.created_at.desc()).limit(100)
    )
    return [ReplyRead.model_validate(row) for row in rows]


async def _event(session: SessionDep, event_id: uuid.UUID) -> Event:
    event = await session.get(Event, event_id)
    if event is None:
        fail(404, "not_found", "Event not found")
    return event


async def _draft(session: SessionDep, draft_id: uuid.UUID) -> MessageDraft:
    draft = await session.get(MessageDraft, draft_id)
    if draft is None:
        fail(404, "not_found", "Draft not found")
    return draft


async def _delivery(session: SessionDep, delivery_id: uuid.UUID) -> Delivery:
    delivery = await session.get(Delivery, delivery_id)
    if delivery is None:
        fail(404, "not_found", "Delivery not found")
    return delivery
