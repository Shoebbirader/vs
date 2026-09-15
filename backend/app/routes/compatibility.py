import json
import re
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db_session
from ..tenant import TenantUser, get_current_user
from .fleet import VehicleCreate, create_vehicle, dashboard_summary, list_vehicles
from .inventory import list_parts
from .maintenance import list_work_orders
from .notifications import (
    ResolveNotification,
    escalate_notification,
    list_notifications,
    mark_notification_read,
    resolve_notification,
)
from .components import (
    ComponentCreate,
    ComponentUpdate,
    create_component,
    list_components,
    remove_component,
    update_component,
)
from .documents import (
    DocumentArchive,
    DocumentCreate,
    DocumentUpdate,
    archive_document,
    create_document,
    list_document_versions,
    list_documents,
    update_document,
)
from .audit import list_audit_events
from .billing import (
    activate_starter,
    billing_invoices,
    billing_plans,
    billing_payments,
    billing_status,
    create_test_order,
    generate_invoice,
    plan_eligibility,
)
from .finance import (
    Decision,
    FinancialCreate,
    ReconcileRecord,
    approve_record,
    create_financial,
    export_financials_csv,
    export_financials_pdf,
    financial_metrics,
    financial_vehicles,
    list_financials,
    maintenance_performance,
    approval_queue,
    reconcile_record,
    reconcile_financials,
    reverse_record,
)
from .inventory import (
    InventoryImport,
    PartCreate,
    PartAdjustment,
    PartIssue,
    PartReceive,
    PartReservation,
    PartTransfer,
    ReservationReturn,
    adjust_part,
    create_part,
    import_inventory,
    issue_part,
    receive_part,
    reserve_part,
    return_reserved_part,
    transfer_part,
)
from .maintenance import (
    WorkOrderCreate,
    WorkOrderBulkUpdate,
    WorkOrderStatusUpdate,
    bulk_update_work_orders,
    create_work_order,
    update_work_order_status,
)
from .planning import maintenance_planning
from .profile import (
    OrganizationSettingsUpdate,
    ProfileUpdate,
    get_organization_settings,
    get_profile,
    update_organization_settings,
    update_profile,
)
from .issues import VehicleIssueCreate, create_vehicle_issue, list_vehicle_issues
from .procurement import (
    PurchaseOrderCreate,
    create_purchase_order,
    list_purchase_orders,
)
from .safety import (
    FuelLogCreate,
    InspectionCreate,
    create_fuel_log,
    create_inspection,
    current_assignment,
    list_fuel_logs,
    list_inspections,
)
from .storage import signed_url
from .team import (
    InviteMember,
    RevokeInvitation,
    invite_member,
    list_assignable_members,
    list_invitations,
    list_members,
    resend_invitation,
    revoke_invitation,
)
from .vendors import VendorCreate, create_vendor, list_vendors

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
    if procedure == "vehicles.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_vehicle(
            VehicleCreate(
                vin=str(filters.get("vin", "")),
                license_plate=str(filters.get("licensePlate", "")),
                make=str(filters.get("make", "")),
                model=str(filters.get("model", "")),
                year=int(filters.get("year", 0)),
                current_odometer=float(filters.get("currentOdometer", 0)),
                status=str(filters.get("status", "ACTIVE")),
            ),
            user,
            session,
        )
    if procedure == "vehicles.odometerHistory":
        return await _odometer_history(user, session)
    if procedure == "vehicles.health":
        filters = cast(Mapping[str, object], input_value or {})
        vehicle_id = filters.get("vehicleId")
        if not vehicle_id:
            raise HTTPException(status_code=400, detail="vehicleId is required")
        return await _vehicle_health(UUID(str(vehicle_id)), user, session)
    if procedure == "driver.createFuelLog":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_fuel_log(
            FuelLogCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                liters=float(filters.get("liters", 0)),
                amount=float(filters.get("amount", 0)),
                odometer=float(filters.get("odometer", 0)),
                station=(
                    str(filters["station"])
                    if filters.get("station") is not None
                    else None
                ),
            ),
            user,
            session,
        )
    if procedure == "driver.createInspection":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_inspection(
            InspectionCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                inspection_type=str(filters.get("inspectionType", "")),
                status=str(filters.get("status", "")),
                notes=(
                    str(filters["notes"]) if filters.get("notes") is not None else None
                ),
            ),
            user,
            session,
        )
    if procedure == "vehicleIssues.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_vehicle_issue(
            VehicleIssueCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                title=str(filters.get("title", "")),
                description=str(filters.get("description", "")),
                priority=str(filters.get("priority", "")),
            ),
            user,
            session,
        )
    if procedure == "vehicleIssues.list":
        return await list_vehicle_issues(user, session)
    if procedure == "driver.assignment":
        return await current_assignment(user, session)
    if procedure == "driver.fuelLogs":
        return await list_fuel_logs(user, session)
    if procedure == "driver.inspections":
        return await list_inspections(user, session)
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
    if procedure == "workOrders.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_work_order(
            WorkOrderCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                title=str(filters.get("title", "")),
                description=(
                    str(filters["description"])
                    if filters.get("description") is not None
                    else None
                ),
                priority=str(filters.get("priority", "")),
                scheduled_for=_date_input(filters.get("scheduledFor")),
            ),
            user,
            session,
        )
    if procedure == "inventory.list":
        return await list_parts(user, session)
    if procedure == "inventory.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_part(
            PartCreate(
                sku=str(filters.get("sku", "")),
                name=str(filters.get("name", "")),
                bin_location=(
                    str(filters["binLocation"])
                    if filters.get("binLocation") is not None
                    else None
                ),
                quantity_on_hand=int(filters.get("quantityOnHand", 0)),
                min_reorder_level=int(filters.get("minReorderLevel", 0)),
                unit_cost=float(filters.get("unitCost", 0)),
            ),
            user,
            session,
        )
    if procedure == "inventory.importCsv":
        filters = cast(Mapping[str, object], input_value or {})
        csv_value = filters.get("csv")
        if not isinstance(csv_value, str):
            raise HTTPException(status_code=400, detail="csv is required")
        return await import_inventory(
            InventoryImport(csv=csv_value),
            user,
            session,
        )
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
    if procedure == "notifications.sourceDetail":
        filters = cast(Mapping[str, object], input_value or {})
        notification_id = filters.get("id")
        if not notification_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await _notification_source_detail(UUID(str(notification_id)), user, session)
    if procedure == "notifications.markRead":
        filters = cast(Mapping[str, object], input_value or {})
        notification_id = filters.get("id")
        if not notification_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await mark_notification_read(UUID(str(notification_id)), user, session)
    if procedure == "notifications.escalate":
        filters = cast(Mapping[str, object], input_value or {})
        notification_id = filters.get("id")
        if not notification_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await escalate_notification(UUID(str(notification_id)), user, session)
    if procedure == "notifications.resolve":
        filters = cast(Mapping[str, object], input_value or {})
        notification_id = filters.get("id")
        if not notification_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await resolve_notification(
            UUID(str(notification_id)),
            ResolveNotification(note=str(filters.get("note", ""))),
            user,
            session,
        )
    if procedure == "activity.recent":
        return await _recent_activity(user, session)
    if procedure == "profile.get":
        return await get_profile(user, session)
    if procedure == "profile.update":
        filters = cast(Mapping[str, object], input_value or {})
        return await update_profile(
            ProfileUpdate(
                full_name=str(filters.get("fullName", "")),
                mobile_number=str(filters.get("mobileNumber", "")),
                sms_alerts_enabled=bool(filters.get("smsAlertsEnabled", False)),
                whatsapp_alerts_enabled=bool(filters.get("whatsappAlertsEnabled", False)),
            ),
            user,
            session,
        )
    if procedure == "organizationSettings.get":
        return await get_organization_settings(user, session)
    if procedure == "organizationSettings.update":
        filters = cast(Mapping[str, object], input_value or {})
        return await update_organization_settings(
            OrganizationSettingsUpdate(
                timezone=str(filters.get("timezone", "")),
                odometer_max_daily_km=int(filters.get("odometerMaxDailyKm", 0)),
                labor_rate_per_hour=float(filters.get("laborRatePerHour", 0)),
                safety_contact_name=(
                    str(filters["safetyContactName"])
                    if filters.get("safetyContactName") is not None
                    else None
                ),
                safety_contact_phone=(
                    str(filters["safetyContactPhone"])
                    if filters.get("safetyContactPhone") is not None
                    else None
                ),
            ),
            user,
            session,
        )
    if procedure == "documents.list":
        filters = cast(Mapping[str, object], input_value or {})
        return await list_documents(
            include_archived=bool(filters.get("includeArchived", False)),
            current_user=user,
            session=session,
        )
    if procedure == "documents.versions":
        filters = cast(Mapping[str, object], input_value or {})
        document_id = filters.get("documentId")
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")
        return await list_document_versions(UUID(str(document_id)), user, session)
    if procedure == "documents.access":
        filters = cast(Mapping[str, object], input_value or {})
        document_id = filters.get("documentId")
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")
        result = await session.execute(
            text(
                'select "fileKey" from "documents" where "id" = :document_id '
                'and "orgId" = :org_id and "archivedAt" is null'
            ),
            {"document_id": str(document_id), "org_id": user.org_id},
        )
        row = result.mappings().first()
        if row is None or not row["fileKey"]:
            raise HTTPException(status_code=404, detail="Document file not found")
        expires_in = filters.get("expiresIn", 3600)
        if not isinstance(expires_in, int):
            raise HTTPException(status_code=400, detail="expiresIn must be an integer")
        access = await signed_url(
            key=str(row["fileKey"]),
            expires_in=expires_in,
            current_user=user,
        )
        return {"url": access.signed_url, "expiresIn": access.expires_in}
    if procedure == "components.list":
        filters = cast(Mapping[str, object], input_value or {})
        vehicle_id = filters.get("vehicleId")
        return await list_components(
            vehicle_id=UUID(str(vehicle_id)) if vehicle_id else None,
            current_user=user,
            session=session,
        )
    if procedure == "components.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_component(
            ComponentCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                inventory_part_id=(
                    UUID(str(filters["inventoryPartId"]))
                    if filters.get("inventoryPartId")
                    else None
                ),
                name=str(filters.get("name", "")),
                component_type=str(filters.get("componentType", "OTHER")),
                component_subtype=filters.get("componentSubtype"),
                brand=filters.get("brand"),
                part_number=filters.get("partNumber"),
                serial_number=filters.get("serialNumber"),
                installation_date=_date_input(filters.get("installationDate")),
                expected_life_km=float(filters.get("expectedLifeKm", 0)),
                expected_life_days=(
                    int(filters["expectedLifeDays"]) if filters.get("expectedLifeDays") else None
                ),
                last_serviced_odometer=float(filters.get("lastServicedOdometer", 0)),
                alert_threshold_km=float(filters.get("alertThresholdKm", 0)),
                alert_threshold_days=(
                    int(filters["alertThresholdDays"])
                    if filters.get("alertThresholdDays")
                    else None
                ),
                notes=filters.get("notes"),
                status=str(filters.get("status", "ACTIVE")),
            ),
            user,
            session,
        )
    if procedure == "components.update":
        filters = cast(Mapping[str, object], input_value or {})
        component_id = filters.get("id") or filters.get("componentId")
        if not component_id:
            raise HTTPException(status_code=400, detail="componentId is required")
        update_fields = {
            key: filters[key]
            for key in (
                "inventoryPartId",
                "name",
                "componentType",
                "componentSubtype",
                "brand",
                "partNumber",
                "serialNumber",
                "installationDate",
                "expectedLifeKm",
                "expectedLifeDays",
                "lastServicedOdometer",
                "alertThresholdKm",
                "alertThresholdDays",
                "notes",
                "status",
            )
            if key in filters
        }
        component_update: dict[str, object] = {}
        field_map = {
            "inventoryPartId": "inventory_part_id",
            "name": "name",
            "componentType": "component_type",
            "componentSubtype": "component_subtype",
            "brand": "brand",
            "partNumber": "part_number",
            "serialNumber": "serial_number",
            "expectedLifeKm": "expected_life_km",
            "expectedLifeDays": "expected_life_days",
            "lastServicedOdometer": "last_serviced_odometer",
            "alertThresholdKm": "alert_threshold_km",
            "alertThresholdDays": "alert_threshold_days",
            "notes": "notes",
            "status": "status",
        }
        for source_key, target_key in field_map.items():
            if source_key in update_fields:
                component_update[target_key] = update_fields[source_key]
        if "installationDate" in update_fields:
            component_update["installation_date"] = _date_input(update_fields["installationDate"])
        return await update_component(
            UUID(str(component_id)),
            ComponentUpdate(**component_update),
            user,
            session,
        )
    if procedure == "components.remove":
        filters = cast(Mapping[str, object], input_value or {})
        component_id = filters.get("id") or filters.get("componentId")
        if not component_id:
            raise HTTPException(status_code=400, detail="componentId is required")
        return await remove_component(UUID(str(component_id)), user, session)
    if procedure == "documents.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_document(
            DocumentCreate(
                title=str(filters.get("title", "")),
                doc_type=str(filters.get("docType", "")),
                file_url=str(filters.get("fileUrl", "")),
                file_key=filters.get("fileKey"),
                file_checksum=filters.get("fileChecksum"),
                file_size_bytes=(
                    int(filters["fileSizeBytes"]) if filters.get("fileSizeBytes") is not None else None
                ),
                expiry_date=_date_input(filters.get("expiryDate")) or datetime.now(timezone.utc),
                vehicle_id=UUID(str(filters["vehicleId"])) if filters.get("vehicleId") else None,
            ),
            user,
            session,
        )
    if procedure == "documents.update":
        filters = cast(Mapping[str, object], input_value or {})
        document_id = filters.get("id") or filters.get("documentId")
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")
        return await update_document(
            UUID(str(document_id)),
            DocumentUpdate(
                title=filters.get("title"),
                file_url=filters.get("fileUrl"),
                file_key=filters.get("fileKey"),
                file_checksum=filters.get("fileChecksum"),
                file_size_bytes=(
                    int(filters["fileSizeBytes"]) if filters.get("fileSizeBytes") is not None else None
                ),
                expiry_date=_date_input(filters.get("expiryDate")),
            ),
            user,
            session,
        )
    if procedure == "documents.archive":
        filters = cast(Mapping[str, object], input_value or {})
        document_id = filters.get("id") or filters.get("documentId")
        if not document_id:
            raise HTTPException(status_code=400, detail="documentId is required")
        return await archive_document(
            UUID(str(document_id)),
            DocumentArchive(reason=str(filters.get("reason", "Archived from frontend"))),
            user,
            session,
        )
    if procedure in {
        "inventory.receive",
        "inventory.issue",
        "inventory.transfer",
        "inventory.adjust",
        "reservePart",
    }:
        filters = cast(Mapping[str, object], input_value or {})
        part_id = filters.get("id") or filters.get("partId")
        if not part_id:
            raise HTTPException(status_code=400, detail="partId is required")
        parsed_part_id = UUID(str(part_id))
        if procedure == "inventory.receive":
            return await receive_part(
                parsed_part_id,
                PartReceive(
                    quantity=int(filters.get("quantity", 0)),
                    unit_cost=float(filters["unitCost"]) if filters.get("unitCost") is not None else None,
                    reason=str(filters.get("reason", "")),
                ),
                user,
                session,
            )
        if procedure == "inventory.issue":
            return await issue_part(
                parsed_part_id,
                PartIssue(
                    quantity=int(filters.get("quantity", 0)),
                    reason=str(filters.get("reason", "")),
                    work_order_id=(
                        UUID(str(filters["workOrderId"])) if filters.get("workOrderId") else None
                    ),
                ),
                user,
                session,
            )
        if procedure == "inventory.transfer":
            return await transfer_part(
                parsed_part_id,
                PartTransfer(
                    to_bin_location=str(filters.get("toBinLocation", "")),
                    reason=str(filters.get("reason", "")),
                ),
                user,
                session,
            )
        if procedure == "inventory.adjust":
            return await adjust_part(
                parsed_part_id,
                PartAdjustment(
                    expected_quantity_on_hand=int(filters.get("expectedQuantityOnHand", 0)),
                    delta=int(filters.get("delta", 0)),
                    reason=str(filters.get("reason", "")),
                ),
                user,
                session,
            )
        return await reserve_part(
            parsed_part_id,
            PartReservation(
                work_order_id=UUID(str(filters["workOrderId"])),
                quantity=int(filters.get("quantity", 0)),
                reason=str(filters.get("reason", "Reserved for work order")),
            ),
            user,
            session,
        )
    if procedure == "returnReservedPart":
        filters = cast(Mapping[str, object], input_value or {})
        return await return_reserved_part(
            ReservationReturn(
                reservation_id=UUID(str(filters["reservationId"])),
                quantity=int(filters.get("quantity", 0)),
                reason=str(filters.get("reason", "Returned unused reserved stock")),
            ),
            user,
            session,
        )
    if procedure == "workOrders.updateStatus":
        filters = cast(Mapping[str, object], input_value or {})
        work_order_id = filters.get("id") or filters.get("workOrderId")
        if not work_order_id:
            raise HTTPException(status_code=400, detail="workOrderId is required")
        return await update_work_order_status(
            UUID(str(work_order_id)),
            WorkOrderStatusUpdate(
                status=str(filters.get("status", "")),
                expected_updated_at=_date_input(filters.get("expectedUpdatedAt")),
            ),
            user,
            session,
        )
    if procedure == "workOrders.bulkUpdate":
        filters = cast(Mapping[str, object], input_value or {})
        return await bulk_update_work_orders(
            WorkOrderBulkUpdate(
                work_order_ids=[UUID(str(item)) for item in filters.get("workOrderIds", [])],
                priority=str(filters["priority"]) if filters.get("priority") is not None else None,
                assigned_mechanic_id=(
                    UUID(str(filters["assignedMechanicId"]))
                    if filters.get("assignedMechanicId")
                    else None
                ),
                scheduled_for=_date_input(filters.get("scheduledFor")),
                archive=bool(filters["archive"]) if filters.get("archive") is not None else None,
                cancel=bool(filters.get("cancel", False)),
            ),
            user,
            session,
        )
    if procedure == "planning.maintenance":
        filters = cast(Mapping[str, object], input_value or {})
        from_date = filters.get("from")
        to_date = filters.get("to")
        return await maintenance_planning(
            from_date=_date_input(from_date),
            to_date=_date_input(to_date),
            current_user=user,
            session=session,
        )
    if procedure == "financials.metrics":
        return await financial_metrics(user, session)
    if procedure == "financials.vehicles":
        return await financial_vehicles(user, session)
    if procedure == "financials.reconcile":
        return await reconcile_financials(user, session)
    if procedure in {"financials.exportCsv", "financials.exportPdf"}:
        filters = cast(Mapping[str, object], input_value or {})
        export_handler = (
            export_financials_csv
            if procedure == "financials.exportCsv"
            else export_financials_pdf
        )
        return await export_handler(
            vehicle_id=(
                UUID(str(filters["vehicleId"])) if filters.get("vehicleId") else None
            ),
            record_type=str(filters["type"]) if filters.get("type") else None,
            category=str(filters["category"]) if filters.get("category") else None,
            from_date=_date_input(filters.get("from")),
            to_date=_date_input(filters.get("to")),
            current_user=user,
            session=session,
        )
    if procedure == "financials.list":
        filters = cast(Mapping[str, object], input_value or {})
        return await list_financials(
            vehicle_id=(
                UUID(str(filters["vehicleId"])) if filters.get("vehicleId") else None
            ),
            record_type=str(filters["type"]) if filters.get("type") else None,
            category=str(filters["category"]) if filters.get("category") else None,
            from_date=_date_input(filters.get("from")),
            to_date=_date_input(filters.get("to")),
            current_user=user,
            session=session,
        )
    if procedure == "financials.approvalQueue":
        return await approval_queue(user, session)
    if procedure == "financials.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_financial(
            FinancialCreate(
                vehicle_id=UUID(str(filters["vehicleId"])),
                type=str(filters.get("type", "")),
                category=str(filters.get("category", "")),
                amount=float(filters.get("amount", 0)),
                transaction_date=_date_input(filters.get("transactionDate"))
                or datetime.now(timezone.utc),
                tax_amount=float(filters.get("taxAmount", 0)),
                gstin=str(filters["gstin"]) if filters.get("gstin") else None,
                tax_category=(
                    str(filters["taxCategory"])
                    if filters.get("taxCategory")
                    else None
                ),
                invoice_number=(
                    str(filters["invoiceNumber"])
                    if filters.get("invoiceNumber")
                    else None
                ),
                vendor=str(filters["vendor"]) if filters.get("vendor") else None,
                payment_method=(
                    str(filters["paymentMethod"])
                    if filters.get("paymentMethod")
                    else None
                ),
                cost_center_type=(
                    str(filters["costCenterType"])
                    if filters.get("costCenterType")
                    else None
                ),
                cost_center_id=(
                    UUID(str(filters["costCenterId"]))
                    if filters.get("costCenterId")
                    else None
                ),
                tds_amount=float(filters.get("tdsAmount", 0)),
            ),
            user,
            session,
        )
    if procedure == "financials.reconcileRecord":
        filters = cast(Mapping[str, object], input_value or {})
        record_id = filters.get("id")
        if not record_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await reconcile_record(
            UUID(str(record_id)),
            ReconcileRecord(reconciliation_ref=str(filters.get("reconciliationRef", ""))),
            user,
            session,
        )
    if procedure == "financials.approve":
        filters = cast(Mapping[str, object], input_value or {})
        record_id = filters.get("id")
        if not record_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await approve_record(
            UUID(str(record_id)),
            Decision(reason=str(filters.get("reason", ""))),
            user,
            session,
        )
    if procedure == "financials.reverse":
        filters = cast(Mapping[str, object], input_value or {})
        record_id = filters.get("id")
        if not record_id:
            raise HTTPException(status_code=400, detail="id is required")
        return await reverse_record(
            UUID(str(record_id)),
            Decision(reason=str(filters.get("reason", ""))),
            user,
            session,
        )
    if procedure == "reports.maintenancePerformance":
        filters = cast(Mapping[str, object], input_value or {})
        return await maintenance_performance(
            from_date=_date_input(filters.get("from")),
            to_date=_date_input(filters.get("to")),
            current_user=user,
            session=session,
        )
    if procedure == "team.members":
        return await list_members(user, session)
    if procedure == "team.assignableMembers":
        return await list_assignable_members(user, session)
    if procedure == "team.invitations":
        return await list_invitations(user, session)
    if procedure == "team.invite":
        filters = cast(Mapping[str, object], input_value or {})
        return await invite_member(
            InviteMember(
                email=str(filters.get("email", "")),
                role=str(filters.get("role", "")),
            ),
            user,
            session,
        )
    if procedure == "team.resendInvitation":
        filters = cast(Mapping[str, object], input_value or {})
        invitation_id = filters.get("id") or filters.get("invitationId")
        if not invitation_id:
            raise HTTPException(status_code=400, detail="invitationId is required")
        return await resend_invitation(UUID(str(invitation_id)), user, session)
    if procedure == "team.revokeInvitation":
        filters = cast(Mapping[str, object], input_value or {})
        invitation_id = filters.get("id") or filters.get("invitationId")
        if not invitation_id:
            raise HTTPException(status_code=400, detail="invitationId is required")
        return await revoke_invitation(
            UUID(str(invitation_id)),
            RevokeInvitation(reason=str(filters.get("reason", ""))),
            user,
            session,
        )
    if procedure == "vendors.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_vendor(
            VendorCreate(
                name=str(filters.get("name", "")),
                contact_person=(
                    str(filters["contactPerson"])
                    if filters.get("contactPerson") is not None
                    else None
                ),
                phone=str(filters.get("phone", "")),
                email=str(filters["email"]) if filters.get("email") else None,
            ),
            user,
            session,
        )
    if procedure == "vendors.list":
        return await list_vendors(user, session)
    if procedure == "purchaseOrders.create":
        filters = cast(Mapping[str, object], input_value or {})
        return await create_purchase_order(
            PurchaseOrderCreate(
                vendor_id=UUID(str(filters["vendorId"])),
                total_cost=float(filters.get("totalCost", 0)),
                supplier_invoice_number=(
                    str(filters["supplierInvoiceNumber"])
                    if filters.get("supplierInvoiceNumber") is not None
                    else None
                ),
            ),
            user,
            session,
        )
    if procedure == "purchaseOrders.list":
        return await list_purchase_orders(user, session)
    if procedure == "billing.plans":
        return await billing_plans()
    if procedure == "billing.checkPlanEligibility":
        filters = cast(Mapping[str, object], input_value or {})
        plan = filters.get("plan")
        if not isinstance(plan, str):
            raise HTTPException(status_code=400, detail="plan is required")
        return await plan_eligibility(plan, user, session)
    if procedure == "billing.status":
        return await billing_status(user, session)
    if procedure == "billing.invoices":
        return await billing_invoices(user, session)
    if procedure == "billing.payments":
        return await billing_payments(user, session)
    if procedure == "billing.generateInvoice":
        return await generate_invoice(user, session)
    if procedure == "billing.createTestOrder":
        filters = cast(Mapping[str, object], input_value or {})
        invoice_id = filters.get("invoiceId")
        if not invoice_id:
            raise HTTPException(status_code=400, detail="invoiceId is required")
        return await create_test_order(UUID(str(invoice_id)), user, session)
    if procedure == "billingTest.activateStarter":
        return await activate_starter(user, session)
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
            current_user=user,
            session=session,
        )
    if procedure == "compliance.summary":
        return await _compliance_summary(
            filters=cast(Mapping[str, object], input_value or {}),
            user=user,
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


async def _odometer_history(user: TenantUser, session: AsyncSession) -> list[dict[str, object]]:
    if user.role != "FLEET_MANAGER":
        raise HTTPException(status_code=403, detail="Fleet manager access required")
    result = await session.execute(
        text(
            'select o.*, v."licensePlate", v."vin" from "odometer_logs" o '
            'join "vehicles" v on v."id" = o."vehicleId" and v."orgId" = :org_id '
            'order by o."createdAt" desc limit 100'
        ),
        {"org_id": user.org_id},
    )
    return [dict(row) for row in result.mappings()]


async def _vehicle_health(
    vehicle_id: UUID,
    user: TenantUser,
    session: AsyncSession,
) -> dict[str, object]:
    if user.role not in {"SUPERADMIN", "FLEET_MANAGER", "MECHANIC", "TECHNICIAN", "DRIVER"}:
        raise HTTPException(status_code=403, detail="Vehicle health access required")
    vehicle_result = await session.execute(
        text('select * from "vehicles" where "id" = :vehicle_id and "orgId" = :org_id'),
        {"vehicle_id": str(vehicle_id), "org_id": user.org_id},
    )
    vehicle = vehicle_result.mappings().first()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found in your organization scope")
    components_result = await session.execute(
        text('select * from "components" where "vehicleId" = :vehicle_id order by "name"'),
        {"vehicle_id": str(vehicle_id)},
    )
    odometers_result = await session.execute(
        text(
            'select * from "odometer_logs" where "vehicleId" = :vehicle_id '
            'order by "createdAt" desc limit 12'
        ),
        {"vehicle_id": str(vehicle_id)},
    )
    work_order_query = (
        'select * from "work_orders" where "vehicleId" = :vehicle_id and "orgId" = :org_id '
        'and "status" not in (\'COMPLETED\', \'CANCELLED\') '
    )
    params: dict[str, object] = {"vehicle_id": str(vehicle_id), "org_id": user.org_id}
    if user.role in {"MECHANIC", "TECHNICIAN"}:
        work_order_query += 'and "assignedMechanicId" = :user_id '
        params["user_id"] = user.id
    work_orders_result = await session.execute(
        text(work_order_query + 'order by "updatedAt" desc limit 12'),
        params,
    )
    documents_result = await session.execute(
        text(
            'select * from "documents" where "vehicleId" = :vehicle_id and "orgId" = :org_id '
            'order by "expiryDate" limit 12'
        ),
        {"vehicle_id": str(vehicle_id), "org_id": user.org_id},
    )
    components = [dict(row) for row in components_result.mappings()]
    odometers = [dict(row) for row in odometers_result.mappings()]
    work_orders = [dict(row) for row in work_orders_result.mappings()]
    documents = [dict(row) for row in documents_result.mappings()]
    current_odometer = float(vehicle["currentOdometer"] or 0)
    due_components = [
        item
        for item in components
        if current_odometer - float(item["lastServicedOdometer"] or 0)
        >= float(item["alertThresholdKm"] or 0)
    ]
    now = datetime.now(timezone.utc)
    due_documents = [
        item for item in documents if item["expiryDate"] <= now + timedelta(days=30)
    ]
    return {
        "vehicle": {**dict(vehicle), "components": components},
        "odometers": odometers,
        "workOrders": work_orders,
        "documents": documents,
        "health": {
            "componentCount": len(components),
            "dueComponents": len(due_components),
            "openWorkOrders": len(work_orders),
            "dueDocuments": len(due_documents),
            "readiness": "READY"
            if vehicle["status"] == "ACTIVE" and not due_components and not due_documents
            else "REVIEW",
        },
    }


async def _recent_activity(user: TenantUser, session: AsyncSession) -> list[dict[str, object]]:
    role_filter = ""
    params: dict[str, object] = {"org_id": user.org_id}
    if user.role in {"MECHANIC", "TECHNICIAN"}:
        role_filter = 'and "assignedMechanicId" = :user_id '
        params["user_id"] = user.id
    orders = await session.execute(
        text(
            'select "id", "vehicleId", "title", "status", "createdAt" from "work_orders" '
            'where "orgId" = :org_id ' + role_filter + 'order by "createdAt" desc limit 10'
        ),
        params,
    )
    alerts = await session.execute(
        text(
            'select "id", "title", "message", "createdAt" from "notifications" '
            'where "orgId" = :org_id and "recipientId" = :user_id '
            'order by "createdAt" desc limit 10'
        ),
        {"org_id": user.org_id, "user_id": user.id},
    )
    odometer_filter = ""
    odometer_params: dict[str, object] = {"org_id": user.org_id}
    if user.role == "DRIVER":
        odometer_filter = 'where o."driverId" = :user_id '
        odometer_params["user_id"] = user.id
    odometers = await session.execute(
        text(
            'select o."id", o."vehicleId", o."reading", o."isFlagged", o."createdAt" '
            'from "odometer_logs" o join "vehicles" v on v."id" = o."vehicleId" '
            'and v."orgId" = :org_id ' + odometer_filter
            + 'order by o."createdAt" desc limit 10'
        ),
        odometer_params,
    )
    activity: list[dict[str, object]] = []
    for row in orders.mappings():
        activity.append(
            {
                "id": row["id"],
                "kind": "work_order",
                "title": row["title"],
                "detail": f'{row["vehicleId"]} · {row["status"]}',
                "createdAt": row["createdAt"],
            }
        )
    for row in alerts.mappings():
        activity.append(
            {
                "id": row["id"],
                "kind": "notification",
                "title": row["title"],
                "detail": row["message"],
                "createdAt": row["createdAt"],
            }
        )
    for row in odometers.mappings():
        activity.append(
            {
                "id": row["id"],
                "kind": "odometer",
                "title": f'Odometer updated · {row["vehicleId"]}',
                "detail": f'{row["reading"]} km' + (" · flagged" if row["isFlagged"] else ""),
                "createdAt": row["createdAt"],
            }
        )
    return sorted(activity, key=lambda item: item["createdAt"], reverse=True)[:20]


async def _notification_source_detail(
    notification_id: UUID,
    user: TenantUser,
    session: AsyncSession,
) -> dict[str, object]:
    notification_result = await session.execute(
        text(
            'select * from "notifications" where "id" = :notification_id '
            'and "orgId" = :org_id and "recipientId" = :user_id'
        ),
        {
            "notification_id": str(notification_id),
            "org_id": user.org_id,
            "user_id": user.id,
        },
    )
    notification = notification_result.mappings().first()
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification is outside your organization scope")
    source = None
    reference_id = notification["referenceId"]
    source_type = str(notification["sourceType"] or "SYSTEM")
    tables = {
        "WORK_ORDER": "work_orders",
        "VEHICLE_ISSUE": "vehicle_issues",
        "VEHICLE": "vehicles",
        "DOCUMENT_EXPIRY": "documents",
        "INVENTORY_LOW": "inventory_parts",
    }
    table = tables.get(source_type)
    if reference_id and table:
        source_result = await session.execute(
            text(f'select * from "{table}" where "id" = :reference_id and "orgId" = :org_id'),
            {"reference_id": str(reference_id), "org_id": user.org_id},
        )
        row = source_result.mappings().first()
        source = dict(row) if row else None
    return {"notification": dict(notification), "sourceType": source_type, "source": source}


@router.api_route("/{procedure:path}", methods=["GET", "POST"], include_in_schema=False)
async def frontend_compatibility(
    procedure: str,
    request: Request,
    input: str | None = Query(default=None),
    current_user: TenantUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> object:
    if request.method == "POST":
        payload = await request.json()
        input = json.dumps(payload)
    procedures = procedure.split(",")
    responses = []
    for index, name in enumerate(procedures):
        value = await _dispatch(name, _input_value(input, index), current_user, session)
        responses.append({"result": {"data": {"json": _frontend_shape(value)}}})
    if len(responses) == 1:
        return responses[0]
    return responses
