from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user

router = APIRouter(prefix="/api/v2", tags=["documents"])


class DocumentSummary(BaseModel):
    id: UUID
    vehicle_id: UUID | None
    title: str
    doc_type: str
    file_url: str
    file_key: str | None
    expiry_date: datetime
    archived_at: datetime | None


@router.get("/documents", response_model=list[DocumentSummary])
async def list_documents(
    include_archived: bool = False,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[DocumentSummary]:
    result = await session.execute(
        text(
            'select "id", "vehicleId", "title", "docType", "fileUrl", "fileKey", '
            '"expiryDate", "archivedAt" from "documents" where "orgId" = :org_id '
            'and (:include_archived or "archivedAt" is null) '
            'order by "expiryDate", "title"'
        ),
        {
            "org_id": current_user.org_id,
            "include_archived": include_archived,
        },
    )
    return [
        DocumentSummary(
            id=row["id"],
            vehicle_id=row["vehicleId"],
            title=row["title"],
            doc_type=row["docType"],
            file_url=row["fileUrl"],
            file_key=row["fileKey"],
            expiry_date=row["expiryDate"],
            archived_at=row["archivedAt"],
        )
        for row in result.mappings()
    ]
