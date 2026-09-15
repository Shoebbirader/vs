import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("rate limiter", () => {
  it("allows up to the configured limit and rejects the next request", () => {
    const allow = createRateLimiter(2, 1_000);
    expect(allow("tenant-a", 100).allowed).toBe(true);
    expect(allow("tenant-a", 100).allowed).toBe(true);
    expect(allow("tenant-a", 100).allowed).toBe(false);
    expect(allow("tenant-a", 100).retryAfterMs).toBe(1_000);
  });

  it("resets after the time window", () => {
    const allow = createRateLimiter(1, 1_000);
    expect(allow("ip-a", 100).allowed).toBe(true);
    expect(allow("ip-a", 1_100).allowed).toBe(true);
  });
});
