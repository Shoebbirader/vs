import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const startupSource = readFileSync(
  new URL("./_core/index.ts", import.meta.url),
  "utf8"
);
const serverlessSource = readFileSync(
  new URL("../serverless-entry.ts", import.meta.url),
  "utf8"
);
const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);
const viteSource = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8"
);

describe("runtime integrations", () => {
  it("attaches events and realtime to the standalone HTTP server", () => {
    expect(startupSource).toContain("attachEventHandlers(app)");
    expect(startupSource).toContain("realtimeServer.attach(server)");
  });

  it("attaches event handlers to the serverless Express app", () => {
    expect(serverlessSource).toContain("attachEventHandlers(app)");
  });

  it("exposes the driver workflow service through tRPC", () => {
    expect(routerSource).toContain("preTripChecklist:");
    expect(routerSource).toContain("submitPreTripChecklist:");
    expect(routerSource).toContain("issueHistory:");
    expect(routerSource).toContain("submitWorkflowIssue:");
  });

  it("configures the PWA plugin", () => {
    expect(viteSource).toContain("VitePWA(");
    expect(viteSource).toContain("registerType: \"autoUpdate\"");
  });
});
