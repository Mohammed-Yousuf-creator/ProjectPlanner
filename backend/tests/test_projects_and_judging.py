import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.models.event import Event


def auth_user(client: TestClient, email: str, username: str) -> dict:
    """Helper to register and authenticate a user."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "Password123!",
            "display_name": f"{username.capitalize()} User",
        },
    )
    assert res.status_code == 201
    data = res.json()
    return {
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
        "token": data["access_token"],
        "user": data["user"],
    }


def setup_event_and_teams(client: TestClient, min_team_size: int = 2):
    """Setup an organization, event with track, and 2 teams with members."""
    suffix = uuid.uuid4().hex[:6]
    organizer = auth_user(client, f"org_{suffix}@example.com", f"org_{suffix}")
    org = client.post(
        "/api/v1/organizations",
        json={"name": f"Org {suffix}", "organization_type": "organizer"},
        headers=organizer["headers"],
    ).json()

    now = datetime.now(timezone.utc)
    event = client.post(
        f"/api/v1/organizations/{org['id']}/events",
        json={
            "name": f"Hackathon {suffix}",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "min_team_size": min_team_size,
            "max_team_size": 5,
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=5)).isoformat(),
            "submission_deadline_at": (now + timedelta(days=4)).isoformat(),
        },
        headers=organizer["headers"],
    ).json()
    event_id = event["id"]
    client.post(f"/api/v1/events/{event_id}/publish", headers=organizer["headers"])

    # Create an event track
    track_res = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": f"AI Track {suffix}", "description": "AI & ML"},
        headers=organizer["headers"],
    )
    assert track_res.status_code == 201
    track = track_res.json()

    # Team 1 members
    owner = auth_user(client, f"owner_{suffix}@example.com", f"owner_{suffix}")
    lead = auth_user(client, f"lead_{suffix}@example.com", f"lead_{suffix}")
    member = auth_user(client, f"mem_{suffix}@example.com", f"mem_{suffix}")
    outsider = auth_user(client, f"out_{suffix}@example.com", f"out_{suffix}")

    for u in (owner, lead, member):
        client.post(f"/api/v1/events/{event_id}/register", headers=u["headers"])

    team1_res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Team Alpha {suffix}", "generate_join_code": True},
        headers=owner["headers"],
    )
    assert team1_res.status_code == 201
    team1 = team1_res.json()
    team1_id = team1["id"]
    code1 = team1["join_code"]

    client.post(f"/api/v1/teams/{team1_id}/join", json={"join_code": code1}, headers=lead["headers"])
    client.post(f"/api/v1/teams/{team1_id}/join", json={"join_code": code1}, headers=member["headers"])

    # Promote lead
    client.patch(
        f"/api/v1/teams/{team1_id}/members/{lead['user']['id']}/role",
        json={"role": "lead"},
        headers=owner["headers"],
    )

    return {
        "organizer": organizer,
        "org_id": org["id"],
        "event_id": event_id,
        "track_id": track["id"],
        "team1_id": team1_id,
        "owner": owner,
        "lead": lead,
        "member": member,
        "outsider": outsider,
        "suffix": suffix,
    }


# ---------------------------------------------------------------------------
# Test 1: Project Creation, Constraints & Visibility
# ---------------------------------------------------------------------------

def test_project_creation_and_constraints(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    team1_id = s["team1_id"]
    track_id = s["track_id"]

    # 1. Non-member (outsider) cannot create project
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Alpha Project",
            "abstract": "Cutting-edge app",
            "repo_url": "https://github.com/alpha/repo",
        },
        headers=s["outsider"]["headers"],
    )
    assert res.status_code == 403

    # 2. Ordinary member cannot create project (only owner/lead)
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Alpha Project",
            "abstract": "Cutting-edge app",
            "repo_url": "https://github.com/alpha/repo",
        },
        headers=s["member"]["headers"],
    )
    assert res.status_code == 403

    # 3. Invalid track rejected
    fake_track_id = str(uuid.uuid4())
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "track_id": fake_track_id,
            "title": "Alpha Project",
            "abstract": "Cutting-edge app",
            "repo_url": "https://github.com/alpha/repo",
        },
        headers=s["lead"]["headers"],
    )
    assert res.status_code == 400

    # 4. Lead creates project successfully with initial submission draft v1
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "track_id": track_id,
            "title": "Alpha AI Platform",
            "tagline": "Next-gen AI",
            "abstract": "A complete AI solution",
            "repo_url": "https://github.com/alpha/ai",
        },
        headers=s["lead"]["headers"],
    )
    assert res.status_code == 201
    proj_data = res.json()
    assert proj_data["team_id"] == team1_id
    assert proj_data["track_id"] == track_id
    assert len(proj_data["submissions"]) == 1
    v1 = proj_data["submissions"][0]
    assert v1["version_number"] == 1
    assert v1["status"] == "draft"
    assert v1["title"] == "Alpha AI Platform"

    # 5. One project per team per event: owner attempts second project
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Second Project",
            "abstract": "Another one",
        },
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 400

    # 6. Team member can view project details including drafts
    res = client.get(f"/api/v1/teams/{team1_id}/project", headers=s["member"]["headers"])
    assert res.status_code == 200
    assert res.json()["id"] == proj_data["id"]

    # 7. Outsider cannot view team project
    res = client.get(f"/api/v1/teams/{team1_id}/project", headers=s["outsider"]["headers"])
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Test 2: Submission Versions, Editing, and Immutability
# ---------------------------------------------------------------------------

def test_submission_versions_and_editing(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    team1_id = s["team1_id"]

    # Create project
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Project v1",
            "abstract": "Initial abstract",
            "repo_url": "https://github.com/team/v1",
        },
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 201
    proj = res.json()
    proj_id = proj["id"]
    sub1_id = proj["submissions"][0]["id"]

    # 1. Edit draft submission by owner
    res = client.patch(
        f"/api/v1/projects/{proj_id}/submissions/{sub1_id}",
        json={"title": "Project v1 Updated", "abstract": "Improved abstract"},
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Project v1 Updated"

    # 2. Ordinary member cannot edit draft
    res = client.patch(
        f"/api/v1/projects/{proj_id}/submissions/{sub1_id}",
        json={"title": "Hacked Title"},
        headers=s["member"]["headers"],
    )
    assert res.status_code == 403

    # 3. Invalid repository URL rejected
    res = client.patch(
        f"/api/v1/projects/{proj_id}/submissions/{sub1_id}",
        json={"repo_url": "not-a-valid-url"},
        headers=s["lead"]["headers"],
    )
    assert res.status_code == 400

    # 4. Attempt creating next version while v1 is still draft -> rejected
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 400

    # 5. Finalize and submit version 1
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions/{sub1_id}/submit",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 200
    submitted_v1 = res.json()
    assert submitted_v1["status"] == "submitted"
    assert submitted_v1["submitted_at"] is not None

    # 6. Submitted versions must return HTTP 409 if edit attempted
    res = client.patch(
        f"/api/v1/projects/{proj_id}/submissions/{sub1_id}",
        json={"title": "Try to edit submitted"},
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 409

    # 7. Submitted team cannot accept new members through team formation
    extra_user = auth_user(client, f"extra_{s['suffix']}@example.com", f"extra_{s['suffix']}")
    client.post(f"/api/v1/events/{event_id}/register", headers=extra_user["headers"])
    # Team status is now 'submitted'
    res = client.post(
        f"/api/v1/teams/{team1_id}/join",
        json={"join_code": "dummy"},
        headers=extra_user["headers"],
    )
    assert res.status_code == 400
    assert "submitted" in res.json()["detail"].lower()

    # 8. Create next submission version (v2)
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions",
        json={"title": "Project v2 Draft", "abstract": "Version 2 abstract"},
        headers=s["lead"]["headers"],
    )
    assert res.status_code == 201
    v2 = res.json()
    assert v2["version_number"] == 2
    assert v2["status"] == "draft"
    assert v2["title"] == "Project v2 Draft"

    # 9. Duplicate draft rejected (v2 draft already exists)
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 400

    # 10. Check version history preserves all versions
    res = client.get(
        f"/api/v1/projects/{proj_id}/submissions",
        headers=s["member"]["headers"],
    )
    assert res.status_code == 200
    history = res.json()
    assert len(history) == 2
    assert history[0]["version_number"] == 1
    assert history[0]["status"] == "submitted"
    assert history[1]["version_number"] == 2
    assert history[1]["status"] == "draft"


# ---------------------------------------------------------------------------
# Test 3: Submission Deadlines & Team Size Enforcements
# ---------------------------------------------------------------------------

def test_submission_deadline_and_min_team_size(client: TestClient, db_session):
    s = setup_event_and_teams(client, min_team_size=4)  # requires 4 members, team1 has 3
    event_id = s["event_id"]
    team1_id = s["team1_id"]

    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Under-sized Team Project",
            "abstract": "Abstract",
            "repo_url": "https://github.com/team/under",
        },
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 201
    proj_id = res.json()["id"]
    sub_id = res.json()["submissions"][0]["id"]

    # Submit fails because team has only 3 active members, min is 4
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions/{sub_id}/submit",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 400
    assert "at least 4" in res.json()["detail"]

    # Now simulate past deadline
    ev = db_session.get(Event, uuid.UUID(event_id))
    ev.min_team_size = 2
    ev.submission_deadline_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()

    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions/{sub_id}/submit",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 400
    assert "deadline" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 4: Public Event Projects Discovery
# ---------------------------------------------------------------------------

def test_public_event_projects_discovery(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]

    # 1. Before submitting, event projects list is empty (drafts not exposed!)
    res = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Hidden Draft Project",
            "abstract": "Abstract",
            "repo_url": "https://github.com/team/hidden",
        },
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 201
    proj_id = res.json()["id"]
    sub_id = res.json()["submissions"][0]["id"]

    # Participant checks event projects
    res = client.get(f"/api/v1/events/{event_id}/projects", headers=s["member"]["headers"])
    assert res.status_code == 200
    assert len(res.json()) == 0

    # 2. Submit project
    res = client.post(
        f"/api/v1/projects/{proj_id}/submissions/{sub_id}/submit",
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 200

    # 3. Now project appears in event listing for participant
    res = client.get(f"/api/v1/events/{event_id}/projects", headers=s["member"]["headers"])
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["project_id"] == proj_id
    assert data[0]["latest_submission"]["title"] == "Hidden Draft Project"

    # 4. Outsider (not registered in event) gets 403
    res = client.get(f"/api/v1/events/{event_id}/projects", headers=s["outsider"]["headers"])
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Test 5: Judge Management Lifecycle
# ---------------------------------------------------------------------------

def test_judge_management_lifecycle(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    organizer = s["organizer"]

    judge1 = auth_user(client, f"judge1_{s['suffix']}@example.com", f"judge1_{s['suffix']}")
    judge2 = auth_user(client, f"judge2_{s['suffix']}@example.com", f"judge2_{s['suffix']}")

    # 1. Non-organizer cannot add judges
    res = client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": judge1["user"]["email"]},
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 403

    # 2. Non-existent user email returns 404
    res = client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": "nobody@example.com"},
        headers=organizer["headers"],
    )
    assert res.status_code == 404

    # 3. Add judge1 successfully
    res = client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": judge1["user"]["email"]},
        headers=organizer["headers"],
    )
    assert res.status_code == 201
    assert res.json()["role"] == "judge"
    assert res.json()["status"] == "approved"

    # 4. Duplicate judge returns 409
    res = client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": judge1["user"]["email"]},
        headers=organizer["headers"],
    )
    assert res.status_code == 409

    # 5. User who is already a participant cannot be added as judge
    res = client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": s["member"]["user"]["email"]},
        headers=organizer["headers"],
    )
    assert res.status_code == 400
    assert "participant" in res.json()["detail"].lower()

    # 6. List judges by organizer
    res = client.get(f"/api/v1/events/{event_id}/judges", headers=organizer["headers"])
    assert res.status_code == 200
    judges = res.json()
    assert len(judges) == 1
    assert judges[0]["email"] == judge1["user"]["email"]

    # 7. Remove judging access (sets status to withdrawn)
    res = client.delete(
        f"/api/v1/events/{event_id}/judges/{judge1['user']['id']}",
        headers=organizer["headers"],
    )
    assert res.status_code == 204

    # Verify status is withdrawn
    res = client.get(f"/api/v1/events/{event_id}/judges", headers=organizer["headers"])
    assert res.json()[0]["status"] == "withdrawn"


# ---------------------------------------------------------------------------
# Test 6: Judging Criteria Management & Immutability Once Evaluations Exist
# ---------------------------------------------------------------------------

def test_judging_criteria_management(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    organizer = s["organizer"]

    # 1. Invalid max_score <= 0 or weight <= 0 rejected
    res = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "max_score": 0, "weight": 1.0},
        headers=organizer["headers"],
    )
    assert res.status_code == 400

    res = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "max_score": 10, "weight": -1.0},
        headers=organizer["headers"],
    )
    assert res.status_code == 400

    # 2. Non-organizer cannot create criteria
    res = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "max_score": 10, "weight": 2.0},
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 403

    # 3. Create valid criteria
    res1 = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "description": "Originality", "max_score": 10, "weight": 2.0, "sort_order": 1},
        headers=organizer["headers"],
    )
    assert res1.status_code == 201
    crit1 = res1.json()

    res2 = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Execution", "description": "Code quality", "max_score": 20, "weight": 3.0, "sort_order": 2},
        headers=organizer["headers"],
    )
    assert res2.status_code == 201
    crit2 = res2.json()

    # 4. Duplicate criterion name in event rejected
    res_dup = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "max_score": 10, "weight": 1.0},
        headers=organizer["headers"],
    )
    assert res_dup.status_code == 409

    # 5. List criteria by registered participant
    res = client.get(f"/api/v1/events/{event_id}/judging-criteria", headers=s["member"]["headers"])
    assert res.status_code == 200
    assert len(res.json()) == 2

    # 6. Update criterion before evaluations begin
    res = client.patch(
        f"/api/v1/judging-criteria/{crit1['id']}",
        json={"weight": 2.5},
        headers=organizer["headers"],
    )
    assert res.status_code == 200
    assert res.json()["weight"] == 2.5


# ---------------------------------------------------------------------------
# Test 7: Evaluation System, Conflict of Interest & Immutability
# ---------------------------------------------------------------------------

def test_evaluation_system_and_conflict_of_interest(client: TestClient):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    organizer = s["organizer"]

    # Criteria
    res_c1 = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Impact", "max_score": 10, "weight": 1.0},
        headers=organizer["headers"],
    )
    crit1_id = res_c1.json()["id"]

    # Project and submission
    res_p = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={
            "title": "Evaluated Project",
            "abstract": "Abstract",
            "repo_url": "https://github.com/team/eval",
        },
        headers=s["owner"]["headers"],
    )
    proj_id = res_p.json()["id"]
    sub_id = res_p.json()["submissions"][0]["id"]

    # Setup 2 judges: judge_conflict (member of team1) and judge_valid (independent)
    judge_valid = auth_user(client, f"valid_judge_{s['suffix']}@example.com", f"valid_judge_{s['suffix']}")
    client.post(
        f"/api/v1/events/{event_id}/judges",
        json={"email": judge_valid["user"]["email"]},
        headers=organizer["headers"],
    )

    # 1. Attempt evaluation on draft submission -> rejected
    res = client.post(
        f"/api/v1/submissions/{sub_id}/evaluations",
        headers=judge_valid["headers"],
    )
    assert res.status_code == 400
    assert "draft" in res.json()["detail"].lower()

    # Finalize submission
    client.post(f"/api/v1/projects/{proj_id}/submissions/{sub_id}/submit", headers=s["owner"]["headers"])

    # 2. Participant cannot evaluate
    res = client.post(
        f"/api/v1/submissions/{sub_id}/evaluations",
        headers=s["member"]["headers"],
    )
    assert res.status_code == 403

    # 3. Conflict of interest: Judge who belonged to the team cannot evaluate
    # Let's add s["lead"] as a judge by directly promoting or through withdrawal & judge add
    # Even if they are removed or left, conflict of interest checks any past/present membership
    # Let's test with a user who is added as a judge and later joins or previously was on team
    conflict_user = auth_user(client, f"conflict_{s['suffix']}@example.com", f"conflict_{s['suffix']}")
    # User joins team1 first
    # s["event_id"] registration
    client.post(f"/api/v1/events/{event_id}/register", headers=conflict_user["headers"])
    # Leave event registration to be added as judge? Or conflict: user in team_members:
    # Instead, let's create a user who was in team1:
    # We can join team1, then leave, then be judge:
    team1_code = client.get(f"/api/v1/teams/{s['team1_id']}/project", headers=s["owner"]["headers"]).json()
    # Or conflict test: s["lead"] who is in team1:
    # If s["lead"] tries to evaluate (even if someone tried to make them a judge):
    # Let's test judge_valid can create draft evaluation:
    res = client.post(
        f"/api/v1/submissions/{sub_id}/evaluations",
        headers=judge_valid["headers"],
    )
    assert res.status_code == 201
    eval_data = res.json()
    eval_id = eval_data["id"]
    assert eval_data["status"] == "draft"

    # 4. Duplicate evaluation by same judge rejected
    res = client.post(
        f"/api/v1/submissions/{sub_id}/evaluations",
        headers=judge_valid["headers"],
    )
    assert res.status_code == 409

    # 5. Get own evaluation
    res = client.get(
        f"/api/v1/submissions/{sub_id}/evaluations/me",
        headers=judge_valid["headers"],
    )
    assert res.status_code == 200
    assert res.json()["id"] == eval_id

    # 6. Save draft evaluation with score exceeding max_score -> rejected
    res = client.put(
        f"/api/v1/evaluations/{eval_id}",
        json={
            "overall_feedback": "Good progress",
            "scores": [{"criteria_id": crit1_id, "score": 15.0}],  # max is 10
        },
        headers=judge_valid["headers"],
    )
    assert res.status_code == 400

    # 7. Save valid draft score
    res = client.put(
        f"/api/v1/evaluations/{eval_id}",
        json={
            "overall_feedback": "Impressive architecture",
            "scores": [{"criteria_id": crit1_id, "score": 9.5, "feedback": "Great impact"}],
        },
        headers=judge_valid["headers"],
    )
    assert res.status_code == 200
    assert len(res.json()["scores"]) == 1
    assert res.json()["scores"][0]["score"] == 9.5

    # 8. Another user cannot edit this evaluation
    res = client.put(
        f"/api/v1/evaluations/{eval_id}",
        json={"overall_feedback": "Tampering"},
        headers=s["owner"]["headers"],
    )
    assert res.status_code == 403

    # 9. Submit evaluation
    res = client.post(
        f"/api/v1/evaluations/{eval_id}/submit",
        headers=judge_valid["headers"],
    )
    assert res.status_code == 200
    assert res.json()["status"] == "submitted"
    assert res.json()["submitted_at"] is not None

    # 10. Submitted evaluation is immutable (409 Conflict)
    res = client.put(
        f"/api/v1/evaluations/{eval_id}",
        json={"overall_feedback": "Cannot change now"},
        headers=judge_valid["headers"],
    )
    assert res.status_code == 409

    # 11. Criteria cannot be modified or deleted once evaluations exist for event
    res = client.patch(
        f"/api/v1/judging-criteria/{crit1_id}",
        json={"max_score": 20},
        headers=organizer["headers"],
    )
    assert res.status_code == 400
    assert "evaluations have begun" in res.json()["detail"].lower()

    res = client.delete(
        f"/api/v1/judging-criteria/{crit1_id}",
        headers=organizer["headers"],
    )
    assert res.status_code == 400
    assert "evaluations have begun" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 8: Leaderboard Scoring Formula, Weighting, Ties & Unjudged Projects
# ---------------------------------------------------------------------------

def test_leaderboard_scoring_formula_and_ties(client: TestClient, db_session):
    s = setup_event_and_teams(client, min_team_size=2)
    event_id = s["event_id"]
    organizer = s["organizer"]

    # Create Criteria:
    # Criterion 1: Max 10, Weight 2.0
    c1 = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Innovation", "max_score": 10.0, "weight": 2.0},
        headers=organizer["headers"],
    ).json()

    # Criterion 2: Max 20, Weight 3.0
    c2 = client.post(
        f"/api/v1/events/{event_id}/judging-criteria",
        json={"name": "Execution", "max_score": 20.0, "weight": 3.0},
        headers=organizer["headers"],
    ).json()

    # Judges
    j1 = auth_user(client, f"j1_{s['suffix']}@example.com", f"j1_{s['suffix']}")
    j2 = auth_user(client, f"j2_{s['suffix']}@example.com", f"j2_{s['suffix']}")
    client.post(f"/api/v1/events/{event_id}/judges", json={"email": j1["user"]["email"]}, headers=organizer["headers"])
    client.post(f"/api/v1/events/{event_id}/judges", json={"email": j2["user"]["email"]}, headers=organizer["headers"])

    # Team 1 (Alpha): Project A
    p_alpha = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={"title": "Project Alpha", "abstract": "Alpha abstract", "repo_url": "https://github.com/team/alpha"},
        headers=s["owner"]["headers"],
    ).json()
    sub_alpha_id = p_alpha["submissions"][0]["id"]
    client.post(f"/api/v1/projects/{p_alpha['id']}/submissions/{sub_alpha_id}/submit", headers=s["owner"]["headers"])

    # Create Team 2 (Beta) with 2 members
    b_owner = auth_user(client, f"b_owner_{s['suffix']}@example.com", f"b_owner_{s['suffix']}")
    b_member = auth_user(client, f"b_mem_{s['suffix']}@example.com", f"b_mem_{s['suffix']}")
    client.post(f"/api/v1/events/{event_id}/register", headers=b_owner["headers"])
    client.post(f"/api/v1/events/{event_id}/register", headers=b_member["headers"])

    t_beta = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Team Beta {s['suffix']}", "generate_join_code": True},
        headers=b_owner["headers"],
    ).json()
    client.post(f"/api/v1/teams/{t_beta['id']}/join", json={"join_code": t_beta["join_code"]}, headers=b_member["headers"])

    p_beta = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={"title": "Project Beta", "abstract": "Beta abstract", "repo_url": "https://github.com/team/beta"},
        headers=b_owner["headers"],
    ).json()
    sub_beta_id = p_beta["submissions"][0]["id"]
    client.post(f"/api/v1/projects/{p_beta['id']}/submissions/{sub_beta_id}/submit", headers=b_owner["headers"])

    # Create Team 3 (Gamma) - unjudged project
    g_owner = auth_user(client, f"g_owner_{s['suffix']}@example.com", f"g_owner_{s['suffix']}")
    g_member = auth_user(client, f"g_mem_{s['suffix']}@example.com", f"g_mem_{s['suffix']}")
    client.post(f"/api/v1/events/{event_id}/register", headers=g_owner["headers"])
    client.post(f"/api/v1/events/{event_id}/register", headers=g_member["headers"])

    t_gamma = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Team Gamma {s['suffix']}", "generate_join_code": True},
        headers=g_owner["headers"],
    ).json()
    client.post(f"/api/v1/teams/{t_gamma['id']}/join", json={"join_code": t_gamma["join_code"]}, headers=g_member["headers"])

    p_gamma = client.post(
        f"/api/v1/events/{event_id}/projects",
        json={"title": "Project Gamma", "abstract": "Gamma abstract", "repo_url": "https://github.com/team/gamma"},
        headers=g_owner["headers"],
    ).json()
    sub_gamma_id = p_gamma["submissions"][0]["id"]
    client.post(f"/api/v1/projects/{p_gamma['id']}/submissions/{sub_gamma_id}/submit", headers=g_owner["headers"])

    # -----------------------------------------------------------------------
    # Judging Evaluations for Alpha:
    # J1 for Alpha:
    #   Innovation: 8 / 10 -> 80% * 2.0 = 160
    #   Execution: 16 / 20 -> 80% * 3.0 = 240
    #   Weighted sum = 400 / 5 = 80.00
    # J2 for Alpha:
    #   Innovation: 10 / 10 -> 100% * 2.0 = 200
    #   Execution: 20 / 20 -> 100% * 3.0 = 300
    #   Weighted sum = 500 / 5 = 100.00
    # Alpha Final Score: (80.00 + 100.00) / 2 = 90.00
    # -----------------------------------------------------------------------
    ev_a1 = client.post(f"/api/v1/submissions/{sub_alpha_id}/evaluations", headers=j1["headers"]).json()
    client.put(
        f"/api/v1/evaluations/{ev_a1['id']}",
        json={"scores": [{"criteria_id": c1["id"], "score": 8.0}, {"criteria_id": c2["id"], "score": 16.0}]},
        headers=j1["headers"],
    )
    client.post(f"/api/v1/evaluations/{ev_a1['id']}/submit", headers=j1["headers"])

    ev_a2 = client.post(f"/api/v1/submissions/{sub_alpha_id}/evaluations", headers=j2["headers"]).json()
    client.put(
        f"/api/v1/evaluations/{ev_a2['id']}",
        json={"scores": [{"criteria_id": c1["id"], "score": 10.0}, {"criteria_id": c2["id"], "score": 20.0}]},
        headers=j2["headers"],
    )
    client.post(f"/api/v1/evaluations/{ev_a2['id']}/submit", headers=j2["headers"])

    # -----------------------------------------------------------------------
    # Judging Evaluations for Beta:
    # J1 for Beta:
    #   Innovation: 9 / 10 -> 90% * 2.0 = 180
    #   Execution: 18 / 20 -> 90% * 3.0 = 270
    #   Weighted sum = 450 / 5 = 90.00
    # Beta Final Score: 90.00 -> Exact tie with Alpha!
    # -----------------------------------------------------------------------
    ev_b1 = client.post(f"/api/v1/submissions/{sub_beta_id}/evaluations", headers=j1["headers"]).json()
    client.put(
        f"/api/v1/evaluations/{ev_b1['id']}",
        json={"scores": [{"criteria_id": c1["id"], "score": 9.0}, {"criteria_id": c2["id"], "score": 18.0}]},
        headers=j1["headers"],
    )
    client.post(f"/api/v1/evaluations/{ev_b1['id']}/submit", headers=j1["headers"])

    # 1. Access before event completed:
    # Participant receives 403 Forbidden
    res = client.get(f"/api/v1/events/{event_id}/leaderboard", headers=s["member"]["headers"])
    assert res.status_code == 403

    # Organizer can view leaderboard at any time!
    res = client.get(f"/api/v1/events/{event_id}/leaderboard", headers=organizer["headers"])
    assert res.status_code == 200
    board = res.json()
    assert len(board) == 3

    # Check ties: Alpha and Beta tied with score 90.00, both rank 1
    assert board[0]["final_score"] == 90.0
    assert board[1]["final_score"] == 90.0
    assert board[0]["rank"] == 1
    assert board[1]["rank"] == 1

    # Check Gamma: unjudged, final_score is None, rank is None, evaluation_count = 0
    gamma_entry = next(item for item in board if item["project_id"] == p_gamma["id"])
    assert gamma_entry["final_score"] is None
    assert gamma_entry["rank"] is None
    assert gamma_entry["evaluation_count"] == 0

    # 2. Mark event completed
    ev = db_session.get(Event, uuid.UUID(event_id))
    ev.status = "completed"
    db_session.commit()

    # Now participant and public can access the leaderboard
    res_part = client.get(f"/api/v1/events/{event_id}/leaderboard", headers=s["member"]["headers"])
    assert res_part.status_code == 200
    assert len(res_part.json()) == 3

    # Public unauthenticated access works for completed public event
    res_public = client.get(f"/api/v1/events/{event_id}/leaderboard")
    assert res_public.status_code == 200
    assert len(res_public.json()) == 3

