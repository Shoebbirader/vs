import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organization: { findMany: vi.fn() },
  vehicle: { findFirst: vi.fn() },
  component: { findMany: vi.fn() },
  workOrder: { findFirst: vi.fn(), create: vi.fn() },
  user: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
}));

vi.mock("./db", () => ({ fleetDb: mocks }));
import { evaluateAllOrganizations, evaluateVehicleMaintenance } from "./automation";

describe("component maintenance automation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a work order and notifies Fleet Manager when an existing vehicle is already overdue", async () => {
    mocks.vehicle.findFirst.mockResolvedValue({
      id: "vehicle-1",
      orgId: "org-1",
      licensePlate: "FLEET-01",
      currentOdometer: 50000,
    });
    mocks.component.findMany.mockResolvedValue([{
        id: "component-1",
        name: "Left tire",
        lastServicedOdometer: 10000,
        expectedLifeKm: 40000,
        alertThresholdKm: 38000,
      }]);
    mocks.workOrder.findFirst.mockResolvedValue(null);
    mocks.workOrder.create.mockResolvedValue({ id: "work-order-1" });
    mocks.user.findMany.mockResolvedValue([{ id: "fleet-manager-1", role: "FLEET_MANAGER" }]);

    const result = await evaluateVehicleMaintenance("vehicle-1", "org-1");

    expect(result).toEqual({ createdWorkOrders: 1 });
    expect(mocks.component.findMany).toHaveBeenCalledWith({ where: { vehicleId: "vehicle-1" } });
    expect(mocks.workOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orgId: "org-1",
      vehicleId: "vehicle-1",
      title: "Left tire service threshold reached",
      priority: "CRITICAL",
      status: "OPEN",
      id: expect.any(String),
      createdAt: expect.any(Date),
    }) });
    expect(mocks.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      recipientId: "fleet-manager-1",
      title: "Maintenance lifecycle alert",
      type: "MAINTENANCE_THRESHOLD",
      referenceId: "work-order-1",
      severity: "HIGH",
      sourceType: "WORK_ORDER",
      dedupeKey: expect.stringContaining("MAINTENANCE_THRESHOLD:work-order-1"),
    })] });
  });

  it("emits an automation failure signal when the scheduled evaluation fails", async () => {
    const failure = new Error("refresh_token=secret-value");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.organization.findMany.mockRejectedValue(failure);

    await expect(evaluateAllOrganizations()).rejects.toThrow(failure);

    const payload = spy.mock.calls[0]?.[0] as string;
    expect(payload).toContain('"event":"automation_failure"');
    expect(payload).toContain('"requestId":"heartbeat"');
    expect(payload).toContain("[REDACTED]");
    expect(payload).not.toContain("secret-value");
    spy.mockRestore();
  });
});
