import keenable
from fastapi.testclient import TestClient

from tests.conftest import FakeKeenable


def test_fetch_returns_page(client: TestClient, fake_keenable: FakeKeenable) -> None:
    response = client.get("/api/v1/fetch", params={"url": "https://a.example"})

    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "# Heading\n\nBody text"
    assert body["published_at"] == "2024-11-22T21:03:03Z"
    assert body["context"].startswith("[1] First (https://a.example)\n# Heading")
    assert fake_keenable.calls == [
        ("extract", {"url": "https://a.example", "prompt": None, "live": False, "max_chars": None})
    ]


def test_fetch_forwards_extraction_options(client: TestClient, fake_keenable: FakeKeenable) -> None:
    client.get(
        "/api/v1/fetch",
        params={
            "url": "https://a.example",
            "prompt": "List the dates",
            "live": True,
            "max_chars": 5,
        },
    )

    assert fake_keenable.calls == [
        (
            "extract",
            {"url": "https://a.example", "prompt": "List the dates", "live": True, "max_chars": 5},
        )
    ]


def test_fetch_maps_keenable_errors(client: TestClient, fake_keenable: FakeKeenable) -> None:
    fake_keenable.error = keenable.KeenableRateLimitError("rate limited", 429)

    assert client.get("/api/v1/fetch", params={"url": "https://a.example"}).status_code == 429


def test_fetch_rejects_bad_params(client: TestClient, fake_keenable: FakeKeenable) -> None:
    assert client.get("/api/v1/fetch").status_code == 422
    assert client.get("/api/v1/fetch", params={"url": "x", "prompt": "p" * 2001}).status_code == 422
    assert client.get("/api/v1/fetch", params={"url": "x", "max_chars": 0}).status_code == 422
    assert fake_keenable.calls == []
