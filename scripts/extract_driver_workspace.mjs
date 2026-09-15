import fs from "node:fs";

const sourcePath = "client/src/components/FunctionalWorkspace.tsx";
const targetPath = "client/src/components/workspaces/DriverWorkspace.tsx";
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("function DriverWorkspace() {");
const end = source.indexOf("\nfunction ProcurementWorkspace()", start);
if (start < 0 || end < 0) throw new Error("Driver workspace boundaries not found");
const functionText = source.slice(start, end).replace(/^function DriverWorkspace\(\)/, "export function DriverWorkspace").replaceAll("React.ChangeEvent", "ChangeEvent");
const moduleText = `import { useEffect, useState, type ChangeEvent } from "react";\nimport { Check, Gauge, Plus } from "lucide-react";\nimport { toast } from "sonner";\nimport { trpc } from "@/lib/trpc";\nimport { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\nimport type { FleetVehicle, FuelLogRow, InspectionRow, VehicleIssueRow } from "@/types/fleet";\n\n${functionText}\n`;
fs.writeFileSync(targetPath, moduleText);
const updated = `${source.slice(0, start)}${source.slice(end + 1)}`
  .replace('import { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";\n', "")
  .replace('import type { DocumentRow, FinancialMetricRow, FinancialRecord, FinancialReconciliationRow, FleetVehicle, FuelLogRow, InspectionRow, ProcurementOrderRow, VehicleIssueRow, WorkOrderRow } from "@/types/fleet";', 'import type { DocumentRow, FinancialMetricRow, FinancialRecord, FinancialReconciliationRow, FleetVehicle, ProcurementOrderRow, WorkOrderRow } from "@/types/fleet";')
  .replace('import { AccountantRoleWorkspace, DriverRoleWorkspace, FleetManagerWorkspace, InventoryManagerWorkspace, MechanicWorkspace, OwnerWorkspace } from "@/components/RoleWorkspaces";', 'import { AccountantRoleWorkspace, FleetManagerWorkspace, InventoryManagerWorkspace, MechanicWorkspace, OwnerWorkspace } from "@/components/RoleWorkspaces";\nimport { DriverWorkspace } from "@/components/workspaces/DriverWorkspace";')
  .replace('if (section === "Driver portal") return <DriverWorkspace />;', 'if (section === "Driver portal") return <DriverWorkspace />;');
fs.writeFileSync(sourcePath, updated);
