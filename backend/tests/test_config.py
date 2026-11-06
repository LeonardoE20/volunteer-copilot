import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://user:pw@db.example:5432/postgres",
        "postgres://user:pw@db.example:5432/postgres",
        "postgresql+psycopg://user:pw@db.example:5432/postgres",
    ],
)
def test_database_url_uses_psycopg(url: str) -> None:
    settings = Settings(_env_file=None, database_url=url)
    assert settings.database_url == "postgresql+psycopg://user:pw@db.example:5432/postgres"
