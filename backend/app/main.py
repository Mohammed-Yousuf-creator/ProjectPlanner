from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Backend foundation for Event and Hackathon Management Platform",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

