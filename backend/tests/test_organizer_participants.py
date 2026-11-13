from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient


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


def create_published_event(client: TestClient, owner_headers: dict) -> str:
    """Helper to create and publish an event."""
    org = client.post(
        "/api/v1/organizations",
        json={"name": "Org Management", "organization_type": "organizer"},
        headers=owner_headers,
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "Management Hack",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "starts_at": (now + timedelta(days=2)).isoformat(),
            "ends_at": (now + timedelta(days=4)).isoformat(),
        },
        headers=owner_headers,
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=owner_headers)
    return event["id"]


def test_organizer_participant_listing_and_isolation(client: TestClient):
    """Test authorized organizer can list and search participants, and unrelated organizer is rejected."""
    owner1 = auth_user(client, "org1_owner@example.com", "org1owner")
    owner2 = auth_user(client, "org2_owner@example.com", "org2owner")
    part1 = auth_user(client, "part1_list@example.com", "alice_coder")
    part2 = auth_user(client, "part2_list@example.com", "bob_dev")

    event_id = create_published_event(client, owner1["headers"])

    # Register participants
    client.post(f"/api/v1/events/{event_id}/register", headers=part1["headers"])
    client.post(f"/api/v1/events/{event_id}/register", headers=part2["headers"])

    # Owner 1 (authorized) can view participants
    res_owner1 = client.get(f"/api/v1/events/{event_id}/participants", headers=owner1["headers"])
    assert res_owner1.status_code == 200
    participants = res_owner1.json()
    assert len(participants) == 2
    usernames = [p["username"] for p in participants]
    assert "alice_coder" in usernames
    assert "bob_dev" in usernames

    # Search filter by username
    res_search = client.get(f"/api/v1/events/{event_id}/participants?search=alice", headers=owner1["headers"])
    assert res_search.status_code == 200
    assert len(res_search.json()) == 1
    assert res_search.json()[0]["username"] == "alice_coder"

    # Owner 2 (unrelated organizer) cannot view participants -> 403 Forbidden
    res_owner2 = client.get(f"/api/v1/events/{event_id}/participants", headers=owner2["headers"])
    assert res_owner2.status_code == 403

    # Participant cannot view organizer participant list -> 403 Forbidden
    res_part = client.get(f"/api/v1/events/{event_id}/participants", headers=part1["headers"])
    assert res_part.status_code == 403


def test_organizer_status_update_and_participant_rejection(client: TestClient):
    """Test owner can update participant status (approved, waitlisted, rejected), participant cannot update status."""
    owner = auth_user(client, "status_up_owner@example.com", "statusowner")
    participant = auth_user(client, "status_up_part@example.com", "statuspart")

    event_id = create_published_event(client, owner["headers"])

    # Register participant
    client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])

    # Participant tries to approve themselves -> 403 Forbidden
    self_approve = client.patch(
        f"/api/v1/events/{event_id}/participants/{participant['user']['id']}",
        json={"status": "approved"},
        headers=participant["headers"],
    )
    assert self_approve.status_code == 403

    # Organizer approves participant -> 200 OK
    res_approve = client.patch(
        f"/api/v1/events/{event_id}/participants/{participant['user']['id']}",
        json={"status": "approved"},
        headers=owner["headers"],
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["status"] == "approved"

    # Organizer waitlists participant -> 200 OK
    res_waitlist = client.patch(
        f"/api/v1/events/{event_id}/participants/{participant['user']['id']}",
        json={"status": "waitlisted"},
        headers=owner["headers"],
    )
    assert res_waitlist.status_code == 200
    assert res_waitlist.json()["status"] == "waitlisted"

    # Organizer rejects participant -> 200 OK
    res_reject = client.patch(
        f"/api/v1/events/{event_id}/participants/{participant['user']['id']}",
        json={"status": "rejected"},
        headers=owner["headers"],
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "rejected"


def test_participant_check_in_lifecycle_and_rejections(client: TestClient):
    """Test checking in registered/approved participants, and rejection of waitlisted/rejected/withdrawn check-ins."""
    owner = auth_user(client, "chk_owner@example.com", "chkowner")
    part_registered = auth_user(client, "chk_reg@example.com", "chkreg")
    part_waitlisted = auth_user(client, "chk_wait@example.com", "chkwait")
    part_withdrawn = auth_user(client, "chk_with@example.com", "chkwith")

    event_id = create_published_event(client, owner["headers"])

    # Register all three
    client.post(f"/api/v1/events/{event_id}/register", headers=part_registered["headers"])
    client.post(f"/api/v1/events/{event_id}/register", headers=part_waitlisted["headers"])
    client.post(f"/api/v1/events/{event_id}/register", headers=part_withdrawn["headers"])

    # Set part_waitlisted to waitlisted
    client.patch(
        f"/api/v1/events/{event_id}/participants/{part_waitlisted['user']['id']}",
        json={"status": "waitlisted"},
        headers=owner["headers"],
    )

    # part_withdrawn withdraws
    client.post(f"/api/v1/events/{event_id}/withdraw", headers=part_withdrawn["headers"])

    # 1. Registered participant can be checked in
    res_checkin = client.post(
        f"/api/v1/events/{event_id}/participants/{part_registered['user']['id']}/check-in",
        headers=owner["headers"],
    )
    assert res_checkin.status_code == 200
    data = res_checkin.json()
    assert data["checked_in_at"] is not None

    # 2. Waitlisted participant check-in must be rejected
    res_wait_checkin = client.post(
        f"/api/v1/events/{event_id}/participants/{part_waitlisted['user']['id']}/check-in",
        headers=owner["headers"],
    )
    assert res_wait_checkin.status_code == 400
    assert "waitlisted" in res_wait_checkin.json()["detail"].lower()

    # 3. Withdrawn participant check-in must be rejected
    res_with_checkin = client.post(
        f"/api/v1/events/{event_id}/participants/{part_withdrawn['user']['id']}/check-in",
        headers=owner["headers"],
    )
    assert res_with_checkin.status_code == 400
    assert "withdrawn" in res_with_checkin.json()["detail"].lower()

