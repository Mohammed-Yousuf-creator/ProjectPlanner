from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import DateTime, TypeDecorator
from sqlalchemy.orm import DeclarativeBase


class UTCDateTime(TypeDecorator):
    """DateTime type that ensures datetime objects are stored and read with UTC timezone.
    
    SQLite does not natively store timezone information with timestamps.
    This TypeDecorator accounts for SQLite's timezone limitations by attaching
    UTC timezone info upon loading from the database and normalizing to UTC on store.
    """
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect) -> Optional[datetime]:
        if value is not None:
            if not isinstance(value, datetime):
                raise TypeError(f"Expected datetime object, got {type(value)}")
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            else:
                value = value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value: Optional[datetime], dialect) -> Optional[datetime]:
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            else:
                value = value.astimezone(timezone.utc)
        return value


class Base(DeclarativeBase):
    pass

