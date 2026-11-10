from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Values are read from the .env file in the folder you start uvicorn from
    database_url: str
    jwt_secret_key: str
    jwt_expire_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()