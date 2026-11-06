"""Pure rules for YES, NO, and STOP. Nothing here touches the database."""

YES = frozenset({"yes", "y", "yeah", "yep", "yup"})
NO = frozenset({"no", "n", "nope"})
STOP = frozenset({"stop", "stopall", "unsubscribe", "end"})

ReplyKind = str  # "yes" | "no" | "stop" | "other"


def classify_reply(text: str) -> ReplyKind:
    """Classify a whole message. Anything that is not a simple reply stays 'other'."""
    token = " ".join(text.strip().casefold().split()).strip("!.,")
    if token in STOP:
        return "stop"
    if token in YES:
        return "yes"
    if token in NO:
        return "no"
    return "other"


def apply_yes(status: str) -> str:
    """Record interest. A later YES must not move someone backward."""
    if status == "invited":
        return "interested"
    return status


def apply_no(status: str) -> str:
    """Decline an open invitation. A confirmed assignment is left for the coordinator."""
    if status in {"invited", "interested", "details_submitted"}:
        return "declined"
    return status


def match_event_title(text: str, titled: list[tuple[object, str]]) -> object | None:
    """Return the participation whose event title is the entire reply, if there is one."""
    folded = " ".join(text.strip().casefold().split()).strip("!.,")
    hits = [item for item, title in titled if " ".join(title.casefold().split()) == folded]
    if len(hits) == 1:
        return hits[0]
    return None
