import json
import re
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user
from .fleet import dashboard_summary, list_vehicles
from .inventory import list_parts
from .maintenance import list_work_orders
from .notifications import list_notifications
from .components import list_components
from .documents import list_document_versions, list_documents
from .audit import list_audit_events
from .finance import financial_metrics
from .planning import maintenance_planning
from .profile import get_organization_settings, get_profile
from .team import list_members

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


def _date_input(value: object) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="Date filters must be ISO strings")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Date filters must be ISO strings") from error


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
    if procedure == "profile.get":
        return await get_profile(current_user, session)
    if procedure == "organizationSettings.get":
        return await get_organization_settings(current_user, session)
    if procedure == "documents.list":
        filters = cast(Mapping[str, object], input_value or {})
        return await list_documents(
            include_archived=bool(filters.get("includeArchived", False)),
            current_user=current_user,
            session=session,
        )
    if procedure == "documents.versions":
        filters = cast(Mapping[str, object], input_value or {})
        document_id = filters.get("documentId")
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")
        return await list_document_versions(UUID(str(document_id)), current_user, session)
    if procedure == "components.list":
        filters = cast(Mapping[str, object], input_value or {})
        vehicle_id = filters.get("vehicleId")
        return await list_components(
            vehicle_id=UUID(str(vehicle_id)) if vehicle_id else None,
            current_user=current_user,
            session=session,
        )
    if procedure == "planning.maintenance":
        filters = cast(Mapping[str, object], input_value or {})
        from_date = filters.get("from")
        to_date = filters.get("to")
        return await maintenance_planning(
            from_date=_date_input(from_date),
            to_date=_date_input(to_date),
            current_user=current_user,
            session=session,
        )
    if procedure == "financials.metrics":
        return await financial_metrics(current_user, session)
    if procedure == "team.members":
        return await list_members(current_user, session)
    if procedure == "audit.list":
        filters = cast(Mapping[str, object], input_value or {})
        return await list_audit_events(
            actor_id=UUID(str(filters["actorId"])) if filters.get("actorId") else None,
            actor_role=str(filters["actorRole"]) if filters.get("actorRole") else None,
            entity_type=str(filters["entityType"]) if filters.get("entityType") else None,
            action=str(filters["action"]) if filters.get("action") else None,
            date_from=_date_input(filters.get("dateFrom")),
            date_to=_date_input(filters.get("dateTo")),
            limit=int(filters.get("limit", 100)),
            current_user=current_user,
            session=session,
        )
    if procedure == "compliance.summary":
        return await _compliance_summary(
            filters=cast(Mapping[str, object], input_value or {}),
            user=current_user,
            session=session,
        )
    raise HTTPException(status_code=404, detail=f"Python compatibility route not migrated: {procedure}")


async def _compliance_summary(
    filters: Mapping[str, object],
    user: TenantUser,
    session: AsyncSession,
) -> object:
    if user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Fleet manager access required")
    window_days = int(filters.get("expiryWindowDays", 30))
    if not 1 <= window_days <= 365:
        raise HTTPException(status_code=400, detail="expiryWindowDays must be between 1 and 365")
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=window_days)
    vehicles_result = await session.execute(
        text(
            'select "id", "licensePlate" from "vehicles" where "orgId" = :org_id '
            'order by "licensePlate"'
        ),
        {"org_id": user.org_id},
    )
    documents_result = await session.execute(
        text(
            'select "vehicleId", "expiryDate" from "documents" where "orgId" = :org_id '
            'and "archivedAt" is null'
        ),
        {"org_id": user.org_id},
    )
    documents_by_vehicle: dict[str, list[datetime]] = {}
    for row in documents_result.mappings():
        vehicle_id = row["vehicleId"]
        if vehicle_id is not None:
            documents_by_vehicle.setdefault(str(vehicle_id), []).append(row["expiryDate"])
    assignments_result = await session.execute(
        text(
            'select "driverId", "vehicleId" from "vehicle_assignments" '
            'where "orgId" = :org_id and "active" = true and "driverId" is not null'
        ),
        {"org_id": user.org_id},
    )
    users_result = await session.execute(
        text(
            'select "id", "fullName", "email" from "users" where "orgId" = :org_id'
        ),
        {"org_id": user.org_id},
    )
    user_names = {
        str(row["id"]): row["fullName"] or row["email"] or "Assigned driver"
        for row in users_result.mappings()
    }

    def classify(expiry_dates: list[datetime]) -> str:
        if not expiry_dates:
            return "MISSING"
        if any(expiry < now for expiry in expiry_dates):
            return "EXPIRED"
        if any(expiry <= window_end for expiry in expiry_dates):
            return "EXPIRING"
        return "VALID"

    vehicles = []
    for row in vehicles_result.mappings():
        status = classify(documents_by_vehicle.get(str(row["id"]), []))
        vehicles.append(
            {
                "vehicleId": row["id"],
                "licensePlate": row["licensePlate"],
                "status": status,
                "documentCount": len(documents_by_vehicle.get(str(row["id"]), [])),
            }
        )
    counts = {status: sum(item["status"] == status for item in vehicles) for status in ("VALID", "EXPIRING", "EXPIRED", "MISSING")}
    vehicle_labels = {str(item["vehicleId"]): item["licensePlate"] for item in vehicles}
    drivers = [
        {
            "driverId": row["driverId"],
            "driverName": user_names.get(str(row["driverId"]), "Assigned driver"),
            "vehicleId": row["vehicleId"],
            "licensePlate": vehicle_labels.get(str(row["vehicleId"]), "Unassigned vehicle"),
            "status": classify(documents_by_vehicle.get(str(row["vehicleId"]), [])),
        }
        for row in assignments_result.mappings()
    ]
    return {
        "expiryWindowDays": window_days,
        "counts": counts,
        "vehicles": vehicles,
        "drivers": drivers,
        "driverCounts": {
            status: sum(item["status"] == status for item in drivers)
            for status in ("VALID", "EXPIRING", "EXPIRED", "MISSING")
        },
    }


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
