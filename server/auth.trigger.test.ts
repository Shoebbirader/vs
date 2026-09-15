import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const triggerMigration = readFileSync(new URL("../supabase/migrations/20260818000300_auth_trigger.sql", import.meta.url), "utf8");

describe("FleetOps Auth trigger", () => {
  it("provisions the required trial organization fields", () => {
    expect(triggerMigration).toContain('"id", "name", "subscriptionTier"');
    expect(triggerMigration).toContain('"currency", "updatedAt"');
    expect(triggerMigration).toContain('"id", "authUserId", "orgId"');
    expect(triggerMigration).toContain("gen_random_uuid()");
    expect(triggerMigration).toContain("'TRIAL_FREE'");
    expect(triggerMigration).toContain("'INR'");
    expect(triggerMigration).toContain("now());");
  });
});
