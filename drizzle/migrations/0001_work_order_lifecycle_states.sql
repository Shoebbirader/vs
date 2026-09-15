-- Add lifecycle states required by the guarded work-order state machine.
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_PARTS';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'REWORK';
