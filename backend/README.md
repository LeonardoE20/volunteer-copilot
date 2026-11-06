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
  api/deps.py       # shared dependencies (Keenable client)
  api/errors.py     # maps Keenable errors to HTTP statuses
  api/routes/       # one module per resource
  services/         # clients for outside services (Keenable)
tests/
```

To add an endpoint group, create a module in `app/api/routes/` with its own `APIRouter` and include it in `app/api/router.py`.
