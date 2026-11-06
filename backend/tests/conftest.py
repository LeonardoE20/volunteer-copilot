from collections.abc import Iterator
from typing import Any

import keenable
import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_keenable
from app.main import app


class FakeKeenable:
    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.results = [
            keenable.SearchResult(title="First", url="https://a.example", snippet="alpha"),
            keenable.SearchResult(title="Second", url="https://b.example", snippet="beta"),
        ]
        self.page = keenable.Page(
            url="https://a.example",
            title="First",
            content="# Heading\n\nBody text",
            raw={"published_at": 1732309383},
        )

    async def search(self, query: str, **filters: Any) -> keenable.SearchResponse:
        self.calls.append(("search", {"query": query, **filters}))
        if self.error:
            raise self.error
        return keenable.SearchResponse(query=query, results=self.results, mode=filters["mode"])

    async def extract(self, url: str, **options: Any) -> keenable.Page:
        self.calls.append(("extract", {"url": url, **options}))
        if self.error:
            raise self.error
        return self.page


@pytest.fixture
def fake_keenable() -> Iterator[FakeKeenable]:
    fake = FakeKeenable()
    app.dependency_overrides[get_keenable] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
