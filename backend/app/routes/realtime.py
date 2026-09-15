import json
from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import text

from ..config import get_settings
from ..db import session_factory
from ..tenant import TenantUser

router = APIRouter(tags=["realtime"])


class RealtimeManager:
    def __init__(self) -> None:
        self.clients: dict[str, tuple[WebSocket, TenantUser, set[str]]] = {}
        self.subscribers: defaultdict[str, set[str]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, user: TenantUser) -> str:
        await websocket.accept()
        client_id = str(uuid4())
        self.clients[client_id] = (websocket, user, set())
        await self.send(websocket, {"type": "CONNECTED", "clientId": client_id})
        return client_id

    async def disconnect(self, client_id: str) -> None:
        client = self.clients.pop(client_id, None)
        if client is None:
            return
        for channel in client[2]:
            self.subscribers[channel].discard(client_id)
            if not self.subscribers[channel]:
                del self.subscribers[channel]

    async def send(self, websocket: WebSocket, payload: dict[str, object]) -> None:
        await websocket.send_text(
            json.dumps({**payload, "timestamp": datetime.now(timezone.utc).isoformat()})
        )

    async def subscribe(self, client_id: str, channel: str) -> None:
        websocket, user, channels = self.clients[client_id]
        if not await self.can_access(user, channel):
            await self.send(
                websocket,
                {"type": "ERROR", "error": "UNAUTHORIZED", "channel": channel},
            )
            return
        channels.add(channel)
        self.subscribers[channel].add(client_id)
        await self.send(websocket, {"type": "SUBSCRIBED", "channel": channel})

    async def unsubscribe(self, client_id: str, channel: str) -> None:
        websocket, _, channels = self.clients[client_id]
        channels.discard(channel)
        self.subscribers[channel].discard(client_id)
        if not self.subscribers[channel]:
            del self.subscribers[channel]
        await self.send(websocket, {"type": "UNSUBSCRIBED", "channel": channel})

    async def can_access(self, user: TenantUser, channel: str) -> bool:
        parts = channel.split(":")
        if len(parts) != 2 or not all(parts):
            return False
        channel_type, resource = parts
        if channel_type in {"fleet-status", "work-orders"}:
            return resource == user.org_id
        if channel_type == "notifications":
            return resource == user.id
        if channel_type not in {"vehicle-health", "components"} or session_factory is None:
            return False
        async with session_factory() as session:
            result = await session.execute(
                text('select 1 from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'),
                {"vehicle_id": resource, "org_id": user.org_id},
            )
            return result.first() is not None

    async def broadcast(self, channel: str, event: dict[str, object]) -> int:
        sent = 0
        for client_id in tuple(self.subscribers.get(channel, ())):
            client = self.clients.get(client_id)
            if client is None:
                continue
            try:
                await self.send(
                    client[0],
                    {"type": "MESSAGE", "channel": channel, "event": event},
                )
                sent += 1
            except Exception:
                await self.disconnect(client_id)
        return sent


manager = RealtimeManager()


async def _authenticate(websocket: WebSocket) -> TenantUser | None:
    settings = get_settings()
    token = websocket.query_params.get("token")
    authorization = websocket.headers.get("authorization", "")
    if not token and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if (
        not token
        or not settings.supabase_url
        or not settings.supabase_anon_key
        or session_factory is None
    ):
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
            )
        response.raise_for_status()
        identity = response.json()
        async with session_factory() as session:
            result = await session.execute(
                text(
                    'select "id", "orgId", "role", "fullName", "email" from "users" '
                    'where "authUserId" = :auth_user_id or "email" = :email '
                    'order by case when "authUserId" = :auth_user_id then 0 else 1 end limit 1'
                ),
                {"auth_user_id": identity["id"], "email": identity.get("email")},
            )
            row = result.mappings().first()
        if row is None:
            return None
        return TenantUser(
            id=str(row["id"]),
            org_id=str(row["orgId"]),
            role=str(row["role"]),
            full_name=row["fullName"],
            email=row["email"],
        )
    except (httpx.HTTPError, KeyError, TypeError):
        return None


@router.websocket("/ws")
async def realtime_socket(websocket: WebSocket) -> None:
    user = await _authenticate(websocket)
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    client_id = await manager.connect(websocket, user)
    try:
        while True:
            raw_message = await websocket.receive_text()
            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                await manager.send(websocket, {"type": "ERROR", "error": "INVALID_MESSAGE"})
                continue
            message_type = message.get("type")
            channel = message.get("channel")
            if message_type == "SUBSCRIBE" and isinstance(channel, str):
                await manager.subscribe(client_id, channel)
            elif message_type == "UNSUBSCRIBE" and isinstance(channel, str):
                await manager.unsubscribe(client_id, channel)
            elif message_type == "PING":
                await manager.send(websocket, {"type": "PONG"})
            else:
                await manager.send(websocket, {"type": "ERROR", "error": "INVALID_MESSAGE"})
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(client_id)
