from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from keenable import KeenableError

from app.api.errors import keenable_error_handler
from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import create_engine, create_sessionmaker
from app.services.keenable import KeenableClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    # Lazy: the engine connects on first use, so the app starts even if the database is down.
    engine = create_engine(settings.database_url)
    app.state.sessionmaker = create_sessionmaker(engine)
    try:
        async with KeenableClient(api_key=settings.keenable_api_key) as keenable:
            app.state.keenable = keenable
            yield
    finally:
        await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(KeenableError, keenable_error_handler)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
