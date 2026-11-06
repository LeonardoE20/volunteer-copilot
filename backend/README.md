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
- Users, events and roles: http://localhost:8000/api/v1/users, `/events`, `/events/{id}/roles`
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

## Users, events and roles

These endpoints have no authentication yet: anyone who can reach the API can read and change
every user's email and phone. Add auth before exposing the API beyond local development.

| Method | Path | Does |
| --- | --- | --- |
| `GET` | `/users` | List users by name. `limit` (1 to 500, default 100) and `offset` page through them |
| `POST` | `/users` | Create a user: `name`, `email`, optional `phone`. `409` if the email is taken, ignoring case |
| `GET` `PATCH` `DELETE` | `/users/{user_id}` | Read, update or delete a user. Deleting removes their signups |
| `GET` | `/events` | List events by `starts_at`, paged like `/users` |
| `POST` | `/events` | Create an event: `title`, `starts_at`, `ends_at`, optional `description` and `location` |
| `GET` `PATCH` `DELETE` | `/events/{event_id}` | Read, update or delete an event. Deleting removes its roles and their signups |
| `GET` | `/events/{event_id}/roles` | List an event's roles by `starts_at`, then `name` |
| `POST` | `/events/{event_id}/roles` | Create a role at the event: `name`, `slots_needed`, `starts_at`, `ends_at` |
| `GET` `PATCH` `DELETE` | `/roles/{role_id}` | Read, update or delete a role. Deleting removes its signups |

`POST` returns `201` with the new record, `DELETE` returns `204`, and an unknown ID returns `404`.

- `PATCH` changes only the fields you send. Send `null` to clear `phone`, `description` or
  `location`; other fields can't be null. A role can't move to another event.
- Text is trimmed, and a blank string is rejected with `422`.
- Times need a UTC offset, such as `2026-12-05T09:00:00-08:00` or `2026-12-05T17:00:00Z`.
  Responses give the same instant in the database's time zone, which is UTC on Supabase.
- `ends_at` must be after `starts_at`. For `PATCH`, this is checked after merging your changes, so
  moving `starts_at` past the stored `ends_at` is rejected. `slots_needed` must be at least 1.
- A role's times don't have to fall inside its event's times, so a setup crew can start early.

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

The user, event and role tests need Postgres and are skipped unless `TEST_DATABASE_URL` is set.
Point it at a database used only for tests: they drop and recreate its tables from the models,
and empty them after each test. With the Supabase CLI's local database:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "create database volunteer_copilot_test"
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/volunteer_copilot_test pytest
```

## Layout

```
app/
  main.py           # app factory, middleware, router mounting
  core/config.py    # settings loaded from env / .env
  api/router.py     # aggregates route modules
  api/deps.py       # shared dependencies (Keenable client, database session, record loaders)
  api/errors.py     # maps Keenable errors to HTTP statuses
  api/schemas.py    # request field types and checks shared by the CRUD routes
  api/routes/       # one module per resource
  db/               # declarative Base, engine and session factory
  models/           # SQLAlchemy models
  services/         # clients for outside services (Keenable)
migrations/         # Alembic environment and revisions
tests/
```

To add an endpoint group, create a module in `app/api/routes/` with its own `APIRouter` and include it in `app/api/router.py`.
