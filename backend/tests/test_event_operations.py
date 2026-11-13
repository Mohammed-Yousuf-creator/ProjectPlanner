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


def setup_operations_event(client: TestClient):
    """Setup organization, event, participants, teams, mentors, and judges."""
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
            "name": f"Ops Event {suffix}",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "min_team_size": 2,
            "max_team_size": 5,
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=3)).isoformat(),
        },
        headers=organizer["headers"],
    ).json()
    event_id = event["id"]
    client.post(f"/api/v1/events/{event_id}/publish", headers=organizer["headers"])

    # Users
    part1 = auth_user(client, f"p1_{suffix}@example.com", f"p1_{suffix}")
    part2 = auth_user(client, f"p2_{suffix}@example.com", f"p2_{suffix}")
    part3 = auth_user(client, f"p3_{suffix}@example.com", f"p3_{suffix}")
    mentor1 = auth_user(client, f"m1_{suffix}@example.com", f"m1_{suffix}")
    mentor2 = auth_user(client, f"m2_{suffix}@example.com", f"m2_{suffix}")
    judge1 = auth_user(client, f"j1_{suffix}@example.com", f"j1_{suffix}")
    outsider = auth_user(client, f"out_{suffix}@example.com", f"out_{suffix}")

    # Register participants
    for p in (part1, part2, part3):
        client.post(f"/api/v1/events/{event_id}/register", headers=p["headers"])

    # Register mentor1 & mentor2
    for m in (mentor1, mentor2):
        client.post(f"/api/v1/events/{event_id}/register", headers=m["headers"])
        # Promote to mentor role by organizer
        client.patch(
            f"/api/v1/events/{event_id}/participants/{m['user']['id']}/status",
            json={"status": "approved"},
            headers=organizer["headers"],
        )
        # Directly update role in DB or register mentor endpoint
        # Let's set membership role to 'mentor' via database session fixture if needed, or register directly

    # Add judge1
    client.post(f"/api/v1/events/{event_id}/judges", json={"email": judge1["user"]["email"]}, headers=organizer["headers"])

    # Team Alpha (part1 and part2)
    t_res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Team Alpha {suffix}", "generate_join_code": True},
        headers=part1["headers"],
    )
    team = t_res.json()
    team_id = team["id"]
    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": team["join_code"]}, headers=part2["headers"])

    return {
        "organizer": organizer,
        "org_id": org["id"],
        "event_id": event_id,
        "team_id": team_id,
        "part1": part1,
        "part2": part2,
        "part3": part3,
        "mentor1": mentor1,
        "mentor2": mentor2,
        "judge1": judge1,
        "outsider": outsider,
        "suffix": suffix,
    }


# ---------------------------------------------------------------------------
# 1. Schedule Management Tests
# ---------------------------------------------------------------------------

def test_event_schedule_management(client: TestClient):
    s = setup_operations_event(client)
    event_id = s["event_id"]
    organizer = s["organizer"]
    part1 = s["part1"]
    outsider = s["outsider"]

    now = datetime.now(timezone.utc)
    t1 = now + timedelta(hours=2)
    t2 = now + timedelta(hours=4)
    t3 = now + timedelta(hours=6)

    # 1. Participant cannot create schedule items
    res = client.post(
        f"/api/v1/events/{event_id}/schedule",
        json={
            "title": "Opening Ceremony",
            "item_type": "ceremony",
            "starts_at": t1.isoformat(),
            "ends_at": t2.isoformat(),
        },
        headers=part1["headers"],
    )
    assert res.status_code == 403

    # 2. Invalid time range rejected (starts_at >= ends_at)
    res = client.post(
        f"/api/v1/events/{event_id}/schedule",
        json={
            "title": "Invalid Workshop",
            "item_type": "workshop",
            "starts_at": t2.isoformat(),
            "ends_at": t1.isoformat(),
        },
        headers=organizer["headers"],
    )
    assert res.status_code == 400

    # 3. Organizer creates schedule item 2 (starts later)
    res2 = client.post(
        f"/api/v1/events/{event_id}/schedule",
        json={
            "title": "Hacking Begins",
            "item_type": "talk",
            "starts_at": t2.isoformat(),
            "ends_at": t3.isoformat(),
            "meeting_url": "https://meet.google.com/abc-defg-hij",
        },
        headers=organizer["headers"],
    )
    assert res2.status_code == 201
    item2 = res2.json()

    # 4. Organizer creates schedule item 1 (starts earlier)
    res1 = client.post(
        f"/api/v1/events/{event_id}/schedule",
        json={
            "title": "Opening Ceremony",
            "item_type": "ceremony",
            "starts_at": t1.isoformat(),
            "ends_at": t2.isoformat(),
            "venue": "Main Hall",
        },
        headers=organizer["headers"],
    )
    assert res1.status_code == 201
    item1 = res1.json()

    # 5. Schedule returned in chronological order
    res_list = client.get(f"/api/v1/events/{event_id}/schedule", headers=part1["headers"])
    assert res_list.status_code == 200
    sched = res_list.json()
    assert len(sched) == 2
    assert sched[0]["id"] == item1["id"]
    assert sched[1]["id"] == item2["id"]

    # 6. Update schedule item
    res_update = client.patch(
        f"/api/v1/schedule/{item1['id']}",
        json={"title": "Grand Opening Ceremony", "venue": "Auditorium A"},
        headers=organizer["headers"],
    )
    assert res_update.status_code == 200
    assert res_update.json()["title"] == "Grand Opening Ceremony"
    assert res_update.json()["venue"] == "Auditorium A"

    # 7. Cancel schedule item (soft delete)
    res_del = client.delete(f"/api/v1/schedule/{item2['id']}", headers=organizer["headers"])
    assert res_del.status_code == 204

    # 8. Cancelled items are hidden by default
    res_default = client.get(f"/api/v1/events/{event_id}/schedule", headers=part1["headers"])
    assert len(res_default.json()) == 1
    assert res_default.json()[0]["id"] == item1["id"]

    # 9. Cancelled items visible to organizer when include_cancelled=True
    res_org = client.get(f"/api/v1/events/{event_id}/schedule?include_cancelled=true", headers=organizer["headers"])
    assert len(res_org.json()) == 2
    assert any(x["status"] == "cancelled" for x in res_org.json())


# ---------------------------------------------------------------------------
# 2. Announcement Management & Audience Targeting
# ---------------------------------------------------------------------------

def test_announcements_and_audience_targeting(client: TestClient):
    s = setup_operations_event(client)
    event_id = s["event_id"]
    organizer = s["organizer"]
    part1 = s["part1"]
    part3 = s["part3"]
    team_id = s["team_id"]

    # 1. Participant cannot create announcements
    res = client.post(
        f"/api/v1/events/{event_id}/announcements",
        json={"title": "Hacked", "body": "Spam", "audience_type": "all"},
        headers=part1["headers"],
    )
    assert res.status_code == 403

    # 2. Audience 'team' requires valid target_team_id
    res = client.post(
        f"/api/v1/events/{event_id}/announcements",
        json={"title": "Team Note", "body": "Important", "audience_type": "team"},
        headers=organizer["headers"],
    )
    assert res.status_code == 400

    # 3. Create draft general announcement
    res_draft = client.post(
        f"/api/v1/events/{event_id}/announcements",
        json={"title": "Welcome All", "body": "Welcome to hackathon", "audience_type": "all"},
        headers=organizer["headers"],
    )
    assert res_draft.status_code == 201
    draft_ann = res_draft.json()
    assert draft_ann["status"] == "draft"

    # 4. Draft is NOT visible to participants
    res_part_list = client.get(f"/api/v1/events/{event_id}/announcements", headers=part1["headers"])
    assert len(res_part_list.json()) == 0

    # 5. Edit draft announcement
    res_edit = client.patch(
        f"/api/v1/announcements/{draft_ann['id']}",
        json={"title": "Welcome All Participants and Judges!"},
        headers=organizer["headers"],
    )
    assert res_edit.status_code == 200
    assert res_edit.json()["title"] == "Welcome All Participants and Judges!"

    # 6. Publish announcement
    res_pub = client.post(f"/api/v1/announcements/{draft_ann['id']}/publish", headers=organizer["headers"])
    assert res_pub.status_code == 200
    assert res_pub.json()["status"] == "published"
    assert res_pub.json()["published_at"] is not None

    # 7. Published announcement is now visible to participants
    res_part_list2 = client.get(f"/api/v1/events/{event_id}/announcements", headers=part1["headers"])
    assert len(res_part_list2.json()) == 1

    # 8. Published announcement is immutable (edits return 400)
    res_try_edit = client.patch(
        f"/api/v1/announcements/{draft_ann['id']}",
        json={"title": "Attempt to change published"},
        headers=organizer["headers"],
    )
    assert res_try_edit.status_code == 400

    # 9. Target team announcement
    res_team_ann = client.post(
        f"/api/v1/events/{event_id}/announcements",
        json={
            "title": "Secret Team Alpha Brief",
            "body": "Special instruction for team Alpha",
            "audience_type": "team",
            "target_team_id": team_id,
        },
        headers=organizer["headers"],
    )
    team_ann_id = res_team_ann.json()["id"]
    client.post(f"/api/v1/announcements/{team_ann_id}/publish", headers=organizer["headers"])

    # Part1 (in Team Alpha) sees team announcement
    part1_anns = client.get(f"/api/v1/events/{event_id}/announcements", headers=part1["headers"]).json()
    assert len(part1_anns) == 2

    # Part3 (NOT in Team Alpha) does NOT see team announcement
    part3_anns = client.get(f"/api/v1/events/{event_id}/announcements", headers=part3["headers"]).json()
    assert len(part3_anns) == 1
    assert part3_anns[0]["id"] == draft_ann["id"]

    # 10. Withdraw announcement
    res_with = client.post(f"/api/v1/announcements/{draft_ann['id']}/withdraw", headers=organizer["headers"])
    assert res_with.status_code == 200
    assert res_with.json()["status"] == "withdrawn"

    # Withdrawn announcement is not visible to participants
    part3_anns2 = client.get(f"/api/v1/events/{event_id}/announcements", headers=part3["headers"]).json()
    assert len(part3_anns2) == 0


# ---------------------------------------------------------------------------
# 3. In-App Notifications & Privacy
# ---------------------------------------------------------------------------

def test_notifications_and_privacy(client: TestClient):
    s = setup_operations_event(client)
    event_id = s["event_id"]
    organizer = s["organizer"]
    part1 = s["part1"]
    part2 = s["part2"]

    # 1. Publish announcement to participants
    res_ann = client.post(
        f"/api/v1/events/{event_id}/announcements",
        json={"title": "Notification Alert", "body": "Check this out", "audience_type": "participants"},
        headers=organizer["headers"],
    )
    ann_id = res_ann.json()["id"]
    client.post(f"/api/v1/announcements/{ann_id}/publish", headers=organizer["headers"])

    # 2. Check part1 received in-app notification
    res_notif = client.get("/api/v1/notifications/me", headers=part1["headers"])
    assert res_notif.status_code == 200
    notifs = res_notif.json()
    assert len(notifs) >= 1
    notif_id = notifs[0]["id"]
    assert "Notification Alert" in notifs[0]["title"]
    assert notifs[0]["read_at"] is None

    # 3. Check unread count
    res_cnt = client.get("/api/v1/notifications/me/unread-count", headers=part1["headers"])
    assert res_cnt.json()["unread_count"] >= 1

    # 4. User cannot read or modify another user's notification
    res_tamper = client.patch(f"/api/v1/notifications/{notif_id}/read", headers=part2["headers"])
    assert res_tamper.status_code == 404

    # 5. Mark notification as read
    res_read = client.patch(f"/api/v1/notifications/{notif_id}/read", headers=part1["headers"])
    assert res_read.status_code == 200
    assert res_read.json()["read_at"] is not None

    # 6. Mark all read
    res_all = client.post("/api/v1/notifications/me/read-all", headers=part1["headers"])
    assert res_all.status_code == 200

    res_cnt_after = client.get("/api/v1/notifications/me/unread-count", headers=part1["headers"])
    assert res_cnt_after.json()["unread_count"] == 0


# ---------------------------------------------------------------------------
# 4. Event Check-in Roster, Summary & Undo
# ---------------------------------------------------------------------------

def test_checkin_summary_and_undo(client: TestClient):
    s = setup_operations_event(client)
    event_id = s["event_id"]
    organizer = s["organizer"]
    part1 = s["part1"]
    part2 = s["part2"]
    part3 = s["part3"]

    # Initial check-in summary: 3 registered participants, 0 checked in
    res_sum = client.get(f"/api/v1/events/{event_id}/check-ins/summary", headers=organizer["headers"])
    assert res_sum.status_code == 200
    summary = res_sum.json()
    assert summary["total_eligible_registrations"] >= 3
    assert summary["total_checked_in"] == 0
    assert summary["attendance_percentage"] == 0.0

    # 1. Non-organizer cannot view check-ins
    res = client.get(f"/api/v1/events/{event_id}/check-ins", headers=part1["headers"])
    assert res.status_code == 403

    # 2. Check in part1
    res_in = client.post(
        f"/api/v1/events/{event_id}/participants/{part1['user']['id']}/check-in",
        headers=organizer["headers"],
    )
    assert res_in.status_code == 200
    assert res_in.json()["checked_in_at"] is not None

    # 3. Duplicate check-in rejected
    res_dup = client.post(
        f"/api/v1/events/{event_id}/participants/{part1['user']['id']}/check-in",
        headers=organizer["headers"],
    )
    assert res_dup.status_code == 400

    # 4. Filter check-in list: checked_in=true
    res_list_in = client.get(f"/api/v1/events/{event_id}/check-ins?checked_in=true", headers=organizer["headers"])
    assert res_list_in.status_code == 200
    assert len(res_list_in.json()) == 1
    assert res_list_in.json()[0]["user_id"] == part1["user"]["id"]

    # 5. Search check-in list
    res_search = client.get(f"/api/v1/events/{event_id}/check-ins?search={part2['user']['username']}", headers=organizer["headers"])
    assert len(res_search.json()) == 1
    assert res_search.json()[0]["user_id"] == part2["user"]["id"]

    # 6. Undo check-in
    res_undo = client.delete(
        f"/api/v1/events/{event_id}/participants/{part1['user']['id']}/check-in",
        headers=organizer["headers"],
    )
    assert res_undo.status_code == 204

    # Verify part1 is no longer checked in
    res_sum2 = client.get(f"/api/v1/events/{event_id}/check-ins/summary", headers=organizer["headers"])
    assert res_sum2.json()["total_checked_in"] == 0


# ---------------------------------------------------------------------------
# 5. Mentor Requests Lifecycle & Assignment
# ---------------------------------------------------------------------------

def test_mentor_request_lifecycle(client: TestClient, db_session):
    s = setup_operations_event(client)
    event_id = s["event_id"]
    organizer = s["organizer"]
    part1 = s["part1"]
    part3 = s["part3"]
    outsider = s["outsider"]
    mentor1 = s["mentor1"]
    mentor2 = s["mentor2"]
    team_id = s["team_id"]

    # Ensure mentor1 and mentor2 have role="mentor" in event_memberships
    from app.models.event import EventMembership
    ev_m1 = db_session.query(EventMembership).filter(
        EventMembership.event_id == uuid.UUID(event_id),
        EventMembership.user_id == uuid.UUID(mentor1["user"]["id"]),
    ).first()
    ev_m1.role = "mentor"
    ev_m1.status = "approved"

    ev_m2 = db_session.query(EventMembership).filter(
        EventMembership.event_id == uuid.UUID(event_id),
        EventMembership.user_id == uuid.UUID(mentor2["user"]["id"]),
    ).first()
    ev_m2.role = "mentor"
    ev_m2.status = "approved"
    db_session.commit()

    # 1. Unregistered user cannot create mentor request
    res = client.post(
        f"/api/v1/events/{event_id}/mentor-requests",
        json={"topic": "React Hooks", "description": "Need help with useEffect"},
        headers=outsider["headers"],
    )
    assert res.status_code == 403

    # 2. Participant creates mentor request
    res_req = client.post(
        f"/api/v1/events/{event_id}/mentor-requests",
        json={
            "topic": "FastAPI WebSockets",
            "description": "Trouble broadcasting events across worker threads",
            "priority": "high",
            "team_id": team_id,
        },
        headers=part1["headers"],
    )
    assert res_req.status_code == 201
    req = res_req.json()
    req_id = req["id"]
    assert req["status"] == "pending"
    assert req["priority"] == "high"

    # 3. Participant views their own requests
    res_my = client.get("/api/v1/participants/me/mentor-requests", headers=part1["headers"])
    assert res_my.status_code == 200
    assert len(res_my.json()) == 1

    # Part3 sees 0 requests
    res_my3 = client.get("/api/v1/participants/me/mentor-requests", headers=part3["headers"])
    assert len(res_my3.json()) == 0

    # 4. Approved mentor sees unassigned pending request
    res_mentor_list = client.get(f"/api/v1/events/{event_id}/mentor-requests", headers=mentor1["headers"])
    assert res_mentor_list.status_code == 200
    assert len(res_mentor_list.json()) == 1

    # 5. Organizer assigns mentor1
    res_assign = client.patch(
        f"/api/v1/mentor-requests/{req_id}/assign",
        json={"mentor_user_id": mentor1["user"]["id"]},
        headers=organizer["headers"],
    )
    assert res_assign.status_code == 200
    assert res_assign.json()["status"] == "assigned"
    assert res_assign.json()["assigned_mentor_user_id"] == mentor1["user"]["id"]

    # 6. Mentor2 (unassigned) can no longer see assigned request
    res_m2_list = client.get(f"/api/v1/events/{event_id}/mentor-requests", headers=mentor2["headers"])
    assert len(res_m2_list.json()) == 0

    # 7. Mentor2 cannot modify status of request assigned to Mentor1
    res_bad_update = client.patch(
        f"/api/v1/mentor-requests/{req_id}/status",
        json={"status": "in_progress"},
        headers=mentor2["headers"],
    )
    assert res_bad_update.status_code == 403

    # 8. Mentor1 updates status to in_progress
    res_prog = client.patch(
        f"/api/v1/mentor-requests/{req_id}/status",
        json={"status": "in_progress"},
        headers=mentor1["headers"],
    )
    assert res_prog.status_code == 200
    assert res_prog.json()["status"] == "in_progress"

    # 9. Invalid status transition (e.g. in_progress -> rejected)
    res_inv = client.patch(
        f"/api/v1/mentor-requests/{req_id}/status",
        json={"status": "rejected"},
        headers=mentor1["headers"],
    )
    assert res_inv.status_code == 400

    # 10. Mentor1 resolves request with resolution note
    res_res = client.patch(
        f"/api/v1/mentor-requests/{req_id}/status",
        json={"status": "resolved", "resolution_note": "Explained asyncio.run_coroutine_threadsafe"},
        headers=mentor1["headers"],
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "resolved"
    assert res_res.json()["resolved_at"] is not None
    assert res_res.json()["resolution_note"] == "Explained asyncio.run_coroutine_threadsafe"

    # 11. Requester creates another request and cancels it while pending
    res_req2 = client.post(
        f"/api/v1/events/{event_id}/mentor-requests",
        json={"topic": "CSS Grid", "description": "Layout question"},
        headers=part1["headers"],
    )
    req2_id = res_req2.json()["id"]

    res_cancel = client.post(f"/api/v1/mentor-requests/{req2_id}/cancel", headers=part1["headers"])
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"
