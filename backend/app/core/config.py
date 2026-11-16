from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Values are read from the .env file in the folder you start uvicorn from
    database_url: str
    jwt_secret_key: str
    jwt_expire_minutes: int = 60
    # Extra web addresses allowed to call the API, separated by commas, for example
    # CORS_ORIGINS=https://enersync.onrender.com. The two local addresses are always allowed.
    cors_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env")


def parse_origins(text: str) -> list[str]:
    """Turns "https://a.com, https://b.com/" into ["https://a.com", "https://b.com"].

    Spaces, empty items and a trailing slash are removed, because a browser sends the address
    without a trailing slash and the two would otherwise not match.
    """
    return [item.strip().rstrip("/") for item in text.split(",") if item.strip()]


settings = Settings()