import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const roleStart = source.indexOf("function RoleOverviewWorkspace");
const roleEnd = source.indexOf("\nfunction ResourceWorkspace", roleStart);
const resourceStart = roleEnd + 1;
const resourceEnd = source.indexOf("\nexport default function FunctionalWorkspace", resourceStart);
if (roleStart < 0 || roleEnd < 0 || resourceEnd < 0) throw new Error("Remaining workspace boundaries not found");
const roleText = source.slice(roleStart, roleEnd).replace("function RoleOverviewWorkspace", "export function RoleOverviewWorkspace");
const resourceText = source.slice(resourceStart, resourceEnd).replace("function ResourceWorkspace", "export function ResourceWorkspace");
fs.writeFileSync("client/src/components/workspaces/RoleOverviewWorkspace.tsx", `export ${roleText.slice(7)}\n`);
fs.writeFileSync("client/src/components/workspaces/ResourceWorkspace.tsx", `import { Check, Download, Plus, Wrench } from "lucide-react";\nimport { toast } from "sonner";\nimport { trpc } from "@/lib/trpc";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\nimport type { FleetVehicle, WorkOrderRow, GenericResourceRow } from "@/types/fleet";\n\nfunction downloadCsv(filename: string, content: string) { const blob = new Blob([content], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\nfunction downloadPdf(filename: string, base64: string) { const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); const blob = new Blob([bytes], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\n\n${resourceText}\n`);
const updated = `${source.slice(0, roleStart)}${source.slice(resourceEnd + 1)}`
  .replace('import { OrganizationSettingsWorkspace } from "@/components/workspaces/OrganizationSettingsWorkspace";', 'import { OrganizationSettingsWorkspace } from "@/components/workspaces/OrganizationSettingsWorkspace";\nimport { ResourceWorkspace } from "@/components/workspaces/ResourceWorkspace";\nimport { RoleOverviewWorkspace } from "@/components/workspaces/RoleOverviewWorkspace";')
  .replace('const query = section === "Vehicles"', 'const query = section === "Vehicles"');
fs.writeFileSync(sourcePath, updated);
