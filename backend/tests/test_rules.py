from datetime import UTC, datetime

import pytest

from app.domain import skip_reason
from app.services.chert import parse_status_update
from app.services.coverage import merge_delivery_state, ranges_overlap, shift_coverage
from app.services.phones import normalize_phone
from app.services.replies import apply_no, apply_yes, classify_reply, match_event_title


def test_normalize_phone_accepts_common_us_forms() -> None:
    assert normalize_phone("+1 (510) 555-0100") == "+15105550100"
    assert normalize_phone("5105550100") == "+15105550100"
    assert normalize_phone("15105550100") == "+15105550100"
    assert normalize_phone("Ann@icloud.com") == "ann@icloud.com"


@pytest.mark.parametrize("value", ["555", "not a phone", "+123"])
def test_normalize_phone_rejects_junk(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_phone(value)


@pytest.mark.parametrize(
    ("text", "kind"),
    [(" YES ", "yes"), ("nope", "no"), ("Stop", "stop"), ("YES!", "yes"), ("maybe later", "other")],
)
def test_classify_reply(text: str, kind: str) -> None:
    assert classify_reply(text) == kind


def test_yes_does_not_move_a_later_state_backward() -> None:
    assert apply_yes("invited") == "interested"
    assert apply_yes("confirmed") == "confirmed"
    assert apply_yes("details_submitted") == "details_submitted"
    assert apply_no("confirmed") == "confirmed"
    assert apply_no("interested") == "declined"


def test_match_event_title_requires_the_whole_reply() -> None:
    bake, drive = object(), object()
    titled = [(bake, "Bake sale"), (drive, "Food drive")]

    assert match_event_title("bake sale", titled) is bake
    assert match_event_title("YES", titled) is None
    assert match_event_title("sale", titled) is None


def test_coverage_counts_places_separately_from_people() -> None:
    assert shift_coverage(capacity=2, confirmed=2, awaiting_reply=3, standby=1) == {
        "confirmed": 2,
        "unfilled": 0,
        "awaiting_reply": 3,
        "standby": 1,
    }


def test_back_to_back_shifts_do_not_overlap() -> None:
    morning = datetime(2026, 12, 5, 17, tzinfo=UTC)
    noon = datetime(2026, 12, 5, 20, tzinfo=UTC)
    evening = datetime(2026, 12, 5, 22, tzinfo=UTC)

    assert not ranges_overlap(morning, noon, noon, evening)
    assert ranges_overlap(morning, evening, noon, evening)


def test_delivery_updates_do_not_forget_a_confirmed_outcome() -> None:
    assert merge_delivery_state("sent", "delivered") == "delivered"
    assert merge_delivery_state("delivered", "failed") == "delivered"
    assert merge_delivery_state("sent", "unknown") == "sent"
    assert merge_delivery_state("queued", "sent") == "sent"


def test_standby_is_not_included_in_an_interest_invitation() -> None:
    assert (
        skip_reason(
            purpose="interest",
            pool="standby",
            status="not_invited",
            text_opt_in=True,
            phone="+15105550100",
        )
        == "standby volunteers are invited with a standby invitation"
    )
    assert (
        skip_reason(
            purpose="interest",
            pool="primary",
            status="not_invited",
            text_opt_in=False,
            phone="+15105550100",
        )
        == "opted out of texts"
    )


def test_parse_status_update_reads_a_delivery_event_and_ignores_replies() -> None:
    update = parse_status_update(
        {
            "event_id": "evt-1",
            "event_type": "message.updated",
            "data": {"message": {"id": "m1", "status": "delivered"}},
        }
    )

    assert update is not None
    assert (update.event_id, update.message_id, update.state) == ("evt-1", "m1", "delivered")
    assert parse_status_update({"event_type": "message.received", "data": {}}) is None
    assert parse_status_update({"event_type": "message.sent"}) is None
