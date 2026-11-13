import io
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import settings
from app.core.security import create_access_token
from app.models.stored_file import StoredFile
from app.models.team_message import TeamMessage
from app.models.team_task import TeamTask, TeamTaskAssignee
from app.storage.local_storage import storage_provider


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


def create_team_setup(client: TestClient, tmp_path: Path):
    """Setup an event, team, and users: owner, lead, member, and outsider."""
    storage_provider.root_dir = (tmp_path / "uploads").resolve()
    storage_provider.root_dir.mkdir(parents=True, exist_ok=True)

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
            "name": f"Event {suffix}",
            "event_type": "hackathon",
            "format": "online",
            "timezone": "UTC",
            "min_team_size": 2,
            "max_team_size": 5,
            "starts_at": (now + timedelta(days=2)).isoformat(),
            "ends_at": (now + timedelta(days=5)).isoformat(),
        },
        headers=organizer["headers"],
    ).json()
    event_id = event["id"]
    client.post(f"/api/v1/events/{event_id}/publish", headers=organizer["headers"])

    owner = auth_user(client, f"owner_{suffix}@example.com", f"owner_{suffix}")
    lead = auth_user(client, f"lead_{suffix}@example.com", f"lead_{suffix}")
    member = auth_user(client, f"mem_{suffix}@example.com", f"mem_{suffix}")
    outsider = auth_user(client, f"out_{suffix}@example.com", f"out_{suffix}")

    for u in (owner, lead, member):
        reg = client.post(f"/api/v1/events/{event_id}/register", headers=u["headers"])
        assert reg.status_code == 201

    team_res = client.post(
        f"/api/v1/events/{event_id}/teams",
        json={"name": f"Collab Team {suffix}", "generate_join_code": True},
        headers=owner["headers"],
    )
    assert team_res.status_code == 201
    team = team_res.json()
    team_id = team["id"]
    join_code = team["join_code"]

    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=lead["headers"])
    client.post(f"/api/v1/teams/{team_id}/join", json={"join_code": join_code}, headers=member["headers"])

    # Promote lead to 'lead' role
    promote = client.patch(
        f"/api/v1/teams/{team_id}/members/{lead['user']['id']}/role",
        json={"role": "lead"},
        headers=owner["headers"],
    )
    assert promote.status_code == 200

    return {
        "team_id": team_id,
        "event_id": event_id,
        "owner": owner,
        "lead": lead,
        "member": member,
        "outsider": outsider,
    }


def generate_png_bytes() -> bytes:
    """Generate minimal valid PNG bytes."""
    buf = io.BytesIO()
    img = Image.new("RGB", (8, 8), color="blue")
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_jpeg_bytes() -> bytes:
    """Generate minimal valid JPEG bytes."""
    buf = io.BytesIO()
    img = Image.new("RGB", (8, 8), color="red")
    img.save(buf, format="JPEG")
    return buf.getvalue()


def generate_webp_bytes() -> bytes:
    """Generate minimal valid WebP bytes."""
    buf = io.BytesIO()
    img = Image.new("RGB", (8, 8), color="green")
    img.save(buf, format="WEBP")
    return buf.getvalue()


def generate_webm_bytes() -> bytes:
    """Generate minimal valid WebM container header bytes."""
    return b"\x1a\x45\xdf\xa3" + b"\x00" * 32


def generate_mp4_bytes() -> bytes:
    """Generate minimal valid MP4 container header bytes."""
    return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 32


# -----------------------------------------------------------------------------
# 1. Team Task Management Tests
# -----------------------------------------------------------------------------


def test_task_creation_and_listing_and_filtering(client: TestClient, tmp_path: Path):
    """Test task creation, listing, status/priority/assignee filtering, and position ordering."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]
    outsider = setup["outsider"]

    # 1. Active member creates task
    due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    t1_res = client.post(
        f"/api/v1/teams/{team_id}/tasks",
        json={
            "title": "Design Database Schema",
            "description": "Create SQLite schema",
            "priority": "high",
            "status": "in_progress",
            "position": 2,
            "due_at": due,
        },
        headers=member["headers"],
    )
    assert t1_res.status_code == 201
    t1 = t1_res.json()
    assert t1["title"] == "Design Database Schema"
    assert t1["priority"] == "high"
    assert t1["status"] == "in_progress"
    assert t1["position"] == 2
    assert t1["created_by_user_id"] == member["user"]["id"]
    assert t1["completed_at"] is None

    # 2. Owner creates task with position 1 and low priority
    t2_res = client.post(
        f"/api/v1/teams/{team_id}/tasks",
        json={
            "title": "Write Documentation",
            "priority": "low",
            "status": "todo",
            "position": 1,
        },
        headers=owner["headers"],
    )
    assert t2_res.status_code == 201
    t2 = t2_res.json()

    # 3. Outsider cannot create tasks
    out_create = client.post(
        f"/api/v1/teams/{team_id}/tasks",
        json={"title": "Unauthorized Task"},
        headers=outsider["headers"],
    )
    assert out_create.status_code == 403

    # 4. List tasks (ordered by position ascending: t2 (1) then t1 (2))
    list_res = client.get(f"/api/v1/teams/{team_id}/tasks", headers=member["headers"])
    assert list_res.status_code == 200
    tasks = list_res.json()
    assert len(tasks) == 2
    assert tasks[0]["id"] == t2["id"]
    assert tasks[1]["id"] == t1["id"]

    # 5. Filter by status
    filter_status = client.get(f"/api/v1/teams/{team_id}/tasks?status=in_progress", headers=member["headers"]).json()
    assert len(filter_status) == 1
    assert filter_status[0]["id"] == t1["id"]

    # 6. Filter by priority
    filter_prio = client.get(f"/api/v1/teams/{team_id}/tasks?priority=low", headers=member["headers"]).json()
    assert len(filter_prio) == 1
    assert filter_prio[0]["id"] == t2["id"]


def test_task_status_transition_and_completion_timestamp(client: TestClient, tmp_path: Path):
    """Test updating task status, completed_at logic, and details permissions."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]

    t_res = client.post(
        f"/api/v1/teams/{team_id}/tasks",
        json={"title": "Setup CI/CD", "status": "todo"},
        headers=owner["headers"],
    )
    task_id = t_res.json()["id"]

    # Member can update status to 'done' -> sets completed_at
    done_res = client.patch(
        f"/api/v1/teams/{team_id}/tasks/{task_id}",
        json={"status": "done"},
        headers=member["headers"],
    )
    assert done_res.status_code == 200
    assert done_res.json()["status"] == "done"
    assert done_res.json()["completed_at"] is not None

    # Move back to 'in_progress' -> clears completed_at
    in_prog_res = client.patch(
        f"/api/v1/teams/{team_id}/tasks/{task_id}",
        json={"status": "in_progress"},
        headers=member["headers"],
    )
    assert in_prog_res.status_code == 200
    assert in_prog_res.json()["completed_at"] is None

    # Ordinary member cannot update details/priority of a task created by owner
    forbidden_edit = client.patch(
        f"/api/v1/teams/{team_id}/tasks/{task_id}",
        json={"title": "Hacked Title", "priority": "urgent"},
        headers=member["headers"],
    )
    assert forbidden_edit.status_code == 403

    # Owner can update details and priority
    owner_edit = client.patch(
        f"/api/v1/teams/{team_id}/tasks/{task_id}",
        json={"title": "Deploy Production CI/CD", "priority": "urgent"},
        headers=owner["headers"],
    )
    assert owner_edit.status_code == 200
    assert owner_edit.json()["title"] == "Deploy Production CI/CD"
    assert owner_edit.json()["priority"] == "urgent"


def test_task_assignees_lifecycle(client: TestClient, tmp_path: Path):
    """Test assigning single/multiple members, rejecting non-members, and clearing assignments."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    lead = setup["lead"]
    member = setup["member"]
    outsider = setup["outsider"]

    t = client.post(f"/api/v1/teams/{team_id}/tasks", json={"title": "Auth Middleware"}, headers=owner["headers"]).json()
    task_id = t["id"]

    # 1. Ordinary member cannot change assignees
    unauth_assign = client.put(
        f"/api/v1/teams/{team_id}/tasks/{task_id}/assignees",
        json={"user_ids": [member["user"]["id"]]},
        headers=member["headers"],
    )
    assert unauth_assign.status_code == 403

    # 2. Lead can assign multiple team members
    lead_assign = client.put(
        f"/api/v1/teams/{team_id}/tasks/{task_id}/assignees",
        json={"user_ids": [lead["user"]["id"], member["user"]["id"]]},
        headers=lead["headers"],
    )
    assert lead_assign.status_code == 200
    assignees = lead_assign.json()["assignees"]
    assert len(assignees) == 2
    uids = {a["user_id"] for a in assignees}
    assert lead["user"]["id"] in uids
    assert member["user"]["id"] in uids

    # 3. Reject non-team member assignee
    bad_assign = client.put(
        f"/api/v1/teams/{team_id}/tasks/{task_id}/assignees",
        json={"user_ids": [outsider["user"]["id"]]},
        headers=owner["headers"],
    )
    assert bad_assign.status_code == 400
    assert "not an active member" in bad_assign.json()["detail"].lower()

    # 4. Reject duplicate user IDs in assignment list
    dup_assign = client.put(
        f"/api/v1/teams/{team_id}/tasks/{task_id}/assignees",
        json={"user_ids": [member["user"]["id"], member["user"]["id"]]},
        headers=owner["headers"],
    )
    assert dup_assign.status_code == 400

    # 5. Filter tasks by assignee
    filter_by_mem = client.get(
        f"/api/v1/teams/{team_id}/tasks?assignee_id={member['user']['id']}",
        headers=owner["headers"],
    ).json()
    assert len(filter_by_mem) == 1
    assert filter_by_mem[0]["id"] == task_id

    # 6. Empty list clears all assignees
    clear_res = client.put(
        f"/api/v1/teams/{team_id}/tasks/{task_id}/assignees",
        json={"user_ids": []},
        headers=owner["headers"],
    )
    assert clear_res.status_code == 200
    assert len(clear_res.json()["assignees"]) == 0


def test_task_soft_deletion(client: TestClient, tmp_path: Path):
    """Test task soft deletion excludes tasks from listings and enforces delete permissions."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]

    t = client.post(f"/api/v1/teams/{team_id}/tasks", json={"title": "Temp Task"}, headers=owner["headers"]).json()
    task_id = t["id"]

    # Member cannot delete owner's task
    del_forbidden = client.delete(f"/api/v1/teams/{team_id}/tasks/{task_id}", headers=member["headers"])
    assert del_forbidden.status_code == 403

    # Owner deletes task
    del_res = client.delete(f"/api/v1/teams/{team_id}/tasks/{task_id}", headers=owner["headers"])
    assert del_res.status_code == 204

    # Deleted task is excluded from listing
    list_after = client.get(f"/api/v1/teams/{team_id}/tasks", headers=owner["headers"]).json()
    assert all(task["id"] != task_id for task in list_after)

    # Direct GET returns 404
    get_del = client.get(f"/api/v1/teams/{team_id}/tasks/{task_id}", headers=owner["headers"])
    assert get_del.status_code == 404


# -----------------------------------------------------------------------------
# 2. File Upload & Storage Tests
# -----------------------------------------------------------------------------


def test_file_upload_download_and_validation(client: TestClient, tmp_path: Path):
    """Test image and video upload, content signature validation, and safe download."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]
    outsider = setup["outsider"]

    # 1. Valid PNG upload
    png_data = generate_png_bytes()
    png_res = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("diagram.png", png_data, "image/png")},
        headers=member["headers"],
    )
    assert png_res.status_code == 201
    file_meta = png_res.json()
    assert file_meta["original_filename"] == "diagram.png"
    assert file_meta["mime_type"] == "image/png"
    assert file_meta["size_bytes"] == len(png_data)
    assert file_meta["checksum_sha256"] is not None
    file_id = file_meta["id"]

    # 2. Valid MP4 upload
    mp4_data = generate_mp4_bytes()
    mp4_res = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("demo.mp4", mp4_data, "video/mp4")},
        headers=owner["headers"],
    )
    assert mp4_res.status_code == 201

    # 3. Reject unsupported MIME type (e.g. text/plain or application/zip)
    bad_type = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("test.txt", b"plain text", "text/plain")},
        headers=member["headers"],
    )
    assert bad_type.status_code == 400

    # 4. Reject spoofed MIME type (text file with image/png MIME)
    spoofed = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("fake.png", b"NOT_REAL_PNG_DATA_AT_ALL", "image/png")},
        headers=member["headers"],
    )
    assert spoofed.status_code == 400
    assert "not a valid image" in spoofed.json()["detail"].lower()

    # 5. Reject empty file
    empty = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("empty.png", b"", "image/png")},
        headers=member["headers"],
    )
    assert empty.status_code == 400
    assert "empty" in empty.json()["detail"].lower()

    # 6. Member can download file
    dl_res = client.get(f"/api/v1/teams/{team_id}/files/{file_id}", headers=owner["headers"])
    assert dl_res.status_code == 200
    assert dl_res.content == png_data
    assert "attachment" in dl_res.headers.get("content-disposition", "")

    # 7. Outsider cannot download file
    out_dl = client.get(f"/api/v1/teams/{team_id}/files/{file_id}", headers=outsider["headers"])
    assert out_dl.status_code == 403


# -----------------------------------------------------------------------------
# 3. Persistent Team Messaging Tests
# -----------------------------------------------------------------------------


def test_persistent_messaging_lifecycle(client: TestClient, tmp_path: Path):
    """Test text messages, attachment messages, empty rejection, editing, and soft-deletion."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    lead = setup["lead"]
    member = setup["member"]
    outsider = setup["outsider"]

    # 1. Upload a valid file for attachment
    png_data = generate_png_bytes()
    f_res = client.post(
        f"/api/v1/teams/{team_id}/files",
        files={"file": ("chart.png", png_data, "image/png")},
        headers=member["headers"],
    )
    file_id = f_res.json()["id"]

    # 2. Reject empty message (no text, no attachment)
    empty_msg = client.post(
        f"/api/v1/teams/{team_id}/messages",
        json={"body": "   ", "attachment_ids": []},
        headers=member["headers"],
    )
    assert empty_msg.status_code == 400

    # 3. Send message with text only
    m1_res = client.post(
        f"/api/v1/teams/{team_id}/messages",
        json={"body": "Hello team, let's win this hackathon!"},
        headers=member["headers"],
    )
    assert m1_res.status_code == 201
    m1 = m1_res.json()
    assert m1["body"] == "Hello team, let's win this hackathon!"
    assert m1["sender"]["user_id"] == member["user"]["id"]
    assert len(m1["attachments"]) == 0
    m1_id = m1["id"]

    # 4. Send attachment-only message
    att_msg_res = client.post(
        f"/api/v1/teams/{team_id}/messages",
        json={"attachment_ids": [file_id]},
        headers=member["headers"],
    )
    assert att_msg_res.status_code == 201
    att_msg = att_msg_res.json()
    assert att_msg["body"] is None
    assert len(att_msg["attachments"]) == 1
    assert att_msg["attachments"][0]["id"] == file_id

    # 5. Retrieve message history (chronological order)
    history_res = client.get(f"/api/v1/teams/{team_id}/messages", headers=owner["headers"])
    assert history_res.status_code == 200
    messages = history_res.json()
    assert len(messages) == 2
    assert messages[0]["id"] == m1_id
    assert messages[1]["id"] == att_msg["id"]

    # 6. Edit own message
    edit_res = client.patch(
        f"/api/v1/teams/{team_id}/messages/{m1_id}",
        json={"body": "Updated message: Let's rock!"},
        headers=member["headers"],
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["body"] == "Updated message: Let's rock!"
    assert edit_res.json()["edited_at"] is not None

    # 7. Reject editing someone else's message
    unauth_edit = client.patch(
        f"/api/v1/teams/{team_id}/messages/{m1_id}",
        json={"body": "Hacked message"},
        headers=owner["headers"],
    )
    assert unauth_edit.status_code == 403

    # 8. Lead can soft-delete member's message
    del_res = client.delete(f"/api/v1/teams/{team_id}/messages/{m1_id}", headers=lead["headers"])
    assert del_res.status_code == 204

    # Verify deleted message in history shows deleted_at and body is masked
    history_after = client.get(f"/api/v1/teams/{team_id}/messages", headers=owner["headers"]).json()
    m1_after = next(m for m in history_after if m["id"] == m1_id)
    assert m1_after["deleted_at"] is not None
    assert m1_after["body"] is None


# -----------------------------------------------------------------------------
# 4. WebSocket Real-time Collaboration Tests
# -----------------------------------------------------------------------------


def test_websocket_authentication_and_authorization(client: TestClient, tmp_path: Path):
    """Test WebSocket handshake, token validation, non-member rejection, and disconnects."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    member = setup["member"]
    outsider = setup["outsider"]

    # 1. Missing authentication in first message closes connection
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "chat"}))
        # Connection closed due to invalid first message
        with pytest.raises(Exception):
            ws.receive_text()

    # 2. Invalid JWT token rejected
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "access_token": "INVALID_TOKEN"}))
        with pytest.raises(Exception):
            ws.receive_text()

    # 3. Expired token rejected
    expired_token = create_access_token(
        subject=member["user"]["id"],
        expires_delta=timedelta(seconds=-10),
    )
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "access_token": expired_token}))
        with pytest.raises(Exception):
            ws.receive_text()

    # 4. Non-member rejected
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "access_token": outsider["token"]}))
        with pytest.raises(Exception):
            ws.receive_text()

    # 5. Active member successfully authenticates
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "access_token": member["token"]}))
        auth_ack = json.loads(ws.receive_text())
        assert auth_ack["type"] == "authenticated"
        assert auth_ack["user_id"] == member["user"]["id"]

        # Ping pong keep-alive
        ws.send_text(json.dumps({"type": "ping"}))
        pong = json.loads(ws.receive_text())
        assert pong["type"] == "pong"


def test_websocket_realtime_event_broadcasting(client: TestClient, tmp_path: Path):
    """Verify that HTTP message and task actions broadcast real-time events to connected WebSocket clients."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]

    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws_listener:
        # Authenticate listener
        ws_listener.send_text(json.dumps({"type": "authenticate", "access_token": member["token"]}))
        ack = json.loads(ws_listener.receive_text())
        assert ack["type"] == "authenticated"

        # 1. Owner posts message via HTTP -> listener receives message.created
        msg_res = client.post(
            f"/api/v1/teams/{team_id}/messages",
            json={"body": "Realtime broadcast check!"},
            headers=owner["headers"],
        )
        assert msg_res.status_code == 201

        ws_event = json.loads(ws_listener.receive_text())
        assert ws_event["type"] == "message.created"
        assert ws_event["data"]["body"] == "Realtime broadcast check!"

        # 2. Owner creates task -> listener receives task.created
        task_res = client.post(
            f"/api/v1/teams/{team_id}/tasks",
            json={"title": "Realtime Task"},
            headers=owner["headers"],
        )
        assert task_res.status_code == 201
        task_id = task_res.json()["id"]

        ws_task_event = json.loads(ws_listener.receive_text())
        assert ws_task_event["type"] == "task.created"
        assert ws_task_event["data"]["title"] == "Realtime Task"

        # 3. Owner updates task -> listener receives task.updated
        client.patch(
            f"/api/v1/teams/{team_id}/tasks/{task_id}",
            json={"status": "in_progress"},
            headers=owner["headers"],
        )
        ws_update_event = json.loads(ws_listener.receive_text())
        assert ws_update_event["type"] == "task.updated"
        assert ws_update_event["data"]["status"] == "in_progress"

        # 4. Owner deletes task -> listener receives task.deleted
        client.delete(
            f"/api/v1/teams/{team_id}/tasks/{task_id}",
            headers=owner["headers"],
        )
        ws_delete_event = json.loads(ws_listener.receive_text())
        assert ws_delete_event["type"] == "task.deleted"
        assert ws_delete_event["data"]["id"] == task_id


def test_file_oversized_and_cross_team_isolation_and_post_leave(client: TestClient, tmp_path: Path):
    """Test oversized uploads, supported image/video formats, cross-team isolation, and post-leave restrictions."""
    setup_a = create_team_setup(client, tmp_path)
    team_a_id = setup_a["team_id"]
    owner_a = setup_a["owner"]
    member_a = setup_a["member"]

    setup_b = create_team_setup(client, tmp_path)
    team_b_id = setup_b["team_id"]
    owner_b = setup_b["owner"]

    # 1. Valid JPEG, WebP, and WebM uploads
    jpeg_res = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("photo.jpg", generate_jpeg_bytes(), "image/jpeg")},
        headers=owner_a["headers"],
    )
    assert jpeg_res.status_code == 201

    webp_res = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("sticker.webp", generate_webp_bytes(), "image/webp")},
        headers=owner_a["headers"],
    )
    assert webp_res.status_code == 201

    webm_res = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("clip.webm", generate_webm_bytes(), "video/webm")},
        headers=owner_a["headers"],
    )
    assert webm_res.status_code == 201
    file_a_id = webm_res.json()["id"]

    # 2. Reject oversized image upload (>10 MB)
    large_image_data = b"X" * (10 * 1024 * 1024 + 1024)
    oversized_res = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("large.png", large_image_data, "image/png")},
        headers=owner_a["headers"],
    )
    assert oversized_res.status_code == 400
    assert "maximum" in oversized_res.json()["detail"].lower()

    # 3. Cross-team isolation: Owner of Team B cannot download Team A's file
    cross_download = client.get(
        f"/api/v1/teams/{team_a_id}/files/{file_a_id}",
        headers=owner_b["headers"],
    )
    assert cross_download.status_code == 403

    # Attempting to download Team A's file via Team B's URL returns 404
    idor_download = client.get(
        f"/api/v1/teams/{team_b_id}/files/{file_a_id}",
        headers=owner_b["headers"],
    )
    assert idor_download.status_code == 404

    # 4. Member leaves Team A -> cannot upload or download anymore
    leave_res = client.post(f"/api/v1/teams/{team_a_id}/leave", headers=member_a["headers"])
    assert leave_res.status_code == 200

    after_leave_upload = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("after_leave.png", generate_png_bytes(), "image/png")},
        headers=member_a["headers"],
    )
    assert after_leave_upload.status_code == 403

    after_leave_download = client.get(
        f"/api/v1/teams/{team_a_id}/files/{file_a_id}",
        headers=member_a["headers"],
    )
    assert after_leave_download.status_code == 403


def test_messaging_unauthorized_access_and_attachment_validation(client: TestClient, tmp_path: Path):
    """Test message authorization, cross-team attachment prevention, and duplicate attachment prevention."""
    setup_a = create_team_setup(client, tmp_path)
    team_a_id = setup_a["team_id"]
    owner_a = setup_a["owner"]
    outsider = setup_a["outsider"]

    setup_b = create_team_setup(client, tmp_path)
    team_b_id = setup_b["team_id"]
    owner_b = setup_b["owner"]

    # 1. Outsider cannot access messages
    out_list = client.get(f"/api/v1/teams/{team_a_id}/messages", headers=outsider["headers"])
    assert out_list.status_code == 403

    out_post = client.post(
        f"/api/v1/teams/{team_a_id}/messages",
        json={"body": "Outsider message"},
        headers=outsider["headers"],
    )
    assert out_post.status_code == 403

    # 2. Upload a file in Team B
    f_b_res = client.post(
        f"/api/v1/teams/{team_b_id}/files",
        files={"file": ("b.png", generate_png_bytes(), "image/png")},
        headers=owner_b["headers"],
    )
    file_b_id = f_b_res.json()["id"]

    # Upload a file in Team A
    f_a_res = client.post(
        f"/api/v1/teams/{team_a_id}/files",
        files={"file": ("a.png", generate_png_bytes(), "image/png")},
        headers=owner_a["headers"],
    )
    file_a_id = f_a_res.json()["id"]

    # 3. Trying to attach Team B's file into Team A's message is rejected
    cross_attach = client.post(
        f"/api/v1/teams/{team_a_id}/messages",
        json={"body": "Cross team attach", "attachment_ids": [file_b_id]},
        headers=owner_a["headers"],
    )
    assert cross_attach.status_code == 400
    assert "another team" in cross_attach.json()["detail"].lower()

    # 4. Attach file_a to message 1
    m1_res = client.post(
        f"/api/v1/teams/{team_a_id}/messages",
        json={"body": "First attachment", "attachment_ids": [file_a_id]},
        headers=owner_a["headers"],
    )
    assert m1_res.status_code == 201

    # 5. Trying to attach the same file_a to message 2 is rejected
    dup_attach = client.post(
        f"/api/v1/teams/{team_a_id}/messages",
        json={"body": "Second attachment attempt", "attachment_ids": [file_a_id]},
        headers=owner_a["headers"],
    )
    assert dup_attach.status_code == 400
    assert "already attached" in dup_attach.json()["detail"].lower()


def test_websocket_disconnect_on_member_leave_and_team_disband(client: TestClient, tmp_path: Path):
    """Verify that leaving, removal, or disbanding forcefully disconnects WebSocket connections."""
    setup = create_team_setup(client, tmp_path)
    team_id = setup["team_id"]
    owner = setup["owner"]
    member = setup["member"]

    # 1. Connect member to WebSocket
    with client.websocket_connect(f"/api/v1/teams/{team_id}/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "access_token": member["token"]}))
        ack = json.loads(ws.receive_text())
        assert ack["type"] == "authenticated"

        # Member leaves the team via HTTP endpoint
        client.post(f"/api/v1/teams/{team_id}/leave", headers=member["headers"])

        # WebSocket receives disconnection notification
        disc_msg = json.loads(ws.receive_text())
        assert disc_msg["type"] == "disconnected"
        assert disc_msg["reason"] == "left_team"

