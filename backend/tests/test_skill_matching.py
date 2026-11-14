"""Unit tests for the skill-matching algorithm.

No database, no HTTP — just the pure ranking functions. These pin the properties
that make the recommendations defensible:

* normalisation is stable (so scores are not fragmented by spelling),
* rare skills outrank ubiquitous ones,
* a clone is never recommended,
* ordering is deterministic (the UI must not reshuffle between refreshes).
"""

from app.services.skill_matching import (
    OVERLAP_PENALTY,
    Candidate,
    normalize_skill,
    normalize_skills,
    rank_candidates,
    rank_teams,
    skill_weights,
)


class TestNormalisation:
    def test_common_spellings_collapse(self):
        for raw in ["React.js", "react js", "ReactJS", "REACT"]:
            assert normalize_skill(raw) == "react", raw

    def test_known_aliases(self):
        assert normalize_skill("Node.js") == "nodejs"
        assert normalize_skill("k8s") == "kubernetes"
        assert normalize_skill("Postgres") == "postgresql"
        assert normalize_skill("tailwindcss") == "tailwind"
        assert normalize_skill("ML") == "machine learning"
        assert normalize_skill("golang") == "go"

    def test_c_plus_plus_and_csharp_stay_distinct(self):
        # These are different languages; normalisation must not merge them.
        assert normalize_skill("C++") == "c++"
        assert normalize_skill("C#") == "csharp"
        assert normalize_skill("c++") != normalize_skill("c#")

    def test_unusable_input_returns_none(self):
        assert normalize_skill("") is None
        assert normalize_skill("   ") is None
        assert normalize_skill("x" * 100) is None  # a pasted sentence, not a skill

    def test_dedupe_preserves_first_seen_order(self):
        assert normalize_skills(["React", "react.js", "Python", "react"]) == [
            "react",
            "python",
        ]


class TestWeights:
    def test_rarer_skills_weigh_more(self):
        weights = skill_weights([{"a", "common"}, {"common"}, {"common"}])
        assert weights["a"] > weights["common"]
        # 1/(1+1)=0.5 for the single holder, 1/(1+3)=0.25 for the shared one.
        assert weights["a"] == 0.5
        assert weights["common"] == 0.25

    def test_skill_held_by_nobody_scores_full(self):
        weights = skill_weights([{"a"}])
        assert weights["a"] == 0.5


class TestRankCandidates:
    def _candidates(self):
        return [
            Candidate("clone", "Clone", {"react", "typescript"}),
            Candidate("backend", "Backend", {"python", "django", "postgresql"}),
            Candidate("designer", "Designer", {"figma"}),
        ]

    def test_clone_is_excluded_entirely(self):
        matches = rank_candidates({"react", "typescript"}, self._candidates())
        assert "clone" not in [m.user_id for m in matches]

    def test_broader_complement_ranks_first(self):
        matches = rank_candidates({"react", "typescript"}, self._candidates())
        assert matches[0].user_id == "backend"

    def test_scores_are_positive_and_explained(self):
        matches = rank_candidates({"react", "typescript"}, self._candidates())
        for match in matches:
            assert match.score > 0
            assert match.complementary_skills
            assert match.reasons

    def test_overlap_is_recorded_not_hidden(self):
        candidates = [Candidate("partial", "Partial", {"react", "figma"})]
        match = rank_candidates({"react", "typescript"}, candidates)[0]
        assert match.shared_skills == ["react"]
        assert match.complementary_skills == ["figma"]
        # Sharing costs, so the score is below the raw complement value.
        assert match.score < 1.0

    def test_existing_teammates_can_be_excluded(self):
        matches = rank_candidates(
            {"react", "typescript"},
            self._candidates(),
            exclude_user_ids={"backend"},
        )
        assert {m.user_id for m in matches} == {"designer"}

    def test_limit_is_respected(self):
        assert len(rank_candidates({"react"}, self._candidates(), limit=1)) == 1

    def test_ordering_is_deterministic(self):
        """Equal scores must not shuffle between calls."""
        candidates = [
            Candidate("b", "Beta", {"rust"}),
            Candidate("a", "Alpha", {"rust"}),
            Candidate("c", "Gamma", {"rust"}),
        ]
        first = [m.user_id for m in rank_candidates({"react"}, candidates)]
        for _ in range(5):
            assert [m.user_id for m in rank_candidates({"react"}, candidates)] == first
        # Alphabetical tiebreak, so the list is stable and predictable.
        assert first == ["a", "b", "c"]

    def test_no_complement_means_no_match(self):
        # Everything the candidate offers is already covered.
        assert rank_candidates({"react", "figma"}, [Candidate("x", "X", {"react"})]) == []

    def test_penalty_is_applied_at_the_documented_rate(self):
        """Guard against someone tuning the constant without updating docs."""
        assert OVERLAP_PENALTY == 0.6


class TestRankTeams:
    def test_team_missing_your_skills_ranks_higher(self):
        teams = [
            ("team-design", "Designers", {"figma", "uiux"}),
            ("team-front", "Frontend", {"react", "typescript"}),
        ]
        matches = rank_teams({"react", "typescript"}, teams)
        # The design team needs React; the frontend team already has it.
        assert [m.user_id for m in matches] == ["team-design"]

    def test_team_with_full_coverage_is_excluded(self):
        teams = [("t1", "Full", {"react", "typescript"})]
        assert rank_teams({"react", "typescript"}, teams) == []

    def test_reasons_describe_what_the_caller_adds(self):
        teams = [("t1", "Designers", {"figma"})]
        match = rank_teams({"react", "typescript"}, teams)[0]
        assert match.complementary_skills == ["react", "typescript"]
        assert any("You add" in reason for reason in match.reasons)
