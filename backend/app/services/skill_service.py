"""Skill profile storage and the two matchmaking queries.

The scoring itself lives in `skill_matching.py` (pure, no DB); this module is the
database side: restricting who is visible, assembling candidate pools, and
turning stored rows into responses.
"""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Sequence, Set

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.ai import UserSkill
from app.models.event import Event, EventMembership
from app.models.team import Team, TeamMember
from app.models.user import User, UserProfile
from app.schemas.ai import (
    SkillMatchRead,
    SkillRead,
    SkillReplace,
    TeamMatchRead,
    TeammateMatchResponse,
    TeamMatchResponse,
)
from app.services.skill_matching import (
    Candidate,
    normalize_skill,
    normalize_skills,
    rank_candidates,
    rank_teams,
)

MAX_SKILLS = 50


def _display_name(user: User) -> str:
    if user.profile and user.profile.display_name:
        return user.profile.display_name
    return user.username


def list_user_skills(db: Session, user_id: uuid.UUID) -> List[SkillRead]:
    """Skills for one user, in normalised-name order."""
    rows = (
        db.execute(
            select(UserSkill)
            .where(UserSkill.user_id == user_id)
            .order_by(UserSkill.name.asc())
        )
        .scalars()
        .all()
    )
    return [SkillRead.model_validate(row) for row in rows]


def replace_user_skills(
    db: Session, current_user: User, data: SkillReplace
) -> List[SkillRead]:
    """Replace the caller's skill set.

    Whole-set replacement keeps the editor simple and idempotent: the client
    sends the chips that are present, and anything removed in the UI is removed
    here. Duplicates that normalise to the same key collapse instead of raising,
    because a user typing "React" and "react.js" is not an error worth failing.
    """
    cleaned: Dict[str, tuple] = {}
    for item in data.skills:
        name = normalize_skill(item.label)
        if not name:
            continue
        if name in cleaned:
            # Keep the higher proficiency and the first label the user typed.
            existing_label, existing_level = cleaned[name]
            cleaned[name] = (existing_label, max(existing_level, item.proficiency))
        else:
            cleaned[name] = (item.label.strip(), item.proficiency)

    if len(cleaned) > MAX_SKILLS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Please list at most {MAX_SKILLS} skills.",
        )

    existing = {
        row.name: row
        for row in db.execute(
            select(UserSkill).where(UserSkill.user_id == current_user.id)
        )
        .scalars()
        .all()
    }

    # Delete what is gone.
    for name, row in existing.items():
        if name not in cleaned:
            db.delete(row)

    # Add or update what remains.
    for name, (label, level) in cleaned.items():
        row = existing.get(name)
        if row:
            row.label = label
            row.proficiency = level
        else:
            db.add(
                UserSkill(
                    user_id=current_user.id,
                    name=name,
                    label=label,
                    proficiency=level,
                )
            )

    db.commit()
    return list_user_skills(db, current_user.id)


def _require_event(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )
    return event


def _require_event_participation(db: Session, event_id: uuid.UUID, user: User) -> None:
    """Only people actually in the event may match within it.

    Without this, matchmaking would leak the skill profiles of everyone on the
    platform to anyone who knows an event id.
    """
    membership = (
        db.query(EventMembership)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.user_id == user.id,
            EventMembership.status.in_(["registered", "approved"]),
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be registered for this event to use matchmaking.",
        )


def _skills_by_user(db: Session, user_ids: Sequence[uuid.UUID]) -> Dict[uuid.UUID, Set[str]]:
    """Load skill sets for many users in one query (avoids an N+1 per candidate)."""
    if not user_ids:
        return {}
    rows = (
        db.execute(
            select(UserSkill.user_id, UserSkill.name).where(
                UserSkill.user_id.in_(list(user_ids))
            )
        )
        .all()
    )
    result: Dict[uuid.UUID, Set[str]] = {}
    for user_id, name in rows:
        result.setdefault(user_id, set()).add(name)
    return result


def match_teammates(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    limit: int = 10,
    *,
    override_skills: Optional[List[str]] = None,
) -> TeammateMatchResponse:
    """Rank available participants by how well their skills complement yours.

    Candidate pool = people registered or approved for this event, excluding the
    caller and anyone already on the caller's team (recommending a teammate you
    already have is noise).
    """
    _require_event(db, event_id)
    _require_event_participation(db, event_id, current_user)

    my_skills: Set[str]
    if override_skills is not None:
        my_skills = set(normalize_skills(override_skills))
    else:
        my_skills = {
            row.name
            for row in db.execute(
                select(UserSkill).where(UserSkill.user_id == current_user.id)
            )
            .scalars()
            .all()
        }

    if not my_skills:
        return TeammateMatchResponse(
            event_id=event_id,
            has_skills=False,
            my_skills=[],
            matches=[],
            note="Add a few skills to your profile to get teammate recommendations.",
        )

    # Exclude people already on the caller's team.
    my_team_ids = [
        row.team_id
        for row in db.query(TeamMember.team_id)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(
            Team.event_id == event_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == "active",
        )
        .all()
    ]
    already_teammates: Set[uuid.UUID] = set()
    if my_team_ids:
        already_teammates = {
            row.user_id
            for row in db.query(TeamMember.user_id)
            .filter(
                TeamMember.team_id.in_(my_team_ids),
                TeamMember.status == "active",
            )
            .all()
        }

    participant_ids = [
        row.user_id
        for row in db.query(EventMembership.user_id)
        .filter(
            EventMembership.event_id == event_id,
            EventMembership.status.in_(["registered", "approved"]),
        )
        .all()
    ]
    candidate_ids = [
        uid
        for uid in participant_ids
        if uid != current_user.id and uid not in already_teammates
    ]

    if not candidate_ids:
        return TeammateMatchResponse(
            event_id=event_id,
            has_skills=True,
            my_skills=sorted(my_skills),
            matches=[],
            note="No other participants are available to match with yet.",
        )

    skill_map = _skills_by_user(db, candidate_ids)
    profiles = {
        row.user_id: row
        for row in db.query(UserProfile)
        .filter(UserProfile.user_id.in_(candidate_ids))
        .all()
    }
    users = {
        row.id: row
        for row in db.query(User).filter(User.id.in_(candidate_ids)).all()
    }

    candidates: List[Candidate] = []
    for user_id in candidate_ids:
        user = users.get(user_id)
        if not user:
            continue
        skills = skill_map.get(user_id, set())
        if not skills:
            # Someone with no skills cannot be scored; including them would rank
            # them last for a reason the user cannot see.
            continue
        profile = profiles.get(user_id)
        candidates.append(
            Candidate(
                user_id=str(user_id),
                display_name=(
                    profile.display_name if profile else user.username
                ),
                skills=skills,
                context=profile.city if profile else None,
            )
        )

    if not candidates:
        return TeammateMatchResponse(
            event_id=event_id,
            has_skills=True,
            my_skills=sorted(my_skills),
            matches=[],
            note="Nobody else in this event has listed skills yet.",
        )

    ranked = rank_candidates(my_skills, candidates, limit=limit)
    by_id = {c.user_id: c for c in candidates}

    matches: List[SkillMatchRead] = []
    for score in ranked:
        candidate = by_id[score.user_id]
        user = users.get(uuid.UUID(score.user_id))
        profile = profiles.get(uuid.UUID(score.user_id))
        matches.append(
            SkillMatchRead(
                user_id=uuid.UUID(score.user_id),
                display_name=candidate.display_name,
                username=user.username if user else None,
                headline=profile.headline if profile else None,
                city=profile.city if profile else None,
                score=score.score,
                shared_skills=score.shared_skills,
                complementary_skills=score.complementary_skills,
                candidate_skills=score.candidate_skills,
                reasons=score.reasons,
            )
        )

    note = None
    if not matches:
        note = (
            "No strong complements found — everyone available overlaps with your "
            "skills. Try adding a different skill to broaden the search."
        )

    return TeammateMatchResponse(
        event_id=event_id,
        has_skills=True,
        my_skills=sorted(my_skills),
        matches=matches,
        note=note,
    )


def match_teams(
    db: Session,
    event_id: uuid.UUID,
    current_user: User,
    limit: int = 10,
) -> TeamMatchResponse:
    """Rank open teams by how much the caller would add to them.

    Only teams that can still take members are considered: `forming`/`active`
    status and below the event's `max_team_size`.
    """
    event = _require_event(db, event_id)
    _require_event_participation(db, event_id, current_user)

    my_skills = {
        row.name
        for row in db.execute(
            select(UserSkill).where(UserSkill.user_id == current_user.id)
        )
        .scalars()
        .all()
    }
    if not my_skills:
        return TeamMatchResponse(
            event_id=event_id,
            has_skills=False,
            my_skills=[],
            matches=[],
            note="Add a few skills to your profile to see which teams need them.",
        )

    teams = (
        db.query(Team)
        .filter(
            Team.event_id == event_id,
            Team.status.in_(["forming", "active"]),
        )
        .all()
    )
    if not teams:
        return TeamMatchResponse(
            event_id=event_id,
            has_skills=True,
            my_skills=sorted(my_skills),
            matches=[],
            note="No open teams are looking for members right now.",
        )

    team_ids = [team.id for team in teams]
    member_rows = (
        db.query(TeamMember.team_id, TeamMember.user_id, TeamMember.status)
        .filter(
            TeamMember.team_id.in_(team_ids),
            TeamMember.status == "active",
        )
        .all()
    )
    members_by_team: Dict[uuid.UUID, List[uuid.UUID]] = {}
    for team_id, user_id, _status in member_rows:
        members_by_team.setdefault(team_id, []).append(user_id)

    all_member_ids = {uid for ids in members_by_team.values() for uid in ids}
    skill_map = _skills_by_user(db, list(all_member_ids))

    candidates: List[tuple] = []
    counts: Dict[str, int] = {}
    for team in teams:
        members = members_by_team.get(team.id, [])
        # A full team cannot take the caller, so it is not a match.
        if event.max_team_size and len(members) >= event.max_team_size:
            continue
        combined: Set[str] = set()
        for member_id in members:
            combined |= skill_map.get(member_id, set())
        if not combined:
            continue
        candidates.append((str(team.id), team.name, combined))
        counts[str(team.id)] = len(members)

    if not candidates:
        return TeamMatchResponse(
            event_id=event_id,
            has_skills=True,
            my_skills=sorted(my_skills),
            matches=[],
            note="Every open team is either full or has no skills listed yet.",
        )

    ranked = rank_teams(my_skills, candidates, limit=limit)
    matches = [
        TeamMatchRead(
            team_id=uuid.UUID(score.user_id),
            team_name=score.display_name,
            member_count=counts.get(score.user_id, 0),
            score=score.score,
            shared_skills=score.shared_skills,
            complementary_skills=score.complementary_skills,
            team_skills=score.candidate_skills,
            reasons=score.reasons,
        )
        for score in ranked
    ]

    return TeamMatchResponse(
        event_id=event_id,
        has_skills=True,
        my_skills=sorted(my_skills),
        matches=matches,
        note=None if matches else "No team is missing what you offer right now.",
    )
