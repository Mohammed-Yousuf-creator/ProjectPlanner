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


def test_track_creation_and_listing(client: TestClient):
    """Test track creation under an event and listing tracks."""
    owner = auth_user(client, "track_owner@example.com", "trackowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Track Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Track Hackathon", "event_type": "hackathon", "format": "online"},
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    # Create Track 1
    res1 = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": "AI & Machine Learning", "description": "Build with LLMs"},
        headers=owner["headers"],
    )
    assert res1.status_code == 201
    track1 = res1.json()
    assert track1["name"] == "AI & Machine Learning"
    assert track1["event_id"] == event_id

    # Create Track 2
    res2 = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": "Web3 & Decentralized Apps", "description": "Smart contracts"},
        headers=owner["headers"],
    )
    assert res2.status_code == 201

    # List tracks
    tracks = client.get(f"/api/v1/events/{event_id}/tracks", headers=owner["headers"]).json()
    assert len(tracks) == 2
    names = [t["name"] for t in tracks]
    assert "AI & Machine Learning" in names
    assert "Web3 & Decentralized Apps" in names


def test_duplicate_track_rejection(client: TestClient):
    """Test that creating a track with duplicate name in the same event is rejected with 409."""
    owner = auth_user(client, "dup_track_owner@example.com", "duptrackowner")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Dup Track Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Dup Track Event", "event_type": "hackathon", "format": "online"},
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    # Track 1
    res1 = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": "Fintech Track"},
        headers=owner["headers"],
    )
    assert res1.status_code == 201

    # Track 1 duplicate name
    res2 = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": "Fintech Track"},
        headers=owner["headers"],
    )
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


def test_track_update_and_deletion(client: TestClient):
    """Test updating and deleting a track by owner, and rejection for unauthorized users."""
    owner = auth_user(client, "up_track_owner@example.com", "uptrackowner")
    stranger = auth_user(client, "up_stranger@example.com", "upstranger")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Update Track Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    event = client.post(
        f"/api/v1/organizations/{org_id}/events",
        json={"name": "Update Track Event", "event_type": "hackathon", "format": "online"},
        headers=owner["headers"],
    ).json()
    event_id = event["id"]

    track = client.post(
        f"/api/v1/events/{event_id}/tracks",
        json={"name": "Original Track", "description": "Original description"},
        headers=owner["headers"],
    ).json()
    track_id = track["id"]

    # Stranger cannot update track -> 403
    unauth_up = client.patch(
        f"/api/v1/tracks/{track_id}",
        json={"name": "Hacked Track"},
        headers=stranger["headers"],
    )
    assert unauth_up.status_code == 403

    # Owner can update track -> 200
    auth_up = client.patch(
        f"/api/v1/tracks/{track_id}",
        json={"name": "Modified Track", "description": "Updated description"},
        headers=owner["headers"],
    )
    assert auth_up.status_code == 200
    assert auth_up.json()["name"] == "Modified Track"
    assert auth_up.json()["description"] == "Updated description"

    # Stranger cannot delete track -> 403
    unauth_del = client.delete(f"/api/v1/tracks/{track_id}", headers=stranger["headers"])
    assert unauth_del.status_code == 403

    # Owner can delete track -> 200
    auth_del = client.delete(f"/api/v1/tracks/{track_id}", headers=owner["headers"])
    assert auth_del.status_code == 200

    # Listing tracks now shows 0
    tracks_after = client.get(f"/api/v1/events/{event_id}/tracks", headers=owner["headers"]).json()
    assert len(tracks_after) == 0

