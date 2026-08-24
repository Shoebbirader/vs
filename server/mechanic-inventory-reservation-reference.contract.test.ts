import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Mechanic inventory reservation reference contract", () => {
  it("uses a tenant-scoped reference list rather than Inventory Manager controls", () => {
    const workspace = readFileSync(resolve(process.cwd(), "client/src/components/RoleWorkspaces.tsx"), "utf8");
    expect(workspace).toContain("const inventory = trpc.inventory.references.useQuery(undefined, { retry: false });");
    expect(workspace).toContain("Reserve a part<select");
    expect(workspace).toContain("trpc.workOrders.reservePart.useMutation");
  });
});
