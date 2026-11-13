import asyncio
import json
import logging
import threading
import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketConnectionManager:
    """In-memory WebSocket connection manager supporting per-team rooms and thread-safe real-time event broadcasting."""

    def __init__(self):
        # Map: team_id -> list of (WebSocket, user_id, asyncio.AbstractEventLoop)
        self._rooms: Dict[
            uuid.UUID, List[Tuple[WebSocket, uuid.UUID, asyncio.AbstractEventLoop]]
        ] = {}
        self._lock = threading.Lock()

    async def connect(
        self, websocket: WebSocket, team_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Register an authenticated WebSocket connection to a team room with its event loop."""
        loop = asyncio.get_running_loop()
        with self._lock:
            if team_id not in self._rooms:
                self._rooms[team_id] = []
            self._rooms[team_id].append((websocket, user_id, loop))
        logger.debug(
            f"User {user_id} connected to team {team_id} WS. Total active: {len(self._rooms[team_id])}"
        )

    async def disconnect(
        self,
        websocket: WebSocket,
        team_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Remove a WebSocket connection from the team room."""
        with self._lock:
            if team_id in self._rooms:
                self._rooms[team_id] = [
                    item for item in self._rooms[team_id] if item[0] != websocket
                ]
                if not self._rooms[team_id]:
                    del self._rooms[team_id]

    def _send_payload(
        self,
        ws: WebSocket,
        loop: asyncio.AbstractEventLoop,
        payload: str,
    ) -> bool:
        """Safely send a text payload to a websocket across thread/loop boundaries."""
        try:
            if not loop.is_running():
                return False

            try:
                curr_loop = asyncio.get_running_loop()
            except RuntimeError:
                curr_loop = None

            if curr_loop is loop:
                # Same loop: schedule task
                loop.create_task(ws.send_text(payload))
            else:
                # Different loop or thread: run threadsafe
                fut = asyncio.run_coroutine_threadsafe(ws.send_text(payload), loop)
                # Wait briefly to detect broken connections
                fut.result(timeout=2.0)
            return True
        except Exception as e:
            logger.debug(f"Failed to send WS text: {e}")
            return False

    def _close_socket(
        self,
        ws: WebSocket,
        loop: asyncio.AbstractEventLoop,
        code: int = 1000,
    ) -> None:
        """Safely close a websocket across thread/loop boundaries."""
        try:
            if not loop.is_running():
                return

            try:
                curr_loop = asyncio.get_running_loop()
            except RuntimeError:
                curr_loop = None

            if curr_loop is loop:
                loop.create_task(ws.close(code=code))
            else:
                fut = asyncio.run_coroutine_threadsafe(ws.close(code=code), loop)
                fut.result(timeout=1.0)
        except Exception:
            pass

    async def broadcast_to_team(
        self, team_id: uuid.UUID, event_type: str, data: Dict[str, Any]
    ) -> None:
        """Async broadcast helper."""
        self.broadcast_sync(team_id, event_type, data)

    def broadcast_sync(
        self, team_id: uuid.UUID, event_type: str, data: Dict[str, Any]
    ) -> None:
        """Thread-safe synchronous broadcast to all connected members of a team room."""
        message = {"type": event_type, "data": data}
        json_payload = json.dumps(message, default=str)

        with self._lock:
            connections = list(self._rooms.get(team_id, []))

        dead_connections: List[Tuple[WebSocket, uuid.UUID, asyncio.AbstractEventLoop]] = []
        for ws, uid, loop in connections:
            success = self._send_payload(ws, loop, json_payload)
            if not success:
                dead_connections.append((ws, uid, loop))

        if dead_connections:
            with self._lock:
                if team_id in self._rooms:
                    for dead in dead_connections:
                        if dead in self._rooms[team_id]:
                            self._rooms[team_id].remove(dead)

    def disconnect_member_sync(
        self, team_id: uuid.UUID, user_id: uuid.UUID, reason: str = "membership_terminated"
    ) -> None:
        """Forcefully disconnect all active WebSocket sessions for a specific user in a team."""
        with self._lock:
            connections = [
                (ws, uid, loop)
                for ws, uid, loop in self._rooms.get(team_id, [])
                if uid == user_id
            ]

        for ws, uid, loop in connections:
            self._send_payload(
                ws, loop, json.dumps({"type": "disconnected", "reason": reason})
            )
            self._close_socket(ws, loop, code=1000)

        with self._lock:
            if team_id in self._rooms:
                self._rooms[team_id] = [
                    item for item in self._rooms[team_id] if item[1] != user_id
                ]

    def disconnect_team_sync(
        self, team_id: uuid.UUID, reason: str = "team_disbanded"
    ) -> None:
        """Forcefully disconnect all WebSocket sessions for an entire team."""
        with self._lock:
            connections = list(self._rooms.get(team_id, []))
            self._rooms.pop(team_id, None)

        for ws, uid, loop in connections:
            self._send_payload(
                ws, loop, json.dumps({"type": "disconnected", "reason": reason})
            )
            self._close_socket(ws, loop, code=1000)

    async def disconnect_member(
        self, team_id: uuid.UUID, user_id: uuid.UUID, reason: str = "membership_terminated"
    ) -> None:
        self.disconnect_member_sync(team_id, user_id, reason)

    async def disconnect_team(
        self, team_id: uuid.UUID, reason: str = "team_disbanded"
    ) -> None:
        self.disconnect_team_sync(team_id, reason)


# Global singleton instance
ws_manager = WebSocketConnectionManager()
