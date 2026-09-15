from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["audit"])


class AuditEventSummary(BaseModel):
    id: UUID
    actor_id: UUID | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: UUID | None
    summary: str
    metadata: str | None
    created_at: datetime


@router.get("/audit", response_model=list[AuditEventSummary])
async def list_audit_events(
    actor_id: UUID | None = None,
    actor_role: str | None = None,
    entity_type: str | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[AuditEventSummary]:
    if current_user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    clauses = ['"orgId" = :org_id']
    params: dict[str, object] = {"org_id": current_user.org_id, "limit": limit}
    filters = {
        "actor_id": ('"actorId" = :actor_id', actor_id),
        "actor_role": ('"actorRole" = :actor_role', actor_role),
        "entity_type": ('"entityType" = :entity_type', entity_type),
        "action": ('"action" = :action', action),
        "date_from": ('"createdAt" >= :date_from', date_from),
        "date_to": ('"createdAt" <= :date_to', date_to),
    }
    for name, (clause, value) in filters.items():
        if value is not None:
            clauses.append(clause)
            params[name] = value
    result = await session.execute(
        text(
            'select "id", "actorId", "actorRole", "action", "entityType", "entityId", '
            '"summary", "metadata", "createdAt" from "audit_events" where ' + " and ".join(clauses)
            + ' order by "createdAt" desc limit :limit'
        ),
        params,
    )
    return [
        AuditEventSummary(
            id=row["id"],
            actor_id=row["actorId"],
            actor_role=row["actorRole"],
            action=row["action"],
            entity_type=row["entityType"],
            entity_id=row["entityId"],
            summary=row["summary"],
            metadata=row["metadata"],
            created_at=row["createdAt"],
        )
        for row in result.mappings()
    ]
