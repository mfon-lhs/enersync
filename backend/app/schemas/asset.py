from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    created_at: datetime


class AssetCreate(BaseModel):
    """The fields a user sends to create an asset."""

    asset_tag: str = Field(min_length=1, max_length=20, pattern=r"^ENS-")
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=50)
    status: Literal["Operational", "MaintenanceRequired", "Decommissioned", "InTransit"] = "Operational"
    current_location: str = Field(min_length=1, max_length=100)