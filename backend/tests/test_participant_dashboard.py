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


def create_event(client: TestClient, owner_headers: dict, org_id: str, name: str, starts_at: datetime, ends_at: datetime) -> str:
    """Helper to create and publish an event."""
    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": name,
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
        },
        headers=owner_headers,
    ).json()
    client.post(f"/api/v1/events/{event['id']}/publish", headers=owner_headers)
    return event["id"]


def test_participant_dashboard_and_event_categorization(client: TestClient):
    """Test dashboard metrics, user profile, and correct event categorization (upcoming, ongoing, completed, waitlisted)."""
    owner = auth_user(client, "dash_owner@example.com", "dashowner")
    part1 = auth_user(client, "dash_part1@example.com", "dashpart1")
    part2 = auth_user(client, "dash_part2@example.com", "dashpart2")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Dash Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)

    # 1. Upcoming event (starts in 5 days, ends in 7 days)
    ev_upcoming = create_event(
        client, owner["headers"], org_id, "Upcoming Hack",
        starts_at=now + timedelta(days=5), ends_at=now + timedelta(days=7)
    )

    # 2. Ongoing event (created in future, then registered, then shifted to ongoing)
    ev_ongoing = create_event(
        client, owner["headers"], org_id, "Ongoing Hack",
        starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=3)
    )

    # 3. Completed event (created in future, then registered, then shifted to completed)
    ev_completed = create_event(
        client, owner["headers"], org_id, "Completed Hack",
        starts_at=now + timedelta(days=2), ends_at=now + timedelta(days=4)
    )

    # 4. Waitlisted event (starts in 10 days)
    ev_waitlisted = create_event(
        client, owner["headers"], org_id, "Waitlisted Hack",
        starts_at=now + timedelta(days=10), ends_at=now + timedelta(days=12)
    )

    # Register part1 for all 4 events while registration is open
    reg1 = client.post(f"/api/v1/events/{ev_upcoming}/register", headers=part1["headers"])
    assert reg1.status_code == 201
    reg2 = client.post(f"/api/v1/events/{ev_ongoing}/register", headers=part1["headers"])
    assert reg2.status_code == 201
    reg3 = client.post(f"/api/v1/events/{ev_completed}/register", headers=part1["headers"])
    assert reg3.status_code == 201
    reg4 = client.post(f"/api/v1/events/{ev_waitlisted}/register", headers=part1["headers"])
    assert reg4.status_code == 201

    # Shift ev_ongoing dates to reflect ongoing hackathon (started 1 day ago, ends in 1 day)
    client.patch(
        f"/api/v1/events/{ev_ongoing}",
        json={
            "starts_at": (now - timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=1)).isoformat(),
        },
        headers=owner["headers"],
    )

    # Shift ev_completed dates to reflect completed hackathon (started 5 days ago, ended 3 days ago)
    client.patch(
        f"/api/v1/events/{ev_completed}",
        json={
            "starts_at": (now - timedelta(days=5)).isoformat(),
            "ends_at": (now - timedelta(days=3)).isoformat(),
        },
        headers=owner["headers"],
    )

    # Organizer marks ev_waitlisted as waitlisted for part1
    client.patch(
        f"/api/v1/events/{ev_waitlisted}/participants/{part1['user']['id']}",
        json={"status": "waitlisted"},
        headers=owner["headers"],
    )

    # Register part2 for ev_upcoming only
    client.post(f"/api/v1/events/{ev_upcoming}/register", headers=part2["headers"])

    # Fetch dashboard for part1
    dash_res = client.get("/api/v1/participants/me/dashboard", headers=part1["headers"])
    assert dash_res.status_code == 200
    dash = dash_res.json()

    # Verify user information
    assert dash["user"]["user_id"] == part1["user"]["id"]
    assert dash["user"]["username"] == "dashpart1"
    assert dash["user"]["email"] == "dash_part1@example.com"
    assert dash["user"]["display_name"] == "Dashpart1 User"

    # Verify summary counts
    assert dash["summary"]["total_active_registrations"] == 4
    assert dash["summary"]["upcoming_events_count"] == 1
    assert dash["summary"]["ongoing_events_count"] == 1
    assert dash["summary"]["completed_events_count"] == 1
    assert dash["summary"]["waitlisted_events_count"] == 1

    # Verify collections
    assert len(dash["upcoming_events"]) == 1
    assert dash["upcoming_events"][0]["event_name"] == "Upcoming Hack"

    assert len(dash["ongoing_events"]) == 1
    assert dash["ongoing_events"][0]["event_name"] == "Ongoing Hack"

    assert len(dash["completed_events"]) == 1
    assert dash["completed_events"][0]["event_name"] == "Completed Hack"

    assert len(dash["waitlisted_events"]) == 1
    assert dash["waitlisted_events"][0]["event_name"] == "Waitlisted Hack"

    # Part2's dashboard must only contain their own single registration
    dash2 = client.get("/api/v1/participants/me/dashboard", headers=part2["headers"]).json()
    assert dash2["summary"]["total_active_registrations"] == 1
    assert dash2["summary"]["upcoming_events_count"] == 1


def test_participant_registrations_listing_and_withdrawn_exclusion(client: TestClient):
    """Test GET /participants/me/registrations lists active registrations and excludes withdrawn/rejected ones."""
    owner = auth_user(client, "list_owner@example.com", "listowner")
    part = auth_user(client, "list_part@example.com", "listpart")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Listing Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    ev1 = create_event(client, owner["headers"], org_id, "Event One", starts_at=now + timedelta(days=2), ends_at=now + timedelta(days=3))
    ev2 = create_event(client, owner["headers"], org_id, "Event Two", starts_at=now + timedelta(days=4), ends_at=now + timedelta(days=5))

    # Register for both
    client.post(f"/api/v1/events/{ev1}/register", headers=part["headers"])
    client.post(f"/api/v1/events/{ev2}/register", headers=part["headers"])

    # Withdraw from Event Two
    client.post(f"/api/v1/events/{ev2}/withdraw", headers=part["headers"])

    # Listing should only return Event One
    res = client.get("/api/v1/participants/me/registrations", headers=part["headers"])
    assert res.status_code == 200
    registrations = res.json()
    assert len(registrations) == 1
    assert registrations[0]["event_id"] == ev1
    assert registrations[0]["event_name"] == "Event One"
    assert registrations[0]["organization_name"] == "Listing Org"
    assert registrations[0]["registration_status"] == "registered"


def test_registered_event_detail_endpoint_and_isolation(client: TestClient):
    """Test GET /participants/me/events/{event_id} returns detailed info and enforces participant isolation."""
    owner = auth_user(client, "det_owner@example.com", "detowner")
    part1 = auth_user(client, "det_part1@example.com", "detpart1")
    part2 = auth_user(client, "det_part2@example.com", "detpart2")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Detail Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    ev_id = create_event(client, owner["headers"], org_id, "Detail Hackathon", starts_at=now + timedelta(days=2), ends_at=now + timedelta(days=3))

    # Add a track
    client.post(
        f"/api/v1/events/{ev_id}/tracks",
        json={"name": "GenAI Track", "description": "Generative AI"},
        headers=owner["headers"],
    )

    # Register part1
    client.post(f"/api/v1/events/{ev_id}/register", json={"registration_data": {"pref": "AI"}}, headers=part1["headers"])

    # Part1 can access registered event details
    res_part1 = client.get(f"/api/v1/participants/me/events/{ev_id}", headers=part1["headers"])
    assert res_part1.status_code == 200
    data = res_part1.json()
    assert data["event"]["name"] == "Detail Hackathon"
    assert data["organization"]["name"] == "Detail Org"
    assert data["registration_status"] == "registered"
    assert data["registration_data"]["pref"] == "AI"
    assert len(data["tracks"]) == 1
    assert data["tracks"][0]["name"] == "GenAI Track"

    # Part2 (not registered) cannot access -> 403
    res_part2 = client.get(f"/api/v1/participants/me/events/{ev_id}", headers=part2["headers"])
    assert res_part2.status_code == 403

    # Part1 withdraws -> now cannot access participant detail -> 403
    client.post(f"/api/v1/events/{ev_id}/withdraw", headers=part1["headers"])
    res_after_withdraw = client.get(f"/api/v1/participants/me/events/{ev_id}", headers=part1["headers"])
    assert res_after_withdraw.status_code == 403
