import { useState } from "react";
import { AlertTriangle, ArrowRightLeft, Boxes, Check, ClipboardCheck, Download, PackageMinus, PackageSearch, Upload } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceState as State } from "@/components/workspaces/WorkspaceState";
import { trpc } from "@/lib/trpc";
import type { InventoryPart } from "@/types/fleet";

const money = (value: unknown) => Number(value ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function InventoryManagerWorkspace() {
  const utils = trpc.useUtils();
  const parts = trpc.inventory.list.useQuery(undefined, { retry: false });
  const inventoryExport = trpc.inventory.exportCsv.useQuery(undefined, { enabled: false, retry: false });
  const [importCsv, setImportCsv] = useState("");
  const importPreview = trpc.inventory.previewImport.useQuery({ csv: importCsv }, { enabled: Boolean(importCsv), retry: false });
  const [selectedPartId, setSelectedPartId] = useState("");
  const selectedPart = (parts.data ?? []).find((part: InventoryPart) => part.id === selectedPartId);
  const detail = trpc.inventory.get.useQuery({ partId: selectedPartId }, { enabled: Boolean(selectedPartId), retry: false });
  const [transfer, setTransfer] = useState({ toBinLocation: "", reason: "" });
  const [adjustment, setAdjustment] = useState({ delta: "0", reason: "" });
  const [issue, setIssue] = useState({ quantity: "1", reason: "" });
  const transferPart = trpc.inventory.transfer.useMutation({
    onSuccess: () => { toast.success("Bin transfer recorded"); setTransfer({ toBinLocation: "", reason: "" }); void utils.inventory.list.invalidate(); void detail.refetch(); void utils.inventory.movements.invalidate(); },
    onError: (error) => toast.error("Bin transfer failed", { description: error.message }),
  });
  const issuePart = trpc.inventory.issue.useMutation({
    onSuccess: () => { toast.success("Stock-out movement recorded"); setIssue({ quantity: "1", reason: "" }); void utils.inventory.list.invalidate(); void detail.refetch(); void utils.inventory.movements.invalidate(); },
    onError: (error) => toast.error("Stock-out failed", { description: error.message }),
  });
  const adjustPart = trpc.inventory.adjust.useMutation({
    onSuccess: () => { toast.success("Cycle-count adjustment recorded"); setAdjustment({ delta: "0", reason: "" }); void utils.inventory.list.invalidate(); void detail.refetch(); void utils.inventory.movements.invalidate(); },
    onError: (error) => toast.error("Adjustment failed", { description: error.message }),
  });
  const movementRows = detail.data?.movements ?? [];
  const partRows = parts.data ?? [];
  const lowStockCount = partRows.filter((part: InventoryPart) => Number(part.quantityOnHand) <= Number(part.minReorderLevel)).length;
  const totalOnHand = partRows.reduce((total: number, part: InventoryPart) => total + Number(part.quantityOnHand ?? 0), 0);
  const importInventory = trpc.inventory.importCsv.useMutation({ onSuccess: (result) => { toast.success(`Imported ${result.importedCount} inventory parts`); setImportCsv(""); void utils.inventory.list.invalidate(); }, onError: (error) => toast.error("Inventory import failed", { description: error.message }) });
  return <div className="inventory-manager-workspace"><div className="inventory-signal-strip" aria-label="Inventory control summary"><article><span className="inventory-signal-icon blue"><Boxes size={15} /></span><small>Parts catalog</small><strong>{partRows.length}</strong><em>{totalOnHand.toLocaleString("en-IN")} units on hand</em></article><article><span className={`inventory-signal-icon ${lowStockCount ? "warn" : "good"}`}><AlertTriangle size={15} /></span><small>Reorder watch</small><strong>{lowStockCount} low stock</strong><em>automation-linked signals</em></article><article><span className="inventory-signal-icon orange"><PackageSearch size={15} /></span><small>Selected balance</small><strong>{selectedPart ? `${detail.data?.available ?? selectedPart.quantityOnHand} available` : "Select a part"}</strong><em>{selectedPart?.sku ?? "detail inspector"}</em></article><article><span className="inventory-signal-icon good"><Check size={15} /></span><small>Movement audit</small><strong>{movementRows.length} events</strong><em>{selectedPart ? "selected part history" : "select a part to inspect"}</em></article></div>
    <section className="workspace-form panel">
      <div><div className="panel-kicker">Inventory control</div><h2>Inspect a part</h2><p>Select a tenant-scoped part to review available stock, reservations, and its auditable movement trail.</p></div><div className="inline-actions"><button type="button" className="secondary-button compact-button" disabled={inventoryExport.isFetching} onClick={() => { void inventoryExport.refetch().then(({ data }) => { if (!data) return; const blob = new Blob([data.content], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = data.filename; anchor.click(); URL.revokeObjectURL(url); }); }}><Download size={14} />Export CSV</button><label className="secondary-button compact-button"><Upload size={14} />Import CSV<input hidden type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then(setImportCsv); }} /></label></div>{importCsv && <div className="resource-meta">Import preview: {importPreview.data?.validCount ?? 0}/{importPreview.data?.rowCount ?? 0} valid rows{importPreview.data?.errors?.length ? ` · ${importPreview.data.errors.length} errors` : ""}<button type="button" className="secondary-button compact-button" disabled={importInventory.isPending || !importPreview.data || Boolean(importPreview.data.errors.length)} onClick={() => importInventory.mutate({ csv: importCsv })}>Apply import</button></div>}
      <label>Part<select aria-label="Select inventory part" value={selectedPartId} onChange={(event) => setSelectedPartId(event.target.value)}><option value="">Select a part</option>{(parts.data ?? []).map((part: InventoryPart) => <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>)}</select></label>
    </section>
    <State loading={parts.isLoading} error={parts.isError} empty={!parts.isLoading && !parts.isError && !(parts.data ?? []).length}>
      {selectedPart && <>
        <section className="workspace-kpi-grid compact-summary">
          <div className="kpi-card green"><span>On hand</span><strong>{selectedPart.quantityOnHand}</strong><small>{selectedPart.binLocation ?? "No bin assigned"}</small></div>
          <div className="kpi-card orange"><span>Reserved</span><strong>{detail.isLoading ? "…" : detail.data?.reserved ?? 0}</strong><small>open work-order demand</small></div>
          <div className="kpi-card green"><span>Available</span><strong>{detail.isLoading ? "…" : detail.data?.available ?? 0}</strong><small>safe to issue</small></div>
          <div className={`kpi-card ${Number(selectedPart.quantityOnHand) <= Number(selectedPart.minReorderLevel) ? "red" : "green"}`}><span>Unit cost</span><strong>{money(selectedPart.unitCost)}</strong><small>reorder at {selectedPart.minReorderLevel}</small></div>
        </section>
        <section className="workspace-form-grid">
          <form className="workspace-form panel" onSubmit={(event) => { event.preventDefault(); if (!transfer.toBinLocation.trim() || !transfer.reason.trim()) return; transferPart.mutate({ partId: selectedPart.id, toBinLocation: transfer.toBinLocation.trim(), reason: transfer.reason.trim() }); }}>
            <div><div className="panel-kicker">Movement · transfer</div><h3>Move between bins</h3><p>Changing the bin never changes quantity; the actor and reason remain in the movement ledger.</p></div>
            <label>Destination bin<input required value={transfer.toBinLocation} onChange={(event) => setTransfer((current) => ({ ...current, toBinLocation: event.target.value }))} placeholder="Rack B · Shelf 2" /></label>
            <label>Reason<input required minLength={3} maxLength={300} value={transfer.reason} onChange={(event) => setTransfer((current) => ({ ...current, reason: event.target.value }))} placeholder="Cycle reorganization" /></label>
            <button className="secondary-button" disabled={transferPart.isPending}><ArrowRightLeft size={15} />{transferPart.isPending ? "Recording…" : "Record bin transfer"}</button>
          </form>
          <form className="workspace-form panel" onSubmit={(event) => { event.preventDefault(); const quantity = Number(issue.quantity); if (!issue.reason.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > Number(selectedPart.quantityOnHand)) return; issuePart.mutate({ partId: selectedPart.id, quantity, reason: issue.reason.trim() }); }}>
            <div><div className="panel-kicker">Movement · stock out</div><h3>Issue inventory</h3><p>Record a controlled stock-out with actor, reason, and an immutable negative movement.</p></div>
            <label>Quantity<input required type="number" min="1" max={selectedPart.quantityOnHand} step="1" value={issue.quantity} onChange={(event) => setIssue((current) => ({ ...current, quantity: event.target.value }))} /></label>
            <label>Reason<input required minLength={3} maxLength={300} value={issue.reason} onChange={(event) => setIssue((current) => ({ ...current, reason: event.target.value }))} placeholder="Issued for workshop use" /></label>
            <button className="secondary-button" disabled={issuePart.isPending}><PackageMinus size={15} />{issuePart.isPending ? "Recording…" : "Record stock out"}</button>
          </form>
          <form className="workspace-form panel" onSubmit={(event) => { event.preventDefault(); const delta = Number(adjustment.delta); if (!adjustment.reason.trim() || !Number.isInteger(delta) || delta === 0) return; adjustPart.mutate({ partId: selectedPart.id, expectedQuantityOnHand: Number(selectedPart.quantityOnHand), delta, reason: adjustment.reason.trim() }); }}>
            <div><div className="panel-kicker">Movement · adjustment</div><h3>Post cycle-count variance</h3><p>Use a signed quantity and the loaded balance to prevent overwriting a newer count.</p></div>
            <label>Quantity delta<input required type="number" step="1" value={adjustment.delta} onChange={(event) => setAdjustment((current) => ({ ...current, delta: event.target.value }))} placeholder="+2 or -1" /></label>
            <label>Reason<input required minLength={3} maxLength={300} value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} placeholder="Physical count variance" /></label>
            <button className="secondary-button" disabled={adjustPart.isPending}><ClipboardCheck size={15} />{adjustPart.isPending ? "Recording…" : "Record adjustment"}</button>
          </form>
        </section>
        <section className="panel workspace-table"><div className="panel-heading"><div><div className="panel-kicker">{selectedPart.sku} · movement history</div><h2>{selectedPart.name}</h2></div><span className="signal-chip good"><Check size={13} /> Tenant scoped</span></div><State loading={detail.isLoading} error={detail.isError} empty={!detail.isLoading && !detail.isError && !movementRows.length}><div className="resource-list">{movementRows.map((movement: any) => <div className="resource-row" key={movement.id}><div><strong>{movement.movementType}</strong><span>{movement.reason} · {new Date(movement.createdAt).toLocaleString("en-IN")}</span><small>{movement.workOrderId ? `Work order ${movement.workOrderId.slice(0, 8).toUpperCase()}` : "Organization stock movement"}</small></div><span className={`resource-meta ${Number(movement.quantity) < 0 ? "pending" : "accepted"}`}>{Number(movement.quantity) > 0 ? "+" : ""}{movement.quantity} units</span></div>)}</div></State></section>
      </>}
    </State>
    {!selectedPart && !parts.isLoading && !parts.isError && (parts.data ?? []).length > 0 && <div className="panel empty-state"><PackageSearch size={20} /><strong>Select a part to open its detail record.</strong></div>}
  </div>;
}
