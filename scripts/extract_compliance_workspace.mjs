import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const targetPath = "client/src/components/workspaces/ComplianceWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function ComplianceWorkspace() {");
const end = source.indexOf("\nfunction AccountantWorkspace()", start);
if (start < 0 || end < 0) throw new Error("Compliance workspace boundaries not found");
const functionText = source.slice(start, end).replace("function ComplianceWorkspace()", "export function ComplianceWorkspace()");
fs.writeFileSync(targetPath, `import { Download, Plus, ShieldCheck, Check } from "lucide-react";\nimport { toast } from "sonner";\nimport { trpc } from "@/lib/trpc";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\nimport type { DocumentRow, FleetVehicle } from "@/types/fleet";\n\nfunction downloadCsv(filename: string, content: string) { const blob = new Blob([content], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\nfunction downloadPdf(filename: string, base64: string) { const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); const blob = new Blob([bytes], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\n\n${functionText}\n`);
const updated = `${source.slice(0, start)}${source.slice(end + 1)}`
  .replace('import { DriverWorkspace } from "@/components/workspaces/DriverWorkspace";\nimport { ProcurementWorkspace } from "@/components/workspaces/ProcurementWorkspace";', 'import { DriverWorkspace } from "@/components/workspaces/DriverWorkspace";\nimport { ProcurementWorkspace } from "@/components/workspaces/ProcurementWorkspace";\nimport { ComplianceWorkspace } from "@/components/workspaces/ComplianceWorkspace";')
  .replace('if (section === "Compliance vault") return <ComplianceWorkspace />;', 'if (section === "Compliance vault") return <ComplianceWorkspace />;');
fs.writeFileSync(sourcePath, updated);
