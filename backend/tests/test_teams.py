import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.models.team import Team, TeamInvitation, TeamMember


def auth_user(client: TestClient, email: str, username: str) -> dict:
    """Helper to register a user and return authorization header and user data."""
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
        "user": data["user"],
    }


def create_published_event(
    client: TestClient, owner_headers: dict, **event_overrides
) -> str:
    """Helper to create an organization and a published event."""
    unique_suffix = uuid.uuid4().hex[:8]
    org = client.post(
        "/api/v1/organizations",
        json={
            "name": f"Event Host Org {unique_suffix}",
            "organization_type": "organizer",
        },
        headers=owner_headers,
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    event_data = {
        "name": f"Hackathon {unique_suffix}",
        "event_type": "hackathon",
        "format": "online",
        "timezone": "UTC",
        "visibility": "public",
        "min_team_size": 2,
        "max_team_size": 4,
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=7)).isoformat(),
    }
    event_data.update(event_overrides)

    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json=event_data,
        headers=owner_headers,
    ).json()
    event_id = event["id"]

    pub_res = client.post(f"/api/v1/events/{event_id}/publish", headers=owner_headers)
    assert pub_res.status_code == 200
    return event_id


def register_participant(client: TestClient, event_id: str, participant_headers: dict) -> dict:
    """Helper to register a participant for an event."""
    res = client.post(f"/api/v1/events/{event_id}/register", headers=participant_headers)
    assert res.status_code == 201
    return res.json()


# -----------------------------------------------------------------------------
# 1. Team Creation Tests
# -----------------------------------------------------------------------------


def test_team_creation_success_and_owner_assignment(client: TestClient):
    """Test successful team creation, owner assignment, join code generation, and lifecycle status."""
    organizer = auth_user(client, "org_creator@example.com", "org_creator")
    event_id = create_published_event(client, organizer["headers"], min_team_size=2, max_team_size=4)

    p1 = auth_user(client, "p1@example.com", "participant1")
    register_participant(client, event_id, p1["headers"])

    # Create team with join code
    res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={
            "name": "Alpha Squad",
            "description": "Building the future of gaming",
            "generate_join_code": True,
        },
        headers=p1["headers"],
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Alpha Squad"
    assert data["description"] == "Building the future of gaming"
    assert data["created_by_user_id"] == p1["user"]["id"]
    assert data["status"] == "forming"  # 1 < min_team_size (2)
    assert data["join_code"] is not None
    assert "join_code_hash" not in data
    team_id = data["id"]

    # Verify roster shows creator as owner
    roster_res = client.get(f"/api/v1/teams/{team_id}/members", headers=p1["headers"])
    assert roster_res.status_code == 200
    roster = roster_res.json()
    assert len(roster) == 1
    assert roster[0]["user_id"] == p1["user"]["id"]
    assert roster[0]["role"] == "owner"
    assert roster[0]["status"] == "active"


def test_team_creation_with_min_size_one_becomes_active(client: TestClient):
    """When min_team_size is 1, a newly created team is immediately active."""
    organizer = auth_user(client, "org_solo@example.com", "org_solo")
    event_id = create_published_event(client, organizer["headers"], min_team_size=1, max_team_size=3)

    p = auth_user(client, "solo_dev@example.com", "solodev")
    register_participant(client, event_id, p["headers"])

    res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Solo Hackers"},
        headers=p["headers"],
    )
    assert res.status_code == 201
    assert res.json()["status"] == "active"


def test_team_creation_eligibility_and_isolation(client: TestClient):
    """Unregistered, waitlisted, or withdrawn users cannot create teams."""
    organizer = auth_user(client, "org_elig@example.com", "org_elig")
    event_id = create_published_event(client, organizer["headers"])

    p_unreg = auth_user(client, "unreg@example.com", "unreg")
    p_wait = auth_user(client, "wait@example.com", "wait")
    p_withdrawn = auth_user(client, "withdrawn@example.com", "withdrawn")

    # 1. Unregistered user
    res1 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Unreg Team"},
        headers=p_unreg["headers"],
    )
    assert res1.status_code == 403

    # 2. Waitlisted participant
    register_participant(client, event_id, p_wait["headers"])
    wait_update = client.patch(
        f"/api/v1/events/{event_id}/participants/{p_wait['user']['id']}",
        json={"status": "waitlisted"},
        headers=organizer["headers"],
    )
    assert wait_update.status_code == 200

    res2 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Waitlisted Team"},
        headers=p_wait["headers"],
    )
    assert res2.status_code == 403

    # 3. Withdrawn participant
    register_participant(client, event_id, p_withdrawn["headers"])
    client.post(f"/api/v1/events/{event_id}/withdraw", headers=p_withdrawn["headers"])

    res3 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Withdrawn Team"},
        headers=p_withdrawn["headers"],
    )
    assert res3.status_code == 403


def test_duplicate_team_name_and_single_team_per_event(client: TestClient):
    """Prevent duplicate team names within the event and enforce one active team per participant."""
    organizer = auth_user(client, "org_dup@example.com", "org_dup")
    event_id = create_published_event(client, organizer["headers"])

    p1 = auth_user(client, "team_p1@example.com", "teamp1")
    p2 = auth_user(client, "team_p2@example.com", "teamp2")
    register_participant(client, event_id, p1["headers"])
    register_participant(client, event_id, p2["headers"])

    # P1 creates first team
    res1 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Binary Beasts"},
        headers=p1["headers"],
    )
    assert res1.status_code == 201

    # P1 tries to create a second team in the same event
    res2 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Second Team"},
        headers=p1["headers"],
    )
    assert res2.status_code == 400
    assert "already belongs to an active team" in res2.json()["detail"].lower()

    # P2 tries to create team with duplicate name (case-insensitive)
    res3 = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "binary beasts"},
        headers=p2["headers"],
    )
    assert res3.status_code == 409
    assert "already exists" in res3.json()["detail"].lower()

    # P1 CAN create a team with the same name in a DIFFERENT event
    event_id_2 = create_published_event(client, organizer["headers"])
    register_participant(client, event_id_2, p1["headers"])
    res4 = client.post(
        f"/api/v1/events/{event_id_2}/teams",
        json={"name": "Binary Beasts"},
        headers=p1["headers"],
    )
    assert res4.status_code == 201


# -----------------------------------------------------------------------------
# 2. Team Discovery & Details Tests
# -----------------------------------------------------------------------------


def test_team_discovery_and_visibility(client: TestClient):
    """Test team discovery endpoint excludes disbanded teams, calculates capacity, and supports pagination."""
    organizer = auth_user(client, "org_disc@example.com", "org_disc")
    event_id = create_published_event(client, organizer["headers"], max_team_size=4)

    p1 = auth_user(client, "p_disc1@example.com", "pdisc1")
    p2 = auth_user(client, "p_disc2@example.com", "pdisc2")
    register_participant(client, event_id, p1["headers"])
    register_participant(client, event_id, p2["headers"])

    # Create two teams
    t1 = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Team 1"}, headers=p1["headers"]).json()
    t2 = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Team 2"}, headers=p2["headers"]).json()

    # Discovery by participant
    disc_res = client.get(f"/api/v1/events/{event_id}/teams", headers=p1["headers"])
    assert disc_res.status_code == 200
    teams = disc_res.json()
    assert len(teams) == 2
    for item in teams:
        assert item["member_count"] == 1
        assert item["max_team_size"] == 4
        assert item["available_slots"] == 3
        assert "join_code" not in item
        assert "join_code_hash" not in item

    # Non-participant is forbidden from viewing event teams
    outsider = auth_user(client, "outsider@example.com", "outsider")
    forbidden_res = client.get(f"/api/v1/events/{event_id}/teams", headers=outsider["headers"])
    assert forbidden_res.status_code == 403

    # Disband Team 2 and ensure it is excluded from discovery
    disband_res = client.post(f"/api/v1/teams/{t2['id']}/disband", headers=p2["headers"])
    assert disband_res.status_code == 200

    disc_after = client.get(f"/api/v1/events/{event_id}/teams", headers=p1["headers"]).json()
    assert len(disc_after) == 1
    assert disc_after[0]["id"] == t1["id"]


def test_team_detail_permissions_and_roster_privacy(client: TestClient):
    """Members view the full roster; non-member participants only see public overview."""
    organizer = auth_user(client, "org_detail@example.com", "org_detail")
    event_id = create_published_event(client, organizer["headers"])

    owner = auth_user(client, "owner_dt@example.com", "ownerdt")
    other_participant = auth_user(client, "other_dt@example.com", "otherdt")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, other_participant["headers"])

    t = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Roster Test"}, headers=owner["headers"]).json()
    team_id = t["id"]

    # 1. Owner views details -> receives members roster
    owner_view = client.get(f"/api/v1/teams/{team_id}", headers=owner["headers"])
    assert owner_view.status_code == 200
    owner_data = owner_view.json()
    assert owner_data["members"] is not None
    assert len(owner_data["members"]) == 1
    assert owner_data["members"][0]["user_id"] == owner["user"]["id"]

    # 2. Other participant views details -> members is None (roster protected)
    other_view = client.get(f"/api/v1/teams/{team_id}", headers=other_participant["headers"])
    assert other_view.status_code == 200
    other_data = other_view.json()
    assert other_data["name"] == "Roster Test"
    assert other_data["members"] is None
    assert other_data["member_count"] == 1

    # 3. Non-member roster endpoint access is rejected
    roster_forbidden = client.get(f"/api/v1/teams/{team_id}/members", headers=other_participant["headers"])
    assert roster_forbidden.status_code == 403


# -----------------------------------------------------------------------------
# 3. Joining via Join Code Tests
# -----------------------------------------------------------------------------


def test_join_team_with_code_lifecycle(client: TestClient):
    """Join with code, verify capacity transitions, reject incorrect codes, and enforce single team."""
    organizer = auth_user(client, "org_join@example.com", "org_join")
    event_id = create_published_event(client, organizer["headers"], min_team_size=2, max_team_size=2)

    p1 = auth_user(client, "join_p1@example.com", "joinp1")
    p2 = auth_user(client, "join_p2@example.com", "joinp2")
    p3 = auth_user(client, "join_p3@example.com", "joinp3")
    register_participant(client, event_id, p1["headers"])
    register_participant(client, event_id, p2["headers"])
    register_participant(client, event_id, p3["headers"])

    team_res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": "Code Team", "generate_join_code": True},
        headers=p1["headers"],
    )
    team = team_res.json()
    team_id = team["id"]
    join_code = team["join_code"]
    assert team["status"] == "forming"

    # 1. Reject invalid code
    bad_code_res = client.post(
        f"/api/v1/teams/{team_id}/join",
        json={"join_code": "INVALID99"},
        headers=p2["headers"],
    )
    assert bad_code_res.status_code == 400

    # 2. Successful join with valid code
    join_res = client.post(
        f"/api/v1/teams/{team_id}/join",
        json={"join_code": join_code},
        headers=p2["headers"],
    )
    assert join_res.status_code == 200
    assert join_res.json()["user_id"] == p2["user"]["id"]
    assert join_res.json()["role"] == "member"
    assert join_res.json()["status"] == "active"

    # Team reached min_team_size (2), so status should now be 'active'
    detail_res = client.get(f"/api/v1/teams/{team_id}", headers=p1["headers"])
    assert detail_res.json()["status"] == "active"
    assert detail_res.json()["member_count"] == 2
    assert detail_res.json()["available_slots"] == 0

    # 3. Team is full (max_team_size == 2), p3 join is rejected
    full_res = client.post(
        f"/api/v1/teams/{team_id}/join",
        json={"join_code": join_code},
        headers=p3["headers"],
    )
    assert full_res.status_code == 400
    assert "maximum" in full_res.json()["detail"].lower()

    # 4. User cannot join two active teams in the same event
    # Create another event team by p3
    t3 = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Team 3"}, headers=p3["headers"]).json()
    dup_join = client.post(f"/api/v1/teams/{t3['id']}/join", json={"join_code": t3["join_code"]}, headers=p2["headers"])
    assert dup_join.status_code == 400
    assert "already belongs to an active team" in dup_join.json()["detail"].lower()


# -----------------------------------------------------------------------------
# 4. Team Invitations Tests
# -----------------------------------------------------------------------------


def test_team_invitations_and_response_lifecycle(client: TestClient):
    """Test owner and lead invite permissions, in-app listing, accept, and reject."""
    organizer = auth_user(client, "org_inv@example.com", "org_inv")
    event_id = create_published_event(client, organizer["headers"], max_team_size=4)

    owner = auth_user(client, "inv_owner@example.com", "invowner")
    invitee1 = auth_user(client, "inv_user1@example.com", "invuser1")
    invitee2 = auth_user(client, "inv_user2@example.com", "invuser2")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, invitee1["headers"])
    register_participant(client, event_id, invitee2["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Invite FC"}, headers=owner["headers"]).json()
    team_id = team["id"]

    # 1. Owner invites invitee1
    inv_res1 = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee1["user"]["email"]},
        headers=owner["headers"],
    )
    assert inv_res1.status_code == 201
    inv1 = inv_res1.json()
    assert inv1["status"] == "pending"

    # 2. Duplicate pending invitation rejected
    dup_inv = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee1["user"]["email"]},
        headers=owner["headers"],
    )
    assert dup_inv.status_code == 409

    # 3. Invitee 1 checks their pending invitations
    my_invs = client.get("/api/v1/participants/me/team-invitations", headers=invitee1["headers"])
    assert my_invs.status_code == 200
    inv_list = my_invs.json()
    assert len(inv_list) == 1
    assert inv_list[0]["id"] == inv1["id"]
    assert inv_list[0]["team_name"] == "Invite FC"
    assert inv_list[0]["inviter"]["username"] == "invowner"

    # 4. Another participant cannot accept invitee1's invitation
    hijack_res = client.post(
        f"/api/v1/team-invitations/{inv1['id']}/accept",
        headers=invitee2["headers"],
    )
    assert hijack_res.status_code == 403

    # 5. Invitee 1 accepts invitation -> becomes member
    accept_res = client.post(
        f"/api/v1/team-invitations/{inv1['id']}/accept",
        headers=invitee1["headers"],
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["user_id"] == invitee1["user"]["id"]
    assert accept_res.json()["role"] == "member"

    # 6. Ordinary member cannot invite
    member_inv = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee2["user"]["email"]},
        headers=invitee1["headers"],
    )
    assert member_inv.status_code == 403

    # 7. Owner promotes invitee1 to lead -> now lead CAN invite
    promote_res = client.patch(
        f"/api/v1/teams/{team_id}/members/{invitee1['user']['id']}/role",
        json={"role": "lead"},
        headers=owner["headers"],
    )
    assert promote_res.status_code == 200
    assert promote_res.json()["role"] == "lead"

    lead_inv = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee2["user"]["email"]},
        headers=invitee1["headers"],
    )
    assert lead_inv.status_code == 201
    inv2 = lead_inv.json()

    # 8. Invitee 2 rejects invitation
    reject_res = client.post(
        f"/api/v1/team-invitations/{inv2['id']}/reject",
        headers=invitee2["headers"],
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"

    # Verify invitee 2 is not in team roster
    roster = client.get(f"/api/v1/teams/{team_id}/members", headers=owner["headers"]).json()
    member_user_ids = [m["user_id"] for m in roster]
    assert invitee2["user"]["id"] not in member_user_ids


# -----------------------------------------------------------------------------
# 5. Membership Management & Role Tests
# -----------------------------------------------------------------------------


def test_leave_and_rejoin_reactivation(client: TestClient):
    """Leaving team updates status to 'left', recalculates team lifecycle, and rejoining reactivates."""
    organizer = auth_user(client, "org_leave@example.com", "org_leave")
    event_id = create_published_event(client, organizer["headers"], min_team_size=2, max_team_size=4)

    owner = auth_user(client, "lv_owner@example.com", "lvowner")
    member = auth_user(client, "lv_member@example.com", "lvmember")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, member["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Leave Team"}, headers=owner["headers"]).json()
    team_id = team["id"]
    join_code = team["join_code"]

    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=member["headers"])
    assert client.get(f"/api/v1/teams/{team_id}", headers=owner["headers"]).json()["status"] == "active"

    # Owner cannot leave without transferring ownership
    owner_leave = client.post(f"/api/v1/teams/{team_id}/leave", headers=owner["headers"])
    assert owner_leave.status_code == 400
    assert "owner cannot leave" in owner_leave.json()["detail"].lower()

    # Member leaves
    member_leave = client.post(f"/api/v1/teams/{team_id}/leave", headers=member["headers"])
    assert member_leave.status_code == 200
    assert member_leave.json()["status"] == "left"
    assert member_leave.json()["left_at"] is not None

    # Team active member count is 1 < min_team_size (2), so status drops to 'forming'
    detail = client.get(f"/api/v1/teams/{team_id}", headers=owner["headers"]).json()
    assert detail["status"] == "forming"
    assert detail["member_count"] == 1

    # Member rejoins using join code -> record is reactivated rather than creating duplicate
    rejoin_res = client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=member["headers"])
    assert rejoin_res.status_code == 200
    assert rejoin_res.json()["status"] == "active"
    assert rejoin_res.json()["left_at"] is None

    # Check database records count: exactly 2 members total for this team
    roster = client.get(f"/api/v1/teams/{team_id}/members", headers=owner["headers"]).json()
    assert len(roster) == 2


def test_member_removal_by_owner(client: TestClient):
    """Owner can remove a member; non-owner cannot remove members; owner cannot remove themselves."""
    organizer = auth_user(client, "org_rem@example.com", "org_rem")
    event_id = create_published_event(client, organizer["headers"])

    owner = auth_user(client, "rm_owner@example.com", "rmowner")
    m1 = auth_user(client, "rm_m1@example.com", "rmm1")
    m2 = auth_user(client, "rm_m2@example.com", "rmm2")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, m1["headers"])
    register_participant(client, event_id, m2["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Kick Team"}, headers=owner["headers"]).json()
    team_id = team["id"]
    join_code = team["join_code"]

    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=m1["headers"])
    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=m2["headers"])

    # Non-owner tries to remove member
    unauth_rm = client.delete(f"/api/v1/teams/{team_id}/members/{m2['user']['id']}", headers=m1["headers"])
    assert unauth_rm.status_code == 403

    # Owner tries to remove self
    self_rm = client.delete(f"/api/v1/teams/{team_id}/members/{owner['user']['id']}", headers=owner["headers"])
    assert self_rm.status_code == 400

    # Owner removes m1
    rm_res = client.delete(f"/api/v1/teams/{team_id}/members/{m1['user']['id']}", headers=owner["headers"])
    assert rm_res.status_code == 200
    assert rm_res.json()["status"] == "left"

    # Roster only contains owner and m2
    roster = client.get(f"/api/v1/teams/{team_id}/members", headers=owner["headers"]).json()
    active_ids = [m["user_id"] for m in roster]
    assert m1["user"]["id"] not in active_ids
    assert len(active_ids) == 2


def test_transfer_ownership_and_disband(client: TestClient):
    """Test ownership transfer, single owner guarantee, and disbanding lifecycle."""
    organizer = auth_user(client, "org_tf@example.com", "org_tf")
    event_id = create_published_event(client, organizer["headers"])

    owner1 = auth_user(client, "tf_owner1@example.com", "tfowner1")
    member = auth_user(client, "tf_member@example.com", "tfmember")
    register_participant(client, event_id, owner1["headers"])
    register_participant(client, event_id, member["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Transfer Disband"}, headers=owner1["headers"]).json()
    team_id = team["id"]
    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": team["join_code"]}, headers=member["headers"])

    # 1. Non-owner cannot transfer ownership
    unauth_tf = client.post(
        f"/api/v1/teams/{team_id}/transfer-ownership",
        json={"new_owner_user_id": member["user"]["id"]},
        headers=member["headers"],
    )
    assert unauth_tf.status_code == 403

    # 2. Owner transfers ownership to member
    tf_res = client.post(
        f"/api/v1/teams/{team_id}/transfer-ownership",
        json={"new_owner_user_id": member["user"]["id"]},
        headers=owner1["headers"],
    )
    assert tf_res.status_code == 200
    assert tf_res.json()["role"] == "owner"

    # Verify roster: member is owner, owner1 is member
    roster = client.get(f"/api/v1/teams/{team_id}/members", headers=member["headers"]).json()
    for m in roster:
        if m["user_id"] == member["user"]["id"]:
            assert m["role"] == "owner"
        elif m["user_id"] == owner1["user"]["id"]:
            assert m["role"] == "member"

    # Now owner1 (former owner) can leave the team
    leave_res = client.post(f"/api/v1/teams/{team_id}/leave", headers=owner1["headers"])
    assert leave_res.status_code == 200

    # 3. Disband team
    # Former owner cannot disband
    disband_unauth = client.post(f"/api/v1/teams/{team_id}/disband", headers=owner1["headers"])
    assert disband_unauth.status_code == 403

    # New owner disbands team
    disband_res = client.post(f"/api/v1/teams/{team_id}/disband", headers=member["headers"])
    assert disband_res.status_code == 200
    assert disband_res.json()["status"] == "disbanded"

    # Cannot join disbanded team
    rejoin_disbanded = client.post(
        f"/api/v1/teams/{team_id}/join",
        json={"join_code": team["join_code"]},
        headers=owner1["headers"],
    )
    assert rejoin_disbanded.status_code == 400
    assert "disbanded" in rejoin_disbanded.json()["detail"].lower()


def test_joining_edge_cases_and_multi_event_support(client: TestClient):
    """Test non-participant and waitlisted participant join rejections, and multi-event team membership."""
    organizer = auth_user(client, "org_multi@example.com", "orgmulti")
    event_1 = create_published_event(client, organizer["headers"], max_team_size=3)
    event_2 = create_published_event(client, organizer["headers"], max_team_size=3)

    p1 = auth_user(client, "multi_p1@example.com", "multip1")
    p2 = auth_user(client, "multi_p2@example.com", "multip2")
    non_participant = auth_user(client, "non_p@example.com", "nonp")

    register_participant(client, event_1, p1["headers"])
    register_participant(client, event_1, p2["headers"])
    register_participant(client, event_2, p2["headers"])

    # Create team in event 1
    t1 = client.post(f"/api/v1/events/{event_1}/teams", json={"name": "Event 1 Team"}, headers=p1["headers"]).json()

    # 1. Non-participant cannot join
    non_part_join = client.post(
        f"/api/v1/teams/{t1['id']}/join",
        json={"join_code": t1["join_code"]},
        headers=non_participant["headers"],
    )
    assert non_part_join.status_code == 403

    # 2. Waitlist p2 in event 1 -> cannot join
    client.patch(
        f"/api/v1/events/{event_1}/participants/{p2['user']['id']}",
        json={"status": "waitlisted"},
        headers=organizer["headers"],
    )
    waitlisted_join = client.post(
        f"/api/v1/teams/{t1['id']}/join",
        json={"join_code": t1["join_code"]},
        headers=p2["headers"],
    )
    assert waitlisted_join.status_code == 403

    # 3. P2 CAN create/join a team in event 2 (different event!)
    t2 = client.post(f"/api/v1/events/{event_2}/teams", json={"name": "Event 2 Team"}, headers=p2["headers"])
    assert t2.status_code == 201


def test_invitation_expiry_and_capacity_recheck(client: TestClient, db_session):
    """Test expired invitations cannot be accepted, and capacity is re-verified upon acceptance."""
    organizer = auth_user(client, "org_exp@example.com", "orgexp")
    event_id = create_published_event(client, organizer["headers"], max_team_size=2)

    owner = auth_user(client, "exp_owner@example.com", "expowner")
    invitee = auth_user(client, "exp_invitee@example.com", "expinvitee")
    filler = auth_user(client, "exp_filler@example.com", "expfiller")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, invitee["headers"])
    register_participant(client, event_id, filler["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "Cap Team"}, headers=owner["headers"]).json()
    team_id = team["id"]
    join_code = team["join_code"]

    # 1. Create invitation
    inv_res = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee["user"]["email"]},
        headers=owner["headers"],
    )
    assert inv_res.status_code == 201
    inv_id = inv_res.json()["id"]

    # Backdate expires_at in DB
    inv_db = db_session.query(TeamInvitation).filter(TeamInvitation.id == uuid.UUID(inv_id)).first()
    inv_db.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()

    # Attempt to accept expired invitation
    exp_accept = client.post(f"/api/v1/team-invitations/{inv_id}/accept", headers=invitee["headers"])
    assert exp_accept.status_code == 400
    assert "expired" in exp_accept.json()["detail"].lower()

    # 2. Test capacity recheck on accept:
    # Issue a fresh valid invitation
    inv_res2 = client.post(
        f"/api/v1/teams/{team_id}/invitations",
        json={"invitee_email": invitee["user"]["email"]},
        headers=owner["headers"],
    )
    assert inv_res2.status_code == 201
    inv2_id = inv_res2.json()["id"]

    # Team capacity is 2. Currently size is 1 (owner). Filler joins, so size becomes 2 (full).
    filler_join = client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=filler["headers"])
    assert filler_join.status_code == 200

    # Invitee tries to accept now that team is full
    cap_accept = client.post(f"/api/v1/team-invitations/{inv2_id}/accept", headers=invitee["headers"])
    assert cap_accept.status_code == 400
    assert "maximum" in cap_accept.json()["detail"].lower()


def test_disband_cancels_pending_invitations_and_preserves_history(client: TestClient, db_session):
    """Disbanding cancels all pending invitations and preserves member history records."""
    organizer = auth_user(client, "org_dis_hist@example.com", "orgdishist")
    event_id = create_published_event(client, organizer["headers"])

    owner = auth_user(client, "dh_owner@example.com", "dhowner")
    m1 = auth_user(client, "dh_m1@example.com", "dhm1")
    invitee = auth_user(client, "dh_inv@example.com", "dhinv")
    register_participant(client, event_id, owner["headers"])
    register_participant(client, event_id, m1["headers"])
    register_participant(client, event_id, invitee["headers"])

    team = client.post(f"/api/v1/events/{event_id}/teams", json={"name": "History FC"}, headers=owner["headers"]).json()
    team_id = team["id"]

    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": team["join_code"]}, headers=m1["headers"])
    inv_res = client.post(f"/api/v1/teams/{team_id}/invitations", json={"invitee_email": invitee["user"]["email"]}, headers=owner["headers"])
    inv_id = inv_res.json()["id"]

    # Disband
    disband_res = client.post(f"/api/v1/teams/{team_id}/disband", headers=owner["headers"])
    assert disband_res.status_code == 200

    # Check pending invitation is cancelled
    inv_db = db_session.query(TeamInvitation).filter(TeamInvitation.id == uuid.UUID(inv_id)).first()
    assert inv_db.status == "cancelled"
    assert inv_db.responded_at is not None

    # Check memberships are preserved as 'left'
    members_db = db_session.query(TeamMember).filter(TeamMember.team_id == uuid.UUID(team_id)).all()
    assert len(members_db) == 2
    for m in members_db:
        assert m.status == "left"
        assert m.left_at is not None

