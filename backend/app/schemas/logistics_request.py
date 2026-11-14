from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# The same allowed values as the request_priority type in database/schema.sql
RequestPriorityName = Literal["Low", "Normal", "High", "Critical"]


def as_utc(moment: datetime) -> datetime:
    """Treat a date sent without a time zone as UTC, so two dates can always be compared."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=timezone.utc)


class RequestRead(BaseModel):
    """The fields the API returns for each logistics request."""

    model_config = ConfigDict(from_attributes=True)

    request_id: int
    asset_id: int
    requested_by: int
    approved_by: int | None
    origin: str
    destination: str
    status: str
    priority: str
    departure_date: datetime | None
    estimated_arrival_date: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class RequestListItem(RequestRead):
    """A request as the list shows it: the usual fields plus the names a screen needs."""

    asset_tag: str
    asset_name: str
    requested_by_name: str
    approved_by_name: str | None


class RequestCreate(BaseModel):
    """The fields a user sends to raise a request."""

    asset_id: int
    origin: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    priority: RequestPriorityName = "Normal"
    departure_date: datetime | None = None
    estimated_arrival_date: datetime | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def arrival_is_not_before_departure(self):
        if self.departure_date is not None and self.estimated_arrival_date is not None:
            if as_utc(self.estimated_arrival_date) < as_utc(self.departure_date):
                raise ValueError("The estimated arrival cannot be earlier than the departure")
        return self


class RequestUpdate(BaseModel):
    """The new status for a request: approve, reject, or complete it."""

    status: Literal["Approved", "Rejected", "Completed"]
