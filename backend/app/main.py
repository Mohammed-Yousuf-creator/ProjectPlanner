from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Backend foundation for Event and Hackathon Management Platform",
)

# CORS is configured from settings so a deployment can lock the API down to its
# real frontend origin without a code change. Authentication is Bearer-token
# based (not cookies), so `allow_credentials` stays off: that keeps the permissive
# "*" default valid and avoids the `*` + credentials combination browsers reject.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

