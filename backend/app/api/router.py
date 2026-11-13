from fastapi import APIRouter

from app.api.routes import (
    auth,
    events,
    health,
    judging,
    leaderboards,
    organizations,
    participants,
    projects,
    registrations,
    submissions,
    team_files,
    team_messages,
    team_tasks,
    teams,
    tracks,
    users,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(health.router, tags=["Health"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["Organizations"])
api_router.include_router(events.router, prefix="/events", tags=["Events"])
api_router.include_router(tracks.router, prefix="/tracks", tags=["Tracks"])
api_router.include_router(registrations.router, tags=["Registrations"])
api_router.include_router(participants.router, prefix="/participants", tags=["Participants"])
api_router.include_router(teams.router, tags=["Teams"])
api_router.include_router(team_tasks.router, tags=["Team Collaboration"])
api_router.include_router(team_messages.router, tags=["Team Collaboration"])
api_router.include_router(team_files.router, tags=["Team Collaboration"])
api_router.include_router(projects.router, tags=["Projects"])
api_router.include_router(submissions.router, tags=["Submissions"])
api_router.include_router(judging.router, tags=["Judging"])
api_router.include_router(leaderboards.router, tags=["Leaderboards"])
