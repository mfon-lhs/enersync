from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reads DATABASE_URL from the .env file in the folder you start uvicorn from
    database_url: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()