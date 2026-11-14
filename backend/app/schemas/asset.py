from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# The same allowed values as the asset_status type in database/schema.sql
AssetStatusName = Literal["Operational", "MaintenanceRequired", "Decommissioned", "InTransit"]


class AssetRead(BaseModel):
    """The fields the API returns for each asset."""

    model_config = ConfigDict(from_attributes=True)

    asset_id: int
    asset_tag: str
    name: str
    category: str
    status: str
    current_location: str
    last_inspected_at: datetime | None
    capacity_value: float | None
    capacity_unit: str | None
    utilization_pct: float
    is_critical: bool
    inspection_interval_days: int
    latitude: float | None
    longitude: float | None
    created_at: datetime


class AssetCreate(BaseModel):
    """The fields a user sends to create an asset."""

    asset_tag: str = Field(min_length=1, max_length=20, pattern=r"^ENS-")
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    status: AssetStatusName = "Operational"
    current_location: str = Field(min_length=1, max_length=100)
    last_inspected_at: datetime | None = None
    capacity_value: float | None = Field(default=None, ge=0, le=1_000_000_000)
    capacity_unit: str | None = Field(default=None, min_length=1, max_length=20)
    utilization_pct: float = Field(default=0, ge=0, le=100)
    is_critical: bool = False
    inspection_interval_days: int = Field(default=90, ge=1, le=3650)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def pairs_go_together(self):
        # The database has the same two rules. Checking here gives a clear message instead of an error.
        if (self.capacity_value is None) != (self.capacity_unit is None):
            raise ValueError("Capacity value and unit must be given together")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be given together")
        return self


class AssetUpdate(BaseModel):
    """The fields a user can change. Send only the fields you want to change."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    status: AssetStatusName | None = None
    current_location: str | None = Field(default=None, min_length=1, max_length=100)
    last_inspected_at: datetime | None = None
    capacity_value: float | None = Field(default=None, ge=0, le=1_000_000_000)
    capacity_unit: str | None = Field(default=None, min_length=1, max_length=20)
    utilization_pct: float | None = Field(default=None, ge=0, le=100)
    is_critical: bool | None = None
    inspection_interval_days: int | None = Field(default=None, ge=1, le=3650)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator(
        "name",
        "category",
        "status",
        "current_location",
        "utilization_pct",
        "is_critical",
        "inspection_interval_days",
    )
    @classmethod
    def cannot_be_null(cls, value):
        # These fields can't be empty in the database, so refuse null.
        # The capacity, position and last inspection fields may be set to null to clear them.
        if value is None:
            raise ValueError("This field cannot be empty")
        return value


class AssetSummary(BaseModel):
    """The number of assets in total, and how many are in each status."""

    total: int
    by_status: dict[str, int]
