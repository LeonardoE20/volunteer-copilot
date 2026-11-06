import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.services.chert import ChertClient, ChertError, MessageStatus, SendResult

Handler = Callable[[httpx.Request], httpx.Response]


def _run(handler: Handler, call: Callable[[ChertClient], Any], secret: str = "sk_test") -> Any:
    async def run() -> Any:
        transport = httpx.MockTransport(handler)
        async with ChertClient(secret, client=httpx.AsyncClient(transport=transport)) as chert:
            return await call(chert)

    return asyncio.run(run())


def _send(handler: Handler) -> SendResult:
    return _run(handler, lambda chert: chert.send("+14155551234", "Hi", idempotency_key="k1"))


def _get(handler: Handler) -> MessageStatus:
    return _run(handler, lambda chert: chert.get_message("m1"))


def _reply(status_code: int, body: dict[str, Any]) -> Handler:
    return lambda request: httpx.Response(status_code, json=body)


def test_send_posts_message_with_bearer_auth() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200, json={"status": "sent", "message_id": "m1", "chat_id": "c1", "lead_id": "c1"}
        )

    result = _send(handler)

    [request] = requests
    assert str(request.url) == "https://console.trychert.com/api/v1/send"
    assert request.headers["Authorization"] == "Bearer sk_test"
    assert json.loads(request.content) == {
        "phone": "+14155551234",
        "body": "Hi",
        "idempotency_key": "k1",
    }
    assert result == SendResult(state="sent", message_id="m1", chat_id="c1", provider_status="sent")


def test_send_reports_queued_sends() -> None:
    result = _send(_reply(202, {"status": "queued", "message_id": "m1"}))

    assert (result.state, result.message_id) == ("queued", "m1")


def test_send_reports_confirmed_failures() -> None:
    body = {
        "status": "failed",
        "error": "send_failed",
        "code": 4001,
        "reason": "recipient is not reachable on iMessage",
        "retryable": True,
        "chat_id": "c1",
    }

    result = _send(_reply(502, body))

    assert result.state == "failed"
    assert (result.error_code, result.retryable) == (4001, True)
    assert result.error == "recipient is not reachable on iMessage"


@pytest.mark.parametrize(
    ("status_code", "body"),
    [
        # Chert couldn't confirm the outcome; it says never to retry these automatically.
        (502, {"status": "failed", "error": "send_failed", "code": 4103, "retryable": False}),
        # An internal error mid-send may still have delivered the message.
        (500, {"status": "failed", "error": "send_failed", "code": 3001, "retryable": True}),
        # Chert skipped an identical recent send.
        (200, {"status": "duplicate"}),
    ],
)
def test_send_reports_unconfirmed_outcomes_as_unknown(
    status_code: int, body: dict[str, Any]
) -> None:
    assert _send(_reply(status_code, body)).state == "unknown"


def test_send_reports_unknown_when_the_response_is_lost() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    assert _send(handler).state == "unknown"


def test_send_raises_when_chert_is_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(ChertError) as caught:
        _send(handler)
    assert caught.value.retryable


def test_send_raises_on_auth_failure() -> None:
    with pytest.raises(ChertError) as caught:
        _send(_reply(401, {"error": "auth_failed", "code": "auth_failed"}))
    assert (caught.value.status_code, caught.value.code) == (401, "auth_failed")


def test_send_raises_on_rate_limit_envelope() -> None:
    body = {
        "success": False,
        "error": {"status": 429, "code": 1007, "message": "Rate limited", "retryable": True},
        "trace_id": "t1",
    }

    with pytest.raises(ChertError) as caught:
        _send(_reply(429, body))
    assert (caught.value.code, caught.value.retryable, str(caught.value)) == (
        1007,
        True,
        "Rate limited",
    )


def test_send_requires_a_signing_secret() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"status": "sent"})

    send = lambda chert: chert.send("+14155551234", "Hi", idempotency_key="k1")  # noqa: E731
    with pytest.raises(ChertError, match="CHERT_SIGNING_SECRET"):
        _run(handler, send, secret="")
    assert requests == []


@pytest.mark.parametrize("status", ["delivered", "read"])
def test_get_message_reports_delivery(status: str) -> None:
    body = {
        "id": "m1",
        "status": status,
        "service": "imessage",
        "delivered_at": "2026-05-01T12:00:00Z",
        "read_at": None,
    }

    result = _get(_reply(200, body))

    assert result == MessageStatus(
        message_id="m1",
        state="delivered",
        provider_status=status,
        service="imessage",
        delivered_at=datetime(2026, 5, 1, 12, tzinfo=UTC),
        read_at=None,
    )


def test_get_message_accepts_a_wrapped_message() -> None:
    result = _get(_reply(200, {"message": {"id": "m1", "status": "sent"}}))

    assert (result.message_id, result.state) == ("m1", "sent")


def test_get_message_reports_unknown_delivery() -> None:
    body = {"id": "m1", "status": "failed", "error": "delivery_unknown", "code": 4103}

    assert _get(_reply(200, body)).state == "unknown"


def test_get_message_raises_when_not_found() -> None:
    body = {
        "success": False,
        "error": {"status": 404, "code": 2003, "message": "Message not found", "retryable": False},
    }

    with pytest.raises(ChertError) as caught:
        _get(_reply(404, body))
    assert (caught.value.status_code, caught.value.code) == (404, 2003)
