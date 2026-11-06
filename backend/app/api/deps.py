import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Event, Role, User
from app.services.chert import ChertClient, InboundHandler, InboundMessage
from app.services.coordination import handle_reply
from app.services.keenable import KeenableClient


def get_keenable(request: Request) -> KeenableClient:
    return request.app.state.keenable


def get_chert(request: Request) -> ChertClient:
    return request.app.state.chert


async def session_for(request: Request) -> AsyncIterator[AsyncSession]:
    """Use the request session, including the test override, without opening one early."""
    override = request.app.dependency_overrides.get(get_session)
    if override is not None:
        async for session in override():
            yield session
        return
    async with request.app.state.sessionmaker() as session:
        yield session


def get_inbound_handler(request: Request) -> InboundHandler:
    async def handle(message: InboundMessage) -> None:
        chert_override = request.app.dependency_overrides.get(get_chert)
        chert = chert_override() if chert_override else request.app.state.chert
        async for session in session_for(request):
            await handle_reply(
                session,
                chert,
                message,
                form_base=get_settings().public_form_base_url,
            )
            await session.commit()

    return handle


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    # Closing the session rolls back anything the route didn't commit.
    async with request.app.state.sessionmaker() as session:
        yield session


KeenableDep = Annotated[KeenableClient, Depends(get_keenable)]
ChertDep = Annotated[ChertClient, Depends(get_chert)]
InboundHandlerDep = Annotated[InboundHandler, Depends(get_inbound_handler)]
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
