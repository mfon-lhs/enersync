from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    """One row from the audit log, as the API returns it. Audit rows are never edited or deleted."""

    model_config = ConfigDict(from_attributes=True)

    log_id: int
    user_id: int | None
    action_type: str
    table_name: str
    record_id: int
    old_value: dict | None
    new_value: dict | None
    ip_address: str | None
    created_at: datetime
