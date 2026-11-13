from datetime import datetime, timedelta, timezone
import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.event import Event, EventMembership, EventTrack
from app.models.organization import Organization, OrganizationMember
from app.models.team import Team, TeamInvitation, TeamMember
from app.models.user import User, UserProfile


def test_all_10_tables_registered():
    """Verify that all 15 tables (10 foundation + 5 team collaboration) are registered with Base.metadata."""
    expected_tables = {
        "users",
        "user_profiles",
        "organizations",
        "organization_members",
        "events",
        "event_memberships",
        "event_tracks",
        "teams",
        "team_members",
        "team_invitations",
        "team_tasks",
        "team_task_assignees",
        "team_messages",
        "stored_files",
        "team_message_attachments",
    }
    actual_tables = set(Base.metadata.tables.keys())
    assert actual_tables == expected_tables, f"Difference: {actual_tables.symmetric_difference(expected_tables)}"


def test_foreign_keys_enforced(db_session: Session):
    """Verify that foreign key constraints are enforced in SQLite."""
    # Attempt inserting a UserProfile referencing a non-existent user
    orphan_profile = UserProfile(
        user_id=uuid.uuid4(),
        display_name="Ghost User",
    )
    db_session.add(orphan_profile)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Attempt inserting an Event referencing a non-existent organization
    user = User(
        id=uuid.uuid4(),
        email="fk_test@example.com",
        username="fk_test",
        password_hash="hash",
    )
    db_session.add(user)
    db_session.commit()

    orphan_event = Event(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),  # Does not exist
        created_by_user_id=user.id,
        name="Ghost Event",
        slug="ghost-event",
        event_type="hackathon",
        format="online",
        timezone="UTC",
    )
    db_session.add(orphan_event)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_unique_constraints(db_session: Session):
    """Verify that unique constraints across tables are enforced."""
    user1 = User(
        id=uuid.uuid4(),
        email="unique1@example.com",
        username="unique1",
        password_hash="hash",
    )
    db_session.add(user1)
    db_session.commit()

    # 1. Duplicate email on User
    dup_user_email = User(
        id=uuid.uuid4(),
        email="unique1@example.com",
        username="unique2",
        password_hash="hash",
    )
    db_session.add(dup_user_email)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 2. Duplicate organization slug
    org1 = Organization(
        id=uuid.uuid4(),
        name="Org One",
        slug="org-unique-slug",
        organization_type="organizer",
        created_by_user_id=user1.id,
    )
    db_session.add(org1)
    db_session.commit()

    org2 = Organization(
        id=uuid.uuid4(),
        name="Org Two",
        slug="org-unique-slug",  # Duplicate slug
        organization_type="sponsor",
        created_by_user_id=user1.id,
    )
    db_session.add(org2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 3. Duplicate organization member (org_id, user_id)
    member1 = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org1.id,
        user_id=user1.id,
        role="owner",
    )
    db_session.add(member1)
    db_session.commit()

    member_dup = OrganizationMember(
        id=uuid.uuid4(),
        organization_id=org1.id,
        user_id=user1.id,
        role="admin",
    )
    db_session.add(member_dup)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_check_constraints(db_session: Session):
    """Verify check constraints for events and team invitations."""
    user = User(
        id=uuid.uuid4(),
        email="cc_test@example.com",
        username="cc_test",
        password_hash="hash",
    )
    org = Organization(
        id=uuid.uuid4(),
        name="CC Org",
        slug="cc-org",
        organization_type="organizer",
        created_by_user_id=user.id,
    )
    db_session.add(user)
    db_session.add(org)
    db_session.commit()

    # 1. Min team size < 1 must fail
    invalid_event1 = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Bad Min Event",
        slug="bad-min-event",
        event_type="hackathon",
        format="online",
        timezone="UTC",
        min_team_size=0,
        max_team_size=4,
    )
    db_session.add(invalid_event1)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 2. Max team size < min team size must fail
    invalid_event2 = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Bad Max Event",
        slug="bad-max-event",
        event_type="hackathon",
        format="online",
        timezone="UTC",
        min_team_size=5,
        max_team_size=2,
    )
    db_session.add(invalid_event2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 3. Invalid format must fail
    invalid_format_event = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Bad Format Event",
        slug="bad-format-event",
        event_type="hackathon",
        format="metaverse",  # Not in ('online', 'offline', 'hybrid')
        timezone="UTC",
    )
    db_session.add(invalid_format_event)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Valid event for testing team invitations
    valid_event = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Good Event",
        slug="good-event",
        event_type="hackathon",
        format="online",
        timezone="UTC",
        min_team_size=1,
        max_team_size=4,
    )
    team = Team(
        id=uuid.uuid4(),
        event_id=valid_event.id,
        name="Alpha Team",
        created_by_user_id=user.id,
    )
    db_session.add(valid_event)
    db_session.add(team)
    db_session.commit()

    # 4. Team invitation: both invitee_user_id and invitee_email provided -> must fail
    inv_both = TeamInvitation(
        id=uuid.uuid4(),
        team_id=team.id,
        invited_by_user_id=user.id,
        invitee_user_id=user.id,
        invitee_email="invitee@example.com",
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add(inv_both)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 5. Team invitation: neither invitee_user_id nor invitee_email provided -> must fail
    inv_neither = TeamInvitation(
        id=uuid.uuid4(),
        team_id=team.id,
        invited_by_user_id=user.id,
        invitee_user_id=None,
        invitee_email=None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add(inv_neither)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # 6. Team invitation: exactly one provided -> succeeds
    inv_valid = TeamInvitation(
        id=uuid.uuid4(),
        team_id=team.id,
        invited_by_user_id=user.id,
        invitee_email="invitee@example.com",
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add(inv_valid)
    db_session.commit()
    assert inv_valid.id is not None


def test_user_profile_one_to_one(db_session: Session):
    """Verify one-to-one relationship and cascade between User and UserProfile."""
    user = User(
        id=uuid.uuid4(),
        email="o2o_user@example.com",
        username="o2o_user",
        password_hash="hash",
    )
    profile = UserProfile(
        user_id=user.id,
        display_name="O2O Tester",
        headline="Software Engineer",
    )
    user.profile = profile

    db_session.add(user)
    db_session.commit()

    # Test bidirectional navigation
    loaded_user = db_session.get(User, user.id)
    assert loaded_user.profile is not None
    assert loaded_user.profile.display_name == "O2O Tester"
    assert loaded_user.profile.user.id == user.id

    # Test cascade delete: deleting user deletes profile
    db_session.delete(loaded_user)
    db_session.commit()

    assert db_session.get(UserProfile, user.id) is None


def test_event_organization_relationship(db_session: Session):
    """Verify bidirectional relationship between Event and Organization."""
    user = User(
        id=uuid.uuid4(),
        email="org_rel_user@example.com",
        username="org_rel_user",
        password_hash="hash",
    )
    org = Organization(
        id=uuid.uuid4(),
        name="Host Org",
        slug="host-org",
        organization_type="organizer",
        created_by_user_id=user.id,
    )
    event = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Host Hackathon",
        slug="host-hackathon",
        event_type="hackathon",
        format="online",
        timezone="UTC",
    )
    org.events.append(event)

    db_session.add_all([user, org])
    db_session.commit()

    loaded_org = db_session.get(Organization, org.id)
    assert len(loaded_org.events) == 1
    assert loaded_org.events[0].id == event.id
    assert loaded_org.events[0].organization.name == "Host Org"


def test_team_event_relationship(db_session: Session):
    """Verify bidirectional relationship between Team and Event."""
    user = User(
        id=uuid.uuid4(),
        email="team_ev_user@example.com",
        username="team_ev_user",
        password_hash="hash",
    )
    org = Organization(
        id=uuid.uuid4(),
        name="Team Org",
        slug="team-org",
        organization_type="organizer",
        created_by_user_id=user.id,
    )
    event = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Team Event",
        slug="team-event",
        event_type="hackathon",
        format="hybrid",
        timezone="UTC",
    )
    team = Team(
        id=uuid.uuid4(),
        event_id=event.id,
        name="Rocket Team",
        created_by_user_id=user.id,
    )
    event.teams.append(team)

    db_session.add_all([user, org, event])
    db_session.commit()

    loaded_event = db_session.get(Event, event.id)
    assert len(loaded_event.teams) == 1
    assert loaded_event.teams[0].name == "Rocket Team"
    assert loaded_event.teams[0].event.id == event.id


def test_team_membership_relationship(db_session: Session):
    """Verify team membership relationships with user and team."""
    user = User(
        id=uuid.uuid4(),
        email="member_user@example.com",
        username="member_user",
        password_hash="hash",
    )
    org = Organization(
        id=uuid.uuid4(),
        name="Membership Org",
        slug="membership-org",
        organization_type="organizer",
        created_by_user_id=user.id,
    )
    event = Event(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        name="Membership Event",
        slug="membership-event",
        event_type="hackathon",
        format="online",
        timezone="UTC",
    )
    team = Team(
        id=uuid.uuid4(),
        event_id=event.id,
        name="Delta Force",
        created_by_user_id=user.id,
    )
    member = TeamMember(
        id=uuid.uuid4(),
        team_id=team.id,
        user_id=user.id,
        role="owner",
        status="active",
    )
    team.members.append(member)

    db_session.add_all([user, org, event, team])
    db_session.commit()

    loaded_team = db_session.get(Team, team.id)
    assert len(loaded_team.members) == 1
    assert loaded_team.members[0].user_id == user.id
    assert loaded_team.members[0].role == "owner"

    loaded_user = db_session.get(User, user.id)
    assert len(loaded_user.team_memberships) == 1
    assert loaded_user.team_memberships[0].team_id == team.id

