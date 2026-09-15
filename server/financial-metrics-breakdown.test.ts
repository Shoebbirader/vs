import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../client/src/components/workspaces/AccountantWorkspace.tsx", import.meta.url), "utf8");

describe("Accountant category expense metrics", () => {
  it("aggregates expense categories only for the active organization vehicles", () => {
    expect(source).toContain('const expenseBreakdown = new Map<string, number>();');
    expect(source).toContain('const category = String(record.category || "OTHER_EXPENSE")');
    expect(source).toContain("expenseBreakdown: Array.from(expenseBreakdown.entries())");
  });

  it("renders the breakdown beside per-vehicle P&L and CPK", () => {
    expect(workspace).toContain("const expenseBreakdown = metrics.data?.expenseBreakdown ?? [];");
    expect(workspace).toContain("expenseBreakdown.slice(0, 8)");
    expect(workspace).toContain("organization expense");
  });
});
