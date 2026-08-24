import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vendor live PostgreSQL contract", () => {
  it("does not declare or write the historical vendors.updatedAt column", () => {
    const schema = readFileSync(resolve(process.cwd(), "drizzle/fleetops-schema.ts"), "utf8");
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const vendorSchema = schema.match(/export const vendors =[^\n]+/u)?.[0] ?? "";
    const vendorCreate = router.match(/vendors: router\([\s\S]*?pricingHistory:/u)?.[0] ?? "";
    expect(vendorSchema).toContain('createdAt: timestamp("createdAt"');
    expect(vendorSchema).not.toContain("...audit");
    expect(vendorCreate).not.toContain("updatedAt: new Date()");
    expect(vendorCreate).toContain('action: "VENDOR_CREATED"');
  });
});
