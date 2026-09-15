import { describe, expect, it } from "vitest";

describe("Supabase CLI deployment credentials", () => {
  it("authenticates against the Supabase Management API", async () => {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    expect(token, "SUPABASE_ACCESS_TOKEN must be supplied for deployment").toBeTruthy();
    const response = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok, `Supabase Management API returned ${response.status}`).toBe(true);
  });
});
