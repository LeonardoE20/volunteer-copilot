import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_inbound_handler
from app.core.config import Settings, get_settings
from app.main import app
from app.services.chert import InboundMessage, parse_inbound, verify_signature

SECRET = "whsec_test"

# Trimmed from the message.received example at https://docs.trychert.com/api/receiving-replies
EVENT: dict[str, Any] = {
    "event_id": "chert:msg:7b7f4a1cc9d54809a1e4f1b2",
    "event_type": "message.received",
    "partner_id": "volunteer-copilot",
    "data": {
        "chat": {
            "id": "17f6e9ed",
            "is_group": False,
            "owner_handle": {"handle": "+14152165723", "service": "imessage", "is_me": True},
        },
        "message": {
            "id": "0D36042D-C551-4CB4-9BE7-853832D6F2FE",
            "direction": "inbound",
            "sender_handle": {"handle": "+14155551234", "service": "imessage", "is_me": False},
            "parts": [
                {"type": "text", "value": "YES"},
                {"type": "media", "attachment_id": "in_536f", "filename": "photo.jpg"},
            ],
            "sent_at": "2026-05-24T01:35:34.000Z",
        },
    },
}


def _sign(body: bytes, timestamp: int, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def test_verify_signature_accepts_both_header_formats() -> None:
    body, now = b'{"a": 1}', 1_800_000_000
    signature = _sign(body, now)

    assert verify_signature(body, f"t={now},v1={signature}", SECRET, now=now)
    assert verify_signature(body, f"v1,{now},{signature}", SECRET, now=now + 299)


@pytest.mark.parametrize(
    ("body", "header", "now"),
    [
        (b'{"a": 2}', "t=1800000000,v1={sig}", 1_800_000_000),  # body changed after signing
        (b'{"a": 1}', "t=1800000000,v1={sig}", 1_800_000_301),  # outside the 5 minute window
        (b'{"a": 1}', "t=1800000000,v1=deadbeef", 1_800_000_000),
        (b'{"a": 1}', "sha256={sig}", 1_800_000_000),
        (b'{"a": 1}', None, 1_800_000_000),
    ],
)
def test_verify_signature_rejects(body: bytes, header: str | None, now: int) -> None:
    signature = _sign(b'{"a": 1}', 1_800_000_000)
    header = header.format(sig=signature) if header else None

    assert not verify_signature(body, header, SECRET, now=now)


def test_verify_signature_rejects_another_secret() -> None:
    body, now = b'{"a": 1}', 1_800_000_000

    assert not verify_signature(body, f"t={now},v1={_sign(body, now, 'other')}", SECRET, now=now)


def test_parse_inbound_normalizes_a_reply() -> None:
    assert parse_inbound(EVENT) == InboundMessage(
        event_id="chert:msg:7b7f4a1cc9d54809a1e4f1b2",
        message_id="0D36042D-C551-4CB4-9BE7-853832D6F2FE",
        chat_id="17f6e9ed",
        sender="+14155551234",
        line="+14152165723",
        text="YES",
        attachment_ids=("in_536f",),
        is_group=False,
        received_at=datetime(2026, 5, 24, 1, 35, 34, tzinfo=UTC),
    )


def test_parse_inbound_ignores_other_events() -> None:
    assert parse_inbound({"event_id": "e1", "event_type": "message.sent", "data": {}}) is None


@pytest.mark.parametrize("payload", [[], {"event_type": "message.received", "data": {}}])
def test_parse_inbound_rejects_malformed_events(payload: Any) -> None:
    with pytest.raises(ValueError):
        parse_inbound(payload)


@pytest.fixture
def received() -> Iterator[list[InboundMessage]]:
    messages: list[InboundMessage] = []

    async def record(message: InboundMessage) -> None:
        messages.append(message)

    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, chert_webhook_secret=SECRET
    )
    app.dependency_overrides[get_inbound_handler] = lambda: record
    yield messages
    app.dependency_overrides.clear()


def _post(client: TestClient, event: Any, *, secret: str = SECRET) -> int:
    body = json.dumps(event).encode()
    timestamp = int(time.time())
    headers = {
        "content-type": "application/json",
        "X-Webhook-Signature": f"t={timestamp},v1={_sign(body, timestamp, secret)}",
    }
    return client.post("/api/v1/chert/webhook", content=body, headers=headers).status_code


def test_webhook_passes_replies_to_the_handler(
    client: TestClient, received: list[InboundMessage]
) -> None:
    assert _post(client, EVENT) == 204
    assert [(m.event_id, m.text) for m in received] == [(EVENT["event_id"], "YES")]


def test_webhook_rejects_bad_signatures(client: TestClient, received: list[InboundMessage]) -> None:
    assert _post(client, EVENT, secret="other") == 401
    assert received == []


def test_webhook_ignores_other_events(client: TestClient, received: list[InboundMessage]) -> None:
    assert _post(client, {"event_id": "e1", "event_type": "message.sent"}) == 204
    assert received == []


def test_webhook_rejects_malformed_events(
    client: TestClient, received: list[InboundMessage]
) -> None:
    assert _post(client, {"event_id": "e1", "event_type": "message.received"}) == 400
    assert received == []


def test_webhook_refuses_events_until_configured(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    try:
        assert _post(client, EVENT) == 503
    finally:
        app.dependency_overrides.clear()
