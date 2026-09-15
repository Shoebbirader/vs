from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VahanSync API"
    environment: str = Field(default="development", alias="NODE_ENV")
    release_version: str = Field(default="python-backend-foundation", alias="RELEASE_VERSION")
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_database_url: str | None = Field(default=None, alias="SUPABASE_DATABASE_URL")
    supabase_storage_bucket: str = Field(default="fleetops-files", alias="SUPABASE_STORAGE_BUCKET")
    public_app_url: str | None = Field(default=None, alias="PUBLIC_APP_URL")
    razorpay_test_key_id: str | None = Field(default=None, alias="RAZORPAY_TEST_KEY_ID")
    razorpay_test_key_secret: str | None = Field(default=None, alias="RAZORPAY_TEST_KEY_SECRET")
    razorpay_test_webhook_secret: str | None = Field(default=None, alias="RAZORPAY_TEST_WEBHOOK_SECRET")
    razorpay_test_webhook_enabled: bool = Field(default=False, alias="RAZORPAY_TEST_WEBHOOK_ENABLED")
    razorpay_live_enabled: bool = Field(default=False, alias="RAZORPAY_LIVE_ENABLED")

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def configuration_ready(self) -> bool:
        return bool(
            self.supabase_url
            and self.supabase_anon_key
            and self.supabase_database_url
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
