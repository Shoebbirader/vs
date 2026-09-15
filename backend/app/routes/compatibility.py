import json
import re
from collections.abc import Mapping
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user
from .fleet import dashboard_summary, list_vehicles
from .inventory import list_parts
from .maintenance import list_work_orders
from .notifications import list_notifications

router = APIRouter(prefix="/api/trpc", tags=["frontend-compatibility"])


def _camel_case(value: str) -> str:
    return re.sub(r"_([a-z])", lambda match: match.group(1).upper(), value)


def _frontend_shape(value: object) -> object:
    encoded = jsonable_encoder(value)
    if isinstance(encoded, Mapping):
        return {_camel_case(str(key)): _frontend_shape(item) for key, item in encoded.items()}
    if isinstance(encoded, list):
        return [_frontend_shape(item) for item in encoded]
    return encoded


def _input_value(raw_input: str | None, index: int) -> object:
    if not raw_input:
        return None
    payload = json.loads(raw_input)
    if isinstance(payload, Mapping):
        item = payload.get(str(index), payload)
        if isinstance(item, Mapping) and "json" in item:
            return item["json"]
        return item
    return payload


async def _dispatch(
    procedure: str,
    input_value: object,
    user: TenantUser,
    session: AsyncSession,
) -> object:
    if procedure == "auth.me":
        return {
            "id": user.id,
            "orgId": user.org_id,
            "role": user.role,
            "fullName": user.full_name,
            "email": user.email,
        }
    if procedure == "dashboard.summary":
        return await dashboard_summary(user, session)
    if procedure == "vehicles.list":
        return await list_vehicles(user, session)
    if procedure == "workOrders.list":
        filters = cast(Mapping[str, object], input_value or {})
        vehicle_id = filters.get("vehicleId")
        status = filters.get("status")
        return await list_work_orders(
            vehicle_id=UUID(str(vehicle_id)) if vehicle_id else None,
            work_order_status=str(status) if status else None,
            current_user=user,
            session=session,
        )
    if procedure == "inventory.list":
        return await list_parts(user, session)
    if procedure == "notifications.list":
        filters = cast(Mapping[str, object], input_value or {})
        return await list_notifications(
            severity=str(filters.get("severity", "ALL")),
            source_type=str(filters.get("sourceType", "ALL")),
            notification_status=str(filters.get("status", "ALL")),
            vehicle_id=UUID(str(filters["vehicleId"])) if filters.get("vehicleId") else None,
            current_user=user,
            session=session,
        )
    raise HTTPException(status_code=404, detail=f"Python compatibility route not migrated: {procedure}")


@router.api_route("/{procedure:path}", methods=["GET"])
async def frontend_compatibility(
    procedure: str,
    input: str | None = Query(default=None),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> object:
    procedures = procedure.split(",")
    responses = []
    for index, name in enumerate(procedures):
        value = await _dispatch(name, _input_value(input, index), current_user, session)
        responses.append({"result": {"data": {"json": _frontend_shape(value)}}})
    if len(responses) == 1:
        return responses[0]
    return responses
