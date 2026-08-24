import { Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ResourceWorkspace } from "@/components/workspaces/ResourceWorkspace";
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
      <div className="panel-heading"><div><div className="panel-kicker">Approval handoff</div><h2>Ready for Fleet Manager review</h2><p>Verify the Mechanic’s submitted labor, evidence, and parts usage before closing the organization work order.</p></div><span className="signal-chip warn">{reviewOrders.length} awaiting approval</span></div>
      <div className="resource-list">{reviewOrders.map((order: WorkOrderRow) => <div className="resource-row work-order-row" key={order.id}><div><strong>{order.title}</strong><span>{order.vehicle?.licensePlate ?? order.vehicleId} · {order.priority} · {order.laborHours ?? 0} labor hours</span></div><button type="button" className="primary-button compact-button" disabled={approve.isPending} onClick={() => approve.mutate({ workOrderId: order.id })}><Check size={14} /> {approve.isPending ? "Approving…" : "Approve work order"}</button></div>)}</div>
    </section>}
    <ResourceWorkspace section="Work orders" organizationName={organizationName} />
  </>;
}
