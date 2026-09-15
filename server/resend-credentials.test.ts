import { describe, expect, it } from "vitest";

describe("Resend credentials", () => {
  it("authenticate against the read-only domains endpoint when configured", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      expect(apiKey).toBeTruthy();
      return;
    }
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data?: unknown };
    expect(payload).toHaveProperty("data");
  }, 15_000);
});
