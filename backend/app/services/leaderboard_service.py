import uuid
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event, EventMembership
from app.models.judging import Evaluation, EvaluationScore
from app.models.project import Project, ProjectSubmission
from app.models.user import User
from app.schemas.judging import LeaderboardEntryRead
from app.services.organization_service import get_member_in_org


def get_event_leaderboard(
    db: Session,
    event_id: uuid.UUID,
    current_user: Optional[User] = None,
) -> List[LeaderboardEntryRead]:
    """Calculate and return event leaderboard dynamically."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # 1. Access authorization
    is_org_admin = False
    if current_user:
        org_mem = get_member_in_org(db, event.organization_id, current_user.id)
        if org_mem and org_mem.status == "active" and org_mem.role in ("owner", "admin"):
            is_org_admin = True

    if not is_org_admin:
        if event.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Leaderboard is not available until the event is completed.",
            )

        # Event is completed
        if event.visibility == "public":
            # Public access allowed for completed public events
            pass
        else:
            # Private or unlisted event requires participant or judge membership
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Authentication required to view leaderboard for private event.",
                )
            ev_mem = (
                db.query(EventMembership)
                .filter(
                    EventMembership.event_id == event_id,
                    EventMembership.user_id == current_user.id,
                    EventMembership.status.in_(["registered", "approved"]),
                )
                .first()
            )
            if not ev_mem:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to view this event's leaderboard.",
                )

    # 2. Dynamic scoring calculation
    projects = (
        db.query(Project)
        .options(
            joinedload(Project.team),
            joinedload(Project.track),
            joinedload(Project.submissions),
        )
        .filter(Project.event_id == event_id)
        .all()
    )

    judged_items = []
    unjudged_items = []

    for proj in projects:
        # Find latest submitted version
        submitted_versions = [
            s for s in proj.submissions if s.status == "submitted"
        ]
        if not submitted_versions:
            # Ignore projects without any submitted version
            continue

        latest_sub = max(submitted_versions, key=lambda s: s.version_number)

        # Find submitted evaluations for this latest submission
        evaluations = (
            db.query(Evaluation)
            .options(
                joinedload(Evaluation.scores).joinedload(EvaluationScore.criterion)
            )
            .filter(
                Evaluation.submission_id == latest_sub.id,
                Evaluation.status == "submitted",
            )
            .all()
        )

        track_name = proj.track.name if proj.track else None

        if not evaluations:
            # Unjudged project - do not invent scores
            unjudged_items.append(
                {
                    "project_id": proj.id,
                    "submission_id": latest_sub.id,
                    "project_title": latest_sub.title,
                    "team_id": proj.team.id,
                    "team_name": proj.team.name,
                    "track_name": track_name,
                    "final_score": None,
                    "evaluation_count": 0,
                }
            )
            continue

        # Calculate scores per evaluation
        eval_scores = []
        for ev in evaluations:
            weighted_sum = 0.0
            total_weight = 0.0
            for sc in ev.scores:
                if sc.criterion and sc.criterion.max_score > 0:
                    normalized = (sc.score / sc.criterion.max_score) * 100.0
                    weighted_sum += normalized * sc.criterion.weight
                    total_weight += sc.criterion.weight

            if total_weight > 0:
                weighted_score = weighted_sum / total_weight
                eval_scores.append(weighted_score)

        if eval_scores:
            final_score = round(sum(eval_scores) / len(eval_scores), 2)
            judged_items.append(
                {
                    "project_id": proj.id,
                    "submission_id": latest_sub.id,
                    "project_title": latest_sub.title,
                    "team_id": proj.team.id,
                    "team_name": proj.team.name,
                    "track_name": track_name,
                    "final_score": final_score,
                    "evaluation_count": len(evaluations),
                }
            )
        else:
            unjudged_items.append(
                {
                    "project_id": proj.id,
                    "submission_id": latest_sub.id,
                    "project_title": latest_sub.title,
                    "team_id": proj.team.id,
                    "team_name": proj.team.name,
                    "track_name": track_name,
                    "final_score": None,
                    "evaluation_count": len(evaluations),
                }
            )

    # 3. Sort judged items by final_score descending
    judged_items.sort(key=lambda x: (-x["final_score"], x["project_title"]))

    results: List[LeaderboardEntryRead] = []
    prev_score: Optional[float] = None
    prev_rank: int = 0

    for idx, item in enumerate(judged_items):
        if prev_score is not None and item["final_score"] == prev_score:
            rank = prev_rank
        else:
            rank = idx + 1
            prev_rank = rank
            prev_score = item["final_score"]

        results.append(
            LeaderboardEntryRead(
                rank=rank,
                project_id=item["project_id"],
                submission_id=item["submission_id"],
                project_title=item["project_title"],
                team_id=item["team_id"],
                team_name=item["team_name"],
                track_name=item["track_name"],
                final_score=item["final_score"],
                evaluation_count=item["evaluation_count"],
            )
        )

    # Sort unjudged items by project_title
    unjudged_items.sort(key=lambda x: x["project_title"])
    for item in unjudged_items:
        results.append(
            LeaderboardEntryRead(
                rank=None,
                project_id=item["project_id"],
                submission_id=item["submission_id"],
                project_title=item["project_title"],
                team_id=item["team_id"],
                team_name=item["team_name"],
                track_name=item["track_name"],
                final_score=None,
                evaluation_count=item["evaluation_count"],
            )
        )

    return results

