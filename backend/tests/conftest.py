import os
from collections.abc import AsyncIterator, Iterator
from typing import Any

import keenable
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  registers tables on Base.metadata
from app.api.deps import get_keenable, get_session
from app.core.config import Settings
from app.db.base import Base
from app.db.session import create_sessionmaker
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


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("set TEST_DATABASE_URL to run the database tests")
    engine = create_engine(Settings.use_psycopg_driver(url))
    # Rebuild the schema from the models. This wipes the test database.
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(test_engine: Engine) -> Iterator[None]:
    # Without `with`, TestClient runs each request on a new event loop, and a pooled connection
    # can't move between loops, so open a fresh one per session.
    sessionmaker = create_sessionmaker(create_async_engine(test_engine.url, poolclass=NullPool))

    async def get_test_session() -> AsyncIterator[AsyncSession]:
        async with sessionmaker() as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    yield
    app.dependency_overrides.pop(get_session, None)
    with test_engine.begin() as connection:
        connection.execute(
            text(
                "truncate provider_events, inbound_replies, deliveries, form_links, "
                "message_drafts, participations, signups, roles, users, events"
            )
        )
