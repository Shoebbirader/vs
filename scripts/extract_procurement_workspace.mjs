import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const targetPath = "client/src/components/workspaces/ProcurementWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function ProcurementWorkspace() {");
const end = source.indexOf("\nfunction ComplianceWorkspace()", start);
if (start < 0 || end < 0) throw new Error("Procurement workspace boundaries not found");
const functionText = source.slice(start, end).replace("function ProcurementWorkspace()", "export function ProcurementWorkspace()");
fs.writeFileSync(targetPath, `import { Check } from "lucide-react";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\nimport { trpc } from "@/lib/trpc";\nimport type { ProcurementOrderRow } from "@/types/fleet";\n\n${functionText}\n`);
const updated = `${source.slice(0, start)}${source.slice(end + 1)}`
  .replace('import { ProcurementOrderRow } from "@/types/fleet";', 'import type { ProcurementOrderRow } from "@/types/fleet";')
  .replace('import { DriverWorkspace } from "@/components/workspaces/DriverWorkspace";', 'import { DriverWorkspace } from "@/components/workspaces/DriverWorkspace";\nimport { ProcurementWorkspace } from "@/components/workspaces/ProcurementWorkspace";')
  .replace('if (section === "Purchase orders") return <ProcurementWorkspace />;', 'if (section === "Purchase orders") return <ProcurementWorkspace />;');
fs.writeFileSync(sourcePath, updated);
