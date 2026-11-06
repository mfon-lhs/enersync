from datetime import datetime

from pydantic import BaseModel, ConfigDict


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