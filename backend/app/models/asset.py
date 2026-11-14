from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
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
    # The command center columns. asdecimal=False hands back ordinary Python numbers
    # instead of Decimal objects, so they travel through JSON as plain numbers.
    capacity_value: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    capacity_unit: Mapped[str | None] = mapped_column(String(20))
    utilization_pct: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False), default=0)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    inspection_interval_days: Mapped[int] = mapped_column(Integer, default=90)
    latitude: Mapped[float | None] = mapped_column(Numeric(8, 6, asdecimal=False))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6, asdecimal=False))
    # The database fills in created_at itself when we don't provide a value
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
