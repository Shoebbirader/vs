import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inventoryPart: { findMany: vi.fn() },
  vendor: { findFirst: vi.fn(), create: vi.fn() },
  purchaseOrder: { create: vi.fn() },
  user: { findMany: vi.fn() },
  notification: { findFirst: vi.fn(), createMany: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));

import { evaluateLowInventory } from "./automation";

describe("low-inventory automation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a draft PO and notifies the Inventory Manager for a below-threshold part", async () => {
    mocks.inventoryPart.findMany.mockResolvedValue([{ id: "part-1", orgId: "org-1", sku: "TIRE-LEFT", name: "Left tire", quantityOnHand: 1, minReorderLevel: 5, unitCost: 7200 }]);
    mocks.vendor.findFirst.mockResolvedValue({ id: "vendor-1", name: "FleetOps auto-reorder queue" });
    mocks.purchaseOrder.create.mockResolvedValue({ id: "po-1" });
    mocks.notification.findFirst.mockResolvedValue(null);
    mocks.user.findMany.mockResolvedValue([{ id: "inventory-manager-1", role: "INVENTORY_MANAGER" }]);

    const result = await evaluateLowInventory("org-1");

    expect(result).toEqual({ lowStock: 1, draftPurchaseOrders: 1 });
    expect(mocks.purchaseOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orgId: "org-1", vendorId: "vendor-1", status: "DRAFT", totalCost: 64800 }) });
    expect(mocks.notification.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.notification.createMany).toHaveBeenNthCalledWith(1, { data: [expect.objectContaining({ recipientId: "inventory-manager-1", title: "Inventory below reorder level", type: "INVENTORY_LOW", referenceId: "part-1" })] });
    expect(mocks.notification.createMany).toHaveBeenNthCalledWith(2, { data: [expect.objectContaining({ recipientId: "inventory-manager-1", title: "Draft purchase order created", type: "PURCHASE_ORDER_DRAFT", referenceId: "po-1" })] });
  });
});
