-- FleetOps P1 Procurement: complete the purchase-order lifecycle enum.
alter type public."PurchaseOrderStatus" add value if not exists 'PARTIALLY_RECEIVED';
alter type public."PurchaseOrderStatus" add value if not exists 'CANCELLED';
alter type public."PurchaseOrderStatus" add value if not exists 'CLOSED';
