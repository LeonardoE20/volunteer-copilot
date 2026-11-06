"""Roster counts. Pending replies do not fill a shift."""


def shift_coverage(
    *, capacity: int, confirmed: int, awaiting_reply: int, standby: int
) -> dict[str, int]:
    return {
        "confirmed": confirmed,
        "unfilled": max(capacity - confirmed, 0),
        "awaiting_reply": awaiting_reply,
        "standby": standby,
    }


def ranges_overlap(start_a, end_a, start_b, end_b) -> bool:
    """True when the two ranges share any time. Back-to-back shifts do not overlap."""
    return start_a < end_b and start_b < end_a


_RANK = {"queued": 1, "sent": 2, "delivered": 3}


def merge_delivery_state(current: str, new: str) -> str:
    """Fold a later provider update into a delivery without forgetting a confirmed outcome."""
    if current == "delivered" or new == "delivered":
        return "delivered"
    if current == "failed":
        return "failed"
    if new == "failed":
        return "failed"
    if new == "unknown":
        return current if current in {"queued", "sent"} else "unknown"
    if _RANK.get(new, 0) >= _RANK.get(current, 0):
        return new
    return current
