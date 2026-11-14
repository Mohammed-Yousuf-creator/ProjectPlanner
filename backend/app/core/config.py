from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Event Platform API"
    APP_ENV: str = "development"
    DATABASE_URL: str = "sqlite:///./data/app.db"
    UPLOAD_DIR: str = str(BACKEND_DIR / "data" / "uploads")

    JWT_SECRET_KEY: str = "replace_with_a_random_secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # Refresh tokens are long-lived but only ever exchanged; they must never be
    # accepted as an access token, so they carry a distinct `typ` claim.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    JWT_ISSUER: str = "event-platform"
    JWT_AUDIENCE: str = "event-platform-users"

    # Comma-separated list of allowed browser origins. The default "*" keeps the
    # bundled Vite dev proxy and local tooling working out of the box; production
    # deployments should set CORS_ORIGINS to the real frontend origin(s).
    CORS_ORIGINS: str = "*"
    CORS_ALLOW_CREDENTIALS: bool = False

    # ---------------------------------------------------------------------
    # AI (Google Gemini)
    # ---------------------------------------------------------------------
    # Leave GEMINI_API_KEY empty to run the platform fully offline: every AI
    # feature degrades to a deterministic fallback instead of erroring, so the
    # app and its test suite work with no key and no network.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_API_BASE: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_TIMEOUT_SECONDS: float = 30.0
    # Output is clamped so a chat reply cannot blow up a mobile layout.
    GEMINI_MAX_OUTPUT_TOKENS: int = 2048

    @property
    def ai_enabled(self) -> bool:
        """True when a Gemini key is configured, i.e. live AI is available."""
        return bool(self.GEMINI_API_KEY.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        """Parsed CORS_ORIGINS as a list, tolerating whitespace and blanks."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

