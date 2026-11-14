from datetime import datetime

from pydantic import BaseModel


class ActivityItem(BaseModel):
    """One line of the dashboard activity feed.

    It is a safe summary of an audit row. It has no old or new values, no email address and no IP
    address, so every logged-in user may read it.
    """

    log_id: int
    action_type: str
    table_name: str
    record_id: int
    actor_name: str | None
    target_label: str
    detail: str | None
    created_at: datetime
