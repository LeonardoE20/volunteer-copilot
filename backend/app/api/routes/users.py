import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep, UserDep
from app.api.schemas import Limit, Offset, Text, reject_null
from app.models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    name: Text
    email: EmailStr
    phone: Text | None = None


class UserUpdate(BaseModel):
    name: Text | None = None
    email: EmailStr | None = None
    phone: Text | None = None

    _not_null = field_validator("name", "email")(reject_null)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    created_at: datetime


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError as exc:
        # uq_users_email ignores case, so Ann@example.com also clashes with ann@example.com.
        if (
            isinstance(exc.orig, UniqueViolation)
            and exc.orig.diag.constraint_name == "uq_users_email"
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A user with this email already exists"
            ) from exc
        raise


@router.get("")
async def list_users(session: SessionDep, limit: Limit = 100, offset: Offset = 0) -> list[UserRead]:
    users = await session.scalars(
        select(User).order_by(User.name, User.id).limit(limit).offset(offset)
    )
    return [UserRead.model_validate(user) for user in users]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, session: SessionDep) -> UserRead:
    user = User(**body.model_dump())
    session.add(user)
    await _commit(session)
    return UserRead.model_validate(user)


@router.get("/{user_id}")
async def read_user(user: UserDep) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/{user_id}")
async def update_user(user: UserDep, body: UserUpdate, session: SessionDep) -> UserRead:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await _commit(session)
    return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user: UserDep, session: SessionDep) -> None:
    # The database deletes the user's signups (ON DELETE CASCADE).
    await session.delete(user)
    await session.commit()
