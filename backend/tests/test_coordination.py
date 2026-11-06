import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.api.deps import get_chert
from app.core.config import Settings, get_settings
from app.main import app
from app.services.chert import ChertError, MessageStatus, SendResult

pytestmark = pytest.mark.usefixtures("db")

SECRET = "whsec_test"
BAKE = {
    "title": "Bake sale",
    "location": "Community hall",
    "starts_at": "2026-12-05T09:00:00-08:00",
    "ends_at": "2026-12-05T14:00:00-08:00",
    "seed_role_presets": True,
}
PRESETS = ["Cook", "Wrapper", "Cashier", "Runner", "Dishwasher", "Cleaner"]
WINDOW = {
    "starts_at": "2026-12-05T09:00:00-08:00",
    "ends_at": "2026-12-05T12:00:00-08:00",
}


class FakeChert:
    group_block_reason = (
        "This adapter sends one person at a time and does not open a Chert group chat. "
        "The group was not sent, and it was not split into individual texts."
    )

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []
        self.results: list[SendResult | Exception] = []
        self.status = MessageStatus(
            message_id="m1",
            state="delivered",
            provider_status="delivered",
            service="imessage",
            delivered_at=datetime(2026, 12, 1, tzinfo=UTC),
            read_at=None,
        )

    async def send(self, to: str, text: str, *, idempotency_key: str) -> SendResult:
        self.sent.append((to, text, idempotency_key))
        result = (
            self.results.pop(0)
            if self.results
            else SendResult(
                state="sent", message_id=f"m{len(self.sent)}", chat_id="c1", provider_status="sent"
            )
        )
        if isinstance(result, Exception):
            raise result
        return result

    async def get_message(self, message_id: str) -> MessageStatus:
        return self.status


@pytest.fixture
def chert() -> FakeChert:
    fake = FakeChert()
    app.dependency_overrides[get_chert] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_chert, None)


def _event(client: TestClient, **changes: object) -> dict:
    created = client.post("/api/v1/events", json={**BAKE, **changes})
    assert created.status_code == 201, created.text
    return created.json()


def _user(client: TestClient, name: str = "Ann", phone: str = "+15105550100") -> dict:
    created = client.post(
        "/api/v1/users",
        json={"name": name, "email": f"{name.lower()}@example.com", "phone": phone},
    )
    assert created.status_code == 201, created.text
    return created.json()


def _join(client: TestClient, event_id: str, user_id: str, pool: str = "primary") -> dict:
    created = client.post(
        f"/api/v1/events/{event_id}/participations",
        json={"user_ids": [user_id], "pool": pool},
    )
    assert created.status_code == 201, created.text
    return created.json()[0]


def _shift(client: TestClient, event_id: str, name: str) -> dict:
    return next(
        shift
        for shift in client.get(f"/api/v1/events/{event_id}/workspace").json()["shifts"]
        if shift["name"] == name
    )


def _sign(body: bytes, timestamp: int) -> str:
    return hmac.new(SECRET.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def _reply(client: TestClient, sender: str, text: str, event_id: str = "evt-1") -> int:
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, chert_webhook_secret=SECRET
    )
    payload = {
        "event_id": event_id,
        "event_type": "message.received",
        "data": {
            "chat": {"id": "chat-1", "is_group": False, "owner_handle": {"handle": "+14152165723"}},
            "message": {
                "id": "msg-1",
                "sender_handle": {"handle": sender},
                "parts": [{"type": "text", "value": text}],
                "sent_at": "2026-12-01T18:00:00Z",
            },
        },
    }
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    try:
        return client.post(
            "/api/v1/chert/webhook",
            content=body,
            headers={
                "content-type": "application/json",
                "X-Webhook-Signature": f"t={timestamp},v1={_sign(body, timestamp)}",
            },
        ).status_code
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_workspace_includes_the_six_role_presets(client: TestClient) -> None:
    event = _event(client)

    workspace = client.get(f"/api/v1/events/{event['id']}/workspace").json()

    assert [shift["name"] for shift in workspace["shifts"]] == sorted(PRESETS)
    assert workspace["event"]["timezone"] == "America/Los_Angeles"
    assert workspace["event"]["status"] == "published"
    cashier = next(shift for shift in workspace["shifts"] if shift["name"] == "Cashier")
    assert cashier["coverage"] == {
        "confirmed": 0,
        "unfilled": 1,
        "awaiting_reply": 0,
        "standby": 0,
    }
    assert workspace["participations"] == []


def test_a_second_event_keeps_its_own_roster(client: TestClient) -> None:
    first = _event(client)
    second = _event(
        client,
        title="Food drive",
        starts_at="2026-12-12T09:00:00-08:00",
        ends_at="2026-12-12T14:00:00-08:00",
    )
    ann = _user(client)
    _join(client, first["id"], ann["id"])

    assert client.get(f"/api/v1/events/{second['id']}/workspace").json()["participations"] == []
    assert len(client.get(f"/api/v1/events/{first['id']}/workspace").json()["participations"]) == 1


def test_public_registration_returns_only_a_receipt(client: TestClient) -> None:
    created = client.post(
        "/api/v1/volunteers/register", json={"name": "Ann", "phone": "(510) 555-0100"}
    )
    assert created.status_code == 201
    assert set(created.json()) == {"receipt"}

    again = client.post("/api/v1/volunteers/register", json={"name": "Ann", "phone": "5105550100"})
    assert again.status_code == 200
    assert again.json() == created.json()

    listed = client.get("/api/v1/users").json()
    assert listed[0]["phone"] == "+15105550100"
    assert listed[0]["text_opt_in"] is True


def test_duplicate_phone_on_the_coordinator_list_is_rejected(client: TestClient) -> None:
    _user(client)
    taken = client.post(
        "/api/v1/users",
        json={"name": "Bo", "email": "bo@example.com", "phone": "+1 510 555 0100"},
    )
    assert taken.status_code == 409
    assert taken.json()["detail"] == "A user with this phone number already exists"


def test_dispatch_sends_one_text_per_person_and_does_not_resend(
    client: TestClient, chert: FakeChert
) -> None:
    event = _event(client)
    ann = _user(client)
    participation = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help at the bake sale?",
            "participant_ids": [participation["id"]],
        },
    ).json()

    first = client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
    second = client.post(f"/api/v1/drafts/{draft['id']}/dispatch")

    assert first.status_code == 200
    assert first.json()["accepted"] is True
    assert first.json()["deliveries"][0]["state"] == "sent"
    assert first.json()["deliveries"][0]["state"] != "delivered"
    assert len(chert.sent) == 1
    assert chert.sent[0][0] == "+15105550100"
    assert second.json()["deliveries"][0]["id"] == first.json()["deliveries"][0]["id"]
    assert len(chert.sent) == 1
    roster = client.get(f"/api/v1/events/{event['id']}/workspace").json()
    assert roster["participations"][0]["status"] == "invited"
    assert roster["shifts"][0]["coverage"]["awaiting_reply"] == 1
    assert roster["shifts"][0]["coverage"]["confirmed"] == 0


def test_group_draft_is_blocked_without_sending(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client)
    participation = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "audience": "group",
            "text": "Hello everyone",
            "participant_ids": [participation["id"]],
        },
    ).json()

    response = client.post(f"/api/v1/drafts/{draft['id']}/dispatch")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "messaging_unavailable"
    assert response.json()["detail"]["retryable"] is False
    assert chert.sent == []


def test_standby_does_not_text_the_primary_pool(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    other = _event(
        client,
        title="Food drive",
        starts_at="2026-12-12T09:00:00-08:00",
        ends_at="2026-12-12T14:00:00-08:00",
    )
    ann = _user(client)
    primary = _join(client, event["id"], ann["id"], pool="primary")
    standby = _join(client, other["id"], ann["id"], pool="standby")
    draft = client.post(
        f"/api/v1/events/{other['id']}/drafts",
        json={
            "purpose": "standby",
            "text": "Can you stand by for the food drive?",
            "participant_ids": [standby["id"]],
        },
    )
    blocked = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "standby",
            "text": "Wrong pool",
            "participant_ids": [primary["id"]],
        },
    ).json()

    assert "not in the standby pool" in blocked["skipped"][0]["reason"]
    sent = client.post(f"/api/v1/drafts/{draft.json()['id']}/dispatch")
    assert sent.status_code == 200
    assert len(chert.sent) == 1
    assert (
        client.get(f"/api/v1/events/{event['id']}/workspace").json()["participations"][0]["status"]
        == "not_invited"
    )
    assert (
        client.get(f"/api/v1/events/{other['id']}/workspace").json()["participations"][0]["status"]
        == "invited"
    )


def test_yes_sends_one_form_link_and_a_repeat_does_not(
    client: TestClient, chert: FakeChert
) -> None:
    event = _event(client)
    ann = _user(client, phone="+14155551234")
    participation = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [participation["id"]],
        },
    ).json()
    client.post(f"/api/v1/drafts/{draft['id']}/dispatch")

    assert _reply(client, "+14155551234", "YES", "evt-yes") == 204
    assert _reply(client, "+14155551234", "yes", "evt-yes") == 204

    form_texts = [text for _phone, text, _key in chert.sent if "Share your availability" in text]
    assert len(form_texts) == 1
    token = form_texts[0].rstrip("/").split("/")[-1]
    form = client.get(f"/api/v1/forms/{token}")
    assert form.status_code == 200
    body = form.json()
    assert body["volunteer_name"] == "Ann"
    assert body["event"]["title"] == "Bake sale"
    assert "phone" not in body
    assert all("@" not in json.dumps(shift) for shift in body["shifts"])
    roster = client.get(f"/api/v1/events/{event['id']}/workspace").json()
    assert roster["participations"][0]["status"] == "interested"


def test_yes_for_two_events_asks_which_one(client: TestClient, chert: FakeChert) -> None:
    bake = _event(client)
    drive = _event(
        client,
        title="Food drive",
        starts_at="2026-12-12T09:00:00-08:00",
        ends_at="2026-12-12T14:00:00-08:00",
    )
    ann = _user(client, phone="+14155551234")
    for event in (bake, drive):
        participation = _join(client, event["id"], ann["id"])
        draft = client.post(
            f"/api/v1/events/{event['id']}/drafts",
            json={
                "purpose": "interest",
                "text": "Can you help?",
                "participant_ids": [participation["id"]],
            },
        ).json()
        client.post(f"/api/v1/drafts/{draft['id']}/dispatch")

    assert _reply(client, "+14155551234", "YES", "evt-both") == 204

    clarification = chert.sent[-1][1]
    assert "Bake sale" in clarification
    assert "Food drive" in clarification
    assert "Share your availability" not in clarification
    for event in (bake, drive):
        status = client.get(f"/api/v1/events/{event['id']}/workspace").json()["participations"][0][
            "status"
        ]
        assert status == "invited"

    assert _reply(client, "+14155551234", "Bake sale", "evt-pick") == 204
    assert (
        client.get(f"/api/v1/events/{bake['id']}/workspace").json()["participations"][0]["status"]
        == "interested"
    )
    assert (
        client.get(f"/api/v1/events/{drive['id']}/workspace").json()["participations"][0]["status"]
        == "invited"
    )


def test_stop_opts_out_across_events(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client, phone="+14155551234")
    participation = _join(client, event["id"], ann["id"])
    assert _reply(client, "+14155551234", "STOP", "evt-stop") == 204

    user = client.get(f"/api/v1/users/{ann['id']}").json()
    assert user["text_opt_in"] is False
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [participation["id"]],
        },
    ).json()
    sent = client.post(f"/api/v1/drafts/{draft['id']}/dispatch").json()
    assert sent["skipped"][0]["reason"] == "opted out of texts"
    assert chert.sent == []


def test_form_submission_does_not_confirm_the_shift(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client, phone="+14155551234")
    participation = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [participation["id"]],
        },
    ).json()
    client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
    _reply(client, "+14155551234", "YES", "evt-form")
    token = (
        next(text for _to, text, _key in chert.sent if "forms/" in text).rstrip("/").split("/")[-1]
    )
    cashier = _shift(client, event["id"], "Cashier")

    submitted = client.post(
        f"/api/v1/forms/{token}",
        json={"availability": [WINDOW], "preferred_shift_ids": [cashier["id"]]},
    )

    assert submitted.status_code == 200
    assert submitted.json()["status"] == "details_submitted"
    roster = client.get(f"/api/v1/events/{event['id']}/workspace").json()
    assert roster["participations"][0]["status"] == "details_submitted"
    assert roster["shifts"][0]["coverage"]["confirmed"] == 0
    assert len(client.get("/api/v1/users").json()) == 1


def test_confirm_checks_capacity_and_overlap(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client, phone="+14155551234")
    bo = _user(client, name="Bo", phone="+15105550199")
    ann_row = _join(client, event["id"], ann["id"])
    bo_row = _join(client, event["id"], bo["id"])
    for row, phone, event_id in (
        (ann_row, "+14155551234", "evt-ann"),
        (bo_row, "+15105550199", "evt-bo"),
    ):
        draft = client.post(
            f"/api/v1/events/{event['id']}/drafts",
            json={
                "purpose": "interest",
                "text": "Can you help?",
                "participant_ids": [row["id"]],
            },
        ).json()
        client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
        _reply(client, phone, "YES", event_id)
    cashier = _shift(client, event["id"], "Cashier")
    cook = _shift(client, event["id"], "Cook")
    links = [body for _to, body, _key in chert.sent if "forms/" in body]
    assert len(links) == 2
    for link in links:
        token = link.rstrip("/").split("/")[-1]
        client.post(
            f"/api/v1/forms/{token}",
            json={"availability": [WINDOW], "preferred_shift_ids": [cashier["id"]]},
        )

    first = client.post(
        f"/api/v1/participations/{ann_row['id']}/confirm", json={"shift_id": cashier["id"]}
    )
    second = client.post(
        f"/api/v1/participations/{bo_row['id']}/confirm", json={"shift_id": cashier["id"]}
    )
    overlap = client.post(
        f"/api/v1/participations/{ann_row['id']}/confirm", json={"shift_id": cook["id"]}
    )

    assert first.status_code == 200
    assert first.json()["status"] == "confirmed"
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "capacity"
    assert overlap.status_code == 409
    assert overlap.json()["detail"]["code"] == "conflict"
    coverage = _shift(client, event["id"], "Cashier")["coverage"]
    assert coverage["confirmed"] == 1
    assert coverage["unfilled"] == 0


def test_non_overlapping_shifts_can_both_be_confirmed(client: TestClient, chert: FakeChert) -> None:
    event = _event(client, seed_role_presets=False)
    morning = client.post(
        f"/api/v1/events/{event['id']}/roles",
        json={
            "name": "Cashier",
            "slots_needed": 1,
            "starts_at": "2026-12-05T09:00:00-08:00",
            "ends_at": "2026-12-05T12:00:00-08:00",
        },
    ).json()
    afternoon = client.post(
        f"/api/v1/events/{event['id']}/roles",
        json={
            "name": "Cook",
            "slots_needed": 1,
            "starts_at": "2026-12-05T12:00:00-08:00",
            "ends_at": "2026-12-05T14:00:00-08:00",
        },
    ).json()
    ann = _user(client, phone="+14155551234")
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [row["id"]],
        },
    ).json()
    client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
    _reply(client, "+14155551234", "YES", "evt-shifts")
    token = (
        next(body for _to, body, _key in chert.sent if "forms/" in body).rstrip("/").split("/")[-1]
    )
    client.post(
        f"/api/v1/forms/{token}",
        json={"availability": [WINDOW], "preferred_shift_ids": [morning["id"], afternoon["id"]]},
    )

    assert (
        client.post(
            f"/api/v1/participations/{row['id']}/confirm", json={"shift_id": morning["id"]}
        ).status_code
        == 200
    )
    second = client.post(
        f"/api/v1/participations/{row['id']}/confirm", json={"shift_id": afternoon["id"]}
    )
    assert second.status_code == 200
    assert set(second.json()["confirmed_shift_ids"]) == {morning["id"], afternoon["id"]}


def test_expired_form_is_rejected(
    client: TestClient, chert: FakeChert, test_engine: Engine
) -> None:
    event = _event(client)
    ann = _user(client, phone="+14155551234")
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [row["id"]],
        },
    ).json()
    client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
    _reply(client, "+14155551234", "YES", "evt-expire")
    token = (
        next(text for _to, text, _key in chert.sent if "forms/" in text).rstrip("/").split("/")[-1]
    )
    with test_engine.begin() as connection:
        connection.execute(text("update form_links set expires_at = now() - interval '1 day'"))

    response = client.get(f"/api/v1/forms/{token}")

    assert response.status_code == 410
    assert response.json()["detail"]["code"] == "expired_form"


def test_a_passed_preset_is_not_scheduled(client: TestClient, chert: FakeChert) -> None:
    event = _event(
        client,
        starts_at="2026-11-07T09:00:00-08:00",
        ends_at="2026-11-07T12:00:00-08:00",
    )
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])

    response = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "reminder",
            "text": "See you soon",
            "participant_ids": [row["id"]],
            "relative_offset": "1w",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "schedule_passed"
    assert chert.sent == []


def test_due_reminder_uses_the_same_send_path(
    client: TestClient, chert: FakeChert, test_engine: Engine
) -> None:
    event = _event(client)
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])
    created = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "reminder",
            "text": "Bake sale is in an hour",
            "participant_ids": [row["id"]],
            "relative_offset": "1h",
        },
    )
    assert created.status_code == 201
    held = client.post(f"/api/v1/drafts/{created.json()['id']}/dispatch")
    assert held.json()["status"] == "scheduled"
    assert chert.sent == []
    with test_engine.begin() as connection:
        connection.execute(
            text(
                "update message_drafts set send_at = now() - interval '1 minute', "
                "status = 'scheduled'"
            )
        )

    due = client.post("/api/v1/jobs/dispatch-due")

    assert due.status_code == 200
    assert chert.sent[0][1] == "Bake sale is in an hour"
    assert due.json()[0]["deliveries"][0]["state"] == "sent"


def test_moving_the_event_revises_an_unsent_reminder(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "reminder",
            "text": "Reminder",
            "participant_ids": [row["id"]],
            "relative_offset": "1w",
        },
    ).json()
    client.post(f"/api/v1/drafts/{draft['id']}/dispatch")
    original = datetime.fromisoformat(client.get(f"/api/v1/drafts/{draft['id']}").json()["send_at"])

    moved = client.patch(
        f"/api/v1/events/{event['id']}",
        json={"starts_at": "2026-12-20T09:00:00-08:00", "ends_at": "2026-12-20T14:00:00-08:00"},
    )
    revised = datetime.fromisoformat(client.get(f"/api/v1/drafts/{draft['id']}").json()["send_at"])
    assert moved.status_code == 200
    assert revised - original == timedelta(days=15)

    passed = client.patch(
        f"/api/v1/events/{event['id']}",
        json={"starts_at": "2026-11-08T09:00:00-08:00", "ends_at": "2026-11-08T14:00:00-08:00"},
    )
    assert passed.status_code == 200
    assert client.get(f"/api/v1/drafts/{draft['id']}").json()["status"] == "needs_review"
    blocked = client.post("/api/v1/jobs/dispatch-due")
    assert blocked.json() == []
    assert chert.sent == []


def test_reconcile_and_status_webhook_update_delivery(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [row["id"]],
        },
    ).json()
    delivery = client.post(f"/api/v1/drafts/{draft['id']}/dispatch").json()["deliveries"][0]
    assert delivery["state"] == "sent"

    reconciled = client.post(f"/api/v1/deliveries/{delivery['id']}/reconcile")
    assert reconciled.status_code == 200
    assert reconciled.json()["state"] == "delivered"

    # A later failure must not wipe a delivery Chert already confirmed.
    payload = {
        "event_id": "evt-status",
        "event_type": "message.updated",
        "data": {"message": {"id": delivery["provider_message_id"], "status": "failed"}},
    }
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, chert_webhook_secret=SECRET
    )
    try:
        status = client.post(
            "/api/v1/chert/webhook",
            content=body,
            headers={
                "content-type": "application/json",
                "X-Webhook-Signature": f"t={timestamp},v1={_sign(body, timestamp)}",
            },
        ).status_code
    finally:
        app.dependency_overrides.pop(get_settings, None)
    assert status == 204
    assert client.get(f"/api/v1/events/{event['id']}/deliveries").json()[0]["state"] == "delivered"


def test_failed_send_can_be_retried_without_a_second_message_id(
    client: TestClient, chert: FakeChert
) -> None:
    event = _event(client)
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "interest",
            "text": "Can you help?",
            "participant_ids": [row["id"]],
        },
    ).json()
    chert.results.append(
        SendResult(state="failed", error="line busy", retryable=True, provider_status="failed")
    )
    failed = client.post(f"/api/v1/drafts/{draft['id']}/dispatch").json()["deliveries"][0]
    assert failed["state"] == "failed"
    assert (
        client.get(f"/api/v1/events/{event['id']}/workspace").json()["participations"][0]["status"]
        == "not_invited"
    )

    retried = client.post(f"/api/v1/deliveries/{failed['id']}/retry")
    assert retried.status_code == 200
    assert retried.json()["state"] == "sent"
    assert retried.json()["id"] == failed["id"]
    assert [item[2] for item in chert.sent] == [chert.sent[0][2], chert.sent[0][2]]


def test_chert_outage_is_a_failed_delivery(client: TestClient, chert: FakeChert) -> None:
    event = _event(client)
    ann = _user(client)
    row = _join(client, event["id"], ann["id"])
    draft = client.post(
        f"/api/v1/events/{event['id']}/drafts",
        json={
            "purpose": "reminder",
            "text": "Hello",
            "participant_ids": [row["id"]],
        },
    ).json()
    chert.results.append(ChertError("Couldn't reach Chert", retryable=True))

    response = client.post(f"/api/v1/drafts/{draft['id']}/dispatch")

    assert response.status_code == 200
    assert response.json()["deliveries"][0]["state"] == "failed"
    assert response.json()["deliveries"][0]["retryable"] is True
