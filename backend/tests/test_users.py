import uuid

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("db")

ANN = {"name": "Ann Lee", "email": "ann@example.com", "phone": "+15105550100"}


def test_user_crud(client: TestClient) -> None:
    created = client.post("/api/v1/users", json=ANN)
    assert created.status_code == 201
    user = created.json()
    assert user["name"] == "Ann Lee"
    assert user["phone"] == "+15105550100"
    uuid.UUID(user["id"])
    assert user["created_at"]

    url = f"/api/v1/users/{user['id']}"
    assert client.get(url).json() == user
    assert client.get("/api/v1/users").json() == [user]

    updated = client.patch(url, json={"name": "Ann Smith", "phone": None})
    assert updated.status_code == 200
    assert updated.json() == {**user, "name": "Ann Smith", "phone": None}

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.delete(url).status_code == 404


def test_list_users_sorts_by_name_and_pages(client: TestClient) -> None:
    for name in ["Cy", "Ann", "Bo"]:
        client.post("/api/v1/users", json={"name": name, "email": f"{name}@example.com"})

    names = [u["name"] for u in client.get("/api/v1/users").json()]
    assert names == ["Ann", "Bo", "Cy"]
    page = client.get("/api/v1/users", params={"limit": 1, "offset": 1}).json()
    assert [u["name"] for u in page] == ["Bo"]


def test_email_must_be_unique_ignoring_case(client: TestClient) -> None:
    client.post("/api/v1/users", json=ANN)
    other = client.post("/api/v1/users", json={"name": "Bo", "email": "bo@example.com"}).json()

    duplicate = client.post("/api/v1/users", json={**ANN, "email": "ANN@example.com"})
    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "A user with this email already exists"}

    taken = client.patch(f"/api/v1/users/{other['id']}", json={"email": "Ann@Example.com"})
    assert taken.status_code == 409


def test_user_can_change_case_of_own_email(client: TestClient) -> None:
    user = client.post("/api/v1/users", json=ANN).json()

    response = client.patch(f"/api/v1/users/{user['id']}", json={"email": "Ann@example.com"})

    assert response.status_code == 200
    assert response.json()["email"] == "Ann@example.com"


@pytest.mark.parametrize(
    "body",
    [
        {"name": "Ann"},
        {"name": "  ", "email": "ann@example.com"},
        {"name": "Ann", "email": "not-an-email"},
        {"name": "Ann", "email": "ann@example.com", "phone": ""},
    ],
)
def test_create_user_rejects_bad_body(client: TestClient, body: dict) -> None:
    assert client.post("/api/v1/users", json=body).status_code == 422
    assert client.get("/api/v1/users").json() == []


@pytest.mark.parametrize("body", [{"name": None}, {"email": None}, {"name": ""}])
def test_update_user_rejects_bad_body(client: TestClient, body: dict) -> None:
    user = client.post("/api/v1/users", json=ANN).json()

    assert client.patch(f"/api/v1/users/{user['id']}", json=body).status_code == 422
    assert client.get(f"/api/v1/users/{user['id']}").json() == user


def test_unknown_user_is_not_found(client: TestClient) -> None:
    url = f"/api/v1/users/{uuid.uuid4()}"
    assert client.get(url).status_code == 404
    assert client.patch(url, json={"name": "Bo"}).status_code == 404
    assert client.get("/api/v1/users/not-a-uuid").status_code == 422
