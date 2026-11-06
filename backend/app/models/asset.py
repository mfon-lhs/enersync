from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Asset(Base):
    """Describes the assets table created by database/schema.sql."""

    __tablename__ = "assets"

    asset_id: Mapped[int] = mapped_column(primary_key=True)
    asset_tag: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30))
    current_location: Mapped[str] = mapped_column(String(100))
    last_inspected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))