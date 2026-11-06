from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.keenable import KeenableClient


def get_keenable(request: Request) -> KeenableClient:
    return request.app.state.keenable


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    # Closing the session rolls back anything the route didn't commit.
    async with request.app.state.sessionmaker() as session:
        yield session


KeenableDep = Annotated[KeenableClient, Depends(get_keenable)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
