import uuid
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Skills & matching
# ---------------------------------------------------------------------------


class SkillCreate(BaseModel):
    """Add one skill to your profile.

    `label` is what the user typed; the server normalises it and stores the
    canonical `name` itself, so clients never have to know the rules.
    """

    label: str = Field(..., min_length=1, max_length=80)
    proficiency: int = Field(3, ge=1, le=5)


class SkillReplace(BaseModel):
    """Replace the whole skill set in one call (the profile editor's Save)."""

    skills: List[SkillCreate] = Field(default_factory=list, max_length=50)


class SkillRead(BaseModel):
    id: uuid.UUID
    name: str
    label: str
    proficiency: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SkillMatchRead(BaseModel):
    """One ranked match plus the reasoning behind its score."""

    user_id: uuid.UUID
    display_name: str
    username: Optional[str] = None
    headline: Optional[str] = None
    city: Optional[str] = None
    score: float
    shared_skills: List[str] = Field(default_factory=list)
    complementary_skills: List[str] = Field(default_factory=list)
    candidate_skills: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)


class TeamMatchRead(BaseModel):
    """A team ranked by what the caller would add to it."""

    team_id: uuid.UUID
    team_name: str
    member_count: int = 0
    score: float
    shared_skills: List[str] = Field(default_factory=list)
    complementary_skills: List[str] = Field(default_factory=list)
    team_skills: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)


class TeammateMatchResponse(BaseModel):
    """Results of "who complements me in this event?"."""

    event_id: uuid.UUID
    algorithm: str = "skill_complementarity_v1"
    # False when the caller has no skills recorded yet: the UI shows a nudge
    # rather than an empty list.
    has_skills: bool
    my_skills: List[str] = Field(default_factory=list)
    matches: List[SkillMatchRead] = Field(default_factory=list)
    # Set when the list is empty for a reason worth explaining.
    note: Optional[str] = None


class TeamMatchResponse(BaseModel):
    event_id: uuid.UUID
    algorithm: str = "skill_complementarity_v1"
    has_skills: bool
    my_skills: List[str] = Field(default_factory=list)
    matches: List[TeamMatchRead] = Field(default_factory=list)
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Chat assistant
# ---------------------------------------------------------------------------


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatConversationRead(BaseModel):
    id: uuid.UUID
    title: str
    event_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ChatConversationSummaryRead(BaseModel):
    """List entry: no messages, just enough to render a sidebar row."""

    id: uuid.UUID
    title: str
    event_id: Optional[uuid.UUID] = None
    message_count: int = 0
    last_message_preview: Optional[str] = None
    updated_at: datetime


class ChatSendRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    # Optional event context so answers can mention deadlines, tracks, etc.
    event_id: Optional[uuid.UUID] = None


class ChatSendResponse(BaseModel):
    conversation_id: uuid.UUID
    user_message: ChatMessageRead
    assistant_message: ChatMessageRead
    # False when the offline fallback answered. The UI labels these replies so
    # canned text is never passed off as a model response.
    ai_generated: bool
    note: Optional[str] = None


class AiStatusRead(BaseModel):
    """Lets the UI hide/disable AI affordances when no key is configured."""

    ai_enabled: bool
    model: Optional[str] = None
    features: Dict[str, bool] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Submission overviews
# ---------------------------------------------------------------------------


class SubmissionSummaryRead(BaseModel):
    submission_id: uuid.UUID
    tldr: str
    overview: str
    highlights: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)
    talking_points: List[str] = Field(default_factory=list)
    source: str
    model_name: Optional[str] = None
    created_at: datetime
    # True when served from cache and the caller may force a refresh.
    cached: bool = False


class ProjectOverviewItem(BaseModel):
    """One submission's overview inside an event-wide digest."""

    submission_id: uuid.UUID
    project_id: uuid.UUID
    team_name: str
    title: str
    tldr: str
    technologies: List[str] = Field(default_factory=list)


class EventOverviewResponse(BaseModel):
    event_id: uuid.UUID
    generated: int
    cached: int
    skipped: int
    items: List[ProjectOverviewItem] = Field(default_factory=list)
    note: Optional[str] = None


class SkillMatchRequest(BaseModel):
    """Ad-hoc match against a pasted skill list (useful for "what if" checks)."""

    skills: List[str] = Field(default_factory=list, max_length=50)
    limit: int = Field(10, ge=1, le=50)
