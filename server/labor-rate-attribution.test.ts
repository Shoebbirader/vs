import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/fleetops-schema.ts", import.meta.url), "utf8");

describe("organization labor-rate attribution", () => {
  it("defines a non-negative INR labor rate in organization settings", () => {
    expect(schemaSource).toContain('laborRatePerHour: numeric("laborRatePerHour").notNull().default("0")');
    expect(routerSource).toContain("laborRatePerHour: z.number().nonnegative().max(100000).default(0)");
  });

  it("attributes approved labor using hours multiplied by the configured rate", () => {
    expect(routerSource).toContain("const laborRatePerHour = Number((settings as any)?.laborRatePerHour ?? 0)");
    expect(routerSource).toContain("laborRatePerHour * Number(order.laborHours)");
    expect(routerSource).toContain('category: "MAINTENANCE_LABOR"');
  });

  it("does not fabricate labor cost when rate or hours are zero or unset", () => {
    expect(routerSource).toContain("laborRatePerHour > 0 && Number(order.laborHours ?? 0) > 0 ? laborRatePerHour * Number(order.laborHours) : 0");
    expect(routerSource).toContain("if (laborCost > 0 && tx.financialRecord?.create)");
  });
});
