import uuid

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("db")

CASHIER = {
    "name": "Cashier",
    "slots_needed": 2,
    "starts_at": "2026-12-05T09:00:00-08:00",
    "ends_at": "2026-12-05T12:00:00-08:00",
}


@pytest.fixture
def event_id(client: TestClient) -> str:
    event = client.post(
        "/api/v1/events",
        json={
            "title": "Bake sale",
            "starts_at": "2026-12-05T09:00:00-08:00",
            "ends_at": "2026-12-05T14:00:00-08:00",
        },
    )
    return event.json()["id"]


def test_role_crud(client: TestClient, event_id: str) -> None:
    created = client.post(f"/api/v1/events/{event_id}/roles", json=CASHIER)
    assert created.status_code == 201
    role = created.json()
    assert role["event_id"] == event_id
    assert role["name"] == "Cashier"
    assert role["slots_needed"] == 2

    url = f"/api/v1/roles/{role['id']}"
    assert client.get(url).json() == role
    assert client.get(f"/api/v1/events/{event_id}/roles").json() == [role]

    updated = client.patch(url, json={"name": "Runner", "slots_needed": 3})
    assert updated.status_code == 200
    assert updated.json() == {**role, "name": "Runner", "slots_needed": 3}

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.get(f"/api/v1/events/{event_id}/roles").json() == []


def test_list_roles_only_returns_that_events_roles(client: TestClient, event_id: str) -> None:
    other = client.post(
        "/api/v1/events",
        json={
            "title": "Food drive",
            "starts_at": "2026-12-12T09:00:00-08:00",
            "ends_at": "2026-12-12T14:00:00-08:00",
        },
    ).json()
    client.post(f"/api/v1/events/{event_id}/roles", json={**CASHIER, "name": "Wrapper"})
    client.post(f"/api/v1/events/{event_id}/roles", json={**CASHIER, "name": "Cook"})
    client.post(f"/api/v1/events/{other['id']}/roles", json=CASHIER)

    names = [r["name"] for r in client.get(f"/api/v1/events/{event_id}/roles").json()]
    assert names == ["Cook", "Wrapper"]


def test_roles_of_unknown_event_are_not_found(client: TestClient) -> None:
    url = f"/api/v1/events/{uuid.uuid4()}/roles"
    assert client.get(url).status_code == 404
    assert client.post(url, json=CASHIER).status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"slots_needed": 0},
        {"slots_needed": -1},
        {"name": " "},
        {"ends_at": CASHIER["starts_at"]},
        {"starts_at": "2026-12-05T09:00:00"},
    ],
)
def test_create_role_rejects_bad_body(client: TestClient, event_id: str, changes: dict) -> None:
    response = client.post(f"/api/v1/events/{event_id}/roles", json={**CASHIER, **changes})

    assert response.status_code == 422
    assert client.get(f"/api/v1/events/{event_id}/roles").json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"slots_needed": 0},
        {"slots_needed": None},
        {"starts_at": "2026-12-05T13:00:00-08:00"},
    ],
)
def test_update_role_rejects_bad_body(client: TestClient, event_id: str, body: dict) -> None:
    role = client.post(f"/api/v1/events/{event_id}/roles", json=CASHIER).json()

    response = client.patch(f"/api/v1/roles/{role['id']}", json=body)

    assert response.status_code == 422
    assert client.get(f"/api/v1/roles/{role['id']}").json() == role


def test_role_cannot_move_to_another_event(client: TestClient, event_id: str) -> None:
    role = client.post(f"/api/v1/events/{event_id}/roles", json=CASHIER).json()

    response = client.patch(f"/api/v1/roles/{role['id']}", json={"event_id": str(uuid.uuid4())})

    # Unknown fields are ignored, so the role stays put.
    assert response.status_code == 200
    assert response.json()["event_id"] == event_id
