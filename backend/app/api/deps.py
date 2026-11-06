import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Role, User
from app.services.keenable import KeenableClient


def get_keenable(request: Request) -> KeenableClient:
    return request.app.state.keenable


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    # Closing the session rolls back anything the route didn't commit.
    async with request.app.state.sessionmaker() as session:
        yield session


KeenableDep = Annotated[KeenableClient, Depends(get_keenable)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


# The loaders below share the route's session, since FastAPI resolves SessionDep once per request.
async def get_user(user_id: uuid.UUID, session: SessionDep) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


async def get_event(event_id: uuid.UUID, session: SessionDep) -> Event:
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


async def get_role(role_id: uuid.UUID, session: SessionDep) -> Role:
    role = await session.get(Role, role_id)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return role


UserDep = Annotated[User, Depends(get_user)]
EventDep = Annotated[Event, Depends(get_event)]
RoleDep = Annotated[Role, Depends(get_role)]
