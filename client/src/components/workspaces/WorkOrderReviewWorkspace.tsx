import { Check, ClipboardCheck, PackageCheck, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ResourceWorkspace } from "@/components/workspaces/ResourceWorkspace";
import { formatVehicleIdentity } from "@/lib/vehicleIdentity";
import type { WorkOrderRow } from "@/types/fleet";

export function WorkOrderReviewWorkspace({ organizationName }: { organizationName?: string }) {
  const utils = trpc.useUtils();
  const orders = trpc.workOrders.list.useQuery(undefined, { retry: false });
  const approve = trpc.workOrders.approve.useMutation({
    onSuccess: () => {
      toast.success("Work order approved", { description: "Component service, inventory issue, and financial entries are now reflected." });
      void utils.workOrders.list.invalidate();
      void utils.workOrders.board.invalidate();
      void utils.components.list.invalidate();
      void utils.vehicles.list.invalidate();
      void utils.inventory.list.invalidate();
      void utils.inventory.movements.invalidate();
      void utils.financials.list.invalidate();
      void utils.notifications.list.invalidate();
    },
    onError: (error) => toast.error("Work order approval failed", { description: error.message }),
  });
  const reviewOrders = (orders.data ?? []).filter((order: WorkOrderRow) => order.status === "READY_FOR_REVIEW");

  return <>
    {reviewOrders.length > 0 && <section className="panel workspace-table work-order-review-queue" aria-label="Work order review queue">
      <div className="panel-heading"><div><div className="panel-kicker">Approval handoff</div><h2>Ready for Fleet Manager review</h2><p>Review the completed execution record and approve the connected inventory, component, and cost handoff in one accountable decision.</p></div><span className="signal-chip warn">{reviewOrders.length} awaiting approval</span></div>
      <div className="work-order-review-list">{reviewOrders.map((order: WorkOrderRow) => <article className="work-order-review-card" key={order.id}>
        <div className="work-order-review-title"><span className="review-icon"><ClipboardCheck size={17} /></span><div><div className="review-overline">Mechanic submitted · review required</div><h3>{order.title}</h3><p>{order.vehicle ? formatVehicleIdentity(order.vehicle) : order.vehicleId} · {order.priority} priority</p></div><span className="status-label pending">Ready for review</span></div>
        <div className="review-checkpoint-grid" aria-label="Approval consequences"><div><Wrench size={15} /><span>Execution</span><strong>{Number(order.laborHours ?? 0).toLocaleString("en-IN")} labor hours</strong></div><div><ClipboardCheck size={15} /><span>Assignee</span><strong>{order.assignedMechanic?.fullName ?? "Mechanic record"}</strong></div><div><PackageCheck size={15} /><span>Handoff state</span><strong>Mechanic submitted</strong></div><div><ShieldCheck size={15} /><span>Approval</span><strong>Audit trail retained</strong></div></div>
        <div className="review-action-row"><p><strong>On approval:</strong> the reserved part is issued, applicable component life is reset, and maintenance cost records are created from the approved handoff.</p><button type="button" className="primary-button" disabled={approve.isPending} onClick={() => approve.mutate({ workOrderId: order.id })}><Check size={15} /> {approve.isPending ? "Approving handoff…" : "Approve completed work"}</button></div>
      </article>)}</div>
    </section>}
    <ResourceWorkspace section="Work orders" organizationName={organizationName} />
  </>;
}
