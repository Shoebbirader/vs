import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("reports success without mutating a legacy session cookie", async () => {
    const ctx: TrpcContext = {
      user: null,
      fleetopsUser: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const result = await appRouter.createCaller(ctx).auth.logout();
    expect(result).toEqual({ success: true });
  });
});
