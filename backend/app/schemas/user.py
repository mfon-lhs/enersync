from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The same allowed values as the user_role type in database/schema.sql
RoleName = Literal["SuperAdmin", "LogisticsManager", "FieldTechnician", "Viewer"]


class UserRead(BaseModel):
    """The fields the API returns for a user. The password hash is never included."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    first_name: str
    last_name: str
    email: str
    role: str
    is_active: bool
    location: str
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    """The fields a SuperAdmin sends to create a user."""

    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=3, max_length=100, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=72)
    role: RoleName = "FieldTechnician"
    location: str = Field(min_length=1, max_length=100)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value):
        # bcrypt refuses passwords longer than 72 bytes, and some characters take more than one byte
        if len(value.encode("utf-8")) > 72:
            raise ValueError("This password is too long")
        return value


class UserUpdate(BaseModel):
    """The changes a SuperAdmin can make to a user: their role, or whether they are active."""

    role: RoleName | None = None
    is_active: bool | None = None

    @field_validator("role", "is_active")
    @classmethod
    def cannot_be_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be empty")
        return value