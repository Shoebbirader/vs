import { describe, expect, it, vi } from "vitest";
import { createRequestId, logRequestError, logRequestSignal, redactMessage } from "./observability";

describe("observability", () => {
  it("creates a non-empty correlation identifier", () => {
    expect(createRequestId()).toMatch(/[0-9a-f-]{20,}/i);
  });

  it("redacts token-like query values and bounds messages", () => {
    expect(redactMessage("https://fleetops.test?access_token=secret-value&x=1")).toContain("access_token=[REDACTED]");
    expect(redactMessage("x".repeat(700))).toHaveLength(500);
  });

  it("emits structured error fields without raw secrets", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logRequestError({ requestId: "req-1", path: "team.invite", code: "UNAUTHORIZED", message: "refresh_token=secret-value" });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('\"requestId\":\"req-1\"'));
    expect(spy.mock.calls[0]?.[0]).not.toContain("secret-value");
    spy.mockRestore();
  });

  it("emits monitoring signals with bounded duration and redacted messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logRequestSignal({ event: "slow_query", requestId: "req-2", path: "dashboard.summary", durationMs: 1234.8, message: "access_token=secret-value" });
    const payload = spy.mock.calls[0]?.[0] as string;
    expect(payload).toContain('"event":"slow_query"');
    expect(payload).toContain('"durationMs":1235');
    expect(payload).not.toContain("secret-value");
    spy.mockRestore();
  });
});
