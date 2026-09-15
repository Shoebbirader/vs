import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
}));

vi.mock("./db", () => ({ db: { execute: mocks.execute } }));

import { getReadiness } from "./health";

describe("HTTP readiness checks", () => {
  it("reports database and configuration readiness", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(getReadiness()).resolves.toMatchObject({
      ok: true,
      database: "ok",
      configuration: "ok",
      service: "FleetOps API",
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("reports a degraded database without exposing connection details", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("database unavailable"));
    vi.stubEnv("NODE_ENV", "development");

    await expect(getReadiness()).resolves.toMatchObject({
      ok: false,
      database: "degraded",
      configuration: "ok",
    });
    expect(JSON.stringify(await getReadiness())).not.toContain(
      "database unavailable"
    );
  });
});
