from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The same allowed values as the asset_status type in database/schema.sql
asset_status_type = ENUM(
    "Operational",
    "MaintenanceRequired",
    "Decommissioned",
    "InTransit",
    name="asset_status",
    create_type=False,  # The database already has this type, so SQLAlchemy must not create it
)


class Asset(Base):
    """Describes the assets table created by database/schema.sql."""

    __tablename__ = "assets"

    asset_id: Mapped[int] = mapped_column(primary_key=True)
    asset_tag: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(asset_status_type)
    current_location: Mapped[str] = mapped_column(String(100))
    last_inspected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The database fills in created_at itself when we don't provide a value
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )