from fastapi import APIRouter

from app.api.routes import auth, events, health, organizations, tracks, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["Organizations"])
api_router.include_router(events.router, prefix="/events", tags=["Events"])
api_router.include_router(tracks.router, prefix="/tracks", tags=["Tracks"])
