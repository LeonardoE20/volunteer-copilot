"""Event participation, form links, and sending. Chert itself stays in app.services.chert."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import fail
from app.core.config import get_settings
from app.domain import (
    ACCEPTED_DELIVERY,
    RELATIVE_OFFSETS,
    ROLE_PRESETS,
    skip_reason,
)
from app.models import (
    Delivery,
    Event,
    FormLink,
    InboundReply,
    MessageDraft,
    Participation,
    ProviderEvent,
    Role,
    User,
)
from app.services.chert import ChertClient, ChertError, InboundMessage, ProviderStatus
from app.services.coverage import merge_delivery_state, ranges_overlap, shift_coverage
from app.services.phones import normalize_phone
from app.services.replies import apply_no, apply_yes, classify_reply, match_event_title

FORM_TTL = timedelta(days=30)


def _now() -> datetime:
    return datetime.now(UTC)


def _ids(values: list[uuid.UUID] | None) -> list[uuid.UUID]:
    return list(values or [])


async def ensure_role_presets(session: AsyncSession, event: Event) -> list[Role]:
    """Add any of the six role presets this event does not already have."""
    existing = set(await session.scalars(select(Role.name).where(Role.event_id == event.id)))
    for name in ROLE_PRESETS:
        if name in existing:
            continue
        session.add(
            Role(
                event_id=event.id,
                name=name,
                slots_needed=1,
                starts_at=event.starts_at,
                ends_at=event.ends_at,
            )
        )
    await session.flush()
    roles = await session.scalars(
        select(Role).where(Role.event_id == event.id).order_by(Role.starts_at, Role.name, Role.id)
    )
    return list(roles)


async def add_participations(
    session: AsyncSession, event: Event, user_ids: list[uuid.UUID], pool: str
) -> list[Participation]:
    found = list(await session.scalars(select(User).where(User.id.in_(user_ids))))
    if len(found) != len(set(user_ids)):
        fail(404, "not_found", "Volunteer not found")
    current = {
        row.user_id: row
        for row in await session.scalars(
            select(Participation).where(
                Participation.event_id == event.id, Participation.user_id.in_(user_ids)
            )
        )
    }
    rows: list[Participation] = []
    for user_id in user_ids:
        row = current.get(user_id)
        if row is None:
            row = Participation(
                event_id=event.id,
                user_id=user_id,
                pool=pool,
                status="not_invited",
                preferred_shift_ids=[],
                confirmed_shift_ids=[],
            )
            session.add(row)
        elif row.status in {"declined", "cancelled"}:
            # The coordinator is putting them back on this event.
            row.status = "not_invited"
            row.pool = pool
            row.confirmed_shift_ids = []
        else:
            # A second add must not knock an interested or confirmed person backward.
            row.pool = pool
        rows.append(row)
    await session.flush()
    return rows


def _event_counts(rows: list[Participation]) -> tuple[int, int]:
    awaiting = sum(1 for row in rows if row.status == "invited")
    standby = sum(
        1 for row in rows if row.pool == "standby" and row.status not in {"declined", "cancelled"}
    )
    return awaiting, standby


async def build_workspace(session: AsyncSession, event: Event) -> dict:
    roles = list(
        await session.scalars(
            select(Role)
            .where(Role.event_id == event.id)
            .order_by(Role.starts_at, Role.name, Role.id)
        )
    )
    rows = list(
        await session.scalars(
            select(Participation)
            .where(Participation.event_id == event.id)
            .order_by(Participation.created_at, Participation.id)
        )
    )
    user_ids = [row.user_id for row in rows]
    volunteers = []
    if user_ids:
        volunteers = list(
            await session.scalars(
                select(User).where(User.id.in_(user_ids)).order_by(User.name, User.id)
            )
        )
    awaiting, standby = _event_counts(rows)
    shifts = []
    for role in roles:
        confirmed = sum(
            1
            for row in rows
            if row.status == "confirmed" and role.id in _ids(row.confirmed_shift_ids)
        )
        shifts.append(
            {
                "id": role.id,
                "event_id": role.event_id,
                "name": role.name,
                "capacity": role.slots_needed,
                "starts_at": role.starts_at,
                "ends_at": role.ends_at,
                "coverage": shift_coverage(
                    capacity=role.slots_needed,
                    confirmed=confirmed,
                    awaiting_reply=awaiting,
                    standby=standby,
                ),
            }
        )
    return {"event": event, "shifts": shifts, "volunteers": volunteers, "participations": rows}


async def refresh_relative_schedules(
    session: AsyncSession, event: Event, *, now: datetime | None = None
) -> None:
    """Recompute unsent reminders when the event moves. A time that already passed is not sent."""
    now = now or _now()
    drafts = list(
        await session.scalars(
            select(MessageDraft).where(
                MessageDraft.event_id == event.id,
                or_(
                    MessageDraft.relative_offset.is_not(None),
                    MessageDraft.minutes_before.is_not(None),
                ),
                MessageDraft.status.in_(("draft", "scheduled", "needs_review")),
            )
        )
    )
    for draft in drafts:
        if draft.minutes_before is not None:
            draft.send_at = event.starts_at - timedelta(minutes=draft.minutes_before)
        else:
            offset = RELATIVE_OFFSETS.get(draft.relative_offset or "")
            if offset is None:
                continue
            draft.send_at = event.starts_at - offset
        if draft.status == "draft":
            continue
        draft.status = "needs_review" if draft.send_at <= now else "scheduled"


def planned_send_at(
    event: Event,
    *,
    send_at: datetime | None,
    relative_offset: str | None,
    minutes_before: int | None,
    now: datetime,
) -> datetime | None:
    if minutes_before is not None:
        send_at = event.starts_at - timedelta(minutes=minutes_before)
    elif relative_offset:
        send_at = event.starts_at - RELATIVE_OFFSETS[relative_offset]
    if send_at is not None and send_at <= now:
        fail(
            409,
            "schedule_passed",
            "That send time has already passed. Nothing was scheduled.",
        )
    return send_at


async def draft_skips(session: AsyncSession, draft: MessageDraft) -> list[dict]:
    if not draft.participant_ids:
        return []
    rows = {
        row.id: row
        for row in await session.scalars(
            select(Participation).where(Participation.id.in_(draft.participant_ids))
        )
    }
    users = {
        user.id: user
        for user in await session.scalars(
            select(User).where(User.id.in_([row.user_id for row in rows.values()]))
        )
    }
    skipped = []
    for participant_id in draft.participant_ids:
        row = rows.get(participant_id)
        if row is None or row.event_id != draft.event_id:
            skipped.append({"participant_id": participant_id, "reason": "not on this event"})
            continue
        user = users[row.user_id]
        reason = skip_reason(
            purpose=draft.purpose,
            pool=row.pool,
            status=row.status,
            text_opt_in=user.text_opt_in,
            phone=user.phone,
        )
        if reason:
            skipped.append({"participant_id": participant_id, "reason": reason})
    return skipped


async def send_draft(
    session: AsyncSession, chert: ChertClient, draft: MessageDraft, *, now: datetime | None = None
) -> dict:
    """Send a draft, or accept it onto the schedule when its send time is still ahead."""
    now = now or _now()
    if draft.audience == "group":
        fail(409, "messaging_unavailable", ChertClient.group_block_reason)
    event = await session.get(Event, draft.event_id)
    if event is None:
        fail(404, "not_found", "Event not found")
    if event.status == "cancelled":
        fail(409, "event_cancelled", "This event is cancelled, so the message was not sent.")
    if draft.status == "needs_review":
        fail(409, "schedule_passed", "This send time has already passed. Choose a new time.")
    if draft.send_at is not None and draft.send_at > now:
        draft.status = "scheduled"
        return _receipt(draft, [], [])
    if not draft.participant_ids:
        draft.status = "accepted"
        return _receipt(draft, [], [])

    rows = {
        row.id: row
        for row in await session.scalars(
            select(Participation).where(Participation.id.in_(draft.participant_ids or []))
        )
    }
    users = (
        {
            user.id: user
            for user in await session.scalars(
                select(User).where(
                    User.id.in_([row.user_id for row in rows.values()] or [uuid.uuid4()])
                )
            )
        }
        if rows
        else {}
    )
    existing = {
        delivery.participation_id: delivery
        for delivery in await session.scalars(select(Delivery).where(Delivery.draft_id == draft.id))
    }
    deliveries: list[Delivery] = []
    skipped: list[dict] = []
    for participant_id in draft.participant_ids:
        row = rows.get(participant_id)
        if row is None or row.event_id != event.id:
            skipped.append({"participant_id": participant_id, "reason": "not on this event"})
            continue
        user = users[row.user_id]
        reason = skip_reason(
            purpose=draft.purpose,
            pool=row.pool,
            status=row.status,
            text_opt_in=user.text_opt_in,
            phone=user.phone,
        )
        if reason:
            skipped.append({"participant_id": participant_id, "reason": reason})
            continue
        delivery = existing.get(participant_id)
        if delivery is not None and delivery.state in ACCEPTED_DELIVERY:
            deliveries.append(delivery)
            continue
        if delivery is None:
            delivery = Delivery(
                event_id=event.id,
                participation_id=participant_id,
                draft_id=draft.id,
                state="queued",
                idempotency_key=f"draft:{draft.id}:{participant_id}",
            )
            session.add(delivery)
            await session.flush()
        assert user.phone is not None
        await _apply_send(chert, delivery, user.phone, draft.body)
        if delivery.state in ACCEPTED_DELIVERY and draft.purpose in {"interest", "standby"}:
            if row.status == "not_invited":
                row.status = "invited"
        deliveries.append(delivery)
    draft.status = "accepted"
    return _receipt(draft, deliveries, skipped)


async def dispatch_due(
    session: AsyncSession, chert: ChertClient, *, now: datetime | None = None
) -> list[dict]:
    """Send scheduled drafts whose time has arrived.

    A preset whose send time already passed, and a cancelled event, stay unsent.
    """
    now = now or _now()
    drafts = list(
        await session.scalars(
            select(MessageDraft).where(
                MessageDraft.status == "scheduled",
                MessageDraft.send_at.is_not(None),
                MessageDraft.send_at <= now,
            )
        )
    )
    receipts = []
    for draft in drafts:
        event = await session.get(Event, draft.event_id)
        if event is None or event.status == "cancelled":
            draft.status = "needs_review"
            continue
        receipts.append(await send_draft(session, chert, draft, now=now))
    return receipts


def _receipt(draft: MessageDraft, deliveries: list[Delivery], skipped: list[dict]) -> dict:
    return {
        "draft_id": draft.id,
        "accepted": True,
        "status": draft.status,
        "scheduled_for": draft.send_at if draft.status == "scheduled" else None,
        "deliveries": deliveries,
        "skipped": skipped,
    }


async def _apply_send(chert: ChertClient, delivery: Delivery, phone: str, text: str) -> None:
    try:
        result = await chert.send(phone, text, idempotency_key=delivery.idempotency_key)
    except ChertError as exc:
        delivery.state = "failed"
        delivery.error = str(exc)
        delivery.retryable = exc.retryable
        return
    delivery.state = result.state
    delivery.provider_message_id = result.message_id
    delivery.provider_chat_id = result.chat_id
    delivery.error = result.error
    delivery.retryable = result.retryable


async def retry_delivery(session: AsyncSession, chert: ChertClient, delivery: Delivery) -> Delivery:
    if delivery.state in ACCEPTED_DELIVERY:
        return delivery
    if delivery.state != "failed":
        fail(409, "not_retryable", "Only a failed send can be retried.")
    phone = await _delivery_phone(session, delivery)
    if phone is None:
        fail(409, "not_retryable", "This recipient has no phone number.")
    text = await _delivery_text(session, delivery)
    await _apply_send(chert, delivery, phone, text)
    if delivery.state in ACCEPTED_DELIVERY and delivery.participation_id is not None:
        participation = await session.get(Participation, delivery.participation_id)
        draft = await session.get(MessageDraft, delivery.draft_id) if delivery.draft_id else None
        if (
            participation is not None
            and participation.status == "not_invited"
            and draft is not None
            and draft.purpose in {"interest", "standby"}
        ):
            participation.status = "invited"
    return delivery


async def _delivery_phone(session: AsyncSession, delivery: Delivery) -> str | None:
    if delivery.participation_id is None:
        return None
    participation = await session.get(Participation, delivery.participation_id)
    if participation is None:
        return None
    user = await session.get(User, participation.user_id)
    return user.phone if user else None


async def _delivery_text(session: AsyncSession, delivery: Delivery) -> str:
    if delivery.draft_id is not None:
        draft = await session.get(MessageDraft, delivery.draft_id)
        if draft is not None:
            return draft.body
    if delivery.idempotency_key.startswith("form-link:"):
        link = await session.scalar(
            select(FormLink).where(FormLink.participation_id == delivery.participation_id)
        )
        event = await session.get(Event, delivery.event_id) if delivery.event_id else None
        title = event.title if event else "the event"
        base = get_settings().public_form_base_url.rstrip("/")
        url = f"{base}/{link.id}" if link else ""
        return (
            f"Thanks for saying yes to {title}. Share your availability and preferred role: {url}"
        )
    return ""


async def reconcile_delivery(
    session: AsyncSession, chert: ChertClient, delivery: Delivery
) -> Delivery:
    if not delivery.provider_message_id:
        fail(409, "unknown", "This send has no provider message id to look up yet.")
    try:
        status = await chert.get_message(delivery.provider_message_id)
    except ChertError as exc:
        fail(503 if exc.retryable else 502, "upstream", str(exc), retryable=exc.retryable)
    delivery.state = merge_delivery_state(delivery.state, status.state)
    return delivery


async def apply_provider_status(session: AsyncSession, update: ProviderStatus) -> None:
    if update.event_id and not await _claim_event(session, update.event_id):
        return
    if not update.message_id:
        return
    delivery = await session.scalar(
        select(Delivery).where(Delivery.provider_message_id == update.message_id)
    )
    if delivery is None:
        return
    delivery.state = merge_delivery_state(delivery.state, update.state)


async def confirm_shift(
    session: AsyncSession, participation_id: uuid.UUID, shift_id: uuid.UUID
) -> Participation:
    participation = await session.get(Participation, participation_id, with_for_update=True)
    if participation is None:
        fail(404, "not_found", "Participation not found")
    if participation.status not in {"details_submitted", "confirmed"}:
        fail(409, "details_required", "Submit availability before confirming a shift.")
    role = await session.get(Role, shift_id, with_for_update=True)
    if role is None or role.event_id != participation.event_id:
        fail(404, "not_found", "Shift not found on this event")
    confirmed = _ids(participation.confirmed_shift_ids)
    if shift_id in confirmed:
        return participation
    others = list(
        await session.scalars(
            select(Participation).where(
                Participation.event_id == participation.event_id,
                Participation.status == "confirmed",
            )
        )
    )
    filled = sum(
        1
        for row in others
        if row.id != participation.id and shift_id in _ids(row.confirmed_shift_ids)
    )
    if filled >= role.slots_needed:
        fail(409, "capacity", "That shift is already full.")
    if confirmed:
        assigned = list(await session.scalars(select(Role).where(Role.id.in_(confirmed))))
        for other in assigned:
            if ranges_overlap(other.starts_at, other.ends_at, role.starts_at, role.ends_at):
                fail(409, "conflict", "That shift overlaps one this person already has.")
    participation.confirmed_shift_ids = [*confirmed, shift_id]
    participation.status = "confirmed"
    return participation


async def cancel_assignment(
    session: AsyncSession, participation_id: uuid.UUID, shift_id: uuid.UUID
) -> Participation:
    participation = await session.get(Participation, participation_id, with_for_update=True)
    if participation is None:
        fail(404, "not_found", "Participation not found")
    confirmed = _ids(participation.confirmed_shift_ids)
    if shift_id not in confirmed:
        fail(404, "not_found", "That shift is not assigned")
    participation.confirmed_shift_ids = [item for item in confirmed if item != shift_id]
    if not participation.confirmed_shift_ids and participation.status == "confirmed":
        participation.status = "details_submitted"
    return participation


async def cancel_participation(session: AsyncSession, participation_id: uuid.UUID) -> Participation:
    participation = await session.get(Participation, participation_id, with_for_update=True)
    if participation is None:
        fail(404, "not_found", "Participation not found")
    participation.status = "cancelled"
    participation.confirmed_shift_ids = []
    return participation


async def load_form(
    session: AsyncSession, token: uuid.UUID, *, now: datetime | None = None
) -> dict:
    now = now or _now()
    link, event, participation, user = await _open_form(session, token, now)
    roles = list(
        await session.scalars(
            select(Role)
            .where(Role.event_id == event.id)
            .order_by(Role.starts_at, Role.name, Role.id)
        )
    )
    rows = list(
        await session.scalars(select(Participation).where(Participation.event_id == event.id))
    )
    shifts = []
    for role in roles:
        confirmed = sum(
            1
            for row in rows
            if row.status == "confirmed" and role.id in _ids(row.confirmed_shift_ids)
        )
        shifts.append(
            {
                "id": role.id,
                "event_id": event.id,
                "name": role.name,
                "starts_at": role.starts_at,
                "ends_at": role.ends_at,
                "capacity": role.slots_needed,
                "confirmed": confirmed,
                "unfilled": max(role.slots_needed - confirmed, 0),
            }
        )
    return {
        "event": {
            "id": event.id,
            "title": event.title,
            "location": event.location,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "timezone": event.timezone,
        },
        "participant_id": participation.id,
        "shifts": shifts,
        "volunteer_name": user.name,
        "availability": participation.availability,
        "preferred_shift_ids": _ids(participation.preferred_shift_ids),
        "fields": ["availability", "preferred_shift_ids"],
    }


async def submit_form(
    session: AsyncSession,
    token: uuid.UUID,
    *,
    availability: list[dict],
    preferred_shift_ids: list[uuid.UUID],
    uniform_notes: str | None = None,
    now: datetime | None = None,
) -> Participation:
    now = now or _now()
    link, event, participation, _user = await _open_form(session, token, now)
    if event.status == "cancelled":
        fail(409, "event_cancelled", "This event is cancelled.")
    if participation.status in {"declined", "cancelled", "not_invited"}:
        fail(409, "not_eligible", "This signup link is no longer active.")
    known = set(await session.scalars(select(Role.id).where(Role.event_id == event.id)))
    if not preferred_shift_ids or any(shift_id not in known for shift_id in preferred_shift_ids):
        fail(
            422,
            "validation",
            "Choose a role from this event.",
            fields={"preferred_shift_ids": "unknown shift"},
        )
    participation.availability = availability
    participation.uniform_notes = uniform_notes
    participation.preferred_shift_ids = list(preferred_shift_ids)
    if participation.status != "confirmed":
        participation.status = "details_submitted"
    return participation


async def _open_form(session: AsyncSession, token: uuid.UUID, now: datetime):
    link = await session.get(FormLink, token)
    if link is None:
        fail(404, "not_found", "Form not found")
    if link.expires_at <= now:
        fail(410, "expired_form", "This form link has expired.")
    event = await session.get(Event, link.event_id)
    participation = await session.get(Participation, link.participation_id, with_for_update=True)
    if event is None or participation is None:
        fail(404, "not_found", "Form not found")
    user = await session.get(User, participation.user_id)
    if user is None:
        fail(404, "not_found", "Form not found")
    return link, event, participation, user


async def handle_reply(
    session: AsyncSession,
    chert: ChertClient,
    message: InboundMessage,
    *,
    form_base: str,
    now: datetime | None = None,
) -> None:
    """Apply one inbound text. A repeated provider event id does nothing the second time."""
    now = now or _now()
    if not await _claim_event(session, message.event_id):
        return
    try:
        sender = normalize_phone(message.sender)
    except ValueError:
        sender = message.sender.strip()
    user = await session.scalar(select(User).where(User.phone == sender))
    reply = InboundReply(
        provider_event_id=message.event_id,
        sender=sender,
        body=message.text,
        resolution="review",
        user_id=user.id if user else None,
    )
    session.add(reply)
    if user is None:
        reply.resolution = "unmatched"
        return

    kind = classify_reply(message.text)
    if kind == "stop":
        user.text_opt_in = False
        reply.resolution = "opt_out"
        return
    if not user.text_opt_in:
        reply.resolution = "opt_out"
        return

    invited = list(
        await session.scalars(
            select(Participation).where(
                Participation.user_id == user.id, Participation.status == "invited"
            )
        )
    )
    events = {}
    if invited:
        events = {
            event.id: event
            for event in await session.scalars(
                select(Event).where(Event.id.in_([row.event_id for row in invited]))
            )
        }
    options = [(row, events[row.event_id].title) for row in invited if row.event_id in events]
    chosen = match_event_title(message.text, options)
    if chosen is not None and kind != "no":
        await _record_interest(
            session, chert, chosen, events[chosen.event_id], user, form_base, now
        )
        reply.resolution = "applied"
        reply.participation_id = chosen.id
        return
    if kind == "other":
        reply.resolution = "review"
        return
    if len(invited) == 0:
        reply.resolution = "unmatched"
        return
    if len(invited) > 1:
        reply.resolution = "ambiguous"
        await _send_clarification(session, chert, user, invited, events)
        return

    participation = invited[0]
    event = events[participation.event_id]
    reply.participation_id = participation.id
    reply.resolution = "applied"
    if kind == "yes":
        await _record_interest(session, chert, participation, event, user, form_base, now)
    else:
        participation.status = apply_no(participation.status)


async def _record_interest(
    session, chert, participation, event, user, form_base: str, now: datetime
) -> None:
    previous = participation.status
    participation.status = apply_yes(previous)
    if previous != "invited":
        return
    link = await session.scalar(
        select(FormLink).where(FormLink.participation_id == participation.id)
    )
    if link is None:
        link = FormLink(
            event_id=event.id,
            participation_id=participation.id,
            expires_at=now + FORM_TTL,
        )
        session.add(link)
        await session.flush()
    elif link.expires_at <= now:
        link.expires_at = now + FORM_TTL
    await _send_form(session, chert, participation, event, user, link, form_base)


async def _send_form(session, chert, participation, event, user, link, form_base: str) -> None:
    key = f"form-link:{participation.id}"
    delivery = await session.scalar(select(Delivery).where(Delivery.idempotency_key == key))
    if delivery is not None and delivery.state in ACCEPTED_DELIVERY:
        return
    if delivery is None:
        delivery = Delivery(
            event_id=event.id,
            participation_id=participation.id,
            state="queued",
            idempotency_key=key,
        )
        session.add(delivery)
        await session.flush()
    url = f"{form_base.rstrip('/')}/{link.id}"
    text = (
        f"Thanks for saying yes to {event.title}. Share your availability and preferred role: {url}"
    )
    if user.phone:
        await _apply_send(chert, delivery, user.phone, text)


async def _send_clarification(session, chert, user, invited, events) -> None:
    names = ", ".join(
        sorted(events[row.event_id].title for row in invited if row.event_id in events)
    )
    key = "clarify:" + str(user.id) + ":" + ",".join(sorted(str(row.id) for row in invited))
    delivery = await session.scalar(select(Delivery).where(Delivery.idempotency_key == key))
    if delivery is not None and delivery.state in ACCEPTED_DELIVERY:
        return
    if delivery is None:
        delivery = Delivery(state="queued", idempotency_key=key)
        session.add(delivery)
        await session.flush()
    if user.phone:
        await _apply_send(
            chert,
            delivery,
            user.phone,
            f"You have invitations for more than one event. Reply with one name: {names}.",
        )


async def _claim_event(session: AsyncSession, event_id: str) -> bool:
    if not event_id:
        return True
    session.add(ProviderEvent(event_id=event_id))
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        return False
    return True
