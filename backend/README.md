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
- Interactive docs: http://localhost:8000/docs

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
  api/routes/       # one module per resource
tests/
```

To add an endpoint group, create a module in `app/api/routes/` with its own `APIRouter` and include it in `app/api/router.py`.
