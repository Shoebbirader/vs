import { afterEach, describe, expect, it, vi } from "vitest";
import { renderInvitationEmail, sendInvitationEmail } from "./invitation-email";

describe("invitation email template", () => {
  it("renders branded secure join content without operational data", () => {
    const result = renderInvitationEmail({ organizationName: "Transit <Ops>", inviteeEmail: "driver@example.com", role: "FLEET_MANAGER", joinUrl: "https://fleetops.example/join/token", expiresAt: new Date("2026-09-01T00:00:00Z") });
    expect(result.subject).toContain("on VahanSync");
    expect(result.text).toContain("on VahanSync");
    expect(result.text).toContain("https://fleetops.example/join/token");
    expect(result.html).toContain("Transit &lt;Ops&gt;");
    expect(result.html).toContain("VahanSync");
    expect(result.html).toContain("Join organization");
    expect(result.html).not.toContain("vehicle");
    expect(result.html).not.toContain("work order");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the branded message through Resend without exposing the secret", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendInvitationEmail({ organizationName: "FleetOps Test", inviteeEmail: "driver@example.com", role: "DRIVER", joinUrl: "https://fleetops.example/join/token", expiresAt: new Date("2026-09-01T00:00:00Z") });
    expect(result).toEqual({ id: "email_123" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    expect(String(request.body)).toContain("VahanSync");
    expect(String(request.body)).toContain("FleetOps Test");
  });
});
