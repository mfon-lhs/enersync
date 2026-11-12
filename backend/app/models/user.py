from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The same allowed values as the user_role type in database/schema.sql
user_role_type = ENUM(
    "SuperAdmin",
    "LogisticsManager",
    "FieldTechnician",
    "Viewer",
    name="user_role",
    create_type=False,  # The database already has this type, so SQLAlchemy must not create it
)


class User(Base):
    """Describes the users table: people who can log in."""

    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(user_role_type)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    location: Mapped[str] = mapped_column(String(100))
    # The database fills in these two timestamps when we don't provide values
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )