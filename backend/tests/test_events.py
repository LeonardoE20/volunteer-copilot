import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("db")

BAKE_SALE = {
    "title": "Bake sale",
    "location": "Community hall",
    "starts_at": "2026-12-05T09:00:00-08:00",
    "ends_at": "2026-12-05T14:00:00-08:00",
}


def test_event_crud(client: TestClient) -> None:
    created = client.post("/api/v1/events", json=BAKE_SALE)
    assert created.status_code == 201
    event = created.json()
    assert event["title"] == "Bake sale"
    assert event["description"] is None
    # Stored as timestamptz: the same instant, whatever offset it comes back in.
    assert datetime.fromisoformat(event["starts_at"]) == datetime.fromisoformat(
        BAKE_SALE["starts_at"]
    )

    url = f"/api/v1/events/{event['id']}"
    assert client.get(url).json() == event
    assert client.get("/api/v1/events").json() == [event]

    updated = client.patch(url, json={"description": "Bring a tray", "location": None})
    assert updated.status_code == 200
    assert updated.json() == {**event, "description": "Bring a tray", "location": None}

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404


def test_list_events_sorts_by_start(client: TestClient) -> None:
    later = {**BAKE_SALE, "title": "Later", "starts_at": "2026-12-05T10:00:00-08:00"}
    client.post("/api/v1/events", json=later)
    client.post("/api/v1/events", json=BAKE_SALE)

    titles = [e["title"] for e in client.get("/api/v1/events").json()]
    assert titles == ["Bake sale", "Later"]


@pytest.mark.parametrize(
    "changes",
    [
        {"ends_at": BAKE_SALE["starts_at"]},
        {"ends_at": "2026-12-05T08:00:00-08:00"},
        # Naive times are ambiguous, so they're refused.
        {"starts_at": "2026-12-05T09:00:00"},
        {"title": ""},
        {"title": None},
    ],
)
def test_create_event_rejects_bad_body(client: TestClient, changes: dict) -> None:
    response = client.post("/api/v1/events", json={**BAKE_SALE, **changes})

    assert response.status_code == 422
    assert client.get("/api/v1/events").json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"starts_at": "2026-12-05T15:00:00-08:00"},
        {"ends_at": "2026-12-05T09:00:00-08:00"},
        {"starts_at": None},
    ],
)
def test_update_event_checks_merged_times(client: TestClient, body: dict) -> None:
    event = client.post("/api/v1/events", json=BAKE_SALE).json()

    response = client.patch(f"/api/v1/events/{event['id']}", json=body)

    assert response.status_code == 422
    assert client.get(f"/api/v1/events/{event['id']}").json() == event


def test_update_event_can_move_both_times(client: TestClient) -> None:
    event = client.post("/api/v1/events", json=BAKE_SALE).json()

    response = client.patch(
        f"/api/v1/events/{event['id']}",
        json={"starts_at": "2026-12-06T15:00:00Z", "ends_at": "2026-12-06T16:00:00Z"},
    )

    assert response.status_code == 200
    assert datetime.fromisoformat(response.json()["ends_at"]) == datetime.fromisoformat(
        "2026-12-06T16:00:00Z"
    )


def test_deleting_an_event_deletes_its_roles(client: TestClient) -> None:
    event = client.post("/api/v1/events", json=BAKE_SALE).json()
    role = client.post(
        f"/api/v1/events/{event['id']}/roles",
        json={
            "name": "Cashier",
            "slots_needed": 2,
            "starts_at": BAKE_SALE["starts_at"],
            "ends_at": BAKE_SALE["ends_at"],
        },
    ).json()

    client.delete(f"/api/v1/events/{event['id']}")

    assert client.get(f"/api/v1/roles/{role['id']}").status_code == 404


def test_unknown_event_is_not_found(client: TestClient) -> None:
    url = f"/api/v1/events/{uuid.uuid4()}"
    assert client.get(url).status_code == 404
    assert client.patch(url, json={"title": "x"}).status_code == 404
    assert client.delete(url).status_code == 404
