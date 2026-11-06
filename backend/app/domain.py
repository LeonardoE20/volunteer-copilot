"""Shared vocabulary for events, participation, and messages."""

from datetime import timedelta

ROLE_PRESETS = ("Cook", "Wrapper", "Cashier", "Runner", "Dishwasher", "Cleaner")

RELATIVE_OFFSETS = {
    "1w": timedelta(weeks=1),
    "1d": timedelta(days=1),
    "1h": timedelta(hours=1),
}

ACCEPTED_DELIVERY = frozenset({"queued", "sent", "delivered", "unknown"})

PARTICIPATION_STATUSES = (
    "not_invited",
    "invited",
    "interested",
    "details_submitted",
    "confirmed",
    "declined",
    "cancelled",
)

MESSAGE_PURPOSES = (
    "interest",
    "form_link",
    "policies",
    "uniform",
    "parking",
    "reminder",
    "standby",
)


def skip_reason(
    *, purpose: str, pool: str, status: str, text_opt_in: bool, phone: str | None
) -> str | None:
    """Why this person is left out of a draft. None means they can be sent the text."""
    if not text_opt_in:
        return "opted out of texts"
    if not phone:
        return "no phone number"
    if status in {"declined", "cancelled"}:
        return "not participating"
    if purpose == "standby" and pool != "standby":
        return "not in the standby pool"
    if purpose == "interest" and pool == "standby":
        return "standby volunteers are invited with a standby invitation"
    if purpose == "interest" and status in {
        "interested",
        "details_submitted",
        "confirmed",
    }:
        return "already responded"
    return None
