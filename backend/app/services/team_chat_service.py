import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.websocket_manager import ws_manager
from app.models.stored_file import StoredFile
from app.models.team import Team, TeamMember
from app.models.team_message import TeamMessage, TeamMessageAttachment
from app.models.user import User
from app.schemas.stored_file import StoredFileRead
from app.schemas.team_message import (
    TeamMessageCreateRequest,
    TeamMessageRead,
    TeamMessageSenderInfo,
    TeamMessageUpdateRequest,
)


def get_active_team_member(
    db: Session, team_id: uuid.UUID, user_id: uuid.UUID
) -> TeamMember:
    """Verify that the team exists, is not disbanded, and user is an active member."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found.",
        )
    if team.status == "disbanded":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Team is disbanded.",
        )

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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active team members can access team messages.",
        )
    return membership


def serialize_message(msg: TeamMessage) -> TeamMessageRead:
    """Serialize a message with sender info and safe attachment metadata."""
    sender = msg.sender
    profile = sender.profile if sender else None
    display_name = profile.display_name if profile else (sender.username if sender else "Unknown")
    sender_info = TeamMessageSenderInfo(
        user_id=msg.sender_user_id,
        username=sender.username if sender else "",
        display_name=display_name,
        avatar_url=profile.avatar_url if profile else None,
    )

    attachments_read: List[StoredFileRead] = []
    for att in msg.attachments:
        f = att.file
        if f and f.deleted_at is None:
            attachments_read.append(StoredFileRead.model_validate(f))

    # Mask body if deleted
    displayed_body = msg.body if msg.deleted_at is None else None

    return TeamMessageRead(
        id=msg.id,
        team_id=msg.team_id,
        sender=sender_info,
        body=displayed_body,
        attachments=attachments_read,
        created_at=msg.created_at,
        edited_at=msg.edited_at,
        deleted_at=msg.deleted_at,
    )


def create_message(
    db: Session, team_id: uuid.UUID, current_user: User, data: TeamMessageCreateRequest
) -> TeamMessageRead:
    """Post a message with optional text and attachments, broadcasting to the team."""
    get_active_team_member(db, team_id, current_user.id)

    clean_body = data.body.strip() if data.body and data.body.strip() else None
    attachment_ids = data.attachment_ids or []

    # Validate message has text or at least one attachment
    if not clean_body and not attachment_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A message must contain either non-empty text or at least one attachment.",
        )

    # Validate attachments
    if attachment_ids:
        # Check duplicate attachment IDs in request
        if len(attachment_ids) != len(set(attachment_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate attachments are not allowed in a single message.",
            )

        files = (
            db.query(StoredFile)
            .filter(
                StoredFile.id.in_(attachment_ids),
                StoredFile.team_id == team_id,
                StoredFile.deleted_at.is_(None),
            )
            .all()
        )
        found_ids = {f.id for f in files}
        for aid in attachment_ids:
            if aid not in found_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Attachment '{aid}' not found or belongs to another team.",
                )

        # Check if any file is already attached to another message
        already_attached = (
            db.query(TeamMessageAttachment.file_id)
            .filter(TeamMessageAttachment.file_id.in_(attachment_ids))
            .first()
        )
        if already_attached:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{already_attached[0]}' is already attached to a message.",
            )

    now = datetime.now(timezone.utc)
    message = TeamMessage(
        team_id=team_id,
        sender_user_id=current_user.id,
        body=clean_body,
        created_at=now,
    )
    db.add(message)
    db.flush()

    for fid in attachment_ids:
        att = TeamMessageAttachment(
            message_id=message.id,
            file_id=fid,
            created_at=now,
        )
        db.add(att)

    db.commit()

    # Eagerly load sender and attachments
    db.refresh(message)
    refreshed_msg = (
        db.query(TeamMessage)
        .options(
            selectinload(TeamMessage.sender).selectinload(User.profile),
            selectinload(TeamMessage.attachments).selectinload(TeamMessageAttachment.file),
        )
        .filter(TeamMessage.id == message.id)
        .first()
    )

    message_read = serialize_message(refreshed_msg)

    # Broadcast event after commit
    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="message.created",
        data=message_read.model_dump(mode="json"),
    )

    return message_read


def list_messages(
    db: Session, team_id: uuid.UUID, current_user: User, limit: int = 50, offset: int = 0
) -> List[TeamMessageRead]:
    """Return chronological message history for the team with safe attachments."""
    get_active_team_member(db, team_id, current_user.id)

    messages = (
        db.query(TeamMessage)
        .options(
            selectinload(TeamMessage.sender).selectinload(User.profile),
            selectinload(TeamMessage.attachments).selectinload(TeamMessageAttachment.file),
        )
        .filter(TeamMessage.team_id == team_id)
        .order_by(TeamMessage.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [serialize_message(m) for m in messages]


def edit_message(
    db: Session,
    team_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: User,
    data: TeamMessageUpdateRequest,
) -> TeamMessageRead:
    """Allow the original sender to edit their message."""
    get_active_team_member(db, team_id, current_user.id)

    message = (
        db.query(TeamMessage)
        .options(
            selectinload(TeamMessage.sender).selectinload(User.profile),
            selectinload(TeamMessage.attachments).selectinload(TeamMessageAttachment.file),
        )
        .filter(
            TeamMessage.id == message_id,
            TeamMessage.team_id == team_id,
        )
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    if message.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a deleted message.",
        )

    if message.sender_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own messages.",
        )

    clean_body = data.body.strip()
    if not clean_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message body cannot be empty.",
        )

    now = datetime.now(timezone.utc)
    message.body = clean_body
    message.edited_at = now
    db.commit()
    db.refresh(message)

    message_read = serialize_message(message)
    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="message.updated",
        data=message_read.model_dump(mode="json"),
    )
    return message_read


def soft_delete_message(
    db: Session, team_id: uuid.UUID, message_id: uuid.UUID, current_user: User
) -> None:
    """Allow the original sender, team owner, or team lead to soft-delete a message."""
    member = get_active_team_member(db, team_id, current_user.id)

    message = (
        db.query(TeamMessage)
        .filter(
            TeamMessage.id == message_id,
            TeamMessage.team_id == team_id,
        )
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    if message.deleted_at is not None:
        return

    is_privileged = (
        member.role in ("owner", "lead") or message.sender_user_id == current_user.id
    )
    if not is_privileged:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender, team owner, or team lead can delete this message.",
        )

    now = datetime.now(timezone.utc)
    message.deleted_at = now
    db.commit()

    ws_manager.broadcast_sync(
        team_id=team_id,
        event_type="message.deleted",
        data={"id": str(message_id), "team_id": str(team_id)},
    )

