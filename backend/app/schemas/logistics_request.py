from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    departure_date: datetime | None
    estimated_arrival_date: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class RequestCreate(BaseModel):
    """The fields a user sends to raise a request."""

    asset_id: int
    origin: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    departure_date: datetime | None = None
    estimated_arrival_date: datetime | None = None
    notes: str | None = None


class RequestUpdate(BaseModel):
    """The new status for a request: approve, reject, or complete it."""

    status: Literal["Approved", "Rejected", "Completed"]