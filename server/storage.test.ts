import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
}));
const monitoring = vi.hoisted(() => ({ logRequestSignal: vi.fn() }));

vi.mock("./supabase", () => ({
  supabaseAdmin: { storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) } },
}));
vi.mock("./observability", () => monitoring);

import { storageGetSignedUrl } from "./storage";

describe("storage monitoring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits a storage failure signal when signed URL creation fails", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "access_token=secret-value" } });

    await expect(storageGetSignedUrl("compliance/file.pdf")).rejects.toThrow("Supabase Storage signed URL failed");
    expect(monitoring.logRequestSignal).toHaveBeenCalledWith({
      event: "storage_error",
      requestId: "storage",
      path: "createSignedUrl",
      message: "access_token=secret-value",
    });
  });
});

