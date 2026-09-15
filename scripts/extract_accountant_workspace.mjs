import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const targetPath = "client/src/components/workspaces/AccountantWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function AccountantWorkspace() {");
const end = source.indexOf("\nfunction OrganizationSettingsWorkspace()", start);
if (start < 0 || end < 0) throw new Error("Accountant workspace boundaries not found");
const functionText = source.slice(start, end).replace("function AccountantWorkspace()", "export function AccountantWorkspace()");
fs.writeFileSync(targetPath, `import { useState } from "react";\nimport { Check, Download, Plus } from "lucide-react";\nimport { toast } from "sonner";\nimport { trpc } from "@/lib/trpc";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\nimport type { FinancialMetricRow, FinancialRecord, FinancialReconciliationRow, FleetVehicle } from "@/types/fleet";\n\nfunction downloadCsv(filename: string, content: string) { const blob = new Blob([content], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\nfunction downloadPdf(filename: string, base64: string) { const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); const blob = new Blob([bytes], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }\n\n${functionText}\n`);
const updated = `${source.slice(0, start)}${source.slice(end + 1)}`
  .replace('import { ComplianceWorkspace } from "@/components/workspaces/ComplianceWorkspace";', 'import { ComplianceWorkspace } from "@/components/workspaces/ComplianceWorkspace";\nimport { AccountantWorkspace } from "@/components/workspaces/AccountantWorkspace";')
  .replace('if (section === "Accountant ledger") return <AccountantWorkspace />;', 'if (section === "Accountant ledger") return <AccountantWorkspace />;');
fs.writeFileSync(sourcePath, updated);
