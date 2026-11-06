from fastapi import APIRouter

from app.api.routes import chert, events, fetch, health, roles, search, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(search.router)
api_router.include_router(fetch.router)
api_router.include_router(users.router)
api_router.include_router(events.router)
api_router.include_router(roles.router)
api_router.include_router(chert.router)
