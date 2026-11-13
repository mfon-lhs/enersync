from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The same allowed values as the request_status type in database/schema.sql
request_status_type = ENUM(
    "Pending",
    "Approved",
    "Rejected",
    "Completed",
    name="request_status",
    create_type=False,  # The database already has this type, so SQLAlchemy must not create it
)


class LogisticsRequest(Base):
    """Describes the logistics_requests table: a request to move an asset."""

    __tablename__ = "logistics_requests"

    request_id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(Integer)
    requested_by: Mapped[int] = mapped_column(Integer)
    approved_by: Mapped[int | None] = mapped_column(Integer)
    origin: Mapped[str] = mapped_column(String(100))
    destination: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(request_status_type)
    departure_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_arrival_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
