import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


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


def test_successful_organization_creation_and_owner_assignment(client: TestClient):
    """Test creating an organization assigns the creator as owner automatically."""
    owner = auth_user(client, "owner@example.com", "orgowner")
    payload = {
        "name": "Dev Masters",
        "slug": "dev-masters",
        "organization_type": "organizer",
        "description": "Tech conference organizer",
        "website_url": "https://devmasters.org",
        "contact_email": "contact@devmasters.org",
    }
    res = client.post("/api/v1/organizations", json=payload, headers=owner["headers"])
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Dev Masters"
    assert data["slug"] == "dev-masters"
    assert data["created_by_user_id"] == owner["user"]["id"]
    org_id = data["id"]

    # Check that owner is in the member list
    members_res = client.get(f"/api/v1/organizations/{org_id}/members", headers=owner["headers"])
    assert members_res.status_code == 200
    members = members_res.json()
    assert len(members) == 1
    assert members[0]["user_id"] == owner["user"]["id"]
    assert members[0]["role"] == "owner"
    assert members[0]["status"] == "active"


def test_duplicate_slug_rejection(client: TestClient):
    """Test that creating an organization with an existing slug is rejected with 409."""
    user = auth_user(client, "slug_user@example.com", "sluguser")
    payload1 = {
        "name": "First Org",
        "slug": "unique-slug",
        "organization_type": "organizer",
    }
    res1 = client.post("/api/v1/organizations", json=payload1, headers=user["headers"])
    assert res1.status_code == 201

    payload2 = {
        "name": "Second Org",
        "slug": "unique-slug",
        "organization_type": "sponsor",
    }
    res2 = client.post("/api/v1/organizations", json=payload2, headers=user["headers"])
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


def test_organization_listing_for_current_user(client: TestClient):
    """Test GET /organizations/mine returns all organizations the user belongs to with role and status."""
    user1 = auth_user(client, "u1@example.com", "userone")
    user2 = auth_user(client, "u2@example.com", "usertwo")

    # User 1 creates Org A
    res_a = client.post(
        "/api/v1/organizations",
        json={"name": "Org A", "organization_type": "organizer"},
        headers=user1["headers"],
    )
    assert res_a.status_code == 201

    # User 2 creates Org B
    res_b = client.post(
        "/api/v1/organizations",
        json={"name": "Org B", "organization_type": "sponsor"},
        headers=user2["headers"],
    )
    assert res_b.status_code == 201

    # User 1 should only see Org A
    mine_1 = client.get("/api/v1/organizations/mine", headers=user1["headers"]).json()
    assert len(mine_1) == 1
    assert mine_1[0]["name"] == "Org A"
    assert mine_1[0]["my_role"] == "owner"
    assert mine_1[0]["my_status"] == "active"

    # User 2 should only see Org B
    mine_2 = client.get("/api/v1/organizations/mine", headers=user2["headers"]).json()
    assert len(mine_2) == 1
    assert mine_2[0]["name"] == "Org B"
    assert mine_2[0]["my_role"] == "owner"


def test_organization_update_by_owner_and_unauthorized_rejection(client: TestClient):
    """Test owner can update organization while non-members/regular members are rejected."""
    owner = auth_user(client, "org_owner@example.com", "main_owner")
    stranger = auth_user(client, "stranger@example.com", "stranger")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Alpha Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    # Stranger cannot update (403 or 404)
    update_payload = {"description": "Updated by stranger"}
    res_unauth = client.patch(
        f"/api/v1/organizations/{org_id}",
        json=update_payload,
        headers=stranger["headers"],
    )
    assert res_unauth.status_code == 403

    # Owner can update
    update_payload_valid = {"description": "Legitimate update by owner", "name": "Alpha Org Pro"}
    res_auth = client.patch(
        f"/api/v1/organizations/{org_id}",
        json=update_payload_valid,
        headers=owner["headers"],
    )
    assert res_auth.status_code == 200
    assert res_auth.json()["description"] == "Legitimate update by owner"
    assert res_auth.json()["name"] == "Alpha Org Pro"


def test_member_invitation_accept_and_reject(client: TestClient):
    """Test inviting a user as member, accepting invitation, and rejecting invitation."""
    owner = auth_user(client, "inv_owner@example.com", "invowner")
    invitee1 = auth_user(client, "invitee1@example.com", "invitee1")
    invitee2 = auth_user(client, "invitee2@example.com", "invitee2")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Inv Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    # 1. Invite invitee1 as member
    inv1_res = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations",
        json={"email": "invitee1@example.com", "role": "member"},
        headers=owner["headers"],
    )
    assert inv1_res.status_code == 201
    inv1_data = inv1_res.json()
    assert inv1_data["status"] == "invited"
    assert inv1_data["role"] == "member"
    membership1_id = inv1_data["id"]

    # Invitee 2 cannot accept invitee1's invitation (403)
    unauth_accept = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{membership1_id}/accept",
        headers=invitee2["headers"],
    )
    assert unauth_accept.status_code == 403

    # Invitee 1 accepts their invitation
    accept_res = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{membership1_id}/accept",
        headers=invitee1["headers"],
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["status"] == "active"
    assert accept_res.json()["joined_at"] is not None

    # Now invitee 1 is an active member
    members = client.get(f"/api/v1/organizations/{org_id}/members", headers=owner["headers"]).json()
    assert len(members) == 2
    user_ids = [m["user_id"] for m in members]
    assert invitee1["user"]["id"] in user_ids

    # 2. Invite invitee2 as admin and reject
    inv2_res = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations",
        json={"email": "invitee2@example.com", "role": "admin"},
        headers=owner["headers"],
    )
    assert inv2_res.status_code == 201
    membership2_id = inv2_res.json()["id"]

    # Invitee 2 rejects invitation
    reject_res = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{membership2_id}/reject",
        headers=invitee2["headers"],
    )
    assert reject_res.status_code == 200

    # Membership should no longer exist
    members_after = client.get(f"/api/v1/organizations/{org_id}/members", headers=owner["headers"]).json()
    assert len(members_after) == 2
    assert invitee2["user"]["id"] not in [m["user_id"] for m in members_after]


def test_unauthorized_membership_changes_and_member_removal(client: TestClient):
    """Test removing a member, preventing admins from removing owners, and preventing removal of last owner."""
    owner = auth_user(client, "rem_owner@example.com", "remowner")
    admin = auth_user(client, "rem_admin@example.com", "remadmin")
    member = auth_user(client, "rem_member@example.com", "remmember")

    org = client.post(
        "/api/v1/organizations",
        json={"name": "Removal Org", "organization_type": "organizer"},
        headers=owner["headers"],
    ).json()
    org_id = org["id"]

    # Add admin
    inv_admin = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations",
        json={"email": "rem_admin@example.com", "role": "admin"},
        headers=owner["headers"],
    ).json()
    client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{inv_admin['id']}/accept",
        headers=admin["headers"],
    )

    # Add member
    inv_mem = client.post(
        f"/api/v1/organizations/{org_id}/members/invitations",
        json={"email": "rem_member@example.com", "role": "member"},
        headers=owner["headers"],
    ).json()
    client.post(
        f"/api/v1/organizations/{org_id}/members/invitations/{inv_mem['id']}/accept",
        headers=member["headers"],
    )

    # Regular member cannot remove members
    res_mem_remove = client.delete(
        f"/api/v1/organizations/{org_id}/members/{admin['user']['id']}",
        headers=member["headers"],
    )
    assert res_mem_remove.status_code == 403

    # Admin cannot remove the owner
    res_admin_remove_owner = client.delete(
        f"/api/v1/organizations/{org_id}/members/{owner['user']['id']}",
        headers=admin["headers"],
    )
    assert res_admin_remove_owner.status_code == 403
    assert "owner" in res_admin_remove_owner.json()["detail"].lower()

    # Owner cannot remove the last owner (themselves)
    res_owner_remove_self = client.delete(
        f"/api/v1/organizations/{org_id}/members/{owner['user']['id']}",
        headers=owner["headers"],
    )
    assert res_owner_remove_self.status_code == 400
    assert "last remaining owner" in res_owner_remove_self.json()["detail"].lower()

    # Admin CAN remove regular member
    res_admin_remove_mem = client.delete(
        f"/api/v1/organizations/{org_id}/members/{member['user']['id']}",
        headers=admin["headers"],
    )
    assert res_admin_remove_mem.status_code == 200

    # Member should now be gone
    members = client.get(f"/api/v1/organizations/{org_id}/members", headers=owner["headers"]).json()
    assert len(members) == 2
    assert member["user"]["id"] not in [m["user_id"] for m in members]

