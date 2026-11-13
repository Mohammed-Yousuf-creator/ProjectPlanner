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


import uuid


def create_published_event(client: TestClient, owner_headers: dict, **event_overrides) -> str:
    """Helper to create an organization and a published event."""
    unique_suffix = uuid.uuid4().hex[:8]
    org = client.post(
        "/api/v1/organizations",
        json={"name": f"Event Host Org {unique_suffix}", "organization_type": "organizer"},
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

    # Publish the event
    pub_res = client.post(f"/api/v1/events/{event_id}/publish", headers=owner_headers)
    assert pub_res.status_code == 200
    return event_id


def test_successful_event_registration(client: TestClient):
    """Test authenticated user can register for an event with optional registration data."""
    owner = auth_user(client, "reg_owner@example.com", "regowner")
    participant = auth_user(client, "reg_part@example.com", "regpart")

    event_id = create_published_event(client, owner["headers"])

    reg_payload = {
        "registration_data": {
            "tshirt_size": "L",
            "experience_level": "intermediate",
            "dietary_restrictions": "none",
        }
    }
    res = client.post(
        f"/api/v1/events/{event_id}/register",
        json=reg_payload,
        headers=participant["headers"],
    )
    assert res.status_code == 201
    data = res.json()
    assert data["event_id"] == event_id
    assert data["user_id"] == participant["user"]["id"]
    assert data["role"] == "participant"
    assert data["status"] == "registered"
    assert data["registration_data"]["tshirt_size"] == "L"


def test_registration_without_authentication_rejected(client: TestClient):
    """Test unauthenticated registration returns 401."""
    owner = auth_user(client, "noauth_owner@example.com", "noauthowner")
    event_id = create_published_event(client, owner["headers"])

    res = client.post(f"/api/v1/events/{event_id}/register", json={})
    assert res.status_code == 401


def test_registration_for_draft_and_cancelled_events_rejected(client: TestClient):
    """Test registration for draft and cancelled events is rejected with 400."""
    owner = auth_user(client, "stat_owner@example.com", "statowner")
    participant = auth_user(client, "stat_part@example.com", "statpart")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Status Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    # 1. Draft event
    draft_event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "Draft Event",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "starts_at": (now + timedelta(days=5)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(),
        },
        headers=owner["headers"],
    ).json()

    res_draft = client.post(
        f"/api/v1/events/{draft_event['id']}/register",
        headers=participant["headers"],
    )
    assert res_draft.status_code == 400
    assert "draft" in res_draft.json()["detail"].lower()

    # 2. Cancelled event
    client.post(f"/api/v1/events/{draft_event['id']}/publish", headers=owner["headers"])
    client.post(f"/api/v1/events/{draft_event['id']}/cancel", headers=owner["headers"])

    res_cancel = client.post(
        f"/api/v1/events/{draft_event['id']}/register",
        headers=participant["headers"],
    )
    assert res_cancel.status_code == 400
    assert "cancelled" in res_cancel.json()["detail"].lower()


def test_registration_for_private_events_rejected(client: TestClient):
    """Test registration for private events is rejected with 403."""
    owner = auth_user(client, "priv_owner@example.com", "privowner")
    participant = auth_user(client, "priv_part@example.com", "privpart")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Private Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    now = datetime.now(timezone.utc)
    priv_event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={
            "name": "Secret Hack",
            "event_type": "hackathon",
            "format": "online",
            "visibility": "private",
            "timezone": "UTC",
            "starts_at": (now + timedelta(days=5)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(),
        },
        headers=owner["headers"],
    ).json()
    client.post(f"/api/v1/events/{priv_event['id']}/publish", headers=owner["headers"])

    res = client.post(
        f"/api/v1/events/{priv_event['id']}/register",
        headers=participant["headers"],
    )
    assert res.status_code == 403
    assert "private" in res.json()["detail"].lower()


def test_registration_timing_boundaries_rejected(client: TestClient):
    """Test registration rejected before opens_at and after closes_at."""
    owner = auth_user(client, "timing_owner@example.com", "timingowner")
    participant = auth_user(client, "timing_part@example.com", "timingpart")

    now = datetime.now(timezone.utc)

    # 1. Registration has not opened yet
    future_open_event = create_published_event(
        client,
        owner["headers"],
        registration_opens_at=(now + timedelta(days=2)).isoformat(),
        registration_closes_at=(now + timedelta(days=4)).isoformat(),
        starts_at=(now + timedelta(days=5)).isoformat(),
        ends_at=(now + timedelta(days=7)).isoformat(),
    )
    res_not_open = client.post(
        f"/api/v1/events/{future_open_event}/register",
        headers=participant["headers"],
    )
    assert res_not_open.status_code == 400
    assert "not opened yet" in res_not_open.json()["detail"].lower()

    # 2. Registration is closed
    closed_event = create_published_event(
        client,
        owner["headers"],
        registration_opens_at=(now - timedelta(days=5)).isoformat(),
        registration_closes_at=(now - timedelta(days=1)).isoformat(),
        starts_at=(now + timedelta(days=5)).isoformat(),
        ends_at=(now + timedelta(days=7)).isoformat(),
    )
    res_closed = client.post(
        f"/api/v1/events/{closed_event}/register",
        headers=participant["headers"],
    )
    assert res_closed.status_code == 400
    assert "closed" in res_closed.json()["detail"].lower()


def test_duplicate_registration_rejected(client: TestClient):
    """Test duplicate registration returns 409 Conflict."""
    owner = auth_user(client, "dup_owner@example.com", "dupowner")
    participant = auth_user(client, "dup_part@example.com", "duppart")

    event_id = create_published_event(client, owner["headers"])

    # First registration -> 201
    res1 = client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])
    assert res1.status_code == 201

    # Second registration -> 409
    res2 = client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])
    assert res2.status_code == 409
    assert "already registered" in res2.json()["detail"].lower()


def test_withdrawal_and_reactivation_lifecycle(client: TestClient):
    """Test withdrawal and reactivation reusing the same membership record."""
    owner = auth_user(client, "react_owner@example.com", "reactowner")
    participant = auth_user(client, "react_part@example.com", "reactpart")

    event_id = create_published_event(client, owner["headers"])

    # 1. Register
    reg_res = client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])
    assert reg_res.status_code == 201
    initial_membership_id = reg_res.json()["id"]

    # 2. Withdraw
    withdraw_res = client.post(f"/api/v1/events/{event_id}/withdraw", headers=participant["headers"])
    assert withdraw_res.status_code == 200
    assert withdraw_res.json()["status"] == "withdrawn"
    assert withdraw_res.json()["id"] == initial_membership_id

    # Duplicate withdraw should fail
    withdraw_again = client.post(f"/api/v1/events/{event_id}/withdraw", headers=participant["headers"])
    assert withdraw_again.status_code == 400
    assert "already withdrawn" in withdraw_again.json()["detail"].lower()

    # 3. Reactivate registration
    react_res = client.post(
        f"/api/v1/events/{event_id}/register",
        json={"registration_data": {"reactivated": True}},
        headers=participant["headers"],
    )
    assert react_res.status_code == 201
    data = react_res.json()
    assert data["status"] == "registered"
    assert data["id"] == initial_membership_id  # Reused same record!
    assert data["registration_data"]["reactivated"] is True


def test_rejected_registration_cannot_self_reactivate(client: TestClient):
    """Test that a participant rejected by organizer cannot self-reactivate registration."""
    owner = auth_user(client, "rej_owner@example.com", "rejowner")
    participant = auth_user(client, "rej_part@example.com", "rejpart")

    event_id = create_published_event(client, owner["headers"])

    # Register
    client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])

    # Organizer rejects participant
    patch_res = client.patch(
        f"/api/v1/events/{event_id}/participants/{participant['user']['id']}",
        json={"status": "rejected"},
        headers=owner["headers"],
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "rejected"

    # Participant tries to register again -> 403 Forbidden
    re_reg = client.post(f"/api/v1/events/{event_id}/register", headers=participant["headers"])
    assert re_reg.status_code == 403
    assert "rejected" in re_reg.json()["detail"].lower()
