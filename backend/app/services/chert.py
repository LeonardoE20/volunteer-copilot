"""Adapter for the Chert Messaging API, which sends and receives iMessages.

Only this module knows Chert's request and payload shapes. The rest of the app works with
SendResult, MessageStatus and InboundMessage. API reference: https://docs.trychert.com/api/overview
"""

import hashlib
import hmac
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Self

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://console.trychert.com/api/v1"

# queued: Chert accepted the send and is still trying; poll get_message for the outcome.
# sent: Chert handed it to iMessage or SMS. Not proof the recipient got it.
# delivered: Chert observed delivery (or a read receipt).
# failed: Chert confirms it didn't reach the recipient.
# unknown: the outcome can't be confirmed and it may have been delivered. Check get_message or
#   the conversation before sending again, rather than resending.
DeliveryState = Literal["queued", "sent", "delivered", "failed", "unknown"]

_STATES: dict[str, DeliveryState] = {
    "queued": "queued",
    "sent": "sent",
    "delivered": "delivered",
    "read": "delivered",
    "failed": "failed",
}
# The send started but its outcome couldn't be confirmed. Chert: never retry it automatically.
DELIVERY_UNKNOWN = 4103
# Failures Chert confirms didn't go out: downstream rejected it, lines saturated, SMS retry failed.
# Any other 5xx failure, such as an internal error mid-send, may still have been delivered.
_CONFIRMED_FAILURES = {4001, 4002, 4104}

# Chert signs webhooks with the subscription secret and allows 5 minutes of clock skew.
SIGNATURE_TOLERANCE_SECONDS = 300


class ChertError(Exception):
    """A request failed without a per-message outcome, e.g. bad credentials or a rate limit."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: int | str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class SendResult:
    state: DeliveryState
    # Chert's id for this send, for get_message. None when Chert didn't return one.
    message_id: str | None = None
    # Conversation id, for chat follow-ups and for matching replies.
    chat_id: str | None = None
    # Chert's own status string, e.g. "duplicate" when it skipped an identical recent send.
    provider_status: str | None = None
    error_code: int | None = None
    error: str | None = None
    # Chert's hint that the failure may be transient. It doesn't prove nothing was sent.
    retryable: bool = False


@dataclass(frozen=True)
class MessageStatus:
    message_id: str
    state: DeliveryState
    provider_status: str | None
    # "imessage", or "sms" when the line retried as SMS.
    service: str | None
    delivered_at: datetime | None
    read_at: datetime | None


@dataclass(frozen=True)
class InboundMessage:
    # Chert delivers events at least once; deduplicate on event_id.
    event_id: str
    message_id: str
    chat_id: str
    # Who wrote: a phone number or Apple ID email, normalized by Chert.
    sender: str
    # The Chert line it arrived on.
    line: str | None
    text: str
    # Fetch with GET /api/v1/attachments/{id}/content.
    attachment_ids: tuple[str, ...]
    is_group: bool
    received_at: datetime | None


InboundHandler = Callable[[InboundMessage], Awaitable[None]]


async def log_inbound(message: InboundMessage) -> None:
    """Log a reply. The webhook uses handle_reply instead; this remains for a local stand-in."""
    logger.warning("Chert reply %s in chat %s isn't handled yet", message.event_id, message.chat_id)


@dataclass(frozen=True)
class ProviderStatus:
    """A delivery update carried on a webhook that is not an inbound reply."""

    event_id: str
    message_id: str
    state: DeliveryState
    delivered_at: datetime | None = None


class ChertClient:
    # Group chats exist in Chert (POST /api/v1/chats with several recipients) but need a sender
    # line and a different request. This adapter does not call that, and it must not quietly
    # turn a group draft into separate texts.
    group_block_reason = (
        "This adapter sends one person at a time and does not open a Chert group chat. "
        "The group was not sent, and it was not split into individual texts."
    )

    def __init__(self, signing_secret: str | None, *, client: httpx.AsyncClient | None = None):
        self._signing_secret = signing_secret
        # iMessage sends can take several seconds before Chert answers.
        self._http = client or httpx.AsyncClient(timeout=30)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._http.aclose()

    async def send(self, to: str, text: str, *, idempotency_key: str) -> SendResult:
        """Send one 1:1 message to a phone number or Apple ID email.

        A delivery failure comes back as a failed result; ChertError means nothing was sent.
        Reuse idempotency_key for the same intended message: Chert then returns its saved result,
        though it warns that a lost response can still lead to a duplicate.
        """
        body = {"phone": to, "body": text, "idempotency_key": idempotency_key}
        try:
            response = await self._http.post(f"{BASE_URL}/send", json=body, headers=self._auth())
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            raise ChertError(f"Couldn't reach Chert: {exc!r}", retryable=True) from exc
        except httpx.TransportError as exc:
            # The request may have reached Chert before the connection failed.
            return SendResult(state="unknown", error=f"No response from Chert: {exc!r}")

        data = _json(response)
        status = data.get("status")
        if not isinstance(status, str):
            # Not a send outcome, e.g. bad credentials or a rate limit, so nothing was sent.
            raise _error(response, data)
        code = data.get("code") if isinstance(data.get("code"), int) else None
        state = _state(status, data.get("error"), code)
        if state == "failed" and response.status_code >= 500 and code not in _CONFIRMED_FAILURES:
            state = "unknown"
        return SendResult(
            state=state,
            message_id=data.get("message_id"),
            chat_id=data.get("chat_id"),
            provider_status=status,
            error_code=code,
            error=data.get("reason") or data.get("message"),
            retryable=bool(data.get("retryable")),
        )

    async def get_message(self, message_id: str) -> MessageStatus:
        """Look up one message, e.g. to settle a queued or unknown send."""
        try:
            response = await self._http.get(
                f"{BASE_URL}/messages/{message_id}", headers=self._auth()
            )
        except httpx.TransportError as exc:
            raise ChertError(f"Couldn't reach Chert: {exc!r}", retryable=True) from exc
        data = _json(response)
        if response.is_error:
            raise _error(response, data)
        # The docs show no example response, so accept the message bare or wrapped.
        message = data.get("message", data)
        status = message.get("status")
        return MessageStatus(
            message_id=message.get("id", message_id),
            state=_state(status, message.get("error"), message.get("code")),
            provider_status=status,
            service=message.get("service"),
            delivered_at=_time(message.get("delivered_at")),
            read_at=_time(message.get("read_at")),
        )

    def _auth(self) -> dict[str, str]:
        if not self._signing_secret:
            raise ChertError("CHERT_SIGNING_SECRET is not set")
        return {"Authorization": f"Bearer {self._signing_secret}"}


def verify_signature(
    raw_body: bytes, header: str | None, secret: str, *, now: float | None = None
) -> bool:
    """Check a webhook's X-Webhook-Signature (t=<ts>,v1=<hex>) or x-chert-signature (v1,<ts>,<hex>).

    Pass the body exactly as received; parsing and re-serializing it breaks the signature.
    """
    header = header or ""
    match = re.fullmatch(r"t=(\d+),v1=([0-9a-fA-F]+)", header) or re.fullmatch(
        r"v1,(\d+),([0-9a-fA-F]+)", header
    )
    if not match:
        return False
    timestamp, signature = match.groups()
    if abs((time.time() if now is None else now) - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
        return False
    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


def parse_status_update(payload: Any) -> ProviderStatus | None:
    """Read a delivery update from a webhook that is not `message.received`.

    Chert's documented push event is `message.received`. Delivery is normally reconciled
    with get_message. If some other event still carries a message id and status, record it.
    """
    if not isinstance(payload, dict) or payload.get("event_type") == "message.received":
        return None
    data = payload.get("data")
    message = data.get("message") if isinstance(data, dict) else None
    if not isinstance(message, dict) or not message.get("id") or "status" not in message:
        return None
    code = message.get("code") if isinstance(message.get("code"), int) else None
    return ProviderStatus(
        event_id=str(payload.get("event_id") or ""),
        message_id=str(message["id"]),
        state=_state(message.get("status"), message.get("error"), code),
        delivered_at=_time(message.get("delivered_at")),
    )


def parse_inbound(payload: Any) -> InboundMessage | None:
    """Normalize a webhook event body. Returns None for events other than message.received."""
    if not isinstance(payload, dict):
        raise ValueError("Chert event isn't a JSON object")
    if payload.get("event_type") != "message.received":
        return None
    try:
        chat, message = payload["data"]["chat"], payload["data"]["message"]
        parts = message.get("parts") or []
        return InboundMessage(
            event_id=payload["event_id"],
            message_id=message["id"],
            chat_id=chat["id"],
            sender=message["sender_handle"]["handle"],
            line=(chat.get("owner_handle") or {}).get("handle"),
            text="\n".join(p["value"] for p in parts if p.get("type") == "text"),
            attachment_ids=tuple(p["attachment_id"] for p in parts if p.get("type") == "media"),
            is_group=bool(chat.get("is_group")),
            received_at=_time(message.get("sent_at")),
        )
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError(f"Malformed message.received event: {exc!r}") from exc


def _state(status: Any, error: Any, code: Any) -> DeliveryState:
    if code == DELIVERY_UNKNOWN or error == "delivery_unknown":
        return "unknown"
    # Any other status, such as "duplicate", doesn't confirm an outcome.
    return _STATES.get(status, "unknown") if isinstance(status, str) else "unknown"


def _time(value: Any) -> datetime | None:
    return datetime.fromisoformat(value) if isinstance(value, str) else None


def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _error(response: httpx.Response, data: dict[str, Any]) -> ChertError:
    error = data.get("error")
    if isinstance(error, dict):
        # The standard envelope: {success, error: {status, code, message, retryable}, trace_id}.
        return ChertError(
            error.get("message") or response.reason_phrase,
            status_code=response.status_code,
            code=error.get("code"),
            retryable=bool(error.get("retryable")),
        )
    # /send's legacy flat shape, e.g. {"error": "auth_failed", "code": "auth_failed"}.
    return ChertError(
        str(error or response.reason_phrase),
        status_code=response.status_code,
        code=data.get("code"),
        retryable=bool(data.get("retryable", response.status_code == 429)),
    )
