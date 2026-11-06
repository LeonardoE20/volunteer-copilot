# volunteer-copilot backend

FastAPI service. Requires Python 3.12+.

## Setup

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

## Run

```sh
fastapi dev app/main.py
```

- API: http://localhost:8000/api/v1
- Health check: http://localhost:8000/api/v1/health
- Web search: http://localhost:8000/api/v1/search?q=volunteer+scheduling&max_results=3
- Page fetch: http://localhost:8000/api/v1/fetch?url=https://example.com
- Interactive docs: http://localhost:8000/docs (every parameter below is documented and testable there)

## Web search and page fetch

Both endpoints use the [Keenable](https://docs.keenable.ai) Python SDK. They work without a key on
the keyless tier (1,000 requests per hour and 10 per second, per IP). In production, set
`KEENABLE_API_KEY` in the environment or `.env` to lift the hourly cap; see
https://docs.keenable.ai/api-keys. With a key, responses include `usage` (credits billed).

### `GET /api/v1/search`

| Parameter | Default | Notes |
| --- | --- | --- |
| `q` | required | Describe the page you want in plain language; the index is semantic |
| `mode` | `pro` | `pro` for deeper retrieval, `realtime` for the fastest response |
| `site` | | Restrict to one site, e.g. `arxiv.org` |
| `published_after`, `published_before` | | `YYYY-MM-DD`, an ISO 8601 timestamp, or relative like `7d`, `2w`, `1mo` |
| `acquired_after`, `acquired_before` | | Same formats, filtering on when Keenable indexed the page |
| `query_time` | | Search the index as it stood at that time; not a recency filter |
| `max_results` | `10` | 1 to 50 |
| `snippet_max_length` | `1000` | 180 to 10,000 characters of page text per result |

The response has `results` and a `context` string of numbered `[n] Title (url)` sources to put in
an LLM prompt, where `[n]` is `results[n - 1]`. The SDK caps `context` at about 12,000 characters,
which is why snippets default to 1,000 characters: that fits about 10 sources. With longer snippets
or more results, `context` cites only the first ones, while `results` still has them all.

### `GET /api/v1/fetch`

| Parameter | Default | Notes |
| --- | --- | --- |
| `url` | required | Absolute `http(s)` URL; private and loopback addresses are refused |
| `prompt` | | Up to 2,000 characters. `content` becomes only the answer, e.g. "list the dates" |
| `live` | `false` | Fetch from the source now instead of Keenable's indexed copy |
| `max_chars` | 50,000 | Cap on `content`; Keenable appends a short notice after the cut |

The response has the page `content` as markdown, `title`, `author`, `published_at` (ISO 8601) and a
`[1] Title (url)` `context` block. The SDK's `fetch()` doesn't take `prompt`, `live` or `max_chars`
yet, so `app/services/keenable.py` adds them through SDK internals; that's why `keenable` is
pinned below 0.2.

### Errors

Keenable errors map to `400` (bad arguments, such as an unparseable date), `429` (rate limited),
`503` (Keenable unreachable) and `502` (anything else, such as `402` out of credits).

## Database

The API talks to Postgres (Supabase in production) through async SQLAlchemy 2.1 and the psycopg 3
driver, and Alembic manages the schema. Set `DATABASE_URL` to the Supabase **Session pooler** URI
from the dashboard's Connect dialog; a `postgresql://` URL is switched to `postgresql+psycopg://`
automatically. Use the session pooler on port 5432, not the transaction pooler on port 6543:
psycopg prepares repeated statements, which transaction mode doesn't support. The direct
connection is IPv6 only. With `DATABASE_URL` unset, the API uses the Supabase CLI's local database
(`supabase start`).

The engine connects on first use, so the API starts even if the database is unreachable.

### Using a session in a route

```python
from app.api.deps import SessionDep


@router.post("/volunteers")
async def create_volunteer(body: VolunteerIn, session: SessionDep) -> VolunteerOut:
    volunteer = Volunteer(name=body.name)
    session.add(volunteer)
    await session.commit()
    return VolunteerOut.model_validate(volunteer, from_attributes=True)
```

Each request gets its own `AsyncSession`. Commit explicitly; anything left uncommitted is rolled
back when the request ends.

### Schema

| Table | Holds |
| --- | --- |
| `events` | Title, description, location, `starts_at` and `ends_at` |
| `roles` | A volunteer position at one event: `name`, `slots_needed` and its own times |
| `users` | Volunteers and coordinators: `name`, `email` (unique, ignoring case) and `phone`. Not tied to Supabase Auth |
| `signups` | One row per user per role; the pair is the primary key |

IDs are UUIDs and times are `timestamptz`. Deleting an event deletes its roles and their signups,
and deleting a user deletes that user's signups. Nothing stops a role from getting more signups
than `slots_needed` yet; enforce that when sign-up endpoints are added.

### Models and migrations

Put each model in a module under `app/models/`, subclass `app.db.base.Base`, and import the module
in `app/models/__init__.py` so Alembic sees it. Then generate and apply a migration:

```sh
alembic revision --autogenerate -m "add volunteers"   # review the file in migrations/versions/
alembic upgrade head
alembic downgrade -1                                   # undo the last migration
```

Supabase lets its `anon` role read and write every new table in `public` through the Data API,
using the project's public anon key. Autogenerate therefore adds `enable row level security` after
each table it creates (see `migrations/env.py`). RLS with no policies blocks the Data API, and the
backend still has full access because it owns the tables. A migration you write by hand with
`alembic revision` (no `--autogenerate`) doesn't get this, so add
`op.execute('alter table "x" enable row level security')` yourself.

## Test and lint

```sh
pytest
ruff check .
ruff format .
```

## Layout

```
app/
  main.py           # app factory, middleware, router mounting
  core/config.py    # settings loaded from env / .env
  api/router.py     # aggregates route modules
  api/deps.py       # shared dependencies (Keenable client, database session)
  api/errors.py     # maps Keenable errors to HTTP statuses
  api/routes/       # one module per resource
  db/               # declarative Base, engine and session factory
  models/           # SQLAlchemy models
  services/         # clients for outside services (Keenable)
migrations/         # Alembic environment and revisions
tests/
```

To add an endpoint group, create a module in `app/api/routes/` with its own `APIRouter` and include it in `app/api/router.py`.
