import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) }));
vi.mock("./db", () => ({ db: { execute: mocks.execute } }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import { systemRouter } from "./_core/systemRouter";

describe("public system diagnostics", () => {
  it("returns a safe release and PostgreSQL dependency status", async () => {
    const result = await systemRouter.createCaller({} as never).health({ timestamp: 123, correlationId: "fleetops-test-correlation-123" });
    expect(result).toMatchObject({ ok: true, release: "fleetops-observability-20260820", database: "ok", clientTimestamp: 123, correlationId: "fleetops-test-correlation-123" });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("exposes release metadata without tenant data", async () => {
    const result = await systemRouter.createCaller({} as never).release();
    expect(result).toEqual({ release: "fleetops-observability-20260820", service: "FleetOps API", environment: "development" });
  });
});
