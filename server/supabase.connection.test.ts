import { describe, expect, it } from "vitest";

describe("Supabase connection", () => {
  it("accepts the configured project URL and server key", async () => {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(url).toMatch(/^https:\/\//);
    expect(serviceRoleKey).toBeTruthy();

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: serviceRoleKey!,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(response.status).toBeLessThan(400);
  }, 15_000);
});
