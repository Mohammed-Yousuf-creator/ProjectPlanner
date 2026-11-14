"""Skill-based team matching.

This is a **deterministic algorithm, not a model call**. Matching teammates is a
ranking problem with a precise definition of "good": we want teams whose skills
complement each other rather than repeat, and we must be able to explain every
recommendation to the user. A black-box scorer cannot do that, and an LLM would
be slower, costlier, and non-deterministic for the same result.

How it works
------------
1. **Normalise** skill strings so `React.js`, `react js` and `ReactJS` collapse to
   one canonical key. Without this, "React" and "react" look like different
   skills and coverage scores become meaningless.
2. **Weight** each skill by rarity: a skill held by 1 of 10 people is worth more
   to team diversity than one held by 8 of 10. Weight = `1 / (1 + holders)`.
3. **Score pairs** with two terms:
   * **complement** (what we want) — weight of skills exactly one side has, i.e.
     the value a partner brings that you lack.
   * **overlap** (what we discount) — weight of shared skills, penalised by
     `OVERLAP_PENALTY` so we do not recommend a clone.
4. **Score teams**: start from the pair score, then add the complement of each
   remaining candidate, so a team missing backend skills still ranks a backend
   developer highly even if they overlap with the lead.

Every score is returned with the reasons behind it (`shared_skills`,
`complementary_skills`, `coverage_gain`), so the UI can explain itself instead of
showing an unexplained number.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

# How much a shared skill costs relative to a complementary one. At 0.6, two
# people who share one skill and differ on one still score positive, but a
# near-identical profile scores almost nothing.
OVERLAP_PENALTY = 0.6

# A match must bring something the team does not already have. 0.05 is well
# below the weight of any single rare skill, so it only filters out exact clones.
MIN_SCORE = 0.05

# Skills longer than this are almost certainly free-text sentences pasted into
# the field; they would poison the vocabulary, so they are dropped.
MAX_SKILL_LENGTH = 40

_WHITESPACE_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9+#. ]")
_SEPARATOR_RE = re.compile(r"[\s._\-/]+")

# Common aliases so the vocabulary is not fragmented by spelling. Keys are
# already-normalised phrases.
ALIASES: Dict[str, str] = {
    "react js": "react",
    "reactjs": "react",
    "react18": "react",
    "node js": "nodejs",
    "node": "nodejs",
    "next js": "nextjs",
    "nextjs": "nextjs",
    "vue js": "vue",
    "vuejs": "vue",
    "postgres": "postgresql",
    "postgre sql": "postgresql",
    "psql": "postgresql",
    "mongo": "mongodb",
    "tailwind css": "tailwind",
    "tailwindcss": "tailwind",
    "golang": "go",
    "ts": "typescript",
    "js": "javascript",
    "ml": "machine learning",
    "dl": "deep learning",
    "k8s": "kubernetes",
    "ci cd": "cicd",
    "ui ux": "uiux",
    "ux": "uiux",
    "ui": "uiux",
    "c sharp": "csharp",
    "c#": "csharp",
    "gcp": "google cloud",
    "aws": "aws",
    "rest api": "rest",
    "restful": "rest",
}


def normalize_skill(raw: str) -> Optional[str]:
    """Canonicalise one skill string, or None when it is unusable.

    Lowercases, strips punctuation that carries no meaning (`C++` and `C#` keep
    their suffix because they are different languages), collapses whitespace and
    applies `ALIASES`.
    """
    if not raw:
        return None

    text = raw.strip().lower()
    if not text or len(text) > MAX_SKILL_LENGTH:
        return None

    # Protect the two meaningful symbols before stripping punctuation.
    text = text.replace("c++", "cplusplus").replace("c#", "csharp")
    text = _NON_ALNUM_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    if not text:
        return None

    text = _SEPARATOR_RE.sub(" ", text).strip()
    text = ALIASES.get(text, text)
    text = _SEPARATOR_RE.sub(" ", text).strip()
    if text == "cplusplus":
        text = "c++"
    return text or None


def normalize_skills(raw_skills: Iterable[str]) -> List[str]:
    """Normalise and de-duplicate a skill list, preserving first-seen order."""
    seen: Set[str] = set()
    result: List[str] = []
    for raw in raw_skills:
        skill = normalize_skill(raw)
        if skill and skill not in seen:
            seen.add(skill)
            result.append(skill)
    return result


def skill_weights(skill_sets: Sequence[Set[str]]) -> Dict[str, float]:
    """Inverse-document-frequency weight per skill.

    `weight = 1 / (1 + holders)`. A skill nobody else has scores 1.0; a skill
    everyone has scores `1 / (1 + n)` and therefore barely moves the ranking.
    This is what stops ubiquitous skills like "python" from dominating a
    recommendation while leaving rare ones ("rust") decisive.
    """
    counts: Dict[str, int] = {}
    for skills in skill_sets:
        for skill in skills:
            counts[skill] = counts.get(skill, 0) + 1
    return {skill: 1.0 / (1.0 + count) for skill, count in counts.items()}


def _weighted_sum(skills: Iterable[str], weights: Dict[str, float]) -> float:
    return sum(weights.get(skill, 1.0) for skill in skills)


@dataclass
class MatchScore:
    """A scored candidate with the reasoning kept alongside the number."""

    user_id: str
    display_name: str
    score: float
    shared_skills: List[str] = field(default_factory=list)
    complementary_skills: List[str] = field(default_factory=list)
    candidate_skills: List[str] = field(default_factory=list)
    reasons: List[str] = field(default_factory=list)


@dataclass
class Candidate:
    """One candidate to rank, with pre-normalised skills."""

    user_id: str
    display_name: str
    skills: Set[str]
    # Free-form extras surfaced in the UI but not scored, e.g. timezone.
    context: Optional[str] = None


def score_candidate(
    me: Set[str],
    candidate: Set[str],
    weights: Dict[str, float],
) -> Tuple[float, List[str], List[str]]:
    """Score one candidate against a single person (pairwise).

    Returns `(score, shared, complementary)`.
    """
    shared = sorted(me & candidate)
    complementary = sorted(candidate - me)

    complement_value = _weighted_sum(complementary, weights)
    overlap_cost = _weighted_sum(shared, weights) * OVERLAP_PENALTY

    return complement_value - overlap_cost, shared, complementary


def score_team(
    team_skills: Set[str],
    candidate: Set[str],
    weights: Dict[str, float],
) -> Tuple[float, List[str], List[str]]:
    """Score a candidate against an existing team (everyone's combined skills).

    This is the same pair formula with the team's union of skills as "me", which
    is what makes it compose: adding a member only ever grows the covered set.
    """
    return score_candidate(team_skills, candidate, weights)


def rank_candidates(
    me: Set[str],
    candidates: Sequence[Candidate],
    *,
    limit: int = 10,
    exclude_user_ids: Iterable[str] = (),
) -> List[MatchScore]:
    """Rank candidates for an individual looking for teammates.

    `weights` are computed from the candidate pool, so rarity is relative to the
    people actually available to match with.
    """
    excluded = {str(uid) for uid in exclude_user_ids}
    pool = [c for c in candidates if c.user_id not in excluded]

    weights = skill_weights([me] + [c.skills for c in pool])

    scored: List[MatchScore] = []
    for candidate in pool:
        score, shared, complementary = score_candidate(me, candidate.skills, weights)
        if score < MIN_SCORE or not complementary:
            continue

        reasons: List[str] = []
        if complementary:
            shown = ", ".join(complementary[:4])
            reasons.append(f"Brings {shown}" + (" and more" if len(complementary) > 4 else ""))
        if shared:
            reasons.append(f"Shares {', '.join(shared[:3])}")
        if not shared:
            reasons.append("No skill overlap — pure coverage")

        scored.append(
            MatchScore(
                user_id=candidate.user_id,
                display_name=candidate.display_name,
                score=round(score, 4),
                shared_skills=shared,
                complementary_skills=complementary,
                candidate_skills=sorted(candidate.skills),
                reasons=reasons,
            )
        )

    # Deterministic ordering: score desc, then display name, then id. Without the
    # tiebreakers, equal scores would come back in an arbitrary order and the UI
    # would appear to shuffle between refreshes.
    scored.sort(key=lambda m: (-m.score, m.display_name.lower(), m.user_id))
    return scored[: max(0, limit)]


def rank_teams(
    my_skills: Set[str],
    teams: Sequence[Tuple[str, str, Set[str]]],
    *,
    limit: int = 10,
) -> List[MatchScore]:
    """Rank teams by how well the caller would complete them.

    `teams` is `[(team_id, team_name, combined_skills)]`. For a team we want the
    *inverse* question — what does this team lack that I bring — so coverage is
    computed from the team's perspective.
    """
    weights = skill_weights([my_skills] + [skills for _, _, skills in teams])

    scored: List[MatchScore] = []
    for team_id, team_name, team_skills in teams:
        score, shared, complementary = score_team(team_skills, my_skills, weights)
        if score < MIN_SCORE or not complementary:
            continue

        reasons: List[str] = []
        shown = ", ".join(complementary[:4])
        reasons.append(f"You add {shown}" + (" and more" if len(complementary) > 4 else ""))
        if shared:
            reasons.append(f"Team already covers {', '.join(shared[:3])}")

        scored.append(
            MatchScore(
                user_id=team_id,
                display_name=team_name,
                score=round(score, 4),
                shared_skills=shared,
                complementary_skills=complementary,
                candidate_skills=sorted(team_skills),
                reasons=reasons,
            )
        )

    scored.sort(key=lambda m: (-m.score, m.display_name.lower(), m.user_id))
    return scored[: max(0, limit)]


def coverage_gain(team_skills: Set[str], candidate: Set[str], weights: Dict[str, float]) -> float:
    """How much new weighted surface area a candidate adds to a team.

    Used by the team builder to decide whether a recommended member is worth
    adding, independent of the penalty term.
    """
    return _weighted_sum(candidate - team_skills, weights)
