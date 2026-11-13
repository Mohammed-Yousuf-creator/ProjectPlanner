import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings, BACKEND_DIR


def get_resolved_database_url(url: str, base_dir: Path) -> str:
    """Resolve relative SQLite database paths to be absolute relative to backend directory."""
    if url.startswith("sqlite:///") and not url.startswith("sqlite:////"):
        rel_path = url[len("sqlite:///"):]
        if rel_path != ":memory:":
            abs_path = (base_dir / rel_path).resolve()
            # Ensure the directory exists before connecting
            abs_path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite:///{abs_path.as_posix()}"
    return url


database_url = get_resolved_database_url(settings.DATABASE_URL, BACKEND_DIR)

connect_args = {}
if database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable SQLite foreign-key constraints on every connection."""
    if type(dbapi_connection).__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session and closes it cleanly."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

