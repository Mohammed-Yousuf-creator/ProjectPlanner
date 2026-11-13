import asyncio
import json
import uuid
from typing import List

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import decode_access_token
from app.core.websocket_manager import ws_manager
from app.db.session import SessionLocal, get_db
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.team_message import (
    TeamMessageCreateRequest,
    TeamMessageRead,
    TeamMessageUpdateRequest,
)
from app.services.team_chat_service import (
    create_message,
    edit_message,
    list_messages,
    soft_delete_message,
)

router = APIRouter()


# -----------------------------------------------------------------------------
# HTTP Endpoints
# -----------------------------------------------------------------------------


@router.post(
    "/teams/{team_id}/messages",
    response_model=TeamMessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Post a message in team chat",
)
def post_team_message(
    team_id: uuid.UUID,
    data: TeamMessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMessageRead:
    """Post a message with optional text and attachments. Broadcasts via WebSocket."""
    return create_message(db, team_id, current_user, data)


@router.get(
    "/teams/{team_id}/messages",
    response_model=List[TeamMessageRead],
    status_code=status.HTTP_200_OK,
    summary="List team message history",
)
def get_team_messages(
    team_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[TeamMessageRead]:
    """Return chronological message history for the team with safe attachment metadata."""
    return list_messages(db, team_id, current_user, limit=limit, offset=offset)


@router.patch(
    "/teams/{team_id}/messages/{message_id}",
    response_model=TeamMessageRead,
    status_code=status.HTTP_200_OK,
    summary="Edit own message",
)
def patch_team_message(
    team_id: uuid.UUID,
    message_id: uuid.UUID,
    data: TeamMessageUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamMessageRead:
    """Allow the original sender to edit their message."""
    return edit_message(db, team_id, message_id, current_user, data)


@router.delete(
    "/teams/{team_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a message",
)
def delete_team_message(
    team_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete a message. Allowed for original sender, team owner, or team lead."""
    soft_delete_message(db, team_id, message_id, current_user)


# -----------------------------------------------------------------------------
# WebSocket Endpoint
# -----------------------------------------------------------------------------


@router.websocket("/teams/{team_id}/ws")
async def team_websocket_endpoint(
    websocket: WebSocket,
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Real-time team collaboration WebSocket endpoint.
    
    Authenticates via the first message received after connection:
    {"type": "authenticate", "access_token": "JWT_TOKEN"}
    """
    await websocket.accept()
    user_id: uuid.UUID | None = None

    # Step 1: Wait for authentication message
    try:
        raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_data = json.loads(raw_msg)
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if (
        not isinstance(auth_data, dict)
        or auth_data.get("type") != "authenticate"
        or not auth_data.get("access_token")
    ):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token = str(auth_data["access_token"])

    # Step 2: Decode and validate JWT
    try:
        payload = decode_access_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("Missing subject")
        user_id = uuid.UUID(sub)
    except (jwt.PyJWTError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Step 3: Validate database state and active team membership
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.account_status == "active",
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team or team.status == "disbanded":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    membership = (
        db.query(TeamMember)
        .filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
            TeamMember.status == "active",
        )
        .first()
    )
    if not membership:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Step 4: Successfully authenticated
    await ws_manager.connect(websocket, team_id, user_id)
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "authenticated",
                    "user_id": str(user_id),
                    "team_id": str(team_id),
                }
            )
        )

        # Step 5: Keep-alive listener loop
        while True:
            text = await websocket.receive_text()
            try:
                client_msg = json.loads(text)
                if client_msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, team_id, user_id)
