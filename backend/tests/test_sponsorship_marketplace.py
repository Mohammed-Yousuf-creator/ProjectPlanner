import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


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


def setup_sponsorship_environment(client: TestClient):
    """Setup organizer organization, sponsor organization, outsider, and an event."""
    sfx = uuid.uuid4().hex[:6]

    # 1. Organizer Admin and Org
    org_admin = auth_user(client, f"org_admin_{sfx}@example.com", f"org_admin_{sfx}")
    res_org = client.post(
        "/api/v1/organizations",
        json={
            "name": f"Organizer Inc {sfx}",
            "organization_type": "organizer",
            "description": "Premier hackathon organizer",
            "website_url": "https://organizer.example.com",
        },
        headers=org_admin["headers"],
    )
    assert res_org.status_code == 201
    organizer_org = res_org.json()

    # 2. Member of Organizer Org (non-admin)
    org_member = auth_user(client, f"org_mem_{sfx}@example.com", f"org_mem_{sfx}")
    res_inv = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/members/invitations",
        json={"email": org_member["user"]["email"], "role": "member"},
        headers=org_admin["headers"],
    )
    assert res_inv.status_code == 201
    inv = res_inv.json()
    res_acc = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/members/invitations/{inv['id']}/accept",
        headers=org_member["headers"],
    )
    assert res_acc.status_code == 200

    # 3. Create Event for Organizer Org
    now = datetime.now(timezone.utc)
    res_ev = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/events",
        json={
            "name": f"Global Hackathon {sfx}",
            "slug": f"hack-{sfx}",
            "event_type": "hackathon",
            "format": "online",
            "starts_at": (now + timedelta(days=10)).isoformat(),
            "ends_at": (now + timedelta(days=12)).isoformat(),
            "timezone": "UTC",
        },
        headers=org_admin["headers"],
    )
    assert res_ev.status_code == 201
    event = res_ev.json()

    # Publish event
    client.post(f"/api/v1/events/{event['id']}/publish", headers=org_admin["headers"])

    # 4. Sponsor Admin and Org
    sponsor_admin = auth_user(client, f"spon_admin_{sfx}@example.com", f"spon_admin_{sfx}")
    res_spon = client.post(
        "/api/v1/organizations",
        json={
            "name": f"TechCorp Sponsor {sfx}",
            "organization_type": "sponsor",
            "description": "Global enterprise cloud provider offering sponsorships",
            "website_url": "https://techcorp.example.com",
            "logo_url": "https://techcorp.example.com/logo.png",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_spon.status_code == 201
    sponsor_org = res_spon.json()

    # 5. Outsider (unrelated user and org)
    outsider = auth_user(client, f"outsider_{sfx}@example.com", f"outsider_{sfx}")
    res_out = client.post(
        "/api/v1/organizations",
        json={
            "name": f"Outsider Org {sfx}",
            "organization_type": "both",
        },
        headers=outsider["headers"],
    )
    assert res_out.status_code == 201
    outsider_org = res_out.json()

    return {
        "organizer_org": organizer_org,
        "org_admin": org_admin,
        "org_member": org_member,
        "event": event,
        "sponsor_org": sponsor_org,
        "sponsor_admin": sponsor_admin,
        "outsider_org": outsider_org,
        "outsider": outsider,
    }


# ---------------------------------------------------------------------------
# 1. Discovery, Listings, and Packages Tests
# ---------------------------------------------------------------------------

def test_sponsorship_listing_lifecycle_and_discovery(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    org_member = s["org_member"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]
    sponsor_org = s["sponsor_org"]
    outsider = s["outsider"]

    # 1. Non-admin cannot create listing
    res_bad = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Title",
            "description": "Desc",
        },
        headers=org_member["headers"],
    )
    assert res_bad.status_code == 403

    # 2. Incompatible organization type: Organizer cannot create offering_sponsorship
    res_incomp = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "offering_sponsorship",
            "title": "Title",
            "description": "Desc",
        },
        headers=org_admin["headers"],
    )
    assert res_incomp.status_code == 400

    # 3. Seeking sponsors without event_id is rejected
    res_no_ev = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "title": "Title",
            "description": "Desc",
        },
        headers=org_admin["headers"],
    )
    assert res_no_ev.status_code == 400

    # 4. Organizer creates valid seeking_sponsors listing (starts as draft)
    res_lst = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Title Sponsor Opportunities",
            "description": "Reach 500+ top engineers and students",
            "audience_description": "Engineers, Data Scientists",
            "min_budget": 50000.0,
            "max_budget": 200000.0,
            "currency": "INR",
        },
        headers=org_admin["headers"],
    )
    assert res_lst.status_code == 201
    seeking_listing = res_lst.json()
    assert seeking_listing["status"] == "draft"

    # 5. Draft listing is hidden from public discovery and unauthorized users
    res_pub_disc = client.get("/api/v1/sponsorship-listings")
    assert not any(l["id"] == seeking_listing["id"] for l in res_pub_disc.json())

    res_pub_get = client.get(f"/api/v1/sponsorship-listings/{seeking_listing['id']}")
    assert res_pub_get.status_code == 404

    # 6. Listing owner can view draft listing
    res_owner_get = client.get(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}",
        headers=org_admin["headers"],
    )
    assert res_owner_get.status_code == 200

    # 7. Add packages to draft listing
    res_pkg1 = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/packages",
        json={
            "name": "Gold Sponsor",
            "description": "Keynote speaking slot and booth",
            "price": 100000.0,
            "currency": "INR",
            "benefits": ["Booth", "Keynote 10min", "Social Shoutout"],
            "available_slots": 3,
        },
        headers=org_admin["headers"],
    )
    assert res_pkg1.status_code == 201
    gold_pkg = res_pkg1.json()
    assert gold_pkg["name"] == "Gold Sponsor"

    res_pkg2 = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/packages",
        json={
            "name": "Silver Sponsor",
            "price": 50000.0,
            "currency": "INR",
            "benefits": ["Logo on website", "Virtual Booth"],
            "available_slots": 5,
        },
        headers=org_admin["headers"],
    )
    assert res_pkg2.status_code == 201
    silver_pkg = res_pkg2.json()

    # 8. Unreferenced package can be deleted
    res_del_pkg = client.delete(
        f"/api/v1/sponsorship-packages/{silver_pkg['id']}",
        headers=org_admin["headers"],
    )
    assert res_del_pkg.status_code == 200

    # 9. Publish seeking_sponsors listing
    res_pub = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/publish",
        headers=org_admin["headers"],
    )
    assert res_pub.status_code == 200
    assert res_pub.json()["status"] == "published"

    # 10. Sponsor organization creates offering_sponsorship listing
    res_spon_lst = client.post(
        f"/api/v1/organizations/{sponsor_org['id']}/sponsorship-listings",
        json={
            "listing_type": "offering_sponsorship",
            "title": "Cloud Credits & Developer Grant Program",
            "description": "TechCorp is offering up to $10,000 in cloud credits for university hackathons",
            "min_budget": 1000.0,
            "max_budget": 10000.0,
            "currency": "USD",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_spon_lst.status_code == 201
    offering_listing = res_spon_lst.json()

    # Add package to offering listing
    res_spon_pkg = client.post(
        f"/api/v1/sponsorship-listings/{offering_listing['id']}/packages",
        json={
            "name": "Cloud Grant Tier 1",
            "price": 5000.0,
            "currency": "USD",
            "benefits": ["$5,000 AWS Credits", "API Mentorship"],
            "available_slots": 10,
        },
        headers=sponsor_admin["headers"],
    )
    assert res_spon_pkg.status_code == 201

    # Publish offering listing
    client.post(
        f"/api/v1/sponsorship-listings/{offering_listing['id']}/publish",
        headers=sponsor_admin["headers"],
    )

    # 11. Public Discovery: GET /sponsors
    res_sponsors = client.get("/api/v1/sponsors")
    assert res_sponsors.status_code == 200
    sponsors = res_sponsors.json()
    assert len(sponsors) >= 1
    techcorp = next((s for s in sponsors if s["id"] == sponsor_org["id"]), None)
    assert techcorp is not None
    assert techcorp["published_listings_count"] >= 1
    assert techcorp["name"] == sponsor_org["name"]

    # 12. Public Discovery: GET /sponsorship-listings with filters
    res_listings = client.get(
        "/api/v1/sponsorship-listings",
        params={"listing_type": "seeking_sponsors", "currency": "INR"},
    )
    assert res_listings.status_code == 200
    assert len(res_listings.json()) >= 1
    found_seeking = next((l for l in res_listings.json() if l["id"] == seeking_listing["id"]), None)
    assert found_seeking is not None
    assert len(found_seeking["packages"]) == 1  # Only gold package remains


# ---------------------------------------------------------------------------
# 2. Proposals, Compatibility, and Active Duplicate Rejection
# ---------------------------------------------------------------------------

def test_sponsorship_proposals_and_validation(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]
    sponsor_org = s["sponsor_org"]
    outsider = s["outsider"]
    outsider_org = s["outsider_org"]

    # Setup seeking_sponsors listing
    res_lst = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Hackathon 2026 Sponsorship",
            "description": "Hackathon listing",
            "currency": "INR",
        },
        headers=org_admin["headers"],
    )
    seeking_listing = res_lst.json()

    res_pkg = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/packages",
        json={
            "name": "Platinum Tier",
            "price": 250000.0,
            "currency": "INR",
            "benefits": ["VIP Lounge", "Logo"],
            "available_slots": 2,
        },
        headers=org_admin["headers"],
    )
    platinum_pkg = res_pkg.json()
    client.post(f"/api/v1/sponsorship-listings/{seeking_listing['id']}/publish", headers=org_admin["headers"])

    # 1. Proposing to own organization is rejected
    res_self = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "package_id": platinum_pkg["id"],
            "message": "We propose to sponsor ourselves",
        },
        headers=org_admin["headers"],
    )
    # Organizer admin has no sponsor org, or if they try with self org, rejected
    assert res_self.status_code in (400, 403)

    # 2. Wrong event target for seeking_sponsors listing is rejected
    random_event_id = str(uuid.uuid4())
    res_bad_ev = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/proposals",
        json={
            "target_event_id": random_event_id,
            "package_id": platinum_pkg["id"],
            "message": "Hello",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_bad_ev.status_code in (400, 404)

    # 3. Sponsor proposes to organizer listing (Direction 1: Sponsor -> Seeking Organizer)
    res_prop = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "package_id": platinum_pkg["id"],
            "proposed_amount": 250000.0,
            "currency": "INR",
            "message": "TechCorp is thrilled to sponsor the Platinum Tier!",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_prop.status_code == 201
    proposal1 = res_prop.json()
    assert proposal1["status"] == "pending"
    assert float(proposal1["proposed_amount"]) == 250000.0
    assert proposal1["proposer_organization_id"] == sponsor_org["id"]

    # 4. Duplicate active proposal from same proposer for same listing & event is rejected
    res_dup = client.post(
        f"/api/v1/sponsorship-listings/{seeking_listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "package_id": platinum_pkg["id"],
            "message": "Duplicate proposal attempt",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_dup.status_code == 409

    # 5. Cannot delete a package that has proposals referencing it
    res_del_referenced = client.delete(
        f"/api/v1/sponsorship-packages/{platinum_pkg['id']}",
        headers=org_admin["headers"],
    )
    assert res_del_referenced.status_code == 400

    # 6. Unrelated organization cannot view proposal
    res_out_view = client.get(
        f"/api/v1/sponsorship-proposals/{proposal1['id']}",
        headers=outsider["headers"],
    )
    assert res_out_view.status_code == 403

    # 7. Both listing owner and proposer can view proposal
    res_owner_view = client.get(
        f"/api/v1/sponsorship-proposals/{proposal1['id']}",
        headers=org_admin["headers"],
    )
    assert res_owner_view.status_code == 200
    assert res_owner_view.json()["id"] == proposal1["id"]

    res_proposer_view = client.get(
        f"/api/v1/sponsorship-proposals/{proposal1['id']}",
        headers=sponsor_admin["headers"],
    )
    assert res_proposer_view.status_code == 200

    # 8. Organizer can view proposals list (incoming)
    res_org_props = client.get(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-proposals",
        params={"direction": "incoming"},
        headers=org_admin["headers"],
    )
    assert res_org_props.status_code == 200
    assert len(res_org_props.json()) == 1


# ---------------------------------------------------------------------------
# 3. Negotiations, Counteroffers, Acceptance, and Deal Finalization
# ---------------------------------------------------------------------------

def test_negotiations_counteroffers_and_deal_creation(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]
    sponsor_org = s["sponsor_org"]

    # Setup listing and proposal
    res_lst = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Negotiation Test Listing",
            "description": "Desc",
            "currency": "USD",
        },
        headers=org_admin["headers"],
    )
    listing = res_lst.json()
    client.post(f"/api/v1/sponsorship-listings/{listing['id']}/publish", headers=org_admin["headers"])

    res_prop = client.post(
        f"/api/v1/sponsorship-listings/{listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "proposed_amount": 10000.0,
            "currency": "USD",
            "message": "We offer $10,000 for title sponsorship",
        },
        headers=sponsor_admin["headers"],
    )
    proposal = res_prop.json()
    proposal_id = proposal["id"]

    # 1. Proposer cannot accept their own initial proposal!
    res_bad_accept = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/accept",
        headers=sponsor_admin["headers"],
    )
    assert res_bad_accept.status_code == 403

    # 2. Both parties can send normal negotiation messages
    res_msg1 = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/messages",
        json={
            "message_type": "message",
            "message": "Can you include a workshop slot in addition to the title booth?",
        },
        headers=org_admin["headers"],
    )
    assert res_msg1.status_code == 201

    res_msg2 = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/messages",
        json={
            "message_type": "message",
            "message": "Yes, we would be happy to host a workshop.",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_msg2.status_code == 201

    # Status remains pending because only messages were sent
    p_check = client.get(f"/api/v1/sponsorship-proposals/{proposal_id}", headers=org_admin["headers"]).json()
    assert p_check["status"] == "pending"
    assert len(p_check["negotiation_messages"]) == 2

    # 3. Organizer sends Counteroffer ($12,000)
    res_counter = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/messages",
        json={
            "message_type": "counter_offer",
            "message": "We can include the 45-min workshop slot for $12,000",
            "counter_amount": 12000.0,
            "currency": "USD",
            "counter_benefits": ["Workshop 45min", "Title Booth", "Logo on T-shirt"],
        },
        headers=org_admin["headers"],
    )
    assert res_counter.status_code == 201
    counter_msg = res_counter.json()
    assert float(counter_msg["counter_amount"]) == 12000.0

    # Proposal status transitioned to 'negotiating'
    p_check2 = client.get(f"/api/v1/sponsorship-proposals/{proposal_id}", headers=org_admin["headers"]).json()
    assert p_check2["status"] == "negotiating"

    # 4. Now Organizer (author of counteroffer) cannot accept their own counteroffer!
    res_bad_accept2 = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/accept",
        headers=org_admin["headers"],
    )
    assert res_bad_accept2.status_code == 403

    # 5. Sponsor (receiving party) accepts the counteroffer!
    res_accept = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/accept",
        headers=sponsor_admin["headers"],
    )
    assert res_accept.status_code == 200
    deal = res_accept.json()
    assert deal["status"] == "active"
    assert float(deal["agreed_amount"]) == 12000.0
    assert deal["currency"] == "USD"
    assert deal["sponsor_organization_id"] == sponsor_org["id"]
    assert deal["organizer_organization_id"] == organizer_org["id"]
    assert deal["event_id"] == event["id"]

    # 6. Proposal is now marked accepted
    p_check3 = client.get(f"/api/v1/sponsorship-proposals/{proposal_id}", headers=org_admin["headers"]).json()
    assert p_check3["status"] == "accepted"

    # 7. Duplicate accept rejected
    res_dup_accept = client.post(
        f"/api/v1/sponsorship-proposals/{proposal_id}/accept",
        headers=sponsor_admin["headers"],
    )
    assert res_dup_accept.status_code == 400


# ---------------------------------------------------------------------------
# 4. Deals, Deliverables, Status Transitions, and Notifications
# ---------------------------------------------------------------------------

def test_deals_deliverables_and_notifications(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]
    sponsor_org = s["sponsor_org"]
    outsider = s["outsider"]

    # Create listing, proposal and accept to generate deal
    res_lst = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Deliverables Flow Listing",
            "description": "Desc",
            "currency": "INR",
        },
        headers=org_admin["headers"],
    )
    listing = res_lst.json()
    client.post(f"/api/v1/sponsorship-listings/{listing['id']}/publish", headers=org_admin["headers"])

    res_prop = client.post(
        f"/api/v1/sponsorship-listings/{listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "proposed_amount": 75000.0,
            "currency": "INR",
            "message": "Let's do this",
        },
        headers=sponsor_admin["headers"],
    )
    prop = res_prop.json()

    res_accept = client.post(
        f"/api/v1/sponsorship-proposals/{prop['id']}/accept",
        headers=org_admin["headers"],
    )
    deal = res_accept.json()
    deal_id = deal["id"]

    # 1. Outsider cannot view deal
    res_out = client.get(f"/api/v1/sponsorship-deals/{deal_id}", headers=outsider["headers"])
    assert res_out.status_code == 403

    # 2. Both deal parties can view deal
    res_spon_deal = client.get(f"/api/v1/sponsorship-deals/{deal_id}", headers=sponsor_admin["headers"])
    assert res_spon_deal.status_code == 200

    # 3. Create Deliverable for Organizer (e.g. Logo on Banner)
    res_deliv1 = client.post(
        f"/api/v1/sponsorship-deals/{deal_id}/deliverables",
        json={
            "responsible_organization_id": organizer_org["id"],
            "title": "Display Sponsor Logo on Stage Banner",
            "description": "High-res logo print on 20x10ft main stage banner",
            "due_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
        },
        headers=sponsor_admin["headers"],
    )
    assert res_deliv1.status_code == 201
    deliv1 = res_deliv1.json()
    assert deliv1["status"] == "pending"

    # 4. Create Deliverable for Sponsor (e.g. Send Banner Assets)
    res_deliv2 = client.post(
        f"/api/v1/sponsorship-deals/{deal_id}/deliverables",
        json={
            "responsible_organization_id": sponsor_org["id"],
            "title": "Send SVG Vector Logo Assets",
            "description": "Send high-resolution brand vectors",
        },
        headers=org_admin["headers"],
    )
    assert res_deliv2.status_code == 201
    deliv2 = res_deliv2.json()

    # 5. Invalid evidence URL is rejected (must be http:// or https://)
    res_bad_url = client.patch(
        f"/api/v1/sponsorship-deliverables/{deliv2['id']}",
        json={"evidence_url": "ftp://files.example.com/logo.svg"},
        headers=sponsor_admin["headers"],
    )
    assert res_bad_url.status_code == 400

    # 6. Sponsor completes deliverable with valid evidence URL
    res_comp = client.patch(
        f"/api/v1/sponsorship-deliverables/{deliv2['id']}",
        json={
            "evidence_url": "https://assets.techcorp.example.com/logos/vector.svg",
            "status": "completed",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_comp.status_code == 200
    deliv2_updated = res_comp.json()
    assert deliv2_updated["status"] == "completed"
    assert deliv2_updated["completed_at"] is not None

    # 7. Check deal detail reflects deliverable counts
    res_deal_stats = client.get(f"/api/v1/sponsorship-deals/{deal_id}", headers=org_admin["headers"])
    assert res_deal_stats.json()["deliverables_count"] == 2
    assert res_deal_stats.json()["completed_deliverables_count"] == 1

    # 8. Complete Deal
    res_deal_done = client.patch(
        f"/api/v1/sponsorship-deals/{deal_id}/status",
        json={"status": "completed"},
        headers=org_admin["headers"],
    )
    assert res_deal_done.status_code == 200
    assert res_deal_done.json()["status"] == "completed"

    # Completed deal cannot be reopened
    res_reopen = client.patch(
        f"/api/v1/sponsorship-deals/{deal_id}/status",
        json={"status": "active"},
        headers=org_admin["headers"],
    )
    assert res_reopen.status_code == 400

    # 9. Verify in-app notifications were dispatched
    res_notifs_org = client.get("/api/v1/notifications/me", headers=org_admin["headers"])
    assert res_notifs_org.status_code == 200
    notif_types = [n["notification_type"] for n in res_notifs_org.json()]
    assert "sponsorship_proposal_received" in notif_types
    assert "sponsorship_deliverable_assigned" in notif_types
    assert "sponsorship_deliverable_completed" in notif_types

    res_notifs_spon = client.get("/api/v1/notifications/me", headers=sponsor_admin["headers"])
    assert res_notifs_spon.status_code == 200
    spon_types = [n["notification_type"] for n in res_notifs_spon.json()]
    assert "sponsorship_proposal_accepted" in spon_types
    assert "sponsorship_deliverable_assigned" in spon_types


# ---------------------------------------------------------------------------
# 5. Withdrawal and Rejection Workflows
# ---------------------------------------------------------------------------

def test_proposal_withdrawal_and_rejection(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]

    # Setup listing
    res_lst = client.post(
        f"/api/v1/organizations/{organizer_org['id']}/sponsorship-listings",
        json={
            "listing_type": "seeking_sponsors",
            "event_id": event["id"],
            "title": "Withdraw & Reject Listing",
            "description": "Desc",
            "currency": "INR",
        },
        headers=org_admin["headers"],
    )
    listing = res_lst.json()
    client.post(f"/api/v1/sponsorship-listings/{listing['id']}/publish", headers=org_admin["headers"])

    # 1. Proposer withdraws proposal
    res_prop1 = client.post(
        f"/api/v1/sponsorship-listings/{listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "proposed_amount": 40000.0,
            "currency": "INR",
            "message": "Will withdraw soon",
        },
        headers=sponsor_admin["headers"],
    )
    prop1 = res_prop1.json()

    # Organizer cannot withdraw sponsor's proposal
    res_bad_with = client.post(
        f"/api/v1/sponsorship-proposals/{prop1['id']}/withdraw",
        headers=org_admin["headers"],
    )
    assert res_bad_with.status_code == 403

    # Sponsor withdraws
    res_with = client.post(
        f"/api/v1/sponsorship-proposals/{prop1['id']}/withdraw",
        headers=sponsor_admin["headers"],
    )
    assert res_with.status_code == 200
    assert res_with.json()["status"] == "withdrawn"

    # Cannot withdraw twice or accept withdrawn proposal
    res_with2 = client.post(
        f"/api/v1/sponsorship-proposals/{prop1['id']}/withdraw",
        headers=sponsor_admin["headers"],
    )
    assert res_with2.status_code == 400

    # 2. Organizer rejects another proposal
    res_prop2 = client.post(
        f"/api/v1/sponsorship-listings/{listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "proposed_amount": 20000.0,
            "currency": "INR",
            "message": "Low ball proposal",
        },
        headers=sponsor_admin["headers"],
    )
    prop2 = res_prop2.json()

    # Sponsor cannot reject their own initial proposal
    res_bad_rej = client.post(
        f"/api/v1/sponsorship-proposals/{prop2['id']}/reject",
        headers=sponsor_admin["headers"],
    )
    assert res_bad_rej.status_code == 403

    # Organizer rejects proposal
    res_rej = client.post(
        f"/api/v1/sponsorship-proposals/{prop2['id']}/reject",
        headers=org_admin["headers"],
    )
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "rejected"


# ---------------------------------------------------------------------------
# 6. Direction 2: Organizer Proposing to Sponsor Offering Listing
# ---------------------------------------------------------------------------

def test_organizer_proposes_to_sponsor_offering(client: TestClient):
    s = setup_sponsorship_environment(client)
    org_admin = s["org_admin"]
    organizer_org = s["organizer_org"]
    event = s["event"]
    sponsor_admin = s["sponsor_admin"]
    sponsor_org = s["sponsor_org"]

    # 1. Sponsor creates offering_sponsorship listing with package
    res_spon_lst = client.post(
        f"/api/v1/organizations/{sponsor_org['id']}/sponsorship-listings",
        json={
            "listing_type": "offering_sponsorship",
            "title": "FastTrack Developer Grants",
            "description": "TechCorp offering cash and cloud grants for student hackathons",
            "min_budget": 5000.0,
            "max_budget": 20000.0,
            "currency": "USD",
        },
        headers=sponsor_admin["headers"],
    )
    assert res_spon_lst.status_code == 201
    offering_listing = res_spon_lst.json()

    res_pkg = client.post(
        f"/api/v1/sponsorship-listings/{offering_listing['id']}/packages",
        json={
            "name": "Standard Grant",
            "price": 10000.0,
            "currency": "USD",
            "benefits": ["$10,000 Cash Grant", "TechCorp Mentor on site"],
            "available_slots": 5,
        },
        headers=sponsor_admin["headers"],
    )
    assert res_pkg.status_code == 201
    grant_pkg = res_pkg.json()

    # Publish offering listing
    client.post(
        f"/api/v1/sponsorship-listings/{offering_listing['id']}/publish",
        headers=sponsor_admin["headers"],
    )

    # 2. Organizer proposes to Sponsor's offering listing referencing their event
    res_prop = client.post(
        f"/api/v1/sponsorship-listings/{offering_listing['id']}/proposals",
        json={
            "target_event_id": event["id"],
            "package_id": grant_pkg["id"],
            "proposed_amount": 10000.0,
            "currency": "USD",
            "message": "We would love to apply for the Standard Grant for our Global Hackathon!",
        },
        headers=org_admin["headers"],
    )
    assert res_prop.status_code == 201
    prop = res_prop.json()
    assert prop["status"] == "pending"
    assert prop["proposer_organization_id"] == organizer_org["id"]
    assert prop["target_event_id"] == event["id"]

    # 3. Sponsor accepts the organizer's application proposal
    res_accept = client.post(
        f"/api/v1/sponsorship-proposals/{prop['id']}/accept",
        headers=sponsor_admin["headers"],
    )
    assert res_accept.status_code == 200
    deal = res_accept.json()
    assert deal["status"] == "active"
    assert deal["sponsor_organization_id"] == sponsor_org["id"]
    assert deal["organizer_organization_id"] == organizer_org["id"]
    assert float(deal["agreed_amount"]) == 10000.0
    assert deal["currency"] == "USD"

