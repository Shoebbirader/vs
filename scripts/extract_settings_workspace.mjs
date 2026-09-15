import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const targetPath = "client/src/components/workspaces/OrganizationSettingsWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function OrganizationSettingsWorkspace() {");
const end = source.indexOf("\nfunction ResourceWorkspace", start);
if (start < 0 || end < 0) throw new Error("Organization Settings workspace boundaries not found");
const functionText = source.slice(start, end).replace("function OrganizationSettingsWorkspace()", "export function OrganizationSettingsWorkspace()");
fs.writeFileSync(targetPath, `import { useEffect, useState } from "react";\nimport { toast } from "sonner";\nimport { trpc } from "@/lib/trpc";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\n\n${functionText}\n`);
const updated = `${source.slice(0, start)}${source.slice(end + 1)}`
  .replace('import { AccountantWorkspace } from "@/components/workspaces/AccountantWorkspace";', 'import { AccountantWorkspace } from "@/components/workspaces/AccountantWorkspace";\nimport { OrganizationSettingsWorkspace } from "@/components/workspaces/OrganizationSettingsWorkspace";')
  .replace('if (section === "Settings") return <OrganizationSettingsWorkspace />;', 'if (section === "Settings") return <OrganizationSettingsWorkspace />;');
fs.writeFileSync(sourcePath, updated);
