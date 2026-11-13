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


def test_successful_event_creation(client: TestClient):
    """Test creating an event under an organization by owner."""
    owner = auth_user(client, "ev_owner@example.com", "evowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Event Host Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    payload = {
        "name": "Global Hackathon 2026",
        "slug": "global-hack-2026",
        "event_type": "hackathon",
        "format": "online",
        "timezone": "UTC",
        "visibility": "public",
        "starts_at": (now + timedelta(days=10)).isoformat(),
        "ends_at": (now + timedelta(days=12)).isoformat(),
        "min_team_size": 2,
        "max_team_size": 5,
    }

    res = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json=payload,
        headers=owner["headers"],
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Global Hackathon 2026"
    assert data["slug"] == "global-hack-2026"
    assert data["organization_id"] == org_id
    assert data["created_by_user_id"] == owner["user"]["id"]
    assert data["status"] == "draft"  # Starts as draft


def test_non_organizers_cannot_create_events(client: TestClient):
    """Test that organizations of type 'sponsor' cannot create events."""
    owner = auth_user(client, "sponsor_owner@example.com", "sponsorowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Pure Sponsor Org", "organization_type": "sponsor"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    res = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "Sponsor Attempt Hackathon",
            "event_type": "hackathon",
            "format": "online",
        },
        headers=owner["headers"],
    )
    assert res.status_code == 400
    assert "cannot create events" in res.json()["detail"].lower()


def test_member_cannot_create_or_update_event(client: TestClient):
    """Test that a regular organization member cannot create or update events."""
    owner = auth_user(client, "perm_owner@example.com", "permowner")
    member = auth_user(client, "perm_member@example.com", "permmember")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Perm Org", "organization_type": "both"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    # Add member to org
    inv = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations",
        json={"email": "perm_member@example.com", "role": "member"},
        headers=owner["headers"],
    ).json()
    client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{inv['id']}/accept",
        headers=member["headers"],
    )

    # Regular member tries to create event -> 403
    res_create = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Unauthorized Hack", "event_type": "hackathon", "format": "online"},
        headers=member["headers"],
    )
    assert res_create.status_code == 403

    # Owner creates event
    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Legit Hack", "event_type": "hackathon", "format": "online"},
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    # Member tries to update event -> 403
    res_update = client.patch(
        f"/api/v1/events/{event_id}",
        json={"name": "Hacked Name"},
        headers=member["headers"],
    )
    assert res_update.status_code == 403

    # Owner CAN update event -> 200
    res_owner_update = client.patch(
        f"/api/v1/events/{event_id}",
        json={"description": "Updated by owner"},
        headers=owner["headers"],
    )
    assert res_owner_update.status_code == 200
    assert res_owner_update.json()["description"] == "Updated by owner"


def test_event_visibility_rules(client: TestClient):
    """Test draft, private, and published event visibility rules."""
    owner = auth_user(client, "vis_owner@example.com", "visowner")
    stranger = auth_user(client, "vis_stranger@example.com", "visstranger")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Visibility Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    event_payload = {
        "name": "Visibility Hack",
        "event_type": "hackathon",
        "format": "online",
        "visibility": "public",
        "starts_at": (now + timedelta(days=5)).isoformat(),
        "ends_at": (now + timedelta(days=7)).isoformat(),
        "timezone": "UTC",
    }
    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json=event_payload,
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    # 1. Draft event: stranger cannot access (404/403)
    res_stranger = client.get(f"/api/v1/events/{event_id}", headers=stranger["headers"])
    assert res_stranger.status_code == 404

    # Unauthenticated visitor cannot access draft
    res_anon = client.get(f"/api/v1/events/{event_id}")
    assert res_anon.status_code == 404

    # Organization owner CAN access draft
    res_owner = client.get(f"/api/v1/events/{event_id}", headers=owner["headers"])
    assert res_owner.status_code == 200

    # Draft must NOT appear in public discovery
    discovery = client.get("/api/v1/events").json()
    assert event_id not in [e["id"] for e in discovery]

    # 2. Publish the event
    pub_res = client.post(f"/api/v1/events/{event_id}/publish", headers=owner["headers"])
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "published"

    # Now unauthenticated public and stranger CAN access
    res_anon_pub = client.get(f"/api/v1/events/{event_id}")
    assert res_anon_pub.status_code == 200
    assert res_anon_pub.json()["name"] == "Visibility Hack"

    # Now appears in public discovery
    discovery_after = client.get("/api/v1/events").json()
    assert event_id in [e["id"] for e in discovery_after]

    # 3. Cancel the event
    cancel_res = client.post(f"/api/v1/events/{event_id}/cancel", headers=owner["headers"])
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    # Cancelled event must NOT appear in public discovery
    discovery_cancelled = client.get("/api/v1/events").json()
    assert event_id not in [e["id"] for e in discovery_cancelled]

    # Cancelled event cannot be re-published
    republish_res = client.post(f"/api/v1/events/{event_id}/publish", headers=owner["headers"])
    assert republish_res.status_code == 400


def test_publishing_invalid_events_rejected(client: TestClient):
    """Test that publishing incomplete draft events is rejected with 400."""
    owner = auth_user(client, "pub_owner@example.com", "pubowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Incomplete Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    # Draft event missing dates
    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Incomplete Event", "event_type": "hackathon", "format": "online"},
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    # Attempting to publish without starts_at and ends_at should fail
    pub_res = client.post(f"/api/v1/events/{event_id}/publish", headers=owner["headers"])
    assert pub_res.status_code == 400
    assert "missing required information" in pub_res.json()["detail"].lower()


def test_public_event_discovery_filtering(client: TestClient):
    """Test filtering public events by event_type, format, city, and pagination."""
    owner = auth_user(client, "filter_owner@example.com", "filterowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Filter Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)

    # Event 1: Online Hackathon in London
    ev1 = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "London Online Hack",
            "event_type": "hackathon",
            "format": "online",
            "city": "London",
            "timezone": "UTC",
            "starts_at": (now + timedelta(days=1)).isoformat(),
            "ends_at": (now + timedelta(days=2)).isoformat(),
        },
        headers=owner["headers"],
    ).json()
    client.post(f"/api/v1/events/{ev1['id']}/publish", headers=owner["headers"])

    # Event 2: Offline Workshop in Berlin
    ev2 = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "Berlin Workshop",
            "event_type": "workshop",
            "format": "offline",
            "city": "Berlin",
            "venue_name": "Berlin Hub",
            "timezone": "Europe/Berlin",
            "starts_at": (now + timedelta(days=3)).isoformat(),
            "ends_at": (now + timedelta(days=4)).isoformat(),
        },
        headers=owner["headers"],
    ).json()
    client.post(f"/api/v1/events/{ev2['id']}/publish", headers=owner["headers"])

    # Test format filter: online
    res_online = client.get("/api/v1/events?format=online").json()
    online_names = [e["name"] for e in res_online]
    assert "London Online Hack" in online_names
    assert "Berlin Workshop" not in online_names

    # Test city filter: berlin
    res_berlin = client.get("/api/v1/events?city=berlin").json()
    berlin_names = [e["name"] for e in res_berlin]
    assert "Berlin Workshop" in berlin_names
    assert "London Online Hack" not in berlin_names

    # Test event_type filter: workshop
    res_workshop = client.get("/api/v1/events?event_type=workshop").json()
    workshop_names = [e["name"] for e in res_workshop]
    assert "Berlin Workshop" in workshop_names
    assert "London Online Hack" not in workshop_names

