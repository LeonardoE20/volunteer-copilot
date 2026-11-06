import uuid
from datetime import datetime

from fastapi import APIRouter, status
from pydantic import AwareDatetime, BaseModel, ConfigDict, PositiveInt, field_validator
from sqlalchemy import select

from app.api.deps import EventDep, RoleDep, SessionDep
from app.api.schemas import Text, UtcModel, check_ends_after_start, reject_null
from app.models import Role

# Listing and creating go through the event (/events/{id}/roles); a role is then addressed by its
# own ID (/roles/{id}). A role can't move to another event.
router = APIRouter(tags=["roles"])


class RoleCreate(BaseModel):
    name: Text
    slots_needed: PositiveInt
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class RoleUpdate(BaseModel):
    name: Text | None = None
    slots_needed: PositiveInt | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None

    _not_null = field_validator("name", "slots_needed", "starts_at", "ends_at")(reject_null)


class RoleRead(UtcModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    slots_needed: int
    starts_at: datetime
    ends_at: datetime
    created_at: datetime


@router.get("/events/{event_id}/roles")
async def list_roles(event: EventDep, session: SessionDep) -> list[RoleRead]:
    roles = await session.scalars(
        select(Role).where(Role.event_id == event.id).order_by(Role.starts_at, Role.name, Role.id)
    )
    return [RoleRead.model_validate(role) for role in roles]


@router.post("/events/{event_id}/roles", status_code=status.HTTP_201_CREATED)
async def create_role(event: EventDep, body: RoleCreate, session: SessionDep) -> RoleRead:
    check_ends_after_start(body.starts_at, body.ends_at)
    role = Role(event_id=event.id, **body.model_dump())
    session.add(role)
    await session.commit()
    return RoleRead.model_validate(role)


@router.get("/roles/{role_id}")
async def read_role(role: RoleDep) -> RoleRead:
    return RoleRead.model_validate(role)


@router.patch("/roles/{role_id}")
async def update_role(role: RoleDep, body: RoleUpdate, session: SessionDep) -> RoleRead:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    check_ends_after_start(role.starts_at, role.ends_at)
    await session.commit()
    return RoleRead.model_validate(role)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role: RoleDep, session: SessionDep) -> None:
    # The database deletes the role's signups (ON DELETE CASCADE).
    await session.delete(role)
    await session.commit()
