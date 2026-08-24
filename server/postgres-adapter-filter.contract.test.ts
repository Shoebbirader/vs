import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase PostgreSQL adapter filter contract", () => {
  it("translates component work-order dedupe and open-triage predicate shapes", () => {
    const source = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(source).toContain("if (o.notIn) return `${c} NOT IN");
    expect(source).toContain("if (o.contains !== undefined) return `${c} ILIKE");
    expect(source).not.toContain('return `${c} = \'[object Object]\'`');
  });
});
