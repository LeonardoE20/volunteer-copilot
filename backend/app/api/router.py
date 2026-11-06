from fastapi import APIRouter

from app.api.routes import fetch, health, search

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(search.router)
api_router.include_router(fetch.router)
