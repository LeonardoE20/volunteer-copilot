from datetime import UTC, datetime
from typing import Annotated

from fastapi import Query
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, StringConstraints, field_serializer

# Surrounding whitespace is dropped, and a blank string is rejected. Send null to clear a field.
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class UtcModel(BaseModel):
    """Serialize every timestamp in UTC so a later read matches the write response."""

    @field_serializer("*", when_used="json")
    def _datetimes_as_utc(self, value: object) -> object:
        if isinstance(value, datetime):
            return value.astimezone(UTC)
        return value


Limit = Annotated[int, Query(ge=1, le=500)]
Offset = Annotated[int, Query(ge=0)]


def reject_null(value: object) -> object:
    """Reject an explicit null for a column that can't be null.

    Update bodies default every field to None to mean "leave it unchanged". Pydantic doesn't
    validate defaults, so this only sees values the client actually sent.
    """
    if value is None:
        raise ValueError("can't be null")
    return value


def check_ends_after_start(starts_at: datetime, ends_at: datetime) -> None:
    # Called on the merged values for an update, so it catches a change to either end.
    if ends_at <= starts_at:
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("body", "ends_at"),
                    "msg": "ends_at must be after starts_at",
                    "input": ends_at.isoformat(),
                }
            ]
        )
