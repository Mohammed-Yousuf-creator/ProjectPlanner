from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.sponsorship import SponsorDiscoveryRead
from app.services.sponsorship_service import discover_sponsors

router = APIRouter()


@router.get("/sponsors", response_model=List[SponsorDiscoveryRead])
def get_sponsors(
    query: Optional[str] = Query(None, description="Search by organization name or description"),
    currency: Optional[str] = Query(None, min_length=3, max_length=3),
    min_budget: Optional[Decimal] = Query(None, ge=0),
    max_budget: Optional[Decimal] = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Discover active sponsor organizations offering sponsorship."""
    return discover_sponsors(
        db=db,
        query=query,
        currency=currency,
        min_budget=min_budget,
        max_budget=max_budget,
        limit=limit,
        offset=offset,
    )

