import keenable
import pytest
from fastapi.testclient import TestClient

from tests.conftest import FakeKeenable


def test_search_returns_cited_results(client: TestClient, fake_keenable: FakeKeenable) -> None:
    response = client.get("/api/v1/search", params={"q": "volunteers", "max_results": 3})

    assert response.status_code == 200
    body = response.json()
    assert [r["url"] for r in body["results"]] == ["https://a.example", "https://b.example"]
    assert body["context"].startswith("[1] First (https://a.example)\nalpha")
    assert "[2] Second (https://b.example)" in body["context"]
    assert body["mode"] == "pro"


def test_search_forwards_filters(client: TestClient, fake_keenable: FakeKeenable) -> None:
    client.get(
        "/api/v1/search",
        params={
            "q": "volunteers",
            "mode": "realtime",
            "site": "arxiv.org",
            "published_after": "7d",
            "snippet_max_length": 500,
        },
    )

    [(method, args)] = fake_keenable.calls
    assert method == "search"
    assert args == {
        "query": "volunteers",
        "mode": "realtime",
        "site": "arxiv.org",
        "published_after": "7d",
        "published_before": None,
        "acquired_after": None,
        "acquired_before": None,
        "query_time": None,
        "max_results": 10,
        "snippet_max_length": 500,
    }


def test_search_keeps_results_past_context_budget(
    client: TestClient, fake_keenable: FakeKeenable
) -> None:
    fake_keenable.results = [
        keenable.SearchResult(title=f"R{i}", url=f"https://{i}.example", snippet="x" * 7000)
        for i in range(1, 4)
    ]

    body = client.get("/api/v1/search", params={"q": "volunteers"}).json()

    assert len(body["results"]) == 3
    assert body["context"].startswith("[1] R1 (https://1.example)")
    assert "[2] R2" not in body["context"]


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (keenable.KeenableInvalidRequestError("empty query"), 400),
        (keenable.KeenableAPIError("bad published_after", 400), 400),
        (keenable.KeenableRateLimitError("rate limited", 429), 429),
        (keenable.KeenableConnectionError("unreachable"), 503),
        (keenable.KeenableAPIError("out of credits", 402), 502),
    ],
)
def test_search_maps_keenable_errors(
    client: TestClient, fake_keenable: FakeKeenable, error: Exception, status: int
) -> None:
    fake_keenable.error = error

    response = client.get("/api/v1/search", params={"q": "volunteers"})

    assert response.status_code == status
    assert response.json() == {"detail": str(error)}


@pytest.mark.parametrize(
    "params",
    [
        {"q": ""},
        {"q": "x", "max_results": 51},
        {"q": "x", "snippet_max_length": 179},
        {"q": "x", "mode": "fast"},
    ],
)
def test_search_rejects_bad_params(
    client: TestClient, fake_keenable: FakeKeenable, params: dict
) -> None:
    assert client.get("/api/v1/search", params=params).status_code == 422
    assert fake_keenable.calls == []
