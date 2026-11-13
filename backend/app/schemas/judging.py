import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class JudgeCreate(BaseModel):
    email: EmailStr


class JudgeRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    username: str
    display_name: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    status: str
    registered_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JudgingCriteriaCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    max_score: float
    weight: float
    sort_order: int = 0


class JudgingCriteriaUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = None
    max_score: Optional[float] = None
    weight: Optional[float] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class JudgingCriteriaRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: Optional[str] = None
    max_score: float
    weight: float
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvaluationScoreItem(BaseModel):
    criteria_id: uuid.UUID
    score: float = Field(..., ge=0)
    feedback: Optional[str] = None


class EvaluationScoreRead(BaseModel):
    id: uuid.UUID
    criteria_id: uuid.UUID
    criterion_name: Optional[str] = None
    score: float
    feedback: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EvaluationSaveRequest(BaseModel):
    overall_feedback: Optional[str] = None
    scores: List[EvaluationScoreItem] = []


class EvaluationRead(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    judge_user_id: uuid.UUID
    status: str
    overall_feedback: Optional[str] = None
    submitted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    scores: List[EvaluationScoreRead] = []

    model_config = ConfigDict(from_attributes=True)


class LeaderboardEntryRead(BaseModel):
    rank: Optional[int] = None
    project_id: uuid.UUID
    submission_id: uuid.UUID
    project_title: str
    team_id: uuid.UUID
    team_name: str
    track_name: Optional[str] = None
    final_score: Optional[float] = None
    evaluation_count: int

    model_config = ConfigDict(from_attributes=True)
