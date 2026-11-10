from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

# Reads the "Bearer <token>" part of each request. auto_error=False lets us send our own message.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Return the logged-in user, or stop the request with a 401 error."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Please log in first")

    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id) if user_id is not None else None

    # The user must still exist and still be active, even if the token is valid
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Your login is invalid or has expired")
    return user


def require_roles(*allowed_roles: str):
    """Return a check that lets in only users whose role is in allowed_roles."""

    def check_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Your role is not allowed to do this")
        return current_user

    return check_role