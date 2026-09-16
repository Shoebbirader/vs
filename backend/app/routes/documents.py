from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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


class DocumentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    doc_type: str = Field(min_length=2, max_length=80)
    file_url: str = Field(min_length=1, max_length=2000)
    file_key: str | None = Field(default=None, max_length=500)
    file_checksum: str | None = Field(default=None, max_length=128)
    file_size_bytes: int | None = Field(default=None, ge=0)
    expiry_date: datetime
    vehicle_id: UUID | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    file_url: str | None = Field(default=None, min_length=1, max_length=2000)
    file_key: str | None = Field(default=None, max_length=500)
    file_checksum: str | None = Field(default=None, max_length=128)
    file_size_bytes: int | None = Field(default=None, ge=0)
    expiry_date: datetime | None = None


class DocumentArchive(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class DocumentVersionSummary(BaseModel):
    id: UUID
    document_id: UUID
    version_number: int
    title: str
    doc_type: str
    file_url: str
    file_key: str | None
    file_checksum: str | None
    file_size_bytes: int | None
    expiry_date: datetime
    created_by_id: UUID
    created_at: datetime


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


def _document(row: dict[str, object]) -> DocumentSummary:
    return DocumentSummary(
        id=row["id"],
        vehicle_id=row["vehicleId"],
        title=row["title"],
        doc_type=row["docType"],
        file_url=row["fileUrl"],
        file_key=row["fileKey"],
        expiry_date=row["expiryDate"],
        archived_at=row["archivedAt"],
    )


def _document_role(current_user: TenantUser) -> None:
    if current_user.role not in {"SUPERADMIN", "FLEET_MANAGER"}:
        raise HTTPException(status_code=403, detail="Compliance document access required")


@router.get("/documents/{document_id}/versions", response_model=list[DocumentVersionSummary])
async def list_document_versions(
    document_id: UUID,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[DocumentVersionSummary]:
    _document_role(current_user)
    document = await session.execute(
        text('select "id" from "documents" where "id" = :document_id and "orgId" = :org_id'),
        {"document_id": str(document_id), "org_id": current_user.org_id},
    )
    if document.first() is None:
        raise HTTPException(status_code=404, detail="Document not found")
    result = await session.execute(
        text(
            'select "id", "documentId", "versionNumber", "title", "docType", "fileUrl", '
            '"fileKey", "fileChecksum", "fileSizeBytes", "expiryDate", "createdById", '
            '"createdAt" from "document_versions" where "documentId" = :document_id '
            'and "orgId" = :org_id order by "versionNumber" desc limit 50'
        ),
        {"document_id": str(document_id), "org_id": current_user.org_id},
    )
    return [
        DocumentVersionSummary(
            id=row["id"],
            document_id=row["documentId"],
            version_number=row["versionNumber"],
            title=row["title"],
            doc_type=row["docType"],
            file_url=row["fileUrl"],
            file_key=row["fileKey"],
            file_checksum=row["fileChecksum"],
            file_size_bytes=row["fileSizeBytes"],
            expiry_date=row["expiryDate"],
            created_by_id=row["createdById"],
            created_at=row["createdAt"],
        )
        for row in result.mappings()
    ]


@router.post("/documents", response_model=DocumentSummary, status_code=201)
async def create_document(
    payload: DocumentCreate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentSummary:
    _document_role(current_user)
    async with session.begin():
        if payload.vehicle_id:
            vehicle = await session.execute(
                text('select "id" from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'),
                {"vehicle_id": str(payload.vehicle_id), "org_id": current_user.org_id},
            )
            if vehicle.first() is None:
                raise HTTPException(status_code=400, detail="Vehicle is outside this organization")
        if payload.file_checksum:
            duplicate = await session.execute(
                text('select "id" from "documents" where "orgId" = :org_id and "fileChecksum" = :checksum'),
                {"org_id": current_user.org_id, "checksum": payload.file_checksum},
            )
            if duplicate.first() is not None:
                raise HTTPException(status_code=409, detail="This exact document file already exists")
        result = await session.execute(
            text(
                'insert into "documents" ("orgId", "vehicleId", "title", "docType", "fileUrl", '
                '"fileKey", "fileChecksum", "fileSizeBytes", "retentionUntil", "expiryDate") '
                'values (:org_id, :vehicle_id, :title, :doc_type, :file_url, :file_key, '
                ':checksum, :size_bytes, :expiry_date, :expiry_date) returning "id", "vehicleId", '
                '"title", "docType", "fileUrl", "fileKey", "expiryDate", "archivedAt"'
            ),
            {
                "org_id": current_user.org_id,
                "vehicle_id": str(payload.vehicle_id) if payload.vehicle_id else None,
                "title": payload.title.strip(),
                "doc_type": payload.doc_type.strip(),
                "file_url": payload.file_url,
                "file_key": payload.file_key,
                "checksum": payload.file_checksum,
                "size_bytes": payload.file_size_bytes,
                "expiry_date": payload.expiry_date,
            },
        )
        row = result.mappings().one()
        await session.execute(
            text(
                'insert into "document_versions" ("orgId", "documentId", "versionNumber", '
                '"title", "docType", "fileUrl", "fileKey", "fileChecksum", "fileSizeBytes", '
                '"expiryDate", "createdById") values (:org_id, :document_id, 1, :title, '
                ':doc_type, :file_url, :file_key, :checksum, :size_bytes, :expiry_date, :actor_id)'
            ),
            {
                "org_id": current_user.org_id,
                "document_id": row["id"],
                "title": row["title"],
                "doc_type": row["docType"],
                "file_url": row["fileUrl"],
                "file_key": row["fileKey"],
                "checksum": payload.file_checksum,
                "size_bytes": payload.file_size_bytes,
                "expiry_date": row["expiryDate"],
                "actor_id": current_user.id,
            },
        )
    return _document(row)


@router.patch("/documents/{document_id}", response_model=DocumentSummary)
async def update_document(
    document_id: UUID,
    payload: DocumentUpdate,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentSummary:
    _document_role(current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="At least one document field is required")
    column_map = {
        "title": '"title"',
        "file_url": '"fileUrl"',
        "file_key": '"fileKey"',
        "file_checksum": '"fileChecksum"',
        "file_size_bytes": '"fileSizeBytes"',
        "expiry_date": '"expiryDate"',
    }
    assignments = [f"{column_map[key]} = :{key}" for key in values]
    if "title" in values:
        values["title"] = str(values["title"]).strip()
    async with session.begin():
        current = await session.execute(
            text(
                'select "id", "vehicleId", "title", "docType", "fileUrl", "fileKey", '
                '"fileChecksum", "fileSizeBytes", "expiryDate", "archivedAt" from "documents" '
                'where "id" = :document_id and "orgId" = :org_id'
            ),
            {"document_id": str(document_id), "org_id": current_user.org_id},
        )
        existing = current.mappings().first()
        if existing is None:
            raise HTTPException(status_code=404, detail="Document not found")
        values["document_id"] = str(document_id)
        updated = await session.execute(
            text(
                'update "documents" set ' + ", ".join(assignments) + ', "updatedAt" = now() '
                'where "id" = :document_id and "orgId" = :org_id returning "id", "vehicleId", '
                '"title", "docType", "fileUrl", "fileKey", "expiryDate", "archivedAt"'
            ),
            {**values, "org_id": current_user.org_id},
        )
        row = updated.mappings().one()
        latest = await session.execute(
            text('select coalesce(max("versionNumber"), 0) + 1 from "document_versions" where "documentId" = :document_id'),
            {"document_id": str(document_id)},
        )
        await session.execute(
            text(
                'insert into "document_versions" ("orgId", "documentId", "versionNumber", '
                '"title", "docType", "fileUrl", "fileKey", "fileChecksum", "fileSizeBytes", '
                '"expiryDate", "createdById") values (:org_id, :document_id, :version, :title, '
                ':doc_type, :file_url, :file_key, :checksum, :size_bytes, :expiry_date, :actor_id)'
            ),
            {
                "org_id": current_user.org_id,
                "document_id": str(document_id),
                "version": latest.scalar_one(),
                "title": row["title"],
                "doc_type": row["docType"],
                "file_url": row["fileUrl"],
                "file_key": row["fileKey"],
                "checksum": values.get("file_checksum", existing["fileChecksum"]),
                "size_bytes": values.get("file_size_bytes", existing["fileSizeBytes"]),
                "expiry_date": row["expiryDate"],
                "actor_id": current_user.id,
            },
        )
    return _document(row)


@router.post("/documents/{document_id}/archive", response_model=DocumentSummary)
async def archive_document(
    document_id: UUID,
    payload: DocumentArchive,
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentSummary:
    _document_role(current_user)
    async with session.begin():
        result = await session.execute(
            text(
                'update "documents" set "archivedAt" = now(), "archivedById" = :actor_id, '
                '"updatedAt" = now() where "id" = :document_id and "orgId" = :org_id '
                'and "archivedAt" is null returning "id", "vehicleId", "title", "docType", '
                '"fileUrl", "fileKey", "expiryDate", "archivedAt"'
            ),
            {
                "actor_id": current_user.id,
                "document_id": str(document_id),
                "org_id": current_user.org_id,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise HTTPException(status_code=409, detail="Document was already archived or not found")
    return _document(row)
