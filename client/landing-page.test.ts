import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const landing = fs.readFileSync(path.join(root, "client/src/pages/LandingPage.tsx"), "utf8");
const marketing = fs.readFileSync(path.join(root, "client/src/pages/MarketingPages.tsx"), "utf8");
const app = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
const home = fs.readFileSync(path.join(root, "client/src/pages/Home.tsx"), "utf8");
const authSurface = fs.readFileSync(path.join(root, "client/src/components/public/PublicAuthSurface.tsx"), "utf8");

describe("public VahanSync landing page", () => {
  it("exposes distinct public calls to action", () => {
    expect(marketing).toContain("Sign in");
    expect(marketing).toContain("/login");
    expect(landing).toContain("Create your organization");
    expect(landing).toContain("/create-organization");
    expect(landing).toContain("Keep the fleet moving");
    expect(landing).toContain("Every handoff connected");
    expect(landing).toContain("public-signal-canvas");
  });

  it("shows the completed Supabase-hosted workflow-video chapters with native controls and transcripts", () => {
    expect(landing).toContain("vahansync-media/marketing/workflow/v1");
    expect(landing).toContain("vahansync-workflow-01.mp4");
    expect(landing).toContain("vahansync-workflow-02-vin-signal.mp4");
    expect(landing).toContain('controls preload="metadata" playsInline');
    expect(landing).toContain("Read this chapter’s transcript");
    expect(landing).toContain("The film is in production");
  });

  it("routes public auth paths without replacing invitation or workspace routes", () => {
    expect(app).toContain('path="/login"');
    expect(app).toContain('path="/create-organization"');
    expect(app).toContain('path="/join/:token"');
    expect(app).toContain('path="/workspace/:section"');
    expect(home).toContain('publicMode === "landing"');
    expect(home).toContain('publicMode === "signup"');
  });

  it("uses the replacement authentication composition without changing Supabase-backed auth handlers", () => {
    expect(home).toContain("PublicAuthSurface");
    expect(home).toContain("signInWithEmail");
    expect(home).toContain("signUpWithEmail");
    expect(home).toContain("requestPasswordReset");
    expect(home).toContain("updatePassword");
    expect(authSurface).toContain("Secure organization access");
    expect(authSurface).toContain('"current-password"');
  });
});
