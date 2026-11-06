import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep, UserDep
from app.api.schemas import Limit, Offset, Text, UtcModel, reject_null
from app.models import User
from app.services.phones import normalize_phone

router = APIRouter(prefix="/users", tags=["users"])


def _phone(value: str | None) -> str | None:
    if value is None:
        return None
    return normalize_phone(value)


class UserCreate(BaseModel):
    name: Text
    email: EmailStr
    phone: Text | None = None
    text_opt_in: bool = True
    role_preferences: list[Text] = Field(default_factory=list)

    _phone = field_validator("phone")(_phone)


class UserUpdate(BaseModel):
    name: Text | None = None
    email: EmailStr | None = None
    phone: Text | None = None
    text_opt_in: bool | None = None
    role_preferences: list[Text] | None = None

    _not_null = field_validator("name", "email", "text_opt_in")(reject_null)
    _phone = field_validator("phone")(_phone)


class UserRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    text_opt_in: bool
    role_preferences: list[str]
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
        if (
            isinstance(exc.orig, UniqueViolation)
            and exc.orig.diag.constraint_name == "uq_users_phone"
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "A user with this phone number already exists"
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
