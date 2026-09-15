import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const authorization = request.headers.get("authorization");
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  if (!authorization || authorization !== expected) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { data: organizations, error: orgError } = await supabase.from("organizations").select("id");
    if (orgError) throw orgError;

    let createdWorkOrders = 0;
    let lowStockAlerts = 0;

    for (const organization of organizations ?? []) {
      const { data: vehicles, error: vehicleError } = await supabase.from("vehicles").select("id, licensePlate, currentOdometer").eq("orgId", organization.id);
      if (vehicleError) throw vehicleError;
      const { data: admins, error: adminError } = await supabase.from("users").select("id").eq("orgId", organization.id).in("role", ["SUPERADMIN", "FLEET_MANAGER", "INVENTORY_MANAGER"]);
      if (adminError) throw adminError;

      for (const vehicle of vehicles ?? []) {
        const { data: components, error: componentError } = await supabase.from("components").select("id, name, expectedLifeKm, lastServicedOdometer, alertThresholdKm").eq("vehicleId", vehicle.id);
        if (componentError) throw componentError;
        for (const component of components ?? []) {
          const consumed = Number(vehicle.currentOdometer) - Number(component.lastServicedOdometer);
          if (consumed < Number(component.alertThresholdKm)) continue;
          const { data: existing } = await supabase.from("work_orders").select("id").eq("orgId", organization.id).eq("vehicleId", vehicle.id).in("status", ["OPEN", "IN_PROGRESS"]).ilike("title", `%${component.name}%`).limit(1);
          if (existing?.length) continue;
          const { data: workOrder, error: workOrderError } = await supabase.from("work_orders").insert({ orgId: organization.id, vehicleId: vehicle.id, title: `${component.name} service threshold reached`, description: `${component.name} crossed its service threshold.`, priority: consumed >= Number(component.expectedLifeKm) ? "CRITICAL" : "HIGH" }).select("id").single();
          if (workOrderError) throw workOrderError;
          if (admins?.length) {
            const { error: notificationError } = await supabase.from("notifications").insert(admins.map((admin) => ({ orgId: organization.id, recipientId: admin.id, title: `Maintenance alert: ${component.name}`, message: `Vehicle: ${vehicle.licensePlate} · Component: ${component.name} crossed its service threshold · Current odometer: ${vehicle.currentOdometer} km · Last serviced at: ${component.lastServicedOdometer} km`, type: "MAINTENANCE_THRESHOLD", severity: consumed >= Number(component.expectedLifeKm) ? "CRITICAL" : "HIGH", referenceId: workOrder.id })));
            if (notificationError) throw notificationError;
          }
          createdWorkOrders += 1;
        }
      }

      const { data: parts, error: partsError } = await supabase.from("inventory_parts").select("id, sku, name, quantityOnHand, minReorderLevel, unitCost").eq("orgId", organization.id);
      if (partsError) throw partsError;
      const { data: existingVendors } = await supabase.from("vendors").select("id").eq("orgId", organization.id).eq("name", "FleetOps auto-reorder queue").limit(1);
      let reorderVendorId = existingVendors?.[0]?.id;
      if (!reorderVendorId) {
        const { data: createdVendor, error: vendorError } = await supabase.from("vendors").insert({ orgId: organization.id, name: "FleetOps auto-reorder queue", phone: "SYSTEM" }).select("id").single();
        if (vendorError) throw vendorError;
        reorderVendorId = createdVendor.id;
      }
      for (const part of parts ?? []) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existingAlert } = await supabase.from("notifications").select("id").eq("orgId", organization.id).eq("referenceId", part.id).eq("type", "INVENTORY_LOW").gte("createdAt", since).limit(1);
        if (existingAlert?.length || !admins?.length || Number(part.quantityOnHand) > Number(part.minReorderLevel)) continue;
        const suggestedQty = Math.max(Number(part.minReorderLevel) * 2 - Number(part.quantityOnHand), 1);
        const { data: purchaseOrder, error: purchaseOrderError } = await supabase.from("purchase_orders").insert({ orgId: organization.id, vendorId: reorderVendorId, status: "DRAFT", totalCost: suggestedQty * Number(part.unitCost) }).select("id").single();
        if (purchaseOrderError) throw purchaseOrderError;
        const { error: notificationError } = await supabase.from("notifications").insert(admins.flatMap((admin) => [{ orgId: organization.id, recipientId: admin.id, title: `Inventory critical: ${part.name}`, message: `SKU: ${part.sku} · Quantity on hand: ${part.quantityOnHand} units · Minimum reorder level: ${part.minReorderLevel} units · Suggested order: ${suggestedQty} units · Status: Draft PO created`, type: "INVENTORY_LOW", severity: "HIGH", referenceId: part.id }, { orgId: organization.id, recipientId: admin.id, title: "Draft purchase order created", message: `Draft PO created for ${part.name} (${part.sku}) · Quantity: ${suggestedQty} units · Estimated cost: ${suggestedQty * Number(part.unitCost)} · Status: Awaiting approval`, type: "PURCHASE_ORDER_DRAFT", severity: "INFO", referenceId: purchaseOrder.id }]));
        if (notificationError) throw notificationError;
        lowStockAlerts += 1;
      }

      const { data: documents, error: documentError } = await supabase.from("documents").select("id, title, expiryDate").eq("orgId", organization.id).lte("expiryDate", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
      if (documentError) throw documentError;
      for (const document of documents ?? []) {
        const { data: existingDocumentAlert } = await supabase.from("notifications").select("id").eq("orgId", organization.id).eq("referenceId", document.id).eq("type", "DOCUMENT_EXPIRY").gte("createdAt", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1);
        if (existingDocumentAlert?.length || !admins?.length) continue;
        const { error: documentNotificationError } = await supabase.from("notifications").insert(admins.map((admin) => ({ orgId: organization.id, recipientId: admin.id, title: `Compliance document expiring: ${document.title}`, message: `Document: ${document.title} · Expiry date: ${new Date(document.expiryDate).toLocaleDateString("en-IN")} · Days remaining: ${Math.ceil((new Date(document.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))} · Action: Renew or replace before expiry`, type: "DOCUMENT_EXPIRY", severity: new Date(document.expiryDate) < new Date() ? "CRITICAL" : "HIGH", referenceId: document.id })));
        if (documentNotificationError) throw documentNotificationError;
      }
    }

    return Response.json({ ok: true, organizations: organizations?.length ?? 0, createdWorkOrders, lowStockAlerts });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
