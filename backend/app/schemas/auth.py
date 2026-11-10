from pydantic import BaseModel


class LoginRequest(BaseModel):
    """The email and password the user sends to log in."""

    email: str
    password: str


class TokenResponse(BaseModel):
    """The token the server returns after a successful login."""

    access_token: str
    token_type: str = "bearer"