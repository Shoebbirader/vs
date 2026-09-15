import { execFileSync } from "node:child_process";

const baseline = process.argv[2];

if (!baseline) {
  console.error("Usage: node scripts/verify-frontend-only-release.mjs <baseline-ref>");
  process.exit(1);
}

const changedFiles = execFileSync("git", ["diff", "--name-only", `${baseline}..HEAD`], {
  encoding: "utf8",
})
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

const forbiddenPrefixes = ["server/", "drizzle/", "supabase/", "api/"];
const forbiddenFiles = new Set(["package.json", "pnpm-lock.yaml", "vite.config.ts", ".env", ".env.local"]);
const violations = changedFiles.filter((file) => forbiddenPrefixes.some((prefix) => file.startsWith(prefix)) || forbiddenFiles.has(file));

if (violations.length) {
  console.error("Frontend-only release gate failed. These protected files changed:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Frontend-only release gate passed: ${changedFiles.length} changed files are presentation, client test, script, or documentation changes.`);
